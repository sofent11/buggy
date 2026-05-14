import type {
  ApiResult,
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

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
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

  projects: () => request<Project[]>('/projects'),
  createProject: (body: Partial<Project>) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),

  iterations: (projectId: string) => request<Iteration[]>(`/iterations?projectId=${projectId}`),
  createIteration: (body: Partial<Iteration>) => request<Iteration>('/iterations', { method: 'POST', body: JSON.stringify(body) }),

  requirements: (projectId: string) => request<Requirement[]>(`/requirements?projectId=${projectId}`),
  createRequirement: (body: Partial<Requirement>) =>
    request<Requirement>('/requirements', { method: 'POST', body: JSON.stringify(body) }),
  bindLark: (id: string, larkWebhook: string) =>
    request<Requirement>(`/requirements/${id}/lark`, { method: 'PATCH', body: JSON.stringify({ larkWebhook }) }),
  sendLark: (id: string) => request<{ sent: boolean }>(`/requirements/${id}/lark/send`, { method: 'POST' }),

  testCases: (projectId: string) => request<TestCase[]>(`/test-cases?projectId=${projectId}`),
  createTestCase: (body: Partial<TestCase>) => request<TestCase>('/test-cases', { method: 'POST', body: JSON.stringify(body) }),

  testPlans: (projectId: string) => request<TestPlan[]>(`/test-plans?projectId=${projectId}`),
  createTestPlan: (body: Partial<TestPlan>) => request<TestPlan>('/test-plans', { method: 'POST', body: JSON.stringify(body) }),
  updateRunItem: (planId: string, runItemId: string, body: { status: string; actualResult?: string }) =>
    request<TestPlan>(`/test-plans/${planId}/run-items/${runItemId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  bugs: (projectId: string) => request<Bug[]>(`/bugs?projectId=${projectId}`),
  createBug: (body: Partial<Bug>) => request<Bug>('/bugs', { method: 'POST', body: JSON.stringify(body) }),
  createBugFromRun: (body: { testPlanId: string; runItemId: string; title: string; actualResult?: string }) =>
    request<Bug>('/bugs/from-run', { method: 'POST', body: JSON.stringify(body) }),

  report: (projectId: string) => request<ReportSummary>(`/reports/summary?projectId=${projectId}`),
  dictionaries: (projectId?: string) => request<Dictionary[]>(`/dictionaries${projectId ? `?projectId=${projectId}` : ''}`),
  importRows: (body: { projectId: string; type: string; rows: Array<Record<string, unknown>> }) =>
    request<{ imported: number; errors: Array<{ row: number; message: string }> }>('/import-export/import', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  importXlsx: (projectId: string, type: string, file: File) => {
    const formData = new FormData();
    formData.set('file', file);
    return upload<{ imported: number; errors: Array<{ row: number; message: string }> }>(
      `/import-export/import-xlsx?projectId=${projectId}&type=${type}`,
      formData
    );
  }
};

export function downloadUrl(path: string) {
  return `${API_BASE}${path}`;
}
