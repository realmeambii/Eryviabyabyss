import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Lock, Undo2 } from 'lucide-react';

import { useTeacherScope } from '@/features/teacher';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
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
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { WEEKDAYS } from '@/shared/lib/constants';
import { cn } from '@/shared/utils/cn';
import { className as formatClassName, formatTime } from '@/shared/utils/format';

import { useAvailability, useClaimMutations } from '../hooks/use-timetable';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Claiming a period
 * ═══════════════════════════════════════════════════════════════════════════
 *  First come, first served, and the database is what decides it. Two teachers
 *  looking at this grid at the same moment both see the same period free; both
 *  can press it; the exclusion constraint on `timetable_slots` lets exactly one
 *  through and the other is told, immediately, that they lost.
 *
 *  So this deliberately does *not* disable a cell it believes is free, and does
 *  not check for a clash before writing. A pre-flight read would be a lie with
 *  a shelf life of milliseconds, and would make the race worse by adding a gap
 *  between the check and the write.
 *
 *  What the grid does show is the three states a teacher cannot work out for
 *  themselves, all of which come from `timetable_availability()`:
 *
 *    · taken   — the class already has a subject in that period
 *    · busy    — *they* are teaching another class at that hour
 *    · mine    — they claimed it, and may give it back
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function ClaimPeriodDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const scope = useTeacherScope();

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [room, setRoom] = useState('');

  const availability = useAvailability(classId || undefined);
  const { claim, release } = useClaimMutations(classId || undefined);

  // Default to the first class they teach so the grid is never blank on open.
  useEffect(() => {
    if (!open) return;
    setClassId((current) => current || (scope.classes[0]?.id ?? ''));
    setRoom('');
  }, [open, scope.classes]);

  /** Only the subjects this teacher takes *in the chosen class*. */
  const subjectsHere = useMemo(() => {
    if (!classId) return [];
    const seen = new Map<string, string>();
    for (const assignment of scope.assignments) {
      if (assignment.class_id !== classId || !assignment.subject) continue;
      seen.set(assignment.subject.id, assignment.subject.name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [scope.assignments, classId]);

  // Reset the subject whenever the class changes — a subject they teach in
  // JSS 2A may not be one they teach in SS 1B, and claiming with a stale value
  // would be refused by RLS with nothing on screen to explain why.
  useEffect(() => {
    setSubjectId(subjectsHere[0]?.id ?? '');
  }, [subjectsHere]);

  const cells = useMemo(() => availability.data ?? [], [availability.data]);

  /** Distinct periods, in bell order — the rows of the grid. */
  const periods = useMemo(() => {
    const seen = new Map<
      number,
      { position: number; startsAt: string; endsAt: string; isBreak: boolean }
    >();
    for (const cell of cells) {
      if (!seen.has(cell.period_position)) {
        seen.set(cell.period_position, {
          position: cell.period_position,
          startsAt: cell.starts_at,
          endsAt: cell.ends_at,
          isBreak: cell.is_break,
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.position - b.position);
  }, [cells]);

  const cellAt = (day: number, position: number) =>
    cells.find((entry) => entry.day_of_week === day && entry.period_position === position);

  const chosenClass = scope.classes.find((entry) => entry.id === classId);
  const busy = claim.isPending || release.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Claim a period</DialogTitle>
          <DialogDescription>
            Pick a free period and it is yours. Periods go to whoever takes them first, so a
            colleague may beat you to one while this is open.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {scope.classes.length === 0 ? (
            <Alert>
              <AlertDescription>
                You have no classes this term, so there is nothing to timetable.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cp-class">Class</Label>
                  <Select
                    id="cp-class"
                    className="w-44"
                    value={classId}
                    onChange={(event) => {
                      setClassId(event.target.value);
                    }}
                    options={scope.classes.map((entry) => ({
                      value: entry.id,
                      label: formatClassName(entry.name, entry.arm),
                    }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cp-subject">Subject</Label>
                  <Select
                    id="cp-subject"
                    className="w-52"
                    value={subjectId}
                    onChange={(event) => {
                      setSubjectId(event.target.value);
                    }}
                    placeholder={subjectsHere.length === 0 ? 'Nothing assigned' : undefined}
                    options={subjectsHere.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                    }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cp-room">Room (optional)</Label>
                  <Input
                    id="cp-room"
                    className="w-32"
                    value={room}
                    onChange={(event) => {
                      setRoom(event.target.value);
                    }}
                    placeholder="Lab 2"
                  />
                </div>
              </div>

              {/* ── Legend ───────────────────────────────────────────────── */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-3">
                <Key className="border-dashed border-border bg-transparent" label="Free" />
                <Key className="border-brand-border bg-brand-soft" label="Yours" />
                <Key className="border-border bg-surface-3" label="Class is busy" />
                <Key
                  className="border-border bg-surface-2 opacity-60"
                  label="You are teaching elsewhere"
                />
              </div>

              {availability.isPending ? (
                <Skeleton className="h-72 w-full" />
              ) : periods.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    The school has no bell schedule set up yet. An administrator needs to define the
                    periods before anything can be claimed.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-1 text-left">
                    <thead>
                      <tr>
                        <th className="w-24 text-[11px] font-bold tracking-wide text-ink-3 uppercase">
                          Period
                        </th>
                        {WEEKDAYS.slice(0, 5).map((day) => (
                          <th
                            key={day.value}
                            className="text-[11px] font-bold tracking-wide text-ink-3 uppercase"
                          >
                            {day.short}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((period) => (
                        <tr key={period.position}>
                          <th className="align-middle">
                            <span className="block font-mono text-[11px] text-ink-3">
                              {formatTime(period.startsAt)}
                            </span>
                            <span className="block text-[11px] text-ink-3">
                              {period.isBreak ? 'Break' : `P${period.position}`}
                            </span>
                          </th>

                          {WEEKDAYS.slice(0, 5).map((day) => {
                            const cell = cellAt(day.value, period.position);

                            if (!cell || cell.is_break) {
                              return (
                                <td key={day.value}>
                                  <div className="h-14 rounded-lg border border-dashed border-border" />
                                </td>
                              );
                            }

                            return (
                              <td key={day.value}>
                                <Cell
                                  cell={cell}
                                  disabled={busy || subjectId === ''}
                                  onClaim={() => {
                                    claim.mutate({
                                      subjectId,
                                      dayOfWeek: cell.day_of_week,
                                      startsAt: cell.starts_at,
                                      endsAt: cell.ends_at,
                                      room: room.trim() || null,
                                    });
                                  }}
                                  onRelease={() => {
                                    if (cell.slot_id) release.mutate(cell.slot_id);
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {subjectsHere.length === 0 && classId ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    You are not assigned to any subject in{' '}
                    {chosenClass
                      ? formatClassName(chosenClass.name, chosenClass.arm)
                      : 'this class'}
                    , so there is nothing you can claim there. The office assigns subjects.
                  </AlertDescription>
                </Alert>
              ) : null}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── One cell ────────────────────────────────────────────────────────────────

function Cell({
  cell,
  disabled,
  onClaim,
  onRelease,
}: {
  cell: {
    taken_subject: string | null;
    taken_by_me: boolean;
    claimed_by_me: boolean;
    teacher_busy: boolean;
  };
  disabled: boolean;
  onClaim: () => void;
  onRelease: () => void;
}) {
  // Mine, and mine to give back.
  if (cell.claimed_by_me) {
    return (
      <button
        type="button"
        onClick={onRelease}
        disabled={disabled}
        className="group h-14 w-full rounded-lg border border-brand-border bg-brand-soft px-2 text-left transition-colors hover:border-danger"
        title="Release this period"
      >
        <span className="block truncate text-[12px] font-semibold text-brand">
          {cell.taken_subject}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-ink-3 group-hover:text-danger">
          <Undo2 className="size-3" aria-hidden />
          Release
        </span>
      </button>
    );
  }

  // Mine, but the office put it there — not mine to remove.
  if (cell.taken_by_me) {
    return (
      <div className="h-14 rounded-lg border border-border bg-surface-3 px-2 py-1.5">
        <span className="block truncate text-[12px] font-semibold text-ink-2">
          {cell.taken_subject}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-ink-3">
          <Lock className="size-3" aria-hidden />
          Timetabled
        </span>
      </div>
    );
  }

  // Somebody else has the class this period.
  if (cell.taken_subject) {
    return (
      <div className="h-14 rounded-lg border border-border bg-surface-3 px-2 py-1.5">
        <span className="block truncate text-[12px] text-ink-3">{cell.taken_subject}</span>
        <span className="text-[11px] text-ink-3">Taken</span>
      </div>
    );
  }

  // Free for the class, but this teacher is somewhere else.
  if (cell.teacher_busy) {
    return (
      <div className="h-14 rounded-lg border border-border bg-surface-2 px-2 py-1.5 opacity-60">
        <span className="text-[11px] text-ink-3">You are teaching elsewhere</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClaim}
      disabled={disabled}
      className={cn(
        'flex h-14 w-full items-center justify-center rounded-lg border border-dashed border-border transition-colors',
        'hover:border-brand-border hover:bg-brand-soft/50',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-transparent',
      )}
    >
      <CalendarPlus className="size-4 text-ink-3" aria-hidden />
      <span className="sr-only">Claim this period</span>
    </button>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-3.5 rounded border', className)} />
      {label}
    </span>
  );
}
