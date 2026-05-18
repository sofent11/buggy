import type {
  Bug,
  AcceptanceScope,
  ActivityLog,
  Dictionary,
  Iteration,
  Notification,
  Project,
  ReportSummary,
  Requirement,
  SavedViewFilters,
  SavedView,
  TestCase,
  TestPlan,
  UserProfile
} from '@buggy/shared-types';

export type Tab = 'overview' | 'projects' | 'iterations' | 'requirements' | 'cases' | 'plans' | 'bugs' | 'reports' | 'users' | 'settings';

export type WorkspaceData = {
  iterations: Iteration[];
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  bugs: Bug[];
  acceptanceScopes: AcceptanceScope[];
  report: ReportSummary | null;
  dictionaries: Dictionary[];
  users: UserProfile[];
  activities: ActivityLog[];
  notifications: Notification[];
  savedViews: SavedView[];
};

export type AuthFormValues = {
  username: string;
  email: string;
  password: string;
};

export type StringFormValues = Record<string, string>;

export type MutationOptions = { reloadProjects?: boolean; reloadUsers?: boolean };
export type Mutate = (action: () => Promise<unknown>, message: string, options?: MutationOptions) => Promise<void>;
export type MutateWithResult = <T>(action: () => Promise<T>, resolveMessage: (result: T) => string, options?: MutationOptions) => Promise<void>;

export type TabFilters = Partial<Record<Tab, SavedViewFilters>>;
