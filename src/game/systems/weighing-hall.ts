import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  type Quaternion,
} from 'three';
import type { Rng } from '../rng';
import type { ResourceTracker } from '../disposal';
import { NOISE, setU } from './glsl';

/**
 * The hall the Council sits in, and the instrument at the middle of it.
 *
 * Everything here is built from mathematics and three.js primitives: a lathe
 * profile, a ring of cylinders, a disc with a shader on it. Nothing is modelled
 * after any existing work.
 *
 * Three things the Light's scenes were missing, and the reason each is here:
 *
 * - **Ground.** Figures standing in an unlit void have no scale, because scale
 *   is a relationship and there was nothing to relate them to. A floor with a
 *   measure on it — rings at a known spacing, running out past the figures and
 *   dissolving — gives the eye a ruler and the scene a horizon. It is also the
 *   cheapest possible fix for frame time: an opaque floor occludes the lower
 *   half of two full-screen noise shells that were being shaded and then
 *   painted over.
 *
 * - **Distance.** Journey's vastness is mostly parallax: something far away that
 *   moves slowly against something near. A ring of tall, faint columns well
 *   beyond the hall gives the camera's drift something to move against.
 *
 * - **An instrument that is made rather than drawn.** The weighing is the point
 *   of the scene, so the balance is the one object in the Light with real
 *   material response: two lights, a specular highlight and a Fresnel edge on an
 *   opaque surface. It has mass precisely because nothing else here does.
 */

// --- shared helpers --------------------------------------------------------

/**
 * Vertex stage shared by everything in the hall that is shaded as a surface.
 * World space, because the light belongs to the hall and must not swing with
 * the player's head.
 */
const WORLD_VERTEX = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** Turn a lathe profile given in (radius, height) pairs into points. */
function lathePoints(profile: readonly (readonly [number, number])[]): Vector2[] {
  return profile.map(([radius, y]) => new Vector2(radius, y));
}

// --- the ground ------------------------------------------------------------

export interface LuminousGround {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /**
   * Where light pools on the floor: one entry per presence standing on it, as
   * (x, z, strength). Up to six; later entries are ignored.
   */
  setPools(pools: readonly (readonly [number, number, number])[]): void;
  update(elapsed: number): void;
}

/**
 * A floor of light with a measure on it.
 *
 * Opaque on purpose. Every other surface in the Light is additive and writes no
 * depth, which is why the place had no front and no back; a floor that occludes
 * is what makes the hall a volume rather than a collage.
 *
 * The ring pattern widens its band with distance instead of using a
 * derivative-based width. `fwidth` needs an extension this build cannot assume
 * is enabled, and a shader that fails to compile only shows up at runtime
 * (CLAUDE.md § Gotchas) — so the aliasing is solved by arithmetic that every
 * GLSL ES 1.0 implementation has.
 */
