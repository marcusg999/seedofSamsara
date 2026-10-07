import {
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  Vector3,
} from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { GRAMMAR } from '../systems/palette';
import { Director, ease, type Beat } from '../systems/director';
import { moteField, volumetricGlow } from '../systems/forms';
import { setU } from '../systems/glsl';
import { Overlay, type OverlayContent } from '../systems/overlay';

/**
 * Vignette 5 — the heart attack. Lore bible § 5 (`L-ARREST-01`…`L-ARREST-05`).
 *
 * A slice of an ordinary evening, then the death. The player should care about
 * this person before they die, so the first half of the sequence is nothing but a
 * room with a life in it: a second cup no one is coming for, a drawing on the
 * fridge, a radio no one is listening to.
 *
 * Death is conveyed through perception, not gore (CLAUDE.md § Content rules).
 * Nothing injures and nothing bleeds. What happens is that the room stops being
 * reachable: the heart stumbles, the light narrows, the air loses its top end,
 * colour drains, the view sinks and tilts, and then it is quiet.
 *
 * Judged against the atmosphere-and-pacing bar, which means the restraint is the
 * work: one room, one light, long holds, and almost no text.
 *
 * The room is also the only material the vignette's decisions are made of. This
 * was 123 seconds with one exit and nothing to answer, which made it the last
 * choice-free stretch on the main path and the first thing a new player meets.
 * It now asks four questions — the second cup eleven seconds in, the message on
 * the machine, what he spends the few seconds of knowing on, and what he does
 * with the last of the room — and every one of them is built out of something
 * already standing in the kitchen. Nothing was added to the timeline to make
 * room: the authored length is unchanged at 123 seconds.
 *
 * The clock asks the questions. It never answers one (§ the choice queue).
 */

const WARM = GRAMMAR.living;
const COLD = GRAMMAR.dying;

/**
 * The player reaches the afterlife within three minutes (GAME_BRIEF.md § Act 1).
 *
 * The weight still sits in the first half, because caring about this man before
 * he dies is the whole job of the opening and it cannot be bought with incident.
 * But it is bought with less time than before: every beat here is trimmed rather
 * than any beat being cut, so the shape of the arc survives the shorter run.
 *
 * Authored length is 123s, unchanged by the questions: three seconds came off
 * `settle` so that the first one is live at 11s rather than at 14s, and went
 * back into `floor` and `stillness`, where the player is on the floor with the
 * last decision in front of them. The closing beat then holds for GRACE_SECONDS
 * before moving on by itself, so a player who simply watches still crosses over
 * inside three minutes, while a player who wants to go sooner always can.
 *
 * Two captions are gone rather than rewritten. "Two cups. He still sets out
 * two." and the line about the chest were the vignette *telling* the player
 * what the second cup and the first twinge meant; those are now the two things
 * it asks them about, and a caption arriving on the same frame as the question
 * about the same object would only compete with it. The drawing keeps its line,
 * because it lands between two questions rather than on top of one.
 *
 * Where each question is cued is recorded in CUES, next to the tables.
 */
const BEATS: readonly Beat[] = [
  { id: 'settle', seconds: 11, caption: 'Tuesday. The kettle, again.' },
  { id: 'the-room', seconds: 16 },
  { id: 'second-cup', seconds: 15 },
  { id: 'the-drawing', seconds: 12, caption: 'Their daughter drew that the year she turned six.' },
  { id: 'first-twinge', seconds: 10 },
  { id: 'wrong', seconds: 12 },
  { id: 'grip', seconds: 11 },
  { id: 'going-down', seconds: 8 },
  { id: 'floor', seconds: 11 },
  { id: 'stillness', seconds: 16, caption: 'The kettle is still going.' },
  // Holds, so the last image is never snatched away — but not forever.
  { id: 'after', seconds: 1, hold: true },
];

/** How long the closing image holds before the scene moves on by itself. */
const GRACE_SECONDS = 10;

/**
 * What this death hands to the afterlife (GAME_BRIEF.md § Act 1): violent and
 * unjust deaths begin with heavy attachment, peaceful ones begin light. This one
 * is neither — sudden, alone, and carrying one unfinished thing — so it starts
 * low but not at nothing.
 *
 * Recorded as a design choice rather than a finding: lore bible § 12.6 notes
 * that `L-ARREST-02` found depth of experience did not track medical severity,
 * which is mild evidence against a tidy "worse death, heavier start" curve.
 */
const STARTING_ATTACHMENT = 0.25;

/**
 * The lightest this death can hand over, however much the player puts down.
 *
 * The brief says peaceful deaths begin light, not that they begin at nothing: a
 * man died alone in his kitchen on a Tuesday and something crosses over with
 * him either way. It is also the floor `tests/gate/brief.spec.ts` stands on —
 * that test drives this scene without clicking and requires the handover to be
 * above zero — so it is written here as a floor rather than left to arithmetic
 * on four optional choices.
 */
const MIN_ATTACHMENT = 0.05;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// --- the choices, and the state they move --------------------------------------

