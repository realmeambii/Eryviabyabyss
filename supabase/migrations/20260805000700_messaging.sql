-- ═══════════════════════════════════════════════════════════════════════════
--  Messaging — conversations, messages, read state, attachments
-- ═══════════════════════════════════════════════════════════════════════════
--  The one part of the teacher module with no schema behind it at all.
--
--  Two rules shape everything below:
--
--  1. Membership is the only key. A message is readable because you are in the
--     conversation — not because you teach the class it came from, or share a
--     school with the sender. `app.in_conversation()` is the single predicate,
--     and every policy on every table here resolves through it.
--
--  2. Who may be put *into* a conversation is the real access decision, and it
--     is made once, at the point a participant row is written. After that the
--     thread is closed. This is what stops a teacher opening a channel to a
--     pupil they do not teach, or to a parent whose child they have never met.
--
--  A safeguarding note that is a design constraint, not a nicety: a school
--  needs to be able to answer "what did this member of staff say to this
--  child". Messages are therefore never hard-deleted — `deleted_at` blanks the
--  body in the UI and the row stays. There is no DELETE policy on `messages`
--  for anyone.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Who may talk to whom ───────────────────────────────────────────────────
--  Built on `app.can_read_user()`, which already encodes the school's
--  visibility graph — a teacher sees the pupils they teach and those pupils'
--  guardians, a parent sees their own children, staff profiles are visible
--  school-wide. Messaging should not invent a second, subtly different graph.
--
--  One addition: administrators. `can_read_user()` does not make an
--  administrator's profile visible to an ordinary teacher, but "I need to
--  raise something with the office" is the most ordinary request in the
--  product, so any member of the school may open a thread with one.

create or replace function app.may_message(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id <> (select auth.uid())
     and exists (select 1 from public.users u
                  where u.id = p_user_id
                    and u.school_id = app.current_school_id()
                    and u.status = 'active')
     and (
       app.can_read_user(p_user_id)
       -- …or they are an administrator of this school.
       or exists (
            select 1
              from public.user_roles ur
              join public.roles r on r.id = ur.role_id
             where ur.user_id = p_user_id
               and r.slug = 'administrator'
               and ur.school_id = app.current_school_id()
               and (ur.expires_at is null or ur.expires_at > now())
          )
     );
$$;

comment on function app.may_message(uuid) is
  'Whether the caller may open a thread with this user. Evaluated when a '
  'participant row is written, which is the only moment it can be enforced.';

-- ── conversations ──────────────────────────────────────────────────────────
create table public.conversations (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete cascade,
  -- Null for a direct thread; group threads are named.
  subject      text check (subject is null or length(btrim(subject)) between 1 and 200),
  created_by   uuid references public.users (id) on delete set null,
  -- Denormalised so the inbox can order threads without touching `messages`.
  -- Maintained by the trigger below, never by the client.
  last_message_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index conversations_school_idx on public.conversations (school_id, last_message_at desc);

-- ── conversation_participants ──────────────────────────────────────────────
--  `last_read_at` is the read receipt, and it is deliberately a watermark
--  rather than a row per (message, reader). A class group of thirty would turn
--  one message into thirty receipt rows; the watermark answers the same
--  question — "has this person seen this message" is `last_read_at >=
--  message.created_at` — in one row per person, and makes the unread count a
--  single comparison.

create table public.conversation_participants (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  school_id       uuid not null references public.schools (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  -- Epoch rather than null: "has read nothing" and "joined just now" are the
  -- same state, and a null here would make every unread query handle it.
  last_read_at    timestamptz not null default '-infinity',
  is_muted        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint conversation_participants_unique unique (conversation_id, user_id)
);

create index conversation_participants_user_idx
  on public.conversation_participants (user_id, conversation_id);

-- ── messages ───────────────────────────────────────────────────────────────
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  school_id       uuid not null references public.schools (id) on delete cascade,
  -- Keep the message if the account is removed; the thread must stay readable.
  sender_id       uuid references public.users (id) on delete set null,
  body            text not null check (length(btrim(body)) between 1 and 8000),
  -- Set when withdrawn. The row survives — see the safeguarding note above.
  deleted_at      timestamptz,
  edited_at       timestamptz,
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx       on public.messages (sender_id, created_at desc);

comment on table public.messages is
  'Append-only in practice: no DELETE policy exists. Withdrawing a message '
  'sets deleted_at so the school retains the record.';

-- ── Membership predicate ───────────────────────────────────────────────────
--  SECURITY DEFINER for the usual reason: a policy on
--  `conversation_participants` that queried `conversation_participants` would
--  recurse. This is a boolean question about the caller, so running it as the
--  owner leaks nothing.

create or replace function app.in_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_participants cp
     where cp.conversation_id = p_conversation_id
       and cp.user_id = (select auth.uid())
  );
$$;

-- ── Thread bookkeeping ─────────────────────────────────────────────────────
--  `last_message_at` drives the inbox order, so it must reflect what was
--  actually written rather than what a client claimed.

create or replace function app.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;

  -- The sender has read their own message by definition; without this their
  -- own thread comes back unread the moment they send.
  update public.conversation_participants
     set last_read_at = new.created_at
   where conversation_id = new.conversation_id
     and user_id = new.sender_id;

  return null;
end;
$$;

create trigger touch_conversation
  after insert on public.messages
  for each row execute function app.touch_conversation();

select app.attach_updated_at('public.conversations');
select app.attach_updated_at('public.conversation_participants');

-- ── Row Level Security ─────────────────────────────────────────────────────

alter table public.conversations              enable row level security;
alter table public.conversation_participants  enable row level security;
alter table public.messages                   enable row level security;

-- Conversations ------------------------------------------------------------
create policy conversations_select_participant on public.conversations
  for select to authenticated
  using ((select app.in_conversation(id)));

create policy conversations_insert_member on public.conversations
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and created_by = (select auth.uid())
  );

-- Renaming a group thread. `last_message_at` is trigger-maintained and the
-- column guard below puts back anything a client tries to set by hand.
create policy conversations_update_participant on public.conversations
  for update to authenticated
  using ((select app.in_conversation(id)))
  with check ((select app.in_my_school(school_id)));

-- Participants --------------------------------------------------------------
create policy conversation_participants_select_peer on public.conversation_participants
  for select to authenticated
  using ((select app.in_conversation(conversation_id)));

--  The gate. Adding somebody to a thread is allowed when you are already in it
--  (or are opening it), the school matches, and `may_message()` says the pair
--  is permitted. Adding *yourself* is how a thread starts, so it is exempt
--  from the pairing test but not from the school test.
create policy conversation_participants_insert_permitted on public.conversation_participants
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and (
      user_id = (select auth.uid())
      or (
        (select app.in_conversation(conversation_id))
        and (select app.may_message(user_id))
      )
    )
  );

