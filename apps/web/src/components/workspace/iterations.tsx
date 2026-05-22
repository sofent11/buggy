import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, FileText, MoreHorizontal, Pencil, Plus, Save } from 'lucide-react';
import type { Bug, Iteration, Requirement, TestCase, TestPlan } from '@buggy/shared-types';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { labelOf } from '../../labels.js';
import { iterationStatuses } from '../../app/constants.js';
import { dateInput, dateRange, matchKeyword, shortDate, text } from '../../app/workspace-utils.js';
import { DataPage, DataTable, DangerButton, Drawer, EmptyState, HookForm, MetricCard, SearchBox, Select, StatusBadge, Toolbar, RowMoreMenu } from './common.js';
import { ScopedReportDrawer } from './reportsSettings.js';

export function IterationSection(props: {
  projectId: string;
  rows: Iteration[];
  requirements?: Requirement[];
  cases?: TestCase[];
  plans?: TestPlan[];
  bugs?: Bug[];
  canWrite?: boolean;
  canManage?: boolean;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Iteration | null>(null);
  const [reporting, setReporting] = useState<Iteration | null>(null);
  const rows = useMemo(() => props.rows.filter((row) => (!status || row.status === status) && matchKeyword([row.name, row.goal || '', row.status], keyword)), [props.rows, keyword, status]);
  const active = props.rows.filter((row) => row.status === 'active').length;

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string; entityId?: string }>).detail;
      if (detail?.entityType !== 'iteration' || !detail.entityId) return;
      const row = props.rows.find((item) => item.id === detail.entityId);
      if (row) setEditing(row);
    };
    window.addEventListener('buggy:open-entity', open);
    return () => window.removeEventListener('buggy:open-entity', open);
  }, [props.rows]);

  return (
    <DataPage
      title="迭代管理"
      icon={CalendarRange}
      metrics={
        <section className="insight-strip">
          <MetricCard label="迭代总数" value={props.rows.length} detail={`${active} 个进行中`} tone="info" />
          <MetricCard label="需求" value={props.requirements?.length || 0} detail="已纳入当前项目" />
          <MetricCard label="执行计划" value={props.plans?.length || 0} detail="跨迭代测试轮次" />
          <MetricCard label="活跃缺陷" value={(props.bugs || []).filter((bug) => !['verified', 'closed'].includes(bug.status)).length} detail="未验证或关闭" tone="risk" />
        </section>
      }
    >
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索迭代目标" />
        <Select value={status} onChange={setStatus} values={iterationStatuses} dictionaryType="iterationStatus" emptyLabel="全部状态" />
        <span className="toolbar-summary">{rows.length} / {props.rows.length} 个迭代</span>
        {props.canManage && <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建迭代</button>}
      </Toolbar>
      <div className="split-layout">
        <DataTable
          headers={['迭代', '周期', '状态', '需求', '用例', '执行', '活跃缺陷', '更新时间', '操作']}
          emptyText="暂无迭代"
          rows={rows.map((row) => {
            const iterationRequirements = (props.requirements || []).filter((item) => item.iterationId === row.id);
            const requirementIds = new Set(iterationRequirements.map((item) => item.id));
            const iterationPlans = (props.plans || []).filter((plan) => plan.iterationId === row.id);
            const runItems = iterationPlans.flatMap((plan) => plan.runItems);
            const passed = runItems.filter((item) => item.status === 'passed').length;
            const activeBugs = (props.bugs || []).filter((bug) => bug.iterationId === row.id && !['verified', 'closed'].includes(bug.status)).length;
            return {
              key: row.id,
              onOpen: () => setEditing(row),
              openLabel: `打开迭代详情：${row.name}`,
              cells: [
                <div className="cell-main"><strong>{row.name}</strong><span>{row.goal || '未设置目标'}</span></div>,
                dateRange(row.startDate, row.endDate),
                <StatusBadge value={row.status} dictionaryType="iterationStatus" />,
                iterationRequirements.length,
                (props.cases || []).filter((item) => item.requirementId && requirementIds.has(item.requirementId)).length,
                `${passed}/${runItems.length}`,
                activeBugs,
                shortDate(row.updatedAt),
                <div className="row-actions">
                  <Button type="button" size="sm" onClick={() => setEditing(row)}><Pencil size={14} /> 详情</Button>
                  <Button type="button" size="sm" onClick={() => setReporting(row)}><FileText size={14} /> 报告</Button>
                  {props.canManage && (
                    <RowMoreMenu label={`更多操作：${row.name}`} trigger={<MoreHorizontal size={15} />}>
                      <DangerButton title={`删除迭代「${row.name}」？`} onConfirm={() => props.mutate(() => api.deleteIteration(row.id), '迭代已删除')} />
                    </RowMoreMenu>
                  )}
                </div>
              ]
            };
          })}
        />
        <aside className="side-summary">
          <strong>迭代概览</strong>
          {rows.slice(0, 5).map((row) => (
            <div key={row.id} className="summary-line">
              <span>{row.name}</span>
              <small>{labelOf(row.status)} · {dateRange(row.startDate, row.endDate)}</small>
            </div>
          ))}
        </aside>
      </div>
      {rows.length === 0 && (
        <EmptyState
          text="暂无迭代"
          detail="迭代用于汇总需求、执行计划和阶段风险。"
          action={props.canManage ? <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建迭代</button> : undefined}
        />
      )}
      <IterationDrawer
        title="新建迭代"
        open={creating}
        canWrite={props.canManage}
        onClose={() => setCreating(false)}
        onSubmit={async (form) => {
          await props.mutate(
            () => api.createIteration({ projectId: props.projectId, name: text(form, 'name'), goal: text(form, 'goal'), startDate: text(form, 'startDate') || undefined, endDate: text(form, 'endDate') || undefined, status: text(form, 'status') as never }),
            '迭代已创建'
          );
          setCreating(false);
        }}
      />
      <IterationDrawer
        title="编辑迭代"
        row={editing || undefined}
        open={Boolean(editing)}
        canWrite={props.canManage}
        onClose={() => setEditing(null)}
        onSubmit={async (form) => {
          if (!editing) return;
          await props.mutate(
            () => api.updateIteration(editing.id, { name: text(form, 'name'), goal: text(form, 'goal'), startDate: text(form, 'startDate') || undefined, endDate: text(form, 'endDate') || undefined, status: text(form, 'status') as never }),
            '迭代已保存'
          );
          setEditing(null);
        }}
      />
      {reporting && (
        <ScopedReportDrawer
          open={Boolean(reporting)}
          title="迭代质量报告"
          subtitle={reporting.name}
          projectId={props.projectId}
          iterationId={reporting.id}
          onClose={() => setReporting(null)}
        />
      )}
    </DataPage>
  );
}

