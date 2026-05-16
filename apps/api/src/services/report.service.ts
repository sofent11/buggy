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
    const base = this.baseFilter(query);
    const [requirements, iterations, cases, plans, bugs] = await Promise.all([
      this.requirements.find(base.requirements),
      this.iterations.find(base.iterations),
      this.cases.find(base.cases),
      this.plans.find(base.plans),
      this.bugs.find(base.bugs)
    ]);
    const runItems = plans.flatMap((plan) => plan.runItems);
    const executionTotal = runItems.length;
    const passed = this.countBy(runItems, 'status', 'passed');
    const now = Date.now();
    const overdueBugs = bugs.filter((bug) => bug.dueAt && bug.dueAt.getTime() < now && !['verified', 'closed'].includes(bug.status));
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
    return {
      projectId: query.projectId,
      iterationId: query.iterationId,
      requirementId: query.requirementId,
      testPlanId: undefined,
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
      charts: {
        executionTrend: plans.map((plan) => {
          const total = plan.runItems.length;
          const passedCount = this.countBy(plan.runItems, 'status', 'passed');
          return {
            label: `${plan.round || ''}${plan.name ? ` ${plan.name}` : ''}`.trim(),
            total,
            passed: passedCount,
            failed: this.countBy(plan.runItems, 'status', 'failed'),
            blocked: this.countBy(plan.runItems, 'status', 'blocked'),
            skipped: this.countBy(plan.runItems, 'status', 'skipped'),
            passRate: total > 0 ? Math.round((passedCount / total) * 10000) / 100 : 0
          };
        }),
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
        iterationRank: iterations.map((iteration) => {
          const id = String(iteration._id);
          const iterationPlans = plans.filter((plan) => String(plan.iterationId || '') === id);
          const iterationRunItems = iterationPlans.flatMap((plan) => plan.runItems);
          const iterationPassed = this.countBy(iterationRunItems, 'status', 'passed');
          return {
            id,
            name: iteration.name,
            requirements: requirements.filter((item) => String(item.iterationId || '') === id).length,
            cases: cases.filter((item) => requirements.some((requirement) => String(requirement._id) === String(item.requirementId || '') && String(requirement.iterationId || '') === id)).length,
            executionTotal: iterationRunItems.length,
            passRate: iterationRunItems.length > 0 ? Math.round((iterationPassed / iterationRunItems.length) * 10000) / 100 : 0,
            activeBugs: bugs.filter((bug) => String(bug.iterationId || '') === id && !['verified', 'closed'].includes(bug.status)).length
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
      }
    };
  }

  async html(query: ListQueryDto): Promise<string> {
    const summary = await this.summary(query);
    const coverageRows = (summary.charts?.requirementCoverage || [])
      .map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${this.labelOf(item.status)}</td><td>${item.caseCount}</td><td>${item.bugCount}</td></tr>`)
      .join('');
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>测试报告</title>
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
  <h1>测试报告</h1>
  <p>生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
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
</body>
</html>`;
  }

  async pdf(query: ListQueryDto): Promise<Buffer> {
    const summary = await this.summary(query);
    const lines = [
      'Buggy 测试报告',
      `生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
      `需求：${summary.requirements.total}，完成：${summary.requirements.done}，阻塞：${summary.requirements.blocked}`,
      `用例：${summary.cases.total}，可执行：${summary.cases.ready}`,
      `执行通过率：${summary.execution.passRate}% (${summary.execution.passed}/${summary.execution.total})`,
      `活跃 Bug：${summary.bugs.active}，逾期 Bug：${summary.bugs.overdue}`,
      '',
      '风险清单：',
      ...(summary.charts?.riskList || []).map((item) => `${item.type} | ${item.title} | ${item.reason}`)
    ];
    return createSimplePdf(lines);
  }

  private baseFilter(query: ListQueryDto) {
    const projectId = query.projectId ? new Types.ObjectId(query.projectId) : undefined;
    const iterationId = query.iterationId ? new Types.ObjectId(query.iterationId) : undefined;
    const requirementId = query.requirementId ? new Types.ObjectId(query.requirementId) : undefined;
    return {
      requirements: {
        ...(projectId ? { projectId } : {}),
        ...(iterationId ? { iterationId } : {}),
        ...(requirementId ? { _id: requirementId } : {})
      },
      iterations: {
        ...(projectId ? { projectId } : {}),
        ...(iterationId ? { _id: iterationId } : {})
      },
      cases: {
        ...(projectId ? { projectId } : {}),
        ...(requirementId ? { requirementId } : {})
      },
      plans: {
        ...(projectId ? { projectId } : {}),
        ...(iterationId ? { iterationId } : {}),
        ...(requirementId ? { requirementId } : {})
      },
      bugs: {
        ...(projectId ? { projectId } : {}),
        ...(iterationId ? { iterationId } : {}),
        ...(requirementId ? { requirementId } : {})
      }
    };
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
      S0: 'S0 致命',
      S1: 'S1 严重',
      S2: 'S2 一般',
      S3: 'S3 轻微'
    };
    return labels[value] || value;
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
