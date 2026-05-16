import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bug as BugIcon, CheckCircle2, MessageSquare, Paperclip, Pencil, Plus, RotateCcw, Save } from 'lucide-react';
import type { Bug, BugStatus, PageResult, Requirement, TestCase, TestPlan, UserProfile } from '@buggy/shared-types';
import type { UseFormRegister } from 'react-hook-form';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { bugStatuses, priorities, severities } from '../../app/constants.js';
import type { StringFormValues } from '../../app/types.js';
import { bugPayload, matchKeyword, requirementTitle, shortDate, testCasePayload, userName } from '../../app/workspace-utils.js';
import { ColumnChooser, DataPage, DataTable, DangerButton, Drawer, EmptyState, FilterChips, HookForm, MetricCard, Pagination, registerField, SearchBox, Select, StatusBadge, TextConfirmDialog, Toolbar } from './common.js';

const bugColumns = [
  { key: 'bug', label: 'Bug', locked: true, sortKey: 'title' },
  { key: 'source', label: '来源' },
  { key: 'assignee', label: '负责人' },
  { key: 'collab', label: '协作' },
  { key: 'sla', label: 'SLA' },
  { key: 'severity', label: '严重级别', sortKey: 'severity' },
  { key: 'priority', label: '优先级', sortKey: 'priority' },
  { key: 'status', label: '状态', sortKey: 'status' },
  { key: 'updatedAt', label: '更新时间', sortKey: 'updatedAt' },
  { key: 'actions', label: '操作', locked: true }
];

const defaultBugColumns = bugColumns.map((column) => column.key);

