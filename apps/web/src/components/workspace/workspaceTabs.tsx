import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  Bug as BugIcon,
  CalendarRange,
  ClipboardCheck,
  FileText,
  Flag,
  FolderKanban,
  PlayCircle,
  Save,
  Search,
  Settings,
  Users,
  X
} from 'lucide-react';
import type { Bug, Iteration, Project, Requirement, TestCase, TestPlan, TestRunItem, UserProfile } from '@buggy/shared-types';
import { api } from '../../api.js';
import { iterationStatuses, planStatuses, runStatuses } from '../../app/constants.js';
import type { EntityWorkspaceTab, Tab, WorkspaceData, WorkspaceTab } from '../../app/types.js';
import {
  bugPayload,
  dateInput,
  dateRange,
  executionProgress,
  matchKeyword,
  requirementPayload,
  requirementTitle,
  shortDate,
  testCasePayload,
  text,
  userName
} from '../../app/workspace-utils.js';
import { labelOf } from '../../labels.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { BugFields } from './bugs.js';
import { DataTable, HookForm, Select, StatusBadge } from './common.js';
import { TestCaseFields } from './cases.js';
import { RequirementFields } from './requirements.js';

type Mutate = (action: () => Promise<unknown>, message: string) => Promise<void>;
type OpenEntity = (entityType: string, entityId?: string) => void;

const moduleIcons: Record<Tab, typeof BarChart3> = {
  overview: BarChart3,
  projects: FolderKanban,
  iterations: CalendarRange,
  requirements: Flag,
  cases: ClipboardCheck,
  plans: Activity,
  bugs: BugIcon,
  reports: FileText,
  users: Users,
  settings: Settings
};

export function moduleTabTitle(module: Tab) {
  const titles: Record<Tab, string> = {
    overview: '工作台',
    projects: '项目',
    iterations: '迭代',
    requirements: '需求',
    cases: '用例库',
    plans: '测试执行',
    bugs: '缺陷',
    reports: '报表',
    users: '用户管理',
    settings: '配置'
  };
  return titles[module];
}

