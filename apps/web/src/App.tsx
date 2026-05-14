import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bug as BugIcon,
  CalendarRange,
  ClipboardCheck,
  FileSpreadsheet,
  Flag,
  FolderKanban,
  LogOut,
  Megaphone,
  Plus,
  Send,
  Settings,
  ShieldCheck
} from 'lucide-react';
import type { Bug, Iteration, Project, ReportSummary, Requirement, TestCase, TestPlan, UserProfile } from '@buggy/shared-types';
import { api, downloadUrl } from './api.js';
import { labelOf } from './labels.js';

type Tab = 'overview' | 'iterations' | 'requirements' | 'cases' | 'plans' | 'bugs' | 'reports' | 'settings';

type WorkspaceData = {
  iterations: Iteration[];
  requirements: Requirement[];
  cases: TestCase[];
  plans: TestPlan[];
  bugs: Bug[];
  report: ReportSummary | null;
};

const emptyData: WorkspaceData = {
  iterations: [],
  requirements: [],
  cases: [],
  plans: [],
  bugs: [],
  report: null
};

export function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authForm, setAuthForm] = useState({ username: 'admin', email: 'admin@example.com', password: '123456' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const currentProject = projects.find((project) => project.id === currentProjectId);

  useEffect(() => {
    api
      .me()
      .then((profile) => {
        setUser(profile);
        if (profile) return loadProjects();
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (currentProjectId) void loadWorkspace(currentProjectId);
  }, [currentProjectId]);

  async function loadProjects() {
    const rows = await api.projects();
    setProjects(rows);
    setCurrentProjectId((prev) => prev || rows[0]?.id || '');
  }

  async function loadWorkspace(projectId = currentProjectId) {
    if (!projectId) return;
    const [iterations, requirements, cases, plans, bugs, report] = await Promise.all([
      api.iterations(projectId),
      api.requirements(projectId),
      api.testCases(projectId),
      api.testPlans(projectId),
      api.bugs(projectId),
      api.report(projectId)
    ]);
    setData({ iterations, requirements, cases, plans, bugs, report });
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    try {
      const profile =
        authMode === 'login'
          ? await api.login({ email: authForm.email, password: authForm.password })
          : await api.register(authForm);
      setUser(profile);
      setNotice(`欢迎，${profile.username}`);
      await loadProjects();
    } catch (error) {
      setNotice((error as Error).message);
    }
  }

  async function quickCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    if (!name) return;
    await api.createProject({
      name,
      code: String(form.get('code') || ''),
      description: String(form.get('description') || '')
    });
    event.currentTarget.reset();
    await loadProjects();
    setNotice('项目已创建');
  }

  async function withRefresh(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      await loadWorkspace();
      setNotice(message);
    } catch (error) {
      setNotice((error as Error).message);
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

  if (loading) return <div className="boot">正在启动 Buggy...</div>;
  if (!user) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">Buggy</p>
            <h1>测试管理平台</h1>
            <p className="muted">项目、迭代、需求、用例、执行、缺陷和报告都在一个工作台里闭环。</p>
          </div>
          <form onSubmit={submitAuth} className="stack">
            <div className="segmented">
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>
                注册
              </button>
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>
                登录
              </button>
            </div>
            {authMode === 'register' && (
              <label>
                用户名
                <input value={authForm.username} onChange={(event) => setAuthForm({ ...authForm, username: event.target.value })} />
              </label>
            )}
            <label>
              邮箱
              <input value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
            </label>
            <label>
              密码
              <input type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
            </label>
            <button className="primary" type="submit">
              <ShieldCheck size={18} /> {authMode === 'register' ? '创建首个账号' : '进入系统'}
            </button>
          </form>
          {notice && <p className="notice">{notice}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <strong>Buggy</strong>
            <span>测试管理平台</span>
          </div>
        </div>
        <nav>
          <NavButton tab="overview" current={tab} icon={BarChart3} label="总览" onClick={setTab} />
          <NavButton tab="iterations" current={tab} icon={CalendarRange} label="迭代" onClick={setTab} />
          <NavButton tab="requirements" current={tab} icon={Flag} label="需求" onClick={setTab} />
          <NavButton tab="cases" current={tab} icon={ClipboardCheck} label="用例" onClick={setTab} />
          <NavButton tab="plans" current={tab} icon={Activity} label="执行" onClick={setTab} />
          <NavButton tab="bugs" current={tab} icon={BugIcon} label="Bug" onClick={setTab} />
          <NavButton tab="reports" current={tab} icon={FileSpreadsheet} label="报告" onClick={setTab} />
          <NavButton tab="settings" current={tab} icon={Settings} label="配置" onClick={setTab} />
        </nav>
        <button
          className="ghost"
          onClick={async () => {
            await api.logout();
            setUser(null);
            setProjects([]);
          }}
        >
          <LogOut size={16} /> 退出
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">当前项目</p>
            <h1>{currentProject?.name || '创建第一个项目'}</h1>
          </div>
          <div className="top-actions">
            <select value={currentProjectId} onChange={(event) => setCurrentProjectId(event.target.value)}>
              <option value="">选择项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <span className="user-pill">{user.username} · {labelOf(user.role)}</span>
          </div>
        </header>

        {notice && <div className="notice">{notice}</div>}

        {!currentProject ? (
          <section className="panel narrow">
            <h2>创建项目</h2>
            <ProjectForm onSubmit={quickCreateProject} />
          </section>
        ) : (
          <>
            {tab === 'overview' && (
              <section className="grid">
                {dashboard.map((item) => (
                  <article key={item.label} className="metric">
                    <item.icon size={22} />
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.detail}</small>
                  </article>
                ))}
                <section className="panel wide">
                  <h2>快速创建</h2>
                  <ProjectForm onSubmit={quickCreateProject} compact />
                </section>
                <RecentWork data={data} />
              </section>
            )}

            {tab === 'iterations' && (
              <IterationSection projectId={currentProjectId} rows={data.iterations} onCreate={(body) => withRefresh(() => api.createIteration(body), '迭代已创建')} />
            )}
            {tab === 'requirements' && (
              <RequirementSection
                projectId={currentProjectId}
                iterations={data.iterations}
                rows={data.requirements}
                onCreate={(body) => withRefresh(() => api.createRequirement(body), '需求已创建')}
                onBind={(id, webhook) => withRefresh(() => api.bindLark(id, webhook), 'Lark webhook 已绑定')}
                onSend={(id) => withRefresh(() => api.sendLark(id), 'Lark 日报已发送')}
              />
            )}
            {tab === 'cases' && (
              <CaseSection
                projectId={currentProjectId}
                requirements={data.requirements}
                rows={data.cases}
                onCreate={(body) => withRefresh(() => api.createTestCase(body), '用例已创建')}
              />
            )}
            {tab === 'plans' && (
              <PlanSection
                projectId={currentProjectId}
                requirements={data.requirements}
                iterations={data.iterations}
                cases={data.cases}
                rows={data.plans}
                onCreate={(body) => withRefresh(() => api.createTestPlan(body), '测试计划已创建')}
                onRun={(planId, runItemId, body) => withRefresh(() => api.updateRunItem(planId, runItemId, body), '执行结果已更新')}
                onBug={(body) => withRefresh(() => api.createBugFromRun(body), 'Bug 已从失败执行项创建')}
              />
            )}
            {tab === 'bugs' && (
              <BugSection
                projectId={currentProjectId}
                rows={data.bugs}
                onCreate={(body) => withRefresh(() => api.createBug(body), 'Bug 已创建')}
              />
            )}
            {tab === 'reports' && <ReportSection projectId={currentProjectId} report={data.report} />}
            {tab === 'settings' && <SettingsSection projectId={currentProjectId} onNotice={setNotice} />}
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

function ProjectForm(props: { onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; compact?: boolean }) {
  return (
    <form className={props.compact ? 'inline-form' : 'stack'} onSubmit={props.onSubmit}>
      <input name="name" placeholder="项目名称" required />
      <input name="code" placeholder="项目代号" />
      <input name="description" placeholder="项目描述" />
      <button className="primary" type="submit">
        <Plus size={16} /> 创建
      </button>
    </form>
  );
}

function IterationSection(props: {
  projectId: string;
  rows: Iteration[];
  onCreate: (body: Partial<Iteration>) => void;
}) {
  return (
    <Section title="迭代管理" icon={CalendarRange}>
      <form className="inline-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        props.onCreate({
          projectId: props.projectId,
          name: String(form.get('name') || ''),
          goal: String(form.get('goal') || ''),
          startDate: String(form.get('startDate') || ''),
          endDate: String(form.get('endDate') || ''),
          status: 'planning'
        });
        event.currentTarget.reset();
      }}>
        <input name="name" placeholder="迭代名称" required />
        <input name="goal" placeholder="迭代目标" />
        <input name="startDate" type="date" />
        <input name="endDate" type="date" />
        <button className="primary"><Plus size={16} /> 新建迭代</button>
      </form>
      <Table headers={['名称', '目标', '周期', '状态']} rows={props.rows.map((row) => [row.name, row.goal || '-', `${date(row.startDate)} 至 ${date(row.endDate)}`, labelOf(row.status)])} />
    </Section>
  );
}

function RequirementSection(props: {
  projectId: string;
  iterations: Iteration[];
  rows: Requirement[];
  onCreate: (body: Partial<Requirement>) => void;
  onBind: (id: string, webhook: string) => void;
  onSend: (id: string) => void;
}) {
  return (
    <Section title="需求管理" icon={Flag}>
      <form className="inline-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        props.onCreate({
          projectId: props.projectId,
          iterationId: String(form.get('iterationId') || '') || undefined,
          title: String(form.get('title') || ''),
          description: String(form.get('description') || ''),
          priority: String(form.get('priority') || 'P2') as never,
          status: 'ready'
        });
        event.currentTarget.reset();
      }}>
        <input name="title" placeholder="需求标题" required />
        <select name="iterationId"><option value="">不绑定迭代</option>{props.iterations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="priority"><option>P0</option><option>P1</option><option>P2</option><option>P3</option></select>
        <input name="description" placeholder="需求描述" />
        <button className="primary"><Plus size={16} /> 新建需求</button>
      </form>
      <div className="cards">
        {props.rows.map((row) => (
          <article className="item-card" key={row.id}>
            <div><strong>{row.title}</strong><span>{labelOf(row.status)} · {row.priority}</span></div>
            <p>{row.description || '暂无描述'}</p>
            <form className="inline-form compact" onSubmit={(event) => {
              event.preventDefault();
              props.onBind(row.id, String(new FormData(event.currentTarget).get('webhook') || ''));
            }}>
              <input name="webhook" defaultValue={row.larkWebhook} placeholder="Lark webhook" />
              <button><Megaphone size={15} /> 绑定</button>
              <button type="button" onClick={() => props.onSend(row.id)}><Send size={15} /> 发送</button>
            </form>
          </article>
        ))}
      </div>
    </Section>
  );
}

