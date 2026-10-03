import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  Points,
  ShaderMaterial,
} from 'three';
import type { ResourceTracker } from '../disposal';
import { colorOf } from './palette';
import { setU } from './glsl';
import {
  apply4,
  cell24,
  doubleRotation4,
  hopfFibre,
  multiply4,
  orientation4,
  project4,
  transpose4,
  type Mat4,
  type Vec4,
} from './sacred-geometry';

/**
 * The beings who are present at the life review, and the architecture they are
 * part of.
 *
 * GAME_BRIEF.md § Quality bars judges the Threshold, the Light and the higher
 * spheres against Journey, not against Playdead, and this file is written to
 * that register throughout: vast, luminous, wordless, unhurried, kind. It
 * deliberately does **not** reuse the hyperspace vignette's register. The
 * entities of `dmt.hyperspace` are built on `L-DMT-03` — aware of the player,
 * responsive, strange, fast — and everything here is the opposite reading of the
 * same mathematics. Nothing in this file churns, snaps, kaleidoscopes, saturates
 * or approaches. The two slowest rates in the game are in it.
 *
 * What makes these presences *higher dimensional* is not a label, it is the
 * construction (see `sacred-geometry.ts` § the fourth dimension):
 *
 * - Each appearance is a perspective shadow in R3 of one body in R4, turning by
 *   a double rotation whose two angles differ. Such a rotation has no invariant
 *   axis, so the shadow's edges lengthen and shorten and its cross-section
 *   reorganises: the eye cannot resolve it into something spinning, and infers a
 *   body it is not being shown. Measured on the figure actually used here, a
 *   single edge's projected length travels over a range of 1.1 against a figure
 *   whose edges span 0.3 to 1.5 — the shape really does change, it is not a
 *   turn.
 * - The appearances are *one* being. They share a single rotation, computed once
 *   per frame by `simultaneousRotation` and handed to all of them, and differ
 *   only in where in R4 they are seen from. So they move in exact lockstep and
 *   are nevertheless not copies of each other, which is the one thing a row of
 *   duplicated props can never do. Lore bible `L-THRESH-07`: the review is
 *   panoramic and often simultaneous rather than sequential — a witness to a
 *   whole life at once is not shaped like a person standing in a room, and this
 *   is that sentence written as geometry.
 * - The fourth coordinate the projection throws away is kept and shaded: it sets
 *   size, brightness and a dispersed hue, so the direction the player cannot see
 *   is the direction the colour comes from. GAME_BRIEF.md § Platform asks the
 *   higher spheres for "hues that seem beyond the normal spectrum, refraction" —
 *   dispersion is refraction's own mechanism, applied to an axis that is not on
 *   the screen.
 *
 * And what keeps it from being a tribunal (`L-THRESH-06`: the being of light is
 * felt as wholly loving and *without judgement*) is also construction, not tone
 * of voice:
 *
 * - Nothing here ever moves toward the player, turns to face them, points, aims,
 *   or forms a ring around them. Each appearance's vantage in R4 is fixed at
 *   construction and has no term in it for where the player is.
 * - Nothing here touches karma, harmony, will or attachment, reads them for a
 *   verdict, or gates an exit. They are present; that is the whole of it.
 * - They brighten and take the *memory's* colour as the review lands — they are
 *   moved by what they are seeing, and what moves them is the moment, not the
 *   player's score.
 * - `L-FRAN-03`: the spirit body is the soul's own record and its state is
 *   visible to others. So a third of the tint they carry is the player's own
 *   reading, handed in as `carried`. They plainly see what the player brought,
 *   and they say nothing about it — which is the entire difference between being
 *   witnessed and being judged.
 */

/**
 * The two rates the whole company turns at.
 *
 * Their ratio is the golden ratio, which is the hardest number to approximate
 * with a fraction — so the double rotation comes closest to repeating itself
 * later than at any other ratio, and the figure never settles into a loop the
 * eye can learn. A full turn of the slower plane takes a little over three
 * minutes, which is longer than the entire life review.
 */
const PHI = 1.6180339887498949;
const RATE_FAST = 0.055;
const RATE_SLOW = RATE_FAST / PHI;

