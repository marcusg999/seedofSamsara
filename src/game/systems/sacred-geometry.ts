import {
  AdditiveBlending,
  BoxGeometry,
  DodecahedronGeometry,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineSegments,
  Mesh,
  OctahedronGeometry,
  PlaneGeometry,
  ShaderMaterial,
  TetrahedronGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry as TBufferGeometry,
} from 'three';
import type { ResourceTracker } from '../disposal';
import { colorOf } from './palette';
import { setU } from './glsl';

/**
 * Sacred geometry, as mathematics rather than as ornament.
 *
 * GAME_BRIEF.md § Platform asks vignette seven for "shifting geometric
 * architecture", and this is the module that supplies the geometry it shifts
 * between. Everything here is a classical construction — the five Platonic
 * solids, the mirrors of the icosahedral symmetry group, the vesica piscis, the
 * Flower of Life lattice — written as distance fields and as meshes built from
 * the numbers. None of it is traced from anyone's drawing; it is all derived
 * here from the golden ratio and from face normals.
 *
 * Mathematics needs no lore claim. The *phenomenology* the vignette asserts
 * around it does, and that is `L-DMT-03`: the structures the player meets are
 * aware of and responsive to them.
 *
 * Cost discipline (CLAUDE.md § three.js discipline, and the raymarcher's own
 * budget): every distance field here is written so symmetry does the work.
 * Folding a point into a symmetry group's fundamental domain costs a handful of
 * `dot`/`min` operations and then one evaluation stands in for the whole orbit —
 * a dodecahedron's twelve faces cost three dot products, an icosahedron's twenty
 * cost four, and the Flower of Life's eighteen outer circles cost three. That is
 * why this can be afforded inside a march at all.
 */

// --- shared GLSL ---------------------------------------------------------------

/**
 * Constants and the symmetry folds. Include once per shader; `SACRED_SOLIDS`
 * and `SACRED_FIGURES` both depend on it.
 */
export const SACRED_COMMON = /* glsl */ `
  const float PHI = 1.6180339887498949;
  const float INV_PHI = 0.6180339887498949;
  const float SQRT3 = 1.7320508075688772;
  const float INV_SQRT3 = 0.5773502691896258;
  const float TAU = 6.283185307179586;

  /** A surface a distance \`t\` either side of the solid's boundary. */
  float shell(float d, float t) {
    return abs(d) - t;
  }

  /**
   * Six-fold kaleidoscopic fold in the plane.
   *
   * abs() uses the two coordinate mirrors to reach a quadrant; two more mirrors,
   * at sixty and thirty degrees, cut that to a thirty-degree wedge. The result
   * is the fundamental domain of the dihedral group of order twelve, so any
   * figure with hexagonal symmetry — a triangular lattice, for instance — can be
   * measured from one representative point per orbit instead of from all six.
   *
   * Verified numerically before it was written here: the wedge comes out as
   * 0..30 degrees, the fold preserves length exactly, and all six vertices of a
   * unit hexagon land on (1, 0).
   */
  vec2 fold6(vec2 q) {
    const vec2 N60 = vec2(0.8660254037844387, -0.5);
    const vec2 N30 = vec2(0.5, -0.8660254037844387);
    q = abs(q);
    q -= 2.0 * min(0.0, dot(q, N60)) * N60;
    q -= 2.0 * min(0.0, dot(q, N30)) * N30;
    return q;
  }

  /** N-fold kaleidoscope with a mirror in each sector. One atan, so never in a loop. */
  vec2 kaleido(vec2 q, float sectors, float twist) {
    float seg = TAU / sectors;
    float a = atan(q.y, q.x) + twist;
    a = abs(mod(a + seg * 0.5, seg) - seg * 0.5);
    return length(q) * vec2(cos(a), sin(a));
  }

  /**
   * Icosahedral symmetry, by folding space against golden-ratio planes.
   *
   * The full icosahedral group has order 120 and its fundamental domain is a
   * spherical triangle bounded by three mirrors — the H3 Coxeter simplex, whose
   * mirrors meet at ninety, sixty and thirty-six degrees. Two of those three
   * mirrors can be chosen to be the x = 0 and y = 0 planes, so folding against
   * them is a pair of abs(); only the third is a real reflection, and its normal
   * is -(phi, 1, phi - 1) / 2, which is exactly a unit vector because
   * 1 + phi^2 + (phi - 1)^2 = 4.
   *
   * Sweeping the three mirrors five times is the worst case: the longest element
   * of H3 is a word of fifteen reflections, so after five sweeps no reflection
   * can fire again and the point is in the fundamental domain exactly. This was
   * checked against all 120 group elements before being written here — folding
   * any group image of a point lands on the same point to within 1e-14, and four
   * sweeps does not (worst error 2.3).
   *
   * Because the projection is exact, *any* function of the folded point is
   * exactly symmetric under the whole group, including all six five-fold axes.
   * That is what makes the result read as sacred rather than as merely tiled:
   * five-fold symmetry cannot be reached by repeating a box.
   *
   * The domain sits down the -z side, so the z flip at the end brings it to +z
   * and lets everything built in it be written with the usual sign.
   */
  const vec3 ICO_MIRROR = vec3(-0.8090169943749475, -0.5, -0.3090169943749475);

  vec3 icosaFold(vec3 p, int sweeps) {
    for (int i = 0; i < 5; i++) {
      if (i >= sweeps) break;
      p.xy = abs(p.xy);
      p -= 2.0 * min(0.0, dot(p, ICO_MIRROR)) * ICO_MIRROR;
    }
    return vec3(p.xy, -p.z);
  }
`;

