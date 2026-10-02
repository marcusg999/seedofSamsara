import { test, expect } from '@playwright/test';
import { GateWatcher, waitForReady, clickFirst } from './harness';

/**
 * Requirements that come from GAME_BRIEF.md rather than from CLAUDE.md's error
 * rules, asserted so they cannot quietly regress.
 *
 * These are cheap to state and easy to lose: a system that is wired but never
 * written to looks identical to one that works, right up until someone reads the
 * ledger and finds it empty. Each test below names the line of the brief it
 * enforces.
 */
test.describe('the brief', () => {
  test('the death sets the starting state of the afterlife', async ({ page }) => {
    const watcher = new GateWatcher(page);
    await page.goto('/');
    await waitForReady(page);
    await clickFirst(page);

    // GAME_BRIEF.md § Act 1: "Each death sets the starting state of the
    // afterlife: violent, unjust deaths begin with heavy attachment (rage, fear,
    // unfinished business); peaceful deaths begin light."
    const handover = await page.evaluate(async () => {
      const api = globalThis.__game;
      if (!api) {
        throw new Error('test API missing');
      }
      await api.goTo('death.heart-attack');
      const before = api.attachment();

      // Run the vignette to its end rather than waiting out three minutes.
      for (let guard = 0; guard < 40; guard += 1) {
        const beat = api.beat();
        if (!beat || beat.id === 'after') {
          break;
        }
        api.advanceBeat();
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }
      // Let the final beat actually run, since the handover happens in update.
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

      return { before, after: api.attachment(), will: api.will(), beat: api.beat()?.id };
    });

    expect(
      handover.after,
      `The heart-attack vignette ended on beat "${String(handover.beat)}" without setting the ` +
        'attachment the afterlife starts from. GAME_BRIEF.md § Act 1 requires the death to set it.',
    ).toBeGreaterThan(0);
    expect(
      handover.will,
      'A soul arriving with attachment should arrive with less will to spend.',
    ).toBeLessThan(1);

    await watcher.assertClean('while playing the vignette to its handover');
  });

  test('the life review moves karma, measured as effect on another person', async ({ page }) => {
    const watcher = new GateWatcher(page);
    await page.goto('/');
    await waitForReady(page);
    await clickFirst(page);

    // GAME_BRIEF.md § Systems: "KARMA: the player's personal ledger, measured by
    // effect on others as felt in the review, not by a good/evil meter."
    const review = await page.evaluate(async () => {
      const api = globalThis.__game;
      if (!api) {
        throw new Error('test API missing');
      }
      await api.goTo('light.life-review');
      const before = { karma: api.karma(), harmony: api.harmony(), shards: api.shards().length };

      for (let guard = 0; guard < 40; guard += 1) {
        const beat = api.beat();
        if (!beat || beat.id === 'wait') {
          break;
        }
        api.advanceBeat();
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }
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

      return { before, karma: api.karma(), harmony: api.harmony(), shards: api.shards().length };
    });

    expect(
      review.karma,
      'The life review is the moral engine and must enter something in the karma ledger.',
    ).not.toBe(review.before.karma);
    expect(
      review.harmony,
      'Harmony rises because the moment was faced rather than passed over.',
    ).toBeGreaterThan(review.before.harmony);
    expect(review.shards, 'The review should leave a memory shard behind.').toBeGreaterThan(
      review.before.shards,
    );

    await watcher.assertClean('while playing the life review');
  });

  test('the spirit body carries the soul’s state once the player is out of the body', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);
    await clickFirst(page);

    // GAME_BRIEF.md § Platform and art direction: "The player's spirit body is
    // emissive; its brightness and color reflect karma, so the world shows the
    // soul's state."
    const states = await page.evaluate(async () => {
      const api = globalThis.__game;
      if (!api) {
        throw new Error('test API missing');
      }
      const settle = async (): Promise<void> => {
        await new Promise<void>((resolve) => {
          let seen = 0;
          const tick = (): void => {
            seen += 1;
            if (seen >= 6) {
              resolve();
              return;
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      };

      await api.goTo('death.heart-attack');
      await settle();
      const alive = api.discarnate();

      await api.goTo('threshold.tunnel');
      await settle();
      const dead = api.discarnate();
      const neutral = { ...api.spiritBody() };

      // Drive the ledger and read the body again: the appearance has to follow.
      await api.goTo('light.life-review');
      await settle();
      for (let guard = 0; guard < 40; guard += 1) {
        const beat = api.beat();
        if (!beat || beat.id === 'wait') {
          break;
        }
        api.advanceBeat();
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }
      await settle();
      return { alive, dead, neutral, afterReview: { ...api.spiritBody() }, karma: api.karma() };
    });

    expect(states.alive, 'The player is still in their body during the vignette.').toBe(false);
    expect(states.dead, 'The player is out of their body by the tunnel.').toBe(true);
    expect(
      states.karma,
      'This check needs the review to have moved karma; it did not.',
    ).not.toBe(0);
    expect(
      states.afterReview,
      'The spirit body must reflect karma. It read identically before and after the ledger moved, ' +
        'so it is showing nothing about the soul’s state.',
    ).not.toEqual(states.neutral);
  });

  test('the loop closes: a life ends, and something outlives it', async ({ page }) => {
    const watcher = new GateWatcher(page);
    await page.goto('/');
    await waitForReady(page);
    await clickFirst(page);

    // GAME_BRIEF.md § Systems: "each run is a life. Wisdom and unlocked memories
    // persist across runs; specifics fade." And § The Life Market: the cart's
    // contents become the opening conditions of the next run.
    //
    // This is the mechanic the game is named for. Before the river and rebirth
    // existed, nothing in this game outlived a run, so this test could not have
    // passed on any earlier commit.
    const loop = await page.evaluate(async () => {
      const api = globalThis.__game;
      if (!api) {
        throw new Error('test API missing');
      }
      const frame = async (): Promise<void> => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      };
      const playOut = async (): Promise<void> => {
        for (let guard = 0; guard < 40; guard += 1) {
          const beat = api.beat();
          if (!beat || beat.id === 'wait') {
            break;
          }
          api.advanceBeat();
          await frame();
        }
        for (let i = 0; i < 8; i += 1) {
          await frame();
        }
      };

      api.forgetAllLives();
      const before = api.incarnation();

      // Earn something worth carrying.
      await api.goTo('light.life-review');
      await playOut();

      // Take a lesson, choosing by what is actually takeable rather than by
      // position — an unaffordable first item would otherwise make this test
      // fail for a reason that has nothing to do with the loop.
      await api.goTo('market.trauma');
      await frame();
      let took = false;
      for (const button of [...document.querySelectorAll('.market__item')]) {
        (button as HTMLButtonElement).click();
        const act = document.querySelector<HTMLButtonElement>('.market__act');
        if (act && !act.disabled && act.textContent === 'Take it') {
          act.click();
          took = true;
          break;
        }
      }

      await api.goTo('light.river-of-forgetting');
      await playOut();
      await api.goTo('light.rebirth');
      await playOut();

      const after = api.incarnation();
      document.querySelector<HTMLButtonElement>('.market__nav .overlay__button')?.click();
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 400);
      });

      return { before, after, took, cartAfter: api.cart().length, shardsAfter: api.shards().length };
    });

    expect(loop.took, 'could not take any lesson from the Trauma aisle').toBe(true);
    expect(
      loop.after.lives,
      'Rebirth did not record that a life had ended, so nothing counts the loop.',
    ).toBeGreaterThan(loop.before.lives);
    expect(
      loop.after.wisdom.length,
      'Nothing survived the river. Wisdom is supposed to persist across runs.',
    ).toBeGreaterThan(0);
    expect(
      loop.after.birthmark,
      'A death wound should carry over as the next body\u2019s birthmark (lore bible L-PAST-02).',
    ).toBeDefined();
    expect(
      loop.cartAfter,
      'The cart should be empty in the next life: the particulars do not come with you.',
    ).toBe(0);
    expect(
      loop.shardsAfter,
      'Memory shards persist across runs, so the next life should start carrying them.',
    ).toBeGreaterThan(0);

    await watcher.assertClean('while closing the loop');
  });
});
