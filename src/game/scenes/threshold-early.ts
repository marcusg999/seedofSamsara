import {
  AdditiveBlending,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { setU } from '../systems/glsl';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { GRAMMAR } from '../systems/palette';
import { Director, ease, type Beat } from '../systems/director';
import { airShell, figureOfLight, moteField, volumetricGlow } from '../systems/forms';

/**
 * The first three Threshold elements, from Moody's recurring sequence
 * (lore bible § 2): hearing yourself pronounced dead, the buzzing, and the
 * out-of-body view.
 *
 * These are the first scenes judged against the wordless, scale-driven bar, so
 * the rules change from the vignette: almost no text, no interface, and the awe
 * comes from how much space there suddenly is after a room with a low ceiling.
 */

// --- the decision prompt -------------------------------------------------------

/**
 * The Threshold's decision prompt.
 *
 * Moody's sequence is a corridor of things that happen to you, and read straight
 * it plays as a slideshow: the player watched seven scenes and pressed the same
 * button seven times. But the sources do not describe a passive corridor. The
 * Bardo Thödol's whole structure is a series of recognitions the traveller
 * either makes or fails to make (`L-BARDO-02`, `L-BARDO-03`), and Moody's own
 * elements are reported as things attended to — the body, the people in the
 * room, the border (`L-THRESH-03`, `L-THRESH-08`). So every element in the
 * corridor asks one question, and the answer moves the ledger.
 *
 * It lives beside the first scene that uses it rather than in `systems/` because
 * it is specific to the Threshold's grammar: one question, two answers, the
 * trade legible before committing, and never more than two.
 *
 * Non-modal on purpose. The scene keeps playing and the look controls keep
 * working behind it, because the question is about what you attend to, and a
 * modal that hides the scene would take the thing being chosen off screen.
 */
export interface PromptOption {
  readonly id: string;
  readonly label: string;
  /** One short line, so the trade is legible before committing to it. */
  readonly detail: string;
  readonly onPick: () => void;
}

export class ThresholdPrompt {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private disposed = false;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.className = 'prompt';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'What you do with this');
    // Styled here rather than in styles.css so the widget is self-contained:
    // it sits above the caption line, and nothing else in the game claims that
    // band of the screen.
    const frame = this.root.style;
    frame.position = 'fixed';
    frame.left = '0';
    frame.right = '0';
    frame.bottom = '16vh';
    frame.display = 'flex';
    frame.justifyContent = 'center';
    frame.padding = '0 1.5rem';
    // The scene is still being looked at behind this, so only the panel itself
    // takes the pointer.
    frame.pointerEvents = 'none';
    frame.opacity = '0';
    frame.transition = 'opacity 600ms ease';

    this.panel = document.createElement('div');
    const panel = this.panel.style;
    panel.pointerEvents = 'auto';
    panel.maxWidth = '38rem';
    panel.display = 'flex';
    panel.flexDirection = 'column';
    panel.alignItems = 'center';
    panel.gap = '0.85rem';
    panel.padding = '1rem 1.35rem';
    panel.borderRadius = '3px';
    // Its own backdrop, so the question stays readable against the Light as well
    // as against the dark — the same reason the caption line carries one.
    panel.background = 'rgba(10, 8, 16, 0.6)';
    panel.setProperty('backdrop-filter', 'blur(3px)');
    panel.textAlign = 'center';

    this.root.appendChild(this.panel);
    parent.appendChild(this.root);

    // Fade in on the next frame so the transition actually runs. The buttons are
    // clickable immediately: the fade is for the eye, not a gate on acting.
    requestAnimationFrame(() => {
      if (!this.disposed) {
        this.root.style.opacity = '1';
      }
    });
  }

  /** Ask the scene's question. Two options; the prompt refuses to take more. */
  ask(question: string, options: readonly PromptOption[]): void {
    if (options.length < 2 || options.length > 2) {
      throw new Error(`A Threshold question takes exactly two answers, got ${String(options.length)}`);
    }
    this.panel.replaceChildren();
    this.panel.appendChild(line(question, 'question'));

    const row = document.createElement('div');
    const style = row.style;
    style.display = 'flex';
    style.flexWrap = 'wrap';
    style.justifyContent = 'center';
    style.alignItems = 'flex-start';
    style.gap = '0.9rem';

    for (const option of options) {
      const column = document.createElement('div');
      column.style.display = 'flex';
      column.style.flexDirection = 'column';
      column.style.alignItems = 'center';
      column.style.gap = '0.4rem';
      column.style.maxWidth = '14rem';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'overlay__button';
      button.textContent = option.label;
      // So a test can drive a choice by what it is, not by button order.
      button.dataset['choice'] = option.id;
      button.addEventListener('click', () => {
        option.onPick();
      });

      column.append(button, line(option.detail, 'detail'));
      row.appendChild(column);
    }

    this.panel.appendChild(row);
  }

  /**
   * Replace the question with what the choice did, and the one way onward. The
   * onward button is live immediately, so a player who wants to move faster can
   * always move: nothing here waits out a timer.
   */
  settle(outcome: string, ledger: string, onward: { id: string; label: string; onPick: () => void }): void {
    this.panel.replaceChildren();
    this.panel.appendChild(line(outcome, 'question'));
    this.panel.appendChild(line(ledger, 'ledger'));

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'overlay__button';
    button.textContent = onward.label;
    button.dataset['choice'] = onward.id;
    button.addEventListener('click', () => {
      onward.onPick();
    });
    this.panel.appendChild(button);
  }

  dispose(): void {
    this.disposed = true;
    this.root.remove();
  }
}

