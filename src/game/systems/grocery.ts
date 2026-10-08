import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Fog,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '../rng';
import type { ResourceTracker } from '../disposal';
import { setU } from './glsl';

/**
 * The grocery architecture the Life Market is built out of.
 *
 * GAME_BRIEF.md § The Life Market says the soul shops for its next life "the
 * way you'd shop for groceries". That is a room, not a metaphor: a long aisle
 * running to a vanishing point, shelving on both sides with uprights, decks,
 * a back panel and a pale price rail along every edge, a suspended ceiling of
 * square tiles with recessed runs of light, and a polished speckled floor that
 * returns those runs as streaks. What makes it the game's market rather than a
 * photograph is the light: the far end does not end, it recedes into glow, and
 * each aisle is lit in its own colour. The Trauma aisle is the warmest room
 * here, because the brief asks for sacred and not grim.
 *
 * Everything on the shelves is invented — abstract blocks, bottles, jars, cans
 * and pouches in flat colour, with no mark, text or packaging taken from
 * anything real.
 *
 * Performance is the constraint that shaped this file. The gate runs on
 * SwiftShader, where a thousand separate product meshes would be a thousand
 * draw calls and the scene would not render at a playable rate at all. So:
 * - the shelving is one bay geometry, instanced once per bay per side;
 * - the products are five archetype geometries, each one `InstancedMesh`;
 * - the room shell (floor, ceiling, far wall) is three shader-drawn planes;
 * - nothing is lit. Shading is baked into vertex colours from the face normal,
 *   because a real light costs a per-fragment loop and buys nothing a baked
 *   overhead key does not already give a room lit from the ceiling.
 * That puts the whole aisle in roughly a dozen draw calls.
 */

/** What one aisle's light is made of. Seven aisles differ by this and copy alone. */
export interface AisleLight {
  /** The strip lights, and so the dominant colour of the room. */
  readonly tube: number;
  /** What the far end recedes into. The aisle does not end; it goes to glow. */
  readonly haze: number;
  /** Shelving metal, ceiling tile and floor. */
  readonly shell: number;
  /** The hue the packaging drifts toward, so each aisle has a family resemblance. */
  readonly accent: number;
  /** Overall lift. Above 1 for the aisles meant to feel warm and open. */
  readonly brightness: number;
}

export interface GroceryAisle {
  readonly group: Group;
  /**
   * Where featured life `index` sits on the shelf, in world space. The right
   * hand run, at eye level, because the shelf panel covers the left of the
   * viewport on desktop.
   */
  heroAnchor(index: number): Vector3;
  /** Advance the room. Cheap by design: one uniform per shader plane. */
  update(elapsed: number): void;
  /** What the room cost to build, for the frame budget. */
  readonly stats: GroceryStats;
}

export interface GroceryStats {
  readonly productInstances: number;
  readonly bayInstances: number;
  readonly triangles: number;
  readonly drawCalls: number;
}

// --- the room's dimensions, in metres ------------------------------------
/** Half the gap between the two shelf faces. A real grocery aisle is ~3m wide. */
const AISLE_HALF = 1.58;
const UNIT_DEPTH = 0.6;
const UNIT_HEIGHT = 2.12;
const BAY_WIDTH = 1.24;
/** Enough bays that the run passes out of sight before it stops. */
const BAYS = 18;
/** The first bay starts just ahead of the camera, so the run frames the view. */
const RUN_START_Z = -1.35;
const RUN_END_Z = RUN_START_Z - BAYS * BAY_WIDTH;
/** The cross-aisle the run opens onto, so the room is not a sealed box. */
const CROSS_AISLE_Z = RUN_END_Z - 3.4;
const END_WALL_Z = CROSS_AISLE_Z - 2.6;
const CEILING_Y = 3.05;
/** Deck heights. Five decks and a kick plate, as on a real gondola. */
const DECKS: readonly number[] = [0.3, 0.7, 1.1, 1.5, 1.9];
/** The deck the featured lives sit on: eye level for a camera at 1.5m. */
const HERO_DECK = 3;
const HERO_FIRST_Z = -3.1;
const HERO_SPACING = 1.55;
/** Ceiling runs, as offsets from the centre line. */
const TUBE_SPACING = 1.15;
const TUBE_COUNT = 5;
/**
 * Where the haze begins and where it has swallowed everything. Set so the
 * whole shelf run stays readable and the cross-aisle beyond it does not: the
 * aisle should look like it continues past where the eye gives up, which is
 * not the same as whiting out before the shelving has even receded.
 */
