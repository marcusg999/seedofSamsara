import type { SceneContext } from '../scene';
import { Overlay, type OverlayContent } from '../systems/overlay';

/**
 * One overlay slot for a scene, with a queue behind it.
 *
 * Every scene in the game shows its questions through a single `Overlay`, and a
 * vignette's beat clock reaches the next cue whether or not the player has
 * answered the last one. So a cue must never *offer* — it can only **queue**.
 * The head of the queue is what is on screen; the next question goes up on the
 * frame the current one is answered.
 *
 * Offering straight off the timeline paints over an unanswered dialog, and a
 * question that disappears unasked is worse than a default: the player never
 * learns it was there, and the state it carried never moves at all. Queued, a
 * question can only ever wait.
 *
 * The queue never answers anything. There is no timer in here, no auto-pick and
 * no head-of-line expiry, because the game does not decide for the player
 * (GAME_BRIEF.md § Act 1, pacing rule). `answered()` is called from a pick
 * handler and nowhere else.
 *
 * ## Why this file exists
 *
 * This mechanism was written in `scenes/dmt.ts` as a local function and then
 * restated verbatim in `scenes/death-heart-attack.ts`, whose comment records the
 * rule for the next copy: "If a third scene needs it, it belongs in `systems/`
 * and both should take it from there." `scenes/death-soldier.ts` is the third
 * scene, so the mechanism is here.
 *
 * The two existing copies are NOT yet pointed at this file: `dmt.ts` and
 * `death-heart-attack.ts` are outside the change that added this module and are
 * being edited concurrently. Collapsing them onto this import is the obvious
 * follow-up and should be done in a change that owns those files — the three
 * implementations are line-for-line identical in behaviour, so it is a deletion,
 * not a merge.
 */
export interface ChoiceQueue {
  /**
   * Queue a question. `build` runs at the moment the question actually goes up,
   * not when it is queued, so its copy can read state the player has changed
   * since the cue fired.
   */
  enqueue(build: () => OverlayContent): void;
  /**
   * Call from a pick handler: closes the current question and offers whatever is
   * waiting behind it, on the same frame.
   */
  answered(): void;
  /** True while a question is on screen. For a scene that holds a beat open. */
  readonly pending: boolean;
}

export function choiceQueue(context: SceneContext): ChoiceQueue {
  const queue: (() => OverlayContent)[] = [];
  let current: Overlay | undefined;

  // Whatever is up must come down when the scene unloads, or the dialog outlives
  // the scene it belongs to and the next scene is unplayable behind it.
  context.resources.onDispose(() => {
    current?.dispose();
    current = undefined;
    queue.length = 0;
  });

  const pump = (): void => {
    if (current) {
      return;
    }
    const next = queue.shift();
    if (!next) {
      return;
    }
    current = new Overlay(next());
    current.focusFirst();
  };

  return {
    enqueue(build) {
      queue.push(build);
      pump();
    },
    answered() {
      current?.dispose();
      current = undefined;
      pump();
    },
    get pending() {
      return current !== undefined;
    },
  };
}
