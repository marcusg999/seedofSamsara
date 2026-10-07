import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Camera,
} from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import type { Rng } from '../rng';
import type { ResourceTracker } from '../disposal';
import { GRAMMAR, colorOf } from '../systems/palette';
import { Director, ease, type Beat } from '../systems/director';
import { moteField, volumetricGlow } from '../systems/forms';
import { NOISE, setU } from '../systems/glsl';
import { choiceQueue } from '../systems/choice-queue';
import type { OverlayContent } from '../systems/overlay';

/**
 * Vignette 6 — shot as a soldier in a war.
 *
 * ## The camera rule, which is absolute
 *
 * CLAUDE.md § Content rules and GAME_BRIEF.md § Act 1: "The soldier's death
 * centers the person dying, not the enemy and not the act, and carries no
 * verdict on the war itself. In both, those doing the killing are never the
 * camera's subject." Lore bible § 13 restates it and adds that no source in the
 * file licenses any more detail than the rule allows.
 *
 * How that is honoured here, concretely, so it cannot be eroded by a later edit:
 *
 * - Whoever fired is **not in the scene**. There is no enemy object, no enemy
 *   position, no muzzle flash, no tracer, no incoming light from any direction,
 *   no return fire, and no sound with a direction in it. Nothing is added to the
 *   scene graph at the moment of the shot and nothing is taken away. The camera
 *   does not turn, flinch toward, or away from, any point — because there is no
 *   point to turn toward. What changes is the man's perception of a morning that
 *   is otherwise exactly as it was a second earlier.
 * - **No weapon is modelled anywhere in this scene.** He is a soldier, and that
 *   reads from the kit of waiting rather than the kit of fighting: a helmet off
 *   and upside down on the floor, a canteen, a tin cup, a rolled pack, a coil of
 *   field wire, a shovel, filled bags on the lip of the ditch someone dug. No
 *   insignia, no flag, no vehicle, no uniform detail, no rank, no unit.
 * - **No war is named**, and nothing fixes a country, a side, a cause or an era
 *   that would imply one. The place is an irrigation ditch at the edge of an
 *   orchard; the orchard belongs to somebody who is not in it. The vignette is
 *   neither heroic nor a protest: he does not resist, nothing is avenged,
 *   nothing is indicted, and nobody is thanked.
 * - **What he is thinking about is not the war.** Every one of the five
 *   questions is about a smell, a letter, a sleeping man, a strip of sky, or
 *   what he takes out of the orchard. None is about the fighting, and none of
 *   them has a tactical answer.
 *
 * ## Death through perception, not gore
 *
 * Nothing in this scene is wounded and nothing bleeds. No body is modelled at
 * all — the dying man *is* the camera — and the one human shape in frame is the
 * other man in the ditch, asleep under a groundsheet, read as a shape. What
 * happens is the treatment rule, in order: time slows (the beat clock holds the
 * crack open for seven seconds), sound drops out (the room's high end collapses
 * and a ring comes up under it), colour drains (`living` → `dying`), and then
 * the camera lifts out of the body and sees the place from above.
 *
 * The lift deliberately does **not** look back down at him. From the height it
 * reaches, the ditch is a dark seam running away below the frame's edge and the
 * subject of the shot is the orchard; a player who wants to look down may, and
 * finds a ditch with a pack and a helmet in it. CLAUDE.md forbids bodies as
 * spectacle, and the cheapest way to obey that is to not build one.
 *
 * ## Lore
 *
 * - `L-THRESH-02` — the buzzing or ringing that accompanies the transition. It
 *   is the only new voice in the mix after the crack, and it is what is left
 *   when the morning's high end has gone.
 * - `L-THRESH-03` — the point of view separates from the body and observes from
 *   above. That claim is what the closing two beats are, and it is also why the
 *   vignette can hand straight over to the Threshold.
 * - `L-PAST-03` — reported past-life cases cluster in violent and unfinished
 *   deaths. Together with GAME_BRIEF.md § Act 1 ("violent, unjust deaths begin
 *   with heavy attachment") it is the reason this death's handover starts heavy
 *   rather than light. See STARTING_ATTACHMENT for the counterweight.
 * - Lore bible § 13 — the representation rule above.
 *
 * Nothing here asserts a fact about dying that is not one of those claims. The
 * slowing, the drain and the silence are GAME_BRIEF.md's treatment rule, which
 * is a decision about how this game depicts death, not a finding about death.
 *
 * ## Shape
 *
 * 100 seconds of authored beats, plus a closing hold that lets go by itself
 * after GRACE_SECONDS — 110s for a player who only watches, against the heart
 * attack's 123s. Five questions, cued at 9s, 22s, 36s, 55s and 76s. The first
 * one is live before the tenth second, because the choice is the
 * characterisation: you learn who this man is by deciding what the orchard
 * smells of to him, not by watching him sit in a ditch.
 */

const LIVING = GRAMMAR.living;
const DYING = GRAMMAR.dying;
/** Out of the body: cold and clinical. The lift grades toward this, not past it. */
const OUTSIDE = GRAMMAR.outside;

/**
 * Where the light is coming from, as a direction from the ditch.
 *
 * This is the dawn and it is the only source of directional light in the scene.
 * It is established in the first frame and never moves, which is load-bearing
 * for the content rule: a scene with exactly one light direction, fixed before
 * anything happens, cannot acquire a second one at the moment of the shot.
 */
const DAWN = new Vector3(0.34, 0.1, -0.94).normalize();

const BEATS: readonly Beat[] = [
  { id: 'cold', seconds: 9, caption: 'The fourth morning in this ditch. The sky is already going.' },
  { id: 'the-orchard', seconds: 13 },
  { id: 'waiting', seconds: 14 },
  { id: 'first-light', seconds: 12 },
  // The crack. Held open rather than cut through: time slowing is the treatment
  // rule's first move, and seven seconds is how this vignette slows it.
  { id: 'the-crack', seconds: 7 },
  { id: 'sitting-down', seconds: 10 },
  { id: 'quiet', seconds: 11, caption: 'The sound goes out of the morning, a bit at a time.' },
  { id: 'lifting', seconds: 10 },
  { id: 'above', seconds: 14, caption: 'The rows go on much further than he knew.' },
  // Holds, so the last image is never snatched away — but not forever.
  { id: 'after', seconds: 1, hold: true },
];

/** How long the closing image holds before the scene moves on by itself. */
const GRACE_SECONDS = 10;

/**
 * What this death hands to the afterlife.
 *
 * GAME_BRIEF.md § Act 1: "violent, unjust deaths begin with heavy attachment
 * (rage, fear, unfinished business); peaceful deaths begin light." This is the
 * violent end of that line, and `border-and-review.ts` reads 0.5 and over as
 * arriving heavy — so the base is set above that threshold and a player who
 * answers nothing still arrives heavy, because nothing about this death is
 * peaceful.
 *
 * It is a base, not a verdict. Five answers move it, and the lightest run of
 * them lands on MIN_ATTACHMENT, which is exactly the corridor's "arrives light"
 * threshold. So the player decides which end of the brief's sentence this death
 * sits at, not the menu they picked it off.
 *
 * Recorded as a design choice rather than a finding, for the same reason the
 * heart attack records its own: lore bible § 12.6 notes that `L-ARREST-02`
 * found depth of experience did not track medical severity, which is mild
 * evidence against a tidy "worse death, heavier start" curve. The brief asks for
 * the curve anyway; this file follows the brief and says so.
 */
const STARTING_ATTACHMENT = 0.55;

