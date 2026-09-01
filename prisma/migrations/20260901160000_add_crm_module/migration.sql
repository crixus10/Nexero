-- CRM module ("Clienți" în UI) — vezi docs/crm-spec.md.
-- `customers` devine `companies` (RENAME, nu DROP+CREATE — păstrează
-- clienții existenți și facturile care-i referă). Restul e schemă nouă:
-- contacts, deals, tasks, notes, tabele de asignare, plus `code_sequences`
-- (mecanism de nucleu pentru coduri auto-generate, reutilizat și de
-- companies/products).

-- ─── Redenumire customers → companies ──────────────────────────────────
ALTER TABLE "customers" RENAME TO "companies";
ALTER TABLE "companies" RENAME COLUMN "customer_code" TO "company_code";
ALTER TABLE "companies" RENAME CONSTRAINT "customers_pkey" TO "companies_pkey";
ALTER TABLE "companies" RENAME CONSTRAINT "customers_tenant_id_fkey" TO "companies_tenant_id_fkey";
ALTER INDEX "customers_tenant_id_customer_code_key" RENAME TO "companies_tenant_id_company_code_key";
ALTER INDEX "customers_tenant_id_idx" RENAME TO "companies_tenant_id_idx";

-- Câmpuri noi CRM pe companies (extensie, nu tabel paralel).
ALTER TABLE "companies"
  ADD COLUMN "website" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "connection_strength" TEXT,
  ADD COLUMN "estimated_revenue_range" TEXT;

-- ─── invoices.customer_id → invoices.company_id ────────────────────────
ALTER TABLE "invoices" RENAME COLUMN "customer_id" TO "company_id";
ALTER TABLE "invoices" RENAME CONSTRAINT "invoices_customer_id_fkey" TO "invoices_company_id_fkey";
ALTER INDEX "invoices_customer_id_idx" RENAME TO "invoices_company_id_idx";

-- ─── Cod auto-generat (mecanism de nucleu, reutilizabil) ───────────────
CREATE TABLE "code_sequences" (
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "code_sequences_pkey" PRIMARY KEY ("tenant_id", "entity_type")
);

ALTER TABLE "code_sequences" ADD CONSTRAINT "code_sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── contacts ───────────────────────────────────────────────────────────
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contact_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "position" TEXT,
    "company_id" UUID,
    "social_links" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contacts_tenant_id_contact_code_key" ON "contacts"("tenant_id", "contact_code");
CREATE INDEX "contacts_tenant_id_idx" ON "contacts"("tenant_id");
CREATE INDEX "contacts_company_id_idx" ON "contacts"("company_id");

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── deals ──────────────────────────────────────────────────────────────
CREATE TABLE "deals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "deal_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contact_id" UUID,
    "company_id" UUID,
    "total_value" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RON',
    "status" TEXT NOT NULL DEFAULT 'proposal',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "deal_date" DATE NOT NULL,
    "expected_close_date" DATE,
    "discount_percent" DECIMAL(5,2),
    "payment_method" TEXT,
    "invoice_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deals_tenant_id_deal_code_key" ON "deals"("tenant_id", "deal_code");
CREATE INDEX "deals_tenant_id_idx" ON "deals"("tenant_id");
CREATE INDEX "deals_company_id_idx" ON "deals"("company_id");
CREATE INDEX "deals_contact_id_idx" ON "deals"("contact_id");

ALTER TABLE "deals" ADD CONSTRAINT "deals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── tasks ──────────────────────────────────────────────────────────────
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMPTZ(6),
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "company_id" UUID,
    "contact_id" UUID,
    "deal_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tasks_tenant_id_idx" ON "tasks"("tenant_id");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "task_assignees" (
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id", "user_id")
);

ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── notes ──────────────────────────────────────────────────────────────
CREATE TABLE "notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "category" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "due_at" TIMESTAMPTZ(6),
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "company_id" UUID,
    "contact_id" UUID,
    "deal_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notes_tenant_id_idx" ON "notes"("tenant_id");

ALTER TABLE "notes" ADD CONSTRAINT "notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "note_assignees" (
    "note_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "note_assignees_pkey" PRIMARY KEY ("note_id", "user_id")
);

ALTER TABLE "note_assignees" ADD CONSTRAINT "note_assignees_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "note_assignees" ADD CONSTRAINT "note_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── company_team_members ("Team" din demo) ────────────────────────────
CREATE TABLE "company_team_members" (
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "company_team_members_pkey" PRIMARY KEY ("company_id", "user_id")
);

ALTER TABLE "company_team_members" ADD CONSTRAINT "company_team_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_team_members" ADD CONSTRAINT "company_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
