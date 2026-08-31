-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_code" TEXT NOT NULL,
    "tax_id" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'RO',
    "is_vat_payer" BOOLEAN NOT NULL DEFAULT true,
    "preferred_language" TEXT NOT NULL DEFAULT 'ro',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit_of_measure" TEXT NOT NULL,
    "default_tax_type" TEXT NOT NULL,
    "unit_price" DECIMAL(14,2),
    "revenue_account" TEXT NOT NULL DEFAULT '707',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "products_default_tax_type_check" CHECK ("default_tax_type" IN ('Standard','Reduced','Exempt'))
);

-- CreateTable
CREATE TABLE "tax_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_code" TEXT NOT NULL,
    "tax_type" TEXT NOT NULL,
    "tax_percentage" DECIMAL(5,2) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "vat_account_output" TEXT,
    "vat_account_input" TEXT,
    "description" TEXT NOT NULL,

    CONSTRAINT "tax_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_codes_tax_type_check" CHECK ("tax_type" IN ('Standard','Reduced','Exempt'))
);

-- CreateTable
CREATE TABLE "invoice_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "series_code" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invoice_series_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_series_document_type_check" CHECK ("document_type" IN ('invoice','proforma','credit_note','debit_note','down_payment'))
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "tax_point_date" DATE NOT NULL,
    "invoice_type" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RON',
    "exchange_rate" DECIMAL(12,6) NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "invoice_amount" DECIMAL(14,2) NOT NULL,
    "reversed_invoice_id" UUID,
    "e_invoice_id" TEXT,
    "e_invoice_status" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_invoice_type_check" CHECK ("invoice_type" IN ('Normal','CreditNote','DebitNote','DownPayment')),
    CONSTRAINT "invoices_status_check" CHECK ("status" IN ('draft','issued','sent','paid','partially_paid','overdue','canceled'))
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "product_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_of_measure" TEXT NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "line_amount" DECIMAL(14,2) NOT NULL,
    "tax_code_id" UUID NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_audit_log" (
    "id" BIGSERIAL NOT NULL,
    "invoice_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "performed_by" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,

    CONSTRAINT "invoice_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_customer_code_key" ON "customers"("tenant_id", "customer_code");

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_product_code_key" ON "products"("tenant_id", "product_code");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_codes_tax_code_valid_from_key" ON "tax_codes"("tax_code", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_series_tenant_id_series_code_key" ON "invoice_series"("tenant_id", "series_code");

-- CreateIndex
CREATE INDEX "invoice_series_tenant_id_idx" ON "invoice_series"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_series_id_invoice_no_key" ON "invoices"("tenant_id", "series_id", "invoice_no");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_idx" ON "invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoice_id_line_number_key" ON "invoice_lines"("invoice_id", "line_number");

-- CreateIndex
CREATE INDEX "invoice_audit_log_invoice_id_idx" ON "invoice_audit_log"("invoice_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_series" ADD CONSTRAINT "invoice_series_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "invoice_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reversed_invoice_id_fkey" FOREIGN KEY ("reversed_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tax_code_id_fkey" FOREIGN KEY ("tax_code_id") REFERENCES "tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_audit_log" ADD CONSTRAINT "invoice_audit_log_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
