import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, MoreHorizontal, Plus, Save, ShieldAlert, XCircle } from 'lucide-react';
import type { AcceptanceScope, Bug, Iteration, QualityGateRule, ReportSummary, Requirement, TestPlan, UserProfile } from '@buggy/shared-types';
import { api, downloadUrl } from '../../api.js';
import { Button } from '../ui/button.js';
import { Field, FieldLabel, FormActions } from '../ui/form.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';
import { labelOf } from '../../labels.js';
import { DataPage, DataTable, DangerButton, Drawer, EmptyState, HookForm, MetricCard, StatusBadge, TextConfirmDialog, Toolbar } from './common.js';

type OpenEntity = (entityType: string, entityId?: string) => void;

const DEFAULT_GATE_RULES: QualityGateRule[] = [
  { id: 'case_coverage', label: '必须存在覆盖用例', metric: 'case_coverage', enabled: true, blocking: true, description: '验收范围内至少有一条可追踪用例' },
  { id: 'plan_coverage', label: '用例必须纳入测试计划', metric: 'plan_coverage', enabled: true, blocking: true, description: '覆盖用例需要进入本次执行范围' },
  { id: 'untested_runs', label: '不允许未测执行项', metric: 'untested_runs', enabled: true, blocking: true },
  { id: 'failed_runs', label: '不允许失败执行项', metric: 'failed_runs', enabled: true, blocking: true },
  { id: 'blocked_runs', label: '不允许阻塞执行项', metric: 'blocked_runs', enabled: true, blocking: true },
  { id: 'active_s01_bugs', label: '不允许 S0/S1 活跃缺陷', metric: 'active_s01_bugs', enabled: true, blocking: true }
];

export function ReportSection(props: {
  projectId: string;
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
          <MetricCard label="活跃 Bug" value={report?.bugs.active || 0} detail={`${report?.bugs.overdue || 0} 个逾期`} tone={report?.bugs.active ? 'risk' : 'good'} />
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
              `${scope.requirementIds.length} 需求 · ${scope.testPlanIds.length} 计划 · ${scope.bugIds.length} 保留 Bug`,
              scope.targetDate ? scope.targetDate.slice(0, 10) : '-',
              scope.reportSignoff?.status ? labelOf(scope.reportSignoff.status) : '未签核',
              <div className="row-actions">
                <Button type="button" size="sm" onClick={() => setSelectedId(scope.id)}>查看报告</Button>
                <Button type="button" size="sm" onClick={() => setEditing(scope)}>编辑</Button>
                {props.canManage && (
                  <details className="row-more-menu">
                    <summary aria-label={`更多操作：${scope.name}`}>
                      <MoreHorizontal size={15} />
                    </summary>
                    <div>
                      <DangerButton title={`删除验收范围「${scope.name}」？`} onConfirm={() => props.mutate(() => api.deleteAcceptanceScope(scope.id), '验收范围已删除')} />
                    </div>
                  </details>
                )}
              </div>
            ])}
          />
          {props.scopes.length === 0 && (
            <EmptyState
              text="还没有验收范围"
              detail="为一次发布或交付选择需求、测试计划和保留 Bug 后，报告页会给出准入结论和签核记录。"
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
        </section>
      </div>

      <AcceptanceScopeDrawer
        title="新建验收范围"
        open={creating}
        projectId={props.projectId}
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
      <div className="report-risk-links">
        {blockers.length === 0 ? <span>没有准入阻塞项</span> : blockers.map((item) => <b key={item}>{item}</b>)}
        {waived.map((item) => <em key={item}>已豁免：{item}</em>)}
      </div>
      <div className="gate-rule-strip" aria-label="质量门禁规则">
        {(props.report.qualityGate?.rules || DEFAULT_GATE_RULES).map((rule) => (
          <span key={rule.id} className={rule.enabled ? 'is-enabled' : 'is-disabled'}>
            {rule.label}{rule.blocking ? ' · 阻断' : ' · 提醒'}
          </span>
        ))}
      </div>
      <DataTable
        headers={['风险类型', '对象', '原因', '下一步']}
        emptyText="暂无风险"
        rows={riskRows.slice(0, 8).map((item) => [
          riskTypeLabel(item.type),
          item.title,
          item.reason,
          <Button type="button" size="sm" onClick={() => props.onOpenEntity?.(entityTypeOfRisk(item.type), item.id)}>定位处理</Button>
        ])}
      />
      <DataTable
        headers={['根因分类', '数量']}
        emptyText="暂无根因分类"
        rows={rootCauses.map((item) => [item.label, item.value])}
      />
    </section>
  );
}

