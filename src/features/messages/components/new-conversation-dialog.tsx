import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

import { EmptyState } from '@/shared/components/empty-state';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { ROLE_LABEL } from '@/shared/lib/constants';
import { errorMessage } from '@/shared/lib/errors';
import { cn } from '@/shared/utils/cn';
import { isAppRole } from '@/shared/types';

import { useCorrespondents, useMessageMutations } from '../hooks/use-messages';

/**
 * Start a conversation.
 *
 * The recipient list comes from `list_correspondents()`, which walks the school
 * asking `app.may_message()` — the same predicate the participants insert
 * policy enforces. So the picker cannot offer somebody the write would then
 * refuse, and a teacher never sees a pupil they do not teach.
 */
export function NewConversationDialog({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted?: (conversationId: string) => void;
}) {
  const correspondents = useCorrespondents(open);
  const { start } = useMessageMutations();

  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);

  const debounced = useDebouncedValue(search, 200);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setChosen([]);
    setSubject('');
    setBody('');
    setTouched(false);
    start.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const people = useMemo(() => correspondents.data ?? [], [correspondents.data]);

  const filtered = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (term === '') return people;
    return people.filter(
      (person) =>
        person.full_name.toLowerCase().includes(term) || person.role.toLowerCase().includes(term),
    );
  }, [people, debounced]);

  /** Grouped by role, because "who is this person to me" is how you look. */
  const grouped = useMemo(() => {
    const buckets = new Map<string, typeof filtered>();
    for (const person of filtered) {
      const bucket = buckets.get(person.role) ?? [];
      bucket.push(person);
      buckets.set(person.role, bucket);
    }
    return [...buckets.entries()];
  }, [filtered]);

  const selected = people.filter((person) => chosen.includes(person.user_id));
  const isValid = chosen.length > 0 && body.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>
            You can write to the people your role reaches — pupils you teach, their guardians,
            colleagues and the office.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {start.error ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(start.error)}</AlertDescription>
            </Alert>
          ) : null}

          {/* ── Recipients ───────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="nc-search">To</Label>

            {selected.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {selected.map((person) => (
                  <li key={person.user_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setChosen((current) => current.filter((id) => id !== person.user_id));
                      }}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-soft px-2 py-1 text-[12.5px] font-medium text-brand"
                      aria-label={`Remove ${person.full_name}`}
                    >
                      {person.full_name}
                      <X className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
              <Input
                id="nc-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Search by name"
                className="pl-10"
              />
            </div>

            {correspondents.isPending ? (
              <p className="py-4 text-center text-[13px] text-ink-3">Loading…</p>
            ) : people.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Nobody to write to"
                description="You have no classes this term, so there is nobody your role reaches yet."
                className="border-0"
              />
            ) : (
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {grouped.map(([role, members]) => (
                  <div key={role} className="space-y-1">
                    <p className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">
                      {isAppRole(role) ? ROLE_LABEL[role] : role}
                    </p>
                    <ul className="space-y-1">
                      {members.map((person) => {
                        const picked = chosen.includes(person.user_id);
                        return (
                          <li key={person.user_id}>
                            <button
                              type="button"
                              onClick={() => {
                                setChosen((current) =>
                                  picked
                                    ? current.filter((id) => id !== person.user_id)
                                    : [...current, person.user_id],
                                );
                              }}
                              aria-pressed={picked}
                              className={cn(
                                'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                                picked
                                  ? 'border-brand-border bg-brand-soft/40'
                                  : 'border-transparent hover:bg-surface-2',
                              )}
                            >
                              <UserAvatar
                                fullName={person.full_name}
                                avatarPath={person.avatar_path}
                                className="size-7"
                              />
                              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                                {person.full_name}
                              </span>
                              {picked ? <Badge variant="brand">Added</Badge> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-subject">Subject</Label>
            <Input
              id="nc-subject"
              value={subject}
              onChange={(event) => {
                setSubject(event.target.value);
              }}
              placeholder="Optional — helpful once a thread is a few weeks old"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-body">Message</Label>
            <Textarea
              id="nc-body"
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
              }}
              rows={4}
              placeholder="What you want to say"
              aria-invalid={touched && body.trim() === ''}
            />
            {touched && !isValid ? (
              <p className="text-[12.5px] text-danger">
                {chosen.length === 0 ? 'Choose at least one person.' : 'Write a message.'}
              </p>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={start.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={start.isPending}
            onClick={() => {
              setTouched(true);
              if (!isValid) return;

              start.mutate(
                {
                  withUserIds: chosen,
                  subject: subject.trim() || null,
                  firstMessage: body.trim(),
                },
                {
                  onSuccess: (conversation) => {
                    onOpenChange(false);
                    onStarted?.(conversation.id);
                  },
                },
              );
            }}
          >
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
