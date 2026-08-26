import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import ms, { type StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    // 5 încercări / minut / IP pe login — suficient pentru un user real,
    // prea puțin pentru brute-force pe parole.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    JwtModule.registerAsync({
      // useFactory (nu obiect static la nivel de modul) — o eroare de
      // configurare apare în timpul bootstrap-ului Nest, cu context clar
      // ("error creating AuthModule"), nu la simpla evaluare a fișierului
      // (care ar crăpa orice test/CI ce importă AuthModule fără .env,
      // înainte ca Jest să apuce să raporteze testul individual).
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET nu e setat — vezi .env.example.');
        }
        const expiresInRaw = process.env.JWT_EXPIRES_IN ?? '1h';
        // ms() fie întoarce `undefined` (ex: "abc"), fie aruncă (ex: "") pe
        // input invalid — tratăm ambele ca aceeași eroare de configurare.
        let expiresInMs: number | undefined;
        try {
          expiresInMs = ms(expiresInRaw as StringValue);
        } catch {
          expiresInMs = undefined;
        }
        if (expiresInMs === undefined) {
          throw new Error(
            `JWT_EXPIRES_IN="${expiresInRaw}" nu e un format valid (ex: "1h", "15m") — vezi .env.example.`,
          );
        }
        return {
          secret,
          signOptions: { expiresIn: expiresInRaw as StringValue },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
