import { Body, Controller, Get, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { UserProfile } from '@buggy/shared-types';
import { ChangePasswordDto, LoginDto, RegisterDto } from '../dto/auth.dto.js';
import { AuthService } from '../services/auth.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) reply: FastifyReply): Promise<UserProfile> {
    const result = await this.auth.register(dto);
    result.cookies.forEach((cookie) => reply.header('Set-Cookie', cookie));
    return result.user;
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) reply: FastifyReply): Promise<UserProfile> {
    const result = await this.auth.login(dto);
    result.cookies.forEach((cookie) => reply.header('Set-Cookie', cookie));
    return result.user;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Set-Cookie', this.auth.logoutCookies());
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: SessionUser): Promise<UserProfile | null> {
    return this.auth.getProfile(user.id);
  }

  @Patch('password')
  @UseGuards(AuthGuard)
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: SessionUser): Promise<UserProfile> {
    return this.auth.changePassword(user.id, dto);
  }
}
