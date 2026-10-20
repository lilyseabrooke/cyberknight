import type { EventData, Outcome } from './events';
import type { Hero, Item, World } from './types';
import type { Rng } from './rng';
import { instOf, instrumentsOf } from './instruments';

/**
 * Provenance: an instrument remembers what it has done.
 *
 * Every great night goes on the guitar she played it with, as a line of its story (`InstrumentFx.story`): out-played a dragon,
 * tore down the cordon, won the title at a cutting room, went out on every channel. A storied guitar plays better (a level for
 * every three lines, up to three) and, at five lines and again at ten, carries her name the way a signature guitar does.
 *
 * And because her gear resets with her body and the city keeps everything, her guitars **come back**. Whatever she was carrying at
 * the end of a night goes into `legacy.lostGuitars`, stories and all, and turns up again: in a luthier's window, in Muse's
 * evidence room, on a fan club's wall. Buying back her own legend is a thing she can do.
 */

const MAX_STORY = 12;
const MAX_LOST = 24;

/** Event (type, or type:variant) to the line it writes on the guitar. `{place}` is filled from the event. */
const DEEDS: Record<string, string> = {
  'dragon_song:good': 'out-played a dragon',
  'storm_solo:good': 'called down the lightning from a roof',
  'riot:good': 'started a riot',
  'march:good': 'led a march on an Atlas outpost',
  'down_with_police:good': 'sang the police out of a district',
  'cordon_teardown:good': 'tore down the cordon',
  'broadcast_hijack:good': 'went out on every screen in a district',
  'chart_war:good': 'stole a crowd from Muse',
  'crash_show:good': 'took Muse\'s stage at {place}',
  'comeback:good': 'the comeback at {place}',
  'cut_guitar:good': 'won a bout at {place}',
  'booked_guitar:private_hit': 'played a private function at {place}',
  'booked_guitar:duet_hit': 'shared a stage with LUMINA',
  'booked_guitar:secret_hit': 'a secret show at {place}',
  'charts:good': 'was number one',
  'detonate_contract:good': 'blew up a Muse contract live',
  'musehq:all-channels.win': 'went out on ALL CHANNELS',
};

/** The instrument she most likely played it on: the one in her hands, or her best. */
export function playing(h: Hero): Item | undefined {
  if (h.weapon?.tags.includes('instrument')) return h.weapon;
  return [...instrumentsOf(h)].sort((a, b) => (instOf(b)?.tier ?? 0) - (instOf(a)?.tier ?? 0))[0];
}

/** Write a line on a guitar's story. Five and ten lines make it a name, like a signature guitar. */
export function addDeed(it: Item, line: string): boolean {
  const inst = it.inst;
  if (!inst) return false;
  const story = (inst.story ??= []);
  if (story.includes(line) || story.length >= MAX_STORY) return false;
  story.push(line);
  if (story.length === 5 || story.length === 10) inst.signature = Math.min(3, inst.signature + 1);
  if (story.length === 5 && !/^storied /.test(it.name)) it.name = `storied ${it.name}`;
  return true;
}

/** Every event goes past here (run.ts `makeCtx`); the great ones go on the guitar. Draws no dice. */
export function provenanceTap(w: World, type: string, outcome: Outcome, data: EventData): void {
  const key = data.variant !== undefined && DEEDS[`${type}:${data.variant}`] ? `${type}:${data.variant}` : `${type}:${outcome}`;
  const line = DEEDS[key];
  if (!line) return;
  // A cutting-room bout only counts when it was won.
  if (type === 'cut_guitar' && data.variant !== 'won') return;
  const it = playing(w.hero);
  if (!it || !it.inst) return;
  addDeed(it, line.replace('{place}', String(data.place ?? 'somewhere')));
}

/** Levels a storied guitar adds: one for every three lines, up to three. */
export const storyBonus = (it: Item | undefined): number => Math.min(3, Math.floor((it?.inst?.story?.length ?? 0) / 3));

/** The night is over: whatever she carried goes back to the city, story and all, to turn up again. */
export function loseGuitars(w: World, dead: boolean): void {
  const lost = (w.legacy.lostGuitars ??= []);
  for (const it of instrumentsOf(w.hero)) {
    if (!it.inst) continue;
    const copy: Item = JSON.parse(JSON.stringify(it));
    copy.inst!.life = w.legacy.runs;
    copy.inst!.hers = true;
    addDeed(copy, dead ? 'hers, until she died with it' : 'hers, until the night ended');
    lost.push(copy);
  }
  if (lost.length > MAX_LOST) lost.splice(0, lost.length - MAX_LOST);
}

/** One of her old guitars, out of the city's keeping (and off the list). The oldest first, mostly. */
export function resurface(w: World, rng: Rng): Item | undefined {
  const lost = w.legacy.lostGuitars;
  if (!lost?.length) return undefined;
  const i = rng.chance(0.6) ? 0 : rng.int(0, lost.length - 1);
  return lost.splice(i, 1)[0];
}

/** A peek, without taking it: which of her old guitars a place has tonight (the same one all night). */
export function oneOfHers(w: World, seed: string): Item | undefined {
  const lost = w.legacy.lostGuitars;
  if (!lost?.length) return undefined;
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  return lost[x % lost.length];
}

/** Take a particular one off the list (bought back, reclaimed). */
export function reclaim(w: World, it: Item): void {
  const lost = w.legacy.lostGuitars;
  const i = lost?.indexOf(it) ?? -1;
  if (i >= 0) lost!.splice(i, 1);
}

/** How a guitar's story reads, in a sentence. */
export function storyLine(it: Item): string {
  const s = it.inst?.story ?? [];
  if (!s.length) return 'no story yet';
  return s.length <= 3 ? s.join('; ') : `${s.slice(0, 3).join('; ')}, and ${s.length - 3} more`;
}
