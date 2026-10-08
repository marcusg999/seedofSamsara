import { test, expect } from '@playwright/test';
import { GateWatcher, waitForReady, clickFirst } from './harness';

/**
 * Every scene offers the player a way out — not just declares one.
 *
 * `playthrough.spec.ts` asserts that each scene declares a reachable exit, and
 * keeps doing so. This is the other half, and it exists because the declared
 * half is structurally blind to the softlock this codebase keeps shipping: a
 * scene can declare `onward`, register nothing, mount no button, and pass.
 * It has happened four times — `light.life-review`, `light.council`,
 * `light.river-of-forgetting`, and the corridor that waited on an answer nobody
 * gave — and every one was found by a player getting stuck.
 *
 * So this walks each scene's authored timeline with `advanceBeat()` and asks the
 * exit-offer registry (`src/game/systems/exit-offers.ts`) what is actually in
 * front of the player: a mounted control bound to an exit, or a timed release
 * the scene has scheduled. Where the scene is waiting on a question instead, the
 * walk answers it, because a question the player can clear is a step toward the
 * way out and not a way out — and then asks again.
 *
 * It fails in four distinguishable ways, each naming the scene:
 *  - it never offered anything (the softlock the declared check cannot see);
 *  - it offers an exit whose target scene is not registered, so the click would
 *    throw `Unknown scene` out of `graph.get` and end the run;
 *  - it offers an exit its own definition does not declare;
 *  - it left the player's scene by a door that was never offered at all.
 */

/**
 * Buttons that are answers rather than doors: the widgets tag an exit-bound
 * control with `data-exit`, so everything without it is something the player
 * can clear without leaving.
 */
const ANSWER_SELECTOR = '.overlay .overlay__button:not([data-exit]), .prompt .overlay__button:not([data-exit])';

/**
 * How many times the walk will advance a beat or answer a question before
 * calling a scene stuck. The longest authored timeline here is ten beats and the
 * deepest question queue is four, so this is roughly double the worst case —
 * loose on purpose, because a scene that needs more than this to put a way out
 * on screen is the thing being tested for.
 */
const MAX_STEPS = 24;

/** Frames to let run after each step, so a cue in `update` actually fires. */
const FRAMES_PER_STEP = 2;

