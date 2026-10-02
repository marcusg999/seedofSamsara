import type { CartItem, SoulState } from '../soul';

/**
 * The Life Market's catalogue and economy.
 *
 * GAME_BRIEF.md § The Life Market: gifts cost karma; challenges repay karma debt
 * and earn growth. The life review sets the shopping list, so unresolved karma
 * puts certain lessons in the cart that can't be put back — those arrive already
 * locked, written by the Council.
 *
 * The numbers live here rather than in the scenes, because an economy spread
 * across eight files cannot be tuned. Expect to tune them: they are a first
 * reading of a balance nobody has played yet.
 *
 * Sourcing, kept honest (lore bible § 8 and § 12): choosing your lot is Plato
 * (`L-ER-01`), previewing bodies and circumstances is Newton (`L-BETWEEN-03`),
 * and choosing difficulty before birth for what it teaches is Schwartz
 * (`L-BETWEEN-04`). All three are tier C or T — testimony and tradition, not
 * findings. The pricing is wholly the game's invention and is recorded as such.
 */

export type AisleId =
  | 'parents'
  | 'body'
  | 'gifts'
  | 'trauma'
  | 'economics'
  | 'place'
  | 'contracts';

export interface MarketItem {
  readonly id: string;
  readonly aisle: AisleId;
  readonly label: string;
  /**
   * Positive costs karma (a gift). Negative repays karma debt (a challenge).
   * Zero is a circumstance that is neither — a place, a era, a plain body.
   */
  readonly karmaCost: number;
  /** The sensory flash played while the item is held. One image, not a summary. */
  readonly flash: string;
}

/**
 * How far into debt a soul may go. A cart of only gifts is allowed
 * (GAME_BRIEF.md), so this is deliberately generous — it exists to stop the cart
 * becoming meaningless, not to stop the player choosing badly.
 */
export const KARMA_FLOOR = -12;

