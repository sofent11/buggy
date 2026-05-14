import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { UpdateUserDto, UserListQueryDto } from '../dto/user.dto.js';
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

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: SessionUser) {
    return this.users.update(id, dto, user);
  }
}
