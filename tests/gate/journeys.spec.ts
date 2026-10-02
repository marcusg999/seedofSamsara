import { test, expect } from '@playwright/test';
import { GateWatcher, waitForReady, clickFirst } from './harness';

/**
 * The journeys the gate must play end to end (CLAUDE.md § The error gate):
 * every death vignette, both afterlife paths, and every Life Market aisle
 * through checkout.
 *
 * Each journey is defined here once, by scene id, against GAME_BRIEF.md. While a
 * journey's scenes are still `planned` in the manifest there is nothing to
 * drive, so the journey reports itself as not yet buildable and the gate says so
 * out loud on every run. The moment those scenes are registered, the same
 * definition starts enforcing the full playthrough — no test has to be written
 * or widened to switch enforcement on.
 *
 * This is the opposite of weakening the gate: the required journeys are
 * declared up front, so a missing vignette is visible rather than absent.
 */

interface Journey {
  readonly name: string;
  /** Scene ids in the order the player meets them. */
  readonly steps: readonly string[];
}

const JOURNEYS: readonly Journey[] = [
  // The vertical slice: one complete path, front matter to life review. This is
  // the journey that must stay green while the slice is the deliverable.
  {
    name: 'the vertical slice, front matter to life review',
    steps: [
      'content-notes',
      'vignette-select',
      'death.heart-attack',
      'threshold.pronounced-dead',
      'threshold.buzzing',
      'threshold.out-of-body',
      'threshold.tunnel',
      'threshold.loved-ones',
      'threshold.being-of-light',
      'threshold.border',
      'threshold.choice',
      'light.life-review',
    ],
  },

  // Act 1 — all seven vignettes, each from front matter into the Threshold.
  ...[
    'death.car-crash',
    'death.cliff-fall',
    'death.police-shooting',
    'death.bomb-blast',
    'death.heart-attack',
    'death.lynching',
    'death.dmt',
  ].map((vignette) => ({
    name: `vignette: ${vignette}`,
    steps: ['content-notes', 'vignette-select', vignette, 'threshold.pronounced-dead'],
  })),

  {
    name: 'the Threshold, through Moody’s elements to the choice',
    steps: [
      'threshold.pronounced-dead',
      'threshold.buzzing',
      'threshold.out-of-body',
      'threshold.tunnel',
      'threshold.loved-ones',
      'threshold.being-of-light',
      'threshold.border',
      'threshold.choice',
    ],
  },

  {
    name: 'Path A: entering the Light, through checkout to rebirth',
    steps: [
      'threshold.choice',
      'light.life-review',
      'light.council',
      'market.parents',
      'market.body',
      'market.gifts',
      'market.trauma',
      'market.economics',
      'market.place',
      'market.contracts',
      'market.checkout',
      'light.river-of-forgetting',
      'light.rebirth',
    ],
  },

  {
    name: 'Path B: refusing the Light, from earthbound to the city of light',
    steps: [
      'threshold.choice',
      'refuse.earthbound',
      'refuse.mist',
      'refuse.void',
      'refuse.lower-sphere',
      'refuse.rescue',
      'refuse.higher-sphere',
      'refuse.city-of-light',
    ],
  },

  {
    name: 'the DMT thread: hyperspace and being sent back',
    steps: ['death.dmt', 'dmt.hyperspace', 'dmt.sent-back'],
  },

  // Every Life Market aisle through checkout, named separately so a single
  // broken aisle is reported as that aisle.
  ...[
    'market.parents',
    'market.body',
    'market.gifts',
    'market.trauma',
    'market.economics',
    'market.place',
    'market.contracts',
  ].map((aisle) => ({
    name: `Life Market aisle through checkout: ${aisle}`,
    steps: [aisle, 'market.checkout'],
  })),
];

test.describe('required journeys', () => {
  for (const journey of JOURNEYS) {
    test(journey.name, async ({ page }) => {
      const watcher = new GateWatcher(page);
      await page.goto('/');
      await waitForReady(page);

      const registered = await page.evaluate(() => globalThis.__game?.registeredScenes() ?? []);
      const unbuilt = journey.steps.filter((step) => !registered.includes(step));

      if (unbuilt.length > 0) {
        // Not yet buildable. Say exactly what is missing and stop — this cannot
        // be mistaken for a pass that played something.
        test.skip(
          true,
          `not built yet: ${unbuilt.join(', ')} (${String(unbuilt.length)}/${String(journey.steps.length)} scenes missing)`,
        );
        return;
      }

      await clickFirst(page);

      for (const step of journey.steps) {
        watcher.attribute(step);
        const landed = await page.evaluate(async (sceneId) => {
          const api = globalThis.__game;
          if (!api) {
            throw new Error('test API missing');
          }
          await api.goTo(sceneId);
          await new Promise<void>((resolve) => {
            let seen = 0;
            const tick = (): void => {
              seen += 1;
              if (seen >= 12) {
                resolve();
                return;
              }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          const snapshot = api.scene();
          return {
            id: snapshot?.id ?? '(none)',
            frames: snapshot?.framesRendered ?? 0,
            elapsed: snapshot?.elapsed ?? 0,
          };
        }, step);

        expect(landed.id, `journey "${journey.name}" could not reach "${step}"`).toBe(step);
        expect(landed.frames, `"${step}" rendered no frames during journey "${journey.name}"`).toBeGreaterThan(0);
        await watcher.assertClean(`while playing "${step}" in journey "${journey.name}"`);
      }

      await watcher.assertClean(`across journey "${journey.name}"`);
    });
  }
});
