import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { Director, ease, type Beat } from '../systems/director';
import { figureOfLight, moteField, volumetricGlow, type PresenceBearing } from '../systems/forms';
import { NOISE, setU } from '../systems/glsl';
import { RELEASE_SECONDS, ThresholdPrompt } from './threshold-early';
import { applyOpening, loadIncarnation } from '../systems/incarnation';

/**
 * The passage — the soul is carried into a body and a child is born.
 *
 * GAME_BRIEF.md § Premise: "Every run is one life and one death. Reincarnation
 * is the loop." The game had the death end of that loop built in detail and the
 * birth end as an abstract fade: the river took the particulars, rebirth wrote
 * down what was left, and then the run simply started again. This is the other
 * door, and it is staged with the same discipline as the deaths.
 *
 * TREATMENT, and it is the whole of the design here. CLAUDE.md § Content rules:
 * death is conveyed through perception, not gore. A birth is the same problem
 * mirrored, so it is conveyed through perception and not through anatomy. What
 * is rendered is a *passage*, experienced from inside by the one being born:
 *
 * - enclosure — warmth, red-dark, a heartbeat heard through water, and a dim
 *   glow reaching in from somewhere outside;
 * - pressure — a narrowing and a drawing-through, carried by the camera, the
 *   light and the sound;
 * - the threshold — the glow widens and goes cold and bright;
 * - arrival — air for the first time, sound suddenly unmuffled, blurred shapes
 *   above, a face, and warmth coming back as the child is held.
 *
 * There is no body in this scene, no anatomy, no nudity, nothing clinical and
 * nothing explicit. The mother is present the way a newborn has her: as warmth,
 * as a heartbeat, as a voice in a room, and as a blurred face that leans in. She
 * is never a subject the camera looks at from outside, for the same reason the
 * soldier's killer never is.
 *
 * Sourcing: the loop itself is the brief's, and `L-ER-04` (the Myth of Er) puts
 * the drinking and the forgetting immediately before the souls are "carried up
 * to their birth". Nothing here is claimed as a finding about what being born is
 * like — it is the game's reading of it, and it is written as perception rather
 * than as fact for exactly that reason.
 */

// --- where this life begins ----------------------------------------------------

export type BirthSetting = 'hospital' | 'home' | 'offworld';

/**
 * The one Place item that is not on Earth (`systems/market.ts`).
 *
 * Held as a named constant rather than written into the vote table, because it
 * does not vote. CLAUDE.md § Gotchas is about ramps keyed by index, and this is
 * the same class of mistake one level up: a planet listed among the weights
 * would be a number somebody could later tune into a tie, and a tie is defined
 * to land at home. Where the soul is born is not a question of degree.
 */
const OFFWORLD_PLACE = 'place.another-sun';

/**
 * Which room the passage comes out into, read off the cart.
 *
 * The soul chose its circumstances a few scenes ago, and this is where that
 * choice lands — so the setting is derived, never drawn. Two aisles vote, and
 * they are the two the question is actually about: a hospital birth is a
 * *supplied* circumstance. It takes money within reach (`market.economics`) and
 * somewhere near enough to reach it from (`market.place`). The other five aisles
 * deliberately abstain: a gift, a soul contract or a face people are kind to say
 * nothing about which room you arrive in.
 *
 * A tie, or a cart that chose neither, lands at home. That is not a default of
 * convenience: the hospital is the thing that has to be provided, and a life
 * that specified nothing is born where people have always been born.
 *
 * Neither reading is the better life. GAME_BRIEF.md is explicit that each
 * circumstance carries its own lessons and that the Trauma aisle is sacred
 * rather than grim, so the two rooms are staged as different, not as better and
 * worse: one is bright, hard and loud, the other low, warm and quiet, and both
 * end with the same face and the same warmth.
 *
 * A third setting OVERRIDES the vote rather than joining it. If the soul bought
 * another world, that is where it is born, whatever its economics said: money
 * and distance are an argument about which room on a planet, and they have no
 * standing on the question of which planet. So the vote is still counted — the
 * score and the voters stay readable, and a test can see the Earth birth this
 * cart would otherwise have had — and then it is simply not consulted.
 */
const SETTING_VOTES: Readonly<Record<string, number>> = {
  // Enough money, and no arithmetic about it: the institution is simply there.
  'economics.abundance': 2,
  'economics.comfortable': 1,
  // Not enough, often. The nearest ward is a cost and a journey.
  'economics.tight': -2,
  // "You will lose it once and build it again" is about a later decade, not
  // about the morning you arrive, so it abstains.
  'economics.rebuilt': 0,

  'place.city': 2,
  // Both of these are named as small and far: a cold coast and a small town,
  // flat country and slow decades.
  'place.coastal': -2,
  'place.inland': -2,
  // "Between two languages" says what the room sounds like, not where it is.
  'place.between': 0,
};

export interface BirthCircumstance {
  readonly setting: BirthSetting;
  /** Positive leans to the ward, negative to the house. Zero is the house. */
  readonly score: number;
  /** The items that actually voted. Diagnostics, and legibility in a test. */
  readonly voters: readonly string[];
}

export function birthSettingFor(cart: readonly { id: string; label: string }[]): BirthCircumstance {
  let score = 0;
  const voters: string[] = [];
  let offworld = false;
  for (const item of cart) {
    if (item.id === OFFWORLD_PLACE) {
      // It is a voter in the record — the cart did choose it — but it decides
      // rather than counts, so it adds nothing to the score.
      offworld = true;
      voters.push(item.label);
      continue;
    }
    const vote = SETTING_VOTES[item.id];
    if (vote === undefined || vote === 0) {
      continue;
    }
    score += vote;
    voters.push(item.label);
  }
  if (offworld) {
    return { setting: 'offworld', score, voters };
  }
  return { setting: score > 0 ? 'hospital' : 'home', score, voters };
}

/** What each room is made of. Colour comes from here; structure from `uSetting`. */
interface RoomPalette {
  /** The dark of the enclosure. Shared, because the inside is the inside. */
  readonly deep: number;
  /** The enclosure lit through from outside. */
  readonly lit: number;
  /** Walls, below the ceiling line. */
  readonly low: number;
  /** The ceiling. */
  readonly high: number;
  /** The light overhead. */
  readonly lamp: number;
  /**
   * A second light, on a world that has two. Earth's rooms leave it out and the
   * shell falls back to `lamp`: a ward's row of fittings is one kind of light
   * repeated, not two kinds of light, and the difference between those is most
   * of what makes the third setting read as somewhere else.
   */
  readonly lamp2?: number;
  /** The pale arc across the sky, where there is a sky. Falls back to `lamp`. */
  readonly ring?: number;
  /** The blurred shapes that are other people. */
  readonly attendant: number;
  /**
   * The face. Off-world there is no face, so this is the colour of the one that
   * comes closest — the thing doing the receiving, whatever it is.
   */
  readonly face: number;
}

