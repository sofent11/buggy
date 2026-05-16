import type {
  ApiResult,
  Bug,
  Dictionary,
  DictionaryValue,
  Iteration,
  PageResult,
  ProjectMember,
  Project,
  ReportSummary,
  Requirement,
  TestCase,
  TestPlan,
  UserProfile
} from '@buggy/shared-types';

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
  upsertProjectMember: (projectId: string, body: { userId?: string; email?: string; role: ProjectMember['role'] }) =>
    request<Project>(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(body) }),
  removeProjectMember: (projectId: string, userId: string) =>
    request<Project>(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),

  users: (keyword = '') => request<UserProfile[]>(`/users${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),
  updateUser: (id: string, body: Partial<Pick<UserProfile, 'role' | 'status'>>) =>
    request<UserProfile>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  iterationPage: (projectId: string, params?: ListParams) => request<PageResult<Iteration>>(`/iterations${queryString({ projectId, ...params })}`),
  iterations: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<Iteration> | Iteration[]>(`/iterations${queryString({ projectId, pageSize: 500, ...params })}`)),
  createIteration: (body: Partial<Iteration>) => request<Iteration>('/iterations', { method: 'POST', body: JSON.stringify(body) }),
  updateIteration: (id: string, body: Partial<Iteration>) => request<Iteration>(`/iterations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteIteration: (id: string) => request<{ deleted: true }>(`/iterations/${id}`, { method: 'DELETE' }),

  requirementPage: (projectId: string, params?: ListParams) => request<PageResult<Requirement>>(`/requirements${queryString({ projectId, ...params })}`),
  requirements: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<Requirement> | Requirement[]>(`/requirements${queryString({ projectId, pageSize: 500, ...params })}`)),
  createRequirement: (body: Partial<Requirement>) =>
    request<Requirement>('/requirements', { method: 'POST', body: JSON.stringify(body) }),
  updateRequirement: (id: string, body: Partial<Requirement>) =>
    request<Requirement>(`/requirements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRequirement: (id: string) => request<{ deleted: true }>(`/requirements/${id}`, { method: 'DELETE' }),
  bindLark: (id: string, larkWebhook: string) =>
    request<Requirement>(`/requirements/${id}/lark`, { method: 'PATCH', body: JSON.stringify({ larkWebhook }) }),
  sendLark: (id: string) => request<{ sent: boolean }>(`/requirements/${id}/lark/send`, { method: 'POST' }),

  testCasePage: (projectId: string, params?: ListParams) => request<PageResult<TestCase>>(`/test-cases${queryString({ projectId, ...params })}`),
  testCases: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<TestCase> | TestCase[]>(`/test-cases${queryString({ projectId, pageSize: 500, ...params })}`)),
  createTestCase: (body: Partial<TestCase>) => request<TestCase>('/test-cases', { method: 'POST', body: JSON.stringify(body) }),
  updateTestCase: (id: string, body: Partial<TestCase>) => request<TestCase>(`/test-cases/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTestCase: (id: string) => request<{ deleted: true }>(`/test-cases/${id}`, { method: 'DELETE' }),

  testPlanPage: (projectId: string, params?: ListParams) => request<PageResult<TestPlan>>(`/test-plans${queryString({ projectId, ...params })}`),
  testPlans: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<TestPlan> | TestPlan[]>(`/test-plans${queryString({ projectId, pageSize: 500, ...params })}`)),
  createTestPlan: (body: Partial<TestPlan>) => request<TestPlan>('/test-plans', { method: 'POST', body: JSON.stringify(body) }),
  updateTestPlan: (id: string, body: Partial<TestPlan>) => request<TestPlan>(`/test-plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTestPlan: (id: string) => request<{ deleted: true }>(`/test-plans/${id}`, { method: 'DELETE' }),
  updateRunItem: (planId: string, runItemId: string, body: { status: string; actualResult?: string }) =>
    request<TestPlan>(`/test-plans/${planId}/run-items/${runItemId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  bugPage: (projectId: string, params?: ListParams) => request<PageResult<Bug>>(`/bugs${queryString({ projectId, ...params })}`),
  bugs: async (projectId: string, params?: ListParams) => itemsOf(await request<PageResult<Bug> | Bug[]>(`/bugs${queryString({ projectId, pageSize: 500, ...params })}`)),
  createBug: (body: Partial<Bug>) => request<Bug>('/bugs', { method: 'POST', body: JSON.stringify(body) }),
  updateBug: (id: string, body: Partial<Bug>) => request<Bug>(`/bugs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteBug: (id: string) => request<{ deleted: true }>(`/bugs/${id}`, { method: 'DELETE' }),
  createBugFromRun: (body: { testPlanId: string; runItemId: string; title: string; actualResult?: string }) =>
    request<Bug>('/bugs/from-run', { method: 'POST', body: JSON.stringify(body) }),

  report: (projectId: string) => request<ReportSummary>(`/reports/summary?projectId=${projectId}`),
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
  }
};

export function downloadUrl(path: string) {
  return `${API_BASE}${path}`;
}
