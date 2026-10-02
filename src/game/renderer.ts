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

/**
 * What a rendered frame actually contains.
 *
 * "Every scene rendered at least once" only proves a shader compiled. It does
 * not prove anything reached the screen: a scene whose geometry is painted over,
 * is behind the camera, or never resolves still counts a frame and still passes.
 * These numbers are what turn that guarantee into a real one.
 */
export interface FrameSample {
  /** Mean luma, 0..255. Near zero means a black frame. */
  meanLuma: number;
  /** Standard deviation of luma. Near zero means a flat field with nothing in it. */
  stdLuma: number;
  /** Fraction of pixels brighter than 80/255. Zero means nothing is lit. */
  brightFraction: number;
  /** Fraction of pixels above 250/255. High means the frame is blown out. */
  clippedFraction: number;
  sampled: number;
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
  /**
   * Read the frame that was just drawn. Only meaningful in a build created with
   * `readable`, and only immediately after a render.
   */
  sampleFrame(): FrameSample;
  /** Whether this renderer can be sampled at all. */
  readonly readable: boolean;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, options: { readable?: boolean } = {}): RendererBundle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    // With antialiasing the default framebuffer is multisampled and is only
    // resolved when the browser composites, so reading it back mid-frame returns
    // an unresolved buffer — which measures as black however bright the scene
    // is. Preserving the drawing buffer makes the readback valid. It costs
    // memory and a copy, so only test builds ask for it; a shipping build keeps
    // the default and simply cannot be sampled.
    preserveDrawingBuffer: options.readable ?? false,
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
    readable: options.readable ?? false,
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
    sampleFrame() {
      // EffectComposer leaves one of its own render targets bound when it
      // finishes, so the default framebuffer has to be rebound explicitly.
      renderer.setRenderTarget(null);
      const gl = renderer.getContext();
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      if (width === 0 || height === 0) {
        return { meanLuma: 0, stdLuma: 0, brightFraction: 0, clippedFraction: 0, sampled: 0 };
      }

      // readPixels cannot stride, and reading the whole frame is a synchronous
      // GPU stall that costs more than the rest of the scene visit put together.
      // A grid of small patches spread across the frame is representative —
      // centre and edges both — at a fraction of the cost. Reading one corner
      // would not be: the grade darkens corners, so a corner is the least
      // representative part of the image there is.
      // Coverage matters more than patch size: a scene can be correctly lit by
      // one small bright feature (a window in a dark room), and a coarse grid
      // misses it entirely and calls the frame empty. A denser grid of smaller
      // patches spans the frame properly and still reads only ~14k pixels.
      const PATCH = 16;
      const COLS = 9;
      const ROWS = 6;
      const pixels = new Uint8Array(PATCH * PATCH * 4);

      let total = 0;
      let totalSquares = 0;
      let bright = 0;
      let clipped = 0;
      let count = 0;

      for (let gy = 0; gy < ROWS; gy += 1) {
        for (let gx = 0; gx < COLS; gx += 1) {
          // Spread the patches so they span the frame without touching its edge.
          const x = Math.min(
            Math.max(0, width - PATCH),
            Math.round(((gx + 0.5) / COLS) * width - PATCH / 2),
          );
          const y = Math.min(
            Math.max(0, height - PATCH),
            Math.round(((gy + 0.5) / ROWS) * height - PATCH / 2),
          );
          gl.readPixels(x, y, PATCH, PATCH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

          for (let i = 0; i < PATCH * PATCH; i += 1) {
            const r = pixels[i * 4] ?? 0;
            const g = pixels[i * 4 + 1] ?? 0;
            const b = pixels[i * 4 + 2] ?? 0;
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            total += luma;
            totalSquares += luma * luma;
            if (luma > 80) {
              bright += 1;
            }
            if (luma > 250) {
              clipped += 1;
            }
            count += 1;
          }
        }
      }

      const mean = count > 0 ? total / count : 0;
      const variance = count > 0 ? Math.max(0, totalSquares / count - mean * mean) : 0;
      return {
        meanLuma: mean,
        stdLuma: Math.sqrt(variance),
        brightFraction: count > 0 ? bright / count : 0,
        clippedFraction: count > 0 ? clipped / count : 0,
        sampled: count,
      };
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
