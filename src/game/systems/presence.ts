import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { createRng } from '../rng';
import type { ResourceTracker } from '../disposal';
import { NOISE } from './glsl';

/**
 * A presence: someone standing there, made of light.
 *
 * This replaces a lathe-revolved taper. The taper was a single tube of
 * revolution, and a tube of revolution cannot be a person for two reasons that
 * no amount of shading fixes:
 *
 *  1. It is the same from every side. A human silhouette's single loudest cue is
 *     that shoulders are WIDE and SHALLOW — broad from the front, thin in
 *     profile. A revolve makes width equal depth everywhere, so the shoulder
 *     line can never exist, and what is left reads as a cone: a candle flame, a
 *     bullet, a chess piece.
 *  2. It is axially symmetric, so five of them are five copies. Variation in
 *     height alone reads as one prop scaled, not as different people.
 *
 * So a presence here is swept from elliptical rings whose width and depth vary
 * independently along the body, laid on a spine that is not straight, with the
 * shoulder girdle rolled off level. Everything that varies between two
 * presences varies at BUILD time from the seed — bulk, poise, the height of the
 * shoulder line, the length of the neck, lean, the hip the weight is on, which
 * shoulder is lower, the set of the head — so two presences differ in
 * silhouette before a single pixel is shaded, which is the test the brief sets:
 * legible as different beings from outline alone.
 *
 * There is no face, no eye and no limb anywhere in it, and there never will be:
 * this world is made of light (GAME_BRIEF.md § The Threshold). Attention is
 * carried by where the light gathers and by which way the form is turned, not
 * by features. `L-THRESH-06`: the beings of the Light are wholly loving and
 * without judgement, so nothing here looms — inclinations are small, the stance
 * is open, and a presence never leans over the player.
 */

/**
 * The base silhouette, in fractions of total height: [t, half-width, depth/width].
 *
 * Proportioned off standing human measurements, because that is what makes a
 * shape read as a person rather than as an object of about that size: the
 * shoulder line at ~0.79 of stature, half-width ~0.115, head 0.13 of stature
 * and ~0.055 half-width, chest depth a little over half its width. Below the
 * hip it is a robe, not legs — it gathers and flares to the ground, which keeps
 * the form continuous and keeps anatomy out of it.
 */
const PROFILE: readonly (readonly [number, number, number])[] = [
  [0.000, 0.138, 0.86],
  [0.016, 0.147, 0.86],
  [0.055, 0.139, 0.85],
  [0.130, 0.125, 0.84],
  [0.230, 0.113, 0.84],
  [0.330, 0.104, 0.83],
  [0.420, 0.096, 0.82],
  [0.500, 0.090, 0.80],
  [0.560, 0.091, 0.78],
  [0.630, 0.098, 0.70],
  [0.690, 0.105, 0.63],
  [0.745, 0.111, 0.57],
  [0.790, 0.115, 0.53],
  [0.812, 0.112, 0.52],
  [0.828, 0.098, 0.56],
  [0.843, 0.070, 0.70],
  [0.857, 0.055, 0.88],
  [0.872, 0.048, 0.96],
  [0.888, 0.049, 1.00],
  [0.905, 0.051, 1.04],
  [0.925, 0.053, 1.06],
  [0.945, 0.052, 1.06],
  [0.963, 0.048, 1.03],
  [0.978, 0.041, 1.00],
  [0.990, 0.027, 0.97],
];

/** Where the base profile puts the shoulder line and the throat. */
const BASE_SHOULDER = 0.790;
const BASE_NECK = 0.872;

/**
 * How one presence stands. Every field is drawn from the seed and baked into
 * the geometry or into a uniform, so a given seed is always the same person.
 */
