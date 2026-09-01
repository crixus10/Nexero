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
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../../auth/jwt-payload.interface';
import { RequireModule } from '../../../entitlements/require-module.decorator';
import { RequireModuleRole } from '../../../rbac/require-module-role.decorator';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NotesService } from './notes.service';

const ANY_CRM_ROLE = ['crm:viewer', 'crm:agent', 'crm:admin'] as const;

@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @RequireModule('crm')
  @RequireModuleRole('crm:agent', 'crm:admin')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateNoteDto) {
    return this.notes.create(user.tenantId, dto);
  }

  @RequireModule('crm')
  @RequireModuleRole(...ANY_CRM_ROLE)
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string | string[],
  ) {
    return this.notes.findAll(user.tenantId, Array.isArray(q) ? undefined : q);
  }

  @RequireModule('crm')
  @RequireModuleRole(...ANY_CRM_ROLE)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notes.findOne(user.tenantId, id);
  }

  @RequireModule('crm')
  @RequireModuleRole('crm:agent', 'crm:admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(user.tenantId, id, dto);
  }

  @RequireModule('crm')
  @RequireModuleRole('crm:agent', 'crm:admin')
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.notes.remove(user.tenantId, id);
    return { ok: true };
  }
}
