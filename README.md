# GNASchools LMS

A Learning Management System for secondary schools (JSS 1 – SS 3), built on
React 19 and Supabase.

**This repository is Phase 1: the foundation.** The database, security model,
authentication and application architecture are complete and production-shaped.
The feature screens — assignments, quizzes, attendance, grades, timetable —
land in Phase 2 on top of exactly this groundwork.

---

## What is actually here

| Area | State |
| --- | --- |
| PostgreSQL schema | ✅ 27 tables, constraints, indexes, cascade rules |
| Row Level Security | ✅ Enabled on every table, ~90 policies, migration-time assertion |
| Business rules | ✅ 18 trigger functions: lateness, grade banding, gradebook sync, notifications, audit |
| Storage | ✅ 5 buckets with path-based access policies and per-bucket MIME/size limits |
| Seed data | ✅ 1 school · 5 admins · 20 teachers · 200 students · 150 parents · timetables · grades |
| Authentication | ✅ Email/password, verification, reset, session persistence, role-based routing |
| Edge Functions | ✅ 2 — email dispatch and the nightly reminder sweep |
| TypeScript types | ✅ Generated shape covering every table, enum and RPC |
| Frontend shell | ✅ Sign-in flow, four role portals, shared layout, theming |
| Feature screens | ⏳ Phase 2 — each module ships its typed data layer plus a placeholder page |

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env.local
```

Start the local Supabase stack. This runs every migration, then the seed:

```bash
npx supabase start
```

The command prints an `anon key`. Put it in `.env.local` as
`VITE_SUPABASE_ANON_KEY`, then:

```bash
npm run dev
```

Open http://localhost:5173 and sign in with any seeded account — the password
for all of them is `Password123!`:

| Email | Role |
| --- | --- |
| `admin@gnaschools.edu.ng` | Administrator |
| `teacher@gnaschools.edu.ng` | Teacher |
| `student@gnaschools.edu.ng` | Student |
| `parent@gnaschools.edu.ng` | Parent |

Signing in as each in turn is the fastest way to see the security model work:
the administrator's student register returns 200 rows, the teacher's returns
only the students they teach, and the parent's returns their own children —
from the same query, because RLS decides what comes back.

Outgoing mail is captured locally at http://127.0.0.1:54324.

> Prerequisites: Node ≥ 20.19 and Docker Desktop (the Supabase CLI needs it).
> Without Docker you can still run `npm run build` and point `.env.local` at a
> hosted Supabase project.

---

## Architecture at a glance

```
Browser ──► React 19 SPA (Vite, TanStack Query)
                │
                │  supabase-js — carries the user's JWT
                ▼
        PostgREST ──► PostgreSQL
                          │
                          ├── Row Level Security      ← the authorisation boundary
                          ├── Triggers                ← business rules
                          └── Storage / Realtime / Auth
```

One idea runs through the whole design: **the database is the security
boundary.** Route guards and role checks in React decide what to *render*; they
are not what keeps a student out of another student's marks. That is RLS, and
it holds whether the request comes from this app, from `curl`, or from a
modified bundle.

The direct consequence is that the frontend has no permission logic to keep in
sync. `listAssignments()` is the same function for a student, a teacher and an
administrator — the rows differ because the policies differ.

---

## Project structure

```
├── src/
│   ├── features/            One folder per domain. Owns its api/, hooks/,
│   │   ├── auth/            components/, pages/, schemas/ and its public
│   │   ├── admin/           barrel (index.ts). Features import each other
│   │   ├── teacher/         only through that barrel — enforced by ESLint.
│   │   ├── student/
│   │   ├── parent/
│   │   ├── assignments/
│   │   ├── quizzes/
│   │   ├── attendance/
│   │   ├── grades/
│   │   ├── timetable/
│   │   └── notifications/
│   ├── shared/              Cross-cutting only. Nothing here may import a
│   │   ├── components/      feature — that direction is one-way.
│   │   │   └── ui/          shadcn/ui primitives
│   │   ├── hooks/
│   │   ├── lib/             supabase client, env, query client, errors, keys
│   │   ├── services/        storage
│   │   ├── types/           generated database types + domain aliases
│   │   ├── contexts/
│   │   └── utils/
│   ├── layouts/             auth shell, app shell (sidebar + topbar)
│   ├── routes/              route table, nav config, system pages
│   ├── styles/              design tokens + Tailwind entry
│   ├── App.tsx              provider composition
│   └── main.tsx
├── supabase/
│   ├── migrations/          numbered, forward-only SQL
│   ├── seed/                development data
│   ├── functions/           Deno Edge Functions
│   ├── templates/           auth email templates
│   └── config.toml          local stack + auth configuration
├── docs/                    architecture, database, auth, RLS, security,
│                            development, deployment
└── public/brand/            school crest
```

Full rationale for each directory: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) then bundle |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint, type-aware |
| `npm run format` | Prettier over the repo |
| `npm run verify` | format check → lint → build. What CI runs |
| `npm run db:start` / `db:stop` | Local Supabase stack |
| `npm run db:reset` | Drop, re-migrate, re-seed |
| `npm run db:diff -- <name>` | Generate a migration from schema drift |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run db:lint` | Supabase's own schema linter |
| `npm run db:types` | Regenerate `src/shared/types/database.types.ts` |
| `npm run fn:serve` | Run Edge Functions locally |
| `npm run fn:deploy` | Deploy Edge Functions |

---

## Documentation

| Document | Covers |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Every directory, and why the boundaries sit where they do |
| [DATABASE.md](docs/DATABASE.md) | All 27 tables, the relationships, and the modelling decisions |
| [AUTHENTICATION.md](docs/AUTHENTICATION.md) | Sign-in, verification, reset, sessions, route protection |
| [RLS.md](docs/RLS.md) | The policy model, the helper functions, and how to test them |
| [SECURITY.md](docs/SECURITY.md) | Threat model, secrets handling, rate limiting, uploads |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Day-to-day workflow, migrations, conventions |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel + Supabase, environments, rollback |

---

## Tech stack

**Frontend** — React 19 · Vite 7 · TypeScript (strict) · Tailwind CSS v4 ·
shadcn/ui · React Router 7 · TanStack Query 5 · React Hook Form · Zod 4 ·
Axios · Lucide

**Backend** — Supabase: PostgreSQL 17 · Auth · Storage · Realtime · Edge
Functions (Deno)

**Deployment** — Vercel (frontend) · Supabase (backend)

---

## Notes on scope

Four tables exist that were not in the original Phase 1 list, each because a
stated deliverable needs it:

- **`parent_students`** — "parents only access their children's records" is a
  many-to-many relationship (siblings, two guardians). Every parent-side policy
  resolves through it.
- **`timetable_slots`** — the brief asks for seeded timetables.
- **`attendance_records`** — the brief asks for an attendance feature module.
- **`lessons`** — gives the required "Lesson Materials" storage bucket
  something to attach to.

They are flagged in the migrations that create them.
