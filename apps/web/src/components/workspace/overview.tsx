import type { Project, ReportSummary, UserProfile } from '@buggy/shared-types';
import { Activity, Bug, ClipboardCheck, FileText, Flag, FolderKanban, Users } from 'lucide-react';
import { labelOf } from '../../labels.js';
import type { Tab, WorkspaceData } from '../../app/types.js';
import { DataTable, EmptyState, StatusBadge, Table } from './common.js';

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

export function QualityHealthCenter(props: { data: WorkspaceData; onJump?: (tab: Tab) => void }) {
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
    ...uncoveredRequirements.slice(0, 4).map((item) => ['未覆盖需求', item.title, '缺少可执行用例', <button className="linkish" type="button" onClick={() => props.onJump?.('requirements')}>查看需求</button>]),
    ...orphanCases.slice(0, 4).map((item) => ['孤立用例', item.title, '未绑定有效需求', <button className="linkish" type="button" onClick={() => props.onJump?.('cases')}>查看用例</button>]),
    ...orphanBugs.slice(0, 4).map((item) => ['孤立 Bug', item.title, '缺少需求/用例/计划来源', <button className="linkish" type="button" onClick={() => props.onJump?.('bugs')}>查看 Bug</button>]),
    ...failedItems.slice(0, 4).map(({ plan, item }) => ['失败执行项', item.caseTitle, plan.name, <button className="linkish" type="button" onClick={() => props.onJump?.('plans')}>进入执行</button>]),
    ...severeActiveBugs.slice(0, 4).map((item) => ['严重活跃 Bug', item.title, labelOf(item.severity), <button className="linkish" type="button" onClick={() => props.onJump?.('bugs')}>分诊</button>])
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

export function RiskBoard(props: { report: ReportSummary | null }) {
  const report = props.report;
  if (!report) return <EmptyState text="暂无风险数据" />;
  if (report.charts?.riskList?.length) {
    return (
      <DataTable
        headers={['类型', '事项', '原因', '截止']}
        rows={report.charts.riskList.slice(0, 8).map((item) => [
          item.type,
          item.title,
          item.reason,
          item.dueDate ? item.dueDate.slice(0, 10) : '-'
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
