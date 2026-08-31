/**
 * Rezultatul normalizat al unei validări CUI prin AnafService — vezi
 * anaf.service.ts. Contractul public al adaptorului (regula #5 din
 * CLAUDE.md); orice modul de business îl importă doar de aici, niciodată
 * tipurile brute ale răspunsului ANAF (care se pot schimba).
 */
export interface AnafCuiInfo {
  /** CUI normalizat — doar cifre, fără prefixul „RO”. */
  cui: string;
  isVatPayer: boolean;
  name: string;
  address: string | null;
}
