import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Activity,
  BarChart3,
  Bell,
  Bug as BugIcon,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  FileText,
  Flag,
  FolderKanban,
  HelpCircle,
  KeyRound,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { BusinessRoleConfig, Notification, PermissionAction, PermissionModule, Project, ProjectRole, SavedView, SavedViewFilters, UserProfile } from '@buggy/shared-types';
import { api } from './api.js';
import { Button } from './components/ui/button.js';
import { Field, FieldLabel } from './components/ui/form.js';
import { Input } from './components/ui/input.js';
import { Textarea } from './components/ui/textarea.js';
import { emptyData, LOGGED_OUT_KEY } from './app/constants.js';
import type { AuthFormValues, MutationOptions, Tab, TabFilters, WorkspaceData } from './app/types.js';
import { filterWorkspaceData, pageInfo } from './app/workspace-utils.js';
import { labelOf } from './labels.js';
import { DataTable, Drawer, NavButton, StatusBadge } from './components/workspace/common.js';
import { DictionaryProvider } from './components/workspace/dictionary.js';
import { HelpCenter } from './components/workspace/help.js';
import { QualityCommandCenter, QualityWorkflowNavigator, TraceabilityMatrix } from './components/workspace/overview.js';
import { BugSection, CaseSection, IterationSection, PlanSection, ProjectSection, RequirementSection, SettingsSection, UserManagementSection } from './components/workspace/sections.js';
import { ReportSection } from './components/workspace/reports.js';

