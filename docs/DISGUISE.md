# Disguise (the Acting skill)

Being somebody else, and being treated like them by anyone who falls for it. Code: `engine/src/disguise.ts`; tests: `disguise.test.ts`.
Skill: `acting` (social; its training also nudges grifting, speaking and flirting).

## The face

`Hero.disguise` is the face she has on: who she is (`label`), what kind (`crew` | `role` | `star`), how well she carries it (`polish`, 0..1, set when she puts it on from `acting`, charm and int, about 0.4 with nothing to go on) and when it wears off (`until`, a world minute: 90 minutes at level 0, up to 6 hours). The same code serves a cheap trick and a skilled one; nothing is rolled once and kept except the polish.

| Face | Where it is put on | What it is good for |
|---|---|---|
| **A crew** (a gang, Atlas, the NPD) | next to the door of one of that crew's hideouts, outposts or spots she means to go in by (a raid goal, or the pull of a place she fancies) | walking in as one of them; Atlas and the NPD are also waved through a `guarded` door |
| **A particular person** (`mimic:<npc>`) | studied from across a room, for a crew she is about to walk in on | a crew face with +0.1 polish, but the real one in the room ends it at once, and people who know him look harder |
| **A kind of person** (staff) | next to a `guarded` or `bouncer` door | the staff door |
| **Someone famous** (`don_star`) | anywhere there are people not yet won over | borrows their fame for the length of the face (`shownFame`): the bouncer, free drinks, the odd fan, and `star_flirt` |

Famous people are invented (`STARS`). A bigger name is more fame and a worse likeness (a little off the polish).

## Being looked at

Walking into a room of a dungeon whose people answer to the crew she is dressed as, she doesn't play the room as a stealth board and doesn't make the open noticing roll: the room takes **one proper look** (`scrutinize`).

- It holds with probability `holdOdds`: her polish, plus a little for skill, less for a higher tier, more people, a place already on alert, heat with that crew (word is getting round), machines (they want a badge) and anyone who has met her.
- If it holds, they go back to their business and she has the run of the place; the room is not looked at again. Loot is taken in plain view (no extra penalty for being watched). Each room costs her a little polish.
- Each beat she stays, she may get a long look (about half the chance of a plain stranger being noticed); that is another roll.
- A failed lockpick is a look too, and a harder one.
- If it fails the face is gone (`disguise_blown`) and the room's alarm goes, as for any other notice.
- **Any fight ends it.** `fight()` calls `endDisguise`, so an ambush, a mugging or a brawl all drop the face.
- A fitting face cuts what she thinks a building will cost her to two-fifths (`coverEase`): she'll walk into places she'd otherwise judge too hard (`entranceRisk`, the raid goal's approach, `raidPlan`).

## Doors

`moves.ts` tries the face first at a `guarded` or `bouncer` exit: Atlas / the NPD / a lanyard at `guarded`, a lanyard at `bouncer`. A failure blows it and she faces the door as herself. Fame at the bouncer is `shownFame`, so a star face works through the same roll as real fame.

## The girls

With a star face she can work the room (`star_flirt:<npc>`): a better chance than a plain flirt, +24 affinity (a plain flirt gives +16), sometimes a gift of cash or a number. Everyone fooled is remembered (`Disguise.fooled`); if the face is blown, each takes -12 affinity and remembers being lied to. A failed pass is a cold shoulder, and one time in three it blows the face outright.

## Deciding to, and deciding not to

Faces are planned, not worn on a whim (`guise` goals, `goals.ts`):

- **Cover.** Approaching a raid door she'd lose a fight at, or a hard one, she reckons what a face could do for her (`bluffEase`: the full ease, scaled by how well she thinks she'll carry it and how good the place is) and, if that gets her in, adopts a child goal *walk into X as one of them*. It steers her to put the face on (`don_cover`), ends when she's dressed, and the raid carries on. Doors a bluff would make fightable now count as leads (`knownDungeons` uses `planEase`).
- **Star.** A romance goal that isn't getting anywhere with her own face may, depending on her vanity, honesty and mischief and on how plain her own odds are, grow a child goal *win her over as somebody famous*. It makes her put on the best face she has (`don_star`), work that girl (`star_flirt`), and holds back the ordinary flirt. It ends when the girl is won, or goes cold, or every famous face has been talked about too much (`too_hot`). Without a goal, a star face is a rare whim: only in a crowd of unwon girls, only if she'd carry it, and not for six hours after the last.
- **Shedding.** A face with nothing left to do (no girl to work, no door to go in by) is taken off (`shed_face`, a competent-hero urge), since leaving it on is a risk.

## What impersonating a star costs

- **Buzz** (`buzz`): every wearing of a star's face, and every girl who falls for it, adds talk about that star turning up where they shouldn't; it halves per day. Each point takes 0.07 off carrying the face and 0.06 off working a girl with it, and she picks the face with the least talk.
- **Looks.** In a crowd, every half hour, someone may know better (more likely the more talk there's been): `disguise_blown:recognized`.
- **Found out** as a star (a girl, a fan, a bad pass): she loses a point of fame, the people around her think less of her (-2), and the talk goes up. If it's a face she's already worn a lot (buzz of 1.5 or more) the star's people send a bill (30-90nd) and a copy to the NPD (heat 1).

## Left out / open

- No costumes: a gang jacket or an Atlas vest in the inventory doesn't improve polish yet.
- She can't change in the field: no taking a uniform off a guard she has put down.
- A person she has copied isn't remembered anywhere once the face is off.
- The hand-built places (the Halo, the club's bouncer) get the same treatment as the generated ones, because they use the same gates.
