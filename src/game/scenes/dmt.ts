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
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { GRAMMAR, colorOf } from '../systems/palette';
import { Director, ease, type Beat } from '../systems/director';
import { moteField, volumetricGlow } from '../systems/forms';
import { hyperspaceField } from '../systems/hyperspace';
import { awareSolid, platonicArmature, sacredVeil } from '../systems/sacred-geometry';
import { NOISE, setU } from '../systems/glsl';
import { Overlay, type OverlayContent } from '../systems/overlay';
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
 * The thread is built out of decisions rather than out of watching. The first
 * choice is live nine seconds in, there are six in all across the three scenes,
 * every one of them moves karma, harmony, will or attachment, and the world
 * answers each: the room lights what he is holding, the architecture opens or
 * tightens, the entities hold their distance or close in, and the spirit body's
 * colour and brightness change on the frame after the choice that moves karma
 * (`L-FRAN-03`). No beat anywhere in the thread leaves the player with nothing
 * to decide for longer than about fifteen seconds, and every scene's exit is
 * reachable from its first frame.
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
  /** Where the three things he could hold on to are, in the room. */
  anchors: { readonly doorframe: Vector3; readonly hall: Vector3; readonly window: Vector3 };
  setFold(fold: number): void;
  /** Light whatever he has fixed his attention on. `undefined` for nothing. */
  setHeld(anchor: Vector3 | undefined): void;
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

  // The nested Platonic solids, arriving in the middle of the room. Five solids
  // one inside the next with a torus threading them and a vesica piscis across
  // them, from `systems/sacred-geometry.ts` — the half of the onset's geometry
  // the player can name rather than only feel.
  const armature = platonicArmature(resources, {
    radius: 1.05,
    color: GRAMMAR.hyperspace.glow,
    accent: GRAMMAR.hyperspace.accent,
  });
  armature.group.position.set(0.4, 1.2, -1.5);
  group.add(armature.group);

  // The construction seen *through* the room rather than standing in it: the
  // Flower of Life, nested inverted triangles, crossed vesicas and a
  // golden-ratio series of circles, under a five-fold kaleidoscope, drawn over
  // the whole frame at full resolution and brought up with the fold. The onset
  // is not an object arriving, it is structure becoming visible in what was
  // already there.
  const veil = sacredVeil(resources, {
    color: GRAMMAR.hyperspace.glow,
    accent: GRAMMAR.hyperspace.accent,
    aspect: Math.max(0.1, context.viewport.width / Math.max(1, context.viewport.height)),
  });
  group.add(veil.mesh);

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

  // Where in the room the three things he could be holding on to actually are,
  // so a choice about them can be answered by the room itself rather than only
  // by a line of text.
  const anchors = {
    doorframe: new Vector3(0.68, 1.1, -depth / 2 + 0.14),
    hall: new Vector3(-1.1, 0.75, -depth / 2 + 0.2),
    window: new Vector3(-width / 2 + 0.1, 1.5, -0.5),
  } as const;

  // GAME_BRIEF.md § Platform: the world shows the soul's state. The player's
  // attention is part of that state here, so when he fixes on one thing the
  // room lights it: this glow moves to whatever he chose and comes up with the
  // fold. It is the only light in the room that answers to a decision.
  const attention = volumetricGlow(resources, {
    radius: 0.85,
    color: 0xffd9a8,
    intensity: 0,
    softness: 2.5,
  });
  attention.mesh.position.copy(anchors.window);
  group.add(attention.mesh);

  let fold = 0;
  let heldWeight = 0;

  return {
    group,
    anchors,
    setFold(next) {
      fold = Math.min(1, Math.max(0, next));
    },
    setHeld(anchor: Vector3 | undefined) {
      if (anchor) {
        attention.mesh.position.copy(anchor);
        heldWeight = 1;
      } else {
        heldWeight = 0;
      }
    },
    update(delta, elapsed) {
      attention.update(elapsed, context.camera);
      setU(attention.material, 'uIntensity', heldWeight * (0.5 + fold * 1.1));
      setU(carpetMaterial, 'uTime', elapsed);
      setU(carpetMaterial, 'uFold', fold);
      setU(ringMaterial, 'uTime', elapsed);
      // The rings do not exist below a fold of about 0.15, which keeps the
      // ordinary half of the vignette genuinely ordinary.
      setU(ringMaterial, 'uIntensity', Math.max(0, fold - 0.15) * 1.5);

      // Nor does any of the sacred geometry. The solids start resolving at a
      // fold of about 0.2 and the veil at about 0.12, so the first third of the
      // vignette is a man in a flat and nothing else.
      armature.setUnfold(Math.max(0, fold - 0.2) * 1.3);
      armature.update(elapsed);
      setU(veil.material, 'uAspect', Math.max(0.1, context.viewport.width / Math.max(1, context.viewport.height)));
      veil.setIntensity(Math.max(0, fold - 0.12) * 1.15);
      veil.update(elapsed);
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

// --- choices, and the state they move ------------------------------------------

/**
 * The thread's choices are made of what is already in the room, and they move
 * state the game already tracks (GAME_BRIEF.md § Systems): karma, measured as
 * effect on others; harmony, which rises through release and forgiveness; will,
 * which Path B spends; and attachment, the weight the death hands to the
 * afterlife.
 *
 * Nothing new is invented to carry a decision between scenes either. What he
 * held and what he did about it are written into `soul.shards` — the run's
 * record of what it found — and the later scenes read them back from there.
 * The alternative would have been a new field on the soul for the sake of one
 * vignette, which is how state models rot.
 */

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

type HeldId = 'doorframe' | 'hall' | 'window';

interface Held {
  readonly id: HeldId;
  /** The run's record of this pick. Read back by `dmt.hyperspace` and `dmt.sent-back`. */
  readonly shard: string;
  readonly label: string;
  /** What the pick tells the player about him. This is the characterisation. */
  readonly caption: string;
  /** How a later scene refers to it. */
  readonly phrase: string;
  readonly attachment: number;
  readonly harmony: number;
  readonly will: number;
}

/**
 * The first choice of the vignette, and the one the rest of the thread is built
 * on. A man at the edge of something can hold on to one thing, and which one he
 * picks is who he is — so the player learns him by choosing for him rather than
 * by watching him for a minute first.
 *
 * The weights are the brief's rule read literally: holding a person is the
 * heaviest thing you can carry out of a life, unfinished work is drive more than
 * weight, and letting the room be only a room is the light arrival.
 */
const HELD: readonly Held[] = [
  {
    id: 'doorframe',
    shard: 'dmt.held.doorframe',
    label: 'The marks on the doorframe',
    caption: 'Eight pencil marks. One for every birthday. She comes back Tuesday.',
    phrase: 'the pencil marks on the doorframe',
    attachment: 0.22,
    harmony: 1,
    will: 0.05,
  },
  {
    id: 'hall',
    shard: 'dmt.held.hall',
    label: 'The hall he never finished',
    caption: 'He started it in April. The roller is still lying in the tray.',
    phrase: 'the hall he never finished',
    attachment: 0.12,
    harmony: 0,
    will: 0.25,
  },
  {
    id: 'window',
    shard: 'dmt.held.window',
    label: 'The window',
    caption: 'Somebody two floors down is still awake. That is all, and it is enough.',
    phrase: 'a lit window two floors down',
    attachment: -0.06,
    harmony: 1,
    will: -0.08,
  },
];

function heldById(id: HeldId): Held {
  const found = HELD.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`No held option "${id}"`);
  }
  return found;
}

