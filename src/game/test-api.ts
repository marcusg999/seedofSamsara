import type { Game } from './game';
import type { SceneSnapshot } from './game';
import { SCENE_MANIFEST } from './manifest';
import { SLICE_PATH } from './scenes/index';
import type { GraphIssue } from './state-machine';

/**
 * The test API, exposed on `window.__game` in dev and test builds only
 * (CLAUDE.md § Testability). A plain production build sets `__TEST_API__` to
 * false and this module's `install` is never called, so shipping builds carry
 * no jump-anywhere handle.
 */

export interface GateError {
  readonly kind: 'unhandled-rejection' | 'window-error';
  readonly message: string;
  readonly at: number;
}

export interface TestApi {
  readonly version: 1;
  readonly seed: string;
  /** Scene the player is in, with its declared exits and softlock clock. */
  scene(): SceneSnapshot | undefined;
  /** Jump anywhere. */
  goTo(sceneId: string): Promise<void>;
  /** Follow a declared exit. */
  takeExit(exitId: string): Promise<void>;
  /** Every scene the game has registered. */
  registeredScenes(): string[];
  /** The full planned scene graph with build status. */
  manifest(): typeof SCENE_MANIFEST;
  /** Static graph check: softlocks, dangling exits, unbuilt targets. */
  graphIssues(): GraphIssue[];
  karma(): number;
  harmony(): number;
  will(): number;
  attachment(): number;
  cart(): { aisle: string; id: string; label: string; karmaCost: number; locked: boolean }[];
  shards(): string[];
  /** Frame-time budget measurement. */
  perf(): { samples: number; meanMs: number; p95Ms: number; worstMs: number };
  renderer(): { description: string; software: boolean };
  /** Shader compile failures recorded by the renderer's own hook. */
  shaderFailures(): readonly { sceneId: string; programName: string; log: string }[];
  /** webglcontextlost / webglcontextrestored counts. */
  contextEvents(): { lost: number; restored: number };
  /** Resources released by each scene unload so far. */
  disposalLog(): readonly { geometries: number; materials: number; textures: number; renderTargets: number; other: number }[];
  /** Errors the page caught that never reached the console as an error. */
  errors(): readonly GateError[];
  /** True once the first scene has rendered at least one frame. */
  ready(): boolean;

  // --- the vertical slice -------------------------------------------------
  /** The scene ids of the built path, in order. */
  slicePath(): readonly string[];
  /** The authored beat the current scene is on, if it has a timeline. */
  beat(): { id: string; index: number; t: number; finished: boolean } | undefined;
  /** Skip to the end of the current beat, so the gate can play a long vignette quickly. */
  advanceBeat(): void;
  /** The caption currently on screen, or the empty string. */
  caption(): string;
  /** Audio state. Silent until the first user gesture. */
  audio(): { started: boolean; voices: string[] };
  /** Post-processing state, for the performance comparison. */
  post(): { enabled: boolean; passes: number; bloomless: boolean; samples: number };
  /** Turn the post stack off, to measure what it costs. */
  setPostEnabled(enabled: boolean): void;
  /** Camera and look state. */
  camera(): { mode: string; yaw: number; pitch: number; roll: number };
  /** True when the current scene carries the spirit body (the player is dead). */
  discarnate(): boolean;
  /** How the spirit body reads. Brightness and colour reflect karma. */
  spiritBody(): { color: number; intensity: number };
  /** Ask the render loop to measure the next frame it draws. */
  requestFrameSample(): void;
  /** What that frame actually contained. Undefined until the loop has sampled. */
  frameSample(): {
    meanLuma: number;
    stdLuma: number;
    brightFraction: number;
    clippedFraction: number;
    sampled: number;
  } | undefined;
}

declare global {
  var __game: TestApi | undefined;
  var __gateErrors: GateError[] | undefined;
}

export function installErrorTrap(): GateError[] {
  const errors: GateError[] = (globalThis.__gateErrors ??= []);

  globalThis.addEventListener('unhandledrejection', (event) => {
    errors.push({
      kind: 'unhandled-rejection',
      message: describeReason(event.reason),
      at: Date.now(),
    });
  });

  globalThis.addEventListener('error', (event) => {
    errors.push({
      kind: 'window-error',
      message: event.message || describeReason(event.error),
      at: Date.now(),
    });
  });

  return errors;
}

export function installTestApi(game: Game, errors: readonly GateError[]): void {
  const api: TestApi = {
    version: 1,
    seed: game.seed,
    scene: () => game.snapshot(),
    goTo: (sceneId) => game.goTo(sceneId),
    takeExit: (exitId) => game.takeExit(exitId),
    registeredScenes: () => game.graph.ids,
    manifest: () => SCENE_MANIFEST,
    graphIssues: () => game.graph.validate(),
    karma: () => game.soul.karma,
    harmony: () => game.soul.harmony,
    will: () => game.soul.will,
    attachment: () => game.soul.attachment,
    cart: () => game.soul.cart.map((item) => ({ ...item })),
    shards: () => [...game.soul.shards],
    perf: () => game.frameStats,
    renderer: () => ({ description: game.rendererDescription, software: game.isSoftwareRenderer }),
    shaderFailures: () => game.shaderFailures,
    contextEvents: () => game.contextEvents,
    disposalLog: () => game.disposalLog,
    errors: () => errors,
    ready: () => (game.snapshot()?.framesRendered ?? 0) > 0,
    slicePath: () => SLICE_PATH,
    beat: () => game.snapshot()?.beat,
    advanceBeat: () => {
      game.advanceBeat();
    },
    caption: () => game.captions.text,
    audio: () => ({ started: game.audio.isStarted, voices: game.audio.activeVoices }),
    post: () => ({
      enabled: game.postPipeline.enabled,
      passes: game.postPipeline.passCount,
      bloomless: game.postPipeline.passCount <= 2,
      samples: game.postPipeline.samples,
    }),
    setPostEnabled: (enabled) => {
      game.postPipeline.setEnabled(enabled);
    },
    camera: () => game.cameraRig.debug,
    discarnate: () => game.isDiscarnate,
    spiritBody: () => game.spiritBodyAppearance,
    requestFrameSample: () => {
      game.requestFrameSample();
    },
    frameSample: () => game.frameSample,
  };

  globalThis.__game = api;
}

function describeReason(reason: unknown): string {
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}`;
  }
  return typeof reason === 'string' ? reason : JSON.stringify(reason);
}
