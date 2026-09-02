import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

// Test dedicat, izolat de user-ul din prisma/seed.ts — nu depinde de
// rularea `npx prisma db seed` înainte, și nu-i afectează datele.
const TEST_EMAIL = 'e2e-auth-test@nexero.local';
const TEST_PASSWORD = 'parola-e2e-test-123';
const TEST_CUI = 'RO-E2E-AUTH-TEST';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL nu e setat pentru testele e2e.');
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

    const tenant = await prisma.tenant.upsert({
      where: { cui: TEST_CUI },
      update: {},
      create: { name: 'E2E Auth Test Tenant', cui: TEST_CUI },
    });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4); // cost mic, doar test
    // Identitate + acces la firmă în două tabele separate — multi-firmă
    // (docs/data-model.md): users nu mai are tenant_id/role proprii.
    const user = await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      update: { passwordHash },
      create: { email: TEST_EMAIL, passwordHash },
    });
    await prisma.userTenantAccess.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: { isActive: true },
      create: { userId: user.id, tenantId: tenant.id, role: 'owner' },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Aceste teste verifică fluxul de autentificare, nu rate-limiting-ul
      // (acela e responsabilitatea @nestjs/throttler, deja testat de ei) —
      // fără override, numărul de apeluri /auth/login din acest fișier ar
      // fi legat direct de limita configurată (fragil, arată ca regresie
      // funcțională dacă limita se schimbă sau cresc testele).
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    // Aceeași configurare ca în src/main.ts — altfel testele nu reflectă
    // comportamentul real al aplicației pornite.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    // user_tenant_access ÎNAINTE de users/tenants (FK) — RESTRICT, nu CASCADE.
    await prisma.userTenantAccess.deleteMany({
      where: { user: { email: TEST_EMAIL } },
    });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.tenant.deleteMany({ where: { cui: TEST_CUI } });
    await prisma.$disconnect();
    await app.close();
  });

  it('POST /auth/login cu credențiale corecte → 200 + token cu sub/tenantId corecte', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    const payload = JSON.parse(
      Buffer.from(
        (res.body as { accessToken: string }).accessToken.split('.')[1],
        'base64',
      ).toString(),
    ) as { sub: string; tenantId: string };
    expect(payload.sub).toBeTruthy();
    expect(payload.tenantId).toBeTruthy();
  });

  it('POST /auth/login case-insensitive pe email', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL.toUpperCase(), password: TEST_PASSWORD })
      .expect(200);
  });

  it('POST /auth/login cu parolă greșită → 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: 'parola-gresita' })
      .expect(401);
  });

  it('POST /auth/login cu câmp nedeclarat → 400 (whitelist)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, admin: true })
      .expect(400);
  });

  it('GET /auth/me fără token → 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/me cu token valid → 200 + userId/tenantId', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    const { accessToken } = login.body as { accessToken: string };

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(me.body).toHaveProperty('userId');
    expect(me.body).toHaveProperty('tenantId');
  });
});
