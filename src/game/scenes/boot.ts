import { IcosahedronGeometry, Mesh, ShaderMaterial, Color } from 'three';
import type { SceneContext, SceneDefinition, SceneInstance } from '../scene';

/**
 * The harness scene. NOT gameplay.
 *
 * It exists so the gate has something real to exercise while the game itself is
 * still empty: one scene that renders, one shader that must actually compile on
 * the GPU, and one set of geometries and materials that must come back on
 * unload. Delete it once `content-notes` is the real entry point.
 *
 * The shader is deliberately plain — a seeded drift over a dark form. Visual
 * grammar belongs to the real scenes (GAME_BRIEF.md § Platform and art
 * direction), not here.
 */

const vertexShader = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vPositionLocal;

  void main() {
    vNormalView = normalize(normalMatrix * normal);
    vPositionLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uDrift;
  uniform vec3 uInner;
  uniform vec3 uOuter;

  varying vec3 vNormalView;
  varying vec3 vPositionLocal;

  void main() {
    // Rim term: bright where the surface turns away from the viewer. The spirit
    // body is emissive, so even the harness reads as light rather than lit mass.
    float facing = clamp(dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.5);

    // A slow banded drift so a stalled frame loop is visible to the eye.
    float band = sin(vPositionLocal.y * 3.0 + uTime * 0.6 + uDrift) * 0.5 + 0.5;

    vec3 color = mix(uInner, uOuter, rim);
    color += band * 0.06;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const bootScene: SceneDefinition = {
  id: 'boot',
  title: 'Seed of Samsara',
  exits: [
    // The harness scene's only exit is itself, which keeps it a legal
    // non-terminal state while nothing else is built. It will point at
    // `content-notes` as soon as that scene exists.
    { id: 'reload', label: 'Again', to: 'boot' },
  ],
  create(context: SceneContext): SceneInstance {
    const geometry = context.resources.track(new IcosahedronGeometry(1.1, 3));
    const material = context.resources.track(
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          // The one draw this scene makes, so the form's phase is seed-stable.
          uDrift: { value: context.rng.range(0, Math.PI * 2) },
          uInner: { value: new Color(0x0b0a14) },
          uOuter: { value: new Color(0x6f5bd0) },
        },
      }),
    );

    const mesh = new Mesh(geometry, material);
    context.scene.add(mesh);
    context.camera.position.set(0, 0, 3.4);
    context.camera.lookAt(0, 0, 0);

    return {
      update(delta, elapsed) {
        material.uniforms['uTime'] = { value: elapsed };
        mesh.rotation.y += delta * 0.25;
        mesh.rotation.x += delta * 0.08;
      },
    };
  },
};
