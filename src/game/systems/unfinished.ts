/**
 * Which life was just lived, and what it left undone.
 *
 * Every death leads to the same life review, the same Council and the same
 * Life Market, so those three have to ask who they are dealing with. They used
 * to answer in two different ways and one of them was not an answer at all:
 * the review read a shard prefix to pick its captions, while the Council read
 * only the karma number. A number cannot tell you what happened, so the
 * Council handed every soul the widower's unfinished business — a man who died
 * in a ditch in a blast was docked a point for not returning a phone call, and
 * then had "a call you will not return in time" locked into his next life
 * where he could not take it out again.
 *
 * This module is the single place that answers both questions, so the two
 * cannot drift apart again: `deathKind` says whose life it was, and
 * `leftItsUnfinishedThing` says whether that person left their own one thing
 * undone — his call, his letter, her name — rather than somebody else's.
 */
import type { CartItem } from '../soul';

export type DeathKind = 'heart-attack' | 'soldier' | 'dmt';

/**
 * Whose life the review is reviewing. Each vignette writes its shards under
 * its own prefix, so the prefix is the identity. Heart attack is the default
 * because it is the slice's first vignette and the one a run reaches with no
 * shards at all.
 */
export function deathKind(shards: readonly string[]): DeathKind {
  // Scanned backwards, because the soul can arrive carrying more than one
  // life's shards and the review is about the one that just ended. The DMT
  // vignette is the one you come back from: it hands the player to
  // `vignette-select` alive, so its shards are still in the ledger when a
  // later death writes its own. Scanning forwards, a player who went out on
  // DMT, came back, and then died of a heart attack — ringing his daughter on
  // the way — was told "she was going to come on Tuesday" and had the trip
  // filed as the life under review. The most recent death wins.
  for (let i = shards.length - 1; i >= 0; i -= 1) {
    const shard = shards[i] ?? '';
    if (shard.startsWith('soldier.')) {
      return 'soldier';
    }
    if (shard.startsWith('dmt.')) {
      return 'dmt';
    }
    if (shard.startsWith('heart-attack.')) {
      return 'heart-attack';
    }
  }
  return 'heart-attack';
}

/**
 * The one shard that means this life closed its own open loop.
 *
 * - The widower rang his daughter instead of leaving it for the morning.
 * - The soldier got the letter out of his own hands — finished the line, or
 *   put it where somebody would find it.
 * - The one who went out on DMT carried her name back rather than going quiet.
 */
const RESOLVED: Readonly<Record<DeathKind, readonly string[]>> = {
  'heart-attack': ['heart-attack.rang-her'],
  soldier: ['soldier.handed-it-over', 'soldier.finished-the-line'],
  dmt: ['dmt.carried.her-name'],
};

/**
 * True when this life left its own unfinished thing undone.
 *
 * Deliberately "not resolved" rather than "explicitly refused": a player who
 * never reached the decision has not settled it either, and the review is the
 * moral engine — `tests/gate/brief.spec.ts` drives the scene with
 * `advanceBeat()` and never clicks, and still requires the ledger to move. So
 * the debit stays automatic on a run that chooses nothing, and is lifted only
 * by actually doing the thing.
 */
export function leftItsUnfinishedThing(shards: readonly string[]): boolean {
  const resolved = RESOLVED[deathKind(shards)];
  return !shards.some((shard) => resolved.includes(shard));
}

/**
 * What each life can hand forward, heaviest last.
 *
 * The thresholds and costs are the same for every death, so the economy is
 * unchanged — what differs is which lesson the weight lands on, because the
 * next life inherits the shape of the one before it. The ids are all real
 * Trauma aisle stock, so a locked obligation appears on the shelf it came from
 * rather than only in the cart.
 */
const OBLIGATIONS: Readonly<Record<DeathKind, readonly { threshold: number; item: Omit<CartItem, 'locked'> }[]>> = {
  // A call not returned, and the years that can grow out of one.
  'heart-attack': [
    { threshold: -1, item: { aisle: 'trauma', id: 'trauma.someone-waiting', label: 'A person who waits for you', karmaCost: -1 } },
    { threshold: -3, item: { aisle: 'trauma', id: 'trauma.the-call-unreturned', label: 'A call you will not return in time', karmaCost: -2 } },
    { threshold: -6, item: { aisle: 'trauma', id: 'trauma.estrangement', label: 'Years of not speaking, and the wish to', karmaCost: -3 } },
  ],
  // Someone waiting at home, the man four feet away who went first, and being
  // the one left behind — his life's shape, not the widower's.
  soldier: [
    { threshold: -1, item: { aisle: 'trauma', id: 'trauma.someone-waiting', label: 'A person who waits for you', karmaCost: -1 } },
    { threshold: -3, item: { aisle: 'trauma', id: 'trauma.loss-early', label: 'Someone goes before you are ready', karmaCost: -3 } },
    { threshold: -6, item: { aisle: 'trauma', id: 'trauma.abandonment', label: 'You will be left, and will learn it was not about you', karmaCost: -3 } },
  ],
  // The visit she was going to make on Tuesday, and the distance that opens
  // when the thing is never said.
  dmt: [
    { threshold: -1, item: { aisle: 'trauma', id: 'trauma.someone-waiting', label: 'A person who waits for you', karmaCost: -1 } },
    { threshold: -3, item: { aisle: 'trauma', id: 'trauma.estrangement', label: 'Years of not speaking, and the wish to', karmaCost: -3 } },
    { threshold: -6, item: { aisle: 'trauma', id: 'trauma.loss-early', label: 'Someone goes before you are ready', karmaCost: -3 } },
  ],
};

/**
 * What the review records having shown, named after this life's own moment.
 *
 * This carried the same bug as the obligations and in a more embarrassing
 * place: whoever you had been, the review filed the memory as
 * `review.the-phone-call`, so a soldier left the Light carrying a shard about
 * a call he never had. Memories survive the river (`systems/incarnation.ts`),
 * so a wrong one here follows the player into the next life.
 */
export function reviewShard(shards: readonly string[]): string {
  const settled = !leftItsUnfinishedThing(shards);
  switch (deathKind(shards)) {
    case 'soldier':
      return settled ? 'review.the-letter-he-sent' : 'review.the-letter-in-his-pocket';
    case 'dmt':
      return settled ? 'review.the-name-he-carried' : 'review.the-visit-she-was-making';
    default:
      return settled ? 'review.the-call-he-made' : 'review.the-phone-call';
  }
}

/** Which obligations a given karma reading locks into the cart, for this life. */
export function obligationsFor(karma: number, kind: DeathKind): CartItem[] {
  return OBLIGATIONS[kind]
    .filter((entry) => karma <= entry.threshold)
    .map((entry) => ({
      ...entry.item,
      // Locked: the life review set this, and the Market cannot put it back.
      locked: true,
    }));
}
