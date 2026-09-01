import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../../auth/jwt-payload.interface';
import { RequireModule } from '../../../entitlements/require-module.decorator';
import { RequireModuleRole } from '../../../rbac/require-module-role.decorator';
import { CreateInvoiceSeriesDto } from './dto/create-invoice-series.dto';
import { InvoiceSeriesService } from './invoice-series.service';

@Controller('invoice-series')
export class InvoiceSeriesController {
  constructor(private readonly series: InvoiceSeriesService) {}

  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:admin')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceSeriesDto,
  ) {
    return this.series.create(user.tenantId, dto);
  }

  @RequireModule('invoicing')
  @RequireModuleRole(
    'invoicing:viewer',
    'invoicing:issuer',
    'invoicing:approver',
    'invoicing:admin',
  )
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string | string[],
  ) {
    // Vezi comentariul echivalent din CompaniesController (modulul crm) — gardă
    // defensivă contra `?q[]=a&q[]=b` (array), pe care Prisma `contains`
    // nu-l acceptă.
    return this.series.findAll(user.tenantId, Array.isArray(q) ? undefined : q);
  }

  // Doar admin — o serie configurată greșit se șterge și se recreează
  // (vezi comentariul din InvoiceSeriesService despre lipsa lui update()),
  // niciodată issuer/approver, ca la clienți/produse.
  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:admin')
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.series.remove(user.tenantId, id);
    return { ok: true };
  }
}
