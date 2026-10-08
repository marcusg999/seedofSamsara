import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { Director, ease, type Beat } from '../systems/director';
import { airShell, figureOfLight, moteField, radianceShell, volumetricGlow } from '../systems/forms';
import { luminousGround } from '../systems/weighing-hall';
import { luminousPanel, rememberedMoment, type LuminousPanel } from '../systems/remembered';
import { setU } from '../systems/glsl';
import { RELEASE_SECONDS, ThresholdPrompt, clamp01 } from './threshold-early';

/**
 * Path B, the first three rooms of it: the road taken by a soul that refuses
 * the Light (GAME_BRIEF.md § Path B).
 *
 * The lore bible is unusually directive about this path, and all three scenes
 * here are built to what it says rather than to what a lower sphere normally
 * looks like in a game:
 *
 * - `L-BARDO-02` is the tonal law for the whole path: in the source, failing to
 *   enter the light is not punished — it simply moves the traveller onto a
 *   longer road. So none of this is the bad ending, and nothing here is a
 *   penalty screen. The register is loss and persistence, not damnation.
 * - `L-FRAN-01` is `refuse.earthbound`: the narrator dies unrepentant, refuses
 *   rest, and wanders rather than ascending. Before he wanders he is still at
 *   the house, and cannot be reached or reach.
 * - `L-DARK-02` is `refuse.mist`: Greyson & Bush's Type 1, *inverted* — the same
 *   phenomenology as a radiant NDE, experienced as terrifying. The bible's own
 *   design note says to build it by re-grading the Light rather than by
 *   modelling a new place, so it is made from the Light's own furniture: the
 *   Council's floor, the Being of Light's radiance shell, the loved ones'
 *   figures. Drained, underlit, and arriving at nobody.
 * - `L-DARK-03` is `refuse.void`: Type 2 — nonexistence, a featureless
 *   emptiness, often with the conviction that one never existed at all.
 *
 * `refuse.void` is the one that needed a real decision. Rendered literally, "a
 * featureless emptiness" is a black rectangle, which is both a failed frame and
 * no scene at all. But the horror in the reports is not visual absence, it is
 * the conviction of never having been — so what the void takes away here is not
 * the light, it is the player's own moments, withdrawn one by one while they
 * watch. The frame keeps its structure and the claim is the source's.
 *
 * WILL is what these scenes spend and earn (GAME_BRIEF.md § Path B: "WILL is
 * the core resource: it powers movement between spheres and resists the pull of
 * lower ones"). It is flagged as the game's invention in the bible's § 12.1, so
 * nothing here asserts it as lore.
 *
 * ## Every scene here OFFERS its way out
 *
 * Four scenes in this codebase shipped declaring an exit and never putting a
 * control on screen, and players got stuck in all four. Declaring an exit is
 * not offering one. So each scene below builds a `ThresholdPrompt` at a named
 * beat, both answers call `takeExit`, and `releaseAfter` lets the scene go by
 * itself if the player never answers. The prompt is created from `update` on the
 * frame its beat begins — which is wall-clock timed through `Director.updateTo`
 * — and it is disposed through the scene's own ResourceTracker.
 *
 * The choice lands within fifteen seconds of every one of these scenes loading.
 */

/**
 * Beat lengths and beat order by id.
 *
 * Both exist for the same reason as in `council.ts`: a beat's own wall-clock
 * seconds have to be readable inside `update` to time anything within it, and
 * "have we passed beat X yet" has to be a comparison rather than a search.
 * Never key a ramp by a numeric beat index — inserting a beat at the front
 * silently retargets it and nothing fails.
 */
function indexBeats(beats: readonly Beat[]): {
  readonly seconds: Readonly<Record<string, number>>;
  readonly order: Readonly<Record<string, number>>;
} {
  return {
    seconds: Object.fromEntries(beats.map((beat) => [beat.id, beat.seconds])),
    order: Object.fromEntries(beats.map((beat, at) => [beat.id, at])),
  };
}

// --- 1. earthbound: haunting the living ----------------------------------------

const EARTHBOUND_BEATS: readonly Beat[] = [
  { id: 'the-room', seconds: 7, caption: 'Nobody has moved the second cup.' },
  { id: 'unseen', seconds: 7, caption: 'You are in the room. You are not in the room.' },
  { id: 'the-reach', seconds: 14 },
  { id: 'wait', seconds: 1, hold: true },
];

const EARTHBOUND = indexBeats(EARTHBOUND_BEATS);

/**
 * How long one turn of the evening takes, in seconds.
 *
 * The room is not a place the player is visiting, it is a moment they will not
 * put down, so it runs and runs: it swells, thins to almost nothing, and starts
 * again. Read off wall-clock elapsed, never accumulated, so the evening takes
 * the same real time on any machine.
 */
const EVENING_SECONDS = 11;

