'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  IMPLANTS,
  NODES,
  TREE,
  SKILL_LABELS,
  applyUpgrades,
  buy,
  describeFx,
  describePersonality,
  dropCut,
  makeHero,
  makeItem,
  missing,
  parseNeed,
  perk,
  priceOf,
  rankOf,
  skillLevel,
  stateOf,
  treeSize,
  type BranchDef,
  type UpgradeDef,
  type Universe,
} from '../engine/src';

const itemName = (id: string): string => makeItem(id).name;
const implantName = (id: string): string => IMPLANTS[id]?.name ?? id;
const effects = (d: UpgradeDef): string[] => d.fx.map((f) => describeFx(f, itemName, implantName));

const ENDINGS = {
  dead: 'BLACKBIRD HAS FLATLINED',
  victory: 'DRAGON SLAIN',
  dawn: 'DAWN OVER NEO',
} as const;

/** What the assistant mutters about the numbers. */
function verdict(r: NonNullable<Universe['legacy']['report']>): string {
  if (r.ending === 'dead') {
    if (r.carried > 0 && r.recovered === 0) return `She died holding ${r.carried} neodollars. Nobody has handed them back.`;
    if (r.recovered > 0) return `The insurance paid out ${r.recovered} of the ${r.carried} she was carrying. A small mercy.`;
    return r.deposited > 0 ? 'She had nothing on her, and a little in the bank. Foresight, of a kind.' : 'No pockets, no account. A clean slate and a clean sheet.';
  }
  return `She walked home with ${r.carried} neodollars, every one of them accounted for.`;
}

