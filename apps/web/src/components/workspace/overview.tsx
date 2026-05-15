import type { Project, ReportSummary } from '@buggy/shared-types';
import { labelOf } from '../../labels.js';
import type { Tab, WorkspaceData } from '../../app/types.js';
import { rate } from '../../app/workspace-utils.js';
import { EmptyState, Table } from './common.js';

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
  const items = [
    report.execution.failed > 0 ? `存在 ${report.execution.failed} 条失败执行项` : '暂无失败执行项',
    report.execution.blocked > 0 ? `存在 ${report.execution.blocked} 条阻塞执行项` : '暂无阻塞执行项',
    report.bugs.active > 0 ? `还有 ${report.bugs.active} 个活跃 Bug` : '暂无活跃 Bug',
    report.requirements.blocked > 0 ? `有 ${report.requirements.blocked} 个阻塞需求` : '暂无阻塞需求'
  ];
  return <div className="risk-list">{items.map((item) => <span key={item}>{item}</span>)}</div>;
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
      { label: '需求完成率', value: report ? rate(report.requirements.done, report.requirements.total) : '0%' },
      { label: '执行通过率', value: `${report?.execution.passRate || 0}%`, tone: 'good' },
      { label: '报告范围', value: props.currentProject?.code || '未选择' }
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
