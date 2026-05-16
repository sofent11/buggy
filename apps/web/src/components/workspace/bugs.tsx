import { useMemo, useState } from 'react';
import { Bug as BugIcon, Pencil, Plus, Save } from 'lucide-react';
import type { Bug, Requirement, TestCase, TestPlan, UserProfile } from '@buggy/shared-types';
import type { UseFormRegister } from 'react-hook-form';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { bugStatuses, priorities, severities } from '../../app/constants.js';
import type { StringFormValues } from '../../app/types.js';
import { bugPayload, matchKeyword, requirementTitle, shortDate, testCasePayload, userName } from '../../app/workspace-utils.js';
import { DataPage, DataTable, DangerButton, Drawer, EmptyState, FilterChips, HookForm, MetricCard, registerField, SearchBox, Select, StatusBadge, Toolbar } from './common.js';

export function BugSection(props: {
  projectId: string;
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  users: UserProfile[];
  rows: Bug[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bug | null>(null);
  const rows = useMemo(
    () => props.rows.filter((row) => (!status || row.status === status) && (!severity || row.severity === severity) && (!assigneeId || row.assigneeId === assigneeId) && matchKeyword([row.title, row.actualResult || '', row.reproduceSteps || '', row.severity], keyword)),
    [props.rows, keyword, status, severity, assigneeId]
  );

  return (
    <DataPage
      title="Bug 管理"
      icon={BugIcon}
      metrics={
        <section className="insight-strip">
          <MetricCard label="Bug 总数" value={props.rows.length} detail={`${props.rows.filter((row) => !['verified', 'closed'].includes(row.status)).length} 活跃`} tone="info" />
          <MetricCard label="严重缺陷" value={props.rows.filter((row) => ['S0', 'S1'].includes(row.severity)).length} detail="S0/S1" tone="risk" />
          <MetricCard label="已解决" value={props.rows.filter((row) => row.status === 'resolved').length} detail="待验证" />
          <MetricCard label="关闭率" value={`${props.rows.length ? Math.round((props.rows.filter((row) => row.status === 'closed').length / props.rows.length) * 100) : 0}%`} detail="closed / total" tone="good" />
        </section>
      }
    >
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索 Bug、复现、实际结果" />
        <Select value={status} onChange={setStatus} values={bugStatuses} emptyLabel="全部状态" />
        <Select value={severity} onChange={setSeverity} values={severities} emptyLabel="全部严重级别" />
        <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">全部负责人</option>
          {props.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}
        </select>
        <span className="toolbar-summary">{rows.length} / {props.rows.length} 个 Bug</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建 Bug</button>
      </Toolbar>
      <FilterChips filters={[
        { label: '状态', value: status, onClear: () => setStatus('') },
        { label: '严重级别', value: severity, onClear: () => setSeverity('') },
        { label: '负责人', value: assigneeId ? userName(props.users, assigneeId) : '', onClear: () => setAssigneeId('') }
      ]} />
      <DataTable
        headers={['Bug', '来源', '负责人', '严重级别', '优先级', '状态', '更新时间', '操作']}
        emptyText="暂无 Bug"
        rows={rows.map((row) => [
          <div className="cell-main"><strong>{row.title}</strong><span>{row.actualResult || row.reproduceSteps || '未填写问题详情'}</span></div>,
          row.requirementId ? requirementTitle(props.requirements, row.requirementId) : row.testCaseId ? props.cases.find((item) => item.id === row.testCaseId)?.title || '关联用例' : '-',
          row.assigneeId ? userName(props.users, row.assigneeId) : '-',
          <StatusBadge value={row.severity} />,
          <StatusBadge value={row.priority} />,
          <select value={row.status} onChange={(event) => props.mutate(() => api.updateBug(row.id, { status: event.target.value as never }), 'Bug 状态已更新')}>
            {bugStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>,
          shortDate(row.updatedAt),
          <div className="row-actions">
            <Button type="button" size="sm" onClick={() => setEditing(row)}><Pencil size={14} /> 详情</Button>
            <DangerButton title={`删除 Bug「${row.title}」？`} onConfirm={() => props.mutate(() => api.deleteBug(row.id), 'Bug 已删除')} />
          </div>
        ])}
      />
      {rows.length === 0 && <EmptyState text="暂无 Bug" />}
      <BugDrawer title="新建 Bug" open={creating} requirements={props.requirements} cases={props.cases} plans={props.plans} users={props.users} onClose={() => setCreating(false)} onSubmit={async (form) => {
        await props.mutate(() => api.createBug(bugPayload(form, props.projectId)), 'Bug 已创建');
        setCreating(false);
      }} />
      <BugDrawer title="编辑 Bug" row={editing || undefined} open={Boolean(editing)} requirements={props.requirements} cases={props.cases} plans={props.plans} users={props.users} onClose={() => setEditing(null)} onSubmit={async (form) => {
        if (!editing) return;
        await props.mutate(() => api.updateBug(editing.id, bugPayload(form, props.projectId)), 'Bug 已保存');
        setEditing(null);
      }} />
    </DataPage>
  );
}

export function BugFields(props: { row?: Bug; requirements: Requirement[]; cases: TestCase[]; plans: TestPlan[]; users: UserProfile[]; register?: UseFormRegister<StringFormValues> }) {
  return (
    <div className="field-grid">
      <Field className="span-two"><FieldLabel>Bug 标题</FieldLabel><Input {...registerField(props.register, 'title')} defaultValue={props.row?.title} required /></Field>
      <Field><FieldLabel>关联需求</FieldLabel><select {...registerField(props.register, 'requirementId')} defaultValue={props.row?.requirementId || ''}><option value="">不绑定需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      <Field><FieldLabel>关联用例</FieldLabel><select {...registerField(props.register, 'testCaseId')} defaultValue={props.row?.testCaseId || ''}><option value="">不绑定用例</option>{props.cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      <Field><FieldLabel>关联计划</FieldLabel><select {...registerField(props.register, 'testPlanId')} defaultValue={props.row?.testPlanId || ''}><option value="">不绑定计划</option>{props.plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field><FieldLabel>负责人</FieldLabel><select {...registerField(props.register, 'assigneeId')} defaultValue={props.row?.assigneeId || ''}><option value="">未指派</option>{props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select></Field>
      <Field><FieldLabel>严重级别</FieldLabel><Select name="severity" register={props.register} values={severities} defaultValue={props.row?.severity || 'S2'} /></Field>
      <Field><FieldLabel>优先级</FieldLabel><Select name="priority" register={props.register} values={priorities} defaultValue={props.row?.priority || 'P2'} /></Field>
      <Field><FieldLabel>状态</FieldLabel><Select name="status" register={props.register} values={bugStatuses} defaultValue={props.row?.status || 'open'} /></Field>
      <Field className="span-four"><FieldLabel>复现步骤</FieldLabel><Textarea {...registerField(props.register, 'reproduceSteps')} defaultValue={props.row?.reproduceSteps} /></Field>
      <Field className="span-two"><FieldLabel>实际结果</FieldLabel><Textarea {...registerField(props.register, 'actualResult')} defaultValue={props.row?.actualResult} /></Field>
      <Field className="span-two"><FieldLabel>期望结果</FieldLabel><Textarea {...registerField(props.register, 'expectedResult')} defaultValue={props.row?.expectedResult} /></Field>
    </div>
  );
}

export function BugDrawer(props: { title: string; row?: Bug; open: boolean; requirements: Requirement[]; cases: TestCase[]; plans: TestPlan[]; users: UserProfile[]; onClose: () => void; onSubmit: (form: FormData) => Promise<void> }) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '记录复现步骤、预期结果和责任人'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <BugFields row={props.row} requirements={props.requirements} cases={props.cases} plans={props.plans} users={props.users} register={register} />
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button><Button variant="primary"><Save size={15} /> 保存 Bug</Button></FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

