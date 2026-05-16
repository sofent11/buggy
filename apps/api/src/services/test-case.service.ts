import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { PageResult, TestCase, TestCaseStep } from '@buggy/shared-types';
import { TestCaseEntity } from '../database/test-case.schema.js';
import type { ListQueryDto } from '../dto/common.dto.js';
import type { CreateTestCaseDto, UpdateTestCaseDto } from '../dto/test-case.dto.js';
import { idOf, toObjectId } from '../shared/mongo.js';

@Injectable()
export class TestCaseService {
  constructor(@InjectModel(TestCaseEntity.name) private readonly cases: Model<TestCaseEntity>) {}

  async list(query: ListQueryDto): Promise<PageResult<TestCase>> {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.requirementId) filter.requirementId = new Types.ObjectId(query.requirementId);
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.keyword) {
      filter.$or = [
        { title: { $regex: query.keyword, $options: 'i' } },
        { preconditions: { $regex: query.keyword, $options: 'i' } },
        { expectedResult: { $regex: query.keyword, $options: 'i' } },
        { tags: { $regex: query.keyword, $options: 'i' } }
      ];
    }
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const sort = this.sortOf(query.sortBy, query.sortOrder);
    const [total, rows] = await Promise.all([
      this.cases.countDocuments(filter),
      this.cases.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize)
    ]);
    return { total, page, pageSize, items: rows.map((row) => this.toDto(row)) };
  }

  async create(dto: CreateTestCaseDto): Promise<TestCase> {
    const row = await this.cases.create({
      projectId: new Types.ObjectId(dto.projectId),
      requirementId: toObjectId(dto.requirementId),
      title: dto.title,
      preconditions: dto.preconditions || '',
      steps: this.normalizeSteps(dto.steps || []),
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
          ...(dto.steps !== undefined ? { steps: this.normalizeSteps(dto.steps) } : {}),
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

  async projectIdOf(id: string): Promise<string> {
    const row = await this.cases.findById(id).select('projectId');
    if (!row) throw new NotFoundException('用例不存在');
    return idOf(row.projectId);
  }

  toDto(row: TestCaseEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }): TestCase {
    return {
      id: idOf(row._id),
      projectId: idOf(row.projectId),
      requirementId: row.requirementId ? idOf(row.requirementId) : undefined,
      title: row.title,
      preconditions: row.preconditions,
      steps: this.normalizeSteps(row.steps),
      expectedResult: row.expectedResult,
      priority: row.priority,
      status: row.status,
      tags: row.tags,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString()
    };
  }

  private normalizeSteps(steps: Array<Partial<TestCaseStep>>): TestCaseStep[] {
    return steps
      .map((step, index) => ({
        id: step.id || new Types.ObjectId().toString(),
        action: String(step.action || '').trim(),
        expected: String(step.expected || '').trim(),
        sort: typeof step.sort === 'number' ? step.sort : index + 1
      }))
      .filter((step) => step.action || step.expected)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }

  private sortOf(sortBy?: string, sortOrder?: 'asc' | 'desc'): Record<string, 1 | -1> {
    const allowed = new Set(['title', 'status', 'priority', 'createdAt', 'updatedAt']);
    if (!sortBy || !allowed.has(sortBy)) return { updatedAt: -1 };
    return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
  }
}
