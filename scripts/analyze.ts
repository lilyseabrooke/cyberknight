/**
 * Play a lot of nights and say how the game is doing, optionally against another version of it.
 *
 *   npm run analyze                              # 100 nights at competence 0.2, 0.6 and 1.0
 *   npm run analyze -- --vs main                 # the same, against what is on main (a throwaway checkout)
 *   npm run analyze -- --nights 300 --competence 1
 *   npm run analyze -- --only goals,deaths       # sections: outcomes goals movement money fame heat romance deaths
 *   npm run analyze -- --json out.json           # the raw numbers
 *
 * Compared runs use the same seeds. A change is only called real when it is bigger than about two standard errors
 * of the difference; with a hundred nights a side most small swings are noise, and the report says "~" for them.
 * See docs/ANALYSIS.md.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, HUSTLES, type Night } from './analyze/collect';
import { compare, fmt, median, pct, summarize, type Summary } from './analyze/stats';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

// ------------------------------------------------------------------ arguments

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? 'true' : argv[i + 1]) : undefined;
};
const nights = Number(flag('nights') ?? 100);
const levels = (flag('competence') ?? '0.2,0.6,1').split(',').map(Number);
const seedPrefix = flag('seed') ?? 'an';
const vs = flag('vs');
const only = flag('only')?.split(',');
const jsonOut = flag('json');
const jobs = Number(flag('jobs') ?? Math.max(1, cpus().length));

// ------------------------------------------------------------------ worker mode: play nights, print JSON

if (flag('worker')) {
  const root = path.resolve(flag('root') ?? repo);
  const c = Number(flag('level'));
  const out = await collect(root, c, nights, seedPrefix, (i) => {
    if ((i + 1) % 20 === 0) process.stderr.write(`.`);
  });
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// ------------------------------------------------------------------ orchestration

function runWorker(root: string, level: number): Promise<Night[]> {
  return new Promise((resolve, reject) => {
    const args = ['--import', 'tsx', path.join(here, 'analyze.ts'), '--worker', '--root', root, '--level', String(level), '--nights', String(nights), '--seed', seedPrefix];
    const child = spawn(process.execPath, args, { cwd: repo, stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    child.stdout.on('data', (d) => (buf += d));
    child.on('close', (code) => (code === 0 ? resolve(JSON.parse(buf) as Night[]) : reject(new Error(`worker exited ${code} for ${root} at ${level}`))));
  });
}

/** Run tasks, at most `limit` at a time. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]!();
      }
    }),
  );
  return results;
}

function checkout(ref: string): { dir: string; sha: string; cleanup: () => void } {
  const resolved = [ref, `origin/${ref}`].find((r) => {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `${r}^{commit}`], { cwd: repo, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
  if (!resolved) throw new Error(`can't find git ref "${ref}"`);
  const sha = execFileSync('git', ['rev-parse', '--short', resolved], { cwd: repo }).toString().trim();
  const dir = mkdtempSync(path.join(tmpdir(), 'cyberknight-vs-'));
  rmSync(dir, { recursive: true, force: true });
  execFileSync('git', ['worktree', 'add', '--detach', dir, resolved], { cwd: repo, stdio: 'ignore' });
  if (existsSync(path.join(repo, 'node_modules'))) symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  return {
    dir,
    sha,
    cleanup: () => {
      try {
        execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: repo, stdio: 'ignore' });
      } catch {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

// ------------------------------------------------------------------ what we report

interface Metric {
  section: string;
  label: string;
  /** Per-night number. */
  of: (n: Night) => number;
  digits?: number;
  /** 'more' if a bigger number is an improvement, 'less' if smaller is, 'any' if it is just information. */
  good: 'more' | 'less' | 'any';
  asPct?: boolean;
}

const sumOf = (m: Record<string, number>): number => Object.values(m).reduce((a, b) => a + b, 0);
const per100 = (x: number, n: Night): number => (n.beats ? (100 * x) / n.beats : 0);
const bool = (x: boolean): number => (x ? 1 : 0);

