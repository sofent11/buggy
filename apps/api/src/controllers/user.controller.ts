import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CreateUserDto, UpdateUserDto, UserListQueryDto } from '../dto/user.dto.js';
import { UserService } from '../services/user.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  list(@Query() query: UserListQueryDto, @CurrentUser() user: SessionUser) {
    return this.users.list(query, user);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: SessionUser) {
    return this.users.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: SessionUser) {
    return this.users.update(id, dto, user);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.users.resetPassword(id, user);
  }
}
