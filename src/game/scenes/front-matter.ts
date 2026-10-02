import { Color } from 'three';
import { setU } from '../systems/glsl';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { GRAMMAR } from '../systems/palette';
import { airShell, moteField, volumetricGlow } from '../systems/forms';
import { Overlay } from '../systems/overlay';

/**
 * Content notes, then the one death this slice offers.
 *
 * Content notes appear before play (CLAUDE.md § Content rules), and they are the
 * first thing the game says, so they are plain and specific rather than a wall of
 * boilerplate. The field behind them is already the game's register: dark, slow,
 * a little alive.
 */

function quietField(context: SceneContext, grammarName: 'living' | 'dying'): {
  update: (delta: number, elapsed: number) => void;
} {
  const grammar = GRAMMAR[grammarName];
  const air = airShell(context.resources, {
    radius: 60,
    ground: grammar.ground,
    glow: 0x4a4270,
    density: 1,
  });
  context.scene.add(air.mesh);

  // Enough, and bright enough, to be a field the eye can rest in. The previous
  // values rendered as pure black with no lit pixel anywhere in frame.
  const motes = moteField(context.resources, context.rng.stream('motes'), {
    count: 1400,
    radius: 11,
    color: grammar.glow,
    size: 0.3,
  });
  context.scene.add(motes.points);

  // A slow body of light off to one side. Without it the field has no lit pixel
  // anywhere and the front matter is text on black — which is both a failed
  // visibility check and an undesigned first impression.
  const presence = volumetricGlow(context.resources, {
    radius: 7.5,
    color: grammar.glow,
    intensity: 1.5,
    softness: 2.2,
  });
  presence.mesh.position.set(4.2, -0.8, -9);
  context.scene.add(presence.mesh);

  const far = volumetricGlow(context.resources, {
    radius: 11,
    color: 0x8f7bf0,
    intensity: 0.9,
    softness: 2.6,
  });
  far.mesh.position.set(-6.5, 1.8, -13);
  context.scene.add(far.mesh);

  context.camera.position.set(0, 0, 0);
  context.rig.setMode('embodied');
  context.rig.orient(0, 0.04);
  context.rig.setSway(0.35);
  context.rig.setPulse(0);
  context.rig.setRoll(0);
  context.rig.position.set(0, 0, 0);

  context.post.setBloom(grammar.bloom * 0.8, 0.6, 0.7);
  const grade = context.post.grade;
  grade.drain = grammar.drain;
  grade.grain = grammar.grain;
  grade.vignette = 0.5;
  grade.aberration = 0.0014;
  grade.distortion = 0.025;
  grade.exposure = 1.15;
  grade.washAmount = 0;
  grade.smear = 0;

  return {
    update(delta, elapsed) {
      setU(air.material, 'uTime', elapsed);
      motes.drift(delta, elapsed);
      motes.points.rotation.y = elapsed * 0.012;
      presence.update(elapsed, context.camera);
      far.update(elapsed, context.camera);
    },
  };
}

export const contentNotesScene: SceneDefinition = {
  id: 'content-notes',
  title: 'Before you begin',
  exits: [{ id: 'begin', label: 'Begin', to: 'vignette-select' }],
  create(context: SceneContext): SceneInstance {
    const field = quietField(context, 'dying');
    let overlay: Overlay | undefined;

    // The notes describe what the slice actually contains, not every vignette
    // the finished game plans. Promising content that is not here would be the
    // same failure as hiding content that is.
    overlay = new Overlay({
      title: 'Seed of Samsara',
      body:
        'This is a game about dying and what might come after. It is quiet, slow, and '
        + 'meant to be played with sound on. This slice contains one life and one death.',
      list: [
        'A death from a heart attack, shown from inside the body.',
        'Death is conveyed through perception — time slowing, sound dropping away, colour draining. There is no gore.',
        'A life review in which you feel a moment of your life as another person felt it.',
        'Low, slow light. Some bloom and a brief vertical smear at the moment of death.',
      ],
      actions: [
        {
          id: 'begin',
          label: 'Begin',
          onPick: () => {
            // The audio context starts on this gesture, which is the first one
            // the player makes (CLAUDE.md § Gotchas).
            context.audio.start();
            void context.takeExit('begin');
          },
        },
      ],
      hint: 'Drag, or use the arrow keys, to look around. There is nothing to fail.',
    });
    overlay.focusFirst();

    context.resources.onDispose(() => {
      overlay?.dispose();
      overlay = undefined;
    });

    return {
      update(delta, elapsed) {
        field.update(delta, elapsed);
      },
    };
  },
};

export const vignetteSelectScene: SceneDefinition = {
  id: 'vignette-select',
  title: 'Choose a death',
  exits: [{ id: 'heart-attack', label: 'The heart attack', to: 'death.heart-attack' }],
  create(context: SceneContext): SceneInstance {
    const field = quietField(context, 'living');
    let overlay: Overlay | undefined;

    context.audio.room(0.2, 420);
    context.audio.drone(0.1, 48);

    overlay = new Overlay({
      title: 'Seven deaths. One is built.',
      body:
        'The finished game lets you choose your death or take a random one. This slice '
        + 'builds one of the seven, end to end: an ordinary evening, and a heart that stops.',
      actions: [
        {
          id: 'heart-attack',
          label: 'The heart attack',
          onPick: () => {
            context.audio.start();
            void context.takeExit('heart-attack');
          },
        },
      ],
      hint: 'The other six vignettes, both afterlife paths and the Life Market are planned, not built.',
    });
    overlay.focusFirst();

    context.resources.onDispose(() => {
      overlay?.dispose();
      overlay = undefined;
    });

    return {
      update(delta, elapsed) {
        field.update(delta, elapsed);
      },
    };
  },
};

/** Shared by both front-matter scenes; exported for the colour tests. */
export const FRONT_MATTER_GROUND = new Color(GRAMMAR.dying.ground);