export function BugSection(props: {
  projectId: string;
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  users: UserProfile[];
  rows: Bug[];
  globalKeyword?: string;
  canWrite?: boolean;
  canManage?: boolean;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [visibleColumns, setVisibleColumns] = useState(defaultBugColumns);
  const [pageResult, setPageResult] = useState<PageResult<Bug>>({ total: props.rows.length, page: 1, pageSize, items: props.rows.slice(0, pageSize) });
  const [loadingPage, setLoadingPage] = useState(false);
  const [transition, setTransition] = useState<{ bug: Bug; status: BugStatus; label: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bug | null>(null);
  const editingRow = editing ? props.rows.find((row) => row.id === editing.id) || editing : null;
  const effectiveKeyword = keyword || props.globalKeyword || '';
  const rows = pageResult.items;

  useEffect(() => {
    setPage(1);
  }, [effectiveKeyword, status, severity, assigneeId, pageSize]);

  useEffect(() => {
    let active = true;
    setLoadingPage(true);
    api
      .bugPage(props.projectId, { page, pageSize, keyword: effectiveKeyword, status, severity, assigneeId, sortBy, sortOrder })
      .then((result) => {
        if (active) setPageResult(result);
      })
      .catch(() => {
        if (!active) return;
        const fallback = props.rows.filter((row) => (!status || row.status === status) && (!severity || row.severity === severity) && (!assigneeId || row.assigneeId === assigneeId) && matchKeyword([row.title, row.actualResult || '', row.reproduceSteps || '', row.severity], effectiveKeyword));
        setPageResult({ total: fallback.length, page, pageSize, items: fallback.slice((page - 1) * pageSize, page * pageSize) });
      })
      .finally(() => {
        if (active) setLoadingPage(false);
      });
    return () => {
      active = false;
    };
  }, [props.projectId, props.rows, page, pageSize, effectiveKeyword, status, severity, assigneeId, sortBy, sortOrder]);

  useEffect(() => {
    const filters = { keyword, status, severity, assigneeId, pageSize, sortBy, sortOrder, columns: visibleColumns };
    window.dispatchEvent(new CustomEvent('buggy:filters-change', { detail: { tab: 'bugs', filters } }));
  }, [keyword, status, severity, assigneeId, pageSize, sortBy, sortOrder, visibleColumns]);

  useEffect(() => {
    const apply = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: string; filters: Record<string, unknown> }>).detail;
      if (detail?.tab !== 'bugs') return;
      const filters = detail.filters || {};
      setKeyword(typeof filters.keyword === 'string' ? filters.keyword : '');
      setStatus(typeof filters.status === 'string' ? filters.status : '');
      setSeverity(typeof filters.severity === 'string' ? filters.severity : '');
      setAssigneeId(typeof filters.assigneeId === 'string' ? filters.assigneeId : '');
      setPageSize(typeof filters.pageSize === 'number' ? filters.pageSize : 20);
      setSortBy(typeof filters.sortBy === 'string' ? filters.sortBy : 'updatedAt');
      setSortOrder(filters.sortOrder === 'asc' ? 'asc' : 'desc');
      if (Array.isArray(filters.columns)) setVisibleColumns(filters.columns.filter((item): item is string => typeof item === 'string'));
    };
    window.addEventListener('buggy:apply-view', apply);
    return () => window.removeEventListener('buggy:apply-view', apply);
  }, []);

  const sorted = (key: string) => {
    if (sortBy === key) setSortOrder((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };
  const visibleDefinitions = bugColumns.filter((column) => visibleColumns.includes(column.key));

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
        <Select value={status} onChange={setStatus} values={bugStatuses} dictionaryType="bugStatus" emptyLabel="全部状态" />
        <Select value={severity} onChange={setSeverity} values={severities} dictionaryType="severity" emptyLabel="全部严重级别" />
        <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">全部负责人</option>
          {props.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}
        </select>
        <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="每页条数">
          <option value={10}>10 / 页</option>
          <option value={20}>20 / 页</option>
          <option value={50}>50 / 页</option>
        </select>
        <ColumnChooser columns={bugColumns} visible={visibleColumns} onChange={setVisibleColumns} />
        <span className="toolbar-summary">{loadingPage ? '加载中...' : `${pageResult.total} 个 Bug`}</span>
        {props.canWrite && <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建 Bug</button>}
      </Toolbar>
      <FilterChips filters={[
        { label: '状态', value: status, onClear: () => setStatus('') },
        { label: '严重级别', value: severity, onClear: () => setSeverity('') },
        { label: '负责人', value: assigneeId ? userName(props.users, assigneeId) : '', onClear: () => setAssigneeId('') }
      ]} />
      <DataTable
        headers={visibleDefinitions.map((column) => column.label)}
        sortKeys={visibleDefinitions.map((column) => column.sortKey || '')}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={sorted}
        emptyText="暂无 Bug"
        rows={rows.map((row) => {
          const cells: Record<string, ReactNode> = {
            bug: <div className="cell-main"><strong>{row.title}</strong><span>{row.actualResult || row.reproduceSteps || '未填写问题详情'}</span></div>,
            source: bugSource(row, props.requirements, props.cases, props.plans),
            assignee: row.assigneeId ? userName(props.users, row.assigneeId) : '-',
            collab: `${row.comments?.length || 0} 评论 · ${row.attachments?.length || 0} 附件${row.duplicateOfId ? ' · 重复' : ''}`,
            sla: slaText(row),
            severity: <StatusBadge value={row.severity} dictionaryType="severity" />,
            priority: <StatusBadge value={row.priority} dictionaryType="priority" />,
            status: <StatusBadge value={row.status} dictionaryType="bugStatus" />,
            updatedAt: shortDate(row.updatedAt),
            actions: <div className="row-actions">
              {props.canWrite && nextBugActions(row.status).map((action) => (
                <Button key={action.status} type="button" size="sm" onClick={() => setTransition({ bug: row, status: action.status, label: action.label })}>
                  <action.icon size={14} /> {action.label}
                </Button>
              ))}
              <Button type="button" size="sm" onClick={() => setEditing(row)}><Pencil size={14} /> 详情</Button>
              {props.canManage && <DangerButton title={`删除 Bug「${row.title}」？`} onConfirm={() => props.mutate(() => api.deleteBug(row.id), 'Bug 已删除')} />}
            </div>
          };
          return visibleDefinitions.map((column) => cells[column.key]);
        })}
      />
      <Pagination page={pageResult.page} pageSize={pageResult.pageSize} total={pageResult.total} onPage={setPage} />
      {rows.length === 0 && (
        <EmptyState
          text="暂无 Bug"
          detail="执行失败或线上问题都可以在这里沉淀，并关联到需求、用例和测试计划。"
          action={props.canWrite ? <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建 Bug</button> : undefined}
        />
      )}
      <BugDrawer title="新建 Bug" open={creating} requirements={props.requirements} cases={props.cases} plans={props.plans} bugs={props.rows} users={props.users} canWrite={props.canWrite} onClose={() => setCreating(false)} onSubmit={async (form) => {
        await props.mutate(() => api.createBug(bugPayload(form, props.projectId)), 'Bug 已创建');
        setCreating(false);
      }} />
      <BugDrawer title="编辑 Bug" row={editingRow || undefined} open={Boolean(editing)} requirements={props.requirements} cases={props.cases} plans={props.plans} bugs={props.rows} users={props.users} canWrite={props.canWrite} onClose={() => setEditing(null)} onSubmit={async (form) => {
        if (!editingRow) return;
        await props.mutate(() => api.updateBug(editingRow.id, bugPayload(form, props.projectId)), 'Bug 已保存');
        setEditing(null);
      }} onComment={async (body) => {
        if (!editingRow) return;
        await props.mutate(() => api.addBugComment(editingRow.id, body), '评论已添加');
      }} onAttachment={async (attachment) => {
        if (!editingRow) return;
        await props.mutate(() => api.addBugAttachment(editingRow.id, attachment), '附件链接已添加');
      }} onFileAttachment={async (file) => {
        if (!editingRow) return;
        await props.mutate(() => api.uploadBugAttachment(editingRow.id, file), '附件已上传');
      }} />
      <TextConfirmDialog
        open={Boolean(transition)}
        title={transition ? `确认${transition.label} Bug？` : '确认流转 Bug？'}
        description={transition?.bug.title}
        label="流转原因"
        placeholder="填写修复说明、验证结论或重开原因"
        confirmText={transition?.label || '确认'}
        destructive={transition?.status === 'reopened'}
        onCancel={() => setTransition(null)}
        onConfirm={async (reason) => {
          if (!transition) return;
          await props.mutate(() => api.transitionBug(transition.bug.id, { nextStatus: transition.status, reason }), 'Bug 状态已流转');
          setTransition(null);
        }}
      />
    </DataPage>
  );
}

