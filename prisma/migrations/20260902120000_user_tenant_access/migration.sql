-- Multi-firmă: `users` devine identitate pură (email/parolă/nume), fără
-- tenant_id/role proprii. Accesul + rolul per firmă se mută în
-- user_tenant_access — vezi docs/data-model.md, secțiunea „Multi-firmă —
-- un user poate accesa mai multe firme (user_tenant_access)".

-- CreateTable
CREATE TABLE "user_tenant_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tenant_access_pkey" PRIMARY KEY ("id")
);

-- Backfill: un rând per user existent, din (tenant_id, role) DINAINTE de
-- eliminarea coloanelor mai jos — obligatoriu în ACEEAȘI migrare (nu în
-- două separate), altfel există o fereastră în care userii n-au niciun
-- rând de acces și pică orice autentificare.
INSERT INTO "user_tenant_access" ("user_id", "tenant_id", "role", "is_active")
SELECT "id", "tenant_id", "role", true FROM "users";

-- AddCheckConstraint (manual — Prisma nu generează CHECK-uri custom, la
-- fel ca celelalte enum-uri text din acest proiect).
ALTER TABLE "user_tenant_access" ADD CONSTRAINT "user_tenant_access_role_check" CHECK ("role" IN ('owner','admin','accountant','operator'));

-- CreateIndex
CREATE UNIQUE INDEX "user_tenant_access_user_id_tenant_id_key" ON "user_tenant_access"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "user_tenant_access_tenant_id_idx" ON "user_tenant_access"("tenant_id");

-- CreateIndex
CREATE INDEX "user_tenant_access_user_id_idx" ON "user_tenant_access"("user_id");

-- AddForeignKey
ALTER TABLE "user_tenant_access" ADD CONSTRAINT "user_tenant_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenant_access" ADD CONSTRAINT "user_tenant_access_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- users redevine identitate pură — elimină tenant_id/role (mutate mai sus).
-- is_active RĂMÂNE pe users (comutator global de cont, distinct de
-- user_tenant_access.is_active — vezi comentariul din schema.prisma).
ALTER TABLE "users" DROP CONSTRAINT "users_tenant_id_fkey";

ALTER TABLE "users" DROP CONSTRAINT "users_role_check";

DROP INDEX "users_tenant_id_idx";

ALTER TABLE "users" DROP COLUMN "tenant_id";

ALTER TABLE "users" DROP COLUMN "role";
