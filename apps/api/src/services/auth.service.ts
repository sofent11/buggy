import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { compare, hash } from 'bcryptjs';
import { parse, serialize } from 'cookie';
import jwt from 'jsonwebtoken';
import { Model } from 'mongoose';
import type { FastifyRequest } from 'fastify';
import type { SystemPermission, UserProfile } from '@buggy/shared-types';
import { UserEntity } from '../database/user.schema.js';
import type { LoginDto, RegisterDto } from '../dto/auth.dto.js';
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
    return { user: this.toProfile(user), cookies: this.buildCookies(idOf(user._id)) };
  }

  async login(dto: LoginDto): Promise<{ user: UserProfile; cookies: string[] }> {
    const user = await this.users.findOne({ email: dto.email.toLowerCase() });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    if (user.status !== 'active') throw new UnauthorizedException('账号已禁用');
    return { user: this.toProfile(user), cookies: this.buildCookies(idOf(user._id)) };
  }

  async getCurrentUser(req: FastifyRequest): Promise<SessionUser | null> {
    const rawCookie = req.headers.cookie || '';
    const token = parse(rawCookie)[this.cookieName];
    if (!token) return null;
    try {
      const payload = jwt.verify(token, this.secret) as JwtPayload;
      const user = await this.users.findById(payload.sub);
      if (!user || user.status !== 'active') return null;
      return {
        id: idOf(user._id),
        username: user.username,
        email: user.email,
        systemPermission: this.normalizeSystemPermission(user),
        role: this.normalizeSystemPermission(user)
      };
    } catch {
      return null;
    }
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const user = await this.users.findById(userId);
    return user ? this.toProfile(user) : null;
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

  toProfile(user: UserEntity & { _id: unknown; createdAt?: Date; updatedAt?: Date }): UserProfile {
    const systemPermission = this.normalizeSystemPermission(user);
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

  private normalizeSystemPermission(user: Pick<UserEntity, 'role' | 'systemPermission'>): SystemPermission {
    if (user.systemPermission === 'admin' || user.systemPermission === 'maintainer' || user.systemPermission === 'user') return user.systemPermission;
    return user.role === 'admin' ? 'admin' : 'user';
  }
}
