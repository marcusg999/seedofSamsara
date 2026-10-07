import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Camera,
} from 'three';
import type { ResourceTracker } from '../disposal';
import { NOISE, setU } from './glsl';

/**
 * Remembered moments, built out of one primitive: a panel of light.
 *
 * The life review had been staged in outline — a room, a table and two chairs
 * drawn as edges — and every reading of it said the same thing: it looks like
 * scaffolding. The diagnosis is not "too few lines". An outline is a *diagram*
 * of a place, and a diagram cannot be a memory. Nobody remembers the edges of a
 * room. What survives of an evening is where the light was, how far away the
 * other person was, and whether the door was open.
 *
 * So the language here is light and distance rather than line and volume:
 *
 * - A **floor** is a soft-edged sheet of light lying on the ground. It says
 *   "there was a place here, and it ended somewhere" without drawing a wall.
 * - A **doorway** is the same primitive stood upright with its edges made crisp.
 *   Crispness is the whole trick: a soft rectangle is a glow, and a hard one is
 *   a gap in something. Narrow it almost to nothing and it is a shut door with
 *   the light still on behind it.
 * - A **table top** is a sheet at waist height, and whatever is on it is a small
 *   bright thing.
 * - A **presence** at any distance is an upright sheet, narrow, soft, standing
 *   on the floor. At the range a remembered moment is seen from, that is all a
 *   person is: a standing column of light at a certain distance from another
 *   one. The distance is the content.
 *
 * One primitive means one shader program for the whole vocabulary — three.js
 * caches compiled programs by source, so every panel in every moment shares a
 * single compile, and the per-moment cost is draw calls over a handful of very
 * cheap fragments. There is no post-processing pass anywhere in this file.
 *
 * All of it is original abstract form: sheets of light at chosen distances. No
 * photography, no texture, no reference to any existing work.
 */

/** Which way a panel turns to meet the eye. */
export type PanelFacing =
  /** Fixed in world space. Floors, door spills, table tops. */
  | 'fixed'
  /** Turns about its own vertical axis to face the camera. People, lamps. */
  | 'upright';

export interface PanelOptions {
  readonly width: number;
  readonly height: number;
  readonly color: number;
  readonly intensity?: number;
  /**
   * 0 is a crisp rectangle — a doorway, a thing with a jamb. 1 is formless, a
   * pool of light with no shape of its own.
   */
  readonly softness?: number;
  /** Width at the top edge relative to the bottom. A spill of light widens. */
  readonly taper?: number;
  /** -1 brightest along the bottom edge, 0 even, 1 brightest along the top. */
  readonly lean?: number;
  /** How much the interior moves. 0 for a still, hard-edged thing. */
  readonly churn?: number;
  readonly seed?: number;
  readonly facing?: PanelFacing;
}

export interface LuminousPanel {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** Advance the churn, and turn to the camera if this panel does that. */
  update(elapsed: number, camera: Camera): void;
}

const PANEL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PANEL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uSoft;
  uniform float uTaper;
  uniform float uLean;
  uniform float uChurn;
  uniform float uSeed;
  varying vec2 vUv;

  ${NOISE}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    // The half-width at this height. A door spill is wider where it has
    // travelled further from the door.
    float width = mix(1.0, uTaper, vUv.y);
    float soft = clamp(uSoft, 0.03, 1.0);

    // Soft edges rather than a discard: a discard is an unantialiased cutoff and
    // it disables early-Z, which every tile-based GPU pays for on every panel.
    float across = 1.0 - smoothstep(width * (1.0 - soft), width, abs(p.x));
    float along = 1.0 - smoothstep(1.0 - soft, 1.0, abs(p.y));
    float field = across * along;

    // Light is never even. One end is nearer whatever is giving it off.
    float lean = clamp(1.0 + uLean * (vUv.y - 0.5) * 1.7, 0.0, 2.0);

    // Two octaves: a panel is a broad, slow thing and the upper octaves of the
    // noise are below a pixel at every size one is ever drawn at.
    float churn = 1.0;
    if (uChurn > 0.001) {
      float n = fbm(vec3(vUv * 2.4 + uSeed, uTime * 0.07 + uSeed), 2);
      churn = mix(1.0, 0.52 + n * 0.96, clamp(uChurn, 0.0, 1.0));
    }

    float density = field * lean * churn;
    gl_FragColor = vec4(uColor * density * uIntensity, clamp(density * 0.9, 0.0, 1.0));
  }
