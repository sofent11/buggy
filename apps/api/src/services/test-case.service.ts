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
      tags: dto.tags || []
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
          ...(dto.tags !== undefined ? { tags: dto.tags } : {})
        }
      },
      { new: true }
    );
    if (!row) throw new NotFoundException('用例不存在');
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
      tags: row.tags,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString()
    };
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
