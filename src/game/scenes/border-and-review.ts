import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
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
import { luminousPanel, rememberedMoment, type MomentSpec } from '../systems/remembered';
import { RELEASE_SECONDS, ThresholdPrompt, clamp01 } from './threshold-early';

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
    { id: 'unanswered', label: 'Go on', to: 'threshold.choice' },
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

    prompt.releaseAfter(RELEASE_SECONDS, () => { void context.takeExit('unanswered'); });
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
 * The rest of the life, standing in the same dark at the same time.
 *
 * `L-THRESH-07` says the review is panoramic and often *simultaneous* rather
 * than sequential, and the brief takes the same line: a whole life present at
 * once. A slideshow is the one staging that cannot be either. So the moments do
 * not take turns. They are all built at load, all lit from the first frame, and
 * none of them is ever removed — the evening the caption is about is simply the
 * one the player is sitting inside, and the others are further off in the dark
 * at different depths and different heights, found by turning the head.
 *
 * Each one is a held instant of space rather than a picture of an event: a floor
 * with an edge, a door open or shut, and one or two people standing at a chosen
 * distance from each other and from the light. That is deliberately almost no
 * information — and distance, orientation and light between two forms is how
 * much of it a person can read anyway.
 *
 * GAME_BRIEF.md § Systems measures karma as effect on another person, not as a
 * tally, so these are not three charges. The first is a moment that landed well
 * and it is the warmest and nearest of the three. `L-THRESH-06`: wholly loving,
 * and without judgement. Nothing here scores, and nothing here is captioned.
 */
interface DistantMoment {
  /** Where the moment stands, in the review's space. */
  readonly at: readonly [number, number, number];
  /** Which way the place is turned. No two share an orientation. */
  readonly turn: number;
  /** How present it is before the moment being spoken about lands. */
  readonly rest: number;
  readonly spec: MomentSpec;
}

const DISTANT_MOMENTS: readonly DistantMoment[] = [
  /**
   * Two of them close together under one light, the smaller one nearer to it.
   * Nothing between them: no table, no door, no distance worth measuring.
   */
  {
    at: [15.5, -2.2, 10.5],
    turn: -0.62,
    rest: 0.9,
    spec: {
      floor: { width: 6.4, depth: 5.0, color: 0xffc38a, intensity: 0.4, edge: 0.6 },
      shared: { at: [-0.25, 1.75, 0.3], radius: 1.3, color: 0xffcf9a, intensity: 0.8 },
      presences: [
        { at: [-1.3, 0.35], height: 2.7, color: 0xffd9a4, intensity: 1.35 },
        { at: [0.45, -0.05], height: 1.7, width: 0.5, color: 0xffe3bc, intensity: 1.3 },
      ],
      seed: 2.1,
    },
  },
  /**
   * A door standing wide open with the light on behind it, and one person a
   * long way across the floor from it, turned the other way. The whole content
   * is the gap between the two — an open door nobody is going through.
   */
  {
    at: [27, -6.2, -12],
    turn: 0.55,
    rest: 0.8,
    spec: {
      floor: { width: 11, depth: 8, color: 0xb59ad8, intensity: 0.3, edge: 0.7 },
      opening: {
        at: [-3.8, -1.4],
        width: 2.1,
        height: 3.8,
        color: 0xffd8a8,
        intensity: 1.0,
        turn: Math.PI / 2,
        open: 1,
        reach: 5.0,
      },
      presences: [{ at: [3.4, 1.7], height: 3.3, color: 0xd8c6ff, intensity: 1.25 }],
      seed: 7.4,
    },
  },
  /**
   * Two of them on one floor with the whole floor between them, and the only
   * light in the place standing at one end of it. No door, no furniture and no
   * event: just how far apart two people were, and which of them the light was
   * near. It is the near moment's own shape at another scale, which is what a
   * life looks like when all of it is present at once.
   */
  {
    at: [-18, -3.4, -10],
    turn: 2.5,
    rest: 0.85,
    spec: {
      floor: { width: 9.5, depth: 5.4, color: 0xc9a7d8, intensity: 0.34, edge: 0.64 },
      shared: { at: [-3.1, 1.6, 0.1], radius: 1.0, color: 0xffd3a0, intensity: 0.9 },
      presences: [
        { at: [-3.8, 0.2], height: 2.8, color: 0xffd3a0, intensity: 1.3 },
        { at: [3.6, -0.5], height: 2.7, color: 0xbda7e8, intensity: 0.8 },
      ],
      seed: 13.7,
    },
  },
  /**
   * Three of them standing close in, with the light down among them rather than
   * over them. The review is not a charge sheet — GAME_BRIEF.md § Systems
   * measures karma as effect on another person, not as a tally — so two of the
   * four moments standing in this dark are ones where the effect was warmth.
   */
  {
    at: [-24, -5.6, 11],
    turn: -2.1,
    rest: 0.82,
    spec: {
      floor: { width: 6.8, depth: 5.2, color: 0xffcb9a, intensity: 0.38, edge: 0.58 },
      shared: { at: [0.1, 0.75, 0.15], radius: 1.15, color: 0xffd9ac, intensity: 0.85 },
      presences: [
        { at: [-1.5, 0.3], height: 3.0, color: 0xffd9a4, intensity: 1.3 },
        { at: [-0.1, -0.5], height: 2.2, width: 0.6, color: 0xffe6c4, intensity: 1.25 },
        { at: [1.35, 0.25], height: 2.6, color: 0xffcf9a, intensity: 1.2 },
      ],
      seed: 19.2,
    },
  },
];

