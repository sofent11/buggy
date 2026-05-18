import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bug as BugIcon, CheckCircle2, GitMerge, MessageSquare, MoreHorizontal, Paperclip, Pencil, PlayCircle, Plus, RotateCcw, Save, Trash2, UploadCloud } from 'lucide-react';
import type { Bug, BugAttachment, BugStatus, PageResult, ProjectMember, Requirement, TestCase, TestPlan, UserProfile } from '@buggy/shared-types';
import type { UseFormRegister } from 'react-hook-form';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { bugStatuses, bugTeams, priorities, severities, triageStatuses } from '../../app/constants.js';
import type { StringFormValues } from '../../app/types.js';
import { bugPayload, matchKeyword, requirementTitle, shortDate, userName } from '../../app/workspace-utils.js';
import { ColumnChooser, DataPage, DataTable, DangerButton, Drawer, EmptyState, FilterChips, HookForm, MetricCard, Pagination, registerField, SearchBox, Select, StatusBadge, TextConfirmDialog, Toolbar, RowMoreMenu } from './common.js';

const bugColumns = [
  { key: 'bug', label: '缺陷', locked: true, sortKey: 'title' },
  { key: 'source', label: '来源' },
  { key: 'triage', label: '分诊' },
  { key: 'team', label: '团队', sortKey: 'team' },
  { key: 'assignee', label: '负责人' },
  { key: 'collab', label: '协作' },
  { key: 'sla', label: 'SLA' },
  { key: 'severity', label: '严重级别', sortKey: 'severity' },
  { key: 'priority', label: '优先级', sortKey: 'priority' },
  { key: 'status', label: '状态', sortKey: 'status' },
  { key: 'updatedAt', label: '更新时间', sortKey: 'updatedAt' },
  { key: 'actions', label: '操作', locked: true }
];

const defaultBugColumns = ['bug', 'triage', 'assignee', 'sla', 'severity', 'status', 'updatedAt', 'actions'];
const unassignedTeamKey = '__unassigned';

