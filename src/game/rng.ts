/**
 * The single source of randomness in the game (CLAUDE.md § Testability).
 *
 * Nothing may call `Math.random()`. Every draw goes through an `Rng` derived
 * from the run seed, so a seed plus a sequence of inputs reproduces a
 * playthrough exactly — which is what makes the gate's playthrough stable.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Uniform element. Throws on an empty list, which is always a bug. */
  pick<T>(items: readonly T[]): T;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** A new independent stream, named, so adding a draw in one scene cannot shift another's sequence. */
  stream(name: string): Rng;
  /** How many values this stream has produced; useful in test assertions. */
  readonly drawn: number;
}

/** Deterministic string hash (FNV-1a, 32-bit) used to derive named streams. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * mulberry32: small, fast, and good enough for presentation randomness.
 * Chosen for reproducibility across engines, not for cryptographic strength —
 * nothing here guards a secret.
 */
function mulberry32(state: number): () => number {
  let value = state >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string | number): Rng {
  const rootSeed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  const draw = mulberry32(rootSeed);
  let drawn = 0;

  const rng: Rng = {
    next() {
      drawn += 1;
      return draw();
    },
    int(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
        throw new RangeError(`Rng.int needs min <= max, got ${String(min)}..${String(max)}`);
      }
      return Math.floor(rng.next() * (max - min + 1)) + min;
    },
    range(min, max) {
      return min + rng.next() * (max - min);
    },
    pick(items) {
      const chosen = items[rng.int(0, items.length - 1)];
      if (chosen === undefined) {
        throw new RangeError('Rng.pick called with an empty list');
      }
      return chosen;
    },
    chance(p) {
      return rng.next() < p;
    },
    stream(name) {
      return createRng((rootSeed ^ hashSeed(name)) >>> 0);
    },
    get drawn() {
      return drawn;
    },
  };

  return rng;
}

/** The seed a run uses when the URL does not pin one. */
export function defaultSeed(): string {
  const fromUrl = new URLSearchParams(globalThis.location.search).get('seed');
  return fromUrl ?? 'seed-of-samsara';
}
