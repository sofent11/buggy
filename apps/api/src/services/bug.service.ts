import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Bug, BugAttachment, BugComment, BugStatusHistory, PageResult } from '@buggy/shared-types';
import { BugEntity } from '../database/bug.schema.js';
import { TestPlanEntity } from '../database/test-plan.schema.js';
import type { AddBugAttachmentDto, AddBugCommentDto, CreateBugDto, CreateBugFromRunDto, UpdateBugDto } from '../dto/bug.dto.js';
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

  async list(query: ListQueryDto): Promise<PageResult<Bug>> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.iterationId) filter.iterationId = new Types.ObjectId(query.iterationId);
    if (query.requirementId) filter.requirementId = new Types.ObjectId(query.requirementId);
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.severity) filter.severity = query.severity;
    if (query.assigneeId) filter.assigneeId = new Types.ObjectId(query.assigneeId);
    if (query.keyword) {
      filter.$or = [
        { title: { $regex: query.keyword, $options: 'i' } },
        { reproduceSteps: { $regex: query.keyword, $options: 'i' } },
        { actualResult: { $regex: query.keyword, $options: 'i' } },
        { expectedResult: { $regex: query.keyword, $options: 'i' } }
      ];
    }
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const sort = this.sortOf(query.sortBy, query.sortOrder);
    const [total, rows] = await Promise.all([
      this.bugs.countDocuments(filter),
      this.bugs.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return { total, page, pageSize, items: rows.map((row) => this.toDto(row)) };
  }

  async create(dto: CreateBugDto, user: SessionUser): Promise<Bug> {
    const status = dto.status || 'open';
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
      status,
      assigneeId: toObjectId(dto.assigneeId),
      reporterId: new Types.ObjectId(user.id),
      duplicateOfId: toObjectId(dto.duplicateOfId),
      comments: [],
      attachments: [],
      statusHistory: [this.statusHistoryEntry(undefined, status, user, '创建缺陷')]
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

  async update(id: string, dto: UpdateBugDto, user?: SessionUser): Promise<Bug> {
    const row = await this.bugs.findById(id);
    if (!row) throw new NotFoundException('Bug 不存在');
    const previousStatus = row.status;
    if (dto.iterationId !== undefined) row.iterationId = toObjectId(dto.iterationId);
    if (dto.requirementId !== undefined) row.requirementId = toObjectId(dto.requirementId);
    if (dto.testCaseId !== undefined) row.testCaseId = toObjectId(dto.testCaseId);
    if (dto.testPlanId !== undefined) row.testPlanId = toObjectId(dto.testPlanId);
    if (dto.runItemId !== undefined) row.runItemId = toObjectId(dto.runItemId);
    if (dto.title !== undefined) row.title = dto.title;
    if (dto.reproduceSteps !== undefined) row.reproduceSteps = dto.reproduceSteps;
    if (dto.expectedResult !== undefined) row.expectedResult = dto.expectedResult;
    if (dto.actualResult !== undefined) row.actualResult = dto.actualResult;
    if (dto.severity !== undefined) row.severity = dto.severity;
    if (dto.priority !== undefined) row.priority = dto.priority;
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.assigneeId !== undefined) row.assigneeId = toObjectId(dto.assigneeId);
    if (dto.duplicateOfId !== undefined) row.duplicateOfId = toObjectId(dto.duplicateOfId);
    if (dto.status && dto.status !== previousStatus) {
      row.statusHistory = [
        ...(row.statusHistory || []),
        this.statusHistoryEntry(previousStatus, dto.status, user, '状态更新')
      ];
    }
    await row.save();
    if (dto.testPlanId && dto.runItemId) await this.testPlanService.appendBug(dto.testPlanId, dto.runItemId, id);
    return this.toDto(row);
  }

  async addComment(id: string, dto: AddBugCommentDto, user: SessionUser): Promise<Bug> {
    const row = await this.bugs.findById(id);
    if (!row) throw new NotFoundException('Bug 不存在');
    row.comments = [
      ...(row.comments || []),
      {
        id: new Types.ObjectId().toString(),
        authorId: user.id,
        authorName: user.username,
        body: dto.body.trim(),
        createdAt: new Date().toISOString()
      }
    ];
    await row.save();
    return this.toDto(row);
  }

  async addAttachment(id: string, dto: AddBugAttachmentDto): Promise<Bug> {
    const row = await this.bugs.findById(id);
    if (!row) throw new NotFoundException('Bug 不存在');
    row.attachments = [
      ...(row.attachments || []),
      {
        id: new Types.ObjectId().toString(),
        name: dto.name.trim(),
        url: dto.url.trim(),
        createdAt: new Date().toISOString()
      }
    ];
    await row.save();
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

  toDto(row: BugEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }): Bug {
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
      reporterId: row.reporterId ? idOf(row.reporterId) : undefined,
      duplicateOfId: row.duplicateOfId ? idOf(row.duplicateOfId) : undefined,
      comments: this.normalizeComments(row.comments || []),
      attachments: this.normalizeAttachments(row.attachments || []),
      statusHistory: this.normalizeStatusHistory(row.statusHistory || []),
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString()
    };
  }

  private statusHistoryEntry(fromStatus: Bug['status'] | undefined, toStatus: Bug['status'], user?: SessionUser, note?: string): BugStatusHistory {
    return {
      id: new Types.ObjectId().toString(),
      fromStatus,
      toStatus,
      operatorId: user?.id,
      operatorName: user?.username,
      note,
      createdAt: new Date().toISOString()
    };
  }

  private normalizeComments(rows: Array<Partial<BugComment>>): BugComment[] {
    return rows
      .map((row) => ({
        id: String(row.id || new Types.ObjectId()),
        authorId: row.authorId,
        authorName: row.authorName,
        body: String(row.body || ''),
        createdAt: String(row.createdAt || new Date().toISOString())
      }))
      .filter((row) => row.body);
  }

  private normalizeAttachments(rows: Array<Partial<BugAttachment>>): BugAttachment[] {
    return rows
      .map((row) => ({
        id: String(row.id || new Types.ObjectId()),
        name: String(row.name || ''),
        url: String(row.url || ''),
        createdAt: String(row.createdAt || new Date().toISOString())
      }))
      .filter((row) => row.name && row.url);
  }

  private normalizeStatusHistory(rows: Array<Partial<BugStatusHistory>>): BugStatusHistory[] {
    return rows
      .map((row) => ({
        id: String(row.id || new Types.ObjectId()),
        fromStatus: row.fromStatus,
        toStatus: row.toStatus || 'open',
        operatorId: row.operatorId,
        operatorName: row.operatorName,
        note: row.note,
        createdAt: String(row.createdAt || new Date().toISOString())
      }))
      .filter((row) => row.toStatus);
  }

  private sortOf(sortBy?: string, sortOrder?: 'asc' | 'desc'): Record<string, 1 | -1> {
    const allowed = new Set(['title', 'status', 'priority', 'severity', 'createdAt', 'updatedAt']);
    if (!sortBy || !allowed.has(sortBy)) return { updatedAt: -1 };
    return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
  }
}
