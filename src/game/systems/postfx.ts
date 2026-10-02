import {
  HalfFloatType,
  Vector2,
  WebGLRenderTarget,
  type IUniform,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { ResourceTracker } from '../disposal';
import { GRADE, NOISE } from './glsl';

/**
 * The post-processing pipeline.
 *
 * Post-processing is a tool, not wallpaper (GAME_BRIEF.md § Platform and art
 * direction), and post-processing stacks are where frame rate dies
 * (CLAUDE.md § Gotchas). So this is deliberately only two passes beyond the
 * render: one bloom, and one combined grade pass that does drain, chromatic
 * aberration, barrel distortion, vignette, grain and tonemap in a single
 * fragment shader rather than as five separate full-screen passes.
 *
 * Every parameter is a uniform a scene drives per frame, which is what lets the
 * same pipeline carry a drab kitchen and an overwhelming Light.
 */

export interface GradeSettings {
  /** Pull toward monochrome. 0..1 */
  drain: number;
  /** Lateral RGB separation, in screen widths. 0 = off. */
  aberration: number;
  /** Barrel/pincushion. Positive bulges outward. */
  distortion: number;
  /** Corner darkening. 0..1 */
  vignette: number;
  /** Film grain weight. 0..1 */
  grain: number;
  /** Overall exposure multiplier. */
  exposure: number;
  /** Lifts the whole frame toward this colour — used for the Light. */
  washColor: [number, number, number];
  washAmount: number;
  /** Vertical smear, for the stretch at the moment of death. 0 = off. */
  smear: number;
}

export function defaultGrade(): GradeSettings {
  return {
    drain: 0,
    aberration: 0.0012,
    distortion: 0.02,
    vignette: 0.35,
    grain: 0.07,
    exposure: 1,
    washColor: [1, 1, 1],
    washAmount: 0,
    smear: 0,
  };
}

const gradeShader = {
  name: 'SamsaraGrade',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDrain: { value: 0 },
    uAberration: { value: 0.0012 },
    uDistortion: { value: 0.02 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.07 },
    uExposure: { value: 1 },
    uWashRgb: { value: [1, 1, 1] },
    uWashAmount: { value: 0 },
    uSmear: { value: 0 },
    uAspect: { value: 1.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDrain;
    uniform float uAberration;
    uniform float uDistortion;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uExposure;
    uniform vec3 uWashRgb;
    uniform float uWashAmount;
    uniform float uSmear;
    uniform float uAspect;

    varying vec2 vUv;

    ${GRADE}
    ${NOISE}

    // Barrel distortion about the centre. Kept subtle: past about 0.06 it reads
    // as a lens rather than as a state of mind.
    vec2 warp(vec2 uv, float amount) {
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);
      return 0.5 + centered * (1.0 + amount * r2);
    }

    void main() {
      vec2 uv = warp(vUv, uDistortion);

      // Chromatic aberration scales with distance from centre, as a real lens
      // does, so the middle of frame stays clean while edges separate.
      vec2 dir = uv - 0.5;
      float edge = length(dir);
      vec2 offset = dir * uAberration * (0.35 + edge);

      vec3 color;
      color.r = texture2D(tDiffuse, uv + offset).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - offset).b;

      // Vertical smear: a few taps upward, weighted, for the stretch at death.
      if (uSmear > 0.0001) {
        vec3 smeared = color;
        float weight = 1.0;
        for (int i = 1; i <= 6; i++) {
          float f = float(i) / 6.0;
          vec2 tapUv = uv + vec2(0.0, f * uSmear);
          float w = 1.0 - f;
          smeared += texture2D(tDiffuse, tapUv).rgb * w;
          weight += w;
        }
        color = mix(color, smeared / weight, min(1.0, uSmear * 14.0));
      }

      // The wash goes in BEFORE exposure, so the tonemap still has it in range.
      // Added after exposure it drove the brightest beats past the curve and
      // into the clamp below, which is how a scene ends up a third pure white
      // with its own subtitle no longer legible against it.
      color += uWashRgb * uWashAmount;
      color *= uExposure;
      color = drain(color, uDrain);

      color = filmic(color);

      float vig = 1.0 - uVignette * smoothstep(0.25, 0.95, edge * 1.35);
      color *= vig;

      // Grain is animated and aspect-corrected so it does not read as a static
      // texture stuck to the screen.
      float g = vnoise(vec3(vUv * vec2(uAspect, 1.0) * 900.0, uTime * 24.0));
      color += (g - 0.5) * uGrain;

      // Frames that leave the valid range cause banding in the composite; clamp
      // once, at the end.
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

export interface PostPipeline {
  readonly composer: EffectComposer;
  readonly grade: GradeSettings;
  /** Bloom strength, driven per scene. */
  setBloom(strength: number, radius?: number, threshold?: number): void;
  /** Push `grade` into the shader. Called once per frame by the game. */
  commit(elapsed: number): void;
  render(delta: number): void;
  setSize(width: number, height: number): void;
  /** Turn the whole stack off, to measure what it costs. */
  setEnabled(enabled: boolean): void;
  readonly enabled: boolean;
  readonly passCount: number;
  /** MSAA sample count actually in use. 0 means none, which is a defect. */
  readonly samples: number;
}

export function createPostPipeline(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  tracker: ResourceTracker,
  options: { softwareRenderer?: boolean } = {},
): PostPipeline {
  const size = renderer.getSize(new Vector2());

  // `antialias: true` on the renderer applies to the DEFAULT framebuffer, and
  // once there is a composer the only thing ever drawn there is the final
  // full-screen grade quad, which has no edges to antialias. The scene is drawn
  // into the composer's own target, and three.js builds that target with no
  // `samples` — so the flag was dead and every edge in the game was aliased.
  //
  // Supplying a multisampled target is the whole fix, and it covers every piece
  // of geometry at once: glow quad edges, wireframes, silhouettes, the lot.
  const pixelRatio = renderer.getPixelRatio();
  const coarse =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(hover: none) and (pointer: coarse)').matches;
  // MSAA is resolved per frame, so it is the kind of cost a phone feels first.
  // Mobile already runs at a capped pixel ratio, where the edges are shorter.
  //
  // A software rasteriser pays the whole multisample fill on the CPU and renders
  // for nobody, since no player is on one. Headless CI runs on SwiftShader, so
  // leaving it on there buys no signal and costs the gate most of its runtime.
  const samples = coarse || options.softwareRenderer === true ? 0 : 4;
  const target = new WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, {
    type: HalfFloatType,
    samples,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.6, 0.55, 0.2);
  composer.addPass(bloom);

  const gradePass = new ShaderPass(gradeShader);
  gradePass.renderToScreen = true;
  composer.addPass(gradePass);

  const grade = defaultGrade();
  let enabled = true;

  // EffectComposer owns render targets, and UnrealBloomPass owns several more.
  // None of them are swept by the scene's tracker unless registered, and the
  // reincarnation loop rebuilds this pipeline on every run.
  tracker.onDispose(() => {
    target.dispose();
    bloom.dispose();
    gradePass.dispose();
    renderPass.dispose();
    composer.dispose();
  });

  return {
    composer,
    grade,
    setBloom(strength, radius = 0.55, threshold = 0.2) {
      bloom.strength = strength;
      bloom.radius = radius;
      bloom.threshold = threshold;
      bloom.enabled = strength > 0.001;
    },
    commit(elapsed) {
      // A missing uniform here is a typo in the grade shader, not a condition to
      // tolerate, so the setter throws and the gate catches it on frame one.
      const set = (name: string, value: unknown): void => {
        const uniform: IUniform | undefined = gradePass.uniforms[name];
        if (!uniform) {
          throw new Error(`Grade pass has no uniform "${name}"`);
        }
        uniform.value = value;
      };
      set('uTime', elapsed);
      set('uDrain', grade.drain);
      set('uAberration', grade.aberration);
      set('uDistortion', grade.distortion);
      set('uVignette', grade.vignette);
      set('uGrain', grade.grain);
      set('uExposure', grade.exposure);
      set('uWashRgb', grade.washColor);
      set('uWashAmount', grade.washAmount);
      set('uSmear', grade.smear);
      const current = renderer.getSize(new Vector2());
      set('uAspect', current.x / Math.max(1, current.y));
    },
    render(delta) {
      if (enabled) {
        composer.render(delta);
      } else {
        renderer.render(scene, camera);
      }
    },
    setSize(width, height) {
      composer.setSize(width, height);
      bloom.setSize(width, height);
    },
    setEnabled(next) {
      enabled = next;
    },
    get enabled() {
      return enabled;
    },
    get passCount() {
      return composer.passes.filter((pass) => pass.enabled).length;
    },
    get samples() {
      return samples;
    },
  };
}