function CaseSection(props: {
  projectId: string;
  requirements: Requirement[];
  rows: TestCase[];
  onCreate: (body: Partial<TestCase>) => void;
}) {
  return (
    <Section title="用例库" icon={ClipboardCheck}>
      <form className="inline-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        props.onCreate({
          projectId: props.projectId,
          requirementId: String(form.get('requirementId') || '') || undefined,
          title: String(form.get('title') || ''),
          preconditions: String(form.get('preconditions') || ''),
          steps: [{ action: String(form.get('step') || ''), expected: String(form.get('expected') || '') }],
          expectedResult: String(form.get('expectedResult') || ''),
          priority: String(form.get('priority') || 'P2') as never,
          status: 'ready'
        });
        event.currentTarget.reset();
      }}>
        <input name="title" placeholder="用例标题" required />
        <select name="requirementId"><option value="">不绑定需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        <input name="step" placeholder="测试步骤" />
        <input name="expected" placeholder="步骤预期" />
        <input name="expectedResult" placeholder="最终预期" />
        <select name="priority"><option>P0</option><option>P1</option><option>P2</option><option>P3</option></select>
        <button className="primary"><Plus size={16} /> 新建用例</button>
      </form>
      <Table headers={['标题', '需求', '步骤', '优先级', '状态']} rows={props.rows.map((row) => [row.title, props.requirements.find((item) => item.id === row.requirementId)?.title || '-', row.steps[0]?.action || '-', row.priority, labelOf(row.status)])} />
    </Section>
  );
}

