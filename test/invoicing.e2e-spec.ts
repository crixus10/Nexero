import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

// Verifică lanțul complet JwtAuthGuard -> ModuleGuard -> @RequireModule,
// pe ruta REALĂ a modulului 1 (nu mai există un endpoint temporar de
// test — vezi docs/data-model.md). Modulul 'invoicing' e permanent
// (prisma/seed.ts), deci NU e șters în afterAll — doar planul/tenant-ii
// creați aici.
const TEST_PASSWORD = 'parola-e2e-test-123';
const ENTITLED_EMAIL = 'e2e-invoicing-entitled@nexero.local';
const ENTITLED_CUI = 'RO-E2E-INVOICING-ENTITLED';
const NOT_ENTITLED_EMAIL = 'e2e-invoicing-not-entitled@nexero.local';
const NOT_ENTITLED_CUI = 'RO-E2E-INVOICING-NOT-ENTITLED';
const TEST_PLAN_ID = '00000000-0000-0000-0000-000000000098';

describe('Invoicing module — access control (e2e)', () => {
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

    // Modulul 'invoicing' vine din prisma/seed.ts, nu din migrări — pe o
    // bază doar migrată (fără seed), planul de mai jos ar eșua pe FK cu un
    // mesaj greu de descifrat pentru cineva nou pe proiect. Verificare
    // explicită, cu mesaj clar despre ce trebuie rulat.
    const invoicingModule = await prisma.module.findUnique({
      where: { code: 'invoicing' },
    });
    if (!invoicingModule) {
      throw new Error(
        "Modulul 'invoicing' nu există în baza de date — rulează `npx prisma db seed` înainte de `npm run test:e2e`.",
      );
    }

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);

    // Tenant CU entitlement activ pe modulul "invoicing".
    const entitledTenant = await prisma.tenant.upsert({
      where: { cui: ENTITLED_CUI },
      update: {},
      create: { name: 'E2E Invoicing Entitled Tenant', cui: ENTITLED_CUI },
    });
    // Identitate + acces la firmă în două tabele separate — multi-firmă
    // (docs/data-model.md): users nu mai are tenant_id/role proprii.
    const entitledUserUpsert = await prisma.user.upsert({
      where: { email: ENTITLED_EMAIL },
      update: { passwordHash },
      create: { email: ENTITLED_EMAIL, passwordHash },
    });
    await prisma.userTenantAccess.upsert({
      where: {
        userId_tenantId: {
          userId: entitledUserUpsert.id,
          tenantId: entitledTenant.id,
        },
      },
      update: { isActive: true },
      create: {
        userId: entitledUserUpsert.id,
        tenantId: entitledTenant.id,
        role: 'owner',
      },
    });
    // Modulul 'invoicing' e presupus deja existent (prisma/seed.ts) — nu-l
    // recreăm aici, doar un plan propriu de test.
    const plan = await prisma.plan.upsert({
      where: { id: TEST_PLAN_ID },
      update: {},
      create: {
        id: TEST_PLAN_ID,
        moduleCode: 'invoicing',
        name: 'e2e-test-plan',
        priceCents: 0,
      },
    });
    await prisma.tenantModule.upsert({
      where: {
        tenantId_moduleCode: {
          tenantId: entitledTenant.id,
          moduleCode: 'invoicing',
        },
      },
      update: { status: 'active', planId: plan.id },
      create: {
        tenantId: entitledTenant.id,
        moduleCode: 'invoicing',
        planId: plan.id,
        status: 'active',
      },
    });
    // ModuleRoleGuard (RBAC per-modul, vezi src/rbac/) — entitlement-ul
    // singur nu mai e suficient, userul are nevoie și de un rol de modul
    // (măcar 'invoicing:viewer') ca GET /invoices să treacă.
    const entitledUser = await prisma.user.findUniqueOrThrow({
      where: { email: ENTITLED_EMAIL },
    });
    await prisma.userModuleRole.upsert({
      where: {
        tenantId_userId_moduleCode_role: {
          tenantId: entitledTenant.id,
          userId: entitledUser.id,
          moduleCode: 'invoicing',
          role: 'invoicing:viewer',
        },
      },
      update: {},
      create: {
        tenantId: entitledTenant.id,
        userId: entitledUser.id,
        moduleCode: 'invoicing',
        role: 'invoicing:viewer',
      },
    });

    // Tenant FĂRĂ niciun entitlement pe "invoicing" — user autentificat
    // valid, dar firma n-a cumpărat modulul.
    const notEntitledTenant = await prisma.tenant.upsert({
      where: { cui: NOT_ENTITLED_CUI },
      update: {},
      create: {
        name: 'E2E Invoicing Not Entitled Tenant',
        cui: NOT_ENTITLED_CUI,
      },
    });
    const notEntitledUserUpsert = await prisma.user.upsert({
      where: { email: NOT_ENTITLED_EMAIL },
      update: { passwordHash },
      create: { email: NOT_ENTITLED_EMAIL, passwordHash },
    });
    await prisma.userTenantAccess.upsert({
      where: {
        userId_tenantId: {
          userId: notEntitledUserUpsert.id,
          tenantId: notEntitledTenant.id,
        },
      },
      update: { isActive: true },
      create: {
        userId: notEntitledUserUpsert.id,
        tenantId: notEntitledTenant.id,
        role: 'owner',
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
    // Dacă beforeAll a eșuat înainte de a apuca să inițializeze prisma/app
    // (ex: modulul 'invoicing' lipsește dintr-o bază doar migrată, neseedată
    // — vezi eroarea FK din prisma.plan.upsert), nu mai încerca să cureți/
    // închizi nimic — altfel eroarea reală e mascată de un TypeError
    // "Cannot read properties of undefined" pe app.close().
    if (!prisma) {
      return;
    }
    // NU ștergem modulul 'invoicing' — e permanent (prisma/seed.ts).
    // user_module_roles.user_id e ON DELETE RESTRICT — trebuie șters
    // înaintea userilor, altfel prisma.user.deleteMany de mai jos eșuează
    // pe încălcare de FK.
    await prisma.userModuleRole.deleteMany({
      where: { tenant: { cui: { in: [ENTITLED_CUI, NOT_ENTITLED_CUI] } } },
    });
    // user_tenant_access.user_id/tenant_id sunt ON DELETE RESTRICT — la fel
    // ca user_module_roles mai sus, trebuie șters înaintea userilor/firmelor.
    await prisma.userTenantAccess.deleteMany({
      where: { tenant: { cui: { in: [ENTITLED_CUI, NOT_ENTITLED_CUI] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [ENTITLED_EMAIL, NOT_ENTITLED_EMAIL] } },
    });
    await prisma.tenantModule.deleteMany({
      where: { tenant: { cui: { in: [ENTITLED_CUI, NOT_ENTITLED_CUI] } } },
    });
    await prisma.tenant.deleteMany({
      where: { cui: { in: [ENTITLED_CUI, NOT_ENTITLED_CUI] } },
    });
    await prisma.plan.deleteMany({ where: { id: TEST_PLAN_ID } });
    await prisma.$disconnect();
    if (app) {
      await app.close();
    }
  });

  it('fără token → 401 (JwtAuthGuard blochează înainte de ModuleGuard)', async () => {
    await request(app.getHttpServer()).get('/invoices').expect(401);
  });

  it('token valid, dar firma nu are entitlement pe invoicing → 403', async () => {
    await request(app.getHttpServer())
      .get('/invoices')
      .set('Authorization', `Bearer ${notEntitledToken}`)
      .expect(403);
  });

  it('token valid + entitlement activ pe invoicing → 200, listă goală', async () => {
    const res = await request(app.getHttpServer())
      .get('/invoices')
      .set('Authorization', `Bearer ${entitledToken}`)
      .expect(200);

    expect(res.body).toEqual([]);
  });
});
