import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DEFAULT_BUSINESS_ROLES,
  DEFAULT_PROJECT_GATE_RULES,
  DEFAULT_PROJECT_SLA_POLICY,
  type BusinessRoleConfig,
  type BusinessRoleKey,
  type JoinRequestStatus,
  type PageResult,
  type PermissionAction,
  type PermissionModule,
  type Project,
  type ProjectCategory,
  type ProjectJoinRequest,
  type ProjectMember,
  type ProjectPermission,
  type ProjectQualitySettings,
  type ProjectRole,
  type ProjectStatus,
  type QualityGateRule
} from '@buggy/shared-types';
import { ProjectJoinRequestEntity } from '../database/project-join-request.schema.js';
import { ProjectEntity } from '../database/project.schema.js';
import { UserEntity } from '../database/user.schema.js';
import type { CreateProjectDto, DecideProjectJoinRequestDto, UpdateProjectDto, UpsertProjectMemberDto } from '../dto/project.dto.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';
import type { SessionUser } from './auth.service.js';

@Injectable()
export class ProjectService {
  constructor(
    @InjectModel(ProjectEntity.name) private readonly projects: Model<ProjectEntity>,
    @InjectModel(ProjectJoinRequestEntity.name) private readonly joinRequests: Model<ProjectJoinRequestEntity>,
    @InjectModel(UserEntity.name) private readonly users: Model<UserEntity>
  ) {}

