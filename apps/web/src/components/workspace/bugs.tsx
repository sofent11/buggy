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
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bug | null>(null);
  const rows = props.rows.filter((row) => (!status || row.status === status) && matchKeyword([row.title, row.actualResult || '', row.severity], keyword));
  return (
    <Section title="Bug 管理" icon={BugIcon}>
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索 Bug" />
        <Select value={status} onChange={setStatus} values={bugStatuses} emptyLabel="全部状态" />
        <span className="toolbar-summary">{rows.length} / {props.rows.length} 个 Bug</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建 Bug</button>
      </Toolbar>
      <div className="cards">
        {rows.map((row) => (
          <article className="item-card" key={row.id}>
            <CardHeader
              title={row.title}
              meta={[
                `严重级别 ${row.severity}`,
                `优先级 ${row.priority}`,
                row.assigneeId ? userName(props.users, row.assigneeId) : '未指派',
                row.actualResult || '未填写实际结果'
              ]}
              badge={labelOf(row.status)}
            />
            {row.reproduceSteps && <p>{row.reproduceSteps}</p>}
            <div className="card-actions">
              <button type="button" onClick={() => setEditing(row)}><Pencil size={15} /> 编辑</button>
              <DangerButton onClick={() => props.mutate(() => api.deleteBug(row.id), 'Bug 已删除')} />
            </div>
          </article>
        ))}
      </div>
      {rows.length === 0 && <EmptyState text="暂无 Bug" />}
      <BugDrawer
        title="新建 Bug"
        open={creating}
        requirements={props.requirements}
        cases={props.cases}
        plans={props.plans}
        users={props.users}
        onClose={() => setCreating(false)}
        onSubmit={async (form) => {
          await props.mutate(() => api.createBug(bugPayload(form, props.projectId)), 'Bug 已创建');
          setCreating(false);
        }}
      />
      <BugDrawer
        title="编辑 Bug"
        row={editing || undefined}
        open={Boolean(editing)}
        requirements={props.requirements}
        cases={props.cases}
        plans={props.plans}
        users={props.users}
        onClose={() => setEditing(null)}
        onSubmit={async (form) => {
          if (!editing) return;
          await props.mutate(() => api.updateBug(editing.id, bugPayload(form, props.projectId)), 'Bug 已保存');
          setEditing(null);
        }}
      />
    </Section>
  );
}

export function BugFields(props: { row?: Bug; requirements: Requirement[]; cases: TestCase[]; plans: TestPlan[]; users: UserProfile[]; register?: UseFormRegister<StringFormValues> }) {
  return (
    <div className="field-grid">
      <Field className="span-two">
        <FieldLabel>Bug 标题</FieldLabel>
        <Input {...registerField(props.register, 'title')} placeholder="清楚说明问题现象" defaultValue={props.row?.title} required />
      </Field>
      <Field>
        <FieldLabel>关联需求</FieldLabel>
        <select {...registerField(props.register, 'requirementId')} defaultValue={props.row?.requirementId || ''}>
          <option value="">不绑定需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </Field>
      <Field>
        <FieldLabel>关联用例</FieldLabel>
        <select {...registerField(props.register, 'testCaseId')} defaultValue={props.row?.testCaseId || ''}>
          <option value="">不绑定用例</option>{props.cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </Field>
      <Field>
        <FieldLabel>关联计划</FieldLabel>
        <select {...registerField(props.register, 'testPlanId')} defaultValue={props.row?.testPlanId || ''}>
          <option value="">不绑定计划</option>{props.plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </Field>
      <Field>
        <FieldLabel>负责人</FieldLabel>
        <select {...registerField(props.register, 'assigneeId')} defaultValue={props.row?.assigneeId || ''}>
          <option value="">未指派</option>{props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}
        </select>
      </Field>
      <Field>
        <FieldLabel>严重级别</FieldLabel>
        <Select name="severity" register={props.register} values={severities} defaultValue={props.row?.severity || 'S2'} />
      </Field>
      <Field>
        <FieldLabel>优先级</FieldLabel>
        <Select name="priority" register={props.register} values={priorities} defaultValue={props.row?.priority || 'P2'} />
      </Field>
      <Field>
        <FieldLabel>状态</FieldLabel>
        <Select name="status" register={props.register} values={bugStatuses} defaultValue={props.row?.status || 'open'} />
      </Field>
      <Field className="span-four">
        <FieldLabel>复现步骤</FieldLabel>
        <Textarea {...registerField(props.register, 'reproduceSteps')} placeholder="按步骤描述如何稳定复现" defaultValue={props.row?.reproduceSteps} />
      </Field>
      <Field className="span-two">
        <FieldLabel>实际结果</FieldLabel>
        <Textarea {...registerField(props.register, 'actualResult')} placeholder="实际看到的行为" defaultValue={props.row?.actualResult} />
      </Field>
      <Field className="span-two">
        <FieldLabel>期望结果</FieldLabel>
        <Textarea {...registerField(props.register, 'expectedResult')} placeholder="期望系统表现" defaultValue={props.row?.expectedResult} />
      </Field>
    </div>
  );
}

export function BugDrawer(props: {
  title: string;
  row?: Bug;
  open: boolean;
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  users: UserProfile[];
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '记录复现步骤、预期结果和责任人'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <BugFields row={props.row} requirements={props.requirements} cases={props.cases} plans={props.plans} users={props.users} register={register} />
            <FormActions>
              <Button type="button" onClick={props.onClose}>取消</Button>
              <Button variant="primary"><Save size={15} /> 保存 Bug</Button>
            </FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}
