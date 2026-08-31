import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Nucleu (ca src/auth/, src/entitlements/, src/rbac/) — NU modul de
 * business, nu stă în src/modules/. PrismaService vine din PrismaModule
 * (@Global — niciun import explicit necesar aici).
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