const LAST_PROJECT_KEY = 'buggy_last_project_id';
const RECENT_PROJECTS_KEY = 'buggy_recent_project_ids';
const SAVED_VIEW_TABS: Tab[] = ['requirements', 'cases', 'plans', 'bugs'];
const TAB_ROUTE_SEGMENTS: Record<Tab, string> = {
  overview: 'overview',
  projects: 'projects',
  iterations: 'iterations',
  requirements: 'requirements',
  cases: 'cases',
  plans: 'plans',
  bugs: 'bugs',
  reports: 'reports',
  users: 'users',
  settings: 'settings'
};
const ROUTE_TABS = Object.fromEntries(Object.entries(TAB_ROUTE_SEGMENTS).map(([tabKey, segment]) => [segment, tabKey])) as Record<string, Tab>;
type WorkspaceLoadIssue = { key: keyof WorkspaceData; label: string; message: string };
type WorkspaceRole = UserProfile['role'] | ProjectRole;
type TabRouteOptions = { replace?: boolean; preserveSearch?: boolean; scroll?: boolean; viewKey?: string | null };
type ChangePasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const userRef = useRef<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const authForm = useForm<AuthFormValues>({
    defaultValues: { username: '', email: '', password: '' }
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [tab, setTab] = useState<Tab>(() => tabFromLocation(window.location));
  const [globalKeyword, setGlobalKeyword] = useState('');
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [workspaceIssues, setWorkspaceIssues] = useState<WorkspaceLoadIssue[]>([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [savedViewOpen, setSavedViewOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const passwordForm = useForm<ChangePasswordFormValues>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
  });
  const [appliedUrlViewKey, setAppliedUrlViewKey] = useState('');
  const [appliedDefaultViewKeys, setAppliedDefaultViewKeys] = useState<string[]>([]);
  const [tabFilters, setTabFilters] = useState<TabFilters>({});
  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId),
    [currentProjectId, projects]
  );
  const deferredGlobalKeyword = useDeferredValue(globalKeyword);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const loadProjects = useCallback(async (actor?: UserProfile | null) => {
    const rows = await api.projects();
    const nextProjectId = await chooseDefaultProject(rows, actor || userRef.current || undefined);
    setProjects(rows);
    setCurrentProjectId(nextProjectId);
    if (nextProjectId) localStorage.setItem(LAST_PROJECT_KEY, nextProjectId);
  }, []);

  const loadUsers = useCallback(async () => {
    const rows = await api.users();
    setData((current) => ({ ...current, users: rows }));
  }, []);

  const loadWorkspace = useCallback(async (projectId = currentProjectId) => {
    if (!projectId) {
      setData((current) => ({ ...emptyData, users: current.users }));
      setWorkspaceIssues([]);
      return;
    }
    setBusy(true);
    const tasks = [
      { key: 'iterations', label: '迭代', load: () => api.iterations(projectId) },
      { key: 'requirements', label: '需求', load: () => api.requirements(projectId) },
      { key: 'cases', label: '用例', load: () => api.testCases(projectId) },
      { key: 'plans', label: '测试执行', load: () => api.testPlans(projectId) },
      { key: 'bugs', label: '缺陷', load: () => api.bugs(projectId) },
      { key: 'acceptanceScopes', label: '验收范围', load: () => api.acceptanceScopes(projectId) },
      { key: 'report', label: '质量报表', load: () => api.reportSummary({ projectId }) },
      { key: 'dictionaries', label: '数据字典', load: () => api.dictionaries(projectId) },
      { key: 'activities', label: '项目动态', load: () => api.activities(projectId) },
      { key: 'notifications', label: '通知', load: () => api.notifications(projectId) },
      { key: 'savedViews', label: '常用筛选', load: () => api.savedViews(projectId) }
    ] satisfies Array<{ key: keyof WorkspaceData; label: string; load: () => Promise<WorkspaceData[keyof WorkspaceData]> }>;
    const results = await Promise.allSettled(tasks.map((task) => task.load()));
    const nextData = { ...emptyData } as WorkspaceData;
    const issues: WorkspaceLoadIssue[] = [];
    results.forEach((result, index) => {
      const task = tasks[index];
      if (result.status === 'fulfilled') {
        nextData[task.key] = result.value as never;
        return;
      }
      issues.push({ key: task.key, label: task.label, message: readableWorkspaceError(result.reason) });
    });
    setData((current) => ({ ...nextData, users: current.users }));
    setWorkspaceIssues(issues);
    setBusy(false);
  }, [currentProjectId]);

  const runMutation = useCallback(async <T,>(
    action: () => Promise<T>,
    onSuccess: (result: T) => string | Promise<string>,
    options?: MutationOptions
  ) => {
    setBusy(true);
    try {
      const result = await action();
      if (options?.reloadProjects) await loadProjects();
      if (options?.reloadUsers) await loadUsers();
      await loadWorkspace();
      setNotice(await onSuccess(result));
    } catch (error) {
      setNotice(readableWorkspaceError(error));
    } finally {
      setBusy(false);
    }
  }, [loadProjects, loadUsers, loadWorkspace]);

  const mutate = useCallback(async (action: () => Promise<unknown>, message: string, options?: MutationOptions) => {
    await runMutation(action, () => message, options);
  }, [runMutation]);

  const mutateWithResult = useCallback(async <T,>(action: () => Promise<T>, resolveMessage: (result: T) => string, options?: MutationOptions) => {
    await runMutation(action, resolveMessage, options);
  }, [runMutation]);

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
      await Promise.all([loadProjects(profile), loadUsers()]);
    } catch (error) {
      setNotice(readableWorkspaceError(error));
    } finally {
      setBusy(false);
    }
  }, [authMode, loadProjects, loadUsers]);

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

  const submitPasswordChange = useCallback(async (values: ChangePasswordFormValues) => {
    const currentPassword = values.currentPassword;
    const newPassword = values.newPassword;
    const confirmPassword = values.confirmPassword;
    if (newPassword.length < 6) {
      setNotice('新密码至少需要 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice('两次输入的新密码不一致');
      return;
    }

    setBusy(true);
    try {
      const profile = await api.changePassword({ currentPassword, newPassword });
      setUser(profile);
      passwordForm.reset();
      setPasswordOpen(false);
      setNotice('密码已修改');
    } catch (error) {
      setNotice(readableWorkspaceError(error));
    } finally {
      setBusy(false);
    }
  }, [passwordForm]);

  const selectProject = useCallback((projectId: string) => {
    setCurrentProjectId(projectId);
    if (projectId) localStorage.setItem(LAST_PROJECT_KEY, projectId);
  }, []);

  const navigateToTab = useCallback((nextTab: Tab, options?: TabRouteOptions) => {
    setTab(nextTab);
    updateBrowserTabRoute(nextTab, options);
    if (options?.scroll !== false) window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }, []);

  const changeTab = useCallback((nextTab: Tab) => {
    navigateToTab(nextTab);
  }, [navigateToTab]);

  useEffect(() => {
    if (!isKnownTabRoute(window.location)) updateBrowserTabRoute(tabFromLocation(window.location), { replace: true, preserveSearch: true, scroll: false });
    const handlePopState = () => {
      setTab(tabFromLocation(window.location));
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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
        if (profile) await Promise.all([loadProjects(profile), loadUsers()]);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [loadProjects, loadUsers]);

  useEffect(() => {
    if (currentProjectId) void loadWorkspace(currentProjectId);
  }, [currentProjectId, loadWorkspace]);

  useEffect(() => {
    const permission = user?.systemPermission || user?.role;
    if (tab === 'users' && permission !== 'admin' && permission !== 'maintainer') navigateToTab('overview', { replace: true });
  }, [navigateToTab, tab, user?.role, user?.systemPermission]);

  useEffect(() => {
    const permission = user?.systemPermission || user?.role;
    if (tab === 'users' && (permission === 'admin' || permission === 'maintainer')) void loadUsers();
  }, [loadUsers, tab, user?.role, user?.systemPermission]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleFiltersChange = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: Tab; filters: SavedViewFilters }>).detail;
      if (!detail?.tab) return;
      setTabFilters((current) => ({ ...current, [detail.tab]: detail.filters || {} }));
    };
    window.addEventListener('buggy:filters-change', handleFiltersChange);
    return () => window.removeEventListener('buggy:filters-change', handleFiltersChange);
  }, []);

  const applySavedView = useCallback((view: SavedView, options?: { updateUrl?: boolean; replace?: boolean }) => {
    const filters = view.filters || {};
    const nextTab = view.tab as Tab;
    if (typeof filters.globalKeyword === 'string') setGlobalKeyword(filters.globalKeyword);
    if (options?.updateUrl) navigateToTab(nextTab, { replace: options.replace, viewKey: view.id, scroll: false });
    else setTab(nextTab);
    setTabFilters((current) => ({ ...current, [nextTab]: filters }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('buggy:apply-view', { detail: { tab: view.tab, filters } }));
    }, 0);
  }, [navigateToTab]);

  useEffect(() => {
    const viewKey = new URL(window.location.href).searchParams.get('view');
    if (!viewKey || !currentProject || data.savedViews.length === 0 || appliedUrlViewKey === viewKey) return;
    const view = data.savedViews.find((item) => item.id === viewKey || item.name === viewKey);
    if (!view) return;
    if (!isSavedViewSupported(view.tab as Tab)) return;
    setAppliedUrlViewKey(viewKey);
    applySavedView(view, { updateUrl: true, replace: true });
  }, [appliedUrlViewKey, applySavedView, currentProject, data.savedViews]);

  useEffect(() => {
    const hasUrlView = Boolean(new URL(window.location.href).searchParams.get('view'));
    if (hasUrlView || !isSavedViewSupported(tab) || !currentProject || data.savedViews.length === 0) return;
    const view = data.savedViews.find((item) => item.tab === tab && item.isDefault);
    if (!view) return;
    const key = `${currentProject.id}:${view.id}`;
    if (appliedDefaultViewKeys.includes(key)) return;
    setAppliedDefaultViewKeys((current) => [...current, key]);
    applySavedView(view);
  }, [appliedDefaultViewKeys, applySavedView, currentProject, data.savedViews, tab]);

  const visibleData = useMemo(() => filterWorkspaceData(data, deferredGlobalKeyword), [data, deferredGlobalKeyword]);
  const page = pageInfo(tab);
  const systemPermission = user?.systemPermission || user?.role;
  const currentMember = currentProject?.members.find((member) => member.userId === user?.id);
  const isCurrentProjectOwner = Boolean(currentProject && user && currentProject.ownerId === user.id);
  const projectRole: ProjectRole | undefined = isCurrentProjectOwner ? 'owner' : currentMember?.role;
  const workspaceRole: WorkspaceRole = systemPermission === 'admin' || systemPermission === 'maintainer'
    ? systemPermission
    : projectRole || user?.role || 'viewer';
  const canUseUserAdmin = systemPermission === 'admin' || systemPermission === 'maintainer';
  const projectPermission = isCurrentProjectOwner
    ? 'manage'
    : currentMember?.projectPermission || (projectRole === 'owner' ? 'manage' : projectRole === 'tester' || projectRole === 'developer' ? 'maintain' : 'normal');
  const businessRoleKey = isCurrentProjectOwner
    ? 'manager'
    : currentMember?.businessRoleKey || (projectRole === 'owner' ? 'manager' : projectRole || 'viewer');
  const businessRole = currentProject?.businessRoles?.find((role) => role.key === businessRoleKey);
  const canManageProject = systemPermission === 'admin' || projectPermission === 'manage' || currentProject?.ownerId === user?.id;
  const canUseModuleAction = (module: PermissionModule, action: PermissionAction) =>
    canManageProject ||
    (projectPermission === 'maintain' && action !== 'delete' && action !== 'signoff') ||
    hasBusinessPermission(businessRole, module, action);
  const canWriteProject = canManageProject || projectPermission === 'maintain' || hasBusinessPermission(businessRole, 'requirements', 'edit');
  const canExecute = canUseModuleAction('plans', 'execute');
  const canCreateBug = canUseModuleAction('bugs', 'create');
  const canEditBug = canUseModuleAction('bugs', 'edit');
  const canDeleteBug = canUseModuleAction('bugs', 'delete');
  const unreadCount = data.notifications.filter((item) => item.status === 'unread').length;
  const openEntity = useCallback((entityType: string, entityId?: string) => {
    const nextTab = tabOfEntity(entityType);
    if (nextTab) changeTab(nextTab);
    if (!entityId) return;
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('buggy:open-entity', { detail: { entityType, entityId } }));
    }, 80);
  }, [changeTab]);

  if (loading) return <div className="boot">正在启动 Buggy...</div>;

  if (!user) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">Buggy</p>
            <h1>测试管理平台</h1>
            <p className="muted">项目、迭代、需求、用例、执行、缺陷与验收交付闭环。</p>
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
            <span>质量管理系统</span>
          </div>
        </div>
        <nav>
          <NavButton tab="overview" current={tab} icon={BarChart3} index={1} label="工作台" onClick={changeTab} />
          <NavButton tab="projects" current={tab} icon={FolderKanban} index={2} label="项目" onClick={changeTab} />
          <NavButton tab="iterations" current={tab} icon={CalendarRange} index={3} label="迭代" onClick={changeTab} />
          <NavButton tab="requirements" current={tab} icon={Flag} index={4} label="需求" onClick={changeTab} />
          <NavButton tab="cases" current={tab} icon={ClipboardCheck} index={5} label="用例库" onClick={changeTab} />
          <NavButton tab="plans" current={tab} icon={Activity} index={6} label="测试执行" onClick={changeTab} />
          <NavButton tab="bugs" current={tab} icon={BugIcon} index={7} label="缺陷" onClick={changeTab} />
          <NavButton tab="reports" current={tab} icon={FileText} index={8} label="报表" onClick={changeTab} />
          {canUseUserAdmin && <NavButton tab="users" current={tab} icon={Users} index={9} label="用户管理" onClick={changeTab} />}
          <NavButton tab="settings" current={tab} icon={Settings} index={canUseUserAdmin ? 10 : 9} label="配置" onClick={changeTab} />
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="ghost" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={16} /> 帮助中心
          </button>
          <button type="button" className="ghost" onClick={logout}>
            <LogOut size={16} /> 退出
          </button>
        </div>
      </aside>

      <DictionaryProvider dictionaries={data.dictionaries}>
      <section className="workspace">
        <header className="topbar">
          <label className="global-search" aria-label="全局搜索">
            <Search size={20} />
            <input
              value={globalKeyword}
              onChange={(event) => setGlobalKeyword(event.target.value)}
              placeholder="全局搜索需求、用例、缺陷、项目..."
            />
          </label>
          <div className="top-actions">
            <ProjectSwitcher projects={projects} currentProjectId={currentProjectId} currentUser={user} onSelect={selectProject} />
            <button className="refresh-button" title="刷新当前数据" onClick={() => tab === 'users' ? loadUsers() : loadWorkspace()} disabled={busy || (!currentProjectId && tab !== 'users')}>
              <RefreshCw size={17} />
              <span>{busy ? '同步中' : '刷新'}</span>
            </button>
            <span className={busy ? 'sync-status is-busy' : 'sync-status'}>
              <Clock3 size={15} /> {busy ? '正在更新数据' : '数据已就绪'}
            </span>
            <button
              type="button"
              className={unreadCount ? 'notification-chip has-unread' : 'notification-chip'}
              title={unreadCount ? `有 ${unreadCount} 条未读通知` : '暂无未读通知'}
              onClick={() => setNotificationOpen(true)}
            >
              <Bell size={15} /> {unreadCount || '通知'}
            </button>
            <button
              type="button"
              className="account-action"
              title="修改密码"
              onClick={() => setPasswordOpen(true)}
            >
              <KeyRound size={15} />
              <span>修改密码</span>
            </button>
            <span className="user-pill">{user.username} · {labelOf(workspaceRole)}</span>
          </div>
        </header>

        <section className="page-title">
          <div>
            <p className="eyebrow">{currentProject?.code || 'Buggy'}</p>
            <h1>{page.title}</h1>
            <p>{page.description(currentProject?.name || '当前项目')}</p>
          </div>
          {currentProject && isSavedViewSupported(tab) && (
            <div className="saved-view-tools">
              <select
                aria-label="常用筛选"
                value=""
                onChange={(event) => {
                  const view = data.savedViews.find((item) => item.id === event.target.value);
                  if (view) applySavedView(view, { updateUrl: true });
                }}
              >
                <option value="">常用筛选</option>
                {data.savedViews.filter((item) => item.tab === tab).map((view) => <option key={view.id} value={view.id}>{view.isDefault ? '默认 · ' : ''}{view.name}{view.visibility === 'project' ? ' · 团队' : ' · 我的'}</option>)}
              </select>
              <Button type="button" onClick={() => setSavedViewOpen(true)}>
                管理常用筛选
              </Button>
            </div>
          )}
        </section>

        <section className={tab === 'overview' ? 'workspace-context' : 'workspace-context compact-context'} aria-label="当前工作区">
          <div className="context-primary">
            <span>当前项目</span>
            <strong>{currentProject?.name || '尚未选择项目'}</strong>
            <small>{currentProject?.code || '在项目页选择或新建项目'}</small>
          </div>
          <div>
            <span>项目成员</span>
            <strong>{currentProject?.members.length || '-'}</strong>
            <small>{currentProject?.members.find((member) => member.role === 'owner')?.username || '暂无负责人'}</small>
          </div>
          <div>
            <span>质量资产</span>
            <strong>{data.requirements.length + data.cases.length + data.bugs.length}</strong>
            <small>需求 / 用例 / 缺陷</small>
          </div>
          <div>
            <span>执行通过率</span>
            <strong>{data.report?.execution.passRate || 0}%</strong>
            <small>{data.report ? `${data.report.execution.passed}/${data.report.execution.total}` : '暂无执行数据'}</small>
          </div>
        </section>

        {workspaceIssues.length > 0 && (
          <section className="workspace-alert" aria-live="polite">
            <ShieldCheck size={17} />
            <div>
              <strong>部分数据暂未同步</strong>
              <span>{workspaceIssues.map((issue) => `${issue.label}：${issue.message}`).join('；')}。其他模块已正常显示。</span>
            </div>
          </section>
        )}

        {globalKeyword && (
          <section className="active-filter-bar" aria-label="当前全局筛选">
            <span>全局条件</span>
            <strong>{globalKeyword}</strong>
            <button type="button" onClick={() => setGlobalKeyword('')}>清除</button>
          </section>
        )}

        {notice && <div className={isBlockingNotice(notice) ? 'notice notice-warning' : 'notice'}>{notice}</div>}

        {tab === 'users' ? (
          <UserManagementSection currentUser={user} users={data.users} onRefresh={loadUsers} onNotice={setNotice} />
        ) : !currentProject && tab !== 'projects' ? (
          <ProjectSection
            user={user}
            projects={projects}
            searchKeyword={globalKeyword}
            currentProjectId={currentProjectId}
            users={data.users}
            onSelect={selectProject}
            onNotice={setNotice}
            mutate={mutate}
          />
        ) : (
          <>
            {tab === 'overview' && currentProject && (
              <section className="grid role-dashboard-grid">
                <QualityCommandCenter data={data} user={user} role={workspaceRole} onJump={changeTab} onOpenEntity={openEntity} />
                <QualityWorkflowNavigator data={data} onJump={changeTab} />
                <TraceabilityMatrix data={data} />
                <section className="panel wide compact-activity-panel">
                  <h2>项目动态</h2>
                  <div className="timeline-list compact-timeline">
                    {data.activities.length === 0 ? <span className="muted">暂无动态</span> : data.activities.slice(0, 8).map((item) => (
                      <article key={item.id}>
                        <strong>{item.title}</strong>
                        <span>{item.actorName || '系统'} · {new Date(item.createdAt).toLocaleString('zh-CN')}</span>
                        {item.detail && <p>{item.detail}</p>}
                      </article>
                    ))}
                  </div>
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
                onSelect={selectProject}
                onNotice={setNotice}
                mutate={mutate}
              />
            )}
            {tab === 'iterations' && currentProject && (
              <IterationSection
                projectId={currentProject.id}
                rows={visibleData.iterations}
                requirements={data.requirements}
                cases={data.cases}
                plans={data.plans}
                bugs={data.bugs}
                canWrite={canWriteProject}
                canManage={canManageProject}
                mutate={mutate}
              />
            )}
            {tab === 'requirements' && currentProject && (
              <RequirementSection
                projectId={currentProject.id}
                iterations={data.iterations}
                users={data.users}
                rows={visibleData.requirements}
                cases={data.cases}
                bugs={data.bugs}
                canWrite={canWriteProject}
                canManage={canManageProject}
                mutate={mutate}
              />
            )}
            {tab === 'cases' && currentProject && (
              <CaseSection
                projectId={currentProject.id}
                requirements={data.requirements}
                users={data.users}
                plans={data.plans}
                bugs={data.bugs}
                rows={data.cases}
                globalKeyword={deferredGlobalKeyword}
                canWrite={canWriteProject}
                canManage={canManageProject}
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
                users={data.users}
                currentUser={user}
                globalKeyword={deferredGlobalKeyword}
                canWrite={canExecute}
                canManage={canManageProject}
                mutate={mutate}
                onNotice={setNotice}
                onOpenEntity={openEntity}
              />
            )}
            {tab === 'bugs' && currentProject && (
              <BugSection
                projectId={currentProject.id}
                requirements={data.requirements}
                cases={data.cases}
                plans={data.plans}
                users={data.users}
                projectMembers={currentProject.members}
                rows={data.bugs}
                globalKeyword={deferredGlobalKeyword}
                canCreate={canCreateBug}
                canWrite={canEditBug}
                canManage={canDeleteBug}
                mutate={mutate}
                onOpenEntity={openEntity}
              />
            )}
            {tab === 'reports' && currentProject && (
              <ReportSection
                projectId={currentProject.id}
                currentProject={currentProject}
                scopes={visibleData.acceptanceScopes}
                iterations={data.iterations}
                requirements={data.requirements}
                plans={data.plans}
                bugs={data.bugs}
                users={data.users}
                canWrite={canWriteProject}
                canManage={canManageProject}
                mutate={mutate}
                onOpenEntity={openEntity}
              />
            )}
            {tab === 'settings' && currentProject && (
              <SettingsSection
                projectId={currentProject.id}
                currentProject={currentProject}
                currentUser={user}
                canManage={canManageProject}
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
      </DictionaryProvider>
      <HelpCenter
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        user={user}
        role={workspaceRole}
        currentProject={currentProject}
        projectCount={projects.length}
        data={data}
      />
      <NotificationCenter
        open={notificationOpen}
        notifications={data.notifications}
        onClose={() => setNotificationOpen(false)}
        onMarkAllRead={() => mutate(() => api.markAllNotificationsRead(), '通知已全部标记已读')}
        onOpenNotification={(notification) => {
          if (notification.status === 'unread') void mutate(() => api.markNotificationRead(notification.id), '通知已标记已读');
          const nextTab = tabOfNotification(notification);
          if (nextTab) {
            changeTab(nextTab);
            setNotificationOpen(false);
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent('buggy:open-entity', { detail: { entityType: notification.entityType, entityId: notification.entityId } }));
            }, 80);
          }
        }}
      />
      <Drawer title="修改密码" subtitle="验证当前密码后更新登录密码" open={passwordOpen} onClose={() => {
        setPasswordOpen(false);
        passwordForm.reset();
      }}>
        <form className="drawer-form password-form" onSubmit={passwordForm.handleSubmit(submitPasswordChange)}>
          <Field>
            <FieldLabel required>当前密码</FieldLabel>
            <Input type="password" autoComplete="current-password" {...passwordForm.register('currentPassword')} required />
          </Field>
          <Field>
            <FieldLabel required>新密码</FieldLabel>
            <Input type="password" minLength={6} autoComplete="new-password" {...passwordForm.register('newPassword')} required />
          </Field>
          <Field>
            <FieldLabel required>确认新密码</FieldLabel>
            <Input type="password" minLength={6} autoComplete="new-password" {...passwordForm.register('confirmPassword')} required />
          </Field>
          <div className="form-actions">
            <Button type="button" onClick={() => {
              setPasswordOpen(false);
              passwordForm.reset();
            }}>取消</Button>
            <Button type="submit" variant="primary" disabled={busy}>
              <KeyRound size={15} /> 保存新密码
            </Button>
          </div>
        </form>
      </Drawer>
      {currentProject && isSavedViewSupported(tab) && (
        <SavedViewDialog
          open={savedViewOpen}
          tab={tab}
          defaultName={`${page.title}常用筛选`}
          views={data.savedViews.filter((item) => item.tab === tab)}
          filterSummary={describeSavedViewFilters(tabFilters[tab] || {}, globalKeyword)}
          onClose={() => setSavedViewOpen(false)}
          onDelete={(id) => mutate(() => api.deleteSavedView(id), '常用筛选已删除')}
          onSave={(name, options) => mutate(
            () => api.upsertSavedView({
              projectId: currentProject.id,
              tab,
              name,
              filters: { ...(tabFilters[tab] || {}), globalKeyword },
              visibility: options.visibility,
              isDefault: options.isDefault
            }),
            '常用筛选已保存'
          )}
        />
      )}
    </main>
  );
}

