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

export function IterationSection(props: {
  projectId: string;
  rows: Iteration[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Iteration | null>(null);
  const rows = props.rows.filter((row) => matchKeyword([row.name, row.goal || '', row.status], keyword));
  return (
    <Section title="迭代管理" icon={CalendarRange}>
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索迭代" />
        <span className="toolbar-summary">{rows.length} / {props.rows.length} 个迭代</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}>
          <Plus size={16} /> 新建迭代
        </button>
      </Toolbar>
      <div className="cards">
        {rows.map((row) => (
          <article className="item-card" key={row.id}>
            <CardHeader
              title={row.name}
              meta={[row.goal || '未设置迭代目标', dateRange(row.startDate, row.endDate)]}
              badge={labelOf(row.status)}
            />
            <div className="card-actions">
              <button type="button" onClick={() => setEditing(row)}><Pencil size={15} /> 编辑</button>
              <DangerButton onClick={() => props.mutate(() => api.deleteIteration(row.id), '迭代已删除')} />
            </div>
          </article>
        ))}
      </div>
      {rows.length === 0 && <EmptyState text="暂无迭代" />}
      <IterationDrawer
        title="新建迭代"
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={async (form) => {
          await props.mutate(
            () =>
              api.createIteration({
                projectId: props.projectId,
                name: text(form, 'name'),
                goal: text(form, 'goal'),
                startDate: text(form, 'startDate') || undefined,
                endDate: text(form, 'endDate') || undefined,
                status: text(form, 'status') as never
              }),
            '迭代已创建'
          );
          setCreating(false);
        }}
      />
      <IterationDrawer
        title="编辑迭代"
        row={editing || undefined}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={async (form) => {
          if (!editing) return;
          await props.mutate(
            () =>
              api.updateIteration(editing.id, {
                name: text(form, 'name'),
                goal: text(form, 'goal'),
                startDate: text(form, 'startDate') || undefined,
                endDate: text(form, 'endDate') || undefined,
                status: text(form, 'status') as never
              }),
            '迭代已保存'
          );
          setEditing(null);
        }}
      />
    </Section>
  );
}

export function IterationDrawer(props: {
  title: string;
  row?: Iteration;
  open: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  return (
    <Drawer title={props.title} subtitle={props.row?.name || '规划迭代目标和时间范围'} open={props.open} onClose={props.onClose}>
      <HookForm
        defaultValues={{
          name: props.row?.name || '',
          goal: props.row?.goal || '',
          startDate: dateInput(props.row?.startDate),
          endDate: dateInput(props.row?.endDate),
          status: props.row?.status || 'planning'
        }}
        onSubmit={async (form) => props.onSubmit(form)}
      >
        {(register) => (
          <>
            <Field>
              <FieldLabel>迭代名称</FieldLabel>
              <Input {...register('name')} placeholder="例如：6 月回归" required />
            </Field>
            <Field>
              <FieldLabel>迭代目标</FieldLabel>
              <Input {...register('goal')} placeholder="本轮要交付或验证的目标" />
            </Field>
            <div className="field-grid two">
              <Field>
                <FieldLabel>开始日期</FieldLabel>
                <Input {...register('startDate')} type="date" />
              </Field>
              <Field>
                <FieldLabel>结束日期</FieldLabel>
                <Input {...register('endDate')} type="date" />
              </Field>
            </div>
            <Field>
              <FieldLabel>状态</FieldLabel>
              <Select name="status" register={register} values={iterationStatuses} defaultValue={props.row?.status || 'planning'} />
            </Field>
            <FormActions>
              <Button type="button" onClick={props.onClose}>取消</Button>
              <Button variant="primary"><Save size={15} /> 保存</Button>
            </FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}
