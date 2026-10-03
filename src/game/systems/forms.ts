import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LatheGeometry,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
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
 * Figures are deliberately abstract: a lathe-revolved vessel of light with no
 * face and no limbs, so a presence reads as a presence without ever becoming a
 * character model. GAME_BRIEF.md asks for figures that resolve out of glow,
 * which is a lighting problem first — but it is not only one. A form with no
 * silhouette events has nothing for the light to describe.
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
          // A smoothstep edge rather than a discard: discard is a hard,
          // unantialiased cutoff and it disables early-Z, which tile-based
          // mobile GPUs pay for on every glow in the game.
          float edge = 1.0 - smoothstep(0.88, 1.0, r);

          // Halo and core fall off at different rates, which is what separates a
          // body of light from a radial gradient.
          float halo = pow(max(0.0, 1.0 - r), uSoftness);
          float core = pow(max(0.0, 1.0 - r), uSoftness * 3.5) * 1.6;

          // Churn inside the glow, in the sprite's own space.
          float angle = atan(centred.y, centred.x);
          float churn = fbm(vec3(centred * 4.0, uTime * 0.18), 3);

          // Faint streaking outward, so the light has structure at its edge.
          float rays = sin(angle * 7.0 + churn * 4.0 + uTime * 0.12) * 0.5 + 0.5;
          float streak = pow(rays, 3.0) * halo * 0.3;

          float density = (halo * (0.65 + churn * 0.6) + core + streak) * edge;
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
 * The silhouette of a presence, as a lathe profile of (radius, height) pairs on
 * a unit height.
 *
 * Original, abstract, and deliberately not a body: a column of light that
 * gathers where it meets the ground, draws in at the waist, broadens where
 * shoulders would be and closes to a crown. There is no face anywhere in it and
 * there never will be — this world is made of light (GAME_BRIEF.md § The
 * Threshold, "figures that resolve out of glow").
 *
 * What a capsule could not do, and why this exists: a capsule has exactly one
 * silhouette event, its own radius, so at any distance it reads as a pill. The
 * eye reads a standing presence off three events — a base, a waist and a
 * shoulder line — and those are cheap to put in a lathe profile. The form is
 * then legible at the distance the Council places it at, which is the whole
 * problem the Council had.
 */
const PRESENCE_PROFILE: readonly (readonly [number, number])[] = [
  [0.020, 0.000],
  [0.150, 0.000],
  [0.246, 0.014],
  [0.250, 0.044],
  [0.214, 0.124],
  [0.170, 0.262],
  [0.146, 0.420],
  [0.138, 0.548],
  [0.151, 0.622],
  [0.178, 0.690],
  [0.150, 0.752],
  [0.098, 0.790],
  [0.093, 0.840],
  [0.080, 0.900],
  [0.050, 0.956],
  [0.000, 1.000],
];

function presenceGeometry(height: number, swell: number, lift: number): LatheGeometry {
  const points = PRESENCE_PROFILE.map(
    ([radius, y]) => new Vector2(radius * height * swell + (swell > 1 ? 0.012 : 0), y * height * lift),
  );
  // 16 radial segments: enough that the silhouette curve is smooth at the size
  // these are drawn, and few enough that five of them cost nothing.
  return new LatheGeometry(points, 16);
}

/** Tag every vertex of a geometry so one shared material can shade two parts. */
function tagPart(geometry: BufferGeometry, part: number): BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const parts = new Float32Array(count);
  parts.fill(part);
  geometry.setAttribute('aPart', new BufferAttribute(parts, 1));
  return geometry;
}

/**
 * A presence: a being of light standing somewhere, with enough form to read as
 * one and no more detail than that.
 *
 * Two surfaces share one material, which is what lets a scene drive the whole
 * figure through the single `material` this returns — the shell outside the body
 * is tagged by a vertex attribute and shaded as the radiance coming off it. That
 * replaces the billboard halo scenes used to hang above a figure: a camera-facing
 * sprite with a radial streak reads as a lens flare, which is an artefact of a
 * camera that is not in this world, while a shell that follows the form turns
 * with it and reads as light coming off a body.
 *
 * Form comes from a wrapped diffuse term as well as the rim. Rim alone is what
 * made the old figure flat: every silhouette is equally bright and nothing in
 * between is lit at all, so the shape has an outline and no interior. One
 * directional term costs a dot product and gives the body a lit side.
 */
