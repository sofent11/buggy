import { useEffect, useMemo, useState } from 'react';
import { Check, FolderKanban, MoreHorizontal, Pencil, Plus, Save, Trash2, Users } from 'lucide-react';
import type { BusinessRoleConfig, BusinessRoleKey, PermissionAction, PermissionModule, Project, ProjectJoinRequest, ProjectMember, ProjectPermission, UserProfile } from '@buggy/shared-types';
import { api } from '../../api.js';
import { projectPermissions } from '../../app/constants.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { matchKeyword, shortDate, text } from '../../app/workspace-utils.js';
import { DataPage, DataTable, DangerButton, Drawer, EmptyState, HookForm, MetricCard, SearchBox, StatusBadge, Toolbar, RowMoreMenu } from './common.js';

const RECENT_PROJECTS_KEY = 'buggy_recent_project_ids';
type ProjectScope = 'active' | 'mine' | 'recent' | 'sample' | 'archived' | 'all';

export function ProjectSection(props: {
  user: UserProfile;
  projects: Project[];
  searchKeyword?: string;
  currentProjectId: string;
  users: UserProfile[];
  onSelect: (id: string) => void;
  onNotice: (message: string) => void;
  mutate: (action: () => Promise<unknown>, message: string, options?: { reloadProjects?: boolean }) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [scope, setScope] = useState<ProjectScope>('active');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [managingMembers, setManagingMembers] = useState<Project | null>(null);
  const recentProjectIds = useMemo(() => readRecentProjectIds(), [props.currentProjectId]);
  const filtered = useMemo(
    () => props.projects.filter((item) =>
      projectInScope(item, scope, props.user.id, recentProjectIds) &&
      matchKeyword([item.name, item.code || '', item.description || '', item.members.map((member) => member.username).join(' ')], keyword, props.searchKeyword)
    ),
    [props.projects, scope, props.user.id, recentProjectIds, keyword, props.searchKeyword]
  );
  const sampleCount = useMemo(() => props.projects.filter(isSampleProject).length, [props.projects]);
  const activeCount = useMemo(() => props.projects.filter((project) => projectInScope(project, 'active', props.user.id, recentProjectIds)).length, [props.projects, props.user.id, recentProjectIds]);
  const archivedCount = useMemo(() => props.projects.filter((project) => project.status === 'archived' || project.status === 'deleted').length, [props.projects]);
  const mineCount = useMemo(() => props.projects.filter((project) => project.members.some((member) => member.userId === props.user.id) && !isArchivedProject(project)).length, [props.projects, props.user.id]);
  const editingProject = editing ? props.projects.find((project) => project.id === editing.id) || editing : null;
  const memberProject = managingMembers ? props.projects.find((project) => project.id === managingMembers.id) || managingMembers : null;
  const systemPermission = props.user.systemPermission || props.user.role;
  const canCreateProject = systemPermission === 'admin' || systemPermission === 'maintainer';

  return (
    <DataPage
      title="项目管理"
      icon={FolderKanban}
      metrics={
        <section className="insight-strip">
          <MetricCard label="项目总数" value={props.projects.length} detail="当前可访问项目" tone="info" />
          <MetricCard label="正式活跃" value={activeCount} detail="默认工作视图" tone="good" />
          <MetricCard label="我参与" value={mineCount} detail="未归档成员项目" />
          <MetricCard label="当前项目" value={props.currentProjectId ? '已选择' : '未选择'} detail={props.projects.find((project) => project.id === props.currentProjectId)?.name || '请选择项目'} tone={props.currentProjectId ? 'good' : 'risk'} />
          <MetricCard label="治理池" value={sampleCount + archivedCount} detail="测试数据 / 归档" />
        </section>
      }
    >
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索项目、代号、成员" />
        <select value={scope} onChange={(event) => setScope(event.target.value as ProjectScope)} aria-label="项目视图">
          <option value="active">正式活跃项目</option>
          <option value="mine">我参与</option>
          <option value="recent">最近访问</option>
          <option value="sample">测试 / 验收数据</option>
          <option value="archived">已归档 / 已删除</option>
          <option value="all">全部项目</option>
        </select>
        <span className="toolbar-summary">{filtered.length} / {props.projects.length} 个项目</span>
        {canCreateProject && <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建项目</button>}
      </Toolbar>
      <DataTable
        headers={['项目', '代号', '成员', '负责人', '治理状态', '更新时间', '状态', '操作']}
        emptyText="暂无项目"
        rows={filtered.map((project) => [
          <div className="cell-main"><strong>{project.name}</strong><span>{project.description || '未填写描述'}</span></div>,
          project.code || '-',
          `${project.members.length} 人`,
          project.members.find((member) => (member.projectPermission || (member.role === 'owner' ? 'manage' : undefined)) === 'manage')?.username || '-',
          <ProjectGovernanceCell project={project} />,
          shortDate(project.updatedAt),
          project.id === props.currentProjectId ? <StatusBadge value="当前项目" /> : <span className="muted">{isArchivedProject(project) ? '不可默认展示' : '可选'}</span>,
          <div className="row-actions">
            {!isArchivedProject(project) && (isProjectMember(project, props.user.id) || systemPermission === 'admin' || systemPermission === 'maintainer') && (
              <Button type="button" size="sm" onClick={() => props.onSelect(project.id)}><Check size={14} /> 选中</Button>
            )}
            {isProjectMember(project, props.user.id) ? (
              <Button type="button" size="sm" onClick={() => setManagingMembers(project)}><Users size={14} /> 成员</Button>
            ) : project.joinRequestsEnabled ? (
              <Button type="button" size="sm" disabled={project.joinRequestStatus === 'pending'} onClick={() => props.mutate(() => api.requestProjectJoin(project.id), '加入申请已提交', { reloadProjects: true })}>
                <Users size={14} /> {project.joinRequestStatus === 'pending' ? '已申请' : '申请加入'}
              </Button>
            ) : null}
            <RowMoreMenu label={`更多操作：${project.name}`} trigger={<MoreHorizontal size={15} />}>
              {isProjectManager(project, props.user.id, systemPermission) && <Button type="button" size="sm" onClick={() => setEditing(project)}><Pencil size={14} /> 编辑档案</Button>}
              {project.status === 'archived' ? (
                <Button type="button" size="sm" onClick={() => props.mutate(() => api.updateProject(project.id, { status: 'active' }), '项目已恢复为活跃', { reloadProjects: true })}>恢复活跃</Button>
              ) : (
                <Button type="button" size="sm" onClick={() => props.mutate(() => api.updateProject(project.id, { status: 'archived' }), '项目已归档', { reloadProjects: true })}>归档项目</Button>
              )}
              {project.category !== 'test' && <Button type="button" size="sm" onClick={() => props.mutate(() => api.updateProject(project.id, { category: 'test' }), '项目已标记为测试数据', { reloadProjects: true })}>标记测试数据</Button>}
              {isProjectManager(project, props.user.id, systemPermission) && <DangerButton
                title={`删除项目「${project.name}」？`}
                description="项目下的迭代、需求、用例、执行计划、缺陷和报告数据都会被删除。"
                onConfirm={() => props.mutate(() => api.deleteProject(project.id), '项目已删除', { reloadProjects: true })}
              />}
            </RowMoreMenu>
          </div>
        ])}
      />
      {filtered.length === 0 && (
        <EmptyState
          text="暂无项目"
          detail="创建第一个项目后即可维护成员、需求、用例与缺陷。"
          action={canCreateProject ? <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建项目</button> : undefined}
        />
      )}
      <ProjectDrawer
        title="新建项目"
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={async (form) => {
          await props.mutate(
            () => api.createProject({ name: text(form, 'name'), code: text(form, 'code'), description: text(form, 'description'), status: text(form, 'status') as Project['status'], category: text(form, 'category') as Project['category'], joinRequestsEnabled: form.get('joinRequestsEnabled') === 'on' }),
            '项目已创建',
            { reloadProjects: true }
          );
          setCreating(false);
        }}
      />
      <ProjectDrawer
        title="项目详情"
        row={editingProject || undefined}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={async (form) => {
          if (!editing) return;
          await props.mutate(
            () => api.updateProject(editing.id, { name: text(form, 'name'), code: text(form, 'code'), description: text(form, 'description'), status: text(form, 'status') as Project['status'], category: text(form, 'category') as Project['category'], joinRequestsEnabled: form.get('joinRequestsEnabled') === 'on' }),
            '项目已保存',
            { reloadProjects: true }
          );
          setEditing(null);
        }}
      />
      <MemberDrawer
        project={memberProject || undefined}
        users={props.users}
        open={Boolean(managingMembers)}
        onClose={() => setManagingMembers(null)}
        mutate={props.mutate}
      />
    </DataPage>
  );
}

function readRecentProjectIds() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function isSampleProject(project: Project) {
  if (project.category === 'demo' || project.category === 'test') return true;
  const text = `${project.name} ${project.code || ''} ${project.description || ''}`.toLowerCase();
  return /(test|api|html|验收|浏览器|完整|报告|\bqa\b|\be2e\b|\d{6,})/.test(text);
}

function isArchivedProject(project: Project) {
  return project.status === 'archived' || project.status === 'deleted';
}

function projectInScope(project: Project, scope: ProjectScope, currentUserId: string, recentProjectIds: string[]) {
  if (scope === 'active') return !isArchivedProject(project) && !isSampleProject(project);
  if (scope === 'mine') return project.members.some((member) => member.userId === currentUserId) && !isArchivedProject(project);
  if (scope === 'recent') return recentProjectIds.includes(project.id) && !isArchivedProject(project);
  if (scope === 'sample') return isSampleProject(project);
  if (scope === 'archived') return isArchivedProject(project);
  return true;
}

function isProjectMember(project: Project, userId: string) {
  return project.members.some((member) => member.userId === userId);
}

function isProjectManager(project: Project, userId: string, systemPermission?: string) {
  if (systemPermission === 'admin') return true;
  if (project.ownerId === userId) return true;
  return project.members.some((member) => member.userId === userId && (member.projectPermission === 'manage' || member.role === 'owner'));
}

function ProjectGovernanceCell(props: { project: Project }) {
  const category = props.project.category || (isSampleProject(props.project) ? 'test' : 'standard');
  const status = props.project.status || 'active';
  return (
    <div className="cell-main">
      <StatusBadge value={projectStatusLabel(status)} />
      <span>{labelOf(category)}</span>
    </div>
  );
}

function projectStatusLabel(status: Project['status']) {
  if (status === 'archived') return '已归档';
  if (status === 'deleted') return '已删除';
  return '活跃';
}

function ProjectDrawer(props: {
  title: string;
  row?: Project;
  open: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  return (
    <Drawer title={props.title} subtitle={props.row?.name || '创建项目档案，成员请在独立入口维护'} open={props.open} onClose={props.onClose} size="compact">
      <div className="drawer-form project-info-form">
        <HookForm
          defaultValues={{ name: props.row?.name || '', code: props.row?.code || '', description: props.row?.description || '', status: props.row?.status || 'active', category: props.row?.category || (props.row && isSampleProject(props.row) ? 'test' : 'standard') }}
          onSubmit={async (form) => props.onSubmit(form)}
        >
          {(register) => (
            <>
              <Field><FieldLabel>项目名称</FieldLabel><Input {...register('name')} required /></Field>
              <Field><FieldLabel>项目代号</FieldLabel><Input {...register('code')} /></Field>
              <div className="field-grid two">
                <Field><FieldLabel>治理状态</FieldLabel><select {...register('status')} defaultValue={props.row?.status || 'active'}><option value="active">活跃</option><option value="archived">已归档</option><option value="deleted">已删除</option></select></Field>
                <Field><FieldLabel>项目分类</FieldLabel><select {...register('category')} defaultValue={props.row?.category || (props.row && isSampleProject(props.row) ? 'test' : 'standard')}><option value="standard">正式项目</option><option value="demo">演示项目</option><option value="test">测试数据</option></select></Field>
              </div>
              <Field><FieldLabel>项目描述</FieldLabel><Textarea {...register('description')} /></Field>
              <label className="check-row compact-check-row">
                <input type="checkbox" {...register('joinRequestsEnabled')} defaultChecked={props.row?.joinRequestsEnabled === true} />
                <span>允许普通用户申请加入</span>
              </label>
              <FormActions>
                <Button type="button" onClick={props.onClose}>取消</Button>
                <Button variant="primary"><Save size={15} /> 保存项目</Button>
              </FormActions>
            </>
          )}
        </HookForm>
      </div>
    </Drawer>
  );
}

function MemberDrawer(props: {
  project?: Project;
  users: UserProfile[];
  open: boolean;
  onClose: () => void;
  mutate: (action: () => Promise<unknown>, message: string, options?: { reloadProjects?: boolean }) => Promise<void>;
}) {
  if (!props.project) return null;
  return (
    <Drawer
      title="项目成员"
      subtitle={`${props.project.name} · ${props.project.members.length} 人`}
      open={props.open}
      onClose={props.onClose}
      size="wide"
    >
      <MemberManager project={props.project} users={props.users} mutate={props.mutate} />
    </Drawer>
  );
}

export function MemberManager(props: {
  project: Project;
  users: UserProfile[];
  mutate: (action: () => Promise<unknown>, message: string, options?: { reloadProjects?: boolean }) => Promise<void>;
}) {
  const owner = props.project.members.find((member) => member.projectPermission === 'manage' || member.role === 'owner');
  const [requests, setRequests] = useState<ProjectJoinRequest[]>([]);
  const [requestDecisions, setRequestDecisions] = useState<Record<string, { projectPermission: ProjectPermission; businessRoleKey: BusinessRoleKey }>>({});
  useEffect(() => {
    void api.projectJoinRequests(props.project.id).then(setRequests).catch(() => setRequests([]));
  }, [props.project.id, props.project.members.length]);
  const businessRoles = normalizedBusinessRoles(props.project.businessRoles);
  const decisionOf = (requestId: string) => requestDecisions[requestId] || { projectPermission: 'normal' as ProjectPermission, businessRoleKey: 'viewer' as BusinessRoleKey };
  const updateDecision = (requestId: string, patch: Partial<{ projectPermission: ProjectPermission; businessRoleKey: BusinessRoleKey }>) => {
    setRequestDecisions((current) => ({
      ...current,
      [requestId]: { ...(current[requestId] || { projectPermission: 'normal' as ProjectPermission, businessRoleKey: 'viewer' as BusinessRoleKey }), ...patch }
    }));
  };
  return (
    <div className="member-manager">
      <section className="member-context" aria-label="项目成员概览">
        <div>
          <span>项目</span>
          <strong>{props.project.name}</strong>
          <small>{props.project.code || '未设置代号'}</small>
        </div>
        <div>
          <span>负责人</span>
          <strong>{owner?.username || '-'}</strong>
          <small>{owner?.email || '暂无负责人邮箱'}</small>
        </div>
        <div>
          <span>成员数</span>
          <strong>{props.project.members.length}</strong>
          <small>含负责人</small>
        </div>
      </section>
      <div className="sub-title"><Users size={16} /> 添加或调整成员</div>
      <form
        className="member-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          props.mutate(
            () => api.upsertProjectMember(props.project.id, {
              email: text(form, 'email'),
              projectPermission: text(form, 'projectPermission') as ProjectPermission,
              businessRoleKey: text(form, 'businessRoleKey') as BusinessRoleKey
            }),
            '成员已保存',
            { reloadProjects: true }
          );
          event.currentTarget.reset();
        }}
      >
        <Field>
          <FieldLabel>用户邮箱</FieldLabel>
          <Input name="email" placeholder="user@example.com" list="user-emails" required />
        </Field>
        <Field>
          <FieldLabel>项目角色</FieldLabel>
          <select name="projectPermission" defaultValue="normal">
            {projectPermissions.map((permission) => <option key={permission} value={permission}>{labelOf(permission)}</option>)}
          </select>
        </Field>
        <Field>
          <FieldLabel>业务角色</FieldLabel>
          <select name="businessRoleKey" defaultValue="viewer">
            {businessRoles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
          </select>
        </Field>
        <Button><Plus size={15} /> 添加</Button>
      </form>
      <datalist id="user-emails">
        {props.users.map((user) => <option key={user.id} value={user.email}>{user.username}</option>)}
      </datalist>
      <DataTable
        headers={['成员', '邮箱', '项目权限', '业务角色', '操作']}
        rows={props.project.members.map((member) => [
          member.username,
          member.email,
          <select
            value={member.projectPermission || (member.role === 'owner' ? 'manage' : member.role === 'tester' || member.role === 'developer' ? 'maintain' : 'normal')}
            aria-label={`${member.username} 项目权限`}
            onChange={(event) =>
              props.mutate(
                () => api.upsertProjectMember(props.project.id, { userId: member.userId, projectPermission: event.target.value as ProjectPermission, businessRoleKey: member.businessRoleKey || businessRoleOf(member.role) }),
                '成员项目权限已更新',
                { reloadProjects: true }
              )
            }
          >
            {projectPermissions.map((permission) => <option key={permission} value={permission}>{labelOf(permission)}</option>)}
          </select>,
          <select
            value={member.businessRoleKey || businessRoleOf(member.role)}
            aria-label={`${member.username} 业务角色`}
            onChange={(event) =>
              props.mutate(
                () => api.upsertProjectMember(props.project.id, { userId: member.userId, projectPermission: member.projectPermission || permissionOf(member.role), businessRoleKey: event.target.value as BusinessRoleKey }),
                '成员业务角色已更新',
                { reloadProjects: true }
              )
            }
          >
            {businessRoles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
          </select>,
          member.userId === props.project.ownerId ? '负责人' : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => props.mutate(() => api.removeProjectMember(props.project.id, member.userId), '成员已移除', { reloadProjects: true })}
            >
              <Trash2 size={14} /> 移除
            </Button>
          )
        ])}
      />
      {requests.length > 0 && (
        <>
          <div className="sub-title"><Users size={16} /> 待审批申请</div>
          <DataTable
            headers={['用户', '邮箱', '申请时间', '项目权限', '业务角色', '审批']}
            rows={requests.map((request) => {
              const decision = decisionOf(request.id);
              return [
                request.username,
                request.email,
                new Date(request.createdAt).toLocaleString('zh-CN'),
                <select
                  value={decision.projectPermission}
                  aria-label={`${request.username} 审批项目权限`}
                  onChange={(event) => updateDecision(request.id, { projectPermission: event.target.value as ProjectPermission })}
                >
                  {projectPermissions.map((permission) => <option key={permission} value={permission}>{labelOf(permission)}</option>)}
                </select>,
                <select
                  value={decision.businessRoleKey}
                  aria-label={`${request.username} 审批业务角色`}
                  onChange={(event) => updateDecision(request.id, { businessRoleKey: event.target.value as BusinessRoleKey })}
                >
                  {businessRoles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
                </select>,
                <div className="row-actions">
                  <Button type="button" size="sm" onClick={() => props.mutate(() => api.approveProjectJoinRequest(props.project.id, request.id, decision), '申请已通过', { reloadProjects: true })}>通过</Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => props.mutate(() => api.rejectProjectJoinRequest(props.project.id, request.id), '申请已驳回', { reloadProjects: true })}>驳回</Button>
                </div>
              ];
            })}
          />
        </>
      )}
      <BusinessRoleEditor project={props.project} mutate={props.mutate} />
    </div>
  );
}