const ROOMS: Readonly<Record<BirthSetting, RoomPalette>> = {
  // Cold overhead light, hard pale surfaces, a light in a row of lights.
  // Deliberately held well below white: the lamp is the bright thing in frame,
  // and a ceiling at white would take the clipping bound on its own
  // (CLAUDE.md § Gotchas — bloom runs before the grade).
  hospital: {
    deep: 0x200406,
    lit: 0xc2443a,
    low: 0x5c7183,
    high: 0x9db4c4,
    lamp: 0xf2f8ff,
    attendant: 0xcfe2f2,
    face: 0xffd9b4,
  },
  // Lamplight, a low ceiling close over you, cloth, and very little else.
  home: {
    deep: 0x200406,
    lit: 0xc2443a,
    // Warmer and a good deal lighter than a first pass had them: measured at
    // the original values the whole arrival came back at mean luma 18.8 with
    // no lit pixel in frame at all, which clears the gate's floor and still
    // reads as a dark room rather than as lamplight.
    low: 0x5a4030,
    high: 0x8d6344,
    lamp: 0xffc98a,
    attendant: 0xffb277,
    face: 0xffcf9e,
  },
  /**
   * Somewhere else entirely, and the colour does nearly all of the work.
   *
   * Two suns of different colours and a sky that is violet at the top and rose
   * at the horizon: a newborn cannot read geology or architecture, and it has no
   * idea what a sky is supposed to look like, so the only honest way to say
   * "this is not Earth" through a newborn's perception is how many lights there
   * are, what colour they are, and what colour everything they fall on goes.
   *
   * Held below white for the same reason the ward's ceiling is (bloom runs
   * before the grade): the suns are the bright things in frame, and a sky at
   * white would take the clipping bound on its own. The ground is darker than
   * either Earth room's walls, which is what keeps the horizon an event.
   */
  offworld: {
    // The enclosure is unchanged, deliberately. The inside of a body is the
    // inside of a body: warm, dark, red, and a heartbeat arriving through
    // water. Everything strange here is on the other side of the threshold,
    // which is the whole shape of the scene — the passage is the same passage,
    // and what it opens onto is not.
    deep: 0x200406,
    lit: 0xc2443a,
    // Ground, and a dusk-violet rather than a brown: wet mineral under two
    // lights that are not the colour the eye expects.
    low: 0x3c2c52,
    // Zenith. A blue sky is Rayleigh scattering in this much nitrogen; this one
    // is not that, and it is the first thing in the frame.
    high: 0x4b3f8e,
    // The small sun. High, hard-edged, and cold.
    lamp: 0xdcd4ff,
    // The big one, low and late and amber. Two shadows off every stone, which
    // is what the Market's flash promised.
    lamp2: 0xffb178,
    // An arc across the sky: a ring seen from inside its own plane.
    ring: 0xc8c0ff,
    attendant: 0xb9a8ff,
    face: 0xe3d2ff,
  },
};

/**
 * How the presences in each setting are built, and the only place in this scene
 * that departs from the shape of a person.
 *
 * `systems/presence.ts` sweeps a vessel of light from elliptical rings laid on a
 * spine, and every proportion in it is a number in a bearing. So an original
 * off-world presence is that same idiom with its numbers moved — tall and
 * narrow, a long throat, a small crown, a wide slow drift at half a human's
 * rate — and not a creature design. There is no face, no eye, no limb and no
 * silhouette taken from anywhere: what is different about these is entirely the
 * figures below, and the light that falls on them.
 *
 * They are also staged as a group rather than as a bedside. GAME_BRIEF.md asks
 * for wonder and weight at once, and `L-THRESH-06` forbids anything that looms,
 * so these stand further off and wider apart than the people in a ward, come in
 * together at the end, and incline rather than lean over. Nothing here is better
 * or worse than Earth. It is other, and it receives you.
 */
interface PresenceShape {
  /** The near one, in metres. The others are built a little under it. */
  readonly height: number;
  /** Rim colour on the near presence. */
  readonly accent: number;
  /** Which way the light that falls on them comes from, in world space. */
  readonly light: readonly [number, number, number];
  /** Departures from the seeded bearing. Empty on Earth: people stand as people. */
  readonly bearing: Partial<PresenceBearing>;
  /** How far each of the others resolves. A zero is nobody standing there. */
  readonly others: readonly number[];
  /** Where the others stand, before `roomSpread` narrows them to the window. */
  readonly spots: readonly (readonly [number, number])[];
  /** How far the others come in while the child is held, in metres. */
  readonly closes: number;
  /** Where the near one stands before it comes in. */
  readonly nearZ: number;
  /** How far the near one comes in while the child is held, in metres. */
  readonly nearCloses: number;
}

const BEDSIDE: readonly (readonly [number, number])[] = [
  [-2.4, -4.4],
  [2.6, -5.0],
  [-1.1, -6.4],
];

