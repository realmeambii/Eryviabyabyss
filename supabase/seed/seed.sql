-- ═══════════════════════════════════════════════════════════════════════════
--  GNASchools LMS — development seed
-- ═══════════════════════════════════════════════════════════════════════════
--  Run by `supabase db reset` (see [db.seed] in supabase/config.toml).
--
--  Produces:
--      1 school            10 classes           20 subjects
--      5 administrators    20 teachers         200 students        150 parents
--      3 terms             ~90 class-subjects  ~300 timetable slots
--      ~80 assignments     ~800 graded submissions (→ gradebook rows)
--      20 quizzes          ~150 attempts
--      8 announcements     ~2 000 attendance records
--
--  Every account signs in with:  Password123!
--
--  Accounts are created by inserting into `auth.users`, which fires
--  `handle_new_user()` — so this file also exercises the sign-up path rather
--  than working around it. `raw_app_meta_data` carries the school and role
--  because that is the server-trusted channel; `raw_user_meta_data` carries
--  the names, exactly as the real sign-up form does.
--
--  The trigger chain does real work here: publishing an assignment fans out
--  notifications, grading a submission writes a gradebook row, and every one
--  of those writes lands in `audit_logs`. That is intentional — a seed that
--  bypassed the triggers would not prove they work.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Reproducible "randomness": the same reset produces the same database.
select setseed(0.4242);

-- ── Why there are no helper functions in this file ─────────────────────────
--  `supabase db reset` sends the seed to Postgres as a single simple-query
--  string, and the server parses EVERY statement in such a string before it
--  executes any of them. So a function (or schema) created here is invisible to
--  every later statement in the same file — you get "schema does not exist" at
--  parse time, before the CREATE has run. `supabase start` uses a different
--  execution path and happens to tolerate it, which makes the failure look
--  intermittent.
--
--  Two consequences, both visible below:
--    • Deterministic ids are written inline as literals or as an expression,
--      not produced by a helper.        1 0000000-…-000000000001 is the school.
--    • Account creation lives inside a DO block. A DO body is just a string
--      literal at parse time and is compiled at runtime, so anything it
--      references only has to exist when the block actually runs.
--
--  Ids stay readable on purpose — admin #3 is always a0000000-…-000000000003,
--  which beats gen_random_uuid() when debugging seeded data.

-- ═══════════════════════════════════════════════════════════════════════════
--  1 · School
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.schools (
  id, name, slug, motto, email, phone, website,
  address_line1, city, state, country, logo_path
)
values (
  '10000000-0000-4000-8000-000000000001'::uuid,
  'Great Nigeria Academy',
  'great-nigeria-academy',
  'Knowledge, Character, Service',
  'info@gnaschools.edu.ng',
  '+234 803 555 0100',
  'https://gnaschools.edu.ng',
  '14 Awolowo Way, Ikeja',
  'Lagos',
  'Lagos',
  'Nigeria',
  null
);

-- ═══════════════════════════════════════════════════════════════════════════
--  2 · Academic sessions — three terms, the second one spanning today
-- ═══════════════════════════════════════════════════════════════════════════
--  Every date in this file is relative to `current_date`. That is not cosmetic:
--  app.enforce_submission_rules() rejects a submission whose assignment has
--  already closed, so a seed pinned to fixed dates stops working the moment the
--  calendar moves past it. Anchoring to today keeps the "one assignment marked,
--  one still open" arrangement true whenever the seed is run.

--  The session name ("2025/2026") is derived from today: the Nigerian school
--  year opens in September, so before month 9 we are still in the year that
--  began last September.
insert into public.academic_sessions (id, school_id, name, term, starts_on, ends_on, is_current)
select
  v.id,
  '10000000-0000-4000-8000-000000000001'::uuid,
  case
    when extract(month from current_date) >= 9
      then to_char(current_date, 'YYYY') || '/' ||
           to_char(current_date + interval '1 year', 'YYYY')
    else to_char(current_date - interval '1 year', 'YYYY') || '/' ||
         to_char(current_date, 'YYYY')
  end,
  v.term::public.academic_term,
  v.starts_on,
  v.ends_on,
  v.is_current
from (
  values
    ('20000000-0000-4000-8000-000000000001'::uuid, 'first',
     current_date - 165, current_date - 75,  false),
    ('20000000-0000-4000-8000-000000000002'::uuid, 'second',
     current_date - 60,  current_date + 40,  true),     -- ← contains today
    ('20000000-0000-4000-8000-000000000003'::uuid, 'third',
     current_date + 65,  current_date + 155, false)
) as v(id, term, starts_on, ends_on, is_current);

-- ═══════════════════════════════════════════════════════════════════════════
--  3 · Subjects (20)
-- ═══════════════════════════════════════════════════════════════════════════

