export {
  getRegister,
  listStudentAttendance,
  saveRegister,
  summarise as summariseAttendance,
  type AttendanceRange,
  type AttendanceSummary,
  type RegisterEntry,
} from './api/attendance.service';

export { default as AttendancePage } from './pages/attendance-page';
