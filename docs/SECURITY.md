# Security

## Model

The database is the boundary. Everything the browser does is a convenience on
top of it.

That is not a slogan — it is a design constraint with a testable consequence:
**every rule in this system survives a client that skips the UI entirely.**
Delete the route guards, edit the bundle, drive PostgREST with `curl` — a
student still cannot read another student's marks, because the policy never
returns the rows.

Concretely:

| Concern | Enforced by | Not by |
| --- | --- | --- |
| Who can read a row | RLS policy | React route guards |
| Who can write a row | RLS `WITH CHECK` | Disabled buttons |
| Which columns can be written | Guard triggers (`1300`) | Form fields |
| Whether a submission is late | Database clock (`0800`) | Browser clock |
| A quiz score | `submit_quiz_attempt()` | Client-side marking |
| Timetable clashes | GiST `EXCLUDE` constraints | UI overlap checks |
| Who can hold a role | `handle_new_user()` metadata split | Sign-up form |

---

## Secrets

### The rule

**A service-role key in a browser bundle is a full database compromise.** It
bypasses every RLS policy in the project.

Three layers keep it out:

1. **Vite only inlines `VITE_`-prefixed variables.** An unprefixed variable is
   simply not available to client code.
2. **`.gitignore` excludes every `.env*` except `.env.example`.**
3. **`shared/lib/env.ts` asserts at boot** that nothing matching
   `SERVICE_ROLE|SECRET|PRIVATE_KEY|DB_PASSWORD|ACCESS_TOKEN` has appeared with
   a `VITE_` prefix, and throws if it has.

The third exists because the first two are conventions someone can break by
renaming a variable. If that assertion ever fires, rotate the credential — the
key was in a bundle.

### The anon key is not a secret

`VITE_SUPABASE_ANON_KEY` ships to every browser by design. It carries no
privileges: every request it makes is still evaluated against RLS. Publishing
it is safe *precisely because* the policies are the boundary.

### Where secrets live

| Secret | Home |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase function secrets; CI secrets |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | CI secrets only |
| `RESEND_API_KEY`, `FUNCTION_CRON_SECRET` | `supabase secrets set` |
| `VITE_*` | Vercel environment variables — all public |

---

## Authentication hardening

| Control | Setting |
| --- | --- |
| Password hashing | bcrypt, by GoTrue. The app never sees a password. |
| Minimum length | 8, plus a letter and a digit (`auth.schemas.ts`) |
| Refresh rotation | On, 10 s reuse interval |
| Session inactivity | 14 days |
| Session cap | 30 days absolute |
| Email confirmation | Required |
| PKCE | Enabled |
| Privilege escalation | `raw_app_meta_data` checked before `raw_user_meta_data` |

Password rules are deliberately short. Length is what resists guessing; long
lists of symbol requirements push people towards `Password1!` on a sticky note.

**Account enumeration** is closed on the reset flow: the success screen says
"if an account exists for …", and Supabase returns an identical response either
way.

---

## Rate limiting

### Configured

`supabase/config.toml`:

```toml
[auth.rate_limit]
email_sent = 10            # per hour
sign_in_sign_ups = 30      # per 5 min, per IP
token_refresh = 150        # per 5 min, per IP
token_verifications = 30   # per 5 min, per IP
```

`1300_hardening.sql`:

```sql
alter role anon          set statement_timeout = '5s';
alter role authenticated set statement_timeout = '20s';
alter role anon          set idle_in_transaction_session_timeout = '10s';
alter role authenticated set idle_in_transaction_session_timeout = '30s';
```

Cheap, effective back-pressure: a runaway report cannot pin a connection, and a
leaked anon key cannot be used to mine the database with slow sequential scans.

`[api] max_rows = 1000` caps any single PostgREST response.

### Recommended before production

Per-IP request throttling belongs *in front of* PostgREST, not inside it:

1. **Cloudflare (or equivalent) in front of the Supabase domain** — rate rules
   on `/auth/v1/*` (10 req/min/IP) and `/rest/v1/*` (120 req/min/IP), plus bot
   management on the login endpoint.
2. **Supabase connection pooler** — already on in `config.toml`
   (`pool_mode = "transaction"`, `default_pool_size = 20`). Size it to the
   plan's connection limit before launch.
