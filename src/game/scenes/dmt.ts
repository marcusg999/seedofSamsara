import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import type { ResourceTracker } from '../disposal';
import { GRAMMAR, colorOf } from '../systems/palette';
import { Director, ease, type Beat } from '../systems/director';
import { moteField, volumetricGlow } from '../systems/forms';
import { hyperspaceField } from '../systems/hyperspace';
import { NOISE, setU } from '../systems/glsl';
import { Overlay } from '../systems/overlay';
import { recordUnlock } from '../systems/incarnation';

/**
 * Vignette 7 and the thread it opens: `death.dmt`, `dmt.hyperspace`,
 * `dmt.sent-back`.
 *
 * GAME_BRIEF.md § Act 1 calls this one the edge case: "the player may be sent
 * back, the classic 'it is not your time' NDE, which unlocks an alternate
 * thread". It is the only death in the game the player can survive, and the
 * whole shape of these three scenes is built around that: a man, the place he
 * lives, a journey out of it, and then — this is the part that has to land — the
 * same place again, with him still in it.
 *
 * Lore: `L-DMT-01` and `L-DMT-02` are the licence for this vignette to sit
 * beside the six deaths and to lead into the same Threshold — the overlap with
 * near-death experience on the Greyson scale was measured, not asserted.
 * `L-DMT-03` is the entities, which "appear aware of, and responsive to, the
 * experiencer" and are therefore built to track, respond and close in rather
 * than to stand around being scenery. `L-THRESH-09` is the return itself:
 * reluctance to come back, and lasting change afterwards.
 *
 * CONTENT RULE, CLAUDE.md § Content rules: "The DMT vignette depicts the
 * experience only. No dosing or preparation detail." So the vignette opens at
 * the threshold with it already beginning. Nothing is obtained, measured,
 * prepared or taken on screen or in text; no quantity, route or method is named
 * or implied; there is no object anywhere in the room that belongs to one. What
 * is in the room is a lamp, a window, a carpet, a half-painted wall and a
 * doorframe with pencil marks on it — which is to say, a person. That is the
 * whole subject: what he perceives, and who he is while he perceives it.
 *
 * The lore bible makes the same refusal in § 6 and cites the study only at the
 * level of its design, which is all traceability needs.
 */

// --- the flat ------------------------------------------------------------------

/**
 * The room he is in, and the room he comes back to.
 *
 * Built once and used by both `death.dmt` and `dmt.sent-back` on purpose: the
 * return only means something if it is demonstrably the same place, down to the
 * line where the paint stops. Two separately modelled rooms would read as two
 * rooms.
 *
 * `fold` is the one control. At 0 it is an ordinary Sunday evening. As it rises
 * the carpet starts to move, the geometry of the place gains rings that were
 * never in it, and the colour comes *up* rather than draining away — which is
 * what separates this register from the moment of death in every other vignette.
 */
