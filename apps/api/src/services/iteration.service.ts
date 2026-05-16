import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Iteration, PageResult } from '@buggy/shared-types';
import { IterationEntity } from '../database/iteration.schema.js';
import type { CreateIterationDto, UpdateIterationDto } from '../dto/iteration.dto.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';

@Injectable()
export class IterationService {
  constructor(@InjectModel(IterationEntity.name) private readonly iterations: Model<IterationEntity>) {}

  async list(query: ListQueryDto): Promise<PageResult<Iteration>> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.status) filter.status = query.status;
    if (query.keyword) filter.$or = [{ name: { $regex: query.keyword, $options: 'i' } }, { goal: { $regex: query.keyword, $options: 'i' } }];
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const sort = this.sortOf(query.sortBy, query.sortOrder, { startDate: -1, createdAt: -1 });
    const [total, rows] = await Promise.all([
      this.iterations.countDocuments(filter),
      this.iterations.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return { total, page, pageSize, items: rows.map((row) => this.toDto(row)) };
  }

  async create(dto: CreateIterationDto): Promise<Iteration> {
    const row = await this.iterations.create({
      projectId: new Types.ObjectId(dto.projectId),
      name: dto.name,
      goal: dto.goal || '',
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      status: dto.status || 'planning'
    });
    return this.toDto(row);
  }

  async update(id: string, dto: UpdateIterationDto): Promise<Iteration> {
    const row = await this.iterations.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.goal !== undefined ? { goal: dto.goal } : {}),
          ...(dto.startDate !== undefined ? { startDate: dto.startDate ? new Date(dto.startDate) : undefined } : {}),
          ...(dto.endDate !== undefined ? { endDate: dto.endDate ? new Date(dto.endDate) : undefined } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {})
        }
      },
      { new: true }
    );
    if (!row) throw new NotFoundException('迭代不存在');
    return this.toDto(row);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.iterations.findByIdAndDelete(id);
    return { deleted: true };
  }

  async projectIdOf(id: string): Promise<string> {
    const row = await this.iterations.findById(id).select('projectId');
    if (!row) throw new NotFoundException('迭代不存在');
    return idOf(row.projectId);
  }

  toDto(row: IterationEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }): Iteration {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      name: row.name,
      goal: row.goal,
      startDate: row.startDate?.toISOString(),
      endDate: row.endDate?.toISOString(),
      status: row.status,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString()
    };
  }

  private sortOf(sortBy?: string, sortOrder?: 'asc' | 'desc', fallback: Record<string, 1 | -1> = { updatedAt: -1 }): Record<string, 1 | -1> {
    if (!sortBy) return fallback;
    const allowed = new Set(['name', 'status', 'startDate', 'endDate', 'createdAt', 'updatedAt']);
    return allowed.has(sortBy) ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 } : fallback;
  }
}
