/**
 * Procedural audio. Every sound here is synthesised at runtime — oscillators,
 * filtered noise, envelopes — so the slice ships no audio files and every voice
 * can be bent continuously by scene state. A heartbeat that falters, a ring that
 * rises as hearing narrows, and a drone that opens out into the Light are all
 * parameter changes rather than crossfades between clips.
 *
 * Browsers block audio until a user gesture (CLAUDE.md § Gotchas), so nothing is
 * created until `start()` is called from the first click or keypress, and every
 * method is safe to call before that.
 */

import type { Rng } from '../rng';

export type VoiceName = 'room' | 'heart' | 'ring' | 'drone' | 'shimmer';

interface Voice {
  readonly gain: GainNode;
  /** Params a scene may bend after the voice exists. */
  readonly cutoff?: AudioParam;
  readonly pitch?: AudioParam;
  stop(): void;
}

export class AudioEngine {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private readonly voices = new Map<VoiceName, Voice>();
  private started = false;
  /** Heartbeat scheduling state. */
  private nextBeatAt = 0;
  private bpm = 64;
  private beatGain = 0.5;
  private beating = false;

  /**
   * All randomness goes through one seeded RNG (CLAUDE.md § Testability) — the
   * noise buffer included, so two runs on the same seed produce byte-identical
   * room tone and a recorded playthrough stays reproducible.
   */
  constructor(private readonly rng: Rng) {}

  get isStarted(): boolean {
    return this.started;
  }

  /** Call from the first user gesture. Idempotent. */
  start(): void {
    if (this.started) {
      return;
    }
    // A browser may refuse an AudioContext outright (policy, or no output
    // device). The game must stay playable silently rather than throw, so this is
    // the one place that swallows an error on purpose.
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch {
      return;
    }
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    this.started = true;
    this.fadeMaster(0.85, 1.5);
  }

  private fadeMaster(to: number, seconds: number): void {
    const { context, master } = this;
    if (!context || !master) {
      return;
    }
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(to, now + seconds);
  }

