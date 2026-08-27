import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import Stripe from 'stripe';
import { Public } from '../auth/public.decorator';
import { STRIPE_CLIENT } from './stripe-client.provider';
import { StripeWebhookService } from './stripe-webhook.service';

/**
 * Tipar din docs/data-model.md, secțiunea "Tiparul de activare (doar din
 * webhook, niciodată din UI)". @Public() obligatoriu — Stripe nu trimite
 * JWT-ul nostru; autenticitatea vine din verificarea semnăturii
 * criptografice (constructEvent), nu din JwtAuthGuard.
 */
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly webhookService: StripeWebhookService,
  ) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET nu e setat — vezi .env.example.');
    }
    this.webhookSecret = secret;
  }

  @Public()
  // Limită proprie, mai permisivă decât cea de pe /auth/login (5/min) —
  // Stripe poate trimite rafale de evenimente; tot merită o plasă
  // împotriva unui endpoint public lovit la întâmplare.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Post('stripe')
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!req.rawBody || !signature) {
      throw new BadRequestException(
        'Cerere webhook invalidă (lipsește body-ul brut sau semnătura).',
      );
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      // Detaliile reale (ex: motivul exact al eșecului de semnătură) doar
      // în log server-side — un apelant neautentificat nu are niciun
      // motiv legitim să le vadă în răspuns.
      this.logger.warn(
        `Verificare semnătură webhook eșuată: ${(err as Error).message}`,
      );
      throw new BadRequestException('Semnătură webhook invalidă.');
    }

    await this.webhookService.handleEvent(event);
    return { received: true };
  }
}