function PlanSection(props: {
  projectId: string;
  iterations: Iteration[];
  requirements: Requirement[];
  cases: TestCase[];
  rows: TestPlan[];
  onCreate: (body: Partial<TestPlan>) => void;
  onRun: (planId: string, runItemId: string, body: { status: string; actualResult?: string }) => void;
  onBug: (body: { testPlanId: string; runItemId: string; title: string; actualResult?: string }) => void;
}) {
  return (
    <Section title="测试执行" icon={Activity}>
      <form className="inline-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        props.onCreate({
          projectId: props.projectId,
          iterationId: String(form.get('iterationId') || '') || undefined,
          requirementId: String(form.get('requirementId') || '') || undefined,
          name: String(form.get('name') || ''),
          round: String(form.get('round') || '第 1 轮'),
          caseIds: props.cases.map((item) => item.id)
        });
        event.currentTarget.reset();
      }}>
        <input name="name" placeholder="计划名称" required />
        <input name="round" placeholder="轮次，如第 1 轮" />
        <select name="iterationId"><option value="">不绑定迭代</option>{props.iterations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="requirementId"><option value="">全部需求</option>{props.requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        <button className="primary"><Plus size={16} /> 新建计划</button>
      </form>
      <div className="cards">
        {props.rows.map((plan) => (
          <article className="item-card" key={plan.id}>
            <div><strong>{plan.name}</strong><span>{plan.round} · {labelOf(plan.status)} · {plan.runItems.length} 条执行项</span></div>
            <div className="run-list">
              {plan.runItems.map((item) => (
                <form className="run-row" key={item.id} onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  props.onRun(plan.id, item.id, { status: String(form.get('status')), actualResult: String(form.get('actualResult') || '') });
                }}>
                  <span>{item.caseTitle}</span>
                  <select name="status" defaultValue={item.status}>
                    <option value="untested">未测</option><option value="passed">通过</option><option value="failed">失败</option><option value="blocked">阻塞</option><option value="skipped">跳过</option>
                  </select>
                  <input name="actualResult" defaultValue={item.actualResult} placeholder="实际结果" />
                  <button>保存</button>
                  <button type="button" onClick={() => props.onBug({ testPlanId: plan.id, runItemId: item.id, title: `${item.caseTitle} 执行失败`, actualResult: item.actualResult })}>
                    <BugIcon size={15} /> 建 Bug
                  </button>
                </form>
              ))}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

function BugSection(props: { projectId: string; rows: Bug[]; onCreate: (body: Partial<Bug>) => void }) {
  return (
    <Section title="Bug 管理" icon={BugIcon}>
      <form className="inline-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        props.onCreate({
          projectId: props.projectId,
          title: String(form.get('title') || ''),
          reproduceSteps: String(form.get('reproduceSteps') || ''),
          actualResult: String(form.get('actualResult') || ''),
          expectedResult: String(form.get('expectedResult') || ''),
          severity: String(form.get('severity') || 'S2') as never,
          priority: String(form.get('priority') || 'P2') as never
        });
        event.currentTarget.reset();
      }}>
        <input name="title" placeholder="Bug 标题" required />
        <input name="reproduceSteps" placeholder="复现步骤" />
        <input name="actualResult" placeholder="实际结果" />
        <input name="expectedResult" placeholder="期望结果" />
        <select name="severity"><option>S0</option><option>S1</option><option>S2</option><option>S3</option></select>
        <select name="priority"><option>P0</option><option>P1</option><option>P2</option><option>P3</option></select>
        <button className="primary"><Plus size={16} /> 新建 Bug</button>
      </form>
      <Table headers={['标题', '严重级别', '优先级', '状态', '实际结果']} rows={props.rows.map((row) => [row.title, row.severity, row.priority, labelOf(row.status), row.actualResult || '-'])} />
    </Section>
  );
}

