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

export function RequirementSection(props: {
  projectId: string;
  iterations: Iteration[];
  users: UserProfile[];
  rows: Requirement[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const rows = props.rows.filter((row) => (!status || row.status === status) && matchKeyword([row.title, row.description || '', row.priority], keyword));
  return (
    <Section title="需求管理" icon={Flag}>
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索需求" />
        <Select value={status} onChange={setStatus} values={requirementStatuses} emptyLabel="全部状态" />
        <span className="toolbar-summary">{rows.length} / {props.rows.length} 个需求</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建需求</button>
      </Toolbar>
      <div className="cards">
        {rows.map((row) => (
          <article className="item-card" key={row.id}>
            <CardHeader
              title={row.title}
              meta={[
                `优先级 ${row.priority}`,
                row.iterationId ? iterationName(props.iterations, row.iterationId) : '未绑定迭代',
                row.ownerId ? userName(props.users, row.ownerId) : '未指派负责人'
              ]}
              badge={labelOf(row.status)}
            />
            {row.description && <p>{row.description}</p>}
            <div className="card-actions">
              <button type="button" onClick={() => setEditing(row)}><Pencil size={15} /> 编辑</button>
              <button type="button" onClick={() => props.mutate(() => api.sendLark(row.id), 'Lark 日报已发送')}>
                <Send size={15} /> 发送 Lark
              </button>
              <DangerButton onClick={() => props.mutate(() => api.deleteRequirement(row.id), '需求已删除')} />
            </div>
          </article>
        ))}
      </div>
      {rows.length === 0 && <EmptyState text="暂无需求" />}
      <RequirementDrawer
        title="新建需求"
        open={creating}
        iterations={props.iterations}
        users={props.users}
        onClose={() => setCreating(false)}
        onSubmit={async (form) => {
          await props.mutate(() => api.createRequirement(requirementPayload(form, props.projectId)), '需求已创建');
          setCreating(false);
        }}
      />
      <RequirementDrawer
        title="编辑需求"
        row={editing || undefined}
        open={Boolean(editing)}
        iterations={props.iterations}
        users={props.users}
        onClose={() => setEditing(null)}
        onSubmit={async (form) => {
          if (!editing) return;
          await props.mutate(() => api.updateRequirement(editing.id, requirementPayload(form, props.projectId)), '需求已保存');
          setEditing(null);
        }}
      />
    </Section>
  );
}

export function RequirementFields(props: { row?: Requirement; iterations: Iteration[]; users: UserProfile[]; register?: UseFormRegister<StringFormValues> }) {
  return (
    <div className="field-grid">
      <Field className="span-two">
        <FieldLabel>需求标题</FieldLabel>
        <Input {...registerField(props.register, 'title')} placeholder="一句话描述验收目标" defaultValue={props.row?.title} required />
      </Field>
      <Field>
        <FieldLabel>绑定迭代</FieldLabel>
        <select {...registerField(props.register, 'iterationId')} defaultValue={props.row?.iterationId || ''}>
          <option value="">不绑定迭代</option>
          {props.iterations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </Field>
      <Field>
        <FieldLabel>负责人</FieldLabel>
        <select {...registerField(props.register, 'ownerId')} defaultValue={props.row?.ownerId || ''}>
          <option value="">未指派负责人</option>
          {props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}
        </select>
      </Field>
      <Field>
        <FieldLabel>优先级</FieldLabel>
        <Select name="priority" register={props.register} values={priorities} defaultValue={props.row?.priority || 'P2'} />
      </Field>
      <Field>
        <FieldLabel>状态</FieldLabel>
        <Select name="status" register={props.register} values={requirementStatuses} defaultValue={props.row?.status || 'ready'} />
      </Field>
      <Field className="span-two">
        <FieldLabel>Lark Webhook</FieldLabel>
        <Input {...registerField(props.register, 'larkWebhook')} placeholder="用于发送需求日报，可留空" defaultValue={props.row?.larkWebhook} />
      </Field>
      <Field className="span-four">
        <FieldLabel>需求描述</FieldLabel>
        <Textarea {...registerField(props.register, 'description')} placeholder="补充背景、边界和验收条件" defaultValue={props.row?.description} />
      </Field>
    </div>
  );
}

export function RequirementDrawer(props: {
  title: string;
  row?: Requirement;
  open: boolean;
  iterations: Iteration[];
  users: UserProfile[];
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '维护需求状态、负责人和描述'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <RequirementFields row={props.row} iterations={props.iterations} users={props.users} register={register} />
            <FormActions>
              <Button type="button" onClick={props.onClose}>取消</Button>
              <Button variant="primary"><Save size={15} /> 保存需求</Button>
            </FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}
