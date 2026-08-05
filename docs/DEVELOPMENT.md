# Development

## Setup

Requires Node ≥ 20.19 and Docker Desktop (the Supabase CLI needs it).

```bash
npm install
cp .env.example .env.local
npx supabase start          # migrations, then the seed
npm run dev
```

`supabase start` prints an `anon key`. Put it in `.env.local` as
`VITE_SUPABASE_ANON_KEY`.

| Service | URL |
| --- | --- |
| App | http://localhost:5173 |
| Supabase Studio | http://127.0.0.1:54323 |
| API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Inbucket (all outgoing mail) | http://127.0.0.1:54324 |

Without Docker you can still run `npm run build` and point `.env.local` at a
hosted project.

---

## Daily loop

```bash
npm run dev        # Vite, HMR
npm run lint       # type-aware ESLint
npm run verify     # format check → lint → build. What CI runs.
```

Run `npm run verify` before pushing. It is the same command CI runs, so a green
local run means a green pipeline.

---

## Changing the database

**Never edit an applied migration.** Once a migration has run anywhere other
than your own machine, it is history. The next change is a new file — otherwise
your database and everyone else's silently disagree about what "migrated"
means.

### The loop

```bash
# 1. New migration
npx supabase migration new add_report_cards

# 2. Write the SQL. Table, indexes, RLS policies — all in the one file.

# 3. Apply it by rebuilding from scratch. This also re-runs the seed and the
#    assertions at the end of 1300.
npm run db:reset

# 4. Regenerate types
npm run db:types

# 5. Lint the schema
npm run db:lint
```

Step 3 matters more than it looks. `db:reset` replays every migration in order
against an empty database, which is exactly what production will do. A
migration that only works when applied to *your* current state is a migration
that will fail on deploy.

### Prototyping in Studio

Change things in Studio, then capture the diff:

```bash
npm run db:diff -- add_report_cards
```

Read what it generates before committing it — `db diff` is good but not
psychic, and it will not write your RLS policies for you.

### Checklist for a new table

- [ ] `school_id` with the right cascade
- [ ] `created_at` / `updated_at` + `select app.attach_updated_at(...)`
- [ ] Indexes on every FK an RLS policy traverses
- [ ] `enable row level security`
- [ ] Four policies — select, insert, update, delete — each `TO authenticated`
- [ ] Helper calls wrapped as `(select app.x())`
- [ ] Guard trigger in `1300` for any column a client must not write
- [ ] `npm run db:reset` passes the assertions
- [ ] `npm run db:types`

---

## Adding a feature

```
src/features/<name>/
├── api/<name>.service.ts     typed wrappers over PostgREST
├── hooks/use-<name>.ts       TanStack Query hooks
├── components/               feature-local components
├── pages/                    route screens, default export
├── schemas/                  Zod schemas
└── index.ts                  the public surface
```

**Write the SQL first.** The policy is where the access question actually gets
answered; writing it first means the service layer has nothing left to decide.

Then:

1. `npm run db:types`
2. Write `api/<name>.service.ts` against the generated types — **no permission
   checks**, that is what step 1's policies are for
3. Wrap in query hooks; add keys to `shared/lib/query-keys.ts`
4. Build the pages, export from `index.ts`
5. Add routes in `src/routes/index.tsx`, nav in `src/routes/nav-config.ts`

---

## Conventions

### Imports

Always the `@/` alias, never `../../..`:

```ts
import { Button } from '@/shared/components/ui/button';
import { useAuth } from '@/features/auth';          // ✅ barrel
import { signIn } from '@/features/auth/api/auth.service';   // ❌ ESLint error
```

Cross-feature imports go through the barrel. `no-restricted-imports` enforces
it — without that rule, "just this once" reaches into a neighbour's internals
and the module boundary stops meaning anything within a month.

`shared` may never import a feature. That direction is one-way.

### Types

Never hand-write a row shape. Derive:

```ts
import type { Tables, TablesInsert } from '@/shared/types';

type Student = Tables<'students'>;
type NewStudent = TablesInsert<'students'>;
```

