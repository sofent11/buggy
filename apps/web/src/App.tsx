import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Activity,
  BarChart3,
  Bug as BugIcon,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  FileSpreadsheet,
  Flag,
  FolderKanban,
  HelpCircle,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck
} from 'lucide-react';
import type { Project, UserProfile } from '@buggy/shared-types';
import { api } from './api.js';
import { Button } from './components/ui/button.js';
import { Field, FieldLabel } from './components/ui/form.js';
import { Input } from './components/ui/input.js';
import { Textarea } from './components/ui/textarea.js';
import { emptyData, LOGGED_OUT_KEY } from './app/constants.js';
import type { AuthFormValues, Tab, WorkspaceData } from './app/types.js';
import { filterWorkspaceData, pageInfo } from './app/workspace-utils.js';
import { labelOf } from './labels.js';
import { NavButton } from './components/workspace/common.js';
import { PageInsights, RecentWork, RiskBoard } from './components/workspace/overview.js';
import { BugSection, CaseSection, IterationSection, PlanSection, ProjectSection, ReportSection, RequirementSection, SettingsSection } from './components/workspace/sections.js';

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
  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId),
    [currentProjectId, projects]
  );
  const deferredGlobalKeyword = useDeferredValue(globalKeyword);

  const loadProjects = useCallback(async () => {
    const rows = await api.projects();
    setProjects(rows);
    setCurrentProjectId((prev) => (prev && rows.some((item) => item.id === prev) ? prev : rows[0]?.id || ''));
  }, []);

  const loadWorkspace = useCallback(async (projectId = currentProjectId) => {
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
  }, [currentProjectId]);

  const mutate = useCallback(async (action: () => Promise<unknown>, message: string, options?: { reloadProjects?: boolean }) => {
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
  }, [loadProjects, loadWorkspace]);

  const mutateWithResult = useCallback(async <T,>(action: () => Promise<T>, resolveMessage: (result: T) => string, options?: { reloadProjects?: boolean }) => {
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
  }, [loadProjects, loadWorkspace]);

  const submitAuth = useCallback(async (values: AuthFormValues) => {
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
  }, [authMode, loadProjects]);

  const logout = useCallback(async () => {
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
  }, []);

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
  }, [loadProjects]);

  useEffect(() => {
    if (currentProjectId) void loadWorkspace(currentProjectId);
  }, [currentProjectId, loadWorkspace]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
  const visibleData = useMemo(() => filterWorkspaceData(data, deferredGlobalKeyword), [data, deferredGlobalKeyword]);

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
            <label className="project-switcher">
              <span>当前项目</span>
              <select value={currentProjectId} onChange={(event) => setCurrentProjectId(event.target.value)}>
                <option value="">选择项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="refresh-button" title="刷新工作区数据" onClick={() => loadWorkspace()} disabled={busy || !currentProjectId}>
              <RefreshCw size={17} />
              <span>{busy ? '同步中' : '刷新'}</span>
            </button>
            <span className={busy ? 'sync-status is-busy' : 'sync-status'}>
              <Clock3 size={15} /> {busy ? '正在更新数据' : '数据已就绪'}
            </span>
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
        <PageInsights
          tab={tab}
          projectCount={projects.length}
          data={data}
          currentProject={currentProject}
          globalKeyword={globalKeyword}
        />

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