test.describe('offered exits', () => {
  test('every scene puts a way out in front of the player, not just in its definition', async ({ page }) => {
    // One walk per registered scene, each building the scene and running frames
    // on a software renderer in CI. The per-test default is sized for one
    // scene's softlock window, not for a walk across all of them; the softlock
    // guarantee itself is asserted per scene, against each scene's own clock,
    // in playthrough.spec.ts and is untouched by this budget.
    test.setTimeout(420_000);
    const watcher = new GateWatcher(page);
    await page.goto('/');
    await waitForReady(page);
    // Browsers block audio until a user gesture, and a scene whose audio throws
    // would fail this test for an unrelated reason (CLAUDE.md § Gotchas).
    await clickFirst(page);

    const registered = await page.evaluate(() => globalThis.__game?.registeredScenes() ?? []);
    expect(registered.length, 'no scenes are registered; there is nothing to check').toBeGreaterThan(0);

    for (const sceneId of registered) {
      watcher.attribute(sceneId);

      const walk = await page.evaluate(
        async ([id, maxSteps, framesPerStep, answerSelector]) => {
          const api = globalThis.__game;
          if (!api) {
            throw new Error('test API missing');
          }
          const frames = async (count: number): Promise<void> => {
            await new Promise<void>((resolve) => {
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
            });
          };

          await api.goTo(id);
          await frames(framesPerStep);
          const entered = api.scene();
          if (!entered) {
            throw new Error(`no scene loaded after goTo("${id}")`);
          }
          const departuresBefore = api.exitDepartures().length;
          const trace: string[] = [];
          let outcome: 'offered' | 'left-by-offer' | 'left-off-registry' | 'none' = 'none';
          let landedOn: string | undefined;

          for (let step = 0; step < maxSteps; step += 1) {
            const snapshot = api.scene();
            if (!snapshot) {
              throw new Error(`scene "${id}" unloaded mid-walk`);
            }
            if (snapshot.id !== id) {
              // The scene let go by itself. That is a way out, as long as it
              // went through something the registry was offering.
              landedOn = snapshot.id;
              outcome = api.exitDepartures().length > departuresBefore ? 'left-by-offer' : 'left-off-registry';
              trace.push(`left for "${snapshot.id}"`);
              break;
            }

            const live = api.offeredExits();
            if (live.length > 0) {
              outcome = 'offered';
              trace.push(`offered ${String(live.length)}`);
              break;
            }

            // Nothing offered yet. Play the authored timeline first: most scenes
            // put their way out up at a named beat near the end.
            const beat = api.beat();
            if (beat && !beat.finished) {
              trace.push(`advanced past beat "${beat.id}"`);
              api.advanceBeat();
              await frames(framesPerStep);
              continue;
            }

            // The timeline is done. If the scene is waiting on a question, the
            // player's move is to answer it, so the walk answers it.
            const answer = document.querySelector<HTMLButtonElement>(answerSelector);
            if (answer) {
              trace.push(`answered "${answer.textContent}"`);
              answer.click();
              await frames(framesPerStep);
              continue;
            }

            trace.push('no beat left to play, and nothing on screen to answer');
            break;
          }

          const snapshot = api.scene();
          return {
            declared: entered.exits.map((exit) => exit.id),
            terminal: entered.terminal,
            beat: api.beat()?.id,
            outcome,
            landedOn,
            trace,
            offers: api.offeredExits().map((offer) => ({ ...offer })),
            stillHere: snapshot?.id === id,
          };
        },
        [sceneId, MAX_STEPS, FRAMES_PER_STEP, ANSWER_SELECTOR] as const,
      );

      const where = `after: ${walk.trace.join('; ') || '(nothing happened)'}`;

      if (walk.terminal) {
        // A terminal state ends the run; there is nothing to offer.
        expect(
          walk.offers,
          `Scene "${sceneId}" is terminal but is offering exits: ${walk.offers.map((offer) => offer.exitId).join(', ')}.`,
        ).toEqual([]);
        continue;
      }

      expect(
        walk.outcome,
        `Scene "${sceneId}" declares exits [${walk.declared.join(', ')}] but never offered the player one — `
          + 'no control bound to an exit, and no timed release scheduled. '
          + `The walk played the whole authored timeline (${where}) and the scene was still holding the player `
          + `on beat "${String(walk.beat)}". Declaring an exit is not offering one: a player who reaches this `
          + 'scene stays in it. Offer it through systems/exit-offers.ts — a ThresholdPrompt, an Overlay action '
          + "with `exit`, or a registered timed release — rather than widening this check.",
      ).not.toBe('none');

      expect(
        walk.outcome,
        `Scene "${sceneId}" left for "${String(walk.landedOn)}" by a door nothing offered: no exit was taken `
          + 'through the offer registry, so something called `takeExit` or `goTo` behind its back '
          + `(${where}). Neither the snapshot nor this check can see how that scene is left, which is how a `
          + 'conditional version of the same code becomes an unfindable softlock.',
      ).not.toBe('left-off-registry');

      for (const offer of walk.offers) {
        // The hole that is not a softlock: a control the player can click whose
        // target does not exist. `graph.get` throws `Unknown scene`, the
        // transition rejects, and the run is over.
        expect(
          offer.declared,
          `Scene "${sceneId}" offers exit "${offer.exitId}" ("${offer.label}"), which its own definition does not `
            + `declare. Declared: [${walk.declared.join(', ')}].`,
        ).toBe(true);
        expect(
          offer.targetRegistered,
          `Scene "${sceneId}" offers exit "${offer.exitId}" whose target "${String(offer.to)}" is not registered. `
            + 'Clicking it throws "Unknown scene" out of graph.get and ends the run. Either build and register '
            + 'the target, or do not offer the exit — a door onto nothing is worse than a locked one.',
        ).toBe(true);
        expect(
          offer.mounted,
          `Scene "${sceneId}" offers exit "${offer.exitId}" through a control the player cannot click: `
            + `box ${JSON.stringify(offer.box)}, owner "${offer.owner}". An offer is a button in the document `
            + 'with a real box, not an intention to add one.',
        ).toBe(true);
      }

      await watcher.assertClean(`while walking scene "${sceneId}" for an offered exit`);
    }

    await watcher.assertClean('across the offered-exit walk');
  });
});
