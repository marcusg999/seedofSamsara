import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  AdditiveBlending,
  Vector3,
} from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { Director, ease, type Beat } from '../systems/director';
import { airShell, figureOfLight, moteField, radianceShell, volumetricGlow } from '../systems/forms';
import { setU } from '../systems/glsl';
import type { CartItem } from '../soul';

/**
 * The Council — the guides weigh the life.
 *
 * GAME_BRIEF.md § Path A: "The Council: guides weigh the life (heart against the
 * feather)." Two sources sit behind it, and the lore bible keeps them apart:
 * the weighing itself is Egyptian (`L-ER-05` — the heart in a balance against
 * the feather of Maat, with the result recorded rather than argued), and the
 * council of elders meeting the soul after a life is Newton (`L-BETWEEN-02`,
 * tier C, hypnotic-regression testimony rather than a finding).
 *
 * The tone this has to hit is set by `L-ER-02`: in Plato the blame belongs to
 * the one who chooses, not to a god. So the guides are not a tribunal and the
 * balance is not a sentence. It is a reading of what is already there, and the
 * scene has to feel like being seen accurately rather than like being judged.
 *
 * This is also where the ledger stops being inert. The review writes karma; the
 * Council is what reads it, and sets the lessons that the Life Market will not
 * let the soul put back (GAME_BRIEF.md § The Life Market: "unresolved karma from
 * the last life puts certain lessons in the cart that can't be put back").
 */

const BEATS: readonly Beat[] = [
  { id: 'gathering', seconds: 14 },
  { id: 'the-balance', seconds: 18, caption: 'Your heart, against a feather.' },
  { id: 'weighing', seconds: 22 },
  { id: 'the-reading', seconds: 20, caption: 'No one here is angry with you.' },
  { id: 'what-carries', seconds: 22, caption: 'This is what the next life will ask of you.' },
  { id: 'wait', seconds: 1, hold: true },
];

/**
 * What a karma debt obliges the next life to face.
 *
 * Deliberately small and specific rather than a difficulty slider: the brief
 * calls the Trauma aisle sacred rather than grim, and an obligation written as a
 * category ("hardship: 3") would make it a tax. Each of these is a thing that
 * happens to a person.
 *
 * Sourced as a design choice, not as a finding: `L-BETWEEN-04` (Schwartz) is
 * tier C — accounts of difficulties chosen before birth for what they teach.
 */
const OBLIGATIONS: readonly { threshold: number; item: Omit<CartItem, 'locked'> }[] = [
  {
    threshold: -1,
    item: {
      aisle: 'trauma',
      id: 'trauma.someone-waiting',
      label: 'A person who waits for you',
      // Negative cost: a challenge repays karma debt (GAME_BRIEF.md § economy).
      karmaCost: -1,
    },
  },
  {
    threshold: -3,
    item: {
      aisle: 'trauma',
      id: 'trauma.the-call-unreturned',
      label: 'A call you will not return in time',
      karmaCost: -2,
    },
  },
  {
    threshold: -6,
    item: {
      aisle: 'trauma',
      id: 'trauma.estrangement',
      label: 'Years of not speaking, and the wish to',
      karmaCost: -3,
    },
  },
];

/** Which obligations a given karma reading locks into the cart. */
export function obligationsFor(karma: number): CartItem[] {
  return OBLIGATIONS.filter((entry) => karma <= entry.threshold).map((entry) => ({
    ...entry.item,
    // Locked: the life review set this, and the Market cannot put it back.
    locked: true,
  }));
}