/**
 * Everything the player is asked here is a thing already standing in the room:
 * the second cup, the light blinking on the answering machine, the chair across
 * the table, the drawing, the window. Nothing is invented to be chosen, and
 * nothing new is invented to record the choosing either — each pick moves the
 * four numbers GAME_BRIEF.md § Systems already defines and writes one shard
 * into the run's record.
 *
 * How the four read in this room:
 * - ATTACHMENT is how much of the kitchen he is still holding when he leaves
 *   it. The brief makes this the death's handover to the afterlife, and the
 *   corridor reads it back: at 0.5 and over the soul arrives heavy, at 0.2 and
 *   under it arrives light (`border-and-review.ts`). The spread of these
 *   options covers both ends, so the player decides which it is — not the menu
 *   they picked the death off.
 * - HARMONY rises through release (brief § Systems), so it is what putting
 *   something down earns, and never what keeping it earns.
 * - WILL is bought with weight, exactly as in the Threshold corridor: a grip is
 *   a use of will and holding on keeps some of it for Path B to spend.
 * - KARMA is effect on others as felt in the review, so it moves in exactly one
 *   place in this room — the phone — because there is nobody else in it. See
 *   MESSAGE for why ringing her credits it and leaving it does not debit it.
 */
interface Pick {
  readonly id: string;
  /** The button. Names the thing in the room, never the outcome. */
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

/** The things in the room his attention can land on. */
type RegardId = 'cups' | 'phone' | 'chair' | 'drawing' | 'window';

/**
 * The first question, eleven seconds in: the second cup.
 *
 * This is the characterisation, and it is a choice rather than a minute of
 * watching him — the lesson of `dmt.ts`, whose first choice is the whole of who
 * that man is. The vignette used to state it in a caption at 30s ("Two cups. He
 * still sets out two.") and the player's job was to notice. Now they decide it,
 * before the kettle has even stopped.
 *
 * Deliberately never says who the second cup is for. The objects do not say, the
 * captions never said, and the life review only ever says "her" — so the copy
 * holds that line and lets the player bring their own.
 */
const CUPS: readonly Pick[] = [
  {
    id: 'both',
    label: 'Fill both',
    trade: 'The place stays set. He carries more of this room out of it.',
    caption: 'He fills both. Nine years widowed, and he has never once filled only one.',
    shard: 'heart-attack.set-the-place',
    attachment: 0.14,
    harmony: 0,
    will: 0.06,
    karma: 0,
    regard: 'cups',
  },
  {
    id: 'shelf',
    label: 'Put the second one back',
    trade: 'He lets the table be a table. He arrives lighter, with less to hold.',
    caption: 'Back on the shelf. He keeps his hand on the handle a moment longer than he needs to.',
    shard: 'heart-attack.put-it-back',
    attachment: -0.1,
    harmony: 1,
    will: -0.04,
    karma: 0,
    regard: 'cups',
  },
  {
    id: 'window',
    label: 'Leave them and stand at the window',
    trade: 'His own tea, standing up. Some of the evening is still his, and that is his to spend.',
    caption: 'He drinks it standing up. Across the yard somebody is washing up with the radio on.',
    shard: 'heart-attack.stood-at-the-window',
    attachment: -0.03,
    harmony: 0,
    will: 0.1,
    karma: 0,
    regard: 'window',
  },
];

/**
 * The second question: the message on the machine.
 *
 * The life review of this life is the call he did not return — "He thought there
 * would be time to call her back" — and it debits karma by one, automatically,
 * for a night she spent waiting up. This question is that call while it is still
 * possible, which is the only place in this room where karma can honestly move
 * at all: she is the only other person in the life.
 *
 * Ringing her credits karma by one. It rings out, so the review stays true — she
 * never got the call and still waited up — but a missed call from her father at
 * twenty past seven on the last evening of his life is a real effect on another
 * person, and it is one she will feel. Leaving it does not debit karma a second
 * time: the review already enters the uncalled call once, and a ledger that
 * counts the same silence twice is not a ledger.
 */
const MESSAGE: readonly Pick[] = [
  {
    id: 'ring',
    label: 'Ring her back now',
    trade: 'She will see in the morning that he tried. Karma is effect on others, and that is an effect.',
    caption: 'Four rings and then her machine. He does not leave anything. He will say it properly tomorrow.',
    shard: 'heart-attack.rang-her',
    attachment: 0.08,
    harmony: 1,
    will: 0.08,
    karma: 1,
    regard: 'phone',
  },
  {
    id: 'tomorrow',
    label: 'Leave it until tomorrow',
    trade: 'He is tired and nothing is wrong. The thing undone stays in the room, and goes with him.',
    caption: 'Tomorrow, then. He turns the sound down on the machine and sits with his tea.',
    shard: 'heart-attack.left-it',
    attachment: 0.16,
    harmony: 0,
    will: -0.06,
    karma: 0,
    regard: 'phone',
  },
];

/**
 * The third question: what the few seconds of knowing are spent on.
 *
 * Inside the treatment rule (CLAUDE.md § Content rules): death here is
 * perception, so the choice is perception — what he looks at — and not an action.
 * Nothing in it resists the attack, calls for anybody or turns the kitchen into
 * a sequence. Whatever he is looking at is what he is still holding, which is
 * why the empty chair is the heaviest option in the vignette and the window is
 * the lightest.
 */
const KNOWING: readonly Pick[] = [
  {
    id: 'chair',
    label: 'The empty chair',
    trade: 'The heaviest thing in the room, and the one he would stay for. He leaves holding it.',
    caption: 'He is looking at the far side of the table. There is nobody in it and he looks anyway.',
    shard: 'heart-attack.looked-at-the-chair',
    attachment: 0.18,
    harmony: 0,
    will: 0.08,
    karma: 0,
    regard: 'chair',
  },
  {
    id: 'drawing',
    label: 'Her drawing',
    trade: 'A house, a sun with spokes, three people the same size. He takes her with him.',
    caption: 'She was six and she pressed too hard. The sun has gone the colour of the wall.',
    shard: 'heart-attack.looked-at-the-drawing',
    attachment: 0.1,
    harmony: 1,
    will: 0,
    karma: 0,
    regard: 'drawing',
  },
  {
    id: 'light',
    label: 'The last of the light',
    trade: 'Nothing out there is owed him and nothing is asked. He arrives with his hands empty.',
    caption: 'The yard goes blue. A light comes on in somebody else’s kitchen, and it is not frightening.',
    shard: 'heart-attack.looked-at-the-light',
    attachment: -0.1,
    harmony: 1,
    will: -0.05,
    karma: 0,
    regard: 'window',
  },
];

/**
 * The last question, and the one that leaves: what he does with the last of the
 * room.
 *
 * Both answers take the scene's one exit, which is the honest shape of it —
 * nobody holds off a heart attack by deciding to, and the vignette is not going
 * to pretend otherwise. What the answer changes is what crosses over, which is
 * precisely what the brief says a death is for. The copy says so plainly rather
 * than letting the player think "Hold on" is a way to stay.
 *
 * It is also the player's way out: before this, the only thing that ever took
 * this scene's exit was the grace timer, which means a player who wanted to go
 * sooner could not (GAME_BRIEF.md § Act 1, pacing rule).
 */
const LETTING_GO: readonly Pick[] = [
  {
    id: 'let-go',
    label: 'Let go',
    trade: 'He stops holding the kitchen together. He arrives light, with his hands open.',
    caption: 'He lets the kitchen be a kitchen. The kettle goes on without him.',
    shard: 'heart-attack.let-go',
    attachment: -0.14,
    harmony: 1,
    will: -0.04,
    karma: 0,
  },
  {
    id: 'hold-on',
    label: 'Hold on',
    trade: 'He keeps his grip on all of it. The room goes anyway, and the grip goes with him.',
    caption: 'He holds on to every bit of it. None of it stays. The holding does.',
    shard: 'heart-attack.held-on',
    attachment: 0.16,
    harmony: 0,
    will: 0.14,
    karma: 0,
  },
];

/**
 * Where each question is cued, as the id of the beat it goes up on.
 *
 * Beat starts, in authored seconds: settle 0, the-room 11, second-cup 27,
 * the-drawing 42, first-twinge 54, wrong 64, grip 76, going-down 87, floor 95,
 * stillness 106, after 122. So the first question is live at 11s and the four
 * are cued at 11s, 27s, 54s and 95s.
 *
 * The longest stretch with nothing to decide is the 41 seconds from the third
 * question to the fourth, and that is deliberate: it is the collapse itself —
 * `wrong`, `grip`, `going-down` — the one stretch this vignette has to show
 * rather than ask about. Putting a dialog over the fall would take the player's
 * eyes off the only thing those beats contain. Everything before it is 11, 16
 * and 27 seconds apart, and the last question is live from the floor onward.
 *
 * A cue is a beat id and nothing more, so re-timing a beat cannot silently move
 * a question out of the window it was written for.
 */
const CUES = {
  cups: 'the-room',
  message: 'second-cup',
  knowing: 'first-twinge',
  lettingGo: 'floor',
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
  cups: beatIndex(CUES.cups),
  message: beatIndex(CUES.message),
  knowing: beatIndex(CUES.knowing),
  lettingGo: beatIndex(CUES.lettingGo),
} as const;

/**
 * Every shard that records a decision here, as opposed to a memory.
 *
 * Shards survive the river as memories and are seeded back into the soul at the
 * start of the next run, and the loop can bring a player through this kitchen
 * again. Without this, a second pass would read the first pass's answers and the
 * run would believe he had already rung her. Cleared when the scene loads, for
 * the same reason `dmt.ts` clears its own.
 */
const DECISION_SHARDS: readonly string[] = [...CUPS, ...MESSAGE, ...KNOWING, ...LETTING_GO].map(
  (pick) => pick.shard,
);

/**
 * One overlay slot for the scene, with a queue behind it.
 *
 * The mechanism, and the reasoning for it, are `dmt.ts`'s: all four questions
 * share one slot, and the beat clock reaches the next cue whether or not the
 * player has answered the last one — so a cue never offers, it *queues*. The
 * head of the queue is what is on screen, and the next question goes up on the
 * frame the current one is answered.
 *
 * Offering straight off the timeline would paint over an unanswered dialog, and
 * a question that disappears unasked is worse than a default: the player never
 * learns it was there, and the state it carried never moves at all. Queued, a
 * question can only ever wait.
 *
 * Restated here rather than imported because it is a local function in `dmt.ts`
 * and this change is not allowed to touch that file. If a third scene needs it,
 * it belongs in `systems/` and both should take it from there.
 */
function choiceQueue(context: SceneContext): {
  /** Queue a question. `build` runs at the moment it actually goes up. */
  enqueue(build: () => OverlayContent): void;
  /** Call from a handler: closes the current question and offers what is waiting. */
  answered(): void;
} {
  const queue: (() => OverlayContent)[] = [];
  let current: Overlay | undefined;
  // Whatever is up must come down when the scene unloads.
  context.resources.onDispose(() => {
    current?.dispose();
    current = undefined;
    queue.length = 0;
  });
  const pump = (): void => {
    if (current) {
      return;
    }
    const next = queue.shift();
    if (!next) {
      return;
    }
    current = new Overlay(next());
    current.focusFirst();
  };
  return {
    enqueue(build) {
      queue.push(build);
      pump();
    },
    answered() {
      current?.dispose();
      current = undefined;
      pump();
    },
  };
}

/**
 * A question, built from one of the tables.
 *
 * The trade for every option is on screen before the player commits, the way the
 * corridor's prompts put a `detail` under each answer, and the hint says the
 * moment waits — never that anything will happen if they do not answer, because
 * nothing will.
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

export const deathHeartAttackScene: SceneDefinition = {
  id: 'death.heart-attack',
  title: 'An ordinary evening',
  exits: [{ id: 'onward', label: 'Let go', to: 'threshold.pronounced-dead' }],
  contentNotes: ['A death from a heart attack, from inside the body. No gore.'],
  create(context: SceneContext): SceneInstance {
    const { resources, scene, rng } = context;
    const room = new Group();
    scene.add(room);

    // A fresh pass through this kitchen decides for itself (see DECISION_SHARDS).
    context.soul.shards = context.soul.shards.filter((shard) => !DECISION_SHARDS.includes(shard));

    // --- materials ---------------------------------------------------------
    const wallMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x2a2429, roughness: 0.94, metalness: 0 }),
    );
    const floorMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x1d181c, roughness: 0.88, metalness: 0.02 }),
    );
    const woodMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.88, metalness: 0 }),
    );
    const tableMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x33261d, roughness: 0.82, metalness: 0 }),
    );
    const metalMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.34, metalness: 0.72 }),
    );
    const paperMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x9c8f78, roughness: 0.98, metalness: 0 }),
    );
    const ceramicMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0xd8cec2,
        roughness: 0.42,
        metalness: 0.03,
        // A touch of self-lit warmth: the second cup is the whole
        // characterisation and must not disappear into the table's shadow.
        emissive: 0x3a2a1c,
        emissiveIntensity: 1,
      }),
    );

    // --- shell -------------------------------------------------------------
    const roomWidth = 5.4;
    const roomDepth = 6.2;
    const roomHeight = 2.7;

    const floorGeometry = resources.track(new PlaneGeometry(roomWidth, roomDepth));
    const floor = new Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    room.add(floor);

    const ceiling = new Mesh(floorGeometry, wallMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = roomHeight;
    room.add(ceiling);

    const wallSideGeometry = resources.track(new PlaneGeometry(roomDepth, roomHeight));
    const wallEndGeometry = resources.track(new PlaneGeometry(roomWidth, roomHeight));

    const backWall = new Mesh(wallEndGeometry, wallMaterial);
    backWall.position.set(0, roomHeight / 2, -roomDepth / 2);
    room.add(backWall);

    const frontWall = new Mesh(wallEndGeometry, wallMaterial);
    frontWall.position.set(0, roomHeight / 2, roomDepth / 2);
    frontWall.rotation.y = Math.PI;
    room.add(frontWall);

    const leftWall = new Mesh(wallSideGeometry, wallMaterial);
    leftWall.position.set(-roomWidth / 2, roomHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    room.add(leftWall);

    const rightWall = new Mesh(wallSideGeometry, wallMaterial);
    rightWall.position.set(roomWidth / 2, roomHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    room.add(rightWall);

    // --- the window: the strongest shape in the room ------------------------
    // Light does the composition here. The window is a hard, cool rectangle in a
    // warm dim room, so the eye has somewhere to rest and the silhouettes read.
    const windowGeometry = resources.track(new PlaneGeometry(1.5, 1.15));
    const windowMaterial = resources.track(
      new MeshStandardMaterial({
        color: 0x8ab2d2,
        emissive: 0x5d87ad,
        emissiveIntensity: 1.1,
        roughness: 1,
      }),
    );
    const windowPane = new Mesh(windowGeometry, windowMaterial);
    windowPane.position.set(0, 1.62, -roomDepth / 2 + 0.02);
    room.add(windowPane);

    const outside = volumetricGlow(resources, { radius: 1.3, color: 0x7ea8cc, intensity: 0.45, softness: 2.4 });
    outside.mesh.position.set(0, 1.62, -roomDepth / 2 - 0.35);
    room.add(outside.mesh);

    const mullionGeometry = resources.track(new BoxGeometry(0.035, 1.18, 0.05));
    const mullion = new Mesh(mullionGeometry, woodMaterial);
    mullion.position.set(0, 1.62, -roomDepth / 2 + 0.05);
    room.add(mullion);

    const transomGeometry = resources.track(new BoxGeometry(1.54, 0.035, 0.05));
    const transom = new Mesh(transomGeometry, woodMaterial);
    transom.position.set(0, 1.62, -roomDepth / 2 + 0.05);
    room.add(transom);

    // --- counter, table, chairs --------------------------------------------
    const counterGeometry = resources.track(new BoxGeometry(roomWidth - 0.6, 0.9, 0.62));
    const counter = new Mesh(counterGeometry, woodMaterial);
    counter.position.set(0, 0.45, -roomDepth / 2 + 0.45);
    room.add(counter);

    const tableTopGeometry = resources.track(new BoxGeometry(1.5, 0.06, 0.95));
    const tableTop = new Mesh(tableTopGeometry, tableMaterial);
    tableTop.position.set(0.1, 0.76, 0.75);
    room.add(tableTop);

    const legGeometry = resources.track(new BoxGeometry(0.07, 0.76, 0.07));
    for (const [x, z] of [
      [-0.58, 0.36],
      [0.78, 0.36],
      [-0.58, 1.14],
      [0.78, 1.14],
    ] as const) {
      const leg = new Mesh(legGeometry, woodMaterial);
      leg.position.set(x + 0.1, 0.38, z);
      room.add(leg);
    }

    const chairSeatGeometry = resources.track(new BoxGeometry(0.46, 0.05, 0.46));
    const chairBackGeometry = resources.track(new BoxGeometry(0.46, 0.52, 0.05));
    for (const [x, z, facing] of [
      [-0.55, 0.75, Math.PI / 2],
      [0.78, 0.75, -Math.PI / 2],
    ] as const) {
      const chair = new Group();
      const seat = new Mesh(chairSeatGeometry, woodMaterial);
      seat.position.y = 0.46;
      chair.add(seat);
      const back = new Mesh(chairBackGeometry, woodMaterial);
      back.position.set(0, 0.72, -0.2);
      chair.add(back);
      for (const [lx, lz] of [
        [-0.19, -0.19],
        [0.19, -0.19],
        [-0.19, 0.19],
        [0.19, 0.19],
      ] as const) {
        const leg = new Mesh(legGeometry, woodMaterial);
        leg.position.set(lx, 0.23, lz);
        leg.scale.y = 0.6;
        chair.add(leg);
      }
      chair.position.set(x, 0, z);
      chair.rotation.y = facing;
      room.add(chair);
    }

    // --- the life in the room ----------------------------------------------
    // Two cups. The second one is the whole characterisation.
    const cupGeometry = resources.track(new CylinderGeometry(0.045, 0.038, 0.09, 18, 1, true));
    const cupA = new Mesh(cupGeometry, ceramicMaterial);
    cupA.position.set(-0.26, 0.84, 0.66);
    room.add(cupA);
    const cupB = new Mesh(cupGeometry, ceramicMaterial);
    cupB.position.set(0.46, 0.84, 0.84);
    room.add(cupB);

    // A child's drawing, pinned up. Read as a shape, never detailed.
    const drawingGeometry = resources.track(new PlaneGeometry(0.3, 0.38));
    const drawing = new Mesh(drawingGeometry, paperMaterial);
    drawing.position.set(-1.86, 1.42, -roomDepth / 2 + 0.03);
    drawing.rotation.z = 0.04;
    room.add(drawing);

    // The kettle, which outlasts him.
    const kettleGeometry = resources.track(new CylinderGeometry(0.1, 0.12, 0.2, 20));
    const kettle = new Mesh(kettleGeometry, metalMaterial);
    kettle.position.set(-1.1, 1.0, -roomDepth / 2 + 0.42);
    room.add(kettle);

    const steam = moteField(resources, rng.stream('steam'), {
      count: 90,
      radius: 0.3,
      color: 0xd8d2c8,
      size: 0.022,
    });
    steam.points.position.copy(kettle.position).add(new Vector3(0, 0.22, 0));
    room.add(steam.points);

    // The answering machine, with her message still on it.
    //
    // The one object added to this room, and it is added because the life review
    // of this life is the call he did not return. Without it the vignette's
    // unfinished business exists only in a later scene's caption; with it, it is
    // a light blinking on a counter in front of the player eleven seconds after
    // they arrive, and they can do something about it.
    //
    // Read as a shape and a red dot. Nothing is written on it, there are no
    // buttons, and it is never the subject of the frame.
    const machineBodyGeometry = resources.track(new BoxGeometry(0.21, 0.055, 0.14));
    const machineMaterial = resources.track(
      new MeshStandardMaterial({ color: 0x24201f, roughness: 0.62, metalness: 0.08 }),
    );
    const machine = new Mesh(machineBodyGeometry, machineMaterial);
    machine.position.set(0.86, 0.928, -roomDepth / 2 + 0.5);
    machine.rotation.y = -0.22;
    room.add(machine);

    const handsetGeometry = resources.track(new BoxGeometry(0.175, 0.042, 0.05));
    const handset = new Mesh(handsetGeometry, machineMaterial);
    handset.position.set(machine.position.x, 0.975, machine.position.z - 0.01);
    handset.rotation.y = machine.rotation.y;
    room.add(handset);

    // The light itself is its own emitter, for the same reason the bulb is: a lit
    // material would read as a dark speck in the middle of its own halo.
    const ledGeometry = resources.track(new SphereGeometry(0.022, 12, 8));
    const ledMaterial = resources.track(new MeshBasicMaterial({ color: 0xff4a32 }));
    const led = new Mesh(ledGeometry, ledMaterial);
    led.position.set(machine.position.x + 0.07, 0.968, machine.position.z + 0.08);
    room.add(led);

    const ledGlow = volumetricGlow(resources, { radius: 0.08, color: 0xff5c3c, intensity: 0.9, softness: 2.2 });
    ledGlow.mesh.position.copy(led.position);
    room.add(ledGlow.mesh);

    /**
     * What he is looking at, as light rather than as a camera move.
     *
     * The rig's path through this vignette is authored — it stands, it goes down,
     * it rolls onto the floor — and a choice that fought it for the camera would
     * wreck the one thing the beats are for. So attention is shown the way this
     * room shows everything else: a little more light on the thing he has
     * fixed on. One sprite, reused by every pick, moved to whichever object was
     * chosen. It costs no post pass (CLAUDE.md: the stack here is already most
     * of the frame).
     */
    const regardGlow = volumetricGlow(resources, { radius: 0.34, color: 0xffd9a4, intensity: 0, softness: 2.5 });
    regardGlow.mesh.visible = false;
    room.add(regardGlow.mesh);

