import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Bug as BugIcon, CalendarRange, Check, ClipboardCheck, FileSpreadsheet, Flag, FolderKanban, Pencil, Plus, Save, Send, Settings, Trash2, Upload, Users } from 'lucide-react';
import type { Bug, Dictionary, Iteration, Project, ProjectMember, ReportSummary, Requirement, TestCase, TestPlan, TestRunItem, UserProfile } from '@buggy/shared-types';
import type { UseFormRegister } from 'react-hook-form';
import { api, downloadUrl } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { bugStatuses, caseStatuses, iterationStatuses, planStatuses, priorities, requirementStatuses, runStatuses, severities, systemRoles, userStatuses } from '../../app/constants.js';
import type { StringFormValues } from '../../app/types.js';
import { bugPayload, dateInput, dateRange, executionProgress, formatDictionaryValues, importMessage, iterationName, matchKeyword, parseDictionaryValues, rate, requirementPayload, requirementTitle, testCasePayload, text, userName, userStatusLabel } from '../../app/workspace-utils.js';
import { CardHeader, DangerButton, Drawer, EmptyState, ExportLink, HookForm, registerField, SearchBox, Section, Select, Table, TemplateLink, Toolbar, Metric } from './common.js';

export function PlanSection(props: {
  projectId: string;
  iterations: Iteration[];
  requirements: Requirement[];
  cases: TestCase[];
  rows: TestPlan[];
  bugs: Bug[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [requirementFilter, setRequirementFilter] = useState('');
  const visibleCases = props.cases.filter((item) => !requirementFilter || item.requirementId === requirementFilter);
  const toggleCase = (id: string) =>
    setSelectedCases((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  return (
    <Section title="测试执行" icon={Activity}>
      <Toolbar>
        <span className="toolbar-summary">{props.rows.length} 个测试计划 · {props.cases.length} 条可选用例</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建计划</button>
      </Toolbar>
      <div className="cards">
        {props.rows.map((plan) => (
          <PlanCard key={plan.id} plan={plan} cases={props.cases} bugs={props.bugs} mutate={props.mutate} />
        ))}
      </div>
      {props.rows.length === 0 && <EmptyState text="暂无测试计划" />}
      <Drawer title="新建测试计划" subtitle="选择轮次、关联范围和本轮要执行的用例。" open={creating} onClose={() => setCreating(false)}>
        <HookForm onSubmit={async (form) => {
          if (selectedCases.length === 0) {
            alert('请至少选择一个用例');
            return;
          }
          await props.mutate(
            () =>
              api.createTestPlan({
                projectId: props.projectId,
                iterationId: text(form, 'iterationId') || undefined,
                requirementId: text(form, 'requirementId') || undefined,
                name: text(form, 'name'),
                round: text(form, 'round') || '第 1 轮',
                caseIds: selectedCases
              }),
            '测试计划已创建'
          );
          setSelectedCases([]);
          setCreating(false);
        }}>
          {(register) => (
            <>
              <Input {...register('name')} placeholder="计划名称" required />
              <Input {...register('round')} placeholder="轮次，如第 1 轮" />
              <select {...register('iterationId')}><option value="">不绑定迭代</option>{props.iterations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select {...register('requirementId')} onChange={(event) => setRequirementFilter(event.target.value)}>
                <option value="">全部需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
              <div className="case-picker">
                {visibleCases.map((testCase) => (
                  <label key={testCase.id} className="check-row">
                    <input type="checkbox" checked={selectedCases.includes(testCase.id)} onChange={() => toggleCase(testCase.id)} />
                    <span>{testCase.title}</span>
                    <small>{testCase.priority} · {labelOf(testCase.status)}</small>
                  </label>
                ))}
                {visibleCases.length === 0 && <EmptyState text="还没有可选用例" />}
              </div>
              <FormActions>
                <Button type="button" onClick={() => setCreating(false)}>取消</Button>
                <Button variant="primary"><Plus size={16} /> 创建计划</Button>
              </FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
    </Section>
  );
}

export function PlanCard(props: {
  plan: TestPlan;
  cases: TestCase[];
  bugs: Bug[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [caseIds, setCaseIds] = useState(props.plan.caseIds);
  useEffect(() => setCaseIds(props.plan.caseIds), [props.plan.caseIds]);
  const progress = executionProgress(props.plan.runItems);
  return (
    <article className="item-card">
      <CardHeader
        title={props.plan.name}
        meta={[props.plan.round, `${props.plan.runItems.length} 条执行项`, executionProgress(props.plan.runItems)]}
        badge={labelOf(props.plan.status)}
      />
      <div className="card-actions">
        <span className="progress-pill">{progress}</span>
        <button type="button" onClick={() => setEditing(true)}><Pencil size={15} /> 编辑计划</button>
        <DangerButton onClick={() => props.mutate(() => api.deleteTestPlan(props.plan.id), '测试计划已删除')} />
      </div>
      <div className="run-list">
        {props.plan.runItems.map((item) => (
          <RunItemRow key={item.id} planId={props.plan.id} item={item} bugs={props.bugs} mutate={props.mutate} />
        ))}
      </div>
      <Drawer title="编辑测试计划" subtitle={props.plan.name} open={editing} onClose={() => setEditing(false)}>
        <HookForm
          defaultValues={{ name: props.plan.name, round: props.plan.round, status: props.plan.status }}
          onSubmit={async (form) => {
            await props.mutate(
              () => api.updateTestPlan(props.plan.id, { name: text(form, 'name'), round: text(form, 'round'), status: text(form, 'status') as never, caseIds }),
              '测试计划已保存'
            );
            setEditing(false);
          }}
        >
          {(register) => (
            <>
              <Input {...register('name')} aria-label="计划名称" placeholder="计划名称" />
              <Input {...register('round')} aria-label="执行轮次" placeholder="执行轮次" />
              <Select name="status" register={register} values={planStatuses} defaultValue={props.plan.status} />
              <div className="sub-title">调整用例范围</div>
              <div className="case-picker compact-picker">
                {props.cases.map((testCase) => (
                  <label key={testCase.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={caseIds.includes(testCase.id)}
                      onChange={() => setCaseIds((current) => (current.includes(testCase.id) ? current.filter((id) => id !== testCase.id) : [...current, testCase.id]))}
                    />
                    <span>{testCase.title}</span>
                  </label>
                ))}
              </div>
              <FormActions>
                <Button type="button" onClick={() => setEditing(false)}>取消</Button>
                <Button variant="primary"><Save size={15} /> 保存计划</Button>
              </FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
    </article>
  );
}

export function RunItemRow(props: {
  planId: string;
  item: TestRunItem;
  bugs: Bug[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const linkedBugs = props.bugs.filter((bug) => props.item.bugIds.includes(bug.id));
  return (
    <div className="run-row">
      <div className="run-title">
        <strong>{props.item.caseTitle}</strong>
        <span>{labelOf(props.item.status)}</span>
      </div>
      <span>{props.item.actualResult || '未记录实际结果'}</span>
      <button type="button" onClick={() => setEditing(true)}><Pencil size={15} /> 记录结果</button>
      <button type="button" onClick={() => props.mutate(
        () => api.createBugFromRun({ testPlanId: props.planId, runItemId: props.item.id, title: `${props.item.caseTitle} 执行失败`, actualResult: props.item.actualResult }),
        'Bug 已从执行项创建'
      )}>
        <BugIcon size={15} /> 建 Bug
      </button>
      {linkedBugs.length > 0 && <small className="linked-bugs">{linkedBugs.map((bug) => bug.title).join('、')}</small>}
      <Drawer title="记录执行结果" subtitle={props.item.caseTitle} open={editing} onClose={() => setEditing(false)}>
        <HookForm
          defaultValues={{ status: props.item.status, actualResult: props.item.actualResult || '' }}
          onSubmit={async (form) => {
            await props.mutate(
              () => api.updateRunItem(props.planId, props.item.id, { status: text(form, 'status'), actualResult: text(form, 'actualResult') }),
              '执行结果已更新'
            );
            setEditing(false);
          }}
        >
          {(register) => (
            <>
              <Select name="status" register={register} values={runStatuses} defaultValue={props.item.status} />
              <Textarea {...register('actualResult')} aria-label={`${props.item.caseTitle} 实际结果`} placeholder="实际结果" />
              <FormActions>
                <Button type="button" onClick={() => setEditing(false)}>取消</Button>
                <Button variant="primary"><Save size={15} /> 保存结果</Button>
              </FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
    </div>
  );
}
