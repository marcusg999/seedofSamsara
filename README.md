# Seed of Samsara

A browser game about death, the afterlife and reincarnation. You die; what
happens next depends on how you died, what you carried, and what you choose at
the edge of the Light.

`GAME_BRIEF.md` is the source of truth for story, tone, mechanics and quality
bars. `CLAUDE.md` holds the working rules. Read both before changing anything.

## State

Scaffolding, the error gate, and the research base. **No gameplay yet** — the
only scene is `boot`, a harness scene that exists so the gate has something real
to render, compile a shader for, and free on unload.

See `progress.html` for what changed, what the critic said, and the blind-test
result per piece.

## Running it

```sh
npm install          # Playwright's Chromium: npx playwright install chromium
npm run dev          # http://localhost:5173
npm run build        # production build (no test API)
npm run gate         # the error gate — must pass before any commit
npm run research:fetch   # re-fetch the public-domain primary sources
```

Pin note: `@playwright/test` is pinned to an exact version on purpose. The
Playwright version determines which Chromium build it requires, and a caret range
silently breaks the gate on a browser mismatch.

## The error gate

`npm run gate` runs typecheck, lint, production build, then a Playwright
playthrough in headless Chromium. The playthrough fails on any console error,
uncaught exception, unhandled promise rejection, WebGL warning or shader compile
error; on any scene without a reachable exit; and on any scene that does not
render at least once, so every shader actually compiles on the GPU.

**Never commit or push with a failing gate, and never weaken the gate to make it
pass.** If a test is wrong, fix the test and say why in the commit message.

The required journeys — every death vignette, both afterlife paths, every Life
Market aisle through checkout — are declared up front in
`tests/gate/journeys.spec.ts`. While their scenes are unbuilt each one skips with
the scenes it is waiting on named, so missing content is visible rather than
absent, and enforcement switches on by itself when those scenes register.

## Layout

```
src/game/
  manifest.ts        every scene the game intends to build, with build status
  state-machine.ts   the scene graph; validates exits and catches softlocks
  game.ts            render loop and transitions; tears down before it builds
  renderer.ts        DPR cap, context loss/restore, frame-time measurement
  rng.ts             the only source of randomness, seeded
  disposal.ts        resource tracker; scenes are swept on unload
  test-api.ts        window.__game, dev and test builds only
  scenes/            registered scenes (currently: boot)
tests/gate/          the playthrough: graph checks, scene sweep, journeys
scripts/gate.mjs     gate orchestration
research/
  lore-bible.md      50 sourced, tiered claims; cite by id (e.g. L-THRESH-04)
  sources/           primary texts (public domain)
```

## Lore

Every lore claim in code or copy cites a claim id from `research/lore-bible.md`,
which carries the source and an evidence tier for each. Tiers matter: the
empirical sources and the traditional ones are not interchangeable, and only the
empirical ones may be stated as fact in any framing that implies real-world
authority. `grep -rn "L-[A-Z]*-[0-9]" src/` finds every citing site.
