import { Module } from '@nestjs/common';
import { EntitlementsTestController } from './entitlements-test.controller';

/**
 * TEMPORAR — separat de EntitlementsModule (nucleul real) tocmai ca să
 * fie ștersibil fără să atingă nucleul: șterge acest fișier +
 * entitlements-test.controller.ts + importul din app.module.ts.
 */
@Module({
  controllers: [EntitlementsTestController],
})
export class EntitlementsTestModule {}
