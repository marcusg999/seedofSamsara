import { defineConfig, devices } from '@playwright/test';

/**
 * The gate's playthrough (CLAUDE.md § The error gate).
 *
 * Headless Chromium may fall back to software WebGL, so GPU flags are requested
 * and `--enable-unsafe-swiftshader` keeps WebGL alive when there is no GPU to
 * get. The playthrough then asks the page which renderer it actually got and
 * refuses to judge frame time on a software rasteriser.
 */
const GPU_FLAGS = [
  '--use-gl=angle',
  '--use-angle=gl',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage',
];

export default defineConfig({
  testDir: './tests/gate',
  // A softlock is defined as 60s without a reachable exit, so no single test may
  // be allowed to pass by hanging: the timeout sits just above that window.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: process.env.CI === 'true' ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-gate',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: { args: GPU_FLAGS },
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
