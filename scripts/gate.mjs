#!/usr/bin/env node
/**
 * The error gate (CLAUDE.md § The error gate).
 *
 * Runs, in order: typecheck, lint, production build, then the Playwright
 * playthrough in headless Chromium. Stops at the first failure, because a
 * failing typecheck makes every later result meaningless.
 *
 * Never weaken this to make it pass. If a test is wrong, fix the test and say
 * why in the commit message.
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import process from 'node:process';

const STEPS = [
  {
    name: 'typecheck',
    detail: 'TypeScript, strict mode',
    command: 'npx',
    args: ['tsc', '--noEmit', '-p', 'tsconfig.json'],
  },
  {
    name: 'lint',
    detail: 'ESLint, type-aware',
    command: 'npx',
    args: ['eslint', '.'],
  },
  {
    name: 'build',
    detail: 'production build with the test API compiled in',
    command: 'npx',
    args: ['vite', 'build'],
    // The playthrough has to drive a real production build, so the build it
    // drives keeps `window.__game`. A shipping build omits it.
    env: { GATE_BUILD: '1' },
  },
  {
    name: 'playthrough',
    detail: 'headless Chromium: every scene renders, no errors, no softlocks',
    command: 'npx',
    args: ['playwright', 'test'],
    env: { GATE_BUILD: '1' },
  },
];

function run(step) {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      env: { ...process.env, ...(step.env ?? {}), FORCE_COLOR: '1' },
      shell: process.platform === 'win32',
    });
    child.on('error', (error) => {
      console.error(`\n  could not start ${step.command}: ${error.message}`);
      resolve(1);
    });
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

function formatDuration(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${String(Math.round(ms))}ms`;
}

async function main() {
  // A stale dist would let the playthrough drive yesterday's code.
  await rm('dist', { recursive: true, force: true });

  const started = Date.now();
  const results = [];

  for (const [index, step] of STEPS.entries()) {
    const label = `[${String(index + 1)}/${String(STEPS.length)}] ${step.name}`;
    console.log(`\n── ${label} — ${step.detail}\n`);

    const stepStarted = Date.now();
    const code = await run(step);
    const elapsed = Date.now() - stepStarted;
    results.push({ name: step.name, code, elapsed });

    if (code !== 0) {
      console.error(`\n✖ gate failed at ${step.name} after ${formatDuration(elapsed)}.`);
      console.error('  Fix the cause. Do not weaken the gate to get past it.\n');
      summarise(results, started);
      process.exit(code);
    }
  }

  console.log('\n✔ gate passed.\n');
  summarise(results, started);
}

function summarise(results, started) {
  const rows = results.map(
    (result) =>
      `  ${result.code === 0 ? '✔' : '✖'} ${result.name.padEnd(12)} ${formatDuration(result.elapsed).padStart(7)}`,
  );
  const skipped = STEPS.slice(results.length).map((step) => `  · ${step.name.padEnd(12)}  skipped`);
  console.log([...rows, ...skipped].join('\n'));
  console.log(`\n  total ${formatDuration(Date.now() - started)}\n`);
}

await main();
