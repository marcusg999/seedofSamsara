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
- In the police shooting and the soldier's death, the camera centers the dying
  person. Those doing the killing are never the subject.
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
- The Playwright version determines which Chromium build it requires. A caret
  range silently resolved to a version whose browser was not the one installed,
  and the whole gate failed on a missing executable instead of on the game. Pin
  the Playwright version exactly.
- Headless Chromium composites a WebGL canvas by reading its framebuffer back,
  and the driver reports that as a `GPU stall due to ReadPixels` performance
  warning. It is not ours: a page with nothing but a canvas and `gl.clear`
  emits it too. Before ever filtering a WebGL warning, prove it is the host's
  by reproducing it without any of our code — and scope the filter to that one
  message. Filtering anything we actually caused is weakening the gate.
- Never start a second server on the gate's port while the gate is running. The
  gate's `vite preview` uses `--strictPort` on 4173, so it cannot be hijacked at
  startup — but a mid-run `fuser -k 4173/tcp` from a separate build check killed
  it and replaced it with a *production* preview. Production strips
  `window.__game` by design, so all 28 remaining tests timed out at
  `waitForReady` and the run looked like a total regression in the change under
  test. A gate failure where *everything* fails at `waitForReady` means the page
  has no test API: suspect the wrong bundle before suspecting the code. Verify
  with `pgrep -af vite` that the preview serving 4173 is the gate's own.
- Vite hashes asset filenames by content, so an unchanged hash is proof the
  bundle is unchanged. Comparing the published artifact's asset sha256 against a
  fresh local build answers "is the live link actually running my fix?" without
  guessing — and it caught that a republish was unnecessary.
- Trimming a timeline fixes the script, not the clock. Anything that must take a
  real amount of time (a beat, a grace period, a timeout) reads wall-clock, never
  accumulated frame deltas: the loop clamps deltas for animation, and a clamped
  delta makes story time run slow in exact proportion to how bad the frame rate
  is. Pacing must be a property of the game, not of the machine.
- A bright event has to last longer than a frame. A blast peaked for 0.4s and
  read as nothing, because this container renders these scenes at ~3fps and the
  peak fell between frames: ten captures found ten dark ditches. Hold the peak
  on a plateau no frame rate you support can step over (0.18s at full worked),
  and sample every rendered frame when measuring rather than polling on a timer,
  or you photograph the wrong moment and conclude the effect is broken.
- A frame that keeps its shading keeps its sense of where its light is from, so
  it reads as "brightly lit", not as a blast. Whiting out needs the sky dome and
  every material's own emission, not one or two terms — and a flat wash added
  equally to every pixel flattens the image rather than blowing it out.
- Bloom runs BEFORE the grade, so at a bright peak its output is washed, exposed
  and tonemapped on top of a frame already at the top of the curve. Dropping its
  threshold there blooms the whole image: measured 43.5% clipped with std 9.8,
  over the gate's bound with the structure gone. Held to a halo on what is
  actually brightest, the same peak measured 12.2% with std 20.
- Never key a per-beat ramp by beat index (`index <= 2`). Inserting a beat at the
  front silently retargets it at the wrong beats and nothing fails. Key it by
  beat id, the way the choice cues are.
- Declaring an exit is not offering one. The gate's softlock rule checks that a
  scene declares a reachable exit, and four scenes passed it while holding the
  player forever: the corridor waiting on an answer nobody gave, an overlay
  whose buttons fell outside a short viewport, and light.life-review and
  light.council declaring exits no code ever took. When a scene is reported as
  stuck, audit every scene for the same shape immediately — `takeExit` missing
  from a scene that declares exits is one grep — rather than fixing the one that
  was reported.
- Add to this section every time a mistake is made or narrowly avoided.