export const CATALOGUE: readonly MarketItem[] = [
  // --- Parents: shelved as living dioramas --------------------------------
  { id: 'parents.patient', aisle: 'parents', label: 'Two people who will wait up for you', karmaCost: 2,
    flash: 'A hall light left on. Someone pretending to have been reading.' },
  { id: 'parents.young', aisle: 'parents', label: 'A mother younger than she should be', karmaCost: -1,
    flash: 'She is nineteen and holding you like something borrowed.' },
  { id: 'parents.one', aisle: 'parents', label: 'One parent, doing the work of two', karmaCost: -1,
    flash: 'Three jobs on a calendar. Your name written on every Sunday.' },
  { id: 'parents.distant', aisle: 'parents', label: 'A father who loves you from a distance he cannot cross', karmaCost: -2,
    flash: 'He stands in the doorway of your room. He does not come in.' },
  { id: 'parents.inherited', aisle: 'parents', label: 'Parents who will hand you their own unfinished thing', karmaCost: -2,
    flash: 'A quarrel older than you, continuing politely over dinner.' },

  // --- Body and avatar ----------------------------------------------------
  { id: 'body.sturdy', aisle: 'body', label: 'A body that holds up', karmaCost: 2,
    flash: 'Running for a bus at sixty and catching it.' },
  { id: 'body.beautiful', aisle: 'body', label: 'A face people are kind to', karmaCost: 3,
    flash: 'Doors you never noticed opening, held by strangers.' },
  { id: 'body.ordinary', aisle: 'body', label: 'An ordinary body, unremarkable and yours', karmaCost: 0,
    flash: 'Catching your reflection and feeling neither one way nor the other.' },
  { id: 'body.illness', aisle: 'body', label: 'A body that will need managing', karmaCost: -3,
    flash: 'A pill organiser. Sunday evening. The small competence of it.' },
  { id: 'body.birthmark', aisle: 'body', label: 'A birthmark where the last one ended', karmaCost: 0,
    flash: 'A pale mark over the heart. You will touch it when you are frightened.' },

  // --- Gifts --------------------------------------------------------------
  { id: 'gifts.music', aisle: 'gifts', label: 'Music, in the hands', karmaCost: 3,
    flash: 'Your fingers already know the next bar. You are eight.' },
  { id: 'gifts.intellect', aisle: 'gifts', label: 'A mind that goes fast', karmaCost: 3,
    flash: 'The page opens and the whole shape of it is simply there.' },
  { id: 'gifts.charm', aisle: 'gifts', label: 'People want to be near you', karmaCost: 2,
    flash: 'A room reorganising itself, quietly, around where you stand.' },
  { id: 'gifts.intuition', aisle: 'gifts', label: 'You will know what people mean', karmaCost: 2,
    flash: 'She says she is fine. You hear the whole of it anyway.' },
  { id: 'gifts.craft', aisle: 'gifts', label: 'Good hands, and patience for them', karmaCost: 2,
    flash: 'Sanding a joint until it stops catching. Nobody will ever see it.' },

  // --- Trauma and challenges: sacred, not grim ----------------------------
  { id: 'trauma.loss-early', aisle: 'trauma', label: 'Someone goes before you are ready', karmaCost: -3,
    flash: 'A coat still on its hook. You will not move it for a year.' },
  { id: 'trauma.abandonment', aisle: 'trauma', label: 'You will be left, and will learn it was not about you', karmaCost: -3,
    flash: 'A door closing softly, which is worse than loudly.' },
  { id: 'trauma.addiction', aisle: 'trauma', label: 'Someone you love will be taken by a bottle', karmaCost: -3,
    flash: 'You become very good at reading a footstep on the stair.' },
  { id: 'trauma.injustice', aisle: 'trauma', label: 'You will not be believed when it matters', karmaCost: -4,
    flash: 'Telling the truth carefully, twice, and watching it not land.' },
  { id: 'trauma.someone-waiting', aisle: 'trauma', label: 'A person who waits for you', karmaCost: -1,
    flash: 'A phone face-down on a table. It has been face-down a while.' },
  { id: 'trauma.the-call-unreturned', aisle: 'trauma', label: 'A call you will not return in time', karmaCost: -2,
    flash: 'Tomorrow, you think. There is a tomorrow in which you call her.' },
  { id: 'trauma.estrangement', aisle: 'trauma', label: 'Years of not speaking, and the wish to', karmaCost: -3,
    flash: 'Drafting the message. Not sending it. Eleven times.' },

  // --- Economic circumstance ---------------------------------------------
  { id: 'economics.abundance', aisle: 'economics', label: 'Enough, always, without thinking about it', karmaCost: 3,
    flash: 'Never once doing arithmetic in a shop.' },
  { id: 'economics.comfortable', aisle: 'economics', label: 'Enough, with care', karmaCost: 1,
    flash: 'A holiday saved for across eleven months, and worth it.' },
  { id: 'economics.tight', aisle: 'economics', label: 'Not enough, often', karmaCost: -2,
    flash: 'The particular quiet of a kitchen at the end of a month.' },
  { id: 'economics.rebuilt', aisle: 'economics', label: 'You will lose it once and build it again', karmaCost: -2,
    flash: 'Boxes in a hallway. And then, later, a key that is yours.' },

  // --- Place --------------------------------------------------------------
  { id: 'place.coastal', aisle: 'place', label: 'A cold coast, a small town', karmaCost: 0,
    flash: 'Salt on the windows. Everyone knows your mother.' },
  { id: 'place.city', aisle: 'place', label: 'A city large enough to disappear in', karmaCost: 0,
    flash: 'Nobody on this train will ever see you again.' },
  { id: 'place.inland', aisle: 'place', label: 'Flat country, wide sky, slow decades', karmaCost: 0,
    flash: 'A road going straight for an hour. Weather you can watch arrive.' },
  { id: 'place.between', aisle: 'place', label: 'Between two languages', karmaCost: -1,
    flash: 'Translating for your father at a desk. You are nine.' },

  // --- Soul contracts -----------------------------------------------------
  { id: 'contracts.friend', aisle: 'contracts', label: 'One friend who stays', karmaCost: 2,
    flash: 'Thirty years in, and still the easiest phone call you make.' },
  { id: 'contracts.teacher', aisle: 'contracts', label: 'A teacher who sees it in you first', karmaCost: 2,
    flash: 'A book pressed into your hands. "This one. Trust me."' },
  { id: 'contracts.rival', aisle: 'contracts', label: 'A rival who makes you better', karmaCost: 0,
    flash: 'Neither of you will admit it, and both of you will know.' },
  { id: 'contracts.late-love', aisle: 'contracts', label: 'Someone you will find late', karmaCost: 1,
    flash: 'Fifty-one, and surprised by it.' },
  { id: 'contracts.daughter', aisle: 'contracts', label: 'A daughter who will call on a Tuesday', karmaCost: 1,
    flash: 'Her name on a screen. You have the whole evening.' },
];

