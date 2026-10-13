import { Rng } from './rng.js';
import type { Personality } from './personality.js';
import type { EventType, GameEvent, Outcome } from './events.js';

export interface Hero {
  hp: number;
  maxHp: number;
  cash: number;
  drunk: number;
}

export interface RunState {
  beat: number;
  hero: Hero;
  dragonHp: number;
  over: boolean;
  won: boolean;
}

export interface RunConfig {
  seed: string;
  personality: Personality;
  /** 0..1. Higher = fewer dumb decisions. Raised by Firmware upgrades. */
  competence: number;
  maxBeats?: number;
}

interface ActionDef {
  type: EventType;
  /** Score contribution from the personality, given current state. */
  score(p: Personality, s: RunState): number;
  resolve(rng: Rng, s: RunState): { outcome: Outcome; data: Record<string, string | number | boolean> };
}

const ACTIONS: ActionDef[] = [
  {
    type: 'dragon_fight',
    score: (p, s) => p.weights.quest * 1.4 + (s.hero.hp / s.hero.maxHp - 0.6) - s.hero.drunk * 0.3,
    resolve(rng, s) {
      const dmg = rng.int(6, 16);
      s.dragonHp -= dmg;
      const taken = rng.int(8, 22) + Math.round(s.hero.drunk * 4);
      s.hero.hp -= taken;
      return { outcome: s.dragonHp <= 0 ? 'good' : 'mixed', data: { dealt: dmg, taken } };
    },
  },
  {
    type: 'patch_up',
    // Sensible, but only if she notices she's hurt. Pride makes her ignore it.
    score: (p, s) => (1 - s.hero.hp / s.hero.maxHp) * 2.0 - p.weights.pride * 0.5,
    resolve(rng, s) {
      const cost = rng.int(15, 35);
      const healed = Math.min(s.hero.maxHp - s.hero.hp, rng.int(25, 45));
      s.hero.hp += healed;
      s.hero.cash = Math.max(0, s.hero.cash - cost);
      s.hero.drunk = Math.max(0, s.hero.drunk - 1);
      return { outcome: 'good', data: { healed, cost } };
    },
  },
  {
    type: 'drink',
    score: (p, s) => p.weights.thirst * 1.3 - s.hero.drunk * 0.2,
    resolve(rng, s) {
      const cost = rng.int(5, 25);
      s.hero.cash = Math.max(0, s.hero.cash - cost);
      s.hero.drunk += 1;
      return { outcome: s.hero.drunk > 3 ? 'bad' : 'mixed', data: { cost } };
    },
  },
  {
    type: 'flirt',
    score: (p) => p.weights.lust * 1.2,
    resolve(rng, s) {
      const cost = rng.int(10, 40);
      s.hero.cash = Math.max(0, s.hero.cash - cost);
      return { outcome: rng.chance(0.4) ? 'good' : 'bad', data: { cost } };
    },
  },
  {
    type: 'brawl',
    score: (p, s) => p.weights.bravery * p.weights.pride * 1.6 + s.hero.drunk * 0.15,
    resolve(rng, s) {
      const win = rng.chance(0.45 - s.hero.drunk * 0.05);
      if (!win) s.hero.hp -= rng.int(10, 30);
      return { outcome: win ? 'good' : 'bad', data: { gangers: rng.int(2, 6) } };
    },
  },
  {
    type: 'hack',
    score: (p) => p.weights.greed * 0.9 + p.weights.curiosity * 0.7,
    resolve(rng, s) {
      const haul = rng.int(2, 60);
      s.hero.cash += haul;
      return { outcome: haul > 30 ? 'good' : 'mixed', data: { haul } };
    },
  },
];

/** Pick an action by softmax over scores. Temperature falls as competence rises. */
function choose(rng: Rng, p: Personality, s: RunState, competence: number): ActionDef {
  const temperature = 0.15 + (1 - competence) * 0.85;
  // Discipline: Firmware shifts attention to the objective and away from vices.
  const discipline: Partial<Record<EventType, number>> = {
    dragon_fight: 1.0,
    patch_up: 1.2,
    brawl: -0.9,
    drink: -0.7,
    flirt: -0.5,
  };
  const scores = ACTIONS.map(
    (a) => (a.score(p, s) + (discipline[a.type] ?? 0) * competence) / temperature,
  );
  const max = Math.max(...scores);
  const exps = scores.map((x) => Math.exp(x - max));
  const total = exps.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < ACTIONS.length; i++) {
    roll -= exps[i]!;
    if (roll <= 0) return ACTIONS[i]!;
  }
  return ACTIONS[ACTIONS.length - 1]!;
}

export function newRun(): RunState {
  return {
    beat: 0,
    hero: { hp: 100, maxHp: 100, cash: 50, drunk: 0 },
    dragonHp: 160,
    over: false,
    won: false,
  };
}

/** Advance one beat; returns the events it produced. Deterministic given (state, rng). */
export function step(cfg: RunConfig, s: RunState, rng: Rng): GameEvent[] {
  if (s.over) return [];
  s.beat++;
  const action = choose(rng, cfg.personality, s, cfg.competence);
  const { outcome, data } = action.resolve(rng, s);
  const events: GameEvent[] = [{ beat: s.beat, type: action.type, outcome, data }];

  if (s.dragonHp <= 0) {
    s.over = true;
    s.won = true;
  } else if (s.hero.hp <= 0) {
    s.over = true;
    events.push({ beat: s.beat, type: 'death', outcome: 'bad', data: { cause: action.type } });
  } else if (s.beat >= (cfg.maxBeats ?? 500)) {
    s.over = true;
  }
  return events;
}

export function runToEnd(cfg: RunConfig): { state: RunState; events: GameEvent[] } {
  const rng = new Rng(cfg.seed);
  const state = newRun();
  const events: GameEvent[] = [{ beat: 0, type: 'depart', outcome: 'good', data: {} }];
  while (!state.over) events.push(...step(cfg, state, rng));
  return { state, events };
}
