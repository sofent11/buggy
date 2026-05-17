import type { Project, ReportSummary, UserProfile } from '@buggy/shared-types';
import { Activity, Bug, ClipboardCheck, FileText, Flag, FolderKanban, GitPullRequestArrow, RotateCcw, ShieldAlert, Users } from 'lucide-react';
import { labelOf } from '../../labels.js';
import type { Tab, WorkspaceData } from '../../app/types.js';
import { DataTable, EmptyState, StatusBadge, Table } from './common.js';

export function QualityWorkflowNavigator(props: { data: WorkspaceData; onJump?: (tab: Tab) => void }) {
  const coveredRequirementIds = new Set(props.data.cases.map((item) => item.requirementId).filter(Boolean));
  const uncoveredRequirements = props.data.requirements.filter((item) => !coveredRequirementIds.has(item.id));
  const pendingReviews = props.data.cases.filter((item) => ['draft', 'in_review', 'changes_requested'].includes(item.reviewStatus || 'draft'));
  const runItems = props.data.plans.flatMap((plan) => plan.runItems);
  const failedOrBlocked = runItems.filter((item) => ['failed', 'blocked'].includes(item.status));
  const resolvedBugs = props.data.bugs.filter((item) => item.status === 'resolved');
  const activeSevereBugs = props.data.bugs.filter((item) => ['S0', 'S1'].includes(item.severity) && !['verified', 'closed'].includes(item.status));
  const signoffBlocked = (props.data.report?.qualityGate?.issues || []).length;
  const stages = [
    {
      label: '需求准入',
      detail: uncoveredRequirements.length ? `${uncoveredRequirements.length} 个需求缺少用例` : '需求覆盖就绪',
      value: `${props.data.requirements.length}`,
      tone: uncoveredRequirements.length ? 'risk' : 'good',
      tab: 'requirements' as Tab,
      icon: Flag
    },
    {
      label: '用例设计 / 评审',
      detail: pendingReviews.length ? `${pendingReviews.length} 条待评审或需修改` : '评审队列清爽',
      value: `${props.data.cases.length}`,
      tone: pendingReviews.length ? 'warning' : 'good',
      tab: 'cases' as Tab,
      icon: ClipboardCheck
    },
    {
      label: '执行计划',
      detail: failedOrBlocked.length ? `${failedOrBlocked.length} 个失败/阻塞执行项` : `${runItems.length} 个执行项`,
      value: `${props.data.plans.length}`,
      tone: failedOrBlocked.length ? 'risk' : 'info',
      tab: 'plans' as Tab,
      icon: Activity
    },
    {
      label: '缺陷复测',
      detail: resolvedBugs.length ? `${resolvedBugs.length} 个已解决待复测` : `${activeSevereBugs.length} 个高危活跃缺陷`,
      value: `${props.data.bugs.length}`,
      tone: activeSevereBugs.length ? 'risk' : resolvedBugs.length ? 'warning' : 'good',
      tab: 'bugs' as Tab,
      icon: Bug
    },
    {
      label: '报告签核',
      detail: signoffBlocked ? `${signoffBlocked} 项准入阻塞` : '可进入验收判断',
      value: props.data.report?.qualityGate?.status === 'pass' ? 'PASS' : 'CHECK',
      tone: signoffBlocked ? 'risk' : 'good',
      tab: 'reports' as Tab,
      icon: FileText
    }
  ];

  return (
    <section className="panel wide workflow-navigator">
      <div className="section-heading compact">
        <span>核心闭环</span>
        <strong>从需求准入到验收签核</strong>
      </div>
      <div className="workflow-steps">
        {stages.map((stage, index) => (
          <button key={stage.label} type="button" className={`workflow-step tone-${stage.tone}`} onClick={() => props.onJump?.(stage.tab)}>
            <span className="workflow-step-index">{index + 1}</span>
            <stage.icon size={17} />
            <strong>{stage.label}</strong>
            <b>{stage.value}</b>
            <small>{stage.detail}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function QualityWorkQueue(props: { data: WorkspaceData; user: UserProfile; onJump?: (tab: Tab) => void }) {
  const runEntries = props.data.plans.flatMap((plan) => plan.runItems.map((item) => ({ plan, item })));
  const myUntested = runEntries.filter(({ item }) => item.status === 'untested' && (!item.executorId || item.executorId === props.user.id));
  const failedWithoutBug = runEntries.filter(({ item }) => ['failed', 'blocked'].includes(item.status) && item.bugIds.length === 0);
  const triageBugs = props.data.bugs.filter((bug) => !['verified', 'closed'].includes(bug.status) && ['new', 'needs_info'].includes(bug.triageStatus || 'new'));
  const retestBugs = props.data.bugs.filter((bug) => bug.status === 'resolved');
  const signoffRisks = props.data.requirements.filter((requirement) =>
    requirement.status === 'blocked' ||
    requirement.acceptanceStatus === 'rejected' ||
    requirement.qualityGateResult?.status === 'blocked'
  );
  const rows = [
    ...myUntested.slice(0, 3).map(({ plan, item }) => ['我的待执行', item.caseTitle, plan.name, <button className="linkish" type="button" onClick={() => props.onJump?.('plans')}>记录结果</button>]),
    ...failedWithoutBug.slice(0, 3).map(({ plan, item }) => ['失败待建 Bug', item.caseTitle, plan.name, <button className="linkish" type="button" onClick={() => props.onJump?.('plans')}>进入执行</button>]),
    ...triageBugs.slice(0, 3).map((bug) => ['待分诊 Bug', bug.title, bug.assigneeId ? '已指派' : '未指派', <button className="linkish" type="button" onClick={() => props.onJump?.('bugs')}>分诊</button>]),
    ...retestBugs.slice(0, 3).map((bug) => ['待复测', bug.title, bug.resolution || '等待验证结论', <button className="linkish" type="button" onClick={() => props.onJump?.('bugs')}>复测</button>]),
    ...signoffRisks.slice(0, 3).map((requirement) => ['验收阻塞', requirement.title, requirement.qualityGateResult?.summary || requirement.riskNote || '需要补齐验收证据', <button className="linkish" type="button" onClick={() => props.onJump?.('requirements')}>处理</button>])
  ];
  const queueCards = [
    { label: '我的待执行', value: myUntested.length, detail: '等待记录测试结果', icon: Activity, tab: 'plans' as Tab },
    { label: '待分诊 Bug', value: triageBugs.length, detail: '新建或需补充信息', icon: ShieldAlert, tab: 'bugs' as Tab },
    { label: '待复测', value: retestBugs.length, detail: '已解决缺陷等待验证', icon: RotateCcw, tab: 'bugs' as Tab },
    { label: '验收阻塞', value: signoffRisks.length, detail: '准入或签核前风险', icon: GitPullRequestArrow, tab: 'requirements' as Tab }
  ];

  return (
    <section className="panel wide role-workbench">
      <div className="section-heading compact">
        <span>{labelOf(props.user.role)}工作台</span>
        <strong>今天最该处理的事项</strong>
      </div>
      <div className="role-queue-cards">
        {queueCards.map((card) => (
          <button key={card.label} type="button" className={card.value ? 'has-work' : ''} onClick={() => props.onJump?.(card.tab)}>
            <card.icon size={17} />
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </button>
        ))}
      </div>
      {rows.length > 0 ? (
        <DataTable headers={['队列', '对象', '上下文', '下一步']} rows={rows} />
      ) : (
        <EmptyState text="暂无待办" detail="待执行、待分诊、待复测和验收阻塞会自动聚合到这里。" />
      )}
    </section>
  );
}

export function ProjectOnboarding(props: { data: WorkspaceData; currentProject?: Project; onJump?: (tab: Tab) => void }) {
  const hasProject = Boolean(props.currentProject);
  const hasMembers = (props.currentProject?.members.length || 0) > 1;
  const hasRequirements = props.data.requirements.length > 0;
  const hasCases = props.data.cases.length > 0;
  const hasPlans = props.data.plans.length > 0;
  const hasExecution = props.data.plans.some((plan) => plan.runItems.some((item) => item.status !== 'untested'));
  const steps: Array<{ label: string; done: boolean; tab: Tab; icon: typeof FolderKanban }> = [
    { label: '建立项目', done: hasProject, tab: 'projects', icon: FolderKanban },
    { label: '补充成员', done: hasMembers, tab: 'projects', icon: Users },
    { label: '创建需求', done: hasRequirements, tab: 'requirements', icon: Flag },
    { label: '沉淀用例', done: hasCases, tab: 'cases', icon: ClipboardCheck },
    { label: '组织执行', done: hasPlans, tab: 'plans', icon: Activity },
    { label: '生成报告', done: hasExecution, tab: 'plans', icon: FileText }
  ];
  return (
    <section className="panel wide onboarding-panel">
      <h2>项目初始化清单</h2>
      <div className="onboarding-steps">
        {steps.map((step) => (
          <button key={step.label} type="button" className={step.done ? 'done' : ''} onClick={() => props.onJump?.(step.tab)}>
            <step.icon size={16} />
            <span>{step.label}</span>
            <strong>{step.done ? '已完成' : '去处理'}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

export function QualityHealthCenter(props: { data: WorkspaceData; onJump?: (tab: Tab) => void; onOpenEntity?: (entityType: string, entityId?: string) => void }) {
  const requirementIds = new Set(props.data.requirements.map((item) => item.id));
  const caseIds = new Set(props.data.cases.map((item) => item.id));
  const planIds = new Set(props.data.plans.map((item) => item.id));
  const coveredRequirementIds = new Set(props.data.cases.map((item) => item.requirementId).filter(Boolean));
  const uncoveredRequirements = props.data.requirements.filter((item) => !coveredRequirementIds.has(item.id));
  const orphanCases = props.data.cases.filter((item) => !item.requirementId || !requirementIds.has(item.requirementId));
  const orphanBugs = props.data.bugs.filter((item) =>
    (!item.requirementId || !requirementIds.has(item.requirementId)) &&
    (!item.testCaseId || !caseIds.has(item.testCaseId)) &&
    (!item.testPlanId || !planIds.has(item.testPlanId))
  );
  const failedItems = props.data.plans.flatMap((plan) => plan.runItems.filter((item) => ['failed', 'blocked'].includes(item.status)).map((item) => ({ plan, item })));
  const severeActiveBugs = props.data.bugs.filter((bugItem) => ['S0', 'S1'].includes(bugItem.severity) && !['verified', 'closed'].includes(bugItem.status));
  const rows = [
    ...uncoveredRequirements.slice(0, 4).map((item) => ['未覆盖需求', item.title, '缺少可执行用例', <button className="linkish" type="button" onClick={() => props.onOpenEntity?.('requirement', item.id)}>查看需求</button>]),
    ...orphanCases.slice(0, 4).map((item) => ['孤立用例', item.title, '未绑定有效需求', <button className="linkish" type="button" onClick={() => props.onOpenEntity?.('test_case', item.id)}>查看用例</button>]),
    ...orphanBugs.slice(0, 4).map((item) => ['孤立 Bug', item.title, '缺少需求/用例/计划来源', <button className="linkish" type="button" onClick={() => props.onOpenEntity?.('bug', item.id)}>查看 Bug</button>]),
    ...failedItems.slice(0, 4).map(({ plan, item }) => ['失败执行项', item.caseTitle, plan.name, <button className="linkish" type="button" onClick={() => props.onOpenEntity?.('run_item', item.id)}>进入执行</button>]),
    ...severeActiveBugs.slice(0, 4).map((item) => ['严重活跃 Bug', item.title, labelOf(item.severity), <button className="linkish" type="button" onClick={() => props.onOpenEntity?.('bug', item.id)}>分诊</button>])
  ];
  return (
    <section className="panel wide health-center">
      <h2>追踪健康中心</h2>
      <div className="health-metrics">
        <button type="button" onClick={() => props.onJump?.('requirements')}><Flag size={16} /><span>未覆盖需求</span><strong>{uncoveredRequirements.length}</strong></button>
        <button type="button" onClick={() => props.onJump?.('cases')}><ClipboardCheck size={16} /><span>孤立用例</span><strong>{orphanCases.length}</strong></button>
        <button type="button" onClick={() => props.onJump?.('bugs')}><Bug size={16} /><span>孤立 Bug</span><strong>{orphanBugs.length}</strong></button>
        <button type="button" onClick={() => props.onJump?.('plans')}><Activity size={16} /><span>失败/阻塞执行</span><strong>{failedItems.length}</strong></button>
      </div>
      {rows.length > 0 ? <DataTable headers={['风险类型', '对象', '原因', '下一步']} rows={rows} /> : <EmptyState text="追踪链路健康" detail="需求、用例、执行和 Bug 当前没有明显断点。" />}
    </section>
  );
}

export function RecentWork(props: { data: WorkspaceData }) {
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

export function RiskBoard(props: { report: ReportSummary | null; onOpenEntity?: (entityType: string, entityId?: string) => void }) {
  const report = props.report;
  if (!report) return <EmptyState text="暂无风险数据" />;
  if (report.charts?.riskList?.length) {
    return (
      <DataTable
        headers={['类型', '事项', '原因', '下一步']}
        rows={report.charts.riskList.slice(0, 8).map((item) => [
          item.type,
          item.title,
          item.reason,
          <button className="linkish" type="button" onClick={() => props.onOpenEntity?.(riskEntity(item.type), item.id)}>{item.dueDate ? item.dueDate.slice(0, 10) : '定位处理'}</button>
        ])}
      />
    );
  }
  const items = [
    report.execution.failed > 0 ? `存在 ${report.execution.failed} 条失败执行项` : '暂无失败执行项',
    report.execution.blocked > 0 ? `存在 ${report.execution.blocked} 条阻塞执行项` : '暂无阻塞执行项',
    report.bugs.active > 0 ? `还有 ${report.bugs.active} 个活跃 Bug，其中 ${report.bugs.overdue || 0} 个逾期` : '暂无活跃 Bug',
    report.requirements.blocked > 0 ? `有 ${report.requirements.blocked} 个阻塞需求` : '暂无阻塞需求'
  ];
  return <div className="risk-list">{items.map((item) => <span key={item}>{item}</span>)}</div>;
}

export function MyTodo(props: { data: WorkspaceData; user: UserProfile }) {
  const failedItems = props.data.plans.flatMap((plan) => plan.runItems.filter((item) => item.status === 'failed').map((item) => ({ plan, item })));
  const untestedItems = props.data.plans.flatMap((plan) => plan.runItems.filter((item) => item.status === 'untested').map((item) => ({ plan, item })));
  const assignedBugs = props.data.bugs.filter((bug) => bug.assigneeId === props.user.id && !['verified', 'closed'].includes(bug.status));
  const blockedRequirements = props.data.requirements.filter((requirement) => requirement.status === 'blocked');
  const rows = [
    ...failedItems.slice(0, 4).map(({ plan, item }) => ['执行失败', item.caseTitle, plan.name, <StatusBadge value={item.status} dictionaryType="testRunStatus" />]),
    ...untestedItems.slice(0, 4).map(({ plan, item }) => ['待执行', item.caseTitle, plan.name, <StatusBadge value={item.status} dictionaryType="testRunStatus" />]),
    ...assignedBugs.slice(0, 4).map((bug) => ['指派给我', bug.title, bug.actualResult || '待处理', <StatusBadge value={bug.status} dictionaryType="bugStatus" />]),
    ...blockedRequirements.slice(0, 4).map((requirement) => ['阻塞需求', requirement.title, requirement.description || '需要解除阻塞', <StatusBadge value={requirement.status} dictionaryType="requirementStatus" />])
  ];
  return (
    <section className="panel wide">
      <h2>我的待办</h2>
      {rows.length > 0 ? <DataTable headers={['类型', '对象', '上下文', '状态']} rows={rows} /> : <EmptyState text="暂无待办" detail="失败执行项、指派 Bug 和阻塞需求会聚合到这里。" />}
    </section>
  );
}

export function TraceabilityMatrix(props: { data: WorkspaceData }) {
  const rows = props.data.requirements.map((requirement) => {
    const cases = props.data.cases.filter((testCase) => testCase.requirementId === requirement.id);
    const caseIds = new Set(cases.map((testCase) => testCase.id));
    const runItems = props.data.plans.flatMap((plan) => plan.runItems.filter((item) => caseIds.has(item.caseId)));
    const activeBugs = props.data.bugs.filter((bug) => bug.requirementId === requirement.id && !['verified', 'closed'].includes(bug.status));
    const passed = runItems.filter((item) => item.status === 'passed').length;
    return [
      requirement.title,
      <StatusBadge value={requirement.status} dictionaryType="requirementStatus" />,
      `${cases.length} 条`,
      runItems.length ? `${passed}/${runItems.length} 通过` : '未执行',
      activeBugs.length ? `${activeBugs.length} 活跃` : (requirement.dueDate ? `截止 ${requirement.dueDate.slice(0, 10)}` : '无活跃 Bug')
    ];
  });
  return (
    <section className="panel wide">
      <h2>需求追踪矩阵</h2>
      {rows.length > 0 ? <DataTable headers={['需求', '状态', '用例覆盖', '执行结果', '缺陷风险']} rows={rows} /> : <EmptyState text="暂无追踪数据" detail="创建需求和用例后，这里会显示覆盖与风险。" />}
    </section>
  );
}

export function PageInsights(props: {
  tab: Tab;
  projectCount: number;
  data: WorkspaceData;
  currentProject?: Project;
  globalKeyword: string;
}) {
  const report = props.data.report;
  const allItems = [
    ...props.data.iterations,
    ...props.data.requirements,
    ...props.data.cases,
    ...props.data.plans,
    ...props.data.bugs
  ];
  const cards: Record<Tab, Array<{ label: string; value: string | number; tone?: string }>> = {
    overview: [
      { label: '项目资产', value: allItems.length },
      { label: '通过率', value: `${report?.execution.passRate || 0}%`, tone: 'good' },
      { label: '活跃 Bug', value: report?.bugs.active || 0, tone: (report?.bugs.active || 0) > 0 ? 'risk' : 'good' }
    ],
    projects: [
      { label: '项目数', value: props.projectCount },
      { label: '当前项目', value: props.currentProject?.code || '未选择' },
      { label: '成员', value: props.currentProject?.members.length || 0 }
    ],
    iterations: [
      { label: '迭代', value: props.data.iterations.length },
      { label: '进行中', value: props.data.iterations.filter((item) => item.status === 'active').length, tone: 'info' },
      { label: '已完成', value: props.data.iterations.filter((item) => item.status === 'done').length, tone: 'good' }
    ],
    requirements: [
      { label: '需求', value: props.data.requirements.length },
      { label: '阻塞', value: props.data.requirements.filter((item) => item.status === 'blocked').length, tone: 'risk' },
      { label: '已完成', value: props.data.requirements.filter((item) => item.status === 'done').length, tone: 'good' }
    ],
    cases: [
      { label: '用例', value: props.data.cases.length },
      { label: '可执行', value: props.data.cases.filter((item) => item.status === 'ready').length, tone: 'good' },
      { label: '草稿', value: props.data.cases.filter((item) => item.status === 'draft').length, tone: 'info' }
    ],
    plans: [
      { label: '计划', value: props.data.plans.length },
      { label: '执行项', value: props.data.plans.reduce((sum, plan) => sum + plan.runItems.length, 0) },
      { label: '失败项', value: report?.execution.failed || 0, tone: 'risk' }
    ],
    bugs: [
      { label: 'Bug', value: props.data.bugs.length },
      { label: '活跃', value: report?.bugs.active || 0, tone: 'risk' },
      { label: '已解决', value: report?.bugs.resolved || 0, tone: 'good' }
    ],
    reports: [
      { label: '验收范围', value: props.data.acceptanceScopes.length },
      { label: '待签核', value: props.data.acceptanceScopes.filter((item) => !['signed', 'archived'].includes(item.status)).length, tone: 'info' },
      { label: '阻塞项', value: report?.qualityGate?.issues.length || 0, tone: report?.qualityGate?.issues.length ? 'risk' : 'good' }
    ],
    settings: [
      { label: '字典', value: props.data.dictionaries.length },
      { label: '用户', value: props.data.users.length },
      { label: '导入范围', value: props.currentProject?.code || '未选择' }
    ]
  };

  return (
    <section className="insight-strip" aria-label="当前页面概览">
      {cards[props.tab].map((card) => (
        <div key={card.label} className={`insight-card ${card.tone ? `tone-${card.tone}` : ''}`}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
      {props.globalKeyword && (
        <div className="insight-card tone-info">
          <span>全局搜索</span>
          <strong>{props.globalKeyword}</strong>
        </div>
      )}
    </section>
  );
}

function riskEntity(type: string) {
  if (type === 'bug') return 'bug';
  if (type === 'execution') return 'run_item';
  return 'requirement';
}
