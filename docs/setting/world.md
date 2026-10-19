# The World

## Neo

**Neo** is a megacity, modern-leaning cyberpunk: gig work, subscription everything, ubiquitous surveillance, influencer
culture, delivery drones, and also chrome, implants, neon rain and street docs. Not retro. There are apps, but also
mirrorshades. Everything has a subscription tier, including safety.

- **Mostly procedural.** Only the hand-built **Rusty Halo district** (the bar, Strand Street, the Neon Pharaoh,
  Helix Biotech, the Kowloon Overpass) is the hand-built *starting layout* and **Atlas HQ** is fixed. Even
  the starting layout is not sacred: Blackbird can close the Halo by killing its owner. Everything else is generated per save
  (`engine/src/mapgen.ts`) from district *types*: market, nightlife, tenement, industrial, corporate, slum.
  Content should describe what a district type is *like*, never a fixed street address in the generated city.
- **Hand-authored areas are examples, not the main show.** The Rusty Halo and the rest of the starting district show what
  the generated city is meant to feel like. They are not important to the game as a whole and get no special treatment for
  being hand-authored: no extra rules, content, tuning or design weight, and nothing should assume the player is there. An
  exception will say it is one.
- Distance from the Rusty Halo is difficulty. Nearer is gentler; further is richer and nastier.
- Weather (acid rain, neon fog, heatwave) and "situational variables" (which gangs are at war, what the NPD is
  cracking down on this week) are per-run. Don't hard-code them into places.
- Currency: **neodollars** (`nd`). Small prices are punchy and specific (6 bucks, 55nd).

## Atlas

**Atlas Corporation** is a security conglomerate. It sells *public safety* to the city of Neo, and sells smaller-scale
"protection" to individuals: "defensive" robots, weapons, home systems. It never stops talking about safety.

**The core irony, in your face:** Atlas keeps people safe the way a dragon with booming loudspeakers announces
"YOU ARE BEING PROTECTED" while it demolishes your neighborhood. Atlas manufactures the problem it sells the cure
for. It never admits this and no one in Atlas ever seems to notice. Played straight.

Writing Atlas:
- **Corporate-safety register.** Soothing, bureaucratic, upbeat. "For your protection." "A reminder that this is a
  safe space." "Atlas cares." Announcements contradict the visible events, and nobody remarks on it.
- **Every product is "defensive."** A tank is a "community reassurance platform." A shutdown is a "wellness check."
  Collateral damage is "an opportunity for rebuilding."
- **Subscription absurdity.** Tiers (Basic Safety, Plus, Premier), premiums, deductibles, terms of service, opt-out
  forms that don't exist. Safety as a billing relationship.
- **The wing-and-halo** stencil is Atlas's mark (see `content/dungeons.ts`). Atlas is the "wicked gods"' employer;
  see [`board.md`](board.md).
- Atlas people are mostly *cheerful and sincere* in their own heads. The robots are the scary part; the humans are
  mostly middle management.

## The Fantasy Layer (medium)

Some sword-and-sorcery terms are in-world; the rest is Blackbird's own framing.

| Term | Status | Meaning |
|---|---|---|
| **Dragon** | In-world, everyone says it | An Atlas patrol/weapons platform. Atlas itself uses the word in marketing. |
| **Cyberknight** | In-world, a slightly ridiculous recognized title | Someone, officially or not, who fights Atlas's machinery on foot. Nobody respects it; some people quietly do. |
| **The Eight / the board** | In-world | Atlas's eight cyborg board members. "Wicked gods" is *Blackbird's* nickname for them, not an official one. |
| **Damsel** | Blackbird-only | She calls rescue targets "damsels." They would not. |
| **The King** | Blackbird-only | Her name for the NPD hierarchy. |
| **Quests, relics, dungeons** | Blackbird-only / game words | The world says "jobs," "salvage," "outposts," "hideouts." |

Rule of thumb: if an NPC would say it, it's in-world. If only Blackbird's thoughts or the field report say it, it's framing.

## Other Corporations

Neo is full of corporations. **Atlas is just the big bad**, not the only company. Biotech, media, logistics, food and
more exist independently (Helix Biotech is one). Don't make every corp Atlas's; independents can be allies, rivals,
victims of Atlas takeovers, or just their own brand of shady.

## The Dragon Family

Named after Greek gods, with a Mark number: **Apollo Mk. II** ("CINDERJAW", the stationary boss on the Kowloon
Overpass), **Artemis Mk. I** (roaming patrol flights), **Hera Mk. V** (rare fly-through; the hardest thing in the early city and a late-mid threat later).
Specifics are in `docs/DESIGN.md` ("The dragon family"). The second batch:

- **Hermes** (couriers). Mk. I is a small flustered delivery dragon. Mk. III is the express model: always delivering something
  valuable, and gone before anyone can look at it twice.
- **Demeter** (bounty dragons, Mk. I-IV). "Harvest" platforms whose broadcast announces the summer distribution of goods to
  the community, then collects the winter tithe instead. It is always winter, and it is always the citizen's fault.
- **Artemis Mk. II** (hunter). An Artemis that has stopped patrolling and started taking an interest in one citizen.
- **Ares** (gang busters, Mk. II and IV). Deployed to districts with gang activity; accuses everyone in range of belonging to
  a gang, without checking which. Mk. IV announces itself with a scream, and the sign is: get inside.

- **Naming.** New models take another Greek god (**Ares, Athena, Hermes, Poseidon, Hades, Demeter**…) plus a Mark.
  Individual dragons that matter get a CAPS callsign that is evocative and slightly too edgy (CINDERJAW).
- **Behavior.** Every dragon broadcasts a protective message. The message should be cheerful, specific and wrong.
- Dragons are machines: no moral weight, safe to blow up. People around them are never the joke.

## Setting Texture Checklist

When a new element appears, give it at least one of these so it feels like Neo:
- a **subscription or fee** attached to it
- a **brand** (invented; see [`naming.md`](naming.md))
- an **Atlas presence or absence** (camera, drone, "reminder", or conspicuous lack of one)
- a **specific number** (price, model, count). "BARK-100", "six separate groups".
