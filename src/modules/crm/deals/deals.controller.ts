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
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { DealsService } from './deals.service';

const ANY_CRM_ROLE = ['crm:viewer', 'crm:agent', 'crm:admin'] as const;

@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @RequireModule('crm')
  @RequireModuleRole('crm:agent', 'crm:admin')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDealDto) {
    return this.deals.create(user.tenantId, dto);
  }

  @RequireModule('crm')
  @RequireModuleRole(...ANY_CRM_ROLE)
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string | string[],
  ) {
    return this.deals.findAll(user.tenantId, Array.isArray(q) ? undefined : q);
  }

  @RequireModule('crm')
  @RequireModuleRole(...ANY_CRM_ROLE)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deals.findOne(user.tenantId, id);
  }

  @RequireModule('crm')
  @RequireModuleRole('crm:agent', 'crm:admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealDto,
  ) {
    return this.deals.update(user.tenantId, id, dto);
  }

  @RequireModule('crm')
  @RequireModuleRole('crm:agent', 'crm:admin')
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.deals.remove(user.tenantId, id);
    return { ok: true };
  }
}
