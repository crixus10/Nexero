import { Controller, Get } from '@nestjs/common';
import { RequireModule } from '../../entitlements/require-module.decorator';

/**
 * Modulul 1 (Facturare), per docs/roadmap.md — schelet minim, fără nicio
 * logică de facturare încă. Un singur endpoint placeholder, protejat prin
 * @RequireModule('invoicing') — nu de aplicat manual, e suficient
 * decoratorul: ModuleGuard rulează global (vezi src/entitlements/).
 */
@Controller('invoices')
export class InvoicingController {
  @RequireModule('invoicing')
  @Get()
  list(): [] {
    return [];
  }
}
