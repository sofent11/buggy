import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Bug } from '@buggy/shared-types';
import { BugEntity } from '../database/bug.schema.js';
import { TestPlanEntity } from '../database/test-plan.schema.js';
import type { CreateBugDto, CreateBugFromRunDto, UpdateBugDto } from '../dto/bug.dto.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';
import type { SessionUser } from './auth.service.js';
import { TestPlanService } from './test-plan.service.js';

@Injectable()
export class BugService {
  constructor(
    @InjectModel(BugEntity.name) private readonly bugs: Model<BugEntity>,
    @InjectModel(TestPlanEntity.name) private readonly plans: Model<TestPlanEntity>,
    private readonly testPlanService: TestPlanService
  ) {}

  async list(query: ListQueryDto): Promise<Bug[]> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.iterationId) filter.iterationId = new Types.ObjectId(query.iterationId);
    if (query.requirementId) filter.requirementId = new Types.ObjectId(query.requirementId);
    if (query.status) filter.status = query.status;
    if (query.keyword) filter.title = { $regex: query.keyword, $options: 'i' };
    const rows = await this.bugs.find(filter).sort({ updatedAt: -1 });
    return rows.map((row) => this.toDto(row));
  }

  async create(dto: CreateBugDto, user: SessionUser): Promise<Bug> {
    const row = await this.bugs.create({
      projectId: new Types.ObjectId(dto.projectId),
      iterationId: toObjectId(dto.iterationId),
      requirementId: toObjectId(dto.requirementId),
      testCaseId: toObjectId(dto.testCaseId),
      testPlanId: toObjectId(dto.testPlanId),
      runItemId: toObjectId(dto.runItemId),
      title: dto.title,
      reproduceSteps: dto.reproduceSteps || '',
      expectedResult: dto.expectedResult || '',
      actualResult: dto.actualResult || '',
      severity: dto.severity || 'S2',
      priority: dto.priority || 'P2',
      status: dto.status || 'open',
      assigneeId: toObjectId(dto.assigneeId),
      reporterId: new Types.ObjectId(user.id)
    });
    if (dto.testPlanId && dto.runItemId) await this.testPlanService.appendBug(dto.testPlanId, dto.runItemId, idOf(row._id));
    return this.toDto(row);
  }

  async createFromRun(dto: CreateBugFromRunDto, user: SessionUser): Promise<Bug> {
    const plan = await this.plans.findById(dto.testPlanId);
    if (!plan) throw new NotFoundException('测试计划不存在');
    const runItem = plan.runItems.find((item) => idOf(item._id) === dto.runItemId);
    if (!runItem) throw new NotFoundException('执行项不存在');
    const bug = await this.create(
      {
        projectId: idOf(plan.projectId),
        iterationId: plan.iterationId ? idOf(plan.iterationId) : undefined,
        requirementId: runItem.requirementId ? idOf(runItem.requirementId) : plan.requirementId ? idOf(plan.requirementId) : undefined,
        testCaseId: idOf(runItem.caseId),
        testPlanId: idOf(plan._id),
        runItemId: idOf(runItem._id),
        title: dto.title,
        reproduceSteps: dto.reproduceSteps || runItem.steps.map((step, index) => `${index + 1}. ${step.action}`).join('\n'),
        expectedResult: runItem.expectedResult,
        actualResult: dto.actualResult || runItem.actualResult,
        severity: dto.severity,
        priority: dto.priority,
        assigneeId: dto.assigneeId
      },
      user
    );
    return bug;
  }

  async update(id: string, dto: UpdateBugDto): Promise<Bug> {
    const row = await this.bugs.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(dto.iterationId !== undefined ? { iterationId: toObjectId(dto.iterationId) } : {}),
          ...(dto.requirementId !== undefined ? { requirementId: toObjectId(dto.requirementId) } : {}),
          ...(dto.testCaseId !== undefined ? { testCaseId: toObjectId(dto.testCaseId) } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.reproduceSteps !== undefined ? { reproduceSteps: dto.reproduceSteps } : {}),
          ...(dto.expectedResult !== undefined ? { expectedResult: dto.expectedResult } : {}),
          ...(dto.actualResult !== undefined ? { actualResult: dto.actualResult } : {}),
          ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.assigneeId !== undefined ? { assigneeId: toObjectId(dto.assigneeId) } : {})
        }
      },
      { new: true }
    );
    if (!row) throw new NotFoundException('Bug 不存在');
    return this.toDto(row);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.bugs.findByIdAndDelete(id);
    return { deleted: true };
  }

  async projectIdOf(id: string): Promise<string> {
    const row = await this.bugs.findById(id).select('projectId');
    if (!row) throw new NotFoundException('Bug 不存在');
    return idOf(row.projectId);
  }

  toDto(row: BugEntity & { _id: unknown }): Bug {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      iterationId: row.iterationId ? idOf(row.iterationId) : undefined,
      requirementId: row.requirementId ? idOf(row.requirementId) : undefined,
      testCaseId: row.testCaseId ? idOf(row.testCaseId) : undefined,
      testPlanId: row.testPlanId ? idOf(row.testPlanId) : undefined,
      runItemId: row.runItemId ? idOf(row.runItemId) : undefined,
      title: row.title,
      reproduceSteps: row.reproduceSteps,
      expectedResult: row.expectedResult,
      actualResult: row.actualResult,
      severity: row.severity,
      priority: row.priority,
      status: row.status,
      assigneeId: row.assigneeId ? idOf(row.assigneeId) : undefined,
      reporterId: row.reporterId ? idOf(row.reporterId) : undefined
    };
  }
}