/**
 * The orientation that the double rotation is conjugated by, so that its two
 * invariant planes are not the room's own axes. Without this the shadow reads as
 * two ordinary spins bolted together instead of as one motion with no axis.
 *
 * Fixed numbers, not drawn from the run's RNG: this is the posture of the
 * mathematics itself and must be identical in every run, the same way the
 * icosahedral mirror in `sacred-geometry.ts` is.
 */
const FRAME = orientation4([0.73, 1.91, 2.57, 0.41, 1.12, 2.26]);
const FRAME_INVERSE = transpose4(FRAME);

/**
 * The one phase every appearance shares, as a pure function of wall-clock time
 * (CLAUDE.md § Gotchas: pacing reads the clock, never accumulated frame deltas —
 * and a phase built by accumulation would also drift apart between appearances,
 * which would destroy the only thing that says they are one being).
 *
 * `hush` is how far the company has been quieted by what it is attending to. It
 * subtracts a bounded phase offset rather than scaling the rate, so the motion
 * stays continuous and merely eases while the hush is coming on — a held breath,
 * not a brake. It can never run backwards past a third of a radian in total.
 */
export function simultaneousRotation(elapsed: number, hush: number): Mat4 {
  const quiet = Math.min(1, Math.max(0, hush));
  const alpha = elapsed * RATE_FAST - quiet * 0.34;
  const beta = elapsed * RATE_SLOW - quiet * 0.21;
  return multiply4(FRAME, multiply4(doubleRotation4(alpha, beta), FRAME_INVERSE));
}

export interface HigherPresence {
  readonly group: Group;
  /** 0 = not in the scene at all, 1 = fully present. Never moves anything. */
  setPresence(amount: number): void;
  /** 0..1 how far it has taken the colour of the moment it is attending to. */
  setWarmth(amount: number): void;
  /** Rebuild this appearance's slice from the company's shared rotation. */
  update(elapsed: number, rotation: Mat4): void;
}

interface PresenceColours {
  /** The warm hue of the thing being attended to. */
  readonly color: number;
  /** The cool hue the presence has of its own. */
  readonly accent: number;
  /** How the player's own light reads, so the presence can be seen to see it. */
  readonly carried: number;
}

/**
 * The shading every appearance shares.
 *
 * `aFourth` is the coordinate the projection discarded, in roughly -1..1. It
 * drives three things at once — brightness, hue and (for the nodes) size — so
 * that the single unseen axis is legible everywhere without ever being named.
 */
