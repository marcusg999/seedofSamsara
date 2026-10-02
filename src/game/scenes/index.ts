import { SceneGraph } from '../state-machine';
import { contentNotesScene, vignetteSelectScene } from './front-matter';
import { deathHeartAttackScene } from './death-heart-attack';
import { pronouncedDeadScene, buzzingScene, outOfBodyScene } from './threshold-early';
import { tunnelScene, lovedOnesScene, beingOfLightScene } from './threshold-light';
import { borderScene, choiceScene, lifeReviewScene } from './border-and-review';
import { councilScene } from './council';
import { marketAisleScenes, marketCheckoutScene } from './market';

/**
 * Every scene the game has actually built. The manifest in `../manifest.ts`
 * lists everything it intends to build; this is the subset that exists.
 *
 * Adding a scene here and flipping its manifest entry to `implemented` is what
 * puts it under the gate. The two must agree — the gate fails either mismatch.
 *
 * This is the vertical slice: one complete path from an ordinary evening to the
 * life review. The harness scene it replaced is gone.
 */
export function createSceneGraph(): SceneGraph {
  return new SceneGraph().register(
    contentNotesScene,
    vignetteSelectScene,
    deathHeartAttackScene,
    pronouncedDeadScene,
    buzzingScene,
    outOfBodyScene,
    tunnelScene,
    lovedOnesScene,
    beingOfLightScene,
    borderScene,
    choiceScene,
    lifeReviewScene,
    councilScene,
    ...marketAisleScenes,
    marketCheckoutScene,
  );
}

export const START_SCENE_ID = 'content-notes';

/** The slice's path, in order. The gate plays this end to end. */
export const SLICE_PATH: readonly string[] = [
  'content-notes',
  'vignette-select',
  'death.heart-attack',
  'threshold.pronounced-dead',
  'threshold.buzzing',
  'threshold.out-of-body',
  'threshold.tunnel',
  'threshold.loved-ones',
  'threshold.being-of-light',
  'threshold.border',
  'threshold.choice',
  'light.life-review',
  'light.council',
  'market.parents',
  'market.body',
  'market.gifts',
  'market.trauma',
  'market.economics',
  'market.place',
  'market.contracts',
  'market.checkout',
];
