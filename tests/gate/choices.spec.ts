import { test, expect, type Locator, type Page } from '@playwright/test';
import { GateWatcher, waitForReady, clickFirst } from './harness';

/**
 * The thirteen player choices, driven the way a player drives them: by clicking
 * the button.
 *
 * The rest of the gate reaches scenes with `goTo` and plays them with
 * `advanceBeat`, so until this file existed every choice in the game was wired
 * but unasserted. A choice whose handler stopped moving karma — or moved the
 * same thing either way — would have rendered, exited and passed the whole gate.
 *
 * What each test does, for one choice point:
 *  1. reaches the scene the way the game reaches it, so the ledger is at the
 *     value real play arrives with and not at a clamp boundary (below),
 *  2. reads the ledger, clicks exactly one option, reads it again,
 *  3. asserts the direction of every movement that option is authored to cause,
 *     and that nothing it is not authored to touch moved,
 *  4. asserts the options leave *different* state. Two buttons that leave the
 *     soul identical are not a choice.
 * Plus two tests that drive whole timelines without clicking anything and
 * assert the clock chose nothing — the decision that removed the DMT thread's
 * auto-picks, nailed down so it cannot come back by accident.
 *
 * Why the entry state is set up rather than jumped to: `will` starts at 1 and
 * `attachment` at 0, and both are `clamp01`-ed. A test that jumps straight into
 * the corridor would therefore see every "will +0.2" reward and every "you are
 * carrying less" reward land on a clamp and move nothing — a failure invented by
 * the test. So the corridor is entered through the heart attack's handover
 * (attachment 0.25, will 0.875), and the DMT thread is entered at its own first
 * scene, which is where the game really enters it.
 *
 * Why nothing here asserts caption text, beat ids or timings: scenes are being
 * reworked constantly. The hooks used are the stable ones — `data-choice` on a
 * `ThresholdPrompt` button, `data-action` on an `Overlay` button, scene ids,
 * shard ids and the `window.__game` ledger.
 */

type Field = 'karma' | 'harmony' | 'will' | 'attachment';
type Direction = 'up' | 'down';

const NUMERIC_FIELDS: readonly Field[] = ['karma', 'harmony', 'will', 'attachment'];

/** karma and harmony are whole counters; will and attachment are 0..1. */
const MIN_STEP: Record<Field, number> = { karma: 1, harmony: 1, will: 0.02, attachment: 0.02 };

interface Ledger {
  readonly karma: number;
  readonly harmony: number;
  readonly will: number;
  readonly attachment: number;
  readonly shards: readonly string[];
  readonly scene: string | undefined;
  readonly wisdom: readonly string[];
  readonly memories: readonly string[];
}

interface Movement {
  readonly karma?: Direction;
  readonly harmony?: Direction;
  readonly will?: Direction;
  readonly attachment?: Direction;
}

interface Option {
  /** The value of `data-choice` / `data-action` on this option's button. */
  readonly id: string;
  /** Every ledger field this option is authored to move, and which way. */
  readonly moves: Movement;
  /** The shard id this option writes to the run's record, if any. */
  readonly shard?: string;
  /**
   * Fields the option is authored to move that the real entry state clamps to
   * nothing. Documented, not asserted — see the report in the file header of
   * `choices.spec.ts` and the notes on each occurrence below.
   */
  readonly clamped?: readonly Field[];
  /** True where the option also writes a line of wisdom to the incarnation. */
  readonly wisdom?: boolean;
}

// --- the page, driven ----------------------------------------------------------

/** Boot the game and spend the audio gesture. Called once per option, so the
 *  previous option's state cannot bleed into the next one. */
async function freshRun(page: Page): Promise<void> {
  await page.goto('/');
  await waitForReady(page);
  await clickFirst(page);
}

async function readLedger(page: Page): Promise<Ledger> {
  return page.evaluate(() => {
    const api = globalThis.__game;
    if (!api) {
      throw new Error('test API missing — this is not a dev or GATE_BUILD bundle');
    }
    const carried = api.incarnation();
    return {
      karma: api.karma(),
      harmony: api.harmony(),
      will: api.will(),
      attachment: api.attachment(),
      shards: [...api.shards()],
      scene: api.scene()?.id,
      wisdom: [...carried.wisdom],
      memories: [...carried.memories],
    };
  });
}

/**
 * How long a scene is held with a question open and nobody answering.
 *
 * Derived from the game's own longest grace period — `GRACE_SECONDS` in
 * `death-heart-attack.ts` is 10 — so a scene that grew a grace period of that
 * size would be caught. Measured against the scene's own wall clock rather than
 * a frame count, because a frame count on a software renderer is a different
 * amount of real time than on a real one (CLAUDE.md § Gotchas).
 */
