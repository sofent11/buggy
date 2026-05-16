import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ActivityEntityType, Notification, PageResult } from '@buggy/shared-types';
import { NotificationEntity } from '../database/notification.schema.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';
import type { SessionUser } from './auth.service.js';

export type CreateNotificationInput = {
  userId?: string;
  projectId?: string;
  title: string;
  body?: string;
  entityType?: ActivityEntityType;
  entityId?: string;
  actorId?: string;
};

@Injectable()
export class NotificationService {
  constructor(@InjectModel(NotificationEntity.name) private readonly notifications: Model<NotificationEntity>) {}

  async list(user: SessionUser, query: ListQueryDto): Promise<PageResult<Notification>> {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(user.id) };
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.status) filter.status = query.status;
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const [total, rows] = await Promise.all([
      this.notifications.countDocuments(filter),
      this.notifications.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return { total, page, pageSize, items: rows.map((row) => this.toDto(row)) };
  }

  async create(input: CreateNotificationInput): Promise<void> {
    if (!input.userId || input.userId === input.actorId) return;
    await this.notifications.create({
      userId: new Types.ObjectId(input.userId),
      projectId: toObjectId(input.projectId),
      title: input.title,
      body: input.body || '',
      entityType: input.entityType,
      entityId: toObjectId(input.entityId),
      status: 'unread'
    });
  }

  async markRead(id: string, user: SessionUser): Promise<Notification> {
    const row = await this.notifications.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId: new Types.ObjectId(user.id) },
      { $set: { status: 'read', readAt: new Date() } },
      { new: true }
    );
    if (!row) throw new NotFoundException('通知不存在');
    return this.toDto(row);
  }

  async markAllRead(user: SessionUser): Promise<{ updated: number }> {
    const result = await this.notifications.updateMany(
      { userId: new Types.ObjectId(user.id), status: 'unread' },
      { $set: { status: 'read', readAt: new Date() } }
    );
    return { updated: result.modifiedCount };
  }

  toDto(row: NotificationEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }): Notification {
    return {
      id: idOf(row._id),
      projectId: row.projectId ? idOf(row.projectId) : undefined,
      userId: idOf(row.userId),
      title: row.title,
      body: row.body,
      entityType: row.entityType,
      entityId: row.entityId ? idOf(row.entityId) : undefined,
      status: row.status,
      createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
      readAt: row.readAt?.toISOString()
    };
  }
}
