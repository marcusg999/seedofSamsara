/**
 * The run's ledger. GAME_BRIEF.md § Systems defines these; the numbers here are
 * the shape the systems will read and write, not yet a tuned economy.
 */
export interface CartItem {
  readonly aisle: string;
  readonly id: string;
  readonly label: string;
  /** Positive costs karma (gifts); negative repays karma debt (challenges). */
  readonly karmaCost: number;
  /** Items the life review puts in the cart cannot be put back. */
  readonly locked: boolean;
}

export interface SoulState {
  /** Measured by effect on others as felt in the review, not a good/evil meter. */
  karma: number;
  /** Contribution to the balance of the universe; rises through rescue, forgiveness, release. */
  harmony: number;
  /** Path B's core resource: powers movement between spheres, resists the pull of lower ones. */
  will: number;
  /** How heavily the death loaded the soul: violent, unjust deaths start heavy. */
  attachment: number;
  /** The Life Market cart. */
  cart: CartItem[];
  /** Memory shards found this run. */
  shards: string[];
}

export function createSoulState(): SoulState {
  return {
    karma: 0,
    harmony: 0,
    will: 1,
    attachment: 0,
    cart: [],
    shards: [],
  };
}