const PEOPLE: Readonly<Record<BirthSetting, PresenceShape>> = {
  // A ward is busy: four people, and the furthest are still only shapes.
  hospital: {
    height: 1.72,
    accent: 0xcfe2f2,
    light: [0.12, 0.94, 0.3],
    bearing: {},
    others: [0.62, 0.54, 0.44],
    spots: BEDSIDE,
    closes: 0,
    // She comes right in. Held at arm's length she read as someone standing at
    // the end of a bed; this close, her head is in the upper third of a level
    // view and the rest of her passes out of the bottom of the frame, which is
    // what being leaned over actually looks like.
    nearZ: -4.0,
    nearCloses: 1.9,
  },
  // A house has one person in it and somebody else in the doorway.
  home: {
    height: 1.72,
    accent: 0xffb277,
    light: [0.12, 0.94, 0.3],
    bearing: {},
    others: [0.44, 0.22, 0],
    spots: BEDSIDE,
    closes: 0,
    nearZ: -4.0,
    nearCloses: 1.9,
  },
  offworld: {
    // Half again as tall as a person, which is read off the frame rather than
    // measured: at a newborn's eye height the crown of one of these sits in the
    // top of a level view with the sky behind it.
    height: 2.55,
    // The warm sun, down one side of a violet form.
    accent: 0xffb178,
    // Lit from the low sun: behind, to the left and barely above, so the light
    // on them is rim light and the group reads against the sky.
    light: [-0.66, 0.3, -1],
    bearing: {
      // Narrow and deep-chested rather than broad: the human silhouette's
      // loudest cue is a wide shallow shoulder line, so taking that away is
      // most of what makes these read as not-us.
      //
      // Pulled back from a first pass that had the shoulders at 0.6 and the hem
      // at 1.38. Measured by looking: a narrow waist under a wide hem is the
      // profile of a vase, and at 1280x720 four of them came back reading as
      // glassware rather than as anyone standing there. The height, the throat
      // and the drift carry the difference instead, and none of those is a
      // shape the eye files as an object.
      shoulderWidth: 0.68,
      depth: 0.9,
      waist: 0.9,
      hem: 1.12,
      headSize: 0.56,
      neck: 0.7,
      // The shoulder line sits low, and `warpHeight` spends the difference on
      // the throat: a long neck, which no bearing from a seed will ever draw.
      shoulderT: 0.69,
      stoop: -0.028,
      // Barely inclined. An inclination is a greeting; a bow is a verdict.
      headNod: 0.06,
      headTilt: 0.04,
      // Turned toward the newborn, but not squared up in a rank.
      regard: 0.84,
      // Half a human's rate and three times its reach, so the group drifts
      // like something standing in moving water. Movement is the third lever
      // after proportion and number, and it is free: the vertex shader already
      // takes every one of these as a uniform.
      swayAmp: 0.021,
      swayRate: 0.085,
      breathAmp: 0.027,
      breathRate: 0.21,
    },
    // Three of them around you, and the near one. Less resolved than she is in
    // either Earth room — these are never going to become faces.
    others: [0.5, 0.44, 0.38],
    // Further off than a bedside, and further again than the first pass had
    // them: half again a person's height at a person's distance fills the whole
    // window, and the sky is the thing that has to stay in it.
    spots: [
      [-3.6, -6.2],
      [3.9, -6.6],
      [0.6, -8.8],
    ],
    // They come in together at the end. This is the setting's equivalent of the
    // face arriving: not one face close up, but the whole circle closing.
    closes: 1.0,
    // The near one keeps more distance than a mother leaning over a bed, for
    // the same reason: at 2.55 metres it would otherwise be the entire frame.
    nearZ: -5.8,
    nearCloses: 1.3,
  },
};

/**
 * The two answers to the arrival's one question, per setting.
 *
 * The question itself does not change — "where do your eyes go first" is a
 * newborn's first act anywhere, and it is the one the Threshold's prompt grammar
 * was built to ask. What has to change is whether the answers are true of the
 * place: off-world there is no face to look at, so offering one would be a
 * question the environment cannot answer, which is the failure
 * `systems/exit-offers.ts` exists to prevent one level down. Both answers lead
 * to the same exit and neither moves the ledger: the review, the Council and
 * the Market settled all of it, and the river took the rest.
 */
interface FirstLook {
  readonly label: string;
  readonly detail: string;
  /** What the prompt settles to once it has been picked. */
  readonly settle: string;
}

const EARTH_FIRST_LOOK: { readonly face: FirstLook; readonly light: FirstLook } = {
  face: {
    label: 'The face',
    detail: 'Warm, and close, and already looking back.',
    settle: 'You will not remember this. You will look for it in every room you are ever in.',
  },
  light: {
    label: 'The light',
    detail: 'The brightest thing there has ever been.',
    settle: 'It is only a lamp. Nobody will ever be able to tell you what you were looking for.',
  },
};

const FIRST_LOOK: Readonly<Record<BirthSetting, { readonly face: FirstLook; readonly light: FirstLook }>> = {
  hospital: EARTH_FIRST_LOOK,
  home: EARTH_FIRST_LOOK,
  offworld: {
    face: {
      label: 'The one leaning in',
      detail: 'Not a face. Turned toward you all the same.',
      settle: 'You will not remember this. You will look for it in every sky you are ever under.',
    },
    light: {
      label: 'The smaller sun',
      detail: 'High, and hard, and the colder of the two.',
      settle: 'It is only a star. Nobody will ever be able to tell you what you were looking for.',
    },
  },
};

// --- the enclosure, and the room it opens into ---------------------------------

/**
 * One inward-facing shell carries the whole passage: the womb-dark at the start,
 * and the room at the end, with `uOpen` between them.
 *
 * One shell and one program rather than two, for two reasons. It is one draw
 * call for the entire background of a scene the player cycles forever, on a
 * software rasteriser where a draw call is the expensive unit. And a second
 * shader that only ever renders in one of the two settings would never compile
 * in the other — CLAUDE.md § Gotchas: a green build means nothing until every
 * scene has rendered, and a shader behind a branch is a shader nobody rendered.
 */
