import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, Bug as BugIcon, MoreHorizontal, Pencil, Plus, Save } from 'lucide-react';
import type { Bug, Iteration, Requirement, TestCase, TestPlan, TestRunItem, TestRunStatus, UserProfile } from '@buggy/shared-types';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { planStatuses, priorities, runStatuses, severities } from '../../app/constants.js';
import { executionProgress, iterationName, requirementTitle, text } from '../../app/workspace-utils.js';
import { DataPage, DataTable, DangerButton, Drawer, EmptyState, HookForm, MetricCard, SearchBox, Select, StatusBadge, TextConfirmDialog, Toolbar, RowMoreMenu } from './common.js';

export function PlanSection(props: {
  projectId: string;
  iterations: Iteration[];
  requirements: Requirement[];
  cases: TestCase[];
  rows: TestPlan[];
  bugs: Bug[];
  users: UserProfile[];
  currentUser: UserProfile;
  globalKeyword?: string;
  canWrite?: boolean;
  canManage?: boolean;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
  onNotice?: (message: string) => void;
  onOpenEntity?: (entityType: string, entityId?: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const effectiveKeyword = keyword || props.globalKeyword || '';
  const rows = useMemo(() => props.rows.filter((plan) => (!status || plan.status === status) && `${plan.name} ${plan.round}`.toLowerCase().includes(effectiveKeyword.trim().toLowerCase())), [props.rows, effectiveKeyword, status]);
  const runItems = props.rows.flatMap((plan) => plan.runItems);
  const passed = runItems.filter((item) => item.status === 'passed').length;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('buggy:filters-change', { detail: { tab: 'plans', filters: { keyword, status } } }));
  }, [keyword, status]);

  useEffect(() => {
    const apply = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: string; filters: Record<string, unknown> }>).detail;
      if (detail?.tab !== 'plans') return;
      setKeyword(typeof detail.filters.keyword === 'string' ? detail.filters.keyword : '');
      setStatus(typeof detail.filters.status === 'string' ? detail.filters.status : '');
    };
    window.addEventListener('buggy:apply-view', apply);
    return () => window.removeEventListener('buggy:apply-view', apply);
  }, []);

  return (
    <DataPage
      title="测试执行"
      icon={Activity}
      metrics={
        <section className="insight-strip">
          <MetricCard label="测试计划" value={props.rows.length} detail={`${props.rows.filter((row) => row.status === 'active').length} 进行中`} tone="info" />
          <MetricCard label="执行项" value={runItems.length} detail={`${passed} 已通过`} />
          <MetricCard label="失败/阻塞" value={runItems.filter((item) => ['failed', 'blocked'].includes(item.status)).length} detail="需要跟进" tone="risk" />
          <MetricCard label="关联缺陷" value={props.bugs.length} detail="当前项目缺陷" />
        </section>
      }
    >
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索计划、轮次" />
        <Select value={status} onChange={setStatus} values={planStatuses} dictionaryType="testPlanStatus" emptyLabel="全部状态" />
        <span className="toolbar-summary">{rows.length} 个测试计划 · {props.cases.length} 条可选用例</span>
        {props.canWrite && <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建计划</button>}
      </Toolbar>
      <ExecutionWorkbench rows={props.rows} bugs={props.bugs} users={props.users} currentUser={props.currentUser} canWrite={props.canWrite} mutate={props.mutate} onOpenEntity={props.onOpenEntity} />
      <div className="plan-stack">
        {rows.map((plan) => <PlanCard key={plan.id} plan={plan} iterations={props.iterations} requirements={props.requirements} cases={props.cases} bugs={props.bugs} users={props.users} canWrite={props.canWrite} canManage={props.canManage} mutate={props.mutate} />)}
      </div>
      {rows.length === 0 && (
        <EmptyState
          text="暂无测试计划"
          detail="选择本轮要执行的用例后，执行页会形成可追踪的结果快照。"
          action={props.canWrite ? <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建计划</button> : undefined}
        />
      )}
      <PlanCreateDrawer
        open={creating}
        projectId={props.projectId}
        iterations={props.iterations}
        requirements={props.requirements}
        cases={props.cases}
        onNotice={props.onNotice}
        mutate={props.mutate}
        onClose={() => setCreating(false)}
      />
    </DataPage>
  );
}

