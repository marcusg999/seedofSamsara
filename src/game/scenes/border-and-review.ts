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
  { id: 'arrive', seconds: 8 },
  { id: 'the-limit', seconds: 14, caption: 'Past this, there is no coming back.' },
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
 * One moment, twice: once as he lived it, once as she did.
 *
 * The brief calls the review the moral engine, and the engine is the switch of
 * vantage, not the content of the memory. So the memory is deliberately small —
 * an evening, a phone that did not get picked up — because a small moment
 * surviving the switch is what makes the mechanic land.
 */
const REVIEW_BEATS: readonly Beat[] = [
  { id: 'his-side', seconds: 24, caption: 'He thought there would be time to call her back.' },
  { id: 'turning', seconds: 12 },
  { id: 'her-side', seconds: 26, caption: 'She waited up. She told herself he was just tired.' },
  { id: 'felt', seconds: 22, caption: 'This is what she felt. It was always here.' },
  { id: 'carried', seconds: 18, caption: 'Nothing is being weighed yet. It is only being seen.' },
  { id: 'wait', seconds: 1, hold: true },
];

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
    const air = airShell(context.resources, { radius: 100, ground: grammar.ground, glow: 0x3a2742, density: 1 });
    context.scene.add(air.mesh);

    // The kitchen again, as a memory: the table, two chairs, two cups, in outline.
    const memory = new Group();
    const hw = 0.85;
    const vertices: number[] = [];
    const tableCorners: [number, number, number][] = [
      [-hw, 0.76, -0.48], [hw, 0.76, -0.48], [hw, 0.76, 0.48], [-hw, 0.76, 0.48],
    ];
    for (let i = 0; i < tableCorners.length; i += 1) {
      const from = tableCorners[i];
      const to = tableCorners[(i + 1) % tableCorners.length];
      if (!from || !to) {
        continue;
      }
      vertices.push(...from, ...to);
      vertices.push(from[0], 0, from[2], from[0], 0.76, from[2]);
    }
    const lineGeometry = context.resources.track(new BufferGeometry());
    lineGeometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    const lineMaterial = context.resources.track(
      new LineBasicMaterial({
        color: grammar.glow,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    memory.add(new LineSegments(lineGeometry, lineMaterial));

    const tableSurfaceGeometry = context.resources.track(new PlaneGeometry(hw * 2, 0.96));
    const tableSurfaceMaterial = context.resources.track(
      new MeshBasicMaterial({
        color: 0x4a2f1e,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    const tableSurface = new Mesh(tableSurfaceGeometry, tableSurfaceMaterial);
    tableSurface.rotation.x = -Math.PI / 2;
    tableSurface.position.y = 0.755;
    memory.add(tableSurface);

    // A pool of light on the table, so the objects on it sit on something.
    const tablePool = volumetricGlow(context.resources, {
      radius: 1.5,
      color: 0xffbb7a,
      intensity: 0.55,
      softness: 2.4,
    });
    tablePool.mesh.position.set(0, 0.95, 0.05);
    memory.add(tablePool.mesh);

    const cupGeometry = context.resources.track(new CylinderGeometry(0.05, 0.042, 0.1, 16));
    const cupMaterial = context.resources.track(
      new MeshBasicMaterial({
        color: 0xffd9ae,
        transparent: true,
        opacity: 0.6,
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

    // Him, at the table. Her, across it. Both abstract presences.
    const him = figureOfLight(context.resources, {
      height: 1.5,
      color: 0xffd9a4,
      accent: 0xc2884a,
      seed: 3.1,
    });
    him.group.position.set(-1.0, 0.1, 0.12);
    context.scene.add(him.group);

    const her = figureOfLight(context.resources, {
      height: 1.46,
      color: 0xd8c6ff,
      accent: 0x8a73d6,
      seed: 11.4,
    });
    her.group.position.set(1.02, 0.1, -0.06);
    context.scene.add(her.group);

    // The phone that did not get picked up: one small, specific light.
    const phone = volumetricGlow(context.resources, { radius: 0.42, color: 0x9fe6ff, intensity: 1.6, softness: 2.2 });
    phone.mesh.position.set(0.1, 0.84, 0.3);
    context.scene.add(phone.mesh);

    const motes = moteField(context.resources, context.rng.stream('review-motes'), {
      count: 1500,
      radius: 9,
      color: grammar.accent,
      size: 0.13,
    });
    context.scene.add(motes.points);

    const director = new Director(REVIEW_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 10);
      }
    });

    // Two vantages: his chair, and hers. The move between them is the mechanic,
    // so it is slow enough to be felt and short enough not to be a journey.
    const hisSeat = new Vector3(-1.72, 1.12, 0.2);
    const herSeat = new Vector3(1.76, 1.1, -0.1);

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

    const grade = context.post.grade;
    grade.drain = grammar.drain;
    grade.grain = grammar.grain;
    grade.vignette = 0.4;
    grade.aberration = 0.002;
    grade.distortion = 0.03;
    grade.exposure = 1.55;
    grade.washColor = [1, 0.93, 0.86];
    grade.washAmount = 0.02;
    grade.smear = 0;
    context.post.setBloom(grammar.bloom, 0.68, 0.67);

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

        // Whoever is being inhabited resolves; the other one softens, because the
        // point is that you are behind their eyes, not looking at them.
        setU(him.material, 'uResolve', 0.6 + (1 - side) * 0.4);
        setU(her.material, 'uResolve', 0.6 + side * 0.4);

        // Her side is cooler and closer. The grade carries the change of
        // interior, so the switch is felt before it is read.
        grade.washColor = [1 - side * 0.08, 0.93 + side * 0.03, 0.86 + side * 0.12];
        grade.drain = grammar.drain - side * 0.12;
        grade.vignette = 0.4 + side * 0.08;
        context.audio.drone(0.18, 54 - side * 6, 5 + side * 5);

        // The phone pulses at the moment it is being understood.
        const understanding = beat.id === 'felt' ? ease.out(t) : beat.id === 'carried' || beat.id === 'wait' ? 1 : 0;
        setU(phone.material, 'uIntensity', 1.6 + understanding * 1.8 + Math.sin(elapsed * 1.4) * 0.12);
        tablePool.update(elapsed, context.camera);
        grade.exposure = 1.55 + understanding * 0.12;
        context.post.setBloom(grammar.bloom + understanding * 0.5, 0.68, 0.67);
        context.audio.shimmer(0.14 + understanding * 0.26);

        if (!credited && (beat.id === 'carried' || beat.id === 'wait')) {
          credited = true;
          // KARMA is the ledger of effect on others as felt in the review, not a
          // good/evil meter (GAME_BRIEF.md § Systems). The call she did not get
          // cost her a night, and feeling it from her side is what enters it.
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
