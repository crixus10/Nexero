import {
  Controller,
  Get,
  INestApplication,
  Module,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Protected, Public } from '../src/auth/public.decorator';
import type { RequestWithUser } from '../src/auth/jwt-auth.guard';

// Controller „fals", ca un viitor modul de business — dovedește că
// JwtAuthGuard protejează ORICE rută nouă fără niciun @UseGuards explicit,
// și că @Public() rămâne singurul mod de a ocoli asta.
@Controller('test-global-guard')
class FakeBusinessController {
  @Get('protected')
  protectedRoute(@Req() req: RequestWithUser): {
    tenantId: string;
    userId: string;
  } {
    return { tenantId: req.user.tenantId, userId: req.user.userId };
  }

  @Public()
  @Get('open')
  openRoute(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [FakeBusinessController] })
class FakeBusinessModule {}

// Regresie: @Public() pus pe o CLASĂ întreagă face publice toate metodele
// fără adnotare proprie — @Protected() e excepția explicită pentru cazul
// rar în care o metodă chiar trebuie să rămână protejată în interiorul
// unui controller altfel public. Vezi avertismentul din public.decorator.ts.
@Controller('test-class-level-public')
@Public()
class ClassLevelPublicController {
  @Get('inherited-public')
  inheritedPublic(): { ok: true } {
    return { ok: true };
  }

  @Protected()
  @Get('opted-back-in')
  optedBackIn(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [ClassLevelPublicController] })
class ClassLevelPublicModule {}

const TEST_EMAIL = 'e2e-global-guard-test@nexero.local';
const TEST_PASSWORD = 'parola-e2e-test-123';
const TEST_CUI = 'RO-E2E-GLOBAL-GUARD';

describe('JwtAuthGuard global (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL nu e setat pentru testele e2e.');
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

    const tenant = await prisma.tenant.upsert({
      where: { cui: TEST_CUI },
      update: {},
      create: { name: 'E2E Global Guard Test Tenant', cui: TEST_CUI },
    });
    tenantId = tenant.id;
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      update: { passwordHash, tenantId },
      create: { email: TEST_EMAIL, passwordHash, tenantId },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      // AppModule + module "de business" false, exact cum ar arăta module
      // reale adăugate mai târziu — dovedește compunerea reală, nu un
      // mecanism izolat artificial.
      imports: [AppModule, FakeBusinessModule, ClassLevelPublicModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    accessToken = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.tenant.deleteMany({ where: { cui: TEST_CUI } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rută nouă, FĂRĂ @UseGuards explicit → 401 fără token', async () => {
    await request(app.getHttpServer())
      .get('/test-global-guard/protected')
      .expect(401);
  });

  it('rută nouă, FĂRĂ @UseGuards explicit → 200 + tenantId corect cu token valid', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-global-guard/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toEqual({
      tenantId,
      userId: expect.any(String) as string,
    });
  });

  it('rută marcată @Public() → 200 fără token', async () => {
    await request(app.getHttpServer())
      .get('/test-global-guard/open')
      .expect(200)
      .expect({ ok: true });
  });

  it('GET / (root, @Public()) → tot accesibil fără token', async () => {
    await request(app.getHttpServer()).get('/').expect(200);
  });

  it('@Public() pe clasă → metodă FĂRĂ adnotare proprie moștenește public', async () => {
    await request(app.getHttpServer())
      .get('/test-class-level-public/inherited-public')
      .expect(200);
  });

  it('@Protected() suprascrie @Public() de clasă pentru o metodă anume', async () => {
    await request(app.getHttpServer())
      .get('/test-class-level-public/opted-back-in')
      .expect(401);

    await request(app.getHttpServer())
      .get('/test-class-level-public/opted-back-in')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });
});