export interface PresenceBearing {
  /** Multiplier on the shoulder and chest width. */
  readonly shoulderWidth: number;
  /** Multiplier on front-to-back depth, so some are slabbier than others. */
  readonly depth: number;
  /** Multiplier on the waist. */
  readonly waist: number;
  /** Multiplier on the flare where the form meets the ground. */
  readonly hem: number;
  /** Multiplier on the head. */
  readonly headSize: number;
  /** Multiplier on the throat's width. */
  readonly neck: number;
  /** Where the shoulder line sits, as a fraction of height. */
  readonly shoulderT: number;
  /** Sideways lean of the whole form, in fractions of height at the crown. */
  readonly lean: number;
  /** Forward (+) or opened-back (-) set of the upper body. */
  readonly stoop: number;
  /** Lateral hip shift: the weight is on one side. */
  readonly hip: number;
  /** How far one shoulder sits below the other, in fractions of height. */
  readonly shoulderDrop: number;
  /** Sideways tilt of the head, radians. */
  readonly headTilt: number;
  /** Forward (+) incline of the head, radians. */
  readonly headNod: number;
  /** 0 = stands where it was placed, 1 = squares up to the viewer. */
  readonly regard: number;
  /** Standing yaw offset on top of the regard, radians. */
  readonly turn: number;
  /** Where the gathered light of attention sits relative to the facing, radians. */
  readonly gaze: number;
  readonly swayAmp: number;
  readonly swayRate: number;
  readonly swayPhase: number;
  readonly breathAmp: number;
  readonly breathRate: number;
  readonly breathPhase: number;
}

/**
 * Derive a bearing from a seed.
 *
 * Two latent axes do most of the work, because human variation is correlated
 * rather than independent: `bulk` moves shoulders, depth, hem, waist and
 * relative head size together, and `poise` moves the shoulder line, the neck,
 * the set of the spine and the lift of the head together. Independent draws on
 * top (which hip the weight is on, which shoulder is lower, lean, head tilt,
 * how squarely they turn) break any remaining family resemblance. Ranges are
 * deliberately wide: two draws should differ at a glance, not on inspection.
 *
 * All of it comes from the project RNG, never `Math.random()` (CLAUDE.md
 * § Testability), keyed by the seed the scene passed so a run is reproducible.
 */
export function bearingFromSeed(seed: number): PresenceBearing {
  const rng = createRng(`presence:${seed.toFixed(4)}`);
  const bulk = rng.range(-1, 1);
  const poise = rng.range(-1, 1);
  const side = rng.chance(0.5) ? 1 : -1;

  return {
    shoulderWidth: 1 + bulk * 0.23,
    depth: 1 + bulk * 0.18 + rng.range(-0.07, 0.07),
    waist: 1 + bulk * 0.17,
    hem: 1 + bulk * 0.26 + rng.range(-0.1, 0.12),
    headSize: 1 - bulk * 0.09 + rng.range(-0.07, 0.07),
    neck: 1 + poise * 0.16,
    shoulderT: BASE_SHOULDER + poise * 0.028,
    lean: rng.range(-0.026, 0.026),
    stoop: -poise * 0.022 + rng.range(-0.008, 0.014),
    hip: side * rng.range(0.006, 0.026),
    shoulderDrop: -side * rng.range(0.003, 0.018),
    headTilt: side * rng.range(-0.05, 0.17),
    headNod: -poise * 0.1 + rng.range(-0.03, 0.08),
    regard: rng.range(0.62, 1),
    turn: rng.range(-0.3, 0.3),
    gaze: rng.range(-0.22, 0.22),
    swayAmp: rng.range(0.0035, 0.0075),
    swayRate: rng.range(0.17, 0.29),
    swayPhase: rng.range(0, Math.PI * 2),
    breathAmp: rng.range(0.012, 0.022),
    breathRate: rng.range(0.42, 0.68),
    breathPhase: rng.range(0, Math.PI * 2),
  };
}

/** A trapezoid window: 0 below `a`, 1 across `b`..`c`, 0 above `d`. */
function band(t: number, a: number, b: number, c: number, d: number): number {
  if (t <= a || t >= d) {
    return 0;
  }
  if (t < b) {
    return (t - a) / Math.max(1e-6, b - a);
  }
  if (t > c) {
    return (d - t) / Math.max(1e-6, d - c);
  }
  return 1;
}

/**
 * Warp the height axis so the shoulder line lands where this bearing wants it,
 * holding the waist and the crown fixed. The neck and the upper trunk stretch
 * to absorb it, which is exactly the difference between a long-necked figure
 * and one whose head sits down between its shoulders.
 */
function warpHeight(t: number, shoulderT: number): number {
  if (t <= 0.5) {
    return t;
  }
  if (t <= BASE_SHOULDER) {
    return 0.5 + ((t - 0.5) / (BASE_SHOULDER - 0.5)) * (shoulderT - 0.5);
  }
  return shoulderT + ((t - BASE_SHOULDER) / (1 - BASE_SHOULDER)) * (1 - shoulderT);
}

