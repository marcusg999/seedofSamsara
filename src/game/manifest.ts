/**
 * The scene graph the game is committed to building, taken from GAME_BRIEF.md.
 *
 * This list is what the gate measures coverage against. A scene is `planned`
 * until it is registered in `src/game/scenes/index.ts`; the gate then enforces
 * the full set of checks on it (renders, exits reachable, no console error, no
 * WebGL warning, no shader error, no softlock, disposes cleanly).
 *
 * Flipping an entry to `implemented` is how a scene opts into enforcement, and
 * the gate fails if an entry claims `implemented` but is not registered. That
 * keeps the gate honest while the game is still being built: it cannot be
 * quietly satisfied by leaving scenes out, because `npm run gate` prints the
 * planned/implemented split on every run.
 */

export type SceneStatus = 'planned' | 'implemented';

export interface ManifestEntry {
  readonly id: string;
  readonly act: string;
  readonly status: SceneStatus;
  /** Why this scene exists, traced to the brief. */
  readonly note: string;
}

export const SCENE_MANIFEST: readonly ManifestEntry[] = [
  // Before play (GAME_BRIEF.md § Act 1, treatment rule).
  { id: 'content-notes', act: 'front-matter', status: 'implemented', note: 'Content notes appear before play.' },
  { id: 'vignette-select', act: 'front-matter', status: 'implemented', note: 'Player chooses a vignette or takes a random death.' },

  // Act 1 — the seven death vignettes.
  { id: 'death.car-crash', act: 'act1', status: 'planned', note: 'Vignette 1.' },
  { id: 'death.cliff-fall', act: 'act1', status: 'planned', note: 'Vignette 2: fall while hiking.' },
  { id: 'death.police-shooting', act: 'act1', status: 'planned', note: 'Vignette 3. Camera centers the victim.' },
  { id: 'death.bomb-blast', act: 'act1', status: 'planned', note: 'Vignette 4.' },
  { id: 'death.heart-attack', act: 'act1', status: 'implemented', note: 'Vignette 5. Grounded in cardiac-arrest NDE research.' },
  { id: 'death.lynching', act: 'act1', status: 'planned', note: 'Vignette 6. Camera centers the victim; perpetrators never the subject.' },
  { id: 'death.dmt', act: 'act1', status: 'planned', note: 'Vignette 7. Experience only, no dosing or preparation detail.' },

  // Act 2 — the Threshold, built from Moody's recurring elements.
  { id: 'threshold.pronounced-dead', act: 'act2', status: 'implemented', note: 'Hearing yourself pronounced dead.' },
  { id: 'threshold.buzzing', act: 'act2', status: 'implemented', note: 'The buzzing or ringing.' },
  { id: 'threshold.out-of-body', act: 'act2', status: 'implemented', note: 'The out-of-body view.' },
  { id: 'threshold.tunnel', act: 'act2', status: 'implemented', note: 'Living tunnel shader.' },
  { id: 'threshold.loved-ones', act: 'act2', status: 'implemented', note: 'Deceased loved ones and guides resolve out of glow.' },
  { id: 'threshold.being-of-light', act: 'act2', status: 'implemented', note: 'The Being of Light.' },
  { id: 'threshold.border', act: 'act2', status: 'implemented', note: 'The border.' },
  { id: 'threshold.choice', act: 'act2', status: 'implemented', note: 'ENTER THE LIGHT or REFUSE IT.' },

  // Path A — the Light.
  { id: 'light.life-review', act: 'pathA', status: 'implemented', note: 'Key moments from others’ point of view. The moral engine.' },
  { id: 'light.council', act: 'pathA', status: 'implemented', note: 'Guides weigh the life: heart against the feather.' },
  { id: 'market.parents', act: 'pathA', status: 'implemented', note: 'Life Market aisle: living dioramas.' },
  { id: 'market.body', act: 'pathA', status: 'implemented', note: 'Life Market aisle: body, form, birthmark carried from a past death.' },
  { id: 'market.gifts', act: 'pathA', status: 'implemented', note: 'Life Market aisle: talents. Cost karma.' },
  { id: 'market.trauma', act: 'pathA', status: 'implemented', note: 'Life Market aisle: challenges. Sacred, not grim.' },
  { id: 'market.economics', act: 'pathA', status: 'implemented', note: 'Life Market aisle: economic circumstance.' },
  { id: 'market.place', act: 'pathA', status: 'implemented', note: 'Life Market aisle: planet, culture, era.' },
  { id: 'market.contracts', act: 'pathA', status: 'implemented', note: 'Life Market aisle: soul contracts.' },
  { id: 'market.checkout', act: 'pathA', status: 'implemented', note: 'The cart is weighed; the guides speak once.' },
  { id: 'light.river-of-forgetting', act: 'pathA', status: 'planned', note: 'Myth of Er: souls drink and forget.' },
  { id: 'light.rebirth', act: 'pathA', status: 'planned', note: 'Cart contents become the next run’s opening conditions.' },

  // Path B — refusing the Light.
  { id: 'refuse.earthbound', act: 'pathB', status: 'planned', note: 'Haunting the living.' },
  { id: 'refuse.mist', act: 'pathB', status: 'planned', note: 'Lower sphere: desaturated fog, heavy grain.' },
  { id: 'refuse.void', act: 'pathB', status: 'planned', note: 'Distressing-NDE void (Greyson & Bush).' },
  { id: 'refuse.lower-sphere', act: 'pathB', status: 'planned', note: 'Geometry decays around the player’s attachments.' },
  { id: 'refuse.rescue', act: 'pathB', status: 'planned', note: 'Rising by freeing bound souls, not combat.' },
  { id: 'refuse.higher-sphere', act: 'pathB', status: 'planned', note: 'Hues beyond the normal spectrum, refraction.' },
  { id: 'refuse.city-of-light', act: 'pathB', status: 'planned', note: 'Architecture made of sound and light.' },

  // Threads that cut across both paths.
  { id: 'dmt.hyperspace', act: 'thread', status: 'planned', note: 'Raymarched fractal hyperspace; entities aware of the player.' },
  { id: 'dmt.sent-back', act: 'thread', status: 'planned', note: '“It is not your time” — unlocks the alternate thread.' },
  { id: 'past-life.memory-shard', act: 'thread', status: 'planned', note: 'Shards reveal earlier incarnations; a death wound can become a birthmark.' },
];

export function implementedIds(): string[] {
  return SCENE_MANIFEST.filter((entry) => entry.status === 'implemented').map((entry) => entry.id);
}

export function plannedIds(): string[] {
  return SCENE_MANIFEST.filter((entry) => entry.status === 'planned').map((entry) => entry.id);
}
