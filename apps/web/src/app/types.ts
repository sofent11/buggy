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
export type WorkspaceEntityType = 'project' | 'iteration' | 'requirement' | 'test_case' | 'test_plan' | 'run_item' | 'bug' | 'acceptance_scope';

export type ModuleWorkspaceTab = {
  kind: 'module';
  id: string;
  projectId?: string;
  module: Tab;
  title: string;
  closable: boolean;
};

export type EntityWorkspaceTab = {
  kind: 'entity';
  id: string;
  projectId?: string;
  entityType: WorkspaceEntityType;
  entityId: string;
  module: Tab;
  title: string;
  closable: boolean;
};

export type WorkspaceTab = ModuleWorkspaceTab | EntityWorkspaceTab;

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

export type StringFormValues = Record<string, string | boolean>;

export type MutationOptions = { reloadProjects?: boolean; reloadUsers?: boolean };
export type Mutate = (action: () => Promise<unknown>, message: string, options?: MutationOptions) => Promise<void>;
export type MutateWithResult = <T>(action: () => Promise<T>, resolveMessage: (result: T) => string, options?: MutationOptions) => Promise<void>;

export type TabFilters = Partial<Record<Tab, SavedViewFilters>>;