  /** Room tone: filtered noise. The floor every scene sits on. */
  room(level: number, cutoff = 900): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) {
      return;
    }
    let voice = this.voices.get('room');
    if (!voice) {
      const noise = context.createBufferSource();
      noise.buffer = this.noiseBuffer(context);
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = context.createGain();
      gain.gain.value = 0;
      noise.connect(filter).connect(gain).connect(master);
      noise.start();
      voice = {
        gain,
        cutoff: filter.frequency,
        stop: () => {
          noise.stop();
          noise.disconnect();
          filter.disconnect();
          gain.disconnect();
        },
      };
      this.voices.set('room', voice);
      this.ramp(voice.gain, level, 1.2);
      this.roomCutoff = cutoff;
      return;
    }
    this.ramp(voice.gain, level, 0.8);
    // Narrowing the cutoff is how "sound drops out" at the moment of death:
    // the room does not get quieter so much as it loses its top.
    this.rampParam(voice.cutoff, cutoff, 0.8);
    this.roomCutoff = cutoff;
  }

  private roomCutoff = 900;

  /** A low drone built from detuned sines. `spread` opens it into a chord. */
  drone(level: number, base = 55, spread = 0): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) {
      return;
    }
    this.voices.get('drone')?.stop();
    this.voices.delete('drone');
    if (level <= 0) {
      return;
    }

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(master);

    const partials = spread > 0 ? [1, 1.5, 2, 3, 4.5] : [1, 2.01, 3.02];
    const oscillators = partials.map((ratio, index) => {
      const osc = context.createOscillator();
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.value = base * ratio * (1 + spread * 0.004 * index);
      const partial = context.createGain();
      partial.gain.value = 0.5 / (index + 1);
      osc.connect(partial).connect(gain);
      osc.start();
      return { osc, partial };
    });

    this.voices.set('drone', {
      gain,
      stop: () => {
        for (const { osc, partial } of oscillators) {
          osc.stop();
          osc.disconnect();
          partial.disconnect();
        }
        gain.disconnect();
      },
    });
    this.ramp(gain, level, 2);
  }

  /** The buzzing or ringing Moody's accounts describe (lore bible L-THRESH-02). */
  ring(level: number, frequency = 2400): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) {
      return;
    }
    let voice = this.voices.get('ring');
    if (!voice) {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const tremolo = context.createGain();
      tremolo.gain.value = 1;
      const lfo = context.createOscillator();
      lfo.frequency.value = 7.5;
      const lfoDepth = context.createGain();
      lfoDepth.gain.value = 0.35;
      lfo.connect(lfoDepth).connect(tremolo.gain);
      const gain = context.createGain();
      gain.gain.value = 0;
      osc.connect(tremolo).connect(gain).connect(master);
      osc.start();
      lfo.start();
      voice = {
        gain,
        pitch: osc.frequency,
        stop: () => {
          osc.stop();
          lfo.stop();
          osc.disconnect();
          lfo.disconnect();
          lfoDepth.disconnect();
          tremolo.disconnect();
          gain.disconnect();
        },
      };
      this.voices.set('ring', voice);
    }
    // A rising ring is how hearing narrowing is staged, so the pitch has to
    // follow the caller on every call, not only on the first.
    this.rampParam(voice.pitch, frequency, 1.2);
    this.ramp(voice.gain, level, 0.6);
  }

  /** High partials that bloom in the Light. */
  shimmer(level: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) {
      return;
    }
    let voice = this.voices.get('shimmer');
    if (!voice) {
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(master);
      const nodes = [1320, 1760, 2640, 3520].map((frequency, index) => {
        const osc = context.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        const partial = context.createGain();
        partial.gain.value = 0.12 / (index + 1);
        const drift = context.createOscillator();
        drift.frequency.value = 0.07 + index * 0.031;
        const driftDepth = context.createGain();
        driftDepth.gain.value = 0.06;
        drift.connect(driftDepth).connect(partial.gain);
        osc.connect(partial).connect(gain);
        osc.start();
        drift.start();
        return { osc, drift, partial, driftDepth };
      });
      voice = {
        gain,
        stop: () => {
          for (const node of nodes) {
            node.osc.stop();
            node.drift.stop();
            node.osc.disconnect();
            node.drift.disconnect();
            node.partial.disconnect();
            node.driftDepth.disconnect();
          }
          gain.disconnect();
        },
      };
      this.voices.set('shimmer', voice);
    }
    this.ramp(voice.gain, level, 2.5);
  }

  /** Start the heartbeat. `bpm` and `level` can be changed per frame. */
  heartbeat(on: boolean, bpm = 64, level = 0.5): void {
    this.beating = on;
    this.bpm = Math.max(1, bpm);
    this.beatGain = level;
  }

  /** Drive scheduled one-shots. Call once per frame. */
  update(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.beating) {
      return;
    }
    const now = context.currentTime;
    if (this.nextBeatAt === 0) {
      this.nextBeatAt = now + 0.1;
    }
    // Schedule a little ahead so a dropped frame does not drop a beat.
    while (this.nextBeatAt < now + 0.25) {
      this.thump(context, master, this.nextBeatAt, this.beatGain);
      // The second sound of a heartbeat, slightly quieter and close behind.
      this.thump(context, master, this.nextBeatAt + 0.17, this.beatGain * 0.55);
      this.nextBeatAt += 60 / this.bpm;
    }
  }

  private thump(context: AudioContext, master: GainNode, at: number, level: number): void {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(58, at);
    osc.frequency.exponentialRampToValueAtTime(26, at + 0.12);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, level), at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + 0.34);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** Silence one voice. */
  silence(name: VoiceName, seconds = 0.8): void {
    const voice = this.voices.get(name);
    if (!voice) {
      return;
    }
    this.ramp(voice.gain, 0, seconds);
  }

  /** Scene change: fade every voice out and release the scheduled beat. */
  resetVoices(seconds = 0.4): void {
    this.beating = false;
    this.nextBeatAt = 0;
    for (const name of [...this.voices.keys()]) {
      this.ramp(this.voices.get(name)?.gain, 0, seconds);
    }
  }

  /** Tear everything down. Scenes do not call this; the game does, on unload. */
  dispose(): void {
    this.beating = false;
    for (const voice of this.voices.values()) {
      try {
        voice.stop();
      } catch {
        // A voice whose context already closed throws; nothing to recover.
      }
    }
    this.voices.clear();
    void this.context?.close();
    this.context = undefined;
    this.master = undefined;
    this.started = false;
  }

  private ramp(param: GainNode | undefined, to: number, seconds: number): void {
    const context = this.context;
    if (!param || !context) {
      return;
    }
    const now = context.currentTime;
    param.gain.cancelScheduledValues(now);
    param.gain.setValueAtTime(param.gain.value, now);
    param.gain.linearRampToValueAtTime(to, now + Math.max(0.01, seconds));
  }

  private rampParam(param: AudioParam | undefined, to: number, seconds: number): void {
    const context = this.context;
    if (!param || !context) {
      return;
    }
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(to, now + Math.max(0.01, seconds));
  }

  private noiseBuffer(context: AudioContext): AudioBuffer {
    const seconds = 2;
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish noise: integrated white, which sits lower and reads as room
    // rather than as hiss.
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = this.rng.next() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  /** For the test API. */
  get activeVoices(): string[] {
    return [...this.voices.keys()];
  }

  get roomFilterCutoff(): number {
    return this.roomCutoff;
  }
}