function buildFlat(context: SceneContext): {
  group: Group;
  setFold(fold: number): void;
  update(delta: number, elapsed: number): void;
} {
  const { resources, rng } = context;
  const group = new Group();

  const width = 4.6;
  const depth = 5.4;
  const height = 2.5;
  const lamp = new Vector3(1.35, 0.26, -0.4);

  // --- carpet ------------------------------------------------------------
  // A shader rather than a texture, because the carpet is the first thing in
  // the room to stop holding still and a texture cannot do that.
  const carpetMaterial = resources.track(
    new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFold: { value: 0 },
        uBase: { value: colorOf(0x2a2026) },
        uFigure: { value: colorOf(0x8a5f4a) },
        uLamp: { value: lamp.clone() },
        uWarm: { value: colorOf(0xffb878) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uFold;
        uniform vec3 uBase;
        uniform vec3 uFigure;
        uniform vec3 uWarm;
        uniform vec3 uLamp;
        varying vec3 vWorld;

        ${NOISE}

        void main() {
          vec2 q = vWorld.xz * 2.3;

          // The breathing. At fold 0 this term is zero and the pattern is a
          // pattern; as the fold rises the weave starts to move against itself,
          // which is the oldest and truest thing anyone reports about a carpet.
          q += vec2(sin(q.y * 3.1 + uTime * 0.62), cos(q.x * 2.8 - uTime * 0.51))
            * uFold * 0.26;

          vec2 cell = fract(q) - 0.5;
          float ring = abs(length(cell) - 0.29);
          float weave = smoothstep(0.075, 0.0, ring);
          float lattice = smoothstep(0.44, 0.49, max(abs(cell.x), abs(cell.y)));
          float figure = max(weave, lattice * 0.65);

          float pile = fbm(vec3(vWorld.xz * 7.0, uTime * 0.03 * uFold), 3);
          vec3 color = mix(uBase, uFigure, figure * (0.5 + pile * 0.6));

          // Lit by the lamp on the floor beside him, so the pattern is brightest
          // where the light sits and the far corners of the room go dark. The
          // room is composed by one practical, as it would be in life.
          float toLamp = length(vWorld - uLamp);
          float fall = 1.7 / (1.0 + toLamp * toLamp * 0.85);
          color *= 0.2 + fall * (0.95 + uFold * 0.9);
          color += uWarm * fall * 0.1;

          // Colour arrives rather than drains: the figure in the weave starts
          // emitting its own light, which is not a thing carpets do.
          color += uFigure * figure * uFold * uFold * 0.55;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
  const floorGeometry = resources.track(new PlaneGeometry(width, depth));
  const floor = new Mesh(floorGeometry, carpetMaterial);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // --- shell -------------------------------------------------------------
  const ceilingMaterial = resources.track(
    new MeshStandardMaterial({ color: 0x241f26, roughness: 0.95, metalness: 0 }),
  );
  const ceiling = new Mesh(floorGeometry, ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  group.add(ceiling);

  const plainWall = resources.track(
    new MeshStandardMaterial({ color: 0x2b242b, roughness: 0.93, metalness: 0 }),
  );

  const sideGeometry = resources.track(new PlaneGeometry(depth, height));
  const leftWall = new Mesh(sideGeometry, plainWall);
  leftWall.position.set(-width / 2, height / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  group.add(leftWall);

  const rightWall = new Mesh(sideGeometry, plainWall);
  rightWall.position.set(width / 2, height / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  group.add(rightWall);

  const backGeometry = resources.track(new PlaneGeometry(width, height));
  const nearWall = new Mesh(backGeometry, plainWall);
  nearWall.position.set(0, height / 2, depth / 2);
  nearWall.rotation.y = Math.PI;
  group.add(nearWall);

  // --- the hall wall: half-painted ---------------------------------------
  // The whole characterisation of this man is one horizontal line two thirds of
  // the way up a wall, and the fact that it has been there since April.
  const paintedHeight = 1.5;
  const freshMaterial = resources.track(
    new MeshStandardMaterial({ color: 0x4e6a5e, roughness: 0.72, metalness: 0 }),
  );
  const oldMaterial = resources.track(
    new MeshStandardMaterial({ color: 0x6e6356, roughness: 0.95, metalness: 0 }),
  );
  const freshGeometry = resources.track(new PlaneGeometry(width, paintedHeight));
  const fresh = new Mesh(freshGeometry, freshMaterial);
  fresh.position.set(0, paintedHeight / 2, -depth / 2 + 0.01);
  group.add(fresh);

  const oldGeometry = resources.track(new PlaneGeometry(width, height - paintedHeight));
  const old = new Mesh(oldGeometry, oldMaterial);
  old.position.set(0, paintedHeight + (height - paintedHeight) / 2, -depth / 2 + 0.01);
  group.add(old);

  // The roller, dried into the tray. Left exactly where it was put down.
  const trayGeometry = resources.track(new BoxGeometry(0.42, 0.05, 0.3));
  const trayMaterial = resources.track(
    new MeshStandardMaterial({ color: 0x3c4a44, roughness: 0.8, metalness: 0.05 }),
  );
  const tray = new Mesh(trayGeometry, trayMaterial);
  tray.position.set(-1.25, 0.025, -depth / 2 + 0.42);
  group.add(tray);

  const rollerGeometry = resources.track(new CylinderGeometry(0.045, 0.045, 0.22, 14));
  const roller = new Mesh(rollerGeometry, freshMaterial);
  roller.position.set(-1.25, 0.09, -depth / 2 + 0.42);
  roller.rotation.z = Math.PI / 2;
  group.add(roller);

  // --- the doorframe, and the marks on it --------------------------------
  const frameMaterial = resources.track(
    new MeshStandardMaterial({ color: 0x8c8378, roughness: 0.84, metalness: 0 }),
  );
  const jambGeometry = resources.track(new BoxGeometry(0.08, 2.05, 0.1));
  for (const x of [0.62, 1.62] as const) {
    const jamb = new Mesh(jambGeometry, frameMaterial);
    jamb.position.set(x, 1.02, -depth / 2 + 0.06);
    group.add(jamb);
  }
  const lintelGeometry = resources.track(new BoxGeometry(1.08, 0.08, 0.1));
  const lintel = new Mesh(lintelGeometry, frameMaterial);
  lintel.position.set(1.12, 2.05, -depth / 2 + 0.06);
  group.add(lintel);

  // Beyond the frame: the hall, unlit. A dark rectangle gives the room a
  // somewhere-else, which a flat wall cannot.
  const hallGeometry = resources.track(new PlaneGeometry(0.92, 2.0));
  const hallMaterial = resources.track(new MeshBasicMaterial({ color: 0x0b0a0d }));
  const hall = new Mesh(hallGeometry, hallMaterial);
  hall.position.set(1.12, 1.0, -depth / 2 + 0.03);
  group.add(hall);

  // Eight pencil marks, climbing. Eight birthdays, read as a shape and never
  // detailed — the caption does the rest, and does it in nine words.
  const markGeometry = resources.track(new BoxGeometry(0.075, 0.008, 0.012));
  const markMaterial = resources.track(
    new MeshStandardMaterial({
      color: 0xd8cdbc,
      roughness: 0.9,
      metalness: 0,
      // Faintly self-lit, because these are the detail the scene is about and
      // they sit on the darkest part of the frame.
      emissive: 0x5a5146,
      emissiveIntensity: 1,
    }),
  );
  const marks = rng.stream('doorframe-marks');
  for (let index = 0; index < 8; index += 1) {
    const mark = new Mesh(markGeometry, markMaterial);
    // Rising, with the uneven spacing of real years.
    const y = 0.78 + index * 0.1 + marks.range(-0.014, 0.014);
    mark.position.set(0.68 + marks.range(-0.004, 0.004), y, -depth / 2 + 0.115);
    mark.rotation.z = marks.range(-0.05, 0.05);
    group.add(mark);
  }

  // --- the window --------------------------------------------------------
  const paneGeometry = resources.track(new PlaneGeometry(1.5, 1.2));
  const paneMaterial = resources.track(
    new MeshStandardMaterial({
      color: 0x7a6ea8,
      emissive: 0x4e4682,
      emissiveIntensity: 1.2,
      roughness: 1,
    }),
  );
  const pane = new Mesh(paneGeometry, paneMaterial);
  pane.position.set(-width / 2 + 0.02, 1.5, -0.5);
  pane.rotation.y = Math.PI / 2;
  group.add(pane);

  const outside = volumetricGlow(resources, {
    radius: 1.5,
    color: 0x8878c0,
    intensity: 0.5,
    softness: 2.5,
  });
  outside.mesh.position.set(-width / 2 - 0.4, 1.5, -0.5);
  group.add(outside.mesh);

  const mullionGeometry = resources.track(new BoxGeometry(0.05, 1.22, 0.035));
  const mullion = new Mesh(mullionGeometry, frameMaterial);
  mullion.position.set(-width / 2 + 0.06, 1.5, -0.5);
  mullion.rotation.y = Math.PI / 2;
  group.add(mullion);

  // --- the lamp on the floor ---------------------------------------------
  const bulbGeometry = resources.track(new SphereGeometry(0.06, 16, 12));
  const bulbMaterial = resources.track(new MeshBasicMaterial({ color: 0xffd9a4 }));
  const bulb = new Mesh(bulbGeometry, bulbMaterial);
  bulb.position.copy(lamp);
  group.add(bulb);

  const lampGlow = volumetricGlow(resources, {
    radius: 0.62,
    color: 0xffc484,
    intensity: 1.05,
    softness: 2.3,
  });
  lampGlow.mesh.position.copy(lamp);
  group.add(lampGlow.mesh);

  const lampLight = new PointLight(0xffbe82, 13, 8, 2);
  lampLight.position.copy(lamp);
  group.add(lampLight);
  resources.onDispose(() => {
    lampLight.dispose();
  });

  const bounce = new HemisphereLight(0x6a5f96, 0x3a2c26, 0.5);
  group.add(bounce);
  resources.onDispose(() => {
    bounce.dispose();
  });

  const windowLight = new DirectionalLight(0x8e7fc4, 1.1);
  windowLight.position.set(-6, 3, -1);
  windowLight.target.position.set(0.6, 1, -1.8);
  group.add(windowLight);
  group.add(windowLight.target);
  resources.onDispose(() => {
    windowLight.dispose();
  });

  // --- the architecture that arrives -------------------------------------
  // Three rings that are not in the room at fold 0 and are unmistakeably in it
  // by fold 1. Thin, additive and banded, so they read as structure made of
  // light rather than as hoops someone left lying about.
  const ringMaterial = resources.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: colorOf(GRAMMAR.hyperspace.glow) },
        uAccent: { value: colorOf(GRAMMAR.hyperspace.accent) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        varying vec2 vUv;

        void main() {
          // Bands running around the ring, plus a slower travelling swell, so
          // the structure is always moving along itself.
          float bands = sin(vUv.x * 170.0 - uTime * 2.1) * 0.5 + 0.5;
          bands = pow(bands, 3.0);
          float swell = 0.5 + 0.5 * sin(vUv.x * 18.85 + uTime * 0.8);
          vec3 tint = mix(uAccent, uColor, swell);
          float density = (0.22 + bands * 0.95) * uIntensity;
          gl_FragColor = vec4(tint * density, clamp(density, 0.0, 1.0));
        }
      `,
    }),
  );

  const ringGeometry = resources.track(new TorusGeometry(1, 0.016, 6, 128));
  const rings = [
    { mesh: new Mesh(ringGeometry, ringMaterial), axis: new Vector3(0, 1, 0), speed: 0.21, size: 1.5 },
    { mesh: new Mesh(ringGeometry, ringMaterial), axis: new Vector3(1, 0, 0.3), speed: -0.17, size: 1.1 },
    { mesh: new Mesh(ringGeometry, ringMaterial), axis: new Vector3(0.4, 0.6, 1), speed: 0.13, size: 1.9 },
  ] as const;
  for (const ring of rings) {
    ring.mesh.position.set(0.4, 1.1, -1.5);
    group.add(ring.mesh);
  }

  const dust = moteField(resources, rng.stream('flat-dust'), {
    count: 260,
    radius: 2.1,
    color: 0xffcf9c,
    size: 0.03,
  });
  dust.points.position.set(0.4, 1.1, -0.8);
  group.add(dust.points);

  let fold = 0;

  return {
    group,
    setFold(next) {
      fold = Math.min(1, Math.max(0, next));
    },
    update(delta, elapsed) {
      setU(carpetMaterial, 'uTime', elapsed);
      setU(carpetMaterial, 'uFold', fold);
      setU(ringMaterial, 'uTime', elapsed);
      // The rings do not exist below a fold of about 0.15, which keeps the
      // ordinary half of the vignette genuinely ordinary.
      setU(ringMaterial, 'uIntensity', Math.max(0, fold - 0.15) * 1.5);
      outside.update(elapsed, context.camera);
      lampGlow.update(elapsed, context.camera);
      setU(lampGlow.material, 'uIntensity', 1.05 + fold * 0.9);
      dust.drift(delta, elapsed);

      for (const ring of rings) {
        const grown = ring.size * (0.25 + ease.out(fold) * 0.95);
        ring.mesh.scale.setScalar(grown);
        ring.mesh.rotateOnAxis(ring.axis.clone().normalize(), ring.speed * delta * (0.4 + fold * 2.2));
      }

      // The room's own surfaces start emitting. Colour arriving, not leaving.
      const lit = fold * fold;
      freshMaterial.emissive.setHex(0x1b2c24);
      freshMaterial.emissiveIntensity = lit * 1.6;
      oldMaterial.emissive.setHex(0x2a2018);
      oldMaterial.emissiveIntensity = lit * 1.2;
      paneMaterial.emissiveIntensity = 1.2 + lit * 1.4;
      lampLight.intensity = 13 + lit * 8;
    },
  };
}

// --- vignette 7: the threshold of it -------------------------------------------

/**
 * 110 seconds of authored time, then the closing image holds for
 * `GRACE_SECONDS` and lets go by itself (GAME_BRIEF.md § Act 1, pacing rule).
 *
 * The first four beats are a man in a room and nothing else happens in them,
 * because the player has to care about him before any of this is worth watching
 * — and because what he is about to be offered is specifically his life back,
 * which is worthless as a gift if we never saw it.
 */
const DMT_BEATS: readonly Beat[] = [
  { id: 'already-going', seconds: 14, caption: 'Sunday evening. It has already started.' },
  { id: 'the-room', seconds: 16 },
  { id: 'the-hall', seconds: 16, caption: 'He started painting the hall in April.' },
  { id: 'the-doorframe', seconds: 16, caption: 'Pencil marks on the doorframe. One for every birthday.' },
  { id: 'tuesday', seconds: 12, caption: 'She comes back Tuesday.' },
  { id: 'breathing', seconds: 14, caption: 'The carpet is breathing. It has always been breathing.' },
  { id: 'folding', seconds: 14 },
  { id: 'given-way', seconds: 8 },
  { id: 'gone', seconds: 1, hold: true },
];

/** How long a closing image holds before the scene moves on by itself. */
const GRACE_SECONDS = 10;

/** How far the fold has come, per beat. 0 is an ordinary room. */
const FOLD_AT: Record<string, [number, number]> = {
  'already-going': [0, 0.04],
  'the-room': [0.04, 0.08],
  'the-hall': [0.08, 0.11],
  'the-doorframe': [0.11, 0.14],
  tuesday: [0.14, 0.18],
  breathing: [0.18, 0.52],
  folding: [0.52, 0.9],
  'given-way': [0.9, 1],
  gone: [1, 1],
};

function foldFor(beatId: string, t: number): number {
  const span = FOLD_AT[beatId];
  if (!span) {
    return 0;
  }
  return span[0] + (span[1] - span[0]) * ease.inOut(t);
}

export const deathDmtScene: SceneDefinition = {
  id: 'death.dmt',
  title: 'Sunday evening',
  exits: [{ id: 'onward', label: 'Let it open', to: 'dmt.hyperspace' }],
  contentNotes: [
    'A psychedelic experience, shown from inside it. It is the one death in the game you can survive.',
    'The experience only: nothing is obtained, prepared or taken on screen or in text, and no substance, '
      + 'quantity or method is named.',
    'Fast-moving geometric pattern, strong colour and bloom.',
  ],
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.living;
    const flat = buildFlat(context);
    context.scene.add(flat.group);

    const director = new Director(DMT_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 7);
      }
    });

    // Sitting on the floor with his back to the near wall, looking down the room
    // at the half-painted wall and the doorframe. Eye height is a seated eye.
    const seatedEye = 0.95;
    context.rig.setMode('embodied');
    context.rig.position.set(-0.1, seatedEye, 1.75);
    context.rig.orient(-0.08, -0.12);
    context.rig.setSway(1);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = grammar.drain;
    grade.grain = grammar.grain;
    grade.vignette = 0.42;
    grade.aberration = 0.0012;
    grade.distortion = 0.022;
    grade.exposure = 1.3;
    grade.washColor = [1, 0.95, 0.88];
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(grammar.bloom, 0.6, 0.8);

    context.audio.room(0.26, 1100);
    context.audio.drone(0.1, 46);
    context.audio.heartbeat(true, 64, 0.3);

    let holdBeganAt: number | undefined;
    let leaving = false;

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;

        const fold = foldFor(beat.id, t);
        flat.setFold(fold);
        flat.update(delta, elapsed);

        // The frame does not narrow the way it does in the other vignettes. It
        // widens: the vignette opens, the colour comes up, the lens begins to
        // disagree with itself at the edges, and the room gets brighter rather
        // than dimmer. Nothing here is being taken away.
        grade.vignette = 0.42 - fold * 0.26;
        grade.drain = grammar.drain * (1 - fold);
        grade.aberration = 0.0012 + fold * 0.0055;
        grade.distortion = 0.022 + fold * 0.075;
        grade.grain = grammar.grain - fold * 0.05;
        grade.exposure = 1.3 + fold * 0.14;
        grade.washAmount = Math.max(0, fold - 0.7) * 0.06;
        context.post.setBloom(grammar.bloom + fold * 0.6, 0.62, Math.max(0.52, 0.8 - fold * 0.26));

        // The body stays where it is and the heart stays calm. This is not a
        // crisis, and nothing about the camera should claim it is.
        const breath = 60 + fold * 14;
        context.audio.heartbeat(true, breath, 0.3);
        context.rig.setPulse(0.1 + fold * 0.16);
        context.rig.position.set(-0.1, seatedEye - fold * 0.07, 1.75 - fold * 0.25);

        // The room loses its top end and gains a whole register underneath it.
        context.audio.room(0.26 - fold * 0.2, 1100 - fold * 820);
        context.audio.drone(0.1 + fold * 0.22, 46 - fold * 8, fold * 12);
        context.audio.shimmer(Math.max(0, fold - 0.2) * 0.5);
        context.audio.ring(Math.max(0, fold - 0.5) * 0.14, 1700 + fold * 500);

        if (beat.id === 'gone' && t >= 1) {
          context.captions.show('Let it open.', 8);
          holdBeganAt ??= elapsed;
          if (!leaving && elapsed - holdBeganAt >= GRACE_SECONDS) {
            leaving = true;
            void context.takeExit('onward');
          }
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

// --- hyperspace ----------------------------------------------------------------

/**
 * An entity, built to be aware of the player (`L-DMT-03`).
 *
 * Abstract and geometric rather than figurative: these are not the loved ones of
 * `threshold.loved-ones`, and a humanoid silhouette would say the wrong thing
 * about them. An octahedron reads as *made*, and it is the same symmetry the
 * architecture around it is folded from, which is the point — they belong to
 * this place and the player does not.
 *
 * Awareness is behaviour, not decoration. Each one tracks where the player is
 * actually looking; being looked at makes it cohere and hold its distance, and
 * being ignored makes it close in. A player who never looks away is attended to
 * from a polite distance. A player who looks away finds them nearer than they
 * were.
 */
function watcher(
  tracker: ResourceTracker,
  options: { radius: number; color: number; accent: number; seed: number },
): { group: Group; material: ShaderMaterial } {
  const group = new Group();
  const geometry = tracker.track(new OctahedronGeometry(options.radius, 1));
  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: colorOf(options.color) },
        uAccent: { value: colorOf(options.accent) },
        uSeed: { value: options.seed },
        /** 0 = unattended to, 1 = the player has its full regard. */
        uRegard: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormalView;
        varying vec3 vLocal;
        void main() {
          vNormalView = normalize(normalMatrix * normal);
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        uniform float uSeed;
        uniform float uRegard;
        varying vec3 vNormalView;
        varying vec3 vLocal;

        ${NOISE}

        void main() {
          float facing = clamp(dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
          float rim = pow(1.0 - facing, 1.7);

          // Unattended, the facets churn and the thing is barely a thing. Under
          // regard they lock, which is the moment it becomes somebody.
          float churn = fbm(vLocal * 2.6 + vec3(uSeed, uTime * 0.55, uSeed * 0.3), 3);
          float coherence = mix(0.25 + churn * 0.9, 0.95, uRegard);

          float body = (rim * 0.78 + 0.22) * coherence;
          vec3 tint = mix(uAccent, uColor, clamp(rim + uRegard * 0.35, 0.0, 1.0));
          float lit = body * (0.55 + uRegard * 0.95);
          gl_FragColor = vec4(tint * lit, clamp(lit, 0.0, 1.0) * 0.9);
        }
      `,
    }),
  );
  const mesh = new Mesh(geometry, material);
  group.add(mesh);
  return { group, material };
}

const HYPERSPACE_BEATS: readonly Beat[] = [
  { id: 'arrival', seconds: 14 },
  { id: 'architecture', seconds: 18, caption: 'The architecture keeps deciding what it is.' },
  { id: 'noticed', seconds: 16, caption: 'Something turns toward you. It was already here.' },
  { id: 'attended', seconds: 20, caption: 'It is not surprised by you. You are the surprise.' },
  { id: 'shown', seconds: 18, caption: 'Not yet. Not you, not yet.' },
  { id: 'release', seconds: 10 },
  { id: 'held', seconds: 1, hold: true },
];

/**
 * What this crossing would hand to the afterlife if it turned out to be real
 * (GAME_BRIEF.md § Act 1: each death sets the starting state of the afterlife).
 *
 * Light, and deliberately the lightest in the game: nothing here is violent and
 * nothing is unjust, and the person is not fighting it. Recorded as a design
 * choice, not a finding — lore bible § 12.6 flags the whole "worse death,
 * heavier start" curve as unresolved, and `L-ARREST-02` is mild evidence
 * against it.
 */
const CROSSING_ATTACHMENT = 0.08;

export const dmtHyperspaceScene: SceneDefinition = {
  id: 'dmt.hyperspace',
  title: 'Hyperspace',
  exits: [
    // The edge case has two sides and the graph has to say so. Being sent back
    // is what the brief calls the classic case and it is what happens if the
    // player does nothing; going on leads into the same Threshold as the six
    // deaths, which is what `L-DMT-02`'s measured overlap licenses.
    { id: 'sent-back', label: 'Be sent back', to: 'dmt.sent-back' },
    { id: 'cross-over', label: 'Go on', to: 'threshold.pronounced-dead' },
  ],
  discarnate: true,
  contentNotes: ['Raymarched fractal pattern, strong colour and motion. Entities that react to you.'],
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.hyperspace;

    const field = hyperspaceField(context.resources, {
      renderer: context.renderer,
      width: context.viewport.width,
      height: context.viewport.height,
      deep: grammar.ground,
      accent: grammar.accent,
      glow: grammar.glow,
    });
    context.scene.add(field.backdrop);

    // Entities. Four, on a ring, at seeded angles so a run is reproducible.
    const rng = context.rng.stream('watchers');
    const watchers = [0, 1, 2, 3].map((index) => {
      const entity = watcher(context.resources, {
        radius: 0.5 + rng.range(0, 0.34),
        color: grammar.glow,
        accent: grammar.accent,
        seed: rng.range(0, 40),
      });
      const halo = volumetricGlow(context.resources, {
        radius: 1.1,
        color: grammar.glow,
        intensity: 0.2,
        softness: 2.6,
      });
      entity.group.add(halo.mesh);
      context.scene.add(entity.group);
      return {
        entity,
        halo,
        angle: (index / 4) * Math.PI * 2 + rng.range(-0.3, 0.3),
        drift: rng.range(0.035, 0.085) * (rng.chance(0.5) ? 1 : -1),
        height: rng.range(-0.9, 1.1),
        bob: rng.range(0, Math.PI * 2),
        distance: 8.5,
        regard: 0,
      };
    });

    const motes = moteField(context.resources, context.rng.stream('hyper-motes'), {
      count: 900,
      radius: 9,
      color: grammar.accent,
      size: 0.05,
    });
    context.scene.add(motes.points);

    const director = new Director(HYPERSPACE_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 9);
      }
    });

    context.rig.setMode('drifting');
    context.rig.position.set(0, 0, 0);
    context.rig.target.set(0, 0, 0);
    context.rig.orient(0, 0.02);
    context.rig.setSway(0.5);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = grammar.drain;
    grade.grain = grammar.grain;
    grade.vignette = 0.26;
    grade.aberration = 0.0045;
    grade.distortion = 0.06;
    // Deliberately near 1. The field already carries its own saturating curve
    // and the march's brightest pixels are its structure; pushing exposure here
    // would clip exactly the edges the eye reads the architecture from.
    grade.exposure = 1.08;
    grade.washColor = [1, 0.9, 0.78];
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(grammar.bloom, 0.68, 0.74);

    context.audio.drone(0.26, 51, 11);
    context.audio.shimmer(0.3);
    context.audio.ring(0.07, 2200);
    context.audio.room(0.04, 300);
    context.audio.heartbeat(false);

    let overlay: Overlay | undefined;
    let offered = false;
    let handedOver = false;
    let holdBeganAt: number | undefined;
    let leaving = false;
    let lastElapsed = 0;
    const scratch = new Vector3();

    context.resources.onDispose(() => {
      overlay?.dispose();
      overlay = undefined;
    });

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;

        // Real wall-clock frame time, not the loop's clamped animation delta.
        // The resolution controller needs to see a two-second frame as two
        // seconds or it will never come down off a software renderer.
        const frameSeconds = Math.max(0, elapsed - lastElapsed);
        lastElapsed = elapsed;

        // How far the place has opened out, 0..1 across the whole scene.
        const open = beat.id === 'arrival'
          ? ease.out(t) * 0.3
          : beat.id === 'architecture'
            ? 0.3 + ease.inOut(t) * 0.3
            : beat.id === 'release'
              ? 0.9 - t * 0.35
              : beat.id === 'held'
                ? 0.55
                : 0.6 + Math.min(0.3, t * 0.3);

        // The void around the viewer widens as the place opens, which both reads
        // as the architecture drawing back and keeps the march from ever
        // starting inside a solid cell.
        field.setOpen(1.15 + open * 1.5);

        // Drifting through the structure. The field is anchored in world space,
        // so moving the rig genuinely moves through it.
        context.rig.target.set(
          Math.sin(elapsed * 0.06) * 1.2,
          Math.sin(elapsed * 0.045 + 1.4) * 0.8,
          -elapsed * 0.32,
        );

        // --- the entities ---------------------------------------------------
        const present = beat.id === 'arrival' || beat.id === 'architecture'
          ? 0.3 + ease.out(Math.min(1, open * 2.2)) * 0.7
          : 1;
        let regardTotal = 0;

        for (const entry of watchers) {
          entry.angle += entry.drift * delta;
          // Being looked at holds them where they are. Being ignored brings them
          // in. This is the whole mechanic and it is four lines long.
          const held = 2.9 + entry.regard * 2.6;
          const closing = (1 - entry.regard) * 0.5 * delta;
          entry.distance = Math.max(held, entry.distance - closing);
          if (present < 0.2) {
            entry.distance = 8.5;
          }

          const centre = context.rig.position;
          entry.entity.group.position.set(
            centre.x + Math.cos(entry.angle) * entry.distance,
            centre.y + entry.height + Math.sin(elapsed * 0.4 + entry.bob) * 0.22,
            centre.z - Math.sin(entry.angle) * entry.distance - 1.2,
          );
          // Always turned toward the player, whatever else it is doing.
          entry.entity.group.lookAt(context.camera.position);

          const looking = present > 0.45
            && context.rig.isLookingAt(entry.entity.group.getWorldPosition(scratch), 24);
          const toward = looking ? 1 : 0;
          entry.regard += (toward - entry.regard) * (1 - Math.exp(-2.6 * delta));
          regardTotal += entry.regard;

          setU(entry.entity.material, 'uTime', elapsed);
          setU(entry.entity.material, 'uRegard', entry.regard * present);
          entry.halo.update(elapsed, context.camera);
          setU(entry.halo.material, 'uIntensity', (0.12 + entry.regard * 0.5) * present);
          entry.entity.group.scale.setScalar(0.35 + present * 0.65);
        }

        const attention = watchers.length > 0 ? regardTotal / watchers.length : 0;
        field.setAttention(attention * present);
        field.render(context.camera, elapsed, frameSeconds);

        motes.drift(delta, elapsed);

        grade.aberration = 0.0045 + attention * 0.003;
        grade.distortion = 0.06 - open * 0.02;
        grade.vignette = 0.26 - open * 0.08;
        context.post.setBloom(grammar.bloom + attention * 0.25, 0.68, 0.74);

        context.audio.shimmer(0.3 + attention * 0.35 + open * 0.15);
        context.audio.drone(0.26 + open * 0.08, 51, 11 + attention * 9);
        context.audio.ring(0.07 + attention * 0.05, 2200);

        // The fork. The entities decide, not the player — but the brief says the
        // player *may* be sent back, so the choice is offered plainly and the
        // default is the one the brief calls classic.
        if (!offered && (beat.id === 'shown' || beat.id === 'release' || beat.id === 'held')) {
          offered = true;
          overlay = new Overlay({
            title: 'Not yet.',
            body:
              'This is the one death you can survive. Being sent back is the classic case, '
              + 'and it is what happens if you do nothing. Going on leads into the Threshold, '
              + 'the same one the other six deaths lead into.',
            actions: [
              {
                id: 'sent-back',
                label: 'Be sent back',
                onPick: () => {
                  leaving = true;
                  void context.takeExit('sent-back');
                },
              },
              {
                id: 'cross-over',
                label: 'Go on',
                onPick: () => {
                  leaving = true;
                  void context.takeExit('cross-over');
                },
              },
            ],
            hint: 'Do nothing and you will be sent back.',
          });
          overlay.focusFirst();
        }

        // If it does turn out to have been the crossing, the afterlife needs its
        // opening state set before the Threshold is reached.
        if (!handedOver && (beat.id === 'release' || beat.id === 'held')) {
          handedOver = true;
          context.soul.attachment = CROSSING_ATTACHMENT;
          context.soul.will = 1 - CROSSING_ATTACHMENT * 0.5;
        }

        if (beat.id === 'held' && t >= 1) {
          holdBeganAt ??= elapsed;
          if (!leaving && elapsed - holdBeganAt >= GRACE_SECONDS) {
            leaving = true;
            void context.takeExit('sent-back');
          }
        }
      },
      resize(width, height) {
        field.resize(width, height);
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

// --- sent back -----------------------------------------------------------------

const SENT_BACK_BEATS: readonly Beat[] = [
  { id: 'falling-back', seconds: 12 },
  { id: 'the-room-again', seconds: 16, caption: 'Carpet. Window. His own hands.' },
  { id: 'breath', seconds: 14, caption: 'His heart is going like someone knocking.' },
  { id: 'kept', seconds: 18, caption: 'He is still here. He gets to stay.' },
  { id: 'unfinished', seconds: 16, caption: 'The hall is still half-painted. Tuesday is still Tuesday.' },
  { id: 'carried', seconds: 16, caption: 'Nothing was explained. Everything is different.' },
  { id: 'onward', seconds: 1, hold: true },
];

/** What the return leaves behind, and the only thing that outlives it. */
const RETURN_SHARD = 'dmt.the-architecture';
const RETURN_WISDOM = 'That you were sent back once, and did not finish the hall that week either.';

export const dmtSentBackScene: SceneDefinition = {
  id: 'dmt.sent-back',
  title: 'It is not your time',
  exits: [
    // He is alive. The game's lives begin where a life is chosen, so this is the
    // way back into one — and the death he was shown is still ahead of him.
    { id: 'live-on', label: 'Back into the life', to: 'vignette-select' },
    // The thread this unlocks, declared so the graph describes the real shape of
    // the game. The graph check reports it as planned-not-built rather than as a
    // softlock, exactly as `threshold.choice` does for Path B.
    { id: 'the-thread', label: 'What came back with him', to: 'past-life.memory-shard' },
  ],
  // Not discarnate, and that is the whole point: of every scene past the moment
  // of death in this game, this is the only one where the player is back inside
  // a body. The flag carries the meaning for free.
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.returning;
    const flat = buildFlat(context);
    context.scene.add(flat.group);

    const director = new Director(SENT_BACK_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 8);
      }
    });

    // On his back on the carpet where he was sitting, coming up to sitting again
    // over the length of the scene. A mirror of the heart attack's going down,
    // run the other way, which is the only joke this game gets to make.
    const floorEye = 0.3;
    const seatedEye = 0.95;

    context.rig.setMode('embodied');
    context.rig.position.set(-0.1, floorEye, 1.6);
    context.rig.orient(-0.08, 0.06);
    context.rig.setSway(1.2);
    context.rig.setRoll(0.42);
    context.rig.setPulse(0.8);

    const grade = context.post.grade;
    grade.drain = 0;
    grade.grain = 0.04;
    grade.vignette = 0.2;
    grade.aberration = 0.006;
    grade.distortion = 0.085;
    grade.exposure = 1.42;
    grade.washColor = [1, 0.92, 0.82];
    grade.washAmount = 0.05;
    grade.smear = 0;
    context.post.setBloom(1.4, 0.68, 0.5);

    context.audio.drone(0.3, 48, 10);
    context.audio.shimmer(0.34);
    context.audio.room(0.08, 300);
    context.audio.ring(0.12, 2100);
    context.audio.heartbeat(true, 118, 0.46);

    let kept = false;
    let holdBeganAt: number | undefined;
    let leaving = false;

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;

        // One curve runs the whole scene: 1 is still out there, 0 is all the way
        // back in the room. Everything else is a function of it.
        const out = beat.id === 'falling-back'
          ? 1 - ease.inOut(t) * 0.55
          : beat.id === 'the-room-again'
            ? 0.45 - ease.inOut(t) * 0.33
            : beat.id === 'breath'
              ? 0.12 - t * 0.07
              : Math.max(0, 0.05 - t * 0.05);

        flat.setFold(out * 0.85);
        flat.update(delta, elapsed);

        // Coming up off the carpet.
        const up = 1 - out;
        context.rig.position.set(-0.1, floorEye + (seatedEye - floorEye) * up, 1.6 + up * 0.15);
        context.rig.setRoll(0.42 * out);
        context.rig.setSway(1.2 - up * 0.35);

        // The heart is racing and then it is not. It is the only vignette in the
        // game where the heartbeat comes back, and it should be unmistakeable.
        const bpm = 118 - up * 44;
        context.audio.heartbeat(true, bpm, 0.46 - up * 0.14);
        const phase = (elapsed * (bpm / 60)) % 1;
        context.rig.setPulse((0.8 - up * 0.5) * Math.pow(1 - phase, 6));

        // The grade comes home. Not to `living`'s drabness — to something a
        // notch warmer and brighter than ordinary, because for an hour
        // afterwards the ordinary world is not ordinary (`L-THRESH-09`).
        grade.vignette = 0.2 + up * 0.16;
        grade.aberration = 0.006 - up * 0.0044;
        grade.distortion = 0.085 - up * 0.06;
        grade.grain = 0.04 + up * 0.03;
        grade.exposure = 1.42 - up * 0.1;
        grade.drain = grammar.drain * up;
        grade.washAmount = 0.05 * out;
        context.post.setBloom(1.4 - up * 0.86, 0.68, 0.5 + up * 0.26);

        context.audio.drone(0.3 - up * 0.2, 48, 10 - up * 10);
        context.audio.shimmer(0.34 * out);
        context.audio.ring(0.12 * out, 2100);
        context.audio.room(0.08 + up * 0.2, 300 + up * 900);

        // What the return leaves behind. Harmony rises because something was
        // released rather than held (GAME_BRIEF.md § Systems), the attachment he
        // carries is almost nothing because he did not die, and the thread is
        // written down while he is still alive — there is no river between this
        // scene and the rest of his life to carry it across.
        if (!kept && (beat.id === 'kept' || beat.id === 'unfinished' || beat.id === 'carried')) {
          kept = true;
          context.soul.attachment = 0.05;
          context.soul.will = 1;
          context.soul.harmony += 1;
          if (!context.soul.shards.includes(RETURN_SHARD)) {
            context.soul.shards.push(RETURN_SHARD);
          }
          recordUnlock(RETURN_SHARD, RETURN_WISDOM);
        }

        if (beat.id === 'onward' && t >= 1) {
          context.captions.show('He has a whole Monday to get through.', 9);
          holdBeganAt ??= elapsed;
          if (!leaving && elapsed - holdBeganAt >= GRACE_SECONDS) {
            leaving = true;
            void context.takeExit('live-on');
          }
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