/**
 * The lightest this death can hand over, however much the player puts down.
 *
 * 0.2 is `border-and-review.ts`'s "arrives light" boundary. A man who was shot
 * in a ditch at twenty-something does not get to arrive at nothing, and the
 * brief does not ask him to: it says peaceful deaths begin light, and this is
 * not one.
 */
const MIN_ATTACHMENT = 0.2;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// --- the choices, and the state they move --------------------------------------

/**
 * Everything the player is asked here is already in the ditch or already in
 * sight of it: the smell coming off the orchard, the letter against the pack,
 * the man asleep under the groundsheet, the rows, the strip of sky.
 *
 * How the four numbers of GAME_BRIEF.md § Systems read in this ditch:
 * - ATTACHMENT is how much of the morning he is still holding when he leaves
 *   it, and it is this death's handover (see STARTING_ATTACHMENT).
 * - HARMONY rises through release, so it is what putting something down earns,
 *   and what an unseen kindness earns. Never what keeping something earns.
 * - WILL is bought with weight, as in the Threshold corridor: a grip is a use
 *   of will, and the will it buys is Path B's to spend. The man who has stopped
 *   letting anything remind him of anything has the most of it, which is the
 *   honest reading of what that hardness is for.
 * - KARMA is effect on others as felt in the review. There is exactly one other
 *   person in this vignette, so karma moves in exactly two places, and both are
 *   him: the letter that reaches somebody because this man handed it over, and
 *   the sleeping man woken to see the light come up. Nothing else here can touch
 *   another person, so nothing else here touches karma.
 */
interface Pick {
  readonly id: string;
  /** The button. Names the thing, never the outcome. */
  readonly label: string;
  /** The trade, stated plainly before committing, as the corridor's prompts do. */
  readonly trade: string;
  /** What the pick tells the player. Shown once, as the scene's own voice. */
  readonly caption: string;
  /** The run's record of this pick. Cleared on load — see DECISION_SHARDS. */
  readonly shard: string;
  readonly attachment: number;
  readonly harmony: number;
  readonly will: number;
  readonly karma: number;
  /** What his attention lands on, if the pick moves it. */
  readonly regard?: RegardId;
}

/** The things his attention can land on. All of them are already in the scene. */
type RegardId = 'letter' | 'sleeper' | 'rows' | 'sky' | 'dawn';

/**
 * The first question, nine seconds in: what the orchard smells of.
 *
 * This is the characterisation, and it is a decision rather than a minute of
 * watching him — the lesson of `dmt.ts`, whose first choice is the whole of who
 * that man is. Three answers, and they are three different men: one who is
 * still carrying a house, one who can still see a place as a place where people
 * live, and one who has turned off the part of himself that lets anything
 * remind him of anything.
 *
 * Deliberately never says where he is from, and the second option deliberately
 * never says whose orchard this is or which side of anything it is on. Both
 * would be the verdict the brief forbids.
 */
const SMELL: readonly Pick[] = [
  {
    id: 'yard',
    label: 'The yard he grew up in',
    trade: 'A house, and the tree at the back of it. He carries more of it out of here.',
    caption: 'It is the yard behind the house. Wet earth, and the tree nobody ever pruned.',
    shard: 'soldier.the-yard',
    attachment: 0.12,
    harmony: 0,
    will: 0.05,
    karma: 0,
    regard: 'rows',
  },
  {
    id: 'market',
    label: 'Fruit under a tarp, in a town he walked through',
    trade: 'Somebody planted this and somebody was going to pick it. He arrives lighter for knowing that.',
    caption: 'Crates, a tarp, somebody weighing things by hand. Whoever owns these trees meant to pick them.',
    shard: 'soldier.somebody-planted-this',
    attachment: -0.02,
    harmony: 1,
    will: 0,
    karma: 0,
    regard: 'rows',
  },
  {
    id: 'nothing',
    label: 'Nothing. It smells of the orchard.',
    trade: 'He stopped letting things do that a while ago. It costs him nothing and it keeps him standing.',
    caption: 'It smells of the orchard. He has got good at not going any further than that.',
    shard: 'soldier.stopped-letting-it',
    attachment: 0.04,
    harmony: 0,
    will: 0.1,
    karma: 0,
  },
];

/**
 * The second question: the letter against the pack.
 *
 * The only place in this vignette where something can reach a person outside
 * it, which makes it the only honest home for karma besides waking the other
 * man. Handing it over is an effect on somebody: she gets it. Finishing it and
 * keeping it is for him, and may never be read by anyone, so it earns harmony
 * and no karma — the ledger is effect on others, not sincerity.
 */
const LETTER: readonly Pick[] = [
  {
    id: 'hand-it-over',
    label: 'Put it in the other man’s pack',
    trade: 'It goes out of here whatever happens to him. Karma is effect on others, and that is one.',
    caption: 'He tucks it into the top of the other man’s pack, where it will be found and not asked about.',
    shard: 'soldier.handed-it-over',
    attachment: -0.08,
    harmony: 1,
    will: 0.04,
    karma: 1,
    regard: 'sleeper',
  },
  {
    id: 'finish-it',
    label: 'Finish the line he stopped on',
    trade: 'Four days he has not been able to write it. Nobody may ever read it. He will have said it.',
    caption: 'He writes the line. It takes eleven words and most of the pencil he has left.',
    shard: 'soldier.finished-the-line',
    attachment: 0.1,
    harmony: 1,
    will: 0.06,
    karma: 0,
    regard: 'letter',
  },
  {
    id: 'keep-it',
    label: 'Fold it back into his pocket',
    trade: 'He would rather say it to her face. The thing unsaid stays with him, and goes with him.',
    caption: 'Back in the pocket, against his chest, folded along the same four folds as yesterday.',
    shard: 'soldier.kept-it',
    attachment: 0.16,
    harmony: 0,
    will: 0.08,
    karma: 0,
    regard: 'letter',
  },
];

/**
 * The third question: what he does with the last ordinary minutes.
 *
 * Cued as the light comes up, which is the only event the morning has. Nothing
 * in it is about the fighting, and nothing in it is a precaution — he does not
 * know, and a question that let him act on knowing would be a different and
 * much worse scene.
 */
const WATCH: readonly Pick[] = [
  {
    id: 'wake-him',
    label: 'Wake him up for it',
    trade: 'Somebody else sees the light come up. He will remember who woke him.',
    caption: 'A hand on the shoulder. The other man swears at him, sits up, and then stops swearing.',
    shard: 'soldier.woke-him',
    attachment: 0.06,
    harmony: 1,
    will: -0.02,
    karma: 1,
    regard: 'sleeper',
  },
  {
    id: 'let-him-sleep',
    label: 'Let him sleep',
    trade: 'Two nights awake. A kindness nobody will ever know was done — which is harmony, not karma.',
    caption: 'He lets him sleep. The groundsheet goes up and down and the light comes up on it anyway.',
    shard: 'soldier.let-him-sleep',
    attachment: 0,
    harmony: 1,
    will: 0.04,
    karma: 0,
    regard: 'sleeper',
  },
  {
    id: 'count-the-rows',
    label: 'Count the rows',
    trade: 'Nobody planted them for him and they go past where he can see. His hands stay empty.',
    caption: 'Fourteen rows. Then he starts on the trees in one of them and loses count in the mist.',
    shard: 'soldier.counted-the-rows',
    attachment: -0.06,
    harmony: 1,
    will: -0.04,
    karma: 0,
    regard: 'rows',
  },
];

