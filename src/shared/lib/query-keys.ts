/**
 * Query-key factory.
 *
 * One place that owns every cache key. Invalidating "everything about
 * assignments for class X" is then `queryKeys.assignments.byClass(x)` rather
 * than an array literal repeated in six mutation handlers — and a typo becomes
 * a compile error instead of a cache entry that never invalidates.
 *
 * Keys are hierarchical: `['assignments']` invalidates every assignment query,
 * `['assignments', 'list', filters]` only the matching list.
 */

export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    context: () => [...queryKeys.auth.all, 'context'] as const,
    session: () => [...queryKeys.auth.all, 'session'] as const,
  },

  school: {
    all: ['school'] as const,
    detail: (schoolId: string) => [...queryKeys.school.all, schoolId] as const,
    sessions: (schoolId: string) => [...queryKeys.school.all, schoolId, 'sessions'] as const,
    currentSession: (schoolId: string) =>
      [...queryKeys.school.all, schoolId, 'sessions', 'current'] as const,
  },

  users: {
    all: ['users'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.users.all, 'list', filters ?? {}] as const,
    detail: (userId: string) => [...queryKeys.users.all, 'detail', userId] as const,
  },

  students: {
    all: ['students'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.students.all, 'list', filters ?? {}] as const,
    detail: (studentId: string) => [...queryKeys.students.all, 'detail', studentId] as const,
    byClass: (classId: string) => [...queryKeys.students.all, 'class', classId] as const,
    /** The student's active enrolment for a term — the root of every student screen. */
    enrollment: (studentId: string, sessionId: string) =>
      [...queryKeys.students.all, studentId, 'enrollment', sessionId] as const,
  },

  teachers: {
    all: ['teachers'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.teachers.all, 'list', filters ?? {}] as const,
    detail: (teacherId: string) => [...queryKeys.teachers.all, 'detail', teacherId] as const,
    /**
     * The (class, subject) pairings assigned to a teacher for a term. Every
     * other teacher query is scoped by what this returns, so it gets its own
     * key rather than riding on `list`.
     */
    scope: (teacherId: string, sessionId: string | null) =>
      [...queryKeys.teachers.all, teacherId, 'scope', sessionId] as const,
    workload: (teacherId: string, sessionId: string | null) =>
      [...queryKeys.teachers.all, teacherId, 'workload', sessionId] as const,
    roster: (classId: string, sessionId: string) =>
      [...queryKeys.teachers.all, 'roster', classId, sessionId] as const,
    classStats: (classId: string, sessionId: string) =>
      [...queryKeys.teachers.all, 'class-stats', classId, sessionId] as const,
    markingQueue: (filters?: Record<string, unknown>) =>
      [...queryKeys.teachers.all, 'marking-queue', filters ?? {}] as const,
  },

  parents: {
    all: ['parents'] as const,
    detail: (parentId: string) => [...queryKeys.parents.all, 'detail', parentId] as const,
    children: (parentId: string) => [...queryKeys.parents.all, parentId, 'children'] as const,
  },

  classes: {
    all: ['classes'] as const,
    list: (sessionId?: string) => [...queryKeys.classes.all, 'list', sessionId ?? null] as const,
    detail: (classId: string) => [...queryKeys.classes.all, 'detail', classId] as const,
    subjects: (classId: string) => [...queryKeys.classes.all, classId, 'subjects'] as const,
    roster: (classId: string) => [...queryKeys.classes.all, classId, 'roster'] as const,
  },

  subjects: {
    all: ['subjects'] as const,
    list: (schoolId?: string) => [...queryKeys.subjects.all, 'list', schoolId ?? null] as const,
    detail: (subjectId: string) => [...queryKeys.subjects.all, 'detail', subjectId] as const,
  },

  lessons: {
    all: ['lessons'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.lessons.all, 'list', filters ?? {}] as const,
    byClassSubject: (classId: string, subjectId: string) =>
      [...queryKeys.lessons.all, classId, subjectId] as const,
    detail: (lessonId: string) => [...queryKeys.lessons.all, 'detail', lessonId] as const,
  },

  assignments: {
    all: ['assignments'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.assignments.all, 'list', filters ?? {}] as const,
    detail: (assignmentId: string) =>
      [...queryKeys.assignments.all, 'detail', assignmentId] as const,
    byClass: (classId: string) => [...queryKeys.assignments.all, 'class', classId] as const,
    submissions: (assignmentId: string) =>
      [...queryKeys.assignments.all, assignmentId, 'submissions'] as const,
    mySubmission: (assignmentId: string) =>
      [...queryKeys.assignments.all, assignmentId, 'submission', 'mine'] as const,
  },

  quizzes: {
    all: ['quizzes'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.quizzes.all, 'list', filters ?? {}] as const,
    detail: (quizId: string) => [...queryKeys.quizzes.all, 'detail', quizId] as const,
    paper: (quizId: string) => [...queryKeys.quizzes.all, quizId, 'paper'] as const,
    attempts: (quizId: string) => [...queryKeys.quizzes.all, quizId, 'attempts'] as const,
    myAttempt: (quizId: string) => [...queryKeys.quizzes.all, quizId, 'attempt', 'mine'] as const,
    /** The authoring view — questions *with* their answer key. Teachers only. */
    questions: (quizId: string) => [...queryKeys.quizzes.all, quizId, 'questions'] as const,
  },

  questionBank: {
    all: ['question-bank'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.questionBank.all, 'list', filters ?? {}] as const,
  },

  grades: {
    all: ['grades'] as const,
    forStudent: (studentId: string, sessionId?: string) =>
      [...queryKeys.grades.all, 'student', studentId, sessionId ?? null] as const,
    forClass: (classId: string, subjectId?: string) =>
      [...queryKeys.grades.all, 'class', classId, subjectId ?? null] as const,
  },

  timetable: {
    all: ['timetable'] as const,
    forClass: (classId: string) => [...queryKeys.timetable.all, 'class', classId] as const,
    forTeacher: (teacherId: string) => [...queryKeys.timetable.all, 'teacher', teacherId] as const,
  },

  announcements: {
    all: ['announcements'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.announcements.all, 'list', filters ?? {}] as const,
    detail: (announcementId: string) =>
      [...queryKeys.announcements.all, 'detail', announcementId] as const,
  },

  messages: {
    all: ['messages'] as const,
    conversations: () => [...queryKeys.messages.all, 'conversations'] as const,
    thread: (conversationId: string) =>
      [...queryKeys.messages.all, 'thread', conversationId] as const,
    correspondents: () => [...queryKeys.messages.all, 'correspondents'] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.notifications.all, 'list', filters ?? {}] as const,
    unreadCount: () => [...queryKeys.notifications.all, 'unread-count'] as const,
  },

  files: {
    all: ['files'] as const,
    forEntity: (entityType: string, entityId: string) =>
      [...queryKeys.files.all, entityType, entityId] as const,
    signedUrl: (bucket: string, path: string) =>
      [...queryKeys.files.all, 'signed', bucket, path] as const,
  },

  audit: {
    all: ['audit'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.audit.all, 'list', filters ?? {}] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
