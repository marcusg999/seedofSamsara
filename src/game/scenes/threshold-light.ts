import {
  BackSide,
  CircleGeometry,
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
  { id: 'enter', seconds: 14 },
  { id: 'moving', seconds: 24 },
  { id: 'opening', seconds: 22 },
  { id: 'wait', seconds: 1, hold: true },
];

export const tunnelScene: SceneDefinition = {
  id: 'threshold.tunnel',
  title: 'The passage',
  exits: [{ id: 'onward', label: 'Onward', to: 'threshold.loved-ones' }],
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

    return {
      update(delta, elapsed) {
        director.update(delta);
        const { beat, t } = director.state;

        setU(air.material, 'uTime', elapsed);
        setU(tunnel.material, 'uTime', elapsed);
        far.update(elapsed, context.camera);
        motes.drift(delta, elapsed);

        const progress = beat.id === 'enter'
          ? ease.out(t) * 0.1
          : beat.id === 'moving'
            ? 0.1 + t * 0.4
            : beat.id === 'opening'
              ? 0.5 + ease.inOut(t) * 0.5
              : 1;

        // Travel down the tunnel. The walls also flow, so apparent speed is
        // higher than the camera's actual speed — cheaper and less nauseating.
        context.rig.target.set(0, 0, 10 - progress * 56);
        setU(tunnel.material, 'uFlow', 1 + progress * 2.4);
        setU(tunnel.material, 'uOpen', progress);
        setU(tunnel.material, 'uBreath', 1 - progress * 0.55);

        setU(far.material, 'uIntensity', 1.4 + progress * 0.8);
        far.mesh.scale.setScalar(1 + progress * 0.5);

        grade.vignette = 0.52 - progress * 0.22;
        grade.exposure = 1 + progress * 0.08;
        grade.drain = grammar.drain * (1 - progress);
        // Held well back: the mouth of the tunnel should be the brightest thing
        // in frame, not the whole frame.
        grade.washAmount = Math.max(0, progress - 0.8) * 0.18;
        context.post.setBloom(grammar.bloom + progress * 0.2, 0.72, Math.max(0.68, 0.78 - progress * 0.1));

        context.audio.drone(0.26 + progress * 0.1, 42 + progress * 22, 6 + progress * 10);
        context.audio.ring(0.05 - progress * 0.04, 1400);
        if (progress > 0.45) {
          context.audio.shimmer((progress - 0.45) * 0.5);
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
  { id: 'glow', seconds: 14 },
  { id: 'resolving', seconds: 22 },
  { id: 'recognition', seconds: 20, caption: 'You know them. You cannot say how.' },
  { id: 'wait', seconds: 1, hold: true },
];

export const lovedOnesScene: SceneDefinition = {
  id: 'threshold.loved-ones',
  title: 'The ones who came',
  exits: [{ id: 'onward', label: 'Onward', to: 'threshold.being-of-light' }],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.kin;
    const air = airShell(context.resources, { radius: 110, ground: grammar.ground, glow: 0x2a2048, density: 1 });
    context.scene.add(air.mesh);

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
      figure.group.position.set(x, 0, -4.4 - rng.range(0, 1.4) + index * 0.12);
      context.scene.add(figure.group);

      const halo = volumetricGlow(context.resources, {
        radius: 1.25,
        color: grammar.glow,
        intensity: 0.5,
        softness: 2.4,
      });
      halo.mesh.position.copy(figure.group.position).add(new Vector3(0, height * 0.55, 0));
      context.scene.add(halo.mesh);

      return { figure, halo, phase: rng.range(0, Math.PI * 2) };
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

    return {
      update(delta, elapsed) {
        director.update(delta);
        const { beat, t } = director.state;

        setU(air.material, 'uTime', elapsed);
        motes.drift(delta, elapsed);

        const resolve = beat.id === 'glow'
          ? ease.out(t) * 0.16
          : beat.id === 'resolving'
            ? 0.16 + ease.inOut(t) * 0.6
            : 0.82 + (beat.id === 'recognition' ? t * 0.18 : 0.18);

        for (const entry of figures) {
          setU(entry.figure.material, 'uTime', elapsed);
          // Each figure resolves on its own slightly different curve, so they do
          // not arrive as a rank.
          setU(
            entry.figure.material,
            'uResolve',
            Math.min(1, Math.max(0, resolve * (0.85 + Math.sin(entry.phase) * 0.15))),
          );
          entry.halo.update(elapsed, context.camera);
          setU(entry.halo.material, 'uIntensity', 0.5 + Math.sin(elapsed * 0.4 + entry.phase) * 0.08);
          // A slow drift, so nobody is standing perfectly still.
          entry.figure.group.position.y = Math.sin(elapsed * 0.3 + entry.phase) * 0.04;
        }

        context.rig.target.set(0, 1.5, 0.6 - resolve * 1.1);
        grade.exposure = 1.04 + resolve * 0.1;
        grade.washAmount = 0.02 + resolve * 0.04;
        context.post.setBloom(grammar.bloom + resolve * 0.3, 0.7, 0.63);
        context.audio.shimmer(0.16 + resolve * 0.2);
        context.audio.drone(0.22, 58, 8 + resolve * 6);
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
  { id: 'approach', seconds: 16 },
  { id: 'inside-it', seconds: 24 },
  { id: 'held', seconds: 22, caption: 'It does not ask anything. It is only glad.' },
  { id: 'wait', seconds: 1, hold: true },
];

export const beingOfLightScene: SceneDefinition = {
  id: 'threshold.being-of-light',
  title: 'The Light',
  exits: [{ id: 'onward', label: 'Onward', to: 'threshold.border' }],
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

    return {
      update(delta, elapsed) {
        director.update(delta);
        const { beat, t } = director.state;

        setU(air.material, 'uTime', elapsed);
        motes.drift(delta, elapsed);
        radiance.update(elapsed);
        inner.update(elapsed, context.camera);

        const closeness = beat.id === 'approach'
          ? ease.inOut(t) * 0.5
          : beat.id === 'inside-it'
            ? 0.5 + ease.inOut(t) * 0.42
            : 0.92 + (beat.id === 'held' ? t * 0.08 : 0.08);

        context.rig.target.set(0, 1.4, 6 - closeness * 20);

        // Overwhelming has to be earned over time, not asserted in frame one, so
        // the wash and exposure climb the whole way through and only pass the top
        // of the range in the last beat.
        // Overwhelming is carried by structure and contrast, not by pushing every
        // channel to 1.0. The wash stays small, exposure barely moves, and the
        // bloom threshold stays high enough that only the core blooms.
        grade.washAmount = 0.015 + Math.pow(closeness, 2.2) * 0.03;
        grade.exposure = 1.0 + closeness * 0.02;
        grade.vignette = 0.2 - closeness * 0.12;
        grade.aberration = 0.0028 + closeness * 0.003;
        context.post.setBloom(0.85 + closeness * 0.4, 0.8, Math.max(0.72, 0.84 - closeness * 0.12));

        setU(inner.material, 'uIntensity', 1.3 + closeness * 0.5);
        // The radiance rises with closeness, and the focus stays on the heart of
        // the light, so the filaments always converge somewhere the eye can find.
        radiance.setIntensity(0.26 + closeness * 0.16);
        radiance.setFocus(0, 1.2 - context.rig.position.y, -16 - context.rig.position.z);

        context.audio.shimmer(0.4 + closeness * 0.4);
        context.audio.drone(0.24 + closeness * 0.08, 65, 14 + closeness * 12);
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
