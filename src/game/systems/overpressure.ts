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
 *    a perpetrator. This is `light`, with `whiteout` as its core, and both are
 *    meant to be spent on omnidirectional terms only: a whole-frame wash, a
 *    hemisphere, the sky dome going white, every surface in the scene emitting
 *    at once, air that goes bright. Never a new lamp, never a sprite with a
 *    position.
 *
 *    Spend it on *all* of those, not one. One additive term, however strong,
 *    is a spark at a spot; what reads as a blast is the whole frame losing its
 *    relationship to its own light — no shadows, the floor of the ditch
 *    brighter than the dawn, and the sky no longer the brightest thing in it.
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
 * Everything is a smoothstep rise into a peak and a power-curve fall out of it
 * — except the arrival, which holds at full for three tenths of a second
 * before it falls, because a peak with no width is a peak a slow frame steps
 * over (see PHASE). There is no randomness anywhere: two runs on the same
 * clock produce the same numbers, which is what CLAUDE.md § Testability asks of anything a playthrough
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

/**
 * Where each phase starts, peaks and ends, in seconds since the blast.
 *
 * These numbers were set by looking at frames, not by reading them off a
 * curve. The first version of this envelope put the whole arrival inside four
 * tenths of a second, which is defensible on paper and invisible in practice:
 * at the frame rate this game actually renders at here (~3fps with the post
 * stack on a software rasteriser), a 0.4s peak falls between two frames more
 * often than not, and a burst of ten captures across the beat photographed the
 * same dark ditch ten times. An event nobody's eye can land on has not
 * happened.
 *
 * So the arrival now has a *plateau* — long enough that no frame rate this
 * game tolerates can step over it — and then a two-stage fall: a fast knee as
 * the light collapses, and a long, dim glare that is the dust the pressure put
 * in the air still carrying light. That is the real shape of the thing as well
 * as the legible one. It is still over fast: at full from 0.12s to 0.3s,
 * better than half to about 0.6s, the world resolving back through the glare
 * by a little over a second, and nothing at all by 3.4s — inside a beat that
 * is seven seconds long.
 */
const PHASE = {
  press: { peak: 0.06, end: 0.52, fall: 2.0 },
  light: {
    start: 0.015,
    /** Full by here. Faster than the press peaks, because light is faster. */
    peak: 0.12,
    /**
     * Held at full to here. The one number the frame rate cannot step over.
     *
     * Two tenths of a second, not four. Measured at four: the compositor
     * recorded five consecutive frames of featureless white, which is a cut
     * to white and not a blast — the eye needs the frame to come *back*, and
     * it has to start coming back while it is still clearly the same ditch.
     */
    hold: 0.3,
    /** The fast collapse ends here, at `kneeLevel`. */
    knee: 0.72,
    kneeLevel: 0.4,
    /** The glare in the dust, gone by here. */
    end: 3.4,
    tail: 1.8,
  },
  ground: { start: 0.08, peak: 0.34, end: 3.6, fall: 2.2 },
  deaf: { start: 0.3, full: 0.95 },
  // Wider than the rest on purpose: the engine's drone voice ramps its gain
  // over two seconds (`systems/audio.ts`), so a sub shaped like the press
  // would never arrive. A blast's low tail is long anyway — the low end is what
  // rolls through a body after the top of hearing has gone.
  sub: { start: 0.2, peak: 1.0, end: 4.2, fall: 1.7 },
} as const;

export interface Overpressure {
  /**
   * The frame compressing, before anything is heard. Rises in under a tenth of
   * a second and is gone inside a third of one. Spend it on pincushion, on the
   * vignette closing, and on a dip in exposure — on the frame being squeezed.
   */
  readonly press: number;
  /**
   * Light with no direction in it, from the arrival through the glare that
   * follows it. Spend it on a whole-frame wash, on a hemisphere, on every
   * surface in the scene going emissive at once, on the sky dome going white,
   * on air going bright, on bloom. Never on a new light.
   *
   * It is deliberately spent on *many* omnidirectional terms rather than one.
   * A single additive term, however strong, reads as a spark somewhere; what
   * reads as a blast is the frame losing its relationship to its own light —
   * the shadows gone, the ditch floor brighter than the dawn, the sky no
   * longer the brightest thing in frame.
   */
  readonly light: number;
  /**
   * The core of the arrival: 1 across the plateau, 0 once the collapse is
   * done. Nothing in the frame can be resolved while this is up, which is why
   * it is also the moment the ditch is allowed to change.
   *
   * Separate from `light` so the terms that must not linger — the vertical
   * smear, the last of the wash, the moment the other man stops being a shape
   * — sit on the white-out alone and not on the glare after it.
   */
  readonly whiteout: number;
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
 * The arrival: rise, plateau, fast knee, long glare.
 *
 * Not `swell`, because `swell` has no plateau and a peak with no width is a
 * peak a slow frame steps over. See PHASE.
 */
function arrival(seconds: number): number {
  const p = PHASE.light;
  if (seconds <= p.start || seconds >= p.end) {
    return 0;
  }
  if (seconds < p.peak) {
    return smoothstep(p.start, p.peak, seconds);
  }
  if (seconds < p.hold) {
    return 1;
  }
  if (seconds < p.knee) {
    return 1 - (1 - p.kneeLevel) * smoothstep(p.hold, p.knee, seconds);
  }
  return p.kneeLevel * Math.pow(1 - (seconds - p.knee) / (p.end - p.knee), p.tail);
}

/** The plateau alone: 1 while nothing in the frame can be resolved. */
function whiteout(seconds: number): number {
  const p = PHASE.light;
  if (seconds <= p.start || seconds >= p.knee) {
    return 0;
  }
  if (seconds < p.peak) {
    return smoothstep(p.start, p.peak, seconds);
  }
  if (seconds < p.hold) {
    return 1;
  }
  return 1 - smoothstep(p.hold, p.knee, seconds);
}

/**
 * The whole envelope at one instant.
 *
 * Returns all zeroes for a negative time, so a scene can call it before the
 * blast with `elapsed - blastAt` and get the morning it already had.
 */
export function overpressure(seconds: number): Overpressure {
  if (!(seconds > 0)) {
    return { press: 0, light: 0, whiteout: 0, ground: 0, deaf: 0, sub: 0 };
  }
  return {
    press: swell(seconds, 0, PHASE.press.peak, PHASE.press.end, PHASE.press.fall),
    light: arrival(seconds),
    whiteout: whiteout(seconds),
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