  async list(user: SessionUser, query: ListQueryDto = {}): Promise<PageResult<Project>> {
    const accessFilter =
      isSystemManager(user)
        ? {}
        : {
            $or: [
              { ownerId: new Types.ObjectId(user.id) },
              { 'members.userId': new Types.ObjectId(user.id) },
              { joinRequestsEnabled: true }
            ]
          };
    const filter: Record<string, unknown> = { ...accessFilter };
    if (query.keyword) {
      filter.$and = [
        accessFilter,
        {
          $or: [
            { name: { $regex: query.keyword, $options: 'i' } },
            { code: { $regex: query.keyword, $options: 'i' } },
            { description: { $regex: query.keyword, $options: 'i' } }
          ]
        }
      ];
      delete filter.$or;
    }
    if (query.ownerId) filter.ownerId = new Types.ObjectId(query.ownerId);
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const sortBy = query.sortBy;
    const sortOrder = query.sortOrder;
    const allowed = new Set(['name', 'code', 'createdAt', 'updatedAt']);
    const sort: Record<string, 1 | -1> = sortBy && allowed.has(sortBy) ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 } : { updatedAt: -1 };
    const [total, rows, requests] = await Promise.all([
      this.projects.countDocuments(filter),
      this.projects.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize),
      this.joinRequests.find({ userId: new Types.ObjectId(user.id) }).sort({ createdAt: -1 })
    ]);
    const requestStatus = new Map(requests.map((request) => [idOf(request.projectId), request.status as JoinRequestStatus]));
    return { total, page, pageSize, items: rows.map((row) => this.toDto(row, requestStatus.get(idOf(row._id)))) };
  }

  async create(dto: CreateProjectDto, user: SessionUser): Promise<Project> {
    if (!isSystemManager(user)) throw new ForbiddenException('需要系统维护人员权限');
    const ownerId = new Types.ObjectId(user.id);
    const project = await this.projects.create({
      name: dto.name,
      code: dto.code || '',
      description: dto.description || '',
      status: dto.status || 'active',
      category: dto.category || inferProjectCategory(dto.name, dto.code, dto.description),
      ownerId,
      members: [{ userId: ownerId, username: user.username, email: user.email, role: 'owner', projectPermission: 'manage', businessRoleKey: 'manager' }],
      joinRequestsEnabled: dto.joinRequestsEnabled === true,
      businessRoles: normalizeBusinessRoles(dto.businessRoles),
      qualitySettings: normalizeProjectQualitySettings(dto.qualitySettings)
    });
    return this.toDto(project);
  }

  async get(id: string, user: SessionUser): Promise<Project> {
    const project = await this.projects.findById(id);
    if (!project) throw new NotFoundException('项目不存在');
    if (!(await this.canAccess(id, user))) throw new ForbiddenException('无项目访问权限');
    return this.toDto(project);
  }

  async update(id: string, dto: UpdateProjectDto, user: SessionUser): Promise<Project> {
    await this.assertManage(id, user);
    const project = await this.projects.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.code !== undefined ? { code: dto.code } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.joinRequestsEnabled !== undefined ? { joinRequestsEnabled: dto.joinRequestsEnabled } : {}),
          ...(dto.businessRoles !== undefined ? { businessRoles: normalizeBusinessRoles(dto.businessRoles) } : {}),
          ...(dto.qualitySettings !== undefined ? { qualitySettings: normalizeProjectQualitySettings(dto.qualitySettings) } : {})
        }
      },
      { new: true }
    );
    if (!project) throw new NotFoundException('项目不存在');
    return this.toDto(project);
  }

  async remove(id: string, user: SessionUser): Promise<{ deleted: true }> {
    await this.assertManage(id, user);
    await this.projects.findByIdAndDelete(id);
    return { deleted: true };
  }

  async projectIdOf(id: string): Promise<string> {
    const project = await this.projects.findById(id).select('_id');
    if (!project) throw new NotFoundException('项目不存在');
    return idOf(project._id);
  }

  async upsertMember(projectId: string, dto: UpsertProjectMemberDto, user: SessionUser): Promise<Project> {
    await this.assertManage(projectId, user);
    const memberUser = dto.userId
      ? await this.users.findById(dto.userId)
      : dto.email
        ? await this.users.findOne({ email: dto.email.toLowerCase() })
        : null;
    if (!memberUser) throw new NotFoundException('用户不存在');
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('项目不存在');
    const projectPermission = normalizeProjectPermission(dto.projectPermission, dto.role);
    const businessRoleKey = normalizeBusinessRoleKey(dto.businessRoleKey, dto.role);

    const member = {
      userId: memberUser._id as Types.ObjectId,
      username: memberUser.username,
      email: memberUser.email,
      role: legacyRoleOf(projectPermission, businessRoleKey),
      projectPermission,
      businessRoleKey
    };
    const index = project.members.findIndex((item) => idOf(item.userId) === idOf(memberUser._id));
    if (index >= 0) project.members[index] = member;
    else project.members.push(member);
    await project.save();
    return this.toDto(project);
  }

  async removeMember(projectId: string, userId: string, user: SessionUser): Promise<Project> {
    await this.assertManage(projectId, user);
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('项目不存在');
    project.members = project.members.filter((item) => idOf(item.userId) !== userId);
    await project.save();
    return this.toDto(project);
  }

  async canAccess(projectId: string, user: SessionUser): Promise<boolean> {
    if (isSystemManager(user)) return true;
    const objectId = toObjectId(projectId);
    if (!objectId) return false;
    return Boolean(
      await this.projects.exists({
        _id: objectId,
        $or: [{ ownerId: new Types.ObjectId(user.id) }, { 'members.userId': new Types.ObjectId(user.id) }]
      })
    );
  }

  async assertManage(projectId: string, user: SessionUser): Promise<void> {
    if (isSystemAdmin(user)) return;
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('项目不存在');
    const member = project.members.find((item) => idOf(item.userId) === user.id);
    if (idOf(project.ownerId) === user.id || normalizeMemberPermission(member) === 'manage') return;
    throw new ForbiddenException('需要项目负责人权限');
  }

  async assertWrite(projectId: string, user: SessionUser): Promise<void> {
    if (isSystemAdmin(user)) return;
    const context = await this.permissionContext(projectId, user);
    if (context.projectPermission === 'manage' || context.projectPermission === 'maintain') return;
    if (hasRolePermission(context.businessRole, 'requirements', 'edit')) return;
    throw new ForbiddenException('需要项目编辑权限');
  }

  async assertRole(projectId: string, user: SessionUser, roles: ProjectRole[]): Promise<void> {
    if (isSystemAdmin(user)) return;
    const role = await this.roleOf(projectId, user);
    if (role && roles.includes(role)) return;
    throw new ForbiddenException('当前角色无权执行该操作');
  }

  async assertModuleAction(projectId: string, user: SessionUser, module: PermissionModule, action: PermissionAction): Promise<void> {
    if (isSystemAdmin(user)) return;
    const context = await this.permissionContext(projectId, user);
    if (context.projectPermission === 'manage') return;
    if (context.projectPermission === 'maintain' && action !== 'delete' && action !== 'signoff') return;
    if (hasRolePermission(context.businessRole, module, action)) return;
    throw new ForbiddenException('当前权限无权执行该操作');
  }

  async roleOf(projectId: string, user: SessionUser): Promise<ProjectRole | undefined> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('项目不存在');
    if (idOf(project.ownerId) === user.id) return 'owner';
    const member = project.members.find((item) => idOf(item.userId) === user.id);
    return member ? legacyRoleOf(normalizeMemberPermission(member), normalizeMemberBusinessRole(member)) : undefined;
  }

  async requestJoin(projectId: string, user: SessionUser): Promise<ProjectJoinRequest> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('项目不存在');
    if (!project.joinRequestsEnabled) throw new ForbiddenException('项目暂未开放申请加入');
    if (project.members.some((member) => idOf(member.userId) === user.id)) throw new ForbiddenException('你已是项目成员');
    const existing = await this.joinRequests.findOne({ projectId: new Types.ObjectId(projectId), userId: new Types.ObjectId(user.id), status: 'pending' });
    if (existing) return this.joinRequestToDto(existing);
    const request = await this.joinRequests.create({
      projectId: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(user.id),
      username: user.username,
      email: user.email,
      status: 'pending'
    });
    return this.joinRequestToDto(request);
  }

  async listJoinRequests(projectId: string, user: SessionUser): Promise<ProjectJoinRequest[]> {
    await this.assertManage(projectId, user);
    const rows = await this.joinRequests.find({ projectId: new Types.ObjectId(projectId), status: 'pending' }).sort({ createdAt: 1 });
    return rows.map((row) => this.joinRequestToDto(row));
  }

  async approveJoinRequest(projectId: string, requestId: string, dto: DecideProjectJoinRequestDto, user: SessionUser): Promise<Project> {
    await this.assertManage(projectId, user);
    const request = await this.joinRequests.findOne({ _id: new Types.ObjectId(requestId), projectId: new Types.ObjectId(projectId) });
    if (!request) throw new NotFoundException('加入申请不存在');
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('项目不存在');
    const projectPermission = normalizeProjectPermission(dto.projectPermission);
    const businessRoleKey = normalizeBusinessRoleKey(dto.businessRoleKey);
    const member = {
      userId: request.userId,
      username: request.username,
      email: request.email,
      role: legacyRoleOf(projectPermission, businessRoleKey),
      projectPermission,
      businessRoleKey
    };
    const index = project.members.findIndex((item) => idOf(item.userId) === idOf(request.userId));
    if (index >= 0) project.members[index] = member;
    else project.members.push(member);
    request.status = 'approved';
    request.decidedBy = new Types.ObjectId(user.id);
    request.decidedByName = user.username;
    request.decidedAt = new Date();
    request.projectPermission = projectPermission;
    request.businessRoleKey = businessRoleKey;
    await Promise.all([project.save(), request.save()]);
    return this.toDto(project);
  }

  async rejectJoinRequest(projectId: string, requestId: string, user: SessionUser): Promise<ProjectJoinRequest> {
    await this.assertManage(projectId, user);
    const request = await this.joinRequests.findOne({ _id: new Types.ObjectId(requestId), projectId: new Types.ObjectId(projectId) });
    if (!request) throw new NotFoundException('加入申请不存在');
    request.status = 'rejected';
    request.decidedBy = new Types.ObjectId(user.id);
    request.decidedByName = user.username;
    request.decidedAt = new Date();
    await request.save();
    return this.joinRequestToDto(request);
  }

  private async permissionContext(projectId: string, user: SessionUser): Promise<{ projectPermission: ProjectPermission; businessRole?: BusinessRoleConfig }> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('项目不存在');
    if (idOf(project.ownerId) === user.id) {
      return { projectPermission: 'manage', businessRole: normalizeBusinessRoles(project.businessRoles).find((role) => role.key === 'manager') };
    }
    const member = project.members.find((item) => idOf(item.userId) === user.id);
    if (!member) throw new ForbiddenException('无项目访问权限');
    const businessRoleKey = normalizeMemberBusinessRole(member);
    return {
      projectPermission: normalizeMemberPermission(member),
      businessRole: normalizeBusinessRoles(project.businessRoles).find((role) => role.key === businessRoleKey)
    };
  }

  toDto(project: ProjectEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }, joinRequestStatus?: JoinRequestStatus): Project {
    return {
      id: idOf(project._id),
      name: project.name,
      code: project.code,
      description: project.description,
      status: (project.status || 'active') as ProjectStatus,
      category: (project.category || inferProjectCategory(project.name, project.code, project.description)) as ProjectCategory,
      ownerId: idOf(project.ownerId),
      members: project.members.map(
        (member): ProjectMember => ({
          userId: idOf(member.userId),
          username: member.username,
          email: member.email,
          projectPermission: normalizeMemberPermission(member),
          businessRoleKey: normalizeMemberBusinessRole(member),
          role: legacyRoleOf(normalizeMemberPermission(member), normalizeMemberBusinessRole(member))
        })
      ),
      joinRequestsEnabled: project.joinRequestsEnabled === true,
      joinRequestStatus,
      businessRoles: normalizeBusinessRoles(project.businessRoles),
      qualitySettings: normalizeProjectQualitySettings(project.qualitySettings),
      createdAt: project.createdAt?.toISOString(),
      updatedAt: project.updatedAt?.toISOString()
    };
  }

  private joinRequestToDto(row: ProjectJoinRequestEntity & { _id: unknown; createdAt?: Date }): ProjectJoinRequest {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      userId: idOf(row.userId),
      username: row.username,
      email: row.email,
      status: row.status as JoinRequestStatus,
      createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
      decidedBy: row.decidedBy ? idOf(row.decidedBy) : undefined,
      decidedByName: row.decidedByName,
      decidedAt: row.decidedAt?.toISOString(),
      projectPermission: row.projectPermission,
      businessRoleKey: row.businessRoleKey
    };
  }
}