/** What a run already decided, read back out of the shards. */
function heldFrom(shards: readonly string[]): Held | undefined {
  return HELD.find((entry) => shards.includes(entry.shard));
}

/** The second choice: whether he resists the fold or goes with it. */
const RESISTED = 'dmt.held-on';
const RELEASED = 'dmt.let-go';
/** The third: whether he meets what turns toward him. */
const MET_IT = 'dmt.met-it';
const LOOKED_AWAY = 'dmt.looked-away';
/** The fourth: whether he shows it what he was holding. */
const SHOWED_IT = 'dmt.showed-it';
const KEPT_IT = 'dmt.kept-it';
/** The fact of the return, which a player who decides nothing still carries. */
const RETURN_SHARD = 'dmt.the-architecture';
const RETURN_WISDOM = 'That there is somewhere the furniture is only a rumour.';

function remember(context: SceneContext, shard: string): void {
  if (!context.soul.shards.includes(shard)) {
    context.soul.shards.push(shard);
  }
}

/**
 * Every shard that records a *decision* in this thread, as opposed to a memory.
 *
 * `dmt.sent-back` leads back into a life, which can lead through the vignette
 * again inside the same run, so a second pass would otherwise read the first
 * pass's answers and tell the player they are holding something they put down a
 * life ago. These are cleared when `death.dmt` loads.
 *
 * `dmt.the-architecture` and the `dmt.carried.*` shards are deliberately NOT in
 * this list. They are memories, not decisions: they persist across runs through
 * the incarnation, they are seeded back into `soul.shards` at the start of a
 * run, and clearing them here would quietly delete what a previous life carried.
 */