export function luminousGround(
  tracker: ResourceTracker,
  options: { radius: number; near: number; far: number; line: number; ringSpacing: number },
): LuminousGround {
  const geometry = tracker.track(new CircleGeometry(options.radius, 96));
  const pools: Vector3[] = [];
  for (let i = 0; i < 6; i += 1) {
    pools.push(new Vector3(0, 0, 0));
  }

  const material = tracker.track(
    new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uNear: { value: new Color(options.near) },
        uFar: { value: new Color(options.far) },
        uLine: { value: new Color(options.line) },
        uRadius: { value: options.radius },
        uRingFreq: { value: 1 / options.ringSpacing },
        uPools: { value: pools },
        uPoolCount: { value: 0 },
      },
      vertexShader: WORLD_VERTEX,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uNear;
        uniform vec3 uFar;
        uniform vec3 uLine;
        uniform float uRadius;
        uniform float uRingFreq;
        uniform vec3 uPools[6];
        uniform int uPoolCount;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;

        void main() {
          vec2 ground = vWorldPos.xz;
          float r = length(ground);

          vec3 base = mix(uNear, uFar, smoothstep(0.0, uRadius * 0.62, r));

          // Concentric measure, centred on the instrument. The band widens as it
          // recedes so the rings blur out instead of shimmering at the horizon.
          float phase = r * uRingFreq;
          float ridge = abs(fract(phase + 0.5) - 0.5) * 2.0;
          float band = clamp(0.09 + r * 0.016, 0.0, 0.95);
          // Softened deliberately. A crisp bright line at this spacing reads as a
          // technical grid, and the hall is not a readout — the rings are only
          // there so the eye has something to measure the distance to the far
          // side of the room against.
          float ring = pow(1.0 - smoothstep(0.0, band, ridge), 1.6)
            * (1.0 - smoothstep(uRadius * 0.03, uRadius * 0.24, r));

          // A pool of light under everything that is standing here, which is
          // what puts a figure ON the floor rather than in front of it.
          float pooled = 0.0;
          for (int i = 0; i < 6; i++) {
            if (i >= uPoolCount) { break; }
            vec2 at = vec2(uPools[i].x, uPools[i].y);
            float d = length(ground - at);
            pooled += uPools[i].z * exp(-d * d * 0.5);
          }

          // A slow unevenness across the floor, so it is a surface and not a
          // gradient. Two sines rather than noise: this is the largest thing in
          // frame and every instruction in it is paid for at every pixel.
          float mottle = sin(ground.x * 0.13 + uTime * 0.05) * sin(ground.y * 0.11 - uTime * 0.04);
          float breath = 0.9 + 0.07 * sin(uTime * 0.22 + r * 0.1) + mottle * 0.06;
          vec3 color = base * breath + uLine * ring * 0.17 + uLine * pooled * 0.8;
          // The disc has to become the air before it runs out, or the player
          // sees its rim and the hall becomes a dinner plate.
          color = mix(color, uFar, smoothstep(uRadius * 0.52, uRadius * 0.99, r));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );

  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;

  return {
    mesh,
    material,
    setPools(next) {
      const count = Math.min(6, next.length);
      for (let i = 0; i < count; i += 1) {
        const entry = next[i];
        const slot = pools[i];
        if (entry && slot) {
          slot.set(entry[0], entry[1], entry[2]);
        }
      }
      setU(material, 'uPoolCount', count);
    },
    update(elapsed) {
      setU(material, 'uTime', elapsed);
    },
  };
}

// --- the far colonnade -----------------------------------------------------

export interface Colonnade {
  readonly group: Group;
  readonly material: ShaderMaterial;
  update(elapsed: number): void;
  setIntensity(value: number): void;
}

/**
 * Columns of light standing far out past the hall.
 *
 * They are never looked at and that is the point: they are there so the slow
 * drift of the camera has something distant to move the near things against,
 * and so the player can tell how big this place is. Brightest at the foot and
 * dissolving upward, so they have height without a hard top edge that would
 * make them read as objects rather than as architecture.
 */
