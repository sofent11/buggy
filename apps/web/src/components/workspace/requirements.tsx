import { useMemo, useState } from 'react';
import { Flag, Pencil, Plus, Save, Send } from 'lucide-react';
import type { Bug, Iteration, Requirement, TestCase, UserProfile } from '@buggy/shared-types';
import type { UseFormRegister } from 'react-hook-form';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { priorities, requirementStatuses } from '../../app/constants.js';
import type { StringFormValues } from '../../app/types.js';
import { iterationName, matchKeyword, requirementPayload, shortDate, userName } from '../../app/workspace-utils.js';
import { DataPage, DataTable, DangerButton, Drawer, EmptyState, FilterChips, HookForm, MetricCard, registerField, SearchBox, Select, StatusBadge, Toolbar } from './common.js';

export function RequirementSection(props: {
  projectId: string;
  iterations: Iteration[];
  users: UserProfile[];
  rows: Requirement[];
  cases?: TestCase[];
  bugs?: Bug[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const rows = useMemo(
    () => props.rows.filter((row) => (!status || row.status === status) && (!ownerId || row.ownerId === ownerId) && matchKeyword([row.title, row.description || '', row.priority], keyword)),
    [props.rows, keyword, status, ownerId]
  );

  return (
    <DataPage
      title="需求管理"
      icon={Flag}
      metrics={
        <section className="insight-strip">
          <MetricCard label="需求总数" value={props.rows.length} detail={`${props.rows.filter((row) => row.status === 'done').length} 已完成`} tone="info" />
          <MetricCard label="测试中" value={props.rows.filter((row) => row.status === 'testing').length} detail="正在验证" />
          <MetricCard label="阻塞" value={props.rows.filter((row) => row.status === 'blocked').length} detail="需要关注" tone="risk" />
          <MetricCard label="用例覆盖" value={props.cases?.length || 0} detail="关联用例数" tone="good" />
        </section>
      }
    >
      <div className="status-tabs">
        <button className={!status ? 'active' : ''} type="button" onClick={() => setStatus('')}>全部</button>
        {requirementStatuses.map((item) => (
          <button key={item} className={status === item ? 'active' : ''} type="button" onClick={() => setStatus(item)}>{item === 'ready' ? '待测试' : <StatusBadge value={item} />}</button>
        ))}
      </div>
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索需求标题、描述" />
        <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          <option value="">全部负责人</option>
          {props.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}
        </select>
        <span className="toolbar-summary">{rows.length} / {props.rows.length} 个需求</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建需求</button>
      </Toolbar>
      <FilterChips filters={[
        { label: '状态', value: status, onClear: () => setStatus('') },
        { label: '负责人', value: ownerId ? userName(props.users, ownerId) : '', onClear: () => setOwnerId('') }
      ]} />
      <DataTable
        headers={['需求', '迭代', '负责人', '优先级', '状态', '用例', 'Bug', '更新时间', '操作']}
        emptyText="暂无需求"
        rows={rows.map((row) => [
          <div className="cell-main"><strong>{row.title}</strong><span>{row.description || '未填写描述'}</span></div>,
          row.iterationId ? iterationName(props.iterations, row.iterationId) : '-',
          row.ownerId ? userName(props.users, row.ownerId) : '-',
          <StatusBadge value={row.priority} />,
          <select value={row.status} onChange={(event) => props.mutate(() => api.updateRequirement(row.id, { status: event.target.value as never }), '需求状态已更新')}>
            {requirementStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>,
          (props.cases || []).filter((item) => item.requirementId === row.id).length,
          (props.bugs || []).filter((item) => item.requirementId === row.id).length,
          shortDate(row.updatedAt),
          <div className="row-actions">
            <Button type="button" size="sm" onClick={() => setEditing(row)}><Pencil size={14} /> 详情</Button>
            <Button type="button" size="sm" onClick={() => props.mutate(() => api.sendLark(row.id), 'Lark 日报已发送')}><Send size={14} /> Lark</Button>
            <DangerButton title={`删除需求「${row.title}」？`} onConfirm={() => props.mutate(() => api.deleteRequirement(row.id), '需求已删除')} />
          </div>
        ])}
      />
      {rows.length === 0 && <EmptyState text="暂无需求" />}
      <RequirementDrawer title="新建需求" open={creating} iterations={props.iterations} users={props.users} onClose={() => setCreating(false)} onSubmit={async (form) => {
        await props.mutate(() => api.createRequirement(requirementPayload(form, props.projectId)), '需求已创建');
        setCreating(false);
      }} />
      <RequirementDrawer title="编辑需求" row={editing || undefined} open={Boolean(editing)} iterations={props.iterations} users={props.users} onClose={() => setEditing(null)} onSubmit={async (form) => {
        if (!editing) return;
        await props.mutate(() => api.updateRequirement(editing.id, requirementPayload(form, props.projectId)), '需求已保存');
        setEditing(null);
      }} />
    </DataPage>
  );
}

export function RequirementFields(props: { row?: Requirement; iterations: Iteration[]; users: UserProfile[]; register?: UseFormRegister<StringFormValues> }) {
  return (
    <div className="field-grid">
      <Field className="span-two"><FieldLabel>需求标题</FieldLabel><Input {...registerField(props.register, 'title')} defaultValue={props.row?.title} required /></Field>
      <Field><FieldLabel>绑定迭代</FieldLabel><select {...registerField(props.register, 'iterationId')} defaultValue={props.row?.iterationId || ''}><option value="">不绑定迭代</option>{props.iterations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field><FieldLabel>负责人</FieldLabel><select {...registerField(props.register, 'ownerId')} defaultValue={props.row?.ownerId || ''}><option value="">未指派负责人</option>{props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select></Field>
      <Field><FieldLabel>优先级</FieldLabel><Select name="priority" register={props.register} values={priorities} defaultValue={props.row?.priority || 'P2'} /></Field>
      <Field><FieldLabel>状态</FieldLabel><Select name="status" register={props.register} values={requirementStatuses} defaultValue={props.row?.status || 'ready'} /></Field>
      <Field className="span-two"><FieldLabel>Lark Webhook</FieldLabel><Input {...registerField(props.register, 'larkWebhook')} defaultValue={props.row?.larkWebhook} /></Field>
      <Field className="span-four"><FieldLabel>需求描述</FieldLabel><Textarea {...registerField(props.register, 'description')} defaultValue={props.row?.description} /></Field>
    </div>
  );
}

export function RequirementDrawer(props: { title: string; row?: Requirement; open: boolean; iterations: Iteration[]; users: UserProfile[]; onClose: () => void; onSubmit: (form: FormData) => Promise<void> }) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '维护需求状态、负责人和描述'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <RequirementFields row={props.row} iterations={props.iterations} users={props.users} register={register} />
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button><Button variant="primary"><Save size={15} /> 保存需求</Button></FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

