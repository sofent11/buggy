export type ApiResult<T = unknown> =
  | {
      success: true;
      data: T;
      message?: string;
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
      };
    };

export type SystemRole = 'admin' | 'project_owner' | 'tester' | 'developer' | 'viewer';
export type UserStatus = 'active' | 'disabled';
export type ProjectRole = 'owner' | 'tester' | 'developer' | 'viewer';

export type IterationStatus = 'planning' | 'active' | 'done' | 'archived';
export type RequirementStatus = 'draft' | 'ready' | 'testing' | 'done' | 'blocked';
export type TestCaseStatus = 'draft' | 'ready' | 'deprecated';
export type TestPlanStatus = 'draft' | 'active' | 'done' | 'archived';
export type TestRunStatus = 'untested' | 'passed' | 'failed' | 'blocked' | 'skipped';
export type BugStatus = 'open' | 'in_progress' | 'resolved' | 'verified' | 'closed' | 'reopened';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type Severity = 'S0' | 'S1' | 'S2' | 'S3';

export type Id = string;

export interface UserProfile {
  id: Id;
  username: string;
  email: string;
  role: SystemRole;
  status: UserStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectMember {
  userId: Id;
  username: string;
  email: string;
  role: ProjectRole;
}

export interface Project {
  id: Id;
  name: string;
  code?: string;
  description?: string;
  ownerId: Id;
  members: ProjectMember[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Iteration {
  id: Id;
  projectId: Id;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  status: IterationStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Requirement {
  id: Id;
  projectId: Id;
  iterationId?: Id;
  title: string;
  description?: string;
  ownerId?: Id;
  riskOwnerId?: Id;
  dueDate?: string;
  riskNote?: string;
  status: RequirementStatus;
  priority: Priority;
  larkWebhook?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TestCaseStep {
  id?: Id;
  action: string;
  expected: string;
  sort?: number;
}

export interface TestCase {
  id: Id;
  projectId: Id;
  requirementId?: Id;
  title: string;
  preconditions?: string;
  steps: TestCaseStep[];
  expectedResult?: string;
  priority: Priority;
  status: TestCaseStatus;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TestRunStepResult {
  stepId?: Id;
  status: TestRunStatus;
  actualResult?: string;
}

export interface TestRunItem {
  id: Id;
  caseId: Id;
  caseTitle: string;
  requirementId?: Id;
  steps: TestCaseStep[];
  expectedResult?: string;
  status: TestRunStatus;
  actualResult?: string;
  executorId?: Id;
  executedAt?: string;
  bugIds: Id[];
  stepResults?: TestRunStepResult[];
}

export interface TestPlan {
  id: Id;
  projectId: Id;
  iterationId?: Id;
  requirementId?: Id;
  name: string;
  round: string;
  ownerId?: Id;
  status: TestPlanStatus;
  caseIds: Id[];
  runItems: TestRunItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BugComment {
  id: Id;
  authorId?: Id;
  authorName?: string;
  body: string;
  createdAt: string;
}

export interface BugAttachment {
  id: Id;
  name: string;
  url: string;
  size?: number;
  mimeType?: string;
  uploaderId?: Id;
  uploaderName?: string;
  createdAt: string;
}

export interface BugStatusHistory {
  id: Id;
  fromStatus?: BugStatus;
  toStatus: BugStatus;
  operatorId?: Id;
  operatorName?: string;
  note?: string;
  createdAt: string;
}

export type SavedViewFilters = Record<string, string | number | boolean | string[] | undefined>;

export interface Bug {
  id: Id;
  projectId: Id;
  iterationId?: Id;
  requirementId?: Id;
  testCaseId?: Id;
  testPlanId?: Id;
  runItemId?: Id;
  title: string;
  reproduceSteps?: string;
  expectedResult?: string;
  actualResult?: string;
  severity: Severity;
  priority: Priority;
  status: BugStatus;
  assigneeId?: Id;
  reporterId?: Id;
  duplicateOfId?: Id;
  dueAt?: string;
  resolvedAt?: string;
  verifiedAt?: string;
  comments?: BugComment[];
  attachments?: BugAttachment[];
  statusHistory?: BugStatusHistory[];
  createdAt?: string;
  updatedAt?: string;
}

export type ActivityEntityType = 'project' | 'iteration' | 'requirement' | 'test_case' | 'test_plan' | 'run_item' | 'bug' | 'dictionary' | 'import';
export type ActivityAction = 'created' | 'updated' | 'deleted' | 'status_changed' | 'commented' | 'attached' | 'imported';

export interface ActivityLog {
  id: Id;
  projectId: Id;
  entityType: ActivityEntityType;
  entityId?: Id;
  action: ActivityAction;
  title: string;
  detail?: string;
  actorId?: Id;
  actorName?: string;
  createdAt: string;
}

export type NotificationStatus = 'unread' | 'read';

export interface Notification {
  id: Id;
  projectId?: Id;
  userId: Id;
  title: string;
  body?: string;
  entityType?: ActivityEntityType;
  entityId?: Id;
  status: NotificationStatus;
  createdAt: string;
  readAt?: string;
}

export interface SavedView {
  id: Id;
  projectId: Id;
  userId: Id;
  tab: string;
  name: string;
  filters: SavedViewFilters;
  createdAt?: string;
  updatedAt?: string;
}

export interface UploadAsset {
  id: Id;
  projectId?: Id;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

export interface DictionaryValue {
  key: string;
  label: string;
  color?: string;
  sort: number;
  enabled: boolean;
}

export interface Dictionary {
  id: Id;
  type: string;
  projectId?: Id;
  values: DictionaryValue[];
}

export interface ReportSummary {
  projectId?: Id;
  iterationId?: Id;
  requirementId?: Id;
  testPlanId?: Id;
  scope: {
    type: 'project' | 'iteration' | 'requirement';
    id?: Id;
    name: string;
  };
  requirements: {
    total: number;
    done: number;
    testing: number;
    blocked: number;
  };
  cases: {
    total: number;
    ready: number;
    deprecated: number;
  };
  execution: {
    total: number;
    untested: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    passRate: number;
  };
  bugs: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    verified: number;
    closed: number;
    reopened: number;
    active: number;
    overdue: number;
  };
  charts?: {
    executionTrend: Array<{ label: string; total: number; passed: number; failed: number; blocked: number; skipped: number; passRate: number }>;
    bugStatus: Array<{ key: BugStatus; label: string; value: number }>;
    bugSeverity: Array<{ key: Severity; label: string; value: number }>;
    priority: Array<{ key: Priority; label: string; value: number }>;
    iterationRank: Array<{ id: Id; name: string; requirements: number; cases: number; executionTotal: number; passRate: number; activeBugs: number }>;
    requirementCoverage: Array<{ id: Id; title: string; caseCount: number; bugCount: number; status: RequirementStatus; riskOwnerId?: Id; dueDate?: string; riskNote?: string }>;
    riskList: Array<{ id: Id; type: 'requirement' | 'bug' | 'execution'; title: string; ownerId?: Id; dueDate?: string; reason: string; severity: 'high' | 'medium' | 'low' }>;
  };
  details?: {
    cases: Array<{ id: Id; title: string; requirementId?: Id; priority: Priority; status: TestCaseStatus }>;
    executionItems: Array<{
      id: Id;
      planId: Id;
      planName: string;
      round: string;
      caseId: Id;
      caseTitle: string;
      requirementId?: Id;
      status: TestRunStatus;
      actualResult?: string;
      executorId?: Id;
      executedAt?: string;
      bugIds: Id[];
    }>;
    bugs: Array<{ id: Id; title: string; requirementId?: Id; testPlanId?: Id; runItemId?: Id; severity: Severity; priority: Priority; status: BugStatus; assigneeId?: Id; dueAt?: string }>;
  };
}

export interface ImportPreview {
  headers: string[];
  mappings: Array<{ field: string; label: string; sourceHeader?: string; required?: boolean }>;
  totalRows: number;
  validRows: number;
  duplicateRows: Array<{ row: number; key: string; message: string }>;
  errors: Array<{ row: number; field?: string; message: string }>;
}

export interface PageResult<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export const DEFAULT_DICTIONARIES: Record<string, DictionaryValue[]> = {
  iterationStatus: [
    { key: 'planning', label: '规划中', sort: 10, enabled: true, color: '#64748b' },
    { key: 'active', label: '进行中', sort: 20, enabled: true, color: '#2563eb' },
    { key: 'done', label: '已完成', sort: 30, enabled: true, color: '#16a34a' },
    { key: 'archived', label: '已归档', sort: 40, enabled: true, color: '#475569' }
  ],
  requirementStatus: [
    { key: 'draft', label: '草稿', sort: 10, enabled: true, color: '#64748b' },
    { key: 'ready', label: '待测试', sort: 20, enabled: true, color: '#2563eb' },
    { key: 'testing', label: '测试中', sort: 30, enabled: true, color: '#d97706' },
    { key: 'done', label: '已完成', sort: 40, enabled: true, color: '#16a34a' },
    { key: 'blocked', label: '阻塞', sort: 50, enabled: true, color: '#dc2626' }
  ],
  testCaseStatus: [
    { key: 'draft', label: '草稿', sort: 10, enabled: true, color: '#64748b' },
    { key: 'ready', label: '待测试', sort: 20, enabled: true, color: '#16a34a' },
    { key: 'deprecated', label: '已废弃', sort: 30, enabled: true, color: '#dc2626' }
  ],
  testPlanStatus: [
    { key: 'draft', label: '草稿', sort: 10, enabled: true, color: '#64748b' },
    { key: 'active', label: '进行中', sort: 20, enabled: true, color: '#2563eb' },
    { key: 'done', label: '已完成', sort: 30, enabled: true, color: '#16a34a' },
    { key: 'archived', label: '已归档', sort: 40, enabled: true, color: '#475569' }
  ],
  testRunStatus: [
    { key: 'untested', label: '未测', sort: 10, enabled: true, color: '#64748b' },
    { key: 'passed', label: '通过', sort: 20, enabled: true, color: '#16a34a' },
    { key: 'failed', label: '失败', sort: 30, enabled: true, color: '#dc2626' },
    { key: 'blocked', label: '阻塞', sort: 40, enabled: true, color: '#d97706' },
    { key: 'skipped', label: '跳过', sort: 50, enabled: true, color: '#475569' }
  ],
  bugStatus: [
    { key: 'open', label: '新建', sort: 10, enabled: true, color: '#dc2626' },
    { key: 'in_progress', label: '处理中', sort: 20, enabled: true, color: '#d97706' },
    { key: 'resolved', label: '已解决', sort: 30, enabled: true, color: '#2563eb' },
    { key: 'verified', label: '已验证', sort: 40, enabled: true, color: '#16a34a' },
    { key: 'closed', label: '已关闭', sort: 50, enabled: true, color: '#64748b' },
    { key: 'reopened', label: '重新打开', sort: 60, enabled: true, color: '#7c3aed' }
  ],
  priority: [
    { key: 'P0', label: 'P0', sort: 10, enabled: true, color: '#b91c1c' },
    { key: 'P1', label: 'P1', sort: 20, enabled: true, color: '#dc2626' },
    { key: 'P2', label: 'P2', sort: 30, enabled: true, color: '#d97706' },
    { key: 'P3', label: 'P3', sort: 40, enabled: true, color: '#2563eb' }
  ],
  severity: [
    { key: 'S0', label: 'S0 致命', sort: 10, enabled: true, color: '#b91c1c' },
    { key: 'S1', label: 'S1 严重', sort: 20, enabled: true, color: '#dc2626' },
    { key: 'S2', label: 'S2 一般', sort: 30, enabled: true, color: '#d97706' },
    { key: 'S3', label: 'S3 轻微', sort: 40, enabled: true, color: '#2563eb' }
  ]
};