export function normalizeProjectQualitySettings(settings?: Partial<ProjectQualitySettings>): ProjectQualitySettings {
  const input = settings || {};
  return {
    slaPolicy: {
      ...DEFAULT_PROJECT_SLA_POLICY,
      ...(input.slaPolicy || {}),
      criticalHours: positiveHours(input.slaPolicy?.criticalHours, DEFAULT_PROJECT_SLA_POLICY.criticalHours),
      highHours: positiveHours(input.slaPolicy?.highHours, DEFAULT_PROJECT_SLA_POLICY.highHours),
      normalHours: positiveHours(input.slaPolicy?.normalHours, DEFAULT_PROJECT_SLA_POLICY.normalHours),
      lowHours: positiveHours(input.slaPolicy?.lowHours, DEFAULT_PROJECT_SLA_POLICY.lowHours),
      enabled: input.slaPolicy?.enabled !== false
    },
    defaultGateRules: normalizeGateRules(input.defaultGateRules),
    integrations: {
      larkWebhook: trimOptional(input.integrations?.larkWebhook),
      jiraBaseUrl: trimOptional(input.integrations?.jiraBaseUrl),
      jiraProjectKey: trimOptional(input.integrations?.jiraProjectKey),
      ciDashboardUrl: trimOptional(input.integrations?.ciDashboardUrl),
      externalWebhookUrl: trimOptional(input.integrations?.externalWebhookUrl)
    }
  };
}