export function distantColonnade(
  tracker: ResourceTracker,
  rng: Rng,
  options: {
    count: number;
    innerRadius: number;
    outerRadius: number;
    minHeight: number;
    maxHeight: number;
    color: number;
    accent: number;
  },
): Colonnade {
  // Open-ended, so there are no caps to shade and the shell reads as light.
  const geometry = tracker.track(new CylinderGeometry(1, 1, 1, 7, 1, true));
  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(options.color) },
        uAccent: { value: new Color(options.accent) },
        uIntensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying float vUpward;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        void main() {
          // The unit cylinder spans -0.5..0.5, so this is 0 at the foot.
          vUpward = position.y + 0.5;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        uniform float uIntensity;
        varying float vUpward;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        void main() {
          // No hard edge anywhere on it: a column with a visible top is an
          // object, and these have to read as architecture standing too far away
          // to make out.
          float fade = pow(max(0.0, 1.0 - vUpward), 2.3) * smoothstep(0.0, 0.1, vUpward);
          // Thickest where the shell faces the eye and gone at its own edge, so
          // a column has no flat sides to give away that it is a cylinder.
          vec3 toEye = normalize(cameraPosition - vWorldPos);
          float girth = pow(abs(dot(normalize(vWorldNormal), toEye)), 0.55);
          float shimmer = 0.84 + 0.16 * sin(uTime * 0.26 + vWorldPos.x * 0.18 + vWorldPos.z * 0.15);
          vec3 color = mix(uAccent, uColor, clamp(vUpward * 0.7, 0.0, 1.0));
          float density = fade * girth * uIntensity * shimmer;
          gl_FragColor = vec4(color * density, clamp(density * 0.6, 0.0, 1.0));
        }
      `,
    }),
  );

  const group = new Group();
  for (let i = 0; i < options.count; i += 1) {
    // Seeded, and jittered off the even spacing so the ring is architecture
    // rather than a fence.
    const angle = ((i + rng.range(-0.3, 0.3)) / options.count) * Math.PI * 2;
    const distance = rng.range(options.innerRadius, options.outerRadius);
    const height = rng.range(options.minHeight, options.maxHeight);
    const width = rng.range(0.45, 1.5);
    const column = new Mesh(geometry, material);
    column.scale.set(width, height, width);
    column.position.set(Math.cos(angle) * distance, height * 0.5, Math.sin(angle) * distance);
    group.add(column);
  }

  return {
    group,
    material,
    update(elapsed) {
      setU(material, 'uTime', elapsed);
    },
    setIntensity(value) {
      setU(material, 'uIntensity', value);
    },
  };
}

// --- the balance -----------------------------------------------------------

/** The beam's half-span: where a pan hangs from. */
const ARM = 1.18;
/** World height of the pivot. */
const PIVOT_Y = 1.62;
/** How far a pan hangs below the beam end. */
const DROP = 0.52;

export interface WeighingBalance {
  readonly group: Group;
  /** Where the heart rests, in world space, given the current tilt. */
  readonly heartSeat: Vector3;
  /** Where the feather rests, in world space, given the current tilt. */
  readonly featherSeat: Vector3;
  /** Lean the beam. Positive dips the left pan, which is the one that carries the heart. */
  setTilt(radians: number): void;
  /** How much the metal is lit from within, 0..1. Rises as the reading happens. */
  setGlow(value: number): void;
  update(elapsed: number): void;
}

/**
 * The balance: heart against feather (`L-ER-05`).
 *
 * The lore bible is explicit that this is a reading of what is already there and
 * not a sentence imposed (`L-ER-02`, design note), and `L-THRESH-06` puts the
 * beings of the Light as wholly loving and without judgement. So the instrument
 * is built as an instrument — a made, cared-for thing with a pointer and a mark
 * to read it against — rather than as a throne or a gavel. What it does is
 * measure. Nothing in it accuses.
 *
 * It is opaque, lit and specular, which is the one place in the Light that is
 * true. Flat additive bars had neither depth nor mass; a cylinder with a key
 * light, a fill and a highlight running down it is unmistakably a made object,
 * and the contrast against five beings with no surface at all is the point.
 */
export function weighingBalance(
  tracker: ResourceTracker,
  options: { base: number; cool: number; spec: number },
): WeighingBalance {
  const uniforms = {
    uTime: { value: 0 },
    uBase: { value: new Color(options.base) },
    uCool: { value: new Color(options.cool) },
    uSpec: { value: new Color(options.spec) },
    // The Light is above and a little in front; the fill is the floor's own glow.
    uKey: { value: new Vector3(0.35, 0.86, 0.38) },
    uFill: { value: new Vector3(-0.3, -0.75, 0.6) },
    uGlow: { value: 0 },
  };

  const metalShader = /* glsl */ `
    precision highp float;
    uniform float uTime;
    uniform vec3 uBase;
    uniform vec3 uCool;
    uniform vec3 uSpec;
    uniform vec3 uKey;
    uniform vec3 uFill;
    uniform float uGlow;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;

    void main() {
      vec3 normal = normalize(vWorldNormal);
      // The pans are open vessels, so the inside of the bowl is a back face and
      // has to be lit as a surface rather than as a hole.
      if (!gl_FrontFacing) { normal = -normal; }
      vec3 view = normalize(cameraPosition - vWorldPos);
      vec3 key = normalize(uKey);
      vec3 fill = normalize(uFill);

      float lit = max(dot(normal, key), 0.0);
      float bounced = max(dot(normal, fill), 0.0);
      float highlight = pow(max(dot(normal, normalize(key + view)), 0.0), 54.0);
      float edge = pow(1.0 - max(dot(normal, view), 0.0), 3.4);

      vec3 color = uBase * (0.14 + lit * 0.82)
        + uCool * bounced * 0.42
        + uSpec * highlight * 1.25
        + uBase * edge * 0.4
        + uBase * uGlow * 0.7;
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const brass = tracker.track(
    new ShaderMaterial({ uniforms, vertexShader: WORLD_VERTEX, fragmentShader: metalShader }),
  );
  // One extra material rather than double-siding everything: the pans are the
  // only parts the player sees the inside of, and backface culling on the rest
  // is free fill rate on a software rasteriser.
  const brassShell = tracker.track(
    new ShaderMaterial({ uniforms, vertexShader: WORLD_VERTEX, fragmentShader: metalShader, side: DoubleSide }),
  );

  const group = new Group();

  // Plinth: two courses, so the instrument is set down on something.
  const lowerPlinth = tracker.track(new CylinderGeometry(0.46, 0.52, 0.075, 28));
  const upperPlinth = tracker.track(new CylinderGeometry(0.3, 0.37, 0.065, 24));
  const lower = new Mesh(lowerPlinth, brass);
  lower.position.y = 0.045;
  const upper = new Mesh(upperPlinth, brass);
  upper.position.y = 0.13;
  group.add(lower, upper);

  // Column: a turned shaft with a foot flare and a collar under the pivot.
  const columnGeometry = tracker.track(
    new LatheGeometry(
      lathePoints([
        [0.0, 0.14],
        [0.155, 0.14],
        [0.125, 0.21],
        [0.062, 0.38],
        [0.045, 0.78],
        [0.042, 1.2],
        [0.062, 1.36],
        [0.046, 1.44],
        [0.038, 1.56],
        [0.0, 1.58],
      ]),
      18,
    ),
  );
  group.add(new Mesh(columnGeometry, brass));

  // The mark the pointer is read against: two slender posts and a crossbar,
  // fixed to the column and never moving. This is how the scene says "level"
  // without a caption — the needle either sits between the posts or it does not.
  const postGeometry = tracker.track(new CylinderGeometry(0.008, 0.008, 0.3, 6));
  for (const x of [-0.07, 0.07]) {
    const post = new Mesh(postGeometry, brass);
    post.position.set(x, PIVOT_Y + 0.17, -0.07);
    group.add(post);
  }
  const crossbarGeometry = tracker.track(new CylinderGeometry(0.007, 0.007, 0.155, 6));
  const crossbar = new Mesh(crossbarGeometry, brass);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, PIVOT_Y + 0.32, -0.07);
  group.add(crossbar);

  // Beam. A round bar rather than a flat bar: a cylinder carries a highlight
  // down its length, and that highlight is most of what reads as metal.
  const beam = new Group();
  beam.position.y = PIVOT_Y;
  group.add(beam);

  const beamGeometry = tracker.track(new CylinderGeometry(0.028, 0.028, ARM * 2, 12));
  const beamBar = new Mesh(beamGeometry, brass);
  beamBar.rotation.z = Math.PI / 2;
  beam.add(beamBar);

  const bossGeometry = tracker.track(new SphereGeometry(0.085, 16, 12));
  beam.add(new Mesh(bossGeometry, brass));

  const finialGeometry = tracker.track(new SphereGeometry(0.044, 12, 10));
  for (const x of [-ARM, ARM]) {
    const finial = new Mesh(finialGeometry, brass);
    finial.position.x = x;
    beam.add(finial);
  }

  // The pointer. It rises from the pivot and tilts with the beam, so the gap
  // between it and the two posts is the reading.
  const needleGeometry = tracker.track(new CylinderGeometry(0.004, 0.013, 0.3, 6));
  const needle = new Mesh(needleGeometry, brass);
  needle.position.set(0, 0.15, 0);
  beam.add(needle);

  // Pans. Each is a vessel on three cords, built once and then only moved: the
  // cords are rigid relative to the pan, and a hanging pan stays level however
  // the beam leans, which is the behaviour that makes a balance read as one.
  const bowlGeometry = tracker.track(
    new LatheGeometry(
      lathePoints([
        [0.0, 0.0],
        [0.11, 0.004],
        [0.2, 0.018],
        [0.28, 0.046],
        [0.33, 0.082],
        [0.355, 0.115],
        [0.362, 0.138],
      ]),
      24,
    ),
  );
  const cordGeometry = tracker.track(new CylinderGeometry(0.006, 0.006, 1, 5));

  const makePan = (): Group => {
    const pan = new Group();
    const bowl = new Mesh(bowlGeometry, brassShell);
    bowl.position.y = -DROP;
    pan.add(bowl);

    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2;
      const anchor = new Vector3(Math.cos(angle) * 0.3, -DROP + 0.13, Math.sin(angle) * 0.3);
      const cord = new Mesh(cordGeometry, brass);
      const length = anchor.length();
      cord.scale.y = length;
      cord.position.copy(anchor).multiplyScalar(0.5);
      cord.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), anchor.clone().normalize());
      pan.add(cord);
    }
    return pan;
  };

  const leftPan = makePan();
  const rightPan = makePan();
  group.add(leftPan, rightPan);

  const heartSeat = new Vector3();
  const featherSeat = new Vector3();
  let tilt = 0;

  const place = (): void => {
    const dx = Math.cos(tilt) * ARM;
    const dy = Math.sin(tilt) * ARM;
    beam.rotation.z = tilt;
    leftPan.position.set(-dx, PIVOT_Y - dy, 0);
    rightPan.position.set(dx, PIVOT_Y + dy, 0);
    heartSeat.set(leftPan.position.x, leftPan.position.y - DROP + 0.23, 0);
    featherSeat.set(rightPan.position.x, rightPan.position.y - DROP + 0.14, 0);
  };
  place();

  return {
    group,
    heartSeat,
    featherSeat,
    setTilt(radians) {
      tilt = radians;
      place();
    },
    setGlow(value) {
      uniforms.uGlow.value = value;
    },
    update(elapsed) {
      uniforms.uTime.value = elapsed;
    },
  };
}

