import type { Bug, DictionaryValue, Requirement, TestCase, TestCaseStep, TestRunItem, UserProfile, Iteration } from '@buggy/shared-types';
import type { ImportResult } from '../api.js';
import { labelOf } from '../labels.js';
import type { Tab, WorkspaceData, StringFormValues } from './types.js';

export function pageInfo(tab: Tab) {
  const descriptions: Record<Tab, { title: string; description: (project: string) => string }> = {
    overview: { title: '质量工作台', description: (project) => `聚合「${project}」今天最该处理的执行、缺陷和验收事项。` },
    projects: { title: '项目管理', description: () => '维护项目档案、成员和基础信息。' },
    iterations: { title: '迭代管理', description: (project) => `管理「${project}」的迭代周期、目标和状态。` },
    requirements: { title: '需求管理', description: (project) => `沉淀「${project}」的需求条目、负责人和日报同步。` },
    cases: { title: '用例库', description: (project) => `管理「${project}」的测试用例、优先级和执行前置条件。` },
    plans: { title: '测试执行', description: (project) => `组织「${project}」的测试轮次、用例范围和执行结果。` },
    bugs: { title: '缺陷追踪', description: (project) => `筛选、指派和追踪「${project}」中的缺陷。` },
    reports: { title: '验收报表', description: (project) => `维护「${project}」的发布范围、准入判断、风险豁免和签核归档。` },
    users: { title: '用户管理', description: () => '由管理员创建账号、维护系统角色、启用状态和临时密码。' },
    settings: { title: '系统配置', description: (project) => `配置「${project}」的数据字典、Excel 模板和质量策略。` }
  };
  return descriptions[tab];
}

export function filterWorkspaceData(data: WorkspaceData, keyword: string): WorkspaceData {
  const normalized = keyword.trim();
  if (!normalized) return data;
  return {
    ...data,
    iterations: data.iterations.filter((item) => matchKeyword([item.name, item.goal || '', item.status], normalized)),
    requirements: data.requirements.filter((item) =>
      matchKeyword([item.title, item.description || '', item.priority, item.status, item.larkWebhook || ''], normalized)
    ),
    cases: data.cases.filter((item) =>
      matchKeyword([item.title, item.preconditions || '', item.expectedResult || '', item.priority, item.status], normalized)
    ),
    plans: data.plans.filter((item) => matchKeyword([item.name, item.round, item.status], normalized)),
    bugs: data.bugs.filter((item) =>
      matchKeyword([item.title, item.actualResult || '', item.expectedResult || '', item.reproduceSteps || '', item.priority, item.severity, item.status, item.team || '', item.team ? labelOf(item.team) : ''], normalized)
    ),
    acceptanceScopes: data.acceptanceScopes.filter((item) => matchKeyword([item.name, item.description || '', item.status], normalized))
  };
}

export function badgeTone(label: string) {
  if (/(失败|阻塞|重新|废弃|禁用|P0|S0|新建)/.test(label)) return 'tone-danger';
  if (/(处理中|测试中|进行中|未测|P1|S1|规划)/.test(label)) return 'tone-info';
  if (/(通过|完成|解决|验证|关闭|启用|待测试)/.test(label)) return 'tone-success';
  return 'tone-neutral';
}

export function text(form: FormData, key: string) {
  return String(form.get(key) || '').trim();
}

export function formDataFromValues(values: StringFormValues) {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.set(key, value ?? ''));
  return form;
}

export function matchKeyword(values: string[], ...keywords: Array<string | undefined>) {
  const normalized = keywords.map((item) => item?.trim().toLowerCase()).filter(Boolean) as string[];
  if (normalized.length === 0) return true;
  const haystack = values.join(' ').toLowerCase();
  return normalized.every((keyword) => haystack.includes(keyword));
}

export function dateInput(value?: string) {
  return value ? value.slice(0, 10) : '';
}

export function dateRange(startDate?: string, endDate?: string) {
  const start = dateInput(startDate);
  const end = dateInput(endDate);
  if (start && end) return `${start} 至 ${end}`;
  if (start) return `${start} 开始`;
  if (end) return `${end} 结束`;
  return '未设置起止时间';
}

export function iterationName(iterations: Iteration[], id: string) {
  return iterations.find((item) => item.id === id)?.name || '未知迭代';
}

export function requirementTitle(requirements: Requirement[], id: string) {
  return requirements.find((item) => item.id === id)?.title || '未知需求';
}

export function userName(users: UserProfile[], id: string) {
  return users.find((item) => item.id === id)?.username || '未知用户';
}

export function userStatusLabel(status?: string) {
  if (status === 'active') return '启用';
  if (status === 'disabled') return '已禁用';
  return labelOf(status);
}

