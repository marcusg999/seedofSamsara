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

Requires Node 20.19 or newer.

```sh
git clone https://github.com/marcusg999/seedofSamsara.git
cd seedofSamsara
npm install
npx playwright install chromium   # only needed to run the gate
```

### Play it locally

```sh
npm run dev
```

Then open **http://localhost:5173** in a browser. The dev server hot-reloads, so
edits to a scene appear without a restart.

### Play the production build

```sh
npm run build     # type-checks, then bundles to dist/
npm run preview
```

Then open **http://localhost:4173**. This is the build a player would get: it has
no test API and no frame readback.

To serve `dist/` from anything else, note that the build uses relative asset paths
(`base: './'`), so it works from a subdirectory as well as from a domain root —
any static host will do, including `npx serve dist`.

### In the browser

Desktop and mobile browsers with WebGL2. **Play with sound on** — the audio is
synthesised at runtime and carries a lot of the vignette. Browsers block audio
until you interact, so the first click or key press starts it.

Controls, which the game also states on its first screen:

| Input | Action |
| --- | --- |
| Drag with mouse or finger | Look around |
| Arrow keys, or WASD | Look around |
| On-screen buttons | Begin, choose, and move on |

There is nothing to fail and nothing to time. Movement is authored; where you
look is yours.

A run takes about twelve minutes end to end, most of it the vignette.

### Pin a seed

All randomness comes from one seeded generator, so a run is reproducible. Append
a seed to the URL to replay the same one:

```
http://localhost:5173/?seed=anything-you-like
```

### Other scripts

```sh
npm run gate             # the error gate — must pass before any commit
npm run typecheck        # TypeScript alone
npm run lint             # ESLint alone
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
