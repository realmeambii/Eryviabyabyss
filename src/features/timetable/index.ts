export {
  byWeekday,
  claimPeriod,
  currentSlot,
  deletePeriod,
  deleteSlot,
  getAvailability,
  getClassTimetable,
  getTeacherTimetable,
  listEligibleTeachers,
  listPeriods,
  placeSlot,
  releaseSlot,
  updateSlot,
  upsertPeriod,
  type AvailabilityCell,
  type SchoolPeriod,
  type TimetableSlotWithContext,
} from './api/timetable.service';

export {
  useAvailability,
  useClaimMutations,
  useClassTimetable,
  useEligibleTeachers,
  usePeriodMutations,
  useSchoolPeriods,
  useTimetableAdmin,
} from './hooks/use-timetable';

export { ClaimPeriodDialog } from './components/claim-period-dialog';
export { SlotEditorDialog } from './components/slot-editor-dialog';
export { TimetableGrid } from './components/timetable-grid';

export { default as TimetablePage } from './pages/timetable-page';
export { default as TeacherTimetablePage } from './pages/teacher-timetable-page';
export { default as AdminTimetablePage } from './pages/admin-timetable-page';