const HOLD_SECONDS = 12;

/** Let the render loop run, so anything a scene does in `update` has happened. */
async function settle(page: Page, frames = 2): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const tick = (): void => {
          seen += 1;
          if (seen >= count) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    frames,
  );
}

/** Skip the current beat and give the scene a frame to react to it. */
async function stepBeat(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const api = globalThis.__game;
    if (!api) {
      throw new Error('test API missing');
    }
    api.advanceBeat();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

async function gotoScene(page: Page, sceneId: string): Promise<void> {
  await page.evaluate(async (target) => {
    const api = globalThis.__game;
    if (!api) {
      throw new Error('test API missing');
    }
    await api.goTo(target);
  }, sceneId);
  await settle(page, 1);
}

async function takeExit(page: Page, exitId: string): Promise<void> {
  await page.evaluate(async (exit) => {
    const api = globalThis.__game;
    if (!api) {
      throw new Error('test API missing');
    }
    await api.takeExit(exit);
  }, exitId);
  await settle(page, 1);
}

/**
 * Hold the current scene for a real interval, read off the scene's own clock.
 *
 * Event-driven on the game's wall clock rather than a fixed sleep or a frame
 * count: it returns as soon as the scene has genuinely been alive that long,
 * and it measures the same interval whatever the frame rate.
 */
async function holdScene(page: Page, seconds: number): Promise<void> {
  const from = await page.evaluate(() => globalThis.__game?.scene()?.elapsed ?? 0);
  await page.waitForFunction(
    (target) => (globalThis.__game?.scene()?.elapsed ?? 0) >= target,
    from + seconds,
    { timeout: (seconds + 20) * 1000 },
  );
}

/**
 * Walk the scene's beats until the named button is on screen.
 *
 * Event-driven rather than slept-through: each step skips one beat and waits one
 * frame, and it stops the moment the button exists. Several DMT choices are
 * cued on a beat, so the clock has to be moved to reach them — but only as far
 * as the choice, never past it.
 */
async function advanceUntil(page: Page, selector: string, maxSteps = 10): Promise<Locator> {
  const target = page.locator(selector);
  for (let step = 0; step < maxSteps; step += 1) {
    if ((await target.count()) > 0) {
      break;
    }
    await stepBeat(page);
  }
  await expect(
    target,
    `the choice "${selector}" never went up, so it cannot be driven by clicking`,
  ).toBeVisible();
  return target;
}

/**
 * Walk the clock until an option's button is on screen, and hand it back
 * unclicked. Both widgets put the option id in a data attribute:
 * `data-choice` on a `ThresholdPrompt` button, `data-action` on an `Overlay` one.
 *
 * Separate from clicking it because reaching a cued choice moves the beat
 * clock, and some scenes do things of their own on a beat — `dmt.sent-back`
 * records the fact of the return the moment it is past its first beat. The
 * baseline a choice is measured against therefore has to be read *after* the
 * question is up and before the click, or the choice gets credited with
 * whatever the scene did on its own.
 */
async function reveal(page: Page, attribute: 'choice' | 'action', id: string): Promise<Locator> {
  return advanceUntil(page, `[data-${attribute}="${id}"]`);
}

/** Click one revealed option. */
async function clickOption(page: Page, button: Locator): Promise<void> {
  // The handlers write the ledger synchronously inside the click, so one frame
  // afterwards is enough for anything the scene does with it in `update`.
  await button.first().click();
  await settle(page, 1);
}

/** Reveal and click, for the answers a test only needs in order to get past them. */
async function pick(page: Page, attribute: 'choice' | 'action', id: string): Promise<void> {
  await clickOption(page, await reveal(page, attribute, id));
}

// --- the assertions -----------------------------------------------------------

function describeLedger(ledger: Ledger): string {
  return (
    `karma ${String(ledger.karma)}, harmony ${String(ledger.harmony)}, ` +
    `will ${ledger.will.toFixed(3)}, attachment ${ledger.attachment.toFixed(3)}, ` +
    `shards [${ledger.shards.join(', ')}]`
  );
}

/**
 * Assert one option's authored effect.
 *
 * Direction and a minimum step, never an exact float: the economy is explicitly
 * untuned (`src/game/soul.ts`), so a retune must not break this file, while a
 * handler that stopped firing must.
 */
function assertOptionMoved(
  scene: string,
  option: Option,
  before: Ledger,
  after: Ledger,
): void {
  const where = `${scene} · "${option.id}"`;
  let somethingMoved = false;

  for (const field of NUMERIC_FIELDS) {
    const delta = after[field] - before[field];
    const want = option.moves[field];
    if (want === undefined) {
      const clampedAway = option.clamped?.includes(field) ?? false;
      expect(
        delta,
        `${where} moved ${field} by ${delta.toFixed(3)}, and it is not authored to touch it.\n` +
          (clampedAway
            ? `${field} IS authored to move here but the entry state clamps it; if that was ` +
              'fixed, list it in `moves` instead of `clamped`.\n'
            : '') +
          `before: ${describeLedger(before)}\nafter:  ${describeLedger(after)}`,
      ).toBeCloseTo(0, 6);
      continue;
    }
    somethingMoved = true;
    const step = MIN_STEP[field];
    if (want === 'up') {
      expect(
        delta,
        `${where} is supposed to raise ${field} and it moved by ${delta.toFixed(3)}. ` +
          'A choice whose handler stopped writing the ledger looks exactly like this.\n' +
          `before: ${describeLedger(before)}\nafter:  ${describeLedger(after)}`,
      ).toBeGreaterThanOrEqual(step);
    } else {
      expect(
        delta,
        `${where} is supposed to lower ${field} and it moved by ${delta.toFixed(3)}.\n` +
          `before: ${describeLedger(before)}\nafter:  ${describeLedger(after)}`,
      ).toBeLessThanOrEqual(-step);
    }
  }

  if (option.shard !== undefined) {
    somethingMoved = true;
    expect(
      after.shards,
      `${where} is supposed to write the shard "${option.shard}" into the run's record ` +
        '(GAME_BRIEF.md § PAST LIVES), and it is not there.',
    ).toContain(option.shard);
    expect(
      before.shards,
      `${where}: the shard "${option.shard}" was already present before the click, so this ` +
        'test is not proving the click wrote it.',
    ).not.toContain(option.shard);
  }

  if (option.wisdom === true) {
    somethingMoved = true;
    expect(
      after.wisdom.length,
      `${where} is supposed to write a line of wisdom to the incarnation, which is what ` +
        '"unlocks an alternate thread" has to mean (GAME_BRIEF.md § META-PROGRESSION).',
    ).toBeGreaterThan(before.wisdom.length);
    expect(
      after.memories.filter((memory) => memory.startsWith('dmt.carried.')),
      `${where} is supposed to leave a durable memory of what he took back into the life.`,
    ).not.toEqual([]);
  }

  expect(
    somethingMoved,
    `${where} is declared to move nothing at all. Every option has to leave a trace, or the ` +
      'choice is decoration.',
  ).toBe(true);
}

interface Measured {
  readonly option: Option;
  readonly before: Ledger;
  readonly after: Ledger;
}

/**
 * What one click did, as a string that can be compared between options.
 *
 * The movement rather than the resulting state, deliberately. Comparing final
 * states would also "differ" because of anything a run happened to accumulate
 * before the click, which would let two identical handlers pass. The movement is
 * the thing the choice is responsible for.
 */
function movementOf(measured: Measured): string {
  const { before, after } = measured;
  return [
    `karma${(after.karma - before.karma).toFixed(0)}`,
    `harmony${(after.harmony - before.harmony).toFixed(0)}`,
    `will${(after.will - before.will).toFixed(3)}`,
    `attachment${(after.attachment - before.attachment).toFixed(3)}`,
    `shards:${after.shards.filter((shard) => !before.shards.includes(shard)).sort().join('|')}`,
    `wisdom${String(after.wisdom.length - before.wisdom.length)}`,
  ].join(' ');
}

/** Two buttons that move the soul the same way are not a choice. */
function assertOptionsDiffer(scene: string, results: readonly Measured[]): void {
  for (let i = 0; i < results.length; i += 1) {
    for (let j = i + 1; j < results.length; j += 1) {
      const a = results[i];
      const b = results[j];
      if (!a || !b) {
        continue;
      }
      expect(
        movementOf(a),
        `${scene}: picking "${a.option.id}" and picking "${b.option.id}" moved the soul in ` +
          'exactly the same way. That is the bug this file exists to catch — the two answers ' +
          `are the same answer.\n  ${a.option.id}: ${movementOf(a)}\n  ` +
          `${b.option.id}: ${movementOf(b)}`,
      ).not.toEqual(movementOf(b));
    }
  }
}

// --- reaching the choices the way the game does -------------------------------

/**
 * Play the heart attack to its handover, then jump to a corridor scene.
 *
 * This is the real route: the corridor is only ever entered from a death, and
 * the death is what sets the attachment and will the Threshold's rewards are
 * then measured against (GAME_BRIEF.md § Act 1).
 */
async function arriveInCorridor(page: Page, sceneId: string): Promise<Ledger> {
  await page.evaluate(async () => {
    const api = globalThis.__game;
    if (!api) {
      throw new Error('test API missing');
    }
    const frame = (): Promise<void> =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    await api.goTo('death.heart-attack');
    // Walk the beats to the end of the vignette before rendering any of them.
    // `advanceBeat` only moves the timeline, so a frame between each one buys
    // nothing here and costs a software-rendered frame apiece.
    for (let step = 0; step < 24; step += 1) {
      const beat = api.beat();
      if (!beat || beat.id === 'stillness' || beat.id === 'after' || beat.finished) {
        break;
      }
      api.advanceBeat();
    }
    // The handover itself happens in `update`, so it needs real frames. A fixed
    // small number rather than "until attachment moves": on a re-entry the soul
    // is already carrying something, so there would be nothing to wait for and
    // the handover would be read before it had run.
    for (let i = 0; i < 4; i += 1) {
      await frame();
    }
  });
  await gotoScene(page, sceneId);

  const opening = await readLedger(page);
  expect(
    opening.attachment,
    'These tests need the opening state the death hands the afterlife. The heart attack did ' +
      'not set it, so every "you are carrying less" reward below would land on the clamp at 0 ' +
      'and the failures would be the test’s fault, not the game’s.',
  ).toBeGreaterThan(0.05);
  expect(
    opening.will,
    'A soul arriving heavy arrives with less will to spend, and these tests need the headroom.',
  ).toBeLessThan(1);
  expect(opening.scene, 'did not land in the scene under test').toBe(sceneId);
  return opening;
}

/**
 * Reach hyperspace the way the thread reaches it: through the flat, having
 * decided what he holds and whether he braces.
 *
 * Both are answered by clicking, not skipped, because those two answers are what
 * set the attachment and will that this scene's own two choices then move. A
 * `goTo('dmt.hyperspace')` would arrive at will 1 / attachment 0 and the
 * clamping would hide real movement.
 */
async function arriveInHyperspace(page: Page): Promise<void> {
  await gotoScene(page, 'death.dmt');
  await pick(page, 'action', 'doorframe');
  await pick(page, 'action', 'release');
  await takeExit(page, 'onward');
  const landed = await readLedger(page);
  expect(landed.scene, 'did not reach hyperspace through the flat').toBe('dmt.hyperspace');
  expect(
    landed.will,
    'hyperspace’s own choices need will headroom, which the flat is supposed to have spent',
  ).toBeLessThan(1);
  expect(landed.attachment, 'he should arrive holding something').toBeGreaterThan(0.05);
}

// --- the Threshold corridor ---------------------------------------------------

/**
 * The seven corridor questions and what each answer is authored to do. Read off
 * the handlers in `threshold-early.ts`, `threshold-light.ts` and
 * `border-and-review.ts`; the point of writing them down here is that the
 * handler can no longer change without this file disagreeing.
 */
const CORRIDOR: readonly { scene: string; question: string; options: readonly Option[] }[] = [
  {
    scene: 'threshold.pronounced-dead',
    question: 'whether the hour they just said out loud is yours',
    options: [
      { id: 'accept', moves: { harmony: 'up', attachment: 'down' } },
      { id: 'refuse', moves: { will: 'up', attachment: 'up' } },
    ],
  },
  {
    scene: 'threshold.buzzing',
    question: 'whether to go with the sound or hold yourself together',
    options: [
      { id: 'go-with-it', moves: { harmony: 'up', attachment: 'down' } },
      { id: 'hold-together', moves: { will: 'up', attachment: 'up' } },
    ],
  },
  {
    scene: 'threshold.out-of-body',
    question: 'what you watch from above: your own body or the living',
    options: [
      { id: 'the-body', moves: { attachment: 'up', will: 'up' } },
      {
        id: 'the-living',
        moves: { karma: 'down', harmony: 'up' },
        shard: 'threshold.the-two-in-the-room',
      },
    ],
  },
  {
    scene: 'threshold.tunnel',
    question: 'whether to take hold of the earlier wound keeping pace with you',
    options: [
      {
        id: 'take-it',
        moves: { will: 'up', attachment: 'up' },
        shard: 'past-life.the-earlier-wound',
      },
      { id: 'let-it-pass', moves: { harmony: 'up', attachment: 'down' } },
    ],
  },
  {
    scene: 'threshold.loved-ones',
    question: 'whether the four are who they are or your own mind',
    options: [
      { id: 'as-real', moves: { harmony: 'up', attachment: 'up' } },
      { id: 'as-mind', moves: { will: 'up', attachment: 'down' } },
    ],
  },
  {
    scene: 'threshold.being-of-light',
    question: 'whether the light is what you are made of',
    options: [
      {
        id: 'recognise',
        moves: { harmony: 'up', will: 'up', attachment: 'down' },
        shard: 'bardo.the-clear-light-recognised',
      },
      { id: 'be-held', moves: { harmony: 'up', attachment: 'up' } },
    ],
  },
  {
    scene: 'threshold.border',
    question: 'whether to set the grievance down before the limit',
    options: [
      { id: 'set-it-down', moves: { karma: 'up', harmony: 'up', attachment: 'down' } },
      { id: 'carry-it', moves: { will: 'up', attachment: 'up' } },
    ],
  },
];

test.describe('the Threshold corridor: every answer moves the soul', () => {
  for (const point of CORRIDOR) {
    test(`${point.scene} — ${point.question}`, async ({ page }) => {
      const watcher = new GateWatcher(page);
      watcher.attribute(point.scene);
      const results: Measured[] = [];
      const openings: Ledger[] = [];
      await freshRun(page);

      for (const option of point.options) {
        // Each answer is measured from the state the death hands over, because
        // `arriveInCorridor` replays that handover and the handover *assigns*
        // attachment and will rather than adding to them — so the two clamped
        // fields are genuinely reset between options, which is the only thing a
        // reload would buy here. Karma, harmony and shards do carry over, and
        // every assertion below is a delta across the one click, so they do not
        // enter into it: `assertOptionsDiffer` compares the movements, not the
        // resulting states. A reload per option costs a boot of the whole game,
        // and the gate already runs for a quarter of an hour.
        openings.push(await arriveInCorridor(page, point.scene));

        const button = await reveal(page, 'choice', option.id);
        const before = await readLedger(page);
        await clickOption(page, button);
        const after = await readLedger(page);

        assertOptionMoved(point.scene, option, before, after);
        expect(
          after.scene,
          `${point.scene} navigated away on its own when "${option.id}" was picked. The prompt ` +
            'settles first and the player takes the exit; nothing here should move the scene.',
        ).toBe(point.scene);
        results.push({ option, before, after });
      }

      // Proof that re-entering through the death really did reset the two
      // clamped fields, so the second answer was measured from the same place
      // as the first — and, incidentally, that the death hands over the same
      // opening state every time, which the seeded RNG is supposed to guarantee.
      const first = openings[0];
      expect(first, 'no arrival was recorded').toBeDefined();
      for (const opening of openings) {
        expect(
          opening.attachment,
          `${point.scene}: the death handed over a different attachment on a later run, so the ` +
            'answers below were not measured from the same place.',
        ).toBeCloseTo(first?.attachment ?? -1, 6);
        expect(
          opening.will,
          `${point.scene}: the death handed over a different will on a later run.`,
        ).toBeCloseTo(first?.will ?? -1, 6);
      }

      assertOptionsDiffer(point.scene, results);
      await watcher.assertClean(`while clicking through ${point.scene}`);
    });
  }
});

// --- the Smoke DMT thread -----------------------------------------------------

test.describe('the Smoke DMT thread: every answer moves the soul', () => {
  test('death.dmt — what he holds on to as the room goes', async ({ page }) => {
    const watcher = new GateWatcher(page);
    watcher.attribute('death.dmt');

    // The flat is the thread's first scene, so will 1 / attachment 0 is the real
    // entry state here and not an artefact. That is also why two of the three
    // options have a clamped field: see `clamped` below.
    const options: readonly Option[] = [
      {
        id: 'doorframe',
        moves: { harmony: 'up', attachment: 'up' },
        shard: 'dmt.held.doorframe',
        // will +0.05 on a soul that starts at will 1.
        clamped: ['will'],
      },
      {
        id: 'hall',
        moves: { attachment: 'up' },
        shard: 'dmt.held.hall',
        // will +0.25, the whole reward for this option, on a soul at will 1.
        clamped: ['will'],
      },
      {
        id: 'window',
        moves: { harmony: 'up', will: 'down' },
        shard: 'dmt.held.window',
        // attachment -0.06 on a soul that starts at attachment 0.
        clamped: ['attachment'],
      },
    ];

    const results: Measured[] = [];
    for (const option of options) {
      await freshRun(page);
      await gotoScene(page, 'death.dmt');
      const button = await reveal(page, 'action', option.id);
      const before = await readLedger(page);
      await clickOption(page, button);
      const after = await readLedger(page);
      assertOptionMoved('death.dmt', option, before, after);
      results.push({ option, before, after });
    }
    assertOptionsDiffer('death.dmt (what he holds)', results);
    await watcher.assertClean('while choosing what he holds on to');
  });

  test('death.dmt — whether he braces against the fold', async ({ page }) => {
    const watcher = new GateWatcher(page);
    watcher.attribute('death.dmt');

    // One overlay slot with a queue behind it, so this choice can only be
    // reached by answering the first one. "doorframe" is answered first in both
    // runs, which keeps the two measurements comparable.
    const options: readonly Option[] = [
      {
        id: 'hold',
        moves: { attachment: 'up' },
        shard: 'dmt.held-on',
        // will +0.2, on a soul "doorframe" leaves at will 1.
        clamped: ['will'],
      },
      {
        id: 'release',
        moves: { harmony: 'up', attachment: 'down', will: 'down' },
        shard: 'dmt.let-go',
      },
    ];

    const results: Measured[] = [];
    for (const option of options) {
      await freshRun(page);
      await gotoScene(page, 'death.dmt');
      await pick(page, 'action', 'doorframe');
      const button = await reveal(page, 'action', option.id);
      const before = await readLedger(page);
      await clickOption(page, button);
      const after = await readLedger(page);
      assertOptionMoved('death.dmt (the fold)', option, before, after);
      results.push({ option, before, after });
    }
    assertOptionsDiffer('death.dmt (the fold)', results);
    await watcher.assertClean('while choosing whether he braces');
  });

  test('dmt.hyperspace — whether to meet what turned toward him', async ({ page }) => {
    const watcher = new GateWatcher(page);
    watcher.attribute('dmt.hyperspace');

    const options: readonly Option[] = [
      { id: 'meet', moves: { harmony: 'up', attachment: 'down' }, shard: 'dmt.met-it' },
      { id: 'look-away', moves: { will: 'up' }, shard: 'dmt.looked-away' },
    ];

    const results: Measured[] = [];
    for (const option of options) {
      await freshRun(page);
      await arriveInHyperspace(page);
      const button = await reveal(page, 'action', option.id);
      const before = await readLedger(page);
      await clickOption(page, button);
      const after = await readLedger(page);
      assertOptionMoved('dmt.hyperspace (meeting it)', option, before, after);
      results.push({ option, before, after });
    }
    assertOptionsDiffer('dmt.hyperspace (meeting it)', results);
    await watcher.assertClean('while deciding whether to meet it');
  });

  test('dmt.hyperspace — whether to show it what he brought', async ({ page }) => {
    const watcher = new GateWatcher(page);
    watcher.attribute('dmt.hyperspace');

    // GAME_BRIEF.md § Systems: karma is effect on others. This is the one choice
    // in the thread that moves it, in both directions, so a regression here is a
    // regression in the game's moral engine.
    const options: readonly Option[] = [
      {
        id: 'show',
        moves: { karma: 'up', harmony: 'up', attachment: 'down' },
        shard: 'dmt.showed-it',
      },
      {
        id: 'keep',
        moves: { karma: 'down', will: 'up', attachment: 'up' },
        shard: 'dmt.kept-it',
      },
    ];

    // The sixth choice rides along on these two runs rather than paying for two
    // more. Its movement is the graph rather than the ledger: GAME_BRIEF.md
    // § Act 1 calls being sent back the classic case, and going on leads into
    // the same Threshold as the other six deaths. One side is taken per run, so
    // both are driven and neither needs its own arrival.
    const fork: Record<string, string> = { show: 'sent-back', keep: 'cross-over' };
    const landed: Record<string, string | undefined> = {};

    const results: Measured[] = [];
    for (const option of options) {
      await freshRun(page);
      await arriveInHyperspace(page);
      // Queued behind the previous question, so that one is answered the same
      // way in both runs and only the option under test differs.
      await pick(page, 'action', 'meet');
      const button = await reveal(page, 'action', option.id);
      const before = await readLedger(page);
      await clickOption(page, button);
      const after = await readLedger(page);
      assertOptionMoved('dmt.hyperspace (showing it)', option, before, after);
      results.push({ option, before, after });

      const side = fork[option.id];
      if (side !== undefined) {
        await pick(page, 'action', side);
        landed[side] = (await readLedger(page)).scene;
      }
    }
    assertOptionsDiffer('dmt.hyperspace (showing it)', results);

    expect(
      landed['sent-back'],
      'Being sent back is the classic "it is not your time" (GAME_BRIEF.md § Act 1, vignette 7) ' +
        'and must reach the scene for it.',
    ).toBe('dmt.sent-back');
    expect(
      landed['cross-over'],
      'Going on must lead into the Threshold the other six deaths lead into.',
    ).toBe('threshold.pronounced-dead');

    await watcher.assertClean('while deciding whether to show it, and taking the fork');
  });

  test('dmt.sent-back — what he carries back, and it outlives the run', async ({ page }) => {
    const watcher = new GateWatcher(page);
    watcher.attribute('dmt.sent-back');

    // The thread's durable decision. It is written to the incarnation rather
    // than to the run, because he did not die and there is no river between
    // this scene and the rest of his life.
    const options: readonly Option[] = [
      {
        id: 'call-her',
        moves: { karma: 'up', harmony: 'up', attachment: 'down' },
        shard: 'dmt.carried.her-name',
        wisdom: true,
      },
      {
        id: 'finish-it',
        // Authored as will +0.25 — and the scene sets will to 1 on the frame
        // before this question goes up, so the whole of it is clamped away and
        // the shard plus the wisdom line are the entire effect. Reported, not
        // worked around: see the report for this spec.
        moves: {},
        shard: 'dmt.carried.the-hall',
        wisdom: true,
        clamped: ['will'],
      },
      {
        id: 'say-nothing',
        moves: { attachment: 'up' },
        shard: 'dmt.carried.in-silence',
        wisdom: true,
        clamped: ['will'],
      },
    ];

    const results: Measured[] = [];
    for (const option of options) {
      await freshRun(page);
      // The incarnation is on localStorage and survives a reload, so each run
      // starts from no past lives or the wisdom assertions would measure the
      // previous option's write.
      await page.evaluate(() => {
        globalThis.__game?.forgetAllLives();
      });
      // The declared route, with only the optional answers skipped: he has to
      // arrive holding something, because this scene's "call her tonight" is
      // authored to set weight down and that has to have somewhere to come from.
      // The two hyperspace questions are left unanswered on purpose — they are
      // not preconditions of this one, and driving them would cost two more
      // software-rendered clicks per run.
      await gotoScene(page, 'death.dmt');
      await pick(page, 'action', 'doorframe');
      await takeExit(page, 'onward');
      await takeExit(page, 'sent-back');
      const button = await reveal(page, 'action', option.id);
      const before = await readLedger(page);
      expect(before.scene, 'did not reach the scene under test').toBe('dmt.sent-back');
      expect(
        before.attachment,
        'he should come back still carrying a little, or "call her tonight" has no weight to ' +
          'set down and its reward lands on the clamp at 0',
      ).toBeGreaterThan(0.05);
      await clickOption(page, button);
      const after = await readLedger(page);
      assertOptionMoved('dmt.sent-back', option, before, after);
      results.push({ option, before, after });
    }
    assertOptionsDiffer('dmt.sent-back', results);
    await watcher.assertClean('while deciding what he carries back');
  });
});

// --- the clock never chooses --------------------------------------------------

/**
 * The owner's decision, nailed down: the game never chooses for the player. The
 * DMT thread's auto-picks were removed for exactly this reason, and nothing in
 * the existing gate would notice them coming back — every other test either
 * clicks nothing and asserts nothing about the ledger, or clicks nothing and
 * plays on past the choice.
 *
 * So: drive the whole timeline of a scene that has a choice open, without
 * touching a button, and assert the soul is exactly where it was.
 */
async function playWholeTimeline(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const api = globalThis.__game;
    if (!api) {
      throw new Error('test API missing');
    }
    const frame = (): Promise<void> =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    for (let guard = 0; guard < 24; guard += 1) {
      const beat = api.beat();
      if (!beat || beat.finished) {
        break;
      }
      api.advanceBeat();
      await frame();
    }
  });
  // Then sit on the closing image for longer than the longest grace period in
  // the game. A timer that answers for the player would have fired by now.
  await holdScene(page, HOLD_SECONDS);
}

