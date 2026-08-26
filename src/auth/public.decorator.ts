import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marchează explicit o rută ca neautentificată — singurul mod de a ocoli
 * JwtAuthGuard, care altfel rulează global (vezi auth.module.ts, APP_GUARD).
 * Fără această adnotare, orice rută nouă e protejată implicit prin JWT —
 * exact regula #6 din CLAUDE.md aplicată la nivel de request, nu opțional
 * per modul.
 *
 * ATENȚIE: pusă pe o CLASĂ întreagă, face publice TOATE metodele ei care
 * nu au propria adnotare — util doar pentru un controller 100% public.
 * Un controller cu rute mixte (unele publice, altele nu) trebuie să
 * folosească @Public() doar pe metodele individuale, sau @Protected() pe
 * excepțiile dintr-o clasă altfel publică (vezi mai jos).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Excepție explicită pentru o metodă dintr-un controller marcat @Public()
 * la nivel de clasă — JwtAuthGuard citește metadata handler-ului înaintea
 * celei de pe clasă (Reflector.getAllAndOverride), deci asta redevine
 * protejată chiar dacă restul controller-ului e public. Rar folosit —
 * de preferat @Public() per-metodă în loc de @Public() pe toată clasa.
 */
export const Protected = () => SetMetadata(IS_PUBLIC_KEY, false);
