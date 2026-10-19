# Property office

A lot on a street with a property agent behind a desk and a board of homes for sale. This is where **deeds** come from: a home
she buys is hers through every death (`Legacy.deeds`), and she sleeps in it for free.

Lean by design: no affordance registry yet. Candidates are written by hand in `engine/src/realty.ts`.

## Shape

- **Lot** (`GenRole`/`Location.kind` `realty`), rolled on its own stream (`realtychance:<seed>:<street>`) after the pawn shop, so no
  existing map changes. Chance per street by district in `content/realty.ts` (`REALTY_CHANCE`): most in corporate, market and tenement.
- **People:** one `realtor` (property agent), resident. No agent, no sale.
- **Hours:** 09:00-21:00.

## The board

Each office lists 2-4 homes, a pure function of the office (id, district, depth) and the world seed. Two kinds:

| kind | where | price (before district) | bed quality |
|---|---|---|---|
| `pod` pod apartment, megablock tower | everywhere, almost only in slum/industrial/tenement | 700-2,200 | 0.76-0.90 |
| `townhouse` townhouse, gated district | corporate, nightlife, market | 6,000-20,000 | 0.92-1.00 |

The district multiplies price (slum x0.55 ... corporate x1.7) and nudges quality. Depth adds 4% per step. Odds per district are in
`HOME_ODDS`; a townhouse in a slum is rare and allowed.

## What she can do

- `realtyview:board`: have a look at what is for sale.
- `realtybuy:<n>`: buy listing n if she has the cash (haggling skill knocks the price down). The home is made on the office's street
  (a door in the street's apartment block), the listing comes off the board, the deed goes in the legacy. **No limit** on how many.
- Money in a pocket dies with her; a deed doesn't. So with a pile she is drawn to offices (`realtyPull`) and to buy; each home she
  already owns lowers the appeal of another, without ever forbidding it.

## Owning a home

At an owned home `sleep_home` is offered: free, eight hours, no thieves, quality = the home's. When tired she heads for the nearest
owned home whatever is in her pocket (`errands` in `rest.ts`).

## Open

- Selling a deed back, rent, and other things a property office could do (inspect, burgle the listings, the agent as a contact).
- The home is a plain apartment door; a townhouse could have a street of its own.
