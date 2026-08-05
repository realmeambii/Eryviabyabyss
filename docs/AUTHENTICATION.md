# Authentication

Supabase Auth (GoTrue) owns credentials. This application never sees, stores or
hashes a password.

---

## The two halves of identity

| | Owned by | Answers |
| --- | --- | --- |
| **Session** | Supabase Auth | *Are you signed in?* |
| **Context** | `public.current_user_context()` | *Who are you here?* |

`AuthProvider` holds both, and keeps them separate on purpose.

The session is a JWT with a one-hour life. The context — roles, school, student
/teacher/parent ids, children, unread count — is a TanStack Query, so it
caches, refetches and invalidates like any other server state.

**Roles are never read from the JWT.** A token minted before an administrator
changed someone's role would carry the stale role for up to an hour.
`current_user_context()` reads the live tables in a single round trip, which is
both fresher and cheaper than six separate queries.

---

## Sign-in

```
LoginPage
  → useSignIn → authService.signInWithPassword()
      → supabase.auth.signInWithPassword()
          → session stored in localStorage under `gnaschools.auth`
              → onAuthStateChange fires SIGNED_IN
                  → AuthProvider sets session, invalidates queryKeys.auth
                      → current_user_context() runs
                          → RoleHomeRedirect sends them to their portal
```

Landing is by role precedence — `administrator > teacher > parent > student` —
so a teacher who is also a parent at the same school lands on the teacher
portal. If they were bounced to login from a deep link, `location.state.from`
takes priority and returns them there instead.

## Sign-out

```ts
await supabase.auth.signOut({ scope: 'local' });
queryClient.clear();
```

`scope: 'local'` clears this browser only. Signing out on a shared school
computer should not kill the same user's session on their phone.

`queryClient.clear()` is not optional. Every query in this app is
RLS-scoped to whoever asked; leaving one user's rows in the cache while another
signs in on the same machine would show them to the wrong person.

---

## Registration

```ts
supabase.auth.signUp({
  email, password,
  options: { data: { first_name, last_name, role } },
});
```

`options.data` becomes `raw_user_meta_data`, which `handle_new_user()` reads to
create the profile.

### The escalation guard

```sql
v_role_slug := nullif(v_app_meta ->> 'role', '');        -- trusted
if v_role_slug is null then
  v_role_slug := nullif(v_user_meta ->> 'role', '');     -- untrusted
  if v_role_slug not in ('student', 'parent') then
    v_role_slug := 'student';
  end if;
end if;
```

This ordering is the entire control.

`raw_user_meta_data` is whatever the browser passed to `signUp()` — fully
attacker-controlled. Anyone can post `{"role": "administrator"}`.
`raw_app_meta_data` can only be written with the service-role key.

So a self-service sign-up reaches `student` or `parent` and no further.
`teacher` and `administrator` must be provisioned server-side, through the
admin API or a seed.

### Accounts with no school

If the trigger cannot determine the school — more than one active school and no
hint in the metadata — it leaves `school_id` null. RLS then denies everything,
because `app.in_my_school()` never matches a null.

Rather than an app full of empty tables, `RequireAuth` detects this
(`isPending`) and routes to the **pending access** screen, which says plainly
that an administrator has not placed the account yet.

---

## Email verification

Controlled by `enable_confirmations` in `supabase/config.toml`. When on,
`signUp()` returns a user but **no session** — that is the signal the UI uses
to show "check your inbox".

The confirmation link returns to `/auth/callback`. By the time that page
renders, the Supabase client has already exchanged the code for a session
(`detectSessionInUrl: true`), so the page only has to decide where to send the
user — or explain that the link was already used.

`handle_user_email_confirmed()` flips the profile from `invited` to `active`
and keeps `public.users.email` in step when the address changes through the
auth API.

Locally, every outgoing email is captured at http://127.0.0.1:54324.

---

## Password reset

```
ForgotPasswordPage
  → resetPasswordForEmail(email, { redirectTo: /auth/reset-password })
      → emailed link carries a recovery token in the URL fragment
          → client exchanges it for a short-lived recovery session
              → ResetPasswordPage → updateUser({ password })
```