function fourthDimensionMaterial(
  tracker: ResourceTracker,
  colours: PresenceColours,
  options: { points: boolean; size: number; weight: number },
): ShaderMaterial {
  const shared = /* glsl */ `
    uniform float uPresence;
    uniform float uWarmth;
    uniform float uWeight;
    uniform vec3 uColor;
    uniform vec3 uAccent;
    uniform vec3 uCarried;
    varying float vFourth;

    vec4 fourthDimensionColour(float cover) {
      // Dispersion: the three channels are taken from the same function of the
      // fourth coordinate at three different phases, which is exactly how a
      // prism separates light — here applied to the axis that is not on screen.
      // The result is a hue that slides as the body turns through the slice and
      // never sits anywhere on a spectrum the rest of the frame uses.
      float f = clamp(vFourth * 0.5 + 0.5, 0.0, 1.0);
      vec3 dispersed = 0.5 + 0.5 * cos(vec3(0.0, 2.09, 4.19) + f * 3.4);

      // The presence's own cool hue, warming toward the colour of the moment it
      // is attending to as the review lands.
      vec3 tint = mix(uAccent, uColor, uWarmth * 0.75);
      tint = mix(tint, tint * (0.55 + dispersed), 0.5);
      // L-FRAN-03: what the player is carrying is visible to others, so a little
      // of the player's own reading is in the light these give off. Seen to see
      // it; nothing said about it.
      tint = mix(tint, uCarried, 0.16);

      // Away in the fourth direction is away. The far side of the body is dimmer
      // than the near side, so the figure is plainly a slice of something that
      // keeps going where the scene stops.
      float depth = smoothstep(-1.1, 0.95, vFourth);
      float lit = uPresence * uWeight * (0.18 + depth * 0.82) * cover;
      return vec4(tint * lit, clamp(lit, 0.0, 1.0));
    }
  `;

  const vertexShader = options.points
    ? /* glsl */ `
        uniform float uSize;
        attribute float aFourth;
        varying float vFourth;
        void main() {
          vFourth = aFourth;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          float attenuation = 300.0 / max(0.0001, -viewPosition.z);
          // Size carries the fourth coordinate directly: the vertices nearer in
          // the unseen direction are drawn larger, which is what a perspective
          // shadow of a four-dimensional body actually does.
          gl_PointSize = uSize * attenuation * (0.35 + 0.95 * (aFourth * 0.5 + 0.5));
          gl_Position = projectionMatrix * viewPosition;
        }
      `
    : /* glsl */ `
        attribute float aFourth;
        varying float vFourth;
        void main() {
          vFourth = aFourth;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;

  const fragmentShader = options.points
    ? /* glsl */ `
        precision highp float;
        ${shared}
        void main() {
          vec2 centred = gl_PointCoord - 0.5;
          float r = length(centred) * 2.0;
          // Soft-edged rather than discarded: a discard is an unantialiased
          // cutoff and it costs early-Z on tiled hardware.
          float edge = 1.0 - smoothstep(0.78, 1.0, r);
          float falloff = pow(max(0.0, 1.0 - r), 2.6);
          float core = pow(max(0.0, 1.0 - r), 8.0);
          gl_FragColor = fourthDimensionColour((falloff * 0.65 + core * 0.8) * edge);
        }
      `
    : /* glsl */ `
        precision highp float;
        ${shared}
        void main() {
          gl_FragColor = fourthDimensionColour(1.0);
        }
      `;

  return tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uPresence: { value: 0 },
        uWarmth: { value: 0 },
        uWeight: { value: options.weight },
        uSize: { value: options.size },
        uColor: { value: colorOf(colours.color) },
        uAccent: { value: colorOf(colours.accent) },
        uCarried: { value: colorOf(colours.carried) },
      },
      vertexShader,
      fragmentShader,
    }),
  );
}

/** Positions and fourth coordinates for a set of points, rebuilt each frame. */
interface SliceBuffers {
  readonly positions: Float32Array;
  readonly fourths: Float32Array;
  readonly positionAttribute: BufferAttribute;
  readonly fourthAttribute: BufferAttribute;
  readonly geometry: BufferGeometry;
}

function sliceGeometry(tracker: ResourceTracker, count: number): SliceBuffers {
  const positions = new Float32Array(count * 3);
  const fourths = new Float32Array(count);
  const geometry = tracker.track(new BufferGeometry());
  const positionAttribute = new BufferAttribute(positions, 3);
  const fourthAttribute = new BufferAttribute(fourths, 1);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aFourth', fourthAttribute);
  return { positions, fourths, positionAttribute, fourthAttribute, geometry };
}

export interface WitnessOptions {
  /** Radius of the appearance in metres, after projection. */
  readonly radius: number;
  readonly color: number;
  readonly accent: number;
  readonly carried: number;
  /**
   * Where in R4 this appearance is standing: a fixed rotation applied after the
   * company's shared turn and before the projection. This, and only this, is
   * what makes two appearances of one being look different.
   */
  readonly vantage: readonly number[];
  /**
   * How far along the w axis the projection is taken from. Small is a strong
   * perspective and a wildly reorganising shadow; large is nearly an orthogonal
   * one. Must exceed the body's largest w, which on the unit sphere is 1.
   */
  readonly distance: number;
  /** Line brightness, 0..1. The nodes take a little more. */
  readonly weight: number;
}

/**
 * One appearance of the being who is present at the review.
 *
 * The body is the 24-cell — the regular polytope that exists only in four
 * dimensions and is its own dual, so it is not the shadow of anything but
 * itself. Its 96 edges are drawn as threads of light and its 24 vertices as
 * nodes whose size is the fourth coordinate, and both are rebuilt every frame
 * from the company's single shared rotation.
 *
 * Cost: 24 vertices through two 4x4 matrices and one perspective divide per
 * frame — a few hundred multiplies — and 240 thin additive fragments' worth of
 * fill. There is no raymarch, no screen-space pass and no post-processing pass
 * anywhere in this file, because post is what the frame budget actually goes on.
 */
export function witnessOfLight(tracker: ResourceTracker, options: WitnessOptions): HigherPresence {
  const group = new Group();
  const { vertices, edges } = cell24();

  const edgeBuffers = sliceGeometry(tracker, edges.length * 2);
  const nodeBuffers = sliceGeometry(tracker, vertices.length);

  const colours: PresenceColours = {
    color: options.color,
    accent: options.accent,
    carried: options.carried,
  };
  const edgeMaterial = fourthDimensionMaterial(tracker, colours, {
    points: false,
    size: 0,
    weight: options.weight,
  });
  // The nodes are what make the lattice read as a body of light rather than as
  // a wireframe diagram, so they are large and soft — a thread of light between
  // two lamps, not a line between two dots.
  const nodeMaterial = fourthDimensionMaterial(tracker, colours, {
    points: true,
    size: options.radius * 0.34,
    weight: options.weight * 1.15,
  });

  const lines = new LineSegments(edgeBuffers.geometry, edgeMaterial);
  // The vertices move every frame, so a bounding sphere computed once would be
  // wrong and three.js would cull the body at the wrong moment.
  lines.frustumCulled = false;
  group.add(lines);

  const nodes = new Points(nodeBuffers.geometry, nodeMaterial);
  nodes.frustumCulled = false;
  group.add(nodes);

  const projected: { x: number; y: number; z: number; w: number }[] = vertices.map(() => ({
    x: 0,
    y: 0,
    z: 0,
    w: 0,
  }));

  let presence = 0;
  let warmth = 0;

  return {
    group,
    setPresence(amount) {
      presence = Math.min(1, Math.max(0, amount));
    },
    setWarmth(amount) {
      warmth = Math.min(1, Math.max(0, amount));
    },
    update(_elapsed, rotation) {
      setU(edgeMaterial, 'uPresence', presence);
      setU(edgeMaterial, 'uWarmth', warmth);
      setU(nodeMaterial, 'uPresence', presence);
      setU(nodeMaterial, 'uWarmth', warmth);
      if (presence <= 0) {
        return;
      }

      for (let i = 0; i < vertices.length; i += 1) {
        const base = vertices[i];
        const slot = projected[i];
        if (!base || !slot) {
          continue;
        }
        const turned = apply4(rotation, base);
        const seen = apply4(options.vantage, turned);
        const point = project4(seen, options.distance);
        slot.x = point.x * options.radius;
        slot.y = point.y * options.radius;
        slot.z = point.z * options.radius;
        slot.w = point.w;

        nodeBuffers.positions[i * 3] = slot.x;
        nodeBuffers.positions[i * 3 + 1] = slot.y;
        nodeBuffers.positions[i * 3 + 2] = slot.z;
        nodeBuffers.fourths[i] = slot.w;
      }

      for (let e = 0; e < edges.length; e += 1) {
        const edge = edges[e];
        if (!edge) {
          continue;
        }
        const from = projected[edge[0]];
        const to = projected[edge[1]];
        if (!from || !to) {
          continue;
        }
        const head = e * 6;
        edgeBuffers.positions[head] = from.x;
        edgeBuffers.positions[head + 1] = from.y;
        edgeBuffers.positions[head + 2] = from.z;
        edgeBuffers.positions[head + 3] = to.x;
        edgeBuffers.positions[head + 4] = to.y;
        edgeBuffers.positions[head + 5] = to.z;
        edgeBuffers.fourths[e * 2] = from.w;
        edgeBuffers.fourths[e * 2 + 1] = to.w;
      }

      edgeBuffers.positionAttribute.needsUpdate = true;
      edgeBuffers.fourthAttribute.needsUpdate = true;
      nodeBuffers.positionAttribute.needsUpdate = true;
      nodeBuffers.fourthAttribute.needsUpdate = true;
    },
  };
}

export interface VaultOptions {
  /** How many fibres of the fibration to draw. */
  readonly fibres: number;
  /** Segments per fibre. Each is one line, so this is the whole cost. */
  readonly segments: number;
  /** Half-extent of the projected structure, per axis, in metres. */
  readonly extent: readonly [number, number, number];
  readonly color: number;
  readonly accent: number;
  readonly carried: number;
  readonly weight: number;
  /** The projection vantage, as for a witness. */
  readonly distance: number;
}

/**
 * The architecture the presences belong to: the Hopf fibration of the 3-sphere,
 * carried by the same rotation and projected into the room.
 *
 * In four dimensions this is one object — the unit sphere of R4, filled exactly
 * by circles, one for each point of an ordinary 2-sphere, no two of which meet
 * and every two of which are linked. In three dimensions it can only come apart
 * into many separate rings threading each other. That is the brief's "hues that
 * seem beyond the normal spectrum, refraction, architecture made of sound and
 * light" at the scale of a building rather than of a body, and it is the same
 * claim as the witnesses make: one thing, seen as several, because the room is
 * one dimension short of being able to hold it.
 *
 * Deliberately faint and very large. It is the vault this happens under, not a
 * thing to look at (`L-FRAN-08`: the higher lands are rendered in light, colour
 * and music, and the text keeps saying language cannot carry them — so the game
 * should not try to spell them out either).
 */
export function vaultOfFibres(tracker: ResourceTracker, options: VaultOptions): HigherPresence {
  const group = new Group();

  // Fibres sampled over the Riemann sphere: the ratio's modulus walks outward
  // and its argument walks round by the golden angle, so no two fibres sit in
  // the same relation to each other and the set never looks like a stack.
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const fibres: Vec4[][] = [];
  // tan(eta / 2) is the modulus the Hopf map assigns to the latitude eta, so a
  // walk in eta is a walk over the base sphere.
  //
  // The two poles are excluded on purpose, and this is not a taste call. A fibre
  // over a point near a pole has one of its two complex coordinates almost zero,
  // so it lies almost entirely in a single coordinate plane — and if that plane
  // contains w, the projection sweeps the whole perspective divide along one
  // line and the fibre arrives as a straight scratch through the middle of the
  // frame instead of as a ring. Keeping eta away from 0 and pi keeps every fibre
  // a well-formed circle that links its neighbours, which is the entire picture.
  const FIRST = 0.55;
  const LAST = Math.PI - 0.55;
  for (let i = 0; i < options.fibres; i += 1) {
    const eta = FIRST + ((LAST - FIRST) * (i + 0.5)) / options.fibres;
    fibres.push(hopfFibre(Math.tan(eta * 0.5), i * GOLDEN_ANGLE, options.segments));
  }

  const segmentCount = options.fibres * options.segments;
  const buffers = sliceGeometry(tracker, segmentCount * 2);
  const material = fourthDimensionMaterial(
    tracker,
    { color: options.color, accent: options.accent, carried: options.carried },
    { points: false, size: 0, weight: options.weight },
  );
  const lines = new LineSegments(buffers.geometry, material);
  lines.frustumCulled = false;
  group.add(lines);

  const extentX = options.extent[0];
  const extentY = options.extent[1];
  const extentZ = options.extent[2];

  let presence = 0;
  let warmth = 0;

  return {
    group,
    setPresence(amount) {
      presence = Math.min(1, Math.max(0, amount));
    },
    setWarmth(amount) {
      warmth = Math.min(1, Math.max(0, amount));
    },
    update(_elapsed, rotation) {
      setU(material, 'uPresence', presence);
      setU(material, 'uWarmth', warmth);
      if (presence <= 0) {
        return;
      }

      let head = 0;
      let fourthHead = 0;
      for (const fibre of fibres) {
        for (let i = 0; i < fibre.length; i += 1) {
          const a = fibre[i];
          const b = fibre[(i + 1) % fibre.length];
          if (!a || !b) {
            continue;
          }
          for (const point of [a, b] as const) {
            const projectedPoint = project4(apply4(rotation, point), options.distance);
            buffers.positions[head] = projectedPoint.x * extentX;
            buffers.positions[head + 1] = projectedPoint.y * extentY;
            buffers.positions[head + 2] = projectedPoint.z * extentZ;
            buffers.fourths[fourthHead] = projectedPoint.w;
            head += 3;
            fourthHead += 1;
          }
        }
      }

      buffers.positionAttribute.needsUpdate = true;
      buffers.fourthAttribute.needsUpdate = true;
    },
  };
}

/**
 * The fixed vantages in R4 that the appearances of one being are seen from.
 *
 * Each is an element of SO(4) built from six angles. They are written out here
 * rather than drawn from the run's RNG because they are the being's own shape,
 * not a draw: the same company meets every player.
 */
export const WITNESS_VANTAGES: readonly (readonly number[])[] = [
  orientation4([0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
  orientation4([1.21, 0.37, 2.84, 1.66, 0.52, 2.11]),
  orientation4([2.35, 1.78, 0.64, 2.92, 1.44, 0.83]),
  orientation4([0.86, 2.63, 1.49, 0.29, 2.71, 1.95]),
];
