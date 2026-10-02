import { test, expect } from '@playwright/test';
import { GateWatcher, waitForReady } from './harness';

/**
 * Static checks on the state machine, run before anything is driven. A softlock
 * that can be proved by inspection should never cost a playthrough to find.
 */
test.describe('scene graph', () => {
  test('is internally consistent and free of declared softlocks', async ({ page }) => {
    const watcher = new GateWatcher(page);
    await page.goto('/');
    await waitForReady(page);

    const issues = await page.evaluate(() => globalThis.__game?.graphIssues() ?? []);
    const blocking = issues.filter((issue) => issue.blocking);

    expect(
      blocking,
      `The scene graph has blocking issues:\n${blocking
        .map((issue) => `  - [${issue.kind}] ${issue.sceneId}: ${issue.detail}`)
        .join('\n')}`,
    ).toEqual([]);

    await watcher.assertClean('while loading the page and validating the graph');
  });

  test('every registered scene declares a reachable exit or is terminal', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    const scenes = await page.evaluate(async () => {
      const api = globalThis.__game;
      if (!api) {
        throw new Error('test API missing: the gate must run a build with __TEST_API__ enabled');
      }
      const registered = api.registeredScenes();
      const described: {
        id: string;
        terminal: boolean;
        exits: { id: string; to: string | null; reachable: boolean }[];
      }[] = [];

      for (const id of registered) {
        await api.goTo(id);
        const snapshot = api.scene();
        if (!snapshot) {
          throw new Error(`goTo("${id}") left no scene loaded`);
        }
        described.push({
          id: snapshot.id,
          terminal: snapshot.terminal,
          exits: snapshot.exits.map((exit) => ({
            id: exit.id,
            to: exit.to,
            reachable: exit.to !== null && registered.includes(exit.to),
          })),
        });
      }
      return described;
    });

    for (const scene of scenes) {
      const reachable = scene.exits.filter((exit) => exit.reachable);
      expect(
        scene.terminal || reachable.length > 0,
        `Scene "${scene.id}" has no reachable exit and is not terminal — a player who arrives here is stuck. ` +
          `Declared exits: ${scene.exits.map((exit) => `${exit.id}->${String(exit.to)}`).join(', ') || '(none)'}`,
      ).toBe(true);
    }
  });

  test('reports build coverage against the manifest', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    const { manifest, registered } = await page.evaluate(() => {
      const api = globalThis.__game;
      if (!api) {
        throw new Error('test API missing');
      }
      return {
        manifest: api.manifest().map((entry) => ({ id: entry.id, act: entry.act, status: entry.status })),
        registered: api.registeredScenes(),
      };
    });

    // A manifest entry claiming to be implemented must actually be registered.
    // This is the hinge that stops the gate being satisfied by omission: the
    // checks below only bind to `implemented` scenes, so a false claim here
    // would let a broken scene through.
    const claimed = manifest.filter((entry) => entry.status === 'implemented').map((entry) => entry.id);
    const missing = claimed.filter((id) => !registered.includes(id));
    expect(
      missing,
      `The manifest marks these scenes implemented, but they are not registered: ${missing.join(', ')}`,
    ).toEqual([]);

    // A registered scene that the manifest still calls planned is also a lie,
    // in the other direction: it would escape enforcement.
    const unclaimed = registered.filter((id) => !claimed.includes(id));
    expect(
      unclaimed,
      `These scenes are registered but the manifest still calls them planned, so the gate would not enforce them: ${unclaimed.join(', ')}`,
    ).toEqual([]);

    const planned = manifest.filter((entry) => entry.status === 'planned');
    const byAct = new Map<string, { built: number; total: number }>();
    for (const entry of manifest) {
      const row = byAct.get(entry.act) ?? { built: 0, total: 0 };
      row.total += 1;
      if (entry.status === 'implemented') {
        row.built += 1;
      }
      byAct.set(entry.act, row);
    }

    const lines = [...byAct.entries()]
      .map(([act, row]) => `    ${act.padEnd(12)} ${String(row.built)}/${String(row.total)}`)
      .join('\n');

    // Progress, not a verdict: the gate enforces what is built and prints what
    // is left, so the remaining work is visible on every run.
    console.log(
      `\n  Scene coverage: ${String(manifest.length - planned.length)}/${String(manifest.length)} built\n${lines}\n`,
    );
  });
});
