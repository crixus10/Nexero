import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt-payload.interface';

const BCRYPT_ROUNDS = 10;
// Hash fix, calculat o singură dată la încărcarea modulului — comparat cu
// el pe ramura "user inexistent", ca timpul de răspuns să fie identic cu
// ramura "parolă greșită" (altfel bcrypt.compare sărit complet face din
// endpoint un oracol de enumerare a email-urilor prin timpul de răspuns,
// chiar dacă mesajul de eroare e identic).
const DUMMY_HASH = bcrypt.hashSync(
  'parola-nu-exista-niciun-user-real',
  BCRYPT_ROUNDS,
);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    // email e @unique global, case-insensitive la nivel de aplicație —
    // altfel "Test@x.com" nu se poate loga când userul e "test@x.com".
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    // Mesaj identic + timp identic pentru "user inexistent" și "parolă
    // greșită" — altfel endpoint-ul devine un oracol de enumerare.
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Email sau parolă incorecte.');
    }

    const payload: JwtPayload = { sub: user.id, tenantId: user.tenantId };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken };
  }
}
