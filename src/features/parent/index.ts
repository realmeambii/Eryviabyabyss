export { ChildSwitcher } from './components/child-switcher';

export {
  getChildDetail,
  getChildQuizzes,
  getChildWork,
  type ChildDetail,
  type ChildQuizRow,
  type ChildWorkRow,
} from './api/parent.service';

export { useChildDetail, useChildQuizzes, useChildWork } from './hooks/use-parent';

export { default as ParentDashboard } from './pages/parent-dashboard';
export { default as ParentChildrenPage } from './pages/parent-children-page';
export { default as ParentAssignmentsPage } from './pages/parent-assignments-page';
export { default as ParentQuizzesPage } from './pages/parent-quizzes-page';
