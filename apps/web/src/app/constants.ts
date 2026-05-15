import type { WorkspaceData } from './types.js';

export const emptyData: WorkspaceData = {
  iterations: [],
  requirements: [],
  cases: [],
  plans: [],
  bugs: [],
  report: null,
  dictionaries: [],
  users: []
};

export const LOGGED_OUT_KEY = 'buggy_logged_out';

export const requirementStatuses = ['draft', 'ready', 'testing', 'done', 'blocked'] as const;
export const iterationStatuses = ['planning', 'active', 'done', 'archived'] as const;
export const caseStatuses = ['draft', 'ready', 'deprecated'] as const;
export const planStatuses = ['draft', 'active', 'done', 'archived'] as const;
export const runStatuses = ['untested', 'passed', 'failed', 'blocked', 'skipped'] as const;
export const bugStatuses = ['open', 'in_progress', 'resolved', 'verified', 'closed', 'reopened'] as const;
export const priorities = ['P0', 'P1', 'P2', 'P3'] as const;
export const severities = ['S0', 'S1', 'S2', 'S3'] as const;
export const systemRoles = ['admin', 'project_owner', 'tester', 'developer', 'viewer'] as const;
export const userStatuses = ['active', 'disabled'] as const;
