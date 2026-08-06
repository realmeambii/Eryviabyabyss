import type { Json, QuestionType } from '@/shared/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  How each question type is stored — the single definition
 * ═══════════════════════════════════════════════════════════════════════════
 *  `quiz_questions` holds `options` and `correct_answers` as untyped jsonb, so
 *  the meaning of those two columns changes with `question_type`. Three places
 *  need to agree on that meaning: the authoring UI, the marker in
 *  `submit_quiz_attempt()`, and the paper a pupil sits.
 *
 *  The marker is in SQL and cannot import this file, so the shapes are written
 *  out here *and* in the migration's comment block, and any change has to land
 *  in both. That duplication is deliberate and is the reason this module exists
 *  at all — one file to read before touching either side, rather than the rules
 *  scattered across a dozen components.
 *
 *    multiple_choice   options [{id,label}] ≥2 · correct_answers exactly one id
 *    multiple_select   options [{id,label}] ≥2 · correct_answers one or more ids
 *    true_false        options fixed true/false · correct_answers one id
 *    short_answer      no options · correct_answers = accepted strings
 *    fill_blank        no options · correct_answers = accepted strings
 *                      (the prompt carries the blank, written as ___)
 *    essay             no options, no key — always marked by a human
 *    matching          options [{id,label,match}] ≥2 · correct_answers
 *                      ["<id>:<match>"] — set equality, all pairs or nothing
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ChoiceOption {
  id: string;
  label: string;
  /** Matching only: the right-hand item this option pairs with. */
  match?: string;
}

export const QUESTION_TYPES: { value: QuestionType; label: string; hint: string }[] = [
  {
    value: 'multiple_choice',
    label: 'Multiple choice',
    hint: 'One correct option from several.',
  },
  {
    value: 'multiple_select',
    label: 'Multiple select',
    hint: 'Several correct options; all must be chosen.',
  },
  { value: 'true_false', label: 'True or false', hint: 'A single statement to judge.' },
  {
    value: 'short_answer',
    label: 'Short answer',
    hint: 'A word or phrase, marked against accepted answers.',
  },
  {
    value: 'fill_blank',
    label: 'Fill in the blank',
    hint: 'Write ___ in the prompt where the blank goes.',
  },
  { value: 'matching', label: 'Matching', hint: 'Pair each item with its partner.' },
  { value: 'essay', label: 'Essay', hint: 'Written at length; you mark it yourself.' },
];

/** Types whose answers the database can mark without a teacher. */
export const AUTO_MARKED: QuestionType[] = [
  'multiple_choice',
  'multiple_select',
  'true_false',
  'short_answer',
  'fill_blank',
  'matching',
];

export function usesOptions(type: QuestionType): boolean {
  return (
    type === 'multiple_choice' ||
    type === 'multiple_select' ||
    type === 'true_false' ||
    type === 'matching'
  );
}

export function usesTypedAnswers(type: QuestionType): boolean {
  return type === 'short_answer' || type === 'fill_blank';
}

export const TRUE_FALSE_OPTIONS: ChoiceOption[] = [
  { id: 'true', label: 'True' },
  { id: 'false', label: 'False' },
];

// ── Reading jsonb back ──────────────────────────────────────────────────────
//  These columns are `Json`, so anything could be in them — a hand-written row,
//  a shape from an older version. Both readers drop what they cannot
//  understand rather than throwing: a malformed question should render as
//  incomplete in the editor, not take down the paper.

export function readOptions(value: Json | null): ChoiceOption[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
    const row = entry as Record<string, Json | undefined>;
    if (typeof row.id !== 'string' || typeof row.label !== 'string') return [];

    return [
      {
        id: row.id,
        label: row.label,
        ...(typeof row.match === 'string' ? { match: row.match } : {}),
      },
    ];
  });
}

export function readAnswers(value: Json | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/** Matching stores its key as "<optionId>:<match>"; the pairs live on options. */
export function matchingAnswers(options: ChoiceOption[]): string[] {
  return options
    .filter((option) => (option.match ?? '').trim() !== '')
    .map((option) => `${option.id}:${(option.match ?? '').trim()}`);
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * The same rules the CHECK constraints enforce, stated where a teacher can be
 * told about them in words. The database is still the authority — this exists
 * so a missing answer key is a sentence in the editor rather than SQLSTATE
 * 23514 in a toast.
 */
export function validateQuestion(input: {
  type: QuestionType;
  prompt: string;
  options: ChoiceOption[];
  answers: string[];
  points: number;
}): string | null {
  if (input.prompt.trim().length === 0) return 'Write the question.';
  if (!Number.isFinite(input.points) || input.points <= 0) return 'Marks must be above zero.';

  if (input.type === 'essay') return null;

  if (usesOptions(input.type)) {
    const filled = input.options.filter((option) => option.label.trim() !== '');
    if (filled.length < 2) return 'Give at least two options.';

    if (input.type === 'matching') {
      const paired = input.options.filter((option) => (option.match ?? '').trim() !== '');
      if (paired.length < 2) return 'Give each item something to match with.';
      return null;
    }

    if (input.answers.length === 0) return 'Mark which option is correct.';
    if (input.type !== 'multiple_select' && input.answers.length > 1) {
      return 'Only one option can be correct for this type.';
    }
    return null;
  }

  // short_answer and fill_blank
  if (input.answers.filter((answer) => answer.trim() !== '').length === 0) {
    return 'Give at least one accepted answer.';
  }

  if (input.type === 'fill_blank' && !input.prompt.includes('___')) {
    return 'Mark the blank in the prompt with three underscores: ___';
  }

  return null;
}

/**
 * The one cast this module needs.
 *
 * `ChoiceOption` is a plain interface with no index signature, so TypeScript
 * will not accept it as `Json` even though it serialises to valid JSON — the
 * structural check wants `{ [key: string]: Json | undefined }`. Widening the
 * interface with an index signature would fix the assignment and lose every
 * typo check on `label` and `match`, which is a bad trade for a type used all
 * over the editor. So the cast lives here, once, with the reason attached.
 */
function optionsAsJson(options: ChoiceOption[]): Json {
  return options as unknown as Json;
}

/** What actually gets written to `options` and `correct_answers`. */
export function toStoredShape(input: {
  type: QuestionType;
  options: ChoiceOption[];
  answers: string[];
}): { options: Json | null; correct_answers: Json | null } {
  if (input.type === 'essay') {
    return { options: null, correct_answers: null };
  }

  if (input.type === 'matching') {
    const pairs = input.options.filter(
      (option) => option.label.trim() !== '' && (option.match ?? '').trim() !== '',
    );
    return {
      options: optionsAsJson(pairs),
      correct_answers: matchingAnswers(pairs),
    };
  }

  if (usesOptions(input.type)) {
    const filled = input.options.filter((option) => option.label.trim() !== '');
    return {
      options: optionsAsJson(filled),
      // Drop answers pointing at an option that has since been deleted.
      correct_answers: input.answers.filter((id) => filled.some((option) => option.id === id)),
    };
  }

  return {
    options: null,
    correct_answers: input.answers.map((answer) => answer.trim()).filter(Boolean),
  };
}
