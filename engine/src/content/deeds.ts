/**
 * Deeds: things she buys in the lab that she keeps. A deed is bought once, out of the account, and it outlives her: the next body
 * wakes up in a city where the deed is still hers. Data only; `deeds.ts` decides what owning one means.
 *
 * For now the only deeds are homes. A home is somewhere she can sleep for free, and `quality` is the same 0..1 as a bed's in
 * `lodging.ts`: a pod leaves sleep debt behind, a hotel clears some.
 */

export type DeedId = 'pod_apartment' | 'townhouse';

export interface DeedDef {
  id: DeedId;
  /** What it is, for the lab's list. */
  name: string;
  /** The lab's one-liner. */
  blurb: string;
  /** Neodollars, once. The lab's discounts don't apply: a deed is a deed. */
  price: number;
  /** 0..1: how good a night is here, before the lab's help. */
  quality: number;
  /** The place on the map. */
  home: {
    id: string;
    name: string;
    /** How the way in reads on Strand Street. */
    door: string;
    /** And the way out. */
    out: string;
    blurb: string;
    security: number;
    cameras: number;
  };
}

export const DEEDS: Record<DeedId, DeedDef> = {
  pod_apartment: {
    id: 'pod_apartment',
    name: 'Pod apartment, Meridian Megablock',
    blurb: 'Floor 212 of a tower that has its own weather. Three metres by two, a window onto an air shaft, and a lock that is hers. A real mattress, in a space too small to be taken seriously.',
    price: 1800,
    quality: 0.85,
    home: {
      id: 'deed_pod_apartment',
      name: 'her pod apartment in the Meridian Megablock',
      door: 'the Meridian Megablock (the lift to her floor)',
      out: 'the lift down to Strand Street',
      blurb: 'Her pod apartment: a mattress, a hot plate, a shelf of things that are hers and a window onto an air shaft. The lock beeps when it sees her. Nothing else in the city does.',
      security: 2,
      cameras: 0,
    },
  },
  townhouse: {
    id: 'townhouse',
    name: 'Townhouse, Halcyon Row',
    blurb: 'Three floors behind the gate of a private district, with a guard who nods. Quiet, dark when she wants it dark, and a bed that was designed by someone who has never once been tired in a bad way.',
    price: 14000,
    quality: 1,
    home: {
      id: 'deed_townhouse',
      name: 'her townhouse on Halcyon Row',
      door: 'the gate of Halcyon Row, a private district (the guard nods her through)',
      out: 'the gate back out to Strand Street',
      blurb: 'Her townhouse on Halcyon Row: pale stairs, a kitchen nobody has burnt anything in, and a bedroom with blackout glass and a mattress that remembers her. Out the window, the gated lawn; beyond it, a city that cannot get in.',
      security: 4,
      cameras: 1,
    },
  },
};

export const DEED_IDS = Object.keys(DEEDS) as DeedId[];
