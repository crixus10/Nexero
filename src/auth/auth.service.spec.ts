import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
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
  let findMany: jest.Mock;
  let findFirst: jest.Mock;
  let signAsync: jest.Mock;

  const seededUser = {
    id: 'user-1',
    email: 'test@nexero.local',
    passwordHash: bcrypt.hashSync('parola-corecta', TEST_BCRYPT_ROUNDS),
    isActive: true,
    createdAt: new Date(),
  };

  const oneTenantAccess = [
    {
      tenantId: 'tenant-1',
      role: 'owner',
      tenant: { id: 'tenant-1', name: 'Firma 1' },
    },
  ];

  beforeEach(async () => {
    findUnique = jest.fn();
    findMany = jest.fn().mockResolvedValue(oneTenantAccess);
    findFirst = jest.fn();
    signAsync = jest.fn().mockResolvedValue('fake.jwt.token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique },
            userTenantAccess: { findMany, findFirst },
          },
        },
        {
          provide: JwtService,
          useValue: { signAsync },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('emite un token complet (cu tenantId) când userul are acces la o singură firmă', async () => {
    findUnique.mockResolvedValue(seededUser);

    const result = await service.login('test@nexero.local', 'parola-corecta');

    expect(result).toEqual({ accessToken: 'fake.jwt.token' });
    expect(signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      tenantId: 'tenant-1',
    });
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

  it('respinge un cont dezactivat GLOBAL (users.isActive:false) cu ACELAȘI mesaj generic (fix logic-reviewer)', async () => {
    findUnique.mockResolvedValue({ ...seededUser, isActive: false });

    await expect(
      service.login('test@nexero.local', 'parola-corecta'),
    ).rejects.toThrow(new UnauthorizedException('Email sau parolă incorecte.'));
    expect(findMany).not.toHaveBeenCalled(); // respins înainte de a mai citi accesul per-firmă
  });

  it('respinge un cont fără nicio firmă activă în user_tenant_access', async () => {
    findUnique.mockResolvedValue(seededUser);
    findMany.mockResolvedValue([]);

    // Mesaj generic identic cu cazul "parolă greșită" — fix logic-reviewer,
    // anti-enumerare (vezi comentariul din auth.service.ts).
    await expect(
      service.login('test@nexero.local', 'parola-corecta'),
    ).rejects.toThrow(new UnauthorizedException('Email sau parolă incorecte.'));
  });

  it('emite un token PRE-TENANT (fără tenantId) + lista de firme, când userul are acces la mai multe', async () => {
    findUnique.mockResolvedValue(seededUser);
    findMany.mockResolvedValue([
      { tenantId: 't1', role: 'owner', tenant: { id: 't1', name: 'Firma 1' } },
      {
        tenantId: 't2',
        role: 'operator',
        tenant: { id: 't2', name: 'Firma 2' },
      },
    ]);

    const result = await service.login('test@nexero.local', 'parola-corecta');

    expect(signAsync).toHaveBeenCalledWith({ sub: 'user-1' }); // fără tenantId
    expect(result).toEqual({
      accessToken: 'fake.jwt.token',
      tenants: [
        { tenantId: 't1', tenantName: 'Firma 1', role: 'owner' },
        { tenantId: 't2', tenantName: 'Firma 2', role: 'operator' },
      ],
    });
  });

  describe('switchTenant', () => {
    it('emite un token complet dacă userul chiar are acces activ la firma cerută', async () => {
      findFirst.mockResolvedValue({ tenantId: 't2', role: 'operator' });

      const result = await service.switchTenant('user-1', 't2');

      expect(result).toEqual({ accessToken: 'fake.jwt.token' });
      expect(signAsync).toHaveBeenCalledWith({ sub: 'user-1', tenantId: 't2' });
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          tenantId: 't2',
          isActive: true,
          user: { isActive: true },
        },
      });
    });

    it('respinge cu ForbiddenException dacă userul NU are acces la firma cerută (fix IDOR)', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.switchTenant('user-1', 't-necunoscut'),
      ).rejects.toThrow(ForbiddenException);
      expect(signAsync).not.toHaveBeenCalled();
    });
  });
});