export function IterationDrawer(props: { title: string; row?: Iteration; open: boolean; canWrite?: boolean; onClose: () => void; onSubmit: (form: FormData) => Promise<void> }) {
  return (
    <Drawer title={props.title} subtitle={props.row?.name || '规划迭代目标和时间范围'} open={props.open} onClose={props.onClose}>
      <HookForm
        defaultValues={{ name: props.row?.name || '', goal: props.row?.goal || '', startDate: dateInput(props.row?.startDate), endDate: dateInput(props.row?.endDate), status: props.row?.status || 'planning' }}
        onSubmit={async (form) => props.onSubmit(form)}
      >
        {(register) => (
          <>
            <Field><FieldLabel>迭代名称</FieldLabel><Input {...register('name')} required /></Field>
            <Field><FieldLabel>迭代目标</FieldLabel><Input {...register('goal')} /></Field>
            <div className="field-grid two">
              <Field><FieldLabel>开始日期</FieldLabel><Input {...register('startDate')} type="date" /></Field>
              <Field><FieldLabel>结束日期</FieldLabel><Input {...register('endDate')} type="date" /></Field>
            </div>
            <Field><FieldLabel>状态</FieldLabel><Select name="status" register={register} values={iterationStatuses} dictionaryType="iterationStatus" defaultValue={props.row?.status || 'planning'} /></Field>
            <FormActions>
              <Button type="button" onClick={props.onClose}>取消</Button>
              {props.canWrite && <Button variant="primary"><Save size={15} /> 保存</Button>}
            </FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}
