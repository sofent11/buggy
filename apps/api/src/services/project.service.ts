import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { PageResult, Project, ProjectCategory, ProjectMember, ProjectRole, ProjectStatus } from '@buggy/shared-types';
import { ProjectEntity } from '../database/project.schema.js';
import { UserEntity } from '../database/user.schema.js';
import type { CreateProjectDto, UpdateProjectDto, UpsertProjectMemberDto } from '../dto/project.dto.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';
import type { SessionUser } from './auth.service.js';

@Injectable()
export class ProjectService {
  constructor(
    @InjectModel(ProjectEntity.name) private readonly projects: Model<ProjectEntity>,
    @InjectModel(UserEntity.name) private readonly users: Model<UserEntity>
  ) {}

  async list(user: SessionUser, query: ListQueryDto = {}): Promise<PageResult<Project>> {
    const accessFilter =
      user.role === 'admin'
        ? {}
        : {
            $or: [{ ownerId: new Types.ObjectId(user.id) }, { 'members.userId': new Types.ObjectId(user.id) }]
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
    const [total, rows] = await Promise.all([
      this.projects.countDocuments(filter),
      this.projects.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return { total, page, pageSize, items: rows.map((row) => this.toDto(row)) };
  }

  async create(dto: CreateProjectDto, user: SessionUser): Promise<Project> {
    const ownerId = new Types.ObjectId(user.id);
    const project = await this.projects.create({
      name: dto.name,
      code: dto.code || '',
      description: dto.description || '',
      status: dto.status || 'active',
      category: dto.category || inferProjectCategory(dto.name, dto.code, dto.description),
      ownerId,
      members: [{ userId: ownerId, username: user.username, email: user.email, role: 'owner' }]
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
          ...(dto.category !== undefined ? { category: dto.category } : {})
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

    const member = {
      userId: memberUser._id as Types.ObjectId,
      username: memberUser.username,
      email: memberUser.email,
      role: dto.role
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
    if (user.role === 'admin') return true;
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
    if (user.role === 'admin') return;
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('项目不存在');
    const member = project.members.find((item) => idOf(item.userId) === user.id);
    if (idOf(project.ownerId) === user.id || member?.role === 'owner') return;
    throw new ForbiddenException('需要项目负责人权限');
  }

  async assertWrite(projectId: string, user: SessionUser): Promise<void> {
    if (user.role === 'admin') return;
    const role = await this.roleOf(projectId, user);
    if (role && role !== 'viewer') return;
    throw new ForbiddenException('需要项目编辑权限');
  }

  async assertRole(projectId: string, user: SessionUser, roles: ProjectRole[]): Promise<void> {
    if (user.role === 'admin') return;
    const role = await this.roleOf(projectId, user);
    if (role && roles.includes(role)) return;
    throw new ForbiddenException('当前角色无权执行该操作');
  }

  async roleOf(projectId: string, user: SessionUser): Promise<ProjectRole | undefined> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('项目不存在');
    if (idOf(project.ownerId) === user.id) return 'owner';
    return project.members.find((item) => idOf(item.userId) === user.id)?.role as ProjectRole | undefined;
  }

  toDto(project: ProjectEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }): Project {
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
          role: member.role as ProjectRole
        })
      ),
      createdAt: project.createdAt?.toISOString(),
      updatedAt: project.updatedAt?.toISOString()
    };
  }
}

function inferProjectCategory(name?: string, code?: string, description?: string): ProjectCategory {
  const haystack = `${name || ''} ${code || ''} ${description || ''}`.toLowerCase();
  if (/(demo|演示|示例)/.test(haystack)) return 'demo';
  if (/(test|api|html|验收|浏览器|完整|报告|\bqa\b|\be2e\b|\d{6,})/.test(haystack)) return 'test';
  return 'standard';
}
