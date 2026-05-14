import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DEFAULT_DICTIONARIES, type Dictionary } from '@buggy/shared-types';
import { DictionaryEntity } from '../database/dictionary.schema.js';
import type { UpsertDictionaryDto } from '../dto/dictionary.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';

@Injectable()
export class DictionaryService {
  constructor(@InjectModel(DictionaryEntity.name) private readonly dictionaries: Model<DictionaryEntity>) {}

  async list(projectId?: string): Promise<Dictionary[]> {
    const rows = await this.dictionaries.find({
      $or: [{ projectId: { $exists: false } }, ...(projectId ? [{ projectId: toObjectId(projectId) }] : [])]
    });
    const existing = new Map(rows.map((row) => [`${row.type}:${row.projectId ? idOf(row.projectId) : 'global'}`, row]));
    const defaults = Object.entries(DEFAULT_DICTIONARIES).map(([type, values]) => ({
      id: `default-${type}`,
      type,
      values
    }));
    return [
      ...defaults.filter((item) => !existing.has(`${item.type}:global`)),
      ...rows.map((row) => this.toDto(row))
    ];
  }

  async upsert(dto: UpsertDictionaryDto): Promise<Dictionary> {
    const row = await this.dictionaries.findOneAndUpdate(
      { type: dto.type, ...(dto.projectId ? { projectId: toObjectId(dto.projectId) } : { projectId: { $exists: false } }) },
      { $set: { values: dto.values, ...(dto.projectId ? { projectId: toObjectId(dto.projectId) } : {}) } },
      { new: true, upsert: true }
    );
    return this.toDto(row);
  }

  toDto(row: DictionaryEntity & { _id: unknown }): Dictionary {
    return {
      id: idOf(row._id),
      type: row.type,
      projectId: row.projectId ? idOf(row.projectId) : undefined,
      values: row.values
    };
  }
}