/**
 * The fourth question: the few seconds of knowing.
 *
 * Inside the treatment rule — death here is perception, so the question is
 * perception. Nothing in it resists, calls out, or turns the ditch into a
 * sequence, and nothing in it looks for whoever fired, because the scene does
 * not contain them and a question that searched for them would put them in it.
 * Whatever he is looking at is what he is still holding.
 */
const KNOWING: readonly Pick[] = [
  {
    id: 'the-sky',
    label: 'The strip of sky over the rows',
    trade: 'It is going from grey to a colour. Nothing out there is owed him and nothing is asked.',
    caption: 'The strip over the rows has gone the colour of the inside of a shell. It is not frightening.',
    shard: 'soldier.looked-at-the-sky',
    attachment: -0.1,
    harmony: 1,
    will: -0.05,
    karma: 0,
    regard: 'sky',
  },
  {
    id: 'the-letter',
    label: 'The corner of the letter',
    trade: 'The heaviest thing in the ditch, and the one he would stay for. He leaves holding it.',
    caption: 'A pale corner against the pack. He is looking at it the way you look at a door.',
    shard: 'soldier.looked-at-the-letter',
    attachment: 0.16,
    harmony: 0,
    will: 0.06,
    karma: 0,
    regard: 'letter',
  },
  {
    id: 'the-voice',
    label: 'Whoever is talking very close to his ear',
    trade: 'He cannot make out a word of it. Somebody stayed, and that is worth hearing anyway.',
    caption: 'Somebody is right at his ear, saying the same short thing over and over, and it is gone.',
    shard: 'soldier.heard-the-voice',
    attachment: 0.08,
    harmony: 1,
    will: 0.02,
    karma: 0,
    regard: 'sleeper',
  },
];

/**
 * The last question, and the one that leaves: what goes across with him.
 *
 * Every answer takes the scene's one exit, and the copy says so rather than
 * letting the player think one of them is a way to stay. Nobody argues their way
 * out of this and the vignette will not pretend otherwise. What the answer
 * changes is what he is carrying when he leaves, which is precisely what
 * GAME_BRIEF.md says a death is for.
 *
 * It is also the player's way out: without it the only thing that would ever
 * take this scene's exit is the grace timer, and a player who wants to go sooner
 * must always be able to (GAME_BRIEF.md § Act 1, pacing rule).
 */
const CARRY: readonly Pick[] = [
  {
    id: 'set-it-down',
    label: 'Set the morning down',
    trade: 'He stops holding any of it. He arrives light, with his hands open.',
    caption: 'He puts it down — the ditch, the four days, the line he did or did not write.',
    shard: 'soldier.set-it-down',
    attachment: -0.16,
    harmony: 1,
    will: -0.04,
    karma: 0,
  },
  {
    id: 'the-unsaid',
    label: 'Take the thing he did not get to say',
    trade: 'He keeps his grip on all of it. None of it stays. The holding does.',
    caption: 'He takes it with him, whole and unsaid, and it is heavier than he is.',
    shard: 'soldier.took-the-unsaid',
    attachment: 0.18,
    harmony: 0,
    will: 0.1,
    karma: 0,
  },
  {
    id: 'the-orchard',
    label: 'Take the orchard',
    trade: 'Not the war and not the ditch. The rows, the mist in them, the smell. The last ordinary thing.',
    caption: 'He takes the orchard. Fourteen rows of somebody else’s trees, going grey to gold.',
    shard: 'soldier.took-the-orchard',
    attachment: 0.06,
    harmony: 1,
    will: 0,
    karma: 0,
    regard: 'rows',
  },
];

/**
 * Where each question is cued, as the id of the beat it goes up on.
 *
 * Beat starts, in authored seconds: cold 0, the-orchard 9, waiting 22,
 * first-light 36, the-crack 48, sitting-down 55, quiet 65, lifting 76,
 * above 86, after 100. So the five are cued at 9s, 22s, 36s, 55s and 76s, and
 * the first is live before the tenth second.
 *
 * The longest stretch with nothing to decide is the 21 seconds from the fourth
 * question to the fifth, and it is deliberate: it is the crack, the body going
 * down, and the morning going quiet — the one stretch this vignette has to show
 * rather than ask about. A dialog over it would take the player's eyes off the
 * only thing those beats contain. Everything before it is 9, 13, 14 and 19
 * seconds apart, and the last question is live from the lift onward.
 *
 * A cue is a beat id and nothing more, so re-timing a beat cannot silently move
 * a question out of the window it was written for.
 */
const CUES = {
  smell: 'the-orchard',
  letter: 'waiting',
  watch: 'first-light',
  knowing: 'sitting-down',
  carry: 'lifting',
} as const;

/**
 * A cue as a beat index rather than a beat id.
 *
 * Compared with `>=`, so a question is asked even if the timeline arrives late
 * or the gate skips the beat with `advanceBeat()` — an `=== beat.id` test can
 * miss a beat that was never current on a frame, and a question that is never
 * asked is the exact failure the queue exists to prevent.
 */
function beatIndex(id: string): number {
  const index = BEATS.findIndex((beat) => beat.id === id);
  if (index < 0) {
    throw new Error(`No beat "${id}" to cue a question on`);
  }
  return index;
}

const CUE_AT = {
  smell: beatIndex(CUES.smell),
  letter: beatIndex(CUES.letter),
  watch: beatIndex(CUES.watch),
  knowing: beatIndex(CUES.knowing),
  carry: beatIndex(CUES.carry),
} as const;

/**
 * Every shard that records a decision here, as opposed to a memory.
 *
 * Shards survive the river as memories and are seeded back into the soul at the
 * start of the next run, and the loop can bring a player through this ditch
 * again. Without this, a second pass would read the first pass's answers and the
 * run would believe he had already handed the letter over. Cleared when the
 * scene loads, exactly as `dmt.ts` and `death-heart-attack.ts` clear their own.
 */
const DECISION_SHARDS: readonly string[] = [
  ...SMELL,
  ...LETTER,
  ...WATCH,
  ...KNOWING,
  ...CARRY,
].map((pick) => pick.shard);

/**
 * A question, built from one of the tables.
 *
 * The trade for every option is on screen before the player commits, the way the
 * corridor's prompts put a detail under each answer, and the hint says the
 * moment waits — never that anything will happen if they do not answer, because
 * nothing will. There is no timer on any of these and no default for any of
 * them; the queue in `systems/choice-queue.ts` cannot answer one.
 */
function question(
  title: string,
  body: string,
  picks: readonly Pick[],
  hint: string,
  take: (pick: Pick) => void,
): OverlayContent {
  return {
    title,
    body,
    list: picks.map((pick) => `${pick.label} — ${pick.trade}`),
    actions: picks.map((pick) => ({
      id: pick.id,
      label: pick.label,
      onPick: () => {
        take(pick);
      },
    })),
    hint,
  };
}

// --- the place -----------------------------------------------------------------

/**
 * The sky an hour either side of first light: a vertical gradient, a warm lobe
 * hugging the horizon in one fixed direction, stars that go out as it comes up,
 * and fbm haze so it is never a flat field.
 *
 * Its own shader rather than `airShell`, because `airShell` has no directional
 * term and the whole composition of this vignette is one light at one end of
 * the rows. `uDawn` is the single control: 0.34 at the top of the scene (the sky
 * is already going — he has been awake for hours) rising to 1 as the light
 * arrives.
 *
 * Drawn first with depth test off, which is the ordinary way to put a sky behind
 * everything without it fighting the depth buffer at the shell's radius.
 */
