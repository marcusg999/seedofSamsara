import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Rng } from './rng';
import type { ResourceTracker } from './disposal';
import type { SoulState } from './soul';
import type { AudioEngine } from './systems/audio';
import type { CameraRig } from './systems/camera-rig';
import type { Captions } from './systems/captions';
import type { PostPipeline } from './systems/postfx';

/** What a scene is handed when it is created. */
export interface SceneContext {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  /** A named stream off the run seed, so a scene's draws cannot shift another's. */
  readonly rng: Rng;
  /** Everything a scene allocates goes through here and is freed on unload. */
  readonly resources: ResourceTracker;
  /** Karma, harmony, will, cart — read freely, mutate through the game. */
  readonly soul: SoulState;
  /** Camera and look input. Scenes set the mode and drive the path. */
  readonly rig: CameraRig;
  /** Procedural audio. Silent until the first user gesture. */
  readonly audio: AudioEngine;
  /** Bloom and the grade pass. Scenes drive these per frame. */
  readonly post: PostPipeline;
  /** Sparse on-screen text. Rationed deliberately. */
  readonly captions: Captions;
  readonly viewport: { width: number; height: number };
  /**
   * Follow one of this scene's declared exits. Preferred over `goTo`, because it
   * cannot reach a state the scene did not declare — which is what keeps the
   * state machine's exit declarations true (CLAUDE.md § Testability).
   */
  takeExit(exitId: string): Promise<void>;
  /** Jump to any scene. For the few transitions that are not a declared exit. */
  goTo(sceneId: string): Promise<void>;
}

/** A live scene. */
export interface SceneInstance {
  /** Advance by `delta` seconds. `elapsed` is seconds since this scene loaded. */
  update(delta: number, elapsed: number): void;
  /** Called on resize; optional because most scenes only need the camera update. */
  resize?(width: number, height: number): void;
  /**
   * Release anything not held by the scene's ResourceTracker. The tracker is
   * swept by the game, so most scenes need nothing here.
   */
  dispose?(): void;
  /**
   * The beat the scene is on, for the gate and the test API. A scene with an
   * authored timeline should report it so a playthrough can assert on a beat
   * rather than on a wall-clock time.
   */
  beat?(): { id: string; index: number; t: number; finished: boolean } | undefined;
  /**
   * Skip to the end of the current beat. The gate uses this to play a long
   * vignette quickly without turning the sequence off.
   */
  advance?(): void;
}

export interface SceneExit {
  /** Stable id, used by the gate to drive the exit. */
  readonly id: string;
  /** What the player sees. */
  readonly label: string;
  /** Where it leads. `null` means the run ends here. */
  readonly to: string | null;
}

export interface SceneDefinition {
  readonly id: string;
  readonly title: string;
  /**
   * Every state declares its exits (CLAUDE.md § Testability). A state with no
   * exits must set `terminal`, or the gate treats it as a softlock.
   */
  readonly exits: readonly SceneExit[];
  readonly terminal?: boolean;
  /** Content notes to show before this scene is first entered, if any. */
  readonly contentNotes?: readonly string[];
  create(context: SceneContext): SceneInstance | Promise<SceneInstance>;
}
