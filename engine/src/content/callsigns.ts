import type { Rng } from '../rng';

/**
 * Callsigns for the dragons that aren't CINDERJAW: evocative, slightly too edgy, and a little too pleased with themselves.
 * A dragon is its model's designation, a number, and one of these: `ARES-237 "QUIET HOURS"`. Each family leans on the
 * kind of thing it is for (couriers on shipping, tithe collectors on harvests and rents, gang busters on law and order).
 */
export const CALLSIGNS: Record<string, string[]> = {
  artemis: [
    'NIGHT SHIFT', 'WELL-WISHER', 'CLEAR SKIES', 'SAFE HARBOR', 'COURTESY CALL', 'OVERWATCH', 'GOOD NEIGHBOR', 'LAST WARNING',
    'SILVER LINING', 'PARENTAL GUIDANCE', 'MOONLIGHTING', 'HIGH GROUND', 'LONG VIEW', 'SECOND OPINION', 'EVERGREEN', 'CROWD CONTROL',
  ],
  hera: ['MATRIARCH', 'HOUSEKEEPER', 'HEARTH AND HOME', 'DOMESTIC BLISS', 'THE MOTHER OF NEO', 'FAMILY VALUES'],
  hermes: [
    'SIGN HERE', 'FRAGILE', 'RETURN TO SENDER', 'SPECIAL DELIVERY', 'NO SIGNATURE', 'LEFT WITH NEIGHBOR', 'TRACK AND TRACE',
    'SAME-DAY', 'PRIORITY MAIL', 'OUT FOR DELIVERY', 'MISSED YOU', 'HANDLE WITH CARE', 'DOOR TO DOOR', 'FREE SHIPPING',
  ],
  express: ['NEXT-DAY', 'OVERNIGHT', 'BEFORE YOU ASKED', 'SIGNATURE NOT REQUIRED', 'JUST IN TIME', 'WHITE LIGHTNING', 'SPEED OF TRUST', 'ALREADY THERE'],
  demeter: [
    'TITHEMOTHER', 'HARVEST HOME', 'THE LANDLADY', 'CORNUCOPIA', 'GOOD HARVEST', 'FIRST FRUITS', 'COLLECTION PLATE', 'RENT DAY',
    'BOUNTIFUL', 'AUDIT SEASON', 'LEAN YEARS', 'FINAL NOTICE', 'WINTER STORES', 'FALLOW GROUND', 'PAYDAY',
  ],
  ares: [
    'QUIET HOURS', 'CURFEW', 'DUE PROCESS', 'LAST CALL', 'ZERO TOLERANCE', 'PEACEKEEPER', 'STANDING ORDERS', 'BROKEN WINDOWS',
    'RIOT ACT', 'SAFE STREETS', 'CLEAN SWEEP', 'COMMUNITY POLICING', 'TOUGH LOVE', 'FIRST RESPONDER', 'STAND DOWN',
  ],
};

/** `DESIGNATION-123 "CALLSIGN"`. */
export const callsign = (rng: Rng, designation: string, pool: string): string => `${designation}-${rng.int(100, 999)} "${rng.pick(CALLSIGNS[pool]!)}"`;
