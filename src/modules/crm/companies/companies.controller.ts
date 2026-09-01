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
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

// Oricare dintre cele 3 roluri de modul poate CITI companii — nomenclator,
// nu document fiscal; segregarea reală e pe scriere. Vezi docs/crm-spec.md,
// „Roluri multi-user".
const ANY_CRM_ROLE = ['crm:viewer', 'crm:agent', 'crm:admin'] as const;

/**
 * Modul CRM ("Clienți" în UI) — vezi docs/crm-spec.md. `@RequireModule('crm')`
 * pe FIECARE metodă, niciodată pe clasă (tipar obligatoriu, vezi
 * docs/data-model.md, secțiunea „Tiparul de verificare acces"). Ștergerea
 * (acțiune mai greu de anulat decât o editare) rămâne `crm:admin`-only,
 * distinct de creare/editare (`crm:agent`+`crm:admin`).
 */
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @RequireModule('crm')
  @RequireModuleRole('crm:agent', 'crm:admin')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.companies.create(user.tenantId, dto);
  }

  @RequireModule('crm')
  @RequireModuleRole(...ANY_CRM_ROLE)
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string | string[],
  ) {
    // Array-injection guard (?q[]=a&q[]=b) — vezi comentariul echivalent
    // din fostul CustomersController.
    return this.companies.findAll(
      user.tenantId,
      Array.isArray(q) ? undefined : q,
    );
  }

  @RequireModule('crm')
  @RequireModuleRole(...ANY_CRM_ROLE)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companies.findOne(user.tenantId, id);
  }

  @RequireModule('crm')
  @RequireModuleRole('crm:agent', 'crm:admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companies.update(user.tenantId, id, dto);
  }

  // Ștergere permisă doar dacă nicio factură nu referă compania — garanția
  // reală vine din FK-ul ON DELETE RESTRICT, tradus în CompaniesService.remove()
  // ca eroare prietenoasă (409, nu 500).
  @RequireModule('crm')
  @RequireModuleRole('crm:admin')
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.companies.remove(user.tenantId, id);
    return { ok: true };
  }
}