/**
 * The solids, and the nested figures built out of them. Distance fields, for the
 * march. Requires `SACRED_COMMON`.
 */
export const SACRED_SOLIDS = /* glsl */ `
  /**
   * The five Platonic solids, each as the intersection of its face half-spaces:
   * d = max over faces of (dot(p, n) - r), with r the inradius. That is exact on
   * the faces and conservative near the edges and corners, which is what a march
   * needs — it may understate the distance, never overstate it.
   *
   * abs(p) folds away the sign variations in each normal family, so the counts
   * collapse: twelve dodecahedral faces to three dot products, twenty
   * icosahedral faces to four. The dodecahedron's normals are the icosahedron's
   * vertex directions and vice versa, because the two are duals — which is also
   * why morphing between them by mixing their fields is a real relationship and
   * not a dissolve.
   */
  float sdTetrahedron(vec3 p, float r) {
    // Four alternating body diagonals of the cube.
    float d = max(max(p.x + p.y + p.z, p.x - p.y - p.z),
                  max(-p.x + p.y - p.z, -p.x - p.y + p.z));
    return d * INV_SQRT3 - r;
  }

  float sdCube(vec3 p, float r) {
    vec3 q = abs(p);
    return max(q.x, max(q.y, q.z)) - r;
  }

  float sdOctahedron(vec3 p, float r) {
    vec3 q = abs(p);
    return (q.x + q.y + q.z) * INV_SQRT3 - r;
  }

  float sdDodecahedron(vec3 p, float r) {
    // Face normals: the cyclic permutations of (0, 1, phi), over sqrt(1 + phi^2).
    const float K = 0.5257311121191336;
    vec3 q = abs(p);
    float d = max(max(q.y + PHI * q.z, q.z + PHI * q.x), q.x + PHI * q.y);
    return d * K - r;
  }

  float sdIcosahedron(vec3 p, float r) {
    // Face normals: (1, 1, 1) and the cyclic permutations of (1/phi, phi, 0),
    // all over sqrt(3).
    vec3 q = abs(p);
    float d = max(q.x + q.y + q.z,
              max(max(INV_PHI * q.y + PHI * q.z, INV_PHI * q.z + PHI * q.x),
                  INV_PHI * q.x + PHI * q.y));
    return d * INV_SQRT3 - r;
  }

  /** 0 tetrahedron, 1 cube, 2 octahedron, 3 dodecahedron, 4 icosahedron. */
  float sdPlatonic(vec3 p, int kind, float r) {
    if (kind <= 0) return sdTetrahedron(p, r);
    if (kind == 1) return sdCube(p, r);
    if (kind == 2) return sdOctahedron(p, r);
    if (kind == 3) return sdDodecahedron(p, r);
    return sdIcosahedron(p, r);
  }

  /** The dual of each: the solid whose vertices are the other's face centres. */
  int dualOf(int kind) {
    if (kind == 1) return 2;
    if (kind == 2) return 1;
    if (kind == 3) return 4;
    if (kind == 4) return 3;
    return 0;
  }

  /**
   * The vesica piscis, in three dimensions: the lens two spheres of equal radius
   * cut out of each other when each passes through the other's centre. Offsetting
   * the pair by exactly one radius is the whole construction — any other offset
   * is just a lens.
   */
  float sdVesica(vec3 p, float r, vec3 axis) {
    float h = r * 0.5;
    return max(length(p - axis * h) - r, length(p + axis * h) - r);
  }

  float sdTorus(vec3 p, float major, float minor) {
    return length(vec2(length(p.xz) - major, p.y)) - minor;
  }

  /**
   * The Flower of Life: circles of radius r whose centres sit on a triangular
   * lattice of spacing r, so every circle passes through its neighbours'
   * centres. Here the circles are spherical shells, so what the march finds is
   * the surfaces crossing one another rather than a solid mass.
   *
   * Three rings of centres — one, six, twelve — and fold6() collapses each ring
   * to a single representative, so nineteen spheres cost four distance
   * evaluations. the rings argument trades the outer two away when the budget is tight.
   */
  float sdFlowerOfLife(vec3 p, float r, float thickness, int rings) {
    vec2 q = fold6(p.xy);
    float d = shell(length(vec3(q, p.z)) - r, thickness);
    d = min(d, shell(length(vec3(q - vec2(r, 0.0), p.z)) - r, thickness));
    if (rings >= 2) {
      // The second ring: six centres at r*sqrt(3) on the thirty-degree lines,
      // and six at 2r on the sixty-degree ones. Both fold to one point each.
      vec2 c1 = vec2(0.8660254037844387, 0.5) * (r * SQRT3);
      d = min(d, shell(length(vec3(q - c1, p.z)) - r, thickness));
      d = min(d, shell(length(vec3(q - vec2(2.0 * r, 0.0), p.z)) - r, thickness));
    }
    return d;
  }
`;

