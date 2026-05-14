import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { UserProfile } from '@buggy/shared-types';
import { UserEntity } from '../database/user.schema.js';
import type { UpdateUserDto, UserListQueryDto } from '../dto/user.dto.js';
import { idOf } from '../shared/mongo.js';
import type { SessionUser } from './auth.service.js';
import { AuthService } from './auth.service.js';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(UserEntity.name) private readonly users: Model<UserEntity>,
    private readonly auth: AuthService
  ) {}

  async list(query: UserListQueryDto, current: SessionUser): Promise<UserProfile[]> {
    const filter: Record<string, unknown> = {};
    if (query.keyword) {
      filter.$or = [
        { username: { $regex: query.keyword, $options: 'i' } },
        { email: { $regex: query.keyword, $options: 'i' } }
      ];
    }
    const rows = await this.users.find(filter).sort({ createdAt: -1 }).limit(current.role === 'admin' ? 200 : 50);
    return rows.map((row) => this.auth.toProfile(row));
  }

  async update(id: string, dto: UpdateUserDto, current: SessionUser): Promise<UserProfile> {
    if (current.role !== 'admin') throw new ForbiddenException('需要管理员权限');
    if (id === current.id && dto.status === 'disabled') throw new ForbiddenException('不能禁用当前账号');
    const row = await this.users.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(dto.role ? { role: dto.role } : {}),
          ...(dto.status ? { status: dto.status } : {})
        }
      },
      { new: true }
    );
    if (!row) throw new NotFoundException('用户不存在');
    return this.auth.toProfile(row);
  }

  async getById(id: string): Promise<UserEntity & { _id: unknown }> {
    const row = await this.users.findById(id);
    if (!row) throw new NotFoundException('用户不存在');
    return row;
  }
}
