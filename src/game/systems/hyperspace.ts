import {
  Color,
  LinearFilter,
  MathUtils,
  Matrix3,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';
import type { ResourceTracker } from '../disposal';
import { setU } from './glsl';
import { SACRED_COMMON, SACRED_FIGURES, SACRED_SOLIDS } from './sacred-geometry';

/**
 * The raymarched field behind the veil, and the shifting geometric architecture
 * in it (GAME_BRIEF.md § Platform and art direction; lore bible `L-DMT-03`).
 *
 * What the field is made of, and why each piece is here:
 *
 * - **Exact icosahedral symmetry, by golden-ratio plane folds.** Every point is
 *   folded into the fundamental domain of the icosahedral group before anything
 *   is measured, so the whole field is exactly symmetric under all six of the
 *   icosahedron's five-fold axes. Five-fold symmetry is the one a lattice cannot
 *   have, which is why it reads as constructed rather than as repeated. See
 *   `icosaFold` in `sacred-geometry.ts` for the derivation and for the numerical
 *   check that the projection really is exact.
 * - **A kaleidoscopic IFS** on top of that: one golden mirror, a drifting
 *   rotation, a scale and an offset per iteration, with a dodecahedral shell as
 *   the terminal — so the architecture's members are pentagonal and self-similar
 *   at every scale, and never stop deciding what they are.
 * - **The five Platonic solids as objects, unfolded.** Folded space reads as
 *   pattern however well built it is; a solid the player can count the faces of
 *   reads as a solid. So a second, *unfolded* term stands one solid in every
 *   chamber of the lattice, morphing through tetrahedron, cube, octahedron,
 *   dodecahedron and icosahedron in order — and because the morph is a mix of
 *   two distance fields, the solid genuinely deforms into the next one.
 * - **Nested and interpenetrating forms** around it: the current solid's dual as
 *   a cage around it (vertices on face centres — the two solids' real
 *   relationship), a torus threading the pair, a vesica piscis lens cut by two
 *   spheres each passing through the other's centre, and the Seed of Life, seven
 *   interpenetrating spherical shells on a triangular lattice at equal radius.
 * - **A symmetry that turns to face you.** As the entities' regard rises, the
 *   fold's frame rotates until one of its five-fold axes points down the
 *   player's line of sight, so looking at them is answered by the whole place
 *   aligning its symmetry on the player. That is the field's half of
 *   `L-DMT-03`: not a creature noticing you, a structure reorganising around you.
 *
 * Cost (CLAUDE.md § Gotchas: post-processing stacks are where frame rate dies,
 * and so is a march):
 *
 * - The field is marched into its own render target at a *fraction* of the
 *   canvas and then shown on one full-screen quad. Cost is a function of a
 *   number this module controls, not of the window the player opened.
 * - That fraction adapts to measured wall-clock frame time, starting low and
 *   climbing, and the step count, the fold depth, the number of symmetry sweeps
 *   and the Flower of Life's ring count all fall with it. Degrading is cheap on
 *   five axes at once, and a software rasteriser settles near the floor and still
 *   renders the scene.
 * - Every loop in the shader is bounded by a compile-time constant with an
 *   `if (i >= uN) break;` inside it, so a uniform can only ever make the march
 *   cheaper than the ceiling.
 * - There is exactly one extra render per frame and **no** extra post-processing
 *   pass. The composite that shows the march is the one that was always there.
 * - The composite draws the plane-curve figures — the Flower of Life, nested
 *   inverted triangles, crossed vesicas, a golden-ratio series of circles — in
 *   *ray* space at full canvas resolution, for almost nothing, and the march's
 *   own depth occludes them. That is what lets the march itself run at a low
 *   resolution without the geometry going soft: the crisp, legible, countable
 *   part of the construction is drawn by a 2D field, and only the volume is
 *   marched.
 *
 * One thing the estimator does on purpose: it subtracts a ball around the
 * viewer. Without it a camera that drifts inside a solid cell reports the same
 * tiny distance for every pixel and the frame goes flat — the exact failure the
 * gate's visibility check exists to catch. With it, the architecture is always
 * something seen at a distance, and there is always structure in frame.
 */

/** Hard ceilings. The shader's loops are bounded by these, not by a uniform. */
const MAX_STEPS = 48;
const MAX_ITER = 4;
const MAX_SWEEPS = 5;

/** Resolution scale bounds, as a fraction of the canvas's own pixels. */
const MIN_SCALE = 0.15;
const MAX_SCALE = 0.5;
const START_SCALE = 0.18;

/** Frame-time thresholds for adapting, in seconds. */
const TOO_SLOW = 1 / 26;
const FAST_ENOUGH = 1 / 90;

/** Frames to wait between resolution changes, so it cannot oscillate. */
const COOLDOWN_FRAMES = 12;

/** The five solids, in the order the procession walks them. */
const SOLID_COUNT = 5;
/** Each solid's dual: cube and octahedron, dodecahedron and icosahedron, tetrahedron itself. */
const DUAL_OF: readonly number[] = [0, 2, 1, 4, 3];

/**
 * The five-fold axis the field aligns on when it is attending to the player: an
 * icosahedron vertex direction, which is a five-fold axis of the fold's group.
 */
const FIVE_FOLD_AXIS = new Vector3(0, 1, (1 + Math.sqrt(5)) / 2).normalize();

export interface HyperspaceField {
  /** The full-screen quad that shows the field. Add it to the scene. */
  readonly backdrop: Mesh;
  /** The march's own material, for the uniforms a scene drives. */
  readonly material: ShaderMaterial;
  /**
   * March the field and adapt the budget. Call once per frame, before the scene
   * is rendered.
   *
   * `frameSeconds` must be real wall-clock time between frames, not the loop's
   * clamped animation delta — a clamped delta reads a two-second frame as a
   * tenth of a second, and the resolution would then never come down.
   */
  render(camera: PerspectiveCamera, elapsed: number, frameSeconds: number): void;
  /** How far the architecture has opened out. Also the radius of the viewer's void. */
  setOpen(radius: number): void;
  /** 0..1 — how much regard the entities currently have. Turns the symmetry to face the player. */
  setAttention(amount: number): void;
  /**
   * Where the procession of Platonic solids has got to, in solids. The integer
   * part picks the solid, the fraction morphs it into the next one, and it wraps,
   * so a scene can simply hand it a rising number.
   */
  setProcession(position: number): void;
  /** How large the solids standing in each chamber are, 0..1. */
  setCongregation(amount: number): void;
  resize(width: number, height: number): void;
  /** What the march is actually costing, for the test API and for notes. */
  readonly budget: {
    width: number;
    height: number;
    steps: number;
    iterations: number;
    sweeps: number;
    rings: number;
  };
}

export function hyperspaceField(
  tracker: ResourceTracker,
  options: {
    renderer: WebGLRenderer;
    width: number;
    height: number;
    /** The field the structure stands in. */
    deep: number;
    /** The structure's own colour at its edges. */
    accent: number;
    /** The light inside it. */
    glow: number;
  },
): HyperspaceField {
  const { renderer } = options;

  let viewWidth = Math.max(1, options.width);
  let viewHeight = Math.max(1, options.height);
  let scale = START_SCALE;

  const target = tracker.track(
    new WebGLRenderTarget(1, 1, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      // Nothing is depth-sorted inside the march, so the target needs no depth
      // attachment. On a software rasteriser that is a real saving. The march's
      // own depth travels in the alpha channel instead, which costs nothing and
      // is what lets the composite occlude the full-resolution figures.
      depthBuffer: false,
      stencilBuffer: false,
    }),
  );

  const marchMaterial = tracker.track(
    new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uBasis: { value: new Matrix3() },
        uFacing: { value: new Matrix3() },
        uOrigin: { value: new Vector3() },
        uTanHalfFov: { value: Math.tan(MathUtils.degToRad(30)) },
        uAspect: { value: viewWidth / viewHeight },
        uSteps: { value: MAX_STEPS },
        uIter: { value: MAX_ITER },
        uSweeps: { value: MAX_SWEEPS },
        uRings: { value: 2 },
        uOpen: { value: 1.6 },
        uAttention: { value: 0 },
        uKindA: { value: 3 },
        uKindB: { value: 4 },
        uDual: { value: 4 },
        uMorph: { value: 0 },
        uCongregation: { value: 1 },
        uDeep: { value: new Color(options.deep) },
        uAccent: { value: new Color(options.accent) },
        uGlow: { value: new Color(options.glow) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // The quad is unit-sized and drawn straight in clip space, so the
          // march never depends on a camera, a transform or a frustum test.
          gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform mat3 uBasis;
        uniform mat3 uFacing;
        uniform vec3 uOrigin;
        uniform float uTanHalfFov;
        uniform float uAspect;
        uniform int uSteps;
        uniform int uIter;
        uniform int uSweeps;
        uniform int uRings;
        uniform float uOpen;
        uniform float uAttention;
        uniform int uKindA;
        uniform int uKindB;
        uniform int uDual;
        uniform float uMorph;
        uniform float uCongregation;
        uniform vec3 uDeep;
        uniform vec3 uAccent;
        uniform vec3 uGlow;

        varying vec2 vUv;

        ${SACRED_COMMON}
        ${SACRED_SOLIDS}

        const int MAX_STEPS = ${String(MAX_STEPS)};
        const int MAX_ITER = ${String(MAX_ITER)};
        /** Near enough that a chamber fills the frame; far enough to see down a corridor. */
        const float FAR = 17.0;
        const float FOLD_SCALE = 1.78;
        /** Size of the repeating chamber the architecture is built in. */
        const vec3 CELL = vec3(5.0);
        /**
         * The IFS offset, pointed along the centroid of the fold's fundamental
         * domain — which is where the folded points actually are, so the
         * structure is built where there is something to build on.
         */
        const vec3 IFS_OFFSET = vec3(0.21, 0.37, 1.16);

        mat2 spin(float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c);
        }

        /**
         * One solid standing in the chamber, and the forms nested through it.
         *
         * Deliberately *not* folded. The fold gives the place its symmetry, but a
         * folded solid is a pattern; an unfolded dodecahedron with twelve
         * pentagons on it is a dodecahedron. This is the term the player can
         * name, and the one the procession morphs.
         *
         * Thicknesses are generous on purpose. The previous version of this
         * march built its surfaces so fine that nearly every ray ran out of steps
         * before it reached one, and the frame came back as a soft gradient with
         * no architecture in it. A surface that cannot be hit is not geometry.
         */
        float congregation(vec3 s, float r) {
          // The solid itself: filled, so it has a silhouette to be recognised by,
          // and morphing between two of the five by mixing their fields. Both
          // fields are 1-Lipschitz, so the mix is too, and the march stays safe.
          float core = mix(sdPlatonic(s, uKindA, r), sdPlatonic(s, uKindB, r), uMorph);

          // Its dual, as a cage around it: the solid whose vertices sit on the
          // first one's face centres. Shelled, so the solid inside stays visible
          // through it.
          float cage = shell(sdPlatonic(s, uDual, r * 1.52), 0.042);

          // A torus threading the pair, tilted off the solid's axes so it reads
          // as going *through* rather than as sitting around.
          vec3 t = s;
          t.yz = spin(0.62) * t.yz;
          float thread = sdTorus(t, r * 1.95, 0.05);

          // The vesica piscis across it.
          float lens = shell(sdVesica(s, r * 1.25, vec3(0.0, 1.0, 0.0)), 0.04);

          // The Seed of Life: seven spherical shells on a triangular lattice at
          // equal radius, so each passes through its neighbours' centres.
          float seed = sdFlowerOfLife(s, r * 0.92, 0.038, uRings);

          return min(min(min(core, cage), min(thread, lens)), seed);
        }

        /**
         * Distance to the field, and what was found.
         *
         * x: a conservative lower bound on the distance from \`rel\` (a point
         *    relative to the viewer) to the nearest surface.
         * y: how close the folded point came to the origin — the orbit trap the
         *    architecture's colour is read from.
         * z: 1 where the nearest thing is one of the standing solids, 0 where it
         *    is the folded architecture, so the two can be lit differently.
         */
        vec3 field(vec3 rel) {
          // Anchored in world space, so drifting through it moves the viewer
          // through a structure that is there rather than one that follows the
          // camera.
          vec3 world = rel + uOrigin;

          // Domain repetition into chambers. A camera that drifts for two minutes
          // never arrives somewhere emptier than it started; the march's cost
          // stays flat, because the nearest surface is always about as near; and
          // the frame can never run out of structure to show.
          vec3 cell = mod(world + CELL * 0.5, CELL) - CELL * 0.5;

          // The frame the symmetry is measured in. At rest this is the identity;
          // under the entities' regard it turns until a five-fold axis points
          // down the player's line of sight.
          vec3 aimed = uFacing * cell;

          // --- the solids ----------------------------------------------------
          float solids = congregation(aimed, 0.30 + uCongregation * 0.32);

          // --- the folded architecture ---------------------------------------
          // Exact icosahedral fold first: everything past this line is exactly
          // five-fold symmetric about all six of the icosahedron's axes.
          vec3 p = icosaFold(aimed, uSweeps);

          float scale = 1.0;
          float trap = 1e6;

          for (int i = 0; i < MAX_ITER; i++) {
            if (i >= uIter) break;
            // One golden mirror per iteration, which is what carries the
            // icosahedral symmetry down into every scale of the self-similarity
            // rather than only into the largest.
            p.xy = abs(p.xy);
            p -= 2.0 * min(0.0, dot(p, ICO_MIRROR)) * ICO_MIRROR;
            // Drifting rotation per iteration: the structure never settles.
            p.xz *= spin(0.21 + uTime * 0.031 + float(i) * 0.37);
            p = p * FOLD_SCALE - IFS_OFFSET * (FOLD_SCALE - 1.0);
            scale *= FOLD_SCALE;
            trap = min(trap, length(p));
          }

          // A dodecahedral shell as the terminal, so the architecture's members
          // are pentagonal at every scale. Hollow rather than solid: a shell is
          // what makes this read as members and openings — built space with
          // corridors to see down — rather than as a quarry of blocks.
          float arch = abs(sdDodecahedron(p, 1.06) / scale) - 0.022;

          float d = min(arch, solids);
          // Carve a void around the viewer. Intersecting with the outside of a
          // ball keeps the estimate conservative, guarantees the march has
          // somewhere to start, and guarantees the structure is always seen from
          // outside it — so the frame can never collapse to one value.
          return vec3(max(d, uOpen - length(rel)), trap, solids < arch ? 1.0 : 0.0);
        }

        /**
         * The surface normal, by the tetrahedron trick: four samples of the
         * field around the hit point, which is four extra evaluations per *pixel*
         * rather than per step — about a twentieth of what the march itself
         * costs, and the single thing that makes a dodecahedron read as a
         * dodecahedron. Without it a filled solid is one flat colour and the
         * player sees a blob; with it, every face is lit by its own orientation
         * and the faces can be counted.
         */
        vec3 surfaceNormal(vec3 rel) {
          const vec2 e = vec2(1.0, -1.0) * 0.0035;
          return normalize(
            e.xyy * field(rel + e.xyy).x +
            e.yyx * field(rel + e.yyx).x +
            e.yxy * field(rel + e.yxy).x +
            e.xxx * field(rel + e.xxx).x);
        }

        void main() {
          vec2 ndc = vUv * 2.0 - 1.0;
          vec3 ray = normalize(uBasis * vec3(ndc.x * uAspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));

          float t = uOpen * 0.85;
          float trap = 0.0;
          float kind = 0.0;
          float glowAcc = 0.0;
          float hit = 0.0;
          float used = 0.0;
          float closest = 1e6;

          for (int i = 0; i < MAX_STEPS; i++) {
            if (i >= uSteps) break;
            vec3 found = field(ray * t);
            float d = found.x;
            trap = found.y;
            kind = found.z;
            // Proximity light. Every step pays a little for passing close to a
            // surface, which is what keeps the volume between the walls alive and
            // what gives a ray that never hits anything something to say.
            glowAcc += exp(-d * 7.0);
            used += 1.0;
            // How near this ray came to a surface, in units of how far out it
            // was when it got there — an angular miss distance. The march runs
            // well below the canvas's resolution, so a hard hit/miss decision
            // magnifies into staircases; a ray that nearly grazed an edge gets
            // partial coverage instead, and the silhouette survives the upscale.
            closest = min(closest, d / max(t, 0.001));
            if (d < 0.0016 + t * 0.002) {
              hit = 1.0;
              break;
            }
            // Relaxed a little harder than usual, because domain repetition makes
            // the estimate slightly optimistic near a chamber boundary.
            t += max(0.006, d * 0.72);
            if (t > FAR) break;
          }

          float depth = clamp(t / FAR, 0.0, 1.0);
          float facet = clamp(trap * 0.6, 0.0, 1.0);
          // Averaged over the steps actually taken, not summed over them. A sum
          // makes the whole frame brighter whenever the step budget rises, so the
          // picture would have changed every time the resolution adapted — a
          // scene that brightens because the machine got faster is a bug, and a
          // flickering one while the controller settles.
          float density = clamp(glowAcc / max(1.0, float(uSteps)) * 1.5, 0.0, 1.0);

          // The field the structure stands in. Direction-dependent, so a ray that
          // reaches nothing still lands on something graded.
          vec3 color = mix(uDeep * 0.4, uDeep * 0.95, 0.5 + 0.5 * ray.y);
          color += uAccent * 0.12 * pow(max(0.0, 1.0 - abs(ray.y)), 3.0);

          // Partial coverage for a ray that grazed without hitting, so an edge
          // is an edge and not a flight of steps.
          float coverage = max(hit, 1.0 - smoothstep(0.0, 0.009, closest));

          // The architecture is tinted by the trap; the standing solids are lit
          // by the glow instead, so a solid resolving out of the field reads as a
          // different kind of thing from the field it is standing in.
          vec3 structure = mix(uAccent, uGlow, facet * 0.7);
          vec3 object = mix(uGlow, uAccent, facet * 0.35) * 0.92;
          vec3 surface = mix(structure, object, kind);

          if (hit > 0.5) {
            // One fixed key direction — there is no sun here, and a moving light
            // would fight the geometry for the player's attention. What the key
            // is for is to separate the faces of a solid from one another.
            vec3 normal = surfaceNormal(ray * t);
            float key = clamp(dot(normal, vec3(0.3713906, 0.7427814, 0.5570860)), 0.0, 1.0);
            float grazing = pow(1.0 - clamp(dot(normal, -ray), 0.0, 1.0), 3.0);
            surface *= 0.3 + key * key * 1.05 + grazing * 0.55;
          }

          color = mix(color, surface * (0.17 + 0.42 * (1.0 - depth * 0.6)), coverage * 0.92);

          // The volume between surfaces. Held well down: with this much geometry
          // in the field almost every ray passes close to something, so a
          // generous proximity term turns the whole frame into one flat wash.
          color += structure * density * 0.085 * (1.0 - depth * 0.6);

          // Step count is highest where a ray grazes a surface, which is exactly
          // the silhouette — so this is a free edge light along every form.
          // Normalised by the budget for the same reason the density is: this has
          // to say the same thing at 20 steps as at 48.
          float graze = used / max(1.0, float(uSteps));
          color += uGlow * pow(graze, 3.0) * 0.1;

          // Regard. When an entity is attending to the player the whole place
          // leans in slightly, which is the cheapest way to say it is aware.
          color *= 1.0 + uAttention * 0.16;
          color += uGlow * uAttention * 0.035;

          // A saturating curve. It is what keeps the render target off its
          // ceiling — the architecture's near faces would otherwise clip, and the
          // edges the eye reads the structure from are the first thing lost when
          // they do — and it leaves the grade downstream headroom to work.
          color = color / (1.0 + color * 0.45);
          // Depth travels in alpha, so the composite can hide the
          // full-resolution figures behind whatever the march found. A ray that
          // hit nothing reports the far plane, which lets the figures through.
          gl_FragColor = vec4(color, hit > 0.5 ? depth : 1.0);
        }
      `,
    }),
  );

  // The march has its own one-object scene. Cheaper and far less surprising
  // than borrowing the game's scene and hiding everything in it.
  const marchScene = new Scene();
  const quadGeometry = tracker.track(new PlaneGeometry(1, 1));
  const marchQuad = new Mesh(quadGeometry, marchMaterial);
  marchQuad.frustumCulled = false;
  marchScene.add(marchQuad);
  // Drawn straight in clip space by the vertex shader, so the camera handed to
  // `renderer.render` is never consulted. Reuse the game's.

  const backdropMaterial = tracker.track(
    new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tMap: { value: target.texture },
        uTime: { value: 0 },
        uDetail: { value: 0.07 },
        uBasis: { value: new Matrix3() },
        uTanHalfFov: { value: Math.tan(MathUtils.degToRad(30)) },
        uAspect: { value: viewWidth / viewHeight },
        uFigure: { value: 0.75 },
        uAttention: { value: 0 },
        uAccent: { value: new Color(options.accent) },
        uGlow: { value: new Color(options.glow) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tMap;
        uniform float uTime;
        uniform float uDetail;
        uniform mat3 uBasis;
        uniform float uTanHalfFov;
        uniform float uAspect;
        uniform float uFigure;
        uniform float uAttention;
        uniform vec3 uAccent;
        uniform vec3 uGlow;
        varying vec2 vUv;

        ${SACRED_COMMON}
        ${SACRED_FIGURES}

        void main() {
          vec4 marched = texture2D(tMap, vUv);
          vec3 color = marched.rgb;

          // The march runs below the canvas's resolution to stay inside the frame
          // budget, so a fine interference pattern is laid over it at full
          // resolution. It restores high-frequency detail the upscale cannot
          // carry, and in this register it reads as the shimmer the place wants.
          float weave = sin(vUv.x * 158.0 + uTime * 0.6) * sin(vUv.y * 139.0 - uTime * 0.44);
          color = max(color * (1.0 + weave * uDetail), vec3(0.0));

          // The construction, drawn in *ray* space at the canvas's own
          // resolution. Plane curves cost almost nothing, so this is where the
          // crisp, countable, legible part of the geometry lives: the Flower of
          // Life, nested inverted triangles, crossed vesicas and a golden-ratio
          // series of circles, all under a five-fold kaleidoscope.
          //
          // Ray space, not screen space: the figure is parameterised by the
          // direction the pixel looks in, so it turns with the camera and sits
          // out there in the architecture rather than on the glass.
          //
          // Hidden behind whatever the march actually found, so the figure is
          // seen down the corridors rather than painted over the walls. A ray
          // that hit nothing carries depth 1 and lets it all through — and
          // testing that *first* is also what keeps this affordable, because
          // every pixel that looked straight into a wall skips the figure
          // entirely instead of drawing it and then multiplying it away.
          float through = uFigure > 0.0 ? smoothstep(0.2, 0.68, marched.a) : 0.0;
          if (through > 0.004) {
            vec2 ndc = vUv * 2.0 - 1.0;
            vec3 ray = normalize(uBasis * vec3(ndc.x * uAspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));
            // Gnomonic projection of the ray onto the plane it is pointing at:
            // the figure is a construction on a surface a long way off, so it
            // keeps its proportions in the middle of the frame and stretches at
            // the edges the way a real wall would.
            vec2 plane = ray.xy / max(0.35, abs(ray.z));

            float breath = 0.5 + 0.5 * sin(uTime * 0.29);
            float cover = sacredFigure(plane * 0.62, uTime, breath, 1.0);

            vec3 tint = mix(uAccent, uGlow, 0.3 + breath * 0.5);
            color += tint * cover * uFigure * through * (0.11 + uAttention * 0.08);
          }

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );

  const backdrop = new Mesh(tracker.track(new PlaneGeometry(1, 1)), backdropMaterial);
  backdrop.frustumCulled = false;
  // It is the world behind everything. Drawn first, and never depth-tested, so
  // every entity, mote and glow in the scene composites in front of it.
  backdrop.renderOrder = -20;

  const basis = new Matrix3();
  const origin = new Vector3();
  const facing = new Matrix3();
  const facingMatrix = new Matrix4();
  const facingTurn = new Quaternion();
  const identityTurn = new Quaternion();
  const forward = new Vector3();

  let steps = MAX_STEPS;
  let iterations = MAX_ITER;
  let sweeps = MAX_SWEEPS;
  let rings = 2;
  let attention = 0;
  let ema = 1 / 60;
  let framesSeen = 0;
  let cooldown = COOLDOWN_FRAMES;

  function applyScale(): void {
    const width = Math.max(48, Math.round(viewWidth * scale));
    const height = Math.max(32, Math.round(viewHeight * scale));
    target.setSize(width, height);
    // Step count, fold depth, symmetry sweeps and the Flower of Life's ring
    // count all fall with the resolution, so a machine that cannot afford the
    // pixels is not asked to afford the march either. The symmetry degrades last
    // and least: at three sweeps the fold is no longer an exact projection into
    // the fundamental domain, but it is still unmistakeably five-fold, and
    // losing the symmetry would lose the whole point of the scene.
    const span = MathUtils.clamp((scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE), 0, 1);
    steps = Math.round(MathUtils.lerp(18, MAX_STEPS, span));
    iterations = scale < 0.2 ? 3 : MAX_ITER;
    sweeps = scale < 0.17 ? 3 : scale < 0.24 ? 4 : MAX_SWEEPS;
    rings = scale < 0.17 ? 1 : 2;
    setU(marchMaterial, 'uSteps', steps);
    setU(marchMaterial, 'uIter', iterations);
    setU(marchMaterial, 'uSweeps', sweeps);
    setU(marchMaterial, 'uRings', rings);
  }

  applyScale();

  return {
    backdrop,
    material: marchMaterial,
    render(camera, elapsed, frameSeconds) {
      // Adapt before marching, so a slow frame is paid for by the next one.
      framesSeen += 1;
      if (framesSeen > 3 && frameSeconds > 0 && frameSeconds < 10) {
        ema += (frameSeconds - ema) * 0.3;
        if (cooldown > 0) {
          cooldown -= 1;
        } else if (ema > TOO_SLOW && scale > MIN_SCALE) {
          scale = Math.max(MIN_SCALE, scale * 0.62);
          applyScale();
          cooldown = COOLDOWN_FRAMES;
          ema = 1 / 60;
        } else if (ema < FAST_ENOUGH && scale < MAX_SCALE) {
          scale = Math.min(MAX_SCALE, scale * 1.3);
          applyScale();
          cooldown = COOLDOWN_FRAMES;
          ema = 1 / 60;
        }
      }

      // The rig moves the camera after a scene's update, so this reads the
      // orientation the player had on the previous frame. One frame of lag is
      // invisible in a drifting shot and costs nothing to be sure of.
      camera.updateMatrixWorld();
      basis.setFromMatrix4(camera.matrixWorld);

      // The symmetry that turns to face the player. `uFacing` is the rotation
      // that takes the player's line of sight onto one of the fold's five-fold
      // axes, eased in by how much regard the entities currently have — so at
      // rest the field is where it was, and under full attention the player is
      // looking straight down a five-fold axis of the whole place.
      camera.getWorldDirection(forward);
      facingTurn.setFromUnitVectors(forward, FIVE_FOLD_AXIS);
      facingTurn.slerp(identityTurn, 1 - attention);
      facingMatrix.makeRotationFromQuaternion(facingTurn);
      facing.setFromMatrix4(facingMatrix);

      const tanHalfFov = Math.tan(MathUtils.degToRad(camera.fov) * 0.5);
      setU(marchMaterial, 'uBasis', basis);
      setU(marchMaterial, 'uFacing', facing);
      setU(marchMaterial, 'uOrigin', camera.getWorldPosition(origin));
      setU(marchMaterial, 'uTanHalfFov', tanHalfFov);
      setU(marchMaterial, 'uAspect', camera.aspect);
      setU(marchMaterial, 'uTime', elapsed);
      setU(backdropMaterial, 'uTime', elapsed);
      setU(backdropMaterial, 'uBasis', basis);
      setU(backdropMaterial, 'uTanHalfFov', tanHalfFov);
      setU(backdropMaterial, 'uAspect', camera.aspect);

      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(marchScene, camera);
      renderer.setRenderTarget(previous);
    },
    setOpen(radius) {
      setU(marchMaterial, 'uOpen', Math.max(0.2, radius));
    },
    setAttention(amount) {
      attention = MathUtils.clamp(amount, 0, 1);
      setU(marchMaterial, 'uAttention', attention);
      setU(backdropMaterial, 'uAttention', attention);
    },
    setProcession(position) {
      // Wrapped in JavaScript rather than in GLSL: integer arithmetic on a
      // uniform is the kind of thing that compiles everywhere and means
      // something different on one driver.
      const wrapped = ((position % SOLID_COUNT) + SOLID_COUNT) % SOLID_COUNT;
      const kindA = Math.floor(wrapped);
      const kindB = (kindA + 1) % SOLID_COUNT;
      setU(marchMaterial, 'uKindA', kindA);
      setU(marchMaterial, 'uKindB', kindB);
      // The dual of whichever solid is currently the stronger of the two, so the
      // cage around the solid is always that solid's own dual.
      const morph = wrapped - kindA;
      setU(marchMaterial, 'uMorph', morph);
      setU(marchMaterial, 'uDual', DUAL_OF[morph < 0.5 ? kindA : kindB] ?? 4);
    },
    setCongregation(amount) {
      setU(marchMaterial, 'uCongregation', MathUtils.clamp(amount, 0, 1));
    },
    resize(width, height) {
      viewWidth = Math.max(1, width);
      viewHeight = Math.max(1, height);
      applyScale();
    },
    get budget() {
      return {
        width: target.width,
        height: target.height,
        steps,
        iterations,
        sweeps,
        rings,
      };
    },
  };
}