const permissionModules: Array<{ key: PermissionModule; label: string; actions: PermissionAction[] }> = [
  { key: 'iterations', label: '迭代', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'requirements', label: '需求', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'cases', label: '用例', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'plans', label: '执行计划', actions: ['view', 'create', 'edit', 'delete', 'execute'] },
  { key: 'bugs', label: '缺陷', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'reports', label: '报告', actions: ['view', 'create', 'edit', 'delete', 'signoff'] }
];

const actionLabels: Record<PermissionAction, string> = {
  view: '查看',
  create: '新增',
  edit: '编辑',
  delete: '删除',
  execute: '记录结果',
  signoff: '签核'
};

function BusinessRoleEditor(props: { project: Project; mutate: (action: () => Promise<unknown>, message: string, options?: { reloadProjects?: boolean }) => Promise<void> }) {
  const [roles, setRoles] = useState<BusinessRoleConfig[]>(() => normalizedBusinessRoles(props.project.businessRoles));
  useEffect(() => {
    setRoles(normalizedBusinessRoles(props.project.businessRoles));
  }, [props.project.id]);
  const toggle = (roleKey: string, module: PermissionModule, action: PermissionAction, checked: boolean) => {
    setRoles((current) => current.map((role) => {
      if (role.key !== roleKey) return role;
      const currentActions = new Set(role.permissions?.[module] || []);
      if (checked) currentActions.add(action);
      else currentActions.delete(action);
      return { ...role, permissions: { ...role.permissions, [module]: Array.from(currentActions) } };
    }));
  };
  return (
    <section className="business-role-editor">
      <div className="sub-title"><Users size={16} /> 业务角色权限矩阵</div>
      <DataTable
        headers={['业务角色', ...permissionModules.map((module) => module.label)]}
        rows={roles.map((role) => [
          <div className="cell-main"><strong>{role.name}</strong><span>{role.description || role.key}</span></div>,
          ...permissionModules.map((module) => (
            <div key={`${role.key}-${module.key}`} className="permission-chip-grid">
              {module.actions.map((action) => (
                <label key={action} className="check-row compact-check-row">
                  <input
                    type="checkbox"
                    checked={(role.permissions?.[module.key] || []).includes(action)}
                    onChange={(event) => toggle(role.key, module.key, action, event.target.checked)}
                  />
                  <span>{actionLabels[action]}</span>
                </label>
              ))}
            </div>
          ))
        ])}
      />
      <div className="form-actions">
        <Button type="button" variant="primary" onClick={() => props.mutate(() => api.updateProject(props.project.id, { businessRoles: roles }), '业务角色权限已保存', { reloadProjects: true })}>
          <Save size={15} /> 保存角色权限
        </Button>
      </div>
    </section>
  );
}

