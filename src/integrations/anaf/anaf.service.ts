import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AnafCuiInfo } from './anaf-cui-info.interface';

const ANAF_TVA_ENDPOINT =
  'https://webservicesp.anaf.ro/PlatitorTvaRest/api/v9/ws/tva';

interface AnafRawFoundEntry {
  date_generale: {
    cui: number;
    denumire: string;
    adresa: string;
  };
  inregistrare_scop_Tva?: {
    scpTVA: boolean;
  };
}

interface AnafRawResponse {
  cod: number;
  message: string;
  found: AnafRawFoundEntry[];
  notFound: number[];
}

/**
 * Adaptor izolat pentru integrarea ANAF (regula #5 din CLAUDE.md) — singurul
 * loc din cod care vorbește cu serviciile publice ANAF. Azi doar validare
 * CUI (webservicesp.anaf.ro, API public v9 „PlatitorTvaRest”, fără cheie/
 * autentificare); e-Factura și e-TVA/SPV se adaugă tot aici, niciodată
 * replicate în module de business — vezi docs/invoicing-spec.md, secțiunea
 * „Integrare conformitate”.
 */
@Injectable()
export class AnafService {
  private readonly logger = new Logger(AnafService.name);

  /**
   * Validează un CUI/CIF contra registrului public ANAF (contribuabili
   * înregistrați în scop de TVA). Acceptă formatele uzuale („RO12345678”,
   * „ro 12345678”, „12345678”) — normalizează la cifre pure înainte de
   * apel (ANAF nu acceptă prefixul „RO” în request).
   *
   * Aruncă `BadRequestException` doar pentru format invalid sau CUI
   * negăsit în registru — „CUI invalid”, clar pentru utilizator (cerința
   * B.1 din docs/roadmap.md). NU tratează un eșec al serviciului ANAF
   * (rețea/5xx/timeout) ca „CUI invalid” — un client
   * cu CUI corect n-ar trebui respins din cauza unei indisponibilități
   * ANAF temporare; aruncă `ServiceUnavailableException`, distinct, ca
   * apelantul (CompaniesService, modulul crm) să nu confunde cele două cazuri.
   */
  async validateCui(rawCui: string): Promise<AnafCuiInfo> {
    const cui = this.normalizeCui(rawCui);
    if (!cui) {
      throw new BadRequestException(`CUI invalid: „${rawCui}”.`);
    }

    const today = new Date().toISOString().slice(0, 10);
    let response: Response;
    try {
      response = await fetch(ANAF_TVA_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ cui: Number(cui), data: today }]),
        // Fără timeout, un ANAF care agață (nu doar 5xx/down) ar bloca
        // request-ul indefinit — risc de epuizare conexiuni la volum, nu
        // doar UX prost (fix logic-reviewer).
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      this.logger.error(`Apel ANAF eșuat pentru CUI ${cui}: ${String(err)}`);
      throw new ServiceUnavailableException(
        'Serviciul ANAF de validare CUI e indisponibil momentan — reîncearcă.',
      );
    }

    if (!response.ok) {
      this.logger.error(`ANAF a răspuns ${response.status} pentru CUI ${cui}.`);
      throw new ServiceUnavailableException(
        'Serviciul ANAF de validare CUI e indisponibil momentan — reîncearcă.',
      );
    }

    const body = (await response.json()) as AnafRawResponse;
    // HTTP 200 nu garantează un răspuns de business valid — `cod` != 200
    // e o eroare ANAF (ex. limită de request-uri, eroare internă), distinct
    // de „CUI negăsit” (found: [], dar cod: 200) — fix logic-reviewer,
    // altfel un eșec de serviciu era raportat utilizatorului ca „CUI
    // invalid”, mesaj înșelător.
    if (body.cod !== 200) {
      this.logger.error(
        `ANAF a răspuns cod=${body.cod} ("${body.message}") pentru CUI ${cui}.`,
      );
      throw new ServiceUnavailableException(
        'Serviciul ANAF de validare CUI e indisponibil momentan — reîncearcă.',
      );
    }
    const entry = body.found?.[0];
    if (!entry) {
      throw new BadRequestException(
        `CUI „${cui}” nu a fost găsit în registrul ANAF.`,
      );
    }

    return {
      cui,
      isVatPayer: entry.inregistrare_scop_Tva?.scpTVA ?? false,
      name: entry.date_generale.denumire,
      address: entry.date_generale.adresa ?? null,
    };
  }

  /**
   * Normalizează un CUI la forma stocată intern (cifre pure, fără „RO”),
   * FĂRĂ să-l verifice contra registrului ANAF — fallback explicit pentru
   * cazul în care `validateCui` aruncă `ServiceUnavailableException`
   * (serviciul ANAF picat/indisponibil temporar): cerință directă a
   * utilizatorului — o cădere ANAF nu trebuie să blocheze introducerea
   * manuală a unui CUI. Aruncă `BadRequestException` doar pentru format
   * clar invalid (lungime greșită) — aceeași verificare de bază ca la
   * validarea online, doar fără apelul de rețea. Apelantul
   * (`CompaniesService`) rămâne responsabil să distingă cele două erori
   * (`ServiceUnavailableException` → apelează asta; `BadRequestException`
   * de la `validateCui` → CUI respins, nu ocolit).
   */
  normalizeCuiUnverified(rawCui: string): string {
    const cui = this.normalizeCui(rawCui);
    if (!cui) {
      throw new BadRequestException(`CUI invalid: „${rawCui}”.`);
    }
    return cui;
  }

  /**
   * STUB — transmiterea reală RO e-Factura (SPV) cere credențiale OAuth
   * ANAF pe care platforma nu le are încă configurate. Rămâne izolată aici
   * (regula #5 din CLAUDE.md) ca punct unic de extindere ulterioară — vezi
   * docs/invoicing-spec.md, secțiunea „e-Factura ANAF", pașii 2-3 (XML UBL
   * RO_CIUS, transmitere asincronă la SPV, webhook/polling de răspuns).
   * InvoicesService o apelează automat la tranziția draft→issued, niciodată
   * manual — asta acoperă doar „declanșarea", nu transmiterea reală: state-ul
   * rămâne `pending` până se implementează fluxul complet.
   */
  submitEInvoice(invoiceId: string): { status: 'pending' } {
    this.logger.warn(
      `submitEInvoice STUB pentru factura ${invoiceId} — transmitere SPV reală neimplementată încă (lipsesc credențiale OAuth ANAF).`,
    );
    return { status: 'pending' };
  }

  private normalizeCui(rawCui: string): string | null {
    const digits = rawCui
      .trim()
      .toUpperCase()
      .replace(/^RO/, '')
      .replace(/[^0-9]/g, '');
    // CUI românesc: minim 2 cifre, maxim 10 — sub 2 nu e niciodată un CUI
    // valid, doar zgomot inutil trimis către API-ul extern (fix minor
    // logic-reviewer).
    if (digits.length < 2 || digits.length > 10) {
      return null;
    }
    return digits;
  }
}
