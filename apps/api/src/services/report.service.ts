import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { BugStatus, ReportSummary, RequirementStatus, TestCaseStatus, TestRunStatus } from '@buggy/shared-types';
import { BugEntity } from '../database/bug.schema.js';
import { RequirementEntity } from '../database/requirement.schema.js';
import { TestCaseEntity } from '../database/test-case.schema.js';
import { TestPlanEntity } from '../database/test-plan.schema.js';
import type { ListQueryDto } from '../dto/common.dto.js';

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(RequirementEntity.name) private readonly requirements: Model<RequirementEntity>,
    @InjectModel(TestCaseEntity.name) private readonly cases: Model<TestCaseEntity>,
    @InjectModel(TestPlanEntity.name) private readonly plans: Model<TestPlanEntity>,
    @InjectModel(BugEntity.name) private readonly bugs: Model<BugEntity>
  ) {}

  async summary(query: ListQueryDto): Promise<ReportSummary> {
    const base = this.baseFilter(query);
    const [requirements, cases, plans, bugs] = await Promise.all([
      this.requirements.find(base.requirements),
      this.cases.find(base.cases),
      this.plans.find(base.plans),
      this.bugs.find(base.bugs)
    ]);
    const runItems = plans.flatMap((plan) => plan.runItems);
    const executionTotal = runItems.length;
    const passed = this.countBy(runItems, 'status', 'passed');
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
        active: bugs.filter((bug) => !['verified', 'closed'].includes(bug.status)).length
      }
    };
  }

  async html(query: ListQueryDto): Promise<string> {
    const summary = await this.summary(query);
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
</body>
</html>`;
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

  private countBy<T>(rows: T[], key: string, value: RequirementStatus | TestCaseStatus | TestRunStatus | BugStatus): number {
    return rows.filter((row) => (row as Record<string, unknown>)[key] === value).length;
  }
}