function ExecutionWorkbench(props: { rows: TestPlan[]; bugs: Bug[]; users: UserProfile[]; currentUser: UserProfile; canWrite?: boolean; mutate: (action: () => Promise<unknown>, message: string) => Promise<void>; onOpenEntity?: (entityType: string, entityId?: string) => void }) {
  const runItems = props.rows.flatMap((plan) => plan.runItems.map((item) => ({ plan, item })));
  const myQueue = runItems.filter(({ item }) => item.status === 'untested' && (!item.executorId || item.executorId === props.currentUser.id));
  const failedQueue = runItems.filter(({ item }) => ['failed', 'blocked'].includes(item.status) && item.bugIds.length === 0);
  const retestQueue = props.bugs.filter((bug) => bug.status === 'resolved');
  const groups = [
    { label: '我的待执行', status: 'untested', detail: '等待记录结果', value: myQueue.length },
    { label: '失败待建缺陷', status: 'failed', detail: '优先补齐缺陷来源', value: failedQueue.length },
    { label: '待复测', status: 'resolved', detail: '已解决缺陷待验证', value: props.bugs.filter((bug) => bug.status === 'resolved').length }
  ];
  return (
    <section className="execution-workbench">
      <div className="section-heading compact">
        <div>
          <span>执行工作台</span>
          <strong>按状态聚合待办</strong>
        </div>
      </div>
      <div className="workbench-metrics">
        {groups.map((group) => (
          <article key={group.label}>
            <span>{group.label}</span>
            <strong>{group.value ?? runItems.filter(({ item }) => item.status === group.status).length}</strong>
            <small>{group.detail}</small>
          </article>
        ))}
      </div>
      <div className="execution-queues">
        <QueueTable
          title="我的待执行"
          empty="暂无待执行项"
          rows={myQueue.slice(0, 5).map(({ plan, item }) => [
            item.caseTitle,
            plan.name,
            <StatusBadge value={item.status} dictionaryType="testRunStatus" />,
            <RunItemActions planId={plan.id} item={item} users={props.users} canWrite={props.canWrite} mutate={props.mutate} />
          ])}
        />
        <QueueTable
          title="失败/阻塞待处理"
          empty="暂无失败或阻塞项"
          rows={failedQueue.slice(0, 5).map(({ plan, item }) => [
            item.caseTitle,
            item.actualResult || '暂无记录',
            <StatusBadge value={item.status} dictionaryType="testRunStatus" />,
            <RunItemActions planId={plan.id} item={item} users={props.users} canWrite={props.canWrite} mutate={props.mutate} />
          ])}
        />
        <QueueTable
          title="已解决待复测"
          empty="暂无待复测缺陷"
          rows={retestQueue.slice(0, 5).map((bug) => [
            bug.title,
            bug.resolution || bug.actualResult || '暂无修复说明',
            <StatusBadge value={bug.status} dictionaryType="bugStatus" />,
            <Button type="button" size="sm" onClick={() => bug.runItemId ? props.onOpenEntity?.('run_item', bug.runItemId) : props.onOpenEntity?.('bug', bug.id)}>
              进入复测
            </Button>
          ])}
        />
      </div>
    </section>
  );
}

function QueueTable(props: { title: string; empty: string; rows: Array<Array<ReactNode>> }) {
  return (
    <article className="queue-card">
      <strong>{props.title}</strong>
      <DataTable headers={['对象', '上下文', '状态', '操作']} emptyText={props.empty} rows={props.rows} />
    </article>
  );
}

