import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { IterationStatus } from '@buggy/shared-types';

export type IterationDocument = HydratedDocument<IterationEntity>;

@Schema({ collection: 'iterations', timestamps: true, versionKey: false })
export class IterationEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, trim: true, default: '' })
  goal!: string;

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ type: String, required: true, default: 'planning' })
  status!: IterationStatus;
}

export const IterationSchema = SchemaFactory.createForClass(IterationEntity);
IterationSchema.index({ projectId: 1, status: 1 });