const HAZE_NEAR = 11;
const HAZE_FAR = 36;

/**
 * Bake an overhead key into a geometry's vertex colours.
 *
 * The room is lit from a ceiling of strip lights, which means upward faces are
 * bright, the faces turned toward the aisle catch the run directly overhead,
 * and the faces turned into the unit fall away. That is the whole of the
 * lighting model, and it costs nothing per frame. `value` scales the result, so
 * a pale price rail and a dark bottle cap come out of the same function.
 */
function bakeKey(geometry: BufferGeometry, value: number): BufferGeometry {
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(normal.count * 3);
  for (let index = 0; index < normal.count; index += 1) {
    const up = Math.max(0, normal.getY(index));
    const across = Math.abs(normal.getX(index));
    const along = Math.abs(normal.getZ(index));
    // Clamped above 1, not at it: the pale shelf-edge rail is supposed to be
    // the brightest thing on the shelving, and a ceiling of 1 made it merely
    // as bright as the deck behind it.
    const shade = Math.min(1.9, (0.3 + up * 0.6 + across * 0.3 + along * 0.17) * value);
    colors[index * 3] = shade;
    colors[index * 3 + 1] = shade;
    colors[index * 3 + 2] = shade;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

/** A keyed box, placed in its parent's local space. Merged, never drawn alone. */
function part(
  size: [number, number, number],
  at: [number, number, number],
  value: number,
): BufferGeometry {
  const geometry = new BoxGeometry(size[0], size[1], size[2]);
  geometry.translate(at[0], at[1], at[2]);
  return bakeKey(geometry, value);
}

/** A keyed cylinder, used for cans, bottles, jars and cart wheels. */
function tube(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  y: number,
  value: number,
): BufferGeometry {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, segments);
  geometry.translate(0, y, 0);
  return bakeKey(geometry, value);
}

/** Merge, then free the pieces: only the merged result is ever uploaded. */
function fuse(pieces: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(pieces);
  for (const piece of pieces) {
    piece.dispose();
  }
  return merged;
}

function trianglesOf(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  return (index ? index.count : geometry.getAttribute('position').count) / 3;
}

/**
 * One shelving bay, built in a local frame whose origin sits on the floor at
 * the centre of its aisle-facing edge, with the unit extending toward -X and
 * the bay's width along Z. The right-hand run is the same geometry turned a
 * half turn, which is why the shading bake has to be symmetric in X.
 */
function bayGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  const mid = -UNIT_DEPTH / 2;

  // Back panel, the thing that stops the aisle being see-through.
  pieces.push(part([0.035, UNIT_HEIGHT, BAY_WIDTH], [-UNIT_DEPTH, UNIT_HEIGHT / 2, 0], 0.72));
  // Uprights at both ends of the bay, which is what makes a run read as bays.
  for (const side of [-1, 1]) {
    pieces.push(part([UNIT_DEPTH, UNIT_HEIGHT, 0.05], [mid, UNIT_HEIGHT / 2, (side * BAY_WIDTH) / 2], 0.86));
  }
  // Kick plate and top cap.
  pieces.push(part([UNIT_DEPTH, 0.22, BAY_WIDTH], [mid, 0.11, 0], 0.6));
  pieces.push(part([UNIT_DEPTH, 0.045, BAY_WIDTH], [mid, UNIT_HEIGHT, 0], 1));

  for (const deck of DECKS) {
    pieces.push(part([UNIT_DEPTH - 0.02, 0.035, BAY_WIDTH], [mid - 0.01, deck, 0], 0.95));
    // The pale shelf-edge rail, where the price labels live. The brightest
    // horizontal line in the reference, and the thing that most makes a
    // shelf read as retail rather than as a bookcase.
    pieces.push(part([0.03, 0.095, BAY_WIDTH], [-0.004, deck + 0.058, 0], 1.95));
  }

  return fuse(pieces);
}

/**
 * A shopping cart, standing in the aisle. Wire basket, so it is built out of
 * bars — thirty-odd of them, merged into one geometry and drawn once.
 */
function cartGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  const width = 0.54;
  const length = 0.84;
  const floorY = 0.56;
  const topY = 1.0;

  // Basket floor: a grid of bars, which is what you actually see looking in.
  for (let i = 0; i < 5; i += 1) {
    const x = (i / 4 - 0.5) * width;
    pieces.push(part([0.016, 0.014, length], [x, floorY, 0], 1.1));
  }
  for (let i = 0; i < 3; i += 1) {
    const z = (i / 2 - 0.5) * length;
    pieces.push(part([width, 0.014, 0.016], [0, floorY + 0.012, z], 1.1));
  }
  // Four walls of horizontal rails, stepping outward with height so the
  // basket flares the way a real one does.
  for (let rail = 0; rail < 4; rail += 1) {
    const t = rail / 3;
    const y = floorY + 0.04 + t * (topY - floorY - 0.04);
    const flare = 1 + t * 0.16;
    const w = width * flare;
    const l = length * flare;
    const weight = rail === 3 ? 1.3 : 1.05;
    pieces.push(part([0.018, 0.018, l], [-w / 2, y, 0], weight));
    pieces.push(part([0.018, 0.018, l], [w / 2, y, 0], weight));
    pieces.push(part([w, 0.018, 0.018], [0, y, -l / 2], weight));
    pieces.push(part([w, 0.018, 0.018], [0, y, l / 2], weight));
  }
  // A few verticals, so the walls are not four floating hoops.
  for (const x of [-0.5, 0, 0.5]) {
    for (const z of [-0.5, 0.5]) {
      pieces.push(part([0.014, topY - floorY, 0.014], [x * width, (floorY + topY) / 2, z * length], 1));
    }
  }
  // Handle, legs, wheels.
  pieces.push(part([width * 1.18, 0.026, 0.026], [0, topY + 0.07, length * 0.56], 1.35));
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      pieces.push(part([0.022, floorY, 0.022], [x * width * 0.46, floorY / 2, z * length * 0.44], 0.9));
      const wheel = tube(0.055, 0.055, 0.026, 8, 0, 0.8);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(x * width * 0.46, 0.055, z * length * 0.44);
      pieces.push(wheel);
    }
  }

  return fuse(pieces);
}

/**
 * The five things on a grocery shelf, as original abstract forms. Each is built
 * on a unit footprint with its base at the origin, so one instance matrix sets
 * both size and place. Value bands are baked in, which is what stops a flat
 * instance colour reading as a plain painted block.
 */
function productGeometries(): BufferGeometry[] {
  // A carton, banded: three stacked blocks at different values.
  const carton = fuse([
    part([1, 0.44, 1], [0, 0.22, 0], 1),
    part([1.004, 0.18, 1.004], [0, 0.53, 0], 0.52),
    part([1, 0.38, 1], [0, 0.81, 0], 0.9),
  ]);

  // A can: body between two darker rims.
  const can = fuse([
    tube(0.5, 0.5, 0.86, 10, 0.5, 1),
    tube(0.47, 0.5, 0.07, 10, 0.935, 0.42),
    tube(0.5, 0.47, 0.07, 10, 0.035, 0.42),
  ]);

  // A bottle: body, shoulder, cap.
  const bottle = fuse([
    tube(0.5, 0.48, 0.62, 8, 0.31, 1),
    tube(0.22, 0.5, 0.24, 8, 0.74, 0.8),
    tube(0.21, 0.21, 0.14, 8, 0.93, 0.34),
  ]);

  // A jar: squat body, wide lid.
  const jar = fuse([
    tube(0.5, 0.46, 0.74, 8, 0.37, 1),
    tube(0.44, 0.44, 0.26, 8, 0.87, 0.4),
  ]);

  // A pouch: a four-sided taper, crimped across the top.
  const pouch = fuse([
    tube(0.34, 0.5, 0.9, 4, 0.45, 1),
    part([0.56, 0.1, 0.07], [0, 0.93, 0], 0.6),
  ]);

  return [carton, can, bottle, jar, pouch];
}

/**
 * Which archetype gets drawn next. Weighted toward the cheap boxy forms,
 * which is both what a grocery shelf is mostly made of and what keeps the
 * triangle count down.
 */
const ARCHETYPE_DRAW: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4];

/**
 * Packaging colour. Saturated, because density of colour is what makes a shelf
 * read as a shop; invented, because nothing here may resemble a real product.
 */
