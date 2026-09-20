/**
 * DESIGN.md "Club", "Requests": four levels from wealth, each read by one
 * rule and neutral at level 3; a stadium from tier and prestige whose
 * capacity caps attendance, expanded only by a granted request: a season of
 * works, then more seats, income on the summer pot and wealth rising over
 * three seasons.
 */
import { describe, expect, it } from 'vitest'
import { T } from '../src/tunables.js'
import { createWorld } from '../src/world/gen.js'
import { runSeasons, runWeeks } from '../src/sim/advance.js'
import { academyRatingBonus, attendanceOf, beginExpansion, capacityFor, coachingFactor, effectiveCapacity, injuryWeeksAt, levelFromWealth, levelsFor, nearCapacity, raiseLevel, settleStadiums, stadiumIncome } from '../src/club/facilities.js'
import { developmentFactor } from '../src/players/made.js'
import { judgementFor, refreshPot } from '../src/market/director.js'
import { normalBudget } from '../src/season/squad.js'

describe('the levels', () => {
  it('come from wealth, one per twenty points, and every effect is neutral at level 3', () => {
    expect(levelFromWealth(0)).toBe(1)
    expect(levelFromWealth(19)).toBe(1)
    expect(levelFromWealth(20)).toBe(2)
    expect(levelFromWealth(59)).toBe(3)
    expect(levelFromWealth(80)).toBe(5)
    expect(levelFromWealth(100)).toBe(5)
    expect(levelsFor(45)).toEqual({ coaching: 3, scouting: 3, medical: 3, academy: 3 })
    expect(coachingFactor(T.LEVEL_NEUTRAL)).toBe(1)
    expect(coachingFactor(5)).toBeGreaterThan(coachingFactor(1))
    expect(developmentFactor(50, 5)).toBeGreaterThan(developmentFactor(50, 3))
    expect(developmentFactor(50)).toBe(developmentFactor(50, T.LEVEL_NEUTRAL))
    expect(injuryWeeksAt(10, T.LEVEL_NEUTRAL)).toBe(10)
    expect(injuryWeeksAt(10, 5)).toBeLessThan(10)
    expect(injuryWeeksAt(10, 1)).toBeGreaterThan(10)
    expect(injuryWeeksAt(1, 5)).toBe(1)
    expect(injuryWeeksAt(0, 1)).toBe(0)
    expect(academyRatingBonus(T.LEVEL_NEUTRAL)).toBe(0)
    expect(academyRatingBonus(4)).toBeGreaterThan(0)
    expect(judgementFor(null, 50, 5)).toBeGreaterThan(judgementFor(null, 50, 3))
    expect(judgementFor(null, 50)).toBe(judgementFor(null, 50, levelFromWealth(50)))
  })

  it('a level up sharpens the director when it is scouting, and stops at the top', () => {
    const world = createWorld(7)
    const club = world.clubs[0]!
    club.levels.scouting = 3
    club.director.judgement = 50
    expect(raiseLevel(world, club, 'scouting')).toBe(4)
    expect(club.director.judgement).toBe(50 + T.DIRECTOR_JUDGEMENT_PER_SCOUTING_LEVEL)
    club.levels.coaching = T.LEVEL_MAX
    expect(raiseLevel(world, club, 'coaching')).toBe(T.LEVEL_MAX)
    expect(world.log.filter((e) => e.type === 'club.level')).toHaveLength(2)
  })

  it('every club is generated with levels and a stadium, and a season plays through them', () => {
    const world = createWorld(8)
    for (const c of world.clubs) {
      for (const level of Object.values(c.levels)) {
        expect(level).toBeGreaterThanOrEqual(1)
        expect(level).toBeLessThanOrEqual(T.LEVEL_MAX)
      }
      expect(c.levels).toEqual(levelsFor(c.wealth))
      expect(c.stadium.capacity).toBeGreaterThan(0)
      expect(c.stadium.expansion).toBeNull()
    }
    const mean = (tier: number) => {
      const clubs = world.clubs.filter((c) => c.tier === tier)
      return clubs.reduce((s, c) => s + c.stadium.capacity, 0) / clubs.length
    }
    expect(mean(1)).toBeGreaterThan(mean(5))
    runWeeks(world, 6)
    expect(world.log.some((e) => e.type === 'player.injured')).toBe(true)
    for (const e of world.log.filter((x) => x.type === 'player.injured')) expect(e.payload['weeks'] as number).toBeGreaterThanOrEqual(1)
  })
})

