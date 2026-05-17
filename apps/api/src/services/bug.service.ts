import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Bug, BugAttachment, BugComment, BugStatusHistory, PageResult, ProjectSlaPolicy, SlaLevel } from '@buggy/shared-types';
import { BugEntity } from '../database/bug.schema.js';
import { ProjectEntity } from '../database/project.schema.js';
import { TestPlanEntity } from '../database/test-plan.schema.js';
import type { AddBugAttachmentDto, AddBugCommentDto, CreateBugDto, CreateBugFromRunDto, MarkDuplicateBugDto, TransitionBugDto, UpdateBugDto } from '../dto/bug.dto.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';
import { ActivityService } from './activity.service.js';
import type { SessionUser } from './auth.service.js';
import { NotificationService } from './notification.service.js';
import { normalizeProjectQualitySettings } from './project.service.js';
import { TestPlanService } from './test-plan.service.js';

@Injectable()
export class BugService {
  constructor(
    @InjectModel(BugEntity.name) private readonly bugs: Model<BugEntity>,
    @InjectModel(ProjectEntity.name) private readonly projects: Model<ProjectEntity>,
    @InjectModel(TestPlanEntity.name) private readonly plans: Model<TestPlanEntity>,
    private readonly testPlanService: TestPlanService,
    private readonly activities: ActivityService,
    private readonly notifications: NotificationService
  ) {}

