import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

export interface LoginResult {
  accessToken: string;
  /**
   * Prezent DOAR când userul are acces la mai multe firme — `accessToken`
   * e atunci un token „pre-tenant" (fără tenantId), de folosit direct pe
   * POST /auth/switch-tenant, nu pe rutele obișnuite. Absent (undefined)
   * în cazul majoritar de azi (o singură firmă) — accessToken e deja
   * tokenul complet, comportament neschimbat față de înainte de
   * multi-firmă. Vezi docs/data-model.md, secțiunea „Multi-firmă".
   */
  tenants?: { tenantId: string; tenantName: string; role: string }[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
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

    // Mesaj identic + timp identic pentru "user inexistent", "parolă
    // greșită" ȘI "cont dezactivat global" — altfel endpoint-ul devine un
    // oracol de enumerare (fix logic-reviewer: un cont cu isActive:false
    // tot trebuia respins EXPLICIT aici, nu doar presupus — verificarea de
    // acces per-firmă de mai jos rulează pe user_tenant_access, un tabel
    // separat pe care nimic nu-l ține sincron cu users.isActive azi).
    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Email sau parolă incorecte.');
    }

    // Firmele la care userul are acces ACUM (live, nu din vreun cache) —
    // vezi docs/data-model.md, secțiunea „Multi-firmă".
    const access = await this.prisma.userTenantAccess.findMany({
      where: { userId: user.id, isActive: true },
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Mesaj generic identic cu cel de mai sus (fix logic-reviewer) — un
    // mesaj distinct aici ("cont fără nicio firmă") ar lăsa pe cineva care
    // deja deține o parolă validă (phishing, refolosire credențiale) să
    // distingă acest caz de "parolă greșită", spărgând anti-enumerarea
    // aplicată explicit cu doar câteva linii mai sus.
    if (access.length === 0) {
      throw new UnauthorizedException('Email sau parolă incorecte.');
    }

    if (access.length === 1) {
      return {
        accessToken: await this.issueToken(user.id, access[0].tenantId),
      };
    }

    // Mai multe firme active — tokenul emis NU are tenantId încă; clientul
    // trebuie să aleagă firma prin POST /auth/switch-tenant.
    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return {
      accessToken,
      tenants: access.map((a) => ({
        tenantId: a.tenantId,
        tenantName: a.tenant.name,
        role: a.role,
      })),
    };
  }

  /**
   * Emite un token COMPLET (cu tenantId) pentru firma cerută — verifică
   * LIVE din DB că userul chiar are acces activ la ea înainte. Server-side
   * obligatoriu, niciodată încredere în ce trimite clientul fără citire
   * din DB — altfel breșă IDOR (un user ar cere acces la o firmă la care
   * nu e asociat). Funcționează și cu un token deja complet (userul își
   * schimbă firma activă în timp ce e deja logat pe alta), nu doar din
   * starea „pre-tenant" imediat după login.
   */
  async switchTenant(userId: string, tenantId: string): Promise<LoginResult> {
    const access = await this.prisma.userTenantAccess.findFirst({
      where: { userId, tenantId, isActive: true, user: { isActive: true } },
    });
    if (!access) {
      throw new ForbiddenException('Nu ai acces la această firmă.');
    }
    return { accessToken: await this.issueToken(userId, tenantId) };
  }

  private async issueToken(userId: string, tenantId: string): Promise<string> {
    const payload: JwtPayload = { sub: userId, tenantId };
    return this.jwt.signAsync(payload);
  }
}
