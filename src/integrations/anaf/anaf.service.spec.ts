import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AnafService } from './anaf.service';

describe('AnafService', () => {
  let service: AnafService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new AnafService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('respinge un CUI cu format invalid fără să apeleze ANAF', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    await expect(service.validateCui('abc')).rejects.toThrow(
      BadRequestException,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('normalizează prefixul RO și întoarce datele firmei pentru un CUI găsit', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          cod: 200,
          message: 'SUCCESS',
          found: [
            {
              date_generale: {
                cui: 12345678,
                denumire: 'Firma Test SRL',
                adresa: 'Str. Exemplu 1',
              },
              inregistrare_scop_Tva: { scpTVA: true },
            },
          ],
          notFound: [],
        }),
    });

    const result = await service.validateCui('RO 12345678');

    expect(result).toEqual({
      cui: '12345678',
      isVatPayer: true,
      name: 'Firma Test SRL',
      address: 'Str. Exemplu 1',
    });
  });

  it('aruncă BadRequestException pentru un CUI negăsit în registrul ANAF', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          cod: 200,
          message: 'SUCCESS',
          found: [],
          notFound: [12345678],
        }),
    });

    await expect(service.validateCui('12345678')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('aruncă ServiceUnavailableException dacă apelul ANAF eșuează la nivel de rețea', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await expect(service.validateCui('12345678')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('aruncă ServiceUnavailableException dacă ANAF răspunde cu un status non-200', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(service.validateCui('12345678')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('aruncă ServiceUnavailableException dacă ANAF răspunde HTTP 200 dar cu cod de business diferit de 200', async () => {
    // HTTP ok, dar `cod` != 200 în body — eroare de business ANAF (ex.
    // limită de request-uri), distinctă de „CUI negăsit" (found: [], dar
    // cod: 200) — fix logic-reviewer.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          cod: 429,
          message: 'Too many requests',
          found: [],
          notFound: [],
        }),
    });

    await expect(service.validateCui('12345678')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('respinge un CUI de o singură cifră fără să apeleze ANAF', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    await expect(service.validateCui('5')).rejects.toThrow(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe('normalizeCuiUnverified', () => {
    // Fallback pentru introducere manuală de CUI când ANAF e indisponibil
    // (CompaniesService.resolveTaxId) — nu apelează rețeaua deloc.
    it('normalizează un CUI valid fără să apeleze ANAF', () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy;

      expect(service.normalizeCuiUnverified('RO 12345678')).toBe('12345678');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('respinge un format clar invalid', () => {
      expect(() => service.normalizeCuiUnverified('abc')).toThrow(
        BadRequestException,
      );
    });
  });
});
