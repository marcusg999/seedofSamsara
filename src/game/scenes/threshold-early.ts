import {
  AdditiveBlending,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { setU } from '../systems/glsl';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { GRAMMAR } from '../systems/palette';
import { Director, ease, type Beat } from '../systems/director';
import { airShell, moteField, volumetricGlow } from '../systems/forms';

/**
 * The first three Threshold elements, from Moody's recurring sequence
 * (lore bible § 2): hearing yourself pronounced dead, the buzzing, and the
 * out-of-body view.
 *
 * These are the first scenes judged against the wordless, scale-driven bar, so
 * the rules change from the vignette: almost no text, no interface, and the awe
 * comes from how much space there suddenly is after a room with a low ceiling.
 */

/**
 * The room as it is remembered rather than as it was: an outline in light with a
 * few specific things still in it.
 *
 * This is the research talking. Veridical out-of-body recall is rare and sparse
 * (lore bible `L-ARREST-03` puts explicit recall of real events at about 2% of
 * survivors), so the strongest reports look like a handful of exact details in an
 * otherwise vague scene. Rendering the full kitchen from above would be the
 * wrong claim as well as the wrong feeling.
 */
function rememberedRoom(context: SceneContext, glowColor: number): {
  group: Group;
  update: (delta: number, elapsed: number) => void;
  setPresence: (value: number) => void;
} {
  const { resources } = context;
  const group = new Group();

  const width = 5.4;
  const depth = 6.2;
  const height = 2.7;
  const hw = width / 2;
  const hd = depth / 2;

  // Only the edges. An outline carries a room with a fraction of the geometry and
  // reads as recollection rather than as architecture.
  const corners: [number, number, number][] = [
    [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
    [-hw, height, -hd], [hw, height, -hd], [hw, height, hd], [-hw, height, hd],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const vertices: number[] = [];
  for (const [a, b] of edges) {
    const from = corners[a];
    const to = corners[b];
    if (!from || !to) {
      continue;
    }
    vertices.push(...from, ...to);
  }
  const lineGeometry = resources.track(new BufferGeometry());
  lineGeometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  const lineMaterial = resources.track(
    new LineBasicMaterial({ color: glowColor, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
  );
  const outline = new LineSegments(lineGeometry, lineMaterial);
  group.add(outline);

  // The details that survive: the window, the two cups, the kettle's steam, and a
  // soft warmth on the floor where he is. The form on the floor is a glow and
  // nothing else — there is no body model in this game.
  const windowGlow = volumetricGlow(resources, { radius: 1.6, color: 0xa8d0ec, intensity: 2.2, softness: 2.0 });
  windowGlow.mesh.position.set(0, 1.62, -hd);
  group.add(windowGlow.mesh);

  const cupMaterial = resources.track(
    new MeshBasicMaterial({ color: 0xe8dfd2, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }),
  );
  const cupGeometry = resources.track(new CylinderGeometry(0.05, 0.042, 0.1, 14));
  for (const [x, z] of [[-0.26, 0.66], [0.46, 0.84]] as const) {
    const cup = new Mesh(cupGeometry, cupMaterial);
    cup.position.set(x, 0.84, z);
    group.add(cup);
  }

  const restingGlow = volumetricGlow(resources, { radius: 1.25, color: 0xffc89a, intensity: 1.5, softness: 2.8 });
  restingGlow.mesh.position.set(0.35, 0.16, 1.4);
  restingGlow.mesh.scale.set(1.5, 0.35, 0.95);
  group.add(restingGlow.mesh);

  const steam = moteField(resources, context.rng.stream('remembered-steam'), {
    count: 70,
    radius: 0.34,
    color: 0xcfe2ef,
    size: 0.03,
  });
  steam.points.position.set(-1.1, 1.3, -hd + 0.42);
  group.add(steam.points);

  return {
    group,
    update(delta, elapsed) {
      windowGlow.update(elapsed, context.camera);
      restingGlow.update(elapsed, context.camera);
      steam.drift(delta, elapsed);
    },
    setPresence(value) {
      lineMaterial.opacity = 0.85 * value;
      cupMaterial.opacity = 0.9 * value;
      setU(windowGlow.material, 'uIntensity', 2.2 * value);
      setU(restingGlow.material, 'uIntensity', 1.5 * value);
    },
  };
}

// --- hearing yourself pronounced dead ------------------------------------------

const PRONOUNCED_BEATS: readonly Beat[] = [
  { id: 'voices', seconds: 16 },
  { id: 'the-words', seconds: 14, caption: 'Someone says a time out loud.' },
  { id: 'apart', seconds: 14 },
  { id: 'wait', seconds: 1, hold: true },
];

export const pronouncedDeadScene: SceneDefinition = {
  id: 'threshold.pronounced-dead',
  title: 'A time, said out loud',
  exits: [{ id: 'onward', label: 'Onward', to: 'threshold.buzzing' }],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.dying;
    const air = airShell(context.resources, { radius: 70, ground: grammar.ground, glow: 0x2a2838, density: 1 });
    context.scene.add(air.mesh);

    const room = rememberedRoom(context, grammar.glow);
    context.scene.add(room.group);
    room.setPresence(0.85);

    const director = new Director(PRONOUNCED_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 7);
      }
    });

    // Still on the floor, still facing what the body was facing. The change is
    // that the view no longer quite belongs to it.
    context.rig.setMode('drifting');
    context.rig.position.set(0.35, 0.3, 1.9);
    context.rig.target.set(0.35, 0.62, 1.7);
    context.rig.orient(Math.PI * 0.04, 0.12);
    context.rig.setSway(0.5);
    context.rig.setRoll(0.45);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = grammar.drain;
    grade.grain = grammar.grain;
    grade.vignette = 0.74;
    grade.aberration = 0.0038;
    grade.distortion = 0.06;
    grade.exposure = 1.5;
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(grammar.bloom, 0.6, 0.75);

    // Voices, heard as shape rather than as speech: a low formant-ish drone with
    // no words in it. Nothing is intelligible, which is the point.
    context.audio.room(0.14, 300);
    context.audio.drone(0.17, 96, 4);
    context.audio.ring(0.16, 2300);
    context.audio.heartbeat(false);

    return {
      update(delta, elapsed) {
        director.update(delta);
        const { beat, t } = director.state;
        setU(air.material, 'uTime', elapsed);
        room.update(delta, elapsed);

        // The room thins as the scene goes on: not fading to black, loosening.
        const apart = beat.id === 'apart' ? ease.inOut(t) : beat.id === 'wait' ? 1 : 0;
        room.setPresence(0.85 - apart * 0.45);
        context.rig.setRoll(0.45 - apart * 0.3);
        context.rig.target.set(0.35, 0.62 + apart * 0.5, 1.7 - apart * 0.2);

        grade.drain = grammar.drain + apart * 0.08;
        grade.vignette = 0.74 - apart * 0.1;
        context.audio.drone(0.17 - apart * 0.06, 96 - apart * 20, 4);
        context.audio.ring(0.16 + apart * 0.1, 2300 + apart * 200);
      },
      beat() {
        const state = director.state;
        return { id: state.beat.id, index: state.index, t: state.t, finished: state.finished };
      },
      advance() {
        director.advance();
      },
    };
  },
};

// --- the buzzing ---------------------------------------------------------------

const BUZZING_BEATS: readonly Beat[] = [
  { id: 'rising', seconds: 13 },
  { id: 'everything', seconds: 12 },
  { id: 'wait', seconds: 1, hold: true },
];

export const buzzingScene: SceneDefinition = {
  id: 'threshold.buzzing',
  title: 'The sound of it',
  exits: [{ id: 'onward', label: 'Onward', to: 'threshold.out-of-body' }],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    // This beat sits between the dying grammar and the out-of-body one, and
    // takes its own lighter ground so the field has something to read against.
    const air = airShell(context.resources, { radius: 70, ground: 0x15121f, glow: 0x5a4f80, density: 1 });
    context.scene.add(air.mesh);

    // The room has come apart into the sound. What is left is a field of
    // vibrating motes where the geometry used to be.
    // This beat is the room coming apart into the sound, so the field has to be
    // genuinely dense and present — at the previous size it measured as an empty
    // frame, which is not "dark and unsettling", it is nothing on screen.
    const field = moteField(context.resources, context.rng.stream('buzz'), {
      count: 3200,
      radius: 7,
      color: 0xf0e6ff,
      size: 0.55,
    });
    context.scene.add(field.points);

    const director = new Director(BUZZING_BEATS);

    context.rig.setMode('drifting');
    context.rig.position.set(0, 0.8, 1.2);
    context.rig.target.set(0, 1.1, 0.2);
    context.rig.orient(0, 0.05);
    context.rig.setSway(0.7);
    context.rig.setRoll(0.12);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.8;
    grade.grain = 0.2;
    grade.vignette = 0.7;
    grade.aberration = 0.006;
    grade.distortion = 0.09;
    grade.exposure = 1.45;
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(0.6, 0.7, 0.69);

    context.audio.room(0.1, 240);
    context.audio.ring(0.34, 2600);
    context.audio.drone(0.2, 70);
    context.audio.heartbeat(false);

    return {
      update(delta, elapsed) {
        director.update(delta);
        const { beat, t } = director.state;
        setU(air.material, 'uTime', elapsed);
        field.drift(delta, elapsed);
        field.points.rotation.y = elapsed * 0.03;

        const intensity = beat.id === 'rising' ? ease.out(t) : 1;

        // The ring climbs and the frame starts to disagree with itself. This is
        // the loudest the slice ever gets, and it is brief on purpose.
        context.audio.ring(0.34 + intensity * 0.2, 2600 + intensity * 900);
        context.audio.drone(0.2 + intensity * 0.08, 70 - intensity * 14);
        grade.aberration = 0.006 + intensity * 0.009;
        grade.distortion = 0.09 + intensity * 0.05;
        grade.grain = 0.2 + intensity * 0.06;
        grade.vignette = 0.7 - intensity * 0.12;
        context.post.setBloom(0.6 + intensity * 0.35, 0.7, 0.69);
        context.rig.setRoll(0.12 + Math.sin(elapsed * 0.7) * 0.03 * intensity);
      },
      beat() {
        const state = director.state;
        return { id: state.beat.id, index: state.index, t: state.t, finished: state.finished };
      },
      advance() {
        director.advance();
      },
    };
  },
};

