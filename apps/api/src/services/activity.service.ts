import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ActivityAction, ActivityEntityType, ActivityLog, PageResult } from '@buggy/shared-types';
import { ActivityEntity } from '../database/activity.schema.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';
import type { SessionUser } from './auth.service.js';

export type RecordActivityInput = {
  projectId: string;
  entityType: ActivityEntityType;
  entityId?: string;
  action: ActivityAction;
  title: string;
  detail?: string;
  actor?: SessionUser;
};

@Injectable()
export class ActivityService {
  constructor(@InjectModel(ActivityEntity.name) private readonly activities: Model<ActivityEntity>) {}

  async list(query: ListQueryDto): Promise<PageResult<ActivityLog>> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.keyword) {
      filter.$or = [
        { title: { $regex: query.keyword, $options: 'i' } },
        { detail: { $regex: query.keyword, $options: 'i' } },
        { actorName: { $regex: query.keyword, $options: 'i' } }
      ];
    }
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const [total, rows] = await Promise.all([
      this.activities.countDocuments(filter),
      this.activities.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return { total, page, pageSize, items: rows.map((row) => this.toDto(row)) };
  }

  async record(input: RecordActivityInput): Promise<void> {
    await this.activities.create({
      projectId: new Types.ObjectId(input.projectId),
      entityType: input.entityType,
      entityId: toObjectId(input.entityId),
      action: input.action,
      title: input.title,
      detail: input.detail || '',
      actorId: input.actor ? new Types.ObjectId(input.actor.id) : undefined,
      actorName: input.actor?.username || ''
    });
  }

  toDto(row: ActivityEntity & { _id: unknown; createdAt?: Date }): ActivityLog {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      entityType: row.entityType,
      entityId: row.entityId ? idOf(row.entityId) : undefined,
      action: row.action,
      title: row.title,
      detail: row.detail,
      actorId: row.actorId ? idOf(row.actorId) : undefined,
      actorName: row.actorName,
      createdAt: row.createdAt?.toISOString() || new Date().toISOString()
    };
  }
}