`;

/** A sheet of light: the only shape a remembered moment is built from. */
export function luminousPanel(tracker: ResourceTracker, options: PanelOptions): LuminousPanel {
  const geometry = tracker.track(new PlaneGeometry(options.width, options.height));
  const material = tracker.track(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(options.color) },
        uIntensity: { value: options.intensity ?? 1 },
        uSoft: { value: options.softness ?? 0.4 },
        uTaper: { value: options.taper ?? 1 },
        uLean: { value: options.lean ?? 0 },
        uChurn: { value: options.churn ?? 0.3 },
        uSeed: { value: options.seed ?? 0 },
      },
      vertexShader: PANEL_VERTEX,
      fragmentShader: PANEL_FRAGMENT,
    }),
  );
  const mesh = new Mesh(geometry, material);
  const facing = options.facing ?? 'fixed';
  const toCamera = new Vector3();
  const wanted = new Quaternion();
  const parentTurn = new Quaternion();
  const UP = new Vector3(0, 1, 0);
  return {
    mesh,
    material,
    update(elapsed, camera) {
      setU(material, 'uTime', elapsed);
      if (facing === 'upright') {
        // Turn about the vertical only. A full billboard would tip a standing
        // figure over whenever the player looked down at it.
        //
        // Resolved against the parent's rotation, not written straight into the
        // local one. A moment is a group with its own yaw — no two places in a
        // life are squared up with each other — and writing a world-space angle
        // into a child's local rotation leaves it off by exactly that yaw. The
        // moments turned furthest from the axes were rendering edge-on, so two
        // of the four distant moments were lit floors with nobody standing on
        // them, which is the one thing a remembered moment must never be.
        mesh.getWorldPosition(toCamera);
        toCamera.subVectors(camera.position, toCamera);
        wanted.setFromAxisAngle(UP, Math.atan2(toCamera.x, toCamera.z));
        if (mesh.parent) {
          mesh.parent.getWorldQuaternion(parentTurn);
          mesh.quaternion.copy(parentTurn.invert().multiply(wanted));
        } else {
          mesh.quaternion.copy(wanted);
        }
      }
    },
  };
}

// --- moments --------------------------------------------------------------------

/** Someone in a remembered moment. Height and distance are all the detail there is. */
export interface MomentPresence {
  /** Where they stand, relative to the moment's origin, on its floor. */
  readonly at: readonly [number, number];
  readonly height: number;
  readonly width?: number;
  readonly color: number;
  readonly intensity?: number;
}

/** An upright opening: a door, a lit hallway, a window onto a landing. */
export interface MomentOpening {
  readonly at: readonly [number, number];
  readonly width: number;
  readonly height: number;
  readonly color: number;
  readonly intensity?: number;
  /** Which way the opening faces, in radians about the vertical. */
  readonly turn?: number;
  /**
   * 1 is wide open — a rectangle of light with a hard edge. 0 is shut, and all
   * that is left of it is the seam the light still comes through.
   */
  readonly open: number;
  /** How far the light from it reaches across the floor. 0 for none. */
  readonly reach?: number;
}

export interface MomentSpec {
  /** The ground this happened on. Its extent is how big the place was. */
  readonly floor: {
    readonly width: number;
    readonly depth: number;
    readonly color: number;
    readonly intensity?: number;
    /** 0 is a floor with a definite extent, 1 a glow that never ends. */
    readonly edge?: number;
  };
  readonly opening?: MomentOpening;
  readonly presences: readonly MomentPresence[];
  /**
   * A light the people in the moment are sharing — a lamp between them, a fire,
   * a screen. Its position relative to each of them is most of what the moment
   * says.
   */
  readonly shared?: {
    readonly at: readonly [number, number, number];
    readonly radius: number;
    readonly color: number;
    readonly intensity?: number;
  };
  readonly seed?: number;
}

export interface RememberedMoment {
  readonly group: Group;
  /** 0 = not present at all, 1 = fully present. Scales light, never position. */
  setPresence(amount: number): void;
  update(elapsed: number, camera: Camera): void;
}

/**
 * One held instant of space.
 *
 * Deliberately not a frame and not a slideshow. Several of these stand at
 * different depths in the same dark at the same time, which is the form
 * `L-THRESH-07`'s panoramic, simultaneous review takes here: the player turns
 * their head rather than waiting for the next slide, and the whole life is
 * already there whether or not it is being looked at.
 *
 * Nothing in here reads the soul's ledger, scores anything, or reacts to where
 * the player is. A moment is just there, which is the difference between being
 * shown your life and being tried for it (`L-THRESH-06`).
 */
export function rememberedMoment(tracker: ResourceTracker, spec: MomentSpec): RememberedMoment {
  const group = new Group();
  const panels: { panel: LuminousPanel; base: number }[] = [];
  const seed = spec.seed ?? 0;

  const add = (panel: LuminousPanel, base: number): void => {
    panels.push({ panel, base });
    group.add(panel.mesh);
  };

  // The ground. Laid flat, soft all round, so the place has an extent and an
  // edge rather than a boundary.
  const floor = luminousPanel(tracker, {
    width: spec.floor.width,
    height: spec.floor.depth,
    color: spec.floor.color,
    intensity: spec.floor.intensity ?? 0.3,
    softness: spec.floor.edge ?? 0.85,
    churn: 0.45,
    seed: seed + 0.5,
  });
  floor.mesh.rotation.x = -Math.PI / 2;
  floor.mesh.position.y = 0.012;
  add(floor, spec.floor.intensity ?? 0.3);

  const opening = spec.opening;
  if (opening) {
    const open = Math.min(1, Math.max(0, opening.open));
    // A shut door is the same opening with almost no width left: the light is
    // still on in there, and all that reaches this room is the seam.
    const width = opening.width * (0.045 + open * 0.955);
    const door = luminousPanel(tracker, {
      width,
      height: opening.height,
      color: opening.color,
      intensity: (opening.intensity ?? 1) * (1 - open * 0.35),
      // Hard-edged. This is the one thing in a moment that is not a glow, and
      // that is what makes it read as an opening in something solid.
      softness: 0.08 + open * 0.05,
      lean: -0.55,
      churn: 0.08,
      seed: seed + 1.5,
    });
    door.mesh.position.set(opening.at[0], opening.height / 2, opening.at[1]);
    door.mesh.rotation.y = opening.turn ?? 0;
    add(door, (opening.intensity ?? 1) * (1 - open * 0.35));

    const reach = opening.reach ?? 0;
    if (reach > 0.01) {
      // The light lying on the floor in front of it, widening as it goes. This
      // is the thing that says a door is open from across a dark room.
      const spill = luminousPanel(tracker, {
        width: opening.width * (0.1 + open * 0.9),
        height: reach,
        color: opening.color,
        intensity: (opening.intensity ?? 1) * 0.3 * (0.2 + open * 0.8),
        softness: 0.55,
        taper: 1.0 + open * 1.4,
        lean: -0.75,
        churn: 0.3,
        seed: seed + 2.5,
      });
      // Laid flat and then turned so that its tapering end points the way the
      // opening faces. `YXZ` so the turn is applied in world terms after the
      // panel has been laid down; the extra half-turn is because laying a panel
      // flat sends its far edge to -Z, and the light travels the other way.
      const turn = opening.turn ?? 0;
      spill.mesh.rotation.order = 'YXZ';
      spill.mesh.rotation.set(-Math.PI / 2, turn + Math.PI, 0);
      spill.mesh.position.set(
        opening.at[0] + Math.sin(turn) * (reach / 2),
        0.03,
        opening.at[1] + Math.cos(turn) * (reach / 2),
      );
      add(spill, (opening.intensity ?? 1) * 0.3 * (0.2 + open * 0.8));
    }
  }

  const shared = spec.shared;
  if (shared) {
    const lamp = luminousPanel(tracker, {
      width: shared.radius * 2,
      height: shared.radius * 2,
      color: shared.color,
      intensity: shared.intensity ?? 1,
      softness: 1,
      churn: 0.5,
      seed: seed + 3.5,
      facing: 'upright',
    });
    lamp.mesh.position.set(shared.at[0], shared.at[1], shared.at[2]);
    add(lamp, shared.intensity ?? 1);
  }

  spec.presences.forEach((person, index) => {
    const body = luminousPanel(tracker, {
      width: person.width ?? person.height * 0.3,
      height: person.height,
      color: person.color,
      intensity: person.intensity ?? 0.85,
      // Soft, but not formless: a column with a waist to it rather than a blob.
      softness: 0.62,
      taper: 0.72,
      // Brightest at the foot, where they are standing in the light of the
      // place, and thinning upward. The same reading the near figures get.
      lean: -0.5,
      churn: 0.22,
      seed: seed + 5 + index,
      facing: 'upright',
    });
    body.mesh.position.set(person.at[0], person.height / 2, person.at[1]);
    add(body, person.intensity ?? 0.85);
  });

  return {
    group,
    setPresence(amount) {
      const present = Math.min(1, Math.max(0, amount));
      for (const entry of panels) {
        setU(entry.panel.material, 'uIntensity', entry.base * present);
      }
    },
    update(elapsed, camera) {
      for (const entry of panels) {
        entry.panel.update(elapsed, camera);
      }
    },
  };
}
