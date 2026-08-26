// Seed de dezvoltare — creează un tenant + un user de test pentru login.
// Idempotent (upsert): sigur de rulat de mai multe ori.
// Rulare: `npx prisma db seed` (configurat în prisma7.config.ts).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const TEST_EMAIL = 'test@nexero.local';
const TEST_PASSWORD = 'parola-test-123';
const SALT_ROUNDS = 10;

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

  await prisma.$disconnect();

  console.log('Seed OK — user de test:');
  console.log(`  email:    ${TEST_EMAIL}`);
  console.log(`  parolă:   ${TEST_PASSWORD}`);
  console.log(`  tenantId: ${tenant.id}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
