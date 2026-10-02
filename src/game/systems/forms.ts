import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';
import type { Rng } from '../rng';
import type { ResourceTracker } from '../disposal';
import { NOISE, setU } from './glsl';

/**
 * Reusable forms. Original abstract shapes — a glow that has volume, a figure
 * that resolves out of light, drifting motes, and a shell for a room's air.
 *
 * Figures are deliberately abstract: a soft capsule silhouette with an emissive
 * core, so a presence reads as a presence without ever becoming a character
 * model. GAME_BRIEF.md asks for figures that resolve out of glow, which is a
 * lighting problem, not a modelling one.
 */

/**
 * A glow with depth to it — light that has texture and weight.
 *
 * Billboarded rather than a sphere shell, which is not a shortcut: on a shell
 * every fragment sits at the same radius, so a radial falloff computed from the
 * fragment position is constant and the glow renders as a flat disc. A
 * camera-facing quad makes the falloff correct by construction, has no seams at
 * any scale, and costs two triangles.
 *
 * Weight comes from three things the flat version lacks: a dense core with a
 * separate falloff from the halo, fbm churn in the sprite's own space so the
 * interior moves, and a faint outward streaking that reads as light having a
 * direction.
 */
export function volumetricGlow(
  tracker: ResourceTracker,
  options: { radius: number; color: number; intensity?: number; softness?: number },
): {
  mesh: Mesh;
  material: ShaderMaterial;
  /** Face the camera and advance the churn. Call once per frame. */
  update(elapsed: number, camera: Camera): void;
} {
  // Oversized relative to the nominal radius so the halo has room to fall off.
  const geometry = tracker.track(new PlaneGeometry(options.radius * 2.6, options.radius * 2.6));
  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(options.color) },
        uIntensity: { value: options.intensity ?? 1 },
        uSoftness: { value: options.softness ?? 2.2 },
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
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uSoftness;
        varying vec2 vUv;

        ${NOISE}

        void main() {
          vec2 centred = vUv - 0.5;
          float r = length(centred) * 2.0;
          if (r > 1.0) {
            discard;
          }

          // Halo and core fall off at different rates, which is what separates a
          // body of light from a radial gradient.
          float halo = pow(1.0 - r, uSoftness);
          float core = pow(1.0 - r, uSoftness * 3.5) * 1.6;

          // Churn inside the glow, in the sprite's own space.
          float angle = atan(centred.y, centred.x);
          float churn = fbm(vec3(centred * 4.0, uTime * 0.18), 3);

          // Faint streaking outward, so the light has structure at its edge.
          float rays = sin(angle * 7.0 + churn * 4.0 + uTime * 0.12) * 0.5 + 0.5;
          float streak = pow(rays, 3.0) * halo * 0.3;

          float density = (halo * (0.65 + churn * 0.6) + core + streak);
          gl_FragColor = vec4(uColor * density * uIntensity, clamp(density, 0.0, 1.0));
        }
      `,
    }),
  );
  const mesh = new Mesh(geometry, material);
  return {
    mesh,
    material,
    update(elapsed, camera) {
      setU(material, 'uTime', elapsed);
      // Billboard: copy the camera's orientation so the quad always faces it.
      mesh.quaternion.copy(camera.quaternion);
    },
  };
}

/**
 * A presence. An abstract soft silhouette with an emissive interior — never a
 * character, only a shape the eye reads as someone standing there.
 */
export function figureOfLight(
  tracker: ResourceTracker,
  options: { height: number; color: number; accent: number; seed: number },
): { group: Object3D; material: ShaderMaterial } {
  const radius = options.height * 0.17;
  const geometry = tracker.track(new CapsuleGeometry(radius, Math.max(0.1, options.height - radius * 2), 16, 24));
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
        /** 0 = not yet resolved out of the glow, 1 = fully present. */
        uResolve: { value: 0 },
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
        uniform float uResolve;
        varying vec3 vNormalView;
        varying vec3 vLocal;

        ${NOISE}

        void main() {
          // Rim-dominant: brightest where the form turns away, which is what
          // makes a shape read as lit from within.
          float facing = clamp(dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
          float rim = pow(1.0 - facing, 2.0);

          // Before it resolves, the figure is dissolved into noise; as uResolve
          // rises the noise tightens until a silhouette is standing there.
          float grain = fbm(vLocal * 3.2 + vec3(uSeed, uTime * 0.2, uSeed * 0.5), 4);
          float coherence = mix(grain, 1.0, uResolve);

          float body = (rim * 0.85 + 0.15) * coherence;
          body *= smoothstep(0.0, 0.35, uResolve);

          vec3 tint = mix(uAccent, uColor, rim);
          gl_FragColor = vec4(tint * body, body * 0.9);
        }
      `,
    }),
  );
  const mesh = new Mesh(geometry, material);
  mesh.position.y = options.height * 0.5;
  return { group: mesh, material };
}

