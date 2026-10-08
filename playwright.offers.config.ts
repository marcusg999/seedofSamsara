// Temporary: runs ONLY offers.spec.ts, on a port that is not the gate's 4173.
import { defineConfig, devices } from '@playwright/test';

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
  testMatch: /offers\.spec\.ts/,
  timeout: 600_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4201',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium-offers',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions: { args: GPU_FLAGS } },
    },
  ],
  webServer: {
    command: 'npx vite preview --port 4201 --strictPort',
    url: 'http://127.0.0.1:4201',
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