/** The centre line of the body at a given height: not a straight line. */
function spine(t: number, bearing: PresenceBearing, height: number): { x: number; z: number } {
  // Weight on one side: the hip pushes out and the line returns above the waist.
  const hip = Math.sin(Math.PI * Math.min(1, Math.max(0, t / 0.62)));
  const lean = Math.pow(t, 1.35);
  const upper = Math.pow(Math.max(0, (t - 0.32) / 0.68), 1.5);
  return {
    x: (bearing.lean * lean + bearing.hip * hip) * height,
    z: bearing.stoop * upper * height,
  };
}

/**
 * Sweep the body.
 *
 * Rings of an ellipse whose width and depth are driven separately, so the form
 * has a front; a bottom cap and a crown apex, so there is no hole to see
 * through where the light is brightest; and a vertex attribute carrying each
 * ring's height, which is what lets the shader put breath in the chest and the
 * gathered light at the crown without guessing from world position.
 */
function presenceGeometry(
  height: number,
  bearing: PresenceBearing,
  segments: number,
  inflate: number,
  part: number,
): BufferGeometry {
  const rings = PROFILE.map(([t, width, depth]) => {
    const warped = warpHeight(t, bearing.shoulderT);
    const scale =
      (1 + (bearing.shoulderWidth - 1) * band(t, 0.48, 0.63, 0.83, 0.9)) *
      (1 + (bearing.waist - 1) * band(t, 0.28, 0.42, 0.58, 0.7)) *
      (1 + (bearing.hem - 1) * band(t, -1, -0.5, 0.09, 0.3)) *
      (1 + (bearing.headSize - 1) * band(t, 0.84, 0.9, 1.1, 1.2)) *
      (1 + (bearing.neck - 1) * band(t, 0.82, 0.855, 0.885, 0.93));
    return {
      t: warped,
      rx: width * scale * height,
      rz: width * scale * depth * bearing.depth * height,
      roll: band(t, 0.55, 0.7, 1.1, 1.2),
      head: band(t, BASE_NECK - 0.002, BASE_NECK + 0.03, 1.1, 1.2),
    };
  });

  const neckT = warpHeight(BASE_NECK, bearing.shoulderT);
  const neck = spine(neckT, bearing, height);
  const pivot = new Vector3(neck.x, neckT * height, neck.z);
  const shoulderRef = 0.115 * height;

  const vertexCount = rings.length * segments + 2;
  const positions = new Float32Array(vertexCount * 3);
  const ups = new Float32Array(vertexCount);
  const parts = new Float32Array(vertexCount);
  parts.fill(part);

  const base = spine(0, bearing, height);
  positions[0] = base.x;
  positions[1] = 0;
  positions[2] = base.z;
  ups[0] = 0;

  for (let ring = 0; ring < rings.length; ring += 1) {
    const r = rings[ring];
    if (r === undefined) {
      continue;
    }
    const centre = spine(r.t, bearing, height);
    for (let seg = 0; seg < segments; seg += 1) {
      const angle = (seg / segments) * Math.PI * 2;
      let x = Math.cos(angle) * r.rx;
      let z = Math.sin(angle) * r.rz;
      let y = r.t * height;
      // The shoulder girdle is not level: one side rides lower, and everything
      // above it comes along. This single asymmetry does more for "a person is
      // standing there" than any amount of extra detail.
      y += bearing.shoulderDrop * height * (x / shoulderRef) * r.roll;
      x += centre.x;
      z += centre.z;

      if (r.head > 0) {
        // The set of the head, bent in at the throat rather than hinged, so the
        // neck carries the turn instead of shearing.
        const tilt = bearing.headTilt * r.head;
        const nod = bearing.headNod * r.head;
        const dx = x - pivot.x;
        const dy = y - pivot.y;
        const dz = z - pivot.z;
        const ct = Math.cos(tilt);
        const st = Math.sin(tilt);
        const rx = dx * ct - dy * st;
        const ry = dx * st + dy * ct;
        const cn = Math.cos(nod);
        const sn = Math.sin(nod);
        const ry2 = ry * cn - dz * sn;
        const rz2 = ry * sn + dz * cn;
        x = pivot.x + rx;
        y = pivot.y + ry2;
        z = pivot.z + rz2;
      }

      const index = 1 + ring * segments + seg;
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      ups[index] = r.t;
    }
  }

  const apex = vertexCount - 1;
  const crown = spine(1, bearing, height);
  {
    // The crown sits on the head's own axis, so a tilted head keeps its top.
    const dx = crown.x - pivot.x;
    const dy = height - pivot.y;
    const dz = crown.z - pivot.z;
    const ct = Math.cos(bearing.headTilt);
    const st = Math.sin(bearing.headTilt);
    const cn = Math.cos(bearing.headNod);
    const sn = Math.sin(bearing.headNod);
    const rx = dx * ct - dy * st;
    const ry = dx * st + dy * ct;
    positions[apex * 3] = pivot.x + rx;
    positions[apex * 3 + 1] = pivot.y + ry * cn - dz * sn;
    positions[apex * 3 + 2] = pivot.z + ry * sn + dz * cn;
    ups[apex] = 1;
  }

  const indices: number[] = [];
  for (let seg = 0; seg < segments; seg += 1) {
    const next = (seg + 1) % segments;
    indices.push(0, 1 + next, 1 + seg);
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let seg = 0; seg < segments; seg += 1) {
      const next = (seg + 1) % segments;
      const a = 1 + ring * segments + seg;
      const b = 1 + ring * segments + next;
      const c = 1 + (ring + 1) * segments + seg;
      const d = 1 + (ring + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const top = 1 + (rings.length - 1) * segments;
  for (let seg = 0; seg < segments; seg += 1) {
    const next = (seg + 1) % segments;
    indices.push(top + seg, apex, top + next);
  }

  const geometry = new BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aUp', new BufferAttribute(ups, 1));
  geometry.setAttribute('aPart', new BufferAttribute(parts, 1));
  geometry.computeVertexNormals();

  if (inflate !== 0) {
    // The shell is the body pushed out along its own normals rather than scaled:
    // a scale would make the shell's proportions wrong (a 7% taller figure with
    // a 7% bigger head), while an offset keeps the silhouette and reads as the
    // radiance standing just off the form.
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < vertexCount; i += 1) {
      positions[i * 3] = (positions[i * 3] ?? 0) + normals.getX(i) * inflate;
      positions[i * 3 + 1] = (positions[i * 3 + 1] ?? 0) + normals.getY(i) * inflate;
      positions[i * 3 + 2] = (positions[i * 3 + 2] ?? 0) + normals.getZ(i) * inflate;
    }
    geometry.computeVertexNormals();
  }

  // Unused by the shader, but three.js needs one for frustum culling, and the
  // vertex shader's sway and breath move vertices by well under a centimetre.
  geometry.computeBoundingSphere();
  return geometry;
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aPart;
  attribute float aUp;
  uniform float uHeight;
  uniform float uTime;
  uniform float uRegard;
  uniform float uTurn;
  uniform float uGaze;
  uniform float uSway;
  uniform float uSwayRate;
  uniform float uSwayPhase;
  uniform float uBreath;
  uniform float uBreathRate;
  uniform float uBreathPhase;
  varying float vPart;
  varying float vUpward;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vFacing;

  void main() {
    vPart = aPart;
    float t = clamp(aUp, 0.0, 1.0);
    vUpward = t;
    vec3 p = position;
    vec3 n = normal;

    // Breath, not a bob: the trunk widens a little around the chest and the
    // crown lifts a fraction of that. A presence that moves up and down as a
    // whole reads as a prop on a spring.
    float chest = smoothstep(0.28, 0.60, t) * (1.0 - smoothstep(0.78, 0.96, t));
    float breath = sin(uTime * uBreathRate + uBreathPhase);
    p.xz *= 1.0 + breath * uBreath * chest;
    p.y += breath * uBreath * 0.2 * uHeight * smoothstep(0.5, 1.0, t);

    // Standing sway. Two incommensurate rates, so it never settles into a tick,
    // and weighted up the body, so the feet stay put and the crown travels.
    float lever = pow(t, 1.7);
    p.x += sin(uTime * uSwayRate + uSwayPhase) * uSway * uHeight * lever;
    p.z += sin(uTime * uSwayRate * 0.61 + uSwayPhase * 1.7) * uSway * uHeight * lever;

    // Turned toward whoever is there. The bearing is taken in the presence's own
    // space, by transposing the model matrix's rotation, so a scene that has
    // already leaned or turned the group composes with this instead of fighting
    // it. uRegard is below 1 for most of them: a rank of figures all squared up
    // to the camera reads as a tribunal, and L-THRESH-06 forbids that.
    vec3 toCam = cameraPosition - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    mat3 m = mat3(modelMatrix);
    vec2 onPlane = vec2(dot(m[0], toCam), dot(m[2], toCam));
    // atan(0, 0) is undefined; a camera exactly overhead must not produce NaN.
    float bearing = dot(onPlane, onPlane) < 1e-8 ? 0.0 : atan(onPlane.x, onPlane.y);
    float yaw = bearing * uRegard + uTurn
      + sin(uTime * uSwayRate * 0.37 + uSwayPhase) * 0.03;
    float c = cos(yaw);
    float s = sin(yaw);
    p = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
    n = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);

    // Which way this presence is facing, in world space, so the fragment shader
    // can gather the light of attention on the front of it.
    float g = yaw + uGaze;
    vFacing = normalize(mat3(modelMatrix) * vec3(sin(g), 0.0, cos(g)));

    vWorldNormal = normalize(mat3(modelMatrix) * n);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform vec3 uLight;
  uniform float uSeed;
  uniform float uResolve;
  uniform float uShoulder;
  varying float vPart;
  varying float vUpward;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vFacing;

  ${NOISE}

  float window(float x, float centre, float width) {
    float d = (x - centre) / width;
    return exp(-d * d);
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 view = normalize(cameraPosition - vWorldPos);
    float facing = clamp(dot(normal, view), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.3);

    float resolve = clamp(uResolve, 0.0, 1.4);
    // Before it resolves the form is still coming apart into the light it is
    // made of; as uResolve rises the noise tightens into a silhouette. Two
    // octaves: the upper ones are below a pixel at the size a presence is drawn,
    // and this shader runs on every figure in every scene of the Light.
    float grain = fbm(vWorldPos * 2.1 + vec3(uSeed, uTime * 0.16, uSeed * 0.5), 2);
    float coherence = mix(grain * 1.5, 1.0, clamp(resolve, 0.0, 1.0));
    float present = smoothstep(0.0, 0.32, resolve);

    // Where the light gathers. Three places, and all three are cues the eye
    // reads as a body rather than as decoration:
    //  - the shoulder shelf, lit because it faces up into the Light, which is
    //    what makes the shoulder line an event instead of a width;
    //  - the front of the head, where attention lives;
    //  - the chest, a slow warm centre, because a presence is lit from inside.
    float shelf = window(vUpward, uShoulder, 0.05) * smoothstep(0.0, 0.75, normal.y);
    float front = clamp(dot(normal, vFacing), 0.0, 1.0);
    float attention = pow(front, 2.2) * window(vUpward, 0.905, 0.055);
    float heart = pow(front, 3.0) * window(vUpward, 0.66, 0.1);
    float foot = 1.0 - smoothstep(0.0, 0.40, vUpward);
    float crown = window(vUpward, 0.925, 0.075);

    // Both ends dissolve. A presence of light does not have a skull and does not
    // have a hem you could pick up: the head gives its top away to the glow it
    // stands in, and the form lets go of its edge where it meets the ground.
    // Without this the figure reads as a mannequin — a solid object the right
    // shape — which is a different failure from the cone but just as fatal.
    float fadeTop = 1.0 - 0.78 * smoothstep(0.895, 1.005, vUpward);
    float fadeFoot = mix(0.3, 1.0, smoothstep(0.0, 0.075, vUpward));

    if (vPart > 0.5) {
      // The shell: radiance standing off the form. Lit where the surface turns
      // away from the eye, and gathered around the head and shoulders, so the
      // aura has the shape of someone rather than the shape of a sphere.
      float aura = pow(1.0 - facing, 1.9) * coherence * present;
      float breath = 0.82 + 0.18 * sin(uTime * 0.6 + uSeed);
      // Gathered at the head, which is what carries the dissolve above: the
      // crown goes to light and the aura is what is left standing there.
      aura *= 0.7 + shelf * 1.0 + crown * 1.35 + attention * 0.55;
      vec3 glow = mix(uAccent, uColor, 0.45);
      gl_FragColor = vec4(glow * aura * 0.6 * breath, clamp(aura * 0.34, 0.0, 1.0));
      return;
    }

    // Wrapped diffuse: never fully dark on the turned-away side, because a being
    // of light has no shadow side, but directional enough that the form has a
    // near face and a far one.
    float lambert = clamp(dot(normal, normalize(uLight)) * 0.5 + 0.5, 0.0, 1.0);
    // Filaments running up the form, so the surface is light rather than
    // plastic. Cheap: one sine, no noise.
    float around = atan(normal.z, normal.x);
    float weave = sin(around * 5.0 + vUpward * 7.0 - uTime * 0.3) * 0.5 + 0.5;
    weave *= weave;
    // Rim-dominant, so the interior stays thin enough to see the hall through —
    // a presence that occludes the floor behind it is an object. The wrapped
    // diffuse turns the form; it is not allowed to make it a surface.
    float body = (rim * 1.45 + lambert * 0.42 + 0.145)
      * (0.5 + foot * 0.5 + crown * 0.35 + shelf * 1.1 + attention * 1.0 + heart * 0.5);
    body *= (0.8 + weave * 0.4) * coherence * present * fadeTop * fadeFoot;

    // Warm at the core, cooling toward the edge: a presence lit from inside is
    // warmest where it is thickest.
    vec3 tint = mix(uColor, uAccent, clamp(rim * 0.62 - crown * 0.25 + 0.12, 0.0, 1.0));
    gl_FragColor = vec4(tint * body, clamp(body * 0.7, 0.0, 1.0));
  }
`;

export interface FigureOptions {
  height: number;
  color: number;
  accent: number;
  seed: number;
  /** Where the light on this figure comes from, in world space. */
  light?: readonly [number, number, number];
  /** Override any part of the seeded bearing. */
  bearing?: Partial<PresenceBearing>;
  /** Radial segments per ring. 20 is smooth at the distance these are drawn. */
  segments?: number;
}

export interface Figure {
  group: Object3D;
  material: ShaderMaterial;
  /** How this one stands, in case a scene wants to place it accordingly. */
  bearing: PresenceBearing;
}

/**
 * A presence standing somewhere, with enough form to read as someone and no
 * more detail than that.
 *
 * Two surfaces share one material, which is what lets a scene drive the whole
 * figure through the single `material` this returns — the shell outside the body
 * is tagged by a vertex attribute and shaded as the radiance coming off it.
 * That is also why the motion lives in the vertex shader: the scenes only ever
 * push `uTime` and `uResolve`, so breath, sway and the turn toward the player
 * have to come for free from those.
 */
export function figureOfLight(tracker: ResourceTracker, options: FigureOptions): Figure {
  const light = options.light ?? [0.22, 0.34, 1];
  const bearing: PresenceBearing = { ...bearingFromSeed(options.seed), ...options.bearing };
  const segments = options.segments ?? 20;

  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(options.color) },
        uAccent: { value: new Color(options.accent) },
        uSeed: { value: options.seed },
        uHeight: { value: options.height },
        uLight: { value: new Vector3(light[0], light[1], light[2]) },
        /** 0 = not yet resolved out of the glow, 1 = fully present. */
        uResolve: { value: 0 },
        uShoulder: { value: bearing.shoulderT },
        uRegard: { value: bearing.regard },
        uTurn: { value: bearing.turn },
        uGaze: { value: bearing.gaze },
        uSway: { value: bearing.swayAmp },
        uSwayRate: { value: bearing.swayRate },
        uSwayPhase: { value: bearing.swayPhase },
        uBreath: { value: bearing.breathAmp },
        uBreathRate: { value: bearing.breathRate },
        uBreathPhase: { value: bearing.breathPhase },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    }),
  );

  const group = new Group();
  const body = new Mesh(tracker.track(presenceGeometry(options.height, bearing, segments, 0, 0)), material);
  const shell = new Mesh(
    tracker.track(presenceGeometry(options.height, bearing, segments, 0.013 * options.height, 1)),
    material,
  );
  group.add(body, shell);
  // The group's origin is where the figure stands. Every caller positions feet,
  // not centre, and that has to stay true.
  return { group, material, bearing };
}
