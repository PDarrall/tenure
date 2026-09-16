import { describe, expect, it } from 'vitest'
import { createRng, rngFromState, seedState } from '../src/rng.js'

describe('seeded rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(1)
    const b = createRng(1)
    const seqA = Array.from({ length: 50 }, () => a.float())
    const seqB = Array.from({ length: 50 }, () => b.float())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 10 }, () => a.float())
    const seqB = Array.from({ length: 10 }, () => b.float())
    expect(seqA).not.toEqual(seqB)
  })

  it('resumes exactly from a JSON round-trip of its state', () => {
    const a = createRng(42)
    for (let i = 0; i < 17; i++) a.float()
    const saved = JSON.parse(JSON.stringify(a.state))
    const b = rngFromState(saved)
    const seqA = Array.from({ length: 20 }, () => a.float())
    const seqB = Array.from({ length: 20 }, () => b.float())
    expect(seqA).toEqual(seqB)
  })

  it('keeps state as four unsigned 32-bit integers', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) rng.float()
    expect(rng.state).toHaveLength(4)
    for (const w of rng.state) {
      expect(Number.isInteger(w)).toBe(true)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('draws floats in [0, 1) with a sensible mean', () => {
    const rng = createRng(3)
    let sum = 0
    const n = 20000
    for (let i = 0; i < n; i++) {
      const x = rng.float()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      sum += x
    }
    expect(sum / n).toBeGreaterThan(0.48)
    expect(sum / n).toBeLessThan(0.52)
  })

  it('draws integers inclusively within bounds and hits both ends', () => {
    const rng = createRng(5)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const x = rng.int(3, 6)
      expect(x).toBeGreaterThanOrEqual(3)
      expect(x).toBeLessThanOrEqual(6)
      seen.add(x)
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6])
  })

  it('weights choices proportionally', () => {
    const rng = createRng(9)
    const counts = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 6000; i++) counts[rng.weighted(['a', 'b', 'c'] as const, [1, 2, 3])]++
    expect(counts.a).toBeLessThan(counts.b)
    expect(counts.b).toBeLessThan(counts.c)
  })

  it('shuffles deterministically and keeps every element', () => {
    const a = createRng(11).shuffle([1, 2, 3, 4, 5, 6, 7, 8])
    const b = createRng(11).shuffle([1, 2, 3, 4, 5, 6, 7, 8])
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('never produces an all-zero state from seed 0', () => {
    const s = seedState(0)
    expect(s.some((w) => w !== 0)).toBe(true)
  })
})
