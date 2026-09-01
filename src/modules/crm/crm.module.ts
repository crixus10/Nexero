import { Module } from '@nestjs/common';
import { AnafModule } from '../../integrations/anaf/anaf.module';
import { CompaniesController } from './companies/companies.controller';
import { CompaniesService } from './companies/companies.service';
import { ContactsController } from './contacts/contacts.controller';
import { ContactsService } from './contacts/contacts.service';
import { DealsController } from './deals/deals.controller';
import { DealsService } from './deals/deals.service';
import { NotesController } from './notes/notes.controller';
import { NotesService } from './notes/notes.service';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';

/**
 * Modulul CRM ("Clienți" în UI) — vezi docs/crm-spec.md. Pachet izolat
 * (regula #2 CLAUDE.md), sub-resurse proprii: companies/contacts/deals/
 * tasks/notes. `Company` înlocuiește fostul `Customer` — Invoicing citește
 * `prisma.company` direct (FK Prisma existent deja, `Invoice.companyId`),
 * fără import de fișiere interne din acest modul. PrismaService +
 * CodeSequenceService vin din module globale (@Global — niciun import
 * explicit necesar aici).
 */
@Module({
  imports: [AnafModule],
  controllers: [
    CompaniesController,
    ContactsController,
    DealsController,
    TasksController,
    NotesController,
  ],
  providers: [
    CompaniesService,
    ContactsService,
    DealsService,
    TasksService,
    NotesService,
  ],
})
export class CrmModule {}
