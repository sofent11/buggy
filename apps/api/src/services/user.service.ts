import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Model } from 'mongoose';
import type { SystemPermission, UserProfile } from '@buggy/shared-types';
import { UserEntity } from '../database/user.schema.js';
import type { CreateUserDto, UpdateUserDto, UserListQueryDto } from '../dto/user.dto.js';
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
    const rows = await this.users.find(filter).sort({ createdAt: -1 }).limit(this.isSystemManager(current) ? 200 : 50);
    return rows.map((row) => this.auth.toProfile(row));
  }

  async create(dto: CreateUserDto, current: SessionUser): Promise<UserProfile> {
    this.assertSystemManager(current);
    const username = dto.username.trim();
    const email = dto.email.toLowerCase().trim();
    const exists = await this.users.exists({ $or: [{ email }, { username }] });
    if (exists) throw new ConflictException('用户名或邮箱已存在');
    const systemPermission = this.requestedSystemPermission(dto.systemPermission || dto.role);
    if (this.permissionOf(current) === 'maintainer' && systemPermission !== 'user') {
      throw new ForbiddenException('维护人员只能创建普通用户');
    }
    const row = await this.users.create({
      username,
      email,
      passwordHash: await hash(dto.password, 10),
      role: systemPermission,
      systemPermission,
      status: dto.status || 'active'
    });
    return this.auth.toProfile(row);
  }

  async update(id: string, dto: UpdateUserDto, current: SessionUser): Promise<UserProfile> {
    this.assertSystemManager(current);
    if (id === current.id && dto.status === 'disabled') throw new ForbiddenException('不能禁用当前账号');
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundException('用户不存在');
    const currentPermission = this.permissionOf(current);
    const targetPermission = this.permissionOf(target);
    const nextPermission = dto.systemPermission || dto.role ? this.requestedSystemPermission(dto.systemPermission || dto.role) : undefined;
    if (currentPermission === 'maintainer') {
      if (targetPermission !== 'user') throw new ForbiddenException('维护人员只能维护普通用户');
      if (nextPermission && nextPermission !== 'user') throw new ForbiddenException('维护人员不能提升系统权限');
    }
    const row = await this.users.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(nextPermission ? { role: nextPermission, systemPermission: nextPermission } : {}),
          ...(dto.status ? { status: dto.status } : {})
        }
      },
      { new: true }
    );
    if (!row) throw new NotFoundException('用户不存在');
    return this.auth.toProfile(row);
  }

  async resetPassword(id: string, current: SessionUser): Promise<{ user: UserProfile; temporaryPassword: string }> {
    this.assertSystemManager(current);
    if (id === current.id) throw new ForbiddenException('不能重置当前账号密码');
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundException('用户不存在');
    if (this.permissionOf(current) === 'maintainer' && this.permissionOf(target) !== 'user') {
      throw new ForbiddenException('维护人员只能重置普通用户密码');
    }
    const temporaryPassword = this.createTemporaryPassword();
    const row = await this.users.findByIdAndUpdate(
      id,
      { $set: { passwordHash: await hash(temporaryPassword, 10) } },
      { new: true }
    );
    if (!row) throw new NotFoundException('用户不存在');
    return { user: this.auth.toProfile(row), temporaryPassword };
  }

  async getById(id: string): Promise<UserEntity & { _id: unknown }> {
    const row = await this.users.findById(id);
    if (!row) throw new NotFoundException('用户不存在');
    return row;
  }

  private assertSystemManager(current: SessionUser): void {
    if (!this.isSystemManager(current)) throw new ForbiddenException('需要系统管理权限');
  }

  private isSystemManager(current: SessionUser): boolean {
    const permission = this.permissionOf(current);
    return permission === 'admin' || permission === 'maintainer';
  }

  private permissionOf(input: SessionUser | UserEntity): SystemPermission {
    if (input.role === 'admin') return 'admin';
    if ('systemPermission' in input && (input.systemPermission === 'admin' || input.systemPermission === 'maintainer' || input.systemPermission === 'user')) return input.systemPermission;
    return 'user';
  }

  private requestedSystemPermission(input?: string): SystemPermission {
    if (input === 'admin' || input === 'maintainer' || input === 'user') return input;
    return input === 'admin' ? 'admin' : 'user';
  }

  private createTemporaryPassword(): string {
    return `Bgy-${randomBytes(9).toString('base64url')}`;
  }
}
