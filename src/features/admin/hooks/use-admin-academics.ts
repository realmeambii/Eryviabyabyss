import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useCurrentUser } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';

import * as classesApi from '../api/classes.service';
import * as sessionsApi from '../api/sessions.service';
import * as subjectsApi from '../api/subjects.service';

/**
 * Admin academic-structure hooks.
 *
 * Every mutation invalidates rather than patching the cache by hand. These
 * lists are small — twenty subjects, ten classes — so a refetch costs one cheap
 * round trip and cannot disagree with what the database actually stored after
 * triggers and constraints have had their say.
 */

// ── Subjects ────────────────────────────────────────────────────────────────

export function useSubjects(options: { includeInactive?: boolean } = {}) {
  const { school } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.subjects.list(school?.id),
    queryFn: () => subjectsApi.listSubjects(options),
    enabled: Boolean(school?.id),
    staleTime: 60_000,
  });
}

export function useSubjectMutations() {
  const queryClient = useQueryClient();
  const { school } = useCurrentUser();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all });
  };

  const create = useMutation({
    mutationFn: (input: Omit<Parameters<typeof subjectsApi.createSubject>[0], 'school_id'>) =>
      subjectsApi.createSubject({ ...input, school_id: school!.id }),
    onSuccess: (subject) => {
      toast.success(`${subject.name} added.`);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof subjectsApi.updateSubject>[1];
    }) => subjectsApi.updateSubject(id, patch),
    onSuccess: (subject) => {
      toast.success(`${subject.name} updated.`);
      invalidate();
    },
  });

  const archive = useMutation({
    mutationFn: subjectsApi.archiveSubject,
    onSuccess: (subject) => {
      toast.success(`${subject.name} archived. It is hidden from pickers but its history is kept.`);
      invalidate();
    },
  });

  const restore = useMutation({
    mutationFn: subjectsApi.restoreSubject,
    onSuccess: (subject) => {
      toast.success(`${subject.name} restored.`);
      invalidate();
    },
  });

  return { create, update, archive, restore };
}

// ── Classes ─────────────────────────────────────────────────────────────────

export function useClasses(sessionId?: string) {
  const { currentSession } = useCurrentUser();
  const effective = sessionId ?? currentSession?.id;

  return useQuery({
    queryKey: queryKeys.classes.list(effective),
    queryFn: () => classesApi.listClasses(effective),
    enabled: Boolean(effective),
    staleTime: 60_000,
  });
}

export function useClassMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.classes.all });
  };

  const create = useMutation({
    mutationFn: classesApi.createClass,
    onSuccess: (row) => {
      toast.success(`${row.name}${row.arm} created.`);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof classesApi.updateClass>[1];
    }) => classesApi.updateClass(id, patch),
    onSuccess: () => {
      toast.success('Class updated.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: classesApi.deleteClass,
    onSuccess: () => {
      toast.success('Class deleted.');
      invalidate();
    },
  });

  const setSubjects = useMutation({
    mutationFn: classesApi.setClassSubjects,
    onSuccess: () => {
      toast.success('Curriculum updated.');
      invalidate();
    },
  });

  return { create, update, remove, setSubjects };
}

// ── Academic sessions ───────────────────────────────────────────────────────

export function useSessions() {
  const { school } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.school.sessions(school?.id ?? 'none'),
    queryFn: sessionsApi.listSessions,
    enabled: Boolean(school?.id),
    staleTime: 60_000,
  });
}

export function useSessionMutations() {
  const queryClient = useQueryClient();
  const { school } = useCurrentUser();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.school.all });
    // The current term is part of the auth bootstrap, so it has to be refreshed
    // too — otherwise the topbar keeps naming the old one.
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.classes.all });
  };

  const create = useMutation({
    mutationFn: sessionsApi.createSession,
    onSuccess: (row) => {
      toast.success(`${row.name} ${row.term} term created. Activate it when the term begins.`);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof sessionsApi.updateSession>[1];
    }) => sessionsApi.updateSession(id, patch),
    onSuccess: () => {
      toast.success('Session updated.');
      invalidate();
    },
  });

  const activate = useMutation({
    mutationFn: (id: string) => sessionsApi.activateSession(id, school!.id),
    onSuccess: (row) => {
      toast.success(`${row.name} ${row.term} term is now the active session.`);
      invalidate();
    },
  });

  return { create, update, activate };
}

// ── Who teaches what ────────────────────────────────────────────────────────

export function useClassTeaching(classId: string | undefined) {
  const { currentSession } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.classes.subjects(classId ?? 'none'),
    queryFn: () => classesApi.listClassTeaching(classId!, currentSession!.id),
    enabled: Boolean(classId && currentSession?.id),
    staleTime: 60_000,
  });
}

export function useAssignableTeachers() {
  const { school } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.teachers.list({ assignable: true, schoolId: school?.id }),
    queryFn: classesApi.listAssignableTeachers,
    enabled: Boolean(school?.id),
    staleTime: 5 * 60_000,
  });
}

export function useTeachingMutations() {
  const queryClient = useQueryClient();
  const { school, currentSession } = useCurrentUser();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.classes.all });
    // A teacher's whole portal is a projection of these rows, so their scope
    // cache has to go too — otherwise the person you just assigned still sees
    // an empty dashboard until it expires.
    void queryClient.invalidateQueries({ queryKey: queryKeys.teachers.all });
  };

  const assign = useMutation({
    mutationFn: (input: {
      teacherId: string;
      classId: string;
      subjectId: string;
      isLead?: boolean;
    }) =>
      classesApi.assignTeacher({
        ...input,
        schoolId: school!.id,
        sessionId: currentSession!.id,
      }),
    onSuccess: () => {
      toast.success('Teacher assigned. They can now set work for this class.');
      invalidate();
    },
  });

  const unassign = useMutation({
    mutationFn: classesApi.unassignTeacher,
    onSuccess: () => {
      toast.success('Assignment removed. Their existing work is kept.');
      invalidate();
    },
  });

  return { assign, unassign };
}
