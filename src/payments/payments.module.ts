import { Module } from '@nestjs/common';
import { stripeClientProvider } from './stripe-client.provider';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';

/**
 * Nucleu — "billing" din docs/roadmap.md ("Nucleul: auth, tenant
 * management, entitlements, billing, adapter ANAF de bază"). Deliberat
 * NU exportă StripeWebhookService — regula #4 din CLAUDE.md ("Activarea/
 * dezactivarea unui entitlement se face EXCLUSIV din handler-ul de
 * webhook de plată, niciodată dintr-un endpoint apelabil direct de
 * client"). Niciun alt modul nu poate injecta acest serviciu.
 */
@Module({
  controllers: [StripeWebhookController],
  providers: [stripeClientProvider, StripeWebhookService],
})
export class PaymentsModule {}
