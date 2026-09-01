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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

// Oricare dintre cele 4 roluri de modul poate CITI clienți — nomenclator,
// nu document fiscal; segregarea reală e pe scriere. Vezi comentariul
// echivalent din InvoicesController.
const ANY_INVOICING_ROLE = [
  'invoicing:viewer',
  'invoicing:issuer',
  'invoicing:approver',
  'invoicing:admin',
] as const;

/**
 * Fază B.1 — CRUD clienți. `@RequireModule('invoicing')` pe FIECARE metodă,
 * niciodată pe clasă (metadata citită doar de pe handler — vezi
 * docs/data-model.md, secțiunea „Tiparul de verificare acces”; pus pe
 * clasă, ModuleGuard nu-l găsește și lasă cererea să treacă necondiționat).
 * `@RequireModuleRole(...)` alături — issuer/admin pot crea și corecta un
 * client (parte din fluxul curent de emitere), approver rămâne doar citire.
 */
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:issuer', 'invoicing:admin')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customers.create(user.tenantId, dto);
  }

  @RequireModule('invoicing')
  @RequireModuleRole(...ANY_INVOICING_ROLE)
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string | string[],
  ) {
    // Express/qs parsează `?q[]=a&q[]=b` ca array — fără gardă, un string
    // dat direct la Prisma `contains` ar arunca o eroare de validare
    // netratată (500 în loc de un răspuns curat). ValidationPipe global nu
    // acoperă parametrii primitivi de query nedeclarați într-un DTO.
    return this.customers.findAll(
      user.tenantId,
      Array.isArray(q) ? undefined : q,
    );
  }

  @RequireModule('invoicing')
  @RequireModuleRole(...ANY_INVOICING_ROLE)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.findOne(user.tenantId, id);
  }

  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:issuer', 'invoicing:admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(user.tenantId, id, dto);
  }

  // Ștergere permisă doar dacă niciun document nu referă clientul —
  // garanția reală vine din FK-ul ON DELETE RESTRICT, tradus în
  // CustomersService.remove() ca eroare prietenoasă (409, nu 500).
  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:issuer', 'invoicing:admin')
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.customers.remove(user.tenantId, id);
    return { ok: true };
  }
}
