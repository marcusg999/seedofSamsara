import { defineConfig } from 'vite';

// The test API on `window.__game` must exist in dev and test builds only
// (CLAUDE.md § Testability). `GATE_BUILD=1` produces a production build that
// still carries it, which is what the gate's Playwright playthrough drives.
const exposeTestApi = process.env.GATE_BUILD === '1';

export default defineConfig(({ command }) => ({
  base: './',
  define: {
    __TEST_API__: JSON.stringify(command === 'serve' || exposeTestApi),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // A silent chunk-size warning is noise in gate output; the budget that
    // matters is frame time, measured in the playthrough.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
}));