export function WorkspaceTabBar(props: {
  tabs: WorkspaceTab[];
  activeId: string;
  projects: Project[];
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}) {
  if (props.tabs.length === 0) return null;
  return (
    <section className="workspace-tabs" aria-label="工作标签">
      <div className="workspace-tab-strip" role="tablist">
        {props.tabs.map((tab) => {
          const Icon = moduleIcons[tab.module];
          const project = tab.projectId ? props.projects.find((item) => item.id === tab.projectId) : undefined;
          return (
            <div key={tab.id} className={props.activeId === tab.id ? 'workspace-tab active' : 'workspace-tab'} role="presentation">
              <button type="button" role="tab" aria-selected={props.activeId === tab.id} onClick={() => props.onActivate(tab.id)}>
                <Icon size={14} />
                <span>{tab.title}</span>
                {tab.kind === 'entity' && <small>{entityTypeText(tab.entityType)}</small>}
                {project && tab.kind === 'entity' && <em>{project.code || project.name}</em>}
              </button>
              {tab.closable && props.tabs.length > 1 && (
                <button type="button" className="workspace-tab-close" aria-label={`关闭 ${tab.title}`} onClick={() => props.onClose(tab.id)}>
                  <X size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function GlobalSearchDialog(props: {
  open: boolean;
  query: string;
  data: WorkspaceData;
  projects: Project[];
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onOpenModule: (module: Tab, projectId?: string) => void;
  onOpenEntity: OpenEntity;
}) {
  const groups = useMemo(() => searchGroups(props.query, props.data, props.projects), [props.query, props.data, props.projects]);
  if (!props.open) return null;
  const hasQuery = props.query.trim().length > 0;
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const openResult = (row: SearchRow) => {
    if (row.type === 'project') props.onOpenModule('overview', row.projectId || row.id);
    else props.onOpenEntity(row.type, row.id);
    props.onClose();
  };
  return (
    <div className="global-search-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <section className="global-search-dialog" role="dialog" aria-modal="true" aria-label="全局搜索">
        <div className="global-search-input-row">
          <Search size={20} />
          <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="搜索项目、迭代、需求、用例、执行项、缺陷" autoFocus />
          <Button type="button" onClick={props.onClose}>关闭</Button>
        </div>
        {!hasQuery ? (
          <div className="search-empty">
            <strong>输入关键词开始定位质量资产</strong>
            <span>搜索结果会按对象分组，点击后直接打开对应工作标签。</span>
          </div>
        ) : total === 0 ? (
          <div className="search-empty">
            <strong>没有匹配结果</strong>
            <span>试试项目代号、需求标题、用例名称或缺陷关键词。</span>
          </div>
        ) : (
          <div className="global-search-results">
            {groups.filter((group) => group.rows.length > 0).map((group) => (
              <section key={group.title}>
                <div className="search-group-title">
                  <span>{group.title}</span>
                  <strong>{group.rows.length}</strong>
                </div>
                {group.rows.map((row) => (
                  <button key={`${row.type}:${row.id}`} type="button" onClick={() => openResult(row)}>
                    <span>{row.title}</span>
                    <small>{row.detail}</small>
                  </button>
                ))}
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function EntityWorkspacePane(props: {
  tab: EntityWorkspaceTab;
  data: WorkspaceData;
  projects: Project[];
  users: UserProfile[];
  canWriteProject?: boolean;
  canManageProject?: boolean;
  canExecute?: boolean;
  canEditBug?: boolean;
  mutate: Mutate;
  onOpenEntity: OpenEntity;
}) {
  const [panel, setPanel] = useState<'overview' | 'edit' | 'history'>('overview');
  useEffect(() => setPanel('overview'), [props.tab.id]);
  const project = props.projects.find((item) => item.id === props.tab.projectId);
  const content = renderEntityContent({ ...props, panel, setPanel, project });
  if (content) return content;
  return (
    <section className="entity-tab-panel">
      <EntityTitle title={props.tab.title} eyebrow="对象详情" project={project} />
      <div className="entity-empty">当前项目数据尚未加载，或该对象已被删除。</div>
    </section>
  );
}

function renderEntityContent(props: Parameters<typeof EntityWorkspacePane>[0] & {
  panel: 'overview' | 'edit' | 'history';
  setPanel: (panel: 'overview' | 'edit' | 'history') => void;
  project?: Project;
}) {
  if (props.tab.entityType === 'iteration') {
    const row = props.data.iterations.find((item) => item.id === props.tab.entityId);
    return row ? <IterationDetail {...props} row={row} /> : null;
  }
  if (props.tab.entityType === 'requirement') {
    const row = props.data.requirements.find((item) => item.id === props.tab.entityId);
    return row ? <RequirementDetail {...props} row={row} /> : null;
  }
  if (props.tab.entityType === 'test_case') {
    const row = props.data.cases.find((item) => item.id === props.tab.entityId);
    return row ? <CaseDetail {...props} row={row} /> : null;
  }
  if (props.tab.entityType === 'test_plan') {
    const row = props.data.plans.find((item) => item.id === props.tab.entityId);
    return row ? <PlanDetail {...props} row={row} /> : null;
  }
  if (props.tab.entityType === 'run_item') {
    const found = findRunItem(props.data.plans, props.tab.entityId);
    return found ? <RunItemDetail {...props} plan={found.plan} row={found.item} /> : null;
  }
  if (props.tab.entityType === 'bug') {
    const row = props.data.bugs.find((item) => item.id === props.tab.entityId);
    return row ? <BugDetail {...props} row={row} /> : null;
  }
  return null;
}

function IterationDetail(props: EntityDetailProps & { row: Iteration }) {
  const requirements = props.data.requirements.filter((item) => item.iterationId === props.row.id);
  const requirementIds = new Set(requirements.map((item) => item.id));
  const cases = props.data.cases.filter((item) => item.requirementId && requirementIds.has(item.requirementId));
  const plans = props.data.plans.filter((item) => item.iterationId === props.row.id);
  const bugs = props.data.bugs.filter((item) => item.iterationId === props.row.id || (item.requirementId && requirementIds.has(item.requirementId)));
  return (
    <EntityShell title={props.row.name} eyebrow="迭代详情" project={props.project} panel={props.panel} onPanel={props.setPanel} historyDisabled>
      {props.panel === 'overview' ? (
        <div className="entity-overview-grid">
          <Metric label="周期" value={dateRange(props.row.startDate, props.row.endDate)} detail={labelOf(props.row.status)} />
          <Metric label="需求" value={requirements.length} detail="当前迭代范围" />
          <Metric label="用例" value={cases.length} detail="按需求覆盖统计" />
          <Metric label="活跃缺陷" value={bugs.filter(isActiveBug).length} detail="未验证或关闭" tone="risk" />
          <RelationTable
            title="迭代需求"
            headers={['需求', '优先级', '状态', '用例', '缺陷']}
            rows={requirements.map((requirement) => ({
              key: requirement.id,
              onOpen: () => props.onOpenEntity('requirement', requirement.id),
              cells: [
                <CellMain title={requirement.title} detail={requirement.description || '未填写描述'} />,
                <StatusBadge value={requirement.priority} dictionaryType="priority" />,
                <StatusBadge value={requirement.status} dictionaryType="requirementStatus" />,
                props.data.cases.filter((item) => item.requirementId === requirement.id).length,
                props.data.bugs.filter((item) => item.requirementId === requirement.id).length
              ]
            }))}
          />
          <RelationTable
            title="测试计划"
            headers={['计划', '轮次', '状态', '执行进度']}
            rows={plans.map((plan) => ({
              key: plan.id,
              onOpen: () => props.onOpenEntity('test_plan', plan.id),
              cells: [plan.name, plan.round, <StatusBadge value={plan.status} dictionaryType="testPlanStatus" />, executionProgress(plan.runItems)]
            }))}
          />
          <RelationTable title="关联缺陷" headers={['缺陷', '严重级别', '状态']} rows={bugRows(bugs, props.onOpenEntity)} />
        </div>
      ) : (
        <HookForm defaultValues={{ name: props.row.name, goal: props.row.goal || '', startDate: dateInput(props.row.startDate), endDate: dateInput(props.row.endDate), status: props.row.status }} onSubmit={async (form) => {
          await props.mutate(() => api.updateIteration(props.row.id, { name: text(form, 'name'), goal: text(form, 'goal'), startDate: text(form, 'startDate') || undefined, endDate: text(form, 'endDate') || undefined, status: text(form, 'status') as never }), '迭代已保存');
          props.setPanel('overview');
        }}>
          {(register) => (
            <div className="entity-edit-form">
              <Field><FieldLabel>迭代名称</FieldLabel><Input {...register('name')} required /></Field>
              <Field><FieldLabel>迭代目标</FieldLabel><Input {...register('goal')} /></Field>
              <Field><FieldLabel>开始日期</FieldLabel><Input {...register('startDate')} type="date" /></Field>
              <Field><FieldLabel>结束日期</FieldLabel><Input {...register('endDate')} type="date" /></Field>
              <Field><FieldLabel>状态</FieldLabel><Select name="status" register={register} values={iterationStatuses} dictionaryType="iterationStatus" defaultValue={props.row.status} /></Field>
              <SaveActions canWrite={props.canManageProject} />
            </div>
          )}
        </HookForm>
      )}
    </EntityShell>
  );
}

function RequirementDetail(props: EntityDetailProps & { row: Requirement }) {
  const iteration = props.row.iterationId ? props.data.iterations.find((item) => item.id === props.row.iterationId) : undefined;
  const cases = props.data.cases.filter((item) => item.requirementId === props.row.id);
  const bugs = props.data.bugs.filter((item) => item.requirementId === props.row.id);
  const plans = props.data.plans.filter((item) => item.requirementId === props.row.id);
  return (
    <EntityShell title={props.row.title} eyebrow="需求详情" project={props.project} panel={props.panel} onPanel={props.setPanel}>
      {props.panel === 'overview' && (
        <div className="entity-overview-grid">
          <Metric label="所属迭代" value={iteration?.name || '未绑定'} detail={iteration ? dateRange(iteration.startDate, iteration.endDate) : '可在编辑中绑定'} action={iteration ? () => props.onOpenEntity('iteration', iteration.id) : undefined} />
          <Metric label="用例覆盖" value={cases.length} detail={`${cases.filter((item) => item.status === 'ready').length} 可执行`} />
          <Metric label="关联缺陷" value={bugs.length} detail={`${bugs.filter(isActiveBug).length} 活跃`} tone={bugs.some(isActiveBug) ? 'risk' : undefined} />
          <Metric label="准入状态" value={labelOf(props.row.acceptanceStatus || 'not_ready')} detail={props.row.qualityGateResult?.summary || '待检查'} />
          <RelationTable title="覆盖用例" headers={['用例', '状态', '评审', '执行/缺陷']} rows={cases.map((testCase) => ({
            key: testCase.id,
            onOpen: () => props.onOpenEntity('test_case', testCase.id),
            cells: [
              <CellMain title={testCase.title} detail={testCase.expectedResult || '未填写预期'} />,
              <StatusBadge value={testCase.status} dictionaryType="testCaseStatus" />,
              labelOf(testCase.reviewStatus || 'draft'),
              `${props.data.plans.filter((plan) => plan.runItems.some((item) => item.caseId === testCase.id)).length} / ${props.data.bugs.filter((bug) => bug.testCaseId === testCase.id).length}`
            ]
          }))} />
          <RelationTable title="测试计划" headers={['计划', '轮次', '状态', '执行进度']} rows={plans.map((plan) => ({
            key: plan.id,
            onOpen: () => props.onOpenEntity('test_plan', plan.id),
            cells: [plan.name, plan.round, <StatusBadge value={plan.status} dictionaryType="testPlanStatus" />, executionProgress(plan.runItems)]
          }))} />
          <RelationTable title="关联缺陷" headers={['缺陷', '严重级别', '状态']} rows={bugRows(bugs, props.onOpenEntity)} />
        </div>
      )}
      {props.panel === 'edit' && (
        <HookForm onSubmit={async (form) => {
          await props.mutate(() => api.updateRequirement(props.row.id, requirementPayload(form, props.row.projectId)), '需求已保存');
          props.setPanel('overview');
        }}>
          {(register) => (
            <div className="entity-edit-form wide">
              <RequirementFields row={props.row} iterations={props.data.iterations} users={props.users} register={register} />
              <SaveActions canWrite={props.canWriteProject} />
            </div>
          )}
        </HookForm>
      )}
      {props.panel === 'history' && <WorkflowTimeline rows={props.row.workflowHistory || []} empty="暂无需求流转历史" />}
    </EntityShell>
  );
}

function CaseDetail(props: EntityDetailProps & { row: TestCase }) {
  const requirement = props.row.requirementId ? props.data.requirements.find((item) => item.id === props.row.requirementId) : undefined;
  const executions = props.data.plans.flatMap((plan) => plan.runItems.filter((item) => item.caseId === props.row.id).map((item) => ({ plan, item })));
  const bugs = props.data.bugs.filter((item) => item.testCaseId === props.row.id);
  return (
    <EntityShell title={props.row.title} eyebrow="用例详情" project={props.project} panel={props.panel} onPanel={props.setPanel}>
      {props.panel === 'overview' && (
        <div className="entity-overview-grid">
          <Metric label="覆盖需求" value={requirement?.title || '未绑定'} detail={requirement ? labelOf(requirement.status) : '覆盖链路缺失'} action={requirement ? () => props.onOpenEntity('requirement', requirement.id) : undefined} />
          <Metric label="版本/评审" value={`${props.row.version || 'v1'} / ${labelOf(props.row.reviewStatus || 'draft')}`} detail={props.row.changeSummary || '暂无变更说明'} />
          <Metric label="执行次数" value={executions.length} detail={`${executions.filter(({ item }) => item.status === 'passed').length} 已通过`} />
          <Metric label="关联缺陷" value={bugs.length} detail={`${bugs.filter(isActiveBug).length} 活跃`} tone={bugs.some(isActiveBug) ? 'risk' : undefined} />
          <section className="entity-evidence">
            <strong>测试步骤</strong>
            <ol>{props.row.steps.map((step, index) => <li key={step.id || index}>{step.action} / {step.expected}</li>)}</ol>
          </section>
          <RelationTable title="执行记录" headers={['计划', '状态', '实际结果', '执行时间']} rows={executions.slice(0, 8).map(({ plan, item }) => ({
            key: item.id,
            onOpen: () => props.onOpenEntity('run_item', item.id),
            cells: [plan.name, <StatusBadge value={item.status} dictionaryType="testRunStatus" />, item.actualResult || '-', item.executedAt ? new Date(item.executedAt).toLocaleString('zh-CN') : '-']
          }))} />
          <RelationTable title="关联缺陷" headers={['缺陷', '严重级别', '状态']} rows={bugRows(bugs, props.onOpenEntity)} />
        </div>
      )}
      {props.panel === 'edit' && (
        <HookForm onSubmit={async (form) => {
          await props.mutate(() => api.updateTestCase(props.row.id, testCasePayload(form, props.row.projectId)), '用例已保存');
          props.setPanel('overview');
        }}>
          {(register) => (
            <div className="entity-edit-form wide">
              <TestCaseFields row={props.row} requirements={props.data.requirements} users={props.users} register={register} />
              <SaveActions canWrite={props.canWriteProject} />
            </div>
          )}
        </HookForm>
      )}
      {props.panel === 'history' && <WorkflowTimeline rows={[...(props.row.workflowHistory || []), ...(props.row.versionHistory || []).map((item) => ({ id: item.id, action: item.action, note: item.changeSummary, createdAt: item.createdAt, operatorName: item.changedByName }))]} empty="暂无用例历史" />}
    </EntityShell>
  );
}

function PlanDetail(props: EntityDetailProps & { row: TestPlan }) {
  const iteration = props.row.iterationId ? props.data.iterations.find((item) => item.id === props.row.iterationId) : undefined;
  const requirement = props.row.requirementId ? props.data.requirements.find((item) => item.id === props.row.requirementId) : undefined;
  const bugs = props.data.bugs.filter((bug) => bug.testPlanId === props.row.id);
  const [caseIds, setCaseIds] = useState(props.row.caseIds);
  useEffect(() => setCaseIds(props.row.caseIds), [props.row.caseIds]);
  return (
    <EntityShell title={props.row.name} eyebrow="测试计划详情" project={props.project} panel={props.panel} onPanel={props.setPanel} historyDisabled>
      {props.panel === 'overview' ? (
        <div className="entity-overview-grid">
          <Metric label="轮次" value={props.row.round} detail={labelOf(props.row.status)} />
          <Metric label="所属迭代" value={iteration?.name || '未绑定'} detail={iteration ? dateRange(iteration.startDate, iteration.endDate) : '全项目计划'} action={iteration ? () => props.onOpenEntity('iteration', iteration.id) : undefined} />
          <Metric label="关联需求" value={requirement?.title || '全部需求'} detail={requirement ? labelOf(requirement.status) : '未限定需求'} action={requirement ? () => props.onOpenEntity('requirement', requirement.id) : undefined} />
          <Metric label="执行进度" value={executionProgress(props.row.runItems)} detail={`${bugs.length} 个关联缺陷`} tone={bugs.some(isActiveBug) ? 'risk' : undefined} />
          <RelationTable title="执行项" headers={['用例', '状态', '实际结果', '缺陷']} rows={props.row.runItems.map((item) => ({
            key: item.id,
            onOpen: () => props.onOpenEntity('run_item', item.id),
            cells: [
              <CellMain title={item.caseTitle} detail={item.steps.map((step) => step.action).join(' / ') || '无步骤快照'} />,
              <StatusBadge value={item.status} dictionaryType="testRunStatus" />,
              item.actualResult || '-',
              item.bugIds.length
            ]
          }))} />
          <RelationTable title="关联缺陷" headers={['缺陷', '严重级别', '状态']} rows={bugRows(bugs, props.onOpenEntity)} />
        </div>
      ) : (
        <HookForm defaultValues={{ name: props.row.name, round: props.row.round, status: props.row.status }} onSubmit={async (form) => {
          await props.mutate(() => api.updateTestPlan(props.row.id, { name: text(form, 'name'), round: text(form, 'round'), status: text(form, 'status') as never, caseIds }), '测试计划已保存');
          props.setPanel('overview');
        }}>
          {(register) => (
            <div className="entity-edit-form">
              <Field><FieldLabel>计划名称</FieldLabel><Input {...register('name')} /></Field>
              <Field><FieldLabel>执行轮次</FieldLabel><Input {...register('round')} /></Field>
              <Field><FieldLabel>状态</FieldLabel><Select name="status" register={register} values={planStatuses} dictionaryType="testPlanStatus" defaultValue={props.row.status} /></Field>
              <div className="case-picker compact-picker span-four">
                {props.data.cases.map((testCase) => (
                  <label key={testCase.id} className="check-row">
                    <input type="checkbox" checked={caseIds.includes(testCase.id)} onChange={() => setCaseIds((current) => current.includes(testCase.id) ? current.filter((id) => id !== testCase.id) : [...current, testCase.id])} />
                    <span>{testCase.title}</span>
                  </label>
                ))}
              </div>
              <SaveActions canWrite={props.canExecute || props.canManageProject} />
            </div>
          )}
        </HookForm>
      )}
    </EntityShell>
  );
}

function RunItemDetail(props: EntityDetailProps & { plan: TestPlan; row: TestRunItem }) {
  const testCase = props.data.cases.find((item) => item.id === props.row.caseId);
  const requirement = props.row.requirementId ? props.data.requirements.find((item) => item.id === props.row.requirementId) : testCase?.requirementId ? props.data.requirements.find((item) => item.id === testCase.requirementId) : undefined;
  const bugs = props.data.bugs.filter((bug) => bug.runItemId === props.row.id || props.row.bugIds.includes(bug.id));
  return (
    <EntityShell title={props.row.caseTitle} eyebrow="执行项详情" project={props.project} panel={props.panel} onPanel={props.setPanel} historyDisabled>
      {props.panel === 'overview' ? (
        <div className="entity-overview-grid">
          <Metric label="所属计划" value={props.plan.name} detail={props.plan.round} action={() => props.onOpenEntity('test_plan', props.plan.id)} />
          <Metric label="关联用例" value={testCase?.title || props.row.caseTitle} detail={testCase ? `当前 ${testCase.version || 'v1'} / 快照 ${props.row.caseVersion || 'v1'}` : '仅有执行快照'} action={testCase ? () => props.onOpenEntity('test_case', testCase.id) : undefined} />
          <Metric label="关联需求" value={requirement?.title || '未绑定'} detail={requirement ? labelOf(requirement.status) : '覆盖链路缺失'} action={requirement ? () => props.onOpenEntity('requirement', requirement.id) : undefined} />
          <Metric label="执行状态" value={labelOf(props.row.status)} detail={props.row.executedAt ? new Date(props.row.executedAt).toLocaleString('zh-CN') : '尚未执行'} tone={['failed', 'blocked'].includes(props.row.status) ? 'risk' : undefined} />
          <section className="entity-evidence">
            <strong>步骤快照</strong>
            <ol>{props.row.steps.map((step, index) => <li key={step.id || index}>{step.action} / {step.expected}</li>)}</ol>
          </section>
          <section className="entity-evidence">
            <strong>实际结果</strong>
            <p>{props.row.actualResult || '暂无实际结果'}</p>
          </section>
          <RelationTable title="由此产生的缺陷" headers={['缺陷', '严重级别', '状态']} rows={bugRows(bugs, props.onOpenEntity)} />
        </div>
      ) : (
        <HookForm defaultValues={{ status: props.row.status, executorId: props.row.executorId || '', actualResult: props.row.actualResult || '' }} onSubmit={async (form) => {
          await props.mutate(() => api.updateRunItem(props.plan.id, props.row.id, { status: text(form, 'status'), executorId: text(form, 'executorId') || undefined, actualResult: text(form, 'actualResult') }), '执行结果已更新');
          props.setPanel('overview');
        }}>
          {(register) => (
            <div className="entity-edit-form">
              <Field><FieldLabel required>执行状态</FieldLabel><Select name="status" register={register} values={runStatuses} dictionaryType="testRunStatus" defaultValue={props.row.status} /></Field>
              <Field><FieldLabel>执行人</FieldLabel><select {...register('executorId')} defaultValue={props.row.executorId || ''}><option value="">未指定</option>{props.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</select></Field>
              <Field className="span-four"><FieldLabel>实际结果</FieldLabel><Textarea {...register('actualResult')} /></Field>
              <SaveActions canWrite={props.canExecute} />
            </div>
          )}
        </HookForm>
      )}
    </EntityShell>
  );
}

function BugDetail(props: EntityDetailProps & { row: Bug }) {
  const requirement = props.row.requirementId ? props.data.requirements.find((item) => item.id === props.row.requirementId) : undefined;
  const testCase = props.row.testCaseId ? props.data.cases.find((item) => item.id === props.row.testCaseId) : undefined;
  const plan = props.row.testPlanId ? props.data.plans.find((item) => item.id === props.row.testPlanId) : undefined;
  const duplicate = props.row.duplicateOfId ? props.data.bugs.find((item) => item.id === props.row.duplicateOfId) : undefined;
  return (
    <EntityShell title={props.row.title} eyebrow="缺陷详情" project={props.project} panel={props.panel} onPanel={props.setPanel}>
      {props.panel === 'overview' && (
        <div className="entity-overview-grid">
          <Metric label="严重级别" value={`${labelOf(props.row.severity)} / ${labelOf(props.row.priority)}`} detail={labelOf(props.row.status)} tone={isActiveBug(props.row) ? 'risk' : undefined} />
          <Metric label="负责人" value={props.row.assigneeId ? userName(props.users, props.row.assigneeId) : '未指派'} detail={props.row.team ? labelOf(props.row.team) : '未分配团队'} />
          <Metric label="SLA" value={props.row.dueAt ? shortDate(props.row.dueAt) : '未设置'} detail={props.row.slaLevel ? labelOf(props.row.slaLevel) : '按严重级别'} />
          <Metric label="分诊" value={labelOf(props.row.triageStatus || 'new')} detail={duplicate ? `重复于 ${duplicate.title}` : '未标记重复'} action={duplicate ? () => props.onOpenEntity('bug', duplicate.id) : undefined} />
          <section className="source-chain span-four">
            <strong>来源链路</strong>
            <div>
              <SourceButton disabled={!requirement} onClick={() => requirement && props.onOpenEntity('requirement', requirement.id)}>需求: {requirement?.title || '未绑定'}</SourceButton>
              <SourceButton disabled={!testCase} onClick={() => testCase && props.onOpenEntity('test_case', testCase.id)}>用例: {testCase?.title || '未绑定'}</SourceButton>
              <SourceButton disabled={!plan} onClick={() => plan && props.onOpenEntity('test_plan', plan.id)}>计划: {plan?.name || '未绑定'}</SourceButton>
              <SourceButton disabled={!props.row.runItemId} onClick={() => props.row.runItemId && props.onOpenEntity('run_item', props.row.runItemId)}>执行项</SourceButton>
            </div>
          </section>
          <section className="entity-evidence">
            <strong>问题证据</strong>
            <p>{props.row.reproduceSteps || props.row.actualResult || '暂无复现步骤或实际结果'}</p>
          </section>
          <section className="entity-evidence">
            <strong>修复与验证</strong>
            <p>{props.row.resolution || '暂无修复说明'}</p>
            <p>{props.row.verifyResult || '暂无验证结论'}</p>
          </section>
        </div>
      )}
      {props.panel === 'edit' && (
        <HookForm onSubmit={async (form) => {
          await props.mutate(() => api.updateBug(props.row.id, bugPayload(form, props.row.projectId)), '缺陷已保存');
          props.setPanel('overview');
        }}>
          {(register) => (
            <div className="entity-edit-form wide">
              <BugFields row={props.row} requirements={props.data.requirements} cases={props.data.cases} plans={props.data.plans} bugs={props.data.bugs} users={props.users} register={register} />
              <SaveActions canWrite={props.canEditBug} />
            </div>
          )}
        </HookForm>
      )}
      {props.panel === 'history' && <WorkflowTimeline rows={(props.row.statusHistory || []).map((item) => ({ id: item.id, action: `状态变更 ${item.fromStatus ? labelOf(item.fromStatus) : '-'} -> ${labelOf(item.toStatus)}`, operatorName: item.operatorName, note: item.note, createdAt: item.createdAt }))} empty="暂无缺陷状态历史" />}
    </EntityShell>
  );
}

type EntityDetailProps = Parameters<typeof EntityWorkspacePane>[0] & {
  panel: 'overview' | 'edit' | 'history';
  setPanel: (panel: 'overview' | 'edit' | 'history') => void;
  project?: Project;
};

function EntityShell(props: {
  title: string;
  eyebrow: string;
  project?: Project;
  panel: 'overview' | 'edit' | 'history';
  onPanel: (panel: 'overview' | 'edit' | 'history') => void;
  historyDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="entity-tab-panel">
      <EntityTitle title={props.title} eyebrow={props.eyebrow} project={props.project} />
      <div className="drawer-tabs entity-tabs" role="tablist" aria-label={props.eyebrow}>
        <button type="button" className={props.panel === 'overview' ? 'active' : ''} onClick={() => props.onPanel('overview')}>概览</button>
        <button type="button" className={props.panel === 'edit' ? 'active' : ''} onClick={() => props.onPanel('edit')}>编辑</button>
        {!props.historyDisabled && <button type="button" className={props.panel === 'history' ? 'active' : ''} onClick={() => props.onPanel('history')}>历史</button>}
      </div>
      {props.children}
    </section>
  );
}

function EntityTitle(props: { title: string; eyebrow: string; project?: Project }) {
  return (
    <header className="entity-tab-title">
      <div>
        <span>{props.eyebrow}</span>
        <h2>{props.title}</h2>
      </div>
      {props.project && <small>{props.project.name} · {props.project.code || '未设置代号'}</small>}
    </header>
  );
}

function Metric(props: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'risk'; action?: () => void }) {
  const content = (
    <>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.detail && <small>{props.detail}</small>}
    </>
  );
  if (props.action) {
    return <button type="button" className={`entity-metric ${props.tone ? `tone-${props.tone}` : ''}`} onClick={props.action}>{content}</button>;
  }
  return <article className={`entity-metric ${props.tone ? `tone-${props.tone}` : ''}`}>{content}</article>;
}

function RelationTable(props: { title: string; headers: string[]; rows: Parameters<typeof DataTable>[0]['rows'] }) {
  return (
    <section className="relation-table span-four">
      <div className="sub-title">{props.title}</div>
      <DataTable headers={props.headers} emptyText="暂无关联数据" rows={props.rows} />
    </section>
  );
}

function CellMain(props: { title: string; detail?: string }) {
  return <div className="cell-main"><strong>{props.title}</strong><span>{props.detail || '-'}</span></div>;
}

function SaveActions(props: { canWrite?: boolean }) {
  return (
    <FormActions>
      {props.canWrite ? <Button variant="primary"><Save size={15} /> 保存</Button> : <span className="muted">当前账号没有编辑权限</span>}
    </FormActions>
  );
}

function SourceButton(props: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
}

function WorkflowTimeline(props: { rows: Array<{ id: string; action: string; fromStatus?: string; toStatus?: string; operatorName?: string; note?: string; createdAt: string }>; empty: string }) {
  return (
    <section className="history-panel entity-history">
      {props.rows.length === 0 ? <span className="muted">{props.empty}</span> : props.rows.slice().reverse().map((item) => (
        <article key={item.id}>
          <strong>{item.action}{item.fromStatus || item.toStatus ? ` · ${item.fromStatus ? labelOf(item.fromStatus) : '-'} -> ${item.toStatus ? labelOf(item.toStatus) : '-'}` : ''}</strong>
          <span>{item.operatorName || '系统'} · {new Date(item.createdAt).toLocaleString('zh-CN')}</span>
          {item.note && <p>{item.note}</p>}
        </article>
      ))}
    </section>
  );
}

function bugRows(bugs: Bug[], onOpenEntity: OpenEntity): Parameters<typeof DataTable>[0]['rows'] {
  return bugs.map((bug) => ({
    key: bug.id,
    onOpen: () => onOpenEntity('bug', bug.id),
    cells: [<CellMain title={bug.title} detail={bug.actualResult || bug.reproduceSteps || '暂无详情'} />, <StatusBadge value={bug.severity} dictionaryType="severity" />, <StatusBadge value={bug.status} dictionaryType="bugStatus" />]
  }));
}

function findRunItem(plans: TestPlan[], id: string) {
  for (const plan of plans) {
    const item = plan.runItems.find((row) => row.id === id);
    if (item) return { plan, item };
  }
  return null;
}

function isActiveBug(row: Bug) {
  return !['verified', 'closed'].includes(row.status);
}

type SearchRow = { id: string; type: 'project' | 'iteration' | 'requirement' | 'test_case' | 'test_plan' | 'run_item' | 'bug'; title: string; detail: string; projectId?: string };
type SearchGroup = { title: string; rows: SearchRow[] };

function searchGroups(query: string, data: WorkspaceData, projects: Project[]): SearchGroup[] {
  const keyword = query.trim();
  if (!keyword) return [];
  const runRows = data.plans.flatMap((plan) => plan.runItems.map((item) => ({ plan, item })));
  return [
    {
      title: '项目',
      rows: projects
        .filter((project) => matchKeyword([project.name, project.code || '', project.description || ''], keyword))
        .slice(0, 6)
        .map((project) => ({ id: project.id, projectId: project.id, type: 'project' as const, title: project.name, detail: project.code || '未设置代号' }))
    },
    {
      title: '迭代',
      rows: data.iterations
        .filter((row) => matchKeyword([row.name, row.goal || '', row.status], keyword))
        .slice(0, 6)
        .map((row) => ({ id: row.id, projectId: row.projectId, type: 'iteration' as const, title: row.name, detail: `${labelOf(row.status)} · ${dateRange(row.startDate, row.endDate)}` }))
    },
    {
      title: '需求',
      rows: data.requirements
        .filter((row) => matchKeyword([row.title, row.description || '', row.priority, row.status], keyword))
        .slice(0, 6)
        .map((row) => ({ id: row.id, projectId: row.projectId, type: 'requirement' as const, title: row.title, detail: `${labelOf(row.priority)} · ${labelOf(row.status)}` }))
    },
    {
      title: '用例',
      rows: data.cases
        .filter((row) => matchKeyword([row.title, row.expectedResult || '', row.module || '', row.suiteId || '', row.status], keyword))
        .slice(0, 6)
        .map((row) => ({ id: row.id, projectId: row.projectId, type: 'test_case' as const, title: row.title, detail: `${row.requirementId ? requirementTitle(data.requirements, row.requirementId) : '未绑定需求'} · ${labelOf(row.status)}` }))
    },
    {
      title: '执行项',
      rows: runRows
        .filter(({ plan, item }) => matchKeyword([plan.name, item.caseTitle, item.actualResult || '', item.status], keyword))
        .slice(0, 6)
        .map(({ plan, item }) => ({ id: item.id, projectId: plan.projectId, type: 'run_item' as const, title: item.caseTitle, detail: `${plan.name} · ${labelOf(item.status)}` }))
    },
    {
      title: '缺陷',
      rows: data.bugs
        .filter((row) => matchKeyword([row.title, row.actualResult || '', row.reproduceSteps || '', row.severity, row.status, row.team || ''], keyword))
        .slice(0, 6)
        .map((row) => ({ id: row.id, projectId: row.projectId, type: 'bug' as const, title: row.title, detail: `${labelOf(row.severity)} · ${labelOf(row.status)}` }))
    }
  ];
}

function entityTypeText(type: EntityWorkspaceTab['entityType']) {
  if (type === 'iteration') return '迭代';
  if (type === 'requirement') return '需求';
  if (type === 'test_case') return '用例';
  if (type === 'test_plan') return '计划';
  if (type === 'run_item') return '执行项';
  if (type === 'bug') return '缺陷';
  if (type === 'project') return '项目';
  return '详情';
}
