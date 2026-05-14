import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import type { DictionaryValue } from '@buggy/shared-types';

export type DictionaryDocument = HydratedDocument<DictionaryEntity>;

@Schema({ collection: 'dictionaries', timestamps: true, versionKey: false })
export class DictionaryEntity {
  @Prop({ type: String, required: true, trim: true, index: true })
  type!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity' })
  projectId?: Types.ObjectId;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  values!: DictionaryValue[];
}

export const DictionarySchema = SchemaFactory.createForClass(DictionaryEntity);
DictionarySchema.index({ type: 1, projectId: 1 }, { unique: true, sparse: true });
