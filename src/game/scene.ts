import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Rng } from './rng';
import type { ResourceTracker } from './disposal';
import type { SoulState } from './soul';

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
  readonly viewport: { width: number; height: number };
}

/** A live scene. */
export interface SceneInstance {
  /** Advance by `delta` seconds. `elapsed` is seconds since this scene loaded. */
  update(delta: number, elapsed: number): void;
  /** Called on resize; optional because most scenes only need the camera update. */
  resize?(width: number, height: number): void;
  /**
   * Release everything not held by the scene's ResourceTracker. The tracker is
   * swept by the game, so most scenes need nothing here.
   */
  dispose?(): void;
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
  create(context: SceneContext): SceneInstance | Promise<SceneInstance>;
}
