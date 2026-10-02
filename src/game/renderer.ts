import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';

/**
 * Renderer setup, per CLAUDE.md § three.js discipline:
 * - cap device pixel ratio on mobile,
 * - handle webglcontextlost / webglcontextrestored gracefully,
 * - keep a frame-time budget and measure it.
 *
 * Shader errors only show up at runtime, so the renderer's own shader-error
 * hook records them into a buffer the gate reads directly. Relying on the
 * console alone would miss any three.js build that stops logging them.
 */

export interface ShaderFailure {
  readonly sceneId: string;
  readonly programName: string;
  readonly log: string;
}

export interface FrameStats {
  readonly samples: number;
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly worstMs: number;
}

export interface ContextEvents {
  lost: number;
  restored: number;
}

/** Mobile gets a tighter cap: a retina phone at DPR 3 renders 9x the pixels. */
const MAX_DPR_DESKTOP = 2;
const MAX_DPR_MOBILE = 1.5;

function isMobileViewport(): boolean {
  if (typeof globalThis.matchMedia !== 'function') {
    return false;
  }
  return globalThis.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function capDevicePixelRatio(): number {
  const raw = globalThis.devicePixelRatio || 1;
  return Math.min(raw, isMobileViewport() ? MAX_DPR_MOBILE : MAX_DPR_DESKTOP);
}

export interface RendererBundle {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly shaderFailures: readonly ShaderFailure[];
  readonly contextEvents: ContextEvents;
  /** Which scene a shader failure should be attributed to. */
  setCurrentSceneId(id: string): void;
  frameStats(): FrameStats;
  recordFrame(ms: number): void;
  resetFrameStats(): void;
  /** True when WebGL is a software rasteriser, so frame times are not real performance. */
  isSoftwareRenderer(): boolean;
  rendererDescription(): string;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): RendererBundle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(capDevicePixelRatio());
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);

  const scene = new Scene();
  const camera = new PerspectiveCamera(60, aspectOf(canvas), 0.1, 2000);

  const shaderFailures: ShaderFailure[] = [];
  const contextEvents: ContextEvents = { lost: 0, restored: 0 };
  let currentSceneId = 'boot';
  let frameTimes: number[] = [];

  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (_gl, program, _vertexShader, _fragmentShader) => {
    shaderFailures.push({
      sceneId: currentSceneId,
      // three.js names programs after the material; a missing name still tells
      // us which scene failed, which is what the gate reports.
      programName: (program as unknown as { name?: string }).name ?? 'unnamed-program',
      log: 'shader compile or link failed',
    });
  };

  const onContextLost = (event: Event): void => {
    // Preventing the default is what lets the browser hand back a restored
    // context instead of leaving the canvas dead.
    event.preventDefault();
    contextEvents.lost += 1;
  };
  const onContextRestored = (): void => {
    contextEvents.restored += 1;
    renderer.setPixelRatio(capDevicePixelRatio());
    renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
    // A restored context has lost every GPU-side object. three.js reuploads
    // geometry, textures and programs on the next render, so there is nothing
    // to rebuild here beyond restoring size and pixel ratio.
  };

  const describeRenderer = (): string => {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (!info) {
      return 'unknown';
    }
    const vendor = String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL) ?? '');
    const device = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
    return `${vendor} ${device}`.trim() || 'unknown';
  };

  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  return {
    renderer,
    scene,
    camera,
    shaderFailures,
    contextEvents,
    setCurrentSceneId(id) {
      currentSceneId = id;
    },
    recordFrame(ms) {
      // Keep the window bounded: a long run must not grow this array forever.
      if (frameTimes.length >= 2000) {
        frameTimes.shift();
      }
      frameTimes.push(ms);
    },
    resetFrameStats() {
      frameTimes = [];
    },
    frameStats() {
      if (frameTimes.length === 0) {
        return { samples: 0, meanMs: 0, p95Ms: 0, worstMs: 0 };
      }
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const total = sorted.reduce((sum, value) => sum + value, 0);
      const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      return {
        samples: sorted.length,
        meanMs: total / sorted.length,
        p95Ms: sorted[p95Index] ?? 0,
        worstMs: sorted[sorted.length - 1] ?? 0,
      };
    },
    isSoftwareRenderer() {
      return /swiftshader|software|llvmpipe|basic render/i.test(describeRenderer());
    },
    rendererDescription: describeRenderer,
    resize(width, height) {
      renderer.setPixelRatio(capDevicePixelRatio());
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      renderer.dispose();
    },
  };
}

function aspectOf(canvas: HTMLCanvasElement): number {
  const width = canvas.clientWidth || 1;
  const height = canvas.clientHeight || 1;
  return width / height;
}