function ReportSection(props: { projectId: string; report: ReportSummary | null }) {
  const report = props.report;
  return (
    <Section title="统计报告" icon={BarChart3}>
      <div className="report-actions">
        <a className="primary link-button" href={downloadUrl(`/reports/html?projectId=${props.projectId}`)} target="_blank" rel="noreferrer">打开 HTML 报告</a>
        <a className="link-button" href={downloadUrl(`/import-export/export?type=requirements&projectId=${props.projectId}`)}>导出需求 Excel</a>
        <a className="link-button" href={downloadUrl(`/import-export/export?type=test-cases&projectId=${props.projectId}`)}>导出用例 Excel</a>
        <a className="link-button" href={downloadUrl(`/import-export/export?type=bugs&projectId=${props.projectId}`)}>导出 Bug Excel</a>
      </div>
      {report && (
        <Table
          headers={['域', '核心指标', '明细']}
          rows={[
            ['需求', `${report.requirements.total} 个`, `完成 ${report.requirements.done}，测试中 ${report.requirements.testing}，阻塞 ${report.requirements.blocked}`],
            ['执行', `${report.execution.passRate}% 通过率`, `通过 ${report.execution.passed}，失败 ${report.execution.failed}，未测 ${report.execution.untested}`],
            ['Bug', `${report.bugs.active} 个活跃`, `新建 ${report.bugs.open}，处理中 ${report.bugs.inProgress}，已解决 ${report.bugs.resolved}`]
          ]}
        />
      )}
    </Section>
  );
}