-- The ordinal is spelled out as a column rather than obtained from WITH
-- ORDINALITY: that clause is only legal after a set-returning function in
-- FROM, not after a VALUES list.
insert into public.subjects (id, school_id, name, code, department, is_core, color)
select
  ('30000000-0000-4000-8000-' || lpad(to_hex(s.n), 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  s.name, s.code, s.department, s.is_core, s.color
from (
  values
    ( 1, 'Mathematics',                 'MTH', 'Sciences',   true,  '#2563eb'),
    ( 2, 'English Language',            'ENG', 'Languages',  true,  '#6b3fd4'),
    ( 3, 'Biology',                     'BIO', 'Sciences',   true,  '#087443'),
    ( 4, 'Chemistry',                   'CHM', 'Sciences',   false, '#b42318'),
    ( 5, 'Physics',                     'PHY', 'Sciences',   false, '#0e7490'),
    ( 6, 'Civic Education',             'CIV', 'Humanities', true,  '#9a5b00'),
    ( 7, 'Economics',                   'ECO', 'Commercial', false, '#7c3aed'),
    ( 8, 'Government',                  'GOV', 'Humanities', false, '#be123c'),
    ( 9, 'Literature-in-English',       'LIT', 'Languages',  false, '#c026d3'),
    (10, 'Geography',                   'GEO', 'Humanities', false, '#0891b2'),
    (11, 'Agricultural Science',        'AGR', 'Sciences',   false, '#4d7c0f'),
    (12, 'Computer Studies',            'CMP', 'Sciences',   true,  '#1d4ed8'),
    (13, 'Further Mathematics',         'FMT', 'Sciences',   false, '#4338ca'),
    (14, 'Christian Religious Studies', 'CRS', 'Humanities', false, '#a16207'),
    (15, 'Islamic Religious Studies',   'IRS', 'Humanities', false, '#15803d'),
    (16, 'Business Studies',            'BUS', 'Commercial', false, '#b45309'),
    (17, 'Basic Technology',            'BTC', 'Sciences',   false, '#475569'),
    (18, 'Home Economics',              'HEC', 'Vocational', false, '#db2777'),
    (19, 'Fine Arts',                   'ART', 'Vocational', false, '#ea580c'),
    (20, 'French',                      'FRE', 'Languages',  false, '#0f766e')
) as s(n, name, code, department, is_core, color);

-- ═══════════════════════════════════════════════════════════════════════════
--  4 · Accounts — 5 administrators, 20 teachers, 200 students, 150 parents
-- ═══════════════════════════════════════════════════════════════════════════
--  Signing in as any of these uses the password above. The four accounts worth
--  remembering are printed at the end of this file.

do $$
declare
  v_school constant uuid := '10000000-0000-4000-8000-000000000001'::uuid;

  v_first constant text[] := array[
    'Adaeze','Chinedu','Emeka','Folake','Ngozi','Tunde','Yemi','Kelechi','Ifeoma','Segun',
    'Amaka','Obinna','Bisi','Chidi','Halima','Musa','Zainab','Aisha','Nnamdi','Uche',
    'Grace','Blessing','Peter','Daniel','Esther','Samuel','Joy','Michael','Rukayat','Ibrahim',
    'Olamide','Temitope','Chiamaka','Ekene','Damilola','Funmilayo','Ayomide','Oluwaseun',
    'Nkechi','Babatunde','Hauwa','Chukwuemeka','Titilayo','Adebola','Ifeanyi','Morayo',
    'Kolawole','Nneka','Suleiman','Abiodun'
  ];
  v_last constant text[] := array[
    'Okafor','Adeyemi','Nwosu','Balogun','Eze','Ogunleye','Abubakar','Chukwu','Adebayo',
    'Okonkwo','Lawal','Oyelaran','Ibrahim','Olayinka','Nnaji','Afolabi','Danjuma','Obi',
    'Salami','Bello','Adeleke','Onyeka','Suleiman','Akande','Ezeugo','Mohammed','Aliyu',
    'Okoro','Ajayi','Uzoma'
  ];

  -- role, count, uuid prefix, first-name stride, surname stride, email domain,
  -- the well-known address for #1, and that account's fixed name.
  v_cohorts constant text[][] := array[
    ['administrator',   '5', 'a',  '7', '11', 'staff',    'admin',   'Adaeze',   'Okafor' ],
    ['teacher',        '20', 'b',  '3',  '5', 'staff',    'teacher', 'Emeka',    'Nwosu'  ],
    ['student',       '200', 'c', '13', '17', 'student',  'student', 'Chiamaka', 'Balogun'],
    ['parent',        '150', 'd', '19', '23', 'parents',  'parent',  'Ngozi',    'Balogun']
  ];

  c integer;
  i integer;
  v_id uuid;
  v_f text;
  v_l text;
  v_email text;
  v_phone text;
  v_dob date;
begin
  for c in 1 .. array_length(v_cohorts, 1) loop
    for i in 1 .. v_cohorts[c][2]::int loop
      -- Deterministic id: prefix + zero-padded ordinal. Written out rather than
      -- built by a helper, for the parse-time reason at the top of this file.
      v_id := (v_cohorts[c][3] || '0000000-0000-4000-8000-' ||
               lpad(to_hex(i), 12, '0'))::uuid;

      v_f := v_first[1 + ((i * v_cohorts[c][4]::int) % array_length(v_first, 1))];
      v_l := v_last [1 + ((i * v_cohorts[c][5]::int) % array_length(v_last, 1))];

      if i = 1 then
        -- The four accounts a developer actually signs in as.
        v_email := v_cohorts[c][7] || '@gnaschools.edu.ng';
        v_f := v_cohorts[c][8];
        v_l := v_cohorts[c][9];
      else
        v_email := lower(v_f) || '.' || lower(v_l) || i || '@' ||
                   v_cohorts[c][6] || '.gnaschools.edu.ng';
      end if;

      v_phone := case
                   when v_cohorts[c][1] = 'student' then null
                   else '+234 80' || c || ' 555 ' || lpad((c * 1000 + i)::text, 4, '0')
                 end;

      v_dob := case v_cohorts[c][1]
                 -- Students are 11–17, spread across the six year groups.
                 when 'student' then date '2009-01-01' + (((i - 1) / 34) * 365) + ((i * 7) % 300)
                 when 'parent'  then date '1978-01-01' + (i * 53)
                 when 'teacher' then date '1985-01-01' + (i * 211)
                 else                date '1980-01-01' + (i * 137)
               end;

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        v_id, 'authenticated', 'authenticated', lower(v_email),
        extensions.crypt('Password123!', extensions.gen_salt('bf')),
        now() - interval '90 days',
        now() - (random() * interval '7 days'),
        jsonb_build_object(
          'provider', 'email',
          'providers', jsonb_build_array('email'),
          -- Server-trusted: the only channel handle_new_user() accepts a
          -- privileged role from.
          'role', v_cohorts[c][1],
          'school_id', v_school
        ),
        jsonb_build_object('first_name', v_f, 'last_name', v_l, 'phone', v_phone),
        now() - interval '90 days', now(),
        '', '', '', ''
      );

      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      )
      values (
        gen_random_uuid(), v_id::text, v_id,
        jsonb_build_object('sub', v_id::text, 'email', lower(v_email),
                           'email_verified', true),
        'email',
        now() - interval '90 days', now() - interval '90 days', now()
      );

      -- handle_new_user() has already created the profile from the metadata
      -- above; fill in what the sign-up form does not collect.
      update public.users
         set phone         = coalesce(v_phone, phone),
             gender        = (case when i % 2 = 0 then 'male' else 'female' end)::public.gender,
             date_of_birth = v_dob,
             status        = 'active'
       where id = v_id;
    end loop;
  end loop;