const DECISION_SHARDS: readonly string[] = [
  ...HELD.map((entry) => entry.shard),
  RESISTED,
  RELEASED,
  MET_IT,
  LOOKED_AWAY,
  SHOWED_IT,
  KEPT_IT,
];

function forgetDecisions(context: SceneContext): void {
  context.soul.shards = context.soul.shards.filter((shard) => !DECISION_SHARDS.includes(shard));
}

/**
 * One overlay slot per scene.
 *
 * Choices arrive several times in each of these scenes and each one replaces the
 * last, so a scene must never be able to leave two dialogs stacked on the frame
 * — and whatever is up must come down when the scene unloads, which is what the
 * tracker registration here guarantees.
 */
function choiceSlot(context: SceneContext): {
  offer(content: OverlayContent): void;
  close(): void;
} {
  let current: Overlay | undefined;
  context.resources.onDispose(() => {
    current?.dispose();
    current = undefined;
  });
  return {
    offer(content) {
      current?.dispose();
      current = new Overlay(content);
      current.focusFirst();
    },
    close() {
      current?.dispose();
      current = undefined;
    },
  };
}

/** How long a closing image holds before the scene moves on by itself. */
const GRACE_SECONDS = 10;

// --- vignette 7: the threshold of it -------------------------------------------

/**
 * 67 seconds of authored time, then the closing image holds for
 * `GRACE_SECONDS` and lets go by itself (GAME_BRIEF.md § Act 1, pacing rule).
 *
 * The player's first real choice is live 9 seconds in and stays live for 20, and
 * the second opens the moment the first closes, so from 9s to 56s there is
 * always something to decide. The ordinary life this vignette has to establish
 * is established *by* that first choice rather than ahead of it: the three
 * options are the three things in his flat, and picking one is what tells the
 * player who he is. Nothing here is watched for a minute before it can be
 * touched.
 */
const DMT_BEATS: readonly Beat[] = [
  { id: 'already-going', seconds: 9, caption: 'Sunday evening. It has already started.' },
  { id: 'what-he-holds', seconds: 20 },
  { id: 'breathing', seconds: 11, caption: 'The carpet is breathing. It has always been breathing.' },
  { id: 'folding', seconds: 16 },
  { id: 'given-way', seconds: 8 },
  { id: 'gone', seconds: 1, hold: true },
];

