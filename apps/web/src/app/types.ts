import type {
  Bug,
  Dictionary,
  Iteration,
  Project,
  ReportSummary,
  Requirement,
  TestCase,
  TestPlan,
  UserProfile
} from '@buggy/shared-types';

export type Tab = 'overview' | 'projects' | 'iterations' | 'requirements' | 'cases' | 'plans' | 'bugs' | 'reports' | 'settings';

export type WorkspaceData = {
  iterations: Iteration[];
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  bugs: Bug[];
  report: ReportSummary | null;
  dictionaries: Dictionary[];
  users: UserProfile[];
};

export type AuthFormValues = {
  username: string;
  email: string;
  password: string;
};

export type StringFormValues = Record<string, string>;

export type Mutate = (action: () => Promise<unknown>, message: string, options?: { reloadProjects?: boolean }) => Promise<void>;
export type MutateWithResult = <T>(action: () => Promise<T>, resolveMessage: (result: T) => string, options?: { reloadProjects?: boolean }) => Promise<void>;