/** Drifting motes. Dust in a sunbeam, or souls at a distance. */
export function moteField(
  tracker: ResourceTracker,
  rng: Rng,
  options: { count: number; radius: number; color: number; size: number },
): { points: Points; drift: (delta: number, elapsed?: number) => void } {
  const positions = new Float32Array(options.count * 3);
  const velocities = new Float32Array(options.count * 3);
  for (let i = 0; i < options.count; i += 1) {
    // Rejection-free spherical distribution, so motes are not clustered at the poles.
    const u = rng.range(-1, 1);
    const theta = rng.range(0, Math.PI * 2);
    const r = options.radius * Math.cbrt(rng.next());
    const planar = Math.sqrt(1 - u * u);
    positions[i * 3] = r * planar * Math.cos(theta);
    positions[i * 3 + 1] = r * planar * Math.sin(theta);
    positions[i * 3 + 2] = r * u;
    velocities[i * 3] = rng.range(-0.04, 0.04);
    velocities[i * 3 + 1] = rng.range(0.01, 0.07);
    velocities[i * 3 + 2] = rng.range(-0.04, 0.04);
  }

  const geometry = tracker.track(new BufferGeometry());
  const attribute = new BufferAttribute(positions, 3);
  geometry.setAttribute('position', attribute);

  // Per-point size and phase, so the field is not a uniform spray.
  const seeds = new Float32Array(options.count);
  for (let i = 0; i < options.count; i += 1) {
    seeds[i] = rng.range(0, Math.PI * 2);
  }
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));

  // PointsMaterial draws square points, which read as pixel blocks rather than
  // as motes. A tiny shader gives a round, soft, slowly twinkling point and
  // costs nothing extra.
  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(options.color) },
        uSize: { value: options.size },
        uOpacity: { value: 0.72 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uSize;
        attribute float aSeed;
        varying float vTwinkle;

        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          // Size attenuates with distance, as a real point light would.
          float scale = 300.0 / max(0.0001, -viewPosition.z);
          float breathe = 0.75 + 0.25 * sin(uTime * 0.8 + aSeed);
          gl_PointSize = uSize * scale * breathe;
          vTwinkle = breathe;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vTwinkle;

        void main() {
          // Round, with a soft edge and a brighter centre.
          vec2 centred = gl_PointCoord - 0.5;
          float r = length(centred) * 2.0;
          if (r > 1.0) {
            discard;
          }
          float falloff = pow(1.0 - r, 2.2);
          float core = pow(1.0 - r, 7.0);
          float density = (falloff * 0.7 + core) * vTwinkle;
          gl_FragColor = vec4(uColor * density, density * uOpacity);
        }
      `,
    }),
  );

  const points = new Points(geometry, material);
  const bound = options.radius;

  return {
    points,
    drift(delta, elapsed) {
      if (elapsed !== undefined) {
        setU(material, 'uTime', elapsed);
      }
      for (let i = 0; i < options.count; i += 1) {
        for (let axis = 0; axis < 3; axis += 1) {
          const index = i * 3 + axis;
          const velocity = velocities[index] ?? 0;
          let value = (positions[index] ?? 0) + velocity * delta;
          // Wrap rather than respawn: a mote leaving the top returns at the
          // bottom, so the field never visibly thins.
          if (value > bound) {
            value = -bound;
          } else if (value < -bound) {
            value = bound;
          }
          positions[index] = value;
        }
      }
      attribute.needsUpdate = true;
    },
  };
}

/**
 * The air of a place: an inward-facing shell whose colour and density a scene
 * drives. Cheaper and more controllable than scene fog for a single room, and it
 * can hold a gradient, which fog cannot.
 */
export function airShell(
  tracker: ResourceTracker,
  options: { radius: number; ground: number; glow: number; density?: number },
): { mesh: Mesh; material: ShaderMaterial } {
  const geometry = tracker.track(new SphereGeometry(options.radius, 32, 24));
  const material = tracker.track(
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uGround: { value: new Color(options.ground) },
        uGlow: { value: new Color(options.glow) },
        uDensity: { value: options.density ?? 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        void main() {
          vLocal = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uGround;
        uniform vec3 uGlow;
        uniform float uDensity;
        varying vec3 vLocal;

        ${NOISE}

        void main() {
          // Vertical gradient with a slow churn, so the air is never a flat field.
          float height = vLocal.y * 0.5 + 0.5;
          float churn = fbm(vLocal * 2.4 + vec3(0.0, uTime * 0.05, 0.0), 3);
          vec3 color = mix(uGround, uGlow, pow(height, 2.2) * 0.8 + churn * 0.18);
          gl_FragColor = vec4(color, uDensity);
        }
      `,
    }),
  );
  const mesh = new Mesh(geometry, material);
  // The air is a transparent sphere centred on the origin. three.js sorts
  // transparent objects by distance from the camera, so without an explicit
  // order it draws AFTER anything further away than its centre — painting over
  // every figure, glow and mote in the scene. It is a backdrop and must always
  // be drawn first.
  mesh.renderOrder = -10;
  return { mesh, material };
}

