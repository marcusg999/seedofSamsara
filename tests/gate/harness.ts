import type { ConsoleMessage, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * The gate's failure conditions, in one place (CLAUDE.md § The error gate):
 * any console error, uncaught exception, unhandled promise rejection, WebGL
 * warning, or shader compile error fails the run.
 *
 * Everything collected here is attributed and reported in full on failure —
 * a gate that says only "it failed" costs a debugging cycle.
 */

export interface CollectedProblem {
  readonly kind:
    | 'console-error'
    | 'webgl-warning'
    | 'shader-error'
    | 'page-error'
    | 'unhandled-rejection';
  readonly text: string;
  readonly sceneId: string;
}

/** Warnings that are the browser describing a WebGL problem, not app noise. */
const WEBGL_WARNING_PATTERNS = [
  /\bWebGL\b/i,
  /\bGL_INVALID/i,
  /\bGL ERROR\b/i,
  /\bINVALID_OPERATION\b/,
  /\bINVALID_ENUM\b/,
  /\bINVALID_VALUE\b/,
  /\bGL_OUT_OF_MEMORY\b/,
  /performance warning/i,
  /texture is not? ?(?:power|complete)/i,
  /framebuffer (?:is )?incomplete/i,
];

/** Three.js reports shader trouble through these. */
const SHADER_ERROR_PATTERNS = [
  /THREE\.WebGLProgram/i,
  /shader\s*error/i,
  /ERROR:\s*0:\d+/,
  /failed to (?:compile|link)/i,
  /Program Info Log/i,
];

/**
 * Chromium emits these in headless containers regardless of the page. They are
 * properties of the harness, not of the game, so the gate would fail on every
 * run if they counted — and a gate that always fails gets ignored.
 *
 * Keep this list short and specific. Never add an app-produced message to it:
 * that is weakening the gate, which CLAUDE.md forbids. Anything genuinely
 * caused by our code must be fixed in the code.
 */
const HOST_NOISE_PATTERNS = [
  /Automatic fallback to software WebGL has been deprecated/i,
  /GroupMarkerNotSet/i,
  /dbus|DBUS_SESSION/i,
  /Failed to connect to the bus/i,
  /Fontconfig (?:error|warning)/i,
  /gpu_memory_buffer_support_x11/i,
  /viz_main_impl|gl_display|gl_surface_presentation_helper/i,
  /Failed to load resource: net::ERR_(?:FAILED|BLOCKED)/i,
  /\[DOM\] Found 2 elements with non-unique id/i,
  /Download the (?:React|Vue) DevTools/i,
  // Headless Chromium composites the WebGL canvas by reading its framebuffer
  // back, and the GL driver reports that readback as a performance stall.
  //
  // Verified to be the host and not this game: a page containing nothing but a
  // canvas, `gl.clearColor` and `gl.clear` — no three.js, none of our code —
  // emits this exact message four times per run in this container. It says
  // nothing about our GL usage, so it cannot be allowed to fail every gate run.
  //
  // Scoped deliberately to the driver's Performance category and the ReadPixels
  // stall. Any other GL Driver Message, and every other WebGL warning, still
  // fails the gate.
  /GL Driver Message \(OpenGL, Performance,[^)]*\): GPU stall due to ReadPixels/,
];

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function isHostNoise(text: string): boolean {
  return matchesAny(text, HOST_NOISE_PATTERNS);
}

export class GateWatcher {
  readonly problems: CollectedProblem[] = [];
  private sceneId = '(boot)';

  constructor(private readonly page: Page) {
    page.on('console', (message) => {
      this.onConsole(message);
    });
    page.on('pageerror', (error) => {
      this.problems.push({
        kind: 'page-error',
        text: `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim(),
        sceneId: this.sceneId,
      });
    });
  }

  /** Attribute everything collected from now on to this scene. */
  attribute(sceneId: string): void {
    this.sceneId = sceneId;
  }

  private onConsole(message: ConsoleMessage): void {
    const text = message.text();
    if (isHostNoise(text)) {
      return;
    }
    const type = message.type();

    if (matchesAny(text, SHADER_ERROR_PATTERNS)) {
      this.problems.push({ kind: 'shader-error', text, sceneId: this.sceneId });
      return;
    }
    if (type === 'error') {
      this.problems.push({ kind: 'console-error', text, sceneId: this.sceneId });
      return;
    }
    if (type === 'warning' && matchesAny(text, WEBGL_WARNING_PATTERNS)) {
      this.problems.push({ kind: 'webgl-warning', text, sceneId: this.sceneId });
    }
  }

  /** Pull in everything the page itself trapped that never hit the console. */
  async drainPageErrors(): Promise<void> {
    const trapped = await this.page.evaluate(() => {
      const api = globalThis.__game;
      const fromApi = api ? [...api.errors()] : [];
      const fromGlobal = globalThis.__gateErrors ?? [];
      const merged = fromApi.length > 0 ? fromApi : fromGlobal;
      return merged.map((entry) => ({ kind: entry.kind, message: entry.message }));
    });

    for (const entry of trapped) {
      this.problems.push({
        kind: entry.kind === 'unhandled-rejection' ? 'unhandled-rejection' : 'console-error',
        text: entry.message,
        sceneId: this.sceneId,
      });
    }

    const shaderFailures = await this.page.evaluate(() => {
      const api = globalThis.__game;
      return api ? api.shaderFailures().map((failure) => ({ ...failure })) : [];
    });

    for (const failure of shaderFailures) {
      this.problems.push({
        kind: 'shader-error',
        text: `${failure.programName}: ${failure.log}`,
        sceneId: failure.sceneId,
      });
    }
  }

  report(): string {
    if (this.problems.length === 0) {
      return 'no problems collected';
    }
    return this.problems
      .map((problem, index) => `  ${String(index + 1)}. [${problem.kind}] (${problem.sceneId}) ${problem.text}`)
      .join('\n');
  }

  /** Fail the test if anything was collected. */
  async assertClean(context: string): Promise<void> {
    await this.drainPageErrors();
    expect(
      this.problems,
      `${context}\nThe gate collected ${String(this.problems.length)} problem(s):\n${this.report()}`,
    ).toEqual([]);
  }
}

/** Wait for the game to boot and render its first frame. */
export async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => globalThis.__game?.ready() === true, undefined, { timeout: 30_000 });
}

/**
 * Browsers block audio until a user gesture, so the gate clicks first
 * (CLAUDE.md § Gotchas) before any scene is driven.
 */
export async function clickFirst(page: Page): Promise<void> {
  await page.locator('#stage').click({ position: { x: 8, y: 8 }, force: true });
  await expect(page.locator('html')).toHaveAttribute('data-gestured', 'true');
}
