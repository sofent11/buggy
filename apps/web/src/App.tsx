import { useEffect, useMemo, useState } from 'react';
import { useForm, type UseFormRegister } from 'react-hook-form';
import {
  Activity,
  BarChart3,
  Bell,
  Bug as BugIcon,
  CalendarRange,
  Check,
  ClipboardCheck,
  Clock3,
  Download,
  FileSpreadsheet,
  Flag,
  FolderKanban,
  HelpCircle,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users
} from 'lucide-react';
import type {
  Bug,
  Dictionary,
  DictionaryValue,
  Iteration,
  Project,
  ProjectMember,
  ReportSummary,
  Requirement,
  TestCase,
  TestPlan,
  TestRunItem,
  UserProfile
} from '@buggy/shared-types';
import { api, downloadUrl, type ImportResult } from './api.js';
import { Badge } from './components/ui/badge.js';
import { Button } from './components/ui/button.js';
import { Card, CardContent, CardHeader as UiCardHeader, CardTitle } from './components/ui/card.js';
import { Field, FieldLabel, FormActions } from './components/ui/form.js';
import { Input } from './components/ui/input.js';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetX } from './components/ui/sheet.js';
import { Textarea } from './components/ui/textarea.js';
import { labelOf } from './labels.js';

type Tab = 'overview' | 'projects' | 'iterations' | 'requirements' | 'cases' | 'plans' | 'bugs' | 'reports' | 'settings';

type WorkspaceData = {
  iterations: Iteration[];
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  bugs: Bug[];
  report: ReportSummary | null;
  dictionaries: Dictionary[];
  users: UserProfile[];
};

type AuthFormValues = {
  username: string;
  email: string;
  password: string;
};

type StringFormValues = Record<string, string>;

const emptyData: WorkspaceData = {
  iterations: [],
  requirements: [],
  cases: [],
  plans: [],
  bugs: [],
  report: null,
  dictionaries: [],
  users: []
};

const LOGGED_OUT_KEY = 'buggy_logged_out';

const requirementStatuses = ['draft', 'ready', 'testing', 'done', 'blocked'] as const;
const iterationStatuses = ['planning', 'active', 'done', 'archived'] as const;
const caseStatuses = ['draft', 'ready', 'deprecated'] as const;
const planStatuses = ['draft', 'active', 'done', 'archived'] as const;
const runStatuses = ['untested', 'passed', 'failed', 'blocked', 'skipped'] as const;
const bugStatuses = ['open', 'in_progress', 'resolved', 'verified', 'closed', 'reopened'] as const;
const priorities = ['P0', 'P1', 'P2', 'P3'] as const;
const severities = ['S0', 'S1', 'S2', 'S3'] as const;
const systemRoles = ['admin', 'project_owner', 'tester', 'developer', 'viewer'] as const;
const userStatuses = ['active', 'disabled'] as const;

