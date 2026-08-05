-- ═══════════════════════════════════════════════════════════════════════════
--  Two more question types: fill in the blank, and matching
-- ═══════════════════════════════════════════════════════════════════════════
--  Alone in its own migration on purpose. Postgres allows `ALTER TYPE … ADD
--  VALUE` inside a transaction, but it will not let the same transaction *use*
--  the value it just added — and the CHECK constraint that validates these two
--  shapes has to name them. Each migration file runs in its own transaction, so
--  splitting the pair is the whole fix. The constraint lands in 000500.
--
--  Appending is the only enum edit Postgres supports, so order here is
--  permanent. Both are added at the end rather than beside their conceptual
--  neighbours for that reason.
-- ═══════════════════════════════════════════════════════════════════════════

alter type public.question_type add value if not exists 'fill_blank';
alter type public.question_type add value if not exists 'matching';
