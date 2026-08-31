-- DropForeignKey
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_product_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_reversed_invoice_id_fkey";

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reversed_invoice_id_fkey" FOREIGN KEY ("reversed_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint (manual — Prisma nu generează CHECK-uri custom, la fel
-- ca products_default_tax_type_check/tax_codes_tax_type_check/etc. din
-- migrarea 20260827150000). Interval semi-deschis [valid_from, valid_to) —
-- vezi docs/invoicing-spec.md, secțiunea "Rezolvarea cotei TVA".
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_valid_to_check" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from");

-- AddCheckConstraint (manual) — o factură nu poate fi propriul ei storno.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_not_self_reversed_check" CHECK ("reversed_invoice_id" IS NULL OR "reversed_invoice_id" != "id");
