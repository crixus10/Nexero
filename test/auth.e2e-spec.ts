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

// User separat, cu acces la DOUĂ firme — dedicat testelor de
// switch-tenant, ca să nu complice fixture-ul single-tenant de mai sus.
const MULTI_EMAIL = 'e2e-multi-tenant-test@nexero.local';
const MULTI_PASSWORD = 'parola-e2e-multi-123';
const MULTI_CUI_A = 'RO-E2E-MULTI-A';
const MULTI_CUI_B = 'RO-E2E-MULTI-B';
const MULTI_CUI_C = 'RO-E2E-MULTI-C'; // firmă la care userul NU are acces

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let tenantB: { id: string };
  let tenantC: { id: string };

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

    // Fixture pentru switch-tenant: user cu acces activ la A și B, dar NU
    // la C — verifică atât fluxul fericit cât și refuzul pe o firmă
    // străină (fix logic-reviewer: acest flux nu avea deloc acoperire e2e).
    const tenantA = await prisma.tenant.upsert({
      where: { cui: MULTI_CUI_A },
      update: {},
      create: { name: 'E2E Multi Tenant A', cui: MULTI_CUI_A },
    });
    tenantB = await prisma.tenant.upsert({
      where: { cui: MULTI_CUI_B },
      update: {},
      create: { name: 'E2E Multi Tenant B', cui: MULTI_CUI_B },
    });
    tenantC = await prisma.tenant.upsert({
      where: { cui: MULTI_CUI_C },
      update: {},
      create: { name: 'E2E Multi Tenant C', cui: MULTI_CUI_C },
    });
    const multiPasswordHash = await bcrypt.hash(MULTI_PASSWORD, 4);
    const multiUser = await prisma.user.upsert({
      where: { email: MULTI_EMAIL },
      update: { passwordHash: multiPasswordHash },
      create: { email: MULTI_EMAIL, passwordHash: multiPasswordHash },
    });
    await prisma.userTenantAccess.upsert({
      where: {
        userId_tenantId: { userId: multiUser.id, tenantId: tenantA.id },
      },
      update: { isActive: true },
      create: { userId: multiUser.id, tenantId: tenantA.id, role: 'operator' },
    });
    await prisma.userTenantAccess.upsert({
      where: {
        userId_tenantId: { userId: multiUser.id, tenantId: tenantB.id },
      },
      update: { isActive: true },
      create: { userId: multiUser.id, tenantId: tenantB.id, role: 'owner' },
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
      where: { user: { email: { in: [TEST_EMAIL, MULTI_EMAIL] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [TEST_EMAIL, MULTI_EMAIL] } },
    });
    await prisma.tenant.deleteMany({
      where: { cui: { in: [TEST_CUI, MULTI_CUI_A, MULTI_CUI_B, MULTI_CUI_C] } },
    });
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

  it('GET /auth/me cu token valid → 200 + userId/tenantId/tenantName', async () => {
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
    expect(me.body).toMatchObject({ tenantName: 'E2E Auth Test Tenant' });
  });

  // Fix logic-reviewer: fluxul multi-firmă (token „pre-tenant" +
  // POST /auth/switch-tenant) nu avea nicio acoperire e2e — o eroare de
  // ordine a guard-urilor sau de înregistrare a rutei ar fi trecut
  // nedetectată de unit teste mock-uite.
  describe('multi-firmă — POST /auth/switch-tenant', () => {
    it('login pentru un user cu 2 firme → token pre-tenant (fără tenantId) + lista firmelor', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: MULTI_EMAIL, password: MULTI_PASSWORD })
        .expect(200);

      const body = res.body as {
        accessToken: string;
        tenants?: { tenantId: string; tenantName: string; role: string }[];
      };
      expect(body.tenants).toHaveLength(2);
      const payload = JSON.parse(
        Buffer.from(body.accessToken.split('.')[1], 'base64').toString(),
      ) as { sub: string; tenantId?: string };
      expect(payload.tenantId).toBeUndefined();
    });

    it('un token pre-tenant NU trece pe o rută normală (ex: GET /auth/me) → 401', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: MULTI_EMAIL, password: MULTI_PASSWORD })
        .expect(200);
      const { accessToken } = login.body as { accessToken: string };

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('switch-tenant către o firmă la care userul are acces → 200 + token complet cu tenantId corect', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: MULTI_EMAIL, password: MULTI_PASSWORD })
        .expect(200);
      const { accessToken } = login.body as { accessToken: string };

      const res = await request(app.getHttpServer())
        .post('/auth/switch-tenant')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tenantId: tenantB.id })
        .expect(200);

      const body = res.body as { accessToken: string };
      const payload = JSON.parse(
        Buffer.from(body.accessToken.split('.')[1], 'base64').toString(),
      ) as { sub: string; tenantId: string };
      expect(payload.tenantId).toBe(tenantB.id);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(me.body).toMatchObject({
        tenantId: tenantB.id,
        tenantName: 'E2E Multi Tenant B',
      });
    });

    it('switch-tenant către o firmă la care userul NU are acces → 403', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: MULTI_EMAIL, password: MULTI_PASSWORD })
        .expect(200);
      const { accessToken } = login.body as { accessToken: string };

      await request(app.getHttpServer())
        .post('/auth/switch-tenant')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tenantId: tenantC.id })
        .expect(403);
    });
  });
});