describe('the stadium', () => {
  it('capacity comes from tier and prestige; attendance from form, capped by the seats on sale', () => {
    expect(capacityFor(1, 50)).toBeGreaterThan(capacityFor(5, 50))
    expect(capacityFor(3, 80)).toBeGreaterThan(capacityFor(3, 20))
    const world = createWorld(9)
    const club = world.clubs.find((c) => c.tier === 3)!
    club.form = ['W', 'W', 'W', 'W', 'W']
    const full = attendanceOf(world, club)
    club.form = ['L', 'L', 'L', 'L', 'L']
    const empty = attendanceOf(world, club)
    expect(full).toBeGreaterThan(empty)
    expect(full).toBeLessThanOrEqual(club.stadium.capacity)
    club.form = ['W', 'W', 'W', 'W', 'W']
    expect(nearCapacity(world, club)).toBe(true)
    club.form = ['L', 'L', 'L', 'L', 'L']
    expect(nearCapacity(world, club)).toBe(false)
  })

  it('the works: the cost off the pot then cash, fewer seats this season, more from the next, wealth up at three season ends, income on the summer pot', () => {
    const world = createWorld(10)
    const club = world.clubs.find((c) => c.tier === 2)!
    club.transferPot = 5
    club.cash = 0
    const before = club.stadium.capacity
    const e = beginExpansion(world, club, 8)
    expect(club.transferPot).toBe(0)
    expect(club.cash).toBe(-3)
    expect(effectiveCapacity(world, club)).toBeLessThan(before)
    expect(attendanceOf(world, club)).toBeLessThanOrEqual(effectiveCapacity(world, club))
    expect(e.to).toBeGreaterThan(before)
    expect(stadiumIncome(club)).toBe(0)
    const wealth = club.wealth
    settleStadiums(world)
    expect(club.stadium.capacity).toBe(e.to)
    expect(effectiveCapacity(world, club)).toBe(e.to)
    expect(club.wealth).toBe(wealth + T.STADIUM_WEALTH_PER_SEASON)
    expect(stadiumIncome(club)).toBeCloseTo((e.to - e.from) * T.STADIUM_INCOME_PER_K, 5)
    refreshPot(world, club, 'summer', 1)
    expect(club.transferPot).toBeCloseTo(normalBudget(club) + stadiumIncome(club), 5)
    for (let i = 0; i < 3; i++) {
      world.season++
      settleStadiums(world)
    }
    expect(club.wealth).toBe(wealth + T.STADIUM_WEALTH_SEASONS * T.STADIUM_WEALTH_PER_SEASON)
    expect(world.log.filter((x) => x.type === 'stadium.expanded')).toHaveLength(1)
  })

  it('over a simulated season the works land where the calendar says: cut now, open at the season end, the crowd reported', () => {
    const world = createWorld(11)
    runWeeks(world, 5)
    const club = world.clubs.find((c) => c.tier === 1)!
    const before = club.stadium.capacity
    beginExpansion(world, club, 1)
    expect(effectiveCapacity(world, club)).toBeLessThan(before)
    runSeasons(world, 1)
    expect(club.stadium.capacity).toBeGreaterThan(before)
    expect(club.stadium.added).toBeCloseTo(club.stadium.capacity - before, 5)
    expect(club.stadium.expansion!.wealthSeasonsLeft).toBe(T.STADIUM_WEALTH_SEASONS - 1)
    expect(effectiveCapacity(world, club)).toBe(club.stadium.capacity)
    const opened = world.log.find((e) => e.type === 'stadium.expanded' && e.payload['clubId'] === club.id)!
    expect(opened).toBeDefined()
    expect(opened.week % T.SEASON_WEEKS).toBe(T.MATCH_WEEKS)
    const gates = world.log.filter((e) => e.type === 'club.attendance' && e.payload['clubId'] === club.id)
    expect(gates).toHaveLength(1)
    expect(gates[0]!.payload['capacity']).toBe(club.stadium.capacity)
  })
})
