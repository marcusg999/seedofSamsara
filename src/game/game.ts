import type { SceneDefinition, SceneInstance } from './scene';
import type { Rng } from './rng';
import type { SoulState } from './soul';
import { createRng, defaultSeed } from './rng';
import { createSoulState } from './soul';
import { ResourceTracker, type DisposalCounts } from './disposal';
import { createRenderer, type FrameStats, type RendererBundle } from './renderer';
import type { SceneGraph } from './state-machine';

export interface SceneSnapshot {
  readonly id: string;
  readonly title: string;
  readonly exits: readonly { id: string; label: string; to: string | null }[];
  readonly terminal: boolean;
  /** Seconds since this scene loaded — the softlock clock. */
  readonly elapsed: number;
  /** Frames rendered since this scene loaded. A scene must render at least once. */
  readonly framesRendered: number;
  readonly liveResources: DisposalCounts;
}

export interface GameOptions {
  readonly canvas: HTMLCanvasElement;
  readonly graph: SceneGraph;
  readonly seed?: string;
  readonly startSceneId: string;
}

/**
 * Owns the render loop, the current scene, and every transition.
 *
 * A transition always tears the old scene down before building the new one, so
 * the reincarnation loop cannot accumulate GPU resources across runs
 * (CLAUDE.md § Gotchas).
 */
export class Game {
  readonly graph: SceneGraph;
  readonly soul: SoulState;
  readonly seed: string;

  private readonly bundle: RendererBundle;
  private readonly canvas: HTMLCanvasElement;
  private readonly rootRng: Rng;
  private readonly disposedCounts: DisposalCounts[] = [];

  private definition: SceneDefinition | undefined;
  private instance: SceneInstance | undefined;
  private tracker: ResourceTracker | undefined;
  private sceneLoadedAt = 0;
  private framesRendered = 0;
  private lastFrameAt = 0;
  private rafHandle: number | undefined;
  private running = false;
  /** Set when a transition is in flight, so overlapping goTo calls serialise. */
  private pending: Promise<void> = Promise.resolve();
  private onTeardown: () => void = () => {
    // Replaced in the constructor once listeners are attached.
  };

  constructor(options: GameOptions) {
    this.canvas = options.canvas;
    this.graph = options.graph;
    this.seed = options.seed ?? defaultSeed();
    this.rootRng = createRng(this.seed);
    this.soul = createSoulState();
    this.bundle = createRenderer(options.canvas);

    const onResize = (): void => {
      this.resize();
    };
    globalThis.addEventListener('resize', onResize);
    this.onTeardown = () => {
      globalThis.removeEventListener('resize', onResize);
    };

    this.resize();
  }

  get currentSceneId(): string | undefined {
    return this.definition?.id;
  }

  get frameStats(): FrameStats {
    return this.bundle.frameStats();
  }

  get rendererDescription(): string {
    return this.bundle.rendererDescription();
  }

  get isSoftwareRenderer(): boolean {
    return this.bundle.isSoftwareRenderer();
  }

  get shaderFailures(): readonly { sceneId: string; programName: string; log: string }[] {
    return this.bundle.shaderFailures;
  }

  get contextEvents(): { lost: number; restored: number } {
    return this.bundle.contextEvents;
  }

  /** Resource counts released by every scene unloaded so far. */
  get disposalLog(): readonly DisposalCounts[] {
    return this.disposedCounts;
  }

  snapshot(): SceneSnapshot | undefined {
    if (!this.definition) {
      return undefined;
    }
    return {
      id: this.definition.id,
      title: this.definition.title,
      exits: this.definition.exits.map((exit) => ({ id: exit.id, label: exit.label, to: exit.to })),
      terminal: this.definition.terminal ?? false,
      elapsed: (performance.now() - this.sceneLoadedAt) / 1000,
      framesRendered: this.framesRendered,
      liveResources: this.tracker?.live ?? { geometries: 0, materials: 0, textures: 0, renderTargets: 0, other: 0 },
    };
  }

  /** Jump to any scene. The test API exposes this; gameplay uses `takeExit`. */
  goTo(sceneId: string): Promise<void> {
    this.pending = this.pending.then(() => this.transition(sceneId));
    return this.pending;
  }

  /** Follow a declared exit by id. Throws if the current scene does not declare it. */
  takeExit(exitId: string): Promise<void> {
    const definition = this.definition;
    if (!definition) {
      throw new Error('takeExit called before any scene loaded');
    }
    const exit = definition.exits.find((candidate) => candidate.id === exitId);
    if (!exit) {
      const declared = definition.exits.map((candidate) => candidate.id).join(', ');
      throw new Error(`Scene "${definition.id}" declares no exit "${exitId}". Declared: ${declared || '(none)'}`);
    }
    if (exit.to === null) {
      return Promise.resolve();
    }
    return this.goTo(exit.to);
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastFrameAt = performance.now();
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle !== undefined) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = undefined;
    }
  }

  resize(): void {
    const width = this.canvas.clientWidth || globalThis.innerWidth || 1;
    const height = this.canvas.clientHeight || globalThis.innerHeight || 1;
    this.bundle.resize(width, height);
    this.instance?.resize?.(width, height);
  }

  /** Full teardown: current scene, renderer, listeners. */
  dispose(): void {
    this.stop();
    this.unloadCurrent();
    this.onTeardown();
    this.bundle.dispose();
  }

  private async transition(sceneId: string): Promise<void> {
    const definition = this.graph.get(sceneId);
    this.unloadCurrent();

    const tracker = new ResourceTracker();
    this.bundle.setCurrentSceneId(sceneId);

    const instance = await definition.create({
      scene: this.bundle.scene,
      camera: this.bundle.camera,
      renderer: this.bundle.renderer,
      rng: this.rootRng.stream(sceneId),
      resources: tracker,
      soul: this.soul,
      viewport: {
        width: this.canvas.clientWidth || globalThis.innerWidth || 1,
        height: this.canvas.clientHeight || globalThis.innerHeight || 1,
      },
    });

    this.definition = definition;
    this.instance = instance;
    this.tracker = tracker;
    this.sceneLoadedAt = performance.now();
    this.framesRendered = 0;
    this.bundle.resetFrameStats();
    this.resize();
  }

  private unloadCurrent(): void {
    this.instance?.dispose?.();
    if (this.tracker) {
      this.disposedCounts.push(this.tracker.disposeAll());
    }
    // Clearing the shared scene graph is what stops a scene's objects from
    // being rendered by the next one.
    this.bundle.scene.clear();
    this.instance = undefined;
    this.tracker = undefined;
    this.definition = undefined;
  }

  private loop(): void {
    if (!this.running) {
      return;
    }
    this.rafHandle = requestAnimationFrame(() => {
      this.loop();
    });

    const now = performance.now();
    const delta = Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;

    if (this.instance) {
      this.instance.update(delta, (now - this.sceneLoadedAt) / 1000);
      this.bundle.renderer.render(this.bundle.scene, this.bundle.camera);
      this.framesRendered += 1;
      this.bundle.recordFrame(performance.now() - now);
    }
  }
}
