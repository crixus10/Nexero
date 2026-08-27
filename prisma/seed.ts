// Seed de dezvoltare — creează un tenant + un user de test pentru login,
// plus catalogul modulului 1 (fără entitlement — vezi mai jos).
// Idempotent (upsert): sigur de rulat de mai multe ori.
// Rulare: `npx prisma db seed` (configurat în prisma7.config.ts).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const TEST_EMAIL = 'test@nexero.local';
const TEST_PASSWORD = 'parola-test-123';
const SALT_ROUNDS = 10;

// Modulul 1 real, per docs/roadmap.md ("Facturare + e-Factura ANAF").
// Doar catalogul (modules + plans) — NICIUN tenant_module, deliberat: nu
// activăm nimic aici. Entitlement-ul se acordă exclusiv din webhook-ul de
// plată (regula #4 din CLAUDE.md), nu dintr-un seed de dev. Fără logică de
// facturare încă — vine separat, per ordinea din roadmap.
const INVOICING_MODULE_CODE = 'invoicing';
const INVOICING_START_PLAN_ID = '00000000-0000-0000-0000-000000000002';

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

  // Catalog modulul 1 (Facturare) — preț din docs/pricing.md, pachetul
  // "Start" (~30 €/lună). Prețul real din docs acoperă un pachet mai larg
  // (facturare + stocuri + clienți/furnizori); cum `plans` e legat de UN
  // singur modul (`moduleCode`), am ancorat prețul integral aici, pe
  // singurul modul care există azi în schemă — de revizuit când apare
  // modulul 2 (stocuri) și devine clar cum se împarte prețul pachetului
  // între module, nu de decis speculativ acum.
  await prisma.module.upsert({
    where: { code: INVOICING_MODULE_CODE },
    update: {},
    create: {
      code: INVOICING_MODULE_CODE,
      name: 'Facturare',
      billingType: 'flat',
      // releasedAt rămâne null — modulul nu e încă vândut, doar înregistrat
      // în catalog; de setat când e disponibil real pentru clienți.
    },
  });
  await prisma.plan.upsert({
    where: { id: INVOICING_START_PLAN_ID },
    update: {},
    create: {
      id: INVOICING_START_PLAN_ID,
      moduleCode: INVOICING_MODULE_CODE,
      name: 'start',
      priceCents: 3000, // 30 €/lună, docs/pricing.md
      currency: 'EUR',
      billingPeriod: 'monthly',
    },
  });

  await prisma.$disconnect();

  console.log('Seed OK — user de test:');
  console.log(`  email:    ${TEST_EMAIL}`);
  console.log(`  parolă:   ${TEST_PASSWORD}`);
  console.log(`  tenantId: ${tenant.id}`);
  console.log(
    `  modul "${INVOICING_MODULE_CODE}" + plan "start" înregistrate în catalog (fără entitlement activ, fără logică de facturare).`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
