import type { Project, ReportSummary, UserProfile } from '@buggy/shared-types';
import { labelOf } from '../../labels.js';
import type { Tab, WorkspaceData } from '../../app/types.js';
import { DataTable, EmptyState, StatusBadge, Table } from './common.js';

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