/**
 * The evening itself: two places, not one room.
 *
 * It used to be one kitchen table with the two of them sitting across it, which
 * contradicted its own captions — he thought there would be time to call her
 * back, and she waited up, which means they were nowhere near each other. So
 * the moment is staged as what it says it is: two islands of floor with a dark
 * gap between them, and the gap is the distance the call did not cross.
 *
 * Each island has one opening, and the two openings are the moment's whole
 * argument. Hers stands wide open with the hall light on and the light lying
 * across her floor; his is shut to a seam. Neither is a verdict — a shut door
 * is just a shut door — but a player who never reads a caption can see which
 * side of the evening they are on from the shape of the light alone.
 */
const HIS_FLOOR: readonly [number, number, number] = [-4.5, 0, 0.1];
const HER_FLOOR: readonly [number, number, number] = [4.6, 0, 0.3];

const HIS_PLACE: MomentSpec = {
  floor: { width: 5.4, depth: 3.8, color: 0xc8a37e, intensity: 0.34, edge: 0.5 },
  opening: {
    at: [-1.6, 0.8],
    width: 1.15,
    height: 2.1,
    color: 0xffcf9a,
    intensity: 1.15,
    turn: Math.PI / 2,
    // Shut, and the light still on behind it.
    open: 0.05,
    reach: 1.1,
  },
  presences: [],
  seed: 21.3,
};

