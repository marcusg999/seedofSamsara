import { Color } from 'three';

/**
 * Each sphere has its own visual grammar (GAME_BRIEF.md § Platform and art
 * direction). These are the grammars the vertical slice needs, defined once so a
 * scene cannot drift off its own palette.
 *
 * The ranges matter as much as the hues: the lower end must genuinely unsettle
 * and the Light must genuinely overwhelm, so `living` sits deliberately drab and
 * `light` deliberately past white.
 */
export interface Grammar {
  /** Fog and void colour. */
  readonly ground: number;
  /** Primary emissive. */
  readonly glow: number;
  /** Secondary emissive, for rim and accent. */
  readonly accent: number;
  /** How far colour is pulled toward grey. 0 = full colour, 1 = monochrome. */
  readonly drain: number;
  /** Bloom strength the scene asks the pipeline for. */
  readonly bloom: number;
  /** Film grain weight. */
  readonly grain: number;
}

export const GRAMMAR = {
  /** The life before: grounded, lightly stylised, a touch too dim to be cheerful. */
  living: { ground: 0x16141b, glow: 0xffd9a8, accent: 0x6e8ba8, drain: 0.25, bloom: 0.35, grain: 0.09 },
  /** The moment of death: colour drains out, geometry stretches. */
  dying: { ground: 0x0a0a0c, glow: 0xd8d2cc, accent: 0x8d7f93, drain: 0.86, bloom: 0.5, grain: 0.17 },
  /** Out of body: cold, clinical, seen from outside. */
  outside: { ground: 0x0c1016, glow: 0xbcd4e4, accent: 0x5f7f9a, drain: 0.62, bloom: 0.45, grain: 0.12 },
  /** The tunnel: living walls, light with weight. */
  tunnel: { ground: 0x07060d, glow: 0xffe7c0, accent: 0x7b5bd6, drain: 0.3, bloom: 0.95, grain: 0.08 },
  /** Figures resolving out of glow. */
  kin: { ground: 0x0b0a14, glow: 0xffe9cf, accent: 0xc8a2ff, drain: 0.12, bloom: 1.05, grain: 0.05 },
  /** The Being of Light: past the top of the spectrum. */
  light: { ground: 0x1b1832, glow: 0xfffdf4, accent: 0x9fe6ff, drain: 0, bloom: 1.6, grain: 0.03 },
  /** The border: held between two pulls. */
  border: { ground: 0x0a0912, glow: 0xf4e9d8, accent: 0x6fd8c4, drain: 0.2, bloom: 0.8, grain: 0.06 },
  /** The review: warm, close, inhabited. */
  review: { ground: 0x120f14, glow: 0xffc98e, accent: 0xa98cff, drain: 0.35, bloom: 0.7, grain: 0.1 },
  /**
   * Hyperspace: the one grammar with no grey in it at all.
   *
   * Every other register in the game reaches its intensity by draining colour
   * out or by pushing light past the top of the range. This one goes the other
   * way: full chroma, two hues that do not belong in the same room, and a
   * ground that is a colour rather than a darkness. `drain` is zero and stays
   * zero, which is what separates it from `dying` — the ordinary world loses
   * its colour at the moment of death, and this place has too much of it.
   */
  hyperspace: { ground: 0x1a0836, glow: 0xffd27a, accent: 0x3fe3cd, drain: 0, bloom: 0.9, grain: 0.05 },
  /**
   * Coming back: the ordinary world, seen by someone who has just been
   * returned to it. Warmer and far less drained than `living`, because the
   * point of the scene is that the kitchen-coloured world is almost unbearably
   * vivid for a while afterwards.
   */
  returning: { ground: 0x120f17, glow: 0xffd2a0, accent: 0x7fd8c8, drain: 0.1, bloom: 0.5, grain: 0.07 },
} as const satisfies Record<string, Grammar>;

export type GrammarName = keyof typeof GRAMMAR;

/** Allocate a Color per call — never share a Color between materials. */
export function colorOf(value: number): Color {
  return new Color(value);
}
