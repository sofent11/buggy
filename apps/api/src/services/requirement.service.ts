import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { PageResult, QualityGateResult, Requirement } from '@buggy/shared-types';
import { BugEntity } from '../database/bug.schema.js';
import { RequirementEntity } from '../database/requirement.schema.js';
import { TestCaseEntity } from '../database/test-case.schema.js';
import { TestPlanEntity } from '../database/test-plan.schema.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import type { BindLarkDto, CreateRequirementDto, UpdateRequirementDto } from '../dto/requirement.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';
import { ActivityService } from './activity.service.js';
import type { SessionUser } from './auth.service.js';
import { NotificationService } from './notification.service.js';

@Injectable()
export class RequirementService {
  constructor(
    @InjectModel(RequirementEntity.name) private readonly requirements: Model<RequirementEntity>,
    @InjectModel(TestCaseEntity.name) private readonly cases: Model<TestCaseEntity>,
    @InjectModel(TestPlanEntity.name) private readonly plans: Model<TestPlanEntity>,
    @InjectModel(BugEntity.name) private readonly bugs: Model<BugEntity>,
    private readonly activities: ActivityService,
    private readonly notifications: NotificationService
  ) {}

  async list(query: ListQueryDto): Promise<PageResult<Requirement>> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.iterationId) filter.iterationId = new Types.ObjectId(query.iterationId);
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.ownerId) filter.ownerId = new Types.ObjectId(query.ownerId);
    if (query.keyword) {
      filter.$or = [
        { title: { $regex: query.keyword, $options: 'i' } },
        { description: { $regex: query.keyword, $options: 'i' } },
        { tags: { $regex: query.keyword, $options: 'i' } }
      ];
    }
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const sort = this.sortOf(query.sortBy, query.sortOrder);
    const [total, rows] = await Promise.all([
      this.requirements.countDocuments(filter),
      this.requirements.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return { total, page, pageSize, items: rows.map((row) => this.toDto(row)) };
  }

  async create(dto: CreateRequirementDto, user?: SessionUser): Promise<Requirement> {
    const row = await this.requirements.create({
      projectId: new Types.ObjectId(dto.projectId),
      iterationId: toObjectId(dto.iterationId),
      title: dto.title,
      description: dto.description || '',
      ownerId: toObjectId(dto.ownerId),
      riskOwnerId: toObjectId(dto.riskOwnerId),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      riskNote: dto.riskNote || '',
      status: dto.status || 'ready',
      priority: dto.priority || 'P2',
      acceptanceStatus: dto.acceptanceStatus || 'not_ready',
      reviewerId: toObjectId(dto.reviewerId),
      larkWebhook: dto.larkWebhook || '',
      tags: dto.tags || [],
      workflowHistory: [this.workflowEntry('created', undefined, dto.status || 'ready', user, '创建需求')]
    });
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'requirement',
      entityId: idOf(row._id),
      action: 'created',
      title: `创建需求：${row.title}`,
      actor: user
    });
    await this.notifyRiskOwner(row, user);
    return this.toDto(row);
  }

  async get(id: string): Promise<Requirement> {
    const row = await this.requirements.findById(id);
    if (!row) throw new NotFoundException('需求不存在');
    return this.toDto(row);
  }

  async update(id: string, dto: UpdateRequirementDto, user?: SessionUser): Promise<Requirement> {
    if (dto.status === 'done' || dto.acceptanceStatus === 'approved') {
      const gate = await this.qualityGate(id);
      if (gate.status !== 'pass') {
        throw new BadRequestException(`需求未满足验收准入：${gate.issues.join('；')}`);
      }
    }
    const previous = await this.requirements.findById(id);
    if (!previous) throw new NotFoundException('需求不存在');
    const previousStatus = previous.status;
    const previousAcceptance = previous.acceptanceStatus;
    const row = await this.requirements.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(dto.iterationId !== undefined ? { iterationId: toObjectId(dto.iterationId) } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.ownerId !== undefined ? { ownerId: toObjectId(dto.ownerId) } : {}),
          ...(dto.riskOwnerId !== undefined ? { riskOwnerId: toObjectId(dto.riskOwnerId) } : {}),
          ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined } : {}),
          ...(dto.riskNote !== undefined ? { riskNote: dto.riskNote } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.acceptanceStatus !== undefined ? { acceptanceStatus: dto.acceptanceStatus } : {}),
          ...(dto.reviewerId !== undefined ? { reviewerId: toObjectId(dto.reviewerId) } : {}),
          ...(dto.larkWebhook !== undefined ? { larkWebhook: dto.larkWebhook } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
          ...(dto.reportSignoffStatus !== undefined ? {
            reportSignoff: {
              status: dto.reportSignoffStatus,
              signerId: user?.id,
              signerName: user?.username,
              note: dto.reportSignoffNote || '',
              signedAt: new Date().toISOString()
            }
          } : {})
        }
      },
      { new: true }
    );
    if (!row) throw new NotFoundException('需求不存在');
    row.qualityGateResult = await this.qualityGate(id);
    const history: Array<{ id: string; action: string; fromStatus?: string; toStatus?: string; operatorId?: string; operatorName?: string; note?: string; createdAt: string }> = [];
    if (dto.status && dto.status !== previousStatus) {
      history.push(this.workflowEntry('status_changed', previousStatus, dto.status, user, dto.statusReason || dto.riskNote || dto.description || '状态更新'));
    }
    if (dto.acceptanceStatus && dto.acceptanceStatus !== previousAcceptance) {
      history.push(this.workflowEntry('acceptance_changed', previousAcceptance, dto.acceptanceStatus, user, dto.acceptanceReason || dto.statusReason || dto.riskNote || '验收状态更新'));
    }
    if (dto.reportSignoffStatus !== undefined) {
      history.push(this.workflowEntry('report_signoff', previous.reportSignoff?.status, dto.reportSignoffStatus, user, dto.reportSignoffNote || '报告签核'));
    }
    if (history.length) row.workflowHistory = [...(row.workflowHistory || []), ...history];
    await row.save();
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'requirement',
      entityId: id,
      action: dto.status ? 'status_changed' : 'updated',
      title: `更新需求：${row.title}`,
      actor: user
    });
    await this.notifyRiskOwner(row, user);
    return this.toDto(row);
  }

  async bindLark(id: string, dto: BindLarkDto, user?: SessionUser): Promise<Requirement> {
    const row = await this.requirements.findByIdAndUpdate(id, { $set: { larkWebhook: dto.larkWebhook } }, { new: true });
    if (!row) throw new NotFoundException('需求不存在');
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'requirement',
      entityId: id,
      action: 'updated',
      title: `绑定 Lark 日报：${row.title}`,
      actor: user
    });
    return this.toDto(row);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const [caseCount, planCount, bugCount] = await Promise.all([
      this.cases.countDocuments({ requirementId: new Types.ObjectId(id) }),
      this.plans.countDocuments({ requirementId: new Types.ObjectId(id) }),
      this.bugs.countDocuments({ requirementId: new Types.ObjectId(id) })
    ]);
    const blockers = [
      caseCount ? `${caseCount} 条用例` : '',
      planCount ? `${planCount} 个测试计划` : '',
      bugCount ? `${bugCount} 个 Bug` : ''
    ].filter(Boolean);
    if (blockers.length) throw new BadRequestException(`需求仍有关联数据，请先迁移或清理：${blockers.join('、')}`);
    await this.requirements.findByIdAndDelete(id);
    return { deleted: true };
  }

  async projectIdOf(id: string): Promise<string> {
    const row = await this.requirements.findById(id).select('projectId');
    if (!row) throw new NotFoundException('需求不存在');
    return idOf(row.projectId);
  }

  toDto(row: RequirementEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }): Requirement {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      iterationId: row.iterationId ? idOf(row.iterationId) : undefined,
      title: row.title,
      description: row.description,
      ownerId: row.ownerId ? idOf(row.ownerId) : undefined,
      riskOwnerId: row.riskOwnerId ? idOf(row.riskOwnerId) : undefined,
      dueDate: row.dueDate?.toISOString(),
      riskNote: row.riskNote,
      status: row.status,
      priority: row.priority,
      acceptanceStatus: row.acceptanceStatus || 'not_ready',
      qualityGateResult: row.qualityGateResult,
      reviewerId: row.reviewerId ? idOf(row.reviewerId) : undefined,
      larkWebhook: row.larkWebhook,
      tags: row.tags,
      workflowHistory: this.normalizeWorkflow(row.workflowHistory || []),
      reportSignoff: row.reportSignoff,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString()
    };
  }

  private workflowEntry(action: string, fromStatus?: string, toStatus?: string, user?: SessionUser, note?: string) {
    return {
      id: new Types.ObjectId().toString(),
      action,
      fromStatus,
      toStatus,
      operatorId: user?.id,
      operatorName: user?.username,
      note,
      createdAt: new Date().toISOString()
    };
  }

  private normalizeWorkflow(rows: Array<{ id?: string; action?: string; fromStatus?: string; toStatus?: string; operatorId?: string; operatorName?: string; note?: string; createdAt?: string }>) {
    return rows
      .map((row) => ({
        id: String(row.id || new Types.ObjectId()),
        action: String(row.action || 'updated'),
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        operatorId: row.operatorId,
        operatorName: row.operatorName,
        note: row.note,
        createdAt: String(row.createdAt || new Date().toISOString())
      }))
      .filter((row) => row.action);
  }

  private sortOf(sortBy?: string, sortOrder?: 'asc' | 'desc'): Record<string, 1 | -1> {
    const allowed = new Set(['title', 'status', 'priority', 'createdAt', 'updatedAt']);
    if (!sortBy || !allowed.has(sortBy)) return { updatedAt: -1 };
    return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
  }

  private async notifyRiskOwner(row: RequirementEntity & { _id: unknown }, user?: SessionUser) {
    if (!row.riskOwnerId) return;
    await this.notifications.create({
      userId: idOf(row.riskOwnerId),
      projectId: idOf(row.projectId),
      title: `需求风险待跟进：${row.title}`,
      body: row.riskNote || '该需求设置了风险负责人或截止时间，请及时跟进。',
      entityType: 'requirement',
      entityId: idOf(row._id),
      actorId: user?.id
    });
  }

  private async qualityGate(id: string): Promise<QualityGateResult> {
    const requirementId = new Types.ObjectId(id);
    const [cases, plans, bugs] = await Promise.all([
      this.cases.find({ requirementId }),
      this.plans.find({ $or: [{ requirementId }, { 'runItems.requirementId': requirementId }] }),
      this.bugs.find({ requirementId, status: { $nin: ['verified', 'closed'] } })
    ]);
    const caseIds = new Set(cases.map((testCase) => idOf(testCase._id)));
    const runItems = plans.flatMap((plan) => plan.runItems.filter((item) => caseIds.has(idOf(item.caseId)) || idOf(item.requirementId) === id));
    const issues: string[] = [];
    if (cases.length === 0) issues.push('缺少覆盖用例');
    if (cases.length > 0 && runItems.length === 0) issues.push('覆盖用例尚未纳入测试计划');
    const unfinished = runItems.filter((item) => item.status === 'untested').length;
    const failed = runItems.filter((item) => item.status === 'failed').length;
    const blocked = runItems.filter((item) => item.status === 'blocked').length;
    if (unfinished) issues.push(`${unfinished} 个执行项未测`);
    if (failed) issues.push(`${failed} 个执行项失败`);
    if (blocked) issues.push(`${blocked} 个执行项阻塞`);
    const severeActive = bugs.filter((bug) => ['S0', 'S1'].includes(bug.severity)).length;
    if (severeActive) issues.push(`${severeActive} 个 S0/S1 活跃 Bug`);
    return {
      status: issues.length ? 'blocked' : 'pass',
      checkedAt: new Date().toISOString(),
      summary: issues.length ? `暂缓验收：${issues.length} 项准入问题` : '满足验收准入',
      issues
    };
  }
}
