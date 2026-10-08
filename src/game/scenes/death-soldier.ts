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
import { groundHeave, overpressure } from '../systems/overpressure';
import type { OverlayContent } from '../systems/overlay';

/**
 * Vignette 6 — a soldier, and the blast that takes the ditch he is sitting in.
 *
 * ## The camera rule, which is absolute
 *
 * CLAUDE.md § Content rules and GAME_BRIEF.md § Act 1: "The soldier's death
 * centers the person dying, not the enemy and not the act, and carries no
 * verdict on the war itself. In both, those doing the killing are never the
 * camera's subject." Lore bible § 13 restates it and adds that no source in the
 * file licenses any more detail than the rule allows.
 *
 * A blast makes half of that easier and half of it harder. There is nothing to
 * point a camera at, because nothing that kills this way is ever in the frame —
 * but it takes two men instead of one, and the second one is the hard part,
 * because the obvious ways to show that a man is dead are all forbidden here.
 *
 * How it is honoured, concretely, so it cannot be eroded by a later edit:
 *
 * - **Nothing arrives and nothing is named.** No aircraft, no shell, no mine,
 *   no device, no enemy, and no position for any of them. Not one object is
 *   added to the scene graph at the moment of the blast, and nothing is taken
 *   out of it except the one shape that was a person.
 * - **There is no second light direction, at any point.** `DAWN` is the only
 *   directional source in this scene; it is fixed on the first frame and it is
 *   never touched by the blast. Every bit of the blast's light is spent on
 *   terms that have no direction in them at all: the full-frame wash in the
 *   grade, the hemisphere bounce, bloom, and the mist in the rows going bright.
 *   A light with a direction is a light with a source, and a source is a
 *   perpetrator. `systems/overpressure.ts` says the same thing from the other
 *   end, so the next person to touch either file meets the rule twice.
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
 * ## Death through perception, not gore — for both of them
 *
 * Nothing in this scene is wounded and nothing bleeds. No body is modelled at
 * all. The dying man *is* the camera, so there has never been a body of his to
 * show, and the lift at the end does not look back down.
 *
 * The blast itself is built out of the order the senses report it in, which is
 * the whole of what separates it from a loud gunshot — see
 * `systems/overpressure.ts`, which owns the envelope:
 *
 * 1. **pressure, before sound.** The frame is squeezed: pincushion, the
 *    vignette closing in, exposure dipping, a hard push on the rig. The mix has
 *    not moved yet. A third of a second.
 * 2. **light, arriving first and from everywhere.** Wash, hemisphere, bloom,
 *    and the mist going hot. No direction, no new lamp, no sprite.
 * 3. **the ground itself moving.** A low heave, 2 to 10Hz, carried on the rig's
 *    position and roll, with the loose kit in the ditch going over with it: the
 *    cup, the canteen, the helmet, the shovel, and three of the filled bags off
 *    the lip and into the slot.
 * 4. **hearing that does not come back.** The room tone loses its level *and*
 *    its top, and the ring comes up under it and stays up for the rest of the
 *    scene. `deaf` is the one value in the envelope with no fall in it. The
 *    heartbeat stays audible, because a deafened body still hears that one.
 *
 * Then the treatment rule's remaining moves, as before: colour drains
 * (`living` → `dying`), the view sinks and the horizon rolls, and the camera
 * lifts out and sees the place from above.
 *
 * **The other man is carried entirely by absence.** He is asleep under a
 * groundsheet four feet down the ditch and he is read as a shape, never as a
 * figure. Under the peak of the light the shape stops being a shape: the
 * groundsheet is still there, lying flat and open on the floor of the ditch
 * with nothing under it, and the boot that was sticking out of it is not there
 * either. He is not thrown, not burnt, not marked and not shown — there is
 * simply nobody in the ditch. Everything in the ditch that belonged to *no one*
 * is still in it, jolted about: that contrast is the entire statement, and it
 * is made with one scale and one `visible` flag rather than with a model.
 *
 * The closing aerial carries it into the landscape, because something did
 * happen there. A stretch of the rows beside the ditch has lost its tops — the
 * canopy instances along it are shrunk onto their trunks, with a lateral
 * feather, so from fifteen metres up the orchard has a gap in it that fades
 * back into orchard. The air over it is thinner than it was, because the
 * pressure pushed the mist out of the rows and it is only part way back. The
 * seam of the ditch is no longer clean: the bags are off the lip at one point
 * along it. No scorch, no crater, no mark that could be read as a remain, and
 * still nothing that names what did it.
 *
 * ## Lore
 *
 * - `L-THRESH-02` — the buzzing or ringing that accompanies the transition. In
 *   this version it is not a late arrival: it is what is left of hearing within
 *   a second of the blast, and it is the only voice in the mix afterwards.
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
 * The order the senses report a blast in is a staging decision too, recorded in
 * `systems/overpressure.ts` as one.
 *
 * ## Shape
 *
 * 100 seconds of authored beats, plus a closing hold that lets go by itself
 * after GRACE_SECONDS — 110s for a player who only watches, against the heart
 * attack's 123s. Unchanged by the restaging: the blast occupies exactly the
 * seven seconds the shot used to, because what changed is the grammar inside
 * the beat and not the clock around it. Five questions, cued at 9s, 22s, 36s,
 * 55s and 76s. The first one is live before the tenth second, because the
 * choice is the characterisation: you learn who this man is by deciding what
 * the orchard smells of to him, not by watching him sit in a ditch.
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
const DAWN = new Vector3(0.34, 0.17, -0.92).normalize();

const BEATS: readonly Beat[] = [
  { id: 'cold', seconds: 9, caption: 'The fourth morning in this ditch. The sky is already going.' },
  { id: 'the-orchard', seconds: 13 },
  { id: 'waiting', seconds: 14 },
  { id: 'first-light', seconds: 12 },
  // The blast. Held open rather than cut through: time slowing is the treatment
  // rule's first move, and seven seconds is how this vignette slows it. The
  // sensory ordering inside the first second and a half of it — pressure, then
  // light, then the ground, then hearing going — is `systems/overpressure.ts`,
  // read off the wall clock rather than off this beat's `t`, because quarter-
  // second phases are the first thing a bad frame rate loses.
  { id: 'the-blast', seconds: 7 },
  {
    id: 'sitting-down',
    seconds: 10,
    caption: 'The groundsheet is lying flat, four feet away. There is nothing under it.',
  },
  {
    id: 'quiet',
    seconds: 11,
    caption: 'The sound does not come back. Nobody says anything, and nobody is going to.',
  },
  { id: 'lifting', seconds: 10 },
  {
    id: 'above',
    seconds: 14,
    caption: 'The rows go on much further than he knew. One stretch of them has no tops left.',
  },
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
    trade: 'A house and an unpruned tree. He carries more of it out.',
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
    trade: 'Somebody planted this and meant to pick it. He arrives lighter.',
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
    label: 'Nothing. It smells of an orchard.',
    trade: 'He stopped letting things do that. It keeps him standing.',
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
    trade: 'Out of his hands and into somebody else’s. That is an effect on somebody.',
    caption: 'He tucks it into the top of the other man’s pack and says nothing about it.',
    shard: 'soldier.handed-it-over',
    attachment: -0.08,
    harmony: 1,
    will: 0.04,
    karma: 1,
    regard: 'sleeper',
  },
  {
    id: 'finish-it',
    label: 'Finish the line',
    trade: 'Nobody may ever read it. He will have said it.',
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
    trade: 'He would rather say it to her face. It goes with him unsaid.',
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
    label: 'Wake him for it',
    trade: 'Somebody else sees it. Two men awake for the same light.',
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
    trade: 'Two nights awake. A kindness nobody will know was done.',
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
    trade: 'They go past where he can see. His hands stay empty.',
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
 * sequence, and nothing in it looks for what did this, because the scene does
 * not contain it and a question that searched for it would put it in the scene.
 * Whatever he is looking at is what he is still holding.
 *
 * Asked after the blast, so the ditch it is asked in has nobody else in it.
 * That is why the third answer is a voice with no source rather than the man
 * who was asleep beside him: the man is gone, and the option saying so plainly
 * is the one place in the questions where the absence is named.
 */