function tabFromLocation(location: Location): Tab {
  return routeFromLocation(location).tab;
}

function isKnownTabRoute(location: Location) {
  return routeFromLocation(location).routeIndex >= 0 || location.pathname === '/' || currentRouteBase(location) !== '';
}

function updateBrowserTabRoute(tab: Tab, options?: TabRouteOptions) {
  const url = new URL(window.location.href);
  const base = currentRouteBase(window.location);
  url.pathname = joinRoutePath(base, TAB_ROUTE_SEGMENTS[tab]);
  if (options?.viewKey !== undefined) {
    if (options.viewKey) url.searchParams.set('view', options.viewKey);
    else url.searchParams.delete('view');
  } else if (!options?.preserveSearch) {
    url.searchParams.delete('view');
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) return;
  const method = options?.replace ? 'replaceState' : 'pushState';
  window.history[method]({ tab }, '', nextUrl);
}

function routeFromLocation(location: Location) {
  const segments = location.pathname.split('/').filter(Boolean);
  const routeIndex = segments.findIndex((segment) => Boolean(ROUTE_TABS[segment]));
  return {
    tab: routeIndex >= 0 ? ROUTE_TABS[segments[routeIndex]] : 'overview',
    routeIndex
  };
}

function currentRouteBase(location: Location) {
  const segments = location.pathname.split('/').filter(Boolean);
  const routeIndex = segments.findIndex((segment) => Boolean(ROUTE_TABS[segment]));
  if (routeIndex > 0) return `/${segments.slice(0, routeIndex).join('/')}`;
  if (routeIndex === -1 && segments.length > 0) return `/${segments.join('/')}`;
  return normalizedViteBase();
}