end
$$;

-- Tidy identifiers: handle_new_user() derives them from the uuid, which is
-- correct but ugly. An administrator would set these properly.
update public.teachers t
   set staff_number   = 'GNA/STF/' || lpad(row_number::text, 3, '0'),
       qualification  = (array['B.Ed.', 'B.Sc. (Ed.)', 'M.Ed.', 'PGDE', 'M.Sc.'])[1 + (row_number % 5)::int],
       employment_type = case when row_number % 9 = 0 then 'part_time'::public.employment_type
                              else 'full_time'::public.employment_type end,
       hire_date      = date '2018-09-01' + (row_number * 47)::int
  from (
    select id, row_number() over (order by created_at, id) as row_number
      from public.teachers
  ) as ranked
 where ranked.id = t.id;

update public.students s
   set admission_number = 'GNA/2025/' || lpad(row_number::text, 4, '0'),
       admission_date   = current_date - 165,   -- start of the first term
       address          = (array[
                            '14 Awolowo Way, Ikeja', '7 Adeniyi Jones Ave, Ikeja',
                            '22 Opebi Road, Ikeja', '5 Allen Avenue, Ikeja',
                            '31 Isaac John St, GRA'
                          ])[1 + (row_number % 5)::int] || ', Lagos',
       blood_group      = (array['O+', 'A+', 'B+', 'AB+', 'O-'])[1 + (row_number % 5)::int]
  from (
    select id, row_number() over (order by created_at, id) as row_number
      from public.students
  ) as ranked
 where ranked.id = s.id;

update public.parents p
   set occupation = (array[
         'Civil Servant', 'Trader', 'Engineer', 'Nurse', 'Accountant',
         'Teacher', 'Lawyer', 'Entrepreneur', 'Doctor', 'Banker'
       ])[1 + (row_number % 10)::int]
  from (
    select id, row_number() over (order by created_at, id) as row_number
      from public.parents
  ) as ranked
 where ranked.id = p.id;

