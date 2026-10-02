# CLAUDE.md — Seed of Samsara

Read GAME_BRIEF.md before every task. It is the source of truth for story, tone,
mechanics and quality bars. If a task conflicts with it, stop and ask.

## Stack
- three.js / WebGL in the browser. TypeScript in strict mode. No `any` without a
  comment explaining why.
- Choose the rest of the tooling yourself, but keep `npm run dev`, `npm run build`
  and `npm run gate` as the three entry points.

## The error gate (non-negotiable)
`npm run gate` runs, in order: typecheck, lint, production build, then a Playwright
playthrough in headless Chromium that:
- plays every death vignette, both afterlife paths, and every Life Market aisle
  through checkout,
- fails on any console error, uncaught exception, unhandled promise rejection,
  WebGL warning, or shader compile error,
- fails if any scene sits more than 60 seconds without a reachable exit (softlock),
- renders every scene at least once, so every shader actually compiles.
Never commit or push with a failing gate. Never weaken the gate to make it pass.
If a test is wrong, fix the test and say why in the commit message.

## Testability
- Expose a test API on `window.__game` in dev and test builds only: current scene,
  karma, harmony, will, cart contents, and `goTo(sceneId)` to jump anywhere.
- All randomness goes through one seeded RNG so playthroughs are reproducible.
- Game flow is an explicit state machine. Every state declares its exits.

## three.js discipline
- Dispose geometries, materials, textures and render targets when a scene unloads.
- Handle `webglcontextlost` / `webglcontextrestored` gracefully.
- Cap device pixel ratio on mobile; keep a frame-time budget and measure it in the gate.

## Content rules
- Deaths are conveyed through perception, not gore (see GAME_BRIEF.md).
- In the police shooting and the lynching, the camera centers the victim. The
  perpetrators are never the subject.
- The DMT vignette depicts the experience only. No dosing or preparation detail.
- Content notes appear before play.
- Lore claims trace back to research/lore-bible.md with a source.

## Research
- First task in a fresh clone: download Franchezzo's full text into research/
  and build research/lore-bible.md from the sources listed in GAME_BRIEF.md.

## Working style
- Gauntlet loop: builder and critic are always separate agents. The critic never
  sees the builder's notes.
- Keep progress.html updated with what changed, what the critic said, and the
  current blind-test result per piece.
- Small commits, one piece at a time.

## Gotchas
- Shader errors only show up at runtime. A green build means nothing until every
  scene has rendered in the gate.
- Browsers block audio until a user gesture. Start the audio context on the first
  click or keypress, and make the gate click first.
- Undisposed three.js resources leak silently and crash mobile after several runs.
  The reincarnation loop makes this worse because the player cycles scenes forever.
- Post-processing stacks are where frame rate dies. Profile before adding a pass.
- Headless Chromium may fall back to software WebGL. Run the gate with GPU flags
  if available, and don't treat software-render frame times as real performance.
- Add to this section every time a mistake is made or narrowly avoided.
