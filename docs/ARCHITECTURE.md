# Architecture

## The one idea

**The database is the security boundary.**

Everything else follows from that. Route guards, role checks and conditional
rendering in React decide what a user *sees*; they are not what stops a student
reading another student's marks. Row Level Security is, and it holds whether
the request arrives from this app, from `curl`, from a modified bundle, or from
a future mobile client.

Two practical consequences shape the whole codebase:

1. **The data layer has no permission logic.** `listAssignments()` is one
   function. A student calling it gets their class's published work; a teacher
   gets everything they set, draft included; an administrator gets the school.
   The code is identical — the policies differ. There is no `if (isTeacher)` in
   `src/features/assignments/api/`, and adding one would create a second copy
   of the rules, free to drift out of step with the first.

2. **Rules that must always hold live in Postgres.** Whether a submission is
   late is decided by the database clock in `app.enforce_submission_rules()`,
   not by the browser. A quiz is marked in `submit_quiz_attempt()`, not in
   TypeScript. If a rule could be broken by a client that skips the UI, it does
   not belong in the UI.

---

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│  routes/          route table, guards, nav config            │
├──────────────────────────────────────────────────────────────┤
│  layouts/         auth shell · app shell (sidebar + topbar)  │
├──────────────────────────────────────────────────────────────┤
│  features/        auth · admin · teacher · student · parent  │
│                   assignments · quizzes · lessons            │
│                   grades · timetable · notifications         │
│                                                              │
│    each: api/ hooks/ components/ pages/ schemas/ index.ts    │
├──────────────────────────────────────────────────────────────┤
│  shared/          components · hooks · lib · services        │
│                   types · contexts · utils                   │
├──────────────────────────────────────────────────────────────┤
│  Supabase         PostgREST · Auth · Storage · Realtime      │
│                   RLS · triggers · Edge Functions            │
└──────────────────────────────────────────────────────────────┘
```

Dependencies point downwards only:

- `routes` → `layouts` → `features` → `shared`
- A feature may import `shared`. **`shared` may never import a feature.**
- A feature may import another feature only through its barrel
  (`@/features/auth`, never `@/features/auth/api/auth.service`).

The last rule is enforced, not merely documented — `no-restricted-imports` in
`eslint.config.js` fails the build on a deep cross-feature import. Without it,
"just this once" reaches into a neighbour's internals and the module boundary
stops meaning anything within a month.

---

## Directories

### `src/features/*`

One folder per domain, each self-contained:

```
features/assignments/
├── api/          data access. Thin, typed wrappers over PostgREST.
├── hooks/        TanStack Query hooks wrapping api/.
├── components/   components used only by this feature.
├── pages/        route-level screens (default export, lazily imported).
├── schemas/      Zod schemas for this feature's forms.
└── index.ts      the public surface. The only entry point.
```

**Why features rather than pages.** Everything about assignments — the queries,
the mutations, the forms, the validation, the screens — is in one folder.
Deleting the module is deleting the folder. Handing it to another engineer is
handing over one directory. Organised by page type instead, that same change
touches `pages/`, `components/`, `hooks/`, `services/` and `types/`, and
nothing tells you which files belong together.

The four role features (`admin`, `teacher`, `student`, `parent`) are portals:
they compose the domain features into a dashboard and a navigation tree. They
own very little logic of their own — a portal is a point of view on shared
modules, which is why `/student/grades` and `/parent/grades` render the same
component.

### `src/shared/*`

Genuinely cross-cutting code. The test for whether something belongs here is
whether *at least two unrelated features* need it. One feature needing it means
it belongs to that feature.

| Folder | Contents |
| --- | --- |
| `components/` | `PageHeader`, `EmptyState`, `ErrorBoundary`, `UserAvatar`, `ThemeProvider` |
| `components/ui/` | shadcn/ui primitives — Button, Input, Card, Form, DropdownMenu, … |
| `hooks/` | `useTheme`, `useDebouncedValue`, `useMediaQuery`, `useRealtime` |
| `lib/` | `supabase`, `env`, `query-client`, `query-keys`, `errors`, `constants`, `api-client` |
| `services/` | `storage.service` — the only module that builds a storage path |
| `types/` | `database.types.ts` (generated) and `domain.ts` (aliases over it) |
| `contexts/` | React contexts whose providers live in `components/` |
| `utils/` | `cn`, formatting helpers |

**Why `contexts/` and the provider are separate files.** A file exporting both a
context and a component defeats Fast Refresh — editing the provider remounts
the tree and drops all state. Splitting them keeps hot reload working, which
matters more than the extra file.

### `src/layouts/`

Two shells. `auth-layout` is the split-screen signed-out view; `app-layout` is
the sidebar-and-topbar signed-in view. Layouts own chrome and nothing else — no
data fetching beyond the notification badge, no business logic.

### `src/routes/`

The route table, the navigation config, and the two system pages (403, 404).

Every page is a `lazy()` import, so signing in as a student downloads the
student portal and nothing else. Routes shared by all four portals
(`assignments`, `grades`, `timetable`, `announcements`, `notifications`,
`profile`) are declared once in `sharedPortalRoutes()` — so `/student/grades`
and `/parent/grades` cannot drift apart, and adding a module to every portal is
a one-line change.

### `src/styles/globals.css`

Design tokens and the Tailwind entry point. Two vocabularies over one palette:

- `--app-*` — the product's own names (`--app-surface-2`, `--app-text-3`),
  lifted verbatim from the design source so any value can be traced back.
- `--color-*` — the shadcn/ui contract (`--color-background`, `--color-muted`).
  Aliases, not new colours: every one resolves to an `--app-*`.

Changing a colour means changing it once, in the `:root` / `.dark` blocks.

### `supabase/`

| Folder | Contents |
| --- | --- |
| `migrations/` | Numbered, forward-only SQL. Never edited once applied. |
| `seed/` | Development data. Runs after migrations on `db:reset`. |
| `functions/` | Deno Edge Functions plus their shared helpers. |
| `templates/` | Auth email templates (confirmation, recovery, invite). |
| `config.toml` | Local stack, auth policy, function settings. |

Migrations are numbered by concern rather than by date-of-change, so reading
them in order is reading the system from the ground up: extensions → enums →
tables → triggers → RLS helpers → policies → RPCs → storage → realtime →
hardening. See [DATABASE.md](DATABASE.md).

---

## Data flow

### Reading

```
Component
   → useQuery(queryKeys.assignments.list(filters), () => listAssignments(filters))
       → supabase.from('assignments').select(…)
           → PostgREST → RLS filters the rows → back up the chain
```

Cache keys come from one factory (`shared/lib/query-keys.ts`). Invalidating
"everything about assignments" is `queryKeys.assignments.all` rather than an
array literal repeated across six mutation handlers — and a typo becomes a
compile error instead of a cache entry that silently never invalidates.

### Writing

```
Component → useMutation → service function → PostgREST
                                                 ↓
                                    RLS WITH CHECK — allowed?
                                                 ↓
                                    BEFORE triggers — normalise, enforce
                                                 ↓
                                              row written
                                                 ↓
                                    AFTER triggers — gradebook, notifications, audit
                                                 ↓
                                    Realtime broadcast (RLS-filtered)
                                                 ↓
                          onSuccess → invalidate → refetch
```

Grading a submission is one write. The gradebook row, the student's
notification, the guardian's notification and the audit entry are all
consequences of it, produced by triggers. Doing that in the client would be
four round trips that can half-fail.

### Errors

Supabase throws three unrelated error shapes and Axios a fourth.
`shared/lib/errors.ts` normalises all of them into `AppError` with a `kind`
(`permission`, `validation`, `conflict`, `network`, …) and a message that is
safe to show a teacher.

SQLSTATE `42501` — an RLS denial — becomes "You do not have permission to do
that." Deliberately vague: naming the policy that failed would tell an attacker
the shape of the rules.

Failed *mutations* raise a toast; failed *queries* do not. A query failure is
rendered in place by the component that owns it, and toasting as well produces
two error messages for one problem.

---

## State

| Kind | Where it lives |
| --- | --- |
| Server data | TanStack Query. Never mirrored into `useState`. |
| Session + identity | `AuthProvider` — Supabase session plus one context query |
| Theme | `ThemeProvider`, persisted to `localStorage` |
| Form state | React Hook Form, validated by Zod |
| Ephemeral UI | Local `useState` |

There is no Redux, Zustand or global store, because there is nothing left for
one to hold. Almost all state in an LMS is server state; a client store would
be a cache in front of a cache.

**Roles are never read from the JWT.** A token minted before an administrator
changed someone's role still carries the old one for up to an hour.
`current_user_context()` reads the live tables, in one round trip that also
returns the profile, school, role ids, children and unread count.

---

## Adding a feature

1. `src/features/<name>/` with `api/`, `hooks/`, `pages/`, `index.ts`.
2. Write the SQL first — table, indexes, RLS policies, migration.
3. `npm run db:types`.
4. Write `api/<name>.service.ts` against the generated types. No permission
   checks — that is what step 2 was for.
5. Wrap it in TanStack Query hooks, with keys added to `query-keys.ts`.
6. Build the pages; export them from `index.ts`.
7. Add the routes in `src/routes/index.tsx` and the nav entry in
   `src/routes/nav-config.ts`.

Steps 2 and 4 are in that order for a reason: writing the policy first forces
the access question to be answered once, in the place that actually enforces
it.
