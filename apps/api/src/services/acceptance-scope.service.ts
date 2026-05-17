import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AcceptanceScope, PageResult, QualityGateRule, RiskWaiver } from '@buggy/shared-types';
import { AcceptanceScopeEntity } from '../database/acceptance-scope.schema.js';
import type { AddRiskWaiverDto, CreateAcceptanceScopeDto, SignoffAcceptanceScopeDto, UpdateAcceptanceScopeDto } from '../dto/acceptance-scope.dto.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';
import { ActivityService } from './activity.service.js';
import type { SessionUser } from './auth.service.js';
import { NotificationService } from './notification.service.js';

@Injectable()
export class AcceptanceScopeService {
  constructor(
    @InjectModel(AcceptanceScopeEntity.name) private readonly scopes: Model<AcceptanceScopeEntity>,
    private readonly activities: ActivityService,
    private readonly notifications: NotificationService
  ) {}

  async list(query: ListQueryDto): Promise<PageResult<AcceptanceScope>> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.status) filter.status = query.status;
    if (query.ownerId) filter.ownerId = new Types.ObjectId(query.ownerId);
    if (query.keyword) {
      filter.$or = [
        { name: { $regex: query.keyword, $options: 'i' } },
        { description: { $regex: query.keyword, $options: 'i' } }
      ];
    }
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const [total, rows] = await Promise.all([
      this.scopes.countDocuments(filter),
      this.scopes.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return { total, page, pageSize, items: rows.map((row) => this.toDto(row)) };
  }

  async create(dto: CreateAcceptanceScopeDto, user: SessionUser): Promise<AcceptanceScope> {
    const row = await this.scopes.create({
      projectId: new Types.ObjectId(dto.projectId),
      name: dto.name,
      description: dto.description || '',
      status: 'draft',
      ownerId: toObjectId(dto.ownerId || user.id),
      targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      iterationIds: toObjectIds(dto.iterationIds),
      requirementIds: toObjectIds(dto.requirementIds),
      testPlanIds: toObjectIds(dto.testPlanIds),
      bugIds: toObjectIds(dto.bugIds),
      qualityGateRules: normalizeGateRules(dto.qualityGateRules),
      riskWaivers: []
    });
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'acceptance_scope',
      entityId: idOf(row._id),
      action: 'created',
      title: `创建验收范围：${row.name}`,
      actor: user
    });
    return this.toDto(row);
  }

  async get(id: string): Promise<AcceptanceScope> {
    const row = await this.scopes.findById(id);
    if (!row) throw new NotFoundException('验收范围不存在');
    return this.toDto(row);
  }

  async update(id: string, dto: UpdateAcceptanceScopeDto, user: SessionUser): Promise<AcceptanceScope> {
    const row = await this.scopes.findById(id);
    if (!row) throw new NotFoundException('验收范围不存在');
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.ownerId !== undefined) row.ownerId = toObjectId(dto.ownerId);
    if (dto.targetDate !== undefined) row.targetDate = dto.targetDate ? new Date(dto.targetDate) : undefined;
    if (dto.iterationIds !== undefined) row.iterationIds = toObjectIds(dto.iterationIds);
    if (dto.requirementIds !== undefined) row.requirementIds = toObjectIds(dto.requirementIds);
    if (dto.testPlanIds !== undefined) row.testPlanIds = toObjectIds(dto.testPlanIds);
    if (dto.bugIds !== undefined) row.bugIds = toObjectIds(dto.bugIds);
    if (dto.qualityGateRules !== undefined) row.qualityGateRules = normalizeGateRules(dto.qualityGateRules);
    await row.save();
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'acceptance_scope',
      entityId: id,
      action: dto.status ? 'status_changed' : 'updated',
      title: `更新验收范围：${row.name}`,
      actor: user
    });
    return this.toDto(row);
  }

  async addWaiver(id: string, dto: AddRiskWaiverDto, user: SessionUser): Promise<AcceptanceScope> {
    const row = await this.scopes.findById(id);
    if (!row) throw new NotFoundException('验收范围不存在');
    const waiver: RiskWaiver = {
      id: new Types.ObjectId().toString(),
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason.trim(),
      ownerId: dto.ownerId || user.id,
      ownerName: user.username,
      expiresAt: dto.expiresAt || undefined,
      createdById: user.id,
      createdByName: user.username,
      createdAt: new Date().toISOString()
    };
    row.riskWaivers = [...(row.riskWaivers || []), waiver];
    await row.save();
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'acceptance_scope',
      entityId: id,
      action: 'updated',
      title: `新增风险豁免：${row.name}`,
      detail: waiver.reason,
      actor: user
    });
    await this.notifications.create({
      userId: waiver.ownerId,
      projectId: idOf(row.projectId),
      title: `风险豁免待跟进：${row.name}`,
      body: waiver.reason,
      entityType: 'acceptance_scope',
      entityId: id,
      actorId: user.id
    });
    return this.toDto(row);
  }

  async signoff(id: string, dto: SignoffAcceptanceScopeDto, user: SessionUser): Promise<AcceptanceScope> {
    const row = await this.scopes.findById(id);
    if (!row) throw new NotFoundException('验收范围不存在');
    row.status = dto.status === 'signed' ? 'signed' : 'rejected';
    row.reportSignoff = {
      status: dto.status,
      signerId: user.id,
      signerName: user.username,
      note: dto.note.trim(),
      signedAt: new Date().toISOString()
    };
    await row.save();
    await this.activities.record({
      projectId: idOf(row.projectId),
      entityType: 'acceptance_scope',
      entityId: id,
      action: 'status_changed',
      title: `${dto.status === 'signed' ? '签核通过' : '驳回'}验收范围：${row.name}`,
      detail: dto.note.trim(),
      actor: user
    });
    await this.notifications.create({
      userId: row.ownerId ? idOf(row.ownerId) : undefined,
      projectId: idOf(row.projectId),
      title: `${dto.status === 'signed' ? '验收已签核' : '验收被驳回'}：${row.name}`,
      body: dto.note.trim(),
      entityType: 'acceptance_scope',
      entityId: id,
      actorId: user.id
    });
    return this.toDto(row);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.scopes.findByIdAndDelete(id);
    return { deleted: true };
  }

  async projectIdOf(id: string): Promise<string> {
    const row = await this.scopes.findById(id).select('projectId');
    if (!row) throw new NotFoundException('验收范围不存在');
    return idOf(row.projectId);
  }

  toDto(row: AcceptanceScopeEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }): AcceptanceScope {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      name: row.name,
      description: row.description,
      status: row.status,
      ownerId: row.ownerId ? idOf(row.ownerId) : undefined,
      targetDate: row.targetDate?.toISOString(),
      iterationIds: row.iterationIds.map(idOf),
      requirementIds: row.requirementIds.map(idOf),
      testPlanIds: row.testPlanIds.map(idOf),
      bugIds: row.bugIds.map(idOf),
      qualityGateRules: normalizeGateRules(row.qualityGateRules),
      qualityGateResult: row.qualityGateResult,
      riskWaivers: row.riskWaivers || [],
      reportSignoff: row.reportSignoff,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString()
    };
  }
}

