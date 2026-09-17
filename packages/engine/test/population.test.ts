/**
 * DESIGN.md "Validation targets": simulate 500 AI careers with no human and
 * check the population looks like the real one. The targets are starting
 * figures to verify against the LMA end-of-season numbers; the bands live in
 * tunables.ts (VALIDATION_TARGETS). A change that moves them out of range
 * fails this file, whatever else it improves.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { runCareers } from '../src/sim/run.js'
import { T } from '../src/tunables.js'
import type { PopulationStats, StatLine } from '../src/stats/population.js'

const CAREERS = 500
const SEED = 1
const MAX_YEARS = 120

let stats: PopulationStats

beforeAll(() => {
  stats = runCareers({ seed: SEED, careers: CAREERS, maxYears: MAX_YEARS }).stats
}, 600_000)

function line(key: keyof typeof T.VALIDATION_TARGETS): StatLine {
  const found = stats.lines.find((l) => l.key === key)
  if (!found) throw new Error(`no stat line ${key}`)
  return found
}

function describeLine(l: StatLine): string {
  const v = l.format === 'share' ? `${(l.value * 100).toFixed(1)}%` : l.value.toFixed(2)
  return `${l.label}: ${v} (target ${l.band.min}–${l.band.max})`
}

describe('500 AI careers (DESIGN.md validation targets, to verify)', () => {
  it('follows 500 careers to the end', () => {
    expect(stats.careersTracked).toBe(CAREERS)
    expect(stats.careersEnded).toBe(CAREERS)
  })

  it('median first-spell length ≈ 1.5 seasons', () => {
    const l = line('firstSpellMedianSeasons')
    expect(l.pass, describeLine(l)).toBe(true)
  })

  it('~30% of first spells end inside a season', () => {
    const l = line('firstSpellInsideSeasonShare')
    expect(l.pass, describeLine(l)).toBe(true)
  })

  it('~40–50% of first-time managers never get a second job', () => {
    const l = line('neverSecondJobShare')
    expect(l.pass, describeLine(l)).toBe(true)
  })

  it('median career ≈ 6–8 seasons', () => {
    const l = line('careerMedianSeasons')
    expect(l.pass, describeLine(l)).toBe(true)
  })

  it('median career spans three or four clubs', () => {
    const l = line('careerMedianClubs')
    expect(l.pass, describeLine(l)).toBe(true)
  })

  it('~10% reach 20 seasons', () => {
    const l = line('twentySeasonShare')
    expect(l.pass, describeLine(l)).toBe(true)
  })

  it('a handful pass 1,000 games', () => {
    const l = line('thousandGameCount')
    expect(l.pass, describeLine(l)).toBe(true)
  })

  it('at any moment, two to four top-tier managers have tenure over five years', () => {
    const l = line('topTierLongTenures')
    expect(l.pass, describeLine(l)).toBe(true)
  })

  it('unjust sackings ≈ 20–30% of all sackings', () => {
    const l = line('unjustSackingShare')
    expect(l.pass, describeLine(l)).toBe(true)
  })

  it('match ratings average ≈ 6.9 with a spread of about 0.6', () => {
    const m = line('ratingMean')
    const sd = line('ratingSpread')
    expect(m.pass, describeLine(m)).toBe(true)
    expect(sd.pass, describeLine(sd)).toBe(true)
  })

  it('no formation or style beats the mean points per game by more than 10%', () => {
    const f = line('formationEdge')
    const st = line('styleEdge')
    expect(f.pass, describeLine(f)).toBe(true)
    expect(st.pass, describeLine(st)).toBe(true)
  })

  it("the best maker's Legacy lands within 20% of the best trophy-winner's", () => {
    const l = line('makerLegacyRatio')
    expect(l.pass, describeLine(l)).toBe(true)
  })

  it('match: goals per game ≈ 2.7 and home / draw / away ≈ 45 / 26 / 29', () => {
    for (const key of ['goalsPerGame', 'homeWinShare', 'drawShare', 'awayWinShare'] as const) {
      const l = line(key)
      expect(l.pass, describeLine(l)).toBe(true)
    }
  })

  it('match: yellows ≈ 3–4 and reds ≈ 0.2 a match', () => {
    for (const key of ['yellowsPerGame', 'redsPerGame'] as const) {
      const l = line(key)
      expect(l.pass, describeLine(l)).toBe(true)
    }
  })

  it('buying finished players yields under 10% of players-made points', () => {
    const l = line('boughtFinishedShare')
    expect(l.pass, describeLine(l)).toBe(true)
  })
})
