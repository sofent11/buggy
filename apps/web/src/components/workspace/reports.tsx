import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, MoreHorizontal, Plus, Save, ShieldAlert, XCircle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DEFAULT_PROJECT_GATE_RULES, type AcceptanceScope, type Bug, type Iteration, type Project, type QualityGateRule, type ReportSummary, type Requirement, type TestPlan, type UserProfile } from '@buggy/shared-types';
import { api, downloadUrl } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { DataPage, DataTable, DangerButton, Drawer, EmptyState, HookForm, MetricCard, StatusBadge, TextConfirmDialog, Toolbar, RowMoreMenu } from './common.js';

type OpenEntity = (entityType: string, entityId?: string) => void;

const chartColors = ['#1d4ed8', '#15803d', '#b45309', '#b91c1c', '#6d28d9', '#475569'];

export function ReportSection(props: {
  projectId: string;
  currentProject?: Project;
  scopes: AcceptanceScope[];
  iterations: Iteration[];
  requirements: Requirement[];
  plans: TestPlan[];
  bugs: Bug[];
  users: UserProfile[];
  canWrite?: boolean;
  canManage?: boolean;
  mutate: (action: () => Promise<unknown>, message: string) => Promise<void>;
  onOpenEntity?: OpenEntity;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AcceptanceScope | null>(null);
  const [selectedId, setSelectedId] = useState(props.scopes[0]?.id || '');
  const selectedScope = props.scopes.find((scope) => scope.id === selectedId) || props.scopes[0];
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [signoff, setSignoff] = useState<'signed' | 'rejected' | null>(null);
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [reportView, setReportView] = useState<'decision' | 'trend' | 'rootCause'>('decision');

  useEffect(() => {
    if (!selectedId && props.scopes[0]) setSelectedId(props.scopes[0].id);
  }, [props.scopes, selectedId]);

  useEffect(() => {
    let active = true;
    setLoadingReport(true);
    api
      .reportSummary({ projectId: props.projectId, acceptanceScopeId: selectedScope?.id })
      .then((result) => {
        if (active) setReport(result);
      })
      .catch(() => {
        if (active) setReport(null);
      })
      .finally(() => {
        if (active) setLoadingReport(false);
      });
    return () => {
      active = false;
    };
  }, [props.projectId, selectedScope?.id]);

  const activeScopes = props.scopes.filter((scope) => !['signed', 'archived'].includes(scope.status)).length;
  const blockers = report?.qualityGate?.issues || [];
  const query = new URLSearchParams({ projectId: props.projectId });
  if (selectedScope?.id) query.set('acceptanceScopeId', selectedScope.id);

  return (
    <DataPage
      title="验收报表"
      icon={FileText}
      metrics={
        <section className="insight-strip">
          <MetricCard label="验收范围" value={props.scopes.length} detail={`${activeScopes} 个处理中`} tone="info" />
          <MetricCard label="准入阻塞" value={blockers.length} detail={report?.qualityGate?.summary || '待检查'} tone={blockers.length ? 'risk' : 'good'} />
          <MetricCard label="执行通过率" value={`${report?.execution.passRate || 0}%`} detail={`${report?.execution.passed || 0}/${report?.execution.total || 0}`} />
          <MetricCard label="活跃缺陷" value={report?.bugs.active || 0} detail={`${report?.bugs.overdue || 0} 个逾期`} tone={report?.bugs.active ? 'risk' : 'good'} />
        </section>
      }
    >
      <Toolbar>
        <select value={selectedScope?.id || ''} onChange={(event) => setSelectedId(event.target.value)} aria-label="验收范围">
          <option value="">项目整体质量报告</option>
          {props.scopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}
        </select>
        <a className="link-button" href={downloadUrl(`/reports/html?${query.toString()}`)} target="_blank" rel="noreferrer"><FileText size={15} /> HTML</a>
        <a className="link-button" href={downloadUrl(`/reports/pdf?${query.toString()}`)}>导出 PDF</a>
        <span className="toolbar-summary">{loadingReport ? '报告生成中...' : selectedScope ? `当前范围：${selectedScope.name}` : '项目整体范围'}</span>
        {props.canWrite && <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建验收范围</button>}
      </Toolbar>
      <section className="report-mode-tabs" role="tablist" aria-label="验收报表视图">
        <button type="button" className={reportView === 'decision' ? 'active' : ''} onClick={() => setReportView('decision')}>发布决策</button>
        <button type="button" className={reportView === 'trend' ? 'active' : ''} onClick={() => setReportView('trend')}>历史趋势</button>
        <button type="button" className={reportView === 'rootCause' ? 'active' : ''} onClick={() => setReportView('rootCause')}>根因分析</button>
      </section>

      {reportView === 'trend' ? (
        <ReportTrendPanel report={report} />
      ) : reportView === 'rootCause' ? (
        <RootCauseAnalysisPanel report={report} onOpenEntity={props.onOpenEntity} />
      ) : props.scopes.length === 0 ? (
        <div className="report-workspace solo-report">
          <ReportDecision report={report} onOpenEntity={props.onOpenEntity} />
          <AcceptanceScopeGuide
            requirements={props.requirements.length}
            plans={props.plans.length}
            activeBugs={props.bugs.filter((bug) => !['verified', 'closed'].includes(bug.status)).length}
            canWrite={props.canWrite}
            onCreate={() => setCreating(true)}
          />
        </div>
      ) : (
      <div className="report-workspace">
        <section className="report-scope-list">
          <div className="section-heading compact">
            <span>发布 / 验收范围</span>
            <strong>把需求、测试计划和保留风险收束成一次交付</strong>
          </div>
          <DataTable
            headers={['范围', '状态', '范围资产', '目标日期', '签核', '操作']}
            emptyText="暂无验收范围"
            rows={props.scopes.map((scope) => [
              <div className="cell-main"><strong>{scope.name}</strong><span>{scope.description || '未填写交付说明'}</span></div>,
              <StatusBadge value={scope.status} />,
              `${scope.requirementIds.length} 需求 · ${scope.testPlanIds.length} 计划 · ${scope.bugIds.length} 保留缺陷`,
              scope.targetDate ? scope.targetDate.slice(0, 10) : '-',
              scope.reportSignoff?.status ? labelOf(scope.reportSignoff.status) : '未签核',
              <div className="row-actions">
                <Button type="button" size="sm" onClick={() => setSelectedId(scope.id)}>查看报告</Button>
                <Button type="button" size="sm" onClick={() => setEditing(scope)}>编辑</Button>
                {props.canManage && (
                  <RowMoreMenu label={`更多操作：${scope.name}`} trigger={<MoreHorizontal size={15} />}>
                    <DangerButton title={`删除验收范围「${scope.name}」？`} onConfirm={() => props.mutate(() => api.deleteAcceptanceScope(scope.id), '验收范围已删除')} />
                  </RowMoreMenu>
                )}
              </div>
            ])}
          />
          {props.scopes.length === 0 && (
            <EmptyState
              text="还没有验收范围"
              detail="为一次发布或交付选择需求、测试计划和保留缺陷后，报告页会给出准入结论和签核记录。"
              action={props.canWrite ? <button className="primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建验收范围</button> : undefined}
            />
          )}
        </section>

        <section className="report-decision-stack">
          <ReportDecision report={report} onOpenEntity={props.onOpenEntity} />
          {selectedScope && (
            <section className={`report-signoff-card tone-${selectedScope.reportSignoff?.status || 'pending'}`}>
              <div>
                <span>验收签核</span>
                <strong>{labelOf(selectedScope.reportSignoff?.status || 'pending')}</strong>
                <small>{selectedScope.reportSignoff?.signerName ? `${selectedScope.reportSignoff.signerName} · ${selectedScope.reportSignoff.signedAt?.slice(0, 10)}` : '等待负责人确认报告结论'}</small>
                {selectedScope.riskWaivers.length > 0 && <p>{selectedScope.riskWaivers.length} 条风险豁免已记录</p>}
              </div>
              <div className="report-actions">
                {props.canWrite && <Button type="button" onClick={() => setWaiverOpen(true)}><ShieldAlert size={15} /> 风险豁免</Button>}
                {props.canManage && <Button type="button" variant="primary" onClick={() => setSignoff('signed')}><CheckCircle2 size={15} /> 签核通过</Button>}
                {props.canManage && <Button type="button" variant="destructive" onClick={() => setSignoff('rejected')}><XCircle size={15} /> 驳回</Button>}
              </div>
            </section>
          )}
          {selectedScope?.reportSnapshot && <ReportSnapshotCard scope={selectedScope} />}
        </section>
      </div>
      )}

      <AcceptanceScopeDrawer
        title="新建验收范围"
        open={creating}
        projectId={props.projectId}
        defaultGateRules={props.currentProject?.qualitySettings?.defaultGateRules}
        iterations={props.iterations}
        requirements={props.requirements}
        plans={props.plans}
        bugs={props.bugs}
        users={props.users}
        canWrite={props.canWrite}
        onClose={() => setCreating(false)}
        onSubmit={async (body) => {
          await props.mutate(() => api.createAcceptanceScope(body), '验收范围已创建');
          setCreating(false);
        }}
      />
      <AcceptanceScopeDrawer
        title="编辑验收范围"
        row={editing || undefined}
        open={Boolean(editing)}
        projectId={props.projectId}
        defaultGateRules={props.currentProject?.qualitySettings?.defaultGateRules}
        iterations={props.iterations}
        requirements={props.requirements}
        plans={props.plans}
        bugs={props.bugs}
        users={props.users}
        canWrite={props.canWrite}
        onClose={() => setEditing(null)}
        onSubmit={async (body) => {
          if (!editing) return;
          await props.mutate(() => api.updateAcceptanceScope(editing.id, body), '验收范围已保存');
          setEditing(null);
        }}
      />
      {selectedScope && (
        <>
          <RiskWaiverDrawer
            open={waiverOpen}
            scope={selectedScope}
            report={report}
            onClose={() => setWaiverOpen(false)}
            onSubmit={async (body) => {
              await props.mutate(() => api.addScopeWaiver(selectedScope.id, body), '风险豁免已记录');
              setWaiverOpen(false);
            }}
          />
          <TextConfirmDialog
            open={Boolean(signoff)}
            title={signoff === 'signed' ? '签核通过验收报告？' : '驳回验收报告？'}
            description={selectedScope.name}
            label={signoff === 'signed' ? '签核意见' : '驳回原因'}
            placeholder={signoff === 'signed' ? '说明验收依据、保留风险或发布范围' : '说明缺失证据、未关闭风险或需要补充的事项'}
            confirmText={signoff === 'signed' ? '签核通过' : '驳回'}
            destructive={signoff === 'rejected'}
            onCancel={() => setSignoff(null)}
            onConfirm={async (note) => {
              if (!signoff) return;
              await props.mutate(() => api.signoffAcceptanceScope(selectedScope.id, { status: signoff, note }), signoff === 'signed' ? '验收范围已签核' : '验收范围已驳回');
              setSignoff(null);
            }}
          />
        </>
      )}
    </DataPage>
  );
}

function ReportSnapshotCard(props: { scope: AcceptanceScope }) {
  const snapshot = props.scope.reportSnapshot;
  if (!snapshot) return null;
  const gateStatus = snapshot.qualityGateResult?.status || 'unknown';
  const gateLabel = gateStatus === 'pass' ? '门禁通过' : gateStatus === 'risk' ? '带风险通过' : gateStatus === 'blocked' ? '门禁阻塞' : '未记录门禁';
  return (
    <section className={`report-snapshot-card tone-${gateStatus}`}>
      <div className="section-heading compact">
        <span>签核快照</span>
        <strong>{snapshot.scopeName}</strong>
      </div>
      <div className="snapshot-grid">
        <article>
          <span>冻结时间</span>
          <strong>{new Date(snapshot.frozenAt).toLocaleString('zh-CN')}</strong>
        </article>
        <article>
          <span>范围资产</span>
          <strong>{snapshot.requirementIds.length} 需求 · {snapshot.testPlanIds.length} 计划</strong>
          <small>{snapshot.bugIds.length} 个保留缺陷</small>
        </article>
        <article>
          <span>准入结论</span>
          <strong>{gateLabel}</strong>
          <small>{snapshot.qualityGateResult?.summary || '以签核时范围数据为准'}</small>
        </article>
        <article>
          <span>签核人</span>
          <strong>{snapshot.reportSignoff.signerName || '-'}</strong>
          <small>{snapshot.reportSignoff.note || '未填写签核意见'}</small>
        </article>
      </div>
      <div className="snapshot-risk-list">
        {snapshot.riskWaivers.length === 0 ? <span>无风险豁免</span> : snapshot.riskWaivers.map((waiver) => (
          <span key={waiver.id}>{waiver.ownerName || '责任人待定'} · {waiver.reason}{waiver.expiresAt ? ` · ${waiver.expiresAt.slice(0, 10)} 到期` : ''}</span>
        ))}
      </div>
      <div className="report-actions">
        {snapshot.exportLinks?.html && <a className="link-button" href={downloadUrl(snapshot.exportLinks.html)} target="_blank" rel="noreferrer">快照 HTML</a>}
        {snapshot.exportLinks?.pdf && <a className="link-button" href={downloadUrl(snapshot.exportLinks.pdf)}>快照 PDF</a>}
      </div>
    </section>
  );
}

function AcceptanceScopeGuide(props: { requirements: number; plans: number; activeBugs: number; canWrite?: boolean; onCreate: () => void }) {
  return (
    <section className="acceptance-guide">
      <div>
        <span>发布验收向导</span>
        <strong>先定义验收范围，再生成正式结论。</strong>
        <p>选择本次交付涉及的需求、测试计划和保留缺陷，系统会基于范围计算准入阻塞、风险豁免和签核记录。</p>
      </div>
      <div className="acceptance-guide-steps">
        <article><span>1</span><strong>选需求</strong><small>{props.requirements} 个可选需求</small></article>
        <article><span>2</span><strong>选计划</strong><small>{props.plans} 个测试计划</small></article>
        <article><span>3</span><strong>留风险</strong><small>{props.activeBugs} 个活跃缺陷</small></article>
      </div>
      {props.canWrite && <button className="primary" type="button" onClick={props.onCreate}><Plus size={16} /> 创建验收范围</button>}
    </section>
  );
}

function ReportDecision(props: { report: ReportSummary | null; onOpenEntity?: OpenEntity }) {
  if (!props.report) return <EmptyState text="暂无报告数据" detail="选择验收范围后会生成准入结论、风险清单和执行明细。" />;
  const blockers = props.report.qualityGate?.issues || [];
  const waived = props.report.qualityGate?.waivedIssues || [];
  const gateStatus = props.report.qualityGate?.status || 'blocked';
  const canAccept = gateStatus !== 'blocked';
  const riskRows = props.report.charts?.riskList || [];
  const rootCauses = props.report.charts?.bugRootCause || [];
  return (
    <section className={`report-decision-panel ${canAccept ? 'tone-pass' : 'tone-blocked'}`}>
      <div>
        {canAccept ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
        <span>验收结论</span>
        <strong>{gateStatus === 'pass' ? '建议通过验收' : gateStatus === 'risk' ? '带风险验收' : '暂缓验收'}</strong>
        <p>{props.report.qualityGate?.summary || '报告已生成，请复核执行明细和缺陷风险。'}</p>
      </div>
      <div className="release-decision-strip" aria-label="发布决策摘要">
        <article>
          <span>准入阻塞</span>
          <strong>{blockers.length}</strong>
          <small>{blockers.length ? '需处理后签核' : '无阻塞'}</small>
        </article>
        <article>
          <span>风险豁免</span>
          <strong>{waived.length}</strong>
          <small>{waived.length ? '已记录保留风险' : '无豁免'}</small>
        </article>
        <article>
          <span>执行通过率</span>
          <strong>{props.report.execution.passRate}%</strong>
          <small>{props.report.execution.passed}/{props.report.execution.total}</small>
        </article>
        <article>
          <span>活跃缺陷</span>
          <strong>{props.report.bugs.active}</strong>
          <small>{props.report.bugs.overdue || 0} 个逾期</small>
        </article>
      </div>
      <div className="report-risk-links">
        {blockers.length === 0 ? <span>没有准入阻塞项</span> : blockers.map((item) => <b key={item}>{item}</b>)}
        {waived.map((item) => <em key={item}>已豁免：{item}</em>)}
      </div>
      <div className="gate-rule-strip" aria-label="质量门禁规则">
        {(props.report.qualityGate?.rules || DEFAULT_PROJECT_GATE_RULES).map((rule) => (
          <span key={rule.id} className={rule.enabled ? 'is-enabled' : 'is-disabled'}>
            {rule.label}{rule.blocking ? ' · 阻断' : ' · 提醒'}
          </span>
        ))}
      </div>
      <DataTable
        headers={['风险类型', '对象', '原因', '下一步']}
        emptyText="暂无风险"
        rows={riskRows.slice(0, 8).map((item) => ({
          key: `${item.type}-${item.id}`,
          onOpen: () => props.onOpenEntity?.(entityTypeOfRisk(item.type), item.id),
          openLabel: `打开风险对象：${item.title}`,
          cells: [
            riskTypeLabel(item.type),
            item.title,
            item.reason,
            <Button type="button" size="sm" onClick={() => props.onOpenEntity?.(entityTypeOfRisk(item.type), item.id)}>定位处理</Button>
          ]
        }))}
      />
      <DataTable
        headers={['根因分类', '数量']}
        emptyText="暂无根因分类"
        rows={rootCauses.map((item) => [item.label, item.value])}
      />
    </section>
  );
}

function ReportTrendPanel(props: { report: ReportSummary | null }) {
  if (!props.report) return <EmptyState text="暂无趋势数据" detail="报告生成后会展示执行轮次趋势、缺陷流入流出和迭代质量排名。" />;
  const executionTrend = props.report.charts?.executionTrend || [];
  const bugTrend = props.report.charts?.bugTrend || [];
  const iterationRank = props.report.charts?.iterationRank || [];
  return (
    <section className="report-analysis-view" aria-label="历史趋势">
      <div className="section-heading">
        <span>历史趋势</span>
        <strong>从执行轮次和缺陷流动判断发布稳定性</strong>
      </div>
      <div className="trend-summary-strip">
        <article>
          <span>当前通过率</span>
          <strong>{props.report.execution.passRate}%</strong>
          <small>{props.report.execution.passed}/{props.report.execution.total} 已通过</small>
        </article>
        <article>
          <span>缺陷流入</span>
          <strong>{bugTrend.reduce((sum, item) => sum + item.created, 0)}</strong>
          <small>近 8 周创建</small>
        </article>
        <article>
          <span>缺陷关闭</span>
          <strong>{bugTrend.reduce((sum, item) => sum + item.closed, 0)}</strong>
          <small>近 8 周验证关闭</small>
        </article>
        <article>
          <span>风险迭代</span>
          <strong>{iterationRank.filter((item) => item.activeBugs > 0 || item.passRate < 80).length}</strong>
          <small>低通过率或活跃缺陷</small>
        </article>
      </div>
      <div className="chart-grid">
        <article className="chart-panel">
          <h3>执行通过率趋势</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={executionTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="passRate" name="通过率" stroke="#1d4ed8" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="failed" name="失败" stroke="#b91c1c" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="blocked" name="阻塞" stroke="#b45309" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </article>
        <article className="chart-panel">
          <h3>缺陷流入流出</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={bugTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="created" name="创建" stroke="#b91c1c" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resolved" name="解决" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="closed" name="关闭" stroke="#15803d" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="overdue" name="逾期" stroke="#b45309" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </div>
      <DataTable
        headers={['迭代', '需求', '用例', '执行项', '通过率', '活跃缺陷']}
        emptyText="暂无迭代趋势"
        rows={iterationRank.map((item) => [
          item.name,
          item.requirements,
          item.cases,
          item.executionTotal,
          `${item.passRate}%`,
          item.activeBugs
        ])}
      />
    </section>
  );
}

function RootCauseAnalysisPanel(props: { report: ReportSummary | null; onOpenEntity?: OpenEntity }) {
  if (!props.report) return <EmptyState text="暂无根因数据" detail="缺陷记录根因后会自动汇总为根因分布、未分类缺口和高风险明细。" />;
  const bugs = props.report.details?.bugs || [];
  const rootCauses = props.report.charts?.bugRootCause || [];
  const unclassified = bugs.filter((bug) => !bug.rootCause?.trim()).length;
  const active = bugs.filter((bug) => !['verified', 'closed'].includes(bug.status));
  const highRiskByCause = rootCauses.map((cause) => ({
    ...cause,
    highRisk: bugs.filter((bug) => (bug.rootCause || '未分类').trim() === cause.label && ['S0', 'S1'].includes(bug.severity)).length,
    active: active.filter((bug) => (bug.rootCause || '未分类').trim() === cause.label).length
  }));
  const topCause = rootCauses[0]?.label || '暂无';
  return (
    <section className="report-analysis-view" aria-label="根因分析">
      <div className="section-heading">
        <span>根因分析</span>
        <strong>把缺陷关闭从处理单点问题升级为改进系统原因</strong>
      </div>
      <div className="trend-summary-strip root-cause-summary">
        <article>
          <span>主要根因</span>
          <strong>{topCause}</strong>
          <small>{rootCauses[0]?.value || 0} 个缺陷</small>
        </article>
        <article>
          <span>未分类缺陷</span>
          <strong>{unclassified}</strong>
          <small>{bugs.length ? `${Math.round((unclassified / bugs.length) * 100)}% 待补根因` : '无缺陷'}</small>
        </article>
        <article>
          <span>S0/S1 根因项</span>
          <strong>{highRiskByCause.filter((item) => item.highRisk > 0).length}</strong>
          <small>需进入复盘</small>
        </article>
        <article>
          <span>活跃根因项</span>
          <strong>{highRiskByCause.filter((item) => item.active > 0).length}</strong>
          <small>仍有未关闭缺陷</small>
        </article>
      </div>
      <div className="chart-grid">
        <article className="chart-panel">
          <h3>根因分布</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rootCauses}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" name="数量" radius={[6, 6, 0, 0]} fill="#1d4ed8" />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="chart-panel">
          <h3>严重级别分布</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={props.report.charts?.bugSeverity || []} dataKey="value" nameKey="label" innerRadius={56} outerRadius={90} paddingAngle={2}>
                {(props.report.charts?.bugSeverity || []).map((entry, index) => <Cell key={entry.key} fill={chartColors[index % chartColors.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </article>
      </div>
      <DataTable
        headers={['根因', '缺陷数', 'S0/S1', '活跃', '处理建议']}
        emptyText="暂无根因分类"
        rows={highRiskByCause.map((item) => [
          item.label,
          item.value,
          item.highRisk,
          item.active,
          item.highRisk ? '进入发布复盘并补预防动作' : item.active ? '跟进关闭并确认复测' : '沉淀为回归关注项'
        ])}
      />
      <DataTable
        headers={['未分类缺陷', '严重级别', '状态', '发现环境', '发现版本', '操作']}
        emptyText="暂无未分类缺陷"
        rows={bugs
          .filter((bug) => !bug.rootCause?.trim())
          .slice(0, 10)
          .map((bug) => ({
            key: bug.id,
            onOpen: () => props.onOpenEntity?.('bug', bug.id),
            openLabel: `打开缺陷详情：${bug.title}`,
            cells: [
              bug.title,
              <StatusBadge value={bug.severity} dictionaryType="severity" />,
              <StatusBadge value={bug.status} dictionaryType="bugStatus" />,
              bug.environment || '-',
              bug.foundVersion || '-',
              <Button type="button" size="sm" onClick={() => props.onOpenEntity?.('bug', bug.id)}>补根因</Button>
            ]
          }))}
      />
    </section>
  );
}

function AcceptanceScopeDrawer(props: {
  title: string;
  row?: AcceptanceScope;
  open: boolean;
  projectId: string;
  defaultGateRules?: QualityGateRule[];
  iterations: Iteration[];
  requirements: Requirement[];
  plans: TestPlan[];
  bugs: Bug[];
  users: UserProfile[];
  canWrite?: boolean;
  onClose: () => void;
  onSubmit: (body: Partial<AcceptanceScope>) => Promise<void>;
}) {
  return (
    <Drawer title={props.title} subtitle="选择本次交付要验收的需求、测试计划和保留风险。" open={props.open} onClose={props.onClose} size="wide">
      <HookForm
        defaultValues={{
          name: props.row?.name || '',
          description: props.row?.description || '',
          ownerId: props.row?.ownerId || '',
          targetDate: props.row?.targetDate ? props.row.targetDate.slice(0, 10) : '',
          status: props.row?.status || 'draft'
        }}
        onSubmit={async (form) => props.onSubmit({
          projectId: props.projectId,
          name: String(form.get('name') || '').trim(),
          description: String(form.get('description') || '').trim(),
          ownerId: String(form.get('ownerId') || '') || undefined,
          targetDate: String(form.get('targetDate') || '') || undefined,
          status: String(form.get('status') || 'draft') as AcceptanceScope['status'],
          iterationIds: form.getAll('iterationIds').map(String).filter(Boolean),
          requirementIds: form.getAll('requirementIds').map(String).filter(Boolean),
          testPlanIds: form.getAll('testPlanIds').map(String).filter(Boolean),
          bugIds: form.getAll('bugIds').map(String).filter(Boolean),
          qualityGateRules: collectGateRules(form, props.row?.qualityGateRules, props.defaultGateRules)
        })}
      >
        {(register) => (
          <>
            <div className="field-grid">
              <Field className="span-two"><FieldLabel required>范围名称</FieldLabel><Input {...register('name')} required /></Field>
              <Field><FieldLabel hint="用于签核责任归属">负责人</FieldLabel><select {...register('ownerId')}><option value="">当前用户</option>{props.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</select></Field>
              <Field><FieldLabel hint="发布或验收目标日期">目标日期</FieldLabel><Input type="date" {...register('targetDate')} /></Field>
              <Field><FieldLabel required>状态</FieldLabel><select {...register('status')}><option value="draft">草稿</option><option value="reviewing">评审中</option><option value="signed">已签核</option><option value="rejected">已驳回</option><option value="archived">已归档</option></select></Field>
              <Field className="span-four"><FieldLabel hint="说明交付边界、保留风险和回滚策略">交付说明</FieldLabel><Textarea {...register('description')} /></Field>
            </div>
            <div className="scope-picker-grid">
              <MultiPick name="iterationIds" title="迭代" rows={props.iterations.map((item) => ({ id: item.id, label: item.name, detail: labelOf(item.status) }))} selected={props.row?.iterationIds || []} />
              <MultiPick name="requirementIds" title="需求" rows={props.requirements.map((item) => ({ id: item.id, label: item.title, detail: labelOf(item.status) }))} selected={props.row?.requirementIds || []} />
              <MultiPick name="testPlanIds" title="测试计划" rows={props.plans.map((item) => ({ id: item.id, label: item.name, detail: `${item.round} · ${labelOf(item.status)}` }))} selected={props.row?.testPlanIds || []} />
              <MultiPick name="bugIds" title="保留缺陷" rows={props.bugs.filter((bug) => !['verified', 'closed'].includes(bug.status)).map((item) => ({ id: item.id, label: item.title, detail: `${labelOf(item.severity)} · ${labelOf(item.status)}` }))} selected={props.row?.bugIds || []} />
            </div>
            <GateRulePicker rules={props.row?.qualityGateRules} defaultRules={props.defaultGateRules} />
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button>{props.canWrite && <Button variant="primary"><Save size={15} /> 保存范围</Button>}</FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

function GateRulePicker(props: { rules?: QualityGateRule[]; defaultRules?: QualityGateRule[] }) {
  const rules = mergeGateRules(props.rules, props.defaultRules);
  return (
    <section className="gate-rule-picker">
      <div className="section-heading compact">
        <span>质量门禁规则</span>
        <strong>定义本次验收准入项、阈值和阻断等级</strong>
      </div>
      <div>
        {rules.map((rule) => (
          <article key={rule.id}>
            <label className="check-row compact-check-row">
              <input type="checkbox" name="qualityGateRuleIds" value={rule.id} defaultChecked={rule.enabled} />
              <span>{rule.label}</span>
              <small>{rule.description || rule.metric}</small>
            </label>
            <label className="gate-threshold-field">
              <span>允许阈值</span>
              <Input type="number" min={0} name={`qualityGateThreshold_${rule.id}`} defaultValue={rule.threshold ?? 0} aria-label={`${rule.label}允许阈值`} />
            </label>
            <label className="check-row compact-check-row">
              <input type="checkbox" name="qualityGateBlockingIds" value={rule.id} defaultChecked={rule.blocking} />
              <span>作为阻断项</span>
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}

function mergeGateRules(rules?: QualityGateRule[], defaultRules: QualityGateRule[] = DEFAULT_PROJECT_GATE_RULES) {
  const byId = new Map((rules || []).map((rule) => [rule.id, rule]));
  return defaultRules.map((rule) => ({ ...rule, ...byId.get(rule.id) }));
}

function collectGateRules(form: FormData, existing?: QualityGateRule[], defaultRules?: QualityGateRule[]) {
  const enabledIds = new Set(form.getAll('qualityGateRuleIds').map(String));
  const blockingIds = new Set(form.getAll('qualityGateBlockingIds').map(String));
  return mergeGateRules(existing, defaultRules).map((rule) => ({
    ...rule,
    enabled: enabledIds.has(rule.id),
    blocking: blockingIds.has(rule.id),
    threshold: nonNegativeNumber(form.get(`qualityGateThreshold_${rule.id}`), rule.threshold || 0)
  }));
}

function nonNegativeNumber(value: FormDataEntryValue | null, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function MultiPick(props: { name: string; title: string; rows: Array<{ id: string; label: string; detail: string }>; selected: string[] }) {
  const selected = new Set(props.selected);
  return (
    <section className="scope-picker">
      <strong>{props.title}</strong>
      <div>
        {props.rows.length === 0 ? <span className="muted">暂无可选项</span> : props.rows.map((row) => (
          <label key={row.id} className="check-row">
            <input type="checkbox" name={props.name} value={row.id} defaultChecked={selected.has(row.id)} />
            <span>{row.label}</span>
            <small>{row.detail}</small>
          </label>
        ))}
      </div>
    </section>
  );
}

function RiskWaiverDrawer(props: {
  open: boolean;
  scope: AcceptanceScope;
  report: ReportSummary | null;
  onClose: () => void;
  onSubmit: (body: { targetType: string; targetId?: string; reason: string; expiresAt?: string }) => Promise<void>;
}) {
  const risks = props.report?.charts?.riskList || [];
  return (
    <Drawer title="记录风险豁免" subtitle={props.scope.name} open={props.open} onClose={props.onClose} size="compact">
      <HookForm onSubmit={async (form) => props.onSubmit({
        targetType: String(form.get('targetType') || 'quality_gate'),
        targetId: String(form.get('targetId') || '') || undefined,
        reason: String(form.get('reason') || '').trim(),
        expiresAt: String(form.get('expiresAt') || '') || undefined
      })}>
        {(register) => (
          <>
            <Field><FieldLabel>豁免对象</FieldLabel><select {...register('targetId')}><option value="">整体准入风险</option>{risks.map((risk) => <option key={`${risk.type}-${risk.id}`} value={risk.id}>{risk.title} · {risk.reason}</option>)}</select></Field>
            <Field><FieldLabel>对象类型</FieldLabel><select {...register('targetType')}><option value="quality_gate">质量门禁</option><option value="requirement">需求</option><option value="run_item">执行项</option><option value="bug">缺陷</option></select></Field>
            <Field><FieldLabel>豁免到期</FieldLabel><Input type="date" {...register('expiresAt')} /></Field>
            <Field><FieldLabel>豁免原因</FieldLabel><Textarea {...register('reason')} required placeholder="说明保留风险、影响范围、回滚方案或后续责任人" /></Field>
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button><Button variant="primary"><ShieldAlert size={15} /> 记录豁免</Button></FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

function entityTypeOfRisk(type: string) {
  if (type === 'bug') return 'bug';
  if (type === 'execution') return 'run_item';
  return 'requirement';
}

function riskTypeLabel(type: string) {
  if (type === 'bug') return '缺陷';
  if (type === 'requirement') return '需求';
  if (type === 'execution') return '执行';
  return type;
}