/**
 * The same figures as plane curves, for the screen-space and ray-space passes
 * where they can be drawn at full resolution for almost nothing. Requires
 * `SACRED_COMMON`.
 */
export const SACRED_FIGURES = /* glsl */ `
  float ring2(float d, float t) {
    return abs(d) - t;
  }

  /** Equilateral triangle, as the intersection of its three edge half-planes. */
  float sdTriangle2(vec2 p, float r) {
    const float K = 0.8660254037844387;
    return max(max(p.y, dot(p, vec2(K, -0.5))), dot(p, vec2(-K, -0.5))) - r;
  }

  /** Two equilateral triangles, one inverted: the simplest nested inverted pair. */
  float sdHexagram2(vec2 p, float r) {
    return min(sdTriangle2(p, r), sdTriangle2(-p, r));
  }

  float sdVesica2(vec2 p, float r) {
    float h = r * 0.5;
    return max(length(p - vec2(h, 0.0)) - r, length(p + vec2(h, 0.0)) - r);
  }

  /** The Flower of Life as plane curves: three rings, four evaluations. */
  float flowerOfLife2(vec2 p, float r, float t) {
    vec2 q = fold6(p);
    float d = ring2(length(q) - r, t);
    d = min(d, ring2(length(q - vec2(r, 0.0)) - r, t));
    d = min(d, ring2(length(q - vec2(0.8660254037844387, 0.5) * (r * SQRT3)) - r, t));
    d = min(d, ring2(length(q - vec2(2.0 * r, 0.0)) - r, t));
    return d;
  }

  /**
   * Nested inverted triangles: the count argument hexagrams, each a little smaller and
   * counter-rotated, which is the figure that reads most immediately as
   * deliberate construction rather than as pattern.
   */
  float nestedTriangles2(vec2 p, float r, float t, float turn, int count) {
    float d = 1e6;
    for (int i = 0; i < 5; i++) {
      if (i >= count) break;
      float k = float(i);
      float c = cos(turn * k);
      float s = sin(turn * k);
      vec2 q = mat2(c, -s, s, c) * p;
      d = min(d, ring2(sdHexagram2(q, r * (1.0 - k * 0.19)), t));
    }
    return d;
  }

  /**
   * One figure, drawn in whatever plane the caller hands it, with the whole thing
   * under a five-fold kaleidoscope. Five-fold is the choice that matters: it is
   * the symmetry a lattice cannot have, so it reads as something constructed
   * rather than as something repeating.
   *
   * Returns coverage in 0..1 rather than a distance, so the caller can add it.
   */
  float sacredFigure(vec2 uv, float t, float breath, float zoom) {
    // Five-fold kaleidoscope, turning slowly: the figure keeps being rebuilt out
    // of its own reflections. Five-fold rather than six is the whole choice —
    // six is what a lattice does by itself, five is what somebody decided.
    vec2 k5 = kaleido(uv, 5.0, t * 0.05);

    // Thin lines. The figure has to read as drawn, and a thick line at this
    // density turns the whole construction into a wash — which is exactly how
    // the first attempt at this blew the frame out to 100% bright pixels.
    float line = 0.0035;
    float scale = zoom * (1.0 + breath * 0.18);

    float flower = flowerOfLife2(uv * (5.4 / scale), 1.0, line * 5.4);
    float nested = nestedTriangles2(k5 * (3.0 / scale), 1.0, line * 3.0, 0.23 + breath * 0.22, 3);
    // Two vesicas crossed at right angles: the lens, and the lens of the lens.
    vec2 v = k5 * (2.1 / scale);
    float lens = min(
      ring2(sdVesica2(v, 1.0), line * 2.1),
      ring2(sdVesica2(v.yx, 1.0), line * 2.1)
    );
    // Concentric circles stepping by the golden ratio, which is what ties the
    // figures above into one construction rather than three drawings.
    float r = length(uv) * (2.4 / scale);
    float rings = 1e6;
    for (int i = 0; i < 3; i++) {
      rings = min(rings, abs(r - pow(PHI, float(i) - 1.0) * 0.62) - line * 2.4);
    }

    float cover = 0.0;
    cover += smoothstep(line, 0.0, flower) * 0.85;
    cover += smoothstep(line, 0.0, nested) * 1.0;
    cover += smoothstep(line, 0.0, lens) * 0.7;
    cover += smoothstep(line, 0.0, rings) * 0.5;
    return clamp(cover, 0.0, 1.3);
  }
`;

