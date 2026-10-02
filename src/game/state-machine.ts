import type { SceneDefinition } from './scene';
import { SCENE_MANIFEST } from './manifest';

/**
 * Game flow is an explicit state machine and every state declares its exits
 * (CLAUDE.md § Testability). This module holds the graph and checks it, so a
 * softlock is caught by inspection before the playthrough ever runs.
 */

export type GraphIssueKind =
  | 'no-exits'            // a non-terminal state the player cannot leave
  | 'dangling-exit'       // an exit whose target is not in the manifest at all
  | 'unregistered-target' // target is a real scene, not built yet
  | 'duplicate-exit-id'
  | 'claimed-not-registered'; // manifest says implemented, registry disagrees

export interface GraphIssue {
  readonly kind: GraphIssueKind;
  readonly sceneId: string;
  readonly detail: string;
  /** Blocking issues fail the gate. Non-blocking ones are progress information. */
  readonly blocking: boolean;
}

export class SceneGraph {
  private readonly scenes = new Map<string, SceneDefinition>();

  register(...definitions: readonly SceneDefinition[]): this {
    for (const definition of definitions) {
      if (this.scenes.has(definition.id)) {
        throw new Error(`Scene registered twice: ${definition.id}`);
      }
      this.scenes.set(definition.id, definition);
    }
    return this;
  }

  has(id: string): boolean {
    return this.scenes.has(id);
  }

  get(id: string): SceneDefinition {
    const definition = this.scenes.get(id);
    if (!definition) {
      throw new Error(`Unknown scene: ${id}. Registered: ${[...this.scenes.keys()].join(', ')}`);
    }
    return definition;
  }

  get ids(): string[] {
    return [...this.scenes.keys()];
  }

  /**
   * Static check of the whole graph. Blocking issues are real softlocks or
   * broken wiring; `unregistered-target` is the expected state of a game still
   * being built and is reported, not failed.
   */
  validate(): GraphIssue[] {
    const issues: GraphIssue[] = [];
    const known = new Set(SCENE_MANIFEST.map((entry) => entry.id));

    for (const definition of this.scenes.values()) {
      if (definition.exits.length === 0 && definition.terminal !== true) {
        issues.push({
          kind: 'no-exits',
          sceneId: definition.id,
          detail: 'state declares no exits and is not marked terminal — softlock',
          blocking: true,
        });
      }

      const seen = new Set<string>();
      for (const exit of definition.exits) {
        if (seen.has(exit.id)) {
          issues.push({
            kind: 'duplicate-exit-id',
            sceneId: definition.id,
            detail: `exit id "${exit.id}" declared twice`,
            blocking: true,
          });
        }
        seen.add(exit.id);

        if (exit.to === null) {
          continue;
        }
        if (!known.has(exit.to)) {
          issues.push({
            kind: 'dangling-exit',
            sceneId: definition.id,
            detail: `exit "${exit.id}" targets "${exit.to}", which is not in the manifest`,
            blocking: true,
          });
        } else if (!this.scenes.has(exit.to)) {
          issues.push({
            kind: 'unregistered-target',
            sceneId: definition.id,
            detail: `exit "${exit.id}" targets "${exit.to}", which is planned but not built yet`,
            blocking: false,
          });
        }
      }
    }

    for (const entry of SCENE_MANIFEST) {
      if (entry.status === 'implemented' && !this.scenes.has(entry.id)) {
        issues.push({
          kind: 'claimed-not-registered',
          sceneId: entry.id,
          detail: 'manifest marks this scene implemented, but it is not registered',
          blocking: true,
        });
      }
    }

    return issues;
  }
}
