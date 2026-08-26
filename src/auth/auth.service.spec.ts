import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

// Cost mic (4), doar pentru viteza testelor — nu ține de securitatea
// reală, care rămâne cea din AuthService (BCRYPT_ROUNDS = 10).
const TEST_BCRYPT_ROUNDS = 4;

describe('AuthService', () => {
  let service: AuthService;
  let findUnique: jest.Mock;

  const seededUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'test@nexero.local',
    passwordHash: bcrypt.hashSync('parola-corecta', TEST_BCRYPT_ROUNDS),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    findUnique = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: { user: { findUnique } },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('fake.jwt.token'),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('emite un token la credențiale corecte', async () => {
    findUnique.mockResolvedValue(seededUser);

    const result = await service.login('test@nexero.local', 'parola-corecta');

    expect(result).toEqual({ accessToken: 'fake.jwt.token' });
  });

  it('normalizează email-ul (case-insensitive) înainte de căutare', async () => {
    findUnique.mockResolvedValue(seededUser);

    await service.login('Test@Nexero.Local', 'parola-corecta');

    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'test@nexero.local' },
    });
  });

  it('respinge parola greșită cu mesaj generic', async () => {
    findUnique.mockResolvedValue(seededUser);

    await expect(
      service.login('test@nexero.local', 'parola-gresita'),
    ).rejects.toThrow(new UnauthorizedException('Email sau parolă incorecte.'));
  });

  it('respinge email inexistent cu ACELAȘI mesaj ca parolă greșită (anti-enumerare)', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      service.login('nu-exista@nexero.local', 'orice-parola'),
    ).rejects.toThrow(new UnauthorizedException('Email sau parolă incorecte.'));
  });
});
