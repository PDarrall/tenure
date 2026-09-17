import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { createRng } from '../src/rng.js'
import { runSeasons, runWeeks, advanceWeek } from '../src/sim/advance.js'
import { careerSummary, createCareer } from '../src/play/career.js'
import { pendingDecisions } from '../src/play/decisions.js'
import { openVacancies } from '../src/market/vacancies.js'
import { qualifies } from '../src/market/shortlist.js'
import { managerById, playerById, spellOf } from '../src/lookup.js'
import { squadOf } from '../src/players/select.js'
import { developmentFactor, growWithMinutes, madePlayers, playersMadeFromLog, tagOf, tagPlayer, tagWeight } from '../src/players/made.js'
import { legacy } from '../src/scoring/score.js'
import { inbox } from '../src/play/inbox.js'
import { T } from '../src/tunables.js'
import type { Player, World } from '../src/types.js'

function live(world: World): Player[] {
  return world.players.filter((p): p is Player => p !== null && !p.retired)
}

describe('tagging', () => {
  it('tags on sign, debut and promotion, once per manager, with the rating on the day, into the log', () => {
    const world = createWorld(12)
    runSeasons(world, 1)
    runWeeks(world, 3)
    const tags = world.log.filter((e) => e.type === 'player.tagged')
    const kinds = new Set(tags.map((e) => e.payload['circumstance']))
    expect(kinds.has('debut')).toBe(true)
    expect(kinds.has('signed')).toBe(true)
    expect(kinds.has('promoted')).toBe(true)
    for (const p of live(world)) {
      const managers = p.madeBy.map((m) => m.managerId)
      expect(new Set(managers).size).toBe(managers.length)
      for (const m of p.madeBy) expect(m.rating).toBeGreaterThan(0)
    }
    // A second tag by the same manager is refused.
    const p = live(world).find((x) => x.madeBy.length > 0)!
    const manager = managerById(world, p.madeBy[0]!.managerId)
    expect(tagPlayer(world, p, manager, { id: p.clubId }, 'signed')).toBeNull()
  })

  it('weights debut and promotion in full, a signing by half, a finished buy by almost nothing', () => {
    const base = { managerId: 1, clubId: 1, week: 0, bond: 0, growth: 0, tier: null }
    expect(tagWeight({ ...base, circumstance: 'debut', rating: 40 })).toBe(1)
    expect(tagWeight({ ...base, circumstance: 'promoted', rating: 40 })).toBe(1)
    expect(tagWeight({ ...base, circumstance: 'signed', rating: 60 })).toBe(T.TAG_WEIGHTS.signed)
    expect(tagWeight({ ...base, circumstance: 'signed', rating: T.BOUGHT_FINISHED_RATING })).toBe(T.BOUGHT_FINISHED_WEIGHT)
  })
})

describe('growth with minutes', () => {
  it('a starter gains at least three times what a bench player gains over a season, scaled by development', () => {
    const world = createWorld(13)
    const young = live(world).filter((p) => p.age < T.YOUTH_AGE && p.potential - p.rating > 5)
    const starter: Player = { ...young[0]!, id: 1, rating: 40, potential: 60, season: { ...young[0]!.season, growth: 0 } }
    const bench: Player = { ...young[1]!, id: 2, rating: 40, potential: 60, season: { ...young[1]!.season, growth: 0 } }
    let starterGain = 0
    let benchGain = 0
    for (let match = 0; match < T.EXPECTED_STARTS; match++) {
      starterGain += growWithMinutes(starter, 90, 50, null)
      benchGain += growWithMinutes(bench, match % 6 === 0 ? 15 : 0, 50, null)
    }
    expect(starterGain).toBeGreaterThanOrEqual(3 * benchGain)
    expect(starterGain).toBeCloseTo(T.GROWTH_PER_SEASON * developmentFactor(50), 1)
    expect(starter.rating).toBeCloseTo(40 + starterGain, 1)
    const quick: Player = { ...starter, id: 3, rating: 40, season: { ...starter.season, growth: 0 } }
    const slow: Player = { ...starter, id: 4, rating: 40, season: { ...starter.season, growth: 0 } }
    expect(growWithMinutes(quick, 90, 90, null)).toBeGreaterThan(growWithMinutes(slow, 90, 10, null))
    const old: Player = { ...starter, id: 5, age: 30, rating: 40 }
    expect(growWithMinutes(old, 90, 50, null)).toBe(0)
  })

  it('records growth on the tag and pays players-made points at season end, mirrored in the log', () => {
    const world = createWorld(14)
    runSeasons(world, 2)
    const made = world.log.filter((e) => e.type === 'players.made')
    expect(made.length).toBeGreaterThan(50)
    expect(made.some((e) => e.payload['reason'] === 'growth')).toBe(true)
    for (const m of world.managers) expect(playersMadeFromLog(world, m.id)).toBeCloseTo(m.history.playersMade, 2)
    const maker = [...world.managers].sort((a, b) => b.history.playersMade - a.history.playersMade)[0]!
    expect(maker.history.playersMade).toBeGreaterThan(0)
    const list = madePlayers(world, maker.id)
    expect(list.length).toBeGreaterThan(0)
    expect(list[0]!.points).toBeGreaterThanOrEqual(list[list.length - 1]!.points)
    // Growth happens on the pitch: a young starter ends the season rated higher than he began it.
    const grown = live(world).filter((p) => p.history.some((h) => h.growth > 0.5))
    expect(grown.length).toBeGreaterThan(20)
  })
})

