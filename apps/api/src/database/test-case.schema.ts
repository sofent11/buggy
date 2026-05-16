import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { Priority, TestCaseAutomationStatus, TestCaseReviewStatus, TestCaseStatus } from '@buggy/shared-types';

export type TestCaseDocument = HydratedDocument<TestCaseEntity>;

@Schema({ _id: false, versionKey: false })
export class TestCaseStepEntity {
  @Prop({ type: String, trim: true })
  id?: string;

  @Prop({ type: String, required: true, trim: true })
  action!: string;

  @Prop({ type: String, required: true, trim: true })
  expected!: string;

  @Prop({ type: Number, default: 0 })
  sort!: number;
}

const TestCaseStepSchema = SchemaFactory.createForClass(TestCaseStepEntity);

@Schema({ collection: 'test_cases', timestamps: true, versionKey: false })
export class TestCaseEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'RequirementEntity' })
  requirementId?: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({ type: String, trim: true, default: '' })
  preconditions!: string;

  @Prop({ type: [TestCaseStepSchema], default: [] })
  steps!: TestCaseStepEntity[];

  @Prop({ type: String, trim: true, default: '' })
  expectedResult!: string;

  @Prop({ type: String, required: true, default: 'P2' })
  priority!: Priority;

  @Prop({ type: String, required: true, default: 'ready' })
  status!: TestCaseStatus;

  @Prop({ type: String, trim: true, default: '' })
  module!: string;

  @Prop({ type: String, trim: true, default: '' })
  suiteId!: string;

  @Prop({ type: String, trim: true, default: 'v1' })
  version!: string;

  @Prop({ type: String, required: true, default: 'draft' })
  reviewStatus!: TestCaseReviewStatus;

  @Prop({ type: String, required: true, default: 'manual' })
  automationStatus!: TestCaseAutomationStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  ownerId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  tags!: string[];
}

export const TestCaseSchema = SchemaFactory.createForClass(TestCaseEntity);
TestCaseSchema.index({ projectId: 1, requirementId: 1, status: 1 });
