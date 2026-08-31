-- AlterTable
ALTER TABLE "users" ADD COLUMN     "full_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'operator';

-- AddCheckConstraint (manual — Prisma nu generează CHECK-uri custom, la
-- fel ca celelalte enum-uri text din acest proiect, ex. tenant_modules.status).
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('owner','admin','accountant','operator'));

-- CreateTable
CREATE TABLE "user_module_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "module_code" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_module_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_module_roles_tenant_id_user_id_idx" ON "user_module_roles"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_module_roles_tenant_id_user_id_module_code_role_key" ON "user_module_roles"("tenant_id", "user_id", "module_code", "role");

-- AddForeignKey
ALTER TABLE "user_module_roles" ADD CONSTRAINT "user_module_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_module_roles" ADD CONSTRAINT "user_module_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_module_roles" ADD CONSTRAINT "user_module_roles_module_code_fkey" FOREIGN KEY ("module_code") REFERENCES "modules"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
