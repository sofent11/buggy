import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Requirement } from '@buggy/shared-types';
import { RequirementEntity } from '../database/requirement.schema.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import type { BindLarkDto, CreateRequirementDto, UpdateRequirementDto } from '../dto/requirement.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';

@Injectable()
export class RequirementService {
  constructor(@InjectModel(RequirementEntity.name) private readonly requirements: Model<RequirementEntity>) {}

  async list(query: ListQueryDto): Promise<Requirement[]> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.iterationId) filter.iterationId = new Types.ObjectId(query.iterationId);
    if (query.status) filter.status = query.status;
    if (query.keyword) filter.title = { $regex: query.keyword, $options: 'i' };
    const rows = await this.requirements.find(filter).sort({ updatedAt: -1 });
    return rows.map((row) => this.toDto(row));
  }

  async create(dto: CreateRequirementDto): Promise<Requirement> {
    const row = await this.requirements.create({
      projectId: new Types.ObjectId(dto.projectId),
      iterationId: toObjectId(dto.iterationId),
      title: dto.title,
      description: dto.description || '',
      ownerId: toObjectId(dto.ownerId),
      status: dto.status || 'ready',
      priority: dto.priority || 'P2',
      larkWebhook: dto.larkWebhook || '',
      tags: dto.tags || []
    });
    return this.toDto(row);
  }

  async get(id: string): Promise<Requirement> {
    const row = await this.requirements.findById(id);
    if (!row) throw new NotFoundException('需求不存在');
    return this.toDto(row);
  }

  async update(id: string, dto: UpdateRequirementDto): Promise<Requirement> {
    const row = await this.requirements.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(dto.iterationId !== undefined ? { iterationId: toObjectId(dto.iterationId) } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.ownerId !== undefined ? { ownerId: toObjectId(dto.ownerId) } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.larkWebhook !== undefined ? { larkWebhook: dto.larkWebhook } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {})
        }
      },
      { new: true }
    );
    if (!row) throw new NotFoundException('需求不存在');
    return this.toDto(row);
  }

  async bindLark(id: string, dto: BindLarkDto): Promise<Requirement> {
    const row = await this.requirements.findByIdAndUpdate(id, { $set: { larkWebhook: dto.larkWebhook } }, { new: true });
    if (!row) throw new NotFoundException('需求不存在');
    return this.toDto(row);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.requirements.findByIdAndDelete(id);
    return { deleted: true };
  }

  toDto(row: RequirementEntity & { _id: unknown }): Requirement {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      iterationId: row.iterationId ? idOf(row.iterationId) : undefined,
      title: row.title,
      description: row.description,
      ownerId: row.ownerId ? idOf(row.ownerId) : undefined,
      status: row.status,
      priority: row.priority,
      larkWebhook: row.larkWebhook,
      tags: row.tags
    };
  }
}