    /** Where attention can land, in room space. All of it was already here. */
    const REGARD: Record<RegardId, Vector3> = {
      cups: new Vector3(0.46, 0.9, 0.84),
      phone: new Vector3(led.position.x, led.position.y, led.position.z),
      // The chair's back, not its seat: the seat is tucked under the table top
      // and a glow there is drawn behind it, which looks like nothing at all.
      chair: new Vector3(0.98, 0.92, 0.75),
      drawing: new Vector3(-1.86, 1.42, -roomDepth / 2 + 0.1),
      window: new Vector3(0, 1.62, -roomDepth / 2 + 0.18),
    };

    // --- light -------------------------------------------------------------
    const bulbGlow = volumetricGlow(resources, { radius: 0.3, color: 0xffcf96, intensity: 0.7, softness: 2.6 });
    bulbGlow.mesh.position.set(0.1, 2.1, 0.75);
    room.add(bulbGlow.mesh);

    // The light source has to be its own emitter. A standard material with the
    // point light inside it receives no light on its outer faces and renders as a
    // black disc in the middle of its own glow.
    const bulbShadeGeometry = resources.track(new SphereGeometry(0.05, 16, 12));
    const bulbMaterial = resources.track(new MeshBasicMaterial({ color: 0xffe2b4 }));
    const bulb = new Mesh(bulbShadeGeometry, bulbMaterial);
    bulb.position.copy(bulbGlow.mesh.position);
    room.add(bulb);