export const earthboundScene: SceneDefinition = {
  id: 'refuse.earthbound',
  title: 'Still at the house',
  discarnate: true,
  contentNotes: [
    'You stay near the people you died among, and cannot be seen or heard by them. '
      + 'Nothing violent happens, and no body is shown.',
  ],
  exits: [
    // Reaching and finding no purchase is the road into Type 2 (`L-DARK-03`):
    // the conviction of never having existed is what is left of a soul that
    // could not make one mark on the world it refused to leave.
    { id: 'reach', label: 'Reach for them', to: 'refuse.void' },
    // Letting the room go is the first real move a soul makes on this road, and
    // it moves off the earth plane into the twilight lands (`L-FRAN-04`).
    { id: 'release', label: 'Let the room go', to: 'refuse.mist' },
    { id: 'unanswered', label: 'Go on', to: 'refuse.mist' },
  ],
  create(context: SceneContext): SceneInstance {
    const { resources, scene } = context;

    // Outside is cold and has no floor in it, because the player is not standing
    // anywhere. Everything the eye can hold on to is inside the room.
    const air = airShell(resources, { radius: 72, ground: 0x0a090f, glow: 0x2c2840, density: 1 });
    scene.add(air.mesh);

    // The room, built from the review's vocabulary of light and distance rather
    // than from walls: a floor with an extent, a door that is open, two people
    // at a certain distance from each other, and the lamp between them. At the
    // range a house is seen from when you are no longer in it, that is all of it
    // there is.
    const roomSeed = context.rng.stream('earthbound-room').range(0, 40);
    const room = rememberedMoment(resources, {
      floor: { width: 5.8, depth: 5.4, color: 0xffc489, intensity: 0.5, edge: 0.58 },
      opening: {
        at: [-2.35, 0.9],
        width: 1.15,
        height: 2.2,
        color: 0xffe6c6,
        intensity: 1.2,
        turn: Math.PI * 0.5,
        open: 0.64,
        reach: 3.1,
      },
      presences: [
        { at: [-0.55, -0.45], height: 1.68, color: 0xffd3a2, intensity: 0.95 },
        { at: [1.0, 0.55], height: 1.5, color: 0xffcdb2, intensity: 0.86 },
      ],
      shared: { at: [0.25, 0.82, 0.05], radius: 0.52, color: 0xffd9a0, intensity: 1.6 },
      seed: roomSeed,
    });
    room.group.position.set(0, 0, -9);
    scene.add(room.group);

    /**
     * The second cup.
     *
     * One small, hard-edged bright thing on the table. The whole scene turns on
     * a detail nobody in the room has dealt with, and a detail has to be a
     * specific object rather than a mood — this is the only crisp shape in a
     * frame otherwise made of glows.
     */
    const cup = luminousPanel(resources, {
      width: 0.13,
      height: 0.16,
      color: 0xfff1dc,
      intensity: 1.5,
      softness: 0.14,
      churn: 0.04,
      seed: roomSeed + 9,
      facing: 'upright',
    });
    cup.mesh.position.set(-0.42, 0.88, -8.5);
    scene.add(cup.mesh);

    /**
     * The player's own light, seen from just outside itself.
     *
     * `L-FRAN-03`: the spirit body is the soul's own record and its state is
     * visible to others. The point of this scene is that the two people in the
     * room are not others — they are alive. So the player is lit, and lights
     * nothing.
     */
    // Broad and dim rather than small and bright: the glow's streaking term
    // resolves into a visible star once the sprite is only a hundred-odd pixels
    // across, and a star reads as a lens flare instead of as a body of light.
    const own = volumetricGlow(resources, { radius: 2.1, color: 0x9fb2ff, intensity: 0.5, softness: 1.75 });
    scene.add(own.mesh);

    // The cold the room is being looked at out of. Dense enough that the dark
    // has weather in it rather than being an absence.
    const night = moteField(resources, context.rng.stream('earthbound-night'), {
      count: 1500,
      radius: 15,
      color: 0x93a6cc,
      size: 0.24,
    });
    scene.add(night.points);

    /**
     * Where the twilight lands open, once the room has been let go of.
     *
     * Off to the side and low, so letting go is a direction and not a fade to
     * black — and so the frame still has something lit in it while the player
     * takes as long as they like over the one button left.
     */
    const onward = volumetricGlow(resources, { radius: 9, color: 0x7b85a8, intensity: 0, softness: 2.7 });
    onward.mesh.position.set(7.8, 0.5, -10);
    scene.add(onward.mesh);

    const director = new Director(EARTHBOUND_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 8);
      }
    });

    // Outside and a little above it, looking down into the one lit room —
    // which is both where the out-of-body point of view is reported to be
    // (`L-THRESH-03`, "often from above") and the only staging that keeps the
    // room clear of the band of screen the question will occupy. A choice about
    // two people is unreadable with the two people behind the panel.
    //
    // Above, specifically, and never below: these panels are front-faced, so a
    // floor of light seen from underneath is culled and the room disappears.
    context.rig.setMode('drifting');
    context.rig.position.set(0, 2.8, 2.6);
    context.rig.target.set(0, 2.8, 1.8);
    context.rig.orient(0, -0.26);
    context.rig.setSway(0.45);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.42;
    grade.grain = 0.13;
    grade.vignette = 0.58;
    grade.aberration = 0.0032;
    grade.distortion = 0.03;
    grade.exposure = 1.16;
    grade.washColor = [0.86, 0.88, 1];
    grade.washAmount = 0.02;
    grade.smear = 0;
    context.post.setBloom(0.52, 0.68, 0.58);

    context.audio.room(0.07, 520);
    context.audio.drone(0.17, 44, 7);
    context.audio.shimmer(0.05);
    context.audio.heartbeat(false);

    /**
     * The question, and the one control this scene puts on screen.
     *
     * Both answers leave by a declared exit, and `releaseAfter` means a player
     * who answers nothing is not held here — the release moves no ledger at all,
     * so answering stays the only way to change anything.
     */
    let prompt: ThresholdPrompt | undefined;
    resources.onDispose(() => {
      prompt?.dispose();
      prompt = undefined;
    });

    let picked: 'reach' | 'release' | undefined;
    let pickedAt: number | undefined;

    const choose = (choice: 'reach' | 'release'): void => {
      if (picked !== undefined) {
        return;
      }
      picked = choice;
      if (choice === 'reach') {
        // A grip costs will and buys weight. Harmony is contribution to the
        // balance, and frightening two people who cannot see what frightened
        // them is a subtraction from it.
        context.soul.will = clamp01(context.soul.will - 0.24);
        context.soul.attachment = clamp01(context.soul.attachment + 0.22);
        context.soul.harmony -= 1;
        prompt?.settle(
          'The lamp goes wrong and stays wrong. Both of them stop, and look at nothing, '
            + 'and one of them says it is probably the wiring.',
          'will −0.24 · harmony −1 · you are carrying more',
          {
            label: 'There is nothing else to hold',
            exit: 'reach',
          },
        );
      } else {
        context.soul.harmony += 1;
        context.soul.attachment = clamp01(context.soul.attachment - 0.2);
        context.soul.will = clamp01(context.soul.will + 0.1);
        prompt?.settle(
          'You stop holding the evening open. It finishes, the way it did, and the dark '
            + 'beyond it turns out to have a direction in it.',
          'harmony +1 · will +0.1 · you are carrying less',
          {
            label: 'Go the way it opens',
            exit: 'release',
          },
        );
      }
    };

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;
        const here = EARTHBOUND.order[beat.id] ?? 0;
        const past = (id: string): boolean => here > (EARTHBOUND.order[id] ?? 0);

        setU(air.material, 'uTime', elapsed);
        room.update(elapsed, context.camera);
        cup.update(elapsed, context.camera);
        night.drift(delta, elapsed);
        own.update(elapsed, context.camera);
        onward.update(elapsed, context.camera);

        // Wall clock from the frame the answer landed on, so the response takes
        // the same real time however badly the frame rate is going.
        if (picked !== undefined && pickedAt === undefined) {
          pickedAt = elapsed;
        }
        const answered = pickedAt === undefined ? 0 : ease.out(Math.min(1, (elapsed - pickedAt) / 2.8));
        const reached = picked === 'reach' ? answered : 0;
        const released = picked === 'release' ? answered : 0;

        // The evening, going round. `ease.pulse` rises and falls, so the room
        // swells, thins almost out, and begins again — and it is the same
        // evening every time, which is the whole of what is wrong here.
        const turn = (elapsed % EVENING_SECONDS) / EVENING_SECONDS;
        const evening = 0.68 + ease.pulse(turn) * 0.36;
        // Once the player has reached for them, the room stops going round. The
        // light drops to a plateau and holds there: a flicker shorter than a
        // frame is not an event on a machine rendering at three frames a second,
        // and a held wrongness is worse anyway.
        const lamp = (1 - reached * 0.62) * (1 - released * 0.88);
        room.setPresence(Math.max(0.1, evening * lamp));
        setU(cup.material, 'uIntensity', 1.5 * Math.max(0.12, evening * lamp));

        // Closer, and never in. The drift stops short of the floor's near edge
        // and then eases back a little, because getting closer achieves nothing.
        const approach = beat.id === 'the-room' ? ease.out(t) : 1;
        context.rig.target.set(
          Math.sin(elapsed * 0.05) * 0.5,
          2.8 - released * 0.2,
          1.8 - approach * 1.6 + reached * 0.5 + released * 1.1,
        );

        // The player's own light rides just ahead of and below the eye, so they
        // see it rather than look out of it. It brightens when they reach, which
        // is the only effect the reaching has anywhere.
        // Low and off to one side rather than dead ahead: centred, a glow this
        // size is a lens flare, and it would also sit exactly where the question
        // goes.
        const at = context.rig.position;
        own.mesh.position.set(at.x * 0.6 - 2.2, at.y - 1.6, at.z - 3.5);
        setU(
          own.material,
          'uIntensity',
          (0.3 + context.soul.will * 0.3) * (1 + reached * 0.7) * (0.9 + Math.sin(elapsed * 0.6) * 0.1),
        );

        setU(onward.material, 'uIntensity', released * 1.5);

        grade.drain = 0.42 + reached * 0.14 - released * 0.1;
        grade.vignette = 0.58 + reached * 0.1 - released * 0.12;
        grade.grain = 0.13 + reached * 0.05;
        grade.aberration = 0.0032 + reached * 0.0035;
        context.post.setBloom(0.52 - reached * 0.14 + released * 0.2, 0.68, 0.58);

        context.audio.room(0.07 + reached * 0.06 - released * 0.05, 520 - reached * 180);
        context.audio.drone(0.17 + reached * 0.07 - released * 0.04, 44 - reached * 10, 7);
        context.audio.shimmer(0.05 + released * 0.12);

        // The question arrives fourteen seconds in, and the control is on screen
        // from that frame. It is created here rather than at load so the two
        // captions get read first — and it is created once.
        if ((beat.id === 'the-reach' || past('the-reach')) && prompt === undefined) {
          prompt = new ThresholdPrompt();
          prompt.releaseAfter(RELEASE_SECONDS, 'unanswered');
          prompt.ask('They are an arm away and they are not reachable. What do you do with that?', [
            {
              id: 'reach',
              label: 'Reach for them',
              detail: 'Make something in there move. It will cost you the strength you move with.',
              onPick: () => { choose('reach'); },
            },
            {
              id: 'release',
              label: 'Let the room go',
              detail: 'Stop holding the evening open. You arrive somewhere else lighter.',
              onPick: () => { choose('release'); },
            },
          ]);
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

// --- 2. mist: the inverted sphere ----------------------------------------------

const MIST_BEATS: readonly Beat[] = [
  { id: 'arriving', seconds: 6, caption: 'This is the same place. Something in it has turned over.' },
  { id: 'the-three', seconds: 7, caption: 'They have been coming to meet you for a long time.' },
  { id: 'the-question', seconds: 14 },
  { id: 'wait', seconds: 1, hold: true },
];

const MIST = indexBeats(MIST_BEATS);

/** How the three walk: seconds for one approach, and where in it each one starts. */
const MIST_WALKERS: readonly { readonly degrees: number; readonly seconds: number; readonly offset: number }[] = [
  { degrees: -24, seconds: 23, offset: 0.0 },
  { degrees: 6, seconds: 29, offset: 0.41 },
  { degrees: 31, seconds: 26, offset: 0.72 },
];

export const mistScene: SceneDefinition = {
  id: 'refuse.mist',
  title: 'The twilight land',
  discarnate: true,
  contentNotes: [
    'A lower sphere: grey fog, heavy grain, and figures that approach without ever arriving. '
      + 'Unsettling by design. Nothing is threatened and nothing happens suddenly.',
  ],
  exits: [
    { id: 'call', label: 'Call to them', to: 'refuse.void' },
    // Holding your own shape is the right answer and it does not get you out of
    // here, because the way out of the lower spheres is rescue (`L-FRAN-05`) and
    // `refuse.rescue` is not built. Until it is, holding carries the player back
    // to the earth plane they would not leave, which is at least true to the
    // shape of the road. Repoint this at `refuse.rescue` when it exists.
    { id: 'hold', label: 'Hold your own edge', to: 'refuse.earthbound' },
    { id: 'unanswered', label: 'Go on', to: 'refuse.earthbound' },
  ],
  create(context: SceneContext): SceneInstance {
    const { resources, scene } = context;

    // Everything in this scene is furniture borrowed from the Light and drained
    // (`L-DARK-02`: the same phenomenology, read with dread). Nothing new is
    // modelled, which is both the cheap way and the true one.
    // Bright, not dark. A first pass had this place at a mean luma of 15 and
    // it read as night, not as fog — "desaturated" is a statement about chroma,
    // and a lower sphere that is merely unlit is just an unlit scene. The dread
    // has to come from the grey being bright and giving nothing back.
    const air = airShell(resources, { radius: 95, ground: 0x3c3f49, glow: 0x878c99, density: 1 });
    scene.add(air.mesh);

    // The Council's floor, with the warmth taken out of it. It is opaque, which
    // is what stops the fog being a flat field: there is a surface receding.
    const ground = luminousGround(resources, {
      radius: 82,
      // Brighter near the player and sinking into the air's own grey at the
      // horizon, so the floor reads as lit ground under fog rather than as a
      // dark band with a hard seam across the middle of the frame.
      near: 0x7a7f8c,
      far: 0x5c606c,
      line: 0xd2d8e4,
      ringSpacing: 3.4,
    });
    scene.add(ground.mesh);

    /**
     * The Being of Light's own radiance shell, desaturated, and focused *under*
     * the floor.
     *
     * This is the single move the whole inversion rests on. A frame keeps its
     * sense of where its light is from, so putting the source below the horizon
     * makes a grey sky read as wrong rather than as overcast — the filaments
     * converge somewhere no light can be coming from.
     */
    const radiance = radianceShell(resources, { radius: 88, color: 0xd2d7df, accent: 0x686d7e });
    radiance.setFocus(0, -0.52, -0.85);
    radiance.setIntensity(0.4);
    scene.add(radiance.mesh);

    // The fog itself: grain with volume. Dense, slow, and the same grey as
    // everything else, so distance stops being readable past about fifteen
    // metres — which is why the three never resolve.
    const fog = moteField(resources, context.rng.stream('mist-fog'), {
      count: 2800,
      radius: 17,
      color: 0xe4e9f2,
      size: 0.42,
    });
    fog.points.position.y = 2;
    scene.add(fog.points);

    /**
     * The three who come to meet you (`L-THRESH-05`), lit from below.
     *
     * Same form as the loved ones at the Threshold, same construction, same
     * shader. The light vector is the inversion: a presence underlit is the
     * identical geometry reporting an impossible room.
     */
    const rng = context.rng.stream('mist-walkers');
    const walkers = MIST_WALKERS.map((spec, at) => {
      const angle = ((spec.degrees + rng.range(-5, 5)) * Math.PI) / 180;
      const figure = figureOfLight(resources, {
        height: 2.2 + rng.range(-0.18, 0.4),
        color: 0xf2f5fa,
        accent: 0x8e95a8,
        seed: rng.range(0, 40),
        light: [0.12, -0.74, 0.58],
      });
      scene.add(figure.group);
      return { figure, angle, seconds: spec.seconds, offset: spec.offset, at };
    });

    const director = new Director(MIST_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 8);
      }
    });

    context.rig.setMode('drifting');
    context.rig.position.set(0, 1.6, 2.2);
    context.rig.target.set(0, 1.6, 1.4);
    context.rig.orient(0, -0.04);
    context.rig.setSway(0.55);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    // Heavy grain and most of the colour gone, which is what GAME_BRIEF.md asks
    // the lower spheres for by name.
    grade.drain = 0.72;
    grade.grain = 0.2;
    // Lighter than the rest of Path B. A heavy vignette on a bright grey turns
    // it back into a dark scene, which is the thing this place must not be.
    grade.vignette = 0.38;
    grade.aberration = 0.0042;
    grade.distortion = 0.036;
    grade.exposure = 1.2;
    grade.washColor = [0.8, 0.82, 0.88];
    grade.washAmount = 0.03;
    grade.smear = 0;
    // Deliberately low. Bloom is how the Light gets its warmth, so this place
    // has almost none: the grey is bright and gives nothing off.
    context.post.setBloom(0.3, 0.8, 0.52);

    context.audio.drone(0.22, 47, 15);
    context.audio.room(0.1, 430);
    context.audio.ring(0.05, 1700);
    context.audio.heartbeat(false);

    let prompt: ThresholdPrompt | undefined;
    resources.onDispose(() => {
      prompt?.dispose();
      prompt = undefined;
    });

    let picked: 'call' | 'hold' | undefined;
    let pickedAt: number | undefined;

    const choose = (choice: 'call' | 'hold'): void => {
      if (picked !== undefined) {
        return;
      }
      picked = choice;
      if (choice === 'call') {
        context.soul.will = clamp01(context.soul.will - 0.2);
        context.soul.attachment = clamp01(context.soul.attachment + 0.15);
        prompt?.settle(
          'All three stop walking at once, which is not what you asked for. '
            + 'Whatever was coming to meet you was never going to arrive, and now it is not even coming.',
          'will −0.2 · you are carrying more',
          {
            label: 'Go where the floor stops',
            exit: 'call',
          },
        );
      } else {
        context.soul.will = clamp01(context.soul.will + 0.16);
        prompt?.settle(
          'You keep your own outline. The fog does not thin, but it stops being the shape '
            + 'of you — and something pulls, from the direction you came in from.',
          'will +0.16 · the pull is the house',
          {
            label: 'Let it pull',
            exit: 'hold',
          },
        );
      }
    };

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        const { beat, t } = director.state;
        const here = MIST.order[beat.id] ?? 0;
        const past = (id: string): boolean => here > (MIST.order[id] ?? 0);

        setU(air.material, 'uTime', elapsed);
        ground.update(elapsed);
        radiance.update(elapsed);
        fog.drift(delta, elapsed);

        if (picked !== undefined && pickedAt === undefined) {
          pickedAt = elapsed;
        }
        const answered = pickedAt === undefined ? 0 : ease.out(Math.min(1, (elapsed - pickedAt) / 3.2));
        const called = picked === 'call' ? answered : 0;
        const held = picked === 'hold' ? answered : 0;

        const arriving = beat.id === 'arriving' ? ease.out(t) : 1;
        radiance.setIntensity(0.4 + arriving * 0.3 - called * 0.1 + held * 0.08);

        // --- the walk that does not finish ---------------------------------
        // Each one closes from twenty-six metres to nine and fades out before it
        // gets there, then starts again from the fog. `ease.pulse` is why: it
        // rises and falls, so presence peaks halfway along the approach.
        const pools: [number, number, number][] = [];
        for (const walker of walkers) {
          // Frozen where they stand once the player has called out. Wall clock
          // up to that frame, so nothing jumps.
          const clock = pickedAt === undefined ? elapsed : pickedAt;
          const phase = ((clock / walker.seconds) + walker.offset) % 1;
          const distance = 26 - ease.out(phase) * 17;
          const x = Math.sin(walker.angle) * distance;
          const z = -Math.cos(walker.angle) * distance;
          walker.figure.group.position.set(x, 0, z);
          // Never past about half resolved. They are the same figures that
          // welcome the player in `threshold.loved-ones`, and the cruelty is
          // that this time the resolve stalls.
          const resolve = arriving * ease.pulse(phase) * 0.78 * (1 - called * 0.55);
          setU(walker.figure.material, 'uTime', elapsed);
          setU(walker.figure.material, 'uResolve', Math.max(0, resolve));
          pools.push([x, z, resolve * 0.5]);
        }
        ground.setPools(pools);

        // Barely any movement. Will is what moves a soul between spheres and the
        // player has not spent any yet, so the most this place allows is a drift.
        context.rig.target.set(
          Math.sin(elapsed * 0.037) * 0.8,
          1.6,
          1.4 - arriving * 0.5 + called * 0.4 - held * 0.5,
        );

        grade.drain = 0.7 + called * 0.1 - held * 0.12;
        grade.grain = 0.2 + called * 0.05 - held * 0.03;
        grade.vignette = 0.38 + called * 0.12 - held * 0.08;
        grade.aberration = 0.0042 + called * 0.003;
        grade.exposure = 1.2 - called * 0.08 + held * 0.06;
        context.post.setBloom(0.3 + held * 0.16, 0.8, 0.52);

        context.audio.drone(0.22 + called * 0.06 - held * 0.04, 47 - called * 9, 15);
        context.audio.room(0.1 + called * 0.05, 430 - called * 140);
        context.audio.ring(0.05 - called * 0.04 + held * 0.05, 1700 + held * 600);

        if ((beat.id === 'the-question' || past('the-question')) && prompt === undefined) {
          prompt = new ThresholdPrompt();
          prompt.releaseAfter(RELEASE_SECONDS, 'unanswered');
          prompt.ask('Three of them, closing, and none of them nearer than when you got here.', [
            {
              id: 'call',
              label: 'Call to them',
              detail: 'Ask the fog for company. It will answer with less than it had.',
              onPick: () => { choose('call'); },
            },
            {
              id: 'hold',
              label: 'Hold your own edge',
              detail: 'Refuse to be the same grey as the place. It takes will, and leaves you more.',
              onPick: () => { choose('hold'); },
            },
          ]);
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

// --- 3. void: the distressing-NDE void -----------------------------------------

const VOID_BEATS: readonly Beat[] = [
  { id: 'nothing', seconds: 6, caption: 'There is no one here. There has never been anyone here.' },
  { id: 'withdrawal', seconds: 7, caption: 'Those were yours. Watch where they go.' },
  { id: 'the-question', seconds: 14 },
  { id: 'wait', seconds: 1, hold: true },
];

const VOID = indexBeats(VOID_BEATS);

/**
 * The moments the void takes back, as places rather than as pictures.
 *
 * Each is one upright sheet of light at a distance — the review's vocabulary for
 * a presence, used here for an instant of a life. There is no image in any of
 * them and there is no text on them: what makes one a moment is that it is a
 * particular size at a particular distance, and what makes losing it mean
 * anything is that the player watched it be there first.
 */
/*
 * They hang above and ahead rather than standing at eye level. Two reasons, and
 * both are about the frame: the question occupies the lower third of the screen,
 * and a moment being taken back reads as something going up and away rather than
 * as a light switching off at head height.
 */
const VOID_MOMENTS: readonly {
  readonly at: readonly [number, number, number];
  readonly width: number;
  readonly height: number;
  readonly color: number;
}[] = [
  { at: [-2.9, 4.4, -8.0], width: 0.66, height: 1.8, color: 0xffcf9e },
  { at: [3.1, 3.2, -7.2], width: 0.58, height: 1.5, color: 0xffdcb4 },
  { at: [-6.2, 5.2, -11.0], width: 0.92, height: 2.3, color: 0xffc189 },
  { at: [5.6, 4.9, -11.8], width: 0.74, height: 1.7, color: 0xffd7a6 },
  { at: [-0.8, 6.4, -14.5], width: 1.1, height: 2.7, color: 0xffcb97 },
  { at: [8.4, 6.0, -15.2], width: 0.64, height: 1.9, color: 0xffe0bc },
  { at: [-9.0, 5.6, -16.0], width: 0.8, height: 2.1, color: 0xffc9a4 },
];

/** Seconds between one moment going out and the next. */
const WITHDRAW_EVERY = 2.4;

/**
 * What a withdrawn moment leaves behind.
 *
 * Not zero, for two reasons. The caption says "watch where they go", and
 * something that goes has to still be somewhere — a residue at the distance it
 * was is a recession rather than a light switch. And measured: taking them to
 * nothing put the frame at mean luma 7.4 with 0.26% of it lit by the time the
 * question landed, which is under the floor the gate holds every scene to and
 * is, more to the point, nothing to look at while deciding something.
 */
const WITHDRAWN_RESIDUE = 0.16;

export const voidScene: SceneDefinition = {
  id: 'refuse.void',
  title: 'The void',
  discarnate: true,
  // `L-DARK-03` is genuinely distressing material and a player is entitled to
  // know what this one is before it starts (CLAUDE.md § Content rules).
  contentNotes: [
    'An experience of nonexistence, from inside it: a featureless dark, and the conviction that '
      + 'you were never here at all. Grounded in published accounts of distressing near-death '
      + 'experiences. Nothing is shown happening to anybody, and nothing happens suddenly.',
  ],
  exits: [
    // Saying what is left is the refusal of the claim, and it climbs back to the
    // twilight land. It leads there rather than to `refuse.rescue` because that
    // scene is not built; repoint it when it is.
    { id: 'name', label: 'Say what is left', to: 'refuse.mist' },
    // Agreeing with the void ends the run, and the loop starts another life.
    // `L-BARDO-02`: this is a longer road, not a punishment, so the game hands
    // the player a beginning rather than a defeat.
    { id: 'yield', label: 'Let it be true', to: 'content-notes' },
    { id: 'unanswered', label: 'Go on', to: 'refuse.mist' },
  ],
  create(context: SceneContext): SceneInstance {
    const { resources, scene } = context;

    // Almost nothing, and not quite nothing: the air still has a gradient, which
    // is what keeps the frame from being a black rectangle while still reading
    // as a place with no features in it.
    const air = airShell(resources, { radius: 64, ground: 0x05050b, glow: 0x191726, density: 1 });
    scene.add(air.mesh);

    /**
     * The player, seen from outside themselves.
     *
     * The void's claim is that there was never anyone here, and the one thing in
     * frame that contradicts it is the player's own light. So it is placed ahead
     * of the eye rather than at it: they are looking at the evidence, and the
     * scene spends three beats arguing with it.
     */
    //
    // Small, and off to one side. At two and a half metres across and three in
    // front it filled the middle of the frame with one soft white mass — a flat
    // wash rather than an image, and the moments behind it could not be counted.
    // The player's light is the smallest lit thing here, which is the point.
    //
    // Bigger and softer than it looks like it should be: the glow's streaking
    // term is what gives it structure, and at a small screen size that
    // structure resolves into a visible seven-pointed star rather than into
    // light. Broad and dim reads as a body of light; small and bright reads as
    // a sprite.
    const own = volumetricGlow(resources, { radius: 1.75, color: 0xbcc6ff, intensity: 0.62, softness: 1.75 });
    own.mesh.position.set(-2.4, 0.3, -5.4);
    scene.add(own.mesh);

    const moments: { readonly panel: LuminousPanel; readonly base: number }[] = VOID_MOMENTS.map(
      (spec, at) => {
        const panel = luminousPanel(resources, {
          width: spec.width,
          height: spec.height,
          color: spec.color,
          intensity: 1.35,
          softness: 0.5,
          taper: 0.78,
          lean: -0.45,
          churn: 0.2,
          seed: at * 3.5,
          facing: 'upright',
        });
        panel.mesh.position.set(spec.at[0], spec.at[1], spec.at[2]);
        scene.add(panel.mesh);
        return { panel, base: 1.35 };
      },
    );

    /**
     * The order the moments go out in, and the one that is left.
     *
     * Drawn from the seeded stream, so a replay of a seed loses the same
     * moments in the same order. The last one standing is never the nearest:
     * being left with something you would not have chosen to keep is the part
     * of this that is worth building.
     */
    const order = (() => {
      const rng = context.rng.stream('void-withdrawal');
      const indices = moments.map((_, at) => at);
      // Fisher-Yates, through the seeded stream.
      for (let i = indices.length - 1; i > 0; i -= 1) {
        const j = rng.int(0, i);
        const a = indices[i];
        const b = indices[j];
        if (a !== undefined && b !== undefined) {
          indices[i] = b;
          indices[j] = a;
        }
      }
      return indices;
    })();
    /** Held back from the withdrawal: the frame always keeps one of them. */
    const kept = order[order.length - 1] ?? 0;

    // Points far enough off to be other people, sparse enough to be nothing.
    // `L-DARK-03`'s emptiness is not an empty room, it is a room with no one in
    // it however long you look.
    const faraway = moteField(resources, context.rng.stream('void-faraway'), {
      count: 520,
      radius: 26,
      color: 0x8b93cc,
      size: 0.32,
    });
    scene.add(faraway.points);

    const director = new Director(VOID_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 9);
      }
    });

    context.rig.setMode('drifting');
    context.rig.position.set(0, 1.5, 0);
    context.rig.target.set(0, 1.5, 0);
    // Tilted up at them, which is also what keeps them out from behind the
    // question.
    context.rig.orient(0, 0.17);
    // Almost no sway. There is no air in here to be moved by.
    context.rig.setSway(0.18);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.5;
    grade.grain = 0.15;
    // The heaviest vignette in the game. The frame is closing, and it is closing
    // on the one lit thing in it.
    grade.vignette = 0.7;
    grade.aberration = 0.0036;
    grade.distortion = 0.046;
    grade.exposure = 1.26;
    grade.washColor = [0.72, 0.74, 0.95];
    grade.washAmount = 0.015;
    grade.smear = 0;
    context.post.setBloom(0.56, 0.72, 0.44);

    // Lower than anything else in the game, and almost nothing above it.
    context.audio.drone(0.2, 31, 2);
    context.audio.room(0.03, 170);
    context.audio.shimmer(0.02);
    context.audio.heartbeat(false);

    let prompt: ThresholdPrompt | undefined;
    resources.onDispose(() => {
      prompt?.dispose();
      prompt = undefined;
    });

    let picked: 'name' | 'yield' | undefined;
    let pickedAt: number | undefined;

    const choose = (choice: 'name' | 'yield'): void => {
      if (picked !== undefined) {
        return;
      }
      picked = choice;
      if (choice === 'name') {
        // Refusing the claim is a release of it, which is what harmony measures,
        // and it is the first thing on this road that gives will back.
        context.soul.harmony += 1;
        context.soul.will = clamp01(context.soul.will + 0.22);
        context.soul.attachment = clamp01(context.soul.attachment - 0.1);
        prompt?.settle(
          'You name the one that is left. It is not the one you would have kept, and it holds. '
            + 'The others come back faint, at the distance they were.',
          'harmony +1 · will +0.22 · you are carrying less',
          {
            label: 'Climb back toward the grey',
            exit: 'name',
          },
        );
      } else {
        context.soul.will = clamp01(context.soul.will - 0.3);
        context.soul.attachment = clamp01(context.soul.attachment + 0.25);
        prompt?.settle(
          'You agree with it. Everything goes except the light you are, which turns out not to be '
            + 'yours to put out — and somewhere a long way off, something begins again.',
          'will −0.3 · you are carrying more · the run ends here',
          {
            label: 'Begin again',
            exit: 'yield',
          },
        );
      }
    };

    return {
      update(delta, elapsed) {
        director.updateTo(elapsed);
        // Only the beat id is read. Every ramp in this scene is keyed by beat id
        // or by wall clock, never by a beat's own `t` or by its index, so
        // inserting a beat cannot silently retarget one of them.
        const { beat } = director.state;
        const here = VOID.order[beat.id] ?? 0;
        const past = (id: string): boolean => here > (VOID.order[id] ?? 0);

        setU(air.material, 'uTime', elapsed);
        own.update(elapsed, context.camera);
        faraway.drift(delta, elapsed);
        for (const moment of moments) {
          moment.panel.update(elapsed, context.camera);
        }

        if (picked !== undefined && pickedAt === undefined) {
          pickedAt = elapsed;
        }
        const answered = pickedAt === undefined ? 0 : ease.out(Math.min(1, (elapsed - pickedAt) / 3.6));
        const named = picked === 'name' ? answered : 0;
        const yielded = picked === 'yield' ? answered : 0;

        // The moments are there from the first second — a thing has to be
        // present before taking it away is an event — and they come up fast.
        const arrived = ease.out(Math.min(1, elapsed / 1.2));

        // --- the withdrawal ------------------------------------------------
        // Wall clock from the frame `withdrawal` began, so the sequence takes
        // the same real time at any frame rate. One goes every 1.7 seconds, in
        // the seeded order, and the last of that order is never taken.
        const withdrawalStart = VOID.seconds['nothing'] ?? 6;
        const since = Math.max(0, director.state.elapsed - withdrawalStart);
        const gone = Math.floor(since / WITHDRAW_EVERY);

        for (const [at, moment] of moments.entries()) {
          const place = order.indexOf(at);
          let presence = arrived;
          if (at !== kept) {
            // A fade rather than a cut: it is being withdrawn, not switched off.
            const leavesAt = place * WITHDRAW_EVERY;
            const leaving = ease.inOut(Math.min(1, Math.max(0, (since - leavesAt) / 1.6)));
            presence *= 1 - leaving * (1 - WITHDRAWN_RESIDUE);
            // Naming brings them back, faint, at the distance they were.
            presence = Math.max(presence, named * 0.26 * arrived);
          } else {
            // The one that is left. It brightens when it is named and goes with
            // everything else when the player agrees with the void.
            // Brighter than the rest from the start, so that when it is the only
            // one at full strength the frame still has a subject.
            presence *= 1.5 + named * 1.1;
          }
          presence *= 1 - yielded;
          setU(moment.panel.material, 'uIntensity', moment.base * presence);
        }

        // --- the player's own light ----------------------------------------
        // The one thing the void cannot take, including from someone who agrees
        // with it. It dims and it does not go out.
        setU(
          own.material,
          'uIntensity',
          (0.4 + context.soul.will * 0.34 + named * 0.4 - yielded * 0.2)
            * (0.9 + Math.sin(elapsed * 0.45) * 0.1),
        );
        own.mesh.position.set(-2.4, 0.3 + named * 0.18, -5.4 + yielded * 0.7);

        // Nowhere to go, so the drift is almost nothing — and a shade closer to
        // their own light once they have named something.
        context.rig.target.set(0, 1.5, -named * 0.5 + yielded * 0.7);

        // Darker and tighter as the moments go, then opening a little on the
        // answer. `gone` is only read for the sound and the frame's close: it is
        // never used to key a per-beat ramp.
        const emptying = Math.min(1, gone / Math.max(1, moments.length - 1));
        grade.vignette = 0.7 + emptying * 0.1 - named * 0.16 + yielded * 0.08;
        grade.drain = 0.5 + emptying * 0.1 - named * 0.2 + yielded * 0.12;
        grade.exposure = 1.26 - emptying * 0.06 + named * 0.08;
        grade.distortion = 0.046 + emptying * 0.012 - named * 0.014;
        context.post.setBloom(0.56 + named * 0.22, 0.72, 0.44);

        context.audio.drone(0.2 + emptying * 0.05 - named * 0.04, 31 - emptying * 4, 2);
        context.audio.room(0.03 + emptying * 0.03, 170);
        context.audio.shimmer(0.02 + named * 0.14);

        if ((beat.id === 'the-question' || past('the-question')) && prompt === undefined) {
          prompt = new ThresholdPrompt();
          prompt.releaseAfter(RELEASE_SECONDS, 'unanswered');
          prompt.ask('It says there was never anyone here. One thing of yours is still lit.', [
            {
              id: 'name',
              label: 'Say what is left',
              detail: 'Name the one that held. It costs nothing and it is the hardest thing here.',
              onPick: () => { choose('name'); },
            },
            {
              id: 'yield',
              label: 'Let it be true',
              detail: 'Agree with it. The run ends, and another life begins without you in it.',
              onPick: () => { choose('yield'); },
            },
          ]);
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