const PACKAGING: readonly number[] = [
  0xd4342b, 0xe4563a, 0xef8a23, 0xf2a93b, 0xf2cf3c, 0xdfe04a,
  0x4fa55a, 0x8cc63f, 0x2f6fc4, 0x3fa9d8, 0x7a4fb0, 0xd43f86,
  0xe8dcc0, 0x2fb3a0, 0xc8542f, 0xf0efe6,
];

/** Shared scratch, so placing a thousand instances allocates nothing. */
const SCRATCH_MATRIX = new Matrix4();
const SCRATCH_POSITION = new Vector3();
const SCRATCH_QUATERNION = new Quaternion();
const SCRATCH_SCALE = new Vector3();
const SCRATCH_AXIS = new Vector3(0, 1, 0);
const SCRATCH_COLOR = new Color();

interface Placement {
  readonly archetype: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly depth: number;
  readonly height: number;
  readonly width: number;
  readonly yaw: number;
  readonly color: Color;
}

/**
 * Fill both runs of shelving with product.
 *
 * Density falls off down the aisle: the near bays are packed with small
 * facings, the far ones hold fewer, larger ones. That is a level-of-detail
 * trade and not a cheat anyone can see — past fifteen metres a facing is a
 * couple of pixels wide and half of it is haze.
 */
function placeProducts(rng: Rng, accent: Color, heroZ: readonly number[]): Placement[] {
  const placements: Placement[] = [];

  for (const side of [-1, 1]) {
    for (let bay = 0; bay < BAYS; bay += 1) {
      const bayStart = RUN_START_Z - bay * BAY_WIDTH;
      const tier = bay < 7 ? 0 : bay < 13 ? 1 : 2;
      const minWidth = tier === 0 ? 0.085 : tier === 1 ? 0.13 : 0.2;
      const maxWidth = tier === 0 ? 0.165 : tier === 1 ? 0.22 : 0.3;

      for (let deck = 0; deck < DECKS.length; deck += 1) {
        const deckY = DECKS[deck] ?? 0;
        // Headroom to the deck above, so nothing grows through a shelf.
        const above = DECKS[deck + 1] ?? UNIT_HEIGHT;
        const headroom = above - deckY - 0.06;

        let cursor = bayStart - 0.04;
        const limit = bayStart - BAY_WIDTH + 0.04;
        while (cursor - minWidth > limit) {
          const width = Math.min(rng.range(minWidth, maxWidth), cursor - limit);
          const z = cursor - width / 2;
          cursor -= width + rng.range(0.002, 0.009);

          // The featured lives own their slot on the hero deck; nothing else
          // is shelved there, or the two fight for the same space.
          if (side > 0 && deck === HERO_DECK && heroZ.some((at) => Math.abs(at - z) < 0.26)) {
            continue;
          }

          const depth = rng.range(0.07, 0.15);
          const height = Math.min(headroom, rng.range(0.17, 0.33));
          const color = SCRATCH_COLOR.setHex(PACKAGING[rng.int(0, PACKAGING.length - 1)] ?? 0xffffff)
            .lerp(accent, 0.22)
            .clone();

          placements.push({
            archetype: ARCHETYPE_DRAW[rng.int(0, ARCHETYPE_DRAW.length - 1)] ?? 0,
            x: side * (AISLE_HALF - 0.025 - depth / 2),
            y: deckY + 0.018,
            z,
            depth,
            height,
            width,
            yaw: rng.range(-0.07, 0.07),
            color,
          });
        }
      }
    }
  }

  return placements;
}

/** The room's shell: floor, ceiling and the far wall, as three shader planes. */
function shellUniforms(light: AisleLight): Record<string, { value: unknown }> {
  return {
    uTime: { value: 0 },
    uShell: { value: new Color(light.shell) },
    uHaze: { value: new Color(light.haze) },
    uTube: { value: new Color(light.tube) },
    uAccent: { value: new Color(light.accent) },
    uBrightness: { value: light.brightness },
  };
}