function normalizeGateRules(rules?: QualityGateRule[]) {
  const byId = new Map((rules || []).map((rule) => [rule.id, rule]));
  return DEFAULT_PROJECT_GATE_RULES.map((rule) => {
    const override = byId.get(rule.id);
    return override
      ? {
          ...rule,
          enabled: override.enabled !== false,
          blocking: override.blocking !== false,
          threshold: Number.isFinite(override.threshold) ? Math.max(0, Number(override.threshold)) : rule.threshold,
          description: override.description || rule.description
        }
      : rule;
  });
}

export function normalizeBusinessRoles(roles?: BusinessRoleConfig[]): BusinessRoleConfig[] {
  const byKey = new Map((roles || []).filter((role) => role?.key).map((role) => [role.key, role]));
  const defaults = DEFAULT_BUSINESS_ROLES.map((role) => ({ ...role, ...(byKey.get(role.key) || {}) }));
  const defaultKeys = new Set(defaults.map((role) => role.key));
  const custom = (roles || []).filter((role) => role?.key && !defaultKeys.has(role.key));
  return [...defaults, ...custom];
}

function isSystemAdmin(user: SessionUser): boolean {
  return (user.systemPermission || user.role) === 'admin';
}

function isSystemManager(user: SessionUser): boolean {
  const permission = user.systemPermission || user.role;
  return permission === 'admin' || permission === 'maintainer';
}

