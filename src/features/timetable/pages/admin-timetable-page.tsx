import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Plus, Trash2 } from 'lucide-react';

import { useClasses, useSubjects } from '@/features/admin';
import { useCurrentUser } from '@/features/auth';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';

import { className as formatClassName, formatTime } from '@/shared/utils/format';

import type { SchoolPeriod, TimetableSlotWithContext } from '../api/timetable.service';
import { SlotEditorDialog } from '../components/slot-editor-dialog';
import { TimetableGrid } from '../components/timetable-grid';
import {
  useClassTimetable,
  usePeriodMutations,
  useSchoolPeriods,
  useTimetableAdmin,
} from '../hooks/use-timetable';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The office's timetable
 * ═══════════════════════════════════════════════════════════════════════════
 *  Full control, which is the point: an administrator may put any subject in
 *  any period on any day, with or without a teacher, and may move or clear
 *  anything a teacher claimed.
 *
 *  The one thing they cannot do is create a clash — two lessons for one class at
 *  one time, or one teacher in two rooms at once. That is not a policy choice,
 *  it is a pair of exclusion constraints on the table, and it applies to the
 *  office exactly as it applies to a teacher. An administrator who needs to
 *  move a lesson into an occupied slot clears the occupant first, which is the
 *  same order of operations a paper timetable forces.
 *
 *  The bell schedule is edited here too. It is the scaffold the grid is drawn
 *  against and the set of periods a teacher may claim, so it belongs on the same
 *  screen as the thing it shapes rather than buried in settings.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function AdminTimetablePage() {
  const { currentSession } = useCurrentUser();
  const classes = useClasses();
  const subjects = useSubjects();
  const periods = useSchoolPeriods();

  const [classId, setClassId] = useState('');
  const [editing, setEditing] = useState<{
    day: number;
    period: SchoolPeriod;
    slot?: TimetableSlotWithContext;
  } | null>(null);

  const timetable = useClassTimetable(classId || undefined, currentSession?.id);
  const { remove } = useTimetableAdmin(classId || undefined);

  const classList = useMemo(() => classes.data ?? [], [classes.data]);

  useEffect(() => {
    setClassId((current) => current || (classList[0]?.id ?? ''));
  }, [classList]);

  const chosen = classList.find((entry) => entry.id === classId);
  const slots = useMemo(() => timetable.data ?? [], [timetable.data]);
  const periodList = useMemo(() => periods.data ?? [], [periods.data]);

  if (!currentSession) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No current term"
        description="Set a current academic session before building a timetable."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable"
        description={`${currentSession.name} · every class, every period. Clashes are refused by the database, not by this screen.`}
        actions={
          <div className="w-52">
            <Select
              aria-label="Class"
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
              }}
              placeholder={classes.isPending ? 'Loading…' : 'Choose a class'}
              options={classList.map((entry) => ({
                value: entry.id,
                label: formatClassName(entry.name, entry.arm),
              }))}
            />
          </div>
        }
      />

      {periodList.length === 0 && !periods.isPending ? (
        <Alert>
          <AlertDescription>
            No bell schedule yet. Add the school's periods below — teachers can only claim periods
            that exist here, and the grid has no rows without them.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ── The grid ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            {chosen ? formatClassName(chosen.name, chosen.arm) : 'Class'} — weekly timetable
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timetable.isPending || periods.isPending ? (
            <Skeleton className="h-96 w-full" />
          ) : classList.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No classes"
              description="Create a class before timetabling it."
              className="border-0"
            />
          ) : (
            <TimetableGrid
              periods={periodList}
              slots={slots}
              onSelect={(args) => {
                setEditing(args);
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* ── The bell schedule ────────────────────────────────────────────── */}
      <BellSchedule periods={periodList} isPending={periods.isPending} />

      {editing ? (
        <SlotEditorDialog
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          classId={classId}
          sessionId={currentSession.id}
          day={editing.day}
          period={editing.period}
          slot={editing.slot}
          subjects={subjects.data ?? []}
          onCleared={() => {
            setEditing(null);
          }}
          onDelete={(slotId) => {
            remove.mutate(slotId, {
              onSuccess: () => {
                setEditing(null);
              },
            });
          }}
          deleting={remove.isPending}
        />
      ) : null}
    </div>
  );
}

// ── Bell schedule ───────────────────────────────────────────────────────────

function BellSchedule({ periods, isPending }: { periods: SchoolPeriod[]; isPending: boolean }) {
  const { school } = useCurrentUser();
  const { save, remove } = usePeriodMutations();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<SchoolPeriod | null>(null);

  const [draft, setDraft] = useState({ startsAt: '', endsAt: '', label: '', isBreak: false });

  const nextPosition = periods.length === 0 ? 1 : Math.max(...periods.map((p) => p.position)) + 1;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-4 text-ink-3" aria-hidden />
          Bell schedule
        </CardTitle>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setAdding((current) => !current);
          }}
        >
          <Plus className="size-3.5" aria-hidden />
          Add period
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-[12.5px] text-ink-3">
          The periods a teacher may claim. A lesson you place off this grid still stands — the
          schedule shapes the common case, it does not restrict the office.
        </p>

        {adding ? (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-2 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="bp-start">Starts</Label>
              <Input
                id="bp-start"
                type="time"
                className="w-32"
                value={draft.startsAt}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, startsAt: event.target.value }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-end">Ends</Label>
              <Input
                id="bp-end"
                type="time"
                className="w-32"
                value={draft.endsAt}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, endsAt: event.target.value }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-label">Label (optional)</Label>
              <Input
                id="bp-label"
                className="w-40"
                value={draft.label}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, label: event.target.value }));
                }}
                placeholder="Break"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={draft.isBreak}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, isBreak: event.target.checked }));
                }}
                className="size-4 rounded border-border"
              />
              Break
            </label>

            <Button
              size="sm"
              loading={save.isPending}
              disabled={
                draft.startsAt === '' || draft.endsAt === '' || draft.endsAt <= draft.startsAt
              }
              onClick={() => {
                save.mutate(
                  {
                    school_id: school!.id,
                    position: nextPosition,
                    starts_at: draft.startsAt,
                    ends_at: draft.endsAt,
                    label: draft.label.trim() || null,
                    is_break: draft.isBreak,
                  },
                  {
                    onSuccess: () => {
                      setDraft({ startsAt: '', endsAt: '', label: '', isBreak: false });
                      setAdding(false);
                    },
                  },
                );
              }}
            >
              Save
            </Button>
          </div>
        ) : null}

        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : periods.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-ink-3">No periods defined.</p>
        ) : (
          <ul className="divide-y divide-border">
            {periods.map((period) => (
              <li key={period.id} className="flex items-center gap-3 py-2">
                <span className="w-8 text-[12px] font-semibold text-ink-3">
                  {period.is_break ? '—' : `P${period.position}`}
                </span>
                <span className="font-mono text-[13px] text-ink">
                  {formatTime(period.starts_at)} – {formatTime(period.ends_at)}
                </span>
                <span className="flex-1 text-[12.5px] text-ink-3">
                  {period.label ?? (period.is_break ? 'Break' : '')}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove period ${String(period.position)}`}
                  onClick={() => {
                    setRemoving(period);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title="Remove this period?"
        description={
          removing
            ? `${formatTime(removing.starts_at)}–${formatTime(removing.ends_at)} will no longer appear on the grid, and teachers will not be able to claim it. Lessons already timetabled at that time are not deleted — they will show under "outside the bell schedule".`
            : ''
        }
        confirmLabel="Remove"
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (removing) {
            remove.mutate(removing.id, {
              onSuccess: () => {
                setRemoving(null);
              },
            });
          }
        }}
      />
    </Card>
  );
}
