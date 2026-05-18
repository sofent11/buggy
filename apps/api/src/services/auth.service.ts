import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { compare, hash } from 'bcryptjs';
import { parse, serialize } from 'cookie';
import jwt from 'jsonwebtoken';
import { Model } from 'mongoose';
import type { FastifyRequest } from 'fastify';
import type { SystemPermission, UserProfile } from '@buggy/shared-types';
import { UserEntity } from '../database/user.schema.js';
import type { ChangePasswordDto, LoginDto, RegisterDto } from '../dto/auth.dto.js';
import { idOf } from '../shared/mongo.js';

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  systemPermission: SystemPermission;
  role: SystemPermission;
}

interface JwtPayload {
  sub: string;
}

@Injectable()
export class AuthService {
  private readonly cookieName = 'buggy_session';

  constructor(@InjectModel(UserEntity.name) private readonly users: Model<UserEntity>) {}

  async register(dto: RegisterDto): Promise<{ user: UserProfile; cookies: string[] }> {
    const count = await this.users.countDocuments();

    const exists = await this.users.exists({ $or: [{ email: dto.email.toLowerCase() }, { username: dto.username }] });
    if (exists) throw new ConflictException('用户名或邮箱已存在');
    const systemPermission: SystemPermission = count === 0 ? 'admin' : 'user';

    const user = await this.users.create({
      username: dto.username,
      email: dto.email.toLowerCase(),
      passwordHash: await hash(dto.password, 10),
      role: systemPermission,
      systemPermission,
      status: 'active'
    });
    return { user: this.toProfile(user, await this.resolveSystemPermission(user)), cookies: this.buildCookies(idOf(user._id)) };
  }

  async login(dto: LoginDto): Promise<{ user: UserProfile; cookies: string[] }> {
    const user = await this.users.findOne({ email: dto.email.toLowerCase() });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    if (user.status !== 'active') throw new UnauthorizedException('账号已禁用');
    return { user: this.toProfile(user, await this.resolveSystemPermission(user)), cookies: this.buildCookies(idOf(user._id)) };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') throw new UnauthorizedException('请先登录');
    if (!(await compare(dto.currentPassword, user.passwordHash))) throw new UnauthorizedException('当前密码错误');
    if (await compare(dto.newPassword, user.passwordHash)) throw new BadRequestException('新密码不能与当前密码相同');

    user.passwordHash = await hash(dto.newPassword, 10);
    const row = await user.save();
    return this.toProfile(row, await this.resolveSystemPermission(row));
  }

  async getCurrentUser(req: FastifyRequest): Promise<SessionUser | null> {
    const rawCookie = req.headers.cookie || '';
    const token = parse(rawCookie)[this.cookieName];
    if (!token) return null;
    try {
      const payload = jwt.verify(token, this.secret) as JwtPayload;
      const user = await this.users.findById(payload.sub);
      if (!user || user.status !== 'active') return null;
      const systemPermission = await this.resolveSystemPermission(user);
      return {
        id: idOf(user._id),
        username: user.username,
        email: user.email,
        systemPermission,
        role: systemPermission
      };
    } catch {
      return null;
    }
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const user = await this.users.findById(userId);
    return user ? this.toProfile(user, await this.resolveSystemPermission(user)) : null;
  }

  logoutCookies(): string[] {
    const expires = new Date(0);
    return [
      serialize(this.cookieName, '', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        expires,
        maxAge: 0
      }),
      serialize(this.cookieName, '', {
        path: '/api',
        httpOnly: true,
        sameSite: 'lax',
        expires,
        maxAge: 0
      })
    ];
  }

  private buildCookies(userId: string): string[] {
    const token = jwt.sign({ sub: userId }, this.secret, { expiresIn: '7d' });
    return [
      serialize(this.cookieName, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60
      })
    ];
  }

  private get secret(): string {
    return process.env.SESSION_SECRET || 'buggy-local-session-secret';
  }

  toProfile(user: UserEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }, permission?: SystemPermission): UserProfile {
    const systemPermission = permission || this.normalizeSystemPermission(user);
    return {
      id: idOf(user._id),
      username: user.username,
      email: user.email,
      systemPermission,
      role: systemPermission,
      status: user.status,
      createdAt: user.createdAt?.toISOString(),
      updatedAt: user.updatedAt?.toISOString()
    };
  }

  private async resolveSystemPermission(user: UserEntity & { _id: unknown }): Promise<SystemPermission> {
    const permission = this.normalizeSystemPermission(user);
    if (permission === 'admin' || permission === 'maintainer') return permission;
    const hasAdmin = await this.users.exists({ status: 'active', $or: [{ systemPermission: 'admin' }, { role: 'admin' }] });
    if (hasAdmin) return permission;
    const firstActiveUser = await this.users.findOne({ status: 'active' }).sort({ createdAt: 1, _id: 1 }).select('_id');
    if (!firstActiveUser || idOf(firstActiveUser._id) !== idOf(user._id)) return permission;
    await this.users.findByIdAndUpdate(user._id, { $set: { role: 'admin', systemPermission: 'admin' } });
    return 'admin';
  }

  private normalizeSystemPermission(user: Pick<UserEntity, 'role' | 'systemPermission'>): SystemPermission {
    if (user.role === 'admin') return 'admin';
    if (user.systemPermission === 'admin' || user.systemPermission === 'maintainer' || user.systemPermission === 'user') return user.systemPermission;
    return 'user';
  }
}