function normalizeMemberPermission(member?: { projectPermission?: ProjectPermission; role?: ProjectRole }): ProjectPermission {
  if (member?.projectPermission === 'manage' || member?.projectPermission === 'maintain' || member?.projectPermission === 'normal') return member.projectPermission;
  if (member?.role === 'owner') return 'manage';
  if (member?.role === 'tester' || member?.role === 'developer') return 'maintain';
  return 'normal';
}

function normalizeMemberBusinessRole(member?: { businessRoleKey?: BusinessRoleKey; role?: ProjectRole }): BusinessRoleKey {
  if (member?.businessRoleKey) return member.businessRoleKey;
  if (member?.role === 'owner') return 'manager';
  if (member?.role === 'tester' || member?.role === 'developer') return member.role;
  return 'viewer';
}

function normalizeProjectPermission(input?: ProjectPermission, legacyRole?: ProjectRole): ProjectPermission {
  if (input === 'manage' || input === 'maintain' || input === 'normal') return input;
  if (legacyRole === 'owner') return 'manage';
  if (legacyRole === 'tester' || legacyRole === 'developer') return 'maintain';
  return 'normal';
}

function normalizeBusinessRoleKey(input?: BusinessRoleKey, legacyRole?: ProjectRole): BusinessRoleKey {
  if (input) return input;
  if (legacyRole === 'owner') return 'manager';
  if (legacyRole === 'tester' || legacyRole === 'developer') return legacyRole;
  return 'viewer';
}

function legacyRoleOf(permission: ProjectPermission, businessRoleKey: BusinessRoleKey): ProjectRole {
  if (permission === 'manage') return 'owner';
  if (businessRoleKey === 'tester' || businessRoleKey === 'developer') return businessRoleKey;
  return 'viewer';
}

function hasRolePermission(role: BusinessRoleConfig | undefined, module: PermissionModule, action: PermissionAction): boolean {
  return Boolean(role?.permissions?.[module]?.includes(action));
}

function positiveHours(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function trimOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function inferProjectCategory(name?: string, code?: string, description?: string): ProjectCategory {
  const haystack = `${name || ''} ${code || ''} ${description || ''}`.toLowerCase();
  if (/(demo|演示|示例)/.test(haystack)) return 'demo';
  if (/(test|api|html|验收|浏览器|完整|报告|\bqa\b|\be2e\b|\d{6,})/.test(haystack)) return 'test';
  return 'standard';
}