/** How far the fold has come, per beat. 0 is an ordinary room. */
const FOLD_AT: Record<string, [number, number]> = {
  'already-going': [0, 0.05],
  'what-he-holds': [0.05, 0.16],
  breathing: [0.16, 0.5],
  folding: [0.5, 0.9],
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
    // A fresh pass through the vignette decides for itself.
    forgetDecisions(context);
    const flat = buildFlat(context);
    context.scene.add(flat.group);

    const director = new Director(DMT_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 7);
      }
    });

    const slot = choiceSlot(context);

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

    let held: Held | undefined;
    let resisted: boolean | undefined;
    let askedHeld = false;
    let askedFold = false;
    let holdBeganAt: number | undefined;
    let leaving = false;

    /** The first choice. What he fixes on as the room starts to go. */
    function take(id: HeldId): void {
      if (held) {
        return;
      }
      const choice = heldById(id);
      held = choice;
      remember(context, choice.shard);
      // The death sets the starting state of the afterlife (GAME_BRIEF.md
      // § Act 1) — and here the player sets it, by deciding what he carries out
      // of the room rather than by which death they picked off a menu.
      context.soul.attachment = clamp01(context.soul.attachment + choice.attachment);
      context.soul.harmony += choice.harmony;
      context.soul.will = clamp01(context.soul.will + choice.will);
      flat.setHeld(flat.anchors[id]);
      context.captions.show(choice.caption, 9);
      slot.close();
    }

    function offerHeld(): void {
      askedHeld = true;
      slot.offer({
        title: 'What does he hold on to?',
        body:
          'The room is beginning to go. There are three things in it. Whichever one he keeps '
          + 'hold of is the one he will be carrying when this opens — and the one he will be '
          + 'offered back, if he is sent back.',
        actions: HELD.map((entry) => ({
          id: entry.id,
          label: entry.label,
          onPick: () => {
            take(entry.id);
          },
        })),
        hint: 'Decide, or the moment passes and he is left looking at the window.',
      });
    }

    /** The second choice. Whether he resists the fold or goes with it. */
    function fold(choice: 'hold' | 'release'): void {
      if (resisted !== undefined) {
        return;
      }
      resisted = choice === 'hold';
      if (resisted) {
        remember(context, RESISTED);
        context.soul.will = clamp01(context.soul.will + 0.2);
        context.soul.attachment = clamp01(context.soul.attachment + 0.1);
        context.captions.show('He braces. It makes no difference and he braces anyway.', 8);
      } else {
        remember(context, RELEASED);
        context.soul.harmony += 1;
        context.soul.attachment = clamp01(context.soul.attachment - 0.1);
        context.soul.will = clamp01(context.soul.will - 0.05);
        context.captions.show('He stops holding the room together. It was never him doing that.', 8);
      }
      slot.close();
    }

    function offerFold(): void {
      askedFold = true;
      slot.offer({
        title: 'The room is coming apart.',
        body:
          'He can brace against it or stop trying to hold it together. Bracing keeps something '
          + 'of him for later and takes it out of the next few minutes. Letting go costs him '
          + 'the handhold and gives him the place he is going.',
        actions: [
          { id: 'hold', label: 'Brace', onPick: () => { fold('hold'); } },
          { id: 'release', label: 'Let it take him', onPick: () => { fold('release'); } },
        ],
        hint: 'Decide, or he simply stops deciding, which is its own answer.',
      });
    }

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;

        // --- the choices, on the clock -----------------------------------
        if (!askedHeld && beat.id === 'what-he-holds') {
          offerHeld();
        }
        if (beat.id === 'breathing' || beat.id === 'folding' || beat.id === 'given-way' || beat.id === 'gone') {
          if (!held) {
            // The window. He was looking at it anyway, which is the lightest
            // thing he could have been carrying, and the hint said so.
            take('window');
          }
          if (!askedFold) {
            offerFold();
          }
        }
        if ((beat.id === 'given-way' || beat.id === 'gone') && resisted === undefined) {
          fold('release');
        }

        // Bracing slows the fold and roughens the lens; letting go hurries it.
        const resist = resisted === true ? 0.85 : resisted === false ? 1.12 : 1;
        const foldNow = Math.min(1, foldFor(beat.id, t) * resist);
        flat.setFold(foldNow);
        flat.update(delta, elapsed);

        // The frame does not narrow the way it does in the other vignettes. It
        // widens: the vignette opens, the colour comes up, the lens begins to
        // disagree with itself at the edges, and the room gets brighter rather
        // than dimmer. Nothing here is being taken away.
        const agitation = resisted === true ? 1.3 : 1;
        grade.vignette = 0.42 - foldNow * 0.26;
        grade.drain = grammar.drain * (1 - foldNow);
        grade.aberration = (0.0012 + foldNow * 0.0055) * agitation;
        grade.distortion = (0.022 + foldNow * 0.075) * agitation;
        grade.grain = grammar.grain - foldNow * 0.05;
        grade.exposure = 1.3 + foldNow * 0.14;
        grade.washAmount = Math.max(0, foldNow - 0.7) * 0.06;
        context.post.setBloom(grammar.bloom + foldNow * 0.6, 0.62, Math.max(0.52, 0.8 - foldNow * 0.26));

        // The body stays where it is and the heart stays calm. This is not a
        // crisis, and nothing about the camera should claim it is.
        context.audio.heartbeat(true, 60 + foldNow * 14 + (resisted === true ? 10 : 0), 0.3);
        context.rig.setPulse(0.1 + foldNow * 0.16);
        context.rig.position.set(-0.1, seatedEye - foldNow * 0.07, 1.75 - foldNow * 0.25);

        // The room loses its top end and gains a whole register underneath it.
        context.audio.room(0.26 - foldNow * 0.2, 1100 - foldNow * 820);
        context.audio.drone(0.1 + foldNow * 0.22, 46 - foldNow * 8, foldNow * 12);
        context.audio.shimmer(Math.max(0, foldNow - 0.2) * 0.5);
        context.audio.ring(Math.max(0, foldNow - 0.5) * 0.14, 1700 + foldNow * 500);

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
 * The entities, and where their awareness lives (`L-DMT-03`).
 *
 * The beings are not creatures standing in a geometric landscape. They *are*
 * geometry: each one is a dodecahedron with its dual icosahedron nested inside
 * it, built out of exactly the relationship the architecture around them is
 * folded from, so they belong to this place and the player does not. There is no
 * face, no silhouette and no character — these are not the loved ones of
 * `threshold.loved-ones`, and a humanoid shape would say the wrong thing about
 * them.
 *
 * `systems/sacred-geometry.ts` owns what one looks like and how it reorganises
 * under attention: unattended it tumbles out of step and its facets churn, and
 * under regard the tumbling stops, the inner solid locks into dual alignment
 * with the outer — vertices onto face centres — and an outer icosahedral cage
 * phases in. Being looked at makes it *more* built, not less.
 *
 * This scene owns the behaviour, which is the other half of being aware: each
 * one tracks where the player is actually looking, being looked at holds it at
 * its distance, and being ignored brings it in. A player who never looks away is
 * attended to from a polite distance. A player who looks away finds them nearer
 * than they were.
 */


