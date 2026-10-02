import { Euler, MathUtils, Quaternion, Vector3, type PerspectiveCamera } from 'three';

/**
 * Camera and controls.
 *
 * The bar here is a live browser experience that feels good in the hand, so the
 * rules are: input is damped, never snapped; the camera is never wrenched away
 * from where the player is looking; and look speed is identical on mouse, touch
 * and keyboard. Nothing moves the camera by teleport while the player has
 * control — a cut is a scene change, not a camera jump.
 *
 * Two modes carry the whole slice:
 * - `embodied`: first person, look only. The player is in a body that cannot go
 *   anywhere, which is what the vignette needs.
 * - `drifting`: the view has left the body. Look still responds, but the rig is
 *   carried along an authored path, so the player keeps agency over attention
 *   while the scene keeps authority over movement.
 */

export type RigMode = 'embodied' | 'drifting';

export interface RigInput {
  /** Accumulated look delta this frame, in radians. */
  yaw: number;
  pitch: number;
}

const PITCH_LIMIT = MathUtils.degToRad(78);

export class CameraRig {
  readonly position = new Vector3();
  /** Where the rig is being carried to, in `drifting` mode. */
  readonly target = new Vector3();

  private mode: RigMode = 'embodied';
  private yaw = 0;
  private pitch = 0;
  private yawVelocity = 0;
  private pitchVelocity = 0;
  private readonly basis = new Quaternion();
  private readonly scratch = new Euler(0, 0, 0, 'YXZ');
  /** Low-frequency sway so a held shot is never dead still. */
  private swayPhase = 0;
  private swayAmount = 1;
  /** Heartbeat-driven push, set by the vignette. */
  private pulse = 0;
  /**
   * Roll, in radians. Only a scene that has taken the body away from the player
   * should use it — a rolled horizon under player control reads as a bug.
   */
  private roll = 0;

  private readonly detach: (() => void)[] = [];
  private pointerDown = false;
  private lastPointer: { x: number; y: number } | undefined;
  private readonly keys = new Set<string>();
  private sensitivity = 0.0022;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly element: HTMLElement,
  ) {
    this.bind();
  }

  setMode(mode: RigMode): void {
    this.mode = mode;
  }

  /** Face a direction without animating — only legal at a scene's first frame. */
  orient(yaw: number, pitch = 0): void {
    this.yaw = yaw;
    this.pitch = MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.yawVelocity = 0;
    this.pitchVelocity = 0;
  }

  /** How much idle sway to apply. 0 for a locked-off shot. */
  setSway(amount: number): void {
    this.swayAmount = amount;
  }

  /** 0..1 kick, used to push the frame on each heartbeat. */
  setPulse(amount: number): void {
    this.pulse = amount;
  }

  /** Roll the horizon. Used as the body goes down, never during normal play. */
  setRoll(radians: number): void {
    this.roll = radians;
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  /** The direction the player is looking, for scenes that react to attention. */
  lookDirection(into: Vector3): Vector3 {
    return into.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
  }

  /** True when the player is looking within `degrees` of `point`. */
  isLookingAt(point: Vector3, degrees: number): boolean {
    const toPoint = point.clone().sub(this.camera.position).normalize();
    const forward = this.lookDirection(new Vector3());
    return forward.dot(toPoint) >= Math.cos(MathUtils.degToRad(degrees));
  }

  update(delta: number): void {
    // Keyboard look feeds the same velocity as the pointer, so the feel matches.
    const keyYaw = (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0)
      - (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0);
    const keyPitch = (this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0)
      - (this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0);
    this.yawVelocity += keyYaw * 1.6 * delta;
    this.pitchVelocity += keyPitch * 1.2 * delta;

    // Critically damped-ish decay: responsive, but never a hard stop.
    const damping = Math.exp(-9 * delta);
    this.yaw += this.yawVelocity * delta * 8;
    this.pitch += this.pitchVelocity * delta * 8;
    this.yawVelocity *= damping;
    this.pitchVelocity *= damping;
    this.pitch = MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);

    this.swayPhase += delta;
    const sway = this.swayAmount;
    const swayYaw = Math.sin(this.swayPhase * 0.31) * 0.012 * sway;
    const swayPitch = Math.sin(this.swayPhase * 0.23 + 1.1) * 0.009 * sway;
    const breathe = Math.sin(this.swayPhase * 0.9) * 0.008 * sway;

    this.scratch.set(this.pitch + swayPitch, this.yaw + swayYaw, this.roll);
    this.basis.setFromEuler(this.scratch);
    this.camera.quaternion.copy(this.basis);

    if (this.mode === 'drifting') {
      // Ease toward the authored target rather than tracking it exactly, so a
      // sharp change in the path still reads as a drift.
      this.position.lerp(this.target, 1 - Math.exp(-2.4 * delta));
    }

    this.camera.position.copy(this.position);
    this.camera.position.y += breathe + this.pulse * 0.02;
    // The pulse also nudges focal length, which reads as the chest tightening
    // without moving the body.
    this.camera.fov = 60 - this.pulse * 2.5;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    for (const off of this.detach.splice(0)) {
      off();
    }
    this.keys.clear();
  }

  private bind(): void {
    const onPointerDown = (event: PointerEvent): void => {
      this.pointerDown = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (): void => {
      this.pointerDown = false;
      this.lastPointer = undefined;
    };
    const onPointerMove = (event: PointerEvent): void => {
      // Dragging looks around; a bare mouse move does not, so the page never
      // steals the pointer and the player is never fighting the camera.
      if (!this.pointerDown) {
        return;
      }
      const last = this.lastPointer;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      if (!last) {
        return;
      }
      this.yawVelocity -= (event.clientX - last.x) * this.sensitivity;
      this.pitchVelocity -= (event.clientY - last.y) * this.sensitivity;
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      this.keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      this.keys.delete(event.code);
    };
    const onBlur = (): void => {
      this.keys.clear();
      this.pointerDown = false;
    };

    this.element.addEventListener('pointerdown', onPointerDown);
    globalThis.addEventListener('pointerup', onPointerUp);
    globalThis.addEventListener('pointercancel', onPointerUp);
    globalThis.addEventListener('pointermove', onPointerMove);
    globalThis.addEventListener('keydown', onKeyDown);
    globalThis.addEventListener('keyup', onKeyUp);
    globalThis.addEventListener('blur', onBlur);

    this.detach.push(
      () => { this.element.removeEventListener('pointerdown', onPointerDown); },
      () => { globalThis.removeEventListener('pointerup', onPointerUp); },
      () => { globalThis.removeEventListener('pointercancel', onPointerUp); },
      () => { globalThis.removeEventListener('pointermove', onPointerMove); },
      () => { globalThis.removeEventListener('keydown', onKeyDown); },
      () => { globalThis.removeEventListener('keyup', onKeyUp); },
      () => { globalThis.removeEventListener('blur', onBlur); },
    );
  }

  /** For the test API and the gate. */
  get debug(): { mode: RigMode; yaw: number; pitch: number; roll: number } {
    return { mode: this.mode, yaw: this.yaw, pitch: this.pitch, roll: this.roll };
  }
}
