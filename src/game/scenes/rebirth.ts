import { Group, PlaneGeometry, Mesh, ShaderMaterial, AdditiveBlending, Color } from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { Director, ease, type Beat } from '../systems/director';
import { airShell, moteField, radianceShell, volumetricGlow } from '../systems/forms';
import { NOISE, setU } from '../systems/glsl';
import {
  applyOpening,
  crossRiver,
  loadIncarnation,
  saveIncarnation,
  type Incarnation,
} from '../systems/incarnation';

/**
 * The River of Forgetting, and rebirth — the two scenes that close the loop.
 *
 * GAME_BRIEF.md § The Life Market: "the soul walks to the River of Forgetting,
 * and the cart's contents become the opening conditions of the next run." And
 * § Systems: "each run is a life. Wisdom and unlocked memories persist across
 * runs; specifics fade."
 *
 * That split is the loop. Until now the game had no way to end a life — the cart
 * was weighed and then nothing happened to it. The river takes the particulars
 * and the rebirth writes what is left into the next life, which is the first
 * time anything in this game has outlived a run.
 *
 * Source: the Myth of Er, where the souls camp on the plain of Forgetfulness and
 * drink from the river of Carelessness (`L-ER-04`). The fading of particulars
 * while something of the shape remains is also the reported pattern in the
 * past-life cases (`L-PAST-01`), and a death wound carried as a birthmark is
 * `L-PAST-02` — the one specific the river does not take.
 */

// --- the river -----------------------------------------------------------------