    const bulbLight = new PointLight(0xffc78a, 11, 10, 2);
    bulbLight.position.copy(bulbGlow.mesh.position);
    room.add(bulbLight);
    resources.onDispose(() => {
      bulbLight.dispose();
    });

    // Bounce: a dim warm floor-up and cool ceiling-down pair, so surfaces away
    // from the bulb still carry shape instead of going to pure black.
    const bounce = new HemisphereLight(0x6d7f99, 0x4a3328, 0.55);
    room.add(bounce);
    resources.onDispose(() => {
      bounce.dispose();
    });

    // A second practical under the counter, which gives the back of the room
    // depth and keeps the kettle readable.
    const counterLight = new PointLight(0xffb570, 2.2, 4.5, 2);
    counterLight.position.set(-1.1, 1.22, -roomDepth / 2 + 0.7);
    room.add(counterLight);
    resources.onDispose(() => {
      counterLight.dispose();
    });

    const windowLight = new DirectionalLight(0x8fb6d8, 1.35);
    windowLight.position.set(0.2, 3.2, -6);
    windowLight.target.position.set(0, 0.8, 1);
    room.add(windowLight);
    room.add(windowLight.target);
    resources.onDispose(() => {
      windowLight.dispose();
    });

    // --- state -------------------------------------------------------------
    const director = new Director(BEATS);
    const standingEye = 1.58;
    const floorEye = 0.22;

