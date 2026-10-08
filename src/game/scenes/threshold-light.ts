import {
  BackSide,
  CircleGeometry,
  Color,
  CylinderGeometry,
  MeshBasicMaterial,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { GRAMMAR, colorOf } from '../systems/palette';
import { Director, ease, type Beat } from '../systems/director';
import { airShell, figureOfLight, moteField, radianceShell, volumetricGlow } from '../systems/forms';
import { NOISE, setU } from '../systems/glsl';
import { RELEASE_SECONDS, ThresholdPrompt, clamp01 } from './threshold-early';

/**
 * The tunnel, the ones who come to meet you, and the Being of Light
 * (lore bible `L-THRESH-04`…`L-THRESH-06`, and `L-BARDO-02` for the clear light).
 *
 * This is the top of the slice's tonal range. The brief is explicit that the
 * Light must genuinely overwhelm, so these scenes are allowed to do what nothing
 * earlier does: exceed the frame. The grade's wash pushes past the scene's own
 * brightness rather than mixing toward white, which is what keeps an overwhelming
 * image from flattening into a white rectangle.
 */

// --- the tunnel ----------------------------------------------------------------

/**
 * A living tunnel. The walls are displaced by layered noise flowing toward the
 * viewer, so it breathes and is never a textured pipe.
 */
function livingTunnel(context: SceneContext): { group: Group; material: ShaderMaterial } {
  const group = new Group();
  const geometry = context.resources.track(new CylinderGeometry(3.4, 3.4, 150, 96, 220, true));
  const material = context.resources.track(
    new ShaderMaterial({
      side: BackSide, // We are inside it.
      transparent: false,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uFlow: { value: 1 },
        uGlow: { value: colorOf(GRAMMAR.tunnel.glow) },
        uAccent: { value: colorOf(GRAMMAR.tunnel.accent) },
        uOpen: { value: 0 },
        uBreath: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uFlow;
        uniform float uBreath;
        varying vec2 vUv;
        varying vec3 vLocal;
        varying float vRipple;
        varying float vAngle;

        ${NOISE}

        void main() {
          vUv = uv;
          vec3 p = position;

          // The angle around the tunnel wraps continuously; uv.x does not, and
          // any frequency applied to it leaves a hard seam straight down the
          // wall where 1.0 meets 0.0.
          float angle = atan(p.x, p.z);
          vAngle = angle;

          // Displace the wall inward and outward along its own normal. Two
          // frequencies: a slow swell, and a finer travelling ripple. Both are
          // fed by sin/cos of the angle, so they tile exactly.
          float along = p.y * 0.06 - uTime * uFlow * 0.9;
          float swell = fbm(vec3(cos(angle) * 2.0, along, sin(angle) * 2.0), 3) - 0.5;
          float ripple = sin(angle * 9.0 + along * 7.0) * 0.5 + 0.5;
          vRipple = ripple;

          vec3 inward = normalize(vec3(p.x, 0.0, p.z));
          p -= inward * (swell * 1.5 + ripple * 0.22) * uBreath;

          vLocal = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uFlow;
        uniform vec3 uGlow;
        uniform vec3 uAccent;
        uniform float uOpen;
        varying vec2 vUv;
        varying vec3 vLocal;
        varying float vRipple;
        varying float vAngle;

        ${NOISE}

        void main() {
          // Distance along the tunnel, remapped so the far end is the bright one.
          float depth = clamp((vLocal.y + 75.0) / 150.0, 0.0, 1.0);

          // The walls are dark and veined; the light is all at the end. uOpen
          // pulls that light back toward the viewer as the scene progresses.
          float toEnd = pow(depth, mix(8.0, 3.0, uOpen));

          // Veins in the wall. The contrast is deliberately high: a low-contrast
          // wall at low alpha renders as an empty void, which is not a tunnel.
          float veins = fbm(
            vec3(cos(vAngle) * 3.0, vLocal.y * 0.12 - uTime * uFlow * 0.8, sin(vAngle) * 3.0),
            4
          );
          float wall = smoothstep(0.28, 0.72, veins);

          // Longitudinal streaks streaming past, which is most of the sensation
          // of travelling rather than of hanging still in a lit pipe.
          // An integer multiple of the angle, so the streaks meet themselves.
          float streaks = sin(vAngle * 24.0 + veins * 9.0) * 0.5 + 0.5;
          streaks = pow(streaks, 4.0) * (0.35 + vRipple * 0.5);

          vec3 wallColor = uAccent * (0.1 + wall * 0.75 + streaks * 0.5);
          vec3 color = mix(wallColor, uGlow, toEnd);

          // A travelling brightness, so the tunnel reads as moving even when the
          // camera is still.
          float pulse = sin(vLocal.y * 0.3 - uTime * uFlow * 3.2) * 0.5 + 0.5;
          color += uGlow * pow(pulse, 8.0) * 0.3 * (0.25 + toEnd);

          // Opaque. The walls are the enclosure, and enclosure is the point.
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );

  const tunnel = new Mesh(geometry, material);
  // Lay it along -Z so the bright end is ahead of the camera. Rotating +90°
  // about X maps the cylinder's local +Y to world +Z, which put the lit end
  // behind the viewer; -90° maps it to -Z, which is where the camera looks.
  tunnel.rotation.x = -Math.PI / 2;
  group.add(tunnel);
  return { group, material };
}

const TUNNEL_BEATS: readonly Beat[] = [
  { id: 'enter', seconds: 6 },
  { id: 'moving', seconds: 9 },
  { id: 'opening', seconds: 9 },
  { id: 'wait', seconds: 1, hold: true },
];

export const tunnelScene: SceneDefinition = {
  id: 'threshold.tunnel',
  title: 'The passage',
  exits: [
    { id: 'take-it', label: 'Take hold of the memory', to: 'threshold.loved-ones' },
    { id: 'let-it-pass', label: 'Let the memory go past', to: 'threshold.loved-ones' },
    { id: 'unanswered', label: 'Go on', to: 'threshold.loved-ones' },
  ],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.tunnel;
    const air = airShell(context.resources, { radius: 120, ground: grammar.ground, glow: 0x1a1430, density: 1 });
    context.scene.add(air.mesh);

    const tunnel = livingTunnel(context);
    context.scene.add(tunnel.group);

    // The far light, as an object rather than as a shader term, so it has volume
    // when the camera finally gets near it.
    // The cylinder is open-ended, so straight down the axis the eye went past
    // the glow into empty air shell and the bright end read as a ring with a
    // hole in it. A lit cap closes it.
    const capGeometry = context.resources.track(new CircleGeometry(3.4, 48));
    const capMaterial = context.resources.track(
      new MeshBasicMaterial({ color: grammar.glow, transparent: true, opacity: 0.9 }),
    );
    const cap = new Mesh(capGeometry, capMaterial);
    cap.position.set(0, 0, -74);
    context.scene.add(cap);

    const far = volumetricGlow(context.resources, { radius: 5.5, color: grammar.glow, intensity: 1.4, softness: 1.7 });
    far.mesh.position.set(0, 0, -62);
    context.scene.add(far.mesh);

    // Few enough to read as motion past the viewer rather than as a curtain in
    // front of the tunnel.
    const motes = moteField(context.resources, context.rng.stream('tunnel-motes'), {
      count: 320,
      radius: 2.6,
      color: grammar.glow,
      size: 0.035,
    });
    context.scene.add(motes.points);

    /**
     * Something keeping pace with the player in the passage: an ember of a
     * different colour from everything else in frame, because it is not from
     * this life.
     *
     * The brief's PAST LIVES system says memory shards surface on both paths,
     * and the case literature is specific about what surfaces: the reported
     * previous lives cluster in the violent and the unfinished (`L-PAST-03`),
     * and a subset carry the death wound into the next body as a birthmark
     * (`L-PAST-02`). So this is an old wound travelling alongside, and whether
     * the player picks it up is theirs to decide.
     */
    const ember = volumetricGlow(context.resources, { radius: 0.5, color: 0xff7a5a, intensity: 1.2, softness: 2.2 });
    context.scene.add(ember.mesh);
    const emberAt = new Vector3();
    const emberTarget = new Vector3();

    const director = new Director(TUNNEL_BEATS);

    context.rig.setMode('drifting');
    context.rig.position.set(0, 0, 10);
    context.rig.target.set(0, 0, 10);
    context.rig.orient(0, 0);
    context.rig.setSway(0.55);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = grammar.drain;
    grade.grain = grammar.grain;
    grade.vignette = 0.52;
    grade.aberration = 0.003;
    grade.distortion = 0.055;
    grade.exposure = 1;
    grade.washColor = [1, 0.93, 0.8];
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(grammar.bloom, 0.72, 0.65);

    context.audio.room(0.06, 400);
    context.audio.drone(0.26, 42, 6);
    context.audio.ring(0.05, 1400);
    context.audio.heartbeat(false);

    // The tunnel's own accent, which the ember recolours if it is taken. Held as
    // one Color and mutated in place, so the per-frame path allocates nothing.
    // Three persistent Colors: the wall's own accent, the wound's, and the one
    // that is actually handed to the uniform. Mixed in place, because a Color
    // built per frame is an allocation per frame on the hot path.
    const baseAccent = new Color(GRAMMAR.tunnel.accent);
    const emberAccent = new Color(0xff7a5a);
    const accent = new Color(GRAMMAR.tunnel.accent);
    const SHARD = 'past-life.the-earlier-wound';

    let picked: 'take-it' | 'let-it-pass' | undefined;
    let pickedAt: number | undefined;
    let prompt: ThresholdPrompt | undefined = new ThresholdPrompt();

    const choose = (choice: 'take-it' | 'let-it-pass'): void => {
      if (picked !== undefined) {
        return;
      }
      picked = choice;
      if (choice === 'take-it') {
        // An unfinished life is grip, and grip is weight. It also stays: shards
        // are what survives the river (GAME_BRIEF.md § META-PROGRESSION).
        if (!context.soul.shards.includes(SHARD)) {
          context.soul.shards.push(SHARD);
        }
        context.soul.will = clamp01(context.soul.will + 0.2);
        context.soul.attachment = clamp01(context.soul.attachment + 0.2);
        prompt?.settle(
          'It is a body that was not this one, and a wound in a place you have always had a mark. '
          + 'The passage takes its colour from it and slows.',
          'will +0.2 · you are carrying more · a shard kept',
          { label: 'Go on toward the end of it', exit: 'take-it' },
        );
      } else {
        context.soul.harmony += 1;
        context.soul.attachment = clamp01(context.soul.attachment - 0.15);
        prompt?.settle(
          'You let it go by. It falls behind, the walls open out, and the end of the passage comes up fast.',
          'harmony +1 · you are carrying less',
          { label: 'Go on toward the end of it', exit: 'let-it-pass' },
        );
      }
    };

    prompt.releaseAfter(RELEASE_SECONDS, 'unanswered');
    prompt.ask('Something is keeping pace with you, and it is not from this life.', [
      {
        id: 'take-it',
        label: 'Take hold of it',
        detail: 'Carry the old wound with you. It is grip, and it is weight, and it keeps.',
        onPick: () => { choose('take-it'); },
      },
      {
        id: 'let-it-pass',
        label: 'Let it go past',
        detail: 'Leave it in the passage. You travel lighter and faster.',
        onPick: () => { choose('let-it-pass'); },
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
        setU(tunnel.material, 'uTime', elapsed);
        far.update(elapsed, context.camera);
        motes.drift(delta, elapsed);

        if (picked !== undefined && pickedAt === undefined) {
          pickedAt = elapsed;
        }
        const answered = pickedAt === undefined ? 0 : ease.out(Math.min(1, (elapsed - pickedAt) / 3.5));
        const taken = picked === 'take-it' ? answered : 0;
        const dropped = picked === 'let-it-pass' ? answered : 0;

        const progress = beat.id === 'enter'
          ? ease.out(t) * 0.1
          : beat.id === 'moving'
            ? 0.1 + t * 0.4
            : beat.id === 'opening'
              ? 0.5 + ease.inOut(t) * 0.5
              : 1;

        // Letting it go opens the passage early; taking it holds the walls in.
        const opened = Math.min(1, progress + dropped * 0.35 - taken * 0.15 * progress);

        // Travel down the tunnel. The walls also flow, so apparent speed is
        // higher than the camera's actual speed — cheaper and less nauseating.
        context.rig.target.set(0, 0, 10 - opened * 56);
        setU(tunnel.material, 'uFlow', 1 + opened * 2.4 + dropped * 0.8 - taken * 0.5);
        setU(tunnel.material, 'uOpen', opened);
        setU(tunnel.material, 'uBreath', 1 - opened * 0.55 + taken * 0.25);

        // The wound's colour gets into the walls if it was taken.
        accent.copy(baseAccent).lerp(emberAccent, taken * 0.7);
        setU(tunnel.material, 'uAccent', accent);

        // The ember rides ahead and to the side until it is answered: taken, it
        // closes to the middle of the frame; let go, it falls behind and out.
        emberTarget.set(2.1 - taken * 2.1 + dropped * 1.4, 0.55 - taken * 0.3, -5.5 + taken * 2 + dropped * 13);
        emberAt.copy(context.rig.position).add(emberTarget);
        ember.mesh.position.copy(emberAt);
        ember.update(elapsed, context.camera);
        setU(
          ember.material,
          'uIntensity',
          Math.max(0, 1.2 + taken * 1.6 - dropped * 1.15 + Math.sin(elapsed * 1.6) * 0.1),
        );
        ember.mesh.scale.setScalar(1 + taken * 0.8 - dropped * 0.4);

        setU(far.material, 'uIntensity', 1.4 + opened * 0.8);
        far.mesh.scale.setScalar(1 + opened * 0.5);

        grade.vignette = 0.52 - opened * 0.22;
        grade.exposure = 1 + opened * 0.08;
        grade.drain = grammar.drain * (1 - opened) + taken * 0.12;
        // Held well back: the mouth of the tunnel should be the brightest thing
        // in frame, not the whole frame.
        grade.washAmount = Math.max(0, opened - 0.8) * 0.18;
        context.post.setBloom(grammar.bloom + opened * 0.2, 0.72, Math.max(0.68, 0.78 - opened * 0.1));

        context.audio.drone(0.26 + opened * 0.1 + taken * 0.08, 42 + opened * 22 - taken * 12, 6 + opened * 10);
        context.audio.ring(0.05 - opened * 0.04 + taken * 0.06, 1400);
        if (opened > 0.45) {
          context.audio.shimmer((opened - 0.45) * 0.5);
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

// --- the ones who come to meet you ---------------------------------------------

const KIN_BEATS: readonly Beat[] = [
  { id: 'glow', seconds: 6 },
  { id: 'resolving', seconds: 8 },
  { id: 'recognition', seconds: 8, caption: 'You know them. You cannot say how.' },
  { id: 'wait', seconds: 1, hold: true },
];

export const lovedOnesScene: SceneDefinition = {
  id: 'threshold.loved-ones',
  title: 'The ones who came',
  exits: [
    { id: 'as-real', label: 'Take them as they come', to: 'threshold.being-of-light' },
    { id: 'as-mind', label: 'Recognise them as your own mind', to: 'threshold.being-of-light' },
    { id: 'unanswered', label: 'Go on', to: 'threshold.being-of-light' },
  ],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.kin;
    const air = airShell(context.resources, { radius: 110, ground: grammar.ground, glow: 0x2a2048, density: 1 });
    context.scene.add(air.mesh);

    /**
     * How the four read the player before the player has read themselves.
     *
     * `L-FRAN-03`: the spirit body is the soul's own record and its state is
     * visible to others — and the lore bible's design note is explicit that in
     * the source other spirits see the narrator's state before he can. So the
     * ones who came are brighter and closer to a soul that arrived light, and
     * stand further off from one that arrived gripping. Everything the player
     * chose in the corridor so far is in this number.
     */
    const read = Math.max(
      -1,
      Math.min(1, context.soul.harmony * 0.25 + context.soul.karma * 0.15 - context.soul.attachment),
    );

    // Figures resolve out of glow, so the glow comes first and the silhouettes
    // tighten out of it. Positions are seeded, so a run is reproducible.
    const rng = context.rng.stream('kin');
    const figures = [-2.5, -0.9, 0.8, 2.6].map((x, index) => {
      const height = 1.62 + rng.range(-0.12, 0.16);
      const figure = figureOfLight(context.resources, {
        height,
        color: grammar.glow,
        accent: grammar.accent,
        seed: rng.range(0, 40),
      });
      // A soul that arrived heavy is met further off.
      const depth = -4.4 - rng.range(0, 1.4) + index * 0.12 - Math.max(0, -read) * 2.2;
      figure.group.position.set(x, 0, depth);
      context.scene.add(figure.group);

      const halo = volumetricGlow(context.resources, {
        radius: 1.25,
        color: grammar.glow,
        intensity: 0.5,
        softness: 2.4,
      });
      halo.mesh.position.copy(figure.group.position).add(new Vector3(0, height * 0.55, 0));
      context.scene.add(halo.mesh);

      return { figure, halo, phase: rng.range(0, Math.PI * 2), home: depth };
    });

    const motes = moteField(context.resources, context.rng.stream('kin-motes'), {
      count: 1100,
      radius: 11,
      color: grammar.glow,
      size: 0.045,
    });
    context.scene.add(motes.points);

    const director = new Director(KIN_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 8);
      }
    });

    context.rig.setMode('drifting');
    context.rig.position.set(0, 1.5, 2.2);
    context.rig.target.set(0, 1.5, 0.6);
    context.rig.orient(0, 0.02);
    context.rig.setSway(0.4);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = grammar.drain;
    grade.grain = grammar.grain;
    grade.vignette = 0.34;
    grade.aberration = 0.0022;
    grade.distortion = 0.03;
    grade.exposure = 1.04;
    grade.washColor = [1, 0.95, 0.86];
    grade.washAmount = 0.02;
    grade.smear = 0;
    context.post.setBloom(grammar.bloom, 0.7, 0.63);

    context.audio.drone(0.22, 58, 8);
    context.audio.shimmer(0.16);
    context.audio.room(0.04, 600);
    context.audio.heartbeat(false);

    /**
     * The question the Bardo Thödol puts at exactly this point.
     *
     * `L-THRESH-05`: deceased relatives and other presences meet the traveller.
     * `L-BARDO-03`: the peaceful visions come first and the wrathful later, and
     * both are taught to be projections of the traveller's own mind rather than
     * external beings. The text does not resolve that for the traveller — it
     * tells them to recognise it. So the player decides, and the scene answers
     * either way: taken as real, the four come close and resolve; recognised,
     * they thin back into the light they came out of, and the light stays.
     *
     * Neither answer is the correct one. Being met is connection, which the
     * brief measures with HARMONY, and it is a tie, which is weight. Recognising
     * them is the faculty Path B runs on, so it pays WILL and sets weight down.
     */
    let picked: 'as-real' | 'as-mind' | undefined;
    let pickedAt: number | undefined;
    let prompt: ThresholdPrompt | undefined = new ThresholdPrompt();

    const choose = (choice: 'as-real' | 'as-mind'): void => {
      if (picked !== undefined) {
        return;
      }
      picked = choice;
      if (choice === 'as-real') {
        context.soul.harmony += 1;
        context.soul.attachment = clamp01(context.soul.attachment + 0.15);
        prompt?.settle(
          'You let them be who they are. They come the rest of the way, and you are held by four people '
          + 'you have no way to name.',
          'harmony +1 · you are carrying more',
          { label: 'Toward the one behind them', exit: 'as-real' },
        );
      } else {
        context.soul.will = clamp01(context.soul.will + 0.25);
        context.soul.attachment = clamp01(context.soul.attachment - 0.2);
        prompt?.settle(
          'You look straight at them, and they are your own mind, and they go back into the light '
          + 'without taking offence. The light does not go anywhere.',
          'will +0.25 · you are carrying less',
          { label: 'Toward the one behind them', exit: 'as-mind' },
        );
      }
    };

    prompt.releaseAfter(RELEASE_SECONDS, 'unanswered');
    prompt.ask('Four of them, and you know every one. Who are they?', [
      {
        id: 'as-real',
        label: 'They are who they are',
        detail: 'Be met. Connection, and a tie that comes with you.',
        onPick: () => { choose('as-real'); },
      },
      {
        id: 'as-mind',
        label: 'They are your own mind',
        detail: 'Recognise the projection. You lose them, and you keep yourself.',
        onPick: () => { choose('as-mind'); },
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
        motes.drift(delta, elapsed);

        if (picked !== undefined && pickedAt === undefined) {
          pickedAt = elapsed;
        }
        const answered = pickedAt === undefined ? 0 : ease.out(Math.min(1, (elapsed - pickedAt) / 4));
        const asReal = picked === 'as-real' ? answered : 0;
        const asMind = picked === 'as-mind' ? answered : 0;

        const resolve = beat.id === 'glow'
          ? ease.out(t) * 0.16
          : beat.id === 'resolving'
            ? 0.16 + ease.inOut(t) * 0.6
            : 0.82 + (beat.id === 'recognition' ? t * 0.18 : 0.18);

        // Taken as real they finish resolving and close the distance; recognised
        // they dissolve back toward the glow they came out of.
        const presence = Math.max(0, Math.min(1.15, resolve + asReal * 0.35 - asMind * 0.8));

        for (const entry of figures) {
          setU(entry.figure.material, 'uTime', elapsed);
          // Each figure resolves on its own slightly different curve, so they do
          // not arrive as a rank.
          setU(
            entry.figure.material,
            'uResolve',
            Math.min(1, Math.max(0, presence * (0.85 + Math.sin(entry.phase) * 0.15))),
          );
          entry.halo.update(elapsed, context.camera);
          setU(
            entry.halo.material,
            'uIntensity',
            Math.max(
              0,
              (0.5 + read * 0.18 + asReal * 0.5 - asMind * 0.42) + Math.sin(elapsed * 0.4 + entry.phase) * 0.08,
            ),
          );
          // A slow drift, so nobody is standing perfectly still — and a move in
          // or out once the question has been answered.
          entry.figure.group.position.z = entry.home + asReal * 2.4 - asMind * 1.2;
          entry.halo.mesh.position.z = entry.figure.group.position.z;
          entry.figure.group.position.y = Math.sin(elapsed * 0.3 + entry.phase) * 0.04;
        }

        context.rig.target.set(0, 1.5, 0.6 - resolve * 1.1 - asMind * 0.9);
        grade.exposure = 1.04 + resolve * 0.1;
        grade.washAmount = 0.02 + resolve * 0.04 + asMind * 0.02;
        grade.vignette = 0.34 - asMind * 0.1;
        context.post.setBloom(grammar.bloom + resolve * 0.3 + asMind * 0.35, 0.7, 0.63);
        context.audio.shimmer(0.16 + resolve * 0.2 + asMind * 0.2);
        context.audio.drone(0.22 + asReal * 0.08, 58 + asMind * 6, 8 + resolve * 6);
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

// --- the Being of Light ---------------------------------------------------------

const BEING_BEATS: readonly Beat[] = [
  { id: 'approach', seconds: 6 },
  { id: 'inside-it', seconds: 8 },
  { id: 'held', seconds: 8, caption: 'It does not ask anything. It is only glad.' },
  { id: 'wait', seconds: 1, hold: true },
];

export const beingOfLightScene: SceneDefinition = {
  id: 'threshold.being-of-light',
  title: 'The Light',
  exits: [
    { id: 'recognise', label: 'Recognise it as your own nature', to: 'threshold.border' },
    { id: 'be-held', label: 'Let it hold you', to: 'threshold.border' },
    { id: 'unanswered', label: 'Go on', to: 'threshold.border' },
  ],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.light;
    // The air is kept faint here: the radiance below is what should carry the
    // frame, and a dense air shell would flatten it back into a wash.
    const air = airShell(context.resources, { radius: 140, ground: grammar.ground, glow: 0x3b3a6a, density: 0.45 });
    context.scene.add(air.mesh);

    // Light with structure, seen from inside. Scaling a glow sprite up until the
    // camera is within it produces one flat value across the whole frame; this
    // keeps filaments and breathing bands at every brightness.
    const radiance = radianceShell(context.resources, {
      radius: 120,
      color: 0xfff4e2,
      accent: 0x7fa8ff,
    });
    context.scene.add(radiance.mesh);

    // The heart of it stays a discrete object, and deliberately never grows to
    // fill the frame — something to be near rather than something to be inside.
    const inner = volumetricGlow(context.resources, {
      radius: 3.1,
      color: 0xffffff,
      intensity: 2.6,
      softness: 1.3,
    });
    inner.mesh.position.set(0, 1.2, -16);
    context.scene.add(inner.mesh);

    const motes = moteField(context.resources, context.rng.stream('light-motes'), {
      count: 1800,
      radius: 18,
      color: grammar.accent,
      size: 0.06,
    });
    context.scene.add(motes.points);

    const director = new Director(BEING_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 9);
      }
    });

    context.rig.setMode('drifting');
    context.rig.position.set(0, 1.4, 6);
    context.rig.target.set(0, 1.4, 6);
    context.rig.orient(0, 0.01);
    context.rig.setSway(0.3);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0;
    grade.grain = grammar.grain;
    grade.vignette = 0.2;
    grade.aberration = 0.0028;
    grade.distortion = 0.02;
    grade.exposure = 1.02;
    grade.washColor = [1, 0.985, 0.95];
    grade.washAmount = 0.015;
    grade.smear = 0;
    context.post.setBloom(0.85, 0.8, 0.9);

    context.audio.drone(0.24, 65, 14);
    context.audio.shimmer(0.4);
    context.audio.ring(0, 1200);
    context.audio.heartbeat(false);

    /**
     * The one decision the sources make unambiguous, and the reason this scene
     * cannot be a cutscene.
     *
     * `L-BARDO-02`: at death a clear, primordial light dawns; recognising it is
     * liberation, and failing to recognise it moves the traveller on. The lore
     * bible's note on that claim is the design brief for this: failing to enter
     * is not punished in the source, it is a longer road. So being held is a
     * real answer that gives real harmony — it is simply smaller than the one on
     * offer, and the frame says so. `L-THRESH-06` is the other half: the being
     * of light is felt as wholly loving and without judgement, so nothing here
     * scolds the player for being held.
     */
    const SHARD = 'bardo.the-clear-light-recognised';
    let picked: 'recognise' | 'be-held' | undefined;
    let pickedAt: number | undefined;
    let prompt: ThresholdPrompt | undefined = new ThresholdPrompt();

    const choose = (choice: 'recognise' | 'be-held'): void => {
      if (picked !== undefined) {
        return;
      }
      picked = choice;
      if (choice === 'recognise') {
        context.soul.harmony += 2;
        context.soul.will = clamp01(context.soul.will + 0.3);
        context.soul.attachment = clamp01(context.soul.attachment - 0.25);
        if (!context.soul.shards.includes(SHARD)) {
          context.soul.shards.push(SHARD);
        }
        prompt?.settle(
          'It is not meeting you. There is no edge where it stops and you start, and the filaments '
          + 'run through where you were standing.',
          'harmony +2 · will +0.3 · you are carrying much less · a shard kept',
          { label: 'On to the limit', exit: 'recognise' },
        );
      } else {
        context.soul.harmony += 1;
        context.soul.attachment = clamp01(context.soul.attachment + 0.1);
        prompt?.settle(
          'You stay where you are and let it hold you, and it does, without one word about it. '
          + 'It stays in front of you, and it is very bright.',
          'harmony +1 · you are carrying a little more',
          { label: 'On to the limit', exit: 'be-held' },
        );
      }
    };

    prompt.releaseAfter(RELEASE_SECONDS, 'unanswered');
    prompt.ask('It is in front of you and it is glad. What is it?', [
      {
        id: 'recognise',
        label: 'It is what you are made of',
        detail: 'Recognise it. Nothing is held back from you, and nothing of you is held back.',
        onPick: () => { choose('recognise'); },
      },
      {
        id: 'be-held',
        label: 'It is someone else, and it loves you',
        detail: 'Be held by it. Gentler, smaller, and the road goes on.',
        onPick: () => { choose('be-held'); },
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
        motes.drift(delta, elapsed);
        radiance.update(elapsed);
        inner.update(elapsed, context.camera);

        if (picked !== undefined && pickedAt === undefined) {
          pickedAt = elapsed;
        }
        const answered = pickedAt === undefined ? 0 : ease.out(Math.min(1, (elapsed - pickedAt) / 4.5));
        const recognised = picked === 'recognise' ? answered : 0;
        const held = picked === 'be-held' ? answered : 0;

        const closeness = beat.id === 'approach'
          ? ease.inOut(t) * 0.5
          : beat.id === 'inside-it'
            ? 0.5 + ease.inOut(t) * 0.42
            : 0.92 + (beat.id === 'held' ? t * 0.08 : 0.08);

        // Recognition closes the last of the distance; being held keeps it a
        // little way off, which is the difference the frame has to carry.
        const near = Math.min(1, closeness + recognised * 0.3 - held * 0.12);
        context.rig.target.set(0, 1.4, 6 - near * 20);

        // Overwhelming has to be earned over time, not asserted in frame one, so
        // the wash and exposure climb the whole way through and only pass the top
        // of the range in the last beat.
        // Overwhelming is carried by structure and contrast, not by pushing every
        // channel to 1.0. The wash stays small, exposure barely moves, and the
        // bloom threshold stays high enough that only the core blooms.
        grade.washAmount = 0.015 + Math.pow(near, 2.2) * 0.03 + recognised * 0.012;
        grade.exposure = 1.0 + near * 0.02 + recognised * 0.02;
        grade.vignette = 0.2 - near * 0.12 - recognised * 0.05;
        grade.aberration = 0.0028 + near * 0.003;
        context.post.setBloom(
          0.85 + near * 0.4 + recognised * 0.3,
          0.8,
          Math.max(0.72, 0.84 - near * 0.12),
        );

        setU(inner.material, 'uIntensity', 1.3 + near * 0.5 - recognised * 0.5 + held * 0.35);
        // The radiance rises with closeness, and the focus stays on the heart of
        // the light, so the filaments always converge somewhere the eye can find.
        //
        // Recognition moves that focus: the filaments stop converging on an
        // object ahead and start converging on where the player is standing,
        // which is the whole claim of `L-BARDO-02` stated in geometry rather
        // than in a caption.
        radiance.setIntensity(0.26 + near * 0.16 + recognised * 0.1);
        radiance.setFocus(
          0,
          (1.2 - context.rig.position.y) * (1 - recognised),
          (-16 - context.rig.position.z) * (1 - recognised) - recognised * 0.6,
        );

        context.audio.shimmer(0.4 + near * 0.4 + recognised * 0.18);
        context.audio.drone(0.24 + near * 0.08, 65 + recognised * 10, 14 + near * 12);
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
