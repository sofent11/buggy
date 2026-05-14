import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { ProjectRole } from '@buggy/shared-types';

export type ProjectDocument = HydratedDocument<ProjectEntity>;

@Schema({ _id: false, versionKey: false })
export class ProjectMemberEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  username!: string;

  @Prop({ type: String, required: true })
  email!: string;

  @Prop({ type: String, required: true, default: 'viewer' })
  role!: ProjectRole;
}

const ProjectMemberSchema = SchemaFactory.createForClass(ProjectMemberEntity);

@Schema({ collection: 'projects', timestamps: true, versionKey: false })
export class ProjectEntity {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, trim: true, default: '' })
  code!: string;

  @Prop({ type: String, trim: true, default: '' })
  description!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity', required: true })
  ownerId!: Types.ObjectId;

  @Prop({ type: [ProjectMemberSchema], default: [] })
  members!: ProjectMemberEntity[];
}

export const ProjectSchema = SchemaFactory.createForClass(ProjectEntity);
ProjectSchema.index({ name: 1 });
