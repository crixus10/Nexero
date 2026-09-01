import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Necesar pentru StripeWebhookController — semnătura Stripe se
    // verifică pe bytes-ii bruți ai body-ului, nu pe JSON-ul parsat.
    // Fără asta, req.rawBody nu există și verificarea eșuează mereu.
    rawBody: true,
  });
  // Fără asta, SIGTERM (ex: `docker compose down`/restart în producție pe
  // Hetzner) omite onModuleDestroy — PrismaService nu ar mai închide
  // conexiunile din pool-ul pg la oprire.
  app.enableShutdownHooks();
  // Producția (Hetzner + Docker Compose) rulează în spatele unui reverse
  // proxy — fără asta, Express vede req.ip ca fiind IP-ul proxy-ului
  // pentru TOATE cererile, deci ThrottlerGuard (mai jos, pe /auth/login)
  // ar împărți limita de 5/min între toate firmele client în loc s-o
  // aplice per client real — un tenant care greșește parola ar bloca
  // login-ul pentru toți ceilalți. „1” = un singur hop de proxy între
  // client și aplicație; de recalibrat dacă topologia reală diferă
  // (ex: Cloudflare + reverse proxy = 2 hop-uri).
  app.set('trust proxy', 1);
  // CORS pentru frontend-ul React (/web) — origine explicită, nu '*'.
  // JWT-ul e trimis manual în header-ul Authorization (nu cookie), deci
  // `credentials: true` nu e necesar aici — dar un `origin` explicit tot e
  // obligatoriu, altfel browserul blochează citirea răspunsului din alt
  // origin. Implicit spre serverul de dev Vite (`npm run dev` în /web,
  // vezi web/README.md) — suprascrie cu FRONTEND_URL în .env dacă rulezi
  // frontend-ul pe alt port sau domeniu (ex. producție).
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  });
  // Global: orice DTO nou (ex: LoginDto) e validat automat; whitelist
  // elimină câmpuri nedeclarate, forbidNonWhitelisted respinge cereri cu
  // câmpuri în plus în loc să le ignore silențios.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
