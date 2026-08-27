// Seed de dezvoltare — creează un tenant + un user de test pentru login,
// plus un modul de test cu entitlement activ (pentru verificarea manuală
// a lanțului JwtAuthGuard -> ModuleGuard -> @RequireModule).
// Idempotent (upsert): sigur de rulat de mai multe ori.
// Rulare: `npx prisma db seed` (configurat în prisma7.config.ts).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const TEST_EMAIL = 'test@nexero.local';
const TEST_PASSWORD = 'parola-test-123';
const SALT_ROUNDS = 10;
const TEST_MODULE_CODE = 'test';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL nu e setat — vezi .env.example.');
  }
  // Același driver adapter ca PrismaService (src/prisma/) — Prisma 7 nu se
  // mai conectează implicit doar din schema.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const tenant = await prisma.tenant.upsert({
    where: { cui: 'RO00000000' },
    update: {},
    create: { name: 'Tenant Demo', cui: 'RO00000000' },
  });

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash, tenantId: tenant.id },
    create: { email: TEST_EMAIL, passwordHash, tenantId: tenant.id },
  });

  // Modul + plan „test" — NU un modul de business real (vezi
  // src/entitlements/entitlements-test.controller.ts) — doar ca tenantul
  // demo să aibă un entitlement activ de verificat manual.
  await prisma.module.upsert({
    where: { code: TEST_MODULE_CODE },
    update: {},
    create: {
      code: TEST_MODULE_CODE,
      name: 'Test (verificare guard)',
      billingType: 'flat',
    },
  });
  const plan = await prisma.plan.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      moduleCode: TEST_MODULE_CODE,
      name: 'test-plan',
      priceCents: 0,
    },
  });
  await prisma.tenantModule.upsert({
    where: {
      tenantId_moduleCode: {
        tenantId: tenant.id,
        moduleCode: TEST_MODULE_CODE,
      },
    },
    update: { status: 'active', planId: plan.id },
    create: {
      tenantId: tenant.id,
      moduleCode: TEST_MODULE_CODE,
      planId: plan.id,
      status: 'active',
    },
  });

  await prisma.$disconnect();

  console.log('Seed OK — user de test:');
  console.log(`  email:    ${TEST_EMAIL}`);
  console.log(`  parolă:   ${TEST_PASSWORD}`);
  console.log(`  tenantId: ${tenant.id}`);
  console.log(
    `  modul "${TEST_MODULE_CODE}" activ — GET /entitlements-test/ping ar trebui să dea 200.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