function normalizedViteBase() {
  const base = import.meta.env.BASE_URL.replace(/\/+$/g, '').replace(/^\/+/g, '');
  return base ? `/${base}` : '';
}

function joinRoutePath(base: string, segment: string) {
  const normalizedBase = base.replace(/\/+$/g, '');
  return `${normalizedBase}/${segment}`;
}

async function chooseDefaultProject(rows: Project[], user?: UserProfile) {
  const canAccessAll = (user?.systemPermission || user?.role) === 'admin' || (user?.systemPermission || user?.role) === 'maintainer';
  const accessibleRows = canAccessAll || !user
    ? rows
    : rows.filter((project) => project.ownerId === user.id || project.members.some((member) => member.userId === user.id));
  const candidates = accessibleRows.filter((project) => (project.status || 'active') === 'active' && (project.category || 'standard') === 'standard');
  const scopedRows = candidates.length ? candidates : accessibleRows.filter((project) => (project.status || 'active') === 'active');
  const remembered = localStorage.getItem(LAST_PROJECT_KEY);
  if (remembered && scopedRows.some((item) => item.id === remembered)) return remembered;
  if (scopedRows.length <= 1) return scopedRows[0]?.id || '';
  const scored = await Promise.all(
    scopedRows.map(async (project) => {
      try {
        const report = await api.reportSummary({ projectId: project.id });
        return {
          id: project.id,
          score:
            report.requirements.total +
            report.cases.total +
            report.bugs.total +
            report.execution.total * 2 +
            report.bugs.active * 3
        };
      } catch {
        return { id: project.id, score: 0 };
      }
    })
  );
  return scored.reduce((best, item) => (item.score > best.score ? item : best), scored[0])?.id || scopedRows[0]?.id || '';
}

