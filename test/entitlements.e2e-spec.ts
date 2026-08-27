import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

// Verifică lanțul complet: JwtAuthGuard -> ModuleGuard -> @RequireModule,
// pe endpoint-ul temporar GET /entitlements-test/ping.
const TEST_PASSWORD = 'parola-e2e-test-123';
const ENTITLED_EMAIL = 'e2e-entitled@nexero.local';
const ENTITLED_CUI = 'RO-E2E-ENTITLED';
const NOT_ENTITLED_EMAIL = 'e2e-not-entitled@nexero.local';
const NOT_ENTITLED_CUI = 'RO-E2E-NOT-ENTITLED';

describe('Entitlements / ModuleGuard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let entitledToken: string;
  let notEntitledToken: string;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL nu e setat pentru testele e2e.');
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);

    // Tenant CU entitlement activ pe modulul "test".
    const entitledTenant = await prisma.tenant.upsert({
      where: { cui: ENTITLED_CUI },
      update: {},
      create: { name: 'E2E Entitled Tenant', cui: ENTITLED_CUI },
    });
    await prisma.user.upsert({
      where: { email: ENTITLED_EMAIL },
      update: { passwordHash, tenantId: entitledTenant.id },
      create: {
        email: ENTITLED_EMAIL,
        passwordHash,
        tenantId: entitledTenant.id,
      },
    });
    await prisma.module.upsert({
      where: { code: 'test' },
      update: {},
      create: {
        code: 'test',
        name: 'Test (verificare guard)',
        billingType: 'flat',
      },
    });
    const plan = await prisma.plan.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        moduleCode: 'test',
        name: 'test-plan',
        priceCents: 0,
      },
    });
    await prisma.tenantModule.upsert({
      where: {
        tenantId_moduleCode: {
          tenantId: entitledTenant.id,
          moduleCode: 'test',
        },
      },
      update: { status: 'active', planId: plan.id },
      create: {
        tenantId: entitledTenant.id,
        moduleCode: 'test',
        planId: plan.id,
        status: 'active',
      },
    });

    // Tenant FĂRĂ niciun entitlement pe "test" — user autentificat valid,
    // dar firma n-a cumpărat modulul.
    const notEntitledTenant = await prisma.tenant.upsert({
      where: { cui: NOT_ENTITLED_CUI },
      update: {},
      create: { name: 'E2E Not Entitled Tenant', cui: NOT_ENTITLED_CUI },
    });
    await prisma.user.upsert({
      where: { email: NOT_ENTITLED_EMAIL },
      update: { passwordHash, tenantId: notEntitledTenant.id },
      create: {
        email: NOT_ENTITLED_EMAIL,
        passwordHash,
        tenantId: notEntitledTenant.id,
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const entitledLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ENTITLED_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    entitledToken = (entitledLogin.body as { accessToken: string }).accessToken;

    const notEntitledLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: NOT_ENTITLED_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    notEntitledToken = (notEntitledLogin.body as { accessToken: string })
      .accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [ENTITLED_EMAIL, NOT_ENTITLED_EMAIL] } },
    });
    await prisma.tenantModule.deleteMany({
      where: { tenant: { cui: { in: [ENTITLED_CUI, NOT_ENTITLED_CUI] } } },
    });
    await prisma.tenant.deleteMany({
      where: { cui: { in: [ENTITLED_CUI, NOT_ENTITLED_CUI] } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('fără token → 401 (JwtAuthGuard blochează înainte de ModuleGuard)', async () => {
    await request(app.getHttpServer())
      .get('/entitlements-test/ping')
      .expect(401);
  });

  it('token valid, dar firma nu are entitlement pe modul → 403', async () => {
    await request(app.getHttpServer())
      .get('/entitlements-test/ping')
      .set('Authorization', `Bearer ${notEntitledToken}`)
      .expect(403);
  });

  it('token valid + entitlement activ → 200, cu tenantId/entitlement corecte', async () => {
    const res = await request(app.getHttpServer())
      .get('/entitlements-test/ping')
      .set('Authorization', `Bearer ${entitledToken}`)
      .expect(200);

    expect(res.body).toEqual({
      tenantId: expect.any(String) as string,
      moduleCode: 'test',
      entitlementStatus: 'active',
    });
  });
});
