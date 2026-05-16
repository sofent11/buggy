import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { Priority, QualityGateResult, RequirementAcceptanceStatus, RequirementStatus } from '@buggy/shared-types';

export type RequirementDocument = HydratedDocument<RequirementEntity>;

@Schema({ collection: 'requirements', timestamps: true, versionKey: false })
export class RequirementEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'IterationEntity' })
  iterationId?: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({ type: String, trim: true, default: '' })
  description!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  ownerId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  riskOwnerId?: Types.ObjectId;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ type: String, trim: true, default: '' })
  riskNote!: string;

  @Prop({ type: String, required: true, default: 'ready' })
  status!: RequirementStatus;

  @Prop({ type: String, required: true, default: 'P2' })
  priority!: Priority;

  @Prop({ type: String, required: true, default: 'not_ready' })
  acceptanceStatus!: RequirementAcceptanceStatus;

  @Prop({ type: SchemaTypes.Mixed })
  qualityGateResult?: QualityGateResult;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  reviewerId?: Types.ObjectId;

  @Prop({ type: String, trim: true, default: '' })
  larkWebhook!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];
}

export const RequirementSchema = SchemaFactory.createForClass(RequirementEntity);
RequirementSchema.index({ projectId: 1, iterationId: 1, status: 1 });