function PlanCreateDrawer(props: {
  open: boolean;
  projectId: string;
  iterations: Iteration[];
  requirements: Requirement[];
  cases: TestCase[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
  onNotice?: (message: string) => void;
  onClose: () => void;
}) {
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [requirementFilter, setRequirementFilter] = useState('');
  const visibleCases = props.cases.filter((item) => !requirementFilter || item.requirementId === requirementFilter);
  useEffect(() => {
    if (!props.open) {
      setSelectedCases([]);
      setRequirementFilter('');
    }
  }, [props.open]);
  return (
    <Drawer title="新建测试计划" subtitle="选择轮次、关联范围和本轮要执行的用例。" open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => {
        if (selectedCases.length === 0) {
          props.onNotice?.('请至少选择一个用例');
          return;
        }
        await props.mutate(() => api.createTestPlan({ projectId: props.projectId, iterationId: text(form, 'iterationId') || undefined, requirementId: text(form, 'requirementId') || undefined, name: text(form, 'name'), round: text(form, 'round') || '第 1 轮', caseIds: selectedCases }), '测试计划已创建');
        props.onClose();
      }}>
        {(register) => (
          <>
            <Field><FieldLabel required>计划名称</FieldLabel><Input {...register('name')} required /></Field>
            <Field><FieldLabel hint="选择需求后只展示该需求下用例">需求范围</FieldLabel><select {...register('requirementId')} onChange={(event) => setRequirementFilter(event.target.value)}><option value="">全部需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
            <div className="case-picker">
              {visibleCases.map((testCase) => (
                <label key={testCase.id} className="check-row">
                  <input type="checkbox" checked={selectedCases.includes(testCase.id)} onChange={() => setSelectedCases((current) => current.includes(testCase.id) ? current.filter((id) => id !== testCase.id) : [...current, testCase.id])} />
                  <span>{testCase.title}</span>
                  <small>{testCase.priority} · {labelOf(testCase.status)} · {testCase.steps.length} 步</small>
                </label>
              ))}
              {visibleCases.length === 0 && <EmptyState text="还没有可选用例" />}
            </div>
            <details className="advanced-fields" open={false}>
              <summary>高级信息</summary>
              <div className="field-grid two">
                <Field><FieldLabel>轮次</FieldLabel><Input {...register('round')} placeholder="第 1 轮" /></Field>
                <Field><FieldLabel>绑定迭代</FieldLabel><select {...register('iterationId')}><option value="">不绑定迭代</option>{props.iterations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              </div>
            </details>
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button><Button variant="primary"><Plus size={16} /> 创建计划</Button></FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

export function PlanCard(props: { plan: TestPlan; iterations: Iteration[]; requirements: Requirement[]; cases: TestCase[]; bugs: Bug[]; users: UserProfile[]; canWrite?: boolean; canManage?: boolean; mutate: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [caseIds, setCaseIds] = useState(props.plan.caseIds);
  const [batchStatus, setBatchStatus] = useState<TestRunStatus | null>(null);
  const [selectedRunItemIds, setSelectedRunItemIds] = useState<string[]>([]);
  const casesById = useMemo(() => new Map(props.cases.map((testCase) => [testCase.id, testCase])), [props.cases]);
  useEffect(() => setCaseIds(props.plan.caseIds), [props.plan.caseIds]);
  useEffect(() => setSelectedRunItemIds((current) => current.filter((id) => props.plan.runItems.some((item) => item.id === id))), [props.plan.runItems]);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string; entityId?: string }>).detail;
      if (detail?.entityType === 'test_plan' && detail.entityId === props.plan.id) setEditing(true);
    };
    window.addEventListener('buggy:open-entity', open);
    return () => window.removeEventListener('buggy:open-entity', open);
  }, [props.plan.id]);
  const batchLabel = batchStatus === 'passed' ? '全部通过' : batchStatus === 'failed' ? '全部失败' : '批量更新';
  const batchTargets = selectedRunItemIds.length ? selectedRunItemIds : props.plan.runItems.map((item) => item.id);
  const batchScopeText = selectedRunItemIds.length ? `${selectedRunItemIds.length} 个已选执行项` : `${props.plan.runItems.length} 个全部执行项`;
  return (
    <article className="plan-card">
      <header>
        <div className="cell-main">
          <strong>{props.plan.name}</strong>
          <span>{props.plan.round} · {props.plan.iterationId ? iterationName(props.iterations, props.plan.iterationId) : '未绑定迭代'} · {props.plan.requirementId ? requirementTitle(props.requirements, props.plan.requirementId) : '全部需求'}</span>
        </div>
        <StatusBadge value={props.plan.status} dictionaryType="testPlanStatus" />
        <span className="progress-pill">{executionProgress(props.plan.runItems)}</span>
        {props.canWrite && props.plan.runItems.length > 0 && (
          <>
            <Button type="button" size="sm" onClick={() => setBatchStatus('passed')}>{selectedRunItemIds.length ? '所选通过' : '全部通过'}</Button>
            <Button type="button" size="sm" onClick={() => setBatchStatus('failed')}>{selectedRunItemIds.length ? '所选失败' : '全部失败'}</Button>
          </>
        )}
        <Button type="button" size="sm" onClick={() => setEditing(true)}><Pencil size={14} /> 编辑计划</Button>
        {props.canManage && (
          <RowMoreMenu label={`更多操作：${props.plan.name}`} trigger={<MoreHorizontal size={15} />}>
            <DangerButton title={`删除测试计划「${props.plan.name}」？`} description={`关联 ${props.bugs.filter((bug) => bug.testPlanId === props.plan.id).length} 个缺陷。有关联缺陷时系统会阻止删除，请先迁移或关闭。`} onConfirm={() => props.mutate(() => api.deleteTestPlan(props.plan.id), '测试计划已删除')} />
          </RowMoreMenu>
        )}
      </header>
      <DataTable
        headers={['选择', '执行项', '状态', '实际结果', '执行人/时间', '关联缺陷', '快捷操作']}
        rows={props.plan.runItems.map((item) => {
          const currentCase = casesById.get(item.caseId);
          const snapshotChanged = Boolean(currentCase && item.caseVersion && item.caseVersion !== (currentCase.version || 'v1'));
          return [
          <input
            type="checkbox"
            aria-label={`选择 ${item.caseTitle}`}
            checked={selectedRunItemIds.includes(item.id)}
            onChange={(event) => setSelectedRunItemIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
          />,
          <div className="cell-main"><strong>{item.caseTitle}</strong><span>{item.steps.map((step, index) => `${index + 1}. ${step.action}`).join(' / ') || '无步骤快照'}</span><span className={snapshotChanged ? 'snapshot-drift is-stale' : 'snapshot-drift'}>{snapshotChanged ? `快照 ${item.caseVersion}，当前 ${currentCase?.version || 'v1'}` : `快照 ${item.caseVersion || 'v1'}`}</span></div>,
          <StatusBadge value={item.status} dictionaryType="testRunStatus" />,
          item.actualResult || '-',
          item.executedAt ? new Date(item.executedAt).toLocaleString('zh-CN') : '-',
          props.bugs.filter((bug) => item.bugIds.includes(bug.id)).map((bug) => bug.title).join('、') || '-',
          <RunItemActions planId={props.plan.id} item={item} users={props.users} canWrite={props.canWrite} mutate={props.mutate} />
        ];
        })}
      />
      <Drawer title="编辑测试计划" subtitle={props.plan.name} open={editing} onClose={() => setEditing(false)}>
        <HookForm defaultValues={{ name: props.plan.name, round: props.plan.round, status: props.plan.status }} onSubmit={async (form) => {
          await props.mutate(() => api.updateTestPlan(props.plan.id, { name: text(form, 'name'), round: text(form, 'round'), status: text(form, 'status') as never, caseIds }), '测试计划已保存');
          setEditing(false);
        }}>
          {(register) => (
            <>
              <Field><FieldLabel>计划名称</FieldLabel><Input {...register('name')} /></Field>
              <Field><FieldLabel>执行轮次</FieldLabel><Input {...register('round')} /></Field>
              <Field><FieldLabel>状态</FieldLabel><Select name="status" register={register} values={planStatuses} dictionaryType="testPlanStatus" defaultValue={props.plan.status} /></Field>
              <div className="sub-title">调整用例范围</div>
              <div className="case-picker compact-picker">
                {props.cases.map((testCase) => (
                  <label key={testCase.id} className="check-row">
                    <input type="checkbox" checked={caseIds.includes(testCase.id)} onChange={() => setCaseIds((current) => current.includes(testCase.id) ? current.filter((id) => id !== testCase.id) : [...current, testCase.id])} />
                    <span>{testCase.title}</span>
                  </label>
                ))}
              </div>
              <FormActions><Button type="button" onClick={() => setEditing(false)}>取消</Button>{props.canWrite && <Button variant="primary"><Save size={15} /> 保存计划</Button>}</FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
      <TextConfirmDialog
        open={Boolean(batchStatus)}
        title={`${batchLabel}？`}
        description={`将影响「${props.plan.name}」中的 ${batchScopeText}。`}
        label={batchStatus === 'failed' ? '失败原因' : '执行备注'}
        placeholder={batchStatus === 'failed' ? '说明失败范围、环境或主要现象' : '说明本次批量通过的验证依据'}
        confirmText={batchLabel}
        destructive={batchStatus === 'failed'}
        onCancel={() => setBatchStatus(null)}
        onConfirm={async (note) => {
          if (!batchStatus) return;
          await props.mutate(
            () => api.batchUpdateRunItems(props.plan.id, { runItemIds: batchTargets, status: batchStatus, actualResult: note }),
            batchStatus === 'passed' ? '执行项已批量通过' : '执行项已批量失败'
          );
          setSelectedRunItemIds([]);
          setBatchStatus(null);
        }}
      />
    </article>
  );
}

function RunItemActions(props: { planId: string; item: TestRunItem; users: UserProfile[]; canWrite?: boolean; mutate: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const [quickStatus, setQuickStatus] = useState<TestRunStatus | null>(null);
  const [stepResults, setStepResults] = useState(() => initialStepResults(props.item));
  useEffect(() => setStepResults(initialStepResults(props.item)), [props.item]);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string; entityId?: string }>).detail;
      if (detail?.entityType === 'run_item' && detail.entityId === props.item.id) setEditing(true);
    };
    window.addEventListener('buggy:open-entity', open);
    return () => window.removeEventListener('buggy:open-entity', open);
  }, [props.item.id]);
  return (
    <div className="row-actions">
      {props.canWrite && (['passed', 'failed', 'blocked'] as const).map((status) => (
        <Button key={status} type="button" size="sm" onClick={() => setQuickStatus(status)}>{labelOf(status)}</Button>
      ))}
      {props.canWrite && <Button type="button" size="sm" onClick={() => setEditing(true)}><Pencil size={14} /> 记录</Button>}
      {props.canWrite && <Button type="button" size="sm" onClick={() => setBugOpen(true)}><BugIcon size={14} /> 建缺陷</Button>}
      <Drawer title="从执行项创建缺陷" subtitle={props.item.caseTitle} open={bugOpen} onClose={() => setBugOpen(false)}>
        <HookForm
          defaultValues={{
            title: `${props.item.caseTitle} 执行失败`,
            actualResult: props.item.actualResult || '',
            reproduceSteps: props.item.steps.map((step, index) => `${index + 1}. ${step.action}`).join('\n'),
            severity: 'S2',
            priority: 'P2',
            assigneeId: '',
            dueAt: '',
            environment: '',
            foundVersion: ''
          }}
          onSubmit={async (form) => {
            await props.mutate(
              () => api.createBugFromRun({
                testPlanId: props.planId,
                runItemId: props.item.id,
                title: text(form, 'title'),
                actualResult: text(form, 'actualResult'),
                reproduceSteps: text(form, 'reproduceSteps'),
                severity: text(form, 'severity') as never,
                priority: text(form, 'priority') as never,
                assigneeId: text(form, 'assigneeId') || undefined,
                dueAt: text(form, 'dueAt') || undefined,
                environment: text(form, 'environment'),
                foundVersion: text(form, 'foundVersion')
              }),
              '缺陷已从执行项创建'
            );
            setBugOpen(false);
          }}
        >
          {(register) => (
            <>
              <Field><FieldLabel required>缺陷标题</FieldLabel><Input {...register('title')} required /></Field>
              <Field><FieldLabel hint="指派后进入负责人处理队列">负责人</FieldLabel><select {...register('assigneeId')}><option value="">未指派</option>{props.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</select></Field>
              <div className="field-grid two">
                <Field><FieldLabel required>严重级别</FieldLabel><Select name="severity" register={register} values={severities} dictionaryType="severity" defaultValue="S2" /></Field>
                <Field><FieldLabel required>优先级</FieldLabel><Select name="priority" register={register} values={priorities} dictionaryType="priority" defaultValue="P2" /></Field>
                <Field><FieldLabel>SLA 截止</FieldLabel><Input type="date" {...register('dueAt')} /></Field>
                <Field><FieldLabel>发现版本</FieldLabel><Input {...register('foundVersion')} /></Field>
              </div>
              <Field><FieldLabel>发现环境</FieldLabel><Input {...register('environment')} placeholder="测试环境、浏览器或设备" /></Field>
              <Field><FieldLabel required>复现步骤</FieldLabel><Textarea {...register('reproduceSteps')} required /></Field>
              <Field><FieldLabel hint="执行失败时已自动带入">实际结果</FieldLabel><Textarea {...register('actualResult')} /></Field>
              <FormActions><Button type="button" onClick={() => setBugOpen(false)}>取消</Button><Button variant="primary"><BugIcon size={15} /> 创建缺陷</Button></FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
      <Drawer title="记录执行结果" subtitle={props.item.caseTitle} open={editing} onClose={() => setEditing(false)}>
        <HookForm defaultValues={{ status: props.item.status, actualResult: props.item.actualResult || '' }} onSubmit={async (form) => {
          await props.mutate(() => api.updateRunItem(props.planId, props.item.id, { status: text(form, 'status'), actualResult: text(form, 'actualResult'), executorId: text(form, 'executorId') || undefined, stepResults: parseStepResults(text(form, 'stepResultsJson')) }), '执行结果已更新');
          setEditing(false);
        }}>
          {(register) => (
            <>
              <Field><FieldLabel required>执行状态</FieldLabel><Select name="status" register={register} values={runStatuses} dictionaryType="testRunStatus" defaultValue={props.item.status} /></Field>
              <Field><FieldLabel hint="用于生成个人执行队列">执行人</FieldLabel><select {...register('executorId')} defaultValue={props.item.executorId || ''}><option value="">当前用户</option>{props.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</select></Field>
              <Field><FieldLabel hint="失败/阻塞时会作为建缺陷证据">实际结果</FieldLabel><Textarea {...register('actualResult')} /></Field>
              <div className="step-result-editor">
                <input type="hidden" name="stepResultsJson" value={JSON.stringify(stepResults)} readOnly />
                <div className="sub-title">步骤级结果</div>
                {props.item.steps.map((step, index) => {
                  const current = stepResults[index] || { stepId: step.id, status: props.item.status, actualResult: '' };
                  return (
                    <div className="step-result-row" key={step.id || index}>
                      <div className="cell-main">
                        <strong>{index + 1}. {step.action || '未填写操作'}</strong>
                        <span>{step.expected || props.item.expectedResult || '未填写步骤预期'}</span>
                      </div>
                      <Select
                        value={current.status}
                        onChange={(value) => setStepResults((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, status: value as TestRunStatus } : row))}
                        values={runStatuses}
                        dictionaryType="testRunStatus"
                      />
                      <Input
                        value={current.actualResult || ''}
                        onChange={(event) => setStepResults((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, actualResult: event.target.value } : row))}
                        placeholder="该步骤实际结果"
                      />
                    </div>
                  );
                })}
              </div>
              <FormActions><Button type="button" onClick={() => setEditing(false)}>取消</Button><Button variant="primary"><Save size={15} /> 保存结果</Button></FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
      <TextConfirmDialog
        open={Boolean(quickStatus)}
        title={quickStatus ? `确认执行结果为「${labelOf(quickStatus)}」？` : '确认执行结果？'}
        description={props.item.caseTitle}
        label={quickStatus === 'failed' || quickStatus === 'blocked' ? '问题说明' : '验证说明'}
        placeholder={quickStatus === 'failed' || quickStatus === 'blocked' ? '说明失败/阻塞现象、环境或依赖' : '说明通过依据、验证环境或数据范围'}
        confirmText={quickStatus === 'failed' || quickStatus === 'blocked' ? (props.item.bugIds.length ? '确认记录' : '确认并补缺陷') : '确认记录'}
        destructive={quickStatus === 'failed' || quickStatus === 'blocked'}
        onCancel={() => setQuickStatus(null)}
        onConfirm={async (note) => {
          if (!quickStatus) return;
          await props.mutate(() => api.updateRunItem(props.planId, props.item.id, { status: quickStatus, actualResult: note }), '执行结果已更新');
          if ((quickStatus === 'failed' || quickStatus === 'blocked') && props.item.bugIds.length === 0) setBugOpen(true);
          setQuickStatus(null);
        }}
      />
    </div>
  );
}

function initialStepResults(item: TestRunItem) {
  return item.steps.map((step, index) => {
    const existing = item.stepResults?.find((result) => result.stepId === step.id) || item.stepResults?.[index];
    return {
      stepId: step.id,
      status: existing?.status || item.status,
      actualResult: existing?.actualResult || ''
    };
  });
}

function parseStepResults(value: string) {
  try {
    return JSON.parse(value || '[]') as Array<{ stepId?: string; status: string; actualResult?: string }>;
  } catch {
    return [];
  }
}