function toObjectIds(values?: string[]) {
  return (values || []).filter(Boolean).map((value) => new Types.ObjectId(value));
}

const DEFAULT_QUALITY_GATE_RULES: QualityGateRule[] = [
  { id: 'case_coverage', label: '必须存在覆盖用例', metric: 'case_coverage', enabled: true, blocking: true, description: '验收范围内至少有一条可追踪用例' },
  { id: 'plan_coverage', label: '用例必须纳入测试计划', metric: 'plan_coverage', enabled: true, blocking: true, description: '覆盖用例需要进入本次执行范围' },
  { id: 'untested_runs', label: '不允许未测执行项', metric: 'untested_runs', enabled: true, blocking: true },
  { id: 'failed_runs', label: '不允许失败执行项', metric: 'failed_runs', enabled: true, blocking: true },
  { id: 'blocked_runs', label: '不允许阻塞执行项', metric: 'blocked_runs', enabled: true, blocking: true },
  { id: 'active_s01_bugs', label: '不允许 S0/S1 活跃缺陷', metric: 'active_s01_bugs', enabled: true, blocking: true }
];

function normalizeGateRules(rules?: QualityGateRule[]) {
  const byId = new Map((rules || []).map((rule) => [rule.id, rule]));
  return DEFAULT_QUALITY_GATE_RULES.map((rule) => {
    const override = byId.get(rule.id);
    return override
      ? {
          ...rule,
          enabled: override.enabled !== false,
          blocking: override.blocking !== false,
          threshold: typeof override.threshold === 'number' ? override.threshold : rule.threshold,
          description: override.description || rule.description
        }
      : rule;
  });
}
