import { Module } from '@nestjs/common';
import { AnafModule } from '../../integrations/anaf/anaf.module';
import { InvoiceSeriesController } from './invoice-series/invoice-series.controller';
import { InvoiceSeriesService } from './invoice-series/invoice-series.service';
import { InvoicesController } from './invoices/invoices.controller';
import { InvoicesService } from './invoices/invoices.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';

/**
 * Modul de business izolat (regula #2 din CLAUDE.md) — graniță de cod
 * clară, sub src/modules/. products/invoices stau AICI, nu în module
 * separate — vezi docs/invoicing-spec.md, secțiunea „Dependență cu modulul
 * Stocuri": Modulul 2 le va extinde, nu le va redefini. Clienții (fostul
 * `customers/`) au fost mutați în `src/modules/crm/companies/` (modulul
 * CRM, „Clienți" în UI, docs/crm-spec.md) — Invoicing citește
 * `prisma.company` direct prin FK-ul deja existent (`Invoice.companyId`),
 * fără import de fișiere interne din CrmModule (regula #2). PrismaService
 * vine din PrismaModule (@Global — niciun import explicit necesar aici).
 */
@Module({
  imports: [AnafModule],
  controllers: [
    InvoicesController,
    InvoiceSeriesController,
    ProductsController,
  ],
  providers: [ProductsService, InvoicesService, InvoiceSeriesService],
})
export class InvoicingModule {}
