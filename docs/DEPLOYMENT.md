# Deployment

Frontend on Vercel, backend on Supabase. Two systems, deployed in that order —
**database first, always.** A frontend that expects a column the database does
not have yet is a broken app; a database with a column nothing reads yet is
harmless.

---

## Environments

| | Supabase project | Vercel | Branch |
| --- | --- | --- | --- |
| Local | `supabase start` | `npm run dev` | any |
| Preview | `gnaschools-staging` | Preview deploys | PRs |
| Production | `gnaschools-prod` | Production | `main` |

Staging and production are **separate Supabase projects**, not separate schemas
in one. Sharing a project means a bad migration on staging takes production
with it.

---

## 1. Backend

### Create and link

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

### Push the schema

```bash
npx supabase db push
```

This applies `supabase/migrations/*` in order. Review the plan it prints before
confirming — on a production database, `db push` is not reversible.

**The seed does not run.** `supabase/seed/seed.sql` is development data and
creates 375 accounts with a shared password. It must never touch production.

Bootstrap production instead with:

1. One school row.
2. The academic sessions for the year.
3. One administrator, created through the admin API so the role comes from
   `raw_app_meta_data`:

```bash
curl -X POST "https://<ref>.supabase.co/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "email": "principal@yourschool.edu.ng",
        "password": "<generated>",
        "email_confirm": true,
        "app_metadata": { "role": "administrator", "school_id": "<school-uuid>" },
        "user_metadata": { "first_name": "…", "last_name": "…" }
      }'
```

`app_metadata` is the trusted channel — `handle_new_user()` will not accept
`administrator` from anywhere else. Everyone else is then invited from inside
the app.

### Auth settings

Dashboard → Authentication. `config.toml` governs the local stack only; these
must be set to match:

| Setting | Production value |
| --- | --- |
| Site URL | `https://lms.yourschool.edu.ng` |
| Redirect URLs | `https://lms.yourschool.edu.ng/auth/callback`, `/auth/reset-password` |
| Confirm email | **On** |
| Signup | Off if the school provisions accounts itself |
| JWT expiry | 3600 |
| Refresh rotation | On |
| Rate limits | As in `[auth.rate_limit]` |

Redirect URLs are an allow-list. A URL that is not on it silently fails, which
is exactly what you want if someone tries to redirect a reset link elsewhere —
and exactly what will confuse you for an hour if you forget to add the real
domain.

Upload the three templates from `supabase/templates/`.

### Edge Functions

```bash
npx supabase secrets set --env-file ./supabase/functions/.env
npx supabase functions deploy admin-users
npx supabase functions deploy send-notification-email
npx supabase functions deploy daily-reminders
```

`admin-users` backs the whole administrator people section — admitting students,
adding staff and guardians, password resets, deactivation. Until it is deployed
those screens read fine and every write returns a network error, so deploy it
before handing the portal to a school.

Without `RESEND_API_KEY` the function still works: welcome emails are skipped
and the emailed-link reset returns a clear "outbound email is not configured"
rather than failing silently. The temporary-password route is unaffected.

`ALLOWED_ORIGINS` and `APP_URL` must name the production domain.
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected by the platform — do not set them yourself.

Schedule the reminder sweep with `pg_cron`:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-reminders',
  '0 6 * * 1-5',                       -- 06:00 UTC = 07:00 WAT, weekdays
  $$
    select net.http_post(
      url     := 'https://<ref>.supabase.co/functions/v1/daily-reminders',
      headers := jsonb_build_object('x-cron-secret', '<FUNCTION_CRON_SECRET>')
    )
  $$
);
```

### Storage

The buckets and their policies are created by `1100_storage.sql` — nothing to
do by hand. Confirm in the dashboard that `assignment-uploads`,
`lesson-materials` and `student-documents` are **not** public.

---

## 2. Frontend

### Vercel

Connect the repository. `vercel.json` supplies the build command, output
directory, SPA rewrite and security headers, so the defaults need no changes.

The SPA rewrite matters: without `/(.*) → /index.html`, a hard refresh on
`/student/assignments` returns a 404 because no such file exists on disk.

### Environment variables

Set per environment (Production / Preview / Development):

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The anon/publishable key |
| `VITE_APP_ENV` | `production` / `staging` |
| `VITE_APP_URL` | `https://lms.yourschool.edu.ng` |
| `VITE_ENABLE_REALTIME` | `true` |
| `VITE_ENABLE_DEVTOOLS` | `false` |

