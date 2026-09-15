/**
 * Seeded random number generator for the engine.
 *
 * xoshiro128** (32-bit) seeded through splitmix32. The generator state is a
 * plain array of four unsigned 32-bit integers, so it can live inside the
 * saved game state and be serialised as JSON. Every function that needs
 * randomness receives an `Rng`; nothing in the engine may call
 * `Math.random()`.
 */

/** Four unsigned 32-bit words. Stored inside `World` so a save resumes exactly. */
export type RngState = [number, number, number, number]

export interface Rng {
  /** Uniform float in [0, 1). */
  float(): number
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number
  /** True with probability `p`. */
  chance(p: number): boolean
  /** One element chosen uniformly. Throws on an empty array. */
  pick<T>(items: readonly T[]): T
  /** One element chosen with probability proportional to its weight. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T
  /** Fisher–Yates shuffle, in place, returns the same array. */
  shuffle<T>(items: T[]): T[]
  /** Approximately normal sample (Box–Muller). */
  normal(mean: number, sd: number): number
  /** The live state array. Mutating it mutates the generator. */
  readonly state: RngState
}

function splitmix32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x9e3779b9) | 0
    let t = a ^ (a >>> 16)
    t = Math.imul(t, 0x21f0aaad)
    t = t ^ (t >>> 15)
    t = Math.imul(t, 0x735a2d97)
    t = t ^ (t >>> 15)
    return t >>> 0
  }
}

/** Derive a fresh generator state from an integer seed. */
export function seedState(seed: number): RngState {
  const mix = splitmix32(Math.trunc(seed))
  const state: RngState = [mix(), mix(), mix(), mix()]
  // xoshiro must never be all-zero.
  if (state.every((w) => w === 0)) state[0] = 1
  return state
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0
}

class Xoshiro implements Rng {
  constructor(readonly state: RngState) {}

  private nextU32(): number {
    const s = this.state
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0
    const t = (s[1] << 9) >>> 0
    s[2] = (s[2] ^ s[0]) >>> 0
    s[3] = (s[3] ^ s[1]) >>> 0
    s[1] = (s[1] ^ s[2]) >>> 0
    s[0] = (s[0] ^ s[3]) >>> 0
    s[2] = (s[2] ^ t) >>> 0
    s[3] = rotl(s[3], 11)
    return result
  }

  float(): number {
    return this.nextU32() / 4294967296
  }

  int(min: number, max: number): number {
    if (max < min) throw new Error(`rng.int: max ${max} < min ${min}`)
    return min + Math.floor(this.float() * (max - min + 1))
  }

  chance(p: number): boolean {
    if (p <= 0) return false
    if (p >= 1) return true
    return this.float() < p
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('rng.pick: empty array')
    return items[Math.floor(this.float() * items.length)] as T
  }

  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0) throw new Error('rng.weighted: empty array')
    if (items.length !== weights.length) throw new Error('rng.weighted: length mismatch')
    let total = 0
    for (const w of weights) total += Math.max(0, w)
    if (total <= 0) return this.pick(items)
    let r = this.float() * total
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i] as number)
      if (r < 0) return items[i] as T
    }
    return items[items.length - 1] as T
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1))
      const tmp = items[i] as T
      items[i] = items[j] as T
      items[j] = tmp
    }
    return items
  }

  normal(mean: number, sd: number): number {
    let u = this.float()
    if (u < 1e-12) u = 1e-12
    const v = this.float()
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    return mean + sd * z
  }
}

/** Wrap an existing state array. The array is mutated as numbers are drawn. */
export function rngFromState(state: RngState): Rng {
  return new Xoshiro(state)
}

/** Convenience: a generator seeded from an integer. */
export function createRng(seed: number): Rng {
  return new Xoshiro(seedState(seed))
}