3. **CAPTCHA on sign-in** — `[auth.captcha]` with hCaptcha or Turnstile, once
   the school is public-facing.
4. **Alerting** on 429 rate and on `audit_logs` insert volume; a spike in
   either is usually the first sign of something worth looking at.

---

## File uploads

Four independent controls, because any one of them can be bypassed alone:

1. **Bucket-level limits** — `file_size_limit` and `allowed_mime_types` on each
   bucket in `1100_storage.sql`. Enforced by Storage, not by the client.
2. **Path-based policies** — the object key *is* the access key. A student may
   only write to `{school}/{assignment}/{their own student_id}/…`, and only for
   a published assignment in a class they are enrolled in.
3. **Client-side pre-checks** — `UPLOAD_LIMITS` in `constants.ts` mirrors the
   bucket limits so a 40 MB file fails with a readable message before the
   user's bandwidth is spent. This is a courtesy; Storage is the real gate.
4. **Filename sanitisation** — `safeName()` in `storage.service.ts` strips the
   name to `[\w.-]`, caps its length, and prefixes a timestamp so re-uploading
   `assignment.pdf` cannot silently overwrite the previous version.

Because the path carries the authorisation, **`storage.service.ts` is the only
module in the frontend permitted to build one.** A path assembled ad hoc
elsewhere is one typo away from landing somewhere the policies read as public.

Private buckets are served through signed URLs with a five-minute life
(`SIGNED_URL_TTL_SECONDS`). Those URLs are bearer credentials and are
deliberately **never cached** by TanStack Query — caching one would hand out
access after it should have lapsed.

---

## Input validation

Three layers, each catching what the one before it cannot:

| Layer | Catches |
| --- | --- |
| Zod (`schemas/`) | Shape and intent, before a request is made |
| RLS `WITH CHECK` | Whether this caller may write this row at all |
| `CHECK` / `EXCLUDE` / triggers | Whether the row is coherent, whoever wrote it |

Zod schemas are a courtesy to the user, not a security control — they run in a
browser the attacker owns. The database constraints are the ones that hold. The
email regex in `auth.schemas.ts` is intentionally identical to the `CHECK` on
`users.email` so the two cannot disagree.

SQL injection is structurally absent: PostgREST parameterises everything, and
every `SECURITY DEFINER` function pins `search_path = ''` with fully-qualified
identifiers.

---

## Error handling

`shared/lib/errors.ts` normalises every backend error shape into `AppError`.

SQLSTATE `42501` — an RLS denial — becomes **"You do not have permission to do
that."** Deliberately vague. Naming the policy that failed, or which condition
of it, would tell an attacker the shape of the rules for free.

For the same reason, `PostgrestError.details` (which can contain column values)
stays in the console; only `hint`, which we write ourselves in
`RAISE EXCEPTION`, is surfaced to the user.

In production the `ErrorBoundary` shows a generic message and no stack trace.

---

## Transport and headers

`vercel.json` sets, on every response:

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

`X-Frame-Options: DENY` matters more than it looks: it is what stops the sign-in
page being framed for a clickjacked credential capture.

A Content-Security-Policy is **not** yet set. Adding one is a Phase 2 task
because the current build inlines the theme bootstrap script in `index.html`,
which needs a nonce or a hash before `script-src` can drop `unsafe-inline`.

Edge Functions read their CORS allow-list from `ALLOWED_ORIGINS` rather than
using `*` — these endpoints act on a caller's JWT, and a wildcard origin on a
credentialed endpoint is how a phishing page ends up able to call them.

---

## Edge Functions

| Function | Auth | Why |
| --- | --- | --- |
| `admin-users` | `verify_jwt = true` + administrator re-check | GoTrue admin API needs the service-role key |
| `send-notification-email` | `verify_jwt = true` | Acts for a signed-in caller |
| `daily-reminders` | `x-cron-secret` | Scheduler; there is no caller |

`admin-users` is the only place in the project where account creation, password
resets and deactivation happen, because all three are GoTrue *admin* calls: they
authenticate with the service-role key, which bypasses every policy in this
document and must never reach a browser bundle.

Four things gate it, in order:

1. `verify_jwt = true`, so the gateway rejects an unsigned request first.
2. The caller is resolved from that JWT, never from the request body.
3. Their administrator grant is re-read from `user_roles`. A role claim inside a
   token is only as fresh as the token; a grant revoked five minutes ago has to
   stop working now.
