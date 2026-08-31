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
  // role: 'owner' — userul de test trebuie să poată gestiona alți useri
  // (src/users/) și module-roles la testare locală, nu doar el să existe.
  // Setat și pe `update` (nu doar `create`) — altfel un re-seed pe un user
  // deja existent dintr-o rulare anterioară a script-ului (înainte ca
  // full_name/role să existe ca și coloane) l-ar lăsa cu default-ul DB
  // ('operator'), nu cu 'owner' — exact ce s-a întâmplat la verificarea
  // manuală a acestei sesiuni.
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {
      passwordHash,
      tenantId: tenant.id,
      fullName: 'Owner Demo',
      role: 'owner',
    },
    create: {
      email: TEST_EMAIL,
      passwordHash,
      tenantId: tenant.id,
      fullName: 'Owner Demo',
      role: 'owner',
    },
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

  // Cote TVA — curente + istoric, conform docs/invoicing-spec.md. Cerință
  // legală, nu date de test: istoricul rămâne necesar pentru facturi/
  // rapoarte SAF-T pe perioade din trecut, chiar după schimbarea cotei.
  // Upsert pe cheia naturală (taxCode, validFrom) — idempotent.
  const TAX_CODES: Array<{
    taxCode: string;
    taxType: string;
    taxPercentage: string;
    validFrom: string;
    validTo: string | null;
    isDefault: boolean;
    vatAccountOutput: string | null;
    vatAccountInput: string | null;
    description: string;
  }> = [
    // Curente — active de la 1 august 2025, singurele alese implicit acum.
    {
      taxCode: 'S21',
      taxType: 'Standard',
      taxPercentage: '21.00',
      validFrom: '2025-08-01',
      validTo: null,
      isDefault: true,
      vatAccountOutput: '4427',
      vatAccountInput: '4426',
      description: 'Cotă standard 21% (din august 2025)',
    },
    {
      taxCode: 'R11',
      taxType: 'Reduced',
      taxPercentage: '11.00',
      validFrom: '2025-08-01',
      validTo: null,
      isDefault: true,
      vatAccountOutput: '4427',
      vatAccountInput: '4426',
      description: 'Cotă redusă 11% (din august 2025)',
    },
    {
      taxCode: 'E',
      taxType: 'Exempt',
      taxPercentage: '0.00',
      validFrom: '2025-08-01',
      validTo: null,
      isDefault: true,
      vatAccountOutput: null,
      vatAccountInput: null,
      description: 'Scutit de TVA',
    },
    // Istoric — NU se șterg, dar nu pot fi alese pentru un document nou
    // (validTo trecut). Necesare pentru facturi/rapoarte pe perioade vechi.
    // validTo = prima zi ÎN CARE cota NU mai e validă (interval semi-deschis
    // [validFrom, validTo) — exact convenția din query-ul documentat în
    // docs/invoicing-spec.md: "valid_from <= data AND (valid_to IS NULL OR
    // valid_to > data)"). Ultima zi validă pentru cotele vechi rămâne
    // 2025-07-31 — de asta validTo e 2025-08-01, NU 2025-07-31 (care ar
    // lăsa exact ziua de 31.07.2025 fără nicio cotă găsită de query, o zi
    // reală, nu ipotetică — găsit de logic-reviewer prin rulare directă a
    // query-ului contra acestor date).
    {
      taxCode: 'S19',
      taxType: 'Standard',
      taxPercentage: '19.00',
      validFrom: '2020-01-01',
      validTo: '2025-08-01',
      isDefault: false,
      vatAccountOutput: '4427',
      vatAccountInput: '4426',
      description: 'Cotă standard 19% (istoric, până la 31.07.2025)',
    },
    {
      taxCode: 'R9',
      taxType: 'Reduced',
      taxPercentage: '9.00',
      validFrom: '2020-01-01',
      validTo: '2025-08-01',
      isDefault: false,
      vatAccountOutput: '4427',
      vatAccountInput: '4426',
      description: 'Cotă redusă 9% (istoric, până la 31.07.2025)',
    },
    {
      taxCode: 'R5',
      taxType: 'Reduced',
      taxPercentage: '5.00',
      validFrom: '2020-01-01',
      validTo: '2025-08-01',
      isDefault: false,
      vatAccountOutput: '4427',
      vatAccountInput: '4426',
      description: 'Cotă redusă 5% (istoric, până la 31.07.2025)',
    },
  ];

  for (const tc of TAX_CODES) {
    await prisma.taxCode.upsert({
      where: {
        taxCode_validFrom: {
          taxCode: tc.taxCode,
          validFrom: new Date(tc.validFrom),
        },
      },
      update: {},
      create: {
        taxCode: tc.taxCode,
        taxType: tc.taxType,
        taxPercentage: tc.taxPercentage,
        validFrom: new Date(tc.validFrom),
        validTo: tc.validTo ? new Date(tc.validTo) : null,
        isDefault: tc.isDefault,
        vatAccountOutput: tc.vatAccountOutput,
        vatAccountInput: tc.vatAccountInput,
        description: tc.description,
      },
    });
  }

  await prisma.$disconnect();

  console.log('Seed OK — user de test:');
  console.log(`  email:    ${TEST_EMAIL}`);
  console.log(`  parolă:   ${TEST_PASSWORD}`);
  console.log(`  tenantId: ${tenant.id}`);
  console.log(
    `  modul "${INVOICING_MODULE_CODE}" + plan "start" înregistrate în catalog (fără entitlement activ, fără logică de facturare).`,
  );
  console.log(
    `  ${TAX_CODES.length} cote TVA seed-uite (3 curente + 3 istoric) — vezi docs/invoicing-spec.md.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
