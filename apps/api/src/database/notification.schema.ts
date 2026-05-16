import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { ActivityEntityType, NotificationStatus } from '@buggy/shared-types';

export type NotificationDocument = HydratedDocument<NotificationEntity>;

@Schema({ collection: 'notifications', timestamps: true, versionKey: false })
export class NotificationEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity', index: true })
  projectId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({ type: String, trim: true, default: '' })
  body!: string;

  @Prop({ type: String })
  entityType?: ActivityEntityType;

  @Prop({ type: SchemaTypes.ObjectId })
  entityId?: Types.ObjectId;

  @Prop({ type: String, required: true, default: 'unread' })
  status!: NotificationStatus;

  @Prop({ type: Date })
  readAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(NotificationEntity);
NotificationSchema.index({ userId: 1, status: 1, createdAt: -1 });