`database.types.ts` is generated. If a field is missing, the fix is a migration
plus `npm run db:types` — never an interface written by hand, which is a copy
free to drift.

### Naming

| Thing | Style | Example |
| --- | --- | --- |
| Files | kebab-case | `admin-students-page.tsx` |
| Components | PascalCase | `AdminStudentsPage` |
| Hooks | `use` + camelCase | `useUnreadNotificationCount` |
| Services | `*.service.ts` | `assignments.service.ts` |
| Page components | default export | so `lazy()` works without a wrapper |
| SQL | `snake_case` | `assignment_submissions` |

### Errors

Never surface a raw error. Always normalise:

```ts
import { errorMessage, toAppError } from '@/shared/lib/errors';
```

Service functions throw `AppError`. Failed mutations toast automatically
(`mutationCache.onError`); failed queries do **not** — the component that owns
the query renders the failure in place, and toasting as well produces two error
messages for one problem.

### Query keys

Always from the factory:

```ts
queryKey: queryKeys.assignments.list({ classId })   // ✅
queryKey: ['assignments', 'list', classId]          // ❌
```

Hierarchical, so `queryKeys.assignments.all` invalidates every assignment
query. A typo in a literal array is a cache entry that silently never
invalidates; a typo against the factory is a compile error.

### Styling

Tailwind utilities with the project's token names — `bg-surface-2`, `text-ink-3`,
`border-border`. Never a raw hex or an arbitrary colour value.

Both light and dark must work. The `.dark` class is on `<html>`, so a token
that resolves correctly in one theme resolves in the other for free — which is
the whole reason for the token layer.

---

## Edge Functions

```bash
cp supabase/functions/.env.example supabase/functions/.env
npm run fn:serve
```

```bash
curl -i http://127.0.0.1:54321/functions/v1/daily-reminders \
  -H "x-cron-secret: <FUNCTION_CRON_SECRET>"
```

They are Deno, not Node: `.ts` extensions on relative imports, `jsr:`/`npm:`
specifiers, `Deno.env` rather than `process.env`. ESLint ignores the folder for
that reason — use `deno check` or the Deno VS Code extension.

**Reach for one only when Postgres genuinely cannot do the job.** The two that
exist are there because they need an outbound HTTPS call with a secret
(`send-notification-email`) or because they have no triggering event at all
(`daily-reminders` — "nothing happened and the deadline is tomorrow" is the
*absence* of a row change, which only a schedule can notice).

---

## Troubleshooting

**Types resolve to `never` on `.insert()` / `.update()` / `.rpc()`**
The `Database` type no longer satisfies supabase-js's `GenericSchema` — almost
always a missing `Relationships` member on a table. Re-run `npm run db:types`.

**`supabase start` fails on a port**
`npx supabase stop --no-backup`, then start again. Ports are set in
`config.toml`.

**`supabase start` fails on `content_path: ENOENT`**
Email-template paths in `config.toml` resolve from the **project root**, not
from this file's directory — so they read `./supabase/templates/…`. Not every
path key in `config.toml` shares that base (`[db.seed] sql_paths` is documented
as relative to `supabase/`), so when adding one, check which base it uses
instead of copying a neighbour.

**`supabase start` fails on `TLS handshake timeout` pulling images**
A network problem, not a configuration one — the CLI pulls ~10 images from
`public.ecr.aws` on first run. Re-run `npx supabase start`; Docker keeps the
layers it already fetched, so retries get progressively cheaper.

**A policy denies something it should allow**
Reproduce it in psql rather than guessing:

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"<uuid>","role":"authenticated"}';
  select * from your_table;
rollback;
```

**RLS is slow**
Check the helper is wrapped as `(select app.x())` — unwrapped, it runs once per
row instead of once per statement. Then check there is an index on whatever the
policy filters.

**`db:reset` fails on the assertions in 1300**
A table was added without RLS, or with RLS but no policies. The error names it.

**Fast Refresh keeps remounting the tree**
A file is exporting both components and non-components. Split them — that is
why `greeting()` lives in `shared/utils/format` and not next to `ShortcutGrid`.
