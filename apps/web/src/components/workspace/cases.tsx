import { useMemo, useState } from 'react';
import { ClipboardCheck, Pencil, Plus, Save } from 'lucide-react';
import type { Bug, Requirement, TestCase, TestPlan } from '@buggy/shared-types';
import type { UseFormRegister } from 'react-hook-form';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { caseStatuses, priorities } from '../../app/constants.js';
import type { StringFormValues } from '../../app/types.js';
import { matchKeyword, requirementTitle, shortDate, testCasePayload } from '../../app/workspace-utils.js';
import { DataPage, DataTable, DangerButton, Drawer, EmptyState, HookForm, MetricCard, registerField, SearchBox, Select, StatusBadge, StepEditor, Toolbar } from './common.js';

export function CaseSection(props: {
  projectId: string;
  requirements: Requirement[];
  plans?: TestPlan[];
  bugs?: Bug[];
  rows: TestCase[];
  canWrite?: boolean;
  canManage?: boolean;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TestCase | null>(null);
  const rows = useMemo(
    () => props.rows.filter((row) => (!requirementId || row.requirementId === requirementId) && (!status || row.status === status) && matchKeyword([row.title, row.expectedResult || '', row.priority, row.steps.map((step) => step.action).join(' ')], keyword)),
    [props.rows, requirementId, status, keyword]
  );
  const ready = props.rows.filter((row) => row.status === 'ready').length;
  const runItemsByCase = useMemo(() => {
    const map = new Map<string, { total: number; failed: number; passed: number; bugCount: number }>();
    for (const plan of props.plans || []) {
      for (const item of plan.runItems) {
        const current = map.get(item.caseId) || { total: 0, failed: 0, passed: 0, bugCount: 0 };
        current.total += 1;
        if (item.status === 'failed') current.failed += 1;
        if (item.status === 'passed') current.passed += 1;
        current.bugCount += item.bugIds.length;
        map.set(item.caseId, current);
      }
    }
    return map;
  }, [props.plans]);

  return (
    <DataPage
      title="用例库"
      icon={ClipboardCheck}
      metrics={
        <section className="insight-strip">
          <MetricCard label="用例总数" value={props.rows.length} detail={`${ready} 可执行`} tone="info" />
          <MetricCard label="多步骤用例" value={props.rows.filter((row) => row.steps.length > 1).length} detail="步骤数大于 1" />
          <MetricCard label="废弃用例" value={props.rows.filter((row) => row.status === 'deprecated').length} detail="不进入执行" tone="risk" />
          <MetricCard label="需求分组" value={props.requirements.length} detail="左侧可筛选范围" />
        </section>
      }
    >
      <div className="split-layout case-layout">
        <aside className="requirement-tree">
          <button className={!requirementId ? 'active' : ''} type="button" onClick={() => setRequirementId('')}>全部需求 <span>{props.rows.length}</span></button>
          {props.requirements.map((requirement) => (
            <button key={requirement.id} className={requirementId === requirement.id ? 'active' : ''} type="button" onClick={() => setRequirementId(requirement.id)}>
              {requirement.title}<span>{props.rows.filter((row) => row.requirementId === requirement.id).length}</span>
            </button>
          ))}
        </aside>
        <div className="main-table">
          <Toolbar>
            <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索用例、步骤、预期" />
            <Select value={status} onChange={setStatus} values={caseStatuses} emptyLabel="全部状态" />
            <span className="toolbar-summary">{rows.length} / {props.rows.length} 条用例</span>
            {props.canWrite && <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建用例</button>}
          </Toolbar>
          <DataTable
            headers={['用例', '需求', '步骤', '执行覆盖', '关联 Bug', '优先级', '状态', '更新时间', '操作']}
            emptyText="暂无用例"
            rows={rows.map((row) => {
              const runSummary = runItemsByCase.get(row.id);
              const caseBugs = (props.bugs || []).filter((bug) => bug.testCaseId === row.id);
              return [
                <div className="cell-main"><strong>{row.title}</strong><span>{row.expectedResult || row.preconditions || '未填写预期结果'}</span></div>,
                row.requirementId ? requirementTitle(props.requirements, row.requirementId) : '-',
                row.steps.length,
                runSummary ? `${runSummary.passed}/${runSummary.total} 通过 · ${runSummary.failed} 失败` : '未纳入计划',
                caseBugs.length ? `${caseBugs.filter((bug) => !['verified', 'closed'].includes(bug.status)).length} 活跃 / ${caseBugs.length} 总数` : '-',
                <StatusBadge value={row.priority} dictionaryType="priority" />,
                props.canWrite ? <Select value={row.status} onChange={(value) => props.mutate(() => api.updateTestCase(row.id, { status: value as never }), '用例状态已更新')} values={caseStatuses} dictionaryType="testCaseStatus" /> : <StatusBadge value={row.status} dictionaryType="testCaseStatus" />,
                shortDate(row.updatedAt),
                <div className="row-actions">
                  <Button type="button" size="sm" onClick={() => setEditing(row)}><Pencil size={14} /> 详情</Button>
                  {props.canManage && <DangerButton title={`删除用例「${row.title}」？`} onConfirm={() => props.mutate(() => api.deleteTestCase(row.id), '用例已删除')} />}
                </div>
              ];
            })}
          />
        </div>
      </div>
      {rows.length === 0 && (
        <EmptyState
          text="暂无用例"
          detail="先沉淀可执行用例，后续测试计划才能选择执行范围。"
          action={props.canWrite ? <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建用例</button> : undefined}
        />
      )}
      <TestCaseDrawer title="新建用例" open={creating} requirements={props.requirements} canWrite={props.canWrite} onClose={() => setCreating(false)} onSubmit={async (form) => {
        await props.mutate(() => api.createTestCase(testCasePayload(form, props.projectId)), '用例已创建');
        setCreating(false);
      }} />
      <TestCaseDrawer title="编辑用例" row={editing || undefined} open={Boolean(editing)} requirements={props.requirements} canWrite={props.canWrite} onClose={() => setEditing(null)} onSubmit={async (form) => {
        if (!editing) return;
        await props.mutate(() => api.updateTestCase(editing.id, testCasePayload(form, props.projectId)), '用例已保存');
        setEditing(null);
      }} />
    </DataPage>
  );
}

export function TestCaseFields(props: { row?: TestCase; requirements: Requirement[]; defaultRequirementId?: string; register?: UseFormRegister<StringFormValues> }) {
  return (
    <div className="field-grid">
      <Field className="span-two"><FieldLabel>用例标题</FieldLabel><Input {...registerField(props.register, 'title')} defaultValue={props.row?.title} required /></Field>
      <Field><FieldLabel>绑定需求</FieldLabel><select {...registerField(props.register, 'requirementId')} defaultValue={props.row?.requirementId || props.defaultRequirementId || ''}><option value="">不绑定需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      <Field><FieldLabel>优先级</FieldLabel><Select name="priority" register={props.register} values={priorities} dictionaryType="priority" defaultValue={props.row?.priority || 'P2'} /></Field>
      <Field><FieldLabel>状态</FieldLabel><Select name="status" register={props.register} values={caseStatuses} dictionaryType="testCaseStatus" defaultValue={props.row?.status || 'ready'} /></Field>
      <Field className="span-two"><FieldLabel>前置条件</FieldLabel><Input {...registerField(props.register, 'preconditions')} defaultValue={props.row?.preconditions} /></Field>
      <div className="span-four"><StepEditor initialSteps={props.row?.steps} /></div>
      <Field className="span-four"><FieldLabel>最终预期结果</FieldLabel><Textarea {...registerField(props.register, 'expectedResult')} defaultValue={props.row?.expectedResult} /></Field>
    </div>
  );
}

export function TestCaseDrawer(props: { title: string; row?: TestCase; open: boolean; requirements: Requirement[]; defaultRequirementId?: string; canWrite?: boolean; onClose: () => void; onSubmit: (form: FormData) => Promise<void> }) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '维护测试步骤、预期结果和优先级'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <TestCaseFields row={props.row} requirements={props.requirements} defaultRequirementId={props.defaultRequirementId} register={register} />
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button>{props.canWrite !== false && <Button variant="primary"><Save size={15} /> 保存用例</Button>}</FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}