export function figureOfLight(
  tracker: ResourceTracker,
  options: {
    height: number;
    color: number;
    accent: number;
    seed: number;
    /** Where the light on this figure comes from, in world space. */
    light?: readonly [number, number, number];
  },
): { group: Object3D; material: ShaderMaterial } {
  const light = options.light ?? [0.22, 0.34, 1];
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
      },
      vertexShader: /* glsl */ `
        attribute float aPart;
        uniform float uHeight;
        varying float vPart;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying float vUpward;
        void main() {
          vPart = aPart;
          // World space rather than view space: the light on a presence belongs
          // to the place it is standing in, so it must not swing with the head.
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          vUpward = position.y / max(0.001, uHeight);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uAccent;
        uniform vec3 uLight;
        uniform float uSeed;
        uniform float uResolve;
        varying float vPart;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying float vUpward;

        ${NOISE}

        void main() {
          vec3 normal = normalize(vWorldNormal);
          vec3 view = normalize(cameraPosition - vWorldPos);
          float facing = clamp(dot(normal, view), 0.0, 1.0);
          float rim = pow(1.0 - facing, 2.3);

          float resolve = clamp(uResolve, 0.0, 1.4);
          // Before it resolves the form is still coming apart into the light it
          // is made of; as uResolve rises the noise tightens into a silhouette.
          // Two octaves rather than four: at the size a figure is drawn the
          // upper octaves are below a pixel, and this shader runs on every
          // figure in every scene of the Light.
          float grain = fbm(vWorldPos * 2.1 + vec3(uSeed, uTime * 0.16, uSeed * 0.5), 2);
          float coherence = mix(grain * 1.5, 1.0, clamp(resolve, 0.0, 1.0));
          float present = smoothstep(0.0, 0.32, resolve);

          if (vPart > 0.5) {
            // The shell: lit only where it turns away from the eye, so what
            // reads is radiance coming off the figure rather than a sprite.
            float aura = pow(1.0 - facing, 3.4) * coherence * present;
            float breath = 0.82 + 0.18 * sin(uTime * 0.6 + uSeed);
            vec3 glow = mix(uAccent, uColor, 0.45);
            gl_FragColor = vec4(glow * aura * 0.95 * breath, clamp(aura * 0.5, 0.0, 1.0));
            return;
          }

          // Wrapped diffuse: never fully dark on the turned-away side, because a
          // being of light has no shadow side, but still directional enough that
          // the body has a near face and a far one.
          float lambert = clamp(dot(normal, normalize(uLight)) * 0.5 + 0.5, 0.0, 1.0);
          // Filaments running up the form, so the surface is light rather than
          // plastic. Cheap: one sine, no noise.
          float around = atan(normal.z, normal.x);
          float weave = sin(around * 5.0 + vUpward * 7.0 - uTime * 0.3) * 0.5 + 0.5;
          // Brightest at the foot, where the figure stands in the light, and at
          // the crown. The dip between them is what gives the form a waist.
          float foot = 1.0 - smoothstep(0.0, 0.44, vUpward);
          float crown = smoothstep(0.80, 1.0, vUpward);
          float body = (lambert * 0.55 + rim * 0.95 + 0.10) * (0.52 + foot * 0.52 + crown * 0.9);
          body *= (0.86 + weave * 0.28) * coherence * present;

          vec3 tint = mix(uAccent, uColor, clamp(rim * 0.7 + crown * 0.6, 0.0, 1.0));
          gl_FragColor = vec4(tint * body, clamp(body * 0.9, 0.0, 1.0));
        }
      `,
    }),
  );

  const group = new Group();
  const body = new Mesh(tracker.track(tagPart(presenceGeometry(options.height, 1, 1), 0)), material);
  const shell = new Mesh(tracker.track(tagPart(presenceGeometry(options.height, 1.2, 1.03), 1)), material);
  group.add(body, shell);
  // The group's origin is where the figure stands, as it was when this was a
  // capsule offset by half its height. Every caller positions feet, not centre.
  return { group, material };
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
          float edge = 1.0 - smoothstep(0.82, 1.0, r);
          float falloff = pow(max(0.0, 1.0 - r), 2.2);
          float core = pow(max(0.0, 1.0 - r), 7.0);
          float density = (falloff * 0.7 + core) * vTwinkle * edge;
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