--  Only your own row, and the column guard restricts it to the read watermark
--  and the mute flag — you cannot move yourself into another conversation.
create policy conversation_participants_update_self on public.conversation_participants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Leaving a thread. Removing anyone else is not offered.
create policy conversation_participants_delete_self on public.conversation_participants
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Messages ------------------------------------------------------------------
create policy messages_select_participant on public.messages
  for select to authenticated
  using ((select app.in_conversation(conversation_id)));

create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select app.in_conversation(conversation_id))
    and (select app.in_my_school(school_id))
  );

-- Editing and withdrawing, author only. No DELETE policy anywhere, for anyone.
create policy messages_update_author on public.messages
  for update to authenticated
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

-- ── Column guards ──────────────────────────────────────────────────────────
--  RLS decides which rows may be written, never which columns. Same pattern as
--  1300.

create or replace function app.protect_message_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  -- An author may correct the text or withdraw it. Everything that decides
  -- where the message lives, and who it came from, stays put.
  new.conversation_id := old.conversation_id;
  new.school_id       := old.school_id;
  new.sender_id       := old.sender_id;
  new.created_at      := old.created_at;

  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;

  return new;
end;
$$;

create trigger protect_message_columns
  before update on public.messages
  for each row execute function app.protect_message_columns();

create or replace function app.protect_participant_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  -- Marking read and muting. Nothing else.
  new.conversation_id := old.conversation_id;
  new.user_id         := old.user_id;
  new.school_id       := old.school_id;
  new.joined_at       := old.joined_at;

  return new;
end;
$$;

create trigger protect_participant_columns
  before update on public.conversation_participants
  for each row execute function app.protect_participant_columns();

create or replace function app.protect_conversation_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  new.school_id       := old.school_id;
  new.created_by      := old.created_by;
  new.created_at      := old.created_at;
  -- Inbox ordering is the trigger's to set, not a client's to claim.
  new.last_message_at := old.last_message_at;

  return new;
end;
$$;

create trigger protect_conversation_columns
  before update on public.conversations
  for each row execute function app.protect_conversation_columns();

-- ── Attachments ────────────────────────────────────────────────────────────
--  Path grammar, matching the buckets in 1100:
--
--    message-attachments  {school_id}/{conversation_id}/{filename}
--
--  Keyed on the conversation rather than the message because the file is
--  uploaded before the message row exists. Membership of the conversation is
--  therefore the access key, which is the same rule the tables use.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments', 'message-attachments', false, 15 * 1024 * 1024,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic'
  ]
)
on conflict (id) do nothing;

create policy "message attachments readable by participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (select app.in_conversation(app.as_uuid((storage.foldername(name))[2])))
  );

create policy "message attachments writable by participants"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (select app.in_my_school(app.as_uuid((storage.foldername(name))[1])))
    and (select app.in_conversation(app.as_uuid((storage.foldername(name))[2])))
  );

-- Removing an attachment is withdrawing a message; same reasoning as the
-- missing DELETE policy on `messages`. No policy is offered.

-- ── Privileges ─────────────────────────────────────────────────────────────
grant select, insert, update, delete
  on public.conversations, public.conversation_participants, public.messages
  to authenticated, service_role;

revoke all on public.conversations, public.conversation_participants, public.messages
  from anon;

-- No DELETE for anyone on messages, privilege as well as policy — the same
-- belt-and-braces 1300 applies to audit_logs.
revoke delete on public.messages from authenticated;

grant execute on function app.in_conversation(uuid) to authenticated, service_role;
grant execute on function app.may_message(uuid)     to authenticated, service_role;
revoke execute on function app.in_conversation(uuid) from anon;
revoke execute on function app.may_message(uuid)     from anon;

-- ── Realtime ───────────────────────────────────────────────────────────────
--  The point of the subsystem: a message should land without a refresh.
--  Realtime re-evaluates RLS per subscriber, so publishing `messages`
--  broadcasts each row only to the participants who could already SELECT it.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end
$$;
