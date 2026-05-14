import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BugEntity } from '../database/bug.schema.js';
import { IterationEntity } from '../database/iteration.schema.js';
import { RequirementEntity } from '../database/requirement.schema.js';
import { TestCaseEntity } from '../database/test-case.schema.js';
import { TestPlanEntity } from '../database/test-plan.schema.js';

@Injectable()
export class ProjectCleanupService {
  constructor(
    @InjectModel(IterationEntity.name) private readonly iterations: Model<IterationEntity>,
    @InjectModel(RequirementEntity.name) private readonly requirements: Model<RequirementEntity>,
    @InjectModel(TestCaseEntity.name) private readonly cases: Model<TestCaseEntity>,
    @InjectModel(TestPlanEntity.name) private readonly plans: Model<TestPlanEntity>,
    @InjectModel(BugEntity.name) private readonly bugs: Model<BugEntity>
  ) {}

  async removeProjectData(projectId: string): Promise<void> {
    const id = new Types.ObjectId(projectId);
    await Promise.all([
      this.iterations.deleteMany({ projectId: id }),
      this.requirements.deleteMany({ projectId: id }),
      this.cases.deleteMany({ projectId: id }),
      this.plans.deleteMany({ projectId: id }),
      this.bugs.deleteMany({ projectId: id })
    ]);
  }
}
