import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Dictionary, DictionaryValue } from '@buggy/shared-types';
import { DictionaryEntity } from '../database/dictionary.schema.js';
import type { UpsertDictionaryDto } from '../dto/dictionary.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';

const DEFAULT_DICTIONARIES: Record<string, DictionaryValue[]> = {
  iterationStatus: [
    { key: 'planning', label: '规划中', sort: 10, enabled: true, color: '#64748b' },
    { key: 'active', label: '进行中', sort: 20, enabled: true, color: '#2563eb' },
    { key: 'done', label: '已完成', sort: 30, enabled: true, color: '#16a34a' },
    { key: 'archived', label: '已归档', sort: 40, enabled: true, color: '#475569' }
  ],
  requirementStatus: [
    { key: 'draft', label: '草稿', sort: 10, enabled: true, color: '#64748b' },
    { key: 'ready', label: '待测试', sort: 20, enabled: true, color: '#2563eb' },
    { key: 'testing', label: '测试中', sort: 30, enabled: true, color: '#d97706' },
    { key: 'done', label: '已完成', sort: 40, enabled: true, color: '#16a34a' },
    { key: 'blocked', label: '阻塞', sort: 50, enabled: true, color: '#dc2626' }
  ],
  testCaseStatus: [
    { key: 'draft', label: '草稿', sort: 10, enabled: true, color: '#64748b' },
    { key: 'ready', label: '待测试', sort: 20, enabled: true, color: '#16a34a' },
    { key: 'deprecated', label: '已废弃', sort: 30, enabled: true, color: '#dc2626' }
  ],
  testPlanStatus: [
    { key: 'draft', label: '草稿', sort: 10, enabled: true, color: '#64748b' },
    { key: 'active', label: '进行中', sort: 20, enabled: true, color: '#2563eb' },
    { key: 'done', label: '已完成', sort: 30, enabled: true, color: '#16a34a' },
    { key: 'archived', label: '已归档', sort: 40, enabled: true, color: '#475569' }
  ],
  testRunStatus: [
    { key: 'untested', label: '未测', sort: 10, enabled: true, color: '#64748b' },
    { key: 'passed', label: '通过', sort: 20, enabled: true, color: '#16a34a' },
    { key: 'failed', label: '失败', sort: 30, enabled: true, color: '#dc2626' },
    { key: 'blocked', label: '阻塞', sort: 40, enabled: true, color: '#d97706' },
    { key: 'skipped', label: '跳过', sort: 50, enabled: true, color: '#475569' }
  ],
  bugStatus: [
    { key: 'open', label: '新建', sort: 10, enabled: true, color: '#dc2626' },
    { key: 'in_progress', label: '处理中', sort: 20, enabled: true, color: '#d97706' },
    { key: 'resolved', label: '已解决', sort: 30, enabled: true, color: '#2563eb' },
    { key: 'verified', label: '已验证', sort: 40, enabled: true, color: '#16a34a' },
    { key: 'closed', label: '已关闭', sort: 50, enabled: true, color: '#64748b' },
    { key: 'reopened', label: '重新打开', sort: 60, enabled: true, color: '#7c3aed' }
  ],
  priority: [
    { key: 'P0', label: 'P0', sort: 10, enabled: true, color: '#b91c1c' },
    { key: 'P1', label: 'P1', sort: 20, enabled: true, color: '#dc2626' },
    { key: 'P2', label: 'P2', sort: 30, enabled: true, color: '#d97706' },
    { key: 'P3', label: 'P3', sort: 40, enabled: true, color: '#2563eb' }
  ],
  severity: [
    { key: 'S0', label: 'S0 致命', sort: 10, enabled: true, color: '#b91c1c' },
    { key: 'S1', label: 'S1 严重', sort: 20, enabled: true, color: '#dc2626' },
    { key: 'S2', label: 'S2 一般', sort: 30, enabled: true, color: '#d97706' },
    { key: 'S3', label: 'S3 轻微', sort: 40, enabled: true, color: '#2563eb' }
  ]
};

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
