-- ═══════════════════════════════════════════════════════════════════════════
--  1200 · Realtime
-- ═══════════════════════════════════════════════════════════════════════════
--  Realtime respects RLS: a subscriber receives a change only if the same row
--  would be visible to a SELECT under their JWT. So the publication list below
--  is a performance decision, not a security one — it decides how much write
--  traffic is broadcast, and the policies in 1000 decide who hears it.
--
--  Deliberately NOT published: audit_logs (noisy, admin-only), users,
--  quiz_questions (contains the answer key).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'notifications',            -- the bell badge, the reason Realtime is on at all
    'announcements',            -- noticeboard updates land without a refresh
    'assignment_submissions',   -- the teacher's grading queue
    'assignments',
    'grades',
    'attendance_records'
  ];
begin
  foreach v_table in array v_tables loop
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;

-- UPDATE events carry the full previous row, so a client can diff read/unread
-- without a refetch. Only enabled where the row is small.
alter table public.notifications replica identity full;
