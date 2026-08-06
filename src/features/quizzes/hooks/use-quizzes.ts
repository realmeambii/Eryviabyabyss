import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { queryKeys } from '@/shared/lib/query-keys';

import * as api from '../api/quizzes.service';

/**
 * Teacher-side quiz hooks.
 *
 * Question writes invalidate the *quiz* as well as its questions, because
 * `app.recalc_quiz_total_points()` rewrites `quizzes.total_points` from a
 * trigger — a cache holding only the question list would show a paper whose
 * header total disagreed with the questions underneath it.
 */

export function useTeacherQuizzes(filters: api.QuizFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.quizzes.list(filters as Record<string, unknown>),
    queryFn: () => api.listQuizzes(filters),
    enabled,
    staleTime: 60_000,
  });
}

export function useQuiz(quizId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.quizzes.detail(quizId ?? 'none'),
    queryFn: () => api.getQuiz(quizId!),
    enabled: Boolean(quizId),
    staleTime: 60_000,
  });
}

export function useQuizQuestions(quizId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.quizzes.questions(quizId ?? 'none'),
    queryFn: () => api.listQuizQuestions(quizId!),
    enabled: Boolean(quizId),
    staleTime: 60_000,
  });
}

export function useAttemptBoard(args: {
  quizId: string | undefined;
  classId: string | undefined;
  sessionId: string | null;
}) {
  return useQuery({
    queryKey: queryKeys.quizzes.attempts(args.quizId ?? 'none'),
    queryFn: () =>
      api.getAttemptBoard({
        quizId: args.quizId!,
        classId: args.classId!,
        sessionId: args.sessionId!,
      }),
    enabled: Boolean(args.quizId && args.classId && args.sessionId),
    // Pupils sit the paper while the teacher has this open.
    staleTime: 20_000,
  });
}

export function useQuizMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.all });
  };

  const create = useMutation({
    mutationFn: api.createQuiz,
    onSuccess: (quiz) => {
      toast.success(`“${quiz.title}” created. Add questions before publishing.`);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateQuiz>[1] }) =>
      api.updateQuiz(id, patch),
    onSuccess: () => {
      invalidate();
    },
  });

  const publish = useMutation({
    mutationFn: api.publishQuiz,
    onSuccess: (quiz) => {
      toast.success(`“${quiz.title}” published. The class has been notified.`);
      invalidate();
    },
  });

  const unpublish = useMutation({
    mutationFn: (id: string) => api.updateQuiz(id, { status: 'draft' }),
    onSuccess: () => {
      toast.success('Back to a draft. Pupils can no longer see or sit it.');
      invalidate();
    },
  });

  const close = useMutation({
    mutationFn: (id: string) => api.updateQuiz(id, { status: 'closed' }),
    onSuccess: () => {
      toast.success('Closed. No further attempts are accepted.');
      invalidate();
    },
  });

  const duplicate = useMutation({
    mutationFn: ({
      quizId,
      overrides,
    }: {
      quizId: string;
      overrides?: Parameters<typeof api.duplicateQuiz>[1];
    }) => api.duplicateQuiz(quizId, overrides),
    onSuccess: (quiz) => {
      toast.success(`Copied as “${quiz.title}” — a draft, with its window cleared.`);
      invalidate();
    },
  });

  const release = useMutation({
    mutationFn: api.releaseQuizResults,
    onSuccess: () => {
      toast.success('Results released. Pupils can now see their marks.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteQuiz,
    onSuccess: () => {
      toast.success('Quiz deleted.');
      invalidate();
    },
  });

  return { create, update, publish, unpublish, close, duplicate, release, remove };
}

export function useQuestionMutations(quizId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.questions(quizId ?? 'none') });
    // total_points is recalculated by a trigger on every question write.
    void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.detail(quizId ?? 'none') });
  };

  const create = useMutation({
    mutationFn: api.createQuestion,
    onSuccess: () => {
      toast.success('Question added.');
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateQuestion>[1] }) =>
      api.updateQuestion(id, patch),
    onSuccess: () => {
      toast.success('Question saved.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteQuestion,
    onSuccess: () => {
      toast.success('Question removed.');
      invalidate();
    },
  });

  const reorder = useMutation({
    mutationFn: ({
      a,
      b,
    }: {
      a: { id: string; sort_order: number };
      b: { id: string; sort_order: number };
    }) => api.swapQuestionOrder(a, b),
    onSuccess: invalidate,
  });

  const addFromBank = useMutation({
    mutationFn: api.addBankQuestionsToQuiz,
    onSuccess: (_result, variables) => {
      toast.success(
        `${variables.items.length} ${variables.items.length === 1 ? 'question' : 'questions'} copied onto the paper.`,
      );
      invalidate();
    },
  });

  return { create, update, remove, reorder, addFromBank };
}

export function useGradeAttempt(quizId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ attemptId, score }: { attemptId: string; score: number }) =>
      api.gradeAttempt(attemptId, { score }),
    onSuccess: () => {
      toast.success('Mark saved.');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.quizzes.attempts(quizId ?? 'none'),
      });
      // `app.sync_grade_from_quiz_attempt()` writes the gradebook from the
      // same update.
      void queryClient.invalidateQueries({ queryKey: queryKeys.grades.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.teachers.all });
    },
  });
}

// ── Question bank ───────────────────────────────────────────────────────────

export function useQuestionBank(filters: api.QuestionBankFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.questionBank.list(filters as Record<string, unknown>),
    queryFn: () => api.listBankQuestions(filters),
    enabled,
    staleTime: 60_000,
  });
}

export function useQuestionBankMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.questionBank.all });
  };

  const save = useMutation({
    mutationFn: api.saveToBank,
    onSuccess: () => {
      toast.success('Saved to the question bank.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteBankQuestion,
    onSuccess: () => {
      toast.success('Removed from the bank.');
      invalidate();
    },
  });

  return { save, remove };
}