export function requirementPayload(form: FormData, projectId: string): Partial<Requirement> {
  return {
    projectId,
    iterationId: text(form, 'iterationId') || undefined,
    ownerId: text(form, 'ownerId') || undefined,
    riskOwnerId: text(form, 'riskOwnerId') || undefined,
    dueDate: text(form, 'dueDate') || undefined,
    riskNote: text(form, 'riskNote'),
    title: text(form, 'title'),
    description: text(form, 'description'),
    priority: text(form, 'priority') as never,
    status: text(form, 'status') as never,
    acceptanceStatus: text(form, 'acceptanceStatus') as never,
    reviewerId: text(form, 'reviewerId') || undefined,
    larkWebhook: text(form, 'larkWebhook')
  };
}

export function testCasePayload(form: FormData, projectId: string): Partial<TestCase> {
  const stepsJson = text(form, 'stepsJson');
  return {
    projectId,
    requirementId: text(form, 'requirementId') || undefined,
    title: text(form, 'title'),
    preconditions: text(form, 'preconditions'),
    steps: parseSteps(stepsJson, text(form, 'step'), text(form, 'expected')),
    expectedResult: text(form, 'expectedResult'),
    priority: text(form, 'priority') as never,
    status: text(form, 'status') as never,
    module: text(form, 'module'),
    suiteId: text(form, 'suiteId'),
    version: text(form, 'version') || 'v1',
    reviewStatus: text(form, 'reviewStatus') as never,
    automationStatus: text(form, 'automationStatus') as never,
    ownerId: text(form, 'ownerId') || undefined,
    reviewerId: text(form, 'reviewerId') || undefined,
    changeSummary: text(form, 'changeSummary'),
    baselineVersion: text(form, 'baselineVersion') || undefined,
    tags: text(form, 'tags')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  };
}

export function parseSteps(value: string, fallbackAction = '', fallbackExpected = ''): TestCaseStep[] {
  try {
    const rows = JSON.parse(value || '[]') as TestCaseStep[];
    const parsed = rows
      .map((step, index) => ({
        id: step.id,
        action: String(step.action || '').trim(),
        expected: String(step.expected || '').trim(),
        sort: Number(step.sort || index + 1)
      }))
      .filter((step) => step.action || step.expected);
    if (parsed.length > 0) return parsed;
  } catch {
    // Form data can still come from the legacy single-step fields.
  }
  return fallbackAction || fallbackExpected ? [{ action: fallbackAction, expected: fallbackExpected, sort: 1 }] : [];
}

export function bugPayload(form: FormData, projectId: string): Partial<Bug> {
  const watcherValues = form.getAll('watcherIds').map(String).filter(Boolean);
  return {
    projectId,
    requirementId: text(form, 'requirementId') || undefined,
    testCaseId: text(form, 'testCaseId') || undefined,
    testPlanId: text(form, 'testPlanId') || undefined,
    runItemId: text(form, 'runItemId') || undefined,
    assigneeId: text(form, 'assigneeId') || undefined,
    duplicateOfId: text(form, 'duplicateOfId') || undefined,
    dueAt: text(form, 'dueAt') || undefined,
    title: text(form, 'title'),
    reproduceSteps: text(form, 'reproduceSteps'),
    actualResult: text(form, 'actualResult'),
    expectedResult: text(form, 'expectedResult'),
    severity: text(form, 'severity') as never,
    priority: text(form, 'priority') as never,
    status: text(form, 'status') as never,
    team: text(form, 'team') as never,
    environment: text(form, 'environment'),
    foundVersion: text(form, 'foundVersion'),
    fixVersion: text(form, 'fixVersion'),
    rootCause: text(form, 'rootCause'),
    resolution: text(form, 'resolution'),
    verifyResult: text(form, 'verifyResult'),
    slaLevel: (text(form, 'slaLevel') || undefined) as never,
    triageStatus: text(form, 'triageStatus') as never,
    watcherIds: (watcherValues.length ? watcherValues : text(form, 'watcherIds')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean))
  };
}

export function executionProgress(items: TestRunItem[]) {
  const total = items.length;
  const done = items.filter((item) => item.status !== 'untested').length;
  const passed = items.filter((item) => item.status === 'passed').length;
  return `${done}/${total} 已测 · ${passed} 通过`;
}

export function importMessage(result: ImportResult) {
  if (result.errors.length === 0) return `Excel 导入完成：成功 ${result.imported} 行`;
  const details = result.errors.slice(0, 3).map((error) => `第 ${error.row} 行 ${error.message}`).join('；');
  return `Excel 导入完成：成功 ${result.imported} 行，失败 ${result.errors.length} 行。${details}`;
}

export function rate(done: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((done / total) * 100)}%`;
}

export function shortDate(value?: string) {
  return value ? value.slice(0, 10) : '-';
}

export function formatDictionaryValues(values: DictionaryValue[]) {
  return values.map((item) => `${item.key},${item.label},${item.color || ''},${item.sort},${item.enabled}`).join('\n');
}

export function parseDictionaryValues(input: string): DictionaryValue[] {
  return input
    .split('\n')
    .map((line, index) => {
      const [key, label, color, sort, enabled] = line.split(',').map((item) => item.trim());
      return {
        key,
        label,
        color,
        sort: Number(sort || index * 10),
        enabled: enabled !== 'false'
      };
    })
    .filter((item) => item.key && item.label);
}
