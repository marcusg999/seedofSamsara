/**
 * Which exits are actually in front of the player right now.
 *
 * Every state declares its exits (CLAUDE.md § Testability), and the gate checks
 * that declaration. But a declaration is a promise about a scene, not a control
 * on screen, and four scenes in this project have declared an exit and offered
 * nothing: `light.life-review`, `light.council`, `light.river-of-forgetting`,
 * and the corridor that waited on an answer nobody gave. Every one of them was
 * found by a player getting stuck, because a check that reads the declaration is
 * blind to the difference by construction.
 *
 * So the promise and the offer are kept as separate facts, and this is where the
 * second one lives. A scene offers an exit in exactly two ways:
 *
 * - a **control**: a mounted button bound to that exit, which the player clicks;
 * - a **timed release**: a clock the scene is running that will take the exit on
 *   the player's behalf if they do nothing.
 *
 * Both are registered here — by the widgets that mount the controls
 * (`scenes/threshold-early.ts`'s `ThresholdPrompt`, `systems/overlay.ts`) and by
 * the scenes that run the clocks — and the registry is what the scene snapshot
 * and the gate read. Nothing else counts as an offer.
 *
 * It is also the only road from a control to an exit: `take` is how a button
 * moves the player. A control that never registered cannot move anybody, so
 * what the registry reports and what the button does cannot drift apart. That is
 * the whole point: a check built on declarations can be satisfied by a scene
 * nobody can leave, and a check built on this cannot.
 *
 * One registry per page, because there is one game per page and one scene in
 * front of the player at a time. The game opens it on every transition and
 * closes it on every unload, so an offer can never outlive the scene that made
 * it.
 */

/** How an exit is being offered. */
export type ExitOfferKind = 'control' | 'timed-release';

/**
 * What a source registers. A control has to hand over its button: the registry
 * reads the element rather than taking "a control is mounted" on trust, because
 * a detached button and a button with no box are both invisible to the player
 * and both have happened here.
 */
export type ExitOffer =
  | {
      readonly kind: 'control';
      /** The scene exit this control takes. */
      readonly exitId: string;
      /** What the player reads on it. */
      readonly label: string;
      readonly control: HTMLElement;
    }
  | {
      readonly kind: 'timed-release';
      readonly exitId: string;
      /** What the release is waiting out, in words. */
      readonly label: string;
    };

/** An offer as the snapshot and the gate see it. */
export interface LiveExitOffer {
  readonly exitId: string;
  readonly kind: ExitOfferKind;
  readonly label: string;
  /** Which widget or scene put this up. Diagnostics only. */
  readonly owner: string;
  /**
   * True for a timed release, and for a control that is in the document with a
   * real box. False is a control the player cannot click.
   */
  readonly mounted: boolean;
  /** A control's box in client coordinates, for diagnosing one that is not. */
  readonly box: { x: number; y: number; width: number; height: number } | undefined;
}

/**
 * One widget's or one scene's claim on the way out. A source replaces its own
 * offers and takes only its own exits; it can neither see nor clear another's.
 */
export interface ExitOfferSource {
  /** Replace everything this source offers. */
  set(offers: readonly ExitOffer[]): void;
  /**
   * Leave by one of this source's offered exits. The only way a control moves
   * the player, and a no-op once the scene has been left, so a second click
   * during a transition cannot load the next scene twice.
   */
  take(exitId: string): void;
  /** Drop everything this source offers, when its control comes down. */
  clear(): void;
}

class Source implements ExitOfferSource {
  offers: readonly ExitOffer[] = [];

  constructor(
    readonly owner: string,
    private readonly registry: ExitOfferRegistry,
  ) {}

  set(offers: readonly ExitOffer[]): void {
    this.offers = [...offers];
    this.registry.attach(this);
  }

  take(exitId: string): void {
    this.registry.take(this, exitId);
  }

  clear(): void {
    this.offers = [];
    this.registry.detach(this);
  }
}

/** One exit actually taken, in the order they were taken. */
export interface ExitDeparture {
  readonly exitId: string;
  readonly owner: string;
}

class ExitOfferRegistry {
  private readonly sources = new Set<Source>();
  private readonly history: ExitDeparture[] = [];
  private takeExit: ((exitId: string) => void) | undefined;
  private left = false;

  /**
   * Called by the game on every transition, after the old scene is unloaded and
   * before the new one is created, so a scene starts offering nothing.
   */
  openScene(takeExit: (exitId: string) => void): void {
    this.sources.clear();
    this.takeExit = takeExit;
    this.left = false;
  }

  /** Called by the game as a scene unloads. Nothing is offered in between. */
  closeScene(): void {
    this.sources.clear();
    this.takeExit = undefined;
  }

  /** A handle for one widget or one scene-side clock. */
  source(owner: string): ExitOfferSource {
    return new Source(owner, this);
  }

  /** Everything in front of the player, in registration order. */
  get offers(): readonly LiveExitOffer[] {
    const live: LiveExitOffer[] = [];
    for (const source of this.sources) {
      for (const offer of source.offers) {
        live.push(describe(source.owner, offer));
      }
    }
    return live;
  }

  /** True once something has taken an exit out of the current scene. */
  get hasLeft(): boolean {
    return this.left;
  }

  /**
   * Every exit taken through the registry, oldest first.
   *
   * A scene that leaves by calling `goTo` or the context's `takeExit` behind the
   * registry's back leaves no entry here, which is how the gate can tell "the
   * scene let go of the player by a way it had registered" from "the scene left
   * by a door nothing ever offered". Both move the player; only the first is a
   * way out anyone can check.
   */
  get departures(): readonly ExitDeparture[] {
    return this.history;
  }

  attach(source: Source): void {
    this.sources.add(source);
  }

  detach(source: Source): void {
    this.sources.delete(source);
  }

  take(source: Source, exitId: string): void {
    if (this.left) {
      // The scene is already on its way out. A second click, or a clock that
      // fires on the same frame as a click, must not transition again.
      return;
    }
    if (!source.offers.some((offer) => offer.exitId === exitId)) {
      // The registry would be describing one thing while the button did another,
      // which is exactly the drift it exists to prevent. Loud, immediately.
      throw new Error(
        `"${source.owner}" took exit "${exitId}" without offering it. `
          + 'A control may only take an exit it has registered (systems/exit-offers.ts).',
      );
    }
    const takeExit = this.takeExit;
    if (!takeExit) {
      throw new Error(`"${source.owner}" took exit "${exitId}" while no scene was loaded.`);
    }
    this.left = true;
    this.history.push({ exitId, owner: source.owner });
    takeExit(exitId);
  }
}

function describe(owner: string, offer: ExitOffer): LiveExitOffer {
  if (offer.kind === 'timed-release') {
    return { exitId: offer.exitId, kind: offer.kind, label: offer.label, owner, mounted: true, box: undefined };
  }
  const rect = offer.control.getBoundingClientRect();
  return {
    exitId: offer.exitId,
    kind: offer.kind,
    label: offer.label,
    owner,
    mounted: offer.control.isConnected && rect.width > 0 && rect.height > 0,
    box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  };
}

/** The page's one registry. Opened and closed by the game. */
export const exitOffers = new ExitOfferRegistry();
