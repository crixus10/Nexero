import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../../auth/jwt-payload.interface';
import { RequireModule } from '../../../entitlements/require-module.decorator';
import { RequireModuleRole } from '../../../rbac/require-module-role.decorator';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

// Oricare dintre cele 4 roluri de modul poate CITI facturi — segregarea
// reală (docs/invoicing-spec.md) e pe scriere: doar issuer/admin creează
// și emit, doar approver/admin stornează.
const ANY_INVOICING_ROLE = [
  'invoicing:viewer',
  'invoicing:issuer',
  'invoicing:approver',
  'invoicing:admin',
] as const;

/**
 * Fază C — motorul de facturare. `@RequireModule('invoicing')` pe FIECARE
 * metodă (verifică dacă firma are modulul activ) ÎMPREUNĂ cu
 * `@RequireModuleRole(...)` (verifică cine, din firmă, poate face
 * acțiunea) — cele două nu se substituie una pe alta, vezi comentariul din
 * require-module-role.decorator.ts.
 */
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @RequireModule('invoicing')
  @RequireModuleRole(...ANY_INVOICING_ROLE)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.invoices.findAll(user.tenantId);
  }

  @RequireModule('invoicing')
  @RequireModuleRole(...ANY_INVOICING_ROLE)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.findOne(user.tenantId, id);
  }

  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:issuer', 'invoicing:admin')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoices.createDraft(user.tenantId, user.userId, dto);
  }

  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:issuer', 'invoicing:admin')
  @Post(':id/issue')
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.issue(user.tenantId, user.userId, id);
  }

  // invoicing:approver, NU issuer — segregare deliberată (docs/invoicing-
  // spec.md: „Un utilizator cu doar issuer nu poate și storna propriile
  // facturi").
  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:approver', 'invoicing:admin')
  @Post(':id/credit-notes')
  createCreditNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCreditNoteDto,
  ) {
    return this.invoices.createCreditNote(user.tenantId, user.userId, id, dto);
  }
}