// --- what goes in the pans -------------------------------------------------

export interface WeighedThing {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  update(elapsed: number): void;
  setIntensity(value: number): void;
}

/**
 * The heart: the life as it was actually lived.
 *
 * A solid with a surface, not a sprite, because it has to sit in a bowl and be
 * seen to sit in it. It keeps a double beat on wall-clock time, which is the one
 * thing in the scene the player already knows how to read.
 */
export function heartOfTheLife(
  tracker: ResourceTracker,
  options: { radius: number; color: number; accent: number },
): WeighedThing {
  const geometry = tracker.track(new IcosahedronGeometry(options.radius, 2));
  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(options.color) },
        uAccent: { value: new Color(options.accent) },
        uIntensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying vec3 vLocal;
        void main() {
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vLocal = position;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        uniform float uIntensity;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying vec3 vLocal;

        ${NOISE}

        void main() {
          vec3 normal = normalize(vWorldNormal);
          vec3 view = normalize(cameraPosition - vWorldPos);
          float facing = clamp(dot(normal, view), 0.0, 1.0);
          float rim = pow(1.0 - facing, 2.0);

          // A double beat: two pulses close together, then a rest. Wall-clock,
          // because a heartbeat that slows down with the frame rate is a bug.
          float cycle = fract(uTime * 0.62);
          float beat = exp(-cycle * 14.0) + 0.65 * exp(-max(0.0, cycle - 0.17) * 16.0);

          float veins = fbm(vLocal * 9.0 + vec3(0.0, uTime * 0.22, 0.0), 2);
          float density = (0.4 + rim * 1.15) * (0.62 + veins * 0.8) * (0.8 + beat * 0.45);
          vec3 tint = mix(uAccent, uColor, clamp(rim + beat * 0.3, 0.0, 1.0));
          gl_FragColor = vec4(tint * density * uIntensity, clamp(density * uIntensity * 0.85, 0.0, 1.0));
        }
      `,
    }),
  );

  const mesh = new Mesh(geometry, material);
  return {
    mesh,
    material,
    update(elapsed) {
      setU(material, 'uTime', elapsed);
    },
    setIntensity(value) {
      setU(material, 'uIntensity', value);
    },
  };
}

/**
 * The feather of Maat (`L-ER-05`): unchanging, and far lighter than it looks.
 *
 * Built as a plume rather than bought as one — a curved spine with a width
 * envelope swept along it, three vertices per section, so the barbs can be shaded
 * from the distance to the rib. It reads as a feather at a glance, which matters,
 * because the caption says "a feather" once and then never again.
 */
export function featherOfMaat(
  tracker: ResourceTracker,
  options: { length: number; width: number; color: number; accent: number },
): WeighedThing {
  const sections = 14;
  const positions: number[] = [];
  const across: number[] = [];
  const along: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= sections; i += 1) {
    const s = i / sections;
    const x = s * options.length;
    // A slight droop toward the tip, so the plume is not a flat leaf.
    const y = -0.09 * options.length * s * s;
    const halfWidth = options.width * Math.sin(Math.PI * Math.pow(s, 0.72)) * (1 - 0.22 * s);
    positions.push(x, y, -halfWidth, x, y + halfWidth * 0.18, 0, x, y, halfWidth);
    across.push(-1, 0, 1);
    along.push(s, s, s);
  }
  for (let i = 0; i < sections; i += 1) {
    const a = i * 3;
    const b = (i + 1) * 3;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
    indices.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }

  const geometry = tracker.track(new BufferGeometry());
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aAcross', new BufferAttribute(new Float32Array(across), 1));
  geometry.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1));
  geometry.setIndex(indices);

  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(options.color) },
        uAccent: { value: new Color(options.accent) },
        uIntensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aAcross;
        attribute float aAlong;
        varying float vAcross;
        varying float vAlong;
        void main() {
          vAcross = aAcross;
          vAlong = aAlong;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        uniform float uIntensity;
        varying float vAcross;
        varying float vAlong;

        void main() {
          float side = abs(vAcross);
          float rib = 1.0 - smoothstep(0.0, 0.2, side);
          float vane = 1.0 - smoothstep(0.55, 1.0, side);
          float barbs = 0.5 + 0.5 * sin(vAlong * 62.0 + side * 6.0 + uTime * 0.4);
          float tip = 1.0 - smoothstep(0.88, 1.0, vAlong);
          float density = (rib * 1.4 + barbs * 0.4 * vane + vane * 0.34) * tip * uIntensity;
          vec3 tint = mix(uAccent, uColor, rib);
          gl_FragColor = vec4(tint * density, clamp(density * 0.7, 0.0, 1.0));
        }
      `,
    }),
  );

  const mesh = new Mesh(geometry, material);
  return {
    mesh,
    material,
    update(elapsed) {
      setU(material, 'uTime', elapsed);
    },
    setIntensity(value) {
      setU(material, 'uIntensity', value);
    },
  };
}

