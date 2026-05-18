import type {
  ApiResult,
  AcceptanceScope,
  ActivityLog,
  Bug,
  Dictionary,
  DictionaryValue,
  ImportPreview,
  Iteration,
  Notification,
  PageResult,
  ProjectMember,
  Project,
  ReportSummary,
  Requirement,
  SavedView,
  SavedViewFilters,
  TestCase,
  TestPlan,
  UploadAsset,
  UserProfile
} from '@buggy/shared-types';
import type { BusinessRoleKey, ProjectJoinRequest, ProjectPermission, SystemPermission, UserStatus } from '@buggy/shared-types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
export type ImportResult = { imported: number; errors: Array<{ row: number; message: string }> };
export type ListParams = Record<string, string | number | undefined>;

function queryString(params: ListParams = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

function itemsOf<T>(result: PageResult<T> | T[]): T[] {
  return Array.isArray(result) ? result : result.items;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...init
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new Error(await response.text());
    return (await response.text()) as T;
  }
  const payload = (await response.json()) as ApiResult<T>;
  if (!payload.success) throw new Error(payload.error.message);
  return payload.data;
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData
  });
  const payload = (await response.json()) as ApiResult<T>;
  if (!payload.success) throw new Error(payload.error.message);
  return payload.data;
}

export const api = {
  me: () => request<UserProfile | null>('/auth/me'),
  login: (body: { email: string; password: string }) => request<UserProfile>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: { username: string; email: string; password: string }) =>
    request<UserProfile>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' }),

  projectPage: (params?: ListParams) => request<PageResult<Project>>(`/projects${queryString(params)}`),
  projects: async (params?: ListParams) => itemsOf(await request<PageResult<Project> | Project[]>(`/projects${queryString({ pageSize: 500, ...params })}`)),
  createProject: (body: Partial<Project>) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  updateProject: (id: string, body: Partial<Project>) => request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (id: string) => request<{ deleted: true }>(`/projects/${id}`, { method: 'DELETE' }),
  upsertProjectMember: (projectId: string, body: { userId?: string; email?: string; role?: ProjectMember['role']; projectPermission?: ProjectPermission; businessRoleKey?: BusinessRoleKey }) =>
    request<Project>(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(body) }),
  removeProjectMember: (projectId: string, userId: string) =>
    request<Project>(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
  requestProjectJoin: (projectId: string) =>
    request<ProjectJoinRequest>(`/projects/${projectId}/join-requests`, { method: 'POST' }),
  projectJoinRequests: (projectId: string) =>
    request<ProjectJoinRequest[]>(`/projects/${projectId}/join-requests`),
  approveProjectJoinRequest: (projectId: string, requestId: string, body: { projectPermission: ProjectPermission; businessRoleKey: BusinessRoleKey }) =>
    request<Project>(`/projects/${projectId}/join-requests/${requestId}/approve`, { method: 'POST', body: JSON.stringify(body) }),
  rejectProjectJoinRequest: (projectId: string, requestId: string) =>
    request<ProjectJoinRequest>(`/projects/${projectId}/join-requests/${requestId}/reject`, { method: 'POST' }),

  users: (keyword = '') => request<UserProfile[]>(`/users${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),
  createUser: (body: { username: string; email: string; password: string; systemPermission: SystemPermission; status?: UserStatus }) =>
    request<UserProfile>('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id: string, body: Partial<Pick<UserProfile, 'systemPermission' | 'status'>>) =>
    request<UserProfile>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetUserPassword: (id: string) =>
    request<{ user: UserProfile; temporaryPassword: string }>(`/users/${id}/reset-password`, { method: 'POST' }),

  iterationPage: (projectId: string, params?: ListParams) => request<PageResult<Iteration>>(`/iterations${queryString({ projectId, ...params })}`),
  iterations: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<Iteration> | Iteration[]>(`/iterations${queryString({ projectId, pageSize: 500, ...params })}`)),
  createIteration: (body: Partial<Iteration>) => request<Iteration>('/iterations', { method: 'POST', body: JSON.stringify(body) }),
  updateIteration: (id: string, body: Partial<Iteration>) => request<Iteration>(`/iterations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteIteration: (id: string) => request<{ deleted: true }>(`/iterations/${id}`, { method: 'DELETE' }),

  requirementPage: (projectId: string, params?: ListParams) => request<PageResult<Requirement>>(`/requirements${queryString({ projectId, ...params })}`),
  requirements: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<Requirement> | Requirement[]>(`/requirements${queryString({ projectId, pageSize: 500, ...params })}`)),
  createRequirement: (body: Partial<Requirement>) =>
    request<Requirement>('/requirements', { method: 'POST', body: JSON.stringify(body) }),
  updateRequirement: (id: string, body: Partial<Requirement> & { reportSignoffStatus?: 'pending' | 'signed' | 'rejected'; reportSignoffNote?: string; statusReason?: string; acceptanceReason?: string }) =>
    request<Requirement>(`/requirements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRequirement: (id: string) => request<{ deleted: true }>(`/requirements/${id}`, { method: 'DELETE' }),
  bindLark: (id: string, larkWebhook: string) =>
    request<Requirement>(`/requirements/${id}/lark`, { method: 'PATCH', body: JSON.stringify({ larkWebhook }) }),
  sendLark: (id: string) => request<{ sent: boolean }>(`/requirements/${id}/lark/send`, { method: 'POST' }),

  testCasePage: (projectId: string, params?: ListParams) => request<PageResult<TestCase>>(`/test-cases${queryString({ projectId, ...params })}`),
  testCases: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<TestCase> | TestCase[]>(`/test-cases${queryString({ projectId, pageSize: 500, ...params })}`)),
  createTestCase: (body: Partial<TestCase>) => request<TestCase>('/test-cases', { method: 'POST', body: JSON.stringify(body) }),
  updateTestCase: (id: string, body: Partial<TestCase>) => request<TestCase>(`/test-cases/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  restoreTestCaseBaseline: (id: string) => request<TestCase>(`/test-cases/${id}/restore-baseline`, { method: 'POST' }),
  deleteTestCase: (id: string) => request<{ deleted: true }>(`/test-cases/${id}`, { method: 'DELETE' }),

  testPlanPage: (projectId: string, params?: ListParams) => request<PageResult<TestPlan>>(`/test-plans${queryString({ projectId, ...params })}`),
  testPlans: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<TestPlan> | TestPlan[]>(`/test-plans${queryString({ projectId, pageSize: 500, ...params })}`)),
  createTestPlan: (body: Partial<TestPlan>) => request<TestPlan>('/test-plans', { method: 'POST', body: JSON.stringify(body) }),
  updateTestPlan: (id: string, body: Partial<TestPlan>) => request<TestPlan>(`/test-plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTestPlan: (id: string) => request<{ deleted: true }>(`/test-plans/${id}`, { method: 'DELETE' }),
  updateRunItem: (planId: string, runItemId: string, body: { status: string; actualResult?: string; executorId?: string; stepResults?: Array<{ stepId?: string; status: string; actualResult?: string }> }) =>
    request<TestPlan>(`/test-plans/${planId}/run-items/${runItemId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  batchUpdateRunItems: (planId: string, body: { runItemIds: string[]; status: string; actualResult: string }) =>
    request<{ updated: number; plan: TestPlan }>(`/test-plans/${planId}/run-items`, { method: 'PATCH', body: JSON.stringify(body) }),

  bugPage: (projectId: string, params?: ListParams) => request<PageResult<Bug>>(`/bugs${queryString({ projectId, ...params })}`),
  bugs: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<Bug> | Bug[]>(`/bugs${queryString({ projectId, pageSize: 500, ...params })}`)),
  createBug: (body: Partial<Bug>) => request<Bug>('/bugs', { method: 'POST', body: JSON.stringify(body) }),
  updateBug: (id: string, body: Partial<Bug>) => request<Bug>(`/bugs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  transitionBug: (id: string, body: { nextStatus: string; reason: string; assigneeId?: string; dueAt?: string; resolution?: string; verifyResult?: string }) =>
    request<Bug>(`/bugs/${id}/transition`, { method: 'POST', body: JSON.stringify(body) }),
  addBugComment: (id: string, body: string) => request<Bug>(`/bugs/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  addBugAttachment: (id: string, attachment: { name: string; url: string; size?: number; mimeType?: string }) =>
    request<Bug>(`/bugs/${id}/attachments`, { method: 'POST', body: JSON.stringify(attachment) }),
  uploadBugAttachment: (id: string, file: File) => {
    const formData = new FormData();
    formData.set('file', file);
    return upload<Bug>(`/bugs/${id}/attachments/upload`, formData);
  },
  deleteBug: (id: string) => request<{ deleted: true }>(`/bugs/${id}`, { method: 'DELETE' }),
  markDuplicateBug: (id: string, body: { duplicateOfId: string; reason: string }) =>
    request<Bug>(`/bugs/${id}/duplicate`, { method: 'POST', body: JSON.stringify(body) }),
  createBugFromRun: (body: { testPlanId: string; runItemId: string; title: string; actualResult?: string; reproduceSteps?: string; severity?: string; priority?: string; assigneeId?: string; dueAt?: string; environment?: string; foundVersion?: string }) =>
    request<Bug>('/bugs/from-run', { method: 'POST', body: JSON.stringify(body) }),

  acceptanceScopes: async (projectId: string, params?: ListParams) =>
    itemsOf(await request<PageResult<AcceptanceScope> | AcceptanceScope[]>(`/acceptance-scopes${queryString({ projectId, pageSize: 500, ...params })}`)),
  createAcceptanceScope: (body: Partial<AcceptanceScope>) =>
    request<AcceptanceScope>('/acceptance-scopes', { method: 'POST', body: JSON.stringify(body) }),
  updateAcceptanceScope: (id: string, body: Partial<AcceptanceScope>) =>
    request<AcceptanceScope>(`/acceptance-scopes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAcceptanceScope: (id: string) => request<{ deleted: true }>(`/acceptance-scopes/${id}`, { method: 'DELETE' }),
  addScopeWaiver: (id: string, body: { targetType: string; targetId?: string; reason: string; ownerId?: string; expiresAt?: string }) =>
    request<AcceptanceScope>(`/acceptance-scopes/${id}/waivers`, { method: 'POST', body: JSON.stringify(body) }),
  signoffAcceptanceScope: (id: string, body: { status: 'signed' | 'rejected'; note: string }) =>
    request<AcceptanceScope>(`/acceptance-scopes/${id}/signoff`, { method: 'POST', body: JSON.stringify(body) }),

  reportSummary: (params: { projectId: string; iterationId?: string; requirementId?: string; testPlanId?: string; acceptanceScopeId?: string }) =>
    request<ReportSummary>(`/reports/summary${queryString(params)}`),
  activities: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<ActivityLog> | ActivityLog[]>(`/activities${queryString({ projectId, pageSize: 20, ...params })}`)),
  notifications: async (projectId?: string) => itemsOf(await request<PageResult<Notification> | Notification[]>(`/notifications${queryString({ projectId, pageSize: 20 })}`)),
  markNotificationRead: (id: string) => request<Notification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
  savedViews: (projectId: string, tab?: string) => request<SavedView[]>(`/saved-views${queryString({ projectId, tab })}`),
  upsertSavedView: (body: { projectId: string; tab: string; name: string; filters: SavedViewFilters; visibility?: SavedView['visibility']; isDefault?: boolean }) =>
    request<SavedView>('/saved-views', { method: 'POST', body: JSON.stringify(body) }),
  deleteSavedView: (id: string) => request<{ deleted: true }>(`/saved-views/${id}`, { method: 'DELETE' }),
  uploadFile: (projectId: string, file: File) => {
    const formData = new FormData();
    formData.set('file', file);
    return upload<UploadAsset>(`/uploads?projectId=${projectId}`, formData);
  },
  dictionaries: (projectId?: string) => request<Dictionary[]>(`/dictionaries${projectId ? `?projectId=${projectId}` : ''}`),
  upsertDictionary: (body: { type: string; projectId?: string; values: DictionaryValue[] }) =>
    request<Dictionary>('/dictionaries', { method: 'POST', body: JSON.stringify(body) }),
  importRows: (body: { projectId: string; type: string; rows: Array<Record<string, unknown>> }) =>
    request<ImportResult>('/import-export/import', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  importXlsx: (projectId: string, type: string, file: File) => {
    const formData = new FormData();
    formData.set('file', file);
    return upload<ImportResult>(
      `/import-export/import-xlsx?projectId=${projectId}&type=${type}`,
      formData
    );
  },
  previewImportXlsx: (projectId: string, type: string, file: File) => {
    const formData = new FormData();
    formData.set('file', file);
    return upload<ImportPreview>(
      `/import-export/preview-xlsx?projectId=${projectId}&type=${type}`,
      formData
    );
  }
};

export function downloadUrl(path: string) {
  return `${API_BASE}${path}`;
}