function line(text: string, kind: 'question' | 'detail' | 'ledger'): HTMLParagraphElement {
  const element = document.createElement('p');
  element.textContent = text;
  const style = element.style;
  style.margin = '0';
  style.fontWeight = '300';
  style.lineHeight = '1.5';
  if (kind === 'question') {
    style.fontSize = 'clamp(0.98rem, 2.2vw, 1.22rem)';
    style.color = '#f4f0f8';
  } else if (kind === 'detail') {
    style.fontSize = '0.8rem';
    style.color = '#b7afcb';
  } else {
    style.fontSize = '0.78rem';
    style.letterSpacing = '0.04em';
    style.color = '#9d96b4';
  }
  return element;
}

/** Will and attachment are 0..1 resources, so every move into them is clamped. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The room as it is remembered rather than as it was: an outline in light with a
 * few specific things still in it.
 *
 * This is the research talking. Veridical out-of-body recall is rare and sparse
 * (lore bible `L-ARREST-03` puts explicit recall of real events at about 2% of
 * survivors), so the strongest reports look like a handful of exact details in an
 * otherwise vague scene. Rendering the full kitchen from above would be the
 * wrong claim as well as the wrong feeling.
 */
function rememberedRoom(
  context: SceneContext,
  glowColor: number,
  options: { living?: boolean } = {},
): {
  group: Group;
  update: (delta: number, elapsed: number) => void;
  setPresence: (value: number) => void;
  /** How brightly the warmth on the floor — the body — reads. */
  setBody: (value: number) => void;
  /**
   * The two who are still alive in the room. 0 leaves them as a suggestion in
   * the glow; 1 resolves them. Empty unless the room was asked for them.
   */
  setLiving: (value: number) => void;
} {
  const { resources } = context;
  const group = new Group();

  const width = 5.4;
  const depth = 6.2;
  const height = 2.7;
  const hw = width / 2;
  const hd = depth / 2;

  // Only the edges. An outline carries a room with a fraction of the geometry and
  // reads as recollection rather than as architecture.
  const corners: [number, number, number][] = [
    [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
    [-hw, height, -hd], [hw, height, -hd], [hw, height, hd], [-hw, height, hd],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const vertices: number[] = [];
  for (const [a, b] of edges) {
    const from = corners[a];
    const to = corners[b];
    if (!from || !to) {
      continue;
    }
    vertices.push(...from, ...to);
  }
  const lineGeometry = resources.track(new BufferGeometry());
  lineGeometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  const lineMaterial = resources.track(
    new LineBasicMaterial({ color: glowColor, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
  );
  const outline = new LineSegments(lineGeometry, lineMaterial);
  group.add(outline);

  // The details that survive: the window, the two cups, the kettle's steam, and a
  // soft warmth on the floor where he is. The form on the floor is a glow and
  // nothing else — there is no body model in this game.
  const windowGlow = volumetricGlow(resources, { radius: 1.6, color: 0xa8d0ec, intensity: 2.2, softness: 2.0 });
  windowGlow.mesh.position.set(0, 1.62, -hd);
  group.add(windowGlow.mesh);

  const cupMaterial = resources.track(
    new MeshBasicMaterial({ color: 0xe8dfd2, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }),
  );
  const cupGeometry = resources.track(new CylinderGeometry(0.05, 0.042, 0.1, 14));
  for (const [x, z] of [[-0.26, 0.66], [0.46, 0.84]] as const) {
    const cup = new Mesh(cupGeometry, cupMaterial);
    cup.position.set(x, 0.84, z);
    group.add(cup);
  }

  const restingGlow = volumetricGlow(resources, { radius: 1.25, color: 0xffc89a, intensity: 1.5, softness: 2.8 });
  restingGlow.mesh.position.set(0.35, 0.16, 1.4);
  restingGlow.mesh.scale.set(1.5, 0.35, 0.95);
  group.add(restingGlow.mesh);

  const steam = moteField(resources, context.rng.stream('remembered-steam'), {
    count: 70,
    radius: 0.34,
    color: 0xcfe2ef,
    size: 0.03,
  });
  steam.points.position.set(-1.1, 1.3, -hd + 0.42);
  group.add(steam.points);

  // The two who are still alive in it: one at his side, one stopped in the
  // doorway. Abstract presences, never characters — and they are here before the
  // player is asked anything about them, because a choice between the body and
  // the living is only legible if both are already in frame (`L-THRESH-03`).
  const livingRng = context.rng.stream('remembered-living');
  const living = options.living !== true
    ? []
    : ([
      { x: 1.05, z: 1.15, height: 1.44, color: 0xffd2a8, accent: 0xc08a58 },
      { x: -1.85, z: hd - 0.5, height: 1.58, color: 0xd8e0ff, accent: 0x7f8ad0 },
    ] as const).map((spec) => {
      const figure = figureOfLight(resources, {
        height: spec.height,
        color: spec.color,
        accent: spec.accent,
        seed: livingRng.range(0, 40),
      });
      figure.group.position.set(spec.x, 0, spec.z);
      group.add(figure.group);
      const halo = volumetricGlow(resources, {
        radius: 0.85,
        color: spec.color,
        intensity: 0.22,
        softness: 2.6,
      });
      halo.mesh.position.set(spec.x, spec.height * 0.55, spec.z);
      group.add(halo.mesh);
      return { figure, halo, phase: livingRng.range(0, Math.PI * 2) };
    });

  let presence = 1;
  let bodyGlow = 1;
  let attended = 0;

  return {
    group,
    update(delta, elapsed) {
      windowGlow.update(elapsed, context.camera);
      restingGlow.update(elapsed, context.camera);
      steam.drift(delta, elapsed);
      for (const entry of living) {
        setU(entry.figure.material, 'uTime', elapsed);
        setU(entry.figure.material, 'uResolve', Math.min(1, presence * (0.3 + attended * 0.7)));
        entry.halo.update(elapsed, context.camera);
        setU(
          entry.halo.material,
          'uIntensity',
          presence * (0.18 + attended * 0.5) + Math.sin(elapsed * 0.5 + entry.phase) * 0.04,
        );
      }
    },
    setPresence(value) {
      presence = value;
      lineMaterial.opacity = 0.85 * value;
      cupMaterial.opacity = 0.9 * value;
      setU(windowGlow.material, 'uIntensity', 2.2 * value);
      setU(restingGlow.material, 'uIntensity', 1.5 * value * bodyGlow);
    },
    setBody(value) {
      bodyGlow = value;
      setU(restingGlow.material, 'uIntensity', 1.5 * presence * bodyGlow);
    },
    setLiving(value) {
      attended = Math.min(1, Math.max(0, value));
    },
  };
}

// --- hearing yourself pronounced dead ------------------------------------------

const PRONOUNCED_BEATS: readonly Beat[] = [
  { id: 'voices', seconds: 8 },
  { id: 'the-words', seconds: 10, caption: 'Someone says a time out loud.' },
  { id: 'apart', seconds: 14 },
  { id: 'wait', seconds: 1, hold: true },
];

export const pronouncedDeadScene: SceneDefinition = {
  id: 'threshold.pronounced-dead',
  title: 'A time, said out loud',
  // The question is whether the hour is true. Both answers leave by the same
  // door, so the exit id is the decision: the state machine's declared exits
  // then describe what the player actually did here, and the gate drives both.
  exits: [
    { id: 'accept', label: 'Take the hour as true', to: 'threshold.buzzing' },
    { id: 'refuse', label: 'Refuse the hour', to: 'threshold.buzzing' },
  ],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.dying;
    const air = airShell(context.resources, { radius: 70, ground: grammar.ground, glow: 0x2a2838, density: 1 });
    context.scene.add(air.mesh);

    const room = rememberedRoom(context, grammar.glow);
    context.scene.add(room.group);
    room.setPresence(0.85);

    const director = new Director(PRONOUNCED_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 7);
      }
    });

    // Still on the floor, still facing what the body was facing. The change is
    // that the view no longer quite belongs to it.
    context.rig.setMode('drifting');
    context.rig.position.set(0.35, 0.3, 1.9);
    context.rig.target.set(0.35, 0.62, 1.7);
    context.rig.orient(Math.PI * 0.04, 0.12);
    context.rig.setSway(0.5);
    context.rig.setRoll(0.45);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = grammar.drain;
    grade.grain = grammar.grain;
    grade.vignette = 0.74;
    grade.aberration = 0.0038;
    grade.distortion = 0.06;
    grade.exposure = 1.5;
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(grammar.bloom, 0.6, 0.75);

    // Voices, heard as shape rather than as speech: a low formant-ish drone with
    // no words in it. Nothing is intelligible, which is the point.
    context.audio.room(0.14, 300);
    context.audio.drone(0.17, 96, 4);
    context.audio.ring(0.16, 2300);
    context.audio.heartbeat(false);

    /**
     * The first Threshold element is hearing yourself pronounced dead
     * (`L-THRESH-01`), and what a person does with that hour is not settled by
     * hearing it. So the scene asks, at once, and the answer is the first thing
     * the afterlife knows about this soul.
     *
     * Taking it as true is a release, which is what HARMONY measures
     * (GAME_BRIEF.md § Systems: harmony rises through rescue, forgiveness,
     * release). Refusing it is a grip, which is what WILL is — the resource
     * Path B spends to move and to resist being pulled — bought with weight.
     */
    let picked: 'accept' | 'refuse' | undefined;
    let pickedAt: number | undefined;
    let prompt: ThresholdPrompt | undefined = new ThresholdPrompt();

    const choose = (choice: 'accept' | 'refuse'): void => {
      if (picked !== undefined) {
        return;
      }
      picked = choice;
      if (choice === 'accept') {
        context.soul.harmony += 1;
        context.soul.attachment = clamp01(context.soul.attachment - 0.12);
        prompt?.settle(
          'You stop arguing with the hour. The room goes on without you, and the sound of it thins.',
          'harmony +1 · you are carrying less',
          { id: 'accept', label: 'Listen to what is left', onPick: () => { void context.takeExit('accept'); } },
        );
      } else {
        context.soul.will = clamp01(context.soul.will + 0.18);
        context.soul.attachment = clamp01(context.soul.attachment + 0.18);
        prompt?.settle(
          'You hold the room where it is. It brightens, it gets loud, and not one of them hears you.',
          'will +0.18 · you are carrying more',
          { id: 'refuse', label: 'Listen to what is left', onPick: () => { void context.takeExit('refuse'); } },
        );
      }
    };

    prompt.ask('They have said the hour. Is it yours?', [
      {
        id: 'accept',
        label: 'Take the hour as true',
        detail: 'Let go of the room. You arrive lighter.',
        onPick: () => { choose('accept'); },
      },
      {
        id: 'refuse',
        label: 'Refuse the hour',
        detail: 'Hold on. The grip is yours to keep, and so is the weight.',
        onPick: () => { choose('refuse'); },
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
        room.update(delta, elapsed);

        // The room thins as the scene goes on: not fading to black, loosening.
        const apart = beat.id === 'apart' ? ease.inOut(t) : beat.id === 'wait' ? 1 : 0;

        // Wall clock, from the frame the choice landed on. Never accumulated per
        // frame, so the response takes the same real time at any frame rate.
        if (picked !== undefined && pickedAt === undefined) {
          pickedAt = elapsed;
        }
        const answered = pickedAt === undefined ? 0 : ease.out(Math.min(1, (elapsed - pickedAt) / 3.5));
        const held = picked === 'refuse' ? answered : 0;
        const released = picked === 'accept' ? answered : 0;

        room.setPresence(0.85 - apart * 0.45 + held * 0.3 - released * 0.3);
        context.rig.setRoll(0.45 - apart * 0.3 + held * 0.12);
        context.rig.target.set(0.35, 0.62 + apart * 0.5, 1.7 - apart * 0.2);

        grade.drain = grammar.drain + apart * 0.08 - released * 0.14;
        grade.vignette = 0.74 - apart * 0.1 + held * 0.08 - released * 0.14;
        grade.grain = grammar.grain + held * 0.06;
        grade.aberration = 0.0038 + held * 0.004;
        context.post.setBloom(grammar.bloom + released * 0.35, 0.6, 0.75);

        // Refusing turns the voices up and keeps them close; accepting lets them
        // recede and opens the ring out into whatever comes next.
        context.audio.room(0.14 + held * 0.1 - released * 0.09, 300);
        context.audio.drone(0.17 - apart * 0.06 + held * 0.08 - released * 0.05, 96 - apart * 20, 4);
        context.audio.ring(0.16 + apart * 0.1 - held * 0.1 + released * 0.08, 2300 + apart * 200 + released * 500);
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

// --- the buzzing ---------------------------------------------------------------

const BUZZING_BEATS: readonly Beat[] = [
  { id: 'rising', seconds: 8 },
  { id: 'everything', seconds: 10 },
  { id: 'wait', seconds: 1, hold: true },
];

export const buzzingScene: SceneDefinition = {
  id: 'threshold.buzzing',
  title: 'The sound of it',
  exits: [
    { id: 'go-with-it', label: 'Go with the sound', to: 'threshold.out-of-body' },
    { id: 'hold-together', label: 'Hold yourself together', to: 'threshold.out-of-body' },
  ],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    // This beat sits between the dying grammar and the out-of-body one, and
    // takes its own lighter ground so the field has something to read against.
    const air = airShell(context.resources, { radius: 70, ground: 0x15121f, glow: 0x5a4f80, density: 1 });
    context.scene.add(air.mesh);

    // The room has come apart into the sound. What is left is a field of
    // vibrating motes where the geometry used to be.
    // This beat is the room coming apart into the sound, so the field has to be
    // genuinely dense and present — at the previous size it measured as an empty
    // frame, which is not "dark and unsettling", it is nothing on screen.
    const field = moteField(context.resources, context.rng.stream('buzz'), {
      count: 3200,
      radius: 7,
      color: 0xf0e6ff,
      size: 0.55,
    });
    context.scene.add(field.points);

    const director = new Director(BUZZING_BEATS);

    context.rig.setMode('drifting');
    context.rig.position.set(0, 0.8, 1.2);
    context.rig.target.set(0, 1.1, 0.2);
    context.rig.orient(0, 0.05);
    context.rig.setSway(0.7);
    context.rig.setRoll(0.12);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.8;
    grade.grain = 0.2;
    grade.vignette = 0.7;
    grade.aberration = 0.006;
    grade.distortion = 0.09;
    grade.exposure = 1.45;
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(0.6, 0.7, 0.69);

    context.audio.room(0.1, 240);
    context.audio.ring(0.34, 2600);
    context.audio.drone(0.2, 70);
    context.audio.heartbeat(false);

    /**
     * The buzzing or ringing is the second of Moody's elements (`L-THRESH-02`),
     * and it is the first thing that happens *to* the player rather than around
     * them. So the question is physical: go with it, or brace.
     *
     * Bracing is a use of WILL and it costs weight. Going with it is a release,
     * and HARMONY is what the brief measures release with.
     */
    let picked: 'go-with-it' | 'hold-together' | undefined;
    let pickedAt: number | undefined;
    let prompt: ThresholdPrompt | undefined = new ThresholdPrompt();

    const choose = (choice: 'go-with-it' | 'hold-together'): void => {
      if (picked !== undefined) {
        return;
      }
      picked = choice;
      if (choice === 'go-with-it') {
        context.soul.harmony += 1;
        context.soul.attachment = clamp01(context.soul.attachment - 0.15);
        prompt?.settle(
          'You stop bracing. The sound blows the last of the room outward and resolves into one low note.',
          'harmony +1 · you are carrying less',
          { id: 'go-with-it', label: 'Leave the room', onPick: () => { void context.takeExit('go-with-it'); } },
        );
      } else {
        context.soul.will = clamp01(context.soul.will + 0.2);
        context.soul.attachment = clamp01(context.soul.attachment + 0.15);
        prompt?.settle(
          'You hold. The field closes in around you, shrill and tight, and you are still a shape it did not take.',
          'will +0.2 · you are carrying more',
          { id: 'hold-together', label: 'Leave the room', onPick: () => { void context.takeExit('hold-together'); } },
        );
      }
    };

    prompt.ask('The sound is taking the room apart. And you.', [
      {
        id: 'go-with-it',
        label: 'Go with the sound',
        detail: 'Let it have the room. It resolves into something you can travel in.',
        onPick: () => { choose('go-with-it'); },
      },
      {
        id: 'hold-together',
        label: 'Hold yourself together',
        detail: 'Stay a shape. Holding is will, and will is what moves you later.',
        onPick: () => { choose('hold-together'); },
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
        field.drift(delta, elapsed);
        field.points.rotation.y = elapsed * 0.03;

        const intensity = beat.id === 'rising' ? ease.out(t) : 1;

        if (picked !== undefined && pickedAt === undefined) {
          pickedAt = elapsed;
        }
        const answered = pickedAt === undefined ? 0 : ease.out(Math.min(1, (elapsed - pickedAt) / 3.5));
        const braced = picked === 'hold-together' ? answered : 0;
        const given = picked === 'go-with-it' ? answered : 0;

        // The field answers the choice in the one way it can: bracing closes it
        // in around the player, going with it lets it fly apart.
        field.points.scale.setScalar(1 - braced * 0.45 + given * 0.6);

        // The ring climbs and the frame starts to disagree with itself. This is
        // the loudest the slice ever gets, and it is brief on purpose.
        context.audio.ring(0.34 + intensity * 0.2 + braced * 0.16 - given * 0.4, 2600 + intensity * 900 + braced * 700);
        context.audio.drone(0.2 + intensity * 0.08 + given * 0.16, 70 - intensity * 14 - given * 18);
        grade.aberration = 0.006 + intensity * 0.009 + braced * 0.008 - given * 0.011;
        grade.distortion = 0.09 + intensity * 0.05 + braced * 0.05 - given * 0.09;
        grade.grain = 0.2 + intensity * 0.06 + braced * 0.07 - given * 0.12;
        grade.vignette = 0.7 - intensity * 0.12 + braced * 0.1 - given * 0.2;
        grade.drain = 0.8 - given * 0.3;
        context.post.setBloom(0.6 + intensity * 0.35 + given * 0.4, 0.7, 0.69);
        context.rig.setRoll(0.12 + Math.sin(elapsed * 0.7) * 0.03 * intensity + braced * 0.1);
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

// --- the out-of-body view -------------------------------------------------------

const LIFT_BEATS: readonly Beat[] = [
  { id: 'above', seconds: 8 },
  { id: 'looking-down', seconds: 14, caption: 'That is the room. He is still in it.' },
  { id: 'rising', seconds: 14 },
  { id: 'away', seconds: 12 },
  { id: 'wait', seconds: 1, hold: true },
];

export const outOfBodyScene: SceneDefinition = {
  id: 'threshold.out-of-body',
  title: 'From above',
  exits: [
    { id: 'the-body', label: 'Stay with your own body', to: 'threshold.tunnel' },
    { id: 'the-living', label: 'Stay with the ones in the room', to: 'threshold.tunnel' },
  ],
  discarnate: true,
  create(context: SceneContext): SceneInstance {
    const grammar = GRAMMAR.outside;
    const air = airShell(context.resources, { radius: 90, ground: grammar.ground, glow: 0x24384a, density: 1 });
    context.scene.add(air.mesh);

    // The room with the living still in it, because this is the scene whose
    // question is which of the two the player attends to (`L-THRESH-03`).
    const room = rememberedRoom(context, grammar.glow, { living: true });
    context.scene.add(room.group);

    // Other lights, further off. A city of other lives, none of them aware.
    // The other lives, seen from above. Large and bright enough to give the lift
    // something to be measured against — without them the frame has no scale and
    // no lit pixel at all.
    const distant = moteField(context.resources, context.rng.stream('distant'), {
      count: 1600,
      radius: 46,
      color: 0xdce9f4,
      size: 0.5,
    });
    context.scene.add(distant.points);

    const director = new Director(LIFT_BEATS);
    director.onBeat((beat) => {
      if (beat.caption !== undefined) {
        context.captions.show(beat.caption, 8);
      }
    });

    // The lift is authored, but look is still the player's. Movement the player
    // cannot stop plus attention the player keeps is the whole feeling here.
    const start = new Vector3(0.35, 3.1, 2.4);
    context.rig.setMode('drifting');
    context.rig.position.copy(start);
    context.rig.target.copy(start);
    context.rig.orient(Math.PI * 0.02, -0.62);
    context.rig.setSway(0.42);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = grammar.drain;
    grade.grain = grammar.grain;
    grade.vignette = 0.5;
    grade.aberration = 0.0016;
    grade.distortion = 0.03;
    grade.exposure = 1.3;
    grade.washAmount = 0;
    grade.smear = 0;
    context.post.setBloom(grammar.bloom, 0.62, 0.75);

    context.audio.room(0.1, 520);
    context.audio.drone(0.15, 52, 2);
    context.audio.ring(0.1, 2500);
    context.audio.heartbeat(false);

    /**
     * The out-of-body element is reported as a point of view that separates from
     * the body and observes it (`L-THRESH-03`), and the reports split on what the
     * attention went to: the body and what was being done to it, or the people in
     * the room. That split is the choice.
     *
     * Staying with the body keeps a tie to the form: weight, and the grip that
     * WILL measures. Staying with the living is the harder one, because being
     * present to what your death is doing to someone is an effect on another
     * person, felt — which is exactly what the brief says KARMA is a ledger of,
     * "not a good/evil meter". It enters as a debt, the way the life review
     * enters the call she did not get, and HARMONY rises because the moment was
     * faced rather than passed over.
     *
     * That is also the one place in the corridor where the spirit body re-reads
     * on the spot: its brightness and colour are karma (`L-FRAN-03`, and
     * GAME_BRIEF.md § Platform), so the prompt says to look down.
     */
    let picked: 'the-body' | 'the-living' | undefined;
    let pickedAt: number | undefined;
    let prompt: ThresholdPrompt | undefined = new ThresholdPrompt();

    const choose = (choice: 'the-body' | 'the-living'): void => {
      if (picked !== undefined) {
        return;
      }
      picked = choice;
      if (choice === 'the-body') {
        context.soul.attachment = clamp01(context.soul.attachment + 0.2);
        context.soul.will = clamp01(context.soul.will + 0.15);
        prompt?.settle(
          'You stay with it. The warmth on the floor holds, the rising slows, and the room will not quite let you go.',
          'will +0.15 · you are carrying more',
          { id: 'the-body', label: 'Let it fall away', onPick: () => { void context.takeExit('the-body'); } },
        );
      } else {
        context.soul.karma -= 1;
        context.soul.harmony += 1;
        context.soul.shards.push('threshold.the-two-in-the-room');
        prompt?.settle(
          'You stay with them instead. They resolve, and what this is costing them arrives all at once.',
          'karma −1 · harmony +1 · look down: your own light has changed',
          { id: 'the-living', label: 'Let it fall away', onPick: () => { void context.takeExit('the-living'); } },
        );
      }
    };

    prompt.ask('You are above it now. What do you watch?', [
      {
        id: 'the-body',
        label: 'Your own body',
        detail: 'The shape on the floor. The tie holds: grip, and weight.',
        onPick: () => { choose('the-body'); },
      },
      {
        id: 'the-living',
        label: 'The two still in the room',
        detail: 'Feel what this is doing to them. It goes in the ledger, and it is not free.',
        onPick: () => { choose('the-living'); },
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
        room.update(delta, elapsed);
        distant.drift(delta, elapsed);
        distant.points.rotation.y = elapsed * 0.006;

        if (picked !== undefined && pickedAt === undefined) {
          pickedAt = elapsed;
        }
        const answered = pickedAt === undefined ? 0 : ease.out(Math.min(1, (elapsed - pickedAt) / 4));
        const withBody = picked === 'the-body' ? answered : 0;
        const withLiving = picked === 'the-living' ? answered : 0;

        // One continuous rise across three beats. Slow enough that the player
        // chooses when to look down, which is the beat that has to land.
        const climb = beat.id === 'above'
          ? ease.out(t) * 0.12
          : beat.id === 'looking-down'
            ? 0.12 + t * 0.14
            : beat.id === 'rising'
              ? 0.26 + ease.inOut(t) * 0.42
              : beat.id === 'away'
                ? 0.68 + ease.in(t) * 0.32
                : 1;

        // Attending to the body slows the lift and keeps the room under you;
        // attending to the living holds you at their height a moment too. Both
        // are the scene refusing to carry you off while you are still looking.
        const stayed = Math.max(withBody * 0.55, withLiving * 0.3);
        const held = climb * (1 - stayed);
        context.rig.target.set(0.35, 3.1 + held * 26, 2.4 + held * 5.5);

        // The room thins with distance rather than shrinking out of sight.
        room.setPresence(Math.max(0, 1 - held * 1.15) + withBody * 0.2 + withLiving * 0.1);
        room.setBody(1 + withBody * 1.1 - withLiving * 0.3);
        room.setLiving(withLiving);

        grade.vignette = 0.5 - held * 0.16;
        grade.drain = grammar.drain - held * 0.3 - withLiving * 0.2;
        grade.exposure = 1.3 + held * 0.16;
        context.post.setBloom(
          grammar.bloom + held * 0.5 + withLiving * 0.3,
          0.62,
          0.3 - held * 0.1,
        );

        // The ring thins out into something more like a held note as the room
        // falls away, which is the first hint of the tunnel.
        context.audio.ring(0.1 - held * 0.07, 2500 - held * 900);
        context.audio.drone(0.15 + held * 0.12, 52 + held * 14, 2 + held * 8);
        // Attending to the living turns the room back up: you can hear them.
        context.audio.room(0.1 - held * 0.09 + withLiving * 0.12, 520);

        if (beat.id === 'away' && t > 0.7 && picked === undefined) {
          context.captions.show('There is somewhere else to be.', 7);
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
