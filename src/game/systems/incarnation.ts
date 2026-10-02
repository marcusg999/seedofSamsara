import type { CartItem, SoulState } from '../soul';

/**
 * Meta-progression — what survives a life.
 *
 * GAME_BRIEF.md § Systems: "each run is a life. Wisdom and unlocked memories
 * persist across runs; specifics fade." That split is the whole design, and it
 * is also what the sources describe. In the Myth of Er the souls drink from the
 * river of Carelessness on the plain of Forgetfulness and all memory goes
 * (`L-ER-04`); in the reported past-life cases the statements children make fade
 * with age while something of the shape remains (`L-PAST-01`). So the river does
 * not take everything — it takes the particulars.
 *
 * A death wound can carry over as the next body's birthmark (`L-PAST-02`), which
 * is the one specific the river is not allowed to wash off.
 */

const STORAGE_KEY = 'seed-of-samsara:incarnation:v1';

export interface Incarnation {
  /** Lives completed, including the one just finished. */
  lives: number;
  /** What was understood. Survives the river. */
  wisdom: string[];
  /** Memory shards unlocked across all runs. Survive the river. */
  memories: string[];
  /** A mark where the last life ended, if it left one. Survives the river. */
  birthmark: string | undefined;
  /** The cart, as the opening conditions of the next run. */
  opening: {
    karma: number;
    attachment: number;
    items: { id: string; label: string; aisle: string; karmaCost: number }[];
  };
}

export function emptyIncarnation(): Incarnation {
  return { lives: 0, wisdom: [], memories: [], birthmark: undefined, opening: { karma: 0, attachment: 0, items: [] } };
}

/**
 * Read what previous runs left behind.
 *
 * Storage can be unavailable or throw — a private window, blocked site data —
 * and a game that cannot start because it could not read a save is worse than a
 * game that forgets. Every failure here falls back to a fresh soul.
 */
export function loadIncarnation(): Incarnation {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return emptyIncarnation();
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return emptyIncarnation();
    }
    const record = parsed as Partial<Incarnation>;
    return {
      lives: typeof record.lives === 'number' ? record.lives : 0,
      wisdom: Array.isArray(record.wisdom) ? record.wisdom.filter((line): line is string => typeof line === 'string') : [],
      memories: Array.isArray(record.memories) ? record.memories.filter((line): line is string => typeof line === 'string') : [],
      birthmark: typeof record.birthmark === 'string' ? record.birthmark : undefined,
      opening: record.opening ?? { karma: 0, attachment: 0, items: [] },
    };
  } catch {
    return emptyIncarnation();
  }
}

export function saveIncarnation(state: Incarnation): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Unavailable storage means this life is not remembered. The run still works.
  }
}

/** Forget everything. Used by the test API, never by the game. */
export function clearIncarnation(): void {
  try {
    globalThis.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * What a cart teaches, stated as something a person could carry wordlessly.
 *
 * Deliberately not a list of the items. The brief says specifics fade, so the
 * wisdom is a reading of the shape of the cart — what kind of life was chosen —
 * rather than its contents.
 */
export function wisdomFrom(cart: readonly CartItem[]): string[] {
  const gifts = cart.filter((item) => item.karmaCost > 0).length;
  const challenges = cart.filter((item) => item.karmaCost < 0).length;
  const lines: string[] = [];

  if (cart.length === 0) {
    lines.push('That a life not chosen is still a life lived.');
    return lines;
  }
  if (challenges > 0) {
    lines.push('That you asked for the hard part on purpose, even when you could not remember asking.');
  }
  if (gifts > 0) {
    lines.push('That what came easily to you was given, and was meant to be spent.');
  }
  if (challenges >= gifts && challenges > 0) {
    lines.push('That difficulty is not punishment.');
  }
  if (gifts > challenges) {
    lines.push('That ease is not the same as peace.');
  }
  if (cart.some((item) => item.aisle === 'contracts')) {
    lines.push('That some people are not strangers.');
  }
  return lines;
}

/**
 * How this life ended, as a mark the next body carries.
 *
 * `L-PAST-02`: in the reported cases a birthmark corresponds in location to the
 * wound that ended the previous life. The slice has one death, so this is one
 * mapping rather than a system — it will become a table when the other six
 * vignettes exist.
 */
export function birthmarkFor(deathId: string): string | undefined {
  if (deathId === 'death.heart-attack') {
    return 'A pale mark over the heart, about the size of a thumbprint.';
  }
  return undefined;
}

/** Cross the river: take what persists, let the particulars go. */
export function crossRiver(
  previous: Incarnation,
  soul: SoulState,
  deathId: string,
): Incarnation {
  const carried: Incarnation = {
    lives: previous.lives + 1,
    // Wisdom accumulates and does not repeat itself.
    wisdom: [...new Set([...previous.wisdom, ...wisdomFrom(soul.cart)])],
    memories: [...new Set([...previous.memories, ...soul.shards])],
    birthmark: birthmarkFor(deathId) ?? previous.birthmark,
    opening: {
      // The cart becomes the opening conditions of the next run
      // (GAME_BRIEF.md § The Life Market, Checkout).
      karma: soul.cart.reduce((sum, item) => sum + item.karmaCost, 0),
      attachment: 0,
      items: soul.cart.map((item) => ({
        id: item.id,
        label: item.label,
        aisle: item.aisle,
        karmaCost: item.karmaCost,
      })),
    },
  };
  return carried;
}

/** Apply a carried incarnation to a fresh soul at the start of the next run. */
export function applyOpening(soul: SoulState, carried: Incarnation): void {
  soul.karma = carried.opening.karma;
  soul.attachment = carried.opening.attachment;
  soul.harmony = 0;
  soul.will = 1;
  soul.cart = [];
  // Memories persist; the particulars of the last life do not.
  soul.shards = [...carried.memories];
}
