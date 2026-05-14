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
}

export interface Requirement {
  id: Id;
  projectId: Id;
  iterationId?: Id;
  title: string;
  description?: string;
  ownerId?: Id;
  status: RequirementStatus;
  priority: Priority;
  larkWebhook?: string;
  tags?: string[];
}

export interface TestCaseStep {
  action: string;
  expected: string;
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
}

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
  };
}

export interface PageResult<T> {
  total: number;
  items: T[];
}

export const DEFAULT_DICTIONARIES: Record<string, DictionaryValue[]> = {
  requirementStatus: [
    { key: 'draft', label: '草稿', sort: 10, enabled: true, color: '#64748b' },
    { key: 'ready', label: '待测试', sort: 20, enabled: true, color: '#2563eb' },
    { key: 'testing', label: '测试中', sort: 30, enabled: true, color: '#d97706' },
    { key: 'done', label: '已完成', sort: 40, enabled: true, color: '#16a34a' },
    { key: 'blocked', label: '阻塞', sort: 50, enabled: true, color: '#dc2626' }
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
