import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { ActivityAction, ActivityEntityType } from '@buggy/shared-types';

export type ActivityDocument = HydratedDocument<ActivityEntity>;

@Schema({ collection: 'activities', timestamps: true, versionKey: false })
export class ActivityEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  entityType!: ActivityEntityType;

  @Prop({ type: SchemaTypes.ObjectId })
  entityId?: Types.ObjectId;

  @Prop({ type: String, required: true })
  action!: ActivityAction;

  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({ type: String, trim: true, default: '' })
  detail!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  actorId?: Types.ObjectId;

  @Prop({ type: String, trim: true, default: '' })
  actorName!: string;
}

export const ActivitySchema = SchemaFactory.createForClass(ActivityEntity);
ActivitySchema.index({ projectId: 1, createdAt: -1 });
ActivitySchema.index({ projectId: 1, entityType: 1, entityId: 1 });
