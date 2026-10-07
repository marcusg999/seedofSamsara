/**
 * The sensory envelope of a blast, as a pure function of wall-clock seconds
 * since it happened.
 *
 * ## Why this is a module and not four `ease` calls in a scene
 *
 * A blast is not a loud gunshot. A gunshot is one event — a report — and the
 * world carries on around it, so a vignette can stage it with a single rising
 * curve. A blast is an *ordered sequence of different senses*, and the order is
 * the whole of what makes it read as a blast rather than as a bright frame:
 *
 * 1. **Pressure, before anything is heard.** The overpressure front reaches a
 *    body before the sound does anything useful to it, and it is felt rather
 *    than heard: the chest is hit, the eyes are pushed, the frame squeezes.
 *    Nothing in the mix has changed yet. This is `press`.
 * 2. **Light, arriving first and from everywhere.** Not from a direction —
 *    which is also why it is the one thing in this grammar that is *safe*,
 *    because a light with a direction is a light with a source, and a source is
 *    a perpetrator. This is `light`, and it is meant to be spent on
 *    omnidirectional terms only: a whole-frame wash, a hemisphere, air that
 *    goes bright. Never a new lamp, never a sprite with a position.
 * 3. **The ground itself moving.** Not a camera rattle: a heave. The
 *    frequencies here are deliberately low — a few hertz, not twenty — because
 *    high-frequency jitter reads as a broken camera and because anything above
 *    about 12Hz aliases at 60fps. This is `ground`, and `groundHeave` turns it
 *    into a displacement.
 * 4. **Hearing that does not come back.** The last sense to report, and the
 *    only one that never recovers. This is `deaf`: it rises once and stays at
 *    1 for the rest of the scene, which is the point — a scene that let it fall
 *    again would be staging a loud noise, not a blast.
 *
 * `sub` is the fifth value and the odd one out: the part of the pressure that a
 * body registers as a sub-bass shove rather than as a sound. It belongs to the
 * drone, not to the room tone, because the low end is exactly what survives
 * when the top of hearing has gone.
 *
 * ## Shape
 *
 * Everything is a smoothstep rise into a peak and a power-curve fall out of it,
 * with no randomness anywhere: two runs on the same clock produce the same
 * numbers, which is what CLAUDE.md § Testability asks of anything a playthrough
 * has to reproduce. Nothing here allocates, so it is safe to call every frame,
 * and nothing here holds a GPU resource, so there is nothing to dispose.
 *
 * `seconds` is wall-clock seconds since the blast, never an accumulation of
 * frame deltas (CLAUDE.md § Gotchas: a clamped delta makes story time run slow
 * in exact proportion to how bad the frame rate is, and a quarter-second phase
 * ordering is the first thing that loses).
 *
 * Built for `scenes/death-soldier.ts`. `death.bomb-blast` is the other vignette
 * in GAME_BRIEF.md § Act 1 that ends this way, which is why the grammar lives
 * here rather than in one scene's closure.
 */

/** Where each phase starts, peaks and ends, in seconds since the blast. */
const PHASE = {
  press: { peak: 0.09, end: 0.34, fall: 1.6 },
  // A steep fall rather than a long glare: the light has to be over the moment
  // the ditch changes and gone again soon after, or the beat spends a second and
  // a half as a white rectangle and the reveal lands too late to be a reveal.
  light: { start: 0.17, peak: 0.4, end: 1.9, fall: 3.2 },
  ground: { start: 0.28, peak: 0.5, end: 3.4, fall: 2.4 },
  deaf: { start: 0.44, full: 1.05 },
  // Wider than the rest on purpose: the engine's drone voice ramps its gain
  // over two seconds (`systems/audio.ts`), so a sub shaped like the press
  // would never arrive. A blast's low tail is long anyway — the low end is what
  // rolls through a body after the top of hearing has gone.
  sub: { start: 0.36, peak: 1.2, end: 4.0, fall: 1.7 },
} as const;

