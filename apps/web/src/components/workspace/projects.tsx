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
  const filtered = useMemo(
    () => props.projects.filter((item) => matchKeyword([item.name, item.code || '', item.description || ''], keyword, props.searchKeyword)),
    [props.projects, keyword, props.searchKeyword]
  );

  return (
    <Section title="项目管理" icon={FolderKanban}>
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索项目" />
        <span className="toolbar-summary">{filtered.length} / {props.projects.length} 个项目</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}>
          <Plus size={16} /> 新建项目
        </button>
      </Toolbar>
      <div className="cards">
        {filtered.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            active={project.id === props.currentProjectId}
            users={props.users}
            onSelect={() => props.onSelect(project.id)}
            mutate={props.mutate}
          />
        ))}
      </div>
      {filtered.length === 0 && <EmptyState text="暂无项目" />}
      <Drawer title="新建项目" subtitle="创建项目档案后即可维护成员与测试资产。" open={creating} onClose={() => setCreating(false)}>
        <HookForm
          onSubmit={async (form) => {
            await props.mutate(
              () =>
                api.createProject({
                  name: text(form, 'name'),
                  code: text(form, 'code'),
                  description: text(form, 'description')
                }),
              '项目已创建',
              { reloadProjects: true }
            );
            setCreating(false);
          }}
        >
          {(register) => (
            <>
              <Field>
                <FieldLabel>项目名称</FieldLabel>
                <Input {...register('name')} placeholder="例如：移动端 6.0" required />
              </Field>
              <Field>
                <FieldLabel>项目代号</FieldLabel>
                <Input {...register('code')} placeholder="例如：APP-QA" />
              </Field>
              <Field>
                <FieldLabel>项目描述</FieldLabel>
                <Textarea {...register('description')} placeholder="补充项目范围、目标或协作说明" />
              </Field>
              <FormActions>
                <Button type="button" onClick={() => setCreating(false)}>取消</Button>
                <Button variant="primary"><Plus size={16} /> 创建项目</Button>
              </FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
    </Section>
  );
}

export function ProjectCard(props: {
  project: Project;
  active: boolean;
  users: UserProfile[];
  onSelect: () => void;
  mutate: (action: () => Promise<unknown>, message: string, options?: { reloadProjects?: boolean }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <article className={props.active ? 'item-card selected' : 'item-card'}>
      <CardHeader
        title={props.project.name}
        meta={[props.project.code || '未设置代号', props.project.description || '未填写描述', `${props.project.members.length} 名成员`]}
        badge={props.active ? '当前项目' : '项目'}
      />
      <div className="card-actions">
        <button type="button" onClick={props.onSelect}>
          <Check size={15} /> 选中
        </button>
        <button type="button" onClick={() => setEditing(true)}>
          <Pencil size={15} /> 编辑
        </button>
        <DangerButton
          onClick={() => {
            if (confirm(`删除项目「${props.project.name}」及其全部数据？`)) {
              props.mutate(() => api.deleteProject(props.project.id), '项目已删除', { reloadProjects: true });
            }
          }}
        />
      </div>
      {props.project.members.length > 0 && (
        <div className="member-list">
          {props.project.members.map((member) => (
            <span key={member.userId} className="chip">{member.username} · {labelOf(member.role)}</span>
          ))}
        </div>
      )}
      <Drawer title="编辑项目" subtitle={props.project.name} open={editing} onClose={() => setEditing(false)}>
        <div className="drawer-form">
          <HookForm
            defaultValues={{
              name: props.project.name,
              code: props.project.code || '',
              description: props.project.description || ''
            }}
            onSubmit={async (form) => {
              await props.mutate(
                () =>
                  api.updateProject(props.project.id, {
                    name: text(form, 'name'),
                    code: text(form, 'code'),
                    description: text(form, 'description')
                  }),
                '项目已保存',
                { reloadProjects: true }
              );
              setEditing(false);
            }}
          >
            {(register) => (
              <>
                <Field>
                  <FieldLabel>项目名称</FieldLabel>
                  <Input {...register('name')} placeholder="项目名称" />
                </Field>
                <Field>
                  <FieldLabel>项目代号</FieldLabel>
                  <Input {...register('code')} placeholder="项目代号" />
                </Field>
                <Field>
                  <FieldLabel>项目描述</FieldLabel>
                  <Textarea {...register('description')} placeholder="项目描述" />
                </Field>
                <FormActions>
                  <Button type="button" onClick={() => setEditing(false)}>取消</Button>
                  <Button variant="primary"><Save size={15} /> 保存项目</Button>
                </FormActions>
              </>
            )}
          </HookForm>
          <MemberManager project={props.project} users={props.users} mutate={props.mutate} />
        </div>
      </Drawer>
    </article>
  );
}

export function MemberManager(props: {
  project: Project;
  users: UserProfile[];
  mutate: (action: () => Promise<unknown>, message: string, options?: { reloadProjects?: boolean }) => Promise<void>;
}) {
  return (
    <div className="sub-panel">
      <div className="sub-title">
        <Users size={16} /> 成员
      </div>
      <form
        className="inline-form compact"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          props.mutate(
            () =>
              api.upsertProjectMember(props.project.id, {
                email: text(form, 'email'),
                role: text(form, 'role') as ProjectMember['role']
              }),
            '成员已保存',
            { reloadProjects: true }
          );
          event.currentTarget.reset();
        }}
      >
        <Input name="email" placeholder="用户邮箱" list="user-emails" required />
        <select name="role" defaultValue="tester">
          <option value="owner">负责人</option>
          <option value="tester">测试</option>
          <option value="developer">开发</option>
          <option value="viewer">只读</option>
        </select>
        <Button>
          <Plus size={15} /> 添加
        </Button>
      </form>
      <datalist id="user-emails">
        {props.users.map((user) => (
          <option key={user.id} value={user.email}>
            {user.username}
          </option>
        ))}
      </datalist>
      <div className="member-list">
        {props.project.members.map((member) => (
          <span key={member.userId} className="chip">
            {member.username} · {labelOf(member.role)}
            {member.role !== 'owner' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="icon-link"
                onClick={() =>
                  props.mutate(() => api.removeProjectMember(props.project.id, member.userId), '成员已移除', { reloadProjects: true })
                }
              >
                <Trash2 size={13} />
              </Button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
