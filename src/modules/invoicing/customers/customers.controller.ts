import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../../auth/jwt-payload.interface';
import { RequireModule } from '../../../entitlements/require-module.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/**
 * Fază B.1 — CRUD clienți. `@RequireModule('invoicing')` pe FIECARE metodă,
 * niciodată pe clasă (metadata citită doar de pe handler — vezi
 * docs/data-model.md, secțiunea „Tiparul de verificare acces”; pus pe
 * clasă, ModuleGuard nu-l găsește și lasă cererea să treacă necondiționat).
 */
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @RequireModule('invoicing')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customers.create(user.tenantId, dto);
  }

  @RequireModule('invoicing')
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.customers.findAll(user.tenantId);
  }

  @RequireModule('invoicing')
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.findOne(user.tenantId, id);
  }

  @RequireModule('invoicing')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(user.tenantId, id, dto);
  }
}
