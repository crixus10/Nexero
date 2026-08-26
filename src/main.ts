import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Fără asta, SIGTERM (ex: `docker compose down`/restart în producție pe
  // Hetzner) omite onModuleDestroy — PrismaService nu ar mai închide
  // conexiunile din pool-ul pg la oprire.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
