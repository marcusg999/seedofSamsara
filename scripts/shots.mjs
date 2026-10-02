#!/usr/bin/env node
/**
 * Capture a frame from each scene at a chosen beat, for review.
 *
 * Not part of the gate — this is the builder looking at the work, and the raw
 * material a critic reviews. Beats are named rather than timed, so a shot is of
 * the moment it claims to be of.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';

const OUT = '.gate/shots';
const BASE = process.env.SHOT_URL ?? 'http://127.0.0.1:4173';

/** scene id -> beats to capture (or `null` for scenes with no timeline). */
const PLAN = [
  ['content-notes', null],
  ['vignette-select', null],
  ['death.heart-attack', ['settle', 'second-cup', 'wrong', 'going-down', 'stillness']],
  ['threshold.pronounced-dead', ['voices', 'apart']],
  ['threshold.buzzing', ['rising', 'everything']],
  ['threshold.out-of-body', ['above', 'looking-down', 'rising', 'away']],
  ['threshold.tunnel', ['enter', 'moving', 'opening']],
  ['threshold.loved-ones', ['glow', 'resolving', 'recognition']],
  ['threshold.being-of-light', ['approach', 'inside-it', 'held']],
  ['threshold.border', ['arrive', 'the-limit']],
  ['threshold.choice', null],
  ['light.life-review', ['his-side', 'her-side', 'felt', 'carried']],
];

const GPU_FLAGS = [
  '--use-gl=angle', '--use-angle=gl', '--enable-gpu',
  '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
];

async function settleFrames(page, frames) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let seen = 0;
        const tick = () => {
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

/** SHOT_ONLY=threshold.being-of-light limits capture while iterating on a scene. */
const ONLY = (process.env.SHOT_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: GPU_FLAGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => { problems.push(String(e)); });

  await page.goto(BASE);
  await page.waitForFunction(() => globalThis.__game?.ready() === true, undefined, { timeout: 30000 });
  // Gesture first, so audio is live and the scenes behave as they will for a player.
  await page.locator('#stage').click({ position: { x: 8, y: 8 }, force: true });

  let shot = 0;
  for (const [sceneId, beats] of PLAN.filter(([id]) => ONLY.length === 0 || ONLY.includes(id))) {
    await page.evaluate((id) => globalThis.__game.goTo(id), sceneId);
    await settleFrames(page, 30);

    if (beats === null) {
      shot += 1;
      const name = `${String(shot).padStart(2, '0')}-${sceneId.replace(/\./g, '_')}.png`;
      await page.screenshot({ path: `${OUT}/${name}` });
      console.log(name);
      continue;
    }

    for (const beat of beats) {
      // Advance until the named beat is live, then let it breathe a little.
      const reached = await page.evaluate(
        async (wanted) => {
          const api = globalThis.__game;
          for (let guard = 0; guard < 24; guard += 1) {
            const current = api.beat();
            if (!current) return false;
            if (current.id === wanted) return true;
            api.advanceBeat();
            await new Promise((r) => { requestAnimationFrame(() => { r(undefined); }); });
          }
          return false;
        },
        beat,
      );
      if (!reached) {
        console.warn(`  could not reach beat "${beat}" in ${sceneId}`);
        continue;
      }
      // Let the beat run to roughly its middle so the frame shows the beat
      // rather than its first instant.
      await page.waitForTimeout(2600);
      await settleFrames(page, 20);
      shot += 1;
      const name = `${String(shot).padStart(2, '0')}-${sceneId.replace(/\./g, '_')}-${beat}.png`;
      await page.screenshot({ path: `${OUT}/${name}` });
      console.log(name);
    }
  }

  await browser.close();
  if (problems.length > 0) {
    console.error(`\n${String(problems.length)} console problem(s) during capture:`);
    for (const p of problems.slice(0, 10)) console.error('  ' + p);
    process.exit(1);
  }
  console.log(`\n${String(shot)} shots in ${OUT}\n`);
}

await main();
