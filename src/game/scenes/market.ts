import { CylinderGeometry, Mesh, MeshBasicMaterial, AdditiveBlending, Group } from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';
import { exitOffers, type ExitOffer } from '../systems/exit-offers';
import { airShell, moteField, radianceShell, volumetricGlow } from '../systems/forms';
import { setU } from '../systems/glsl';
import {
  canTake,
  isInCart,
  isLocked,
  itemsIn,
  putBack,
  take,
  remainingKarma,
  weighCart,
  type AisleId,
  type MarketItem,
} from '../systems/market';

/**
 * The Life Market — seven aisles and a checkout.
 *
 * GAME_BRIEF.md § The Life Market. The aisles share one mechanism, built once
 * here, because seven hand-written scenes would drift apart and a fix to the
 * cart would need making seven times. What each aisle supplies is its own
 * colour, its own copy and its own items; what it inherits is shelving, the
 * preview flash, and the cart.
 *
 * Tone is the thing most easily lost. The brief asks for wonder and weight at
 * once, and says the Trauma aisle should feel sacred rather than grim — like
 * choosing which mountain to climb. So the Trauma aisle is the warmest-lit in
 * the market, not the coldest, and nothing in it is styled as a penalty.
 */

interface AisleConfig {
  readonly id: AisleId;
  readonly sceneId: string;
  readonly title: string;
  /** What the shelf is called in the player's own words. */
  readonly heading: string;
  readonly blurb: string;
  readonly next: string;
  readonly ground: number;
  readonly glow: number;
  readonly accent: number;
}

const AISLES: readonly AisleConfig[] = [
  {
    id: 'parents', sceneId: 'market.parents', title: 'Parents', next: 'market.body',
    heading: 'Parents',
    blurb: 'Each pair is shelved as a living diorama. Hold one to glimpse a moment of the childhood they would give you.',
    ground: 0x1a1428, glow: 0xffd2a0, accent: 0xb48cff,
  },
  {
    id: 'body', sceneId: 'market.body', title: 'Body and avatar', next: 'market.gifts',
    heading: 'Body',
    blurb: 'Form, health, appearance — and any mark carried over from how the last one ended.',
    ground: 0x14182a, glow: 0xc8e4ff, accent: 0x8fb0ff,
  },
  {
    id: 'gifts', sceneId: 'market.gifts', title: 'Gifts', next: 'market.trauma',
    heading: 'Gifts',
    blurb: 'Talent, beauty, quickness, charm. These cost karma. They are worth what they cost.',
    ground: 0x241c14, glow: 0xffd98a, accent: 0xffb45e,
  },
  {
    id: 'trauma', sceneId: 'market.trauma', title: 'Trauma and challenges', next: 'market.economics',
    heading: 'What you will be asked to carry',
    blurb: 'These repay karma debt and are the reason most souls come back. Choosing one is not a punishment. It is choosing which mountain to climb.',
    // Deliberately the warmest room in the market.
    ground: 0x241a1c, glow: 0xffc9a8, accent: 0xff9f7a,
  },
  {
    id: 'economics', sceneId: 'market.economics', title: 'Economic circumstance', next: 'market.place',
    heading: 'Circumstance',
    blurb: 'From struggle to abundance. Each teaches something the other cannot.',
    ground: 0x16201c, glow: 0xa8e4c0, accent: 0x6fd8a0,
  },
  {
    id: 'place', sceneId: 'market.place', title: 'Place', next: 'market.contracts',
    heading: 'Where, and when',
    blurb: 'Planet, culture, era. None of these costs anything. All of them change everything.',
    ground: 0x141c26, glow: 0xa8d4ff, accent: 0x7fb8e8,
  },
  {
    id: 'contracts', sceneId: 'market.contracts', title: 'Soul contracts', next: 'market.checkout',
    heading: 'Who will meet you there',
    blurb: 'People from your soul group who agree to find you again — as a friend, a rival, a teacher, a love.',
    ground: 0x1e1830, glow: 0xffc8e8, accent: 0xc89cff,
  },
];

/** A rebuilding DOM panel. The cart changes under it, so it cannot be static. */
class MarketPanel {
  private readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly preview: HTMLParagraphElement;
  private selected: MarketItem | undefined;

  /**
   * The aisle's way on. This panel is the only thing that offers it, so it is
   * registered here rather than taken on trust from the definition
   * (`systems/exit-offers.ts`).
   */
  private readonly offers = exitOffers.source('market aisle panel');