const HER_PLACE: MomentSpec = {
  floor: { width: 5.4, depth: 3.8, color: 0xffc08a, intensity: 0.4, edge: 0.48 },
  opening: {
    at: [1.3, -1.6],
    width: 1.1,
    height: 2.15,
    color: 0xffc98e,
    intensity: 0.92,
    turn: -Math.PI / 2,
    open: 1,
    reach: 3.2,
  },
  presences: [],
  seed: 29.8,
};

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
    const air = airShell(context.resources, { radius: 100, ground: 0x201829, glow: 0x6b4f8c, density: 1 });
    context.scene.add(air.mesh);

    /**
     * The evening, built as two places rather than one room.
     *
     * Everything in it is a sheet of light: a floor with an edge, a surface at
     * waist height, a door. See `systems/remembered.ts` for why outline was the
     * wrong language — an outline is a diagram of a place, and this has to be a
     * memory of one.
     */
    const memory = new Group();

    const hisPlace = rememberedMoment(context.resources, HIS_PLACE);
    hisPlace.group.position.set(HIS_FLOOR[0], HIS_FLOOR[1], HIS_FLOOR[2]);
    memory.add(hisPlace.group);

    const herPlace = rememberedMoment(context.resources, HER_PLACE);
    herPlace.group.position.set(HER_FLOOR[0], HER_FLOOR[1], HER_FLOOR[2]);
    memory.add(herPlace.group);

    // Where he was: a surface at the height of a desk with one cold light on it.
    const hisSurface = luminousPanel(context.resources, {
      width: 1.3,
      height: 0.82,
      color: 0xd8a877,
      intensity: 0.48,
      softness: 0.5,
      churn: 0.25,
      seed: 4.2,
    });
    hisSurface.mesh.rotation.x = -Math.PI / 2;
    hisSurface.mesh.position.set(-2.95, 0.74, 0.16);
    memory.add(hisSurface.mesh);

    // Where she was: the same surface, warmer, with a lamp over it.
    const herSurface = luminousPanel(context.resources, {
      width: 1.35,
      height: 0.9,
      color: 0xffbe84,
      intensity: 0.6,
      softness: 0.5,
      churn: 0.25,
      seed: 8.6,
    });
    herSurface.mesh.rotation.x = -Math.PI / 2;
    herSurface.mesh.position.set(2.95, 0.745, 0.25);
    memory.add(herSurface.mesh);

    /**
     * Her lamp, the pool it throws, and the flex it hangs on.
     *
     * The lamp was a large billboarded glow a metre and a half from the camera,
     * which on a 60° lens is a dome across the bottom third of every frame and
     * was most of why this scene read as a white smear. It is now a small bright
     * thing a long way off, over the only table in the frame — and the flex is
     * what says somebody in that house reached up and switched it on.
     */
    const lamp = volumetricGlow(context.resources, {
      radius: 0.17,
      color: 0xffcf96,
      intensity: 0.62,
      softness: 2.0,
    });
    lamp.mesh.position.set(2.95, 1.8, 0.25);
    memory.add(lamp.mesh);

    const flex = luminousPanel(context.resources, {
      width: 0.03,
      height: 0.5,
      color: 0xffcf96,
      intensity: 0.34,
      softness: 0.3,
      lean: 0.6,
      churn: 0,
      seed: 6.1,
      facing: 'upright',
    });
    flex.mesh.position.set(2.95, 2.14, 0.25);
    memory.add(flex.mesh);

    const pool = volumetricGlow(context.resources, {
      radius: 0.5,
      color: 0xffb877,
      intensity: 0.42,
      softness: 2.6,
    });
    // Laid flat rather than billboarded: `update` is never called on it, so it
    // keeps this orientation and stays a pool of light on the table.
    pool.mesh.rotation.x = -Math.PI / 2;
    pool.mesh.position.set(2.95, 0.768, 0.25);
    memory.add(pool.mesh);

    // One cup, on her side. It used to be two, on one table, which said they had
    // sat down together — the opposite of what the captions say happened.
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
    const cup = new Mesh(cupGeometry, cupMaterial);
    cup.position.set(3.2, 0.81, 0.08);
    memory.add(cup);
    context.scene.add(memory);

    // Him in his place, her in hers, each sitting just behind their own vantage
    // — so whoever is being inhabited is behind the camera's eye and out of
    // frame, and the other one is across the gap where they can be seen.
    const him = figureOfLight(context.resources, {
      height: 1.22,
      color: 0xffd9a4,
      accent: 0xc2884a,
      seed: 3.1,
    });
    him.group.position.set(-4.0, 0.34, 0.16);
    context.scene.add(him.group);

    const her = figureOfLight(context.resources, {
      height: 1.18,
      color: 0xd8c6ff,
      accent: 0x8a73d6,
      seed: 11.4,
    });
    her.group.position.set(4.15, 0.36, 0.47);
    context.scene.add(her.group);

    // The phone that did not get picked up: one small, specific, cold light, on
    // his side of a three-metre gap of nothing. Small is the whole point of it,
    // and it had grown into the brightest object in the game.
    const phone = volumetricGlow(context.resources, { radius: 0.09, color: 0x9fe6ff, intensity: 0.9, softness: 2.2 });
    phone.mesh.position.set(-2.87, 0.8, 0.22);
    context.scene.add(phone.mesh);

    // The rest of the life, already there. See `DISTANT_MOMENTS`.
    const distant = DISTANT_MOMENTS.map((entry) => {
      const moment = rememberedMoment(context.resources, entry.spec);
      moment.group.position.set(entry.at[0], entry.at[1], entry.at[2]);
      moment.group.rotation.y = entry.turn;
      moment.setPresence(entry.rest);
      context.scene.add(moment.group);
      return { moment, rest: entry.rest };
    });

    const motes = moteField(context.resources, context.rng.stream('review-motes'), {
      count: 900,
      radius: 11,
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
     * - Two sit beyond his side and two beyond hers, at different distances and
     *   heights, so there is no arc, no ring and no symmetry anywhere in the
     *   arrangement. A semicircle of figures facing a seated person is a jury;
     *   this is deliberately not one.
     * - All four are fifteen metres away or more and well above the eyeline —
     *   and they have been moved further out and further up again, because the
     *   remembered moments now lie below the horizon and the company belongs
     *   above it. The life is underneath; the ones watching it are overhead.
     * - None of them ever moves. Their positions are set here and never touched
     *   again, and nothing in their update reads the player's position, the
     *   camera, or the soul's ledger.
     */
    const carried = carriedLight(context.soul);
    const witnesses = (
      [
        { x: 15.0, y: 6.0, z: 4.5, radius: 3.4, distance: 2.1, weight: 0.6, side: 1 },
        { x: 24.0, y: 9.0, z: -3.5, radius: 4.3, distance: 3.6, weight: 0.48, side: 1 },
        { x: -15.0, y: 5.6, z: -4.0, radius: 3.2, distance: 1.9, weight: 0.6, side: -1 },
        { x: -24.0, y: 10.0, z: 7.5, radius: 4.6, distance: 4.4, weight: 0.46, side: -1 },
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
      // Held very low: it is fifteen metres away and the size of a house, and at
      // any real intensity it would be the brightest thing in the frame.
      const halo = volumetricGlow(context.resources, {
        radius: spec.radius * 1.15,
        color: grammar.accent,
        intensity: 0.16,
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

    /**
     * Two vantages: where he was, and where she was. The move between them is
     * the mechanic, so it is slow enough to be felt and short enough not to be a
     * journey.
     *
     * Each seat sits just in front of its own figure and just behind its own
     * table, which puts both out of frame from inside them: a person looking up
     * does not see their own hands. What is in frame is the other place, six and
     * a half metres away across the dark, with everything in it — the surface,
     * the one light over it, the person, and the door behind them — inside a
     * twenty-degree cone. One look takes the whole of it in.
     */
    const hisSeat = new Vector3(-3.4, 1.44, 0.1);
    const herSeat = new Vector3(3.55, 1.42, 0.4);

    // From his place hers is to the camera's +X, so the yaw must face that way.
    const HIS_YAW = -Math.PI * 0.5;
    const HER_YAW = Math.PI * 0.5;
    // Tipped a little further down than the rest of the game: the remembered
    // moments lie below the horizon and the company stands above it, and this is
    // the angle that holds the near floor's own edge in the bottom of the frame.
    const REVIEW_PITCH = -0.15;

    context.rig.setMode('drifting');
    context.rig.position.copy(hisSeat);
    context.rig.target.copy(hisSeat);
    context.rig.orient(HIS_YAW, REVIEW_PITCH);
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
    grade.vignette = 0.24;
    grade.aberration = 0.002;
    grade.distortion = 0.028;
    grade.exposure = 1.18;
    grade.washColor = [1, 0.95, 0.9];
    grade.washAmount = 0.015;
    grade.smear = 0;
    context.post.setBloom(0.5, 0.72, 0.84);

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

        hisPlace.update(elapsed, context.camera);
        herPlace.update(elapsed, context.camera);
        hisSurface.update(elapsed, context.camera);
        herSurface.update(elapsed, context.camera);
        flex.update(elapsed, context.camera);

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
          context.rig.orient(HER_YAW, REVIEW_PITCH);
        } else if (side <= 0.5 && facing === 'hers') {
          facing = 'his';
          context.rig.orient(HIS_YAW, REVIEW_PITCH);
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
        grade.vignette = 0.24 + side * 0.05;
        context.audio.drone(0.18, 54 - side * 6, 5 + side * 5);

        // The phone pulses at the moment it is being understood.
        const understanding = beat.id === 'felt' ? ease.out(t) : beat.id === 'carried' || beat.id === 'wait' ? 1 : 0;
        setU(phone.material, 'uIntensity', 0.9 + understanding * 0.95 + Math.sin(elapsed * 1.4) * 0.07);
        setU(lamp.material, 'uIntensity', 0.62 + understanding * 0.14);

        // The rest of the life comes further up as this one moment lands. It
        // was already there and it stays where it is — what changes is only how
        // much of it the soul is able to hold at once, which is `L-THRESH-07`'s
        // panoramic quality arriving rather than a cue being played.
        for (const entry of distant) {
          entry.moment.setPresence(entry.rest * (1 + understanding * 0.5));
          entry.moment.update(elapsed, context.camera);
        }
        // Colour comes back as the moment lands, which is mostly the company's
        // colour arriving: they are the only thing in frame with a hue the rest
        // of the room does not have.
        grade.drain = 0.26 - side * 0.06 - understanding * 0.1;
        grade.exposure = 1.18 + understanding * 0.05;
        context.post.setBloom(0.5 + understanding * 0.2, 0.72, 0.84 - understanding * 0.04);
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
          setU(witness.halo.material, 'uIntensity', lit * (0.18 + understanding * 0.14));
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