    context.rig.setMode('embodied');
    context.rig.position.set(0.25, standingEye, 2.35);
    // Angled down and slightly across, so the table, both cups and the window are
    // all in the opening frame and the room reads as inhabited.
    context.rig.orient(Math.PI * 0.02, -0.22);
    context.rig.setSway(1);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = WARM.drain;
    grade.grain = WARM.grain;
    grade.vignette = 0.38;
    grade.aberration = 0.0011;
    grade.distortion = 0.022;
    grade.exposure = 1.35;
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(WARM.bloom, 0.55, 0.87);

    context.audio.room(0.3, 1400);
    context.audio.drone(0.09, 44);
    context.audio.heartbeat(true, 62, 0.34);

    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 6);
      }
    });

    // Per-beat targets. Keeping them as data rather than a switch in `update`
    // means the whole arc of the vignette is readable in one place.
    const BPM: Record<string, number> = {
      settle: 62,
      'the-room': 61,
      'second-cup': 60,
      'the-drawing': 59,
      'first-twinge': 74,
      wrong: 96,
      grip: 124,
      'going-down': 142,
      floor: 70,
      stillness: 22,
      after: 0,
    };

    let bodyDown = 0;
    let silenceFor = 0;
    let handedOver = false;
    // Wall-clock, not accumulated delta: the grace had the same frame-rate bug
    // the beat timeline did, and took 27s instead of 10 on a slow renderer.
    let holdBeganAt: number | undefined;
    let leaving = false;

    // --- the questions -----------------------------------------------------
    const choices = choiceQueue(context);
    /** What the player decided, in the order the room asked. */
    const taken: Pick[] = [];
    /** Questions already queued, so a cue fires once. */
    const askedAlready = new Set<string>();
    /** Questions already answered, so two clicks on one frame cannot double-enter. */
    const answeredAlready = new Set<string>();
    /** Her message: undefined while the light is still blinking at nobody. */
    let messagePick: Pick | undefined;
    /** Wall-clock seconds, kept so a pick can time its own fade without a delta. */
    let now = 0;
    let regardSince: number | undefined;

    /**
     * What the death hands to the afterlife, in one place.
     *
     * GAME_BRIEF.md § Act 1: each death sets the starting state of the
     * afterlife. The base is this death's own weight — sudden, alone, one thing
     * unfinished — and the player's answers move it from there.
     *
     * Attachment and will are a *position*, not a running total, so they are
     * recomputed from the base every time rather than nudged. That is what keeps
     * the handover at `stillness` from overwriting four decisions the player
     * already made: the handover runs this same function, so the two cannot
     * disagree. Karma and harmony are ledger entries and are added once, where
     * the pick is taken.
     *
     * Will stays tied to weight the way it always was here (a soul arriving
     * heavy arrives with less to spend) with each pick's own will on top — which
     * is the corridor's economy: a grip is a use of will, bought with weight.
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

    /** Take the scene's one exit. Once, and only ever from a player's click or the grace. */
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

    function takeCups(pick: Pick): void {
      // Put back means put back. The table loses the second cup.
      if (pick.id === 'shelf') {
        cupB.visible = false;
      }
      take('cups', pick);
    }

    function takeMessage(pick: Pick): void {
      messagePick = pick;
      take('message', pick);
    }

    function takeKnowing(pick: Pick): void {
      take('knowing', pick);
    }

    function takeLettingGo(pick: Pick): void {
      take('letting-go', pick);
      // Both answers leave, and the copy says so. What they change is what goes.
      leave();
    }

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t, index } = director.state;
        now = elapsed;

        bulbGlow.update(elapsed, context.camera);
        outside.update(elapsed, context.camera);
        ledGlow.update(elapsed, context.camera);
        regardGlow.update(elapsed, context.camera);
        steam.drift(delta, elapsed);

        // --- the questions, cued on the clock -----------------------------
        //
        // The clock decides when a question is *asked*. It never answers one,
        // and no beat passing resolves one: a cue can only enqueue, so if the
        // player is still deciding about the second cup when the machine's light
        // comes up in the next beat, that question waits its turn behind it
        // rather than painting over it.
        if (!askedAlready.has('cups') && index >= CUE_AT.cups) {
          askedAlready.add('cups');
          choices.enqueue(() =>
            question(
              'Two cups, the way he always sets them out.',
              'The kettle has boiled. Nobody is coming for the second one, and it is on the table '
                + 'anyway, the way it is every evening.',
              CUPS,
              'The evening waits on him. Nothing here picks for him.',
              takeCups,
            ),
          );
        }
        if (!askedAlready.has('message') && index >= CUE_AT.message) {
          askedAlready.add('message');
          choices.enqueue(() =>
            question(
              'The light on the machine is still blinking.',
              'His daughter rang on Sunday and he has not rung her back. She is the only one left '
                + 'to ring. It is twenty past seven on a Tuesday and she will be in.',
              MESSAGE,
              'The light goes on blinking either way. Nothing answers it for him.',
              takeMessage,
            ),
          );
        }
        if (!askedAlready.has('knowing') && index >= CUE_AT.knowing) {
          askedAlready.add('knowing');
          choices.enqueue(() =>
            question(
              'Something turns over in his chest.',
              'Not pain. His own heartbeat arriving in the wrong order. He has a few seconds of '
                + 'knowing what this is, and whatever he is looking at now is what he takes with him.',
              KNOWING,
              'Nothing here answers for him. The question stays his.',
              takeKnowing,
            ),
          );
        }
        if (!askedAlready.has('letting-go') && index >= CUE_AT.lettingGo) {
          askedAlready.add('letting-go');
          choices.enqueue(() =>
            question(
              'He is on the floor and the kettle is still going.',
              'The room is not coming back. What he does with the last of it is the only thing left '
                + 'to decide, and it is the thing that goes across with him.',
              LETTING_GO,
              'Neither of these happens by itself. Either one is the end of the room, and the '
                + 'difference is only what he is carrying when he leaves it.',
              takeLettingGo,
            ),
          );
        }

        // Heart rate rises through the attack, then falls away to nothing.
        const bpm = BPM[beat.id] ?? 60;
        const beating = bpm > 0;
        context.audio.heartbeat(beating, Math.max(1, bpm), beat.id === 'stillness' ? 0.5 : 0.34);

        // The camera pulse follows the heart, so the frame tightens with it.
        const pulseStrength = beat.id === 'settle' || beat.id === 'the-room'
          || beat.id === 'second-cup' || beat.id === 'the-drawing'
          ? 0.12
          : beat.id === 'first-twinge'
            ? 0.4
            : beat.id === 'wrong'
              ? 0.75
              : beat.id === 'grip'
                ? 1
                : beat.id === 'going-down'
                  ? 0.85
                  : 0.2;
        const beatPhase = beating ? (elapsed * (bpm / 60)) % 1 : 0;
        context.rig.setPulse(pulseStrength * Math.pow(1 - beatPhase, 6));

        // Perception narrows rather than the room changing: vignette closes,
        // colour leaves, the lens begins to disagree with itself.
        const distress = beat.id === 'first-twinge'
          ? t * 0.3
          : beat.id === 'wrong'
            ? 0.3 + t * 0.25
            : beat.id === 'grip'
              ? 0.55 + t * 0.3
              : beat.id === 'going-down' || beat.id === 'floor' || beat.id === 'stillness' || beat.id === 'after'
                ? 1
                : 0;

        grade.vignette = 0.38 + distress * 0.46;
        grade.drain = WARM.drain + (COLD.drain - WARM.drain) * distress;
        grade.aberration = 0.0011 + distress * 0.0042;
        grade.distortion = 0.022 + distress * 0.05;
        grade.grain = WARM.grain + distress * 0.1;
        grade.exposure = 1.35 - distress * 0.4;
        context.post.setBloom(WARM.bloom + distress * 0.5, 0.55, 0.42 - distress * 0.22);

        // The air loses its high end: sound dropping out, not fading down.
        context.audio.room(0.3 - distress * 0.16, 1400 - distress * 1180);
        context.audio.drone(0.09 + distress * 0.1, 44 - distress * 10);

        // The light on the machine.
        //
        // It blinks while her message is unanswered — and it goes on blinking if
        // he leaves it until tomorrow, because that is what an undone thing does
        // in a room. Ringing her back steadies it: he picked the handset up.
        // Everything the room emits is taken by the same drain as the rest of
        // perception, so it is not a UI light; it goes out when the room does.
        const blinking = messagePick === undefined || messagePick.id === 'tomorrow';
        const ledPhase = blinking ? (Math.sin(elapsed * 2.6) > 0.25 ? 1 : 0.06) : 0.42;
        const ledLevel = ledPhase * (1 - distress * 0.85);
        ledMaterial.color.setRGB(ledLevel, ledLevel * 0.24, ledLevel * 0.17);
        setU(ledGlow.material, 'uIntensity', ledLevel * 0.9);

        // What he is looking at, if he has chosen. Comes up over a second and a
        // half so it reads as attention rather than as a light being switched
        // on, and dims with the room: the thing does not survive the drain.
        if (regardSince !== undefined) {
          const held = Math.min(1, (elapsed - regardSince) / 1.5);
          setU(regardGlow.material, 'uIntensity', ease.out(held) * 0.5 * (1 - distress * 0.55));
        }

        // Going down. The view sinks and the horizon rolls, which is the body
        // falling without ever showing a body falling.
        if (beat.id === 'going-down') {
          bodyDown = ease.inOut(t);
        } else if (beat.id === 'floor' || beat.id === 'stillness' || beat.id === 'after') {
          bodyDown = 1;
        }
        context.rig.position.set(
          0.25 + bodyDown * 0.1,
          standingEye + (floorEye - standingEye) * bodyDown,
          1.95 - bodyDown * 0.55,
        );
        context.rig.setRoll(bodyDown * 0.62);
        context.rig.setSway(1 - bodyDown * 0.85);

        // The vertical smear is the one overtly unreal effect, and it is spent
        // in about three seconds at the moment the body gives out.
        grade.smear = beat.id === 'going-down' ? ease.pulse(t) * 0.05 : 0;

        // Then the ring, which is the first thing that belongs to what comes next.
        if (beat.id === 'stillness' || beat.id === 'after') {
          silenceFor += delta;
          context.audio.ring(Math.min(0.2, silenceFor * 0.04), 2100 + silenceFor * 60);
          context.captions.update();
        } else {
          context.audio.ring(0, 2100);
        }

        // The death sets the opening state of the afterlife, once, as it ends.
        //
        // The same function the picks use, so a player who answered everything
        // keeps what they decided and a player who answered nothing still hands
        // over this death's own weight. `tests/gate/brief.spec.ts` drives this
        // scene without clicking, which is the second path through here and the
        // reason the handover can never be left to the choices alone.
        if (!handedOver && (beat.id === 'stillness' || beat.id === 'after')) {
          handedOver = true;
          settle();
        }

        // The exit is live from the first frame: the player is never held here.
        // And if they do nothing, the scene lets go on their behalf rather than
        // leaving them sitting in a dead room past the three-minute mark.
        //
        // The grace takes the scene's exit. It never answers a question: a
        // player who leaves this way arrives with this death's own weight and
        // nothing they chose, because they chose nothing. Which is also why the
        // last question is cued at `floor` and not here — it is live for
        // twenty-seven seconds of authored time before the grace clock starts,
        // so going by yourself is the ordinary way out of this room and the
        // timer is only the floor under a player who has stopped answering.
        if (beat.id === 'after' && t >= 1) {
          context.captions.show('Let go.', 8);
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
