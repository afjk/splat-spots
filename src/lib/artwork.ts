/**
 * Card artwork, drawn by this site.
 *
 * Splat Spots does not copy, cache or re-encode anyone's imagery, so a listing
 * has no photograph to show. Rather than an apologetic empty box, each capture
 * gets a field of points derived from its own id: stable, unique to the
 * listing, and entirely ours. It suggests the medium without borrowing from it.
 */

export type Point = { x: number; y: number; r: number; o: number };

/** Small deterministic PRNG (mulberry32) so a capture always draws the same. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hueFor(id: string): number {
  return hash(id) % 360;
}

/**
 * Points cluster along a horizon and thin out above it, which reads as a
 * space rather than as noise.
 */
export function pointsFor(id: string, count = 190): Point[] {
  const random = seeded(hash(id));
  const horizon = 0.52 + random() * 0.14;
  const points: Point[] = [];

  for (let i = 0; i < count; i += 1) {
    const x = random();
    const bias = random() ** 1.7;
    const y = horizon + (random() < 0.72 ? bias * (1 - horizon) : -bias * horizon);
    const depth = 1 - Math.abs(y - horizon) / Math.max(horizon, 1 - horizon);

    points.push({
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      r: Math.round((0.4 + depth * 1.9 + random() * 0.6) * 100) / 100,
      o: Math.round((0.16 + depth * 0.6 + random() * 0.2) * 100) / 100,
    });
  }
  return points;
}