describe('milestones and the record of people', () => {
  it('a tagged player keeps living after the manager leaves: he moves on rather than vanishing, and his milestones name the manager', () => {
    const world = createWorld(15)
    runSeasons(world, 4)
    const tagged = world.players.filter((p): p is Player => p !== null && p.madeBy.length > 0)
    expect(tagged.length).toBeGreaterThan(100)
    // Some made players have moved club, or wait in the pool; none were forgotten.
    const moved = tagged.filter((p) => p.madeBy.some((m) => m.clubId !== p.clubId) && !p.retired)
    expect(moved.length).toBeGreaterThan(5)
    expect(world.log.some((e) => e.type === 'player.transfer')).toBe(true)
    const milestones = world.log.filter((e) => e.type === 'player.milestone')
    expect(milestones.length).toBeGreaterThan(0)
    const kinds = new Set(milestones.map((e) => e.payload['kind']))
    expect(kinds.has('transfer') || kinds.has('promotion') || kinds.has('title') || kinds.has('tierAbove')).toBe(true)
    for (const e of milestones) expect((e.payload['managers'] as number[]).length).toBeGreaterThan(0)
  })

  it('the human sees debuts and growth in the inbox, and the career page lists players made', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    const me = world.managers[world.human!.managerId - 1]!
    for (let i = 0; i < 400 && me.status.kind !== 'employed'; i++) {
      const offer = pendingDecisions(world).find((d) => d.kind === 'offer')
      if (offer) advanceWeek(world, { answers: { [offer.id]: 'top-half:3' } })
      else advanceWeek(world, { apply: openVacancies(world).filter((v) => v.post.kind === 'home' && qualifies(world, me, v) && !v.applicants.includes(me.id)).map((v) => v.id) })
    }
    expect(me.status.kind).toBe('employed')
    const from = world.week
    for (let i = 0; i < 60 && me.status.kind === 'employed'; i++) {
      const answers: Record<number, string> = {}
      for (const d of pendingDecisions(world)) answers[d.id] = d.options[0]!.key
      advanceWeek(world, { answers })
    }
    const items = inbox(world, from, world.week)
    expect(items.some((i) => i.from === 'players')).toBe(true)
    const spell = spellOf(world, me)
    if (spell && spell.post.kind === 'home') {
      const squad = squadOf(world, world.clubs[spell.post.clubId - 1]!)
      expect(squad.some((p) => tagOf(p, me.id) !== undefined)).toBe(true)
    }
    const summary = careerSummary(world)
    expect(summary.score.playersMade).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(summary.playersMade)).toBe(true)
  })
})

describe('the fourth line in Legacy', () => {
  it('lands the three archetypes within the tolerance of each other', () => {
    const a = T.LEGACY_ARCHETYPES
    const values = [a.midTableThirtyYears, a.trophyLadenTwelveYears, a.makerThirtyYears].map((x) => legacy(x.games, x.earnings, x.trophyPoints, x.playersMade))
    const max = Math.max(...values)
    const min = Math.min(...values)
    expect((max - min) / max, values.join(', ')).toBeLessThanOrEqual(a.tolerance)
  })
})
