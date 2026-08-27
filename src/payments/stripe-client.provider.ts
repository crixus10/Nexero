import { Provider } from '@nestjs/common';
import Stripe from 'stripe';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

/**
 * Factory (nu obiect static) — eroarea de configurare (STRIPE_SECRET_KEY
 * lipsă) apare la bootstrap-ul Nest, cu context clar, la fel ca
 * JWT_SECRET în auth.module.ts și DATABASE_URL în PrismaService.
 */
export const stripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: (): Stripe => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY nu e setat — vezi .env.example.');
    }
    return new Stripe(secretKey);
  },
};
