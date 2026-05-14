import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { TestCase } from '@buggy/shared-types';
import { TestCaseEntity } from '../database/test-case.schema.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import type { CreateTestCaseDto, UpdateTestCaseDto } from '../dto/test-case.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';

@Injectable()
export class TestCaseService {
  constructor(@InjectModel(TestCaseEntity.name) private readonly cases: Model<TestCaseEntity>) {}

  async list(query: ListQueryDto): Promise<TestCase[]> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.requirementId) filter.requirementId = new Types.ObjectId(query.requirementId);
    if (query.status) filter.status = query.status;
    if (query.keyword) filter.title = { $regex: query.keyword, $options: 'i' };
    const rows = await this.cases.find(filter).sort({ updatedAt: -1 });
    return rows.map((row) => this.toDto(row));
  }

  async create(dto: CreateTestCaseDto): Promise<TestCase> {
    const row = await this.cases.create({
      projectId: new Types.ObjectId(dto.projectId),
      requirementId: toObjectId(dto.requirementId),
      title: dto.title,
      preconditions: dto.preconditions || '',
      steps: dto.steps || [],
      expectedResult: dto.expectedResult || '',
      priority: dto.priority || 'P2',
      status: dto.status || 'ready',
      tags: dto.tags || []
    });
    return this.toDto(row);
  }

  async get(id: string): Promise<TestCase> {
    const row = await this.cases.findById(id);
    if (!row) throw new NotFoundException('用例不存在');
    return this.toDto(row);
  }

  async update(id: string, dto: UpdateTestCaseDto): Promise<TestCase> {
    const row = await this.cases.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(dto.requirementId !== undefined ? { requirementId: toObjectId(dto.requirementId) } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.preconditions !== undefined ? { preconditions: dto.preconditions } : {}),
          ...(dto.steps !== undefined ? { steps: dto.steps } : {}),
          ...(dto.expectedResult !== undefined ? { expectedResult: dto.expectedResult } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {})
        }
      },
      { new: true }
    );
    if (!row) throw new NotFoundException('用例不存在');
    return this.toDto(row);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.cases.findByIdAndDelete(id);
    return { deleted: true };
  }

  toDto(row: TestCaseEntity & { _id: unknown }): TestCase {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      requirementId: row.requirementId ? idOf(row.requirementId) : undefined,
      title: row.title,
      preconditions: row.preconditions,
      steps: row.steps.map((step) => ({ action: step.action, expected: step.expected })),
      expectedResult: row.expectedResult,
      priority: row.priority,
      status: row.status,
      tags: row.tags
    };
  }
}
