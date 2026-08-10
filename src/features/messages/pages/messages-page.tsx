import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Download,
  MessagesSquare,
  Paperclip,
  Plus,
  Search,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Textarea } from '@/shared/components/ui/textarea';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { UPLOAD_LIMITS } from '@/shared/lib/constants';
import { cn } from '@/shared/utils/cn';
import { formatFileSize, formatRelative, truncate } from '@/shared/utils/format';

import { messageAttachmentUrl, type MessageAttachment } from '../api/messages.service';
import { NewConversationDialog } from '../components/new-conversation-dialog';
import {
  useConversationAttachments,
  useConversations,
  useMessageMutations,
  useMessages,
} from '../hooks/use-messages';

/**
 * The inbox and the open thread, side by side.
 *
 * One route for both, with the open thread in the URL, so a conversation is a
 * link a teacher can send to themselves and a browser back button does what it
 * looks like it does.
 *
 * Read state is a watermark, not a per-message flag — opening a thread moves
 * `last_read_at` to now and everything older stops counting as unread. That is
 * why the unread badge disappears for the whole thread at once rather than
 * message by message.
 */
export default function MessagesPage() {
  const { user } = useCurrentUser();
  const [params, setParams] = useSearchParams();

  const openId = params.get('c') ?? '';
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);
  const debounced = useDebouncedValue(search, 250);

  const conversations = useConversations();
  const rows = useMemo(() => conversations.data ?? [], [conversations.data]);

  const filtered = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (term === '') return rows;

    return rows.filter(
      (row) =>
        (row.subject ?? '').toLowerCase().includes(term) ||
        (row.latest?.body ?? '').toLowerCase().includes(term) ||
        row.participants.some(
          (person) => !person.is_me && person.full_name.toLowerCase().includes(term),
        ),
    );
  }, [rows, debounced]);

  const open = rows.find((row) => row.id === openId) ?? null;

  const openThread = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('c', id);
    setParams(next, { replace: true });
  };

  /** Who the thread is with — everybody but me. */
  const otherPeople = (row: (typeof rows)[number]) =>
    row.participants.filter((person) => !person.is_me);

  const titleFor = (row: (typeof rows)[number]) => {
    if (row.subject) return row.subject;
    const names = otherPeople(row).map((person) => person.full_name);
    // A thread with only me in it is possible if everyone else left it.
    return names.length > 0 ? names.join(', ') : 'Conversation';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Conversations with your school."
        actions={
          <Button
            onClick={() => {
              setComposing(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            New message
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        {/* ── Inbox ────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Search conversations"
              className="pl-10"
              aria-label="Search conversations"
            />
          </div>

          {conversations.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title={debounced ? 'Nothing matches' : 'No conversations'}
              description={
                debounced
                  ? `Nothing matches “${debounced}”.`
                  : 'Start one with a colleague, a pupil you teach, or the office.'
              }
              className="border-0"
            />
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((row) => {
                const people = otherPeople(row);
                const isOpen = row.id === openId;

                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        openThread(row.id);
                      }}
                      aria-current={isOpen ? 'true' : undefined}
                      className={cn(
                        'w-full cursor-pointer rounded-xl border p-3 text-left transition-colors',
                        isOpen
                          ? 'border-brand-border bg-brand-soft/40'
                          : 'border-border hover:bg-surface-2',
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <UserAvatar
                          fullName={people[0]?.full_name ?? '—'}
                          avatarPath={people[0]?.avatar_path}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                'min-w-0 flex-1 truncate text-[13.5px]',
                                row.unread > 0 ? 'font-bold text-ink' : 'font-semibold text-ink',
                              )}
                            >
                              {titleFor(row)}
                            </span>
                            {row.unread > 0 ? <Badge variant="brand">{row.unread}</Badge> : null}
                          </span>
                          <span className="block truncate text-[12px] text-ink-3">
                            {row.latest
                              ? truncate(
                                  row.latest.deleted_at ? 'Message withdrawn' : row.latest.body,
                                  46,
                                )
                              : 'No messages yet'}
                          </span>
                          <span className="block text-[11px] text-ink-3">
                            {formatRelative(row.last_message_at)}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Thread ───────────────────────────────────────────────────── */}
        {open ? (
          <Thread
            conversationId={open.id}
            title={titleFor(open)}
            people={otherPeople(open)}
            myUserId={user.id}
          />
        ) : (
          <Card className="hidden lg:block">
            <CardContent className="grid min-h-[24rem] place-items-center">
              <p className="text-[13px] text-ink-3">Choose a conversation, or start a new one.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <NewConversationDialog
        open={composing}
        onOpenChange={setComposing}
        onStarted={(id) => {
          openThread(id);
        }}
      />
    </div>
  );
}

// ── Thread ──────────────────────────────────────────────────────────────────

function Thread({
  conversationId,
  title,
  people,
  myUserId,
}: {
  conversationId: string;
  title: string;
  people: { user_id: string; full_name: string; avatar_path: string | null }[];
  myUserId: string;
}) {
  const messages = useMessages(conversationId);
  const attachments = useConversationAttachments(conversationId);
  const { send, withdraw, markRead, attach } = useMessageMutations(conversationId);

  const [draft, setDraft] = useState('');
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => messages.data ?? [], [messages.data]);

  // Opening a thread is reading it. Fires once per conversation rather than on
  // every refetch, so a realtime update does not re-stamp the watermark and
  // hide a message that arrived while the reader was scrolled up.
  useEffect(() => {
    markRead.mutate(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Stay pinned to the newest message as it arrives.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [rows.length]);

  const submit = () => {
    const body = draft.trim();
    if (body === '') return;
    send.mutate(body, {
      onSuccess: () => {
        setDraft('');
      },
    });
  };

  const download = async (file: MessageAttachment) => {
    const url = await messageAttachmentUrl(file);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card className="flex max-h-[calc(100dvh-14rem)] min-h-[24rem] flex-col p-0">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-bold text-ink">{title}</p>
          <p className="truncate text-[12px] text-ink-3">
            {people.map((person) => person.full_name).join(', ') || 'Just you'}
          </p>
        </div>
        {(attachments.data ?? []).length > 0 ? (
          <Badge variant="neutral">
            <Paperclip className="size-3" aria-hidden />
            {(attachments.data ?? []).length}
          </Badge>
        ) : null}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-2/3" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-3">No messages yet. Say hello.</p>
        ) : (
          rows.map((message) => {
            const mine = message.sender_id === myUserId;
            const gone = message.deleted_at !== null;

            return (
              <div
                key={message.id}
                className={cn('flex gap-2.5', mine ? 'flex-row-reverse' : 'flex-row')}
              >
                {!mine ? (
                  <UserAvatar
                    fullName={message.sender?.full_name}
                    avatarPath={message.sender?.avatar_path}
                    className="size-7 shrink-0"
                  />
                ) : null}

                <div className={cn('group max-w-[75%] min-w-0', mine && 'text-right')}>
                  <div
                    className={cn(
                      'inline-block rounded-2xl px-3.5 py-2 text-left text-[13.5px] leading-relaxed break-words',
                      gone
                        ? 'bg-surface-3 text-ink-3 italic'
                        : mine
                          ? 'bg-brand text-primary-foreground'
                          : 'bg-surface-3 text-ink',
                    )}
                  >
                    {gone ? 'Message withdrawn' : message.body}
                  </div>

                  <p className="flex items-center gap-1.5 pt-0.5 text-[11px] text-ink-3">
                    {!mine ? <span>{message.sender?.full_name ?? 'Unknown'} ·</span> : null}
                    <span>{formatRelative(message.created_at)}</span>
                    {message.edited_at ? <span>· edited</span> : null}

                    {mine && !gone ? (
                      <button
                        type="button"
                        onClick={() => {
                          setWithdrawing(message.id);
                        }}
                        className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="Withdraw message"
                      >
                        <Trash2 className="size-3" aria-hidden />
                      </button>
                    ) : null}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      {/* Attachments */}
      {(attachments.data ?? []).length > 0 ? (
        <ul className="flex flex-wrap gap-2 border-t border-border px-5 py-2.5">
          {(attachments.data ?? []).map((file) => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => {
                  void download(file);
                }}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] transition-colors hover:bg-surface-2"
              >
                <Download className="size-3 text-ink-3" aria-hidden />
                <span className="max-w-[12rem] truncate text-ink-2">{file.original_name}</span>
                <span className="text-ink-3">{formatFileSize(file.size_bytes)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-border px-5 py-3">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept={UPLOAD_LIMITS['message-attachments'].accept}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) attach.mutate(file);
            event.target.value = '';
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Attach a file"
          loading={attach.isPending}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="size-4" aria-hidden />
        </Button>

        <Textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter makes a new line — the convention
            // everyone already has in their fingers.
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            submit();
          }}
          rows={1}
          placeholder="Write a message"
          aria-label="Write a message"
          className="max-h-32 min-h-9 flex-1 resize-y"
        />

        <Button
          size="icon"
          aria-label="Send"
          disabled={draft.trim() === ''}
          loading={send.isPending}
          onClick={submit}
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </div>

      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(next) => {
          if (!next) setWithdrawing(null);
        }}
        title="Withdraw this message?"
        description="It is replaced with “Message withdrawn” for everyone in the thread. The school still holds a record of what was sent — messages are never permanently deleted."
        confirmLabel="Withdraw"
        destructive
        isPending={withdraw.isPending}
        onConfirm={() => {
          if (!withdrawing) return;
          withdraw.mutate(withdrawing, {
            onSuccess: () => {
              setWithdrawing(null);
            },
          });
        }}
      />
    </Card>
  );
}
