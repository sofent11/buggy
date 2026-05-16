import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { BugStatus, Priority, Severity } from '@buggy/shared-types';

export type BugDocument = HydratedDocument<BugEntity>;

@Schema({ collection: 'bugs', timestamps: true, versionKey: false })
export class BugEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'IterationEntity' })
  iterationId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'RequirementEntity' })
  requirementId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'TestCaseEntity' })
  testCaseId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'TestPlanEntity' })
  testPlanId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId })
  runItemId?: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({ type: String, trim: true, default: '' })
  reproduceSteps!: string;

  @Prop({ type: String, trim: true, default: '' })
  expectedResult!: string;

  @Prop({ type: String, trim: true, default: '' })
  actualResult!: string;

  @Prop({ type: String, required: true, default: 'S2' })
  severity!: Severity;

  @Prop({ type: String, required: true, default: 'P2' })
  priority!: Priority;

  @Prop({ type: String, required: true, default: 'open' })
  status!: BugStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  assigneeId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  reporterId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'BugEntity' })
  duplicateOfId?: Types.ObjectId;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  comments!: Array<{ id: string; authorId?: string; authorName?: string; body: string; createdAt: string }>;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  attachments!: Array<{ id: string; name: string; url: string; createdAt: string }>;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  statusHistory!: Array<{ id: string; fromStatus?: BugStatus; toStatus: BugStatus; operatorId?: string; operatorName?: string; note?: string; createdAt: string }>;
}

export const BugSchema = SchemaFactory.createForClass(BugEntity);
BugSchema.index({ projectId: 1, requirementId: 1, status: 1 });