function normalizedBusinessRoles(input?: BusinessRoleConfig[]): BusinessRoleConfig[] {
  const defaults: BusinessRoleConfig[] = [
    { key: 'manager', name: '项目管理', description: '全部业务模块权限', permissions: fullPermissions() },
    { key: 'tester', name: '测试', description: '测试执行与缺陷闭环', permissions: { iterations: ['view'], requirements: ['view', 'create', 'edit'], cases: ['view', 'create', 'edit', 'delete'], plans: ['view', 'create', 'edit', 'execute'], bugs: ['view', 'create', 'edit'], reports: ['view', 'create', 'edit'] } },
    { key: 'developer', name: '开发', description: '处理缺陷并查看质量上下文', permissions: { iterations: ['view'], requirements: ['view'], cases: ['view'], plans: ['view'], bugs: ['view', 'edit'], reports: ['view'] } },
    { key: 'viewer', name: '观察者', description: '只读查看项目资产', permissions: { iterations: ['view'], requirements: ['view'], cases: ['view'], plans: ['view'], bugs: ['view'], reports: ['view'] } }
  ];
  const byKey = new Map((input || []).map((role) => [role.key, role]));
  return defaults.map((role) => ({ ...role, ...(byKey.get(role.key) || {}) }));
}

function fullPermissions() {
  return Object.fromEntries(permissionModules.map((module) => [module.key, module.actions])) as BusinessRoleConfig['permissions'];
}

function permissionOf(role?: ProjectMember['role']): ProjectPermission {
  if (role === 'owner') return 'manage';
  if (role === 'tester' || role === 'developer') return 'maintain';
  return 'normal';
}

function businessRoleOf(role?: ProjectMember['role']): BusinessRoleKey {
  if (role === 'owner') return 'manager';
  if (role === 'tester' || role === 'developer') return role;
  return 'viewer';
}