const METRICS: Metric[] = [
  { section: 'outcomes', label: 'beats per night', of: (n) => n.beats, digits: 0, good: 'any' },
  { section: 'outcomes', label: 'dies', of: (n) => bool(n.ending === 'dead'), good: 'less', asPct: true },
  { section: 'outcomes', label: 'dies in the first 20 beats', of: (n) => n.early, good: 'less', asPct: true },
  { section: 'outcomes', label: 'reaches dawn (hits the cap)', of: (n) => bool(n.ending === 'dawn'), good: 'any', asPct: true },
  { section: 'outcomes', label: 'wins (Apollo dead)', of: (n) => bool(n.ending === 'victory'), good: 'more', asPct: true },
  { section: 'outcomes', label: 'level reached', of: (n) => n.level, good: 'more' },

  { section: 'goals', label: 'goals done per night', of: (n) => n.goalsDone, good: 'more' },
  { section: 'goals', label: 'goals done per 100 beats', of: (n) => per100(n.goalsDone, n), digits: 2, good: 'more' },
  { section: 'goals', label: 'goals given up per night', of: (n) => n.goalsDropped, good: 'less' },
  { section: 'goals', label: 'beats with no goal at all', of: (n) => (n.beats ? n.noGoalBeats / n.beats : 0), good: 'less', asPct: true },
  ...['cash', 'buy', 'kill', 'romance', 'weapon', 'fame', 'dragon', 'heist'].map((k): Metric => ({ section: 'goals', label: `  ${k} goals done`, of: (n) => n.done[k] ?? 0, good: 'more', digits: 2 })),

  { section: 'movement', label: 'beats spent moving', of: (n) => (n.beats ? n.goBeats / n.beats : 0), good: 'less', asPct: true },
  { section: 'movement', label: 'moves that go straight back (A to B to A)', of: (n) => (n.goBeats ? n.flips / n.goBeats : 0), good: 'less', asPct: true },

  { section: 'money', label: 'cash at the end', of: (n) => n.cash, digits: 0, good: 'any' },
  { section: 'money', label: 'earned from hustles', of: (n) => n.hustleCash, digits: 0, good: 'any' },
  { section: 'money', label: 'hustles done', of: (n) => sumOf(n.hustles), good: 'any' },
  ...HUSTLES.slice(0, 10).map((k): Metric => ({ section: 'money', label: `  ${k}`, of: (n) => n.hustles[k] ?? 0, good: 'any', digits: 2 })),
  { section: 'money', label: 'bounties collected', of: (n) => n.bountyPaid, good: 'more', digits: 2 },
  { section: 'money', label: 'weapon rating at the end', of: (n) => n.weaponRating, good: 'more' },

  { section: 'fame', label: 'fame at the end', of: (n) => n.fame, good: 'more' },
  { section: 'fame', label: 'callings lit', of: (n) => n.passions, good: 'any', digits: 2 },
  { section: 'fame', label: '"crowd is tired" moments', of: (n) => n.crowdTired, good: 'any', digits: 2 },
  { section: 'fame', label: 'dragons killed', of: (n) => n.dragonKills, good: 'more', digits: 2 },
  { section: 'fame', label: 'people killed', of: (n) => n.kills, good: 'any' },

  { section: 'heat', label: 'police heat events per 100 beats', of: (n) => per100(n.heatEvents, n), digits: 2, good: 'less' },
  { section: 'heat', label: 'officer ambushes per night', of: (n) => n.ambushOfficers, digits: 2, good: 'less' },
  { section: 'heat', label: 'drone ambushes per night', of: (n) => n.ambushDrones, digits: 2, good: 'any' },
  { section: 'heat', label: 'times she laid low', of: (n) => n.layLow, good: 'any' },

  { section: 'romance', label: 'kisses per night', of: (n) => n.kisses, good: 'any' },
  { section: 'romance', label: 'moves that landed per night', of: (n) => n.moves, good: 'any', digits: 2 },
];

const DEATH_BUCKETS = ['police', 'dragons', 'corp security', 'gangs & muggers', 'fights she picked', 'romance & grudges', 'misadventure', 'other'];

const wanted = (section: string): boolean => !only || only.includes(section);

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, s: string): string => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s: string) => paint(2, s);
const bold = (s: string) => paint(1, s);

function show(m: Metric, s: Summary): string {
  const body = m.asPct ? pct(s.mean, s.mean < 0.1 ? 1 : 0) : fmt(s.mean, m.digits ?? 1);
  return body;
}

