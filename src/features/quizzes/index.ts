export {
  getQuiz,
  getQuizPaper,
  listMyAttempts,
  listQuizzes,
  startAttempt,
  submitAttempt,
  addBankQuestionsToQuiz,
  createQuestion,
  createQuiz,
  deleteBankQuestion,
  deleteQuestion,
  deleteQuiz,
  duplicateQuiz,
  getAttemptBoard,
  gradeAttempt,
  listBankQuestions,
  listQuizQuestions,
  publishQuiz,
  releaseQuizResults,
  saveToBank,
  swapQuestionOrder,
  updateQuestion,
  updateQuiz,
  type AttemptRow,
  type QuestionBankFilters,
  type QuizFilters,
} from './api/quizzes.service';

export {
  useAttemptBoard,
  useGradeAttempt,
  useQuestionBank,
  useQuestionBankMutations,
  useQuestionMutations,
  useQuiz,
  useQuizMutations,
  useQuizQuestions,
  useTeacherQuizzes,
} from './hooks/use-quizzes';

export {
  AUTO_MARKED,
  QUESTION_TYPES,
  matchingAnswers,
  readAnswers,
  readOptions,
  toStoredShape,
  usesOptions,
  usesTypedAnswers,
  validateQuestion,
  type ChoiceOption,
} from './lib/question-shapes';

export {
  useAnswerDraft,
  useCountdown,
  useMyQuizAttempts,
  useQuizPaper,
  useStartAttempt,
  useSubmitAttempt,
} from './hooks/use-sit-quiz';

export { QuestionPaper } from './components/question-paper';
export { QuestionBankDialog } from './components/question-bank-dialog';
export { QuestionEditorDialog } from './components/question-editor-dialog';
export { QuizEditorDialog } from './components/quiz-editor-dialog';

export { default as QuizzesPage } from './pages/quizzes-page';
export { default as StudentQuizzesPage } from './pages/student-quizzes-page';
export { default as StudentQuizPage } from './pages/student-quiz-page';
export { default as TeacherQuizzesPage } from './pages/teacher-quizzes-page';
export { default as TeacherQuizPage } from './pages/teacher-quiz-page';
