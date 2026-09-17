import { describe, expect, it } from 'vitest'
import { performance } from 'node:perf_hooks'
import { createWorld } from '../src/world/gen.js'
import { createRng, type Rng } from '../src/rng.js'
import { runSeasons, runWeeks } from '../src/sim/advance.js'
import { aiMentality, lineupFor } from '../src/season/season.js'
import { matchOdds, playMatch } from '../src/season/match.js'
import { createMatch, runToEnd, sideView, type SideSetup } from '../src/match/minute.js'
import { pressureLean } from '../src/match/model.js'
import { FAST_PATH_TABLE } from '../src/match/fastpath.js'
import type { Club, World } from '../src/types.js'

function setupFor(world: World, rng: Rng, club: Club): SideSetup {
  const s = lineupFor(world, rng, club.id, { bigGame: false })
  return { clubId: club.id, name: club.name, isHuman: false, managerId: null, participant: s.participant, xi: s.lineup.xi, bench: s.lineup.bench, formation: club.formation }
}

interface Agreement {
  n: number
  engine: { goals: number; homeGoals: number; awayGoals: number; home: number; draw: number; away: number }
  fast: { goals: number; homeGoals: number; awayGoals: number; home: number; draw: number; away: number }
}

/** Play N same-tier pairings through the minute engine and read the fast path's odds for the same sides. */
function compare(world: World, seed: number, n: number): Agreement {
  const rng = createRng(seed)
  const e = { goals: 0, homeGoals: 0, awayGoals: 0, home: 0, draw: 0, away: 0 }
  const f = { goals: 0, homeGoals: 0, awayGoals: 0, home: 0, draw: 0, away: 0 }
  let played = 0
  while (played < n) {
    const home = rng.pick(world.clubs)
    const away = rng.pick(world.clubs)
    if (home.id === away.id || home.tier !== away.tier) continue
    aiMentality(world, home.id, away.squad.strength)
    aiMentality(world, away.id, home.squad.strength)
    const h = setupFor(world, rng, home)
    const a = setupFor(world, rng, away)
    const odds = matchOdds(h.participant, a.participant)
    const state = createMatch(world, rng, h, a, false)
    runToEnd(state)
    played++
    e.homeGoals += state.home.goals
    e.awayGoals += state.away.goals
    if (state.home.goals > state.away.goals) e.home++
    else if (state.home.goals === state.away.goals) e.draw++
    else e.away++
    f.homeGoals += odds.lambdaHome
    f.awayGoals += odds.lambdaAway
    f.home += odds.pHome
    f.draw += odds.pDraw
    f.away += odds.pAway
  }
  const norm = (x: typeof e) => ({ goals: (x.homeGoals + x.awayGoals) / n, homeGoals: x.homeGoals / n, awayGoals: x.awayGoals / n, home: x.home / n, draw: x.draw / n, away: x.away / n })
  return { n, engine: norm(e), fast: norm(f) }
}

function expectAgreement(a: Agreement, shareTolerance: number, goalTolerance: number): void {
  const label = JSON.stringify(a)
  expect(Math.abs(a.fast.home - a.engine.home), label).toBeLessThan(shareTolerance)
  expect(Math.abs(a.fast.draw - a.engine.draw), label).toBeLessThan(shareTolerance)
  expect(Math.abs(a.fast.away - a.engine.away), label).toBeLessThan(shareTolerance)
  expect(Math.abs(a.fast.goals - a.engine.goals), label).toBeLessThan(goalTolerance)
  // Home advantage: the goal margin the home side enjoys.
  expect(Math.abs(a.fast.homeGoals - a.fast.awayGoals - (a.engine.homeGoals - a.engine.awayGoals)), label).toBeLessThan(goalTolerance / 2)
}

describe('the fast path against the minute engine', () => {
  it('carries a calibrated table', () => {
    expect(FAST_PATH_TABLE.edges.length).toBeGreaterThan(2)
    expect(FAST_PATH_TABLE.home).toHaveLength(FAST_PATH_TABLE.edges.length - 1)
    expect(FAST_PATH_TABLE.meta['samples']).toBeGreaterThan(10000)
  })

  it('agrees on result distributions, goals per game and home advantage on a settled world', { timeout: 60_000 }, () => {
    const world = createWorld(31)
    runSeasons(world, 2)
    runWeeks(world, 1)
    const a = compare(world, 5, 1200)
    expectAgreement(a, 0.035, 0.25)
    // And both land near the DESIGN targets (to verify): 2.7 goals, 45 / 26 / 29.
    expect(a.engine.goals).toBeGreaterThan(2.3)
    expect(a.engine.goals).toBeLessThan(3.2)
    expect(a.engine.home).toBeGreaterThan(a.engine.away)
  })

  it('agrees on a fresh world too, where the gaps between sides are wide', { timeout: 60_000 }, () => {
    const world = createWorld(32)
    runWeeks(world, 2)
    const a = compare(world, 6, 800)
    expectAgreement(a, 0.04, 0.3)
  })

  it('reads the same kick-off lean as the minute engine', () => {
    const world = createWorld(33)
    runWeeks(world, 2)
    const rng = createRng(2)
    for (let i = 0; i < 20; i++) {
      const home = rng.pick(world.clubs)
      const away = rng.pick(world.clubs)
      if (home.id === away.id) continue
      const h = setupFor(world, rng, home)
      const a = setupFor(world, rng, away)
      const odds = matchOdds(h.participant, a.participant)
      const state = createMatch(world, rng, h, a, false)
      const hv = sideView(state, state.home)
      hv.strength = hv.bands.strength
      const av = sideView(state, state.away)
      av.strength = av.bands.strength
      expect(pressureLean(hv, av, 0, 0, 0)).toBeCloseTo(odds.lean, 6)
    }
  })

  it('is fast enough for the population sim', () => {
    const world = createWorld(34)
    runWeeks(world, 2)
    const rng = createRng(3)
    const home = setupFor(world, rng, world.clubs[0]!)
    const away = setupFor(world, rng, world.clubs[1]!)
    for (let i = 0; i < 200; i++) playMatch(rng, home.participant, away.participant, false)
    const t0 = performance.now()
    for (let i = 0; i < 2000; i++) playMatch(rng, home.participant, away.participant, false)
    expect((performance.now() - t0) / 2000).toBeLessThan(0.5)
  })
})
