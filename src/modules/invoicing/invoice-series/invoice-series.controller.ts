import { Body, Controller, Get, Post } from '@nestjs/common';
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
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.series.findAll(user.tenantId);
  }
}