/**
 * Small embers that leave the heart and come to rest near the player.
 *
 * One per obligation the reading locks into the cart, so the number on screen is
 * the number of things the next life has been asked to carry. They do not read
 * as a penalty because they come to rest beside the player rather than being
 * handed down from above: this is what you are taking with you, not what is
 * being done to you.
 */
export function emberCluster(
  tracker: ResourceTracker,
  options: { count: number; radius: number; color: number; accent: number },
): { group: Group; meshes: Mesh[]; material: ShaderMaterial; update(elapsed: number): void } {
  const geometry = tracker.track(new IcosahedronGeometry(options.radius, 1));
  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(options.color) },
        uAccent: { value: new Color(options.accent) },
      },
      vertexShader: WORLD_VERTEX,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;

        void main() {
          vec3 normal = normalize(vWorldNormal);
          vec3 view = normalize(cameraPosition - vWorldPos);
          float facing = clamp(dot(normal, view), 0.0, 1.0);
          float rim = pow(1.0 - facing, 1.7);
          float flicker = 0.78 + 0.22 * sin(uTime * 1.3 + vWorldPos.x * 3.1 + vWorldPos.y * 2.2);
          float density = (0.5 + rim * 1.3) * flicker;
          gl_FragColor = vec4(mix(uAccent, uColor, rim) * density, clamp(density * 0.8, 0.0, 1.0));
        }
      `,
    }),
  );

  const group = new Group();
  const meshes: Mesh[] = [];
  for (let i = 0; i < options.count; i += 1) {
    const ember = new Mesh(geometry, material);
    ember.visible = false;
    group.add(ember);
    meshes.push(ember);
  }

  return {
    group,
    meshes,
    material,
    update(elapsed) {
      setU(material, 'uTime', elapsed);
    },
  };
}

/** Quaternion scratch, so the lean of a presence costs no allocation per frame. */
export const leanToward = (() => {
  const up = new Vector3(0, 1, 0);
  const axis = new Vector3();
  return (into: Quaternion, towardX: number, towardZ: number, amount: number): Quaternion => {
    axis.set(towardX * amount, 1, towardZ * amount).normalize();
    return into.setFromUnitVectors(up, axis);
  };
})();
