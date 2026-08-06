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

export { QuestionBankDialog } from './components/question-bank-dialog';
export { QuestionEditorDialog } from './components/question-editor-dialog';
export { QuizEditorDialog } from './components/quiz-editor-dialog';

export { default as QuizzesPage } from './pages/quizzes-page';
export { default as TeacherQuizzesPage } from './pages/teacher-quizzes-page';
export { default as TeacherQuizPage } from './pages/teacher-quiz-page';
