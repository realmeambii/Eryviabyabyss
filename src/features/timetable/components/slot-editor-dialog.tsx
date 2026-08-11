import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';

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
import { WEEKDAYS } from '@/shared/lib/constants';
import { formatTime } from '@/shared/utils/format';
import type { Subject } from '@/shared/types';

import type { SchoolPeriod, TimetableSlotWithContext } from '../api/timetable.service';
import { useEligibleTeachers, useTimetableAdmin } from '../hooks/use-timetable';

/**
 * Place, move or clear one lesson.
 *
 * The teacher list is fed from `teacher_assignments` rather than from every
 * member of staff, so the office cannot timetable a chemistry teacher for a
 * French lesson by slipping in the wrong row of a long list. A subject with
 * nobody assigned to it in this class says so, and the lesson can still be
 * placed unstaffed — a timetable is often built before the staffing is settled,
 * and refusing that would force fake assignments.
 */
export function SlotEditorDialog({
  open,
  onOpenChange,
  classId,
  sessionId,
  day,
  period,
  slot,
  subjects,
  onDelete,
  deleting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  sessionId: string;
  day: number;
  period: SchoolPeriod;
  slot?: TimetableSlotWithContext;
  subjects: Subject[];
  onCleared?: () => void;
  onDelete: (slotId: string) => void;
  deleting: boolean;
}) {
  const { school } = useCurrentUser();
  const { place, update } = useTimetableAdmin(classId);

  const [subjectId, setSubjectId] = useState(slot?.subject_id ?? '');
  const [teacherId, setTeacherId] = useState(slot?.teacher_id ?? '');
  const [room, setRoom] = useState(slot?.room ?? '');

  const eligible = useEligibleTeachers(classId, subjectId || undefined, sessionId);

  useEffect(() => {
    setSubjectId(slot?.subject_id ?? '');
    setTeacherId(slot?.teacher_id ?? '');
    setRoom(slot?.room ?? '');
  }, [slot]);

  // A teacher chosen for the old subject is not necessarily eligible for the
  // new one, and leaving them selected would send a row RLS accepts but the
  // school would not.
  useEffect(() => {
    if (!eligible.data) return;
    setTeacherId((current) =>
      current && eligible.data.some((entry) => entry.id === current) ? current : '',
    );
  }, [eligible.data]);

  const dayLabel = WEEKDAYS[day - 1]?.label ?? 'Day';
  const busy = place.isPending || update.isPending || deleting;
  const isValid = subjectId !== '';

  const save = () => {
    if (!isValid) return;

    if (slot) {
      update.mutate(
        {
          id: slot.id,
          patch: {
            subject_id: subjectId,
            teacher_id: teacherId || null,
            room: room.trim() || null,
          },
        },
        {
          onSuccess: () => {
            onOpenChange(false);
          },
        },
      );
      return;
    }

    place.mutate(
      {
        school_id: school!.id,
        class_id: classId,
        subject_id: subjectId,
        teacher_id: teacherId || null,
        academic_session_id: sessionId,
        day_of_week: day,
        starts_at: period.starts_at,
        ends_at: period.ends_at,
        room: room.trim() || null,
        // Placed by the office, so it is not a teacher's to release.
        claimed_by: null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{slot ? 'Edit lesson' : 'Place a lesson'}</DialogTitle>
          <DialogDescription>
            {dayLabel}, {formatTime(period.starts_at)}–{formatTime(period.ends_at)}
            {slot?.claimed_by ? ' · claimed by the teacher' : ''}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="se-subject">Subject</Label>
            <Select
              id="se-subject"
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value);
              }}
              placeholder="Choose a subject"
              options={subjects.map((subject) => ({
                value: subject.id,
                label: `${subject.name} (${subject.code})`,
              }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="se-teacher">Teacher</Label>
            <Select
              id="se-teacher"
              value={teacherId}
              onChange={(event) => {
                setTeacherId(event.target.value);
              }}
              disabled={subjectId === ''}
              placeholder={
                subjectId === ''
                  ? 'Choose a subject first'
                  : eligible.isPending
                    ? 'Loading…'
                    : 'Unstaffed'
              }
              options={(eligible.data ?? []).map((entry) => ({
                value: entry.id,
                label: entry.full_name,
              }))}
            />
            {subjectId !== '' && !eligible.isPending && (eligible.data ?? []).length === 0 ? (
              <p className="text-[12px] text-ink-3">
                Nobody is assigned to teach this subject in this class. You can still place the
                lesson, and assign a teacher on the class page.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="se-room">Room (optional)</Label>
            <Input
              id="se-room"
              value={room}
              onChange={(event) => {
                setRoom(event.target.value);
              }}
              placeholder="Lab 2"
            />
          </div>

          <Alert>
            <AlertDescription>
              A clash is refused by the database, not by this form. If this class or teacher is
              already booked at this hour, the save will come back as a clash — clear the other
              lesson first.
            </AlertDescription>
          </Alert>
        </DialogBody>

        <DialogFooter className="justify-between">
          {slot ? (
            <Button
              variant="ghost"
              className="text-danger"
              loading={deleting}
              onClick={() => {
                onDelete(slot.id);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Clear
            </Button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={save}
              loading={place.isPending || update.isPending}
              disabled={!isValid}
            >
              {slot ? 'Save' : 'Place'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
