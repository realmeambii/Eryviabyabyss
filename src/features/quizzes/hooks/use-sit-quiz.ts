import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useStudentContext } from '@/features/student';
import { queryKeys } from '@/shared/lib/query-keys';
import type { QuizResponses } from '@/shared/types';

import { getQuizPaper, listMyAttempts, startAttempt, submitAttempt } from '../api/quizzes.service';

/**
 * Sitting a paper.
 *
 * The deadline is `expires_at`, stamped by `start_quiz_attempt()` from the
 * server clock. Everything here treats it as read-only fact: the countdown is a
 * display of it, and auto-submission is a courtesy. A candidate whose tab
 * crashed still has their paper closed by the marker, which records the attempt
 * as `expired` — the client running out of time is not what makes it late.
 *
 * Answers are held in memory and drafted to sessionStorage, not to the server.
 * There is no endpoint to save a partial attempt: `submit_quiz_attempt()` marks
 * and closes in one call, by design, so that a paper cannot be submitted twice
 * or scored twice. sessionStorage is what survives an accidental refresh.
 */

const draftKey = (attemptId: string) => `gnaschools.quiz-draft.${attemptId}`;

function readDraft(attemptId: string): QuizResponses {
  try {
    const raw = sessionStorage.getItem(draftKey(attemptId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as QuizResponses) : {};
  } catch {
    // A corrupt draft must not stop a pupil sitting the paper.
    return {};
  }
}

export function useQuizPaper(quizId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.quizzes.paper(quizId ?? 'none'),
    queryFn: () => getQuizPaper(quizId!),
    enabled: Boolean(quizId),
    // The paper is shuffled server-side per call, so refetching would reorder
    // the questions under a candidate mid-attempt.
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useMyQuizAttempts(quizId: string | undefined) {
  const { studentId } = useStudentContext();

  return useQuery({
    queryKey: queryKeys.quizzes.myAttempt(quizId ?? 'none'),
    queryFn: () => listMyAttempts(quizId!, studentId!),
    enabled: Boolean(quizId && studentId),
    staleTime: 30_000,
  });
}

export function useStartAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startAttempt,
    onSuccess: (attempt) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.quizzes.myAttempt(attempt.quiz_id),
      });
    },
  });
}

export function useSubmitAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ attemptId, responses }: { attemptId: string; responses: QuizResponses }) =>
      submitAttempt(attemptId, responses),
    onSuccess: (attempt) => {
      sessionStorage.removeItem(draftKey(attempt.id));
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.grades.all });

      toast.success(
        attempt.status === 'graded'
          ? 'Handed in and marked.'
          : 'Handed in. Your teacher marks the written answers.',
      );
    },
  });
}

/**
 * Answers, drafted against a refresh.
 *
 * Written on a debounce rather than every keystroke — sessionStorage is
 * synchronous and writing on each character of an essay stutters the textarea.
 */
export function useAnswerDraft(attemptId: string | undefined) {
  const [responses, setResponses] = useState<QuizResponses>({});
  const loaded = useRef<string | null>(null);

  // Adopt any draft from a previous page load, once per attempt.
  useEffect(() => {
    if (!attemptId || loaded.current === attemptId) return;
    loaded.current = attemptId;
    setResponses(readDraft(attemptId));
  }, [attemptId]);

  useEffect(() => {
    if (!attemptId) return;

    const handle = setTimeout(() => {
      try {
        sessionStorage.setItem(draftKey(attemptId), JSON.stringify(responses));
      } catch {
        // A full or blocked store is not worth interrupting the paper for.
      }
    }, 400);

    return () => {
      clearTimeout(handle);
    };
  }, [attemptId, responses]);

  const answered = useMemo(
    () => Object.values(responses).filter((entry) => entry.length > 0).length,
    [responses],
  );

  const setAnswer = (questionId: string, value: string[]) => {
    setResponses((current) => {
      if (value.length === 0) {
        // Drop the key rather than storing an empty array: the marker treats a
        // missing key and an empty answer identically, and a smaller payload
        // is one less thing to go wrong on a slow connection.
        const { [questionId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [questionId]: value };
    });
  };

  return { responses, setAnswer, answered };
}

/**
 * Seconds left, from a server deadline.
 *
 * Recomputed from `expires_at` on every tick rather than counted down, so a
 * tab that was backgrounded — where timers are throttled — shows the true
 * remaining time when it comes back rather than however many ticks it missed.
 */
export function useCountdown(expiresAt: string | null | undefined): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null);
      return;
    }

    const tick = () => {
      const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(seconds);
    };

    tick();
    const handle = setInterval(tick, 1000);
    return () => {
      clearInterval(handle);
    };
  }, [expiresAt]);

  return remaining;
}