  constructor(
    private readonly config: AisleConfig,
    private readonly context: SceneContext,
    private readonly onSelect: (item: MarketItem | undefined) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'market';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', config.title);

    const head = document.createElement('div');
    head.className = 'market__head';
    const title = document.createElement('h1');
    title.className = 'market__title';
    title.textContent = config.heading;
    const blurb = document.createElement('p');
    blurb.className = 'market__blurb';
    blurb.textContent = config.blurb;
    head.append(title, blurb);

    this.list = document.createElement('div');
    this.list.className = 'market__list';

    this.preview = document.createElement('p');
    this.preview.className = 'market__preview';

    this.status = document.createElement('p');
    this.status.className = 'market__status';

    const nav = document.createElement('div');
    nav.className = 'market__nav';
    const onward = document.createElement('button');
    onward.type = 'button';
    onward.className = 'overlay__button';
    const onwardLabel = config.next === 'market.checkout' ? 'To checkout' : 'Next aisle';
    onward.textContent = onwardLabel;
    onward.dataset['exit'] = 'onward';
    onward.addEventListener('click', () => {
      this.offers.take('onward');
    });
    const toCheckout = document.createElement('button');
    toCheckout.type = 'button';
    toCheckout.className = 'overlay__button overlay__button--quiet';
    toCheckout.textContent = 'Skip to checkout';
    toCheckout.dataset['exit'] = 'checkout';
    toCheckout.addEventListener('click', () => {
      this.offers.take('checkout');
    });
    nav.append(onward);
    const offered: ExitOffer[] = [{ kind: 'control', exitId: 'onward', label: onwardLabel, control: onward }];
    if (config.next !== 'market.checkout') {
      nav.append(toCheckout);
      offered.push({ kind: 'control', exitId: 'checkout', label: 'Skip to checkout', control: toCheckout });
    }

    this.root.append(head, this.list, this.preview, this.status, nav);
    document.body.appendChild(this.root);
    // Registered once the nav is in the document: an offer is a button the
    // player can click, not an intention to add one.
    this.offers.set(offered);
    this.render();
  }

  private render(): void {
    const { soul } = this.context;
    this.list.replaceChildren();

    for (const item of itemsIn(this.config.id)) {
      const row = document.createElement('div');
      row.className = 'market__row';

      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'market__item';
      pick.dataset['item'] = item.id;
      const inCart = isInCart(soul, item);
      const locked = isLocked(soul, item);
      pick.setAttribute('aria-pressed', String(inCart));
      if (inCart) {
        row.dataset['taken'] = 'true';
      }
      if (locked) {
        row.dataset['locked'] = 'true';
      }

      const name = document.createElement('span');
      name.className = 'market__name';
      name.textContent = item.label;

      const price = document.createElement('span');
      price.className = 'market__price';
      price.textContent = locked
        ? 'already in your cart'
        : item.karmaCost > 0
          ? `costs ${String(item.karmaCost)}`
          : item.karmaCost < 0
            ? `repays ${String(-item.karmaCost)}`
            : 'free';

      pick.append(name, price);
      pick.addEventListener('click', () => {
        this.selected = item;
        this.preview.textContent = item.flash;
        this.preview.dataset['visible'] = 'true';
        this.onSelect(item);
        this.render();
      });
      row.append(pick);

      if (this.selected?.id === item.id) {
        row.dataset['selected'] = 'true';
        const act = document.createElement('button');
        act.type = 'button';
        act.className = 'market__act';
        if (locked) {
          act.textContent = 'Cannot be put back';
          act.disabled = true;
        } else if (inCart) {
          act.textContent = 'Put back';
          act.addEventListener('click', () => {
            putBack(soul, item);
            this.render();
          });
        } else if (canTake(soul, item)) {
          act.textContent = 'Take it';
          act.addEventListener('click', () => {
            take(soul, item);
            this.render();
          });
        } else {
          act.textContent = 'You cannot afford this';
          act.disabled = true;
        }
        row.append(act);
      }

      this.list.append(row);
    }

    const taken = this.context.soul.cart.length;
    const left = remainingKarma(this.context.soul);
    this.status.textContent =
      `${String(taken)} in your cart · karma ${left >= 0 ? '+' : ''}${String(left)}`;
  }

  get held(): MarketItem | undefined {
    return this.selected;
  }

  dispose(): void {
    this.offers.clear();
    this.root.remove();
  }
}