// --- the nested armature (meshes) ----------------------------------------------

export interface PlatonicArmature {
  readonly group: Group;
  /** 0: not there at all. 1: fully unfolded, all five solids nested and turning. */
  setUnfold(amount: number): void;
  update(elapsed: number): void;
}

/**
 * The five Platonic solids, nested one inside the next, with a torus threading
 * the pair at the middle of the nest.
 *
 * This is the half of the geometry the player can *name*. A distance field can
 * fold space five ways and still read as pattern; a dodecahedron with twelve
 * visible pentagons inside an icosahedron with twenty visible triangles reads as
 * a solid, and then as two solids, and then as the fact that one is the other's
 * dual. Faces and edges are drawn separately — additive translucent panes with a
 * rim, plus the real edge lines from `EdgesGeometry` — because the edges are what
 * the eye counts the faces with.
 *
 * Ordered outermost to innermost by circumradius, which is also the classical
 * nesting order, so the solids resolve one inside another as the figure opens.
 */
export function platonicArmature(
  tracker: ResourceTracker,
  options: { radius: number; color: number; accent: number },
): PlatonicArmature {
  const group = new Group();

  const faceMaterial = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: colorOf(options.color) },
        uAccent: { value: colorOf(options.accent) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormalView;
        varying vec3 vLocal;
        void main() {
          vNormalView = normalize(normalMatrix * normal);
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        varying vec3 vNormalView;
        varying vec3 vLocal;

        void main() {
          // Panes rather than solids: a face facing away from the viewer is the
          // brightest thing in the figure, so what the eye follows is the
          // silhouette of every solid in the nest at once.
          float facing = abs(dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0)));
          float pane = pow(1.0 - facing, 2.2) * 0.9 + 0.06;
          // A slow travelling band along the face normal's own axis, so a still
          // solid is never a still image.
          float band = 0.5 + 0.5 * sin(dot(vLocal, vec3(2.9, 3.7, 2.3)) - uTime * 0.7);
          vec3 tint = mix(uAccent, uColor, band);
          float lit = pane * uIntensity * (0.6 + band * 0.7);
          gl_FragColor = vec4(tint * lit, clamp(lit, 0.0, 1.0));
        }
      `,
    }),
  );

  const edgeMaterial = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: colorOf(options.color) },
        uAccent: { value: colorOf(options.accent) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        varying vec3 vLocal;

        void main() {
          // Light runs along the edges, which is how a wire figure says it is
          // being drawn rather than merely existing.
          float run = 0.5 + 0.5 * sin(length(vLocal) * 23.0 - uTime * 2.3);
          vec3 tint = mix(uAccent, uColor, run);
          float lit = uIntensity * (0.5 + run * 0.9);
          gl_FragColor = vec4(tint * lit, clamp(lit, 0.0, 1.0));
        }
      `,
    }),
  );

  const r = options.radius;
  // Circumradii, outermost first. A cube of circumradius r has side 2r/sqrt(3);
  // three.js's other polyhedra take the circumradius directly.
  const shells: { geometry: TBufferGeometry; spin: Vector3; rate: number }[] = [
    { geometry: tracker.track(new IcosahedronGeometry(r, 0)), spin: new Vector3(0.2, 1, 0.1), rate: 0.17 },
    { geometry: tracker.track(new DodecahedronGeometry(r * 0.82, 0)), spin: new Vector3(1, 0.3, 0.2), rate: -0.21 },
    {
      geometry: tracker.track(new BoxGeometry(
        (r * 0.64 * 2) / Math.sqrt(3),
        (r * 0.64 * 2) / Math.sqrt(3),
        (r * 0.64 * 2) / Math.sqrt(3),
      )),
      spin: new Vector3(0.4, 0.7, 1),
      rate: 0.27,
    },
    { geometry: tracker.track(new OctahedronGeometry(r * 0.5, 0)), spin: new Vector3(1, 0.2, -0.6), rate: -0.33 },
    { geometry: tracker.track(new TetrahedronGeometry(r * 0.36, 0)), spin: new Vector3(0.3, 1, 0.5), rate: 0.41 },
  ];

  const parts: { holder: Group; axis: Vector3; rate: number }[] = [];
  for (const shell of shells) {
    const holder = new Group();
    holder.add(new Mesh(shell.geometry, faceMaterial));
    holder.add(new LineSegments(tracker.track(new EdgesGeometry(shell.geometry)), edgeMaterial));
    group.add(holder);
    parts.push({ holder, axis: shell.spin.clone().normalize(), rate: shell.rate });
  }

  // A torus threading the nest. The brief's "torus threading a solid", and it is
  // also the one form here that is not a polyhedron, so it tells the eye the
  // figure is not simply a pile of dice.
  const torusGeometry = tracker.track(new TorusGeometry(r * 0.74, r * 0.012, 5, 96));
  const torus = new Mesh(torusGeometry, edgeMaterial);
  torus.rotation.x = Math.PI / 2;
  const torusHolder = new Group();
  torusHolder.add(torus);
  group.add(torusHolder);

  // The vesica piscis, built as two circles of equal radius each passing through
  // the other's centre, so the lens between them is the real construction and
  // not a drawn almond.
  const circleGeometry = tracker.track(new TorusGeometry(r * 0.62, r * 0.009, 5, 80));
  const vesica = new Group();
  for (const sign of [-1, 1] as const) {
    const circle = new Mesh(circleGeometry, edgeMaterial);
    circle.position.x = sign * r * 0.31;
    vesica.add(circle);
  }
  group.add(vesica);

  let unfold = 0;

  return {
    group,
    setUnfold(amount) {
      unfold = Math.min(1, Math.max(0, amount));
    },
    update(elapsed) {
      setU(faceMaterial, 'uTime', elapsed);
      setU(edgeMaterial, 'uTime', elapsed);
      // Nothing of this is in the room until the fold is well under way, and
      // then it arrives solid by solid from the outside in, so the player sees
      // each one resolve rather than all five at once.
      const shown = Math.max(0, unfold);
      setU(faceMaterial, 'uIntensity', shown * shown * 0.34);
      setU(edgeMaterial, 'uIntensity', shown * 0.85);
      group.scale.setScalar(0.35 + shown * 0.8);
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (!part) {
          continue;
        }
        // Staggered: the outer shell appears first, the tetrahedron at the core
        // last, which is what makes it read as nesting rather than as fading in.
        const stagger = Math.max(0, Math.min(1, (shown - index * 0.13) / 0.5));
        part.holder.scale.setScalar(0.0001 + stagger);
        part.holder.setRotationFromAxisAngle(part.axis, elapsed * part.rate * (0.3 + shown * 2));
      }
      torusHolder.rotation.y = elapsed * 0.23;
      torusHolder.rotation.z = Math.sin(elapsed * 0.11) * 0.5;
      torusHolder.scale.setScalar(0.0001 + Math.max(0, Math.min(1, (shown - 0.25) / 0.5)));
      vesica.rotation.z = elapsed * 0.09;
      vesica.rotation.y = Math.sin(elapsed * 0.07) * 0.8;
      vesica.scale.setScalar(0.0001 + Math.max(0, Math.min(1, (shown - 0.1) / 0.5)));
    },
  };
}

