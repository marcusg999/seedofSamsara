import type { SceneDefinition, SceneInstance } from './scene';
import type { Rng } from './rng';
import type { SoulState } from './soul';
import { createRng, defaultSeed } from './rng';
import { createSoulState } from './soul';
import { ResourceTracker, type DisposalCounts } from './disposal';
import { createRenderer, type FrameSample, type FrameStats, type RendererBundle } from './renderer';
import type { SceneGraph } from './state-machine';
import { AudioEngine } from './systems/audio';
import { CameraRig } from './systems/camera-rig';
import { Captions } from './systems/captions';
import { createPostPipeline, type PostPipeline } from './systems/postfx';
import { createSpiritBody, type SpiritBody } from './systems/spirit-body';

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
  /** The authored beat the scene is on, if it has a timeline. */
  readonly beat: { id: string; index: number; t: number; finished: boolean } | undefined;
}

export interface GameOptions {
  readonly canvas: HTMLCanvasElement;
  readonly graph: SceneGraph;
  readonly seed?: string;
  readonly startSceneId: string;
  /** Test and dev builds only: makes the frame readable for the gate's checks. */
  readonly readable?: boolean;
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
  private readonly rig: CameraRig;
  private readonly audioEngine: AudioEngine;
  private readonly captionLayer: Captions;
  private readonly post: PostPipeline;
  private readonly spiritBody: SpiritBody;
  /** Owns the pipeline's render targets for the game's whole lifetime. */
  private readonly pipelineTracker = new ResourceTracker();

  private definition: SceneDefinition | undefined;
  private instance: SceneInstance | undefined;
  private tracker: ResourceTracker | undefined;
  private sceneLoadedAt = 0;
  private framesRendered = 0;
  private lastFrameAt = 0;
  private rafHandle: number | undefined;
  /** Set by the gate; the loop samples the next frame it draws. */
  private sampleWanted = false;
  private lastSample: FrameSample | undefined;
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
    this.bundle = createRenderer(options.canvas, { readable: options.readable ?? false });
    this.rig = new CameraRig(this.bundle.camera, options.canvas);
    this.audioEngine = new AudioEngine(this.rootRng.stream('audio'));
    this.captionLayer = new Captions();
    this.post = createPostPipeline(
      this.bundle.renderer,
      this.bundle.scene,
      this.bundle.camera,
      this.pipelineTracker,
      { softwareRenderer: this.bundle.isSoftwareRenderer() },
    );
    // Owned by the game rather than by a scene: it belongs to the player, not to
    // any one place, and it has to survive every transition between them.
    this.spiritBody = createSpiritBody(this.pipelineTracker);

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

  /** Started on the first user gesture; silent before that. */
  get audio(): AudioEngine {
    return this.audioEngine;
  }

  get captions(): Captions {
    return this.captionLayer;
  }

  get postPipeline(): PostPipeline {
    return this.post;
  }

  get cameraRig(): CameraRig {
    return this.rig;
  }

  /** How the spirit body currently reads. Reflects karma. */
  get spiritBodyAppearance(): { color: number; intensity: number } {
    return this.spiritBody.appearance;
  }

  /** Whether the current scene carries the spirit body. */
  get isDiscarnate(): boolean {
    return this.definition?.discarnate === true;
  }

  /** Skip to the end of the current scene's beat, if it has a timeline. */
  advanceBeat(): void {
    this.instance?.advance?.();
  }

  /**
   * Ask the loop to measure the next frame it draws. Sampling has to happen
   * inside the loop, immediately after the render, because the drawing buffer is
   * not readable once the frame has been presented.
   */
  requestFrameSample(): void {
    this.sampleWanted = true;
    this.lastSample = undefined;
  }

  get frameSample(): FrameSample | undefined {
    return this.lastSample;
  }

  /** False in a shipping build, where the frame cannot be read back. */
  get frameReadable(): boolean {
    return this.bundle.readable;
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
      beat: this.instance?.beat?.(),
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
    this.post.setSize(width, height);
    this.instance?.resize?.(width, height);
  }

  /** Full teardown: current scene, renderer, listeners. */
  dispose(): void {
    this.stop();
    this.unloadCurrent();
    this.onTeardown();
    this.rig.dispose();
    this.audioEngine.dispose();
    this.captionLayer.dispose();
    this.pipelineTracker.disposeAll();
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
      rig: this.rig,
      audio: this.audioEngine,
      post: this.post,
      captions: this.captionLayer,
      takeExit: (exitId) => this.takeExit(exitId),
      goTo: (target) => this.goTo(target),
      viewport: {
        width: this.canvas.clientWidth || globalThis.innerWidth || 1,
        height: this.canvas.clientHeight || globalThis.innerHeight || 1,
      },
    });

    // The scene graph is cleared on every unload, so a discarnate scene has to
    // take the spirit body back each time it loads.
    if (definition.discarnate === true) {
      this.bundle.scene.add(this.spiritBody.group);
    }

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
    // Every scene leaves the audio bed and the caption line clean, so a voice
    // from the last scene can never bleed into the next one.
    this.audioEngine.resetVoices();
    this.captionLayer.clear();
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
      const elapsed = (now - this.sceneLoadedAt) / 1000;
      this.instance.update(delta, elapsed);
      this.rig.update(delta);
      if (this.definition?.discarnate === true) {
        // After the rig has moved, so the body is where the player is.
        this.spiritBody.update(elapsed, this.bundle.camera, this.soul);
      }
      this.audioEngine.update();
      this.captionLayer.update();
      this.post.commit(elapsed);
      this.post.render(delta);
      if (this.sampleWanted) {
        this.sampleWanted = false;
        this.lastSample = this.bundle.sampleFrame();
      }
      this.framesRendered += 1;
      this.bundle.recordFrame(performance.now() - now);
    }
  }
}
