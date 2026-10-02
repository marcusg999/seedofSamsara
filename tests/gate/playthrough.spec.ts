import { test, expect } from '@playwright/test';
import { GateWatcher, waitForReady, clickFirst } from './harness';

/**
 * The playthrough (CLAUDE.md § The error gate).
 *
 * Every scene renders at least once, so every shader actually compiles; no
 * scene sits without a reachable exit; nothing leaks across a scene unload; and
 * no console error, uncaught exception, unhandled rejection, WebGL warning or
 * shader error survives the run.
 */

/** 60fps. Only judged on a real GPU — see the budget test. */
const FRAME_BUDGET_MS = 16.7;

/** CLAUDE.md defines a softlock as 60s in a scene without a reachable exit. */
const SOFTLOCK_LIMIT_SECONDS = 60;

/** Long enough for a scene to settle and for a stalled loop to show up. */
const FRAMES_PER_SCENE = 20;

test.describe('playthrough', () => {
  test('renders every registered scene, drives its exits, and frees its resources', async ({ page }) => {
    const watcher = new GateWatcher(page);
    await page.goto('/');
    await waitForReady(page);
    // The gate clicks first, so an audio context started on the first gesture
    // is already live for everything that follows.
    await clickFirst(page);

    const registered = await page.evaluate(() => globalThis.__game?.registeredScenes() ?? []);
    expect(registered.length, 'no scenes are registered; the gate has nothing to render').toBeGreaterThan(0);

    for (const sceneId of registered) {
      watcher.attribute(sceneId);

      const visit = await page.evaluate(
        async ([id, framesWanted]) => {
          const api = globalThis.__game;
          if (!api) {
            throw new Error('test API missing');
          }
          const disposalsBefore = api.disposalLog().length;
          const startedAt = performance.now();
          await api.goTo(id);

          // Let the scene actually run frames: a shader that fails to compile
          // only reveals itself once something is drawn with it.
          await new Promise<void>((resolve) => {
            let seen = 0;
            const tick = (): void => {
              seen += 1;
              if (seen >= framesWanted) {
                resolve();
                return;
              }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });

          const snapshot = api.scene();
          if (!snapshot) {
            throw new Error(`no scene loaded after goTo("${id}")`);
          }
          const registeredIds = api.registeredScenes();
          return {
            id: snapshot.id,
            title: snapshot.title,
            terminal: snapshot.terminal,
            framesRendered: snapshot.framesRendered,
            loadSeconds: (performance.now() - startedAt) / 1000,
            exits: snapshot.exits.map((exit) => ({
              id: exit.id,
              to: exit.to,
              reachable: exit.to !== null && registeredIds.includes(exit.to),
            })),
            disposalsBefore,
            disposalsAfter: api.disposalLog().length,
            liveResources: snapshot.liveResources,
          };
        },
        [sceneId, FRAMES_PER_SCENE] as const,
      );

      expect(visit.id, `goTo("${sceneId}") landed on "${visit.id}"`).toBe(sceneId);
      expect(
        visit.framesRendered,
        `Scene "${sceneId}" rendered no frames, so its shaders never compiled on the GPU.`,
      ).toBeGreaterThan(0);
      expect(
        visit.loadSeconds,
        `Scene "${sceneId}" took ${visit.loadSeconds.toFixed(1)}s to become playable, past the ${String(SOFTLOCK_LIMIT_SECONDS)}s softlock limit.`,
      ).toBeLessThan(SOFTLOCK_LIMIT_SECONDS);

      const reachable = visit.exits.filter((exit) => exit.reachable);
      expect(
        visit.terminal || reachable.length > 0,
        `Scene "${sceneId}" offers no reachable exit and is not terminal — softlock.`,
      ).toBe(true);

      // Leaving the previous scene must have released that scene's resources.
      expect(
        visit.disposalsAfter,
        `Leaving the scene before "${sceneId}" did not run a disposal sweep.`,
      ).toBeGreaterThan(visit.disposalsBefore);

      // Every reachable exit must actually move the player.
      for (const exit of reachable) {
        const landed = await page.evaluate(
          async ([from, exitId]) => {
            const api = globalThis.__game;
            if (!api) {
              throw new Error('test API missing');
            }
            await api.goTo(from);
            await api.takeExit(exitId);
            return api.scene()?.id ?? '(none)';
          },
          [sceneId, exit.id] as const,
        );
        expect(
          landed,
          `Exit "${exit.id}" of scene "${sceneId}" declares it leads to "${String(exit.to)}" but landed on "${landed}".`,
        ).toBe(exit.to);
      }

      await watcher.assertClean(`while playing scene "${sceneId}" (${visit.title})`);
    }

    // One final sweep, including anything the page trapped but never logged.
    await watcher.assertClean('across the whole playthrough');
  });

  test('keeps frame time within budget', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    const { perf, renderer } = await page.evaluate(async () => {
      const api = globalThis.__game;
      if (!api) {
        throw new Error('test API missing');
      }
      await new Promise<void>((resolve) => {
        let seen = 0;
        const tick = (): void => {
          seen += 1;
          if (seen >= 120) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { perf: api.perf(), renderer: api.renderer() };
    });

    expect(perf.samples, 'no frames were measured').toBeGreaterThan(30);

    if (renderer.software) {
      // Headless Chromium may fall back to software WebGL, and software frame
      // times are not real performance (CLAUDE.md § Gotchas). Report, do not
      // judge — asserting here would train everyone to ignore the number.
      console.log(
        `\n  Frame time (SOFTWARE renderer "${renderer.description}" — not a performance signal):` +
          ` mean ${perf.meanMs.toFixed(2)}ms, p95 ${perf.p95Ms.toFixed(2)}ms, worst ${perf.worstMs.toFixed(2)}ms\n`,
      );
      return;
    }

    console.log(
      `\n  Frame time on "${renderer.description}": mean ${perf.meanMs.toFixed(2)}ms,` +
        ` p95 ${perf.p95Ms.toFixed(2)}ms, worst ${perf.worstMs.toFixed(2)}ms\n`,
    );
    expect(
      perf.p95Ms,
      `p95 frame time ${perf.p95Ms.toFixed(2)}ms exceeds the ${String(FRAME_BUDGET_MS)}ms budget on ${renderer.description}.`,
    ).toBeLessThanOrEqual(FRAME_BUDGET_MS);
  });

  test('survives a lost and restored WebGL context', async ({ page }) => {
    const watcher = new GateWatcher(page);
    await page.goto('/');
    await waitForReady(page);

    const events = await page.evaluate(async () => {
      const canvas = document.querySelector<HTMLCanvasElement>('#stage');
      if (!canvas) {
        throw new Error('canvas missing');
      }
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const lose = gl?.getExtension('WEBGL_lose_context');
      if (!lose) {
        return { supported: false, lost: 0, restored: 0 };
      }
      lose.loseContext();
      await new Promise((resolve) => setTimeout(resolve, 150));
      lose.restoreContext();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const api = globalThis.__game;
      return { supported: true, ...(api?.contextEvents() ?? { lost: 0, restored: 0 }) };
    });

    if (!events.supported) {
      console.log('\n  WEBGL_lose_context unavailable; context-loss handling not exercised this run.\n');
      return;
    }

    expect(events.lost, 'the page did not observe webglcontextlost').toBeGreaterThan(0);
    expect(events.restored, 'the page did not observe webglcontextrestored').toBeGreaterThan(0);

    // The game must still be alive afterwards.
    const stillRunning = await page.evaluate(async () => {
      const api = globalThis.__game;
      const before = api?.scene()?.framesRendered ?? 0;
      await new Promise((resolve) => setTimeout(resolve, 250));
      return (api?.scene()?.framesRendered ?? 0) > before;
    });
    expect(stillRunning, 'the render loop did not resume after the context was restored').toBe(true);

    await watcher.assertClean('while losing and restoring the WebGL context');
  });
});