export default function Lab({ universe, onChange, onSendOut }: { universe: Universe; onChange: () => void; onSendOut: () => void }) {
  const [tick, setTick] = useState(0);
  const [branchId, setBranchId] = useState(TREE[0]!.id);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState<{ id: string; text: string; bad?: boolean } | null>(null);

  const l = universe.legacy;
  const branch = TREE.find((b) => b.id === branchId)!;
  const size = useMemo(() => treeSize(), []);
  const q = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const out: Record<string, { got: number; of: number }> = {};
    for (const b of TREE) {
      let got = 0;
      let of = 0;
      for (const ln of b.lines) for (const id of ln.nodes) { got += rankOf(l, id); of += NODES[id]!.max; }
      out[b.id] = { got, of };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, l]);

  const body = useMemo(() => {
    const h = makeHero(l.personality, l.realName, 0.1);
    applyUpgrades(h, l);
    return h;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, l]);

  const purchase = (id: string) => {
    const r = buy(l, id);
    if (r.ok) {
      setFlash({ id, text: `${NODES[id]!.name} bought for ${r.paid}nd.` });
      setTick((t) => t + 1);
      onChange();
    } else {
      const why = r.reason === 'poor' ? `${r.need}nd short.` : r.reason === 'locked' ? 'Locked: finish what it needs first.' : r.reason === 'maxed' ? 'Already maxed.' : 'Not a thing.';
      setFlash({ id, text: why, bad: true });
    }
  };

  const matches = (d: UpgradeDef): boolean => !q || d.name.toLowerCase().includes(q) || d.blurb.toLowerCase().includes(q) || effects(d).some((e) => e.toLowerCase().includes(q));
  const shown = (d: UpgradeDef): boolean => {
    if (!matches(d)) return false;
    if (!affordableOnly) return true;
    const p = priceOf(l, d.id);
    return p !== null && p <= l.account && stateOf(l, d.id) === 'available';
  };

  const r = l.report;
  const skills = (Object.keys(SKILL_LABELS) as (keyof typeof SKILL_LABELS)[]).map((k) => [SKILL_LABELS[k], skillLevel(body, k)] as const).filter(([, v]) => v > 0);

  return (
    <main className="shell lab">
      <header className="top">
        <div>
          <h1 className="logo">THE <span>LAB</span></h1>
          <p className="tag">Blackbird is on the bench. You are holding the screwdriver. Spend carefully, or don&apos;t.</p>
        </div>
        <div className="controls">
          <button className="btn primary big" onClick={onSendOut}>▶ Send her out into Neo</button>
        </div>
      </header>

      <section className="labtop">
        <div className="balance" aria-label="Account balance">
          <span className="muted">ACCOUNT</span>
          <b>{l.account.toLocaleString('en-US')}</b>
          <span className="muted">neodollars · {l.spent.toLocaleString('en-US')} spent · rebuild no. {l.runs + 1}</span>
        </div>
        {r && (
          <div className={`report ${r.ending}`}>
            <h2>{ENDINGS[r.ending]}</h2>
            <p>
              Night {r.run}: level {r.level}, {r.kills} kill{r.kills === 1 ? '' : 's'}, {r.beats} beats. {verdict(r)}
            </p>
            <dl className="books">
              <dt>Banked at drop points</dt><dd>+{r.deposited}{r.fees > 0 && <span className="muted"> (after {r.fees} in cuts)</span>}</dd>
              <dt>In her pockets</dt><dd>{r.carried}{r.ending === 'dead' && <span className={r.recovered ? 'good' : 'bad'}> → {r.recovered} recovered</span>}{r.ending !== 'dead' && <span className="good"> → all of it</span>}</dd>
              {r.interest > 0 && (<><dt>Interest</dt><dd className="good">+{r.interest}</dd></>)}
              <dt>Balance</dt><dd>{r.before} → <b>{r.after}</b></dd>
            </dl>
          </div>
        )}
      </section>

      <div className="labgrid">
        <section className="tree" aria-label="Upgrade trees">
          <nav className="tabs" role="tablist" aria-label="Branches">
            {TREE.map((b, i) => (
              <Fragment key={b.id}>
                {b.id.startsWith('doctrine_') && !TREE[i - 1]!.id.startsWith('doctrine_') && <span className="tabsep" aria-hidden="true">Doctrine</span>}
                <button role="tab" aria-selected={b.id === branchId} className={`tab ${b.id === branchId ? 'on' : ''}`} onClick={() => setBranchId(b.id)}>
                  {b.label}
                  <small>{counts[b.id]!.got}/{counts[b.id]!.of}</small>
                </button>
              </Fragment>
            ))}
          </nav>
          <div className="toolbar">
            <input className="search" type="search" placeholder={`Search all ${size.nodes} upgrades…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search upgrades" />
            <label className="check"><input type="checkbox" checked={affordableOnly} onChange={(e) => setAffordableOnly(e.target.checked)} /> only what I can buy now</label>
          </div>
          {flash && <p className={`flash ${flash.bad ? 'bad' : 'good'}`} role="status">{flash.text}</p>}
          {q ? <Results q={q} shown={shown} l={l} onBuy={purchase} /> : <BranchView branch={branch} shown={shown} l={l} onBuy={purchase} />}
        </section>

        <aside className="panel preview" aria-label="Next body">
          <h3>The next body</h3>
          <dl>
            <dt>Hit points</dt><dd>{body.maxHp}</dd>
            <dt>Level</dt><dd>{body.level}</dd>
            <dt>Muscle</dt><dd>{body.muscle}</dd>
            <dt>Reflex</dt><dd>{body.reflex}</dd>
            <dt>Hack</dt><dd>{body.hack}</dd>
            <dt>Charm</dt><dd>{body.charm}</dd>
            <dt>Competence</dt><dd>{Math.round(body.competence * 100)}%</dd>
            <dt>Pocket cash</dt><dd>{body.cash}nd</dd>
            <dt>Weapon</dt><dd>{body.weapon.name}</dd>
            <dt>Armor</dt><dd>{body.armor?.name ?? 'attitude'}</dd>
            {body.fame > 0 && (<><dt>Fame</dt><dd>{body.fame}</dd></>)}
            {body.implants.length > 0 && (<><dt>Chrome</dt><dd>{body.implants.map(implantName).join(', ')}</dd></>)}
            {skills.length > 0 && (<><dt>Skills</dt><dd>{skills.map(([k, v]) => `${k} ${v}`).join(' · ')}</dd></>)}
            <dt>Temperament</dt><dd>{describePersonality(body.personality)}</dd>
          </dl>
          <h3>The money</h3>
          <dl>
            <dt>Drop-point cut</dt><dd>{dropCut(l)}%</dd>
            <dt>Death insurance</dt><dd>{perk(l, 'keep')}%</dd>
            <dt>Interest</dt><dd>{perk(l, 'interest')}% per rebuild</dd>
            <dt>Lab discount</dt><dd>{Math.min(50, perk(l, 'discount'))}%</dd>
            <dt>Bank habit</dt><dd>{perk(l, 'bank')}</dd>
            {perk(l, 'xp') > 0 && (<><dt>XP</dt><dd>+{perk(l, 'xp')}%</dd></>)}
            {perk(l, 'heal') > 0 && (<><dt>Med kits</dt><dd>+{perk(l, 'heal')}% healing</dd></>)}
          </dl>
          <button className="btn primary" onClick={onSendOut}>▶ Send her out</button>
        </aside>
      </div>
    </main>
  );
}

function BranchView({ branch, shown, l, onBuy }: { branch: BranchDef; shown: (d: UpgradeDef) => boolean; l: Universe['legacy']; onBuy: (id: string) => void }) {
  return (
    <div className="branch">
      <p className="blurb muted">{branch.blurb}</p>
      {branch.lines.map((ln) => {
        const nodes = ln.nodes.map((id) => NODES[id]!).filter(shown);
        if (!nodes.length) return null;
        return (
          <div key={ln.id} className="line-row">
            <h4>{ln.label}</h4>
            <div className="nodes">
              {nodes.map((d, i) => (
                <span key={d.id} className="slot">
                  {i > 0 && <span className="link" aria-hidden>→</span>}
                  <Node d={d} l={l} onBuy={onBuy} />
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Results({ q, shown, l, onBuy }: { q: string; shown: (d: UpgradeDef) => boolean; l: Universe['legacy']; onBuy: (id: string) => void }) {
  const hits = Object.values(NODES).filter(shown);
  return (
    <div className="branch">
      <p className="blurb muted">{hits.length} upgrade{hits.length === 1 ? '' : 's'} match “{q}”.</p>
      <div className="nodes wrap">
        {hits.slice(0, 60).map((d) => (
          <Node key={d.id} d={d} l={l} onBuy={onBuy} where={`${TREE.find((b) => b.id === d.branch)!.label} · ${d.line}`} />
        ))}
      </div>
      {hits.length > 60 && <p className="muted">…and {hits.length - 60} more. Narrow it down.</p>}
    </div>
  );
}

function Node({ d, l, onBuy, where }: { d: UpgradeDef; l: Universe['legacy']; onBuy: (id: string) => void; where?: string }) {
  const rank = rankOf(l, d.id);
  const state = stateOf(l, d.id);
  const price = priceOf(l, d.id);
  const lacks = missing(l, d.id);
  const afford = price !== null && price <= l.account;
  const cls = ['node', state, rank > 0 ? 'has' : '', state === 'available' && afford ? 'can' : ''].filter(Boolean).join(' ');
  return (
    <button className={cls} onClick={() => onBuy(d.id)} disabled={state !== 'available'} aria-label={`${d.name}, rank ${rank} of ${d.max}${price !== null ? `, ${price} neodollars` : ', maxed'}`}>
      {where && <small className="where">{where}</small>}
      <span className="nm">{d.name}</span>
      <span className="pips" aria-hidden>{Array.from({ length: d.max }, (_, i) => (i < rank ? '●' : '○')).join('')}</span>
      <span className="fx">{effects(d).map((e, i) => <span key={i}>{e}</span>)}</span>
      <span className="bl">{d.blurb}</span>
      {state === 'locked' && (
        <span className="needs">
          needs {lacks.map((n) => { const { id, rank: r } = parseNeed(n); return `${NODES[id]!.name}${r > 1 ? ` ×${r}` : ''}`; }).join(', ')}
        </span>
      )}
      <span className={`cost ${afford ? '' : 'poor'}`}>{price === null ? 'MAX' : `${price.toLocaleString('en-US')}nd`}</span>
    </button>
  );
}
