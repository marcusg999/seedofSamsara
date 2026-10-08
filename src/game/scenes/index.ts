import { SceneGraph } from '../state-machine';
import { contentNotesScene, vignetteSelectScene } from './front-matter';
import { deathHeartAttackScene } from './death-heart-attack';
import { deathSoldierScene } from './death-soldier';
import { deathDmtScene, dmtHyperspaceScene, dmtSentBackScene } from './dmt';
import { pronouncedDeadScene, buzzingScene, outOfBodyScene } from './threshold-early';
import { tunnelScene, lovedOnesScene, beingOfLightScene } from './threshold-light';
import { borderScene, choiceScene, lifeReviewScene } from './border-and-review';
import { councilScene } from './council';
import { marketAisleScenes, marketCheckoutScene } from './market';
import { riverOfForgettingScene, rebirthScene } from './rebirth';
import { earthboundScene, mistScene, voidScene } from './refuse-lower';

/**
 * Every scene the game has actually built. The manifest in `../manifest.ts`
 * lists everything it intends to build; this is the subset that exists.
 *
 * Adding a scene here and flipping its manifest entry to `implemented` is what
 * puts it under the gate. The two must agree — the gate fails either mismatch.
 *
 * This is the vertical slice: one complete path from an ordinary evening to the
 * life review, plus the DMT thread, which forks off it — the one death the
 * player can survive (GAME_BRIEF.md § Act 1, vignette 7).
 *
 * Path B's first three rooms — `refuse.earthbound`, `refuse.mist` and
 * `refuse.void` — are registered here too, which is what makes the "Refuse it"
 * button on `threshold.choice` lead somewhere instead of at an unbuilt id. They
 * are deliberately NOT on SLICE_PATH: the slice is one path through the game,
 * and Path B forks off it at the choice. The gate's `Path B: refusing the Light`
 * journey in `tests/gate/journeys.spec.ts` starts enforcing them the moment
 * this registration lands, and so does the per-scene walk in
 * `playthrough.spec.ts`, which drives every exit each of them declares.
 *
 * `death.soldier` is vignette 6 and the second of the six deaths to be built.
 * It is not on SLICE_PATH, which is deliberately one path and not a tour: it is
 * reached from `vignette-select` and hands over to `threshold.pronounced-dead`,
 * so it joins the slice at the Threshold rather than lengthening it. The gate's
 * `vignette: death.soldier` journey in `tests/gate/journeys.spec.ts` starts
 * enforcing it the moment this registration lands.
 */
export function createSceneGraph(): SceneGraph {
  return new SceneGraph().register(
    contentNotesScene,
    vignetteSelectScene,
    deathHeartAttackScene,
    deathSoldierScene,
    deathDmtScene,
    dmtHyperspaceScene,
    dmtSentBackScene,
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
    riverOfForgettingScene,
    rebirthScene,
    earthboundScene,
    mistScene,
    voidScene,
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
  'light.river-of-forgetting',
  'light.rebirth',
];
