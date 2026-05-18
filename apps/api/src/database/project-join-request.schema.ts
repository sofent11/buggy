import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { BusinessRoleKey, JoinRequestStatus, ProjectPermission } from '@buggy/shared-types';

export type ProjectJoinRequestDocument = HydratedDocument<ProjectJoinRequestEntity>;

@Schema({ collection: 'project_join_requests', timestamps: true, versionKey: false })
export class ProjectJoinRequestEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity', required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  username!: string;

  @Prop({ type: String, required: true })
  email!: string;

  @Prop({ type: String, required: true, default: 'pending', enum: ['pending', 'approved', 'rejected'] })
  status!: JoinRequestStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity' })
  decidedBy?: Types.ObjectId;

  @Prop({ type: String })
  decidedByName?: string;

  @Prop({ type: Date })
  decidedAt?: Date;

  @Prop({ type: String, enum: ['manage', 'maintain', 'normal'] })
  projectPermission?: ProjectPermission;

  @Prop({ type: String })
  businessRoleKey?: BusinessRoleKey;
}

export const ProjectJoinRequestSchema = SchemaFactory.createForClass(ProjectJoinRequestEntity);
ProjectJoinRequestSchema.index({ projectId: 1, userId: 1, status: 1 });