function bugSource(row: Bug, requirements: Requirement[], cases: TestCase[], plans: TestPlan[]) {
  const parts = [
    row.requirementId ? requirementTitle(requirements, row.requirementId) : '',
    row.testCaseId ? cases.find((item) => item.id === row.testCaseId)?.title || '关联用例' : '',
    row.testPlanId ? plans.find((item) => item.id === row.testPlanId)?.name || '关联计划' : ''
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : '-';
}

function slaText(row: Bug) {
  if (!row.dueAt) return '-';
  const due = new Date(row.dueAt).getTime();
  const closed = ['verified', 'closed'].includes(row.status);
  const overdue = due < Date.now() && !closed;
  return `${overdue ? '逾期 ' : ''}${shortDate(row.dueAt)}`;
}

export function BugFields(props: { row?: Bug; requirements: Requirement[]; cases: TestCase[]; plans: TestPlan[]; bugs: Bug[]; users: UserProfile[]; register?: UseFormRegister<StringFormValues> }) {
  return (
    <div className="field-grid">
      <Field className="span-two"><FieldLabel>Bug 标题</FieldLabel><Input {...registerField(props.register, 'title')} defaultValue={props.row?.title} required /></Field>
      <Field><FieldLabel>关联需求</FieldLabel><select {...registerField(props.register, 'requirementId')} defaultValue={props.row?.requirementId || ''}><option value="">不绑定需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      <Field><FieldLabel>关联用例</FieldLabel><select {...registerField(props.register, 'testCaseId')} defaultValue={props.row?.testCaseId || ''}><option value="">不绑定用例</option>{props.cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      <Field><FieldLabel>关联计划</FieldLabel><select {...registerField(props.register, 'testPlanId')} defaultValue={props.row?.testPlanId || ''}><option value="">不绑定计划</option>{props.plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field><FieldLabel>负责人</FieldLabel><select {...registerField(props.register, 'assigneeId')} defaultValue={props.row?.assigneeId || ''}><option value="">未指派</option>{props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select></Field>
      <Field><FieldLabel>重复缺陷</FieldLabel><select {...registerField(props.register, 'duplicateOfId')} defaultValue={props.row?.duplicateOfId || ''}><option value="">不标记重复</option>{props.bugs.filter((item) => item.id !== props.row?.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      <Field><FieldLabel>严重级别</FieldLabel><Select name="severity" register={props.register} values={severities} dictionaryType="severity" defaultValue={props.row?.severity || 'S2'} /></Field>
      <Field><FieldLabel>优先级</FieldLabel><Select name="priority" register={props.register} values={priorities} dictionaryType="priority" defaultValue={props.row?.priority || 'P2'} /></Field>
      <Field>
        <FieldLabel>{props.row ? '当前状态' : '状态'}</FieldLabel>
        {props.row ? (
          <div className="readonly-status-field">
            <StatusBadge value={props.row.status} dictionaryType="bugStatus" />
            <input type="hidden" {...registerField(props.register, 'status')} value={props.row.status} readOnly />
          </div>
        ) : (
          <Select name="status" register={props.register} values={bugStatuses} dictionaryType="bugStatus" defaultValue="open" />
        )}
      </Field>
      <Field><FieldLabel>SLA 截止时间</FieldLabel><Input type="date" {...registerField(props.register, 'dueAt')} defaultValue={props.row?.dueAt ? props.row.dueAt.slice(0, 10) : ''} /></Field>
      <Field className="span-four"><FieldLabel>复现步骤</FieldLabel><Textarea {...registerField(props.register, 'reproduceSteps')} defaultValue={props.row?.reproduceSteps} /></Field>
      <Field className="span-two"><FieldLabel>实际结果</FieldLabel><Textarea {...registerField(props.register, 'actualResult')} defaultValue={props.row?.actualResult} /></Field>
      <Field className="span-two"><FieldLabel>期望结果</FieldLabel><Textarea {...registerField(props.register, 'expectedResult')} defaultValue={props.row?.expectedResult} /></Field>
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
  bugs: Bug[];
  users: UserProfile[];
  canWrite?: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
  onComment?: (body: string) => Promise<void>;
  onAttachment?: (attachment: { name: string; url: string }) => Promise<void>;
  onFileAttachment?: (file: File) => Promise<void>;
}) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '记录复现步骤、预期结果和责任人'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <BugFields row={props.row} requirements={props.requirements} cases={props.cases} plans={props.plans} bugs={props.bugs} users={props.users} register={register} />
            {props.row && <BugCollaboration row={props.row} canWrite={props.canWrite} onComment={props.onComment} onAttachment={props.onAttachment} onFileAttachment={props.onFileAttachment} />}
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button>{props.canWrite && <Button variant="primary"><Save size={15} /> 保存 Bug</Button>}</FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

function BugCollaboration(props: { row: Bug; canWrite?: boolean; onComment?: (body: string) => Promise<void>; onAttachment?: (attachment: { name: string; url: string }) => Promise<void>; onFileAttachment?: (file: File) => Promise<void> }) {
  const [commentBody, setCommentBody] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  return (
    <div className="bug-collab span-four">
      <section>
        <div className="sub-title"><MessageSquare size={16} /> 协作评论</div>
        <div className="timeline-list">
          {(props.row.comments || []).length === 0 ? <span className="muted">暂无评论</span> : (props.row.comments || []).map((comment) => (
            <article key={comment.id}>
              <strong>{comment.authorName || '成员'}</strong>
              <span>{new Date(comment.createdAt).toLocaleString('zh-CN')}</span>
              <p>{comment.body}</p>
            </article>
          ))}
        </div>
        {props.canWrite && <div className="inline-form compact">
          <Input value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="补充排查进展、修复说明或验证结论" />
          <Button type="button" onClick={async () => {
            const body = commentBody.trim();
            if (!body) return;
            await props.onComment?.(body);
            setCommentBody('');
          }}><MessageSquare size={15} /> 添加评论</Button>
        </div>}
      </section>
      <section>
        <div className="sub-title"><Paperclip size={16} /> 附件链接</div>
        <div className="attachment-list">
          {(props.row.attachments || []).length === 0 ? <span className="muted">暂无附件</span> : (props.row.attachments || []).map((attachment) => (
            <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer">{attachment.name}{attachment.size ? ` · ${Math.round(attachment.size / 1024)}KB` : ''}</a>
          ))}
        </div>
        {props.canWrite && <div className="inline-form compact">
          <Input type="file" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await props.onFileAttachment?.(file);
            event.target.value = '';
          }} />
          <Input value={attachmentName} onChange={(event) => setAttachmentName(event.target.value)} placeholder="附件名称" />
          <Input value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} placeholder="截图、日志或文档链接" />
          <Button type="button" onClick={async () => {
            const name = attachmentName.trim();
            const url = attachmentUrl.trim();
            if (!name || !url) return;
            await props.onAttachment?.({ name, url });
            setAttachmentName('');
            setAttachmentUrl('');
          }}><Paperclip size={15} /> 添加</Button>
        </div>}
      </section>
      <section>
        <div className="sub-title">状态历史</div>
        <div className="timeline-list compact-timeline">
          {(props.row.statusHistory || []).length === 0 ? <span className="muted">暂无状态历史</span> : (props.row.statusHistory || []).map((item) => (
            <article key={item.id}>
              <strong>{item.fromStatus ? `${item.fromStatus} -> ${item.toStatus}` : item.toStatus}</strong>
              <span>{item.operatorName || '系统'} · {new Date(item.createdAt).toLocaleString('zh-CN')}</span>
              {item.note && <p>{item.note}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function nextBugActions(status: BugStatus): Array<{ status: BugStatus; label: string; message: string; icon: typeof CheckCircle2 }> {
  if (status === 'open' || status === 'reopened') return [{ status: 'in_progress', label: '处理', message: 'Bug 已进入处理', icon: Pencil }];
  if (status === 'in_progress') return [{ status: 'resolved', label: '解决', message: 'Bug 已标记解决', icon: CheckCircle2 }];
  if (status === 'resolved') return [
    { status: 'verified', label: '验证', message: 'Bug 已验证', icon: CheckCircle2 },
    { status: 'reopened', label: '重开', message: 'Bug 已重新打开', icon: RotateCcw }
  ];
  if (status === 'verified') return [{ status: 'closed', label: '关闭', message: 'Bug 已关闭', icon: CheckCircle2 }];
  return [];
}
