import { useEffect, useMemo, useState } from 'react';
import { FileText, Flag, MoreHorizontal, Pencil, Plus, Save, Send } from 'lucide-react';
import type { Bug, Iteration, Requirement, TestCase, UserProfile } from '@buggy/shared-types';
import type { UseFormRegister } from 'react-hook-form';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { acceptanceStatuses, priorities, requirementStatuses } from '../../app/constants.js';
import type { StringFormValues } from '../../app/types.js';
import { iterationName, matchKeyword, requirementPayload, shortDate, testCasePayload, userName } from '../../app/workspace-utils.js';
import { DataPage, DataTable, DangerButton, Drawer, EmptyState, FilterChips, HookForm, MetricCard, registerField, SearchBox, Select, StatusBadge, TextConfirmDialog, Toolbar } from './common.js';
import { TestCaseDrawer } from './cases.js';
import { ScopedReportDrawer } from './reportsSettings.js';

export function RequirementSection(props: {
  projectId: string;
  iterations: Iteration[];
  users: UserProfile[];
  rows: Requirement[];
  cases?: TestCase[];
  bugs?: Bug[];
  canWrite?: boolean;
  canManage?: boolean;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [caseRequirement, setCaseRequirement] = useState<Requirement | null>(null);
  const [reporting, setReporting] = useState<Requirement | null>(null);
  const [statusChange, setStatusChange] = useState<{ row: Requirement; status: Requirement['status'] } | null>(null);
  const [acceptanceChange, setAcceptanceChange] = useState<{ row: Requirement; action: ReturnType<typeof requirementAcceptanceActions>[number] } | null>(null);
  const rows = useMemo(
    () => props.rows.filter((row) => (!status || row.status === status) && (!ownerId || row.ownerId === ownerId) && matchKeyword([row.title, row.description || '', row.priority], keyword)),
    [props.rows, keyword, status, ownerId]
  );

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('buggy:filters-change', { detail: { tab: 'requirements', filters: { keyword, status, ownerId } } }));
  }, [keyword, status, ownerId]);

  useEffect(() => {
    const apply = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: string; filters: Record<string, unknown> }>).detail;
      if (detail?.tab !== 'requirements') return;
      setKeyword(typeof detail.filters.keyword === 'string' ? detail.filters.keyword : '');
      setStatus(typeof detail.filters.status === 'string' ? detail.filters.status : '');
      setOwnerId(typeof detail.filters.ownerId === 'string' ? detail.filters.ownerId : '');
    };
    window.addEventListener('buggy:apply-view', apply);
    return () => window.removeEventListener('buggy:apply-view', apply);
  }, []);

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string; entityId?: string }>).detail;
      if (detail?.entityType !== 'requirement' || !detail.entityId) return;
      const row = props.rows.find((item) => item.id === detail.entityId);
      if (row) setEditing(row);
    };
    window.addEventListener('buggy:open-entity', open);
    return () => window.removeEventListener('buggy:open-entity', open);
  }, [props.rows]);

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
          <button key={item} className={status === item ? 'active' : ''} type="button" onClick={() => setStatus(item)}><StatusBadge value={item} dictionaryType="requirementStatus" /></button>
        ))}
      </div>
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索需求标题、描述" />
        <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          <option value="">全部负责人</option>
          {props.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}
        </select>
        <span className="toolbar-summary">{rows.length} / {props.rows.length} 个需求</span>
        {props.canWrite && <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建需求</button>}
      </Toolbar>
      <FilterChips filters={[
        { label: '状态', value: status, onClear: () => setStatus('') },
        { label: '负责人', value: ownerId ? userName(props.users, ownerId) : '', onClear: () => setOwnerId('') }
      ]} />
      <DataTable
        headers={['需求', '迭代', '负责人', '准入', '风险', '优先级', '状态', '用例', 'Bug', '更新时间', '操作']}
        emptyText="暂无需求"
        rows={rows.map((row) => [
          <div className="cell-main"><strong>{row.title}</strong><span>{row.description || '未填写描述'}</span></div>,
          row.iterationId ? iterationName(props.iterations, row.iterationId) : '-',
          row.ownerId ? userName(props.users, row.ownerId) : '-',
          <div className="cell-main">
            <StatusBadge value={row.qualityGateResult?.status === 'pass' ? 'approved' : row.acceptanceStatus || 'not_ready'} />
            <span>{row.qualityGateResult?.summary || '待检查'}</span>
          </div>,
          <div className="cell-main"><strong>{row.riskOwnerId ? userName(props.users, row.riskOwnerId) : '-'}</strong><span>{row.dueDate ? `截止 ${shortDate(row.dueDate)}` : row.riskNote || '暂无风险'}</span></div>,
          <StatusBadge value={row.priority} dictionaryType="priority" />,
          <StatusBadge value={row.status} dictionaryType="requirementStatus" />,
          (props.cases || []).filter((item) => item.requirementId === row.id).length,
          (props.bugs || []).filter((item) => item.requirementId === row.id).length,
          shortDate(row.updatedAt),
          <div className="row-actions">
            <Button type="button" size="sm" onClick={() => setReporting(row)}><FileText size={14} /> 验收报告</Button>
            {props.canWrite && <Button type="button" size="sm" onClick={() => setCaseRequirement(row)}><Plus size={14} /> 建用例</Button>}
            <details className="row-more-menu">
              <summary aria-label={`更多操作：${row.title}`}>
                <MoreHorizontal size={15} />
              </summary>
              <div>
                <Button type="button" size="sm" onClick={() => setEditing(row)}><Pencil size={14} /> 编辑需求</Button>
                {props.canWrite && requirementStatuses.filter((item) => item !== row.status).map((nextStatus) => (
                  <Button key={nextStatus} type="button" size="sm" onClick={() => setStatusChange({ row, status: nextStatus })}>
                    流转为 {labelOf(nextStatus)}
                  </Button>
                ))}
                {props.canWrite && requirementAcceptanceActions(row.acceptanceStatus || 'not_ready').map((action) => (
                  <Button key={action.status} type="button" size="sm" onClick={() => setAcceptanceChange({ row, action })}>
                    {action.label}
                  </Button>
                ))}
                {props.canWrite && <Button type="button" size="sm" onClick={() => props.mutate(() => api.sendLark(row.id), 'Lark 日报已发送')}><Send size={14} /> Lark</Button>}
                {props.canManage && <DangerButton title={`删除需求「${row.title}」？`} description={`关联 ${(props.cases || []).filter((item) => item.requirementId === row.id).length} 条用例、${(props.bugs || []).filter((item) => item.requirementId === row.id).length} 个 Bug。有关联数据时系统会阻止删除，请先迁移或清理。`} onConfirm={() => props.mutate(() => api.deleteRequirement(row.id), '需求已删除')} />}
              </div>
            </details>
          </div>
        ])}
      />
      {rows.length === 0 && (
        <EmptyState
          text="暂无需求"
          detail="先创建需求，再从需求行直接生成覆盖用例。"
          action={props.canWrite ? <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建需求</button> : undefined}
        />
      )}
      <RequirementDrawer title="新建需求" open={creating} iterations={props.iterations} users={props.users} canWrite={props.canWrite} onClose={() => setCreating(false)} onSubmit={async (form) => {
        await props.mutate(() => api.createRequirement(requirementPayload(form, props.projectId)), '需求已创建');
        setCreating(false);
      }} />
      <RequirementDrawer title="编辑需求" row={editing || undefined} open={Boolean(editing)} iterations={props.iterations} users={props.users} canWrite={props.canWrite} onClose={() => setEditing(null)} onSubmit={async (form) => {
        if (!editing) return;
        await props.mutate(() => api.updateRequirement(editing.id, requirementPayload(form, props.projectId)), '需求已保存');
        setEditing(null);
      }} />
      <TextConfirmDialog
        open={Boolean(statusChange)}
        title={statusChange ? `确认流转需求状态为「${labelOf(statusChange.status)}」？` : '确认流转需求状态？'}
        description={statusChange?.row.title}
        label="流转原因"
        placeholder="说明状态变更依据、阻塞原因或交付结论"
        confirmText="确认流转"
        destructive={statusChange?.status === 'blocked'}
        onCancel={() => setStatusChange(null)}
        onConfirm={async (note) => {
          if (!statusChange) return;
          await props.mutate(() => api.updateRequirement(statusChange.row.id, { status: statusChange.status, statusReason: note }), '需求状态已更新');
          setStatusChange(null);
        }}
      />
      <TextConfirmDialog
        open={Boolean(acceptanceChange)}
        title={acceptanceChange ? `确认${acceptanceChange.action.label}？` : '确认验收流转？'}
        description={acceptanceChange?.row.title}
        label="验收说明"
        placeholder="说明验收依据、风险或驳回原因"
        confirmText={acceptanceChange?.action.label || '确认'}
        destructive={acceptanceChange?.action.status === 'rejected'}
        onCancel={() => setAcceptanceChange(null)}
        onConfirm={async (note) => {
          if (!acceptanceChange) return;
          await props.mutate(
            () => api.updateRequirement(acceptanceChange.row.id, {
              acceptanceStatus: acceptanceChange.action.status,
              acceptanceReason: note,
              ...(acceptanceChange.action.status === 'approved' ? { status: 'done' as const, statusReason: note } : {})
            }),
            acceptanceChange.action.message
          );
          setAcceptanceChange(null);
        }}
      />
      <TestCaseDrawer
        title="从需求新建用例"
        open={Boolean(caseRequirement)}
        requirements={props.rows}
        users={props.users}
        defaultRequirementId={caseRequirement?.id}
        canWrite={props.canWrite}
        onClose={() => setCaseRequirement(null)}
        onSubmit={async (form) => {
          await props.mutate(() => api.createTestCase(testCasePayload(form, props.projectId)), '用例已从需求创建');
          setCaseRequirement(null);
        }}
      />
      {reporting && (
        <ScopedReportDrawer
          open={Boolean(reporting)}
          title="需求验收报告"
          subtitle={reporting.title}
          projectId={props.projectId}
          requirementId={reporting.id}
          onClose={() => setReporting(null)}
        />
      )}
    </DataPage>
  );
}

