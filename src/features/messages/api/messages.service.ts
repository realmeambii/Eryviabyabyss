import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import { createSignedUrl, paths, uploadAndRegister } from '@/shared/services/storage.service';
import type { Conversation, Message, StoredFile } from '@/shared/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Messaging
 * ═══════════════════════════════════════════════════════════════════════════
 *  Membership is the only read key. `app.in_conversation()` is in the USING
 *  clause of every policy on all three tables, so nothing here filters by
 *  participant — a thread you are not in simply does not exist as far as
 *  PostgREST is concerned.
 *
 *  Who may be put *into* a thread is the real access decision, and it is made
 *  once, when the participant row is written. `app.may_message()` gates it
 *  through the same visibility graph the rest of the schema uses: a teacher
 *  reaches the pupils they teach and those pupils' guardians, everyone reaches
 *  the office, and nobody reaches anyone else.
 *
 *  Messages are never hard-deleted. There is no DELETE policy for anyone and
 *  the privilege is revoked from `authenticated` as well — a school has to be
 *  able to answer what a member of staff said to a child. Withdrawing sets
 *  `deleted_at` and the row stays.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ConversationSummary {
  id: string;
  subject: string | null;
  last_message_at: string;
  created_by: string | null;
  participants: {
    user_id: string;
    full_name: string;
    avatar_path: string | null;
    last_read_at: string;
    is_me: boolean;
  }[];
  /** Newest message, for the inbox preview. Null on an empty thread. */
  latest: {
    body: string;
    sender_id: string | null;
    created_at: string;
    deleted_at: string | null;
  } | null;
  unread: number;
}

/**
 * The inbox.
 *
 * Three queries joined in memory rather than one nested select: PostgREST
 * cannot express "the newest message per conversation" as an embed, and
 * fetching every message of every thread to take the last of each would be far
 * worse. Threads are few and the participant list is short, so the join is
 * cheap and the alternative is a database view for one screen.
 */
export async function listConversations(myUserId: string): Promise<ConversationSummary[]> {
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, subject, last_message_at, created_by')
    .order('last_message_at', { ascending: false })
    .limit(100);

  if (error) throw toAppError(error);
  if (conversations.length === 0) return [];

  const ids = conversations.map((row) => row.id);

  const [participants, messages] = await Promise.all([
    supabase
      .from('conversation_participants')
      .select(
        `conversation_id, user_id, last_read_at,
         user:users!conversation_participants_user_id_fkey (full_name, avatar_path)`,
      )
      .in('conversation_id', ids),

    supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at, deleted_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false }),
  ]);

  if (participants.error) throw toAppError(participants.error);
  if (messages.error) throw toAppError(messages.error);

  const participantRows = participants.data as unknown as {
    conversation_id: string;
    user_id: string;
    last_read_at: string;
    user: { full_name: string; avatar_path: string | null } | null;
  }[];

  const byConversation = new Map<string, ConversationSummary['participants']>();
  const myWatermark = new Map<string, string>();

  for (const row of participantRows) {
    const bucket = byConversation.get(row.conversation_id) ?? [];
    bucket.push({
      user_id: row.user_id,
      full_name: row.user?.full_name ?? 'Unknown',
      avatar_path: row.user?.avatar_path ?? null,
      last_read_at: row.last_read_at,
      is_me: row.user_id === myUserId,
    });
    byConversation.set(row.conversation_id, bucket);

    if (row.user_id === myUserId) myWatermark.set(row.conversation_id, row.last_read_at);
  }

  const latest = new Map<string, ConversationSummary['latest']>();
  const unread = new Map<string, number>();

  for (const message of messages.data) {
    if (!latest.has(message.conversation_id)) {
      latest.set(message.conversation_id, {
        body: message.body,
        sender_id: message.sender_id,
        created_at: message.created_at,
        deleted_at: message.deleted_at,
      });
    }

    // Unread is a comparison against the watermark, not a per-message flag.
    // My own messages never count: the trigger moves my watermark when I send.
    const watermark = myWatermark.get(message.conversation_id);
    if (
      message.sender_id !== myUserId &&
      watermark &&
      new Date(message.created_at) > new Date(watermark)
    ) {
      unread.set(message.conversation_id, (unread.get(message.conversation_id) ?? 0) + 1);
    }
  }

  return conversations.map((row) => ({
    id: row.id,
    subject: row.subject,
    last_message_at: row.last_message_at,
    created_by: row.created_by,
    participants: byConversation.get(row.id) ?? [],
    latest: latest.get(row.id) ?? null,
    unread: unread.get(row.id) ?? 0,
  }));
}

export type MessageWithSender = Message & {
  sender: { id: string; full_name: string; avatar_path: string | null } | null;
};

export async function listMessages(conversationId: string): Promise<MessageWithSender[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(`*, sender:users!messages_sender_id_fkey (id, full_name, avatar_path)`)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) throw toAppError(error);
  return data;
}

export async function sendMessage(input: {
  conversationId: string;
  schoolId: string;
  senderId: string;
  body: string;
}): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: input.conversationId,
      school_id: input.schoolId,
      sender_id: input.senderId,
      body: input.body,
    })
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/** Withdraw a message. The row survives — see the note at the top. */
export async function withdrawMessage(id: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: '(withdrawn)' })
    .eq('id', id);

  if (error) throw toAppError(error);
}