function SettingsSection(props: { projectId: string; onNotice: (message: string) => void }) {
  return (
    <Section title="系统配置" icon={Settings}>
      <div className="cards two">
        <article className="item-card">
          <strong>Excel 模板</strong>
          <p>下载模板后可按接口批量导入需求、用例和 Bug。</p>
          <div className="report-actions">
            <a className="link-button" href={downloadUrl('/import-export/template?type=requirements')}>需求模板</a>
            <a className="link-button" href={downloadUrl('/import-export/template?type=test-cases')}>用例模板</a>
            <a className="link-button" href={downloadUrl('/import-export/template?type=bugs')}>Bug 模板</a>
          </div>
        </article>
        <article className="item-card">
          <strong>Excel 导入</strong>
          <p>选择模板填写后的 `.xlsx` 文件，系统会按表头校验并导入。</p>
          <form className="stack" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const file = form.get('file');
            if (!(file instanceof File) || !file.name) {
              props.onNotice('请选择 Excel 文件');
              return;
            }
            try {
              const result = await api.importXlsx(props.projectId, String(form.get('type')), file);
              props.onNotice(`导入 ${result.imported} 条，错误 ${result.errors.length} 条`);
            } catch (error) {
              props.onNotice((error as Error).message);
            }
          }}>
            <select name="type"><option value="requirements">需求</option><option value="test-cases">用例</option><option value="bugs">Bug</option></select>
            <input name="file" type="file" accept=".xlsx" />
            <button className="primary">上传 Excel</button>
          </form>
        </article>
        <article className="item-card">
          <strong>JSON 快速导入</strong>
          <p>保留 JSON rows 入口，方便脚本和接口集成。</p>
          <form className="stack" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              const result = await api.importRows({
                projectId: props.projectId,
                type: String(form.get('type')),
                rows: JSON.parse(String(form.get('rows') || '[]')) as Array<Record<string, unknown>>
              });
              props.onNotice(`导入 ${result.imported} 条，错误 ${result.errors.length} 条`);
            } catch (error) {
              props.onNotice((error as Error).message);
            }
          }}>
            <select name="type"><option value="requirements">需求</option><option value="test-cases">用例</option><option value="bugs">Bug</option></select>
            <textarea name="rows" placeholder='[{"标题":"登录需求","优先级":"P1"}]' />
            <button className="primary">导入</button>
          </form>
        </article>
      </div>
    </Section>
  );
}

function RecentWork(props: { data: WorkspaceData }) {
  return (
    <section className="panel wide">
      <h2>最近工作</h2>
      <Table
        headers={['类型', '标题', '状态']}
        rows={[
          ...props.data.requirements.slice(0, 4).map((item) => ['需求', item.title, labelOf(item.status)]),
          ...props.data.bugs.slice(0, 4).map((item) => ['Bug', item.title, labelOf(item.status)])
        ]}
      />
    </section>
  );
}

function Section(props: { title: string; icon: typeof FolderKanban; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header className="section-head">
        <props.icon size={22} />
        <h2>{props.title}</h2>
      </header>
      {props.children}
    </section>
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

function date(value?: string) {
  if (!value) return '-';
  return value.slice(0, 10);
}
