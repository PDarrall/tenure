import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { runSeasons } from '../src/sim/advance.js'
import { careerScore, legacy, promotionPointsFrom, trophyPointsFor } from '../src/scoring/score.js'
import { managerById } from '../src/lookup.js'
import { T } from '../src/tunables.js'

describe('trophy points', () => {
  it('matches the DESIGN table', () => {
    expect(trophyPointsFor({ season: 1, competition: 'championsCup' })).toBe(120)
    expect(trophyPointsFor({ season: 1, competition: 'europaCup' })).toBe(70)
    expect(trophyPointsFor({ season: 1, competition: 'conferenceCup' })).toBe(40)
    expect(trophyPointsFor({ season: 1, competition: 'league', tier: 1 })).toBe(100)
    expect(trophyPointsFor({ season: 1, competition: 'nationalCup' })).toBe(50)
    expect(trophyPointsFor({ season: 1, competition: 'leagueCup' })).toBe(25)
    expect(trophyPointsFor({ season: 1, competition: 'league', tier: 2 })).toBe(40)
    expect(trophyPointsFor({ season: 1, competition: 'league', tier: 3 })).toBe(25)
    expect(trophyPointsFor({ season: 1, competition: 'league', tier: 4 })).toBe(15)
    expect(trophyPointsFor({ season: 1, competition: 'league', tier: 5 })).toBe(10)
    expect(promotionPointsFrom(2)).toBe(20)
    expect(promotionPointsFrom(3)).toBe(12)
    expect(promotionPointsFrom(4)).toBe(8)
    expect(promotionPointsFrom(5)).toBe(5)
  })
})

describe('legacy', () => {
  it('lands the 30-year mid-table and 12-year trophy-laden archetypes within the tolerance', () => {
    const a = T.LEGACY_ARCHETYPES.midTableThirtyYears
    const b = T.LEGACY_ARCHETYPES.trophyLadenTwelveYears
    const la = legacy(a.games, a.earnings, a.trophyPoints)
    const lb = legacy(b.games, b.earnings, b.trophyPoints)
    expect(Math.abs(la - lb) / Math.max(la, lb)).toBeLessThanOrEqual(T.LEGACY_ARCHETYPES.tolerance)
  })

  it('never deducts: every component is non-negative and unemployment adds nothing', () => {
    expect(legacy(0, 0, 0)).toBe(0)
    expect(legacy(10, 0, 0)).toBeGreaterThan(0)
  })
})

describe('scoring in the world', () => {
  const world = createWorld(1)
  runSeasons(world, 3)

  it('awards points and bonuses to the manager in post when a trophy or promotion happens', () => {
    const awards = world.log.filter((e) => e.type === 'score.trophyPoints')
    expect(awards.length).toBeGreaterThan(20)
    for (const e of awards) {
      const manager = managerById(world, e.payload['managerId'] as number)
      expect(manager.history.trophyPoints).toBeGreaterThanOrEqual(e.payload['points'] as number)
    }
    const trophies = world.log.filter((e) => e.type === 'trophy' && e.payload['managerId'] !== null)
    const titles = awards.filter((e) => e.payload['competition'] !== 'promotion')
    expect(titles).toHaveLength(trophies.length)
    const promotedWithoutTitle = awards.filter((e) => e.payload['competition'] === 'promotion')
    // Three tiers promote three clubs each season minus champions: (4 boundaries × 3 − 4 champions) × 3 seasons at most.
    expect(promotedWithoutTitle.length).toBeGreaterThan(0)
    expect(promotedWithoutTitle.length).toBeLessThanOrEqual(4 * (T.UP_DOWN_PER_BOUNDARY - 1) * 3)
    expect(world.log.some((e) => e.type === 'earnings.bonus')).toBe(true)
  })

  it('reports games, earnings, trophy points and legacy per manager', () => {
    const best = [...world.managers].sort((a, b) => b.history.trophyPoints - a.history.trophyPoints)[0]!
    const score = careerScore(best)
    expect(score.trophyPoints).toBe(best.history.trophyPoints)
    expect(score.games).toBe(best.history.games)
    expect(score.legacy).toBeCloseTo(legacy(score.games, score.earnings, score.trophyPoints, score.playersMade), 5)
    expect(score.legacy).toBeGreaterThan(0)
  })
})
