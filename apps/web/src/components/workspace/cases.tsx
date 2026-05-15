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

export function CaseSection(props: {
  projectId: string;
  requirements: Requirement[];
  rows: TestCase[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TestCase | null>(null);
  const rows = props.rows.filter(
    (row) => (!requirementId || row.requirementId === requirementId) && matchKeyword([row.title, row.expectedResult || '', row.priority], keyword)
  );
  return (
    <Section title="用例库" icon={ClipboardCheck}>
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索用例" />
        <select value={requirementId} onChange={(event) => setRequirementId(event.target.value)}>
          <option value="">全部需求</option>
          {props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <span className="toolbar-summary">{rows.length} / {props.rows.length} 条用例</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建用例</button>
      </Toolbar>
      <div className="cards">
        {rows.map((row) => (
          <article className="item-card" key={row.id}>
            <CardHeader
              title={row.title}
              meta={[
                `优先级 ${row.priority}`,
                row.requirementId ? requirementTitle(props.requirements, row.requirementId) : '未绑定需求',
                row.expectedResult || '未填写最终预期结果'
              ]}
              badge={labelOf(row.status)}
            />
            {row.preconditions && <p>{row.preconditions}</p>}
            <div className="card-actions">
              <button type="button" onClick={() => setEditing(row)}><Pencil size={15} /> 编辑</button>
              <DangerButton onClick={() => props.mutate(() => api.deleteTestCase(row.id), '用例已删除')} />
            </div>
          </article>
        ))}
      </div>
      {rows.length === 0 && <EmptyState text="暂无用例" />}
      <TestCaseDrawer
        title="新建用例"
        open={creating}
        requirements={props.requirements}
        onClose={() => setCreating(false)}
        onSubmit={async (form) => {
          await props.mutate(() => api.createTestCase(testCasePayload(form, props.projectId)), '用例已创建');
          setCreating(false);
        }}
      />
      <TestCaseDrawer
        title="编辑用例"
        row={editing || undefined}
        open={Boolean(editing)}
        requirements={props.requirements}
        onClose={() => setEditing(null)}
        onSubmit={async (form) => {
          if (!editing) return;
          await props.mutate(() => api.updateTestCase(editing.id, testCasePayload(form, props.projectId)), '用例已保存');
          setEditing(null);
        }}
      />
    </Section>
  );
}

export function TestCaseFields(props: { row?: TestCase; requirements: Requirement[]; register?: UseFormRegister<StringFormValues> }) {
  const step = props.row?.steps[0];
  return (
    <div className="field-grid">
      <Field className="span-two">
        <FieldLabel>用例标题</FieldLabel>
        <Input {...registerField(props.register, 'title')} placeholder="例如：登录失败时展示错误提示" defaultValue={props.row?.title} required />
      </Field>
      <Field>
        <FieldLabel>绑定需求</FieldLabel>
        <select {...registerField(props.register, 'requirementId')} defaultValue={props.row?.requirementId || ''}>
          <option value="">不绑定需求</option>
          {props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </Field>
      <Field>
        <FieldLabel>优先级</FieldLabel>
        <Select name="priority" register={props.register} values={priorities} defaultValue={props.row?.priority || 'P2'} />
      </Field>
      <Field>
        <FieldLabel>状态</FieldLabel>
        <Select name="status" register={props.register} values={caseStatuses} defaultValue={props.row?.status || 'ready'} />
      </Field>
      <Field>
        <FieldLabel>前置条件</FieldLabel>
        <Input {...registerField(props.register, 'preconditions')} placeholder="账号、环境或数据准备" defaultValue={props.row?.preconditions} />
      </Field>
      <Field>
        <FieldLabel>测试步骤</FieldLabel>
        <Input {...registerField(props.register, 'step')} placeholder="输入操作步骤" defaultValue={step?.action} />
      </Field>
      <Field>
        <FieldLabel>步骤预期</FieldLabel>
        <Input {...registerField(props.register, 'expected')} placeholder="该步骤的预期反馈" defaultValue={step?.expected} />
      </Field>
      <Field className="span-four">
        <FieldLabel>最终预期结果</FieldLabel>
        <Textarea {...registerField(props.register, 'expectedResult')} placeholder="执行完成后的整体预期" defaultValue={props.row?.expectedResult} />
      </Field>
    </div>
  );
}

export function TestCaseDrawer(props: {
  title: string;
  row?: TestCase;
  open: boolean;
  requirements: Requirement[];
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '维护测试步骤、预期结果和优先级'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <TestCaseFields row={props.row} requirements={props.requirements} register={register} />
            <FormActions>
              <Button type="button" onClick={props.onClose}>取消</Button>
              <Button variant="primary"><Save size={15} /> 保存用例</Button>
            </FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}
