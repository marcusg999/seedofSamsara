import { Game } from './game/game';
import { createSceneGraph, START_SCENE_ID } from './game/scenes/index';
import { installErrorTrap, installTestApi } from './game/test-api';

declare const __TEST_API__: boolean;

/**
 * Entry point. Nothing here is gameplay: it wires the canvas, the scene graph
 * and the loop, and (in dev and test builds only) the test API.
 *
 * Browsers block audio until a user gesture (CLAUDE.md § Gotchas), so the audio
 * context is not created here — the first click or keypress will start it when
 * sound lands. The listener below records that the gesture happened so audio
 * work can hang off it later, and so the gate can click first and assert it.
 */
function boot(): void {
  const errors = installErrorTrap();

  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  if (!canvas) {
    throw new Error('Canvas #stage is missing from index.html');
  }

  const graph = createSceneGraph();
  const blocking = graph.validate().filter((issue) => issue.blocking);
  if (blocking.length > 0) {
    const detail = blocking.map((issue) => `${issue.sceneId}: ${issue.detail}`).join('; ');
    throw new Error(`Scene graph is invalid: ${detail}`);
  }

  const game = new Game({ canvas, graph, startSceneId: START_SCENE_ID, readable: __TEST_API__ });

  let gestured = false;
  const onFirstGesture = (): void => {
    gestured = true;
    document.documentElement.dataset['gestured'] = 'true';
    globalThis.removeEventListener('pointerdown', onFirstGesture);
    globalThis.removeEventListener('keydown', onFirstGesture);
  };
  globalThis.addEventListener('pointerdown', onFirstGesture, { once: false });
  globalThis.addEventListener('keydown', onFirstGesture, { once: false });

  if (__TEST_API__) {
    installTestApi(game, errors);
  }

  void game.goTo(START_SCENE_ID).then(() => {
    game.start();
    document.documentElement.dataset['booted'] = 'true';
    return gestured;
  });
}

boot();