Two details worth stating:

**The success screen does not confirm whether the address exists.** It says "if
an account exists for …". Confirming it would turn the form into an
account-enumeration oracle, and Supabase returns the same response either way.

**"Was the link valid?" and "is there a session?" are the same question.**
`ResetPasswordPage` checks for a session; without one, `updateUser` would be
rejected anyway. An expired link therefore fails closed, and the page can say
so before the user types a new password.

`/auth/reset-password` sits **outside** `RedirectIfAuthenticated` — the user
holds a recovery session at that moment, so the usual "you are signed in, go
away" redirect would make the page unreachable.

---

## Sessions

| Setting | Value | Where |
| --- | --- | --- |
| Access token life | 1 hour | `jwt_expiry` |
| Refresh rotation | on | `enable_refresh_token_rotation` |
| Reuse interval | 10 s | `refresh_token_reuse_interval` |
| Inactivity timeout | 14 days | `auth.sessions.inactivity_timeout` |
| Absolute cap | 30 days | `auth.sessions.timebox` |
| Storage | `localStorage` (`gnaschools.auth`) | `supabase.ts` |
| Flow | PKCE | `supabase.ts` |

Refresh-token rotation means a stolen refresh token is single-use: the moment
the real client refreshes, the stolen one is invalidated and the session is
revoked. The 10-second reuse interval keeps that from misfiring when two tabs
refresh at once.

The client is a **singleton**, with a `globalThis` guard for HMR. Two clients
on one page share a storage key and race each other refreshing, which surfaces
as sporadic 401s that are miserable to debug.

---

## Route protection

`src/features/auth/components/route-guards.tsx`.

| Guard | Behaviour |
| --- | --- |
| `RequireAuth` | Signed in, placed in a school, holds a role. Preserves the target in `state.from`. |
| `RequireRole` | Narrows a branch to specific roles; sends others to their own portal. |
| `RedirectIfAuthenticated` | Keeps signed-in users off login / forgot-password. |
| `RoleHomeRedirect` | Resolves `/` to the right portal. |

Every guard renders a loading screen while `isLoading` is true — without that,
a page reload bounces a perfectly valid user to the login screen for the few
hundred milliseconds it takes to restore the session.

### These are not a security boundary

Worth being blunt about, because it is the most common misreading of code like
this: **anyone can edit the bundle and delete a guard.**

What guards buy is a coherent experience — no half-rendered screens mid-restore,
no 403-shaped empty states where a redirect is the right answer, no lost
destination across a login.

What actually stops a student reading another student's marks is RLS. A student
who forces their way to `/admin/students` gets an empty table, because
`students_select_authorised` never returns the rows. See [RLS.md](RLS.md).

---

## OAuth

Wired but disabled. `signInWithOAuth()` exists in `auth.service.ts`, and
`[auth.external.google]` / `[auth.external.azure]` are present in
`config.toml` with `enabled = false`.

Turning one on is a dashboard change plus a redirect URL — not a code change.
`handle_new_user()` already handles an OAuth signup: the provider supplies the
email, and the same role guard applies, so a Google sign-up still lands on
`student` unless an administrator says otherwise.

---

## Testing it

The seeded accounts all use `Password123!`:

| Email | Role |
| --- | --- |
| `admin@gnaschools.edu.ng` | Administrator |
| `teacher@gnaschools.edu.ng` | Teacher |
| `student@gnaschools.edu.ng` | Student |
| `parent@gnaschools.edu.ng` | Parent |

Worth walking through in order:

1. Sign in as each. Confirm the landing portal and the sidebar differ.
2. As the student, navigate to `/admin/students` directly. You are redirected
   to `/student` — and if you disable the guard in devtools, the table renders
   empty. That is the difference between the two mechanisms, visible.
3. Request a password reset and collect the mail from Inbucket on port 54324.
4. Sign in, then delete the `gnaschools.auth` key from localStorage and reload:
   you land back on login with the destination preserved.
