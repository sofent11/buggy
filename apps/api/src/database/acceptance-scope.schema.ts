import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { AcceptanceReportSnapshot, AcceptanceScope, QualityGateResult, QualityGateRule, ReportSignoff, RiskWaiver } from '@buggy/shared-types';

export type AcceptanceScopeDocument = HydratedDocument<AcceptanceScopeEntity>;

@Schema({ collection: 'acceptance_scopes', timestamps: true, versionKey: false })
export class AcceptanceScopeEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, trim: true, default: '' })
  description!: string;

  @Prop({ type: String, required: true, default: 'draft' })
  status!: AcceptanceScope['status'];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  ownerId?: Types.ObjectId;

  @Prop({ type: Date })
  targetDate?: Date;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'IterationEntity', default: [] })
  iterationIds!: Types.ObjectId[];

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'RequirementEntity', default: [] })
  requirementIds!: Types.ObjectId[];

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'TestPlanEntity', default: [] })
  testPlanIds!: Types.ObjectId[];

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'BugEntity', default: [] })
  bugIds!: Types.ObjectId[];

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  qualityGateRules!: QualityGateRule[];

  @Prop({ type: SchemaTypes.Mixed })
  qualityGateResult?: QualityGateResult;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  riskWaivers!: RiskWaiver[];

  @Prop({ type: SchemaTypes.Mixed })
  reportSignoff?: ReportSignoff;

  @Prop({ type: SchemaTypes.Mixed })
  reportSnapshot?: AcceptanceReportSnapshot;
}

export const AcceptanceScopeSchema = SchemaFactory.createForClass(AcceptanceScopeEntity);
AcceptanceScopeSchema.index({ projectId: 1, status: 1, updatedAt: -1 });