4. `school_id` comes from the caller's own profile. That is the difference
   between "provision into my school" and "provision into any school in the
   deployment".

It will not provision an administrator, and it refuses to reset or deactivate
one. Administrators are peers — a single compromised session that could mint a
second permanent account, or take over the other administrators, is a much
larger incident than one that can only add pupils. Adding an administrator is a
deliberate act performed against the database directly.

Deactivation **bans the GoTrue account** as well as flipping `users.status`.
Flipping the profile column alone changes nothing an attacker cares about: their
JWT stays valid and keeps refreshing. Banning refuses refreshes immediately, and
the outstanding access token dies at its next expiry — an hour at most, per
`jwt_expiry`.

Provisioning is transactional in effect: if anything after the auth account
fails — a duplicate admission number, a class in another school — the account is
deleted again, so a login never survives without the profile behind it.

The role is **stated, not inferred**. `handle_new_user()` reads the role from
`raw_app_meta_data`, which is right for a sign-up but wrong for the admin API:
`createUser` inserts the row and applies `app_metadata` afterwards, so the
trigger fires against a row that does not carry it yet and falls back to
`student`. Asking for a teacher used to produce a student, silently. Provisioned
inserts are now marked `provisioned_by_admin`, the trigger creates the profile
and stops, and `provision_user_role()` sets the school, the grant and the
extension row explicitly.

`public.provision_user_role()` grants a role to an arbitrary user, so it is
`service_role` only — EXECUTE is revoked from `public`, `anon` and
`authenticated`, and calling it through PostgREST with a teacher's token returns
`42501`. The marker that suppresses the trigger lives in `raw_user_meta_data`,
which is attacker-controlled; that is safe only because of which way it fails.
Setting it on your own sign-up grants nothing — it skips the block that hands
out a role, leaving you with no grant and the pending-access screen. The worst a
forger can do with it is deny themselves the student role.

`send-notification-email` reads the notification with the **caller's** client
first, so RLS decides whether they may act on it at all. Only then does it
elevate to the service role — solely to look up the recipient's address and
stamp the delivery. A student cannot email someone else's notification because
the first read returns nothing.

`daily-reminders` runs with `verify_jwt = false` because a cron trigger has no
user. A shared secret takes the JWT's place, compared in **constant time** so
it cannot be probed a byte at a time. That header is the only thing in front of
a service-role function, so treat `FUNCTION_CRON_SECRET` as a production
credential.

Both are idempotent. `send-notification-email` checks `delivered.email` before
sending; `daily-reminders` skips anyone already warned about a given
assignment. A retried invocation must not send a second copy.

---

## Audit

`audit_logs` records inserts, updates and deletes on `users`, `user_roles`,
`enrollments`, `grades`, `assignment_submissions` and `teacher_assignments` —
with the before/after row image, the changed column list and the actor.

`admin-users` writes its own entry on top of that trigger trail. It has to:
under the service role `auth.uid()` is null, so `app.audit_row()` would record
the change with nobody attached to it. The explicit row carries the
administrator who asked for it, and `context.via = 'admin-users'` marks where it
came in.

Append-only, twice over: no write policy, and no write privilege.
`app.audit_row()` strips `medical_notes`, `metadata`, `responses` and
`correct_answers` before writing, and skips updates that only bumped
`updated_at`.

---

## Pre-launch checklist

- [ ] Rotate every key that has ever been in a `.env` on a developer machine
- [ ] `enable_signup = false` if the school provisions accounts itself
- [ ] Confirm `enable_confirmations = true` in production
- [ ] Set `site_url` and `additional_redirect_urls` to real domains only
- [ ] `supabase secrets set --env-file ./supabase/functions/.env`
- [ ] Put a WAF/CDN in front with the rate rules above
- [ ] Enable Point-in-Time Recovery and verify a restore
- [ ] `npm run db:lint` clean
- [ ] Walk the four seeded roles through `/admin/students` and confirm the row
      counts differ
- [ ] Confirm no `VITE_` variable holds a secret: `grep -r "VITE_" .env*`
- [ ] Add a CSP once the inline theme script carries a nonce

---

## Reporting

Security issues should go to the school's IT contact rather than a public
issue tracker.