function preDawnSky(
  tracker: ResourceTracker,
  options: { radius: number; horizon: number; zenith: number; dawn: number },
): { mesh: Mesh; material: ShaderMaterial; update(elapsed: number, dawn: number): void } {
  const geometry = tracker.track(new SphereGeometry(options.radius, 32, 24));
  const material = tracker.track(
    new ShaderMaterial({
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDawn: { value: 0.34 },
        uHorizon: { value: colorOf(options.horizon) },
        uZenith: { value: colorOf(options.zenith) },
        uDawnColor: { value: colorOf(options.dawn) },
        uDawnDir: { value: DAWN.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uDawn;
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uDawnColor;
        uniform vec3 uDawnDir;
        varying vec3 vDir;

        ${NOISE}

        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, -1.0, 1.0);

          // Base gradient. Below the horizon it keeps falling off, so the ground
          // planes sit against something darker than the sky rather than a seam.
          float up = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 1.5);
          vec3 color = mix(uHorizon, uZenith, up);

          // How far round the horizon we are from the dawn.
          vec2 flat2 = normalize(vec2(dir.x, dir.z) + vec2(1e-5));
          vec2 dawn2 = normalize(vec2(uDawnDir.x, uDawnDir.z));
          float toward = max(0.0, dot(flat2, dawn2));

          // A broad lobe that hugs the horizon, and a thin line right on it.
          float band = exp(-pow(max(0.0, h) * 6.5, 1.5));
          color += uDawnColor * pow(toward, 3.0) * band * uDawn * 1.35;
          color += uDawnColor * exp(-abs(h) * 40.0) * pow(toward, 7.0) * uDawn * 0.9;

          // Stars, going out as the light comes up.
          float cell = hash31(floor(dir * 240.0));
          float star = smoothstep(0.9972, 1.0, cell) * clamp(h * 1.4, 0.0, 1.0);
          float twinkle = 0.55 + 0.45 * sin(uTime * 1.6 + cell * 90.0);
          color += vec3(0.78, 0.84, 1.0) * star * twinkle * (1.0 - uDawn) * 1.5;

          // Haze, so no part of the sky is a constant value.
          float churn = fbm(dir * 2.1 + vec3(0.0, uTime * 0.012, 0.0), 3);
          color *= 0.84 + churn * 0.36;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = -20;
  mesh.frustumCulled = false;
  return {
    mesh,
    material,
    update(elapsed, dawn) {
      setU(material, 'uTime', elapsed);
      setU(material, 'uDawn', dawn);
    },
  };
}

/**
 * Mist in the rows, as camera-facing bodies of haze.
 *
 * Billboards rather than horizontal sheets, and that is not a shortcut: a
 * horizontal plane above a camera that is looking slightly down is invisible,
 * and this vignette's camera spends its first 76 seconds at ground level in a
 * ditch looking slightly down, then rises fifteen metres. One form had to work
 * from both, so the quads face the camera and the problem does not arise.
 *
 * One geometry and one material for every body: the fbm is offset by the quad's
 * own world origin, read in the vertex shader, so four meshes sharing one
 * program still look like four different patches of mist.
 */
function mistBodies(
  tracker: ResourceTracker,
  options: { size: number; color: number; places: readonly Vector3[] },
): { meshes: Mesh[]; update(elapsed: number, camera: Camera, level: number): void } {
  const geometry = tracker.track(new PlaneGeometry(options.size, options.size * 0.42));
  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uLevel: { value: 0.2 },
        uColor: { value: colorOf(options.color) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vOrigin;
        void main() {
          vUv = uv;
          vOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uLevel;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying vec3 vOrigin;

        ${NOISE}

        void main() {
          vec2 centred = vUv - 0.5;
          // Elliptical falloff: the quad is wide and low, and the mist should be
          // too, so the falloff is computed in the quad's own aspect.
          float r = length(centred * vec2(1.0, 2.1)) * 2.0;
          float edge = 1.0 - smoothstep(0.35, 1.0, r);

          vec3 p = vec3(centred * 3.4 + vOrigin.xz * 0.06, uTime * 0.025 + vOrigin.z * 0.11);
          float churn = fbm(p, 4);
          float density = smoothstep(0.3, 0.74, churn) * edge * uLevel;

          gl_FragColor = vec4(uColor * density, density);
        }
      `,
    }),
  );
  const meshes = options.places.map((place) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(place);
    return mesh;
  });
  return {
    meshes,
    update(elapsed, camera, level) {
      setU(material, 'uTime', elapsed);
      setU(material, 'uLevel', level);
      for (const mesh of meshes) {
        mesh.quaternion.copy(camera.quaternion);
      }
    },
  };
}

/**
 * The orchard: rows of trees either side of the ditch.
 *
 * Two `InstancedMesh`es — trunks and canopies — so a hundred and fifty-odd trees
 * cost two draw calls. That matters here: CLAUDE.md records that the post stack
 * already takes ~200ms of a ~360ms frame on this container's software renderer,
 * so this scene adds no post pass and keeps its own draw count near the heart
 * attack's. A mesh per tree would have been three hundred.
 *
 * Form is mathematics and primitives: a faceted seven-sided trunk and a
 * once-subdivided icosahedron for the canopy, both jittered per instance off the
 * seeded stream. Low facet counts are a choice, not a saving — a faceted canopy
 * has silhouette events for the low raking dawn light to describe, and a smooth
 * sphere has none.
 */
function orchard(
  tracker: ResourceTracker,
  rng: Rng,
  options: {
    /** Row centres in x. The ditch runs along z between the innermost pair. */
    readonly rows: readonly number[];
    /** Nearest and furthest tree in z, and the spacing between them. */
    readonly from: number;
    readonly to: number;
    readonly spacing: number;
  },
): { trunks: InstancedMesh; canopies: InstancedMesh; count: number } {
  const places: { x: number; z: number }[] = [];
  for (const x of options.rows) {
    for (let z = options.from; z >= options.to; z -= options.spacing) {
      places.push({ x, z });
    }
  }
  const count = places.length;

  const trunkGeometry = tracker.track(new CylinderGeometry(0.1, 0.19, 1, 7, 1));
  // Base at the origin, so an instance's y scale is its height.
  trunkGeometry.translate(0, 0.5, 0);
  const trunkMaterial = tracker.track(
    new MeshStandardMaterial({ color: 0x33281f, roughness: 0.93, metalness: 0 }),
  );
  const canopyGeometry = tracker.track(new IcosahedronGeometry(1, 1));
  const canopyMaterial = tracker.track(
    new MeshStandardMaterial({ color: 0x2c3626, roughness: 0.95, metalness: 0, flatShading: true }),
  );

  const trunks = new InstancedMesh(trunkGeometry, trunkMaterial, count);
  const canopies = new InstancedMesh(canopyGeometry, canopyMaterial, count);
  // Two objects that between them cover most of the world: culling them as whole
  // objects would cull the orchard, so they are always submitted.
  trunks.frustumCulled = false;
  canopies.frustumCulled = false;
  tracker.onDispose(() => {
    trunks.dispose();
    canopies.dispose();
  });

  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const euler = new Euler();
  const scale = new Vector3();

  for (let index = 0; index < count; index += 1) {
    const place = places[index];
    if (!place) {
      continue;
    }
    const jitterX = rng.range(-0.46, 0.46);
    const jitterZ = rng.range(-0.6, 0.6);
    const height = rng.range(1.55, 2.25);
    const lean = rng.range(-0.07, 0.07);
    const spin = rng.range(0, Math.PI * 2);

    euler.set(lean, spin, rng.range(-0.05, 0.05));
    rotation.setFromEuler(euler);

    position.set(place.x + jitterX, 0, place.z + jitterZ);
    scale.set(rng.range(0.85, 1.2), height, rng.range(0.85, 1.2));
    matrix.compose(position, rotation, scale);
    trunks.setMatrixAt(index, matrix);

    const spread = rng.range(1.15, 1.7);
    position.set(place.x + jitterX + lean * height, height + spread * 0.5, place.z + jitterZ);
    scale.set(spread, spread * rng.range(0.62, 0.82), spread * rng.range(0.9, 1.1));
    matrix.compose(position, rotation, scale);
    canopies.setMatrixAt(index, matrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;

  return { trunks, canopies, count };
}

export const deathSoldierScene: SceneDefinition = {
  id: 'death.soldier',
  title: 'Fourth morning',
  exits: [{ id: 'onward', label: 'Go on', to: 'threshold.pronounced-dead' }],
  contentNotes: [
    'A soldier is shot and dies, shown from inside his own perception. There is no wound and no blood, and his '
      + 'body is never shown: time slows, sound drops away, colour drains, and the view lifts out of him.',
    'Whoever fired is never seen, named or placed. No weapon is fired on screen, no war is named, and the '
      + 'vignette takes no side and passes no verdict.',
  ],
  /**
   * Deliberately NOT `discarnate`.
   *
   * The flag is per scene, not per beat, and it would put the spirit body in the
   * frame from the first second — while he is sitting in a ditch, alive, with a
   * cup of something. The out-of-body view with the spirit body in it is
   * `threshold.out-of-body`'s job; the lift at the end of this vignette is the
   * treatment rule's closing image, not the Threshold's element. The heart
   * attack makes the same call for the same reason.
   */
  create(context: SceneContext): SceneInstance {
    const { resources, scene, rng } = context;
    const place = new Group();
    scene.add(place);

    // A fresh pass through this ditch decides for itself (see DECISION_SHARDS).
    context.soul.shards = context.soul.shards.filter((shard) => !DECISION_SHARDS.includes(shard));

    // --- materials ---------------------------------------------------------
    const earthMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x2b231c, roughness: 0.97, metalness: 0 }),
    );
    const cutEarthMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x1f1915, roughness: 0.98, metalness: 0 }),
    );
    const bagMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x4a4031, roughness: 0.96, metalness: 0 }),
    );
    const clothMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x3d3a2e, roughness: 0.95, metalness: 0 }),
    );
    const metalMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x6f757a, roughness: 0.52, metalness: 0.58 }),
    );
    const paintedMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x3a4036, roughness: 0.82, metalness: 0.12 }),
    );
    const paperMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0xbcb09a,
        roughness: 0.99,
        metalness: 0,
        // A touch of self-lit warmth. The letter is the heaviest object in the
        // ditch and it must not disappear into the shadow at the bottom of it.
        emissive: 0x30291d,
        emissiveIntensity: 1,
      }),
    );

    // --- sky ---------------------------------------------------------------
    const sky = preDawnSky(resources, {
      radius: 120,
      horizon: 0x2a3344,
      zenith: 0x0d1220,
      dawn: 0xff9d5c,
    });
    place.add(sky.mesh);

    // --- ground, either side of the ditch ----------------------------------
    //
    // The ditch is a slot in the ground, so the ground is two planes with a gap
    // rather than one plane with a hole: no CSG, no z-fighting, and the slot
    // runs the length of the field the way an irrigation ditch does.
    const DITCH_HALF_WIDTH = 0.95;
    const DITCH_DEPTH = 1.05;
    const FIELD = 180;

    const groundGeometry = resources.track(new PlaneGeometry(FIELD / 2, FIELD));
    for (const side of [-1, 1] as const) {
      const ground = new Mesh(groundGeometry, earthMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(side * (DITCH_HALF_WIDTH + FIELD / 4), 0, -FIELD / 2 + 20);
      place.add(ground);
    }

    const ditchFloorGeometry = resources.track(new PlaneGeometry(DITCH_HALF_WIDTH * 2, FIELD));
    const ditchFloor = new Mesh(ditchFloorGeometry, cutEarthMaterial);
    ditchFloor.rotation.x = -Math.PI / 2;
    ditchFloor.position.set(0, -DITCH_DEPTH, -FIELD / 2 + 20);
    place.add(ditchFloor);

    const ditchWallGeometry = resources.track(new PlaneGeometry(FIELD, DITCH_DEPTH));
    for (const side of [-1, 1] as const) {
      const wall = new Mesh(ditchWallGeometry, cutEarthMaterial);
      wall.position.set(side * DITCH_HALF_WIDTH, -DITCH_DEPTH / 2, -FIELD / 2 + 20);
      wall.rotation.y = side * (Math.PI / 2) * -1;
      place.add(wall);
    }

    // Filled bags on the lip, which is what gives the near frame a silhouette
    // against a sky that is the brightest thing in it. Somebody dug this and
    // then stacked what came out of it.
    const bagGeometry = resources.track(new BoxGeometry(0.46, 0.17, 0.3));
    for (let index = 0; index < 14; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const bag = new Mesh(bagGeometry, bagMaterial);
      bag.position.set(
        side * (DITCH_HALF_WIDTH + 0.16 + rng.range(-0.03, 0.05)),
        0.085 + (index % 4 === 3 ? 0.17 : 0),
        1.4 - index * 0.62 + rng.range(-0.1, 0.1),
      );
      bag.rotation.y = rng.range(-0.22, 0.22);
      bag.rotation.z = rng.range(-0.06, 0.06);
      place.add(bag);
    }

    // --- the orchard -------------------------------------------------------
    const trees = orchard(resources, rng.stream('orchard'), {
      rows: [-23.0, -19.6, -16.2, -12.8, -9.4, -6.0, -2.6, 2.6, 6.0, 9.4, 12.8, 16.2, 19.6, 23.0],
      from: 8,
      to: -62,
      spacing: 5,
    });
    place.add(trees.trunks);
    place.add(trees.canopies);

    // --- the life in the ditch ---------------------------------------------
    //
    // Nothing here is a weapon and nothing here is insignia. This is the kit of
    // four days of waiting, and it is the only material the vignette's decisions
    // are made of.
    const FLOOR = -DITCH_DEPTH;

    // His pack, rolled, propped against the wall in front of him.
    const packGeometry = resources.track(new CapsuleGeometry(0.21, 0.42, 4, 10));
    const pack = new Mesh(packGeometry, clothMaterial);
    pack.position.set(0.42, FLOOR + 0.22, 0.2);
    pack.rotation.set(Math.PI / 2, 0, 0.18);
    place.add(pack);

    // The letter, leaning against it. The pale thing in a dark slot.
    const letterGeometry = resources.track(new PlaneGeometry(0.1, 0.145));
    const letter = new Mesh(letterGeometry, paperMaterial);
    letter.position.set(0.37, FLOOR + 0.3, 0.33);
    letter.rotation.set(-0.42, -0.3, 0.07);
    place.add(letter);

    // The helmet, off, upside down on the floor. A dome and a rim, nothing else.
    const helmetGeometry = resources.track(
      new SphereGeometry(0.135, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.56),
    );
    const helmet = new Mesh(helmetGeometry, paintedMaterial);
    helmet.position.set(-0.46, FLOOR + 0.01, 0.1);
    helmet.rotation.set(Math.PI, 0, 0.3);
    place.add(helmet);
    const rimGeometry = resources.track(new TorusGeometry(0.133, 0.015, 6, 18));
    const rim = new Mesh(rimGeometry, paintedMaterial);
    rim.position.set(-0.46, FLOOR + 0.015, 0.1);
    rim.rotation.x = Math.PI / 2;
    place.add(rim);

    // A canteen on its side, and the tin cup he has been holding.
    const canteenGeometry = resources.track(new CylinderGeometry(0.072, 0.072, 0.17, 12));
    const canteen = new Mesh(canteenGeometry, paintedMaterial);
    canteen.position.set(-0.2, FLOOR + 0.072, 0.52);
    canteen.rotation.set(Math.PI / 2, 0, 0.5);
    place.add(canteen);

    const cupGeometry = resources.track(new CylinderGeometry(0.05, 0.043, 0.072, 14, 1, true));
    const cup = new Mesh(cupGeometry, metalMaterial);
    cup.position.set(0.1, FLOOR + 0.036, 0.62);
    place.add(cup);

    // A coil of field wire, and the shovel this ditch was dug with.
    const coilGeometry = resources.track(new TorusGeometry(0.15, 0.028, 7, 16));
    const coil = new Mesh(coilGeometry, metalMaterial);
    coil.position.set(0.62, FLOOR + 0.028, -0.42);
    coil.rotation.x = Math.PI / 2;
    place.add(coil);

    const shaftGeometry = resources.track(new CylinderGeometry(0.022, 0.022, 0.95, 8));
    const shaft = new Mesh(shaftGeometry, clothMaterial);
    shaft.position.set(-0.78, FLOOR + 0.46, -0.6);
    shaft.rotation.set(0.3, 0, 0.22);
    place.add(shaft);
    const bladeGeometry = resources.track(new BoxGeometry(0.16, 0.2, 0.02));
    const blade = new Mesh(bladeGeometry, metalMaterial);
    blade.position.set(-0.86, FLOOR + 0.07, -0.74);
    blade.rotation.set(1.3, 0, 0.22);
    place.add(blade);

    /**
     * The other man, asleep under a groundsheet, further down the ditch.
     *
     * Read as a shape and nothing more: a capsule and a boot. He is the only
     * human form in the scene, he is asleep for most of it, and he is the one
     * other person karma can move through. He is in the ditch, not outside it,
     * and he never does anything to anyone.
     */
    const sleeper = new Group();
    const sheetGeometry = resources.track(new CapsuleGeometry(0.3, 1.1, 5, 12));
    const sheet = new Mesh(sheetGeometry, clothMaterial);
    sheet.rotation.x = Math.PI / 2;
    sleeper.add(sheet);
    const bootGeometry = resources.track(new BoxGeometry(0.14, 0.13, 0.26));
    const boot = new Mesh(bootGeometry, paintedMaterial);
    boot.position.set(-0.12, -0.14, 0.78);
    boot.rotation.set(0.2, 0.3, 0);
    sleeper.add(boot);
    sleeper.position.set(0.14, FLOOR + 0.3, -2.7);
    place.add(sleeper);

    // --- mist and air ------------------------------------------------------
    const mist = mistBodies(resources, {
      size: 17,
      color: 0x9fb2c6,
      places: [
        new Vector3(-7.4, 1.5, -13),
        new Vector3(6.2, 1.8, -21),
        new Vector3(-4.1, 2.1, -33),
        new Vector3(8.8, 2.4, -46),
        new Vector3(0.6, 1.2, -7.5),
      ],
    });
    for (const mesh of mist.meshes) {
      place.add(mesh);
    }

    // Dust and whatever is awake before the birds are. A moving field is most of
    // what stops a dark frame reading as a still.
    const motes = moteField(resources, rng.stream('motes'), {
      count: 520,
      radius: 17,
      color: 0xd6c6ab,
      size: 0.11,
    });
    motes.points.position.set(0, 2.2, -14);
    place.add(motes.points);

    // --- light -------------------------------------------------------------
    //
    // One directional source, fixed on DAWN from the first frame, plus bounce.
    // Nothing is ever added to this list, which is how the content rule is kept
    // honest in the lighting: there is no second direction for light to arrive
    // from at the moment of the shot.
    const dawnGlow = volumetricGlow(resources, {
      radius: 9,
      color: 0xffa05e,
      intensity: 0.4,
      softness: 2.4,
    });
    dawnGlow.mesh.position.copy(DAWN).multiplyScalar(62);
    dawnGlow.mesh.position.y = 2.2;
    place.add(dawnGlow.mesh);

    const dawnLight = new DirectionalLight(0xffb37c, 0.35);
    dawnLight.position.copy(DAWN).multiplyScalar(40);
    dawnLight.position.y = 7;
    dawnLight.target.position.set(0, 0.6, -14);
    place.add(dawnLight);
    place.add(dawnLight.target);
    resources.onDispose(() => {
      dawnLight.dispose();
    });

    // Sky-down and earth-up bounce, so surfaces away from the dawn still carry
    // shape instead of going to pure black.
    const bounce = new HemisphereLight(0x3c4e68, 0x201812, 0.62);
    place.add(bounce);
    resources.onDispose(() => {
      bounce.dispose();
    });

    /**
     * What he is looking at, as light rather than as a camera move.
     *
     * The rig's path through this vignette is authored — he sits, he goes down,
     * the view leaves him — and a choice that fought it for the camera would
     * wreck the one thing the beats are for. So attention is shown the way the
     * rest of this place shows everything: a little more light on the thing he
     * has fixed on. One sprite, reused by every pick. It costs no post pass.
     */
    const regardGlow = volumetricGlow(resources, {
      radius: 0.7,
      color: 0xffd9a8,
      intensity: 0,
      softness: 2.6,
    });
    regardGlow.mesh.visible = false;
    place.add(regardGlow.mesh);

    /** Where attention can land. All of it was already here. */
    const REGARD: Record<RegardId, Vector3> = {
      letter: new Vector3(letter.position.x, letter.position.y + 0.04, letter.position.z),
      sleeper: new Vector3(sleeper.position.x, sleeper.position.y + 0.26, sleeper.position.z),
      rows: new Vector3(-3.4, 2.1, -11),
      sky: new Vector3(0.4, 7.5, -17),
      dawn: new Vector3(DAWN.x * 26, 3.4, DAWN.z * 26),
    };

    // --- state -------------------------------------------------------------
    const director = new Director(BEATS);

    /** Sitting in the ditch with his head just above the lip. */
    const EYE_SIT = 0.26;
    /** Down in the ditch, against the wall. The body, not the view. */
    const EYE_DOWN = -0.46;
    /** Where the view gets to once it is out of him. */
    const EYE_ABOVE = 15.5;

    context.rig.setMode('embodied');
    context.rig.position.set(0, EYE_SIT, 2.0);
    /**
     * Looking down the ditch, slightly down, with the dawn twenty degrees to the
     * right. Set once, on the first frame, which is the only time `orient` is
     * legal — the rig's own rule, and the reason the lift below moves the camera
     * without ever touching its aim. The player keeps the look the whole way,
     * including the authority to look down at the ditch from fifteen metres up
     * if they want to, which the scene itself never does.
     */
    context.rig.orient(0, -0.18);
    context.rig.setSway(1);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = LIVING.drain;
    grade.grain = LIVING.grain;
    grade.vignette = 0.34;
    grade.aberration = 0.0012;
    grade.distortion = 0.02;
    grade.exposure = 1.22;
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(LIVING.bloom, 0.55, 0.82);

    context.audio.room(0.26, 900);
    context.audio.drone(0.07, 40);
    context.audio.heartbeat(true, 58, 0.3);
    context.audio.ring(0, 1900);
    context.audio.shimmer(0);

    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 6);
      }
    });

    /**
     * Per-beat heart rate. Data rather than a switch in `update`, so the arc of
     * the vignette is readable in one place: four beats of a man who has been
     * awake all night, then the rate the body answers with, then nothing.
     */
    const BPM: Record<string, number> = {
      cold: 58,
      'the-orchard': 57,
      waiting: 56,
      'first-light': 55,
      'the-crack': 128,
      'sitting-down': 112,
      quiet: 38,
      lifting: 0,
      above: 0,
      after: 0,
    };

    let bodyDown = 0;
    let apart = 0;
    let handedOver = false;
    /** Wall-clock, never accumulated delta: the ring and the grace both read it. */
    let crackAt: number | undefined;
    let holdBeganAt: number | undefined;
    let leaving = false;
    let now = 0;
    let regardSince: number | undefined;

    // --- the questions -----------------------------------------------------
    const choices = choiceQueue(context);
    /** What the player decided, in the order the morning asked. */
    const taken: Pick[] = [];
    /** Questions already queued, so a cue fires once. */
    const askedAlready = new Set<string>();
    /** Questions already answered, so two clicks on one frame cannot double-enter. */
    const answeredAlready = new Set<string>();
    /** Whether the letter is still in the ditch, and where it ended up. */
    let letterPick: Pick | undefined;
    /** Whether the other man is awake. He wakes if he is woken, or at the crack. */
    let wokenEarly = false;

    /**
     * What the death hands to the afterlife, in one place.
     *
     * GAME_BRIEF.md § Act 1: each death sets the starting state of the afterlife.
     * The base is this death's own weight — violent, sudden, four days of
     * something unfinished in his pocket — and the player's answers move it from
     * there.
     *
     * Attachment and will are a *position*, not a running total, so they are
     * recomputed from the base every time rather than nudged. That is what keeps
     * the handover at `quiet` from overwriting five decisions the player already
     * made: the handover runs this same function, so the two cannot disagree.
     * Karma and harmony are ledger entries and are added once, where the pick is
     * taken.
     */
    function settle(): void {
      let attachment = STARTING_ATTACHMENT;
      let will = 0;
      for (const pick of taken) {
        attachment += pick.attachment;
        will += pick.will;
      }
      context.soul.attachment = clamp01(Math.max(MIN_ATTACHMENT, attachment));
      context.soul.will = clamp01(1 - context.soul.attachment * 0.5 + will);
    }

    /** Take the scene's one exit. Once, and only from a player's click or the grace. */
    function leave(): void {
      if (leaving) {
        return;
      }
      leaving = true;
      void context.takeExit('onward');
    }

    /** Record a pick: the ledger, the run's record, the light, the line. */
    function take(group: string, pick: Pick): void {
      if (answeredAlready.has(group)) {
        return;
      }
      answeredAlready.add(group);
      taken.push(pick);
      if (!context.soul.shards.includes(pick.shard)) {
        context.soul.shards.push(pick.shard);
      }
      context.soul.karma += pick.karma;
      context.soul.harmony += pick.harmony;
      settle();
      if (pick.regard !== undefined) {
        regardGlow.mesh.position.copy(REGARD[pick.regard]);
        regardGlow.mesh.visible = true;
        regardSince = now;
      }
      context.captions.show(pick.caption, 9);
      choices.answered();
    }

    function takeSmell(pick: Pick): void {
      take('smell', pick);
    }

    function takeLetter(pick: Pick): void {
      letterPick = pick;
      take('letter', pick);
    }

    function takeWatch(pick: Pick): void {
      if (pick.id === 'wake-him') {
        wokenEarly = true;
      }
      take('watch', pick);
    }

    function takeKnowing(pick: Pick): void {
      take('knowing', pick);
    }

    function takeCarry(pick: Pick): void {
      take('carry', pick);
      // Every answer leaves, and the copy says so. What they change is what goes.
      leave();
    }

    return {
      update(delta, elapsed) {
        // Wall clock, never accumulated delta: a clamped frame delta makes story
        // time run slow in exact proportion to how bad the frame rate is
        // (CLAUDE.md § Gotchas), and this vignette's whole subject is time.
        director.updateTo(elapsed);
        const { beat, t, index } = director.state;
        now = elapsed;

        // --- the questions, cued on the clock -----------------------------
        //
        // The clock decides when a question is *asked*. It never answers one and
        // no beat passing resolves one: a cue can only enqueue, so if the player
        // is still deciding about the smell of the orchard when the letter's
        // question comes due, that one waits its turn behind it rather than
        // painting over it.
        if (!askedAlready.has('smell') && index >= CUE_AT.smell) {
          askedAlready.add('smell');
          choices.enqueue(() =>
            question(
              'The orchard has a smell to it this morning.',
              'Cold, and wet earth, and something sweet underneath it from whatever is lying under the '
                + 'trees unpicked. It is the fourth morning he has smelled it and this is the morning it '
                + 'gets through.',
              SMELL,
              'The morning waits on him. Nothing here decides this for him.',
              takeSmell,
            ),
          );
        }
        if (!askedAlready.has('letter') && index >= CUE_AT.letter) {
          askedAlready.add('letter');
          choices.enqueue(() =>
            question(
              'The letter is still leaning against the pack.',
              'Four days, and it stops in the middle of a line. He knows exactly what the rest of the '
                + 'line is. He has not been able to put it on paper where somebody could read it.',
              LETTER,
              'It stays where it is until he does something about it. Nothing writes it for him.',
              takeLetter,
            ),
          );
        }
        if (!askedAlready.has('watch') && index >= CUE_AT.watch) {
          askedAlready.add('watch');
          choices.enqueue(() =>
            question(
              'The light is coming up at the end of the rows.',
              'It takes about a minute and it is the only thing that is going to happen this morning. '
                + 'The other man has been asleep under a groundsheet since it was dark.',
              WATCH,
              'The light comes up either way. What he does with it is his.',
              takeWatch,
            ),
          );
        }
        if (!askedAlready.has('knowing') && index >= CUE_AT.knowing) {
          askedAlready.add('knowing');
          choices.enqueue(() =>
            question(
              'He is sitting differently and he does not remember sitting down.',
              'The morning is exactly where it was. The mist has not moved. He has a few seconds of '
                + 'knowing what this is, and whatever he is looking at now is what he takes with him.',
              KNOWING,
              'Nothing here answers for him. The question stays his, however long it takes.',
              takeKnowing,
            ),
          );
        }
        if (!askedAlready.has('carry') && index >= CUE_AT.carry) {
          askedAlready.add('carry');
          choices.enqueue(() =>
            question(
              'He is above the ditch now, and going up.',
              'The orchard is not coming back and neither is the morning. What he takes out of it is the '
                + 'only thing left to decide, and it is the thing that goes across with him.',
              CARRY,
              'None of these happens by itself. All three are the end of the morning, and the difference '
                + 'is only what he is holding when he leaves it.',
              takeCarry,
            ),
          );
        }

        // --- the light coming up ------------------------------------------
        //
        // One monotonic rise through the first four beats, and then it stops
        // mattering, because what fails after that is his perception of it and
        // not the morning. The dawn never stops; he does.
        const dawn = index <= 2
          ? 0.34 + (index === 2 ? t * 0.1 : 0)
          : index === 3
            ? 0.44 + ease.inOut(t) * 0.56
            : 1;
        sky.update(elapsed, dawn);
        setU(dawnGlow.material, 'uIntensity', 0.4 + dawn * 0.75);
        dawnLight.intensity = 0.35 + dawn * 1.0;
        bounce.intensity = 0.62 + dawn * 0.3;

        // --- the crack -----------------------------------------------------
        //
        // Nothing enters the scene and nothing leaves it. No flash, no tracer, no
        // direction, no second light. What changes is that his hearing narrows
        // and the frame stops agreeing with itself (CLAUDE.md § Content rules,
        // and lore bible § 13).
        if (index >= beatIndex('the-crack')) {
          crackAt ??= elapsed;
        }
        const distress = beat.id === 'the-crack'
          ? ease.out(t)
          : index > beatIndex('the-crack')
            ? 1
            : 0;

        // --- out of the body ----------------------------------------------
        // `L-THRESH-03`: the point of view separates and observes from above.
        if (beat.id === 'lifting') {
          apart = ease.inOut(t);
        } else if (beat.id === 'above' || beat.id === 'after') {
          apart = 1;
        }

        if (beat.id === 'sitting-down') {
          bodyDown = ease.inOut(t);
        } else if (index > beatIndex('sitting-down')) {
          bodyDown = 1;
        }

        // The view sinks and the horizon rolls — the body going down, without
        // ever showing a body going down. Then the roll unwinds as the view
        // leaves him, because a rolled horizon is a thing a body has.
        const bodyEye = EYE_SIT + (EYE_DOWN - EYE_SIT) * bodyDown;
        const drift = beat.id === 'above' || beat.id === 'after' ? ease.out(t) : 0;
        context.rig.position.set(
          bodyDown * 0.08,
          bodyEye + (EYE_ABOVE - bodyEye) * apart + drift * 1.9,
          2.0 + apart * 1.6 + drift * 1.3,
        );
        context.rig.setRoll(bodyDown * 0.5 * (1 - apart));
        context.rig.setSway(1 - bodyDown * 0.8 + apart * 0.5);

        // The heartbeat, and the frame tightening with it while there is still a
        // body for it to tighten.
        const bpm = BPM[beat.id] ?? 58;
        const beating = bpm > 0;
        context.audio.heartbeat(beating, Math.max(1, bpm), beat.id === 'quiet' ? 0.46 : 0.3);
        const pulseStrength = index < beatIndex('the-crack')
          ? 0.1
          : beat.id === 'the-crack'
            ? 0.85
            : beat.id === 'sitting-down'
              ? 0.6
              : 0.15;
        const beatPhase = beating ? (elapsed * (bpm / 60)) % 1 : 0;
        context.rig.setPulse(pulseStrength * Math.pow(1 - beatPhase, 6) * (1 - apart));

        // --- perception, not the place ------------------------------------
        //
        // Colour drains toward `dying` as he goes, and then part of the way back
        // toward `outside` as the view leaves him: cold and clinical rather than
        // monochrome, because what is looking is no longer failing.
        const drained = LIVING.drain + (DYING.drain - LIVING.drain) * distress;
        grade.drain = drained + (OUTSIDE.drain - drained) * apart;
        grade.vignette = 0.34 + distress * 0.44 - apart * 0.34;
        grade.aberration = 0.0012 + distress * 0.004 - apart * 0.0034;
        grade.distortion = 0.02 + distress * 0.05 - apart * 0.052;
        grade.grain = LIVING.grain + distress * 0.09 - apart * 0.04;
        grade.exposure = 1.22 - distress * 0.3 + apart * 0.26;
        context.post.setBloom(
          LIVING.bloom + distress * 0.3 + apart * 0.45,
          0.55,
          0.82 - apart * 0.26,
        );
        // The one overtly unreal effect, spent in about two seconds at the moment
        // the morning stops being reachable.
        grade.smear = beat.id === 'the-crack' ? ease.pulse(Math.min(1, t * 3)) * 0.05 : 0;

        // The air loses its high end: sound dropping out, not fading down. Then
        // the ring, which is the first thing that belongs to what comes next
        // (`L-THRESH-02`).
        context.audio.room(Math.max(0, 0.26 - distress * 0.24), 900 - distress * 740);
        context.audio.drone(0.07 + distress * 0.07, 40 - distress * 9);
        if (crackAt === undefined) {
          context.audio.ring(0, 1900);
        } else {
          const since = Math.max(0, elapsed - crackAt);
          context.audio.ring(Math.min(0.2, since * 0.03), 1900 + since * 26);
        }
        context.audio.shimmer(apart * 0.05);

        // --- the place, still going ---------------------------------------
        sky.mesh.position.copy(context.camera.position);
        mist.update(elapsed, context.camera, 0.17 + dawn * 0.12 - apart * 0.04);
        dawnGlow.update(elapsed, context.camera);
        regardGlow.update(elapsed, context.camera);
        motes.drift(delta * (1 - distress * 0.75), elapsed);

        // The other man. He breathes, and then he is awake — either because the
        // player woke him for the light, or because of the crack. What he does
        // when he is awake is lean over, which is as far as this scene goes: he
        // is a shape in a ditch and never a performance.
        const awake = wokenEarly || crackAt !== undefined;
        const breath = Math.sin(elapsed * 0.52) * 0.012;
        sleeper.position.y = FLOOR + 0.3 + breath + (awake ? 0.05 : 0);
        sleeper.rotation.z = awake ? -0.22 : 0;
        sleeper.rotation.y = awake ? 0.3 : 0;

        // What he is looking at, if he has chosen. Comes up over a second and a
        // half so it reads as attention rather than a light being switched on,
        // and goes with the rest of perception.
        if (regardSince !== undefined) {
          const held = Math.min(1, (elapsed - regardSince) / 1.5);
          setU(
            regardGlow.material,
            'uIntensity',
            ease.out(held) * 0.42 * (1 - distress * 0.5) * (1 - apart * 0.7),
          );
        }

        // The letter, once it has gone into the other man's pack. Said with a
        // position rather than with a caption, which is this scene's habit: it
        // is no longer the pale corner in front of him, it is a pale corner
        // three metres away in somebody else's kit, and he can see that it is.
        if (letterPick?.id === 'hand-it-over') {
          letter.position.set(
            sleeper.position.x - 0.26,
            sleeper.position.y + 0.26,
            sleeper.position.z + 0.52,
          );
          letter.rotation.set(-0.9, 0.4, 0.1);
        }

        context.captions.update();

        // The death sets the opening state of the afterlife, once, as it ends.
        //
        // The same function the picks use, so a player who answered everything
        // keeps what they decided and a player who answered nothing still hands
        // over this death's own weight — which for this death is heavy, because
        // the brief says a violent death begins heavy.
        if (!handedOver && index >= beatIndex('quiet')) {
          handedOver = true;
          settle();
        }

        // The exit is live from the first frame: the player is never held here.
        // And if they do nothing, the scene lets go on their behalf rather than
        // leaving them sitting over a dead orchard past the three-minute mark.
        //
        // The grace takes the scene's exit. It never answers a question: a player
        // who leaves this way arrives with this death's own weight and nothing
        // they chose, because they chose nothing. Which is also why the last
        // question is cued at `lifting` and not here — it is live for
        // twenty-four seconds of authored time before the grace clock starts, so
        // going by yourself is the ordinary way out of this morning and the timer
        // is only the floor under a player who has stopped answering.
        if (beat.id === 'after' && t >= 1) {
          context.captions.show('Go on.', 8);
          holdBeganAt ??= elapsed;
          if (elapsed - holdBeganAt >= GRACE_SECONDS) {
            leave();
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