/** Shared by all three shell shaders: world position, and a cheap value hash. */
const SHELL_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHELL_COMMON = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uShell;
  uniform vec3 uHaze;
  uniform vec3 uTube;
  uniform vec3 uAccent;
  uniform float uBrightness;
  varying vec3 vWorld;

  // One hash, not fbm: this runs over most of the frame and the room needs
  // speckle, not turbulence.
  float hash21(vec2 p) {
    p = fract(p * vec2(127.31, 311.7));
    p += dot(p, p + 34.19);
    return fract(p.x * p.y);
  }

  // Matched by hand to the scene fog the shelving uses, so the shell and the
  // shelves recede into the same glow instead of parting company halfway down.
  vec3 recede(vec3 color, float z) {
    float f = clamp((-z - ${HAZE_NEAR.toFixed(1)}) / ${(HAZE_FAR - HAZE_NEAR).toFixed(1)}, 0.0, 1.0);
    return mix(color, uHaze, f * f);
  }
`;

export function groceryAisle(
  tracker: ResourceTracker,
  scene: Scene,
  rng: Rng,
  light: AisleLight,
  heroCount: number,
): GroceryAisle {
  const group = new Group();
  scene.add(group);

  const shellMaterials: ShaderMaterial[] = [];
  let triangles = 0;
  let drawCalls = 0;

  // --- floor: pale speckled terrazzo, polished enough to return the runs ---
  const floorGeometry = tracker.track(new PlaneGeometry(14, 44));
  floorGeometry.rotateX(-Math.PI / 2);
  floorGeometry.translate(0, 0, (RUN_START_Z + END_WALL_Z) / 2 - 4);
  const floorMaterial = tracker.track(
    new ShaderMaterial({
      uniforms: shellUniforms(light),
      vertexShader: SHELL_VERTEX,
      fragmentShader: /* glsl */ `
        ${SHELL_COMMON}
        void main() {
          vec2 p = vWorld.xz;
          float fine = hash21(floor(p * 38.0));
          float coarse = hash21(floor(p * 11.0) + 7.3);
          vec3 color = uShell * (0.56 + fine * 0.26 + coarse * 0.12);

          // The reflected runs sit nearer the centre line than the fittings
          // themselves, because the camera is below the ceiling and above the
          // floor: the mirror image converges.
          float streak = 0.0;
          for (int i = 0; i < ${String(TUBE_COUNT)}; i += 1) {
            float sx = (float(i) - ${((TUBE_COUNT - 1) / 2).toFixed(1)}) * ${(TUBE_SPACING * 0.54).toFixed(3)};
            float d = (p.x - sx) / 0.17;
            streak += exp(-d * d);
          }
          // Barely broken along its length: a polished floor returns the run
          // as a continuous line, and a high-frequency break turned it into a
          // row of puddles instead.
          float along = 0.76 + 0.24 * sin(p.y * 0.5 + hash21(floor(p * vec2(1.5, 0.6))) * 2.0);
          color += uTube * streak * along * 0.4 * uBrightness;

          gl_FragColor = vec4(recede(color, vWorld.z), 1.0);
        }
      `,
    }),
  );
  shellMaterials.push(floorMaterial);
  const floor = new Mesh(floorGeometry, floorMaterial);
  group.add(floor);
  triangles += 2;
  drawCalls += 1;

  // --- ceiling: square tiles, with recessed runs down the length ----------
  const ceilingGeometry = tracker.track(new PlaneGeometry(14, 44));
  ceilingGeometry.rotateX(Math.PI / 2);
  ceilingGeometry.translate(0, CEILING_Y, (RUN_START_Z + END_WALL_Z) / 2 - 4);
  const ceilingMaterial = tracker.track(
    new ShaderMaterial({
      uniforms: shellUniforms(light),
      vertexShader: SHELL_VERTEX,
      fragmentShader: /* glsl */ `
        ${SHELL_COMMON}
        void main() {
          vec2 p = vWorld.xz;
          vec2 cell = p / 0.61;
          vec2 g = abs(fract(cell) - 0.5);
          float grout = smoothstep(0.4, 0.5, max(g.x, g.y));
          vec3 color = uShell * (0.84 + hash21(floor(cell)) * 0.14) * (1.0 - grout * 0.28);

          float lamp = 0.0;
          float spill = 0.0;
          for (int i = 0; i < ${String(TUBE_COUNT)}; i += 1) {
            float sx = (float(i) - ${((TUBE_COUNT - 1) / 2).toFixed(1)}) * ${TUBE_SPACING.toFixed(3)};
            float d = abs(p.x - sx);
            lamp += smoothstep(0.072, 0.046, d);
            spill += exp(-d * d * 4.0);
          }
          // A dark joint every few metres. Without it the runs are infinite
          // lines and the eye has nothing to read the perspective off.
          float joint = smoothstep(0.5, 0.455, abs(fract(p.y / 3.7) - 0.5));
          lamp = clamp(lamp, 0.0, 1.0) * joint;

          color += uTube * spill * 0.12 * uBrightness;
          // A slow unsteadiness, far too gentle to be a flicker. The room is
          // not quite a room.
          float breath = 0.96 + 0.04 * sin(uTime * 0.35 + p.y * 0.11);
          color = mix(color, uTube * 1.62 * uBrightness * breath, lamp);

          gl_FragColor = vec4(recede(color, vWorld.z), 1.0);
        }
      `,
    }),
  );
  shellMaterials.push(ceilingMaterial);
  group.add(new Mesh(ceilingGeometry, ceilingMaterial));
  triangles += 2;
  drawCalls += 1;

  // --- the far end: a cross-aisle, so the room is not a sealed box --------
  const endGeometry = tracker.track(new PlaneGeometry(26, 7));
  endGeometry.translate(0, 3.5 - 1.5, END_WALL_Z);
  const endMaterial = tracker.track(
    new ShaderMaterial({
      uniforms: shellUniforms(light),
      vertexShader: SHELL_VERTEX,
      fragmentShader: /* glsl */ `
        ${SHELL_COMMON}
        void main() {
          float y = vWorld.y;
          vec3 color = uShell * 0.95;

          // A run of shelving seen side-on across the end of the aisle, far
          // enough away to be bands of colour and nothing more.
          float onShelf = step(0.26, y) * step(y, 2.1);
          float deck = floor((y - 0.26) / 0.4);
          float facing = hash21(vec2(floor(vWorld.x * 5.0), deck));
          vec3 goods = mix(uAccent, vec3(1.0, 0.86, 0.6), facing);
          color = mix(color, goods * (0.55 + facing * 0.8), onShelf * 0.78);
          // The pale rail along each deck, still readable at this distance.
          float rail = smoothstep(0.045, 0.0, abs(fract((y - 0.26) / 0.4) - 0.04) * 0.4);
          color = mix(color, uShell * 1.5, rail * onShelf);

          // Light above the cross-aisle, which is what makes it read as
          // somewhere else rather than as a wall.
          color += uTube * smoothstep(2.3, 3.0, y) * 0.9 * uBrightness;

          gl_FragColor = vec4(recede(color, vWorld.z), 1.0);
        }
      `,
    }),
  );
  shellMaterials.push(endMaterial);
  group.add(new Mesh(endGeometry, endMaterial));
  triangles += 2;
  drawCalls += 1;

  // --- shelving: one bay, instanced ---------------------------------------
  const shellColor = new Color(light.shell);
  const bay = tracker.track(bayGeometry());
  const bayMaterial = tracker.track(
    new MeshBasicMaterial({
      color: shellColor.clone().lerp(new Color(0xffffff), 0.3),
      vertexColors: true,
      fog: true,
    }),
  );
  const bays = new InstancedMesh(bay, bayMaterial, BAYS * 2);
  tracker.track(bays);
  let bayInstance = 0;
  for (const side of [-1, 1]) {
    for (let index = 0; index < BAYS; index += 1) {
      SCRATCH_POSITION.set(side * AISLE_HALF, 0, RUN_START_Z - (index + 0.5) * BAY_WIDTH);
      SCRATCH_QUATERNION.setFromAxisAngle(SCRATCH_AXIS, side > 0 ? Math.PI : 0);
      SCRATCH_SCALE.set(1, 1, 1);
      SCRATCH_MATRIX.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
      bays.setMatrixAt(bayInstance, SCRATCH_MATRIX);
      bayInstance += 1;
    }
  }
  bays.instanceMatrix.needsUpdate = true;
  // An InstancedMesh bounds itself from its geometry, which here is one bay at
  // the origin — so without this the whole run is frustum-culled the moment
  // the camera looks away from the first bay.
  bays.computeBoundingSphere();
  group.add(bays);
  triangles += trianglesOf(bay) * BAYS * 2;
  drawCalls += 1;

  // --- product: five archetypes, each instanced ----------------------------
  const heroZ: number[] = [];
  for (let index = 0; index < heroCount; index += 1) {
    heroZ.push(HERO_FIRST_Z - index * HERO_SPACING);
  }

  const accent = new Color(light.accent);
  const placements = placeProducts(rng.stream('market-shelf-stock'), accent, heroZ);
  const archetypes = productGeometries().map((geometry) => tracker.track(geometry));
  const productMaterial = tracker.track(
    new MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: true }),
  );

  for (let kind = 0; kind < archetypes.length; kind += 1) {
    const geometry = archetypes[kind];
    if (!geometry) {
      continue;
    }
    const mine = placements.filter((placement) => placement.archetype === kind);
    if (mine.length === 0) {
      continue;
    }
    const mesh = new InstancedMesh(geometry, productMaterial, mine.length);
    tracker.track(mesh);
    for (let index = 0; index < mine.length; index += 1) {
      const placement = mine[index];
      if (!placement) {
        continue;
      }
      SCRATCH_POSITION.set(placement.x, placement.y, placement.z);
      SCRATCH_QUATERNION.setFromAxisAngle(SCRATCH_AXIS, placement.yaw);
      SCRATCH_SCALE.set(placement.depth, placement.height, placement.width);
      SCRATCH_MATRIX.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
      mesh.setMatrixAt(index, SCRATCH_MATRIX);
      mesh.setColorAt(index, placement.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
    triangles += trianglesOf(geometry) * mine.length;
    drawCalls += 1;
  }

  // --- the featured lives: a vessel per item on the hero deck -------------
  const heroGeometry = tracker.track(
    fuse([
      tube(0.055, 0.075, 0.2, 8, 0.1, 1),
      tube(0.04, 0.055, 0.07, 8, 0.235, 1.3),
    ]),
  );
  const heroMaterial = tracker.track(
    new MeshBasicMaterial({
      color: new Color(light.tube).lerp(new Color(0xffffff), 0.35),
      vertexColors: true,
      fog: true,
    }),
  );
  const heroes = new InstancedMesh(heroGeometry, heroMaterial, Math.max(1, heroCount));
  tracker.track(heroes);
  const anchors: Vector3[] = [];
  for (let index = 0; index < heroCount; index += 1) {
    const z = heroZ[index] ?? HERO_FIRST_Z;
    const position = new Vector3(AISLE_HALF - 0.1, (DECKS[HERO_DECK] ?? 1.5) + 0.02, z);
    anchors.push(position);
    SCRATCH_POSITION.copy(position);
    SCRATCH_QUATERNION.setFromAxisAngle(SCRATCH_AXIS, 0);
    SCRATCH_SCALE.set(1, 1, 1);
    SCRATCH_MATRIX.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
    heroes.setMatrixAt(index, SCRATCH_MATRIX);
  }
  heroes.count = heroCount;
  heroes.instanceMatrix.needsUpdate = true;
  heroes.computeBoundingSphere();
  if (heroCount > 0) {
    group.add(heroes);
    triangles += trianglesOf(heroGeometry) * heroCount;
    drawCalls += 1;
  }

  // --- a cart, standing in the aisle --------------------------------------
  const cart = tracker.track(cartGeometry());
  const cartMaterial = tracker.track(
    new MeshBasicMaterial({ color: 0xeef2f8, vertexColors: true, fog: true }),
  );
  const cartMesh = new Mesh(cart, cartMaterial);
  cartMesh.position.set(0.32, 0, -5.4);
  cartMesh.rotation.y = 0.22;
  group.add(cartMesh);
  triangles += trianglesOf(cart);
  drawCalls += 1;

  // The air of the room. Linear fog carries the shelving into the same glow
  // the shell shaders fade to, and is the cheapest depth cue there is.
  scene.fog = new Fog(new Color(light.haze), HAZE_NEAR, HAZE_FAR);
  tracker.onDispose(() => {
    // Fog is a property of the shared scene, not of this tracker's objects, so
    // it has to be put back or the next scene inherits a supermarket's air.
    scene.fog = null;
  });

  return {
    group,
    heroAnchor(index) {
      return anchors[index] ?? new Vector3(AISLE_HALF - 0.1, DECKS[HERO_DECK] ?? 1.5, HERO_FIRST_Z);
    },
    update(elapsed) {
      for (const material of shellMaterials) {
        setU(material, 'uTime', elapsed);
      }
    },
    stats: {
      productInstances: placements.length,
      bayInstances: BAYS * 2,
      triangles: Math.round(triangles),
      drawCalls,
    },
  };
}
