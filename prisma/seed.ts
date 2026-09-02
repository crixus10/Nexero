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

// Modulul CRM ("Clienți" în UI), per docs/roadmap.md — Modulul 4, construit
// înaintea Modulelor 2-3 la cererea explicită a utilizatorului (vezi linia
// „Decizie: ..." din docs/roadmap.md). Preț din docs/pricing.md, pachetul
// „Business" (~65 €/lună) — acolo unde CRM apare prima dată ca modul de bază.
const CRM_MODULE_CODE = 'crm';
const CRM_BUSINESS_PLAN_ID = '00000000-0000-0000-0000-000000000003';

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
  // Identitate (users) — independentă de firmă, per docs/data-model.md,
  // secțiunea „Multi-firmă". Accesul + rolul ('owner' — userul de test
  // trebuie să poată gestiona alți useri, src/users/, și module-roles la
  // testare locală) se scriu separat, în user_tenant_access mai jos.
  const testUser = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash, fullName: 'Owner Demo' },
    create: { email: TEST_EMAIL, passwordHash, fullName: 'Owner Demo' },
  });
  // Setat și pe `update` (nu doar `create`) — altfel un re-seed pe un user
  // deja existent dintr-o rulare anterioară a script-ului l-ar lăsa cu
  // default-ul DB ('operator'), nu cu 'owner' — exact ce s-a întâmplat la
  // verificarea manuală a sesiunii care a introdus role/isActive.
  await prisma.userTenantAccess.upsert({
    where: { userId_tenantId: { userId: testUser.id, tenantId: tenant.id } },
    update: { role: 'owner', isActive: true },
    create: { userId: testUser.id, tenantId: tenant.id, role: 'owner' },
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

  // Entitlement activ + rol de modul — DOAR pentru testare locală end-to-
  // end (UI din /web). NU e cum se activează un entitlement în producție
  // (regula #4 din CLAUDE.md: exclusiv din webhook-ul de plată Stripe/
  // Netopia, niciodată dintr-un endpoint apelabil de client) — dar acesta
  // e un script de dev rulat direct contra bazei, nu un endpoint, deci nu
  // încalcă regula. Fără el, orice rută `@RequireModule('invoicing')`/
  // `@RequireModuleRole(...)` (deci tot UI-ul de facturare) ar da 403 pe
  // userul de test, și singura alternativă ar fi rularea Stripe CLI local
  // doar ca să apeși un buton „Creează factură".
  await prisma.tenantModule.upsert({
    where: {
      tenantId_moduleCode: {
        tenantId: tenant.id,
        moduleCode: INVOICING_MODULE_CODE,
      },
    },
    update: { status: 'active', planId: INVOICING_START_PLAN_ID },
    create: {
      tenantId: tenant.id,
      moduleCode: INVOICING_MODULE_CODE,
      planId: INVOICING_START_PLAN_ID,
      status: 'active',
    },
  });
  // invoicing:admin — acoperă toate rutele RBAC ale modulului (creare
  // serii, facturi, emitere, note de credit) cu un singur rol, potrivit
  // pentru un cont de test/owner, nu pentru segregarea reală issuer/
  // approver (asta se testează separat, creând useri suplimentari prin
  // src/users/ + UI-ul de management useri, nu prin seed).
  await prisma.userModuleRole.upsert({
    where: {
      tenantId_userId_moduleCode_role: {
        tenantId: tenant.id,
        userId: testUser.id,
        moduleCode: INVOICING_MODULE_CODE,
        role: 'invoicing:admin',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: testUser.id,
      moduleCode: INVOICING_MODULE_CODE,
      role: 'invoicing:admin',
    },
  });

  // Catalog modulul CRM ("Clienți" în UI) — vezi docs/crm-spec.md,
  // docs/pricing.md (pachetul „Business", unde CRM apare prima dată ca
  // modul de bază).
  await prisma.module.upsert({
    where: { code: CRM_MODULE_CODE },
    update: {},
    create: {
      code: CRM_MODULE_CODE,
      name: 'CRM',
      billingType: 'flat',
    },
  });
  await prisma.plan.upsert({
    where: { id: CRM_BUSINESS_PLAN_ID },
    update: {},
    create: {
      id: CRM_BUSINESS_PLAN_ID,
      moduleCode: CRM_MODULE_CODE,
      name: 'business',
      priceCents: 6500, // 65 €/lună, docs/pricing.md
      currency: 'EUR',
      billingPeriod: 'monthly',
    },
  });
  // Entitlement + rol — DOAR pentru testare locală, aceeași motivație ca la
  // invoicing mai sus.
  await prisma.tenantModule.upsert({
    where: {
      tenantId_moduleCode: { tenantId: tenant.id, moduleCode: CRM_MODULE_CODE },
    },
    update: { status: 'active', planId: CRM_BUSINESS_PLAN_ID },
    create: {
      tenantId: tenant.id,
      moduleCode: CRM_MODULE_CODE,
      planId: CRM_BUSINESS_PLAN_ID,
      status: 'active',
    },
  });
  await prisma.userModuleRole.upsert({
    where: {
      tenantId_userId_moduleCode_role: {
        tenantId: tenant.id,
        userId: testUser.id,
        moduleCode: CRM_MODULE_CODE,
        role: 'crm:admin',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: testUser.id,
      moduleCode: CRM_MODULE_CODE,
      role: 'crm:admin',
    },
  });

  // Date demo CRM — o companie cu echipă/categorii/conexiune, un contact
  // legat de ea, un deal și o sarcină/notă. Scrise direct prin Prisma (ca
  // restul acestui script) — CodeSequenceService trăiește în contextul Nest
  // (nu e disponibil într-un script standalone), deci codurile sunt
  // calculate aici direct, iar `code_sequences` e adus la zi manual ca
  // primul cod real creat din UI să continue corect de la CLI-0002 etc.
  const demoCompany = await prisma.company.upsert({
    where: { tenantId_companyCode: { tenantId: tenant.id, companyCode: 'CLI-0001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      companyCode: 'CLI-0001',
      name: 'Tech Solutions SRL',
      taxId: null,
      city: 'Cluj-Napoca',
      country: 'RO',
      isVatPayer: true,
      website: 'https://techsolutions.example.ro',
      email: 'contact@techsolutions.example.ro',
      description: 'Furnizor de servicii IT pentru IMM-uri.',
      categories: ['B2B', 'IT'],
      connectionStrength: 'strong',
      estimatedRevenueRange: '100K-500K',
      teamMembers: { create: [{ userId: testUser.id }] },
    },
  });
  const demoContact = await prisma.contact.upsert({
    where: { tenantId_contactCode: { tenantId: tenant.id, contactCode: 'CTC-0001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      contactCode: 'CTC-0001',
      name: 'Ana Popescu',
      email: 'ana.popescu@techsolutions.example.ro',
      position: 'CEO',
      companyId: demoCompany.id,
    },
  });
  const demoDeal = await prisma.deal.upsert({
    where: { tenantId_dealCode: { tenantId: tenant.id, dealCode: 'DEAL-2026-0001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      dealCode: 'DEAL-2026-0001',
      title: 'Contract mentenanță anuală',
      contactId: demoContact.id,
      companyId: demoCompany.id,
      totalValue: 12000,
      currency: 'RON',
      status: 'proposal',
      priority: 'high',
      dealDate: new Date('2026-08-15'),
      expectedCloseDate: new Date('2026-09-30'),
    },
  });
  await prisma.task.create({
    data: {
      tenantId: tenant.id,
      title: 'Trimite ofertă actualizată',
      priority: 'high',
      status: 'pending',
      dueAt: new Date('2026-09-10T10:00:00Z'),
      dealId: demoDeal.id,
      assignees: { create: [{ userId: testUser.id }] },
    },
  });
  await prisma.note.create({
    data: {
      tenantId: tenant.id,
      title: 'Discuție inițială',
      content: 'Clientul e interesat de un contract pe 12 luni, cu SLA 24/7.',
      companyId: demoCompany.id,
      isFavorite: true,
      assignees: { create: [{ userId: testUser.id }] },
    },
  });
  // Aduce la zi contorul, ca primul „+Adaugă" real din UI să continue de la
  // CLI-0002/CTC-0002/DEAL-2026-0002, nu să coliziune cu datele demo de mai sus.
  await prisma.codeSequence.upsert({
    where: { tenantId_entityType: { tenantId: tenant.id, entityType: 'company' } },
    update: {},
    create: { tenantId: tenant.id, entityType: 'company', nextValue: 2 },
  });
  await prisma.codeSequence.upsert({
    where: { tenantId_entityType: { tenantId: tenant.id, entityType: 'contact' } },
    update: {},
    create: { tenantId: tenant.id, entityType: 'contact', nextValue: 2 },
  });
  await prisma.codeSequence.upsert({
    where: { tenantId_entityType: { tenantId: tenant.id, entityType: 'deal:2026' } },
    update: {},
    create: { tenantId: tenant.id, entityType: 'deal:2026', nextValue: 2 },
  });

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
    `  modul "${INVOICING_MODULE_CODE}" + plan "start": entitlement ACTIV (doar pt. testare locală, vezi comentariul din cod) + rol "invoicing:admin" acordat userului de test.`,
  );
  console.log(
    `  modul "${CRM_MODULE_CODE}" + plan "business": entitlement ACTIV + rol "crm:admin" acordat userului de test — companie/contact/deal/task/notă demo create (CLI-0001/CTC-0001/DEAL-2026-0001).`,
  );
  console.log(
    `  ${TAX_CODES.length} cote TVA seed-uite (3 curente + 3 istoric) — vezi docs/invoicing-spec.md.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
