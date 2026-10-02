import {
  Color,
  LinearFilter,
  MathUtils,
  Matrix3,
  Mesh,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';
import type { ResourceTracker } from '../disposal';
import { setU } from './glsl';

/**
 * Raymarched fractal hyperspace, and the shifting geometric architecture in it
 * (GAME_BRIEF.md § Platform and art direction; lore bible `L-DMT-03`).
 *
 * Raymarching is the most expensive thing in this codebase and post-processing
 * stacks are already where frame rate dies (CLAUDE.md § Gotchas), so this is
 * built to a budget rather than to a resolution:
 *
 * - The field is marched into its own render target at a *fraction* of the
 *   canvas, and then shown on one full-screen quad. Cost is therefore a function
 *   of a number this module controls, not of the window the player opened.
 * - That fraction adapts to measured wall-clock frame time, starting low and
 *   climbing. A software rasteriser (the gate runs on SwiftShader) settles near
 *   the floor and still renders the scene; a real GPU climbs to the ceiling
 *   within about a second. Nothing has to detect the renderer to get this right.
 * - The march has a hard step ceiling, exits on the first hit and on leaving the
 *   far plane, and the step count and fold depth both fall with the resolution,
 *   so degrading is cheap on all three axes at once.
 * - There is exactly one extra render per frame and no extra post-processing
 *   pass. The existing bloom and grade carry the look.
 *
 * The distance estimator is a folded, self-similar box: three sorting folds give
 * octahedral symmetry (which is what makes the result read as *built* rather
 * than as organic), a per-iteration rotation that drifts with time is what makes
 * the architecture keep deciding what it is, and the fold's offset is animated
 * so the whole structure opens out over the scene.
 *
 * One more thing the estimator does on purpose: it subtracts a ball around the
 * viewer. Without it a camera that drifts inside a solid cell reports the same
 * tiny distance for every pixel and the frame goes flat — the exact failure the
 * gate's visibility check exists to catch. With it, the architecture is always
 * something seen at a distance, and there is always structure in frame.
 */

/** Hard ceilings. The shader's loops are bounded by these, not by a uniform. */
const MAX_STEPS = 48;
const MAX_ITER = 6;

/** Resolution scale bounds, as a fraction of the canvas's own pixels. */
const MIN_SCALE = 0.11;
const MAX_SCALE = 0.5;
const START_SCALE = 0.18;

/** Frame-time thresholds for adapting, in seconds. */
const TOO_SLOW = 1 / 26;
const FAST_ENOUGH = 1 / 90;

/** Frames to wait between resolution changes, so it cannot oscillate. */
const COOLDOWN_FRAMES = 12;

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
  /** 0..1 — how much regard the entities currently have. Leans the whole field in. */
  setAttention(amount: number): void;
  resize(width: number, height: number): void;
  /** What the march is actually costing, for the test API and for notes. */
  readonly budget: { width: number; height: number; steps: number; iterations: number };
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
      // attachment. On a software rasteriser that is a real saving.
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
        uOrigin: { value: new Vector3() },
        uTanHalfFov: { value: Math.tan(MathUtils.degToRad(30)) },
        uAspect: { value: viewWidth / viewHeight },
        uSteps: { value: MAX_STEPS },
        uIter: { value: 5 },
        uOpen: { value: 1.6 },
        uAttention: { value: 0 },
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
        uniform vec3 uOrigin;
        uniform float uTanHalfFov;
        uniform float uAspect;
        uniform int uSteps;
        uniform int uIter;
        uniform float uOpen;
        uniform float uAttention;
        uniform vec3 uDeep;
        uniform vec3 uAccent;
        uniform vec3 uGlow;

        varying vec2 vUv;

        const int MAX_STEPS = ${String(MAX_STEPS)};
        const int MAX_ITER = ${String(MAX_ITER)};
        const float FAR = 22.0;
        const float FOLD_SCALE = 1.86;
        /** Size of the repeating cell the architecture is built in. */
        const vec3 CELL = vec3(5.0);

        mat2 spin(float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c);
        }

        /**
         * Distance to the architecture, and an orbit trap.
         *
         * x: a conservative lower bound on the distance from \`rel\` (a point
         *    relative to the viewer) to the nearest surface.
         * y: how close the folded point came to the origin, which is what the
         *    colour of the structure is read from.
         */
        vec2 architecture(vec3 rel) {
          // The field is anchored in world space, so drifting through it moves
          // the viewer through a structure that is there rather than one that
          // follows the camera.
          vec3 p = rel + uOrigin;

          // Domain repetition, and it earns its three operations three times
          // over. A camera that drifts for two minutes never arrives somewhere
          // emptier than it started; the march's cost stays flat, because the
          // nearest surface is always about as near; and the frame can never run
          // out of structure to show. The fold below opens with abs(), so the
          // cell is symmetric about its own centre and the tiling is continuous
          // across every boundary rather than cut at it.
          p = mod(p + CELL * 0.5, CELL) - CELL * 0.5;

          float scale = 1.0;
          float trap = 1e6;

          for (int i = 0; i < MAX_ITER; i++) {
            if (i >= uIter) break;
            p = abs(p);
            // Sorting folds. Three comparisons give octahedral symmetry, which
            // is the difference between architecture and weather.
            if (p.x < p.y) p.xy = p.yx;
            if (p.x < p.z) p.xz = p.zx;
            if (p.y < p.z) p.yz = p.zy;
            // Drifting rotation per iteration: the structure never settles.
            p.xz *= spin(0.21 + uTime * 0.031 + float(i) * 0.37);
            p = p * FOLD_SCALE - vec3(1.21, 0.78, 1.21) * (FOLD_SCALE - 1.0);
            scale *= FOLD_SCALE;
            trap = min(trap, length(p));
          }

          vec3 q = abs(p) - vec3(0.78, 1.22, 0.78);
          float box = min(max(q.x, max(q.y, q.z)), 0.0) + length(max(q, vec3(0.0)));
          // Hollowed out. A shell rather than a solid is what makes this read as
          // members and openings — built space with corridors to see down —
          // rather than as a quarry of blocks. It also keeps the fold count low
          // enough that the march can cross a cell inside its step budget,
          // which the solid version could not: its surfaces were so fine that
          // nearly every ray ran out of steps before it reached one, and the
          // frame came back a soft gradient with no architecture in it at all.
          float d = abs(box / scale) - 0.014;

          // Carve a void around the viewer. Intersecting with the outside of a
          // ball keeps the estimate conservative, guarantees the march has
          // somewhere to start, and guarantees the structure is always seen
          // from outside it — so the frame can never collapse to one value.
          return vec2(max(d, uOpen - length(rel)), trap);
        }

        void main() {
          vec2 ndc = vUv * 2.0 - 1.0;
          vec3 ray = normalize(uBasis * vec3(ndc.x * uAspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));

          float t = uOpen * 0.85;
          float trap = 0.0;
          float glowAcc = 0.0;
          float hit = 0.0;
          float used = 0.0;

          for (int i = 0; i < MAX_STEPS; i++) {
            if (i >= uSteps) break;
            vec2 field = architecture(ray * t);
            float d = field.x;
            trap = field.y;
            // Proximity light. Every step pays a little for passing close to a
            // surface, which is what keeps the volume between the walls alive
            // and what gives a ray that never hits anything something to say.
            glowAcc += exp(-d * 7.0);
            used += 1.0;
            if (d < 0.0016 + t * 0.002) {
              hit = 1.0;
              break;
            }
            // Relaxed a little harder than usual, because domain repetition
            // makes the estimate slightly optimistic near a cell boundary.
            t += max(0.006, d * 0.72);
            if (t > FAR) break;
          }

          float depth = clamp(t / FAR, 0.0, 1.0);
          float facet = clamp(trap * 0.6, 0.0, 1.0);
          float density = clamp(glowAcc * 0.075, 0.0, 1.8);

          // The field the structure stands in. Direction-dependent, so a ray
          // that reaches nothing still lands on something graded.
          vec3 color = mix(uDeep * 0.6, uDeep * 1.5, 0.5 + 0.5 * ray.y);
          color += uAccent * 0.2 * pow(max(0.0, 1.0 - abs(ray.y)), 3.0);

          // The architecture: tinted by the trap, and holding most of its colour
          // a long way back, so the corridors read as deep rather than fogged.
          vec3 surface = mix(uAccent, uGlow, facet);
          color = mix(color, surface * (0.45 + 0.9 * (1.0 - depth * 0.55)), hit * 0.92);

          // The volume between surfaces.
          color += surface * density * 0.26 * (1.0 - depth * 0.45);

          // Step count is highest where a ray grazes a surface, which is exactly
          // the silhouette — so this is a free edge light along every form.
          float graze = used / max(1.0, float(uSteps));
          color += uGlow * pow(graze, 2.0) * 0.4;

          // Regard. When an entity is attending to the player the whole place
          // leans in slightly, which is the cheapest way to say it is aware.
          color *= 1.0 + uAttention * 0.22;
          color += uGlow * uAttention * 0.045;

          // A saturating curve. It is what keeps the render target off its
          // ceiling — the architecture's near faces would otherwise clip, and
          // the edges the eye reads the structure from are the first thing lost
          // when they do — and it leaves the grade downstream headroom to work.
          color = color / (1.0 + color * 0.38);
          gl_FragColor = vec4(color, 1.0);
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
        varying vec2 vUv;

        void main() {
          vec3 color = texture2D(tMap, vUv).rgb;
          // The march runs below the canvas's resolution to stay inside the
          // frame budget, so a fine interference pattern is laid over it at full
          // resolution. It restores high-frequency detail the upscale cannot
          // carry, and in this register it reads as the shimmer the place wants.
          float weave = sin(vUv.x * 158.0 + uTime * 0.6) * sin(vUv.y * 139.0 - uTime * 0.44);
          gl_FragColor = vec4(max(color * (1.0 + weave * uDetail), vec3(0.0)), 1.0);
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

  let steps = MAX_STEPS;
  let iterations = 5;
  let ema = 1 / 60;
  let framesSeen = 0;
  let cooldown = COOLDOWN_FRAMES;

  function applyScale(): void {
    const width = Math.max(48, Math.round(viewWidth * scale));
    const height = Math.max(32, Math.round(viewHeight * scale));
    target.setSize(width, height);
    // Step count and fold depth fall with the resolution, so a machine that
    // cannot afford the pixels is not asked to afford the march either.
    const span = (scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE);
    steps = Math.round(MathUtils.lerp(22, MAX_STEPS, MathUtils.clamp(span, 0, 1)));
    iterations = scale < 0.2 ? 4 : 5;
    setU(marchMaterial, 'uSteps', steps);
    setU(marchMaterial, 'uIter', iterations);
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
      setU(marchMaterial, 'uBasis', basis);
      setU(marchMaterial, 'uOrigin', camera.getWorldPosition(origin));
      setU(marchMaterial, 'uTanHalfFov', Math.tan(MathUtils.degToRad(camera.fov) * 0.5));
      setU(marchMaterial, 'uAspect', camera.aspect);
      setU(marchMaterial, 'uTime', elapsed);
      setU(backdropMaterial, 'uTime', elapsed);

      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(marchScene, camera);
      renderer.setRenderTarget(previous);
    },
    setOpen(radius) {
      setU(marchMaterial, 'uOpen', Math.max(0.2, radius));
    },
    setAttention(amount) {
      setU(marchMaterial, 'uAttention', MathUtils.clamp(amount, 0, 1));
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
      };
    },
  };
}
