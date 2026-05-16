import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { PageResult, TestCase, TestCaseStep } from '@buggy/shared-types';
import { BugEntity } from '../database/bug.schema.js';
import { TestCaseEntity } from '../database/test-case.schema.js';
import { TestPlanEntity } from '../database/test-plan.schema.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import type { CreateTestCaseDto, UpdateTestCaseDto } from '../dto/test-case.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';
import { ActivityService } from './activity.service.js';
import type { SessionUser } from './auth.service.js';

@Injectable()
export class TestCaseService {
  constructor(
    @InjectModel(TestCaseEntity.name) private readonly cases: Model<TestCaseEntity>,
    @InjectModel(TestPlanEntity.name) private readonly plans: Model<TestPlanEntity>,
    @InjectModel(BugEntity.name) private readonly bugs: Model<BugEntity>,
    private readonly activities: ActivityService
  ) {}

  async list(query: ListQueryDto): Promise<PageResult<TestCase>> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.requirementId) filter.requirementId = new Types.ObjectId(query.requirementId);
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.reviewStatus) filter.reviewStatus = query.reviewStatus;
    if (query.automationStatus) filter.automationStatus = query.automationStatus;
    if (query.ownerId) filter.ownerId = new Types.ObjectId(query.ownerId);
    if (query.keyword) {
      filter.$or = [
        { title: { $regex: query.keyword, $options: 'i' } },
        { preconditions: { $regex: query.keyword, $options: 'i' } },
        { expectedResult: { $regex: query.keyword, $options: 'i' } },
        { module: { $regex: query.keyword, $options: 'i' } },
        { suiteId: { $regex: query.keyword, $options: 'i' } },
        { tags: { $regex: query.keyword, $options: 'i' } }
      ];
    }
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const sort = this.sortOf(query.sortBy, query.sortOrder);
    const [total, rows] = await Promise.all([
      this.cases.countDocuments(filter),
      this.cases.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return { total, page, pageSize, items: rows.map((row) => this.toDto(row)) };
  }

  async create(dto: CreateTestCaseDto, user?: SessionUser): Promise<TestCase> {
    const row = await this.cases.create({
      projectId: new Types.ObjectId(dto.projectId),
      requirementId: toObjectId(dto.requirementId),
      title: dto.title,
      preconditions: dto.preconditions || '',
      steps: this.normalizeSteps(dto.steps || []),
      expectedResult: dto.expectedResult || '',
      priority: dto.priority || 'P2',
      status: dto.status || 'ready',
      module: dto.module || '',
      suiteId: dto.suiteId || '',
      version: dto.version || 'v1',
      reviewStatus: dto.reviewStatus || 'draft',
      automationStatus: dto.automationStatus || 'manual',
      ownerId: toObjectId(dto.ownerId),
      reviewerId: toObjectId(dto.reviewerId),
      reviewedAt: dto.reviewedAt ? new Date(dto.reviewedAt) : undefined,
      changeSummary: dto.changeSummary || '',
      baselineVersion: dto.baselineVersion || '',
      baselineAt: dto.baselineVersion ? new Date() : undefined,
      baselineById: dto.baselineVersion && user?.id ? new Types.ObjectId(user.id) : undefined,
      baselineByName: dto.baselineVersion ? user?.username || '' : '',
      tags: dto.tags || [],
      workflowHistory: [this.workflowEntry('created', undefined, dto.status || 'ready', user, '创建用例')]
    });
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'test_case',
      entityId: idOf(row._id),
      action: 'created',
      title: `创建用例：${row.title}`,
      actor: user
    });
    return this.toDto(row);
  }

  async get(id: string): Promise<TestCase> {
    const row = await this.cases.findById(id);
    if (!row) throw new NotFoundException('用例不存在');
    return this.toDto(row);
  }

  async update(id: string, dto: UpdateTestCaseDto, user?: SessionUser): Promise<TestCase> {
    const previous = await this.cases.findById(id);
    if (!previous) throw new NotFoundException('用例不存在');
    const previousStatus = previous.status;
    const previousReviewStatus = previous.reviewStatus;
    const approvedReviewerId = dto.reviewStatus === 'approved' ? dto.reviewerId || user?.id : undefined;
    const row = await this.cases.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(dto.requirementId !== undefined ? { requirementId: toObjectId(dto.requirementId) } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.preconditions !== undefined ? { preconditions: dto.preconditions } : {}),
          ...(dto.steps !== undefined ? { steps: this.normalizeSteps(dto.steps) } : {}),
          ...(dto.expectedResult !== undefined ? { expectedResult: dto.expectedResult } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.module !== undefined ? { module: dto.module } : {}),
          ...(dto.suiteId !== undefined ? { suiteId: dto.suiteId } : {}),
          ...(dto.version !== undefined ? { version: dto.version } : {}),
          ...(dto.reviewStatus !== undefined ? { reviewStatus: dto.reviewStatus } : {}),
          ...(dto.automationStatus !== undefined ? { automationStatus: dto.automationStatus } : {}),
          ...(dto.ownerId !== undefined ? { ownerId: toObjectId(dto.ownerId) } : {}),
          ...(dto.reviewerId !== undefined ? { reviewerId: toObjectId(dto.reviewerId) } : {}),
          ...(approvedReviewerId ? { reviewerId: new Types.ObjectId(approvedReviewerId), reviewedAt: new Date() } : {}),
          ...(dto.reviewedAt !== undefined ? { reviewedAt: dto.reviewedAt ? new Date(dto.reviewedAt) : undefined } : {}),
          ...(dto.changeSummary !== undefined ? { changeSummary: dto.changeSummary } : {}),
          ...(dto.baselineVersion !== undefined ? {
            baselineVersion: dto.baselineVersion,
            baselineAt: new Date(),
            ...(user?.id ? { baselineById: new Types.ObjectId(user.id) } : {}),
            baselineByName: user?.username || ''
          } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {})
        }
      },
      { new: true }
    );
    if (!row) throw new NotFoundException('用例不存在');
    const history: Array<{ id: string; action: string; fromStatus?: string; toStatus?: string; operatorId?: string; operatorName?: string; note?: string; createdAt: string }> = [];
    if (dto.status && dto.status !== previousStatus) {
      history.push(this.workflowEntry('status_changed', previousStatus, dto.status, user, dto.changeSummary || '状态更新'));
    }
    if (dto.reviewStatus && dto.reviewStatus !== previousReviewStatus) {
      history.push(this.workflowEntry(reviewAction(dto.reviewStatus), previousReviewStatus, dto.reviewStatus, user, dto.changeSummary || '评审状态更新'));
    }
    if (dto.changeSummary && history.length === 0) {
      history.push(this.workflowEntry('content_changed', undefined, undefined, user, dto.changeSummary));
    }
    if (dto.baselineVersion !== undefined) {
      history.push(this.workflowEntry('baseline_set', previous.baselineVersion || undefined, dto.baselineVersion, user, dto.changeSummary || '设置用例基线'));
    }
    if (history.length) {
      row.workflowHistory = [...(row.workflowHistory || []), ...history];
      await row.save();
    }
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'test_case',
      entityId: id,
      action: dto.status ? 'status_changed' : 'updated',
      title: `更新用例：${row.title}`,
      actor: user
    });
    return this.toDto(row);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const [planCount, bugCount] = await Promise.all([
      this.plans.countDocuments({ $or: [{ caseIds: new Types.ObjectId(id) }, { 'runItems.caseId': new Types.ObjectId(id) }] }),
      this.bugs.countDocuments({ testCaseId: new Types.ObjectId(id) })
    ]);
    const blockers = [
      planCount ? `${planCount} 个测试计划/执行项` : '',
      bugCount ? `${bugCount} 个 Bug` : ''
    ].filter(Boolean);
    if (blockers.length) throw new BadRequestException(`用例仍有关联数据，请先迁移或清理：${blockers.join('、')}`);
    await this.cases.findByIdAndDelete(id);
    return { deleted: true };
  }

  async projectIdOf(id: string): Promise<string> {
    const row = await this.cases.findById(id).select('projectId');
    if (!row) throw new NotFoundException('用例不存在');
    return idOf(row.projectId);
  }

  toDto(row: TestCaseEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }): TestCase {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      requirementId: row.requirementId ? idOf(row.requirementId) : undefined,
      title: row.title,
      preconditions: row.preconditions,
      steps: this.normalizeSteps(row.steps),
      expectedResult: row.expectedResult,
      priority: row.priority,
      status: row.status,
      module: row.module,
      suiteId: row.suiteId,
      version: row.version,
      reviewStatus: row.reviewStatus,
      automationStatus: row.automationStatus,
      ownerId: row.ownerId ? idOf(row.ownerId) : undefined,
      reviewerId: row.reviewerId ? idOf(row.reviewerId) : undefined,
      reviewedAt: row.reviewedAt?.toISOString(),
      changeSummary: row.changeSummary,
      baselineVersion: row.baselineVersion,
      baselineAt: row.baselineAt?.toISOString(),
      baselineById: row.baselineById ? idOf(row.baselineById) : undefined,
      baselineByName: row.baselineByName,
      tags: row.tags,
      workflowHistory: this.normalizeWorkflow(row.workflowHistory || []),
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

  private normalizeSteps(steps: Array<Partial<TestCaseStep>>): TestCaseStep[] {
    return steps
      .map((step, index) => ({
        id: step.id || new Types.ObjectId().toString(),
        action: String(step.action || '').trim(),
        expected: String(step.expected || '').trim(),
        sort: typeof step.sort === 'number' ? step.sort : index + 1
      }))
      .filter((step) => step.action || step.expected)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }

  private sortOf(sortBy?: string, sortOrder?: 'asc' | 'desc'): Record<string, 1 | -1> {
    const allowed = new Set(['title', 'status', 'priority', 'module', 'reviewStatus', 'automationStatus', 'createdAt', 'updatedAt']);
    if (!sortBy || !allowed.has(sortBy)) return { updatedAt: -1 };
    return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
  }
}

function reviewAction(status: TestCase['reviewStatus']) {
  if (status === 'in_review') return 'review_submitted';
  if (status === 'approved') return 'review_approved';
  if (status === 'changes_requested') return 'review_rejected';
  return 'review_reset';
}
