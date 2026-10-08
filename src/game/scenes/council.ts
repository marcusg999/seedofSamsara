import { Quaternion, Vector3 } from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { Director, ease, type Beat } from '../systems/director';
import { airShell, figureOfLight, moteField, radianceShell, volumetricGlow } from '../systems/forms';
import {
  distantColonnade,
  emberCluster,
  featherOfMaat,
  heartOfTheLife,
  leanToward,
  luminousGround,
  weighingBalance,
} from '../systems/weighing-hall';
import { setU } from '../systems/glsl';
import { RELEASE_SECONDS, ThresholdPrompt } from './threshold-early';
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
 * `L-THRESH-06` is the hard limit on the staging: the beings of the Light are
 * felt as wholly loving and without judgement, so nothing here may read as
 * accusation or verdict. They are around the instrument with the player, not
 * ranged against them behind it — the arc is wide enough to be an embrace, the
 * guides lean toward the balance rather than squaring up to the soul, and the
 * one nearest steps in during the reading rather than back.
 *
 * `L-FRAN-03` is why nobody has to be told anything: the spirit body is the
 * soul's own record and its state is visible to others, so what the player is
 * carrying is already plain to everyone standing here. The balance is not
 * discovering it. It is only making it legible to the one person in the room who
 * cannot see it — the player.
 *
 * This is also where the ledger stops being inert. The review writes karma; the
 * Council is what reads it, and sets the lessons that the Life Market will not
 * let the soul put back (GAME_BRIEF.md § The Life Market: "unresolved karma from
 * the last life puts certain lessons in the cart that can't be put back").
 */

const BEATS: readonly Beat[] = [
  { id: 'gathering', seconds: 9 },
  { id: 'the-balance', seconds: 12, caption: 'Your heart, against a feather.' },
  { id: 'weighing', seconds: 14 },
  { id: 'the-reading', seconds: 13, caption: 'No one here is angry with you.' },
  { id: 'what-carries', seconds: 14, caption: 'This is what the next life will ask of you.' },
  { id: 'wait', seconds: 1, hold: true },
];

/** Beat lengths by id, so a beat's own wall-clock seconds are readable in `update`. */
const BEAT_SECONDS: Readonly<Record<string, number>> = Object.fromEntries(
  BEATS.map((beat) => [beat.id, beat.seconds]),
);

/** Beat order by id, so "have we passed X yet" is a comparison and not a search. */
const BEAT_ORDER: Readonly<Record<string, number>> = Object.fromEntries(
  BEATS.map((beat, index) => [beat.id, index]),
);

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

/**
 * Where the five stand: an angle off straight-back, in degrees, around the
 * instrument. Wide, and unevenly spaced once the seeded jitter is on, because an
 * evenly spaced rank of five facing one way is a tribunal and this is not one.
 */
const GUIDE_ANGLES = [-53, -28, -12, 18, 46];
/** How far out from the instrument they stand. */
const GUIDE_RING = 4.0;

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

    const air = airShell(resources, { radius: 120, ground: 0x151230, glow: 0x584a8e, density: 0.6 });
    scene.add(air.mesh);

    const radiance = radianceShell(resources, { radius: 110, color: 0xffeccd, accent: 0x8f7bf0 });
    scene.add(radiance.mesh);
    // Focused almost straight up, and dim. The shell's filaments converge on
    // the focus direction, and a convergence point left in frame reads as a lens
    // flare — exactly the artefact this scene was carrying before. Overhead, it
    // is a sky with a light somewhere above the hall instead.
    radiance.setFocus(0, 1, -0.18);

    // The hall. Ground first: it is opaque, so it also takes the bottom half of
    // the frame away from the two full-screen noise shells above, which is why
    // the place can afford to exist at all.
    const ground = luminousGround(resources, {
      radius: 95,
      near: 0x2b2452,
      far: 0x161331,
      line: 0xffe0b8,
      ringSpacing: 2.1,
    });
    scene.add(ground.mesh);

    const colonnade = distantColonnade(resources, context.rng.stream('council-hall'), {
      count: 18,
      innerRadius: 38,
      outerRadius: 70,
      minHeight: 11,
      maxHeight: 31,
      color: 0xffe6c4,
      accent: 0x7f68cc,
    });
    colonnade.setIntensity(0.8);
    scene.add(colonnade.group);

    // --- the council -------------------------------------------------------
    const rng = context.rng.stream('council');
    const guides = GUIDE_ANGLES.map((degrees, index) => {
      const angle = ((degrees + rng.range(-4, 4)) * Math.PI) / 180;
      const ring = GUIDE_RING + rng.range(-0.35, 0.45);
      const home = new Vector3(Math.sin(angle) * ring, 0, -Math.cos(angle) * ring);
      // Taller than a person, and unequal. Beings who have known this soul
      // before (`L-BETWEEN-02`) should not be the same size as each other or as
      // the player — equal heights in a row is the tribunal reading again.
      const height = 2.68 + rng.range(-0.2, 0.38) + (index === 2 ? 0.18 : 0);
      const figure = figureOfLight(resources, {
        height,
        color: 0xffd9a0,
        accent: 0xa98cff,
        seed: rng.range(0, 40),
        // Lit from above and from the player's side, which is where the Light
        // and the instrument both are.
        light: [0.15, 0.55, 0.82],
      });
      figure.group.position.copy(home);
      scene.add(figure.group);

      return {
        figure,
        home,
        height,
        index,
        phase: rng.range(0, Math.PI * 2),
        lean: new Quaternion(),
      };
    });

    // --- the instrument ----------------------------------------------------
    const balance = weighingBalance(resources, { base: 0xab8148, cool: 0x6f7fd8, spec: 0xfff1d6 });
    scene.add(balance.group);

    // The heart: the life, as it was actually lived. It enters from where the
    // player is, because it is theirs and nobody fetches it for them.
    const heart = heartOfTheLife(resources, { radius: 0.155, color: 0xff9f6e, accent: 0xff5f3c });
    heart.mesh.visible = false;
    scene.add(heart.mesh);

    const heartGlow = volumetricGlow(resources, {
      radius: 0.42,
      color: 0xff9f6e,
      intensity: 1.2,
      softness: 2.1,
    });
    heartGlow.mesh.visible = false;
    scene.add(heartGlow.mesh);

    // The feather: unchanging, and much lighter than it looks (`L-ER-05`).
    const feather = featherOfMaat(resources, {
      length: 0.82,
      width: 0.16,
      color: 0xeaf7ff,
      accent: 0x8fd6ff,
    });
    feather.mesh.visible = false;
    scene.add(feather.mesh);

    // What the reading will lock into the cart. Read once, here, so the scene
    // can show the right number of them — karma is not written anywhere in this
    // scene, so this is the same list the beat below commits.
    const obligations = obligationsFor(soul.karma);
    const embers = emberCluster(resources, {
      count: obligations.length,
      radius: 0.075,
      color: 0xffd9a0,
      accent: 0xff8f5a,
    });
    scene.add(embers.group);

    const motes = moteField(resources, context.rng.stream('council-motes'), {
      count: 700,
      radius: 20,
      color: 0xffe3bd,
      size: 0.1,
    });
    motes.points.position.y = 3;
    scene.add(motes.points);

    // --- state -------------------------------------------------------------
    /**
     * The way on to the Life Market.
     *
     * This scene declared "To the Life Market" and "Begin again" and offered
     * neither — it reached its last beat and held, which is where the owner's
     * playthrough stopped for the fourth time. An audit of every scene found
     * one more doing the same thing (light.river-of-forgetting), and both are
     * fixed together rather than one report at a time.
     */
    let onward: ThresholdPrompt | undefined;
    context.resources.onDispose(() => {
      onward?.dispose();
      onward = undefined;
    });

    const director = new Director(BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 9);
      }
    });

    context.rig.setMode('drifting');
    context.rig.position.set(0, 1.55, 5.1);
    context.rig.target.set(0, 1.55, 4.3);
    context.rig.orient(0, -0.02);
    context.rig.setSway(0.3);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.05;
    grade.grain = 0.04;
    // Lighter than it was: the floor now runs to the edge of frame, and a heavy
    // vignette would throw away the only thing giving the hall its size.
    grade.vignette = 0.26;
    grade.aberration = 0.0022;
    grade.distortion = 0.018;
    grade.exposure = 1.08;
    grade.washColor = [1, 0.97, 0.9];
    grade.washAmount = 0.02;
    grade.smear = 0;
    context.post.setBloom(0.8, 0.76, 0.66);

    context.audio.drone(0.2, 62, 11);
    context.audio.shimmer(0.26);
    context.audio.room(0.05, 800);
    context.audio.heartbeat(false);

    /**
     * How far the beam leans once it has settled. Karma is a ledger, so the
     * reading is proportional but bounded — the balance leans, it never slams.
     * Positive dips the pan carrying the heart, which is the one that gets
     * heavier as the debt does.
     */
    const settledTilt = Math.max(-0.38, Math.min(0.38, -soul.karma * 0.17));
    /**
     * The kick the beam gets when its catch is released. Independent of the
     * reading, and that is deliberate: a soul that owes nothing settles level,
     * and if the only motion came from the result then the one player who
     * arrives clear would watch an instrument that never moves at all. The
     * swing is the event; where it stops is the reading.
     */
    const releaseSwing = 0.085 + Math.abs(settledTilt) * 0.42;

    // Reused per frame so the hall costs no allocation.
    const pools: [number, number, number][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const stance = new Vector3();
    const toward = new Vector3();
    const toPlayer = new Vector3();
    let readingDone = false;

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;
        const local = t * (BEAT_SECONDS[beat.id] ?? 1);
        const here = BEAT_ORDER[beat.id] ?? 0;
        const past = (id: string): boolean => here > (BEAT_ORDER[id] ?? 0);

        setU(air.material, 'uTime', elapsed);
        radiance.update(elapsed);
        ground.update(elapsed);
        colonnade.update(elapsed);
        balance.update(elapsed);
        heart.update(elapsed);
        feather.update(elapsed);
        embers.update(elapsed);
        motes.drift(delta, elapsed);

        // --- the guides ----------------------------------------------------
        const arriving = beat.id === 'gathering' ? ease.out(t) : 1;
        // In the reading they turn a little from the instrument toward the
        // player. Attention is the only expression a form without a face has.
        const attending = beat.id === 'the-reading'
          ? ease.inOut(t)
          : past('the-reading') ? 1 : 0;

        for (const guide of guides) {
          setU(guide.figure.material, 'uTime', elapsed);
          setU(
            guide.figure.material,
            'uResolve',
            Math.min(1, arriving * (0.86 + Math.sin(guide.phase) * 0.14)),
          );

          // The one in the middle steps in while the reading happens. Toward,
          // never away: `L-THRESH-06` leaves no room for a guide who withdraws
          // from what it has just seen.
          const step = guide.index === 2 ? attending * 0.8 : attending * 0.18;
          stance.copy(guide.home).multiplyScalar(1 - step / guide.home.length());
          stance.y = Math.sin(elapsed * 0.28 + guide.phase) * 0.035;
          guide.figure.group.position.copy(stance);

          // Lean: toward the instrument while it is being read, blending toward
          // the player as the guides turn their attention to them.
          toward.set(-stance.x, 0, -stance.z).normalize();
          const player = context.rig.position;
          toPlayer.set(player.x - stance.x, 0, player.z - stance.z).normalize();
          toward.lerp(toPlayer, attending * 0.55);
          const amount = (0.1 + attending * 0.08) * arriving;
          guide.figure.group.quaternion.copy(
            leanToward(guide.lean, toward.x, toward.z, amount),
          );

          const pool = pools[guide.index];
          if (pool) {
            pool[0] = guide.figure.group.position.x;
            pool[1] = guide.figure.group.position.z;
            pool[2] = arriving * (0.5 + (guide.index === 2 ? attending * 0.3 : attending * 0.1));
          }
        }

        // --- the weighing --------------------------------------------------
        // Level and caught until the beam is released; then a real release, a
        // damped swing, and wherever it settles is the reading. Nothing about it
        // is a verdict: it is an instrument finding its own equilibrium.
        let tilt = 0;
        let releasing = 0;
        if (beat.id === 'weighing') {
          releasing = ease.out(Math.min(1, local / 3));
          const decay = Math.exp(-0.85 * local);
          tilt = settledTilt * (1 - decay * Math.cos(1.45 * local))
            + releaseSwing * decay * Math.sin(1.45 * local);
        } else if (past('weighing')) {
          releasing = 1;
          tilt = settledTilt;
        }
        // A live instrument is never quite still, and a sensitive one least of all.
        tilt += Math.sin(elapsed * 0.73) * 0.0045 * releasing;
        balance.setTilt(tilt);

        const loaded = beat.id === 'the-balance' ? ease.inOut(t) : past('the-balance') ? 1 : 0;
        balance.setGlow(0.05 + loaded * 0.22 + releasing * 0.3);

        // --- what is in the pans -------------------------------------------
        // The heart comes up out of the player; the feather comes down out of
        // the light. Neither is handed over by anybody.
        if (beat.id === 'the-balance' || past('the-balance')) {
          const carry = beat.id === 'the-balance'
            ? ease.inOut(Math.max(0, Math.min(1, (local - 1.5) / 7.5)))
            : 1;
          const fall = beat.id === 'the-balance'
            ? ease.inOut(Math.max(0, Math.min(1, (local - 4) / 9)))
            : 1;

          heart.mesh.visible = carry > 0.001;
          heartGlow.mesh.visible = heart.mesh.visible;
          const player = context.rig.position;
          heart.mesh.position.set(
            player.x * (1 - carry) + balance.heartSeat.x * carry,
            (player.y - 0.5) * (1 - carry) + balance.heartSeat.y * carry + Math.sin(carry * Math.PI) * 0.45,
            (player.z - 0.6) * (1 - carry) + balance.heartSeat.z * carry,
          );
          heart.mesh.rotation.y = elapsed * 0.18;
          heart.setIntensity(0.5 + carry * 0.9);
          heartGlow.mesh.position.copy(heart.mesh.position);
          heartGlow.update(elapsed, context.camera);
          setU(heartGlow.material, 'uIntensity', (0.4 + carry * 0.9) * (0.9 + Math.sin(elapsed * 0.9) * 0.1));

          feather.mesh.visible = fall > 0.001;
          feather.mesh.position.set(
            1.5 * (1 - fall) + balance.featherSeat.x * fall - 0.26,
            5.6 * (1 - fall) + balance.featherSeat.y * fall,
            -2 * (1 - fall) + balance.featherSeat.z * fall,
          );
          // It never falls straight: it is a feather. The turn settles as it lands.
          // It never falls straight, and it does not lie flat when it lands: a
          // plume comes to rest against the rim of the pan, standing up out of
          // it, which is the only way its shape reads at all from here.
          feather.mesh.rotation.set(
            Math.sin(elapsed * 0.5) * 0.18 * (1 - fall * 0.7),
            -0.5 + Math.sin(elapsed * 0.33) * 0.5 * (1 - fall) + fall * 0.82,
            0.25 + Math.sin(elapsed * 0.41) * 0.35 * (1 - fall * 0.5) + fall * 0.55,
          );
          feather.setIntensity(0.8 + fall * 0.5);
        }

        // --- the hall ------------------------------------------------------
        const instrumentPool = pools[5];
        if (instrumentPool) {
          instrumentPool[0] = 0;
          instrumentPool[1] = 0;
          instrumentPool[2] = 0.2 + loaded * 0.16 + releasing * 0.12;
        }
        ground.setPools(pools);
        colonnade.setIntensity(0.66 + arriving * 0.2 + attending * 0.1);
        radiance.setIntensity(0.15 + releasing * 0.05);

        // A slow drift in and across. The columns are 50 metres out and the
        // instrument is four, so a very small move gives the hall its depth.
        context.rig.target.set(
          Math.sin(elapsed * 0.045) * 0.42,
          1.55,
          4.3 - arriving * 0.5 - loaded * 0.25 - attending * 0.2,
        );
        grade.exposure = 1.08 + releasing * 0.05;

        // --- what carries --------------------------------------------------
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

        if (beat.id === 'what-carries' || beat.id === 'wait') {
          const player = context.rig.position;
          embers.meshes.forEach((ember, index) => {
            const start = 2 + index * 1.7;
            const travel = beat.id === 'wait'
              ? 1
              : ease.inOut(Math.max(0, Math.min(1, (local - start) / 7)));
            ember.visible = travel > 0.001;
            // Out of the heart, up, and then to rest beside the player — beside,
            // not above and not in front, because this is what they are taking
            // with them rather than something being put on them.
            const restX = player.x + (index - (embers.meshes.length - 1) / 2) * 0.46;
            const restY = 1.12 + Math.sin(elapsed * 0.6 + index) * 0.04;
            const restZ = player.z - 0.95;
            ember.position.set(
              balance.heartSeat.x * (1 - travel) + restX * travel,
              balance.heartSeat.y * (1 - travel) + restY * travel + Math.sin(travel * Math.PI) * 0.7,
              balance.heartSeat.z * (1 - travel) + restZ * travel,
            );
            ember.rotation.set(elapsed * 0.3 + index, elapsed * 0.22, 0);
          });
        }
        if (beat.id === 'wait' && onward === undefined) {
          onward = new ThresholdPrompt();
          onward.ask('The weighing is done. Nothing here is owed to anyone but the next life.', [
            {
              id: 'market',
              label: 'To the Life Market',
              detail: 'Go and choose it. What they wrote into the cart is already in there.',
              exit: 'market',
            },
            {
              id: 'again',
              label: 'Begin again',
              detail: 'Put this one down and take another death instead.',
              exit: 'again',
            },
          ]);
          onward.releaseAfter(RELEASE_SECONDS, 'market');
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