function passageShell(
  context: SceneContext,
  palette: RoomPalette,
  setting: BirthSetting,
): { mesh: Mesh; material: ShaderMaterial } {
  const geometry = context.resources.track(new SphereGeometry(60, 32, 24));
  const material = context.resources.track(
    new ShaderMaterial({
      side: BackSide, // Seen from inside.
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        /** 0 enclosed, 1 arrived. */
        uOpen: { value: 0 },
        /** 0..1 the narrowing. */
        uNarrow: { value: 0 },
        /** 0..1 the way out widening and going cold. */
        uThreshold: { value: 0 },
        /**
         * 0 home, 1 hospital, 2 elsewhere. Structure only; colour comes from
         * the uniforms. The shader splits this into `ward` (the old 0..1 the
         * two Earth rooms mix along) and `alien`, rather than taking a third
         * value through mixes that were written for two — a `mix(0.02, 0.06,
         * 2.0)` extrapolates silently and nothing fails.
         */
        uSetting: { value: setting === 'offworld' ? 2 : setting === 'hospital' ? 1 : 0 },
        uDeep: { value: new Color(palette.deep) },
        uLit: { value: new Color(palette.lit) },
        uRoomLow: { value: new Color(palette.low) },
        uRoomHigh: { value: new Color(palette.high) },
        uLamp: { value: new Color(palette.lamp) },
        /** The second light, where there is one. Earth's rooms reuse the first. */
        uLamp2: { value: new Color(palette.lamp2 ?? palette.lamp) },
        uRing: { value: new Color(palette.ring ?? palette.lamp) },
        uMouth: { value: new Color(0xdceaff) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        void main() {
          vLocal = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uOpen;
        uniform float uNarrow;
        uniform float uThreshold;
        uniform float uSetting;
        uniform vec3 uDeep;
        uniform vec3 uLit;
        uniform vec3 uRoomLow;
        uniform vec3 uRoomHigh;
        uniform vec3 uLamp;
        uniform vec3 uLamp2;
        uniform vec3 uRing;
        uniform vec3 uMouth;
        varying vec3 vLocal;

        ${NOISE}

        void main() {
          vec3 dir = normalize(vLocal);
          float churn = fbm(dir * 2.1 + vec3(0.0, uTime * 0.06, uTime * 0.04), 4);

          // --- enclosed ------------------------------------------------------
          // Outside is one direction, ahead and a little down. It is a glow
          // reaching through, never an opening: nothing on the other side of it
          // is drawn, because nothing on the other side of it is visible yet.
          vec3 way = normalize(vec3(0.0, -0.12, -1.0));
          float toward = dot(dir, way) * 0.5 + 0.5;
          float reach = pow(toward, mix(4.0, 11.0, uNarrow));

          // Strands the reaching light picks out, drifting slowly. Stretched
          // along the vertical so they read as a weave rather than as noise.
          float strands = fbm(dir * vec3(7.0, 3.0, 7.0) + vec3(uTime * 0.09, 0.0, 0.0), 3);
          float lit = reach * (0.55 + strands * 0.9) + churn * 0.3;
          vec3 enclosed = mix(uDeep, uLit, clamp(lit, 0.0, 1.0));

          // The narrowing closes the frame in without moving the camera:
          // everything that is not the way out goes down.
          enclosed *= 1.0 - uNarrow * 0.55 * (1.0 - reach);

          // --- the threshold -------------------------------------------------
          // The way out widens and goes cold. It is added here, as emission on
          // the shell, and NOT as a wash over the finished frame: a wash lifts
          // every pixel by the same amount, which flattens the image instead of
          // blowing it out, and the first version of this beat measured 99% of
          // the frame "bright" with the picture gone (CLAUDE.md § Gotchas). As
          // emission, the dark that is not the opening stays dark, so the peak
          // keeps its structure and its bright pixels are the opening itself.
          //
          // The cone widens but is never allowed to become the whole sphere,
          // and it is modulated by the same strands the rest of the enclosure
          // is: a peak that keeps its own structure reads as a blast, and one
          // that does not reads as a blank page. Measured, the unbounded
          // version came back at mean luma 219 with 25% of the frame clipped
          // and nothing in it — a white rectangle, which is the exact failure
          // the brief warns about for the Light.
          // Built on the raw forward dot, not on the remapped one above. That
          // one is spread over 0..1 across the whole sphere, so even a high
          // power of it barely falls off inside a 90-degree frame and the
          // "cone" was the entire picture: measured at 99.9% of the frame
          // bright with 17% clipped, which is a white page with a vignette.
          float ahead = max(0.0, dot(dir, way));
          float mouth = pow(ahead, mix(26.0, 4.5, uThreshold)) * (0.55 + strands * 0.85);
          enclosed += uMouth * mouth * uThreshold * 2.2;

          // --- which world, and which room in it -----------------------------
          // Three settings through one program. "alien" is a hard 0 or 1, and
          // "ward" is the old 0..1 the two Earth rooms mix along — so every mix
          // below that was tuned for two endpoints still only ever sees those
          // two. Feeding a third value straight into them would extrapolate in
          // silence, which is the index-keyed-ramp mistake in GLSL.
          float alien = step(1.5, uSetting);
          float ward = uSetting * (1.0 - alien);

          // --- the room ------------------------------------------------------
          // Lying on your back, the ceiling is most of what there is, so the
          // line where it meets the wall sits just above the middle of a level
          // view. In a ward that line is hard; at home it is low, close and
          // almost all shadow.
          float edge = mix(0.02, 0.06, ward);
          float soften = mix(0.21, 0.10, ward);
          float ceiling = smoothstep(edge - soften, edge + soften, dir.y);

          // The light overhead, drawn here rather than as a sprite. A billboard
          // glow at this intensity grew the streaking in its own shader into a
          // seven-pointed star — a sparkle, not a lamp — and the shell can go
          // brighter than white anyway, so it blooms without the artefact and
          // costs no extra draw.
          vec3 lampDir = normalize(mix(vec3(0.30, 1.0, -0.75), vec3(0.34, 1.0, -0.55), ward));
          float pool = pow(max(0.0, dot(dir, lampDir)), mix(4.0, 13.0, ward));
          // A ward has more than one of them, in a row going away from you.
          float second = pow(max(0.0, dot(dir, normalize(vec3(-0.42, 1.0, -1.25)))), 16.0) * ward;

          // Cloth and lamplight have texture; a painted ward wall does not.
          float cloth = (1.0 - ward) * fbm(dir * 9.0, 3) * 0.34;
          // Something upright between you and the wall, far out of focus, so
          // the lower half of the frame is not an empty field of one colour.
          float upright = smoothstep(0.5, 0.0, abs(dir.x - 0.45)) * (1.0 - ceiling) * 0.14;

          vec3 room = mix(uRoomLow, uRoomHigh, ceiling) * (0.84 + cloth - upright);
          room += uLamp * (pool * mix(0.9, 1.6, ward) + second * 1.1);

          // --- or no room at all ---------------------------------------------
          // The other world opens out of doors. There is no ceiling line, only
          // a horizon low in the frame and very soft, so nearly all of the view
          // is sky — which is the only surface a newborn on its back can
          // actually be shown, and so it carries the whole claim.
          // The horizon sits a little below the centre line of a level view and
          // is soft but legible. A first pass spread it over half the sphere,
          // and with no line anywhere in frame the picture read as coloured
          // haze rather than as standing on a world.
          float skyT = smoothstep(-0.16, 0.07, dir.y);
          // Slow bands of colour high up, drawn from the strands the enclosure
          // already computed. No second noise call: this scene is the one the
          // player cycles forever, and three fbm calls is what it costs today.
          float bands = sin(dir.y * 8.0 - strands * 3.0 + uTime * 0.05) * 0.5 + 0.5;

          // Two suns, and this is the whole argument that the world is not
          // Earth. It is made out of the three things a newborn can register:
          // how many lights there are, how big each one is, and what colour it
          // turns everything it falls on. The small one is high, hard-edged and
          // cold; the big one sits near the horizon and is amber, so every
          // shape in the frame is lit warm down one side and violet down the
          // other. Nothing about it is a creature, a structure or a sign — it
          // is light, which is the cheapest lever and the strongest.
          //
          // Both of them are aimed into a level newborn's view rather than
          // overhead, which is the whole difference between the claim being
          // made and the claim being out of frame: the first pass hung them at
          // fifty-five degrees, above the top edge of a sixty-degree field, and
          // the arrival came back as a violet wash nobody could count the suns
          // in. Each is a hard disc plus a broad halo — a disc alone at this
          // frame rate is a dot, and a halo alone is weather.
          float aimHigh = max(0.0, dot(dir, normalize(vec3(0.40, 0.44, -1.0))));
          float sunHigh = pow(aimHigh, 70.0) + pow(aimHigh, 9.0) * 0.18;
          float aimLow = max(0.0, dot(dir, normalize(vec3(-0.70, 0.10, -1.0))));
          float sunLow = pow(aimLow, 34.0) * 0.8 + pow(aimLow, 6.0) * 0.5;
          // An arc straight across the sky: a ring seen from inside its own
          // plane, so it is a great circle and not an ellipse. One dot product
          // and one exp, and it is the detail that stops the sky being a
          // gradient. Cut off below the horizon, where it would be underground.
          float ringBand = dot(dir, normalize(vec3(0.26, 0.93, 0.26)));
          float ring = exp(-ringBand * ringBand * 420.0) * skyT;

          vec3 sky = mix(uRoomLow, uRoomHigh, skyT);
          // Air with something in it. Held as a multiply on the sky rather than
          // added, so the dark ground stays dark and the frame keeps a floor.
          sky *= 0.90 + churn * 0.34;
          sky += uRoomHigh * bands * skyT * 0.34;
          sky += uRing * ring * 0.55;
          sky += uLamp * sunHigh * 2.4 + uLamp2 * sunLow * 0.85;
          // The ground the low sun is standing on, lit by it: without this the
          // bottom of the frame is a flat dark field and the horizon has
          // nothing on the near side of it.
          sky += uLamp2 * (1.0 - skyT) * 0.2;

          room = mix(room, sky, alien);

          vec3 color = mix(enclosed, room, uOpen);

          // New eyes. There is no acuity to render, and a blur pass costs a
          // target and a second draw of the whole frame — so the low-frequency
          // churn is mixed back over the image instead, which softens it
          // unevenly the way an unfocused eye does. It lifts as the room
          // resolves, but never all the way: nothing here is ever sharp.
          color = mix(color, color * (0.78 + churn * 0.55), 0.38 - uOpen * 0.16);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
  const mesh = new Mesh(geometry, material);
  // A backdrop, and it must be drawn before everything that is added to it.
  mesh.renderOrder = -10;
  return { mesh, material };
}

// --- the passage ---------------------------------------------------------------

const BEATS: readonly Beat[] = [
  { id: 'enclosure', seconds: 20, caption: 'Warm, and red, and everything arrives through water.' },
  { id: 'the-narrowing', seconds: 18 },
  { id: 'drawn-through', seconds: 16, caption: 'Something has decided. It is not you.' },
  { id: 'the-threshold', seconds: 10 },
  { id: 'first-air', seconds: 14, caption: 'Air. It is the first thing that ever hurt, and you want more of it.' },
  { id: 'held', seconds: 18 },
  { id: 'wait', seconds: 1, hold: true },
];

/**
 * Beat order by id, so "have we opened yet" is a comparison and never an index.
 * CLAUDE.md § Gotchas: a ramp keyed by beat index silently retargets itself the
 * moment a beat is inserted at the front, and nothing fails.
 */
const BEAT_ORDER: Readonly<Record<string, number>> = Object.fromEntries(
  BEATS.map((beat, index) => [beat.id, index]),
);

function orderOf(id: string): number {
  return BEAT_ORDER[id] ?? 0;
}

/**
 * How far out to the sides the room is allowed to stand, given the shape of the
 * window.
 *
 * The camera's 60-degree field is vertical, so a tall phone window has a much
 * narrower horizontal field than a desktop one. At desktop spacings the phone
 * framing came back with the closest presence cut in half by the right edge and
 * two of the other three outside the frame entirely. The Life Market solves the
 * same problem by tilting the camera down; here the room comes in toward the
 * centre line instead, because the thing that must stay in frame is directly
 * ahead rather than below.
 */
export function roomSpread(viewport: { readonly width: number; readonly height: number }): number {
  const aspect = viewport.width / Math.max(viewport.height, 1);
  return Math.min(1, Math.max(0.42, aspect - 0.3));
}

export const birthScene: SceneDefinition = {
  id: 'light.birth',
  title: 'Born',
  /**
   * Not discarnate, and this is the one scene where that word changes meaning.
   * Everything since the heart stopped has carried the spirit body — a glow that
   * rides below the camera and reads the soul's karma. Here the soul is going
   * into a body, so there is nothing left to float beside it, and a glowing
   * marker of the last life's ledger inside the womb would be the wrong claim as
   * well as the wrong image.
   */
  discarnate: false,
  /**
   * On to the next life, and it goes to the vignette chooser rather than back
   * through the content notes. The notes are front matter for the session —
   * they are read once, before play, by someone deciding whether to play at all
   * (CLAUDE.md § Content rules) — and making every life in an endless loop open
   * with them turns a warning into furniture. The first thing a new run should
   * ask is the thing the loop is actually about: which death this one gets.
   */
  exits: [{ id: 'next-life', label: 'Begin the next life', to: 'vignette-select' }],
  create(context: SceneContext): SceneInstance {
    const { resources, scene, soul } = context;

    /**
     * The handover, and it happens here rather than on a button.
     *
     * `light.rebirth` has already crossed the river and written down what
     * outlived the life. What is still on the soul at this moment is the cart —
     * so it is read for the circumstance it bought, and then spent: the cart's
     * contents become the opening conditions of the next run (GAME_BRIEF.md
     * § The Life Market, Checkout), and the child is born already under them.
     *
     * A player can also arrive here by jumping straight to the scene, with an
     * empty cart and whatever the last completed life wrote down. The carried
     * record holds the same items, so the setting is read off that instead and
     * the scene stages correctly either way.
     */
    const carried = loadIncarnation();
    const chosen: readonly { id: string; label: string }[] =
      soul.cart.length > 0 ? soul.cart : carried.opening.items;
    const circumstance = birthSettingFor(chosen);
    const setting = circumstance.setting;
    const palette = ROOMS[setting];
    applyOpening(soul, carried);

    const shell = passageShell(context, palette, setting);
    scene.add(shell.mesh);

    // Specks carried in the water, and later dust in the light over the bed.
    // One field for both, because at this acuity they are the same thing.
    const motes = moteField(resources, context.rng.stream('birth'), {
      count: 900,
      radius: 9,
      // Dust is whatever colour the light that finds it is, so the air itself
      // carries the difference between the worlds at no cost at all.
      color: setting === 'offworld' ? 0xd7c8ff : 0xffd2b0,
      size: 0.13,
    });
    scene.add(motes.points);

    /**
     * The people in the room, as presences and not as glows.
     *
     * The first version of this scene drew all of them as billboard glows, and
     * a screenshot settled it: at these intensities the streaking inside
     * `volumetricGlow` blooms into seven-pointed stars, so the delivery room
     * came back as fog with three sparkles in it. `systems/presence.ts` exists
     * for exactly this — "a presence turned out to be a geometry problem before
     * it was a shading one" — and its figures have a silhouette for the light
     * to describe. They also carry `uResolve`, which is the difference between
     * a blurred shape and a face, held as one number per figure.
     *
     * They stand on a floor that is below the camera, because the camera is a
     * newborn lying down. Nothing here is a body: a figure of light is a
     * lathe-turned vessel with no face and no limbs, and it is the same form
     * the loved ones at the Threshold are built from.
     */
    const room = context.rng.stream('birth-room');
    /** Where the floor is, relative to an eye that is lying on its back. */
    const FLOOR = -1.2;

    const people = PEOPLE[setting];

    const mother = figureOfLight(resources, {
      height: people.height,
      color: palette.face,
      accent: people.accent,
      seed: room.range(0, 40),
      // Lit from the light overhead, so the room's one source is also hers —
      // and off-world from the low sun, so she is rim-lit against the sky.
      light: people.light,
      bearing: people.bearing,
    });
    /** Where everyone stands on a wide window. Narrowed by `roomSpread`. */
    const MOTHER_X = 0.32;
    mother.group.position.set(MOTHER_X, FLOOR, people.nearZ);
    scene.add(mother.group);

    /**
     * The others. How many there are, where they stand and how far they resolve
     * is as much of the difference between the settings as the light is: a ward
     * is busy, a house has one person in it and somebody else in the doorway,
     * and the other world stands around you at a distance and then closes in.
     * They all stay less resolved than the near one, which is what keeps them
     * shapes and keeps her a face — or, off-world, keeps her the one that came.
     */
    const attendants = people.spots.map(([x, z], index) => {
      const at = new Vector3(x, FLOOR, z);
      const weight = people.others[index] ?? 0;
      const figure = figureOfLight(resources, {
        // A little under the near one, whichever world this is, and never all
        // the same height: a rank of equal figures reads as one prop repeated.
        height: people.height * 0.965 + room.range(0, 0.16),
        color: palette.attendant,
        accent: palette.lamp,
        seed: room.range(0, 40),
        light: people.light,
        bearing: people.bearing,
      });
      figure.group.position.copy(at);
      // Kept, so a resize can re-place this figure from its wide-window spot.
      const home = at.clone();
      // Nobody is standing there in the quiet version of the room. The figures
      // share one program, so the one that is never drawn costs no compile.
      figure.group.visible = weight > 0;
      scene.add(figure.group);
      return { figure, weight, phase: index * 1.4, home };
    });

    /**
     * Warmth, when the child is held. Not a thing that is looked at — it is
     * low, close and just inside the bottom of the frame, which is where being
     * wrapped in something would be if it were anywhere.
     */
    /** Bring the room in to suit the window. Run at create, and on resize. */
    let spread = roomSpread(context.viewport);
    function placeRoom(): void {
      mother.group.position.x = MOTHER_X * spread;
      for (const attendant of attendants) {
        attendant.figure.group.position.x = attendant.home.x * spread;
      }
    }
    placeRoom();

    const warmth = volumetricGlow(resources, {
      radius: 1.5,
      // Warmth has to read as warmth. Off-world the near presence is violet,
      // so the glow of being held takes the amber sun's colour instead: it is
      // the one warm thing on the whole world, and it is the thing holding you.
      color: setting === 'offworld' ? (palette.lamp2 ?? palette.face) : palette.face,
      intensity: 0,
      softness: 3.4,
    });
    warmth.mesh.position.set(0, -0.62, -0.95);
    scene.add(warmth.mesh);

    /**
     * The way on, and it is offered rather than declared.
     *
     * One question, in the Threshold's own grammar — a newborn's first act is
     * where its attention goes, and that is what the prompt was built to ask.
     * Neither answer moves the ledger: the life review, the Council and the
     * Market already settled all of it, and the river took the rest. Each answer
     * turns the camera and then settles, and `settle`'s one button carries the
     * exit. `releaseAfter` covers the player who answers nothing: the scene lets
     * go by itself rather than holding them, which is the failure four scenes in
     * this project have already shipped (`systems/exit-offers.ts`).
     */
    let prompt: ThresholdPrompt | undefined;
    /** Where the newborn is looking, once it has chosen. Undefined until then. */
    let attention: 'face' | 'light' | undefined;
    resources.onDispose(() => {
      prompt?.dispose();
      prompt = undefined;
    });

    const director = new Director(BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 9);
      }
      // The one line that is not the same in both rooms. Written as what a
      // newborn can register — light, surfaces, how many voices — and with no
      // verdict on either, because the brief does not allow one.
      if (beat.id === 'held') {
        context.captions.show(
          setting === 'hospital'
            ? 'Cold light. Hard surfaces, and a lot of voices. Then warmth, and a face.'
            : setting === 'offworld'
              // The same sentence, said about somewhere else: how many lights,
              // what the air does, how many voices, and then being held. No
              // verdict on it, because the brief does not allow one — this is
              // not a better or a worse arrival than the other two.
              ? 'Two suns, and a line of light across the whole sky. Thin air, and voices with no words in them. Then warmth, and something that was waiting.'
              : 'Lamplight, and a ceiling very close. One voice, then another. Then warmth, and a face.',
          10,
        );
      }
      stageAudio(beat.id);
    });

    /** The bed under the sound. Set on each beat, never per frame: all ramps. */
    function stageAudio(id: string): void {
      switch (id) {
        case 'enclosure':
          // Heard through water: the room tone has had its top taken off, which
          // is the same mechanism the vignettes use for hearing going.
          context.audio.room(0.16, 230);
          context.audio.drone(0.3, 44, 2);
          context.audio.shimmer(0);
          // The engine's heartbeat is already two sounds, one close behind the
          // other, so a single voice at a resting adult rate is the double
          // thump heard from inside.
          context.audio.heartbeat(true, 74, 0.62);
          break;
        case 'the-narrowing':
          context.audio.room(0.2, 185);
          context.audio.drone(0.34, 40, 3);
          context.audio.heartbeat(true, 92, 0.7);
          break;
        case 'drawn-through':
          context.audio.drone(0.36, 37, 5);
          context.audio.heartbeat(true, 106, 0.76);
          break;
        case 'the-threshold':
          context.audio.room(0.24, 900);
          context.audio.shimmer(0.18);
          break;
        case 'first-air':
          // Sound stops being muffled in one move: the filter opens, and what
          // was a pressure under everything becomes a room with edges in it.
          if (setting === 'offworld') {
            // Thin air carries less of the top end and none of the close
            // reflections a room gives you, so the first breath opens onto
            // something wide and quiet instead of onto edges. The shimmer is
            // higher than either Earth room: there is a tone in the air here
            // that is not coming from anything in particular.
            context.audio.room(0.26, 2400);
            context.audio.drone(0.15, 68, 9);
            context.audio.shimmer(0.36);
          } else {
            context.audio.room(0.3, 3600);
            context.audio.drone(0.14, 72, 6);
            context.audio.shimmer(0.26);
          }
          // The only heart left is the small fast one, and it is yours.
          context.audio.heartbeat(true, 132, 0.3);
          break;
        case 'held':
          if (setting === 'hospital') {
            // Hard surfaces keep their top end, and something in the room is
            // running. More voices, further off.
            context.audio.room(0.3, 4400);
            context.audio.drone(0.17, 98, 11);
          } else if (setting === 'offworld') {
            // Many of them, close, and not one of them a word: a wide drone
            // spread is several voices beating against each other, which is as
            // near as this engine gets to speech nobody could learn.
            context.audio.room(0.2, 2000);
            context.audio.drone(0.16, 61, 14);
            context.audio.shimmer(0.3);
          } else {
            // Cloth takes the top off a room, and there is almost nobody in it.
            context.audio.room(0.15, 1400);
            context.audio.drone(0.12, 56, 4);
          }
          context.audio.heartbeat(true, 126, 0.22);
          break;
        default:
          break;
      }
    }

    context.rig.setMode('drifting');
    context.rig.position.set(0, 0, 0.7);
    context.rig.target.set(0, 0, 0.5);
    context.rig.orient(0, -0.03);
    context.rig.setSway(0.5);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.1;
    grade.grain = 0.09;
    grade.vignette = 0.6;
    // Held high on purpose through the whole scene: these are eyes that have
    // never focused, and the frame should never fully resolve.
    grade.aberration = 0.004;
    grade.distortion = 0.06;
    grade.exposure = 1.16;
    grade.washColor = [1, 0.93, 0.9];
    grade.washAmount = 0;
    grade.smear = 0;
    // A high threshold in the dark: there is one lit thing in frame and only it
    // should bloom (CLAUDE.md § Gotchas — bloom runs before the grade).
    context.post.setBloom(0.5, 0.7, 0.85);

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;
        const here = orderOf(beat.id);
        const opened = here >= orderOf('first-air');

        setU(shell.material, 'uTime', elapsed);
        motes.drift(delta, elapsed);

        // --- the narrowing ---------------------------------------------------
        const narrow =
          beat.id === 'enclosure'
            ? ease.out(t) * 0.12
            : beat.id === 'the-narrowing'
              ? 0.12 + ease.inOut(t) * 0.5
              : beat.id === 'drawn-through'
                ? 0.62 + ease.inOut(t) * 0.38
                : beat.id === 'the-threshold'
                  // The squeeze holds until late in the beat. Releasing it as
                  // the light came up lifted the periphery and the mouth
                  // together, and the two of them met in the middle at white.
                  ? 1 - Math.max(0, Math.min(1, (t - 0.55) / 0.45)) ** 2
                  : 0;
        setU(shell.material, 'uNarrow', narrow);

        // --- the threshold, then the opening ---------------------------------
        // Two ramps, not one. The way out widens and goes cold first, and the
        // room only resolves in the last part of the beat — crossfading them
        // together put the frame through a 50/50 mix of red and cold grey,
        // which is mud, and measured as a flat wash with no picture in it.
        const threshold = beat.id === 'the-threshold' ? ease.inOut(t) : opened ? 1 : 0;
        setU(shell.material, 'uThreshold', threshold);
        const open =
          beat.id === 'the-threshold'
            ? Math.max(0, Math.min(1, (t - 0.58) / 0.42)) ** 2
            : opened
              ? 1
              : 0;
        setU(shell.material, 'uOpen', open);

        // --- carried, not walking --------------------------------------------
        // The camera is drawn forward; it never turns itself. The room is
        // staged to sit in front of a level view instead, because wrenching the
        // view away from where the player is looking reads as a bug even here.
        // The travel stops well short of the face: the first pass dollied to
        // within half a metre of it and the face spent the whole arrival
        // directly overhead and out of frame.
        const through = Math.min(1, narrow * 0.5 + threshold * 0.9);
        context.rig.target.set(0, through * 0.2, 0.5 - through * 1.5);

        // Pressure, as waves rather than as a level. Wall-clock, so a slow frame
        // rate does not slow the contractions down with it.
        const squeeze = here >= orderOf('the-narrowing') && !opened
          ? Math.pow(Math.max(0, Math.sin(elapsed * 1.15)), 3) * narrow
          : 0;
        context.rig.setPulse(squeeze * 0.9);
        // A slow turn through the passage, let go of once the child is out. The
        // rig only allows roll where the scene has taken the body away from the
        // player, which is the entire premise of this one.
        context.rig.setRoll(open > 0 ? (1 - open) * 0.16 : narrow * 0.16);
        // How heavy you are, said with the only instrument that can say it from
        // inside a body that is never drawn: how far the view drifts while
        // somebody else is holding you. Off-world the carry is wider and never
        // quite settles, which reads as less weight than Earth asked of you.
        context.rig.setSway(opened ? (setting === 'offworld' ? 0.46 : 0.3) : 0.5 - narrow * 0.2);

        // --- the room, once there is one -------------------------------------
        // She arrives after the air does, and leans in while the child is held.
        // Attention, if the player chose any, brings her in a little further.
        const arrival =
          beat.id === 'first-air'
            ? ease.inOut(t) * 0.45
            : here >= orderOf('held')
              ? 0.45 + ease.out(Math.min(1, beat.id === 'held' ? t : 1)) * 0.55
              : 0;
        const leaning = Math.min(1, arrival + (attention === 'face' ? 0.2 : 0));
        setU(mother.material, 'uTime', elapsed);
        setU(mother.material, 'uResolve', open * (0.18 + leaning * 0.72));
        // How far in the near one comes, which is a different distance on a
        // world where she is half again as tall (`PEOPLE`).
        mother.group.position.z = people.nearZ + leaning * people.nearCloses;

        for (const attendant of attendants) {
          setU(attendant.figure.material, 'uTime', elapsed);
          // There before she is, and they never resolve as far: the room is
          // full of people the newborn will never be able to describe.
          const presence = open * attendant.weight * (0.86 + Math.sin(elapsed * 0.4 + attendant.phase) * 0.14);
          setU(attendant.figure.material, 'uResolve', presence * (attention === 'light' ? 1.1 : 1));
          // Where a setting closes, they all come in together while the child
          // is held — the arrival's warmth carried by a circle rather than by
          // one face. `closes` is zero in both Earth rooms, where the near one
          // comes in alone and the others stay where they were standing.
          if (people.closes !== 0) {
            attendant.figure.group.position.z = attendant.home.z + leaning * people.closes;
          }
        }

        warmth.update(elapsed, context.camera);
        setU(warmth.material, 'uIntensity', leaning * 0.5 * (0.92 + Math.sin(elapsed * 0.55) * 0.08));

        // --- the grade -------------------------------------------------------
        if (!opened && beat.id !== 'the-threshold') {
          // Enclosed: the frame closes in with the passage.
          grade.vignette = 0.6 + narrow * 0.2;
          grade.distortion = 0.06 + narrow * 0.03;
          grade.exposure = 1.16 - narrow * 0.12;
          grade.washAmount = 0;
        } else if (beat.id === 'the-threshold') {
          // The threshold. The light widens and goes cold, and the peak is held
          // on a plateau rather than spiked: this container renders these scenes
          // at a few frames a second, and a peak shorter than a frame is a peak
          // nobody sees (CLAUDE.md § Gotchas).
          const plateau = Math.min(1, ease.inOut(t) * 1.6);
          // The wash is kept small deliberately. The brightness of this beat
          // comes from the opening's own emission, so the grade only has to
          // cool the frame and open the corners up.
          grade.washColor = [0.95, 0.975, 1];
          grade.washAmount = plateau * 0.05;
          grade.exposure = 1.04 + plateau * 0.08;
          grade.vignette = 0.8 - plateau * 0.42;
          grade.distortion = 0.09 - plateau * 0.04;
          grade.drain = 0.1 - plateau * 0.06;
          // Bloom lifts with it, but the threshold goes UP as the frame
          // brightens, so what blooms is the opening and not the whole image.
          context.post.setBloom(0.5 + plateau * 0.55, 0.72, 0.85 - plateau * 0.06);
        } else if (setting === 'offworld') {
          // Arrived somewhere else. The grade's whole job here is to not get in
          // the way of the colour: nothing is drained, because the one thing
          // this frame has to say is what colour the light is, and a drain is
          // the one operation that would take it back. Exposure sits at 1 and
          // the bloom threshold stays high, so what blooms is the two suns and
          // the arc and not the sky they are in — the sky is already the
          // brightest large surface in the scene, and lowering the threshold
          // here would bloom the whole frame (CLAUDE.md § Gotchas).
          grade.washColor = [0.93, 0.92, 1];
          grade.washAmount = 0.04;
          grade.exposure = 1.0;
          // Open corners. There is no room around you to close in, and keeping
          // a heavy vignette out of doors reads as looking through a tube.
          grade.vignette = 0.3;
          grade.drain = 0;
          grade.grain = 0.055;
          grade.distortion = 0.045;
          grade.aberration = 0.0032;
          context.post.setBloom(0.68, 0.72, 0.88);
        } else {
          // Arrived. Two rooms, graded apart: the ward is cooler, flatter and
          // held under exposure 1 so the overhead light has somewhere to go;
          // the house is warmer, dimmer and keeps its corners.
          const hospital = setting === 'hospital';
          grade.washColor = hospital ? [0.95, 0.98, 1] : [1, 0.95, 0.88];
          grade.washAmount = hospital ? 0.05 : 0.03;
          grade.exposure = hospital ? 0.96 : 1.08;
          grade.vignette = hospital ? 0.36 : 0.44;
          grade.drain = hospital ? 0.06 : 0.02;
          grade.grain = 0.06;
          grade.distortion = 0.045;
          grade.aberration = 0.0032;
          context.post.setBloom(hospital ? 0.72 : 0.6, 0.7, 0.86);
        }

        // --- the way on ------------------------------------------------------
        if (beat.id === 'wait' && prompt === undefined) {
          // The caption line and the prompt panel both claim the bottom of the
          // screen, and on a short window they overlap: the arrival's line was
          // half behind the panel and half below it. Text here is rationed to
          // one thing at a time, so the line goes when the question arrives.
          context.captions.clear();
          const asking = new ThresholdPrompt();
          prompt = asking;
          // The ids stay the same in every setting, so the prompt's grammar and
          // anything watching it read one scene and not three.
          const look = FIRST_LOOK[setting];
          asking.ask('You are here, and you are new. Where do your eyes go first?', [
            {
              id: 'the-face',
              label: look.face.label,
              detail: look.face.detail,
              onPick: () => {
                attention = 'face';
                asking.settle(
                  look.face.settle,
                  'nothing moved · a first look is not a decision',
                  { label: 'Begin the next life', exit: 'next-life' },
                );
              },
            },
            {
              id: 'the-light',
              label: look.light.label,
              detail: look.light.detail,
              onPick: () => {
                attention = 'light';
                asking.settle(
                  look.light.settle,
                  'nothing moved · a first look is not a decision',
                  { label: 'Begin the next life', exit: 'next-life' },
                );
              },
            },
          ]);
          // Unanswered, the scene lets go by itself. The release records
          // nothing, exactly as everywhere else in the corridor.
          asking.releaseAfter(RELEASE_SECONDS, 'next-life');
        }
      },
      resize(width, height) {
        // A window that changes shape re-places the room rather than keeping a
        // framing chosen for the shape it used to be.
        spread = roomSpread({ width, height });
        placeRoom();
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
