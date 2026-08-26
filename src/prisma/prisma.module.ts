import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global — orice modul de business poate injecta PrismaService fără să-l
 * reimporte explicit. Nu adăuga aici logică specifică unui modul.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
