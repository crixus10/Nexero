import { SetMetadata } from '@nestjs/common';

export const ALLOW_PRE_TENANT_KEY = 'allowPreTenant';

/**
 * Marchează o rută ca acceptând un JWT „pre-tenant" — fără `tenantId`,
 * emis la login unui user cu acces la mai multe firme, înainte ca el să
 * aleagă firma activă (vezi docs/data-model.md, secțiunea „Multi-firmă" +
 * jwt-payload.interface.ts). Fără această adnotare, JwtAuthGuard respinge
 * orice token fără `tenantId` — o rută obișnuită presupune firmă deja
 * aleasă. Un token COMPLET (cu `tenantId`) e mereu acceptat, indiferent de
 * adnotare — folosită azi doar pe `POST /auth/switch-tenant`.
 */
export const AllowPreTenant = () => SetMetadata(ALLOW_PRE_TENANT_KEY, true);