/**
 * A field of radiance seen from inside it.
 *
 * The Being of Light cannot be built from a big glow sprite: once the camera is
 * inside it, a billboard fills the frame with one flat value and the result is a
 * white rectangle, which is exactly the failure the brief warns about. Light that
 * overwhelms still has to have structure.
 *
 * So this is an inward-facing shell whose shader draws filaments converging on a
 * focus direction, with fbm breaking them up. However bright it gets, the frame
 * keeps form, and the brightness can then be pushed past the top of the range by
 * the grade's wash without flattening.
 */
export function radianceShell(
  tracker: ResourceTracker,
  options: { radius: number; color: number; accent: number },
): {
  mesh: Mesh;
  material: ShaderMaterial;
  update(elapsed: number): void;
  setIntensity(value: number): void;
  setFocus(x: number, y: number, z: number): void;
} {
  const geometry = tracker.track(new SphereGeometry(options.radius, 48, 32));
  const material = tracker.track(
    new ShaderMaterial({
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(options.color) },
        uAccent: { value: new Color(options.accent) },
        uIntensity: { value: 1 },
        uFocus: { value: new Vector3(0, 0, -1) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        uniform float uIntensity;
        uniform vec3 uFocus;
        varying vec3 vDir;

        ${NOISE}

        void main() {
          vec3 dir = normalize(vDir);
          vec3 focus = normalize(uFocus);

          // Angular distance from the focus: 0 at the heart of the light.
          float toward = dot(dir, focus);
          float angle = acos(clamp(toward, -1.0, 1.0));

          // Filaments: a high-frequency band around the focus axis, broken up by
          // noise so they read as structure rather than as a sunburst.
          vec3 tangent = normalize(cross(focus, vec3(0.0, 1.0, 0.0001)));
          vec3 bitangent = cross(focus, tangent);
          float around = atan(dot(dir, bitangent), dot(dir, tangent));

          float churn = fbm(dir * 2.6 + vec3(0.0, uTime * 0.09, uTime * 0.05), 4);
          float coarse = sin(around * 7.0 + churn * 9.0 - uTime * 0.21) * 0.5 + 0.5;
          float fine = sin(around * 17.0 - churn * 5.0 + uTime * 0.13) * 0.5 + 0.5;
          float filaments = pow(coarse, 2.4) * (0.65 + pow(fine, 3.0) * 0.6);

          // Brightness falls off with angle from the focus, but never to nothing:
          // inside the light, every direction is still light.
          float nearness = pow(clamp(1.0 - angle / 3.14159, 0.0, 1.0), 2.2);
          // Deliberately short of 1.0: the shell is a field to see filaments
          // against, not the brightest thing in frame. The core supplies that.
          float base = 0.08 + nearness * 0.42;

          // Slow breathing bands across the whole field, which keeps even the
          // dimmest part of frame alive.
          float bands = fbm(dir * 1.3 + vec3(uTime * 0.04, 0.0, 0.0), 3);

          vec3 color = mix(uAccent, uColor, nearness);
          // A counter-shifted tint at the filament edges, so the light carries a
          // hue the rest of the frame does not have.
          color += vec3(0.16, 0.05, 0.22) * filaments * (1.0 - nearness);
          float density = base * (0.55 + bands * 0.5) + filaments * nearness * 0.42;

          gl_FragColor = vec4(color * density * uIntensity, clamp(density * 0.85, 0.0, 1.0));
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
    setFocus(x, y, z) {
      setU(material, 'uFocus', new Vector3(x, y, z));
    },
  };
}
