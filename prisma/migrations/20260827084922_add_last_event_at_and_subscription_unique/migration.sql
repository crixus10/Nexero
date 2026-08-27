
-- DropIndex
DROP INDEX "tenant_modules_stripe_subscription_id_idx";

-- AlterTable
ALTER TABLE "tenant_modules" ADD COLUMN     "last_event_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_modules_stripe_subscription_id_key" ON "tenant_modules"("stripe_subscription_id");