function ProjectSwitcher(props: { projects: Project[]; currentProjectId: string; currentUser: UserProfile; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const recentIds = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || '[]') as string[];
    } catch {
      return [];
    }
  }, [props.currentProjectId]);
  const current = props.projects.find((project) => project.id === props.currentProjectId);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const canAccessAll = (props.currentUser.systemPermission || props.currentUser.role) === 'admin' || (props.currentUser.systemPermission || props.currentUser.role) === 'maintainer';
    const selectableProjects = props.projects.filter((project) =>
      (project.status || 'active') === 'active' &&
      (canAccessAll || project.ownerId === props.currentUser.id || project.members.some((member) => member.userId === props.currentUser.id))
    );
    const rows = keyword
      ? selectableProjects.filter((project) => `${project.name} ${project.code || ''}`.toLowerCase().includes(keyword))
      : selectableProjects;
    const score = (project: Project) => {
      if ((project.category || 'standard') === 'standard') return recentIds.includes(project.id) ? 0 : 1;
      if (recentIds.includes(project.id)) return 0;
      if (project.members.some((member) => member.userId === props.currentUser.id && (member.projectPermission === 'manage' || member.role === 'owner'))) return 2;
      return 3;
    };
    return [...rows].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name)).slice(0, 12);
  }, [props.projects, props.currentUser, query, recentIds]);
  const pick = (id: string) => {
    const nextRecent = [id, ...recentIds.filter((item) => item !== id)].slice(0, 6);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(nextRecent));
    props.onSelect(id);
    setQuery('');
    setOpen(false);
  };
  return (
    <div className="project-combobox">
      <span>当前项目</span>
      <button type="button" className="project-combobox-trigger" onClick={() => setOpen((value) => !value)}>
        {current?.name || '选择项目'}
      </button>
      {open && (
        <div className="project-combobox-popover">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目名称或代号" autoFocus />
          <div className="project-group-label">最近 / 我负责 / 全部项目</div>
          <div className="project-option-list">
            {filtered.map((project) => (
              <button key={project.id} type="button" className={project.id === props.currentProjectId ? 'active' : ''} onClick={() => pick(project.id)}>
                <strong>{project.name}</strong>
                <small>{project.code || '未设置代号'} · {project.members.find((member) => member.role === 'owner')?.username || '暂无负责人'}</small>
              </button>
            ))}
            {filtered.length === 0 && <span className="muted">没有匹配项目</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function SavedViewDialog(props: {
  open: boolean;
  tab: Tab;
  defaultName: string;
  views: SavedView[];
  filterSummary: Array<{ label: string; value: string }>;
  onClose: () => void;
  onSave: (name: string, options: { visibility: SavedView['visibility']; isDefault: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(props.defaultName);
  const [selectedId, setSelectedId] = useState('');
  const [visibility, setVisibility] = useState<SavedView['visibility']>('private');
  const [isDefault, setIsDefault] = useState(false);
  useEffect(() => {
    if (!props.open) return;
    const selected = props.views.find((view) => view.id === selectedId);
    setName(selected?.name || props.defaultName);
    setVisibility(selected?.visibility || 'private');
    setIsDefault(Boolean(selected?.isDefault));
  }, [props.open, props.defaultName, props.views, selectedId]);
  if (!props.open) return null;
  return (
    <div className="confirm-layer" role="presentation">
      <section className="confirm-dialog saved-view-dialog" role="dialog" aria-modal="true" aria-label="保存常用筛选">
        <h3>保存常用筛选</h3>
        <p>会保存当前模块真实支持的搜索、筛选、排序、页大小和列配置，便于自己复用或团队共享。</p>
        <div className="saved-view-preview" aria-label="当前筛选条件">
          <span>当前条件</span>
          {props.filterSummary.length === 0 ? (
            <strong>未设置筛选条件，将保存默认筛选</strong>
          ) : (
            <div>
              {props.filterSummary.map((item) => <b key={item.label}>{item.label}: {item.value}</b>)}
            </div>
          )}
        </div>
        <label className="dialog-field">
          <span>覆盖已有筛选</span>
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            <option value="">新建常用筛选</option>
            {props.views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
          </select>
        </label>
        <label className="dialog-field">
          <span>筛选名称</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="dialog-field">
          <span>可见范围</span>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value as SavedView['visibility'])}>
            <option value="private">仅自己</option>
            <option value="project">项目共享</option>
          </select>
        </label>
        <label className="check-row compact-check-row">
          <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
          <span>设为当前模块默认筛选</span>
        </label>
        <div className="form-actions">
          <Button type="button" disabled={!selectedId} onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set('view', selectedId);
            void navigator.clipboard?.writeText(url.toString());
          }}>复制筛选链接</Button>
          {selectedId && <Button type="button" variant="destructive" onClick={async () => {
            await props.onDelete(selectedId);
            setSelectedId('');
          }}>删除筛选</Button>}
          <Button type="button" onClick={props.onClose}>取消</Button>
          <Button type="button" variant="primary" disabled={!name.trim()} onClick={async () => {
            await props.onSave(name.trim(), { visibility, isDefault });
            props.onClose();
          }}>保存</Button>
        </div>
      </section>
    </div>
  );
}

function describeSavedViewFilters(filters: SavedViewFilters, globalKeyword: string) {
  const rows: Array<{ label: string; value: string }> = [];
  if (globalKeyword.trim()) rows.push({ label: '全局搜索', value: globalKeyword.trim() });
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === '' || value === false) return;
    if (Array.isArray(value) && value.length === 0) return;
    const label = savedViewFilterLabel(key);
    const text = Array.isArray(value) ? `${value.length} 项` : String(value);
    rows.push({ label, value: text });
  });
  return rows.slice(0, 8);
}

function savedViewFilterLabel(key: string) {
  const labels: Record<string, string> = {
    keyword: '模块搜索',
    status: '状态',
    severity: '严重级别',
    triageStatus: '分诊',
    team: '团队',
    assigneeId: '负责人',
    ownerId: '负责人',
    requirementId: '需求',
    reviewStatus: '评审',
    automationStatus: '自动化',
    moduleFilter: '业务模块',
    suiteFilter: '用例集',
    caseQueue: '队列',
    pageSize: '页大小',
    sortBy: '排序字段',
    sortOrder: '排序方向',
    columns: '列配置'
  };
  return labels[key] || key;
}

function isSavedViewSupported(tab: Tab) {
  return SAVED_VIEW_TABS.includes(tab);
}

function readableWorkspaceError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/Cannot (GET|POST|PATCH|DELETE)/i.test(raw) || /404|Not Found/i.test(raw)) return '对应服务暂不可用，请刷新或联系管理员检查部署版本';
  if (/401|Unauthorized|请先登录/i.test(raw)) return '登录状态已失效，请重新登录';
  if (/Failed to fetch|NetworkError|fetch/i.test(raw)) return '网络连接异常，请检查服务是否可访问';
  return raw || '操作失败，请稍后重试';
}

