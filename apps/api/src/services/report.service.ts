import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { BugStatus, Priority, ReportSummary, RequirementStatus, Severity, TestCaseStatus, TestRunStatus } from '@buggy/shared-types';
import { IterationEntity } from '../database/iteration.schema.js';
import { BugEntity } from '../database/bug.schema.js';
import { RequirementEntity } from '../database/requirement.schema.js';
import { TestCaseEntity } from '../database/test-case.schema.js';
import { TestPlanEntity } from '../database/test-plan.schema.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import { idOf } from '../shared/mongo.js';

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(RequirementEntity.name) private readonly requirements: Model<RequirementEntity>,
    @InjectModel(IterationEntity.name) private readonly iterations: Model<IterationEntity>,
    @InjectModel(TestCaseEntity.name) private readonly cases: Model<TestCaseEntity>,
    @InjectModel(TestPlanEntity.name) private readonly plans: Model<TestPlanEntity>,
    @InjectModel(BugEntity.name) private readonly bugs: Model<BugEntity>
  ) {}

  async summary(query: ListQueryDto): Promise<ReportSummary> {
    const projectId = query.projectId ? new Types.ObjectId(query.projectId) : undefined;
    const projectFilter = projectId ? { projectId } : {};
    const [allRequirements, allIterations, allCases, allPlans, allBugs] = await Promise.all([
      this.requirements.find(projectFilter),
      this.iterations.find(projectFilter),
      this.cases.find(projectFilter),
      this.plans.find(projectFilter),
      this.bugs.find(projectFilter)
    ]);

    const requirements = allRequirements.filter((requirement) => {
      if (query.requirementId) return idOf(requirement._id) === query.requirementId;
      if (query.iterationId) return idOf(requirement.iterationId) === query.iterationId;
      return true;
    });
    const scopedRequirementIds = new Set(requirements.map((requirement) => idOf(requirement._id)));
    const cases = allCases.filter((testCase) => {
      if (!query.iterationId && !query.requirementId) return true;
      return testCase.requirementId ? scopedRequirementIds.has(idOf(testCase.requirementId)) : false;
    });
    const runEntries = allPlans.flatMap((plan) => plan.runItems.map((item) => ({ plan, item })));
    const scopedRunEntries = runEntries.filter(({ plan, item }) => {
      const itemRequirementId = item.requirementId ? idOf(item.requirementId) : undefined;
      if (query.requirementId) return itemRequirementId === query.requirementId || idOf(plan.requirementId) === query.requirementId;
      if (query.iterationId) return idOf(plan.iterationId) === query.iterationId || Boolean(itemRequirementId && scopedRequirementIds.has(itemRequirementId));
      return true;
    });
    const runItems = scopedRunEntries.map(({ item }) => item);
    const executionTotal = runItems.length;
    const passed = this.countBy(runItems, 'status', 'passed');
    const now = Date.now();
    const scopedRunBugIds = new Set(runItems.flatMap((item) => item.bugIds.map(idOf)));
    const bugs = allBugs.filter((bug) => {
      if (query.requirementId) return idOf(bug.requirementId) === query.requirementId || scopedRunBugIds.has(idOf(bug._id));
      if (query.iterationId) {
        return (
          idOf(bug.iterationId) === query.iterationId ||
          Boolean(bug.requirementId && scopedRequirementIds.has(idOf(bug.requirementId))) ||
          scopedRunBugIds.has(idOf(bug._id))
        );
      }
      return true;
    });
    const overdueBugs = bugs.filter((bug) => bug.dueAt && bug.dueAt.getTime() < now && !['verified', 'closed'].includes(bug.status));
    const scope = query.requirementId
      ? { type: 'requirement' as const, id: query.requirementId, name: requirements[0]?.title || '未知需求' }
      : query.iterationId
        ? { type: 'iteration' as const, id: query.iterationId, name: allIterations.find((iteration) => idOf(iteration._id) === query.iterationId)?.name || '未知迭代' }
        : { type: 'project' as const, id: query.projectId, name: query.projectId ? '当前项目' : '全部项目' };
    const riskList = [
      ...requirements
        .filter((requirement) => requirement.status === 'blocked' || (requirement.dueDate && requirement.dueDate.getTime() < now && requirement.status !== 'done'))
        .map((requirement) => ({
          id: String(requirement._id),
          type: 'requirement' as const,
          title: requirement.title,
          ownerId: requirement.riskOwnerId ? String(requirement.riskOwnerId) : requirement.ownerId ? String(requirement.ownerId) : undefined,
          dueDate: requirement.dueDate?.toISOString(),
          reason: requirement.status === 'blocked' ? '需求阻塞' : '需求已逾期',
          severity: requirement.status === 'blocked' ? ('high' as const) : ('medium' as const)
        })),
      ...overdueBugs.map((bug) => ({
        id: String(bug._id),
        type: 'bug' as const,
        title: bug.title,
        ownerId: bug.assigneeId ? String(bug.assigneeId) : undefined,
        dueDate: bug.dueAt?.toISOString(),
        reason: 'Bug SLA 已逾期',
        severity: ['S0', 'S1'].includes(bug.severity) ? ('high' as const) : ('medium' as const)
      })),
      ...runItems
        .filter((item) => item.status === 'failed' || item.status === 'blocked')
        .slice(0, 10)
        .map((item) => ({
          id: String(item._id),
          type: 'execution' as const,
          title: item.caseTitle,
          ownerId: item.executorId ? String(item.executorId) : undefined,
          reason: item.status === 'blocked' ? '执行阻塞' : '执行失败',
          severity: item.status === 'blocked' ? ('high' as const) : ('medium' as const)
        }))
    ];
    const trendPlans = allPlans
      .map((plan) => {
        const planId = idOf(plan._id);
        const items = scopedRunEntries.filter((entry) => idOf(entry.plan._id) === planId).map((entry) => entry.item);
        if (items.length === 0 && (query.iterationId || query.requirementId)) return null;
        const total = items.length;
        const passedCount = this.countBy(items, 'status', 'passed');
        return {
          label: `${plan.round || ''}${plan.name ? ` ${plan.name}` : ''}`.trim(),
          total,
          passed: passedCount,
          failed: this.countBy(items, 'status', 'failed'),
          blocked: this.countBy(items, 'status', 'blocked'),
          skipped: this.countBy(items, 'status', 'skipped'),
          passRate: total > 0 ? Math.round((passedCount / total) * 10000) / 100 : 0
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const visibleIterations = query.iterationId ? allIterations.filter((iteration) => idOf(iteration._id) === query.iterationId) : allIterations;
    const gateIssues = [
      cases.length === 0 ? '缺少覆盖用例' : '',
      cases.length > 0 && runItems.length === 0 ? '覆盖用例尚未纳入测试计划' : '',
      this.countBy(runItems, 'status', 'untested') ? `${this.countBy(runItems, 'status', 'untested')} 个执行项未测` : '',
      this.countBy(runItems, 'status', 'failed') ? `${this.countBy(runItems, 'status', 'failed')} 个执行项失败` : '',
      this.countBy(runItems, 'status', 'blocked') ? `${this.countBy(runItems, 'status', 'blocked')} 个执行项阻塞` : '',
      bugs.filter((bug) => !['verified', 'closed'].includes(bug.status) && ['S0', 'S1'].includes(bug.severity)).length
        ? `${bugs.filter((bug) => !['verified', 'closed'].includes(bug.status) && ['S0', 'S1'].includes(bug.severity)).length} 个 S0/S1 活跃 Bug`
        : ''
    ].filter(Boolean);
    const qualityGate = {
      status: gateIssues.length ? ('blocked' as const) : ('pass' as const),
      checkedAt: new Date().toISOString(),
      summary: gateIssues.length ? `暂缓验收：${gateIssues.length} 项准入问题` : '满足验收准入',
      issues: gateIssues
    };
    return {
      projectId: query.projectId,
      iterationId: query.iterationId,
      requirementId: query.requirementId,
      testPlanId: undefined,
      scope,
      requirements: {
        total: requirements.length,
        done: this.countBy(requirements, 'status', 'done'),
        testing: this.countBy(requirements, 'status', 'testing'),
        blocked: this.countBy(requirements, 'status', 'blocked')
      },
      cases: {
        total: cases.length,
        ready: this.countBy(cases, 'status', 'ready'),
        deprecated: this.countBy(cases, 'status', 'deprecated')
      },
      execution: {
        total: executionTotal,
        untested: this.countBy(runItems, 'status', 'untested'),
        passed,
        failed: this.countBy(runItems, 'status', 'failed'),
        blocked: this.countBy(runItems, 'status', 'blocked'),
        skipped: this.countBy(runItems, 'status', 'skipped'),
        passRate: executionTotal > 0 ? Math.round((passed / executionTotal) * 10000) / 100 : 0
      },
      bugs: {
        total: bugs.length,
        open: this.countBy(bugs, 'status', 'open'),
        inProgress: this.countBy(bugs, 'status', 'in_progress'),
        resolved: this.countBy(bugs, 'status', 'resolved'),
        verified: this.countBy(bugs, 'status', 'verified'),
        closed: this.countBy(bugs, 'status', 'closed'),
        reopened: this.countBy(bugs, 'status', 'reopened'),
        active: bugs.filter((bug) => !['verified', 'closed'].includes(bug.status)).length,
        overdue: overdueBugs.length
      },
      qualityGate,
      reportSignoff: query.requirementId ? requirements[0]?.reportSignoff : undefined,
      charts: {
        executionTrend: trendPlans,
        bugStatus: (['open', 'in_progress', 'resolved', 'verified', 'closed', 'reopened'] as BugStatus[]).map((status) => ({
          key: status,
          label: this.labelOf(status),
          value: this.countBy(bugs, 'status', status)
        })),
        bugSeverity: (['S0', 'S1', 'S2', 'S3'] as Severity[]).map((severity) => ({
          key: severity,
          label: this.labelOf(severity),
          value: this.countBy(bugs, 'severity', severity)
        })),
        priority: (['P0', 'P1', 'P2', 'P3'] as Priority[]).map((priority) => ({
          key: priority,
          label: priority,
          value: requirements.filter((item) => item.priority === priority).length + cases.filter((item) => item.priority === priority).length + bugs.filter((item) => item.priority === priority).length
        })),
        iterationRank: visibleIterations.map((iteration) => {
          const id = String(iteration._id);
          const iterationRequirementIds = new Set(allRequirements.filter((item) => idOf(item.iterationId) === id).map((item) => idOf(item._id)));
          const iterationRunItems = runEntries
            .filter(({ plan, item }) => idOf(plan.iterationId) === id || Boolean(item.requirementId && iterationRequirementIds.has(idOf(item.requirementId))))
            .map(({ item }) => item);
          const iterationPassed = this.countBy(iterationRunItems, 'status', 'passed');
          return {
            id,
            name: iteration.name,
            requirements: allRequirements.filter((item) => String(item.iterationId || '') === id).length,
            cases: allCases.filter((item) => item.requirementId && iterationRequirementIds.has(idOf(item.requirementId))).length,
            executionTotal: iterationRunItems.length,
            passRate: iterationRunItems.length > 0 ? Math.round((iterationPassed / iterationRunItems.length) * 10000) / 100 : 0,
            activeBugs: allBugs.filter((bug) => (idOf(bug.iterationId) === id || (bug.requirementId && iterationRequirementIds.has(idOf(bug.requirementId)))) && !['verified', 'closed'].includes(bug.status)).length
          };
        }),
        requirementCoverage: requirements.map((requirement) => {
          const id = String(requirement._id);
          return {
            id,
            title: requirement.title,
            caseCount: cases.filter((item) => String(item.requirementId || '') === id).length,
            bugCount: bugs.filter((item) => String(item.requirementId || '') === id).length,
            status: requirement.status,
            riskOwnerId: requirement.riskOwnerId ? String(requirement.riskOwnerId) : undefined,
            dueDate: requirement.dueDate?.toISOString(),
            riskNote: requirement.riskNote
          };
        }),
        riskList
      },
      details: {
        requirementHistory: requirements.flatMap((requirement) =>
          (requirement.workflowHistory || []).map((item) => ({
            id: String(item.id || new Types.ObjectId()),
            action: String(item.action || 'updated'),
            fromStatus: item.fromStatus,
            toStatus: item.toStatus,
            operatorId: item.operatorId,
            operatorName: item.operatorName,
            note: item.note,
            createdAt: String(item.createdAt || new Date().toISOString())
          }))
        ),
        cases: cases.map((testCase) => ({
          id: idOf(testCase._id),
          title: testCase.title,
          requirementId: testCase.requirementId ? idOf(testCase.requirementId) : undefined,
          priority: testCase.priority,
          status: testCase.status
        })),
        executionItems: scopedRunEntries.map(({ plan, item }) => ({
          id: idOf(item._id),
          planId: idOf(plan._id),
          planName: plan.name,
          round: plan.round,
          caseId: idOf(item.caseId),
          caseTitle: item.caseTitle,
          requirementId: item.requirementId ? idOf(item.requirementId) : undefined,
          status: item.status,
          actualResult: item.actualResult,
          executorId: item.executorId ? idOf(item.executorId) : undefined,
          executedAt: item.executedAt?.toISOString(),
          bugIds: item.bugIds.map(idOf)
        })),
        bugs: bugs.map((bug) => ({
          id: idOf(bug._id),
          title: bug.title,
          requirementId: bug.requirementId ? idOf(bug.requirementId) : undefined,
          testPlanId: bug.testPlanId ? idOf(bug.testPlanId) : undefined,
          runItemId: bug.runItemId ? idOf(bug.runItemId) : undefined,
          severity: bug.severity,
          priority: bug.priority,
          status: bug.status,
          assigneeId: bug.assigneeId ? idOf(bug.assigneeId) : undefined,
          dueAt: bug.dueAt?.toISOString()
        }))
      }
    };
  }

  async html(query: ListQueryDto): Promise<string> {
    const summary = await this.summary(query);
    const title = this.reportTitle(summary);
    const coverageRows = (summary.charts?.requirementCoverage || [])
      .map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${this.labelOf(item.status)}</td><td>${item.caseCount}</td><td>${item.bugCount}</td></tr>`)
      .join('');
    const executionRows = (summary.details?.executionItems || [])
      .map((item) => `<tr><td>${escapeHtml(item.round)} ${escapeHtml(item.planName)}</td><td>${escapeHtml(item.caseTitle)}</td><td>${this.labelOf(item.status)}</td><td>${escapeHtml(item.actualResult || '-')}</td></tr>`)
      .join('');
    const bugRows = (summary.details?.bugs || [])
      .map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${this.labelOf(item.severity)}</td><td>${this.labelOf(item.status)}</td><td>${item.dueAt ? item.dueAt.slice(0, 10) : '-'}</td></tr>`)
      .join('');
    const historyRows = (summary.details?.requirementHistory || [])
      .map((item) => `<tr><td>${escapeHtml(this.workflowLabel(item.action))}</td><td>${escapeHtml(item.fromStatus || '-')} -> ${escapeHtml(item.toStatus || '-')}</td><td>${escapeHtml(item.operatorName || '系统')}</td><td>${escapeHtml(item.note || '-')}</td><td>${escapeHtml(new Date(item.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}</td></tr>`)
      .join('');
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 40px; color: #172033; }
    h1 { margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 24px 0; }
    .card { border: 1px solid #d7dde8; border-radius: 8px; padding: 16px; }
    .num { font-size: 32px; font-weight: 700; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { border: 1px solid #d7dde8; padding: 10px; text-align: left; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>范围：${escapeHtml(summary.scope.name)}</p>
  <p>生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
  <p>验收准入：${escapeHtml(summary.qualityGate?.summary || '未检查')}${summary.qualityGate?.issues.length ? `（${summary.qualityGate.issues.map(escapeHtml).join('；')}）` : ''}</p>
  <p>报告签核：${escapeHtml(this.reportSignoffLabel(summary.reportSignoff?.status))}${summary.reportSignoff?.signerName ? ` / ${escapeHtml(summary.reportSignoff.signerName)}` : ''}${summary.reportSignoff?.note ? ` / ${escapeHtml(summary.reportSignoff.note)}` : ''}</p>
  <div class="grid">
    <div class="card">需求总数<div class="num">${summary.requirements.total}</div></div>
    <div class="card">用例总数<div class="num">${summary.cases.total}</div></div>
    <div class="card">执行通过率<div class="num">${summary.execution.passRate}%</div></div>
    <div class="card">活跃 Bug<div class="num">${summary.bugs.active}</div></div>
  </div>
  <table>
    <tr><th>模块</th><th>指标</th><th>数量</th></tr>
    <tr><td>执行</td><td>通过 / 失败 / 阻塞 / 跳过 / 未测</td><td>${summary.execution.passed} / ${summary.execution.failed} / ${summary.execution.blocked} / ${summary.execution.skipped} / ${summary.execution.untested}</td></tr>
    <tr><td>Bug</td><td>新建 / 处理中 / 已解决 / 已验证 / 已关闭 / 重开</td><td>${summary.bugs.open} / ${summary.bugs.inProgress} / ${summary.bugs.resolved} / ${summary.bugs.verified} / ${summary.bugs.closed} / ${summary.bugs.reopened}</td></tr>
    <tr><td>需求</td><td>测试中 / 已完成 / 阻塞</td><td>${summary.requirements.testing} / ${summary.requirements.done} / ${summary.requirements.blocked}</td></tr>
  </table>
  <h2>需求覆盖与风险</h2>
  <table>
    <tr><th>需求</th><th>状态</th><th>用例覆盖</th><th>关联 Bug</th></tr>
    ${coverageRows || '<tr><td colspan="4">暂无需求覆盖数据</td></tr>'}
  </table>
  <h2>风险清单</h2>
  <table>
    <tr><th>类型</th><th>事项</th><th>原因</th><th>截止时间</th></tr>
    ${(summary.charts?.riskList || []).map((item) => `<tr><td>${item.type}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.reason)}</td><td>${item.dueDate ? item.dueDate.slice(0, 10) : '-'}</td></tr>`).join('') || '<tr><td colspan="4">暂无风险</td></tr>'}
  </table>
  <h2>验收审批历史</h2>
  <table>
    <tr><th>动作</th><th>状态变化</th><th>操作人</th><th>说明</th><th>时间</th></tr>
    ${historyRows || '<tr><td colspan="5">暂无验收审批历史</td></tr>'}
  </table>
  <h2>执行明细</h2>
  <table>
    <tr><th>计划</th><th>用例</th><th>状态</th><th>实际结果</th></tr>
    ${executionRows || '<tr><td colspan="4">暂无执行明细</td></tr>'}
  </table>
  <h2>关联 Bug</h2>
  <table>
    <tr><th>Bug</th><th>严重级别</th><th>状态</th><th>截止时间</th></tr>
    ${bugRows || '<tr><td colspan="4">暂无关联 Bug</td></tr>'}
  </table>
</body>
</html>`;
  }

  async pdf(query: ListQueryDto): Promise<Buffer> {
    const summary = await this.summary(query);
    const title = this.reportTitle(summary);
    const lines = [
      `Buggy ${title}`,
      `范围：${summary.scope.name}`,
      `生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
      `需求：${summary.requirements.total}，完成：${summary.requirements.done}，阻塞：${summary.requirements.blocked}`,
      `用例：${summary.cases.total}，可执行：${summary.cases.ready}`,
      `执行通过率：${summary.execution.passRate}% (${summary.execution.passed}/${summary.execution.total})`,
      `活跃 Bug：${summary.bugs.active}，逾期 Bug：${summary.bugs.overdue}`,
      `验收准入：${summary.qualityGate?.summary || '未检查'}`,
      `报告签核：${this.reportSignoffLabel(summary.reportSignoff?.status)}${summary.reportSignoff?.signerName ? ` / ${summary.reportSignoff.signerName}` : ''}`,
      '',
      '风险清单：',
      ...(summary.charts?.riskList || []).map((item) => `${item.type} | ${item.title} | ${item.reason}`)
    ];
    return createSimplePdf(lines);
  }

  private reportTitle(summary: ReportSummary) {
    if (summary.scope.type === 'requirement') return '需求验收报告';
    if (summary.scope.type === 'iteration') return '迭代质量报告';
    return '项目质量概览';
  }

  private countBy<T>(rows: T[], key: string, value: RequirementStatus | TestCaseStatus | TestRunStatus | BugStatus | Severity | Priority): number {
    return rows.filter((row) => (row as Record<string, unknown>)[key] === value).length;
  }

  private labelOf(value: string) {
    const labels: Record<string, string> = {
      open: '新建',
      in_progress: '处理中',
      resolved: '已解决',
      verified: '已验证',
      closed: '已关闭',
      reopened: '重新打开',
      draft: '草稿',
      ready: '待测试',
      testing: '测试中',
      done: '已完成',
      blocked: '阻塞',
      not_ready: '未就绪',
      approved: '已通过',
      rejected: '已驳回',
      untested: '未测',
      passed: '通过',
      failed: '失败',
      skipped: '跳过',
      S0: 'S0 致命',
      S1: 'S1 严重',
      S2: 'S2 一般',
      S3: 'S3 轻微'
    };
    return labels[value] || value;
  }

  private workflowLabel(action: string) {
    if (action === 'acceptance_changed') return '验收状态变更';
    if (action === 'status_changed') return '需求状态变更';
    if (action === 'created') return '创建';
    return action;
  }

  private reportSignoffLabel(status?: string) {
    if (status === 'signed') return '已签核';
    if (status === 'rejected') return '已驳回';
    if (status === 'pending') return '待签核';
    return '未签核';
  }
}

function createSimplePdf(lines: string[]) {
  const escaped = lines.map((line) => line.replace(/[\\()]/g, '\\$&'));
  const content = ['BT', '/F1 14 Tf', '56 780 Td', '18 TL', ...escaped.map((line, index) => `${index === 0 ? '' : 'T*'} (${line}) Tj`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(chunks.join('')));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(''));
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`));
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.from(chunks.join(''));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[char] || char;
  });
}