const KNOWING: readonly Pick[] = [
  {
    id: 'the-sky',
    label: 'The strip of sky over the rows',
    trade: 'Going grey to a colour. Nothing out there is owed him.',
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
    trade: 'The heaviest thing here, and the one he would stay for.',
    caption: 'A pale corner, wherever it ended up. He is looking at it the way you look at a door.',
    shard: 'soldier.looked-at-the-letter',
    attachment: 0.16,
    harmony: 0,
    will: 0.06,
    karma: 0,
    regard: 'letter',
  },
  {
    id: 'the-voice',
    label: 'Whatever is talking close to his ear',
    trade: 'He cannot make out a word of it. There is nobody there to be saying it.',
    caption: 'Something is right at his ear, saying the same short thing over and over. The ditch is empty.',
    shard: 'soldier.heard-the-voice',
    attachment: 0.08,
    harmony: 1,
    will: 0.02,
    karma: 0,
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
    trade: 'He arrives light, with his hands open.',
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
    trade: 'None of it stays. The holding does.',
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
    trade: 'The rows, the mist, the smell. The last ordinary thing.',
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
 * first-light 36, the-blast 48, sitting-down 55, quiet 65, lifting 76,
 * above 86, after 100. So the five are cued at 9s, 22s, 36s, 55s and 76s, and
 * the first is live before the tenth second.
 *
 * The longest stretch with nothing to decide is the 21 seconds from the fourth
 * question to the fifth, and it is deliberate: it is the blast, the body going
 * down, and the ditch going silent — the one stretch this vignette has to show
 * rather than ask about, and the stretch in which the other man stops being in
 * the ditch. A dialog over it would take the player's eyes off the only thing
 * those beats contain. Everything before it is 9, 13, 14 and 19 seconds apart,
 * and the last question is live from the lift onward.
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
): {
  mesh: Mesh;
  material: ShaderMaterial;
  update(elapsed: number, dawn: number, flash: number): void;
} {
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
        /**
         * The blast, in the sky.
         *
         * The sky dome is the largest surface in frame and it is lit by
         * nothing — it is its own shader — so it is the one thing a
         * hemisphere light cannot reach, and the one thing that has to be
         * told separately that the morning has gone white. Without this the
         * frame keeps a dark sky over a lit ditch, which reads as a lamp
         * switched on in a field rather than as light arriving.
         *
         * Deliberately has no direction in it: it is added to the whole dome
         * at once, including the half the dawn is not in. It is modulated by
         * the dome's own haze so the sky going white is still an image and
         * not a flat rectangle.
         */
        uFlash: { value: 0 },
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
        uniform float uFlash;
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

          // The whole dome goes, at once, in every direction. Carried on the
          // haze so it keeps its structure instead of becoming a flat field,
          // and very slightly stronger low down, which is where air is.
          float low = 1.12 - 0.3 * clamp(h, 0.0, 1.0);
          color += vec3(1.0, 0.96, 0.9) * uFlash * low * (0.7 + churn * 0.62);

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
    update(elapsed, dawn, flash) {
      setU(material, 'uTime', elapsed);
      setU(material, 'uDawn', dawn);
      setU(material, 'uFlash', flash);
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
): {
  meshes: Mesh[];
  update(elapsed: number, camera: Camera, level: number): void;
  /**
   * Push the air out of the rows, as a fraction of the full shove.
   *
   * Pressure has to be something the *world* does, not only something the
   * grade does, or the whole blast is a camera effect. These are the largest
   * movable bodies in the scene, so when they all leave the rows at once —
   * outward from the ditch, upward, and away down the field — the frame has
   * visibly been pushed. Measured from each body's home, so it is a
   * displacement and not a drift: at 0 everything is exactly where it was
   * authored.
   */
  shove(amount: number): void;
} {
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
          float churn = fbm(p, 3);
          float density = smoothstep(0.2, 0.62, churn) * edge * uLevel;

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
  const homes = options.places.map((place) => place.clone());
  let shoved = -1;
  return {
    meshes,
    update(elapsed, camera, level) {
      setU(material, 'uTime', elapsed);
      setU(material, 'uLevel', level);
      for (const mesh of meshes) {
        mesh.quaternion.copy(camera.quaternion);
      }
    },
    shove(amount) {
      // Nothing to do on the hundreds of frames either side of the blast.
      if (amount === shoved) {
        return;
      }
      shoved = amount;
      for (let index = 0; index < meshes.length; index += 1) {
        const mesh = meshes[index];
        const home = homes[index];
        if (!mesh || !home) {
          continue;
        }
        const out = home.x >= 0 ? 1 : -1;
        mesh.position.set(
          home.x + out * amount * 7.5,
          home.y + amount * 3.4,
          home.z - amount * 5.5,
        );
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
 *
 * Returns `stripNear`, which takes the tops off the trees along a stretch of the
 * rows: it rewrites the canopy instance matrices in place, once, shrinking each
 * canopy onto its own trunk with a lateral feather so the gap fades back into
 * orchard rather than ending at a line. That is the closing aerial's only
 * evidence that anything happened in the ditch, and it is deliberately the
 * *absence* of canopy and nothing else — no scorch, no colour change, no mark
 * that a player could read as a remain. The per-instance transforms are kept in
 * one flat `Float32Array` so the rewrite needs no stored objects and no second
 * pass of the seeded stream.
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
): {
  trunks: InstancedMesh;
  canopies: InstancedMesh;
  count: number;
  /**
   * The two materials the orchard is drawn with, so the scene can make them
   * emit along with everything else under the blast's light. The rows fill
   * the middle of the frame; a blast that lit the ditch and left the orchard
   * in silhouette would be a lamp in a hole, not light arriving.
   */
  materials: readonly MeshStandardMaterial[];
  /** Take the tops off the trees along `fromZ`..`toZ`, feathered in x. */
  stripNear(options: {
    readonly fromZ: number;
    readonly toZ: number;
    readonly halfWidth: number;
    readonly feather: number;
  }): void;
} {
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
    new MeshStandardMaterial({
      color: 0x6b5839,
      roughness: 0.93,
      metalness: 0,
      emissive: 0x6b5839,
      emissiveIntensity: 0,
    }),
  );
  const canopyGeometry = tracker.track(new IcosahedronGeometry(1, 1));
  const canopyMaterial = tracker.track(
    new MeshStandardMaterial({
      color: 0x5a6a48,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      emissive: 0x5a6a48,
      emissiveIntensity: 0,
    }),
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

  /**
   * Every canopy's transform, flat: position (3), quaternion (4), scale (3).
   *
   * `stripNear` has to recompose a matrix it did not build, and reading it back
   * out of `instanceMatrix` would mean decomposing 400-odd matrices. Ten floats
   * per tree is 16KB for the whole orchard and costs one store in a loop that
   * was already running.
   */
  const CANOPY_STRIDE = 10;
  const canopyTransforms = new Float32Array(count * CANOPY_STRIDE);

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

    const at = index * CANOPY_STRIDE;
    canopyTransforms[at] = position.x;
    canopyTransforms[at + 1] = position.y;
    canopyTransforms[at + 2] = position.z;
    canopyTransforms[at + 3] = rotation.x;
    canopyTransforms[at + 4] = rotation.y;
    canopyTransforms[at + 5] = rotation.z;
    canopyTransforms[at + 6] = rotation.w;
    canopyTransforms[at + 7] = scale.x;
    canopyTransforms[at + 8] = scale.y;
    canopyTransforms[at + 9] = scale.z;
  }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;

  return {
    trunks,
    canopies,
    count,
    materials: [trunkMaterial, canopyMaterial],
    stripNear(options) {
      for (let index = 0; index < count; index += 1) {
        const at = index * CANOPY_STRIDE;
        const x = canopyTransforms[at] ?? 0;
        const y = canopyTransforms[at + 1] ?? 0;
        const z = canopyTransforms[at + 2] ?? 0;

        // Along the ditch: inside the stretch, or feathered off either end.
        const alongDepth = Math.min(options.fromZ - z, z - options.toZ);
        const along = Math.min(1, Math.max(0, alongDepth / options.feather));
        // Across it: full at the ditch, feathered out through the rows.
        const acrossDepth = options.halfWidth - Math.abs(x);
        const across = Math.min(1, Math.max(0, acrossDepth / options.feather));
        const inside = along * across;
        if (inside <= 0) {
          continue;
        }

        // 1 means nothing left but a stub on the trunk; the feather leaves the
        // trees at the edge of the stretch merely thinned.
        const keep = 1 - inside * 0.9;
        const scaleY = (canopyTransforms[at + 8] ?? 1) * keep;
        scale.set((canopyTransforms[at + 7] ?? 1) * keep, scaleY, (canopyTransforms[at + 9] ?? 1) * keep);
        rotation.set(
          canopyTransforms[at + 3] ?? 0,
          canopyTransforms[at + 4] ?? 0,
          canopyTransforms[at + 5] ?? 0,
          canopyTransforms[at + 6] ?? 1,
        );
        // Drop what is left onto the top of its own trunk rather than leaving it
        // floating where the middle of the canopy used to be.
        position.set(x, y - ((canopyTransforms[at + 8] ?? 1) - scaleY) * 0.8, z);
        matrix.compose(position, rotation, scale);
        canopies.setMatrixAt(index, matrix);
      }
      canopies.instanceMatrix.needsUpdate = true;
    },
  };
}

export const deathSoldierScene: SceneDefinition = {
  id: 'death.soldier',
  title: 'Fourth morning',
  exits: [{ id: 'onward', label: 'Go on', to: 'threshold.pronounced-dead' }],
  contentNotes: [
    'A soldier dies in a blast, shown from inside his own perception. There is no wound and no blood, and his '
      + 'body is never shown: pressure, then light from everywhere, then the ground moving, then hearing that '
      + 'does not come back — and the view lifts out of him.',
    'A second man, asleep a few feet away, is killed by the same blast. He is never shown hurt, marked or dead. '
      + 'What the scene shows is an empty groundsheet and a ditch with nobody in it.',
    'Nothing that caused the blast is ever seen, named or placed. No weapon is modelled, no war is named, and '
      + 'the vignette takes no side and passes no verdict.',
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
    //
    // Two things are asked of every one of these and they pull in opposite
    // directions, so they are set together rather than one at a time.
    //
    // **It has to be visible before anything happens.** An earlier pass
    // repitched this ditch as pre-dawn after finding it unlit, and the pitch
    // is right — but the ditch is a slot a metre deep and nothing in the sky
    // reaches the bottom of it at a grazing angle. Rendered and measured, the
    // opening beats came back at mean luma 7 of 255, with the letter, the cup
    // and the helmet — the three objects the first two questions are *about* —
    // indistinguishable from the floor they are lying on. So every albedo in
    // the ditch is lifted to roughly what cut earth and dusty kit actually
    // return, and the hemisphere that stands in for the sky is lifted with it.
    // Brighter paint, not a brighter grade: the sky, the dawn band and the
    // silhouette of the rows against them are the composition and are untouched.
    //
    // **It has to go hot, from no direction, at the blast.** Each one carries
    // its own colour as its emissive and sits at zero intensity until then.
    // Emission is the only light in three.js with no position and no vector in
    // it at all, which makes it the safest thing in this scene to spend the
    // blast on (CLAUDE.md § Content rules: a light with a direction is a light
    // with a source, and a source is a perpetrator). Because each surface
    // emits *its own colour*, the ditch keeps its structure while it goes
    // white instead of flattening into one rectangle — which is also what
    // keeps the frame inside the gate's clipping bound at the peak.
    const earthMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0x9a846a,
        roughness: 0.97,
        metalness: 0,
        emissive: 0x9a846a,
        emissiveIntensity: 0,
      }),
    );
    const cutEarthMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0x8d7757,
        roughness: 0.98,
        metalness: 0,
        emissive: 0x8d7757,
        emissiveIntensity: 0,
      }),
    );
    const bagMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0xa2926f,
        roughness: 0.96,
        metalness: 0,
        emissive: 0xa2926f,
        emissiveIntensity: 0,
      }),
    );
    const clothMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0x8b8468,
        roughness: 0.95,
        metalness: 0,
        emissive: 0x8b8468,
        emissiveIntensity: 0,
      }),
    );
    const metalMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0xb9c0c6,
        roughness: 0.52,
        metalness: 0.4,
        emissive: 0xb9c0c6,
        emissiveIntensity: 0,
      }),
    );
    /**
     * The groundsheet, on its own material rather than sharing `clothMaterial`.
     *
     * It has to read twice and both times it is the only thing in frame that
     * matters: as a shape with somebody under it, and then as a flat sheet with
     * nobody under it. At `clothMaterial`'s value it sat four metres away
     * against a ditch floor only a shade darker, and a change of silhouette
     * against no contrast is a change nobody sees. Lighter, cooler, and less
     * rough, so the raking dawn finds it.
     */
    const sheetMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0xaab09b,
        roughness: 0.68,
        metalness: 0.04,
        emissive: 0xaab09b,
        emissiveIntensity: 0,
      }),
    );
    const paintedMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0x7b8369,
        roughness: 0.82,
        metalness: 0.12,
        emissive: 0x7b8369,
        emissiveIntensity: 0,
      }),
    );
    const paperMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0xd4c9b2,
        roughness: 0.99,
        metalness: 0,
        // A touch of self-lit warmth. The letter is the heaviest object in the
        // ditch and it must not disappear into the shadow at the bottom of it.
        // Its intensity is driven, like every other material here, but from a
        // base of 1 rather than 0: it is lit before the blast and it does not
        // stop being lit by it.
        emissive: 0xa98a56,
        emissiveIntensity: 1,
      }),
    );

    /**
     * Everything the blast's light is allowed to touch directly.
     *
     * One flat list, driven by one number, so "from everywhere" is literally
     * what the code does rather than a claim in a comment: every surface in
     * the frame is in here, and nothing in here has a position that the light
     * could be said to come from.
     *
     * The letter is not in it. It is the one material with a standing
     * emissive and it is driven from its own base a few lines below, so that
     * this list can stay a plain "set them all to the same number".
     */
    const flashable: MeshStandardMaterial[] = [
      earthMaterial,
      cutEarthMaterial,
      bagMaterial,
      clothMaterial,
      metalMaterial,
      sheetMaterial,
      paintedMaterial,
    ];

    // --- sky ---------------------------------------------------------------
    const sky = preDawnSky(resources, {
      radius: 120,
      horizon: 0x44536b,
      zenith: 0x1a2340,
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
    const FIELD = 520;

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
    /** Kept, because three of them go off the lip when the ground moves. */
    const bags: Mesh[] = [];
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
      bags.push(bag);
    }

    // --- the orchard -------------------------------------------------------
    const trees = orchard(resources, rng.stream('orchard'), {
      // Nine rows either side of the ditch, 3.4m apart, none of them closer to
      // it than 2.6m — the ditch is the gap down the middle of the block.
      rows: [-29.8, -26.4, -23.0, -19.6, -16.2, -12.8, -9.4, -6.0, -2.6, 2.6, 6.0, 9.4, 12.8, 16.2, 19.6, 23.0, 26.4, 29.8],
      from: 8,
      to: -104,
      spacing: 5,
    });
    place.add(trees.trunks);
    place.add(trees.canopies);
    flashable.push(...trees.materials);

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
     *
     * He is built as a shape *so that he can stop being one*. The blast takes
     * him, and the whole of how that is shown is this group changing: the
     * capsule flattens into an open groundsheet on the floor of the ditch and
     * the boot stops being drawn. There is no second model, no "after" variant,
     * and nothing is added. See `consume` — CLAUDE.md § Content rules forbids a
     * body as spectacle, and the cheapest way to obey that is to have nothing
     * that could become one.
     */
    const sleeper = new Group();
    const sheetGeometry = resources.track(new CapsuleGeometry(0.3, 1.1, 5, 12));
    const sheet = new Mesh(sheetGeometry, sheetMaterial);
    sheet.rotation.x = Math.PI / 2;
    sleeper.add(sheet);
    const bootGeometry = resources.track(new BoxGeometry(0.14, 0.13, 0.26));
    const boot = new Mesh(bootGeometry, paintedMaterial);
    boot.position.set(-0.12, -0.14, 0.78);
    boot.rotation.set(0.2, 0.3, 0);
    sleeper.add(boot);
    sleeper.position.set(0.14, FLOOR + 0.3, -2.7);
    place.add(sleeper);

    // --- what the ground does to the kit ------------------------------------
    //
    // The ground itself moving is half the grammar of a blast, and a camera that
    // moves while nothing in frame does reads as a camera fault. So the loose
    // kit goes over with it: the cup, the canteen, the helmet, the shovel, and
    // three of the filled bags off the lip and into the slot.
    //
    // Every destination is drawn here, once, off the seeded stream
    // (CLAUDE.md § Testability) and then reached by lerping from the clock — so
    // two runs on one seed put the cup in the same place, and nothing in the
    // frame snaps.
    //
    // Note what is NOT in this list: nothing of the other man's. Everything that
    // belonged to nobody is still in the ditch afterwards, knocked about.
    interface Heaved {
      readonly mesh: Mesh;
      readonly from: Vector3;
      readonly to: Vector3;
      readonly fromRotation: Vector3;
      readonly toRotation: Vector3;
    }
    const heaved: Heaved[] = [];
    const heaveRng = rng.stream('heave');
    function heave(mesh: Mesh, offset: Vector3, spin: Vector3): void {
      heaved.push({
        mesh,
        from: mesh.position.clone(),
        to: mesh.position.clone().add(offset),
        fromRotation: new Vector3(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z),
        toRotation: new Vector3(
          mesh.rotation.x + spin.x,
          mesh.rotation.y + spin.y,
          mesh.rotation.z + spin.z,
        ),
      });
    }

    // The cup he was holding, over on its side and along the floor.
    heave(
      cup,
      new Vector3(heaveRng.range(-0.3, -0.12), -0.014, heaveRng.range(0.14, 0.34)),
      new Vector3(Math.PI / 2 + heaveRng.range(-0.3, 0.3), heaveRng.range(-1, 1), 0),
    );
    // The canteen, rolling.
    heave(
      canteen,
      new Vector3(heaveRng.range(0.1, 0.26), 0, heaveRng.range(0.2, 0.44)),
      new Vector3(0, 0, heaveRng.range(1.8, 3.2)),
    );
    // The helmet and its rim, skidding together, so they stay one object.
    const helmetSkid = new Vector3(heaveRng.range(0.16, 0.34), 0, heaveRng.range(-0.3, -0.1));
    heave(helmet, helmetSkid, new Vector3(0, heaveRng.range(-1.2, 1.2), heaveRng.range(-0.5, 0.5)));
    heave(rim, helmetSkid.clone(), new Vector3(0, 0, heaveRng.range(-0.2, 0.2)));
    // The shovel, down flat.
    heave(shaft, new Vector3(0.1, -0.44, 0.12), new Vector3(Math.PI / 2 - 0.3, 0, -0.5));
    heave(blade, new Vector3(0.14, 0, 0.1), new Vector3(0.2, 0, -0.4));
    // Three bags off the lip at one point along it, which is what breaks the
    // clean seam the closing aerial used to show.
    for (const index of [6, 7, 8] as const) {
      const bag = bags[index];
      if (!bag) {
        continue;
      }
      heave(
        bag,
        new Vector3(
          -bag.position.x + heaveRng.range(-0.34, 0.34),
          FLOOR + 0.09 - bag.position.y,
          heaveRng.range(-0.3, 0.3),
        ),
        new Vector3(heaveRng.range(-0.6, 0.6), heaveRng.range(-0.9, 0.9), heaveRng.range(-0.8, 0.8)),
      );
    }

    // --- mist and air ------------------------------------------------------
    const mist = mistBodies(resources, {
      size: 17,
      color: 0x9fb2c6,
      // Three, not five. Each is a wide additive quad running an fbm per
      // fragment, which is the most expensive thing in this frame on a software
      // rasteriser, and three read as mist in the rows just as well.
      places: [
        new Vector3(-6.2, 1.4, -12),
        new Vector3(6.8, 1.9, -24),
        new Vector3(-3.0, 2.3, -40),
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

    const dawnLight = new DirectionalLight(0xffc294, 0.5);
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
    // Before sunrise the sky dome IS the light: the sun is not up, so almost
    // everything on the ground is lit by a big dim blue hemisphere and only
    // grazed by the band at the horizon. Pitched as a night scene first, which
    // put the whole lower half of the frame — the ditch, and therefore every
    // object the questions are about — at zero.
    //
    // Lifted from 2.0 to 3.6, and the earth half of it warmed and lifted with
    // it, after the opening beats were measured at mean luma 7 of 255 with
    // the kit invisible. The hemisphere is the only source in this scene that
    // reaches the floor of a metre-deep slot at all, because the one
    // directional light is a grazing dawn that the ditch's own lip cuts off.
    const bounce = new HemisphereLight(0x8fa8c8, 0x6a5742, 3.6);
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
    const EYE_DOWN = -0.1;
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
    grade.vignette = 0.22;
    grade.aberration = 0.0012;
    grade.distortion = 0.02;
    grade.exposure = 1.4;
    /**
     * What the blast's light washes the frame toward.
     *
     * Set here rather than left at the pipeline's default, because the grade is
     * shared and the previous scene's wash colour would otherwise decide what
     * this one's light looks like. Warm-white and barely tinted: a blast is not
     * a colour, and a colour would make it read as a lamp somewhere.
     */
    grade.washColor = [1, 0.95, 0.88];
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
      'the-blast': 128,
      'sitting-down': 112,
      quiet: 38,
      lifting: 0,
      above: 0,
      after: 0,
    };

    let bodyDown = 0;
    let apart = 0;
    let handedOver = false;
    /**
     * Wall-clock, never accumulated delta: the whole sensory envelope, the ring
     * and the grace all read it. The envelope's phases are tenths of a second
     * apart, so a timeline driven by clamped frame deltas would reorder them on
     * a slow machine — which is the clock gotcha in CLAUDE.md with the stakes
     * raised, because here the ordering *is* the content.
     */
    let blastAt: number | undefined;
    let holdBeganAt: number | undefined;
    let leaving = false;
    let now = 0;
    let regardSince: number | undefined;
    /** What attention is on, so it can be taken off a thing that is gone. */
    let regardAt: RegardId | undefined;
    /** How far the kit has finished going over. 0..1, from the clock. */
    let heaveSettled = 0;
    /** The last drone the mix was actually asked for. See the audio block. */
    let droneAt = { level: 0.07, base: 40 };

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
    /**
     * Whether the other man is awake. He wakes only if the player wakes him for
     * the light; the blast does not wake anybody, because there is no interval
     * between it and him in which to be awake.
     */
    let wokenEarly = false;
    /** Whether the blast has already taken him. See `consume`. */
    let consumed = false;

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

    /**
     * The other man, and the stretch of orchard beside him.
     *
     * Runs once, under the peak of the light, and it is the whole of how this
     * scene says that the blast took both of them. It is all absence:
     *
     * - The groundsheet is still in the ditch. It is lying flat and open on the
     *   floor with nothing under it, which is one scale and one position. The
     *   boot that was sticking out of it stops being drawn.
     * - The letter, *if the player put it in his pack*, is on the floor of the
     *   ditch, because his pack went where he went. The pale corner is still
     *   somewhere, and it is not with anybody.
     * - A stretch of the rows loses its tops, which is the closing aerial's
     *   only evidence and is landscape rather than aftermath.
     *
     * What is NOT here: a body, a wound, blood, a mark, a scorch, a crater, a
     * remain, or anything thrown. Nothing is added to the scene and the only
     * thing removed is the one shape that was a person. CLAUDE.md § Content
     * rules, which is absolute, and the strongest version of it is what is not
     * there afterwards.
     */
    function consume(): void {
      if (consumed) {
        return;
      }
      consumed = true;

      // Flat and open on the floor. The capsule's own axis is its local Y and
      // the mesh is already turned a quarter so that axis lies along the ditch,
      // which puts local Z vertical — so flattening is one number.
      sleeper.position.set(0.1, FLOOR + 0.03, -2.84);
      sleeper.rotation.set(0, 0.24, 0);
      sheet.scale.set(1.3, 0.94, 0.1);
      boot.visible = false;

      if (letterPick?.id === 'hand-it-over') {
        letter.position.set(-0.24, FLOOR + 0.004, -2.18);
        letter.rotation.set(-Math.PI / 2, 0, 0.7);
      }

      // The gap in the canopy runs along the ditch and feathers out through the
      // rows. Deliberately a *stretch* and not a point: a point would be the
      // place the thing landed, and this scene does not have one of those.
      // Tuned against the closing aerial, not against the ground view: from
      // fifteen metres up the frame's lower edge is already twenty metres down
      // the rows, so a gap that stopped at the ditch would be behind the camera
      // by the time anybody could see it. It follows the seam instead — a bare
      // corridor two or three rows wide either side of the ditch, feathering
      // out into orchard at both ends and both sides.
      trees.stripNear({ fromZ: 18, toZ: -36, halfWidth: 13, feather: 9 });
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
        regardAt = pick.regard;
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
              'The orchard smells of something this morning.',
              'Cold earth, and something sweet under it from the fruit nobody came for.',
              SMELL,
              'The morning waits on him. Nothing here decides it.',
              takeSmell,
            ),
          );
        }
        if (!askedAlready.has('letter') && index >= CUE_AT.letter) {
          askedAlready.add('letter');
          choices.enqueue(() =>
            question(
              'The letter is still leaning against the pack.',
              'It stops in the middle of a line. He knows the rest of the line and cannot put it down.',
              LETTER,
              'It stays where it is until he moves it. Nothing writes it for him.',
              takeLetter,
            ),
          );
        }
        if (!askedAlready.has('watch') && index >= CUE_AT.watch) {
          askedAlready.add('watch');
          choices.enqueue(() =>
            question(
              'The light is coming up at the end of the rows.',
              'It takes a minute, and it is the only thing happening. The other man has been asleep since dark.',
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
              'He is sitting differently and does not remember sitting down.',
              'The morning is exactly where it was. The mist has not moved. Whatever he is looking at now '
                + 'is what he takes with him.',
              KNOWING,
              'Nothing here answers for him, however long it takes.',
              takeKnowing,
            ),
          );
        }
        if (!askedAlready.has('carry') && index >= CUE_AT.carry) {
          askedAlready.add('carry');
          choices.enqueue(() =>
            question(
              'He is above the ditch now, and going up.',
              'The morning is not coming back. What he takes out of it is the only thing left to decide.',
              CARRY,
              'All three end the morning. The difference is only what he is holding.',
              takeCarry,
            ),
          );
        }

        // --- the blast -----------------------------------------------------
        //
        // Nothing enters the scene. No flash object, no tracer, no direction, no
        // second light, nothing with a position. The directional dawn is not
        // touched. What happens is four senses reporting in their own order
        // (`systems/overpressure.ts`), and then one shape in the ditch no longer
        // being there (`consume`). CLAUDE.md § Content rules, lore bible § 13.
        if (index >= beatIndex('the-blast')) {
          blastAt ??= elapsed;
        }
        // Wall-clock seconds since it happened. `overpressure` returns a morning
        // with nothing wrong with it for anything at or before zero, so this is
        // safe to read on every frame of the scene.
        const since = blastAt === undefined ? 0 : elapsed - blastAt;
        const blast = overpressure(since);

        // Inside the plateau of the light — `whiteout` is at 1 from 0.12s to
        // 0.42s — which is the only stretch of this scene where the frame is
        // too bright to resolve what is in it. He is a shape before it and he
        // is not there after it, and no frame exists in which he is becoming
        // anything.
        if (blastAt !== undefined && !consumed && since >= 0.22) {
          consume();
        }

        // The kit going over with the ground.
        //
        // Fast: 0.42 seconds end to end, not the second and a quarter it took
        // before. Nothing is pushed over gently by a blast, and at the frame
        // rate this renders at a slow settle spends its whole budget looking
        // like a physics step — by the time the light has cleared, everything
        // loose has already finished moving, which is what the eye expects.
        // The curve is a hard start that decelerates, with a short hop on the
        // way so the lighter things leave the floor rather than sliding.
        // Stops touching anything once it has settled, so the rest of the
        // vignette costs nothing for it.
        if (blastAt !== undefined && heaveSettled < 1) {
          const u = Math.min(1, since / 0.42);
          heaveSettled = 1 - Math.pow(1 - u, 3);
          const hop = Math.sin(Math.PI * u) * 0.16;
          for (const item of heaved) {
            item.mesh.position.lerpVectors(item.from, item.to, heaveSettled);
            item.mesh.position.y += hop;
            item.mesh.rotation.set(
              item.fromRotation.x + (item.toRotation.x - item.fromRotation.x) * heaveSettled,
              item.fromRotation.y + (item.toRotation.y - item.fromRotation.y) * heaveSettled,
              item.fromRotation.z + (item.toRotation.z - item.fromRotation.z) * heaveSettled,
            );
          }
          if (u >= 1) {
            heaveSettled = 1;
          }
        }

        // The slow curve the rest of the beat rides: colour, vignette, grain.
        // Separate from the envelope on purpose — the envelope is the first
        // second and a half, and this is the seven seconds around it.
        const distress = beat.id === 'the-blast'
          ? ease.out(t)
          : index > beatIndex('the-blast')
            ? 1
            : 0;

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
        // The sky dome goes with it. The largest surface in frame is lit by
        // nothing but its own shader, so if it is not told, the blast is a lamp
        // in a hole under a night sky.
        sky.update(elapsed, dawn, blast.light * 0.8);
        // The dawn's two directional terms are untouched by the blast, which is
        // the content rule in the lighting: no second direction, ever.
        setU(dawnGlow.material, 'uIntensity', (0.4 + dawn * 0.75) * (1 - apart * 0.5));
        dawnLight.intensity = 0.5 + dawn * 1.15;
        // The hemisphere is one of the places the blast's light goes, because a
        // hemisphere has no direction in it at all: it lights the ditch walls,
        // the bags, the trunks and the groundsheet from every side at once,
        // which is part of what "from everywhere" has to mean to be safe.
        bounce.intensity = 3.6 + dawn * 0.6 + blast.light * 7.5;
        // And every surface in the scene emits its own colour at once, which
        // is the rest of it. This is the term that actually kills the shadows:
        // a hemisphere still shades by normal, and a frame that keeps its
        // shading keeps its sense of where its light is coming from. Driven as
        // one number over one flat list — see `flashable`.
        const emitting = blast.light * 1.12;
        for (const material of flashable) {
          material.emissiveIntensity = emitting;
        }
        // The letter is lit before the blast and is not un-lit by it.
        paperMaterial.emissiveIntensity = 1 + emitting;

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
        // The ground itself moving, for about three seconds. Carried on the
        // rig's position rather than on a new shake API: the scene already owns
        // this transform every frame, the rig's own look stays entirely the
        // player's (it is never re-aimed), and `groundHeave` is continuous, so
        // it cannot pop between frames at any frame rate.
        const heaveNow = groundHeave(since, blast.ground, 0.17);
        // The pressure, as one shove rather than as a shake. The oscillation
        // above is the ground still going; this is the front arriving, and it
        // is a single direction for a fifth of a second — down into the slot
        // and back against the wall behind him. It reads at any frame rate,
        // which an 8Hz wobble does not: at three frames a second an
        // oscillation is three unrelated tilts, and a lurch is still a lurch.
        const slam = blast.press;
        context.rig.position.set(
          bodyDown * 0.08 + heaveNow.x,
          bodyEye + (EYE_ABOVE - bodyEye) * apart + drift * 1.9 + heaveNow.y - slam * 0.3,
          2.0 + apart * 1.6 + drift * 1.3 + heaveNow.z + slam * 0.44,
        );
        context.rig.setRoll(bodyDown * 0.5 * (1 - apart) + heaveNow.roll);
        context.rig.setSway(1 - bodyDown * 0.8 + apart * 0.5);

        // The heartbeat, and the frame tightening with it while there is still a
        // body for it to tighten.
        const bpm = BPM[beat.id] ?? 58;
        const beating = bpm > 0;
        context.audio.heartbeat(beating, Math.max(1, bpm), beat.id === 'quiet' ? 0.46 : 0.3);
        const pulseStrength = index < beatIndex('the-blast')
          ? 0.1
          : beat.id === 'the-blast'
            ? 0.85
            : beat.id === 'sitting-down'
              ? 0.6
              : 0.15;
        const beatPhase = beating ? (elapsed * (bpm / 60)) % 1 : 0;
        // The press rides on top of the heartbeat's own push, because it is the
        // same thing happening to the same chest, and it arrives before
        // anything else in the scene has moved.
        context.rig.setPulse(
          clamp01(pulseStrength * Math.pow(1 - beatPhase, 6) * (1 - apart) + blast.press * 0.9),
        );

        // --- perception, not the place ------------------------------------
        //
        // Colour drains toward `dying` as he goes, and then part of the way back
        // toward `outside` as the view leaves him: cold and clinical rather than
        // monochrome, because what is looking is no longer failing.
        const drained = LIVING.drain + (DYING.drain - LIVING.drain) * distress;
        // Colour is the first thing the light takes. Not a stylistic drain —
        // a frame this far over has no colour left to report.
        grade.drain = clamp01(drained + (OUTSIDE.drain - drained) * apart + blast.light * 0.42);
        // The press closes the frame in and squeezes it; the light opens it out
        // again, because light from everywhere has no corner to fall off into.
        grade.vignette = clamp01(
          0.22 + distress * 0.36 - apart * 0.2 + blast.press * 0.6 - blast.light * 0.24,
        );
        grade.aberration = 0.0012 + distress * 0.004 - apart * 0.0034
          + Math.max(blast.press, blast.light) * 0.0055;
        // Pincushion first — the world pulled inward, which is what pressure
        // does to a frame — and then a bulge under the light.
        grade.distortion = 0.02 + distress * 0.05 - apart * 0.052 - blast.press * 0.14 + blast.light * 0.05;
        grade.grain = LIVING.grain + distress * 0.09 - apart * 0.04 + blast.deaf * 0.025;
        grade.exposure = (1.4 - distress * 0.18 + apart * 0.02) * (1 - blast.press * 0.34)
          + blast.light * 0.13;
        // The light itself: a full-frame wash and bloom, and nothing with a
        // position.
        //
        // Deliberately the *smallest* of the four omnidirectional terms rather
        // than the largest, even though it is the bluntest. A wash is added
        // equally to every pixel, so a blast carried mostly on the wash is a
        // blast that flattens the image: structure goes, and with it both the
        // gate's std bound and the thing that makes a white frame read as the
        // world being overwhelmed rather than as a cut to white. The frame
        // goes white here mostly because the ditch, the rows and the sky are
        // each independently too bright to resolve, which keeps their edges.
        //
        // Measured at the peak rather than guessed: the gate's bound is 34%
        // clipped and this stack lands an order of magnitude under it, because
        // the filmic curve needs a linear value near 4.5 to reach white and
        // nothing here is allowed that far.
        grade.washAmount = blast.light * 0.14 + blast.whiteout * 0.25;
        // Bloom is the one term here that had to be pulled *back* rather than
        // pushed. It runs before the grade (`systems/postfx.ts` adds it between
        // the render and the combined pass), so at the peak its output is
        // washed, exposed and tonemapped on top of a frame that is already at
        // the top of the curve — and with the threshold dropped it blooms the
        // whole image, not its highlights. Measured: strength +1.6 with the
        // threshold at 0.2 put 43.5% of the frame past white, past the gate's
        // 34% bound, with the structure gone with it (std 9.8). Held to a halo
        // on what is actually brightest, the same peak measures in the teens.
        context.post.setBloom(
          LIVING.bloom + distress * 0.34 + apart * 0.2 + blast.light * 0.55,
          0.55,
          Math.max(0.38, 0.82 - distress * 0.26 - apart * 0.04 - blast.light * 0.3),
        );
        // The one overtly unreal effect, and it sits on the white-out alone
        // rather than on the glare after it: the frame stretches while it
        // cannot be resolved, and stops the moment it can.
        grade.smear = blast.whiteout * 0.07;

        // Pressure before sound, and then hearing that does not come back.
        //
        // Nothing in the mix moves for the first four tenths of a second: the
        // frame has already been squeezed, the light has already arrived, and
        // the morning still sounds exactly like a morning. `deaf` is what then
        // takes it — level *and* top, together, which is the difference between
        // sound going out and sound being turned down — and `deaf` has no fall
        // in it, so nothing in the rest of the scene brings hearing back.
        context.audio.room(0.26 * (1 - blast.deaf), 900 - 770 * blast.deaf);
        // The low end is what a body keeps, so the pressure is filed with the
        // drone rather than with the room: a sub shove that rolls through and
        // leaves the drone a few hertz lower than it found it.
        //
        // Quantised because `AudioEngine.drone` rebuilds its oscillators on
        // every call. Called once per frame it would tear itself down sixty
        // times a second and never finish its own two-second gain ramp, so the
        // sub would be inaudible and the churn pointless.
        const droneLevel = 0.07 + blast.sub * 0.5 + blast.deaf * 0.04;
        const droneBase = 40 - blast.sub * 22 - blast.deaf * 5;
        if (Math.abs(droneLevel - droneAt.level) > 0.015 || Math.abs(droneBase - droneAt.base) > 0.7) {
          droneAt = { level: droneLevel, base: droneBase };
          context.audio.drone(droneLevel, droneBase);
        }
        // The ring does not creep in here the way it would after a shot. A blast
        // leaves it already there, and the rest of the vignette is spent inside
        // it (`L-THRESH-02`).
        if (blastAt === undefined) {
          context.audio.ring(0, 1900);
        } else {
          context.audio.ring(0.2 * blast.deaf, 2200 + since * 18);
        }
        context.audio.shimmer(apart * 0.05);

        // --- the place, still going ---------------------------------------
        sky.mesh.position.copy(context.camera.position);
        // The mist does two jobs after the blast. Under the light it is additive
        // air going bright — the "from everywhere" term that is actually in the
        // world rather than in the grade. And afterwards there is less of it than
        // there was, because the pressure pushed it out of the rows and it comes
        // back slowly: that thinness is what the closing aerial reads as the air
        // over the orchard not being right.
        const cleared = blastAt === undefined ? 0 : 0.3 + 0.7 * Math.exp(-since / 20);
        mist.update(
          elapsed,
          context.camera,
          (0.3 + dawn * 0.22 - apart * 0.08) * (1 - cleared * 0.56) + blast.light * 2.4,
        );
        // And the air is physically pushed out of the rows while it happens.
        // These are the largest movable bodies in the scene, so them all
        // leaving at once — outward, upward, away down the field — is the one
        // place pressure is a thing the world does rather than a thing the
        // grade does. They are back where they were authored by the time the
        // glare is gone; what does not come back is how much of it there is.
        mist.shove(Math.max(blast.press, blast.ground) * 0.9);
        // The dust in the air, thrown outward from everywhere at once. One
        // scale on a field that was already drifting: no new object, nothing
        // with a position, nothing that could be read as coming from a place.
        motes.points.scale.setScalar(1 + blast.ground * 0.55 + blast.press * 0.3);
        dawnGlow.update(elapsed, context.camera);
        regardGlow.update(elapsed, context.camera);
        motes.drift(delta * (1 - distress * 0.75), elapsed);

        // The other man, while there is still an other man. He breathes, and he
        // is leaning on an elbow only if the player woke him for the light —
        // which is as far as this scene ever goes with him: he is a shape in a
        // ditch and never a performance.
        //
        // After `consume` this stops running entirely, which is the point. The
        // loop does not animate an aftermath, because there is no aftermath to
        // animate: there is a flat groundsheet, and nothing is moving it.
        if (!consumed) {
          const breath = Math.sin(elapsed * 0.52) * 0.012;
          sleeper.position.y = FLOOR + 0.3 + breath + (wokenEarly ? 0.05 : 0);
          sleeper.rotation.z = wokenEarly ? -0.22 : 0;
          sleeper.rotation.y = wokenEarly ? 0.3 : 0;
        }

        // What he is looking at, if he has chosen. Comes up over a second and a
        // half so it reads as attention rather than a light being switched on,
        // and goes with the rest of perception.
        if (regardSince !== undefined) {
          const held = Math.min(1, (elapsed - regardSince) / 1.5);
          setU(
            regardGlow.material,
            'uIntensity',
            ease.out(held) * 0.42 * (1 - distress * 0.5) * (1 - apart * 0.7) * (1 - blast.light),
          );
        }
        // Nothing is left glowing over the place where he was.
        //
        // Attention is a sprite, and a sprite sitting over an empty
        // groundsheet after the light has gone is a mark on the spot — which
        // is the one thing CLAUDE.md § Content rules will not have, whatever
        // it was put there for. It also reads, on a single frame, as a small
        // fire at a point, which would be a source, which would be a
        // perpetrator. So it goes out with him and does not come back; the
        // `(1 - blast.light)` above takes it down before the light does, so
        // there is no frame in which it is the brightest thing left.
        if (consumed && regardAt === 'sleeper') {
          regardGlow.mesh.visible = false;
        }

        // The letter, once it has gone into the other man's pack. Said with a
        // position rather than with a caption, which is this scene's habit: it
        // is no longer the pale corner in front of him, it is a pale corner
        // three metres away in somebody else's kit, and he can see that it is.
        //
        // Only while there is a pack to be in. `consume` puts it on the floor of
        // the ditch and nothing moves it after that — the trade the player took
        // was an effect on somebody, and it was, at the time. The scene does not
        // comment on what the blast did to it.
        if (!consumed && letterPick?.id === 'hand-it-over') {
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
