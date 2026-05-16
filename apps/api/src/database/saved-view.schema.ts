import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type SavedViewDocument = HydratedDocument<SavedViewEntity>;

@Schema({ collection: 'saved_views', timestamps: true, versionKey: false })
export class SavedViewEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProjectEntity', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'UserEntity', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  tab!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  filters!: Record<string, unknown>;
}

export const SavedViewSchema = SchemaFactory.createForClass(SavedViewEntity);
SavedViewSchema.index({ projectId: 1, userId: 1, tab: 1, name: 1 }, { unique: true });