**Only `VITE_`-prefixed variables belong here.** They are compiled into a file
served to every visitor. Never add `SUPABASE_SERVICE_ROLE_KEY` to Vercel.

The anon key being public is fine and by design — it carries no privileges of
its own, and every request it makes is evaluated against RLS.

### Deploy

```bash
git push origin main
```

`VITE_APP_ENV=production` also strips source maps and disables devtools.

---

## 3. CI

`.github/workflows/ci.yml`. Two jobs: `verify` on every push and PR, `migrate`
on `main` only.

Required repository secrets:

| Secret | Used for |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | CLI auth |
| `SUPABASE_PROJECT_ID` | Link target |
| `SUPABASE_DB_PASSWORD` | `db push` |

`verify` runs `format:check → lint → build` and, separately, spins up a local
Supabase stack to replay every migration and the seed. That second step is the
one that catches a migration which only works against your laptop's current
state.

---

## Release order

1. `npm run verify` locally
2. Merge to `main`
3. **`supabase db push`** — database first
4. `supabase functions deploy`
5. Vercel builds and promotes automatically
6. Smoke test: sign in, load a dashboard, check the notification bell

Reversing 3 and 5 means the new frontend queries a column that does not exist
yet.

### Backward-compatible migrations

The two deploys are never simultaneous, so for the minute in between, the old
frontend runs against the new database. Migrations must tolerate that:

- Add a column as nullable, backfill, then add `NOT NULL` in a **later**
  migration
- Rename by adding the new column and keeping the old one for a release
- Never drop a column in the same release that stops using it

---

## Rollback

**Frontend** — instant, and where you should reach first:

```bash
vercel rollback <previous-deployment-url>
```

**Database** — there is no `db pop`. Migrations are forward-only, so a rollback
is a new migration that reverses the change. Write it before you need it.

For genuine data loss, restore from Point-in-Time Recovery (Pro plan and above)
— and confirm PITR is enabled *before* launch, not after.

---

## Operating

| Watch | Where |
| --- | --- |
| API errors, slow queries | Supabase → Logs |
| Auth failures, rate limits | Supabase → Auth logs |
| Function invocations | Supabase → Edge Functions |
| Build and runtime errors | Vercel |
| Connection pool saturation | Supabase → Database → Pooler |
| `audit_logs` insert volume | Query it — a spike is worth a look |

`config.toml` sets `pool_mode = "transaction"` with a default pool size of 20.
Raise it to match the plan's connection limit before the first busy term.

An error reporter (Sentry or similar) is not yet wired in.
`ErrorBoundary.componentDidCatch` is where it goes.

---

## Domain

1. Vercel → Settings → Domains → add `lms.yourschool.edu.ng`
2. Add the CNAME the dashboard gives you
3. Update `VITE_APP_URL` and redeploy
4. Update Supabase Site URL and redirect URLs
5. Update `ALLOWED_ORIGINS` and `APP_URL` in the function secrets

Steps 4 and 5 are the ones people forget. Missing them produces a working app
where password reset silently fails.

---

## Launch checklist

- [ ] Migrations pushed, `npm run db:lint` clean
- [ ] Auth: confirmations on, real redirect URLs, templates uploaded
- [ ] Administrator created via the admin API — **not** the seed
- [ ] Seed data absent from production
- [ ] Function secrets set; `pg_cron` schedule created and verified
- [ ] Private buckets confirmed private
- [ ] Vercel env vars set; no unprefixed secret among them
- [ ] Domain live on HTTPS with the `vercel.json` headers present
- [ ] Point-in-Time Recovery on, and a restore rehearsed
- [ ] Rate limiting / WAF in front — see [SECURITY.md](SECURITY.md)
- [ ] Sign-in smoke-tested for all four roles
