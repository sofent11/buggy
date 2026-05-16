import { useEffect, useMemo, useState } from 'react';
import { Activity, Bug as BugIcon, Pencil, Plus, Save } from 'lucide-react';
import type { Bug, Iteration, Requirement, TestCase, TestPlan, TestRunItem, TestRunStatus } from '@buggy/shared-types';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { planStatuses, runStatuses } from '../../app/constants.js';
import { executionProgress, iterationName, requirementTitle, text } from '../../app/workspace-utils.js';
import { ConfirmDialog, DataPage, DataTable, DangerButton, Drawer, EmptyState, HookForm, MetricCard, SearchBox, Select, StatusBadge, Toolbar } from './common.js';

export function PlanSection(props: {
  projectId: string;
  iterations: Iteration[];
  requirements: Requirement[];
  cases: TestCase[];
  rows: TestPlan[];
  bugs: Bug[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
  onNotice?: (message: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const rows = useMemo(() => props.rows.filter((plan) => (!status || plan.status === status) && `${plan.name} ${plan.round}`.toLowerCase().includes(keyword.trim().toLowerCase())), [props.rows, keyword, status]);
  const runItems = props.rows.flatMap((plan) => plan.runItems);
  const passed = runItems.filter((item) => item.status === 'passed').length;

  return (
    <DataPage
      title="测试执行"
      icon={Activity}
      metrics={
        <section className="insight-strip">
          <MetricCard label="测试计划" value={props.rows.length} detail={`${props.rows.filter((row) => row.status === 'active').length} 进行中`} tone="info" />
          <MetricCard label="执行项" value={runItems.length} detail={`${passed} 已通过`} />
          <MetricCard label="失败/阻塞" value={runItems.filter((item) => ['failed', 'blocked'].includes(item.status)).length} detail="需要跟进" tone="risk" />
          <MetricCard label="关联 Bug" value={props.bugs.length} detail="当前项目缺陷" />
        </section>
      }
    >
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索计划、轮次" />
        <Select value={status} onChange={setStatus} values={planStatuses} dictionaryType="testPlanStatus" emptyLabel="全部状态" />
        <span className="toolbar-summary">{rows.length} 个测试计划 · {props.cases.length} 条可选用例</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建计划</button>
      </Toolbar>
      <div className="plan-stack">
        {rows.map((plan) => <PlanCard key={plan.id} plan={plan} iterations={props.iterations} requirements={props.requirements} cases={props.cases} bugs={props.bugs} mutate={props.mutate} />)}
      </div>
      {rows.length === 0 && (
        <EmptyState
          text="暂无测试计划"
          detail="选择本轮要执行的用例后，执行页会形成可追踪的结果快照。"
          action={<button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建计划</button>}
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
            <Field><FieldLabel>计划名称</FieldLabel><Input {...register('name')} required /></Field>
            <Field><FieldLabel>轮次</FieldLabel><Input {...register('round')} placeholder="第 1 轮" /></Field>
            <Field><FieldLabel>绑定迭代</FieldLabel><select {...register('iterationId')}><option value="">不绑定迭代</option>{props.iterations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field><FieldLabel>需求范围</FieldLabel><select {...register('requirementId')} onChange={(event) => setRequirementFilter(event.target.value)}><option value="">全部需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
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
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button><Button variant="primary"><Plus size={16} /> 创建计划</Button></FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

export function PlanCard(props: { plan: TestPlan; iterations: Iteration[]; requirements: Requirement[]; cases: TestCase[]; bugs: Bug[]; mutate: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [caseIds, setCaseIds] = useState(props.plan.caseIds);
  useEffect(() => setCaseIds(props.plan.caseIds), [props.plan.caseIds]);
  return (
    <article className="plan-card">
      <header>
        <div className="cell-main">
          <strong>{props.plan.name}</strong>
          <span>{props.plan.round} · {props.plan.iterationId ? iterationName(props.iterations, props.plan.iterationId) : '未绑定迭代'} · {props.plan.requirementId ? requirementTitle(props.requirements, props.plan.requirementId) : '全部需求'}</span>
        </div>
        <StatusBadge value={props.plan.status} dictionaryType="testPlanStatus" />
        <span className="progress-pill">{executionProgress(props.plan.runItems)}</span>
        {props.plan.runItems.length > 0 && (
          <>
            <Button type="button" size="sm" onClick={() => props.mutate(() => Promise.all(props.plan.runItems.map((item) => api.updateRunItem(props.plan.id, item.id, { status: 'passed', actualResult: item.actualResult || '批量标记通过' }))), '执行项已批量通过')}>全部通过</Button>
            <Button type="button" size="sm" onClick={() => props.mutate(() => Promise.all(props.plan.runItems.map((item) => api.updateRunItem(props.plan.id, item.id, { status: 'failed', actualResult: item.actualResult || '批量标记失败' }))), '执行项已批量失败')}>全部失败</Button>
          </>
        )}
        <Button type="button" size="sm" onClick={() => setEditing(true)}><Pencil size={14} /> 编辑计划</Button>
        <DangerButton title={`删除测试计划「${props.plan.name}」？`} onConfirm={() => props.mutate(() => api.deleteTestPlan(props.plan.id), '测试计划已删除')} />
      </header>
      <DataTable
        headers={['执行项', '状态', '实际结果', '执行人/时间', '关联 Bug', '快捷操作']}
        rows={props.plan.runItems.map((item) => [
          <div className="cell-main"><strong>{item.caseTitle}</strong><span>{item.steps.map((step, index) => `${index + 1}. ${step.action}`).join(' / ') || '无步骤快照'}</span></div>,
          <StatusBadge value={item.status} dictionaryType="testRunStatus" />,
          item.actualResult || '-',
          item.executedAt ? new Date(item.executedAt).toLocaleString('zh-CN') : '-',
          props.bugs.filter((bug) => item.bugIds.includes(bug.id)).map((bug) => bug.title).join('、') || '-',
          <RunItemActions planId={props.plan.id} item={item} mutate={props.mutate} />
        ])}
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
              <FormActions><Button type="button" onClick={() => setEditing(false)}>取消</Button><Button variant="primary"><Save size={15} /> 保存计划</Button></FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
    </article>
  );
}

function RunItemActions(props: { planId: string; item: TestRunItem; mutate: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [bugConfirm, setBugConfirm] = useState(false);
  const [stepResults, setStepResults] = useState(() => initialStepResults(props.item));
  useEffect(() => setStepResults(initialStepResults(props.item)), [props.item]);
  return (
    <div className="row-actions">
      {(['passed', 'failed', 'blocked'] as const).map((status) => (
        <Button key={status} type="button" size="sm" onClick={() => props.mutate(() => api.updateRunItem(props.planId, props.item.id, { status, actualResult: props.item.actualResult }), '执行结果已更新')}>{labelOf(status)}</Button>
      ))}
      <Button type="button" size="sm" onClick={() => setEditing(true)}><Pencil size={14} /> 记录</Button>
      <Button type="button" size="sm" onClick={() => setBugConfirm(true)}><BugIcon size={14} /> 建 Bug</Button>
      <ConfirmDialog open={bugConfirm} title="从执行项创建 Bug？" description={props.item.caseTitle} confirmText="创建 Bug" onCancel={() => setBugConfirm(false)} onConfirm={() => {
        setBugConfirm(false);
        props.mutate(() => api.createBugFromRun({ testPlanId: props.planId, runItemId: props.item.id, title: `${props.item.caseTitle} 执行失败`, actualResult: props.item.actualResult }), 'Bug 已从执行项创建');
      }} />
      <Drawer title="记录执行结果" subtitle={props.item.caseTitle} open={editing} onClose={() => setEditing(false)}>
        <HookForm defaultValues={{ status: props.item.status, actualResult: props.item.actualResult || '' }} onSubmit={async (form) => {
          await props.mutate(() => api.updateRunItem(props.planId, props.item.id, { status: text(form, 'status'), actualResult: text(form, 'actualResult'), stepResults: parseStepResults(text(form, 'stepResultsJson')) }), '执行结果已更新');
          setEditing(false);
        }}>
          {(register) => (
            <>
              <Field><FieldLabel>执行状态</FieldLabel><Select name="status" register={register} values={runStatuses} dictionaryType="testRunStatus" defaultValue={props.item.status} /></Field>
              <Field><FieldLabel>实际结果</FieldLabel><Textarea {...register('actualResult')} /></Field>
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
