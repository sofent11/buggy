import { Types } from 'mongoose';

export function toObjectId(value: string | undefined | null): Types.ObjectId | undefined {
  if (!value) return undefined;
  if (!Types.ObjectId.isValid(value)) return undefined;
  return new Types.ObjectId(value);
}

export function idOf(value: unknown): string {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (value && typeof value === 'object' && '_id' in value) return idOf((value as { _id: unknown })._id);
  return String(value || '');
}

export function nowDate() {
  return new Date();
}
