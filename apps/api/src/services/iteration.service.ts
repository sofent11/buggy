import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Iteration } from '@buggy/shared-types';
import { IterationEntity } from '../database/iteration.schema.js';
import type { CreateIterationDto, UpdateIterationDto } from '../dto/iteration.dto.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';

@Injectable()
export class IterationService {
  constructor(@InjectModel(IterationEntity.name) private readonly iterations: Model<IterationEntity>) {}

  async list(query: ListQueryDto): Promise<Iteration[]> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.status) filter.status = query.status;
    const rows = await this.iterations.find(filter).sort({ startDate: -1, createdAt: -1 });
    return rows.map((row) => this.toDto(row));
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

  toDto(row: IterationEntity & { _id: unknown }): Iteration {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      name: row.name,
      goal: row.goal,
      startDate: row.startDate?.toISOString(),
      endDate: row.endDate?.toISOString(),
      status: row.status
    };
  }
}
