import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Wrapper subțire peste PrismaClient, ca serviciu injectabil Nest.
 * Infrastructură comună (nucleu) — nu ține de niciun modul de business,
 * vezi docs/data-model.md și regula #2 din CLAUDE.md (module izolate,
 * comunicare doar prin servicii publice, niciodată import direct).
 *
 * Prisma 7 cere explicit un driver adapter (nu se mai conectează implicit
 * doar din datasource.url din schema) — folosim @prisma/adapter-pg peste
 * DATABASE_URL din .env.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      // Eroare de configurare la bootstrap, înainte de orice request — un
      // Error simplu, nu o HttpException (nu ține de un răspuns HTTP).
      throw new Error('DATABASE_URL nu e setat — vezi .env.example.');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectat la Postgres via Prisma.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