function requirementAcceptanceActions(status: Requirement['acceptanceStatus']) {
  if (status === 'not_ready' || status === 'rejected') return [{ status: 'ready' as const, label: '提交验收', message: '需求已提交验收' }];
  if (status === 'ready') return [
    { status: 'approved' as const, label: '通过验收', message: '需求验收已通过' },
    { status: 'rejected' as const, label: '驳回验收', message: '需求验收已驳回' }
  ];
  return [];
}

export function RequirementFields(props: { row?: Requirement; iterations: Iteration[]; users: UserProfile[]; register?: UseFormRegister<StringFormValues> }) {
  return (
    <div className="field-grid">
      <Field className="span-two"><FieldLabel>需求标题</FieldLabel><Input {...registerField(props.register, 'title')} defaultValue={props.row?.title} required /></Field>
      <Field><FieldLabel>绑定迭代</FieldLabel><select {...registerField(props.register, 'iterationId')} defaultValue={props.row?.iterationId || ''}><option value="">不绑定迭代</option>{props.iterations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field><FieldLabel>负责人</FieldLabel><select {...registerField(props.register, 'ownerId')} defaultValue={props.row?.ownerId || ''}><option value="">未指派负责人</option>{props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select></Field>
      <Field><FieldLabel>优先级</FieldLabel><Select name="priority" register={props.register} values={priorities} dictionaryType="priority" defaultValue={props.row?.priority || 'P2'} /></Field>
      <Field><FieldLabel>状态</FieldLabel><Select name="status" register={props.register} values={requirementStatuses} dictionaryType="requirementStatus" defaultValue={props.row?.status || 'ready'} /></Field>
      <Field className="span-four"><FieldLabel>需求描述</FieldLabel><Textarea {...registerField(props.register, 'description')} defaultValue={props.row?.description} /></Field>
      <details className="advanced-fields span-four" open={Boolean(props.row)}>
        <summary>高级信息</summary>
        <div className="field-grid">
          <Field><FieldLabel>风险负责人</FieldLabel><select {...registerField(props.register, 'riskOwnerId')} defaultValue={props.row?.riskOwnerId || ''}><option value="">未设置风险负责人</option>{props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select></Field>
          <Field><FieldLabel>风险截止时间</FieldLabel><Input type="date" {...registerField(props.register, 'dueDate')} defaultValue={props.row?.dueDate ? props.row.dueDate.slice(0, 10) : ''} /></Field>
          <Field><FieldLabel>验收状态</FieldLabel><Select name="acceptanceStatus" register={props.register} values={acceptanceStatuses} defaultValue={props.row?.acceptanceStatus || 'not_ready'} /></Field>
          <Field><FieldLabel>验收人</FieldLabel><select {...registerField(props.register, 'reviewerId')} defaultValue={props.row?.reviewerId || ''}><option value="">未指定验收人</option>{props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select></Field>
          <Field className="span-two"><FieldLabel>Lark Webhook</FieldLabel><Input {...registerField(props.register, 'larkWebhook')} defaultValue={props.row?.larkWebhook} /></Field>
          <Field className="span-two"><FieldLabel>风险说明</FieldLabel><Input {...registerField(props.register, 'riskNote')} defaultValue={props.row?.riskNote} placeholder="风险原因、依赖方或处理策略" /></Field>
        </div>
      </details>
    </div>
  );
}

export function RequirementDrawer(props: { title: string; row?: Requirement; open: boolean; iterations: Iteration[]; users: UserProfile[]; canWrite?: boolean; onClose: () => void; onSubmit: (form: FormData) => Promise<void> }) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '维护需求状态、负责人和描述'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <RequirementFields row={props.row} iterations={props.iterations} users={props.users} register={register} />
            {props.row && <RequirementWorkflowHistory row={props.row} />}
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button>{props.canWrite && <Button variant="primary"><Save size={15} /> 保存需求</Button>}</FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

function RequirementWorkflowHistory(props: { row: Requirement }) {
  return (
    <section className="history-panel span-four">
      <div className="sub-title">验收与状态历史</div>
      <div className="timeline-list compact-timeline">
        {(props.row.workflowHistory || []).length === 0 ? <span className="muted">暂无历史</span> : (props.row.workflowHistory || []).map((item) => (
          <article key={item.id}>
            <strong>{workflowLabel(item.action)}{item.fromStatus || item.toStatus ? ` · ${item.fromStatus ? labelOf(item.fromStatus) : '-'} -> ${item.toStatus ? labelOf(item.toStatus) : '-'}` : ''}</strong>
            <span>{item.operatorName || '系统'} · {new Date(item.createdAt).toLocaleString('zh-CN')}</span>
            {item.note && <p>{item.note}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function workflowLabel(action: string) {
  if (action === 'acceptance_changed') return '验收状态变更';
  if (action === 'status_changed') return '需求状态变更';
  if (action === 'created') return '创建';
  return action;
}
