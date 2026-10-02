/**
 * A beat timeline. Pacing is most of what the vignette bar is about, so beats are
 * authored as data rather than buried in `update` branches: a scene declares its
 * beats, the director advances them, and the gate can read which beat is live.
 *
 * Beats never block the player's exit. A scene's declared exits stay reachable at
 * every beat, which is how the slice avoids a softlock during a long sequence.
 */

export interface Beat {
  /** Stable id, so a test or the gate can assert on a beat rather than a time. */
  readonly id: string;
  /** Seconds this beat lasts. The last beat may hold indefinitely with `hold`. */
  readonly seconds: number;
  /** Hold here until something calls `advance()`; used where the player must act. */
  readonly hold?: boolean;
  /** Sparse on-screen line, if this beat carries one. */
  readonly caption?: string;
}

export interface BeatState {
  readonly beat: Beat;
  readonly index: number;
  /** 0..1 through this beat. Pinned at 1 while a hold beat waits. */
  readonly t: number;
  /** Seconds since the timeline started. */
  readonly elapsed: number;
  readonly finished: boolean;
}

export class Director {
  private index = 0;
  private withinBeat = 0;
  private total = 0;
  private done = false;
  private readonly listeners: ((beat: Beat, index: number) => void)[] = [];

  constructor(private readonly beats: readonly Beat[]) {
    if (beats.length === 0) {
      throw new Error('Director needs at least one beat');
    }
  }

  onBeat(listener: (beat: Beat, index: number) => void): void {
    this.listeners.push(listener);
    // Fire for the opening beat so a listener never misses it.
    const first = this.beats[0];
    if (first) {
      listener(first, 0);
    }
  }

  update(delta: number): void {
    if (this.done) {
      return;
    }
    this.total += delta;
    const current = this.current;
    if (current.hold === true) {
      this.withinBeat = current.seconds;
      return;
    }
    this.withinBeat += delta;
    // The loop returns on the frame it finishes, so there is no need to re-test
    // `done` in the condition.
    while (this.withinBeat >= this.current.seconds) {
      const overflow = this.withinBeat - this.current.seconds;
      if (this.index >= this.beats.length - 1) {
        this.withinBeat = this.current.seconds;
        this.done = true;
        return;
      }
      this.index += 1;
      this.withinBeat = overflow;
      this.emit();
    }
  }

  /** Leave a hold beat, or skip the current one. */
  advance(): void {
    if (this.done || this.index >= this.beats.length - 1) {
      this.done = true;
      return;
    }
    this.index += 1;
    this.withinBeat = 0;
    this.emit();
  }

  get current(): Beat {
    const beat = this.beats[this.index];
    if (!beat) {
      throw new Error(`Director index ${String(this.index)} out of range`);
    }
    return beat;
  }

  get state(): BeatState {
    const beat = this.current;
    return {
      beat,
      index: this.index,
      t: beat.seconds <= 0 ? 1 : Math.min(1, this.withinBeat / beat.seconds),
      elapsed: this.total,
      finished: this.done,
    };
  }

  /** Total authored length, ignoring holds. Used to keep scenes under the softlock budget. */
  get authoredSeconds(): number {
    return this.beats.reduce((sum, beat) => sum + (beat.hold === true ? 0 : beat.seconds), 0);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.current, this.index);
    }
  }
}

/** Ease helpers used across scenes, so timing curves are consistent. */
export const ease = {
  inOut: (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t: number): number => 1 - Math.pow(1 - t, 3),
  in: (t: number): number => t * t * t,
  /** Rises then falls — for a pulse that must return to rest. */
  pulse: (t: number): number => Math.sin(Math.PI * Math.min(1, Math.max(0, t))),
};
