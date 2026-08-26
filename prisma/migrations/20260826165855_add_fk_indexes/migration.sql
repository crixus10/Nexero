-- CreateIndex
CREATE INDEX "plans_module_code_idx" ON "plans"("module_code");

-- CreateIndex
CREATE INDEX "tenant_modules_plan_id_idx" ON "tenant_modules"("plan_id");

-- CreateIndex
CREATE INDEX "usage_events_tenant_id_module_code_idx" ON "usage_events"("tenant_id", "module_code");
