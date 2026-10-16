---
name: new-location
description: Add a new kind of location to Neo (a maximal, multidimensional, affordance-driven place like the gym). Use when the author writes "PROTOCOL: new location", optionally with ", review" and/or ": <concept>".
---

Follow `docs/locations/PROTOCOL.md` exactly; `docs/locations/gym.md` is the worked example and `docs/locations/TEMPLATE.md` is the spec.

Mode:
- `PROTOCOL: new location`: run straight through (concept, spec, build, verify, document, push). Never stop for approval.
- `PROTOCOL: new location, review`: do steps 0-1 only, post the concept pitch as the whole reply, and stop for approval.
  After approval (or requested changes) continue from step 2 without stopping again.
- Text after a colon is the author's concept; otherwise choose one the city lacks.

Principles: maximal (many independent axes, huge space), unbalanced (outliers are features; limits come from the world),
multidimensional (every skill, stat and drive has something to do; capabilities are an open set; run `npm run coverage`).

Commit to the session's designated branch. No PR unless asked.
