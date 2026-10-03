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
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import type { SoulState } from '../soul';
import { GRAMMAR, colorOf } from '../systems/palette';
import { Director, ease, type Beat } from '../systems/director';
import { airShell, figureOfLight, moteField, volumetricGlow } from '../systems/forms';
import { NOISE, setU } from '../systems/glsl';
import {
  WITNESS_VANTAGES,
  simultaneousRotation,
  vaultOfFibres,
  witnessOfLight,
} from '../systems/higher-dimensional';
import { Overlay } from '../systems/overlay';
import { ThresholdPrompt, clamp01 } from './threshold-early';

/**
 * The border, the choice, and the life review.
 *
 * The border is the point of no return in Moody's sequence (`L-THRESH-08`), the
 * choice is the brief's central fork, and the life review is the moral engine:
 * the player re-lives a moment from another person's point of view and feels what
 * they felt (`L-THRESH-07`).
 *
 * The review is the one place in the slice where text earns its keep. The whole
 * mechanic is about someone else's interior, and an interior cannot be staged
 * with geometry alone.
 */

// --- the border ----------------------------------------------------------------

/** A surface that is clearly a limit: flowing, luminous, and not to be stood on. */
function borderSurface(context: SceneContext): { mesh: Mesh; material: ShaderMaterial } {
  const geometry = context.resources.track(new PlaneGeometry(260, 260, 1, 1));
  const material = context.resources.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uNear: { value: colorOf(GRAMMAR.border.accent) },
        uFar: { value: colorOf(GRAMMAR.border.glow) },
        uIntensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uNear;
        uniform vec3 uFar;
        uniform float uIntensity;
        varying vec2 vUv;
        varying vec3 vWorld;

        ${NOISE}

        void main() {
          // Bands travelling across the limit, tightening toward the far side, so
          // the eye reads a direction and a threshold rather than a floor.
          float across = vWorld.z * 0.05;
          float flow = fbm(vec3(vWorld.x * 0.05, across - uTime * 0.14, uTime * 0.04), 4);
          float bands = sin(across * 7.0 - uTime * 0.7 + flow * 5.0) * 0.5 + 0.5;
          bands = pow(bands, 3.0);

          float toward = smoothstep(0.0, -60.0, vWorld.z);
          vec3 color = mix(uNear, uFar, toward);

          // Fade out at the horizon rather than ending in a hard edge.
          float fade = 1.0 - smoothstep(40.0, 125.0, length(vWorld.xz));
          float alpha = (bands * 0.5 + flow * 0.22) * fade;

          gl_FragColor = vec4(color * (0.5 + bands) * uIntensity, alpha);
        }
      `,
    }),
  );
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -1.4;
  return { mesh, material };
}

const BORDER_BEATS: readonly Beat[] = [
  { id: 'arrive', seconds: 6 },
  { id: 'the-limit', seconds: 9, caption: 'Past this, there is no coming back.' },
  { id: 'wait', seconds: 1, hold: true },
];

export const borderScene: SceneDefinition = {
  id: 'threshold.border',
  title: 'The border',
  exits: [
    { id: 'set-it-down', label: 'Set down what you are carrying', to: 'threshold.choice' },
    { id: 'carry-it', label: 'Carry it across', to: 'threshold.choice' },
  ],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.border;
    const air = airShell(context.resources, { radius: 130, ground: grammar.ground, glow: 0x1d3a44, density: 1 });
    context.scene.add(air.mesh);

    const limit = borderSurface(context);
    context.scene.add(limit.mesh);

    // The Light is behind us now, and ahead is the far side.
    const behind = volumetricGlow(context.resources, { radius: 16, color: GRAMMAR.light.glow, intensity: 0.7, softness: 2.5 });
    behind.mesh.position.set(0, 3, 34);
    context.scene.add(behind.mesh);

    const ahead = volumetricGlow(context.resources, { radius: 9, color: grammar.accent, intensity: 0.5, softness: 2.2 });
    ahead.mesh.position.set(0, 1, -52);
    context.scene.add(ahead.mesh);

    const motes = moteField(context.resources, context.rng.stream('border-motes'), {
      count: 1200,
      radius: 22,
      color: grammar.glow,
      size: 0.05,
    });
    context.scene.add(motes.points);

    /**
     * What is standing on the far side of the limit.
     *
     * `L-THRESH-08` makes this the point of no return, and the whole sky above
     * it was empty. One appearance of the company the player will be reviewed in
     * front of, and the architecture it belongs to, a long way beyond the limit:
     * so the far side is somewhere inhabited rather than a blank, and so the
     * review does not introduce these out of nowhere.
     *
     * Far enough that it cannot read as a threat and is plainly not waiting for
     * an answer — it is on the other side of a line the player has not crossed.
     * It never moves, never brightens at the player, and neither answer to the
     * prompt changes it in any way. `L-THRESH-06`: without judgement.
     *
     * The vault is the Hopf fibration of the 3-sphere — one object in four
     * dimensions, which three dimensions can only show as rings threading each
     * other. It is here rather than over the life review because it needs open
     * sky: at the scale a kitchen needs, its fibres cross the frame as chords.
     */
    const farWitness = witnessOfLight(context.resources, {
      radius: 7.0,
      color: GRAMMAR.light.glow,
      accent: grammar.accent,
      carried: context.soul.karma >= 0 ? 0xffd7a4 : 0xa9bcff,
      vantage: WITNESS_VANTAGES[2] ?? WITNESS_VANTAGES[0] ?? [],
      distance: 2.3,
      weight: 0.5,
    });
    farWitness.group.position.set(-17, 13, -58);
    farWitness.setPresence(1);
    context.scene.add(farWitness.group);

    const vault = vaultOfFibres(context.resources, {
      fibres: 8,
      segments: 40,
      extent: [18, 16, 18],
      color: GRAMMAR.light.glow,
      accent: grammar.accent,
      carried: 0xcfe9e2,
      weight: 0.34,
      distance: 2.5,
    });
    vault.group.position.set(6, 23, -74);
    vault.setPresence(1);
    context.scene.add(vault.group);

    const director = new Director(BORDER_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 9);
      }
    });

    context.rig.setMode('drifting');
    context.rig.position.set(0, 1.5, 14);
    context.rig.target.set(0, 1.5, 4);
    context.rig.orient(0, 0);
    context.rig.setSway(0.36);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = grammar.drain;
    grade.grain = grammar.grain;
    grade.vignette = 0.3;
    grade.aberration = 0.0024;
    grade.distortion = 0.028;
    grade.exposure = 1.05;
    grade.washColor = [0.95, 1, 0.98];
    grade.washAmount = 0.03;
    grade.smear = 0;
    context.post.setBloom(grammar.bloom, 0.74, 0.62);

    context.audio.drone(0.2, 60, 10);
    context.audio.shimmer(0.22);
    context.audio.room(0.05, 700);
    context.audio.heartbeat(false);

    /**
     * A border understood as the point of no return (`L-THRESH-08`). A limit is
     * the one place where what you are still holding becomes a question, because
     * it is the last place you can put it down.
     *
     * `L-THRESH-09` sets the tone it is asked in: what the reports describe at
     * this point is reluctance to come back, not fear of going on. So nothing
     * here warns the player off, and neither answer is a trap.
     *
     * Setting it down is forgiveness, which GAME_BRIEF.md § Systems names as one
     * of the three things HARMONY rises through — and it is an effect on another
     * person, felt, which is what the brief says KARMA is a ledger of. So the
     * ledger moves in the kind direction here for the same reason it moved in
     * the other direction in the life review: something between two people
     * changed, and the soul was present for it.
     *
     * Carrying it across is not the wrong answer. A grievance is grip, and grip
     * is WILL, which is the resource Path B spends to move at all — a soul that
     * means to refuse the Light has a reason to keep it.
     *
     * Either way the spirit body re-reads: its brightness and colour are karma
     * (`L-FRAN-03`), so the prompt says to look down.
     */
    let picked: 'set-it-down' | 'carry-it' | undefined;
    let pickedAt: number | undefined;
    let prompt: ThresholdPrompt | undefined = new ThresholdPrompt();

    const choose = (choice: 'set-it-down' | 'carry-it'): void => {
      if (picked !== undefined) {
        return;
      }
      picked = choice;
      if (choice === 'set-it-down') {
        context.soul.karma += 1;
        context.soul.harmony += 1;
        context.soul.attachment = clamp01(context.soul.attachment - 0.25);
        prompt?.settle(
          'You put it down on this side. The limit takes the colour of the far side, and the weight '
          + 'of the thing is simply gone.',
          'karma +1 · harmony +1 · look down: your own light has changed',
          { id: 'set-it-down', label: 'Stand at the limit', onPick: () => { void context.takeExit('set-it-down'); } },
        );
      } else {
        context.soul.will = clamp01(context.soul.will + 0.25);
        context.soul.attachment = clamp01(context.soul.attachment + 0.2);
        prompt?.settle(
          'You keep it. The limit dims and closes up, and whatever you do next, you will be doing it '
          + 'with both hands full.',
          'will +0.25 · you are carrying more',
          { id: 'carry-it', label: 'Stand at the limit', onPick: () => { void context.takeExit('carry-it'); } },
        );
      }
    };

    prompt.ask('This is the last place you can put anything down. Do you?', [
      {
        id: 'set-it-down',
        label: 'Set it down here',
        detail: 'Forgive what was left unfinished. The ledger moves, and you cross lighter.',
        onPick: () => { choose('set-it-down'); },
      },
      {
        id: 'carry-it',
        label: 'Carry it across',
        detail: 'Keep the grievance. It is grip, and grip is what moves you in the dark.',
        onPick: () => { choose('carry-it'); },
      },
    ]);

    context.resources.onDispose(() => {
      prompt?.dispose();
      prompt = undefined;
    });

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;

        setU(air.material, 'uTime', elapsed);
        setU(limit.material, 'uTime', elapsed);
        behind.update(elapsed, context.camera);
        ahead.update(elapsed, context.camera);
        motes.drift(delta, elapsed);

        // One shared rotation for both: the appearance and the architecture are
        // the same four-dimensional space, seen from two places in it.
        const rotation = simultaneousRotation(elapsed, 0);
        farWitness.update(elapsed, rotation);
        vault.update(elapsed, rotation);

        if (picked !== undefined && pickedAt === undefined) {
          pickedAt = elapsed;
        }
        const answered = pickedAt === undefined ? 0 : ease.out(Math.min(1, (elapsed - pickedAt) / 4));
        const released = picked === 'set-it-down' ? answered : 0;
        const kept = picked === 'carry-it' ? answered : 0;

        const approach = beat.id === 'arrive' ? ease.out(t) * 0.5 : 0.5 + (beat.id === 'the-limit' ? t * 0.5 : 0.5);

        // Stops short. The scene never carries the player across — crossing is a
        // decision, and the decision is the next scene.
        context.rig.target.set(0, 1.5, 4 - approach * 3.4 - released * 1.2);
        setU(limit.material, 'uIntensity', Math.max(0.25, 1 + approach * 0.7 + released * 0.8 - kept * 0.55));
        setU(ahead.material, 'uIntensity', Math.max(0, 0.5 + released * 0.5 - kept * 0.35));
        setU(behind.material, 'uIntensity', Math.max(0, 0.7 + kept * 0.3 - released * 0.2));
        grade.washAmount = 0.03 + approach * 0.04 + released * 0.03;
        grade.drain = grammar.drain + kept * 0.2 - released * 0.14;
        grade.grain = grammar.grain + kept * 0.05;
        grade.vignette = 0.3 + kept * 0.1 - released * 0.08;
        context.post.setBloom(grammar.bloom + released * 0.35 - kept * 0.2, 0.74, 0.62);
        context.audio.shimmer(0.22 + approach * 0.12 + released * 0.2 - kept * 0.14);
        context.audio.drone(0.2 + kept * 0.08, 60 - kept * 8, 10 + released * 6);
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

// --- the choice ----------------------------------------------------------------

/**
 * How the soul reads at the fork, in the game's own terms rather than as a HUD.
 *
 * Nothing here scores the player. It restates what they chose on the way here,
 * so the one choice the brief calls central is made with the corridor's answers
 * in view instead of from a blank slate.
 */
function readingOf(soul: SoulState): string[] {
  const lines: string[] = [];

  lines.push(
    soul.karma > 0
      ? 'Your light is warm. Something between you and someone else was mended on the way here.'
      : soul.karma < 0
        ? 'Your light has cooled. You stayed for what your death was doing to someone, and it went in.'
        : 'Your light is even. Nothing between you and anyone else moved on the way here.',
  );

  lines.push(
    soul.harmony >= 3
      ? 'You let go of a great deal of it.'
      : soul.harmony > 0
        ? 'You let go of some of it.'
        : 'You let go of none of it.',
  );

  lines.push(
    soul.attachment >= 0.5
      ? 'You are carrying a great deal. Weight is what the lower spheres are made of.'
      : soul.attachment <= 0.2
        ? 'You are carrying almost nothing.'
        : 'You are carrying some of it still.',
  );

  lines.push(
    soul.will >= 0.9
      ? 'Your will is strong, and will is what moves a soul that refuses.'
      : soul.will <= 0.6
        ? 'Your will is low. Refusing would be a long road on little.'
        : 'Your will is middling.',
  );

  // `L-THRESH-09`: the reports pair the reluctance to return with lasting change
  // afterwards. Shards are this game's version of what lasts — they survive the
  // river of forgetting while the specifics fade.
  if (soul.shards.length > 0) {
    lines.push(`You are keeping ${String(soul.shards.length)} thing${soul.shards.length === 1 ? '' : 's'} you were not born with.`);
  }

  return lines;
}


export const choiceScene: SceneDefinition = {
  id: 'threshold.choice',
  title: 'Enter the Light, or refuse it',
  exits: [
    { id: 'enter', label: 'Enter the Light', to: 'light.life-review' },
    // Declared because the state machine's exits must describe the real graph,
    // even where the far side is not built yet. The graph check reports this as
    // an unbuilt target rather than a softlock, and the button below says so
    // plainly instead of leading the player nowhere.
    { id: 'refuse', label: 'Refuse it', to: 'refuse.earthbound' },
  ],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.border;
    const air = airShell(context.resources, { radius: 130, ground: grammar.ground, glow: 0x241f3c, density: 1 });
    context.scene.add(air.mesh);

    const light = volumetricGlow(context.resources, { radius: 13, color: GRAMMAR.light.glow, intensity: 1.1, softness: 2.1 });
    light.mesh.position.set(-11, 2, -22);
    context.scene.add(light.mesh);

    const dark = volumetricGlow(context.resources, { radius: 11, color: 0x4b3f6e, intensity: 0.4, softness: 2.8 });
    dark.mesh.position.set(12, 1, -24);
    context.scene.add(dark.mesh);

    const motes = moteField(context.resources, context.rng.stream('choice-motes'), {
      count: 900,
      radius: 20,
      color: grammar.glow,
      size: 0.046,
    });
    context.scene.add(motes.points);

    context.rig.setMode('embodied');
    context.rig.position.set(0, 1.5, 0);
    context.rig.orient(0, 0);
    context.rig.setSway(0.3);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.14;
    grade.grain = 0.05;
    grade.vignette = 0.34;
    grade.aberration = 0.0022;
    grade.distortion = 0.026;
    grade.exposure = 1.02;
    grade.washColor = [1, 0.98, 0.95];
    grade.washAmount = 0.02;
    grade.smear = 0;
    context.post.setBloom(0.8, 0.72, 0.63);

    context.audio.drone(0.19, 57, 9);
    context.audio.shimmer(0.2);
    context.audio.heartbeat(false);

    let overlay: Overlay | undefined = new Overlay({
      title: 'Enter the Light, or refuse it.',
      body:
        'Both are real paths in the finished game. Entering leads to the life review, '
        + 'the Council and the Life Market. Refusing leads to the lower spheres, and rising '
        + 'from them by freeing other souls.',
      // What the corridor added up to, said out loud before the fork — because
      // every element of the Threshold asked the player something, and a fork
      // this size should be taken with the answers in view. `L-FRAN-03`: the
      // spirit body is the soul's own record and its state is visible, read by
      // others before the soul reads it itself.
      list: readingOf(context.soul),
      actions: [
        {
          id: 'enter',
          label: 'Enter the Light',
          onPick: () => {
            void context.takeExit('enter');
          },
        },
        {
          id: 'refuse',
          label: 'Refuse it',
          onPick: () => {
            // Honest rather than silent: Path B is declared in the graph and
            // planned in the manifest, and it is not built in this slice.
            context.captions.show('Refusing the Light is not built in this slice. Path B is next.', 7);
          },
        },
      ],
      hint: 'This slice builds entering the Light. Refusing is planned. Will is what Path B spends.',
    });
    overlay.focusFirst();

    context.resources.onDispose(() => {
      overlay?.dispose();
      overlay = undefined;
    });

    return {
      update(delta, elapsed) {
        setU(air.material, 'uTime', elapsed);
        light.update(elapsed, context.camera);
        dark.update(elapsed, context.camera);
        motes.drift(delta, elapsed);
        // The two pulls breathe out of phase, so the frame is never balanced.
        setU(light.material, 'uIntensity', 1.1 + Math.sin(elapsed * 0.4) * 0.12);
        setU(dark.material, 'uIntensity', 0.4 + Math.sin(elapsed * 0.33 + 2) * 0.08);
      },
    };
  },
};


// --- the life review ------------------------------------------------------------

/**
 * One moment, twice: once as he lived it, once as she did — and not alone.
 *
 * The brief calls the review the moral engine, and the engine is the switch of
 * vantage, not the content of the memory. So the memory is deliberately small —
 * an evening, a phone that did not get picked up — because a small moment
 * surviving the switch is what makes the mechanic land.
 *
 * The beats and their lengths are unchanged and the ledger entry is unchanged.
 * What changed is that the moment is now legible and that it is witnessed; see
 * `rememberedRoom` and the witnesses below.
 */
const REVIEW_BEATS: readonly Beat[] = [
  { id: 'his-side', seconds: 15, caption: 'He thought there would be time to call her back.' },
  { id: 'turning', seconds: 7 },
  { id: 'her-side', seconds: 16, caption: 'She waited up. She told herself he was just tired.' },
  { id: 'felt', seconds: 14, caption: 'This is what she felt. It was always here.' },
  { id: 'carried', seconds: 11, caption: 'Nothing is being weighed yet. It is only being seen.' },
  { id: 'wait', seconds: 1, hold: true },
];

/**
 * How the player's own light reads, as a colour the room can be given.
 *
 * `L-FRAN-03`: the spirit body is the soul's own record and its state is visible
 * to others — in the source, before the soul reads it itself. The witnesses are
 * handed this and carry a little of it in the light they give off, so they are
 * plainly seeing what the player brought with them, and say nothing about it.
 */
function carriedLight(soul: SoulState): number {
  if (soul.karma > 0) {
    return 0xffd7a4;
  }
  if (soul.karma < 0) {
    return 0xa9bcff;
  }
  return soul.attachment >= 0.5 ? 0x9a90b4 : 0xdcd6e8;
}

/**
 * The kitchen again, as a memory: the room, the table, two chairs, two cups, all
 * of it in outline.
 *
 * This was a table and two cups floating in black, and three reviews in a row
 * reported the review as unreadable — the player could see a couple of hairlines
 * and a white bloom and nothing else. Outline is the right language for a
 * remembered room, but an outline needs enough edges to be a room: the floor and
 * ceiling rectangles and the four corner posts are what tell the eye it is
 * inside somewhere, and the chairs are what tell it two people sat here.
 *
 * Everything is one `LineSegments`, so the whole room is a single draw call and
 * one geometry to dispose.
 */
function rememberedRoom(context: SceneContext, color: number): LineSegments {
  const vertices: number[] = [];
  const edge = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
  ): void => {
    vertices.push(ax, ay, az, bx, by, bz);
  };
  /** The four edges of an axis-aligned rectangle at height `y`. */
  const rectangle = (y: number, hx: number, hz: number): void => {
    edge(-hx, y, -hz, hx, y, -hz);
    edge(hx, y, -hz, hx, y, hz);
    edge(hx, y, hz, -hx, y, hz);
    edge(-hx, y, hz, -hx, y, -hz);
  };

  // The room. No walls, only their edges — so the presences outside are visible
  // straight through a room that is not really there.
  const ROOM_X = 3.35;
  const ROOM_Z = 2.25;
  const ROOM_Y = 2.5;
  rectangle(0, ROOM_X, ROOM_Z);
  rectangle(ROOM_Y, ROOM_X, ROOM_Z);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      edge(sx * ROOM_X, 0, sz * ROOM_Z, sx * ROOM_X, ROOM_Y, sz * ROOM_Z);
    }
  }

  // The lamp's flex. Without it the light over the table is a star in the dark
  // rather than something somebody in this house once switched on.
  edge(0, ROOM_Y, 0, 0, 1.9, 0);

  // The table, with its legs.
  const TABLE_X = 0.85;
  const TABLE_Z = 0.48;
  const TABLE_Y = 0.76;
  rectangle(TABLE_Y, TABLE_X, TABLE_Z);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      edge(sx * TABLE_X, 0, sz * TABLE_Z, sx * TABLE_X, TABLE_Y, sz * TABLE_Z);
    }
  }

  // Two chairs, one each side, pulled out a little. Seat, legs, and a back that
  // leans away from the table, which is the detail that stops a chair outline
  // reading as a crate.
  for (const side of [-1, 1] as const) {
    const cx = side * 1.28;
    const seat = 0.46;
    const half = 0.22;
    for (let i = 0; i < 4; i += 1) {
      const sx = i < 2 ? -1 : 1;
      const sz = i % 2 === 0 ? -1 : 1;
      edge(cx + sx * half, 0, sz * half, cx + sx * half, seat, sz * half);
    }
    edge(cx - half, seat, -half, cx + half, seat, -half);
    edge(cx + half, seat, -half, cx + half, seat, half);
    edge(cx + half, seat, half, cx - half, seat, half);
    edge(cx - half, seat, half, cx - half, seat, -half);
    const backX = cx + side * half;
    const leanX = backX + side * 0.1;
    edge(backX, seat, -half, leanX, seat + 0.48, -half);
    edge(backX, seat, half, leanX, seat + 0.48, half);
    edge(leanX, seat + 0.48, -half, leanX, seat + 0.48, half);
  }

  const geometry = context.resources.track(new BufferGeometry());
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  const material = context.resources.track(
    new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  return new LineSegments(geometry, material);
}

export const lifeReviewScene: SceneDefinition = {
  id: 'light.life-review',
  title: 'The life review',
  exits: [
    // The Council is next in the finished game. Within the slice the review is
    // the end of the built path, so it also offers a return to the beginning —
    // the reincarnation loop, standing in for itself.
    { id: 'council', label: 'To the Council', to: 'light.council' },
    { id: 'again', label: 'Begin again', to: 'content-notes' },
  ],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.review;
    // Lifted off black deliberately. A review held in a void reads as a slide
    // projected in an empty room; the air has to be a place for the presences to
    // be standing in.
    const air = airShell(context.resources, { radius: 100, ground: 0x1d1726, glow: 0x584273, density: 1 });
    context.scene.add(air.mesh);

    const memory = new Group();
    memory.add(rememberedRoom(context, grammar.glow));

    const tableSurfaceGeometry = context.resources.track(new PlaneGeometry(1.7, 0.96));
    const tableSurfaceMaterial = context.resources.track(
      new MeshBasicMaterial({
        color: 0x6a4428,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    const tableSurface = new Mesh(tableSurfaceGeometry, tableSurfaceMaterial);
    tableSurface.rotation.x = -Math.PI / 2;
    tableSurface.position.y = 0.755;
    memory.add(tableSurface);

    // The lamp over the table, and the pool it throws on the table top.
    //
    // This was one large billboarded glow sitting 1.7m from the camera, which on
    // a 60° lens is a brown dome across the bottom third of every frame — it is
    // the single biggest reason this scene read as a white smear with a hairline
    // in it. A lamp is a small bright thing high up, and the pool is a flat disc
    // lying on the table, so neither is ever in the lens.
    const lamp = volumetricGlow(context.resources, {
      radius: 0.2,
      color: 0xffcf96,
      intensity: 1.15,
      softness: 2.0,
    });
    lamp.mesh.position.set(0, 1.86, 0);
    memory.add(lamp.mesh);

    const pool = volumetricGlow(context.resources, {
      radius: 0.62,
      color: 0xffb877,
      intensity: 0.5,
      softness: 2.6,
    });
    // Laid flat on the table rather than billboarded: `update` is never called
    // on it, so it keeps this orientation and stays a pool of light.
    pool.mesh.rotation.x = -Math.PI / 2;
    pool.mesh.position.set(0, 0.772, 0.02);
    memory.add(pool.mesh);

    const cupGeometry = context.resources.track(new CylinderGeometry(0.05, 0.042, 0.1, 16));
    const cupMaterial = context.resources.track(
      new MeshBasicMaterial({
        color: 0xffd9ae,
        transparent: true,
        opacity: 0.7,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    for (const [x, z] of [[-0.42, 0.1], [0.44, -0.06]] as const) {
      const cup = new Mesh(cupGeometry, cupMaterial);
      cup.position.set(x, 0.82, z);
      memory.add(cup);
    }
    context.scene.add(memory);

    // Him in his chair, her in hers. Both abstract presences, each sitting just
    // inside their own vantage — so whoever is being inhabited is behind the
    // camera's eye and the other one is across the table where they can be seen.
    const him = figureOfLight(context.resources, {
      height: 1.22,
      color: 0xffd9a4,
      accent: 0xc2884a,
      seed: 3.1,
    });
    him.group.position.set(-1.3, 0.44, 0.14);
    context.scene.add(him.group);

    const her = figureOfLight(context.resources, {
      height: 1.18,
      color: 0xd8c6ff,
      accent: 0x8a73d6,
      seed: 11.4,
    });
    her.group.position.set(1.34, 0.46, -0.08);
    context.scene.add(her.group);

    // The phone that did not get picked up: one small, specific light. Small is
    // the whole point of it, and it had grown into the brightest object in the
    // game.
    const phone = volumetricGlow(context.resources, { radius: 0.1, color: 0x9fe6ff, intensity: 1.1, softness: 2.2 });
    phone.mesh.position.set(0.12, 0.84, 0.28);
    context.scene.add(phone.mesh);

    const motes = moteField(context.resources, context.rng.stream('review-motes'), {
      count: 1100,
      radius: 7,
      color: grammar.accent,
      size: 0.07,
    });
    context.scene.add(motes.points);

    /**
     * The ones who are present while this is looked at.
     *
     * `L-THRESH-07`: the review is panoramic and often simultaneous rather than
     * sequential. `L-THRESH-10`: in Moody's composite it is not watched alone —
     * the being of light is present through it, and the accounts are emphatic
     * that there is no reproach in it. `L-BETWEEN-01`: souls are described as
     * met by familiar presences who reincarnate in company with them. These are
     * that company. They are **not** the Council: `L-BETWEEN-02`'s council of
     * elders is `light.council`, its own scene, and it weighs. Nothing here
     * weighs anything.
     *
     * Four appearances of **one** being, each a perspective shadow in R3 of the
     * same 24-cell in R4, differing only in the vantage in the fourth dimension
     * they are seen from, and all four driven by a single shared rotation
     * computed once per frame. They change shape in exact lockstep without ever
     * looking like copies of one another, which is simultaneity as geometry
     * rather than as a caption. See `higher-dimensional.ts` for the whole
     * construction and for the rules that keep it out of the DMT register.
     *
     * Placement is the other half of keeping this from reading as a tribunal
     * (`L-THRESH-06`: wholly loving, and without judgement):
     *
     * - Two sit beyond his side of the table and two beyond hers, at different
     *   distances and heights, so there is no arc, no ring and no symmetry
     *   anywhere in the arrangement. A semicircle of figures facing a seated
     *   person is a jury; this is deliberately not one.
     * - All four are twelve metres away or more and well above the eyeline. They
     *   are enormous in the frame and nowhere near the player, which is the
     *   difference between vast and looming.
     * - None of them ever moves. Their positions are set here and never touched
     *   again, and nothing in their update reads the player's position, the
     *   camera, or the soul's ledger.
     */
    const carried = carriedLight(context.soul);
    const witnesses = (
      [
        { x: 13.4, y: 3.3, z: 2.6, radius: 3.4, distance: 2.1, weight: 0.6, side: 1 },
        { x: 19.0, y: 6.4, z: -6.0, radius: 4.3, distance: 3.6, weight: 0.48, side: 1 },
        { x: -12.8, y: 3.1, z: -3.0, radius: 3.2, distance: 1.9, weight: 0.6, side: -1 },
        { x: -19.4, y: 6.8, z: 5.0, radius: 4.6, distance: 4.4, weight: 0.46, side: -1 },
      ] as const
    ).map((spec, index) => {
      const vantage = WITNESS_VANTAGES[index] ?? WITNESS_VANTAGES[0] ?? [];
      const presence = witnessOfLight(context.resources, {
        radius: spec.radius,
        color: grammar.glow,
        accent: grammar.accent,
        carried,
        vantage,
        distance: spec.distance,
        weight: spec.weight,
      });
      presence.group.position.set(spec.x, spec.y, spec.z);
      context.scene.add(presence.group);

      // Light the lattice is drawn on, so an appearance reads as a body of
      // light with a structure inside it rather than as a wireframe diagram.
      // Held very low: it is twelve metres away and the size of a house, and at
      // any real intensity it would be the brightest thing in the frame.
      const halo = volumetricGlow(context.resources, {
        radius: spec.radius * 1.15,
        color: grammar.accent,
        intensity: 0.26,
        softness: 2.8,
      });
      halo.mesh.position.set(spec.x, spec.y, spec.z);
      context.scene.add(halo.mesh);

      return { presence, halo, side: spec.side };
    });

    const director = new Director(REVIEW_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 10);
      }
    });

    // Two vantages: his chair, and hers. The move between them is the mechanic,
    // so it is slow enough to be felt and short enough not to be a journey.
    //
    // Both seats were a metre and a half from the table centre, which put the
    // near figure inside the lens and the whole memory in a strip along the
    // bottom of the frame. Pulled back and raised, the table, both chairs, both
    // people and the room's edges are all in shot at once.
    const hisSeat = new Vector3(-2.78, 1.46, 0.24);
    const herSeat = new Vector3(2.84, 1.44, -0.18);

    // From the left-hand seat the table is to the camera's +X, so the yaw must
    // face that way. It was pointing the opposite direction, which aimed the
    // whole scene off-screen and is why the frame measured as empty.
    const HIS_YAW = -Math.PI * 0.5;
    const HER_YAW = Math.PI * 0.5;

    context.rig.setMode('drifting');
    context.rig.position.copy(hisSeat);
    context.rig.target.copy(hisSeat);
    context.rig.orient(HIS_YAW, -0.1);
    context.rig.setSway(0.3);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    /**
     * The grade.
     *
     * Exposure was 1.55 here against 1.02–1.05 everywhere else in the game, with
     * a bloom threshold of 0.67 under it, so every lit thing in the scene passed
     * the threshold and the whole middle of the frame bloomed into white. The
     * gate's visibility bounds were satisfied the entire time — a bright blob
     * has a high mean, a high standard deviation and plenty of bright pixels —
     * which is exactly why those bounds are a floor and not a judgement.
     *
     * So: exposure back in line with the rest of the game, and the bloom
     * threshold high enough that only the lamp and the phone bloom at all.
     */
    const grade = context.post.grade;
    grade.drain = 0.26;
    grade.grain = grammar.grain;
    grade.vignette = 0.3;
    grade.aberration = 0.002;
    grade.distortion = 0.028;
    grade.exposure = 1.12;
    grade.washColor = [1, 0.95, 0.9];
    grade.washAmount = 0.015;
    grade.smear = 0;
    context.post.setBloom(0.52, 0.72, 0.8);

    context.audio.drone(0.18, 54, 5);
    context.audio.shimmer(0.14);
    context.audio.room(0.07, 900);
    context.audio.heartbeat(false);

    // The review is where karma is read, not scored. Harmony rises because the
    // moment was actually looked at (GAME_BRIEF.md § Systems).
    let credited = false;
    // The two vantages are a cut, not a pan: the camera reverses across the
    // table so the switch is unmistakable to someone who glanced away. Flipped
    // once, on the crossing, so the player keeps look control either side of it.
    let facing: 'his' | 'hers' = 'his';

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;

        setU(air.material, 'uTime', elapsed);
        setU(him.material, 'uTime', elapsed);
        setU(her.material, 'uTime', elapsed);
        phone.update(elapsed, context.camera);
        lamp.update(elapsed, context.camera);
        // The pool is never billboarded, so only its churn is advanced.
        setU(pool.material, 'uTime', elapsed);
        motes.drift(delta, elapsed);

        // 0 = his vantage, 1 = hers.
        const side = beat.id === 'his-side'
          ? 0
          : beat.id === 'turning'
            ? ease.inOut(t)
            : 1;

        const vantage = hisSeat.clone().lerp(herSeat, side);
        context.rig.target.copy(vantage);

        if (side > 0.5 && facing === 'his') {
          facing = 'hers';
          context.rig.orient(HER_YAW, -0.1);
        } else if (side <= 0.5 && facing === 'hers') {
          facing = 'his';
          context.rig.orient(HIS_YAW, -0.1);
        }

        // Whoever is being inhabited goes out; the other one resolves. You are
        // behind their eyes, which means the person you can see is the other
        // one — and the frame said the opposite of its own comment until now,
        // lighting up the figure sitting in the camera's lap and softening the
        // one across the table.
        setU(him.material, 'uResolve', 0.12 + side * 0.88);
        setU(her.material, 'uResolve', 0.12 + (1 - side) * 0.88);

        // Her side is cooler and closer. The grade carries the change of
        // interior, so the switch is felt before it is read.
        grade.washColor = [1 - side * 0.06, 0.95 + side * 0.02, 0.9 + side * 0.08];
        grade.vignette = 0.3 + side * 0.05;
        context.audio.drone(0.18, 54 - side * 6, 5 + side * 5);

        // The phone pulses at the moment it is being understood.
        const understanding = beat.id === 'felt' ? ease.out(t) : beat.id === 'carried' || beat.id === 'wait' ? 1 : 0;
        setU(phone.material, 'uIntensity', 1.1 + understanding * 1.1 + Math.sin(elapsed * 1.4) * 0.08);
        setU(lamp.material, 'uIntensity', 1.15 + understanding * 0.2);
        // Colour comes back as the moment lands, which is mostly the company's
        // colour arriving: they are the only thing in frame with a hue the rest
        // of the room does not have.
        grade.drain = 0.26 - side * 0.06 - understanding * 0.1;
        grade.exposure = 1.12 + understanding * 0.05;
        context.post.setBloom(0.52 + understanding * 0.22, 0.72, 0.8 - understanding * 0.04);
        context.audio.shimmer(0.14 + understanding * 0.26);

        /**
         * The company.
         *
         * One rotation for all of them, so the four appearances are one being
         * (`L-THRESH-07`). `understanding` is the only thing they respond to:
         * they take the memory's colour and their turn eases as the moment
         * lands. That is being moved by what they are seeing. Nothing here
         * reads the player's position or the ledger, nothing approaches, and
         * nothing they do changes any of the soul's state (`L-THRESH-06`).
         */
        const rotation = simultaneousRotation(elapsed, understanding);
        const presence = 0.82 + understanding * 0.18;
        for (const witness of witnesses) {
          // The ones in the direction the player is facing carry a little more
          // light. Attention follows the player's attention; it is never aimed
          // at them.
          const inView = witness.side > 0 ? 1 - side : side;
          const lit = presence * (0.72 + inView * 0.28);
          witness.presence.setPresence(lit);
          witness.presence.setWarmth(understanding);
          witness.presence.update(elapsed, rotation);
          witness.halo.update(elapsed, context.camera);
          setU(witness.halo.material, 'uIntensity', lit * (0.26 + understanding * 0.18));
        }
        if (!credited && (beat.id === 'carried' || beat.id === 'wait')) {
          credited = true;
          // KARMA is the ledger of effect on others as felt in the review, not a
          // good/evil meter (GAME_BRIEF.md § Systems). The call she did not get
          // cost her a night, and feeling it from her side is what enters it.
          //
          // Automatic, and it must stay automatic: `tests/gate/brief.spec.ts`
          // drives this scene with `advanceBeat()` and never clicks.
          context.soul.karma -= 1;
          // HARMONY rises because the moment was faced rather than passed over.
          context.soul.harmony += 1;
          context.soul.shards.push('review.the-phone-call');
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
