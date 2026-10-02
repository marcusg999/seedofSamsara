import { Color, Group, Vector3, type Camera } from 'three';
import type { ResourceTracker } from '../disposal';
import type { SoulState } from '../soul';
import { volumetricGlow } from './forms';
import { setU } from './glsl';

/**
 * The player's spirit body.
 *
 * GAME_BRIEF.md § Platform and art direction: the spirit body is emissive, its
 * brightness and colour reflect karma, so the world shows the soul's state. The
 * brief attributes this to Franchezzo, and the lore bible records the detail
 * that matters here (`L-FRAN-03`): in the source the body is the soul's own
 * record, and other spirits read it before the narrator can.
 *
 * The slice is first person, so the player meets their own body the way you meet
 * your own hands — by looking down. The glow rides just below and ahead of the
 * camera, which puts it in frame on a downward look and out of frame otherwise.
 */

/** Karma is a ledger, not a score, so it is mapped to appearance by bands. */
function appearanceFor(karma: number): { color: number; intensity: number } {
  if (karma <= -3) {
    // Heavy debt: dim, and the colour has gone out of it.
    return { color: 0x6a5f72, intensity: 0.42 };
  }
  if (karma < 0) {
    return { color: 0x9a86a8, intensity: 0.6 };
  }
  if (karma === 0) {
    return { color: 0xc9bcd8, intensity: 0.78 };
  }
  if (karma < 3) {
    return { color: 0xffd9a8, intensity: 0.95 };
  }
  return { color: 0xfff0d2, intensity: 1.25 };
}

export interface SpiritBody {
  readonly group: Group;
  /** Call once per frame, after the rig has moved. */
  update(elapsed: number, camera: Camera, soul: SoulState): void;
  /** What the body currently looks like, for the test API and the gate. */
  readonly appearance: { color: number; intensity: number };
}

export function createSpiritBody(tracker: ResourceTracker): SpiritBody {
  const group = new Group();

  const core = volumetricGlow(tracker, {
    radius: 0.42,
    color: 0xc9bcd8,
    intensity: 0.8,
    softness: 2.3,
  });
  group.add(core.mesh);

  const halo = volumetricGlow(tracker, {
    radius: 0.95,
    color: 0xc9bcd8,
    intensity: 0.3,
    softness: 3,
  });
  group.add(halo.mesh);

  const offset = new Vector3();
  const forward = new Vector3();
  // Persistent, so the per-frame update allocates nothing.
  const tint = new Color(0xc9bcd8);
  let current = appearanceFor(0);

  return {
    group,
    get appearance() {
      return current;
    },
    update(elapsed, camera, soul) {
      current = appearanceFor(soul.karma);

      // Sit below and slightly ahead of the eye, so a downward look finds it.
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      offset.copy(camera.position).addScaledVector(forward, 0.55);
      offset.y -= 0.62;
      group.position.copy(offset);

      core.update(elapsed, camera);
      halo.update(elapsed, camera);

      // A slow breath, so the body reads as something alive rather than a lamp.
      const breath = 0.92 + Math.sin(elapsed * 0.7) * 0.08;
      tint.setHex(current.color);
      setU(core.material, 'uIntensity', current.intensity * breath);
      setU(halo.material, 'uIntensity', current.intensity * 0.36 * breath);
      setU(core.material, 'uColor', tint);
      setU(halo.material, 'uColor', tint);
    },
  };
}
