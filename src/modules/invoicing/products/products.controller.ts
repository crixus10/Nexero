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
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

/**
 * Fază B.2 — CRUD produse/servicii. `@RequireModule('invoicing')` pe
 * FIECARE metodă, niciodată pe clasă — vezi comentariul echivalent din
 * CustomersController.
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @RequireModule('invoicing')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(user.tenantId, dto);
  }

  @RequireModule('invoicing')
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.products.findAll(user.tenantId);
  }

  @RequireModule('invoicing')
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.products.findOne(user.tenantId, id);
  }

  @RequireModule('invoicing')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.tenantId, id, dto);
  }
}