export function itemsIn(aisle: AisleId): MarketItem[] {
  return CATALOGUE.filter((item) => item.aisle === aisle);
}

export function findItem(id: string): MarketItem | undefined {
  return CATALOGUE.find((item) => item.id === id);
}

/** What the cart costs. Gifts add, challenges subtract. */
export function cartCost(cart: readonly CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.karmaCost, 0);
}

/** Karma left after what is in the cart. */
export function remainingKarma(soul: SoulState): number {
  return soul.karma - cartCost(soul.cart);
}

/** Whether this soul can take this item on top of what it already carries. */
export function canTake(soul: SoulState, item: MarketItem): boolean {
  if (soul.cart.some((inCart) => inCart.id === item.id)) {
    return false;
  }
  return remainingKarma(soul) - item.karmaCost >= KARMA_FLOOR;
}

export function isInCart(soul: SoulState, item: MarketItem): boolean {
  return soul.cart.some((inCart) => inCart.id === item.id);
}

/** Locked items were set by the Council and cannot be put back. */
export function isLocked(soul: SoulState, item: MarketItem): boolean {
  return soul.cart.some((inCart) => inCart.id === item.id && inCart.locked);
}

export function take(soul: SoulState, item: MarketItem): void {
  if (!canTake(soul, item)) {
    return;
  }
  soul.cart.push({
    aisle: item.aisle,
    id: item.id,
    label: item.label,
    karmaCost: item.karmaCost,
    locked: false,
  });
}

export function putBack(soul: SoulState, item: MarketItem): void {
  const index = soul.cart.findIndex((inCart) => inCart.id === item.id && !inCart.locked);
  if (index >= 0) {
    soul.cart.splice(index, 1);
  }
}

export interface CartVerdict {
  readonly gifts: number;
  readonly challenges: number;
  readonly cost: number;
  readonly remaining: number;
  /** The one thing the guides say. They speak once (GAME_BRIEF.md § Checkout). */
  readonly verdict: string;
}

/**
 * What the guides say at checkout. One line, once.
 *
 * The brief is explicit that a cart of only gifts is allowed and that the guides
 * warn such a life teaches little — so the warning has to be a warning and not a
 * refusal, and the gifted life has to have been genuinely tempting for it to
 * mean anything.
 */
export function weighCart(soul: SoulState): CartVerdict {
  const gifts = soul.cart.filter((item) => item.karmaCost > 0).length;
  const challenges = soul.cart.filter((item) => item.karmaCost < 0).length;
  const cost = cartCost(soul.cart);
  const remaining = remainingKarma(soul);

  let verdict: string;
  if (soul.cart.length === 0) {
    verdict = 'You have chosen nothing. A life will be chosen for you, and you will call it fate.';
  } else if (challenges === 0) {
    verdict = 'A kind life, and a light one. We will not stop you. But you will arrive back here with the same work still in front of you.';
  } else if (gifts === 0) {
    verdict = 'You have taken only the hard things. Courage is not the same as penance — take something that will make you glad.';
  } else if (challenges >= gifts) {
    verdict = 'A heavy load, carried on purpose. This is the kind of life that is difficult to explain afterwards, and worth it.';
  } else {
    verdict = 'Gifts enough to make it bearable, and enough asked of you to make it matter. Go on, then.';
  }

  return { gifts, challenges, cost, remaining, verdict };
}