export interface Overpressure {
  /**
   * The frame compressing, before anything is heard. Rises in under a tenth of
   * a second and is gone inside a third of one. Spend it on pincushion, on the
   * vignette closing, and on a dip in exposure — on the frame being squeezed.
   */
  readonly press: number;
  /**
   * Light with no direction in it. Spend it on a whole-frame wash, on a
   * hemisphere, on air going bright, on bloom. Never on a new light.
   */
  readonly light: number;
  /** The ground still moving. Feed `groundHeave`. */
  readonly ground: number;
  /** Hearing gone. Rises once to 1 and never falls. */
  readonly deaf: number;
  /** The pressure as the body files it: a sub-bass shove, briefly. */
  readonly sub: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) {
    return x >= edge1 ? 1 : 0;
  }
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Rise into `peak`, then a power-curve fall to `end`. Zero outside. */
function swell(
  seconds: number,
  start: number,
  peak: number,
  end: number,
  fall: number,
): number {
  if (seconds <= start || seconds >= end) {
    return 0;
  }
  if (seconds < peak) {
    return smoothstep(start, peak, seconds);
  }
  return Math.pow(1 - (seconds - peak) / (end - peak), fall);
}

/**
 * The whole envelope at one instant.
 *
 * Returns all zeroes for a negative time, so a scene can call it before the
 * blast with `elapsed - blastAt` and get the morning it already had.
 */
export function overpressure(seconds: number): Overpressure {
  if (!(seconds > 0)) {
    return { press: 0, light: 0, ground: 0, deaf: 0, sub: 0 };
  }
  return {
    press: swell(seconds, 0, PHASE.press.peak, PHASE.press.end, PHASE.press.fall),
    light: swell(seconds, PHASE.light.start, PHASE.light.peak, PHASE.light.end, PHASE.light.fall),
    ground: swell(seconds, PHASE.ground.start, PHASE.ground.peak, PHASE.ground.end, PHASE.ground.fall),
    // The one value with no fall in it. Hearing does not come back.
    deaf: smoothstep(PHASE.deaf.start, PHASE.deaf.full, seconds),
    sub: swell(seconds, PHASE.sub.start, PHASE.sub.peak, PHASE.sub.end, PHASE.sub.fall),
  };
}

/** How far the ground has moved, and how far over it has tipped. */
export interface GroundHeave {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Radians of roll. Add to whatever roll the scene already has. */
  readonly roll: number;
}

/**
 * Turn `ground` into a displacement, from the clock alone.
 *
 * Three incommensurate low frequencies per axis rather than noise: the sum
 * never repeats inside the window the envelope is open for, it is continuous
 * (so it cannot pop between frames at any frame rate), and it is identical on
 * every run without touching the RNG at all.
 *
 * Deliberately *low*: 2 to 10Hz. Ground motion from a blast is a heave, and a
 * heave is what the body reports. Anything faster reads as a camera fault, and
 * anything above about 12Hz is undersampled at 60fps and turns into visual
 * noise that varies with the frame rate — which is the same failure as pacing
 * off accumulated deltas, wearing a different hat.
 *
 * `metres` is the peak vertical throw. The horizontal axes get less, because a
 * body in a ditch is held by its sides and not by the floor.
 */
export function groundHeave(seconds: number, ground: number, metres: number): GroundHeave {
  if (ground <= 0) {
    return { x: 0, y: 0, z: 0, roll: 0 };
  }
  const t = seconds;
  return {
    x: ground * metres * 0.55 * (
      Math.sin(t * 46.1) * 0.6 + Math.sin(t * 29.7 + 1.9) * 0.4
    ),
    y: ground * metres * (
      Math.sin(t * 38.3) * 0.62 + Math.sin(t * 61.4 + 0.7) * 0.26 + Math.sin(t * 22.1 + 2.4) * 0.3
    ),
    z: ground * metres * 0.5 * (
      Math.sin(t * 33.5 + 0.4) * 0.7 + Math.sin(t * 52.9 + 2.2) * 0.3
    ),
    roll: ground * 0.075 * (Math.sin(t * 19.4) * 0.7 + Math.sin(t * 11.3 + 1.2) * 0.3),
  };
}