function riverSurface(context: SceneContext): { mesh: Mesh; material: ShaderMaterial } {
  const geometry = context.resources.track(new PlaneGeometry(320, 320, 1, 1));
  const material = context.resources.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uNear: { value: new Color(0x8fd8ff) },
        uFar: { value: new Color(0xd8c8ff) },
        uCrossing: { value: 0 },
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
        uniform vec3 uNear;
        uniform vec3 uFar;
        uniform float uCrossing;
        varying vec3 vWorld;

        ${NOISE}

        void main() {
          // Current running across the crossing, not along it: the river moves
          // past you while you go through it.
          float flow = fbm(vec3(vWorld.x * 0.03, vWorld.z * 0.05 - uTime * 0.09, uTime * 0.03), 4);
          float ripple = sin(vWorld.x * 0.22 + flow * 6.0 - uTime * 0.8) * 0.5 + 0.5;
          ripple = pow(ripple, 2.4);

          float toward = smoothstep(0.0, -70.0, vWorld.z);
          vec3 color = mix(uNear, uFar, toward);

          float fade = 1.0 - smoothstep(50.0, 150.0, length(vWorld.xz));
          float density = (ripple * 0.45 + flow * 0.3) * fade;

          // As the soul crosses, the surface brightens under it.
          density *= 0.7 + uCrossing * 0.7;

          gl_FragColor = vec4(color * (0.5 + ripple) * (0.8 + uCrossing * 0.6), density);
        }
      `,
    }),
  );
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -1.3;
  return { mesh, material };
}

const RIVER_BEATS: readonly Beat[] = [
  { id: 'the-bank', seconds: 14, caption: 'The water does not look deep.' },
  { id: 'wading', seconds: 20 },
  { id: 'letting-go', seconds: 22, caption: 'The particulars go first. You do not notice them going.' },
  { id: 'far-side', seconds: 16, caption: 'What is left is not nothing.' },
  { id: 'wait', seconds: 1, hold: true },
];

export const riverOfForgettingScene: SceneDefinition = {
  id: 'light.river-of-forgetting',
  title: 'The River of Forgetting',
  discarnate: true,
  exits: [{ id: 'onward', label: 'The far bank', to: 'light.rebirth' }],
  create(context: SceneContext): SceneInstance {
    const { resources, scene, soul } = context;

    const air = airShell(resources, { radius: 130, ground: 0x101a28, glow: 0x5a7fa8, density: 0.6 });
    scene.add(air.mesh);

    const radiance = radianceShell(resources, { radius: 115, color: 0xd8ecff, accent: 0x7f9fd8 });
    radiance.setFocus(0, 0.2, -1);
    radiance.setIntensity(0.22);
    scene.add(radiance.mesh);

    const river = riverSurface(context);
    scene.add(river.mesh);

    // Everything the soul chose, carried into the water as lights. They go out
    // one at a time, which is what "specifics fade" has to look like.
    const carried = new Group();
    scene.add(carried);
    const lights = soul.cart.map((item, index) => {
      const spread = (index - (soul.cart.length - 1) / 2) * 1.2;
      const glow = volumetricGlow(resources, {
        radius: 0.4,
        color: item.karmaCost < 0 ? 0xffb48a : 0xffe6b0,
        intensity: 1.1,
        softness: 2.3,
      });
      glow.mesh.position.set(spread, 0.5, -3.4);
      carried.add(glow.mesh);
      // Later items go out later, so the fading reads as a sequence.
      return { glow, order: soul.cart.length > 1 ? index / (soul.cart.length - 1) : 0 };
    });

    const motes = moteField(resources, context.rng.stream('river'), {
      count: 1300,
      radius: 15,
      color: 0xd8ecff,
      size: 0.16,
    });
    scene.add(motes.points);

    const director = new Director(RIVER_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 8);
      }
    });

    context.rig.setMode('drifting');
    context.rig.position.set(0, 1.5, 6);
    context.rig.target.set(0, 1.5, 6);
    context.rig.orient(0, -0.04);
    context.rig.setSway(0.3);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.08;
    grade.grain = 0.05;
    grade.vignette = 0.32;
    grade.aberration = 0.0022;
    grade.distortion = 0.026;
    grade.exposure = 1.14;
    grade.washColor = [0.95, 0.99, 1];
    grade.washAmount = 0.02;
    grade.smear = 0;
    context.post.setBloom(0.82, 0.74, 0.66);

    context.audio.drone(0.19, 54, 8);
    context.audio.shimmer(0.24);
    context.audio.room(0.07, 700);
    context.audio.heartbeat(false);

    return {
      update(delta, elapsed) {
        director.update(delta);
        const { beat, t } = director.state;

        setU(air.material, 'uTime', elapsed);
        setU(river.material, 'uTime', elapsed);
        radiance.update(elapsed);
        motes.drift(delta, elapsed);

        const crossing = beat.id === 'the-bank'
          ? ease.out(t) * 0.15
          : beat.id === 'wading'
            ? 0.15 + t * 0.3
            : beat.id === 'letting-go'
              ? 0.45 + ease.inOut(t) * 0.4
              : 0.85 + (beat.id === 'far-side' ? t * 0.15 : 0.15);

        setU(river.material, 'uCrossing', crossing);
        context.rig.target.set(0, 1.5 - crossing * 0.35, 6 - crossing * 14);

        // The lights go out in order as the crossing deepens.
        for (const light of lights) {
          light.glow.update(elapsed, context.camera);
          const gone = Math.max(0, Math.min(1, (crossing - 0.25 - light.order * 0.35) / 0.3));
          setU(light.glow.material, 'uIntensity', 1.1 * (1 - gone));
          light.glow.mesh.position.y = 0.5 - gone * 0.5;
        }

        grade.washAmount = 0.02 + crossing * 0.05;
        radiance.setIntensity(0.22 + crossing * 0.16);
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

// --- rebirth -------------------------------------------------------------------

const REBIRTH_BEATS: readonly Beat[] = [
  { id: 'what-carries', seconds: 18 },
  { id: 'the-mark', seconds: 16 },
  { id: 'the-door', seconds: 16, caption: 'You will not remember choosing any of this.' },
  { id: 'wait', seconds: 1, hold: true },
];

export const rebirthScene: SceneDefinition = {
  id: 'light.rebirth',
  title: 'Rebirth',
  discarnate: true,
  exits: [{ id: 'next-life', label: 'Begin the next life', to: 'content-notes' }],
  create(context: SceneContext): SceneInstance {
    const { resources, scene, soul } = context;

    const air = airShell(resources, { radius: 120, ground: 0x1c1526, glow: 0x8f6fb0, density: 0.6 });
    scene.add(air.mesh);

    const radiance = radianceShell(resources, { radius: 110, color: 0xffeedd, accent: 0xc89cff });
    radiance.setFocus(0, 0.1, -1);
    radiance.setIntensity(0.26);
    scene.add(radiance.mesh);

    // The door: a narrowing of light. Nothing on the other side is shown,
    // because nothing on the other side is remembered.
    const door = volumetricGlow(resources, { radius: 2.6, color: 0xfff2e0, intensity: 1.4, softness: 1.7 });
    door.mesh.position.set(0, 1.0, -9);
    scene.add(door.mesh);

    const motes = moteField(resources, context.rng.stream('rebirth'), {
      count: 1400,
      radius: 13,
      color: 0xffe0c0,
      size: 0.17,
    });
    scene.add(motes.points);

    // The life ends here: what persists is written down, and the soul is reset.
    // Done once, on scene creation, so the state is settled before the player
    // reads it off the panel below.
    const previous = loadIncarnation();
    const carried: Incarnation = crossRiver(previous, soul, 'death.heart-attack');
    saveIncarnation(carried);

    const panel = document.createElement('div');
    panel.className = 'market market--checkout';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Rebirth');

    const title = document.createElement('h1');
    title.className = 'market__title';
    title.textContent = carried.lives === 1 ? 'One life, behind you' : `${String(carried.lives)} lives, behind you`;

    const kept = document.createElement('ul');
    kept.className = 'market__manifest';
    for (const line of carried.wisdom) {
      const row = document.createElement('li');
      row.textContent = line;
      kept.append(row);
    }
    if (carried.birthmark !== undefined) {
      const row = document.createElement('li');
      row.textContent = carried.birthmark;
      kept.append(row);
    }
    if (carried.memories.length > 0) {
      const row = document.createElement('li');
      row.textContent = `${String(carried.memories.length)} memory shard${carried.memories.length === 1 ? '' : 's'}, kept.`;
      kept.append(row);
    }

    const note = document.createElement('p');
    note.className = 'market__verdict';
    note.textContent = carried.opening.items.length > 0
      ? `The ${String(carried.opening.items.length)} things you chose are the conditions you wake into. Their names are already going.`
      : 'You chose nothing, so nothing goes with you but the fact of having been here.';

    const nav = document.createElement('div');
    nav.className = 'market__nav';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'overlay__button';
    next.textContent = 'Begin the next life';
    next.addEventListener('click', () => {
      // The cart becomes the opening conditions, and the run starts over.
      applyOpening(soul, carried);
      void context.takeExit('next-life');
    });
    nav.append(next);

    panel.append(title, kept, note, nav);
    document.body.appendChild(panel);
    resources.onDispose(() => {
      panel.remove();
    });

    const director = new Director(REBIRTH_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 8);
      }
    });

    context.rig.setMode('drifting');
    context.rig.position.set(0, 1.5, 3);
    context.rig.target.set(0, 1.5, 1.4);
    context.rig.orient(0, 0);
    context.rig.setSway(0.26);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.04;
    grade.grain = 0.04;
    grade.vignette = 0.3;
    grade.aberration = 0.002;
    grade.distortion = 0.022;
    grade.exposure = 1.12;
    grade.washColor = [1, 0.97, 0.92];
    grade.washAmount = 0.025;
    grade.smear = 0;
    context.post.setBloom(0.85, 0.76, 0.66);

    context.audio.drone(0.2, 64, 13);
    context.audio.shimmer(0.3);
    context.audio.heartbeat(false);

    return {
      update(delta, elapsed) {
        director.update(delta);
        const { beat, t } = director.state;

        setU(air.material, 'uTime', elapsed);
        radiance.update(elapsed);
        motes.drift(delta, elapsed);
        door.update(elapsed, context.camera);

        const approach = beat.id === 'what-carries'
          ? ease.out(t) * 0.2
          : beat.id === 'the-mark'
            ? 0.2 + t * 0.3
            : 0.5 + (beat.id === 'the-door' ? ease.inOut(t) * 0.5 : 0.5);

        setU(door.material, 'uIntensity', 1.4 + approach * 1.1);
        door.mesh.scale.setScalar(1 + approach * 0.35);
        context.rig.target.set(0, 1.5, 1.4 - approach * 3.2);
        grade.washAmount = 0.025 + approach * 0.05;
        radiance.setIntensity(0.26 + approach * 0.14);
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
