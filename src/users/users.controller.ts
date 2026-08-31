import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { RequireGlobalRole } from '../rbac/require-global-role.decorator';
import { AssignModuleRoleDto } from './dto/assign-module-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/**
 * Management complet de useri — nucleu (ca src/auth/), NU modul de
 * business, nu stă în src/modules/. Restricționat la owner/admin (rolul
 * GLOBAL, vezi docs/data-model.md) — un operator obișnuit nu poate crea
 * sau modifica alți useri ai firmei lui.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequireGlobalRole('owner', 'admin')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.users.create(user.tenantId, dto);
  }

  @RequireGlobalRole('owner', 'admin')
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.users.findAll(user.tenantId);
  }

  @RequireGlobalRole('owner', 'admin')
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.findOne(user.tenantId, id);
  }

  @RequireGlobalRole('owner', 'admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(user.tenantId, id, dto, user.userId);
  }

  @RequireGlobalRole('owner', 'admin')
  @Post(':id/reset-password')
  async resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<{ ok: true }> {
    await this.users.resetPassword(user.tenantId, id, dto.newPassword);
    return { ok: true };
  }

  @RequireGlobalRole('owner', 'admin')
  @Get(':id/module-roles')
  listModuleRoles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.listModuleRoles(user.tenantId, id);
  }

  @RequireGlobalRole('owner', 'admin')
  @Post(':id/module-roles')
  assignModuleRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignModuleRoleDto,
  ) {
    return this.users.assignModuleRole(user.tenantId, id, dto);
  }

  @RequireGlobalRole('owner', 'admin')
  @Delete(':id/module-roles')
  async revokeModuleRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AssignModuleRoleDto,
  ): Promise<{ ok: true }> {
    await this.users.revokeModuleRole(
      user.tenantId,
      id,
      query.moduleCode,
      query.role,
    );
    return { ok: true };
  }
}