export function BugSection(props: {
  projectId: string;
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  users: UserProfile[];
  projectMembers?: ProjectMember[];
  rows: Bug[];
  globalKeyword?: string;
  canCreate?: boolean;
  canWrite?: boolean;
  canManage?: boolean;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
  onOpenEntity?: (entityType: string, entityId?: string) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [triageStatus, setTriageStatus] = useState('');
  const [team, setTeam] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [visibleColumns, setVisibleColumns] = useState(defaultBugColumns);
  const [pageResult, setPageResult] = useState<PageResult<Bug>>({ total: props.rows.length, page: 1, pageSize, items: props.rows.slice(0, pageSize) });
  const [loadingPage, setLoadingPage] = useState(false);
  const [transition, setTransition] = useState<{ bug: Bug; status: BugStatus; label: string } | null>(null);
  const [duplicate, setDuplicate] = useState<Bug | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bug | null>(null);
  const editingRow = editing ? props.rows.find((row) => row.id === editing.id) || editing : null;
  const effectiveKeyword = keyword || props.globalKeyword || '';
  const rows = pageResult.items;
  const memberUsers = useMemo(() => {
    const ids = new Set((props.projectMembers || []).map((member) => member.userId));
    const scoped = ids.size ? props.users.filter((user) => ids.has(user.id)) : props.users;
    return scoped.length ? scoped : props.users;
  }, [props.projectMembers, props.users]);

  useEffect(() => {
    setPage(1);
  }, [effectiveKeyword, status, severity, triageStatus, team, assigneeId, pageSize]);

  useEffect(() => {
    let active = true;
    setLoadingPage(true);
    api
      .bugPage(props.projectId, { page, pageSize, keyword: effectiveKeyword, status, severity, triageStatus, team, assigneeId, sortBy, sortOrder })
      .then((result) => {
        if (active) setPageResult(result);
      })
      .catch(() => {
        if (!active) return;
        const fallback = props.rows.filter((row) =>
          (!status || row.status === status) &&
          (!severity || row.severity === severity) &&
          (!triageStatus || row.triageStatus === triageStatus) &&
          matchesTeam(row, team) &&
          (!assigneeId || row.assigneeId === assigneeId) &&
          matchKeyword([row.title, row.actualResult || '', row.reproduceSteps || '', row.severity, row.team || '', row.team ? labelOf(row.team) : '', row.environment || '', row.foundVersion || '', row.rootCause || ''], effectiveKeyword)
        );
        setPageResult({ total: fallback.length, page, pageSize, items: fallback.slice((page - 1) * pageSize, page * pageSize) });
      })
      .finally(() => {
        if (active) setLoadingPage(false);
      });
    return () => {
      active = false;
    };
  }, [props.projectId, props.rows, page, pageSize, effectiveKeyword, status, severity, triageStatus, team, assigneeId, sortBy, sortOrder]);

  useEffect(() => {
    const filters = { keyword, status, severity, triageStatus, team, assigneeId, pageSize, sortBy, sortOrder, columns: visibleColumns };
    window.dispatchEvent(new CustomEvent('buggy:filters-change', { detail: { tab: 'bugs', filters } }));
  }, [keyword, status, severity, triageStatus, team, assigneeId, pageSize, sortBy, sortOrder, visibleColumns]);

  useEffect(() => {
    const apply = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: string; filters: Record<string, unknown> }>).detail;
      if (detail?.tab !== 'bugs') return;
      const filters = detail.filters || {};
      setKeyword(typeof filters.keyword === 'string' ? filters.keyword : '');
      setStatus(typeof filters.status === 'string' ? filters.status : '');
      setSeverity(typeof filters.severity === 'string' ? filters.severity : '');
      setTriageStatus(typeof filters.triageStatus === 'string' ? filters.triageStatus : '');
      setTeam(typeof filters.team === 'string' ? filters.team : '');
      setAssigneeId(typeof filters.assigneeId === 'string' ? filters.assigneeId : '');
      setPageSize(typeof filters.pageSize === 'number' ? filters.pageSize : 20);
      setSortBy(typeof filters.sortBy === 'string' ? filters.sortBy : 'updatedAt');
      setSortOrder(filters.sortOrder === 'asc' ? 'asc' : 'desc');
      if (Array.isArray(filters.columns)) setVisibleColumns(filters.columns.filter((item): item is string => typeof item === 'string'));
    };
    window.addEventListener('buggy:apply-view', apply);
    return () => window.removeEventListener('buggy:apply-view', apply);
  }, []);

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string; entityId?: string }>).detail;
      if (detail?.entityType !== 'bug' || !detail.entityId) return;
      const row = props.rows.find((item) => item.id === detail.entityId);
      if (row) setEditing(row);
    };
    window.addEventListener('buggy:open-entity', open);
    return () => window.removeEventListener('buggy:open-entity', open);
  }, [props.rows]);

  const sorted = (key: string) => {
    if (sortBy === key) setSortOrder((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };
  const visibleDefinitions = bugColumns.filter((column) => visibleColumns.includes(column.key));
  const activeRows = props.rows.filter((row) => !['verified', 'closed'].includes(row.status));
  const teamGroups = useMemo(() => bugTeamGroups(props.rows), [props.rows]);
  const selectedTeamLabel = teamLabel(team);

  return (
    <DataPage
      title="缺陷管理"
      icon={BugIcon}
      metrics={
        <section className="insight-strip">
          <MetricCard label="缺陷总数" value={props.rows.length} detail={`${props.rows.filter((row) => !['verified', 'closed'].includes(row.status)).length} 活跃`} tone="info" />
          <MetricCard label="严重缺陷" value={props.rows.filter((row) => ['S0', 'S1'].includes(row.severity)).length} detail="S0/S1" tone="risk" />
          <MetricCard label="已解决" value={props.rows.filter((row) => row.status === 'resolved').length} detail="待验证" />
          <MetricCard label="团队视图" value={selectedTeamLabel} detail={`${activeRows.filter((row) => matchesTeam(row, team)).length} 活跃`} tone={team ? 'info' : 'neutral'} />
        </section>
      }
    >
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索缺陷、复现、实际结果" />
        <Select value={status} onChange={setStatus} values={bugStatuses} dictionaryType="bugStatus" emptyLabel="全部状态" />
        <Select value={severity} onChange={setSeverity} values={severities} dictionaryType="severity" emptyLabel="全部严重级别" />
        <Select value={triageStatus} onChange={setTriageStatus} values={triageStatuses} emptyLabel="全部分诊" />
        <Select value={team} onChange={setTeam} values={bugTeams} emptyLabel="全部团队" />
        <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">全部负责人</option>
          {memberUsers.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}
        </select>
        <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="每页条数">
          <option value={10}>10 / 页</option>
          <option value={20}>20 / 页</option>
          <option value={50}>50 / 页</option>
        </select>
        <ColumnChooser columns={bugColumns} visible={visibleColumns} onChange={setVisibleColumns} />
        <span className="toolbar-summary">{loadingPage ? '加载中...' : `${pageResult.total} 个缺陷`}</span>
        {props.canCreate && <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建缺陷</button>}
      </Toolbar>
      <FilterChips filters={[
        { label: '本页搜索', value: keyword, onClear: () => setKeyword('') },
        { label: '状态', value: status, onClear: () => setStatus('') },
        { label: '严重级别', value: severity, onClear: () => setSeverity('') },
        { label: '分诊', value: triageStatus, onClear: () => setTriageStatus('') },
        { label: '团队', value: team ? teamLabel(team) : '', onClear: () => setTeam('') },
        { label: '负责人', value: assigneeId ? userName(props.users, assigneeId) : '', onClear: () => setAssigneeId('') }
      ]} />
      <BugTriageBoard rows={props.rows} activeTriage={triageStatus} activeStatus={status} onTriage={setTriageStatus} onStatus={setStatus} />
      <BugTeamBoard groups={teamGroups} selectedTeam={team} onTeam={setTeam} />
      <DataTable
        headers={visibleDefinitions.map((column) => column.label)}
        sortKeys={visibleDefinitions.map((column) => column.sortKey || '')}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={sorted}
        emptyText="暂无缺陷"
        rows={rows.map((row) => {
          const cells: Record<string, ReactNode> = {
            bug: <div className="cell-main"><strong>{row.title}</strong><span>{row.actualResult || row.reproduceSteps || '未填写问题详情'}</span></div>,
            source: bugSource(row, props.requirements, props.cases, props.plans),
            triage: <StatusBadge value={row.triageStatus || 'new'} />,
            team: row.team ? <StatusBadge value={row.team} /> : '-',
            assignee: row.assigneeId ? userName(props.users, row.assigneeId) : '-',
            collab: `${row.comments?.length || 0} 评论 · ${row.attachments?.length || 0} 附件${row.duplicateOfId ? ' · 重复' : ''}`,
            sla: <SlaCell row={row} />,
            severity: <StatusBadge value={row.severity} dictionaryType="severity" />,
            priority: <StatusBadge value={row.priority} dictionaryType="priority" />,
            status: <StatusBadge value={row.status} dictionaryType="bugStatus" />,
            updatedAt: shortDate(row.updatedAt),
            actions: <BugRowActions
              row={row}
              canWrite={props.canWrite}
              canManage={props.canManage}
              onTransition={(action) => setTransition({ bug: row, status: action.status, label: action.label })}
              onEdit={() => setEditing(row)}
              onDuplicate={() => setDuplicate(row)}
              onDelete={() => props.mutate(() => api.deleteBug(row.id), '缺陷已删除')}
            />
          };
          return visibleDefinitions.map((column) => cells[column.key]);
        })}
      />
      <Pagination page={pageResult.page} pageSize={pageResult.pageSize} total={pageResult.total} onPage={setPage} />
      {rows.length === 0 && (
        <EmptyState
          text="暂无缺陷"
          detail="执行失败或线上问题都可以在这里沉淀，并关联到需求、用例和测试计划。"
          action={props.canCreate ? <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建缺陷</button> : undefined}
        />
      )}
      <BugDrawer title="新建缺陷" projectId={props.projectId} open={creating} requirements={props.requirements} cases={props.cases} plans={props.plans} bugs={props.rows} users={memberUsers} canWrite={props.canCreate} onClose={() => setCreating(false)} onDraftFileAttachment={async (file) => {
        const asset = await api.uploadFile(props.projectId, file);
        return asset;
      }} onSubmit={async (form, attachments) => {
        await props.mutate(() => api.createBug(bugPayload(form, props.projectId, attachments)), '缺陷已创建');
        setCreating(false);
      }} />
      <BugDrawer title="编辑缺陷" projectId={props.projectId} row={editingRow || undefined} open={Boolean(editing)} requirements={props.requirements} cases={props.cases} plans={props.plans} bugs={props.rows} users={memberUsers} canWrite={props.canWrite} onClose={() => setEditing(null)} onSubmit={async (form) => {
        if (!editingRow) return;
        await props.mutate(() => api.updateBug(editingRow.id, bugPayload(form, props.projectId)), '缺陷已保存');
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
      }} onOpenEntity={props.onOpenEntity} />
      <DuplicateBugDrawer
        row={duplicate || undefined}
        bugs={props.rows}
        open={Boolean(duplicate)}
        onClose={() => setDuplicate(null)}
        onSubmit={async (duplicateOfId, reason) => {
          if (!duplicate) return;
          await props.mutate(() => api.markDuplicateBug(duplicate.id, { duplicateOfId, reason }), '缺陷已标记为重复并关闭');
          setDuplicate(null);
        }}
      />
      <TextConfirmDialog
        open={Boolean(transition)}
        title={transition ? `确认${transition.label}缺陷？` : '确认流转缺陷？'}
        description={transition ? `${transition.bug.title} · ${labelOf(transition.bug.status)} -> ${labelOf(transition.status)}。${bugTransitionImpact(transition.status)}` : undefined}
        label={transition?.status === 'resolved' ? '修复说明' : transition?.status === 'verified' ? '验证结论' : '流转原因'}
        placeholder={transition?.status === 'resolved' ? '说明根因、修复版本和修复范围' : transition?.status === 'verified' ? '说明复测环境、数据和验证结论' : '填写处理说明或重开原因'}
        confirmText={transition?.label || '确认'}
        destructive={transition?.status === 'reopened'}
        onCancel={() => setTransition(null)}
        onConfirm={async (reason) => {
          if (!transition) return;
          await props.mutate(() => api.transitionBug(transition.bug.id, {
            nextStatus: transition.status,
            reason,
            resolution: transition.status === 'resolved' ? reason : undefined,
            verifyResult: ['verified', 'closed'].includes(transition.status) ? reason : undefined
          }), '缺陷状态已流转');
          setTransition(null);
        }}
      />
    </DataPage>
  );
}

function BugTeamBoard(props: { groups: BugTeamGroup[]; selectedTeam: string; onTeam: (value: string) => void }) {
  if (props.groups.length === 0) return null;
  return (
    <section className="workflow-lanes" aria-label="按团队查看缺陷">
      <button type="button" className={!props.selectedTeam ? 'active' : ''} onClick={() => props.onTeam('')}>
        <span>全部团队</span>
        <strong>{props.groups.reduce((sum, group) => sum + group.total, 0)}</strong>
        <small>{props.groups.reduce((sum, group) => sum + group.active, 0)} 活跃</small>
      </button>
      {props.groups.map((group) => (
        <button key={group.key} type="button" className={`${props.selectedTeam === group.key ? 'active' : ''} ${group.severe ? 'tone-risk' : ''}`} onClick={() => props.onTeam(group.key)}>
          <span>{group.label}</span>
          <strong>{group.total}</strong>
          <small>{group.active} 活跃 · {group.severe} 严重</small>
        </button>
      ))}
    </section>
  );
}

type BugTeamGroup = { key: string; label: string; total: number; active: number; severe: number };

function bugTeamGroups(rows: Bug[]): BugTeamGroup[] {
  const counts = new Map<string, BugTeamGroup>();
  for (const row of rows) {
    const key = row.team || unassignedTeamKey;
    const label = teamLabel(key);
    const current = counts.get(key) || { key, label, total: 0, active: 0, severe: 0 };
    current.total += 1;
    if (!['verified', 'closed'].includes(row.status)) current.active += 1;
    if (['S0', 'S1'].includes(row.severity)) current.severe += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((a, b) => b.active - a.active || b.total - a.total || a.label.localeCompare(b.label));
}

function matchesTeam(row: Bug, selectedTeam: string) {
  if (!selectedTeam) return true;
  if (selectedTeam === unassignedTeamKey) return !row.team;
  return row.team === selectedTeam;
}

function teamLabel(value: string) {
  if (!value) return '全部团队';
  if (value === unassignedTeamKey) return '未分配团队';
  return labelOf(value);
}

function bugSource(row: Bug, requirements: Requirement[], cases: TestCase[], plans: TestPlan[]) {
  const parts = [
    row.requirementId ? requirementTitle(requirements, row.requirementId) : '',
    row.testCaseId ? cases.find((item) => item.id === row.testCaseId)?.title || '关联用例' : '',
    row.testPlanId ? plans.find((item) => item.id === row.testPlanId)?.name || '关联计划' : ''
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : '-';
}

function BugRowActions(props: {
  row: Bug;
  canWrite?: boolean;
  canManage?: boolean;
  onTransition: (action: ReturnType<typeof nextBugActions>[number]) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void | Promise<void>;
}) {
  const actions = nextBugActions(props.row.status);
  const primaryAction = props.canWrite ? actions[0] : undefined;
  const secondaryActions = props.canWrite ? actions.slice(1) : [];
  return (
    <div className="row-actions compact-row-actions">
      {primaryAction && (
        <Button type="button" size="sm" onClick={() => props.onTransition(primaryAction)}>
          <primaryAction.icon size={14} /> {primaryAction.label}
        </Button>
      )}
      <RowMoreMenu label={`更多操作：${props.row.title}`} trigger={<MoreHorizontal size={15} />}>
        <Button type="button" size="sm" onClick={props.onEdit}><Pencil size={14} /> 编辑详情</Button>
        {props.canWrite && <Button type="button" size="sm" onClick={props.onDuplicate}><GitMerge size={14} /> 标记重复</Button>}
        {secondaryActions.map((action) => (
          <Button key={action.status} type="button" size="sm" onClick={() => props.onTransition(action)}>
            <action.icon size={14} /> {action.label}
          </Button>
        ))}
        {props.canManage && <DangerButton title={`删除缺陷「${props.row.title}」？`} onConfirm={() => { void props.onDelete(); }} />}
      </RowMoreMenu>
    </div>
  );
}

function BugTriageBoard(props: { rows: Bug[]; activeTriage: string; activeStatus: string; onTriage: (value: string) => void; onStatus: (value: string) => void }) {
  const activeRows = props.rows.filter((row) => !['verified', 'closed'].includes(row.status));
  const needTriage = activeRows.filter((row) => (row.triageStatus || 'new') === 'new');
  const needInfo = activeRows.filter((row) => row.triageStatus === 'needs_info');
  const accepted = activeRows.filter((row) => row.triageStatus === 'accepted');
  const inProgress = activeRows.filter((row) => row.status === 'in_progress');
  const overdue = activeRows.filter((row) => isOverdue(row));
  const readyForRetest = props.rows.filter((row) => row.status === 'resolved');
  return (
    <section className="workflow-lanes bug-triage-lanes" aria-label="缺陷分诊工作台">
      <button type="button" className={props.activeTriage === 'new' ? 'active' : ''} onClick={() => props.onTriage('new')}>
        <span>待分诊</span>
        <strong>{needTriage.length}</strong>
        <small>新建缺陷需要判断责任流</small>
      </button>
      <button type="button" className={props.activeTriage === 'needs_info' ? 'active' : ''} onClick={() => props.onTriage('needs_info')}>
        <span>需补充</span>
        <strong>{needInfo.length}</strong>
        <small>复现、范围或证据不足</small>
      </button>
      <button type="button" className={props.activeTriage === 'accepted' ? 'active' : ''} onClick={() => props.onTriage('accepted')}>
        <span>已接收</span>
        <strong>{accepted.length}</strong>
        <small>已明确团队和责任人</small>
      </button>
      <button type="button" className={props.activeStatus === 'in_progress' ? 'active' : ''} onClick={() => props.onStatus('in_progress')}>
        <span>处理中</span>
        <strong>{inProgress.length}</strong>
        <small>开发处理中的活跃缺陷</small>
      </button>
      <button type="button" className={props.activeStatus === 'resolved' ? 'active' : ''} onClick={() => props.onStatus('resolved')}>
        <span>待复测</span>
        <strong>{readyForRetest.length}</strong>
        <small>已解决，等待验证结论</small>
      </button>
      <button type="button" className={overdue.length ? 'tone-risk' : ''} onClick={() => props.onStatus('')}>
        <span>SLA 风险</span>
        <strong>{overdue.length}</strong>
        <small>逾期且仍未关闭</small>
      </button>
    </section>
  );
}

function SlaCell(props: { row: Bug }) {
  if (!props.row.dueAt) return <span>-</span>;
  const days = daysUntil(props.row.dueAt);
  const closed = ['verified', 'closed'].includes(props.row.status);
  const overdue = days < 0 && !closed;
  const label = overdue ? `逾期 ${Math.abs(days)} 天` : closed ? '已停止计时' : days === 0 ? '今日到期' : `${days} 天`;
  return (
    <div className={`sla-cell ${overdue ? 'is-overdue' : ''}`}>
      <strong>{label}</strong>
      <span>{shortDate(props.row.dueAt)} · {slaLevelLabel(props.row.slaLevel)}</span>
    </div>
  );
}

function isOverdue(row: Bug) {
  return Boolean(row.dueAt && new Date(row.dueAt).getTime() < Date.now() && !['verified', 'closed'].includes(row.status));
}

function daysUntil(value: string) {
  const ms = new Date(value).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(ms / 86_400_000);
}

function slaLevelLabel(value?: Bug['slaLevel']) {
  if (value === 'critical') return '紧急 SLA';
  if (value === 'high') return '高 SLA';
  if (value === 'low') return '低 SLA';
  return '标准 SLA';
}

export function BugFields(props: { row?: Bug; requirements: Requirement[]; cases: TestCase[]; plans: TestPlan[]; bugs: Bug[]; users: UserProfile[]; register?: UseFormRegister<StringFormValues> }) {
  const defaultRequirementId = props.row?.requirementId || (props.requirements.length === 1 ? props.requirements[0]?.id : '') || '';
  const defaultCaseId = props.row?.testCaseId || (props.cases.length === 1 ? props.cases[0]?.id : '') || '';
  const defaultPlanId = props.row?.testPlanId || (props.plans.length === 1 ? props.plans[0]?.id : '') || '';
  const advice = props.row ? null : bugIntakeAdvice();
  return (
    <div className="bug-progressive-form">
      {advice && (
        <section className="form-advice">
          <strong>{advice.title}</strong>
          <span>{advice.detail}</span>
        </section>
      )}
      <div className="field-grid">
        <Field className="span-two"><FieldLabel required>缺陷标题</FieldLabel><Input {...registerField(props.register, 'title')} defaultValue={props.row?.title} required /></Field>
        <Field><FieldLabel required>严重级别</FieldLabel><Select name="severity" register={props.register} values={severities} dictionaryType="severity" defaultValue={props.row?.severity || 'S2'} /></Field>
        <Field><FieldLabel required>优先级</FieldLabel><Select name="priority" register={props.register} values={priorities} dictionaryType="priority" defaultValue={props.row?.priority || 'P2'} /></Field>
        <Field><FieldLabel hint="建议绑定，保证验收追踪">关联需求</FieldLabel><select {...registerField(props.register, 'requirementId')} defaultValue={defaultRequirementId}><option value="">不绑定需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <Field><FieldLabel hint="从执行项创建时会自动带入">关联用例</FieldLabel><select {...registerField(props.register, 'testCaseId')} defaultValue={defaultCaseId}><option value="">不绑定用例</option>{props.cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <Field><FieldLabel hint="定位到测试轮次">关联计划</FieldLabel><select {...registerField(props.register, 'testPlanId')} defaultValue={defaultPlanId}><option value="">不绑定计划</option>{props.plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field><FieldLabel hint="用于按协作团队聚合缺陷">团队</FieldLabel><Select name="team" register={props.register} values={bugTeams} defaultValue={props.row?.team || ''} emptyLabel="未分配团队" /></Field>
        <Field><FieldLabel hint="用于处理队列和 SLA">负责人</FieldLabel><select {...registerField(props.register, 'assigneeId')} defaultValue={props.row?.assigneeId || ''}><option value="">未指派</option>{props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select></Field>
        <Field className="span-four"><FieldLabel required hint="写清环境、入口、操作路径和稳定复现条件">复现步骤</FieldLabel><Textarea {...registerField(props.register, 'reproduceSteps')} defaultValue={props.row?.reproduceSteps} placeholder="建议写清环境、入口、操作路径和稳定复现条件" required /></Field>
        <Field className="span-two"><FieldLabel hint="实际看到的页面、接口或数据现象">实际结果</FieldLabel><Textarea {...registerField(props.register, 'actualResult')} defaultValue={props.row?.actualResult} /></Field>
        <Field className="span-two"><FieldLabel hint="期望业务结果或验收标准">期望结果</FieldLabel><Textarea {...registerField(props.register, 'expectedResult')} defaultValue={props.row?.expectedResult} /></Field>
      </div>
      <details className="advanced-fields" open={Boolean(props.row)}>
        <summary>高级信息</summary>
        <div className="field-grid">
          <Field><FieldLabel>重复缺陷</FieldLabel><select {...registerField(props.register, 'duplicateOfId')} defaultValue={props.row?.duplicateOfId || ''}><option value="">不标记重复</option>{props.bugs.filter((item) => item.id !== props.row?.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
          <Field><FieldLabel>分诊状态</FieldLabel><Select name="triageStatus" register={props.register} values={triageStatuses} defaultValue={props.row?.triageStatus || 'new'} /></Field>
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
          <Field><FieldLabel>发现环境</FieldLabel><Input {...registerField(props.register, 'environment')} defaultValue={props.row?.environment} placeholder="浏览器 / 设备 / 环境" /></Field>
          <Field><FieldLabel>发现版本</FieldLabel><Input {...registerField(props.register, 'foundVersion')} defaultValue={props.row?.foundVersion} /></Field>
          <Field><FieldLabel>修复版本</FieldLabel><Input {...registerField(props.register, 'fixVersion')} defaultValue={props.row?.fixVersion} /></Field>
          <Field><FieldLabel>SLA 等级</FieldLabel><select {...registerField(props.register, 'slaLevel')} defaultValue={props.row?.slaLevel || ''}><option value="">按严重级别自动</option><option value="critical">紧急</option><option value="high">高</option><option value="normal">标准</option><option value="low">低</option></select></Field>
          <Field className="span-two">
            <FieldLabel>关注人</FieldLabel>
            <select name="watcherIds" multiple defaultValue={props.row?.watcherIds || []} aria-label="关注人">
              {props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}
            </select>
          </Field>
          <Field className="span-two"><FieldLabel>根因分析</FieldLabel><Textarea {...registerField(props.register, 'rootCause')} defaultValue={props.row?.rootCause} /></Field>
          <Field className="span-two"><FieldLabel>修复说明</FieldLabel><Textarea {...registerField(props.register, 'resolution')} defaultValue={props.row?.resolution} /></Field>
          <Field className="span-four"><FieldLabel>验证结论</FieldLabel><Textarea {...registerField(props.register, 'verifyResult')} defaultValue={props.row?.verifyResult} /></Field>
        </div>
      </details>
    </div>
  );
}

function bugIntakeAdvice() {
  return {
    title: '分诊建议',
    detail: 'S0/S1 会自动进入高优先 SLA；未指派缺陷会先进入待分诊队列，接收后进入处理中。'
  };
}

export function BugDrawer(props: {
  title: string;
  projectId: string;
  row?: Bug;
  open: boolean;
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  bugs: Bug[];
  users: UserProfile[];
  canWrite?: boolean;
  onClose: () => void;
  onSubmit: (form: FormData, attachments?: BugAttachment[]) => Promise<void>;
  onComment?: (body: string) => Promise<void>;
  onAttachment?: (attachment: { name: string; url: string }) => Promise<void>;
  onFileAttachment?: (file: File) => Promise<void>;
  onDraftFileAttachment?: (file: File) => Promise<BugAttachment>;
  onOpenEntity?: (entityType: string, entityId?: string) => void;
}) {
  const [activePanel, setActivePanel] = useState<'overview' | 'edit' | 'collab' | 'history'>(props.row ? 'overview' : 'edit');
  const [draftAttachments, setDraftAttachments] = useState<BugAttachment[]>([]);
  useEffect(() => {
    if (props.open) setActivePanel(props.row ? 'overview' : 'edit');
  }, [props.open, props.row?.id]);
  useEffect(() => {
    if (props.open && !props.row) setDraftAttachments([]);
  }, [props.open, props.row?.id]);
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '记录复现步骤、预期结果和责任人'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form, props.row ? undefined : draftAttachments)}>
        {(register) => (
          <>
            {props.row && (
              <div className="drawer-tabs" role="tablist" aria-label="缺陷详情视图">
                <button type="button" className={activePanel === 'overview' ? 'active' : ''} onClick={() => setActivePanel('overview')}>概览</button>
                <button type="button" className={activePanel === 'edit' ? 'active' : ''} onClick={() => setActivePanel('edit')}>编辑</button>
                <button type="button" className={activePanel === 'collab' ? 'active' : ''} onClick={() => setActivePanel('collab')}>协作</button>
                <button type="button" className={activePanel === 'history' ? 'active' : ''} onClick={() => setActivePanel('history')}>历史</button>
              </div>
            )}
            {props.row && activePanel === 'overview' && <BugOverview row={props.row} requirements={props.requirements} cases={props.cases} plans={props.plans} bugs={props.bugs} users={props.users} onOpenEntity={props.onOpenEntity} />}
            {activePanel === 'edit' && <BugFields row={props.row} requirements={props.requirements} cases={props.cases} plans={props.plans} bugs={props.bugs} users={props.users} register={register} />}
            {!props.row && activePanel === 'edit' && (
              <BugAttachmentDraft
                attachments={draftAttachments}
                canWrite={props.canWrite}
                onChange={setDraftAttachments}
                onUpload={props.onDraftFileAttachment}
              />
            )}
            {props.row && activePanel === 'collab' && <BugCollaboration row={props.row} canWrite={props.canWrite} onComment={props.onComment} onAttachment={props.onAttachment} onFileAttachment={props.onFileAttachment} />}
            {props.row && activePanel === 'history' && <BugStatusTimeline row={props.row} />}
            <FormActions>
              <Button type="button" onClick={props.onClose}>取消</Button>
              {props.canWrite && activePanel === 'edit' && <Button variant="primary"><Save size={15} /> {props.row ? '保存缺陷' : '创建缺陷'}</Button>}
            </FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

function BugAttachmentDraft(props: {
  attachments: BugAttachment[];
  canWrite?: boolean;
  onChange: (attachments: BugAttachment[]) => void;
  onUpload?: (file: File) => Promise<BugAttachment>;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const addLink = () => {
    const nextName = name.trim();
    const nextUrl = url.trim();
    if (!nextName || !nextUrl) return;
    props.onChange([
      ...props.attachments,
      { id: `draft-${Date.now()}`, name: nextName, url: nextUrl, createdAt: new Date().toISOString() }
    ]);
    setName('');
    setUrl('');
  };
  const remove = (id: string) => props.onChange(props.attachments.filter((attachment) => attachment.id !== id));
  return (
    <section className="create-attachment-panel" aria-label="创建缺陷附件">
      <div className="sub-title"><Paperclip size={16} /> 附件</div>
      <div className="draft-attachment-list">
        {props.attachments.length === 0 ? <span className="muted">可在创建缺陷时一并上传截图、日志或补充链接。</span> : props.attachments.map((attachment) => (
          <article key={attachment.id}>
            <a href={attachment.url} target="_blank" rel="noreferrer">{attachment.name}</a>
            <small>{attachment.size ? `${Math.round(attachment.size / 1024)}KB` : '链接附件'}</small>
            <button type="button" title={`移除附件 ${attachment.name}`} onClick={() => remove(attachment.id)}><Trash2 size={14} /></button>
          </article>
        ))}
      </div>
      {props.canWrite && (
        <div className="draft-attachment-actions">
          <label className="file-pick-button">
            <UploadCloud size={15} />
            <span>{uploading ? '上传中' : '上传文件'}</span>
            <input type="file" disabled={uploading} onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file || !props.onUpload) return;
              setUploading(true);
              try {
                const attachment = await props.onUpload(file);
                props.onChange([...props.attachments, attachment]);
              } finally {
                setUploading(false);
              }
            }} />
          </label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="附件名称" />
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="截图、日志或文档链接" />
          <Button type="button" onClick={addLink}><Paperclip size={15} /> 添加链接</Button>
        </div>
      )}
    </section>
  );
}

function BugOverview(props: { row: Bug; requirements: Requirement[]; cases: TestCase[]; plans: TestPlan[]; bugs: Bug[]; users: UserProfile[]; onOpenEntity?: (entityType: string, entityId?: string) => void }) {
  const watchers = (props.row.watcherIds || []).map((id) => userName(props.users, id)).join('、') || '-';
  return (
    <div className="entity-overview">
      <article>
        <span>来源链路</span>
        <strong>{bugSource(props.row, props.requirements, props.cases, props.plans)}</strong>
        {props.row.runItemId && <button type="button" className="linkish" onClick={() => props.onOpenEntity?.('run_item', props.row.runItemId)}><PlayCircle size={14} /> 打开复测执行项</button>}
      </article>
      <article>
        <span>团队</span>
        <strong>{props.row.team ? labelOf(props.row.team) : '未分配团队'}</strong>
        <small>{props.row.assigneeId ? `负责人：${userName(props.users, props.row.assigneeId)}` : '暂无负责人'}</small>
      </article>
      <article>
        <span>负责人 / 关注人</span>
        <strong>{props.row.assigneeId ? userName(props.users, props.row.assigneeId) : '未指派'}</strong>
        <small>{watchers}</small>
      </article>
      <article>
        <span>SLA</span>
        <SlaCell row={props.row} />
      </article>
      <article>
        <span>分诊</span>
        <strong>{labelOf(props.row.triageStatus || 'new')}</strong>
        <small>{props.row.duplicateOfId ? `重复于 ${props.bugs.find((bug) => bug.id === props.row.duplicateOfId)?.title || '源缺陷'}` : '未标记重复'}</small>
      </article>
      <section className="evidence-block">
        <strong>问题证据</strong>
        <p>{props.row.reproduceSteps || props.row.actualResult || '暂无复现步骤或实际结果'}</p>
      </section>
      <section className="evidence-block">
        <strong>修复与验证</strong>
        <p>{props.row.resolution || '暂无修复说明'}</p>
        <p>{props.row.verifyResult || '暂无验证结论'}</p>
      </section>
    </div>
  );
}

function DuplicateBugDrawer(props: {
  row?: Bug;
  bugs: Bug[];
  open: boolean;
  onClose: () => void;
  onSubmit: (duplicateOfId: string, reason: string) => Promise<void>;
}) {
  const candidates = props.bugs.filter((bug) => bug.id !== props.row?.id);
  if (!props.row) return null;
  return (
    <Drawer title="标记重复缺陷" subtitle={props.row.title} open={props.open} onClose={props.onClose} size="compact">
      <HookForm onSubmit={async (form) => props.onSubmit(String(form.get('duplicateOfId') || ''), String(form.get('reason') || '').trim())}>
        {(register) => (
          <>
            <Field>
              <FieldLabel>源缺陷</FieldLabel>
              <select {...register('duplicateOfId')} required>
                <option value="">选择保留的源缺陷</option>
                {candidates.map((bug) => <option key={bug.id} value={bug.id}>{bug.title} · {labelOf(bug.status)}</option>)}
              </select>
            </Field>
            <Field>
              <FieldLabel>合并说明</FieldLabel>
              <Textarea {...register('reason')} required placeholder="说明为什么判断为重复、保留哪个结论或附件" />
            </Field>
            <FormActions>
              <Button type="button" onClick={props.onClose}>取消</Button>
              <Button variant="primary"><GitMerge size={15} /> 标记重复并关闭</Button>
            </FormActions>
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
    </div>
  );
}

function BugStatusTimeline(props: { row: Bug }) {
  const history = props.row.statusHistory || [];
  const transitions = history.filter((item) => item.fromStatus && item.fromStatus !== item.toStatus).length;
  const latest = history[history.length - 1];
  return (
    <section className="history-panel bug-history-panel">
      <div className="bug-history-summary">
        <article>
          <span>当前状态</span>
          <StatusBadge value={props.row.status} dictionaryType="bugStatus" />
        </article>
        <article>
          <span>历史节点</span>
          <strong>{history.length}</strong>
        </article>
        <article>
          <span>状态流转</span>
          <strong>{transitions}</strong>
        </article>
        <article>
          <span>最近更新</span>
          <strong>{latest ? shortDate(latest.createdAt) : '-'}</strong>
          <small>{latest?.operatorName || '系统'}</small>
        </article>
      </div>
      <div className="timeline-list bug-history-timeline">
        {history.length === 0 ? <span className="muted">暂无状态历史</span> : history.map((item, index) => (
          <article key={item.id}>
            <div className="history-node-head">
              <strong>{item.fromStatus ? `${labelOf(item.fromStatus)} -> ${labelOf(item.toStatus)}` : labelOf(item.toStatus)}</strong>
              <small>#{index + 1}</small>
            </div>
            <span>{item.operatorName || '系统'} · {new Date(item.createdAt).toLocaleString('zh-CN')}</span>
            {item.note && <p>{item.note}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function nextBugActions(status: BugStatus): Array<{ status: BugStatus; label: string; message: string; icon: typeof CheckCircle2 }> {
  if (status === 'open' || status === 'reopened') return [{ status: 'in_progress', label: '处理', message: '缺陷已进入处理', icon: Pencil }];
  if (status === 'in_progress') return [{ status: 'resolved', label: '解决', message: '缺陷已标记解决', icon: CheckCircle2 }];
  if (status === 'resolved') return [
    { status: 'verified', label: '验证', message: '缺陷已验证', icon: CheckCircle2 },
    { status: 'reopened', label: '重开', message: '缺陷已重新打开', icon: RotateCcw }
  ];
  if (status === 'verified') return [{ status: 'closed', label: '关闭', message: '缺陷已关闭', icon: CheckCircle2 }];
  return [];
}

function bugTransitionImpact(status: BugStatus) {
  if (status === 'in_progress') return '进入处理中后会继续计入活跃缺陷和验收风险。';
  if (status === 'resolved') return '解决后会进入待复测队列，仍会提醒验证负责人。';
  if (status === 'verified') return '验证后不再作为待复测项，但关闭前仍保留历史证据。';
  if (status === 'closed') return '关闭后不再计入活跃缺陷和验收阻塞。';
  if (status === 'reopened') return '重开后会重新计入活跃缺陷和质量风险。';
  return '状态变更会记录到历史并通知相关成员。';
}
