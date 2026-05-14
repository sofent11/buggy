import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { TestPlan, TestRunItem } from '@buggy/shared-types';
import { TestCaseEntity } from '../database/test-case.schema.js';
import { TestPlanEntity, TestRunItemEntity } from '../database/test-plan.schema.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import type { CreateTestPlanDto, UpdateRunItemDto, UpdateTestPlanDto } from '../dto/test-plan.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';
import type { SessionUser } from './auth.service.js';

@Injectable()
export class TestPlanService {
  constructor(
    @InjectModel(TestPlanEntity.name) private readonly plans: Model<TestPlanEntity>,
    @InjectModel(TestCaseEntity.name) private readonly cases: Model<TestCaseEntity>
  ) {}

  async list(query: ListQueryDto): Promise<TestPlan[]> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.iterationId) filter.iterationId = new Types.ObjectId(query.iterationId);
    if (query.requirementId) filter.requirementId = new Types.ObjectId(query.requirementId);
    if (query.status) filter.status = query.status;
    if (query.keyword) filter.name = { $regex: query.keyword, $options: 'i' };
    const rows = await this.plans.find(filter).sort({ updatedAt: -1 });
    return rows.map((row) => this.toDto(row));
  }

  async create(dto: CreateTestPlanDto): Promise<TestPlan> {
    const caseIds = dto.caseIds.map((id) => new Types.ObjectId(id));
    const cases = await this.cases.find({ _id: { $in: caseIds }, projectId: new Types.ObjectId(dto.projectId) });
    const runItems = cases.map((testCase) => ({
      caseId: testCase._id,
      caseTitle: testCase.title,
      requirementId: testCase.requirementId,
      steps: testCase.steps.map((step) => ({ action: step.action, expected: step.expected })),
      expectedResult: testCase.expectedResult,
      status: 'untested',
      actualResult: '',
      bugIds: []
    }));
    const row = await this.plans.create({
      projectId: new Types.ObjectId(dto.projectId),
      iterationId: toObjectId(dto.iterationId),
      requirementId: toObjectId(dto.requirementId),
      name: dto.name,
      round: dto.round || '第 1 轮',
      ownerId: toObjectId(dto.ownerId),
      status: 'draft',
      caseIds,
      runItems
    });
    return this.toDto(row);
  }

  async get(id: string): Promise<TestPlan> {
    const row = await this.plans.findById(id);
    if (!row) throw new NotFoundException('测试计划不存在');
    return this.toDto(row);
  }

  async update(id: string, dto: UpdateTestPlanDto): Promise<TestPlan> {
    const row = await this.plans.findById(id);
    if (!row) throw new NotFoundException('测试计划不存在');
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.round !== undefined) row.round = dto.round;
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.caseIds !== undefined) {
      const nextIds = dto.caseIds.map((caseId) => new Types.ObjectId(caseId));
      const existing = new Map(row.runItems.map((item) => [idOf(item.caseId), item]));
      const cases = await this.cases.find({ _id: { $in: nextIds }, projectId: row.projectId });
      row.caseIds = nextIds;
      row.runItems = cases.map((testCase) => {
        const retained = existing.get(idOf(testCase._id));
        if (retained) return retained;
        return {
          _id: new Types.ObjectId(),
          caseId: testCase._id as Types.ObjectId,
          caseTitle: testCase.title,
          requirementId: testCase.requirementId,
          steps: testCase.steps.map((step) => ({ action: step.action, expected: step.expected })),
          expectedResult: testCase.expectedResult,
          status: 'untested',
          actualResult: '',
          bugIds: []
        } as TestRunItemEntity;
      });
    }
    await row.save();
    return this.toDto(row);
  }

  async updateRunItem(planId: string, runItemId: string, dto: UpdateRunItemDto, user: SessionUser): Promise<TestPlan> {
    const row = await this.plans.findById(planId);
    if (!row) throw new NotFoundException('测试计划不存在');
    const item = row.runItems.find((candidate) => idOf(candidate._id) === runItemId);
    if (!item) throw new NotFoundException('执行项不存在');
    item.status = dto.status;
    item.actualResult = dto.actualResult || '';
    item.executorId = new Types.ObjectId(user.id);
    item.executedAt = new Date();
    if (row.status === 'draft') row.status = 'active';
    await row.save();
    return this.toDto(row);
  }

  async appendBug(planId: string, runItemId: string, bugId: string): Promise<void> {
    const plan = await this.plans.findById(planId);
    if (!plan) return;
    const item = plan.runItems.find((candidate) => idOf(candidate._id) === runItemId);
    if (!item) return;
    const objectId = new Types.ObjectId(bugId);
    if (!item.bugIds.some((id) => idOf(id) === bugId)) item.bugIds.push(objectId);
    if (item.status === 'untested' || item.status === 'passed') item.status = 'failed';
    await plan.save();
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.plans.findByIdAndDelete(id);
    return { deleted: true };
  }

  toDto(row: TestPlanEntity & { _id: unknown }): TestPlan {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      iterationId: row.iterationId ? idOf(row.iterationId) : undefined,
      requirementId: row.requirementId ? idOf(row.requirementId) : undefined,
      name: row.name,
      round: row.round,
      ownerId: row.ownerId ? idOf(row.ownerId) : undefined,
      status: row.status,
      caseIds: row.caseIds.map(idOf),
      runItems: row.runItems.map(
        (item): TestRunItem => ({
          id: idOf(item._id),
          caseId: idOf(item.caseId),
          caseTitle: item.caseTitle,
          requirementId: item.requirementId ? idOf(item.requirementId) : undefined,
          steps: item.steps,
          expectedResult: item.expectedResult,
          status: item.status,
          actualResult: item.actualResult,
          executorId: item.executorId ? idOf(item.executorId) : undefined,
          executedAt: item.executedAt?.toISOString(),
          bugIds: item.bugIds.map(idOf)
        })
      )
    };
  }
}