  async list(query: ListQueryDto): Promise<PageResult<Bug>> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.iterationId) filter.iterationId = new Types.ObjectId(query.iterationId);
    if (query.requirementId) filter.requirementId = new Types.ObjectId(query.requirementId);
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.severity) filter.severity = query.severity;
    if (query.triageStatus) filter.triageStatus = query.triageStatus;
    if (query.assigneeId) filter.assigneeId = new Types.ObjectId(query.assigneeId);
    if (query.team === '__unassigned') filter.team = { $in: ['', null] };
    else if (query.team) filter.team = query.team;
    if (query.keyword) {
      filter.$or = [
        { title: { $regex: query.keyword, $options: 'i' } },
        { reproduceSteps: { $regex: query.keyword, $options: 'i' } },
        { actualResult: { $regex: query.keyword, $options: 'i' } },
        { expectedResult: { $regex: query.keyword, $options: 'i' } },
        { team: { $regex: query.keyword, $options: 'i' } }
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
    const qualitySettings = await this.projectQualitySettings(dto.projectId);
    const slaLevel = dto.slaLevel || slaLevelOf(dto.severity || 'S2');
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
      team: dto.team || '',
      reporterId: new Types.ObjectId(user.id),
      duplicateOfId: toObjectId(dto.duplicateOfId),
      dueAt: dto.dueAt ? new Date(dto.dueAt) : defaultDueAt(slaLevel, qualitySettings.slaPolicy),
      environment: dto.environment || '',
      foundVersion: dto.foundVersion || '',
      fixVersion: dto.fixVersion || '',
      rootCause: dto.rootCause || '',
      resolution: dto.resolution || '',
      verifyResult: dto.verifyResult || '',
      slaLevel,
      watcherIds: (dto.watcherIds || []).map((id) => new Types.ObjectId(id)),
      triageStatus: dto.triageStatus || (dto.assigneeId ? 'accepted' : 'new'),
      comments: [],
      attachments: [],
      statusHistory: [this.statusHistoryEntry(undefined, status, user, '创建缺陷')]
    });
    if (dto.testPlanId && dto.runItemId) await this.testPlanService.appendBug(dto.testPlanId, dto.runItemId, idOf(row._id));
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'bug',
      entityId: idOf(row._id),
      action: 'created',
      title: `创建 Bug：${row.title}`,
      actor: user
    });
    await this.notifyAssignment(row, user);
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
        assigneeId: dto.assigneeId,
        dueAt: dto.dueAt,
        environment: dto.environment,
        foundVersion: dto.foundVersion
      },
      user
    );
    return bug;
  }

  async update(id: string, dto: UpdateBugDto, user?: SessionUser): Promise<Bug> {
    const row = await this.bugs.findById(id);
    if (!row) throw new NotFoundException('Bug 不存在');
    const previousStatus = row.status;
    const previousAssigneeId = row.assigneeId ? idOf(row.assigneeId) : undefined;
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
    if (dto.status !== undefined) {
      this.assertTransition(previousStatus, dto.status);
      row.status = dto.status;
      if (dto.status === 'resolved' && previousStatus !== 'resolved') row.resolvedAt = new Date();
      if (dto.status === 'verified' && previousStatus !== 'verified') row.verifiedAt = new Date();
      if (dto.status === 'reopened') {
        row.resolvedAt = undefined;
        row.verifiedAt = undefined;
      }
    }
    if (dto.assigneeId !== undefined) row.assigneeId = toObjectId(dto.assigneeId);
    if (dto.team !== undefined) row.team = dto.team || '';
    if (dto.duplicateOfId !== undefined) row.duplicateOfId = toObjectId(dto.duplicateOfId);
    if (dto.dueAt !== undefined) row.dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
    if (dto.environment !== undefined) row.environment = dto.environment;
    if (dto.foundVersion !== undefined) row.foundVersion = dto.foundVersion;
    if (dto.fixVersion !== undefined) row.fixVersion = dto.fixVersion;
    if (dto.rootCause !== undefined) row.rootCause = dto.rootCause;
    if (dto.resolution !== undefined) row.resolution = dto.resolution;
    if (dto.verifyResult !== undefined) row.verifyResult = dto.verifyResult;
    if (dto.slaLevel !== undefined) row.slaLevel = dto.slaLevel;
    if (dto.watcherIds !== undefined) row.watcherIds = dto.watcherIds.map((watcherId) => new Types.ObjectId(watcherId));
    if (dto.triageStatus !== undefined) row.triageStatus = dto.triageStatus;
    if (dto.status && dto.status !== previousStatus) {
      row.statusHistory = [
        ...(row.statusHistory || []),
        this.statusHistoryEntry(previousStatus, dto.status, user, dto.statusReason || '状态更新')
      ];
    }
    await row.save();
    if (dto.testPlanId && dto.runItemId) await this.testPlanService.appendBug(dto.testPlanId, dto.runItemId, id);
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'bug',
      entityId: id,
      action: dto.status && dto.status !== previousStatus ? 'status_changed' : 'updated',
      title: `更新 Bug：${row.title}`,
      detail: dto.status && dto.status !== previousStatus ? `${previousStatus} -> ${dto.status}` : '',
      actor: user
    });
    if ((dto.assigneeId !== undefined && dto.assigneeId !== previousAssigneeId) || !previousAssigneeId) await this.notifyAssignment(row, user);
    if (dto.status && dto.status !== previousStatus) await this.notifyStatus(row, previousStatus, user);
    return this.toDto(row);
  }

  async transition(id: string, dto: TransitionBugDto, user: SessionUser): Promise<Bug> {
    const row = await this.bugs.findById(id).select('fixVersion foundVersion rootCause resolution');
    if (!row) throw new NotFoundException('Bug 不存在');
    const reason = dto.reason.trim();
    return this.update(
      id,
      {
        status: dto.nextStatus,
        statusReason: reason,
        ...(dto.nextStatus === 'in_progress' ? { triageStatus: 'accepted' as const } : {}),
        ...(dto.nextStatus === 'resolved' ? {
          triageStatus: 'accepted' as const,
          resolution: dto.resolution || reason,
          rootCause: row.rootCause || dto.resolution || reason,
          fixVersion: row.fixVersion || row.foundVersion || '待发布版本'
        } : {}),
        ...(dto.nextStatus === 'verified' || dto.nextStatus === 'closed' ? {
          verifyResult: dto.verifyResult || reason,
          rootCause: row.rootCause || row.resolution || reason,
          fixVersion: row.fixVersion || row.foundVersion || '待发布版本'
        } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt } : {})
      },
      user
    );
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
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'bug',
      entityId: id,
      action: 'commented',
      title: `评论 Bug：${row.title}`,
      detail: dto.body.trim(),
      actor: user
    });
    await this.notifyWatchers(row, `Bug 新评论：${row.title}`, dto.body.trim(), user);
    return this.toDto(row);
  }

  async addAttachment(id: string, dto: AddBugAttachmentDto, user?: SessionUser): Promise<Bug> {
    const row = await this.bugs.findById(id);
    if (!row) throw new NotFoundException('Bug 不存在');
    row.attachments = [
      ...(row.attachments || []),
      {
        id: new Types.ObjectId().toString(),
        name: dto.name.trim(),
        url: dto.url.trim(),
        size: dto.size,
        mimeType: dto.mimeType,
        uploaderId: user?.id,
        uploaderName: user?.username,
        createdAt: new Date().toISOString()
      }
    ];
    await row.save();
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'bug',
      entityId: id,
      action: 'attached',
      title: `上传附件：${row.title}`,
      detail: dto.name.trim(),
      actor: user
    });
    await this.notifyWatchers(row, `Bug 新附件：${row.title}`, dto.name.trim(), user);
    return this.toDto(row);
  }

  async markDuplicate(id: string, dto: MarkDuplicateBugDto, user: SessionUser): Promise<Bug> {
    if (id === dto.duplicateOfId) throw new BadRequestException('不能将 Bug 标记为自身重复');
    const [row, source] = await Promise.all([
      this.bugs.findById(id),
      this.bugs.findById(dto.duplicateOfId)
    ]);
    if (!row) throw new NotFoundException('Bug 不存在');
    if (!source) throw new NotFoundException('源 Bug 不存在');
    if (idOf(row.projectId) !== idOf(source.projectId)) throw new BadRequestException('只能合并同一项目下的重复 Bug');
    const previousStatus = row.status;
    row.duplicateOfId = new Types.ObjectId(dto.duplicateOfId);
    row.triageStatus = 'duplicate';
    row.status = 'closed';
    row.verifyResult = dto.reason.trim();
    row.statusHistory = [
      ...(row.statusHistory || []),
      this.statusHistoryEntry(previousStatus, 'closed', user, `重复于 ${source.title}：${dto.reason.trim()}`)
    ];
    row.comments = [
      ...(row.comments || []),
      {
        id: new Types.ObjectId().toString(),
        authorId: user.id,
        authorName: user.username,
        body: `标记为重复缺陷：${source.title}。${dto.reason.trim()}`,
        createdAt: new Date().toISOString()
      }
    ];
    source.comments = [
      ...(source.comments || []),
      {
        id: new Types.ObjectId().toString(),
        authorId: user.id,
        authorName: user.username,
        body: `收到重复缺陷：${row.title}。${dto.reason.trim()}`,
        createdAt: new Date().toISOString()
      }
    ];
    await source.save();
    await row.save();
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'bug',
      entityId: id,
      action: 'status_changed',
      title: `合并重复 Bug：${row.title}`,
      detail: `重复于：${source.title}`,
      actor: user
    });
    await this.notifyStatus(row, previousStatus, user);
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
      team: row.team || undefined,
      reporterId: row.reporterId ? idOf(row.reporterId) : undefined,
      duplicateOfId: row.duplicateOfId ? idOf(row.duplicateOfId) : undefined,
      dueAt: row.dueAt?.toISOString(),
      environment: row.environment,
      foundVersion: row.foundVersion,
      fixVersion: row.fixVersion,
      rootCause: row.rootCause,
      resolution: row.resolution,
      verifyResult: row.verifyResult,
      slaLevel: row.slaLevel || slaLevelOf(row.severity),
      watcherIds: (row.watcherIds || []).map(idOf),
      triageStatus: row.triageStatus || 'new',
      resolvedAt: row.resolvedAt?.toISOString(),
      verifiedAt: row.verifiedAt?.toISOString(),
      comments: this.normalizeComments(row.comments || []),
      attachments: this.normalizeAttachments(row.attachments || []),
      statusHistory: this.normalizeStatusHistory(row.statusHistory || []),
      duplicateLinks: row.duplicateOfId ? [{
        id: `${idOf(row.duplicateOfId)}:${idOf(row._id)}`,
        sourceBugId: idOf(row.duplicateOfId),
        duplicateBugId: idOf(row._id),
        reason: row.verifyResult || '重复缺陷合并',
        createdAt: row.updatedAt?.toISOString() || new Date().toISOString()
      }] : [],
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
        size: typeof row.size === 'number' ? row.size : undefined,
        mimeType: row.mimeType,
        uploaderId: row.uploaderId,
        uploaderName: row.uploaderName,
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
    const allowed = new Set(['title', 'status', 'priority', 'severity', 'triageStatus', 'team', 'createdAt', 'updatedAt']);
    if (!sortBy || !allowed.has(sortBy)) return { updatedAt: -1 };
    return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
  }

  private async projectQualitySettings(projectId: string) {
    const project = await this.projects.findById(projectId).select('qualitySettings');
    return normalizeProjectQualitySettings(project?.qualitySettings);
  }

  private assertTransition(from: Bug['status'], to: Bug['status']) {
    if (from === to) return;
    const allowed: Record<Bug['status'], Bug['status'][]> = {
      open: ['in_progress', 'reopened'],
      in_progress: ['resolved', 'reopened'],
      resolved: ['verified', 'reopened', 'in_progress'],
      verified: ['closed', 'reopened'],
      closed: ['reopened'],
      reopened: ['in_progress', 'resolved']
    };
    if (!allowed[from]?.includes(to)) throw new BadRequestException(`不允许从 ${from} 流转到 ${to}`);
  }

  private async notifyAssignment(row: BugEntity & { _id: unknown }, user?: SessionUser) {
    if (!row.assigneeId) return;
    await this.notifications.create({
      userId: idOf(row.assigneeId),
      projectId: idOf(row.projectId),
      title: `Bug 指派给你：${row.title}`,
      body: row.actualResult || row.reproduceSteps || '请跟进该缺陷。',
      entityType: 'bug',
      entityId: idOf(row._id),
      actorId: user?.id
    });
  }

  private async notifyStatus(row: BugEntity & { _id: unknown }, previousStatus: Bug['status'], user?: SessionUser) {
    const targets = [
      row.assigneeId ? idOf(row.assigneeId) : undefined,
      row.reporterId ? idOf(row.reporterId) : undefined,
      ...(row.watcherIds || []).map(idOf)
    ];
    await Promise.all(
      [...new Set(targets.filter(Boolean))].map((userId) =>
        this.notifications.create({
          userId,
          projectId: idOf(row.projectId),
          title: row.status === 'resolved' ? `Bug 待复测：${row.title}` : `Bug 状态变更：${row.title}`,
          body: row.status === 'resolved' ? (row.resolution || '开发已标记解决，请补充复测结论。') : `${previousStatus} -> ${row.status}`,
          entityType: 'bug',
          entityId: idOf(row._id),
          actorId: user?.id
        })
      )
    );
  }

  private async notifyWatchers(row: BugEntity & { _id: unknown }, title: string, body: string, user?: SessionUser) {
    const targets = [
      row.assigneeId ? idOf(row.assigneeId) : undefined,
      row.reporterId ? idOf(row.reporterId) : undefined,
      ...(row.watcherIds || []).map(idOf)
    ];
    await Promise.all(
      [...new Set(targets.filter(Boolean))].map((userId) =>
        this.notifications.create({
          userId,
          projectId: idOf(row.projectId),
          title,
          body,
          entityType: 'bug',
          entityId: idOf(row._id),
          actorId: user?.id
        })
      )
    );
  }
}

function defaultDueAt(level: SlaLevel, policy?: ProjectSlaPolicy) {
  if (policy?.enabled === false) return undefined;
  const hours: Record<SlaLevel, number> = {
    critical: policy?.criticalHours || 24,
    high: policy?.highHours || 48,
    normal: policy?.normalHours || 120,
    low: policy?.lowHours || 240
  };
  const date = new Date();
  date.setHours(date.getHours() + hours[level]);
  return date;
}

function slaLevelOf(severity: Bug['severity']): SlaLevel {
  if (severity === 'S0') return 'critical';
  if (severity === 'S1') return 'high';
  if (severity === 'S3') return 'low';
  return 'normal';
}
