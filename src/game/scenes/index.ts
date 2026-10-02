import { SceneGraph } from '../state-machine';
import { bootScene } from './boot';

/**
 * Every scene the game has actually built. The manifest in `../manifest.ts`
 * lists everything it intends to build; this is the subset that exists.
 *
 * Adding a scene here and flipping its manifest entry to `implemented` is what
 * puts it under the gate.
 */
export function createSceneGraph(): SceneGraph {
  return new SceneGraph().register(bootScene);
}

export const START_SCENE_ID = 'boot';
