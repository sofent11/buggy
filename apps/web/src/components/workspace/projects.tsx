import { useMemo, useState } from 'react';
import { Check, FolderKanban, Pencil, Plus, Save, Trash2, Users } from 'lucide-react';
import type { Project, ProjectMember, UserProfile } from '@buggy/shared-types';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { matchKeyword, shortDate, text } from '../../app/workspace-utils.js';
import { DataPage, DataTable, DangerButton, Drawer, EmptyState, HookForm, MetricCard, SearchBox, StatusBadge, Toolbar } from './common.js';

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
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [managingMembers, setManagingMembers] = useState<Project | null>(null);
  const filtered = useMemo(
    () => props.projects.filter((item) => matchKeyword([item.name, item.code || '', item.description || '', item.members.map((member) => member.username).join(' ')], keyword, props.searchKeyword)),
    [props.projects, keyword, props.searchKeyword]
  );
  const editingProject = editing ? props.projects.find((project) => project.id === editing.id) || editing : null;
  const memberProject = managingMembers ? props.projects.find((project) => project.id === managingMembers.id) || managingMembers : null;

  return (
    <DataPage
      title="项目管理"
      icon={FolderKanban}
      metrics={
        <section className="insight-strip">
          <MetricCard label="项目总数" value={props.projects.length} detail="当前可访问项目" tone="info" />
          <MetricCard label="成员覆盖" value={new Set(props.projects.flatMap((project) => project.members.map((member) => member.userId))).size} detail="去重成员数" />
          <MetricCard label="当前项目" value={props.currentProjectId ? '已选择' : '未选择'} detail={props.projects.find((project) => project.id === props.currentProjectId)?.name || '请选择项目'} tone={props.currentProjectId ? 'good' : 'risk'} />
          <MetricCard label="系统角色" value={labelOf(props.user.role)} detail={props.user.username} />
        </section>
      }
    >
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索项目、代号、成员" />
        <span className="toolbar-summary">{filtered.length} / {props.projects.length} 个项目</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建项目</button>
      </Toolbar>
      <DataTable
        headers={['项目', '代号', '成员', '负责人', '更新时间', '状态', '操作']}
        emptyText="暂无项目"
        rows={filtered.map((project) => [
          <div className="cell-main"><strong>{project.name}</strong><span>{project.description || '未填写描述'}</span></div>,
          project.code || '-',
          `${project.members.length} 人`,
          project.members.find((member) => member.role === 'owner')?.username || '-',
          shortDate(project.updatedAt),
          project.id === props.currentProjectId ? <StatusBadge value="当前项目" /> : <span className="muted">可选</span>,
          <div className="row-actions">
            <Button type="button" size="sm" onClick={() => props.onSelect(project.id)}><Check size={14} /> 选中</Button>
            <Button type="button" size="sm" onClick={() => setEditing(project)}><Pencil size={14} /> 详情</Button>
            <Button type="button" size="sm" onClick={() => setManagingMembers(project)}><Users size={14} /> 成员</Button>
            <DangerButton
              title={`删除项目「${project.name}」？`}
              description="项目下的迭代、需求、用例、执行计划、Bug 和报告数据都会被删除。"
              onConfirm={() => props.mutate(() => api.deleteProject(project.id), '项目已删除', { reloadProjects: true })}
            />
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
            () => api.createProject({ name: text(form, 'name'), code: text(form, 'code'), description: text(form, 'description') }),
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
            () => api.updateProject(editing.id, { name: text(form, 'name'), code: text(form, 'code'), description: text(form, 'description') }),
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
          defaultValues={{ name: props.row?.name || '', code: props.row?.code || '', description: props.row?.description || '' }}
          onSubmit={async (form) => props.onSubmit(form)}
        >
          {(register) => (
            <>
              <Field><FieldLabel>项目名称</FieldLabel><Input {...register('name')} required /></Field>
              <Field><FieldLabel>项目代号</FieldLabel><Input {...register('code')} /></Field>
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