-- ═══════════════════════════════════════════════════════════════════════════
--  5 · Classes (10) — JSS 1 through SS 3
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.classes (
  id, school_id, academic_session_id, name, arm, code, level, capacity, form_teacher_id, room
)
select
  ('40000000-0000-4000-8000-' || lpad(to_hex(c.n), 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000002'::uuid,                       -- current term
  c.name, c.arm, c.code, c.level, 30,
  (select t.id from public.teachers t
     join public.users u on u.id = t.user_id
    order by u.created_at, t.id
    offset c.n - 1 limit 1),                 -- teachers 1–10 are form teachers
  c.room
from (
  values
    (1,  'JSS 1', 'A', 'JSS1A', 1, 'Block A · Room 1'),
    (2,  'JSS 1', 'B', 'JSS1B', 1, 'Block A · Room 2'),
    (3,  'JSS 2', 'A', 'JSS2A', 2, 'Block A · Room 3'),
    (4,  'JSS 2', 'B', 'JSS2B', 2, 'Block A · Room 4'),
    (5,  'JSS 3', 'A', 'JSS3A', 3, 'Block B · Room 1'),
    (6,  'JSS 3', 'B', 'JSS3B', 3, 'Block B · Room 2'),
    (7,  'SS 1',  'A', 'SS1A',  4, 'Block B · Room 3'),
    (8,  'SS 1',  'B', 'SS1B',  4, 'Block B · Room 4'),
    (9,  'SS 2',  'A', 'SS2A',  5, 'Block C · Room 1'),
    (10, 'SS 3',  'A', 'SS3A',  6, 'Block C · Room 2')
) as c(n, name, arm, code, level, room);

-- ═══════════════════════════════════════════════════════════════════════════
--  6 · Curriculum — which subjects each class takes, and who teaches them
-- ═══════════════════════════════════════════════════════════════════════════
--  Junior classes (levels 1–3) take the junior set; senior classes take the
--  senior set. Nine subjects each.

insert into public.class_subjects (
  id, school_id, class_id, subject_id, academic_session_id, periods_per_week, is_compulsory
)
select
  gen_random_uuid(),
  '10000000-0000-4000-8000-000000000001'::uuid,
  c.id,
  s.id,
  '20000000-0000-4000-8000-000000000002'::uuid,
  case when s.is_core then 5 else 3 end,
  s.is_core
from public.classes c
join public.subjects s
  on s.code = any(
       case when c.level <= 3
            then array['MTH','ENG','BIO','CIV','CMP','BTC','AGR','HEC','FRE']
            else array['MTH','ENG','BIO','CHM','PHY','CIV','ECO','GOV','LIT']
       end
     )
where c.school_id = '10000000-0000-4000-8000-000000000001'::uuid;

--  Spread the ~90 pairings across the 20 teachers. `teacher_assignments` has a
--  one-lead-per-(class, subject, term) index, so this is a clean 1:1.
insert into public.teacher_assignments (
  id, school_id, teacher_id, class_id, subject_id, academic_session_id, is_lead
)
select
  gen_random_uuid(),
  '10000000-0000-4000-8000-000000000001'::uuid,
  t.id,
  cs.class_id,
  cs.subject_id,
  cs.academic_session_id,
  true
from (
  select cs.*, row_number() over (order by cs.class_id, cs.subject_id) - 1 as rn
    from public.class_subjects cs
) cs
join (
  select id, row_number() over (order by staff_number) - 1 as rn
    from public.teachers
) t on t.rn = cs.rn % 20;

-- ═══════════════════════════════════════════════════════════════════════════
--  7 · Enrolment — 200 students, 20 per class
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.enrollments (
  id, school_id, student_id, class_id, academic_session_id, roll_number, status, enrolled_on
)
select
  gen_random_uuid(),
  '10000000-0000-4000-8000-000000000001'::uuid,
  s.id,
  ('40000000-0000-4000-8000-' || lpad(to_hex((1 + ((s.rn - 1) / 20))::int), 12, '0'))::uuid,
  '20000000-0000-4000-8000-000000000002'::uuid,
  (((s.rn - 1) % 20) + 1)::smallint,
  'active',
  current_date - 60                            -- start of the current term
from (
  select id, row_number() over (order by admission_number) as rn
    from public.students
) s;

-- ── Guardians ──────────────────────────────────────────────────────────────
--  150 parents to 200 students: every student gets exactly one primary
--  contact, so ~50 parents have two children — which is what the sibling views
--  in the parent portal need to be worth building.

insert into public.parent_students (
  id, parent_id, student_id, school_id, relationship, is_primary_contact
)
select
  gen_random_uuid(),
  p.id,
  s.id,
  '10000000-0000-4000-8000-000000000001'::uuid,
  case when p.rn % 2 = 0 then 'father'::public.guardian_relationship
       else 'mother'::public.guardian_relationship end,
  true
from (
  select id, row_number() over (order by admission_number) as rn from public.students
) s
join (
  select id, row_number() over (order by created_at, id) as rn from public.parents
) p on p.rn = 1 + ((s.rn - 1) % 150);

--  A second, non-primary guardian for the first 40 students.
insert into public.parent_students (
  id, parent_id, student_id, school_id, relationship, is_primary_contact
)
select
  gen_random_uuid(),
  p.id,
  s.id,
  '10000000-0000-4000-8000-000000000001'::uuid,
  'guardian'::public.guardian_relationship,
  false
from (
  select id, row_number() over (order by admission_number) as rn from public.students
) s
join (
  select id, row_number() over (order by created_at, id) as rn from public.parents
) p on p.rn = 111 + s.rn
where s.rn <= 40
on conflict (parent_id, student_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
--  8 · Timetable
-- ═══════════════════════════════════════════════════════════════════════════
--  Six periods a day plus a mid-morning break, Monday to Friday, for all ten
--  classes. `timetable_slots` refuses to double-book a teacher, so the loop
--  tries the subject's own lead teacher first and falls back to an unassigned
--  slot when that teacher is already busy elsewhere in the period. That is the
--  constraint doing its job, not a workaround.

do $$
declare
  v_school  uuid := '10000000-0000-4000-8000-000000000001'::uuid;
  v_session uuid := '20000000-0000-4000-8000-000000000002'::uuid;
  v_starts  time[] := array['08:00', '08:45', '09:30', '10:45', '11:30', '12:15']::time[];
  v_class   record;
  v_day     smallint;
  v_period  integer;
  v_subject record;
  v_index   integer;
  v_pairs   record;
begin
  for v_class in
    select c.id, row_number() over (order by c.code) as rn
      from public.classes c
     where c.school_id = v_school
  loop
    v_index := 0;

    -- Break, 10:10–10:40.
    for v_day in 1 .. 5 loop
      insert into public.timetable_slots (
        school_id, class_id, subject_id, teacher_id, academic_session_id,
        day_of_week, starts_at, ends_at, room, is_break, label
      )
      select v_school, v_class.id, cs.subject_id, null, v_session,
             v_day, time '10:10', time '10:40', null, true, 'Break'
        from public.class_subjects cs
       where cs.class_id = v_class.id
       limit 1;
    end loop;

    for v_day in 1 .. 5 loop
      for v_period in 1 .. 6 loop
        -- Rotate through the class's subjects so each appears ~3 times a week.
        select cs.subject_id, ta.teacher_id
          into v_pairs
          from public.class_subjects cs
          left join public.teacher_assignments ta
                 on ta.class_id = cs.class_id
                and ta.subject_id = cs.subject_id
                and ta.academic_session_id = cs.academic_session_id
         where cs.class_id = v_class.id
         order by cs.subject_id
         offset v_index % 9
         limit 1;

        v_index := v_index + 1;

        begin
          insert into public.timetable_slots (
            school_id, class_id, subject_id, teacher_id, academic_session_id,
            day_of_week, starts_at, ends_at, room
          )
          values (
            v_school, v_class.id, v_pairs.subject_id, v_pairs.teacher_id, v_session,
            v_day, v_starts[v_period], v_starts[v_period] + interval '40 minutes',
            'Block ' || chr(65 + ((v_class.rn - 1) / 4)::int) || ' · Room ' ||
              (1 + ((v_class.rn - 1) % 4))
          );
        exception when exclusion_violation then
          -- That teacher already has this period with another class. Keep the
          -- lesson, drop the teacher; the timetable office would resolve it.
          insert into public.timetable_slots (
            school_id, class_id, subject_id, teacher_id, academic_session_id,
            day_of_week, starts_at, ends_at, room
          )
          values (
            v_school, v_class.id, v_pairs.subject_id, null, v_session,
            v_day, v_starts[v_period], v_starts[v_period] + interval '40 minutes',
            'Block ' || chr(65 + ((v_class.rn - 1) / 4)::int) || ' · Room ' ||
              (1 + ((v_class.rn - 1) % 4))
          );
        end;
      end loop;
    end loop;
  end loop;
end
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  9 · Lessons — four per class-subject for the four core subjects
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.lessons (
  school_id, class_id, subject_id, academic_session_id, created_by,
  title, summary, content_type, week_number, sort_order, duration_minutes,
  status, published_at
)
select
  '10000000-0000-4000-8000-000000000001'::uuid,
  ta.class_id,
  ta.subject_id,
  ta.academic_session_id,
  ta.teacher_id,
  s.name || ' · Week ' || w.n || ' — ' ||
    (array['Foundations', 'Worked examples', 'Practice and revision', 'Assessment prep'])[w.n],
  'Week ' || w.n || ' of the ' || s.name || ' scheme of work for this term.',
  (array['note', 'video', 'document', 'slide'])[w.n]::public.lesson_content_type,
  w.n::smallint,
  w.n,
  (array[35, 40, 45, 50])[w.n]::smallint,
  'published',
  (current_date - 56 + time '08:00') + ((w.n - 1) * interval '7 days')
from public.teacher_assignments ta
join public.subjects s on s.id = ta.subject_id
cross join generate_series(1, 4) as w(n)
where s.code in ('MTH', 'ENG', 'BIO', 'CIV');

-- ═══════════════════════════════════════════════════════════════════════════
--  10 · Assignments
-- ═══════════════════════════════════════════════════════════════════════════
--  Two per class for each of the four core subjects: one already marked, one
--  still open. Publishing these fires the notification fan-out in 0800.

insert into public.assignments (
  id, school_id, class_id, subject_id, academic_session_id, created_by,
  title, description, instructions, assessment_type,
  max_score, weight, status, published_at, due_at, closes_at,
  allow_late, late_penalty_percent
)
select
  ('50000000-0000-4000-8000-' || lpad(to_hex((ta.rn * 2 + n.n - 2)::int), 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  ta.class_id,
  ta.subject_id,
  ta.academic_session_id,
  ta.teacher_id,
  s.name || ' · ' || (array['Continuous Assessment 1', 'Continuous Assessment 2'])[n.n],
  (array[
    'Covers the first three weeks of the scheme of work.',
    'Covers weeks four to six, including the worked examples from class.'
  ])[n.n],
  'Show all working. Submit a single PDF or a clear photograph of your written work.',
  'homework',
  20, 0.15,
  'published',
  -- CA1 was set a month ago and is fully marked; CA2 went out last week and is
  -- still open. The submissions below depend on that: CA2 rows are inserted as
  -- `submitted`, which app.enforce_submission_rules() refuses once closes_at
  -- has passed — so the open window has to be genuinely open.
  (current_date - (case when n.n = 1 then 30 else 9 end) + time '09:00'),
  (current_date + (case when n.n = 1 then -16 else 7 end) + time '23:59'),
  (current_date + (case when n.n = 1 then  -9 else 14 end) + time '23:59'),
  true, 10
from (
  select ta.*, row_number() over (order by ta.class_id, ta.subject_id) as rn
    from public.teacher_assignments ta
    join public.subjects s on s.id = ta.subject_id
   where s.code in ('MTH', 'ENG', 'BIO', 'CIV')
) ta
join public.subjects s on s.id = ta.subject_id
cross join generate_series(1, 2) as n(n);

-- ── Submissions ────────────────────────────────────────────────────────────
--  CA 1 is fully marked. Inserting these as `graded` runs
--  app.sync_grade_from_submission(), so the gradebook fills itself.

insert into public.assignment_submissions (
  school_id, assignment_id, student_id, attempt, content,
  status, submitted_at, score, feedback, graded_by, graded_at
)
select
  '10000000-0000-4000-8000-000000000001'::uuid,
  a.id,
  e.student_id,
  1,
  'Submitted through the student portal.',
  'graded',
  a.due_at - make_interval(hours => 6 + ((e.roll_number * 7) % 60)),
  -- A believable spread: mostly 11–20 out of 20.
  round((11 + ((e.roll_number * 13 + a.seq * 5) % 10))::numeric, 2),
  (array[
    'Good work — watch your presentation.',
    'Well reasoned. Show more of your working next time.',
    'Solid attempt. Revise the second section.',
    'Excellent, keep it up.'
  ])[1 + ((e.roll_number + a.seq) % 4)::int],
  a.created_by,
  a.due_at + interval '3 days'
from (
  select a.*, row_number() over (order by a.id) as seq
    from public.assignments a
   where a.title like '%Continuous Assessment 1'
) a
join public.enrollments e
  on e.class_id = a.class_id
 and e.academic_session_id = a.academic_session_id
 and e.status = 'active'
-- 85% turn-in rate.
where (e.roll_number * 7) % 20 < 17;

--  CA 2 is still open: some students have submitted, the rest have not.
insert into public.assignment_submissions (
  school_id, assignment_id, student_id, attempt, content, status, submitted_at
)
select
  '10000000-0000-4000-8000-000000000001'::uuid,
  a.id,
  e.student_id,
  1,
  'Draft answers uploaded — final version to follow.',
  'submitted',
  now() - make_interval(hours => 2 + ((e.roll_number * 5) % 40))
from public.assignments a
join public.enrollments e
  on e.class_id = a.class_id
 and e.academic_session_id = a.academic_session_id
 and e.status = 'active'
where a.title like '%Continuous Assessment 2'
  and (e.roll_number * 3) % 20 < 9;

-- ═══════════════════════════════════════════════════════════════════════════
--  11 · Quizzes — two per class, five questions each
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.quizzes (
  id, school_id, class_id, subject_id, academic_session_id, created_by,
  title, description, instructions, duration_minutes, passing_percentage,
  weight, max_attempts, status, published_at, opens_at, closes_at,
  show_results_immediately
)
select
  ('60000000-0000-4000-8000-' ||
     lpad(to_hex((row_number() over (order by ta.class_id, s.code))::int), 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  ta.class_id, ta.subject_id, ta.academic_session_id, ta.teacher_id,
  s.name || ' CA — objective test',
  'A short objective test covering the first half of the term.',
  'You have 20 minutes. Once you begin, the timer does not stop.',
  20, 50, 0.1, 1,
  'published',
  (current_date - 14 + time '08:00'),
  (current_date -  7 + time '08:00'),          -- open now
  (current_date + 21 + time '18:00'),
  false
from public.teacher_assignments ta
join public.subjects s on s.id = ta.subject_id
where s.code in ('MTH', 'CIV');

insert into public.quiz_questions (
  school_id, quiz_id, sort_order, question_type, prompt, options, correct_answers,
  points, explanation
)
select
  '10000000-0000-4000-8000-000000000001'::uuid,
  q.id,
  n.n::smallint,
  'multiple_choice',
  'Question ' || n.n || ' — ' || q.title || ': which of the following is correct?',
  jsonb_build_array(
    jsonb_build_object('id', 'a', 'label', 'The first option'),
    jsonb_build_object('id', 'b', 'label', 'The second option'),
    jsonb_build_object('id', 'c', 'label', 'The third option'),
    jsonb_build_object('id', 'd', 'label', 'The fourth option')
  ),
  jsonb_build_array((array['a', 'b', 'c', 'd'])[1 + (n.n % 4)]),
  2,
  'Refer to the week ' || n.n || ' lesson notes.'
from public.quizzes q
cross join generate_series(1, 5) as n(n);

--  Attempts for roughly three quarters of each class. Inserted as `graded`, so
--  app.sync_grade_from_quiz_attempt() writes the gradebook rows.
insert into public.quiz_attempts (
  school_id, quiz_id, student_id, attempt_number, status, responses,
  score, max_score, started_at, submitted_at, graded_at, time_spent_seconds
)
select
  '10000000-0000-4000-8000-000000000001'::uuid,
  q.id,
  e.student_id,
  1,
  'graded',
  '{}'::jsonb,
  (2 * ((e.roll_number * 3) % 6))::numeric,   -- 0–10 in steps of 2
  10,
  (current_date - 6 + time '09:00'),
  (current_date - 6 + time '09:18'),
  (current_date - 6 + time '09:18'),
  1080
from public.quizzes q
join public.enrollments e
  on e.class_id = q.class_id
 and e.academic_session_id = q.academic_session_id
 and e.status = 'active'
where (e.roll_number * 11) % 20 < 15;

-- ═══════════════════════════════════════════════════════════════════════════
--  12 · Attendance — the last ten school days
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.attendance_records (
  school_id, student_id, class_id, academic_session_id,
  taken_on, status, minutes_late, recorded_by
)
select
  '10000000-0000-4000-8000-000000000001'::uuid,
  e.student_id,
  e.class_id,
  e.academic_session_id,
  d.day::date,
  st.status,
  case when st.status = 'late' then (5 + ((e.roll_number * 3) % 20))::smallint else null end,
  c.form_teacher_id
from public.enrollments e
join public.classes c on c.id = e.class_id
cross join lateral (
  -- Ten weekdays ending yesterday.
  select day
    from generate_series(current_date - 20, current_date - 1, interval '1 day') as day
   where extract(isodow from day) <= 5
   order by day desc
   limit 10
) d
cross join lateral (
  select case
           when (e.roll_number * 7 + extract(day from d.day)::int) % 25 = 0 then 'absent'
           when (e.roll_number * 7 + extract(day from d.day)::int) % 13 = 0 then 'late'
           when (e.roll_number * 7 + extract(day from d.day)::int) % 31 = 0 then 'excused'
           else 'present'
         end::public.attendance_status as status
) st
where e.status = 'active'
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
--  13 · Announcements
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.announcements (
  school_id, author_id, academic_session_id, audience, class_id,
  title, body, priority, status, is_pinned, publish_at, expires_at
)
--  Wording stays free of absolute dates: the publish timestamps move with
--  `current_date`, so "Friday 21 February" in the body would contradict a
--  notice posted twelve days ago whenever the seed is re-run.
values
  ('10000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, 'school', null,
   'Mid-term break begins a week on Friday',
   'The school closes for mid-term break after the last period a week on Friday and '
   'reopens the following Monday. Boarding students should be collected before 4:00 PM.',
   'important', 'published', true,
   (current_date - 12 + time '08:00'), (current_date + 18 + time '08:00')),

  ('10000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, 'school', null,
   'Second term PTA meeting this Saturday',
   'All parents and guardians are invited to the second term PTA meeting in the school '
   'hall at 10:00 AM. Subject teachers will be available for consultation from 12:00 noon.',
   'normal', 'published', false,
   (current_date - 8 + time '08:00'), (current_date + 22 + time '08:00')),

  ('10000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, 'school', null,
   'Update your contact details before the end of term',
   'Please confirm that the phone number and address on your profile are current. '
   'End-of-term reports and emergency notices are sent to the details on file.',
   'normal', 'published', false,
   (current_date - 5 + time '08:00'), null),

  ('10000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, 'school', null,
   'Inter-house sports: heats begin Monday',
   'Heats for the 100m, 200m and relay events begin on Monday during the games period. '
   'House captains should submit their final lists to the sports master by Friday.',
   'normal', 'published', false,
   (current_date - 3 + time '08:00'), null),

  ('10000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, 'school', null,
   'Library closed for stock-taking on Wednesday',
   'The library will be closed all day on Wednesday for the annual stock-take. '
   'Borrowed books are due back on Tuesday.',
   'normal', 'published', false,
   (current_date - 2 + time '08:00'), null);

--  Two class-level notices from a form teacher.
insert into public.announcements (
  school_id, author_id, academic_session_id, audience, class_id,
  title, body, priority, status, is_pinned, publish_at
)
select
  '10000000-0000-4000-8000-000000000001'::uuid,
  t.user_id,
  '20000000-0000-4000-8000-000000000002'::uuid,
  'class',
  c.id,
  a.title,
  a.body,
  a.priority::public.announcement_priority,
  'published',
  a.pinned,
  (current_date - 4 + time '07:30')
from public.classes c
join public.teachers t on t.id = c.form_teacher_id
cross join (
  values
    ('Bring your practical notebooks tomorrow',
     'Tomorrow''s double period is a practical session. Anyone without a notebook will '
     'have to observe rather than take part.', 'urgent', true),
    ('Class photograph on Thursday',
     'The class photograph is on Thursday during the second period. Full uniform, please.',
     'normal', false)
) as a(title, body, priority, pinned)
where c.code in ('JSS1A', 'JSS2A', 'SS1A');

-- ═══════════════════════════════════════════════════════════════════════════
--  14 · Summary
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare r record;
begin
  select
    (select count(*) from public.schools)                as schools,
    (select count(*) from public.users)                  as users,
    (select count(*) from public.teachers)               as teachers,
    (select count(*) from public.students)               as students,
    (select count(*) from public.parents)                as parents,
    (select count(*) from public.classes)                as classes,
    (select count(*) from public.subjects)               as subjects,
    (select count(*) from public.class_subjects)         as class_subjects,
    (select count(*) from public.teacher_assignments)    as teacher_assignments,
    (select count(*) from public.enrollments)            as enrollments,
    (select count(*) from public.timetable_slots)        as timetable_slots,
    (select count(*) from public.lessons)                as lessons,
    (select count(*) from public.assignments)            as assignments,
    (select count(*) from public.assignment_submissions) as submissions,
    (select count(*) from public.quizzes)                as quizzes,
    (select count(*) from public.quiz_questions)         as quiz_questions,
    (select count(*) from public.quiz_attempts)          as quiz_attempts,
    (select count(*) from public.grades)                 as grades,
    (select count(*) from public.attendance_records)     as attendance,
    (select count(*) from public.announcements)          as announcements,
    (select count(*) from public.notifications)          as notifications,
    (select count(*) from public.audit_logs)             as audit_logs
  into r;

  raise notice '';
  raise notice '  GNASchools LMS — seed complete';
  raise notice '  ─────────────────────────────────────────────────────────────';
  raise notice '  schools % · users % (teachers % · students % · parents %)',
    r.schools, r.users, r.teachers, r.students, r.parents;
  raise notice '  classes % · subjects % · class_subjects % · teacher_assignments %',
    r.classes, r.subjects, r.class_subjects, r.teacher_assignments;
  raise notice '  enrollments % · timetable_slots % · lessons %',
    r.enrollments, r.timetable_slots, r.lessons;
  raise notice '  assignments % · submissions % · grades %',
    r.assignments, r.submissions, r.grades;
  raise notice '  quizzes % · questions % · attempts %',
    r.quizzes, r.quiz_questions, r.quiz_attempts;
  raise notice '  attendance % · announcements % · notifications % · audit_logs %',
    r.attendance, r.announcements, r.notifications, r.audit_logs;
  raise notice '  ─────────────────────────────────────────────────────────────';
  raise notice '  Sign in with password  Password123!';
  raise notice '    admin@gnaschools.edu.ng     — administrator';
  raise notice '    teacher@gnaschools.edu.ng   — teacher (Emeka Nwosu)';
  raise notice '    student@gnaschools.edu.ng   — student (Chiamaka Balogun, JSS 1 A)';
  raise notice '    parent@gnaschools.edu.ng    — parent  (Ngozi Balogun)';
  raise notice '';
end
$$;

commit;