// --- the out-of-body view -------------------------------------------------------

const LIFT_BEATS: readonly Beat[] = [
  { id: 'above', seconds: 16 },
  { id: 'looking-down', seconds: 20, caption: 'That is the room. He is still in it.' },
  { id: 'rising', seconds: 20 },
  { id: 'away', seconds: 16 },
  { id: 'wait', seconds: 1, hold: true },
];

export const outOfBodyScene: SceneDefinition = {
  id: 'threshold.out-of-body',
  title: 'From above',
  exits: [{ id: 'onward', label: 'Onward', to: 'threshold.tunnel' }],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.outside;
    const air = airShell(context.resources, { radius: 90, ground: grammar.ground, glow: 0x24384a, density: 1 });
    context.scene.add(air.mesh);

    const room = rememberedRoom(context, grammar.glow);
    context.scene.add(room.group);

    // Other lights, further off. A city of other lives, none of them aware.
    // The other lives, seen from above. Large and bright enough to give the lift
    // something to be measured against — without them the frame has no scale and
    // no lit pixel at all.
    const distant = moteField(context.resources, context.rng.stream('distant'), {
      count: 1600,
      radius: 46,
      color: 0xdce9f4,
      size: 0.5,
    });
    context.scene.add(distant.points);

    const director = new Director(LIFT_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 8);
      }
    });

    // The lift is authored, but look is still the player's. Movement the player
    // cannot stop plus attention the player keeps is the whole feeling here.
    const start = new Vector3(0.35, 3.1, 2.4);
    context.rig.setMode('drifting');
    context.rig.position.copy(start);
    context.rig.target.copy(start);
    context.rig.orient(Math.PI * 0.02, -0.62);
    context.rig.setSway(0.42);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = grammar.drain;
    grade.grain = grammar.grain;
    grade.vignette = 0.5;
    grade.aberration = 0.0016;
    grade.distortion = 0.03;
    grade.exposure = 1.3;
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(grammar.bloom, 0.62, 0.75);

    context.audio.room(0.1, 520);
    context.audio.drone(0.15, 52, 2);
    context.audio.ring(0.1, 2500);
    context.audio.heartbeat(false);

    return {
      update(delta, elapsed) {
        director.update(delta);
        const { beat, t } = director.state;

        setU(air.material, 'uTime', elapsed);
        room.update(delta, elapsed);
        distant.drift(delta, elapsed);
        distant.points.rotation.y = elapsed * 0.006;

        // One continuous rise across three beats. Slow enough that the player
        // chooses when to look down, which is the beat that has to land.
        const climb = beat.id === 'above'
          ? ease.out(t) * 0.12
          : beat.id === 'looking-down'
            ? 0.12 + t * 0.14
            : beat.id === 'rising'
              ? 0.26 + ease.inOut(t) * 0.42
              : beat.id === 'away'
                ? 0.68 + ease.in(t) * 0.32
                : 1;

        context.rig.target.set(0.35, 3.1 + climb * 26, 2.4 + climb * 5.5);

        // The room thins with distance rather than shrinking out of sight.
        room.setPresence(Math.max(0, 1 - climb * 1.15));

        grade.vignette = 0.5 - climb * 0.16;
        grade.drain = grammar.drain - climb * 0.3;
        grade.exposure = 1.3 + climb * 0.16;
        context.post.setBloom(grammar.bloom + climb * 0.5, 0.62, 0.3 - climb * 0.1);

        // The ring thins out into something more like a held note as the room
        // falls away, which is the first hint of the tunnel.
        context.audio.ring(0.1 - climb * 0.07, 2500 - climb * 900);
        context.audio.drone(0.15 + climb * 0.12, 52 + climb * 14, 2 + climb * 8);
        context.audio.room(0.1 - climb * 0.09, 520);

        if (beat.id === 'away' && t > 0.7) {
          context.captions.show('There is somewhere else to be.', 7);
        }
      },
      beat() {
        const state = director.state;
        return { id: state.beat.id, index: state.index, t: state.t, finished: state.finished };
      },
      advance() {
        director.advance();
      },
    };
  },
};
