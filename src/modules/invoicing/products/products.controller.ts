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
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

// Vezi comentariul echivalent din CompaniesController (modulul crm) —
// aceeași segregare pe cele 4 roluri de modul pentru nomenclatorul de produse.
const ANY_INVOICING_ROLE = [
  'invoicing:viewer',
  'invoicing:issuer',
  'invoicing:approver',
  'invoicing:admin',
] as const;

/**
 * Fază B.2 — CRUD produse/servicii. `@RequireModule('invoicing')` pe
 * FIECARE metodă, niciodată pe clasă — vezi comentariul echivalent din
 * CompaniesController (modulul crm).
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:issuer', 'invoicing:admin')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(user.tenantId, dto);
  }

  @RequireModule('invoicing')
  @RequireModuleRole(...ANY_INVOICING_ROLE)
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string | string[],
  ) {
    // Vezi comentariul echivalent din CompaniesController (modulul crm) —
    // gardă defensivă contra `?q[]=a&q[]=b` (array), pe care Prisma
    // `contains` nu-l acceptă.
    return this.products.findAll(
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
    return this.products.findOne(user.tenantId, id);
  }

  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:issuer', 'invoicing:admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.tenantId, id, dto);
  }

  // Ștergere permisă doar dacă niciun document nu referă produsul —
  // garanția reală vine din FK-ul ON DELETE RESTRICT, tradus în
  // ProductsService.remove() ca eroare prietenoasă (409, nu 500).
  @RequireModule('invoicing')
  @RequireModuleRole('invoicing:issuer', 'invoicing:admin')
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.products.remove(user.tenantId, id);
    return { ok: true };
  }
}