function isBlockingNotice(message: string) {
  return /暂未同步|不可用|异常|失败|错误|失效/.test(message);
}

function NotificationCenter(props: {
  open: boolean;
  notifications: Notification[];
  onClose: () => void;
  onMarkAllRead: () => Promise<void>;
  onOpenNotification: (notification: Notification) => void;
}) {
  return (
    <Drawer title="通知中心" subtitle="查看待处理消息并跳转到相关模块" open={props.open} onClose={props.onClose} size="wide">
      <div className="notification-center">
        <div className="notification-summary">
          <strong>{props.notifications.filter((item) => item.status === 'unread').length}</strong>
          <span>未读通知</span>
          <Button type="button" onClick={() => props.onMarkAllRead()}>全部已读</Button>
        </div>
        <DataTable
          headers={['状态', '通知', '来源', '时间', '操作']}
          emptyText="暂无通知"
          rows={props.notifications.map((notification) => [
            <StatusBadge value={notification.status === 'unread' ? '未读' : '已读'} />,
            <div className="cell-main"><strong>{notification.title}</strong><span>{notification.body || '系统提醒'}</span></div>,
            notification.entityType || '-',
            new Date(notification.createdAt).toLocaleString('zh-CN'),
            <Button type="button" size="sm" onClick={() => props.onOpenNotification(notification)}>打开</Button>
          ])}
        />
      </div>
    </Drawer>
  );
}

function tabOfNotification(notification: Notification): Tab | undefined {
  return notification.entityType ? tabOfEntity(notification.entityType) : undefined;
}

function tabOfEntity(entityType: string): Tab | undefined {
  if (entityType === 'bug') return 'bugs';
  if (entityType === 'test_case') return 'cases';
  if (entityType === 'test_plan' || entityType === 'run_item') return 'plans';
  if (entityType === 'requirement') return 'requirements';
  if (entityType === 'iteration') return 'iterations';
  if (entityType === 'project') return 'projects';
  if (entityType === 'acceptance_scope') return 'reports';
  return undefined;
}

function hasBusinessPermission(role: BusinessRoleConfig | undefined, module: PermissionModule, action: PermissionAction) {
  return Boolean(role?.permissions?.[module]?.includes(action));
}