// --- the veil (screen space) ---------------------------------------------------

export interface SacredVeil {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** 0..1. How much of the construction is showing through perception. */
  setIntensity(amount: number): void;
  update(elapsed: number): void;
}

/**
 * The figure seen *through* the room rather than standing in it.
 *
 * The onset of this vignette is not an object arriving, it is structure becoming
 * visible in what is already there, so the construction is drawn in screen space
 * over the whole frame and brought up with the fold. Plane curves cost almost
 * nothing at full resolution, which is the only reason the onset can carry this
 * much legible geometry at all: the Flower of Life, nested inverted triangles,
 * crossed vesicas and a golden-ratio series of circles, the lot of it under a
 * five-fold kaleidoscope.
 *
 * It composites additively under the post stack, so the bloom already in the
 * scene is what gives it weight.
 */
export function sacredVeil(
  tracker: ResourceTracker,
  options: { color: number; accent: number; aspect: number },
): SacredVeil {
  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uAspect: { value: options.aspect },
        uColor: { value: colorOf(options.color) },
        uAccent: { value: colorOf(options.accent) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // Drawn straight in clip space: the veil is a property of the frame,
          // not an object in the room, so no camera is consulted.
          gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uIntensity;
        uniform float uAspect;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        varying vec2 vUv;

        ${SACRED_COMMON}
        ${SACRED_FIGURES}

        void main() {
          if (uIntensity <= 0.0) {
            // Nothing at all during the ordinary half of the vignette. An early
            // return also means the figure costs nothing before it exists.
            gl_FragColor = vec4(0.0);
            return;
          }
          vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);

          // Breathing. The whole construction opens and closes on one slow
          // curve, so it reads as something being built rather than as a decal.
          float breath = 0.5 + 0.5 * sin(uTime * 0.37);
          // It also opens out as the fold deepens: early on the player sees a
          // dense fine construction, and by the end it has grown until a single
          // five-fold cell fills the room.
          float cover = sacredFigure(uv, uTime, breath, 0.75 + uIntensity * 0.75);

          // The figure is strongest away from the centre of the frame, so the
          // middle of the room stays readable and the structure comes in at the
          // edges of attention first.
          float bias = 0.3 + 0.9 * smoothstep(0.05, 0.6, length(uv));
          // Held down hard on purpose. This composites additively *under* a bloom
          // pass and an exposure above one, so a figure drawn at full strength
          // here arrives on screen as white paper: the first build of this veil
          // measured 100% bright pixels and a mean luma of 230.
          float lit = cover * uIntensity * uIntensity * bias * 0.13;

          vec3 tint = mix(uAccent, uColor, 0.35 + breath * 0.5);
          gl_FragColor = vec4(tint * lit, clamp(lit, 0.0, 1.0));
        }
      `,
    }),
  );

  const mesh = new Mesh(tracker.track(new PlaneGeometry(1, 1)), material);
  mesh.frustumCulled = false;
  // Over everything in the room, and still inside the post stack.
  mesh.renderOrder = 900;

  return {
    mesh,
    material,
    setIntensity(amount) {
      setU(material, 'uIntensity', Math.min(1, Math.max(0, amount)));
    },
    update(elapsed) {
      setU(material, 'uTime', elapsed);
    },
  };
}

// --- the beings ----------------------------------------------------------------

export interface AwareSolid {
  readonly group: Group;
  readonly faceMaterial: ShaderMaterial;
  readonly edgeMaterial: ShaderMaterial;
  /**
   * 0 = unattended, 1 = under the player's full regard. Drives both the shading
   * and the reorganisation.
   */
  setRegard(amount: number): void;
  /** 0..1 overall presence, for arriving and leaving. */
  setPresence(amount: number): void;
  update(elapsed: number): void;
}

/**
 * A being, built as geometry that is aware (`L-DMT-03`).
 *
 * The entity is not a creature standing in a geometric landscape; it is a
 * structure in the same field, made of the same symmetry, and what makes it a
 * someone is behaviour. It is a dodecahedron and its dual icosahedron, nested —
 * so it is built out of exactly the relationship the architecture around it is
 * folded from, and it belongs to this place in a way the player does not.
 *
 * Attention is legible in the geometry itself, not in a face:
 * - Unattended, the two solids tumble out of step on separate axes and the
 *   faces churn, so the thing is barely one thing.
 * - Under regard, the tumbling slows and the inner solid *locks into dual
 *   alignment* with the outer — vertices onto face centres — which is the moment
 *   it stops being a cloud of panes and becomes a construction. That is the
 *   whole reading: a structure that reorganises when it is attended to.
 * - A third shell, an outer icosahedral cage, phases in under regard: being
 *   looked at is what makes it more, not less, built.
 *
 * The caller still owns where it is, how near it comes, and whether it is facing
 * the player — all of which is behaviour the hyperspace scene already drives.
 */
export function awareSolid(
  tracker: ResourceTracker,
  options: { radius: number; color: number; accent: number; seed: number },
): AwareSolid {
  const group = new Group();

  const faceMaterial = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: colorOf(options.color) },
        uAccent: { value: colorOf(options.accent) },
        uSeed: { value: options.seed },
        /** 0 = unattended to, 1 = the player has its full regard. */
        uRegard: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormalView;
        varying vec3 vLocal;
        void main() {
          vNormalView = normalize(normalMatrix * normal);
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        uniform float uSeed;
        uniform float uRegard;
        varying vec3 vNormalView;
        varying vec3 vLocal;

        ${SACRED_COMMON}
        ${SACRED_SOLIDS}

        void main() {
          float facing = clamp(dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
          float rim = pow(1.0 - facing, 1.7);

          // Unattended, the pane is broken up by the icosahedral field it is cut
          // from, read at a drifting scale — so the facets churn and the thing is
          // barely a thing. Under regard the field settles onto the solid's own
          // symmetry and the facets lock, which is the moment it becomes somebody.
          vec3 folded = icosaFold(vLocal * (2.1 + sin(uSeed) * 0.4)
            + vec3(0.0, 0.0, uSeed), 3);
          float field = sdIcosahedron(folded, 0.62 + 0.18 * sin(uTime * 0.6 + uSeed));
          float churn = 0.5 + 0.5 * sin(field * 14.0 - uTime * (1.9 - uRegard * 1.6));
          float coherence = mix(0.25 + churn * 0.9, 0.9 + churn * 0.25, uRegard);

          float body = (rim * 0.78 + 0.22) * coherence;
          vec3 tint = mix(uAccent, uColor, clamp(rim + uRegard * 0.35, 0.0, 1.0));
          float lit = body * (0.55 + uRegard * 0.95);
          gl_FragColor = vec4(tint * lit, clamp(lit, 0.0, 1.0) * 0.9);
        }
      `,
    }),
  );

  const edgeMaterial = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: colorOf(options.color) },
        uAccent: { value: colorOf(options.accent) },
        uRegard: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        uniform float uRegard;
        varying vec3 vLocal;

        void main() {
          // The edges are what the player counts the faces with, so they sharpen
          // with regard rather than merely brightening.
          float run = 0.5 + 0.5 * sin(length(vLocal) * 26.0 - uTime * (1.4 + uRegard * 1.4));
          float crisp = mix(0.45 + run * 0.55, 0.85 + run * 0.4, uRegard);
          vec3 tint = mix(uAccent, uColor, 0.3 + uRegard * 0.6);
          float lit = crisp * (0.3 + uRegard * 0.9);
          gl_FragColor = vec4(tint * lit, clamp(lit, 0.0, 1.0));
        }
      `,
    }),
  );

  const r = options.radius;
  const outerGeometry = tracker.track(new DodecahedronGeometry(r, 0));
  const innerGeometry = tracker.track(new IcosahedronGeometry(r * 0.62, 0));
  const cageGeometry = tracker.track(new IcosahedronGeometry(r * 1.42, 0));

  const outer = new Group();
  outer.add(new Mesh(outerGeometry, faceMaterial));
  outer.add(new LineSegments(tracker.track(new EdgesGeometry(outerGeometry)), edgeMaterial));
  group.add(outer);

  const inner = new Group();
  inner.add(new Mesh(innerGeometry, faceMaterial));
  inner.add(new LineSegments(tracker.track(new EdgesGeometry(innerGeometry)), edgeMaterial));
  group.add(inner);

  // The cage only exists under regard.
  const cage = new LineSegments(tracker.track(new EdgesGeometry(cageGeometry)), edgeMaterial);
  group.add(cage);

  const outerAxis = new Vector3(0.3, 1, 0.2).normalize();
  const innerAxis = new Vector3(1, 0.2, -0.5).normalize();

  let regard = 0;
  let presence = 1;
  // Where the two solids had got to when regard began to lock them, so the
  // alignment eases out of wherever they were rather than snapping.
  let outerPhase = options.seed;
  let innerPhase = options.seed * 1.7;

  return {
    group,
    faceMaterial,
    edgeMaterial,
    setRegard(amount) {
      regard = Math.min(1, Math.max(0, amount));
    },
    setPresence(amount) {
      presence = Math.min(1, Math.max(0, amount));
    },
    update(elapsed) {
      setU(faceMaterial, 'uTime', elapsed);
      setU(faceMaterial, 'uRegard', regard * presence);
      setU(edgeMaterial, 'uTime', elapsed);
      setU(edgeMaterial, 'uRegard', regard * presence);

      // Regard slows the tumble to a stop. The phases stop advancing rather than
      // being overwritten, so nothing ever jumps.
      const freedom = 1 - regard;
      outerPhase += 0.33 * freedom * 0.016;
      innerPhase -= 0.47 * freedom * 0.016;
      outer.setRotationFromAxisAngle(outerAxis, outerPhase);
      // Dual alignment: under full regard the inner icosahedron's vertices sit on
      // the outer dodecahedron's face centres, which is the two solids' actual
      // relationship and reads as the thing assembling itself.
      inner.setRotationFromAxisAngle(innerAxis, innerPhase * freedom);
      inner.quaternion.slerp(outer.quaternion, regard);

      cage.setRotationFromAxisAngle(outerAxis, -outerPhase * 0.5);
      cage.scale.setScalar(0.0001 + regard * presence);
      group.scale.setScalar(0.0001 + presence);
    },
  };
}