/**
 * 62 seconds of authored time, with a decision live from 10 seconds in and
 * never more than one beat away after that: meet it or look away at 10s, show
 * it what he was holding or keep it at 26s, and the fork itself at 42s, which
 * stays open until the scene lets go.
 */
const HYPERSPACE_BEATS: readonly Beat[] = [
  { id: 'arrival', seconds: 10 },
  { id: 'noticed', seconds: 16, caption: 'Something turns toward you. It was already here.' },
  { id: 'attended', seconds: 16, caption: 'It is not surprised by you. You are the surprise.' },
  { id: 'shown', seconds: 12, caption: 'Not yet. Not you, not yet.' },
  { id: 'release', seconds: 8 },
  { id: 'held', seconds: 1, hold: true },
];

/**
 * The floor under the weight this crossing would hand to the afterlife, if it
 * turned out to be the crossing (GAME_BRIEF.md § Act 1: each death sets the
 * starting state). Only a floor: the player's choices set the actual figure, and
 * this exists so that a player who decides nothing at all still arrives
 * carrying something. Deliberately the lightest in the game — nothing here is
 * violent, nothing is unjust, and lore bible § 12.6 flags the whole "worse
 * death, heavier start" curve as unresolved anyway.
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
      const entity = awareSolid(context.resources, {
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

    const slot = choiceSlot(context);

    // What he decided in the room, read back out of the run's own record.
    const held = heldFrom(context.soul.shards);
    const braced = context.soul.shards.includes(RESISTED);

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
    context.post.setBloom(0.7, 0.66, 0.86);

    context.audio.drone(0.26, 51, 11);
    context.audio.shimmer(0.3);
    context.audio.ring(0.07, 2200);
    context.audio.room(0.04, 300);
    context.audio.heartbeat(false);

    let met: boolean | undefined;
    let showed: boolean | undefined;
    let askedMeet = false;
    let askedShow = false;
    let askedFork = false;
    let handedOver = false;
    let holdBeganAt: number | undefined;
    let leaving = false;
    let lastElapsed = 0;
    const scratch = new Vector3();

    /**
     * The third choice. Meeting it is attention paid to something that is
     * already paying attention to you; looking away is self-possession, and it
     * costs you nothing except that they come closer anyway.
     */
    function meet(choice: boolean): void {
      if (met !== undefined) {
        return;
      }
      met = choice;
      if (choice) {
        remember(context, MET_IT);
        context.soul.harmony += 1;
        context.soul.attachment = clamp01(context.soul.attachment - 0.05);
        context.captions.show('You look back at it. It was waiting for exactly that.', 9);
      } else {
        remember(context, LOOKED_AWAY);
        context.soul.will = clamp01(context.soul.will + 0.15);
        context.captions.show('You keep your eyes on the architecture. They come nearer regardless.', 9);
      }
      slot.close();
    }

    /**
     * The fourth, and the one the spirit body answers to. Karma is effect on
     * others (GAME_BRIEF.md § Systems), and handing something of yourself to
     * something that asked is an effect on another; refusing is also one.
     *
     * Both directions cross a karma band in `systems/spirit-body.ts`, so the
     * glow the player can see by looking down changes colour and brightness on
     * the frame after the choice — Franchezzo's idea used rather than decorated
     * (`L-FRAN-03`).
     */
    function show(choice: boolean): void {
      if (showed !== undefined) {
        return;
      }
      showed = choice;
      if (choice) {
        remember(context, SHOWED_IT);
        context.soul.karma += 1;
        context.soul.harmony += 1;
        context.soul.attachment = clamp01(context.soul.attachment - 0.1);
        context.captions.show('You hand it over. It turns the thing around, slowly, like a coin.', 10);
      } else {
        remember(context, KEPT_IT);
        context.soul.karma -= 1;
        context.soul.will = clamp01(context.soul.will + 0.2);
        context.soul.attachment = clamp01(context.soul.attachment + 0.05);
        context.captions.show('You keep it. It waits a while, and then stops asking.', 10);
      }
      slot.close();
    }

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;

        // Real wall-clock frame time, not the loop's clamped animation delta.
        // The resolution controller needs to see a two-second frame as two
        // seconds or it will never come down off a software renderer.
        const frameSeconds = Math.max(0, elapsed - lastElapsed);
        lastElapsed = elapsed;

        // --- the choices, on the clock -----------------------------------
        if (!askedMeet && beat.id === 'noticed') {
          askedMeet = true;
          slot.offer({
            title: 'Something is looking at you.',
            body:
              'It is not a shape that happens to be facing this way. It has turned, and it is '
              + 'waiting to see what you do. You can meet it, or you can keep your attention on '
              + 'the architecture and let it do what it likes.',
            actions: [
              { id: 'meet', label: 'Meet it', onPick: () => { meet(true); } },
              { id: 'look-away', label: 'Look away', onPick: () => { meet(false); } },
            ],
            hint: 'Decide, or you will have looked away by default.',
          });
        }
        if (beat.id === 'attended' || beat.id === 'shown' || beat.id === 'release' || beat.id === 'held') {
          if (met === undefined) {
            meet(false);
          }
          if (!askedShow) {
            askedShow = true;
            const what = held?.phrase ?? 'whatever he came in holding';
            slot.offer({
              title: 'It wants to see what you brought.',
              body:
                `You came in holding ${what}. It is asking for it — not to keep, as far as you `
                + 'can tell. You can show it, or you can keep it to yourself, and it will not '
                + 'ask twice.',
              actions: [
                { id: 'show', label: 'Show it', onPick: () => { show(true); } },
                { id: 'keep', label: 'Keep it', onPick: () => { show(false); } },
              ],
              hint: 'Decide, or you will have kept it. Look down afterwards: your own light answers.',
            });
          }
        }
        if (beat.id === 'shown' || beat.id === 'release' || beat.id === 'held') {
          if (showed === undefined) {
            show(false);
          }
          if (!askedFork) {
            askedFork = true;
            slot.offer({
              title: 'Not yet.',
              body:
                'This is the one death you can survive. Being sent back is the classic case, and '
                + 'it is what happens if you do nothing. Going on leads into the Threshold — the '
                + 'same one the other six deaths lead into.',
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
          }
        }

        // How far the place has opened out, 0..1 across the whole scene. A man
        // who braced in the room arrives in a tighter version of it.
        const opening = braced ? 0.82 : 1;
        const open = (beat.id === 'arrival'
          ? ease.out(t) * 0.35
          : beat.id === 'noticed'
            ? 0.35 + ease.inOut(t) * 0.3
            : beat.id === 'release'
              ? 0.9 - t * 0.35
              : beat.id === 'held'
                ? 0.55
                : 0.65 + Math.min(0.25, t * 0.25)) * opening;

        // The void around the viewer widens as the place opens, which both reads
        // as the architecture drawing back and keeps the march from ever
        // starting inside a solid cell.
        field.setOpen(1.15 + open * 1.5);

        // The procession of solids. One every nine seconds of wall-clock time,
        // walked in the classical order — tetrahedron, cube, octahedron,
        // dodecahedron, icosahedron — and morphing continuously between them, so
        // the player watches each one deform into the next rather than being
        // shown five slides. `elapsed` is the scene's own wall clock, never an
        // accumulated frame delta, so the pace is a property of the scene and not
        // of the machine (CLAUDE.md § Gotchas).
        field.setProcession(elapsed / 9);
        // How large they stand. They come up with the place opening out, so the
        // first thing the arrival resolves into is a solid.
        field.setCongregation(0.3 + open * 0.7);

        // Drifting through the structure. The field is anchored in world space,
        // so moving the rig genuinely moves through it.
        context.rig.target.set(
          Math.sin(elapsed * 0.06) * 1.2,
          Math.sin(elapsed * 0.045 + 1.4) * 0.8,
          -elapsed * 0.32,
        );

        // --- the entities ---------------------------------------------------
        const present = beat.id === 'arrival'
          ? 0.3 + ease.out(Math.min(1, open * 2.2)) * 0.7
          : 1;
        // Meeting them buys their regard whatever the player then looks at;
        // looking away means only the gaze earns it, and they close twice as
        // fast while it is elsewhere.
        const regardFloor = met === true ? 0.6 : 0;
        const closingRate = met === false ? 1 : 0.5;
        let regardTotal = 0;

        for (const entry of watchers) {
          entry.angle += entry.drift * delta;
          // Being looked at holds them where they are. Being ignored brings them
          // in. This is the whole mechanic and it is four lines long.
          const hold = 2.9 + entry.regard * 2.6;
          entry.distance = Math.max(hold, entry.distance - (1 - entry.regard) * closingRate * delta);
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
          const toward = Math.max(looking ? 1 : 0, regardFloor);
          entry.regard += (toward - entry.regard) * (1 - Math.exp(-2.6 * delta));
          regardTotal += entry.regard;

          // Regard is handed to the solid, which answers it by reorganising:
          // the tumble stops, the inner icosahedron locks onto the outer
          // dodecahedron's face centres, and the outer cage phases in.
          entry.entity.setRegard(entry.regard);
          entry.entity.setPresence(0.35 + present * 0.65);
          entry.entity.update(elapsed);
          entry.halo.update(elapsed, context.camera);
          setU(entry.halo.material, 'uIntensity', (0.12 + entry.regard * 0.5) * present);
        }

        const attention = watchers.length > 0 ? regardTotal / watchers.length : 0;
        field.setAttention(attention * present);
        field.render(context.camera, elapsed, frameSeconds);

        motes.drift(delta, elapsed);

        // Showing it what he brought opens the place out; keeping it tightens
        // the lens. The world reflects the decision, not just the ledger.
        const given = showed === true ? 1 : showed === false ? -1 : 0;
        grade.aberration = 0.0045 + attention * 0.003 - given * 0.0012 + (braced ? 0.0015 : 0);
        grade.distortion = 0.06 - open * 0.02 - given * 0.008;
        grade.vignette = 0.26 - open * 0.08 - given * 0.03;
        context.post.setBloom(0.7 + attention * 0.25 + Math.max(0, given) * 0.2, 0.66, 0.86);

        context.audio.shimmer(0.3 + attention * 0.35 + open * 0.15);
        context.audio.drone(0.26 + open * 0.08, 51, 11 + attention * 9);
        context.audio.ring(0.07 + attention * 0.05, 2200);

        // If it does turn out to have been the crossing, the afterlife needs its
        // opening state set before the Threshold is reached. A floor, not an
        // override: the choices made it, this only refuses to let it be nothing.
        if (!handedOver && (beat.id === 'release' || beat.id === 'held')) {
          handedOver = true;
          context.soul.attachment = Math.max(context.soul.attachment, CROSSING_ATTACHMENT);
          context.soul.will = Math.min(context.soul.will, 1 - context.soul.attachment * 0.5);
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

/**
 * 57 seconds, with the scene's own choice live 8 seconds in.
 *
 * GAME_BRIEF.md calls this the classic "it is not your time". Whether to come
 * back at all was the previous scene's fork; what he carries back is this one's,
 * and it is the decision with the longest reach in the thread, because it is the
 * only one in the game that is written down while the person is still alive.
 */
const SENT_BACK_BEATS: readonly Beat[] = [
  { id: 'falling-back', seconds: 8 },
  { id: 'the-room-again', seconds: 16, caption: 'Carpet. Window. His own hands.' },
  { id: 'kept', seconds: 16, caption: 'He is still here. He gets to stay.' },
  { id: 'what-he-carries', seconds: 17 },
  { id: 'onward', seconds: 1, hold: true },
];

type CarryId = 'finish-it' | 'call-her' | 'say-nothing';

interface Carry {
  readonly id: CarryId;
  readonly shard: string;
  readonly label: string;
  /** Survives every later run, through `recordUnlock`. */
  readonly wisdom: string;
  readonly caption: string;
  /** Which thing in the room lights up, if any. */
  readonly anchor: HeldId | undefined;
  readonly karma: number;
  readonly harmony: number;
  readonly will: number;
  readonly attachment: number;
}

const CARRY: readonly Carry[] = [
  {
    id: 'call-her',
    shard: 'dmt.carried.her-name',
    label: 'Call her tonight, not Tuesday',
    wisdom: 'That Tuesday was a decision, and not a fact.',
    caption: 'He is going to call her tonight. It is late. He is going to call her anyway.',
    anchor: 'doorframe',
    karma: 1,
    harmony: 1,
    will: 0,
    attachment: -0.05,
  },
  {
    id: 'finish-it',
    shard: 'dmt.carried.the-hall',
    label: 'Finish the hall',
    wisdom: 'That the hall was never about the hall.',
    caption: 'He is going to finish the hall. Not tonight. But he is going to finish it.',
    anchor: 'hall',
    karma: 0,
    harmony: 0,
    will: 0.25,
    attachment: 0,
  },
  {
    id: 'say-nothing',
    shard: 'dmt.carried.in-silence',
    label: 'Tell nobody',
    wisdom: 'That some things cannot be handed over, only carried.',
    caption: 'He will not try to explain this to anyone. It would come out wrong, and it is his.',
    anchor: undefined,
    karma: 0,
    harmony: 0,
    will: 0.15,
    attachment: 0.1,
  },
];

function carryById(id: CarryId): Carry {
  const found = CARRY.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`No carry option "${id}"`);
  }
  return found;
}

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

    const slot = choiceSlot(context);
    const held = heldFrom(context.soul.shards);

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

    let returned = false;
    let carried: Carry | undefined;
    let askedCarry = false;
    let holdBeganAt: number | undefined;
    let leaving = false;

    /**
     * The scene's choice, and the durable one.
     *
     * `recordUnlock` writes it to the incarnation, so it survives this run and
     * every later one — which is what "unlocks an alternate thread" has to mean
     * if it is to mean anything. There is no river between this scene and the
     * rest of his life to carry it across, because he did not die.
     */
    function carry(id: CarryId): void {
      if (carried) {
        return;
      }
      const choice = carryById(id);
      carried = choice;
      remember(context, choice.shard);
      context.soul.karma += choice.karma;
      context.soul.harmony += choice.harmony;
      context.soul.will = clamp01(context.soul.will + choice.will);
      context.soul.attachment = clamp01(context.soul.attachment + choice.attachment);
      flat.setHeld(choice.anchor === undefined ? undefined : flat.anchors[choice.anchor]);
      context.captions.show(choice.caption, 10);
      recordUnlock(choice.shard, choice.wisdom);
      slot.close();
    }

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;

        if (!askedCarry && beat.id !== 'falling-back') {
          askedCarry = true;
          const what = held?.phrase ?? 'nothing in particular';
          slot.offer({
            title: 'He gets to keep it. All of it.',
            body:
              `He went in holding ${what} and he has been handed the whole life back. What he `
              + 'does about that is the only part of this that is up to him, and it is the part '
              + 'that outlasts the run.',
            actions: CARRY.map((entry) => ({
              id: entry.id,
              label: entry.label,
              onPick: () => {
                carry(entry.id);
              },
            })),
            hint: 'Decide, or he tells nobody, which is what most people do.',
          });
        }
        if ((beat.id === 'what-he-carries' || beat.id === 'onward') && !carried) {
          carry('say-nothing');
        }

        // One curve runs the whole scene: 1 is still out there, 0 is all the way
        // back in the room. Everything else is a function of it.
        const out = beat.id === 'falling-back'
          ? 1 - ease.inOut(t) * 0.6
          : beat.id === 'the-room-again'
            ? 0.4 - ease.inOut(t) * 0.3
            : beat.id === 'kept'
              ? 0.1 - t * 0.06
              : Math.max(0, 0.04 - t * 0.04);

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
        // notch warmer and brighter than ordinary, because for a while
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

        // The fact of the return, recorded whether or not the player decides
        // anything about it. Harmony rises because something was let go of
        // rather than held (GAME_BRIEF.md § Systems), and the weight he carries
        // is almost nothing, because he did not die.
        if (!returned && beat.id !== 'falling-back') {
          returned = true;
          context.soul.attachment = clamp01(Math.min(context.soul.attachment, 0.1));
          context.soul.will = 1;
          context.soul.harmony += 1;
          remember(context, RETURN_SHARD);
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
