import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { SavedView } from '@buggy/shared-types';
import { SavedViewEntity } from '../database/saved-view.schema.js';
import type { UpsertSavedViewDto } from '../dto/saved-view.dto.js';
import { idOf } from '../shared/mongo.js';
import type { SessionUser } from './auth.service.js';

@Injectable()
export class SavedViewService {
  constructor(@InjectModel(SavedViewEntity.name) private readonly views: Model<SavedViewEntity>) {}

  async list(projectId: string, user: SessionUser, tab?: string): Promise<SavedView[]> {
    const filter: Record<string, unknown> = { projectId: new Types.ObjectId(projectId), userId: new Types.ObjectId(user.id) };
    if (tab) filter.tab = tab;
    const rows = await this.views.find(filter).sort({ tab: 1, updatedAt: -1 });
    return rows.map((row) => this.toDto(row));
  }

  async upsert(dto: UpsertSavedViewDto, user: SessionUser): Promise<SavedView> {
    const row = await this.views.findOneAndUpdate(
      {
        projectId: new Types.ObjectId(dto.projectId),
        userId: new Types.ObjectId(user.id),
        tab: dto.tab,
        name: dto.name
      },
      {
        $set: {
          filters: dto.filters || {}
        }
      },
      { new: true, upsert: true }
    );
    return this.toDto(row);
  }

  async remove(id: string, user: SessionUser): Promise<{ deleted: true }> {
    const row = await this.views.findOneAndDelete({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(user.id) });
    if (!row) throw new NotFoundException('保存视图不存在');
    return { deleted: true };
  }

  toDto(row: SavedViewEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }): SavedView {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      userId: idOf(row.userId),
      tab: row.tab,
      name: row.name,
      filters: (row.filters || {}) as SavedView['filters'],
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString()
    };
  }
}