export function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const authForm = useForm<AuthFormValues>({
    defaultValues: { username: 'admin', email: 'admin@example.com', password: '123456' }
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [globalKeyword, setGlobalKeyword] = useState('');
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const currentProject = projects.find((project) => project.id === currentProjectId);

  useEffect(() => {
    if (localStorage.getItem(LOGGED_OUT_KEY) === '1') {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(async (profile) => {
        setUser(profile);
        if (profile) await loadProjects();
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (currentProjectId) void loadWorkspace(currentProjectId);
  }, [currentProjectId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function loadProjects() {
    const rows = await api.projects();
    setProjects(rows);
    setCurrentProjectId((prev) => (prev && rows.some((item) => item.id === prev) ? prev : rows[0]?.id || ''));
  }

  async function loadWorkspace(projectId = currentProjectId) {
    if (!projectId) {
      setData(emptyData);
      return;
    }
    setBusy(true);
    try {
      const [iterations, requirements, cases, plans, bugs, report, dictionaries, users] = await Promise.all([
        api.iterations(projectId),
        api.requirements(projectId),
        api.testCases(projectId),
        api.testPlans(projectId),
        api.bugs(projectId),
        api.report(projectId),
        api.dictionaries(projectId),
        api.users()
      ]);
      setData({ iterations, requirements, cases, plans, bugs, report, dictionaries, users });
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function mutate(action: () => Promise<unknown>, message: string, options?: { reloadProjects?: boolean }) {
    setBusy(true);
    try {
      await action();
      if (options?.reloadProjects) await loadProjects();
      await loadWorkspace();
      setNotice(message);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function mutateWithResult<T>(action: () => Promise<T>, resolveMessage: (result: T) => string, options?: { reloadProjects?: boolean }) {
    setBusy(true);
    try {
      const result = await action();
      if (options?.reloadProjects) await loadProjects();
      await loadWorkspace();
      setNotice(resolveMessage(result));
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAuth(values: AuthFormValues) {
    setBusy(true);
    try {
      const profile =
        authMode === 'login'
          ? await api.login({ email: values.email.trim(), password: values.password })
          : await api.register({ username: values.username.trim(), email: values.email.trim(), password: values.password });
      localStorage.removeItem(LOGGED_OUT_KEY);
      setUser(profile);
      setNotice(`欢迎，${profile.username}`);
      await loadProjects();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setProjects([]);
      setCurrentProjectId('');
      setData(emptyData);
      setNotice('');
      localStorage.setItem(LOGGED_OUT_KEY, '1');
    }
  }

  const dashboard = useMemo(() => {
    const report = data.report;
    return [
      { label: '需求', value: report?.requirements.total || 0, detail: `${report?.requirements.done || 0} 已完成`, icon: Flag },
      { label: '用例', value: report?.cases.total || 0, detail: `${report?.cases.ready || 0} 可执行`, icon: ClipboardCheck },
      { label: '通过率', value: `${report?.execution.passRate || 0}%`, detail: `${report?.execution.passed || 0}/${report?.execution.total || 0}`, icon: Activity },
      { label: '活跃 Bug', value: report?.bugs.active || 0, detail: `${report?.bugs.total || 0} 总数`, icon: BugIcon }
    ];
  }, [data.report]);
  const page = pageInfo(tab);
  const visibleData = useMemo(() => filterWorkspaceData(data, globalKeyword), [data, globalKeyword]);

  if (loading) return <div className="boot">正在启动 Buggy...</div>;

  if (!user) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">Buggy</p>
            <h1>测试管理平台</h1>
            <p className="muted">项目、迭代、需求、用例、执行、缺陷、报告与 Lark 日报闭环。</p>
          </div>
          <form onSubmit={authForm.handleSubmit(submitAuth)} className="stack">
            <div className="segmented">
              <Button type="button" variant="ghost" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>
                注册
              </Button>
              <Button type="button" variant="ghost" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>
                登录
              </Button>
            </div>
            {authMode === 'register' && (
              <Field>
                <FieldLabel>用户名</FieldLabel>
                <Input {...authForm.register('username')} />
              </Field>
            )}
            <Field>
              <FieldLabel>邮箱</FieldLabel>
              <Input {...authForm.register('email')} />
            </Field>
            <Field>
              <FieldLabel>密码</FieldLabel>
              <Input type="password" {...authForm.register('password')} />
            </Field>
            <Button variant="primary" type="submit" disabled={busy}>
              <ShieldCheck size={18} /> {authMode === 'register' ? '创建账号' : '进入系统'}
            </Button>
            {notice && <p className="notice">{notice}</p>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><BugIcon size={20} /></div>
          <div>
            <strong>Buggy</strong>
            <span>Enterprise QA System</span>
          </div>
        </div>
        <nav>
          <NavButton tab="overview" current={tab} icon={BarChart3} label="总览" onClick={setTab} />
          <NavButton tab="projects" current={tab} icon={FolderKanban} label="项目" onClick={setTab} />
          <NavButton tab="iterations" current={tab} icon={CalendarRange} label="迭代" onClick={setTab} />
          <NavButton tab="requirements" current={tab} icon={Flag} label="需求" onClick={setTab} />
          <NavButton tab="cases" current={tab} icon={ClipboardCheck} label="用例" onClick={setTab} />
          <NavButton tab="plans" current={tab} icon={Activity} label="执行" onClick={setTab} />
          <NavButton tab="bugs" current={tab} icon={BugIcon} label="Bug" onClick={setTab} />
          <NavButton tab="reports" current={tab} icon={FileSpreadsheet} label="报告" onClick={setTab} />
          <NavButton tab="settings" current={tab} icon={Settings} label="配置" onClick={setTab} />
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="ghost">
            <HelpCircle size={16} /> 帮助中心
          </button>
          <button type="button" className="ghost" onClick={logout}>
            <LogOut size={16} /> 退出
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="global-search" aria-label="全局搜索">
            <Search size={20} />
            <input
              value={globalKeyword}
              onChange={(event) => setGlobalKeyword(event.target.value)}
              placeholder="搜索需求、用例、Bug、项目..."
            />
          </label>
          <div className="top-actions">
            <select value={currentProjectId} onChange={(event) => setCurrentProjectId(event.target.value)}>
              <option value="">选择项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button className="icon-button" title="刷新" onClick={() => loadWorkspace()} disabled={busy || !currentProjectId}>
              <RefreshCw size={17} />
            </button>
            <button className="icon-button" title="通知" type="button"><Bell size={18} /></button>
            <button className="icon-button" title="历史" type="button"><Clock3 size={18} /></button>
            <button className="icon-button" title="消息" type="button"><MessageSquare size={18} /></button>
            <span className="user-pill">{user.username} · {labelOf(user.role)}</span>
          </div>
        </header>

        {notice && <div className="notice">{notice}</div>}

        <div className="page-title">
          <div>
            <p className="eyebrow">{currentProject?.code || 'Buggy'}</p>
            <h1>{page.title}</h1>
            <p>{page.description(currentProject?.name || '未选择项目')}</p>
          </div>
          {globalKeyword && (
            <button className="link-button" type="button" onClick={() => setGlobalKeyword('')}>
              清除搜索
            </button>
          )}
        </div>

        {!currentProject && tab !== 'projects' ? (
          <ProjectSection
            user={user}
            projects={projects}
            searchKeyword={globalKeyword}
            currentProjectId={currentProjectId}
            users={data.users}
            onSelect={setCurrentProjectId}
            onNotice={setNotice}
            mutate={mutate}
          />
        ) : (
          <>
            {tab === 'overview' && currentProject && (
              <section className="grid">
                {dashboard.map((item) => (
                  <article key={item.label} className="metric">
                    <item.icon size={22} />
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.detail}</small>
                  </article>
                ))}
                <RecentWork data={visibleData} />
                <section className="panel wide">
                  <h2>项目风险</h2>
                  <RiskBoard report={data.report} />
                </section>
              </section>
            )}
            {tab === 'projects' && (
              <ProjectSection
                user={user}
                projects={projects}
                searchKeyword={globalKeyword}
                currentProjectId={currentProjectId}
                users={data.users}
                onSelect={setCurrentProjectId}
                onNotice={setNotice}
                mutate={mutate}
              />
            )}
            {tab === 'iterations' && currentProject && (
              <IterationSection
                projectId={currentProject.id}
                rows={visibleData.iterations}
                mutate={mutate}
              />
            )}
            {tab === 'requirements' && currentProject && (
              <RequirementSection
                projectId={currentProject.id}
                iterations={data.iterations}
                users={data.users}
                rows={visibleData.requirements}
                mutate={mutate}
              />
            )}
            {tab === 'cases' && currentProject && (
              <CaseSection
                projectId={currentProject.id}
                requirements={data.requirements}
                rows={visibleData.cases}
                mutate={mutate}
              />
            )}
            {tab === 'plans' && currentProject && (
              <PlanSection
                projectId={currentProject.id}
                requirements={data.requirements}
                iterations={data.iterations}
                cases={data.cases}
                rows={visibleData.plans}
                bugs={data.bugs}
                mutate={mutate}
              />
            )}
            {tab === 'bugs' && currentProject && (
              <BugSection
                projectId={currentProject.id}
                requirements={data.requirements}
                cases={data.cases}
                plans={data.plans}
                users={data.users}
                rows={visibleData.bugs}
                mutate={mutate}
              />
            )}
            {tab === 'reports' && currentProject && <ReportSection projectId={currentProject.id} report={data.report} />}
            {tab === 'settings' && currentProject && (
              <SettingsSection
                projectId={currentProject.id}
                currentUser={user}
                dictionaries={data.dictionaries}
                users={data.users}
                onNotice={setNotice}
                mutate={mutate}
                mutateWithResult={mutateWithResult}
              />
            )}
          </>
        )}
      </section>
    </main>
  );
}

function NavButton(props: { tab: Tab; current: Tab; label: string; icon: typeof FolderKanban; onClick: (tab: Tab) => void }) {
  return (
    <button className={props.current === props.tab ? 'active' : ''} onClick={() => props.onClick(props.tab)}>
      <props.icon size={18} /> {props.label}
    </button>
  );
}

function Drawer(props: { title: string; subtitle?: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Sheet open={props.open} onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <SheetContent>
        <SheetHeader>
          <div>
            <SheetTitle>{props.title}</SheetTitle>
            {props.subtitle && <SheetDescription>{props.subtitle}</SheetDescription>}
          </div>
          <SheetX />
        </SheetHeader>
        <SheetBody>{props.children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function HookForm(props: {
  defaultValues?: StringFormValues;
  className?: string;
  onSubmit: (form: FormData, values: StringFormValues) => Promise<void>;
  children: (register: UseFormRegister<StringFormValues>) => React.ReactNode;
}) {
  const form = useForm<StringFormValues>({ defaultValues: props.defaultValues || {} });
  return (
    <form
      className={props.className || 'drawer-form'}
      onSubmit={form.handleSubmit(async (values) => props.onSubmit(formDataFromValues(values), values))}
    >
      {props.children(form.register)}
    </form>
  );
}

function registerField(register: UseFormRegister<StringFormValues> | undefined, name: string) {
  return register ? register(name) : { name };
}

function ProjectSection(props: {
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
              <Input {...register('name')} placeholder="项目名称" required />
              <Input {...register('code')} placeholder="项目代号" />
              <Textarea {...register('description')} placeholder="项目描述" />
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

function ProjectCard(props: {
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
                <Input {...register('name')} aria-label="项目名称" placeholder="项目名称" />
                <Input {...register('code')} aria-label="项目代号" placeholder="项目代号" />
                <Textarea {...register('description')} aria-label="项目描述" placeholder="项目描述" />
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

function MemberManager(props: {
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

function IterationSection(props: {
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

function IterationDrawer(props: {
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
            <Input {...register('name')} aria-label="迭代名称" placeholder="迭代名称" required />
            <Input {...register('goal')} aria-label="迭代目标" placeholder="迭代目标" />
            <Input {...register('startDate')} aria-label="开始日期" type="date" />
            <Input {...register('endDate')} aria-label="结束日期" type="date" />
            <Select name="status" register={register} values={iterationStatuses} defaultValue={props.row?.status || 'planning'} />
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

function RequirementSection(props: {
  projectId: string;
  iterations: Iteration[];
  users: UserProfile[];
  rows: Requirement[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const rows = props.rows.filter((row) => (!status || row.status === status) && matchKeyword([row.title, row.description || '', row.priority], keyword));
  return (
    <Section title="需求管理" icon={Flag}>
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索需求" />
        <Select value={status} onChange={setStatus} values={requirementStatuses} emptyLabel="全部状态" />
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建需求</button>
      </Toolbar>
      <div className="cards">
        {rows.map((row) => (
          <article className="item-card" key={row.id}>
            <CardHeader
              title={row.title}
              meta={[
                `优先级 ${row.priority}`,
                row.iterationId ? iterationName(props.iterations, row.iterationId) : '未绑定迭代',
                row.ownerId ? userName(props.users, row.ownerId) : '未指派负责人'
              ]}
              badge={labelOf(row.status)}
            />
            {row.description && <p>{row.description}</p>}
            <div className="card-actions">
              <button type="button" onClick={() => setEditing(row)}><Pencil size={15} /> 编辑</button>
              <button type="button" onClick={() => props.mutate(() => api.sendLark(row.id), 'Lark 日报已发送')}>
                <Send size={15} /> 发送 Lark
              </button>
              <DangerButton onClick={() => props.mutate(() => api.deleteRequirement(row.id), '需求已删除')} />
            </div>
          </article>
        ))}
      </div>
      {rows.length === 0 && <EmptyState text="暂无需求" />}
      <RequirementDrawer
        title="新建需求"
        open={creating}
        iterations={props.iterations}
        users={props.users}
        onClose={() => setCreating(false)}
        onSubmit={async (form) => {
          await props.mutate(() => api.createRequirement(requirementPayload(form, props.projectId)), '需求已创建');
          setCreating(false);
        }}
      />
      <RequirementDrawer
        title="编辑需求"
        row={editing || undefined}
        open={Boolean(editing)}
        iterations={props.iterations}
        users={props.users}
        onClose={() => setEditing(null)}
        onSubmit={async (form) => {
          if (!editing) return;
          await props.mutate(() => api.updateRequirement(editing.id, requirementPayload(form, props.projectId)), '需求已保存');
          setEditing(null);
        }}
      />
    </Section>
  );
}

function RequirementFields(props: { row?: Requirement; iterations: Iteration[]; users: UserProfile[]; register?: UseFormRegister<StringFormValues> }) {
  return (
    <div className="field-grid">
      <Input {...registerField(props.register, 'title')} placeholder="需求标题" defaultValue={props.row?.title} required />
      <select {...registerField(props.register, 'iterationId')} aria-label="绑定迭代" defaultValue={props.row?.iterationId || ''}>
        <option value="">不绑定迭代</option>
        {props.iterations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select {...registerField(props.register, 'ownerId')} aria-label="需求负责人" defaultValue={props.row?.ownerId || ''}>
        <option value="">未指派负责人</option>
        {props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}
      </select>
      <Select name="priority" register={props.register} values={priorities} defaultValue={props.row?.priority || 'P2'} />
      <Select name="status" register={props.register} values={requirementStatuses} defaultValue={props.row?.status || 'ready'} />
      <Input {...registerField(props.register, 'larkWebhook')} placeholder="Lark webhook" defaultValue={props.row?.larkWebhook} />
      <Textarea {...registerField(props.register, 'description')} placeholder="需求描述" defaultValue={props.row?.description} />
    </div>
  );
}

function RequirementDrawer(props: {
  title: string;
  row?: Requirement;
  open: boolean;
  iterations: Iteration[];
  users: UserProfile[];
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '维护需求状态、负责人和描述'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <RequirementFields row={props.row} iterations={props.iterations} users={props.users} register={register} />
            <FormActions>
              <Button type="button" onClick={props.onClose}>取消</Button>
              <Button variant="primary"><Save size={15} /> 保存需求</Button>
            </FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

function CaseSection(props: {
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

function TestCaseFields(props: { row?: TestCase; requirements: Requirement[]; register?: UseFormRegister<StringFormValues> }) {
  const step = props.row?.steps[0];
  return (
    <div className="field-grid">
      <Input {...registerField(props.register, 'title')} placeholder="用例标题" defaultValue={props.row?.title} required />
      <select {...registerField(props.register, 'requirementId')} aria-label="绑定需求" defaultValue={props.row?.requirementId || ''}>
        <option value="">不绑定需求</option>
        {props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      <Select name="priority" register={props.register} values={priorities} defaultValue={props.row?.priority || 'P2'} />
      <Select name="status" register={props.register} values={caseStatuses} defaultValue={props.row?.status || 'ready'} />
      <Input {...registerField(props.register, 'preconditions')} placeholder="前置条件" defaultValue={props.row?.preconditions} />
      <Input {...registerField(props.register, 'step')} placeholder="测试步骤" defaultValue={step?.action} />
      <Input {...registerField(props.register, 'expected')} placeholder="步骤预期" defaultValue={step?.expected} />
      <Textarea {...registerField(props.register, 'expectedResult')} placeholder="最终预期结果" defaultValue={props.row?.expectedResult} />
    </div>
  );
}

function TestCaseDrawer(props: {
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

function PlanSection(props: {
  projectId: string;
  iterations: Iteration[];
  requirements: Requirement[];
  cases: TestCase[];
  rows: TestPlan[];
  bugs: Bug[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [requirementFilter, setRequirementFilter] = useState('');
  const visibleCases = props.cases.filter((item) => !requirementFilter || item.requirementId === requirementFilter);
  const toggleCase = (id: string) =>
    setSelectedCases((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  return (
    <Section title="测试执行" icon={Activity}>
      <Toolbar>
        <span className="toolbar-summary">{props.rows.length} 个测试计划 · {props.cases.length} 条可选用例</span>
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建计划</button>
      </Toolbar>
      <div className="cards">
        {props.rows.map((plan) => (
          <PlanCard key={plan.id} plan={plan} cases={props.cases} bugs={props.bugs} mutate={props.mutate} />
        ))}
      </div>
      {props.rows.length === 0 && <EmptyState text="暂无测试计划" />}
      <Drawer title="新建测试计划" subtitle="选择轮次、关联范围和本轮要执行的用例。" open={creating} onClose={() => setCreating(false)}>
        <HookForm onSubmit={async (form) => {
          if (selectedCases.length === 0) {
            alert('请至少选择一个用例');
            return;
          }
          await props.mutate(
            () =>
              api.createTestPlan({
                projectId: props.projectId,
                iterationId: text(form, 'iterationId') || undefined,
                requirementId: text(form, 'requirementId') || undefined,
                name: text(form, 'name'),
                round: text(form, 'round') || '第 1 轮',
                caseIds: selectedCases
              }),
            '测试计划已创建'
          );
          setSelectedCases([]);
          setCreating(false);
        }}>
          {(register) => (
            <>
              <Input {...register('name')} placeholder="计划名称" required />
              <Input {...register('round')} placeholder="轮次，如第 1 轮" />
              <select {...register('iterationId')}><option value="">不绑定迭代</option>{props.iterations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select {...register('requirementId')} onChange={(event) => setRequirementFilter(event.target.value)}>
                <option value="">全部需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
              <div className="case-picker">
                {visibleCases.map((testCase) => (
                  <label key={testCase.id} className="check-row">
                    <input type="checkbox" checked={selectedCases.includes(testCase.id)} onChange={() => toggleCase(testCase.id)} />
                    <span>{testCase.title}</span>
                    <small>{testCase.priority} · {labelOf(testCase.status)}</small>
                  </label>
                ))}
                {visibleCases.length === 0 && <EmptyState text="还没有可选用例" />}
              </div>
              <FormActions>
                <Button type="button" onClick={() => setCreating(false)}>取消</Button>
                <Button variant="primary"><Plus size={16} /> 创建计划</Button>
              </FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
    </Section>
  );
}

function PlanCard(props: {
  plan: TestPlan;
  cases: TestCase[];
  bugs: Bug[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [caseIds, setCaseIds] = useState(props.plan.caseIds);
  useEffect(() => setCaseIds(props.plan.caseIds), [props.plan.caseIds]);
  const progress = executionProgress(props.plan.runItems);
  return (
    <article className="item-card">
      <CardHeader
        title={props.plan.name}
        meta={[props.plan.round, `${props.plan.runItems.length} 条执行项`, executionProgress(props.plan.runItems)]}
        badge={labelOf(props.plan.status)}
      />
      <div className="card-actions">
        <span className="progress-pill">{progress}</span>
        <button type="button" onClick={() => setEditing(true)}><Pencil size={15} /> 编辑计划</button>
        <DangerButton onClick={() => props.mutate(() => api.deleteTestPlan(props.plan.id), '测试计划已删除')} />
      </div>
      <div className="run-list">
        {props.plan.runItems.map((item) => (
          <RunItemRow key={item.id} planId={props.plan.id} item={item} bugs={props.bugs} mutate={props.mutate} />
        ))}
      </div>
      <Drawer title="编辑测试计划" subtitle={props.plan.name} open={editing} onClose={() => setEditing(false)}>
        <HookForm
          defaultValues={{ name: props.plan.name, round: props.plan.round, status: props.plan.status }}
          onSubmit={async (form) => {
            await props.mutate(
              () => api.updateTestPlan(props.plan.id, { name: text(form, 'name'), round: text(form, 'round'), status: text(form, 'status') as never, caseIds }),
              '测试计划已保存'
            );
            setEditing(false);
          }}
        >
          {(register) => (
            <>
              <Input {...register('name')} aria-label="计划名称" placeholder="计划名称" />
              <Input {...register('round')} aria-label="执行轮次" placeholder="执行轮次" />
              <Select name="status" register={register} values={planStatuses} defaultValue={props.plan.status} />
              <div className="sub-title">调整用例范围</div>
              <div className="case-picker compact-picker">
                {props.cases.map((testCase) => (
                  <label key={testCase.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={caseIds.includes(testCase.id)}
                      onChange={() => setCaseIds((current) => (current.includes(testCase.id) ? current.filter((id) => id !== testCase.id) : [...current, testCase.id]))}
                    />
                    <span>{testCase.title}</span>
                  </label>
                ))}
              </div>
              <FormActions>
                <Button type="button" onClick={() => setEditing(false)}>取消</Button>
                <Button variant="primary"><Save size={15} /> 保存计划</Button>
              </FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
    </article>
  );
}

function RunItemRow(props: {
  planId: string;
  item: TestRunItem;
  bugs: Bug[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const linkedBugs = props.bugs.filter((bug) => props.item.bugIds.includes(bug.id));
  return (
    <div className="run-row">
      <div className="run-title">
        <strong>{props.item.caseTitle}</strong>
        <span>{labelOf(props.item.status)}</span>
      </div>
      <span>{props.item.actualResult || '未记录实际结果'}</span>
      <button type="button" onClick={() => setEditing(true)}><Pencil size={15} /> 记录结果</button>
      <button type="button" onClick={() => props.mutate(
        () => api.createBugFromRun({ testPlanId: props.planId, runItemId: props.item.id, title: `${props.item.caseTitle} 执行失败`, actualResult: props.item.actualResult }),
        'Bug 已从执行项创建'
      )}>
        <BugIcon size={15} /> 建 Bug
      </button>
      {linkedBugs.length > 0 && <small className="linked-bugs">{linkedBugs.map((bug) => bug.title).join('、')}</small>}
      <Drawer title="记录执行结果" subtitle={props.item.caseTitle} open={editing} onClose={() => setEditing(false)}>
        <HookForm
          defaultValues={{ status: props.item.status, actualResult: props.item.actualResult || '' }}
          onSubmit={async (form) => {
            await props.mutate(
              () => api.updateRunItem(props.planId, props.item.id, { status: text(form, 'status'), actualResult: text(form, 'actualResult') }),
              '执行结果已更新'
            );
            setEditing(false);
          }}
        >
          {(register) => (
            <>
              <Select name="status" register={register} values={runStatuses} defaultValue={props.item.status} />
              <Textarea {...register('actualResult')} aria-label={`${props.item.caseTitle} 实际结果`} placeholder="实际结果" />
              <FormActions>
                <Button type="button" onClick={() => setEditing(false)}>取消</Button>
                <Button variant="primary"><Save size={15} /> 保存结果</Button>
              </FormActions>
            </>
          )}
        </HookForm>
      </Drawer>
    </div>
  );
}

function BugSection(props: {
  projectId: string;
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  users: UserProfile[];
  rows: Bug[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bug | null>(null);
  const rows = props.rows.filter((row) => (!status || row.status === status) && matchKeyword([row.title, row.actualResult || '', row.severity], keyword));
  return (
    <Section title="Bug 管理" icon={BugIcon}>
      <Toolbar>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索 Bug" />
        <Select value={status} onChange={setStatus} values={bugStatuses} emptyLabel="全部状态" />
        <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建 Bug</button>
      </Toolbar>
      <div className="cards">
        {rows.map((row) => (
          <article className="item-card" key={row.id}>
            <CardHeader
              title={row.title}
              meta={[
                `严重级别 ${row.severity}`,
                `优先级 ${row.priority}`,
                row.assigneeId ? userName(props.users, row.assigneeId) : '未指派',
                row.actualResult || '未填写实际结果'
              ]}
              badge={labelOf(row.status)}
            />
            {row.reproduceSteps && <p>{row.reproduceSteps}</p>}
            <div className="card-actions">
              <button type="button" onClick={() => setEditing(row)}><Pencil size={15} /> 编辑</button>
              <DangerButton onClick={() => props.mutate(() => api.deleteBug(row.id), 'Bug 已删除')} />
            </div>
          </article>
        ))}
      </div>
      {rows.length === 0 && <EmptyState text="暂无 Bug" />}
      <BugDrawer
        title="新建 Bug"
        open={creating}
        requirements={props.requirements}
        cases={props.cases}
        plans={props.plans}
        users={props.users}
        onClose={() => setCreating(false)}
        onSubmit={async (form) => {
          await props.mutate(() => api.createBug(bugPayload(form, props.projectId)), 'Bug 已创建');
          setCreating(false);
        }}
      />
      <BugDrawer
        title="编辑 Bug"
        row={editing || undefined}
        open={Boolean(editing)}
        requirements={props.requirements}
        cases={props.cases}
        plans={props.plans}
        users={props.users}
        onClose={() => setEditing(null)}
        onSubmit={async (form) => {
          if (!editing) return;
          await props.mutate(() => api.updateBug(editing.id, bugPayload(form, props.projectId)), 'Bug 已保存');
          setEditing(null);
        }}
      />
    </Section>
  );
}

function BugFields(props: { row?: Bug; requirements: Requirement[]; cases: TestCase[]; plans: TestPlan[]; users: UserProfile[]; register?: UseFormRegister<StringFormValues> }) {
  return (
    <div className="field-grid">
      <Input {...registerField(props.register, 'title')} placeholder="Bug 标题" defaultValue={props.row?.title} required />
      <select {...registerField(props.register, 'requirementId')} aria-label="关联需求" defaultValue={props.row?.requirementId || ''}>
        <option value="">不绑定需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      <select {...registerField(props.register, 'testCaseId')} aria-label="关联用例" defaultValue={props.row?.testCaseId || ''}>
        <option value="">不绑定用例</option>{props.cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      <select {...registerField(props.register, 'testPlanId')} aria-label="关联计划" defaultValue={props.row?.testPlanId || ''}>
        <option value="">不绑定计划</option>{props.plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select {...registerField(props.register, 'assigneeId')} aria-label="Bug 负责人" defaultValue={props.row?.assigneeId || ''}>
        <option value="">未指派</option>{props.users.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}
      </select>
      <Select name="severity" register={props.register} values={severities} defaultValue={props.row?.severity || 'S2'} />
      <Select name="priority" register={props.register} values={priorities} defaultValue={props.row?.priority || 'P2'} />
      <Select name="status" register={props.register} values={bugStatuses} defaultValue={props.row?.status || 'open'} />
      <Textarea {...registerField(props.register, 'reproduceSteps')} placeholder="复现步骤" defaultValue={props.row?.reproduceSteps} />
      <Textarea {...registerField(props.register, 'actualResult')} placeholder="实际结果" defaultValue={props.row?.actualResult} />
      <Textarea {...registerField(props.register, 'expectedResult')} placeholder="期望结果" defaultValue={props.row?.expectedResult} />
    </div>
  );
}

function BugDrawer(props: {
  title: string;
  row?: Bug;
  open: boolean;
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  users: UserProfile[];
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  return (
    <Drawer title={props.title} subtitle={props.row?.title || '记录复现步骤、预期结果和责任人'} open={props.open} onClose={props.onClose}>
      <HookForm onSubmit={async (form) => props.onSubmit(form)}>
        {(register) => (
          <>
            <BugFields row={props.row} requirements={props.requirements} cases={props.cases} plans={props.plans} users={props.users} register={register} />
            <FormActions>
              <Button type="button" onClick={props.onClose}>取消</Button>
              <Button variant="primary"><Save size={15} /> 保存 Bug</Button>
            </FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

function ReportSection(props: { projectId: string; report: ReportSummary | null }) {
  const report = props.report;
  return (
    <Section title="统计报告" icon={BarChart3}>
      <div className="report-actions">
        <a className="primary link-button" href={downloadUrl(`/reports/html?projectId=${props.projectId}`)} target="_blank" rel="noreferrer">
          打开 HTML 报告
        </a>
        <ExportLink projectId={props.projectId} type="requirements" label="导出需求" />
        <ExportLink projectId={props.projectId} type="test-cases" label="导出用例" />
        <ExportLink projectId={props.projectId} type="bugs" label="导出 Bug" />
      </div>
      {report ? (
        <>
          <div className="grid report-grid">
            <Metric label="需求完成率" value={rate(report.requirements.done, report.requirements.total)} detail={`${report.requirements.done}/${report.requirements.total}`} />
            <Metric label="用例准备率" value={rate(report.cases.ready, report.cases.total)} detail={`${report.cases.ready}/${report.cases.total}`} />
            <Metric label="执行通过率" value={`${report.execution.passRate}%`} detail={`${report.execution.passed}/${report.execution.total}`} />
            <Metric label="活跃 Bug" value={report.bugs.active} detail={`${report.bugs.total} 总数`} />
          </div>
          <Table
            headers={['域', '核心指标', '明细']}
            rows={[
              ['需求', `${report.requirements.total} 个`, `完成 ${report.requirements.done}，测试中 ${report.requirements.testing}，阻塞 ${report.requirements.blocked}`],
              ['执行', `${report.execution.passRate}% 通过率`, `通过 ${report.execution.passed}，失败 ${report.execution.failed}，阻塞 ${report.execution.blocked}，未测 ${report.execution.untested}`],
              ['Bug', `${report.bugs.active} 个活跃`, `新建 ${report.bugs.open}，处理中 ${report.bugs.inProgress}，已解决 ${report.bugs.resolved}，重开 ${report.bugs.reopened}`]
            ]}
          />
        </>
      ) : (
        <EmptyState text="暂无报告数据" />
      )}
    </Section>
  );
}

function SettingsSection(props: {
  projectId: string;
  currentUser: UserProfile;
  dictionaries: Dictionary[];
  users: UserProfile[];
  onNotice: (message: string) => void;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
  mutateWithResult: <T>(action: () => Promise<T>, resolveMessage: (result: T) => string) => Promise<void>;
}) {
  return (
    <Section title="系统配置" icon={Settings}>
      <div className="cards two">
        <article className="item-card">
          <strong>Excel 模板</strong>
          <p>下载模板后可按表头批量导入需求、用例和 Bug。</p>
          <div className="report-actions">
            <TemplateLink type="requirements" label="需求模板" />
            <TemplateLink type="test-cases" label="用例模板" />
            <TemplateLink type="bugs" label="Bug 模板" />
          </div>
        </article>
        <article className="item-card">
          <strong>Excel 导入</strong>
          <p>上传 `.xlsx` 文件，系统会解析首个工作表并按表头导入。</p>
          <form className="stack" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const file = form.get('file');
            if (!(file instanceof File) || !file.name) {
              props.onNotice('请选择 Excel 文件');
              return;
            }
            props.mutateWithResult(
              () => api.importXlsx(props.projectId, text(form, 'type'), file),
              (result) => importMessage(result)
            );
          }}>
            <select name="type">
              <option value="requirements">需求</option>
              <option value="test-cases">用例</option>
              <option value="bugs">Bug</option>
              <option value="run-results">执行结果</option>
            </select>
            <Input name="file" type="file" accept=".xlsx" />
            <Button variant="primary"><Upload size={15} /> 上传 Excel</Button>
          </form>
        </article>
        <UserAdmin currentUser={props.currentUser} users={props.users} mutate={props.mutate} />
        <DictionaryEditor dictionaries={props.dictionaries} projectId={props.projectId} mutate={props.mutate} />
      </div>
    </Section>
  );
}

function UserAdmin(props: {
  currentUser: UserProfile;
  users: UserProfile[];
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const canManage = props.currentUser.role === 'admin';
  return (
    <article className="item-card span-two">
      <strong>账号权限</strong>
      {!canManage && <p>当前账号可查看用户列表，只有管理员可以调整系统角色和账号状态。</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>邮箱</th>
              <th>系统角色</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {props.users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>
                  {canManage ? (
                    <select
                      aria-label={`${user.username} 系统角色`}
                      defaultValue={user.role}
                      onChange={(event) => props.mutate(() => api.updateUser(user.id, { role: event.target.value as never }), '用户角色已更新')}
                    >
                      {systemRoles.map((role) => <option key={role} value={role}>{labelOf(role)}</option>)}
                    </select>
                  ) : (
                    labelOf(user.role)
                  )}
                </td>
                <td>
                  {canManage ? (
                    <select
                      aria-label={`${user.username} 账号状态`}
                      defaultValue={user.status}
                      onChange={(event) => props.mutate(() => api.updateUser(user.id, { status: event.target.value as never }), '账号状态已更新')}
                    >
                      {userStatuses.map((status) => <option key={status} value={status}>{userStatusLabel(status)}</option>)}
                    </select>
                  ) : (
                    userStatusLabel(user.status)
                  )}
                </td>
                <td>{user.role === 'admin' ? '管理员' : '可维护'}</td>
              </tr>
            ))}
            {props.users.length === 0 && (
              <tr>
                <td colSpan={5}>暂无用户</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function DictionaryEditor(props: {
  dictionaries: Dictionary[];
  projectId: string;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [type, setType] = useState('priority');
  const dictionary = props.dictionaries.find((item) => item.type === type);
  return (
    <article className="item-card span-two">
      <strong>字典配置</strong>
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const values = parseDictionaryValues(text(form, 'values'));
        props.mutate(() => api.upsertDictionary({ type, projectId: props.projectId, values }), '字典已保存');
      }}>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="requirementStatus">需求状态</option>
          <option value="testRunStatus">执行状态</option>
          <option value="bugStatus">Bug 状态</option>
          <option value="priority">优先级</option>
          <option value="severity">严重级别</option>
        </select>
        <Textarea key={dictionary?.id || type} name="values" aria-label="字典值" defaultValue={formatDictionaryValues(dictionary?.values || [])} />
        <Button variant="primary" className="fit"><Save size={15} /> 保存字典</Button>
      </form>
    </article>
  );
}

function CardHeader(props: { title: string; meta?: Array<string | undefined>; badge?: string }) {
  const meta = (props.meta || []).filter(Boolean);
  return (
    <UiCardHeader className="card-head">
      <div>
        <strong>{props.title}</strong>
        {meta.length > 0 && <span>{meta.join(' · ')}</span>}
      </div>
      {props.badge && <Badge className={`status-badge ${badgeTone(props.badge)}`}>{props.badge}</Badge>}
    </UiCardHeader>
  );
}

function RecentWork(props: { data: WorkspaceData }) {
  return (
    <section className="panel wide">
      <h2>最近工作</h2>
      <Table
        headers={['类型', '标题', '状态']}
        rows={[
          ...props.data.requirements.slice(0, 5).map((item) => ['需求', item.title, labelOf(item.status)]),
          ...props.data.bugs.slice(0, 5).map((item) => ['Bug', item.title, labelOf(item.status)])
        ]}
      />
    </section>
  );
}

function RiskBoard(props: { report: ReportSummary | null }) {
  const report = props.report;
  if (!report) return <EmptyState text="暂无风险数据" />;
  const items = [
    report.execution.failed > 0 ? `存在 ${report.execution.failed} 条失败执行项` : '暂无失败执行项',
    report.execution.blocked > 0 ? `存在 ${report.execution.blocked} 条阻塞执行项` : '暂无阻塞执行项',
    report.bugs.active > 0 ? `还有 ${report.bugs.active} 个活跃 Bug` : '暂无活跃 Bug',
    report.requirements.blocked > 0 ? `有 ${report.requirements.blocked} 个阻塞需求` : '暂无阻塞需求'
  ];
  return <div className="risk-list">{items.map((item) => <span key={item}>{item}</span>)}</div>;
}

function Section(props: { title: string; icon: typeof FolderKanban; children: React.ReactNode }) {
  return (
    <Card className="panel">
      <UiCardHeader className="section-head">
        <props.icon size={22} />
        <CardTitle>{props.title}</CardTitle>
      </UiCardHeader>
      <CardContent className="section-content">{props.children}</CardContent>
    </Card>
  );
}

function Toolbar(props: { children: React.ReactNode }) {
  return <div className="toolbar">{props.children}</div>;
}

function SearchBox(props: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} />
    </label>
  );
}

function Select<T extends readonly string[]>(props: {
  name?: string;
  register?: UseFormRegister<StringFormValues>;
  values: T;
  defaultValue?: T[number] | string;
  value?: string;
  onChange?: (value: string) => void;
  emptyLabel?: string;
}) {
  const registered = props.name && props.register ? props.register(props.name) : undefined;
  return (
    <select
      {...(registered || {})}
      name={props.name}
      defaultValue={props.value === undefined ? props.defaultValue : undefined}
      value={props.value}
      onChange={(event) => {
        registered?.onChange?.(event);
        props.onChange?.(event.target.value);
      }}
    >
      {props.emptyLabel && <option value="">{props.emptyLabel}</option>}
      {props.values.map((value) => <option key={value} value={value}>{labelOf(value)}</option>)}
    </select>
  );
}

function Table(props: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{props.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr><td colSpan={props.headers.length}>暂无数据</td></tr>
          ) : (
            props.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)
          )}
        </tbody>
      </table>
    </div>
  );
}

function Metric(props: { label: string; value: string | number; detail: string }) {
  return (
    <Card className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </Card>
  );
}

function pageInfo(tab: Tab) {
  const descriptions: Record<Tab, { title: string; description: (project: string) => string }> = {
    overview: { title: 'Dashboard', description: (project) => `查看「${project}」的质量指标、近期工作和风险信号。` },
    projects: { title: 'Projects', description: () => '维护项目档案、成员和基础信息。' },
    iterations: { title: 'Iterations', description: (project) => `管理「${project}」的迭代周期、目标和状态。` },
    requirements: { title: 'Requirements', description: (project) => `沉淀「${project}」的需求条目、负责人和日报同步。` },
    cases: { title: 'Test Repository', description: (project) => `管理「${project}」的测试用例、优先级和执行前置条件。` },
    plans: { title: 'Test Execution', description: (project) => `组织「${project}」的测试轮次、用例范围和执行结果。` },
    bugs: { title: 'Bug Tracking Center', description: (project) => `筛选、指派和追踪「${project}」中的缺陷。` },
    reports: { title: 'Reports', description: (project) => `导出「${project}」的需求、用例、Bug 和质量统计。` },
    settings: { title: 'Settings', description: (project) => `配置「${project}」的数据字典、Excel 模板和账号权限。` }
  };
  return descriptions[tab];
}

function filterWorkspaceData(data: WorkspaceData, keyword: string): WorkspaceData {
  const normalized = keyword.trim();
  if (!normalized) return data;
  return {
    ...data,
    iterations: data.iterations.filter((item) => matchKeyword([item.name, item.goal || '', item.status], normalized)),
    requirements: data.requirements.filter((item) =>
      matchKeyword([item.title, item.description || '', item.priority, item.status, item.larkWebhook || ''], normalized)
    ),
    cases: data.cases.filter((item) =>
      matchKeyword([item.title, item.preconditions || '', item.expectedResult || '', item.priority, item.status], normalized)
    ),
    plans: data.plans.filter((item) => matchKeyword([item.name, item.round, item.status], normalized)),
    bugs: data.bugs.filter((item) =>
      matchKeyword([item.title, item.actualResult || '', item.expectedResult || '', item.reproduceSteps || '', item.priority, item.severity, item.status], normalized)
    )
  };
}

function badgeTone(label: string) {
  if (/(失败|阻塞|重新|废弃|禁用|P0|S0|新建)/.test(label)) return 'tone-danger';
  if (/(处理中|测试中|进行中|未测|P1|S1|规划)/.test(label)) return 'tone-info';
  if (/(通过|完成|解决|验证|关闭|启用|待测试)/.test(label)) return 'tone-success';
  return 'tone-neutral';
}

function DangerButton(props: { onClick: () => void }) {
  return (
    <button type="button" className="danger" onClick={props.onClick}>
      <Trash2 size={15} /> 删除
    </button>
  );
}

function EmptyState(props: { text: string }) {
  return <Card className="empty">{props.text}</Card>;
}

function ExportLink(props: { projectId: string; type: string; label: string }) {
  return (
    <a className="link-button" href={downloadUrl(`/import-export/export?type=${props.type}&projectId=${props.projectId}`)}>
      <Download size={15} /> {props.label}
    </a>
  );
}

function TemplateLink(props: { type: string; label: string }) {
  return (
    <a className="link-button" href={downloadUrl(`/import-export/template?type=${props.type}`)}>
      <Download size={15} /> {props.label}
    </a>
  );
}

function text(form: FormData, key: string) {
  return String(form.get(key) || '').trim();
}

function formDataFromValues(values: StringFormValues) {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.set(key, value ?? ''));
  return form;
}

function matchKeyword(values: string[], ...keywords: Array<string | undefined>) {
  const normalized = keywords.map((item) => item?.trim().toLowerCase()).filter(Boolean) as string[];
  if (normalized.length === 0) return true;
  const haystack = values.join(' ').toLowerCase();
  return normalized.every((keyword) => haystack.includes(keyword));
}

function dateInput(value?: string) {
  return value ? value.slice(0, 10) : '';
}

function dateRange(startDate?: string, endDate?: string) {
  const start = dateInput(startDate);
  const end = dateInput(endDate);
  if (start && end) return `${start} 至 ${end}`;
  if (start) return `${start} 开始`;
  if (end) return `${end} 结束`;
  return '未设置起止时间';
}

function iterationName(iterations: Iteration[], id: string) {
  return iterations.find((item) => item.id === id)?.name || '未知迭代';
}

function requirementTitle(requirements: Requirement[], id: string) {
  return requirements.find((item) => item.id === id)?.title || '未知需求';
}

function userName(users: UserProfile[], id: string) {
  return users.find((item) => item.id === id)?.username || '未知用户';
}

function userStatusLabel(status?: string) {
  if (status === 'active') return '启用';
  if (status === 'disabled') return '已禁用';
  return labelOf(status);
}

function requirementPayload(form: FormData, projectId: string): Partial<Requirement> {
  return {
    projectId,
    iterationId: text(form, 'iterationId') || undefined,
    ownerId: text(form, 'ownerId') || undefined,
    title: text(form, 'title'),
    description: text(form, 'description'),
    priority: text(form, 'priority') as never,
    status: text(form, 'status') as never,
    larkWebhook: text(form, 'larkWebhook')
  };
}

function testCasePayload(form: FormData, projectId: string): Partial<TestCase> {
  return {
    projectId,
    requirementId: text(form, 'requirementId') || undefined,
    title: text(form, 'title'),
    preconditions: text(form, 'preconditions'),
    steps: [{ action: text(form, 'step'), expected: text(form, 'expected') }],
    expectedResult: text(form, 'expectedResult'),
    priority: text(form, 'priority') as never,
    status: text(form, 'status') as never
  };
}

function bugPayload(form: FormData, projectId: string): Partial<Bug> {
  return {
    projectId,
    requirementId: text(form, 'requirementId') || undefined,
    testCaseId: text(form, 'testCaseId') || undefined,
    testPlanId: text(form, 'testPlanId') || undefined,
    assigneeId: text(form, 'assigneeId') || undefined,
    title: text(form, 'title'),
    reproduceSteps: text(form, 'reproduceSteps'),
    actualResult: text(form, 'actualResult'),
    expectedResult: text(form, 'expectedResult'),
    severity: text(form, 'severity') as never,
    priority: text(form, 'priority') as never,
    status: text(form, 'status') as never
  };
}

function executionProgress(items: TestRunItem[]) {
  const total = items.length;
  const done = items.filter((item) => item.status !== 'untested').length;
  const passed = items.filter((item) => item.status === 'passed').length;
  return `${done}/${total} 已测 · ${passed} 通过`;
}

function importMessage(result: ImportResult) {
  if (result.errors.length === 0) return `Excel 导入完成：成功 ${result.imported} 行`;
  const details = result.errors.slice(0, 3).map((error) => `第 ${error.row} 行 ${error.message}`).join('；');
  return `Excel 导入完成：成功 ${result.imported} 行，失败 ${result.errors.length} 行。${details}`;
}

function rate(done: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((done / total) * 100)}%`;
}

function formatDictionaryValues(values: DictionaryValue[]) {
  return values.map((item) => `${item.key},${item.label},${item.color || ''},${item.sort},${item.enabled}`).join('\n');
}

function parseDictionaryValues(input: string): DictionaryValue[] {
  return input
    .split('\n')
    .map((line, index) => {
      const [key, label, color, sort, enabled] = line.split(',').map((item) => item.trim());
      return {
        key,
        label,
        color,
        sort: Number(sort || index * 10),
        enabled: enabled !== 'false'
      };
    })
    .filter((item) => item.key && item.label);
}