function printSection(level: number, base: Night[] | null, now: Night[]): void {
  const sections = [...new Set(METRICS.map((m) => m.section))].filter(wanted);
  for (const section of sections) {
    console.log(`\n  ${bold(section.toUpperCase())}`);
    for (const m of METRICS.filter((x) => x.section === section)) {
      const b = summarize(now.map(m.of));
      if (!base) {
        console.log(`    ${m.label.padEnd(44)} ${show(m, b).padStart(8)} ${dim('± ' + (m.asPct ? pct(b.se, 1) : fmt(b.se, m.digits ?? 1)))}`);
        continue;
      }
      const a = summarize(base.map(m.of));
      const c = compare(a, b);
      let mark = dim('~');
      if (c.verdict !== 'same') {
        const good = m.good === 'any' ? 'info' : (c.verdict === 'up') === (m.good === 'more') ? 'good' : 'bad';
        const arrow = c.verdict === 'up' ? '▲' : '▼';
        mark = good === 'good' ? paint(32, arrow) : good === 'bad' ? paint(31, arrow) : paint(33, arrow);
      }
      const delta = m.asPct ? `${c.delta >= 0 ? '+' : ''}${(100 * c.delta).toFixed(1)}pt` : `${c.delta >= 0 ? '+' : ''}${fmt(c.delta, m.digits ?? 1)}`;
      console.log(`    ${m.label.padEnd(44)} ${show(m, a).padStart(8)} → ${show(m, b).padStart(8)}  ${delta.padStart(9)} ${mark}`);
    }
  }
  if (wanted('deaths')) {
    console.log(`\n  ${bold('HOW SHE DIES')} ${dim('(share of deaths)')}`);
    const share = (ns: Night[], k: string) => {
      const dead = ns.filter((n) => n.death);
      return dead.length ? dead.filter((n) => n.death === k).length / dead.length : 0;
    };
    for (const k of DEATH_BUCKETS) {
      const b = share(now, k);
      const a = base ? share(base, k) : null;
      if (!b && !a) continue;
      console.log(`    ${k.padEnd(44)} ${a === null ? '' : pct(a).padStart(8) + ' → '}${pct(b).padStart(a === null ? 8 : 8)}`);
    }
    const mid = (ns: Night[]) => median(ns.map((n) => n.beats));
    console.log(`    ${dim('median night length'.padEnd(44))} ${base ? String(mid(base)).padStart(8) + ' → ' : ''}${String(mid(now)).padStart(8)} beats`);
  }
  void level;
}

// ------------------------------------------------------------------ main

const started = Date.now();
let against: ReturnType<typeof checkout> | null = null;
try {
  if (vs) against = checkout(vs);
  const tasks: (() => Promise<Night[]>)[] = [];
  for (const l of levels) {
    tasks.push(() => runWorker(repo, l));
    if (against) tasks.push(() => runWorker(against!.dir, l));
  }
  process.stderr.write(`playing ${nights} nights at ${levels.length} competence level${levels.length > 1 ? 's' : ''}${against ? ` on two versions` : ''} (${jobs} at a time) `);
  const results = await pool(tasks, jobs);
  process.stderr.write(` done in ${((Date.now() - started) / 1000).toFixed(0)}s\n`);

  const head = against ? `this tree  vs  ${vs} (${against.sha})` : 'this tree';
  console.log(bold(`CYBERKNIGHT — ${nights} nights a side, seeds "${seedPrefix}-<competence>-<n>"  ${dim(head)}`));
  if (against) console.log(dim('  columns: base → now, change, and whether it is bigger than noise (▲▼ yes, green is better, red is worse, yellow is just information; ~ no)'));
  const raw: Record<string, { now: Night[]; base?: Night[] }> = {};
  levels.forEach((l, i) => {
    const now = results[against ? 2 * i : i]!;
    const base = against ? results[2 * i + 1]! : null;
    console.log(`\n${bold(`── competence ${l} ──`)}`);
    printSection(l, base, now);
    raw[String(l)] = { now, ...(base ? { base } : {}) };
  });
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ nights, seedPrefix, vs: vs ?? null, levels: raw }, null, 1));
    console.log(`\nraw numbers in ${jsonOut}`);
  }
} finally {
  against?.cleanup();
}