/**
 * Move my read watermark to now.
 *
 * `app.protect_participant_columns()` restricts an update on this table to
 * `last_read_at` and `is_muted`, and the policy restricts it to my own row, so
 * this cannot mark somebody else as having read something.
 */
export async function markRead(conversationId: string, myUserId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', myUserId);

  if (error) throw toAppError(error);
}

/**
 * Open a thread with somebody.
 *
 * Three writes, in an order that matters: the conversation, then *me*, then
 * them. The participants policy exempts adding yourself from the pairing test
 * but not from the school test — and the check on adding anyone else requires
 * that I am already in the thread. Adding them first would be refused.
 *
 * The id is minted here rather than by the database, because the row cannot be
 * read back at the moment it is written: `conversations_select_participant` is
 * "am I in this thread", and at that instant nobody is. A `RETURNING` clause —
 * which is what `.insert().select()` sends — is evaluated against that policy,
 * so it fails for the author of the thread as surely as for a stranger, and no
 * conversation can ever be opened. Knowing the id up front removes the need to
 * ask for it; the row is read back at the end, once I am a participant.
 *
 * Not idempotent by design. Two people are allowed more than one thread; a
 * "find or create" would silently reopen a conversation about last term's
 * homework when a teacher meant to start one about a trip.
 */
export async function startConversation(input: {
  schoolId: string;
  myUserId: string;
  withUserIds: string[];
  subject: string | null;
  firstMessage: string;
}): Promise<Conversation> {
  const conversationId = crypto.randomUUID();

  const { error: createError } = await supabase.from('conversations').insert({
    id: conversationId,
    school_id: input.schoolId,
    created_by: input.myUserId,
    subject: input.subject,
  });

  if (createError) throw toAppError(createError);

  const { error: meError } = await supabase.from('conversation_participants').insert({
    conversation_id: conversationId,
    user_id: input.myUserId,
    school_id: input.schoolId,
  });

  if (meError) throw toAppError(meError);

  const { error: themError } = await supabase.from('conversation_participants').insert(
    input.withUserIds.map((userId) => ({
      conversation_id: conversationId,
      user_id: userId,
      school_id: input.schoolId,
    })),
  );

  // `app.may_message()` refused one of them. The thread exists but has only me
  // in it, which is useless, so it goes rather than being left as a stub in the
  // inbox. Not a rollback — three statements are not a transaction over
  // PostgREST — but it is the tidiest outcome available from here.
  if (themError) {
    await supabase.from('conversations').delete().eq('id', conversationId);
    throw toAppError(themError);
  }

  await sendMessage({
    conversationId,
    schoolId: input.schoolId,
    senderId: input.myUserId,
    body: input.firstMessage,
  });

  const { data: conversation, error: readError } = await supabase
    .from('conversations')
    .select()
    .eq('id', conversationId)
    .single();

  if (readError) throw toAppError(readError);

  return conversation;
}

// ── Who can I write to ──────────────────────────────────────────────────────

export interface Correspondent {
  user_id: string;
  full_name: string;
  avatar_path: string | null;
  role: string;
}

/**
 * People this caller may open a thread with.
 *
 * Deliberately asks the database rather than reimplementing `app.may_message()`
 * in TypeScript. The RPC below returns exactly the set the insert policy will
 * accept, so the picker cannot offer somebody the write would then refuse.
 */
export async function listCorrespondents(): Promise<Correspondent[]> {
  const { data, error } = await supabase.rpc('list_correspondents');
  if (error) throw toAppError(error);
  return data ?? [];
}

// ── Attachments ─────────────────────────────────────────────────────────────

export type MessageAttachment = Pick<
  StoredFile,
  'id' | 'bucket' | 'path' | 'original_name' | 'mime_type' | 'size_bytes' | 'created_at'
> & { entity_id: string | null };

export async function listConversationAttachments(
  conversationId: string,
): Promise<MessageAttachment[]> {
  const { data, error } = await supabase
    .from('files')
    .select('id, bucket, path, original_name, mime_type, size_bytes, created_at, entity_id')
    .eq('entity_type', 'message')
    .eq('entity_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw toAppError(error);
  return data;
}

/**
 * Attach a file to a thread.
 *
 * Keyed on the conversation, not the message: the upload happens before the
 * message row exists, and the storage policy reads the conversation id out of
 * the path to decide access. Same rule as the tables — membership.
 */
export async function attachToConversation(args: {
  conversationId: string;
  schoolId: string;
  ownerId: string;
  file: File;
}): Promise<void> {
  await uploadAndRegister({
    bucket: 'message-attachments',
    path: paths.messageAttachment(args.schoolId, args.conversationId, args.file.name),
    file: args.file,
    schoolId: args.schoolId,
    ownerId: args.ownerId,
    entityType: 'message',
    entityId: args.conversationId,
    visibility: 'private',
  });
}

export async function messageAttachmentUrl(file: MessageAttachment): Promise<string> {
  return createSignedUrl(file.bucket, file.path);
}