function AcceptanceScopeDrawer(props: {
  title: string;
  row?: AcceptanceScope;
  open: boolean;
  projectId: string;
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
          qualityGateRules: collectGateRules(form, props.row?.qualityGateRules)
        })}
      >
        {(register) => (
          <>
            <div className="field-grid">
              <Field className="span-two"><FieldLabel>范围名称</FieldLabel><Input {...register('name')} required /></Field>
              <Field><FieldLabel>负责人</FieldLabel><select {...register('ownerId')}><option value="">当前用户</option>{props.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</select></Field>
              <Field><FieldLabel>目标日期</FieldLabel><Input type="date" {...register('targetDate')} /></Field>
              <Field><FieldLabel>状态</FieldLabel><select {...register('status')}><option value="draft">草稿</option><option value="reviewing">评审中</option><option value="signed">已签核</option><option value="rejected">已驳回</option><option value="archived">已归档</option></select></Field>
              <Field className="span-four"><FieldLabel>交付说明</FieldLabel><Textarea {...register('description')} /></Field>
            </div>
            <div className="scope-picker-grid">
              <MultiPick name="iterationIds" title="迭代" rows={props.iterations.map((item) => ({ id: item.id, label: item.name, detail: labelOf(item.status) }))} selected={props.row?.iterationIds || []} />
              <MultiPick name="requirementIds" title="需求" rows={props.requirements.map((item) => ({ id: item.id, label: item.title, detail: labelOf(item.status) }))} selected={props.row?.requirementIds || []} />
              <MultiPick name="testPlanIds" title="测试计划" rows={props.plans.map((item) => ({ id: item.id, label: item.name, detail: `${item.round} · ${labelOf(item.status)}` }))} selected={props.row?.testPlanIds || []} />
              <MultiPick name="bugIds" title="保留 Bug" rows={props.bugs.filter((bug) => !['verified', 'closed'].includes(bug.status)).map((item) => ({ id: item.id, label: item.title, detail: `${labelOf(item.severity)} · ${labelOf(item.status)}` }))} selected={props.row?.bugIds || []} />
            </div>
            <GateRulePicker rules={props.row?.qualityGateRules} />
            <FormActions><Button type="button" onClick={props.onClose}>取消</Button>{props.canWrite && <Button variant="primary"><Save size={15} /> 保存范围</Button>}</FormActions>
          </>
        )}
      </HookForm>
    </Drawer>
  );
}

function GateRulePicker(props: { rules?: QualityGateRule[] }) {
  const rules = mergeGateRules(props.rules);
  return (
    <section className="gate-rule-picker">
      <div className="section-heading compact">
        <span>质量门禁规则</span>
        <strong>定义本次验收准入项和阻断等级</strong>
      </div>
      <div>
        {rules.map((rule) => (
          <article key={rule.id}>
            <label className="check-row compact-check-row">
              <input type="checkbox" name="qualityGateRuleIds" value={rule.id} defaultChecked={rule.enabled} />
              <span>{rule.label}</span>
              <small>{rule.description || rule.metric}</small>
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

function mergeGateRules(rules?: QualityGateRule[]) {
  const byId = new Map((rules || []).map((rule) => [rule.id, rule]));
  return DEFAULT_GATE_RULES.map((rule) => ({ ...rule, ...byId.get(rule.id) }));
}

function collectGateRules(form: FormData, existing?: QualityGateRule[]) {
  const enabledIds = new Set(form.getAll('qualityGateRuleIds').map(String));
  const blockingIds = new Set(form.getAll('qualityGateBlockingIds').map(String));
  return mergeGateRules(existing).map((rule) => ({
    ...rule,
    enabled: enabledIds.has(rule.id),
    blocking: blockingIds.has(rule.id)
  }));
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
            <Field><FieldLabel>对象类型</FieldLabel><select {...register('targetType')}><option value="quality_gate">质量门禁</option><option value="requirement">需求</option><option value="run_item">执行项</option><option value="bug">Bug</option></select></Field>
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