/** The whole no-click check for one scene, once it has been arrived at. */
async function assertClockChoseNothing(
  page: Page,
  sceneId: string,
  optionSelectors: readonly string[],
): Promise<void> {
  const before = await readLedger(page);
  expect(before.scene, `did not land in ${sceneId}`).toBe(sceneId);
  await playWholeTimeline(page);
  const after = await readLedger(page);

  for (const field of NUMERIC_FIELDS) {
    expect(
      after[field],
      `${sceneId} moved ${field} with nobody clicking anything. The game must never choose ` +
        'for the player: a scene that pays out on a timer has taken the decision, and the DMT ' +
        "thread's auto-picks were removed for exactly this reason.\n" +
        `before: ${describeLedger(before)}\nafter:  ${describeLedger(after)}`,
    ).toBeCloseTo(before[field], 6);
  }
  expect(after.shards, `${sceneId} recorded a decision nobody made.`).toEqual(before.shards);
  expect(
    after.scene,
    `${sceneId} navigated away on its own after its last beat. Where a choice is open the ` +
      'scene waits for the player, however long that takes (GAME_BRIEF.md § Act 1).',
  ).toBe(sceneId);

  // And the question is still there to be answered, which is the other half of
  // "it waits": a choice that silently disappeared would also leave the ledger
  // untouched, and would be worse — the player never learns it was there.
  for (const selector of optionSelectors) {
    await expect(
      page.locator(selector),
      `${sceneId}: "${selector}" is gone after the timeline ran out, so the player can no ` +
        'longer make this choice at all and everything it carries can never move.',
    ).toBeVisible();
  }
}

