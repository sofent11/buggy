import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { SystemRole, UserStatus } from '@buggy/shared-types';

export type UserDocument = HydratedDocument<UserEntity>;

@Schema({ collection: 'users', timestamps: true, versionKey: false })
export class UserEntity {
  @Prop({ type: String, required: true, trim: true, unique: true })
  username!: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true, unique: true })
  email!: string;

  @Prop({ type: String, required: true })
  passwordHash!: string;

  @Prop({ type: String, required: true, default: 'tester' })
  role!: SystemRole;

  @Prop({ type: String, required: true, default: 'active' })
  status!: UserStatus;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
