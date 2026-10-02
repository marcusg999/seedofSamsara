/**
 * Shared GLSL fragments. Written for this project — simplex-style value noise
 * and fbm built from hash functions, which is all the slice's shaders need.
 *
 * Kept in one place so a fix to the noise is a fix everywhere, and so the gate's
 * shader compilation covers one implementation rather than six copies.
 */

/** Hash and 3D value noise. */
export const NOISE = /* glsl */ `
  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
  }

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    // Smootherstep: fewer grid artefacts than smoothstep at low octave counts.
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(
      mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      sum += amp * vnoise(p);
      p *= 2.02;
      amp *= 0.5;
    }
    return sum;
  }
`;

/** Perceptual helpers: luminance, saturation pull, and a warm/cool filmic curve. */
export const GRADE = /* glsl */ `
  float luma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }

  vec3 drain(vec3 c, float amount) {
    return mix(c, vec3(luma(c)), clamp(amount, 0.0, 1.0));
  }

  // Tonemap that keeps highlights from clipping to flat white, so the Light can
  // read as overwhelming rather than as a blown-out rectangle.
  vec3 filmic(vec3 c) {
    c = max(vec3(0.0), c);
    return (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  }
`;

import type { IUniform, ShaderMaterial } from 'three';

/**
 * Set a uniform by name.
 *
 * Strict mode treats `material.uniforms['uTime']` as possibly undefined, which it
 * genuinely is — a typo in a uniform name is otherwise a silent no-op that only
 * shows up as a shader that does not animate. This throws instead, so the gate
 * catches the typo on the frame the scene first renders.
 */
export function setU(material: ShaderMaterial, name: string, value: unknown): void {
  const uniform: IUniform | undefined = material.uniforms[name];
  if (!uniform) {
    throw new Error(`Shader material has no uniform "${name}"`);
  }
  uniform.value = value;
}