/**
 * Split in two only to keep each test inside the gate's 90-second budget: a
 * test that may run long enough to hang is a test that can pass by hanging,
 * which is what `playwright.config.ts` sets that budget to prevent.
 */
const CORRIDOR_HALVES: readonly { name: string; scenes: readonly string[] }[] = [
  {
    name: 'leaving the room',
    scenes: ['threshold.pronounced-dead', 'threshold.buzzing', 'threshold.out-of-body'],
  },
  {
    name: 'the passage and the limit',
    scenes: [
      'threshold.tunnel',
      'threshold.loved-ones',
      'threshold.being-of-light',
      'threshold.border',
    ],
  },
];

test.describe('nothing is decided for the player', () => {
  for (const half of CORRIDOR_HALVES) {
    test(`the corridor (${half.name}): the questions stay open and the ledger stays put`, async ({
      page,
    }) => {
      const watcher = new GateWatcher(page);
      // One page for the whole set, which is safe precisely because the claim
      // under test is that nothing changes: there is no state to bleed. Each
      // scene is re-entered through the death's handover, so each starts from
      // the state real play arrives with.
      await freshRun(page);

      for (const sceneId of half.scenes) {
        watcher.attribute(sceneId);
        await arriveInCorridor(page, sceneId);
        const point = CORRIDOR.find((entry) => entry.scene === sceneId);
        expect(point, `${sceneId} is not in the corridor table`).toBeDefined();
        await assertClockChoseNothing(
          page,
          sceneId,
          (point?.options ?? []).map((option) => `[data-choice="${option.id}"]`),
        );
      }

      await watcher.assertClean(`while letting ${half.name} run with nobody choosing`);
    });
  }

  test('the DMT flat: the clock queues the questions and answers none of them', async ({ page }) => {
    const watcher = new GateWatcher(page);
    watcher.attribute('death.dmt');
    await freshRun(page);
    await gotoScene(page, 'death.dmt');

    // Only the first question is checked for still being on screen: all six of
    // the thread's choices share one overlay slot with a queue behind it, so the
    // others are correctly waiting their turn rather than missing.
    await assertClockChoseNothing(page, 'death.dmt', ['[data-action="doorframe"]']);

    await watcher.assertClean('while letting the flat run with nobody choosing');
  });

  test('hyperspace: the fork is never taken for the player', async ({ page }) => {
    const watcher = new GateWatcher(page);
    watcher.attribute('dmt.hyperspace');
    await freshRun(page);
    await arriveInHyperspace(page);

    const before = await readLedger(page);
    await playWholeTimeline(page);
    const after = await readLedger(page);

    // Not the whole ledger here, deliberately. This scene puts a floor under the
    // weight the crossing would hand the afterlife, on its own, by design
    // (`CROSSING_ATTACHMENT`, and the comment there calls it a floor and not an
    // override) — so attachment and will are allowed to move. Karma, harmony and
    // the record of what was decided are not: those only move when the player
    // decides something.
    expect(
      after.karma,
      'dmt.hyperspace moved karma with nobody clicking anything. Karma is effect on others, ' +
        'and nobody did anything to anyone.',
    ).toBe(before.karma);
    expect(
      after.harmony,
      'dmt.hyperspace moved harmony with nobody clicking anything.',
    ).toBe(before.harmony);
    expect(
      after.shards.filter((shard) => !before.shards.includes(shard)),
      'dmt.hyperspace recorded a decision nobody made. Meeting it, looking away, showing it ' +
        'and keeping it are the player’s.',
    ).toEqual([]);
    expect(
      after.scene,
      'The most consequential choice in Act 1 was taken by the clock. Nothing in the scene — ' +
        'no timer, no beat, no closing image — may take it for the player.',
    ).toBe('dmt.hyperspace');
    // The fork, or one of the two questions queued in front of it, is still on
    // screen and still answerable.
    await expect(
      page
        .locator('[data-action="sent-back"], [data-action="meet"], [data-action="show"]')
        .first(),
      'hyperspace took every question off screen unanswered, so the fork can no longer be taken',
    ).toBeVisible();

    await watcher.assertClean('while letting hyperspace run with nobody choosing');
  });
});