/** Shared staging: shelves of light, one plinth per item. */
function buildAisle(context: SceneContext, config: AisleConfig): {
  update: (delta: number, elapsed: number, held: MarketItem | undefined) => void;
} {
  const { resources, scene } = context;

  const air = airShell(resources, { radius: 110, ground: config.ground, glow: config.accent, density: 0.75 });
  scene.add(air.mesh);

  const radiance = radianceShell(resources, { radius: 100, color: config.glow, accent: config.accent });
  radiance.setFocus(0, 0.2, -1);
  radiance.setIntensity(0.22);
  scene.add(radiance.mesh);

  const shelf = new Group();
  scene.add(shelf);

  const plinthGeometry = resources.track(new CylinderGeometry(0.34, 0.42, 1.0, 18));
  const plinthMaterial = resources.track(
    new MeshBasicMaterial({
      color: config.accent,
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );

  const items = itemsIn(config.id);
  const wares = items.map((item, index) => {
    const spread = (index - (items.length - 1) / 2) * 1.75;
    const plinth = new Mesh(plinthGeometry, plinthMaterial);
    plinth.position.set(spread, -0.5, -5.2 - Math.abs(spread) * 0.22);
    shelf.add(plinth);

    const glow = volumetricGlow(resources, {
      radius: 0.52,
      color: config.glow,
      intensity: 0.9,
      softness: 2.2,
    });
    glow.mesh.position.set(spread, 0.42, -5.2 - Math.abs(spread) * 0.22);
    shelf.add(glow.mesh);

    return { item, glow, base: 0.9, phase: index * 1.17 };
  });

  const motes = moteField(resources, context.rng.stream(`market-${config.id}`), {
    count: 1000,
    radius: 13,
    color: config.glow,
    size: 0.15,
  });
  scene.add(motes.points);

  context.rig.setMode('embodied');
  context.rig.position.set(0, 1.5, 0);
  context.rig.orient(0, -0.03);
  context.rig.setSway(0.26);
  context.rig.setRoll(0);
  context.rig.setPulse(0);

  const grade = context.post.grade;
  grade.drain = 0.06;
  grade.grain = 0.05;
  grade.vignette = 0.32;
  grade.aberration = 0.002;
  grade.distortion = 0.024;
  grade.exposure = 1.12;
  grade.washColor = [1, 0.97, 0.93];
  grade.washAmount = 0.02;
  grade.smear = 0;
  context.post.setBloom(0.8, 0.72, 0.66);

  context.audio.drone(0.17, 58, 9);
  context.audio.shimmer(0.22);
  context.audio.room(0.05, 900);
  context.audio.heartbeat(false);

  return {
    update(delta, elapsed, held) {
      setU(air.material, 'uTime', elapsed);
      radiance.update(elapsed);
      motes.drift(delta, elapsed);
      for (const ware of wares) {
        ware.glow.update(elapsed, context.camera);
        // The held item flares: the preview is a thing you can see as well as read.
        const lifted = held?.id === ware.item.id ? 1 : 0;
        const breathe = 0.9 + Math.sin(elapsed * 0.6 + ware.phase) * 0.1;
        setU(ware.glow.material, 'uIntensity', (ware.base + lifted * 1.6) * breathe);
        ware.glow.mesh.position.y = 0.42 + lifted * 0.18 + Math.sin(elapsed * 0.5 + ware.phase) * 0.03;
      }
    },
  };
}

function createAisleScene(config: AisleConfig): SceneDefinition {
  return {
    id: config.sceneId,
    title: config.title,
    discarnate: true,
    exits: [
      { id: 'onward', label: config.next === 'market.checkout' ? 'To checkout' : 'Next aisle', to: config.next },
      { id: 'checkout', label: 'Skip to checkout', to: 'market.checkout' },
    ],
    create(context: SceneContext): SceneInstance {
      const stage = buildAisle(context, config);
      let panel: MarketPanel | undefined = new MarketPanel(config, context, () => {
        // Selection is read from the panel each frame; nothing to do here.
      });
      context.resources.onDispose(() => {
        panel?.dispose();
        panel = undefined;
      });
      return {
        update(delta, elapsed) {
          stage.update(delta, elapsed, panel?.held);
        },
      };
    },
  };
}

export const marketAisleScenes: readonly SceneDefinition[] = AISLES.map(createAisleScene);

/** The checkout: the cart is weighed, and the guides speak once. */
export const marketCheckoutScene: SceneDefinition = {
  id: 'market.checkout',
  title: 'Checkout',
  discarnate: true,
  exits: [
    { id: 'river', label: 'To the River of Forgetting', to: 'light.river-of-forgetting' },
    { id: 'again', label: 'Begin again', to: 'content-notes' },
  ],
  create(context: SceneContext): SceneInstance {
    const { resources, scene, soul } = context;

    const air = airShell(resources, { radius: 120, ground: 0x1b1630, glow: 0x6f5bd0, density: 0.6 });
    scene.add(air.mesh);

    const radiance = radianceShell(resources, { radius: 105, color: 0xfff0d8, accent: 0x9f8cf0 });
    radiance.setFocus(0, 0.2, -1);
    radiance.setIntensity(0.3);
    scene.add(radiance.mesh);

    // The cart, as light: one mote-bright form per thing chosen.
    const cartGroup = new Group();
    scene.add(cartGroup);
    const verdict = weighCart(soul);
    const held = soul.cart.map((item, index) => {
      const spread = (index - (soul.cart.length - 1) / 2) * 1.3;
      const glow = volumetricGlow(resources, {
        radius: item.karmaCost < 0 ? 0.58 : 0.44,
        color: item.karmaCost < 0 ? 0xffb48a : 0xffe6b0,
        intensity: 1.1,
        softness: 2.2,
      });
      glow.mesh.position.set(spread, 0.6, -4.4);
      cartGroup.add(glow.mesh);
      return { glow, phase: index * 0.9 };
    });

    const motes = moteField(resources, context.rng.stream('checkout'), {
      count: 1200,
      radius: 14,
      color: 0xffe3bd,
      size: 0.16,
    });
    scene.add(motes.points);

    context.rig.setMode('embodied');
    context.rig.position.set(0, 1.5, 0);
    context.rig.orient(0, -0.02);
    context.rig.setSway(0.24);
    context.rig.setRoll(0);
    context.rig.setPulse(0);

    const grade = context.post.grade;
    grade.drain = 0.04;
    grade.grain = 0.04;
    grade.vignette = 0.3;
    grade.aberration = 0.002;
    grade.distortion = 0.022;
    grade.exposure = 1.12;
    grade.washColor = [1, 0.97, 0.92];
    grade.washAmount = 0.025;
    grade.smear = 0;
    context.post.setBloom(0.85, 0.75, 0.66);

    context.audio.drone(0.2, 60, 12);
    context.audio.shimmer(0.3);
    context.audio.heartbeat(false);

    // The guides speak once (GAME_BRIEF.md § Checkout).
    const panel = document.createElement('div');
    panel.className = 'market market--checkout';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Checkout');

    const title = document.createElement('h1');
    title.className = 'market__title';
    title.textContent = 'The cart is weighed';

    const summary = document.createElement('p');
    summary.className = 'market__status';
    summary.textContent =
      `${String(verdict.gifts)} gift${verdict.gifts === 1 ? '' : 's'} · ` +
      `${String(verdict.challenges)} challenge${verdict.challenges === 1 ? '' : 's'} · ` +
      `karma ${verdict.remaining >= 0 ? '+' : ''}${String(verdict.remaining)}`;

    const spoken = document.createElement('p');
    spoken.className = 'market__verdict';
    spoken.textContent = verdict.verdict;

    const manifestList = document.createElement('ul');
    manifestList.className = 'market__manifest';
    for (const item of soul.cart) {
      const row = document.createElement('li');
      row.textContent = item.locked ? `${item.label} — carried over` : item.label;
      manifestList.append(row);
    }

    const nav = document.createElement('div');
    nav.className = 'market__nav';
    // The checkout's two ways on, registered as offers rather than left to the
    // definition's declaration (`systems/exit-offers.ts`).
    const offers = exitOffers.source('market.checkout panel');
    const river = document.createElement('button');
    river.type = 'button';
    river.className = 'overlay__button';
    river.textContent = 'To the River of Forgetting';
    river.dataset['exit'] = 'river';
    river.addEventListener('click', () => {
      offers.take('river');
    });
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'overlay__button overlay__button--quiet';
    again.textContent = 'Begin again';
    again.dataset['exit'] = 'again';
    again.addEventListener('click', () => {
      offers.take('again');
    });
    nav.append(river, again);

    panel.append(title, summary, spoken, manifestList, nav);
    document.body.appendChild(panel);
    offers.set([
      { kind: 'control', exitId: 'river', label: 'To the River of Forgetting', control: river },
      { kind: 'control', exitId: 'again', label: 'Begin again', control: again },
    ]);
    resources.onDispose(() => {
      offers.clear();
      panel.remove();
    });

    return {
      update(delta, elapsed) {
        setU(air.material, 'uTime', elapsed);
        radiance.update(elapsed);
        motes.drift(delta, elapsed);
        for (const entry of held) {
          entry.glow.update(elapsed, context.camera);
          setU(entry.glow.material, 'uIntensity', 1.1 + Math.sin(elapsed * 0.5 + entry.phase) * 0.14);
        }
      },
    };
  },
};
