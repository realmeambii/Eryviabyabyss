-- ═══════════════════════════════════════════════════════════════════════════
--  0100 · Extensions, schemas and shared trigger helpers
-- ═══════════════════════════════════════════════════════════════════════════
--  Everything in this project follows three rules:
--    1. Extensions live in the `extensions` schema, never in `public`.
--    2. Every SECURITY DEFINER function pins `search_path = ''` and fully
--       qualifies its identifiers, so a caller cannot shadow a table name and
--       trick the function into reading something else.
--    3. Helper functions used by RLS live in the `app` schema, which is NOT
--       exposed through PostgREST — clients can never call them directly.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;
-- btree_gist lets an EXCLUDE constraint mix equality (uuid, smallint) with
-- range overlap (&&) — used to make teacher/class timetable clashes impossible.
create extension if not exists btree_gist with schema extensions;
-- Trigram indexes back the "search people, lessons, assignments" box.
create extension if not exists pg_trgm with schema extensions;

-- ── Internal schema ────────────────────────────────────────────────────────
create schema if not exists app;
comment on schema app is
  'Internal helpers (RLS predicates, triggers). Deliberately not added to the '
  'PostgREST exposed-schema list, so nothing here is reachable from the client.';

revoke all on schema app from public;
grant usage on schema app to authenticated, anon, service_role;

-- ── updated_at ─────────────────────────────────────────────────────────────
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at. Attached to every mutable table.';

-- ── Convenience: attach the updated_at trigger to a table ──────────────────
create or replace function app.attach_updated_at(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text := 'set_updated_at_' || replace(p_table::text, 'public.', '');
begin
  execute format(
    'create trigger %I before update on %s for each row execute function app.set_updated_at()',
    v_name, p_table
  );
end;
$$;

comment on function app.attach_updated_at(regclass) is
  'Idempotent-by-convention helper used by the schema migrations only.';
