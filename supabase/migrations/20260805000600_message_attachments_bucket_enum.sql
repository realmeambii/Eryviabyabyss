-- ═══════════════════════════════════════════════════════════════════════════
--  A bucket for message attachments
-- ═══════════════════════════════════════════════════════════════════════════
--  `files.bucket` is a `storage_bucket` enum so a metadata row can never point
--  at a bucket that does not exist. Adding a bucket therefore starts with an
--  enum value — and, as in 000400, the value has to be committed before the
--  next migration can reference it.
-- ═══════════════════════════════════════════════════════════════════════════

alter type public.storage_bucket add value if not exists 'message-attachments';