export const councilScene: SceneDefinition = {
  id: 'light.council',
  title: 'The Council',
  discarnate: true,
  exits: [
    { id: 'market', label: 'To the Life Market', to: 'market.parents' },
    { id: 'again', label: 'Begin again', to: 'content-notes' },
  ],
  create(context: SceneContext): SceneInstance {
    const { resources, scene, soul } = context;

    const air = airShell(resources, { radius: 120, ground: 0x151230, glow: 0x4a3f7a, density: 0.6 });
    scene.add(air.mesh);

    const radiance = radianceShell(resources, { radius: 110, color: 0xffeccd, accent: 0x8f7bf0 });
    scene.add(radiance.mesh);
    radiance.setFocus(0, 0.4, -1);

    // The council, seated in an arc rather than a ring: an arc has a front, and
    // the player needs somewhere to be rather than to be surrounded.
    const rng = context.rng.stream('council');
    const guides = [-2.9, -1.5, 0, 1.5, 2.9].map((x, index) => {
      const height = 1.7 + rng.range(-0.1, 0.14);
      const figure = figureOfLight(resources, {
        height,
        color: 0xffeccd,
        accent: 0xc9a9ff,
        seed: rng.range(0, 40),
      });
      // Arc: the outer guides sit further back, so the group reads as curved.
      const depth = -6.4 - Math.abs(x) * 0.42;
      figure.group.position.set(x, 0.1, depth);
      scene.add(figure.group);

      const halo = volumetricGlow(resources, {
        radius: 1.35,
        color: 0xffeccd,
        intensity: 0.45,
        softness: 2.5,
      });
      halo.mesh.position.copy(figure.group.position).add(new Vector3(0, height * 0.55, 0));
      scene.add(halo.mesh);

      return { figure, halo, phase: rng.range(0, Math.PI * 2), index };
    });

    // --- the balance -------------------------------------------------------
    const balance = new Group();
    balance.position.set(0, 0.95, -3.4);
    scene.add(balance);

    const brass = resources.track(
      new MeshBasicMaterial({
        color: 0xd8b67a,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );

    const columnGeometry = resources.track(new CylinderGeometry(0.035, 0.06, 1.3, 14));
    const column = new Mesh(columnGeometry, brass);
    column.position.y = -0.65;
    balance.add(column);

    const beamGeometry = resources.track(new BoxGeometry(2.3, 0.035, 0.035));
    const beam = new Mesh(beamGeometry, brass);
    balance.add(beam);

    const panGeometry = resources.track(new CylinderGeometry(0.42, 0.42, 0.02, 24));
    const leftPan = new Mesh(panGeometry, brass);
    const rightPan = new Mesh(panGeometry, brass);
    balance.add(leftPan, rightPan);

    // The heart: the life, as it was actually lived.
    const heart = volumetricGlow(resources, { radius: 0.5, color: 0xff9f6e, intensity: 1.5, softness: 2.0 });
    balance.add(heart.mesh);

    // The feather: unchanging, and much lighter than it looks.
    const feather = volumetricGlow(resources, { radius: 0.34, color: 0xd8f0ff, intensity: 1.1, softness: 2.6 });
    balance.add(feather.mesh);

    const motes = moteField(resources, context.rng.stream('council-motes'), {
      count: 1100,
      radius: 14,
      color: 0xffe3bd,
      size: 0.16,
    });
    scene.add(motes.points);

    // --- state -------------------------------------------------------------
    const director = new Director(BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 9);
      }
    });

    context.rig.setMode('drifting');
    context.rig.position.set(0, 1.5, 2.0);
    context.rig.target.set(0, 1.5, 0.6);
    context.rig.orient(0, -0.04);
    context.rig.setSway(0.3);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.05;
    grade.grain = 0.04;
    grade.vignette = 0.3;
    grade.aberration = 0.0022;
    grade.distortion = 0.024;
    grade.exposure = 1.08;
    grade.washColor = [1, 0.97, 0.9];
    grade.washAmount = 0.02;
    grade.smear = 0;
    context.post.setBloom(0.8, 0.76, 0.66);

    context.audio.drone(0.2, 62, 11);
    context.audio.shimmer(0.26);
    context.audio.room(0.05, 800);
    context.audio.heartbeat(false);

    // How far the beam tilts. Karma is a ledger, so the reading is proportional
    // but bounded — the balance leans, it never slams.
    const targetTilt = Math.max(-0.42, Math.min(0.42, -soul.karma * 0.12));
    let tilt = 0;
    let readingDone = false;

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;

        setU(air.material, 'uTime', elapsed);
        radiance.update(elapsed);
        motes.drift(delta, elapsed);
        heart.update(elapsed, context.camera);
        feather.update(elapsed, context.camera);

        for (const guide of guides) {
          setU(guide.figure.material, 'uTime', elapsed);
          guide.halo.update(elapsed, context.camera);
          const arrive = beat.id === 'gathering' ? ease.out(t) : 1;
          setU(guide.figure.material, 'uResolve', Math.min(1, arrive * (0.85 + Math.sin(guide.phase) * 0.15)));
          guide.figure.group.position.y = 0.1 + Math.sin(elapsed * 0.3 + guide.phase) * 0.03;
        }

        // The weighing happens over one beat and then stays where it settled.
        const weighing = beat.id === 'weighing' ? ease.inOut(t) : beat.id === 'gathering' || beat.id === 'the-balance' ? 0 : 1;
        tilt = targetTilt * weighing;
        beam.rotation.z = tilt;

        // Pans hang from the beam ends, so they follow the tilt without rotating.
        const arm = 1.15;
        const dy = Math.sin(tilt) * arm;
        const dx = Math.cos(tilt) * arm;
        leftPan.position.set(-dx, -dy - 0.3, 0);
        rightPan.position.set(dx, dy - 0.3, 0);
        heart.mesh.position.copy(leftPan.position).add(new Vector3(0, 0.3, 0));
        feather.mesh.position.copy(rightPan.position).add(new Vector3(0, 0.22, 0));

        setU(heart.material, 'uIntensity', 1.5 + Math.sin(elapsed * 0.9) * 0.12);
        setU(feather.material, 'uIntensity', 1.1 + Math.sin(elapsed * 0.7 + 1.4) * 0.08);

        radiance.setIntensity(0.26 + weighing * 0.1);
        context.rig.target.set(0, 1.5, 0.6 - weighing * 0.5);

        // The reading is what the next life will be asked to carry. Written once,
        // and locked: the Market may add to the cart but cannot take these out.
        if (!readingDone && (beat.id === 'what-carries' || beat.id === 'wait')) {
          readingDone = true;
          const locked = obligationsFor(soul.karma);
          for (const item of locked) {
            if (!soul.cart.some((existing) => existing.id === item.id)) {
              soul.cart.push(item);
            }
          }
          if (locked.length === 0) {
            context.captions.show('You arrive owing nothing. That is rarer than you think.', 9);
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
