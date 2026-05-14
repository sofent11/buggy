import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { TestCaseStep, TestPlanStatus, TestRunStatus } from '@buggy/shared-types';

export type TestPlanDocument = HydratedDocument<TestPlanEntity>;

@Schema({ _id: true, versionKey: false })
export class TestRunItemEntity {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'TestCaseEntity', required: true })
  caseId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  caseTitle!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'RequirementEntity' })
  requirementId?: Types.ObjectId;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  steps!: TestCaseStep[];

  @Prop({ type: String, default: '' })
  expectedResult!: string;

  @Prop({ type: String, required: true, default: 'untested' })
  status!: TestRunStatus;

  @Prop({ type: String, default: '' })
  actualResult!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  executorId?: Types.ObjectId;

  @Prop({ type: Date })
  executedAt?: Date;

  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  bugIds!: Types.ObjectId[];
}

const TestRunItemSchema = SchemaFactory.createForClass(TestRunItemEntity);

@Schema({ collection: 'test_plans', timestamps: true, versionKey: false })
export class TestPlanEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'IterationEntity' })
  iterationId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'RequirementEntity' })
  requirementId?: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, default: '第 1 轮' })
  round!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  ownerId?: Types.ObjectId;

  @Prop({ type: String, required: true, default: 'draft' })
  status!: TestPlanStatus;

  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  caseIds!: Types.ObjectId[];

  @Prop({ type: [TestRunItemSchema], default: [] })
  runItems!: TestRunItemEntity[];
}

export const TestPlanSchema = SchemaFactory.createForClass(TestPlanEntity);
TestPlanSchema.index({ projectId: 1, requirementId: 1, status: 1 });
