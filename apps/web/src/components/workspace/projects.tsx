import { useMemo, useState } from 'react';
import { Check, FolderKanban, MoreHorizontal, Pencil, Plus, Save, Trash2, Users } from 'lucide-react';
import type { Project, ProjectMember, UserProfile } from '@buggy/shared-types';
import { api } from '../../api.js';
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
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建项目</button>
      </Toolbar>
      <DataTable
        headers={['项目', '代号', '成员', '负责人', '治理状态', '更新时间', '状态', '操作']}
        emptyText="暂无项目"
        rows={filtered.map((project) => [
          <div className="cell-main"><strong>{project.name}</strong><span>{project.description || '未填写描述'}</span></div>,
          project.code || '-',
          `${project.members.length} 人`,
          project.members.find((member) => member.role === 'owner')?.username || '-',
          <ProjectGovernanceCell project={project} />,
          shortDate(project.updatedAt),
          project.id === props.currentProjectId ? <StatusBadge value="当前项目" /> : <span className="muted">{isArchivedProject(project) ? '不可默认展示' : '可选'}</span>,
          <div className="row-actions">
            {!isArchivedProject(project) && <Button type="button" size="sm" onClick={() => props.onSelect(project.id)}><Check size={14} /> 选中</Button>}
            <Button type="button" size="sm" onClick={() => setManagingMembers(project)}><Users size={14} /> 成员</Button>
            <RowMoreMenu label={`更多操作：${project.name}`} trigger={<MoreHorizontal size={15} />}>
              <Button type="button" size="sm" onClick={() => setEditing(project)}><Pencil size={14} /> 编辑档案</Button>
              {project.status === 'archived' ? (
                <Button type="button" size="sm" onClick={() => props.mutate(() => api.updateProject(project.id, { status: 'active' }), '项目已恢复为活跃', { reloadProjects: true })}>恢复活跃</Button>
              ) : (
                <Button type="button" size="sm" onClick={() => props.mutate(() => api.updateProject(project.id, { status: 'archived' }), '项目已归档', { reloadProjects: true })}>归档项目</Button>
              )}
              {project.category !== 'test' && <Button type="button" size="sm" onClick={() => props.mutate(() => api.updateProject(project.id, { category: 'test' }), '项目已标记为测试数据', { reloadProjects: true })}>标记测试数据</Button>}
              <DangerButton
                title={`删除项目「${project.name}」？`}
                description="项目下的迭代、需求、用例、执行计划、缺陷和报告数据都会被删除。"
                onConfirm={() => props.mutate(() => api.deleteProject(project.id), '项目已删除', { reloadProjects: true })}
              />
            </RowMoreMenu>
          </div>
        ])}
      />
      {filtered.length === 0 && (
        <EmptyState
          text="暂无项目"
          detail="创建第一个项目后即可维护成员、需求、用例与缺陷。"
          action={<button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建项目</button>}
        />
      )}
      <ProjectDrawer
        title="新建项目"
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={async (form) => {
          await props.mutate(
            () => api.createProject({ name: text(form, 'name'), code: text(form, 'code'), description: text(form, 'description'), status: text(form, 'status') as Project['status'], category: text(form, 'category') as Project['category'] }),
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
            () => api.updateProject(editing.id, { name: text(form, 'name'), code: text(form, 'code'), description: text(form, 'description'), status: text(form, 'status') as Project['status'], category: text(form, 'category') as Project['category'] }),
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
  const owner = props.project.members.find((member) => member.role === 'owner');
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
            () => api.upsertProjectMember(props.project.id, { email: text(form, 'email'), role: text(form, 'role') as ProjectMember['role'] }),
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
          <select name="role" defaultValue="tester">
            <option value="owner">负责人</option>
            <option value="tester">测试</option>
            <option value="developer">开发</option>
            <option value="viewer">只读</option>
          </select>
        </Field>
        <Button><Plus size={15} /> 添加</Button>
      </form>
      <datalist id="user-emails">
        {props.users.map((user) => <option key={user.id} value={user.email}>{user.username}</option>)}
      </datalist>
      <DataTable
        headers={['成员', '邮箱', '项目角色', '操作']}
        rows={props.project.members.map((member) => [
          member.username,
          member.email,
          member.role === 'owner' ? (
            <StatusBadge value="owner" />
          ) : (
            <select
              value={member.role}
              aria-label={`${member.username} 项目角色`}
              onChange={(event) =>
                props.mutate(
                  () => api.upsertProjectMember(props.project.id, { userId: member.userId, role: event.target.value as ProjectMember['role'] }),
                  '成员角色已更新',
                  { reloadProjects: true }
                )
              }
            >
              <option value="tester">{labelOf('tester')}</option>
              <option value="developer">{labelOf('developer')}</option>
              <option value="viewer">{labelOf('viewer')}</option>
            </select>
          ),
          member.role === 'owner' ? '负责人' : (
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
    </div>
  );
}
