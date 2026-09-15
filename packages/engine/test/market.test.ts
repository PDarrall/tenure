import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { createRng } from '../src/rng.js'
import { runSeasons, runWeeks } from '../src/sim/advance.js'
import { clubById, managerById, spellOf } from '../src/lookup.js'
import { activeSpells } from '../src/tenure/spell.js'
import { sack } from '../src/tenure/sacking.js'
import { openNewVacancies, openVacancies, wantTags, isCrisis, salaryForYears } from '../src/market/vacancies.js'
import { agePenalty, drawShortlist, poachable, qualifies, wouldApply } from '../src/market/shortlist.js'
import { aiPromise, approach, hire } from '../src/market/hiring.js'
import { chooseActivity, monthlyUnemployed } from '../src/market/unemployment.js'
import { endCareer, seasonRetirements } from '../src/market/retirement.js'
import { assignTag, reviewTags } from '../src/market/tags.js'
import { joinCohort } from '../src/market/cohorts.js'
import { bandIndex } from '../src/managers/reputation.js'
import { digestWorld } from '../src/digest.js'
import { T } from '../src/tunables.js'
import type { Manager, SeasonRecord, World } from '../src/types.js'

function vacate(world: World, clubId: number) {
  const club = clubById(world, clubId)
  const spell = spellOf(world, managerById(world, club.managerId!))!
  sack(world, spell, 'credit')
  return openNewVacancies(world, createRng(1)).find((v) => v.post.kind === 'home' && v.post.clubId === clubId)!
}

function record(season: number, overrides: Partial<SeasonRecord> = {}): SeasonRecord {
  return {
    season,
    post: { kind: 'home', clubId: 1 },
    tier: 2,
    games: 46,
    finish: 10,
    expectation: 10,
    promoted: false,
    relegated: false,
    trophies: 0,
    bottomFourEscape: false,
    netSpendRank: 10,
    cupFinals: 0,
    academyInXi: 0,
    fallouts: 0,
    boardRows: 0,
    ...overrides,
  }
}

describe('vacancies', () => {
  it('opens one vacancy per empty post with terms, a want-list and a crisis flag', () => {
    const world = createWorld(1)
    const vacancy = vacate(world, 1)
    expect(vacancy.post).toEqual({ kind: 'home', clubId: 1 })
    expect(vacancy.reason).toBe('sacked')
    expect(vacancy.crisis).toBe(true) // sacked during the playing season counts as a crisis
    expect(isCrisis(world, { kind: 'home', clubId: 1 }, 'expired', world.week)).toBe(false)
    expect(vacancy.contract.years).toBeGreaterThanOrEqual(1)
    expect(vacancy.contract.years).toBeLessThanOrEqual(4)
    expect(vacancy.contract.salary).toBeGreaterThan(0)
    expect(vacancy.expectation).toBeGreaterThanOrEqual(1)
    expect(openVacancies(world)).toHaveLength(1)
    expect(openNewVacancies(world, createRng(2))).toHaveLength(0)
  })

  it('flags a mid-season sacking as a crisis hire', () => {
    const world = createWorld(1)
    runWeeks(world, 5)
    expect(isCrisis(world, { kind: 'home', clubId: 1 }, 'sacked', world.week)).toBe(true)
    expect(isCrisis(world, { kind: 'home', clubId: 1 }, 'expired', world.week)).toBe(isCrisis(world, { kind: 'home', clubId: 1 }, 'resigned', world.week))
  })

  it('wants survival specialists at strugglers and caps the list', () => {
    const world = createWorld(1)
    for (const club of world.clubs) expect(wantTags(world, { kind: 'home', clubId: club.id }).length).toBeLessThanOrEqual(T.WANT_TAGS_MAX)
    const weakest = [...world.clubs.filter((c) => c.tier === 3)].sort((a, b) => a.squad.strength - b.squad.strength)[0]!
    expect(wantTags(world, { kind: 'home', clubId: weakest.id })).toContain('survival specialist')
  })

  it('pays less per year on longer contracts', () => {
    expect(salaryForYears(1, 1)).toBeGreaterThan(salaryForYears(1, 2))
    expect(salaryForYears(1, 2)).toBeGreaterThan(salaryForYears(1, 4))
  })
})

describe('shortlisting', () => {
  it('qualifies by band, one band below with a wanted tag, and widens', () => {
    const world = createWorld(1)
    const tierThree = world.clubs.find((c) => c.tier === 3)!
    const vacancy = vacate(world, tierThree.id)
    const entrant = world.managers.find((m) => m.status.kind === 'unemployed' && m.reputation < 40 && m.reputation >= 20)!
    expect(qualifies(world, entrant, vacancy)).toBe(false)
    vacancy.wantTags = ['survival specialist']
    assignTag(world, entrant, 'survival specialist')
    expect(qualifies(world, entrant, vacancy)).toBe(true)
    entrant.tags = []
    vacancy.widened = 1
    expect(qualifies(world, entrant, vacancy)).toBe(true)
    const star: Manager = { ...entrant, reputation: 85, tags: [] }
    expect(qualifies(world, star, vacancy)).toBe(true)
  })

  it('AI applies no lower than one band below its own until a year out of work', () => {
    const world = createWorld(1)
    const tierFive = world.clubs.find((c) => c.tier === 5)!
    const vacancy = vacate(world, tierFive.id)
    const star = world.managers.find((m) => m.status.kind === 'unemployed')!
    star.reputation = 80
    expect(bandIndex(star.reputation)).toBe(4)
    expect(wouldApply(world, star, vacancy)).toBe(false)
    // A sacked manager rests before applying anywhere.
    const rested = world.managers.find((m) => m.status.kind === 'unemployed' && m.id !== star.id)!
    rested.history.spellIds.push(1)
    rested.reputation = 30
    expect(wouldApply(world, rested, vacancy)).toBe(false)
    if (rested.status.kind === 'unemployed') rested.status.sinceWeek = -T.AI_REST_MONTHS_AFTER_EXIT * T.MONTH_WEEKS
    expect(wouldApply(world, rested, vacancy)).toBe(true)
    rested.history.spellIds.pop()
    if (star.status.kind === 'unemployed') star.status.sinceWeek = -T.AI_APPLY_ANY_AFTER_MONTHS * T.MONTH_WEEKS
    expect(wouldApply(world, star, vacancy)).toBe(true)
  })

  it('only approaches employed managers from much smaller clubs', () => {
    const world = createWorld(1)
    const elite = [...world.clubs].sort((a, b) => b.prestige - a.prestige)[0]!
    const vacancy = vacate(world, elite.id)
    const tierTwo = world.clubs.find((c) => c.tier === 2)!
    expect(poachable(world, managerById(world, tierTwo.managerId!), vacancy)).toBe(true)
    const small = world.clubs.find((c) => c.tier === 5)!
    const smallVacancy = vacate(world, small.id)
    expect(poachable(world, managerById(world, world.clubs.find((c) => c.tier === 1 && c.managerId)!.managerId!), smallVacancy)).toBe(false)
  })

  it('draws three to five names, resets their shortlist clock, and penalises age', () => {
    const world = createWorld(1)
    const tierFour = world.clubs.find((c) => c.tier === 4)!
    const vacancy = vacate(world, tierFour.id)
    const picked = drawShortlist(world, createRng(5), vacancy)
    expect(picked.length).toBeGreaterThanOrEqual(T.SHORTLIST_SIZE[0])
    expect(picked.length).toBeLessThanOrEqual(T.SHORTLIST_SIZE[1])
    for (const m of picked) if (m.status.kind === 'unemployed') expect(m.status.monthsSinceShortlisted).toBe(0)
    expect(agePenalty(45)).toBe(1)
    expect(agePenalty(60)).toBe(0.5)
    expect(agePenalty(70)).toBe(0.2)
  })
})

describe('hiring', () => {
  it('hires on the vacancy terms with an AI promise that fits the squad', () => {
    const world = createWorld(1)
    const tierTwo = world.clubs.find((c) => c.tier === 2)!
    const vacancy = vacate(world, tierTwo.id)
    const candidate = world.managers.find((m) => m.status.kind === 'unemployed')!
    candidate.reputation = 65
    candidate.history.spellIds.push(1) // an established manager takes the offered length
    const spell = hire(world, createRng(1), candidate, vacancy)
    candidate.history.spellIds.shift()
    expect(spell.contract.yearsAtSigning).toBe(vacancy.contract.years)
    expect(spell.contract.promise).toBe(aiPromise(world, vacancy))
    expect(vacancy.filledWeek).toBe(world.week)
    expect(clubById(world, tierTwo.id).managerId).toBe(candidate.id)
    expect(world.log.at(-1)!.type).toBe('vacancy.filled')
  })

  it('poaches with a buy-out, +2 reputation and the in-demand tag, or is declined for +3 credit', () => {
    const world = createWorld(1)
    const elite = [...world.clubs].sort((a, b) => b.prestige - a.prestige)[0]!
    const vacancy = vacate(world, elite.id)
    const tierTwo = world.clubs.find((c) => c.tier === 2)!
    const manager = managerById(world, tierTwo.managerId!)
    const oldSpell = spellOf(world, manager)!
    const rep = manager.reputation
    const credit = oldSpell.credit
    // rng seeded so the first chance() call passes (accept) and a second seed that fails (decline).
    let accepted = false
    for (let seed = 1; seed < 50 && !accepted; seed++) {
      const rng = createRng(seed)
      if (!rng.chance(T.AI_ACCEPT_APPROACH_P)) continue
      accepted = approach(world, createRng(seed), manager, vacancy)
    }
    expect(accepted).toBe(true)
    expect(oldSpell.endReason).toBe('poached')
    expect(manager.reputation).toBe(rep + T.REP_POACHED)
    expect(manager.tags.some((t) => t.tag === 'in demand')).toBe(true)
    expect(clubById(world, tierTwo.id).managerId).toBeNull()

    const other = world.clubs.find((c) => c.tier === 2 && c.managerId !== null)!
    const m2 = managerById(world, other.managerId!)
    const s2 = spellOf(world, m2)!
    let declined = false
    for (let seed = 1; seed < 50 && !declined; seed++) {
      const rng = createRng(seed)
      if (rng.chance(T.AI_ACCEPT_APPROACH_P)) continue
      declined = !approach(world, createRng(seed), m2, vacancy)
    }
    expect(declined).toBe(true)
    expect(s2.credit).toBe(Math.min(s2.ceiling, credit + T.DECLINE_APPROACH_CREDIT))
    expect(s2.loyaltyBonus).toBe(T.LOYALTY_PER_DECLINE)
  })
})

describe('unemployment and permadeath', () => {
  it('picks activities by months out and reputation, pays income, decays reputation', () => {
    const world = createWorld(1)
    const m = world.managers.find((x) => x.status.kind === 'unemployed')!
    m.reputation = 50
    expect(chooseActivity(world, createRng(1), m)).toBe('wait')
    world.week = T.AI_PUNDITRY_AFTER_MONTHS * T.MONTH_WEEKS
    expect(chooseActivity(world, createRng(1), m)).toBe('punditry')
    const rep = m.reputation
    monthlyUnemployed(world, createRng(1), m)
    expect(m.status.kind === 'unemployed' && m.status.activity).toBe('punditry')
    expect(m.history.earnings).toBeCloseTo(T.PUNDITRY_INCOME_PER_MONTH)
    expect(m.reputation).toBe(rep + T.UNEMPLOYED_DECAY * T.PUNDITRY_DECAY_SHARE)
    const low = world.managers.find((x) => x.status.kind === 'unemployed' && x.id !== m.id)!
    low.reputation = 20
    world.week = T.AI_ASSISTANT_AFTER_MONTHS * T.MONTH_WEEKS
    const before = low.reputation
    monthlyUnemployed(world, createRng(1), low)
    expect(low.status.kind === 'unemployed' && low.status.activity).toBe('assistant')
    expect(low.history.steppedDown).toBe(true)
    expect(low.reputation).toBe(before + T.REP_STEP_DOWN)
    monthlyUnemployed(world, createRng(1), low)
    expect(low.reputation).toBe(before + T.REP_STEP_DOWN) // decay stopped
  })

  it('ends the career after 24 months without a shortlist, at 72, and closes a live spell', () => {
    const world = createWorld(1)
    const m = world.managers.find((x) => x.status.kind === 'unemployed')!
    if (m.status.kind === 'unemployed') m.status.monthsSinceShortlisted = T.NO_SHORTLIST_MONTHS - 1
    monthlyUnemployed(world, createRng(1), m)
    expect(m.status).toMatchObject({ kind: 'retired', reason: 'no-offers' })
    const old = managerById(world, clubById(world, 1).managerId!)
    old.age = T.RETIRE_AGE
    seasonRetirements(world, createRng(1))
    expect(old.status).toMatchObject({ kind: 'retired', reason: 'age' })
    expect(clubById(world, 1).managerId).toBeNull()
    expect(spellOf(world, old)).toBeUndefined()
    expect(world.log.filter((e) => e.type === 'career.ended')).toHaveLength(2)
    endCareer(world, old, 'scandal')
    expect(world.log.filter((e) => e.type === 'career.ended')).toHaveLength(2)
  })
})

describe('tags', () => {
  it('awards the windowed tags from season records and expires them', () => {
    const world = createWorld(1)
    const m = world.managers.find((x) => x.status.kind === 'unemployed')!
    world.season = 6
    m.history.seasons = [
      record(2, { promoted: true }),
      record(3, { bottomFourEscape: true, cupFinals: 1 }),
      record(4, { promoted: true, cupFinals: 1, expectation: 12, finish: 4 }),
      record(5, { bottomFourEscape: true, expectation: 12, finish: 5, netSpendRank: 2, fallouts: 1 }),
      record(6, { academyInXi: 4, expectation: 12, finish: 6, netSpendRank: 1, boardRows: 1 }),
    ]
    reviewTags(world, m)
    const tags = m.tags.map((t) => t.tag)
    expect(tags).toContain('promotion specialist')
    expect(tags).toContain('survival specialist')
    expect(tags).toContain('youth developer')
    expect(tags).toContain('big spender')
    expect(tags).toContain('overachiever')
    expect(tags).toContain('cup manager')
    expect(tags).toContain('difficult')
    expect(tags).not.toContain('loyal')
    world.season = 6 + T.TAG_RULES['big spender'].expiry + 1
    reviewTags(world, m)
    expect(m.tags.map((t) => t.tag)).not.toContain('big spender')
    expect(world.log.some((e) => e.type === 'tag.expired' && e.payload['tag'] === 'big spender')).toBe(true)
  })

  it('marks mercenaries and the loyal', () => {
    const world = createWorld(1)
    const m = world.managers.find((x) => x.status.kind === 'unemployed')!
    m.history.walkouts = 2
    reviewTags(world, m)
    expect(m.tags.map((t) => t.tag)).toContain('mercenary')
    const loyal = managerById(world, clubById(world, 1).managerId!)
    spellOf(world, loyal)!.seasonsCompleted = T.TAG_RULES.loyal.seasons
    reviewTags(world, loyal)
    expect(loyal.tags.map((t) => t.tag)).toContain('loyal')
  })
})

describe('cohorts', () => {
  it('tops the working population back up with fresh entrants and unique names', () => {
    const world = createWorld(1)
    const before = world.managers.length
    for (const m of world.managers.slice(0, 20)) endCareer(world, m, 'voluntary')
    const added = joinCohort(world, createRng(1))
    expect(added).toBe(20)
    expect(world.managers.length).toBe(before + 20)
    expect(new Set(world.managers.map((m) => m.name)).size).toBe(world.managers.length)
    expect(new Set(world.managers.map((m) => m.id)).size).toBe(world.managers.length)
    const entrant = world.managers.at(-1)!
    expect(entrant.cohortSeason).toBe(world.season)
    expect(entrant.status.kind).toBe('unemployed')
    expect(managerById(world, entrant.id)).toBe(entrant)
  })
})

describe('the market over seasons', () => {
  const world = createWorld(1)
  runSeasons(world, 6)

  it('fills vacancies so clubs are rarely without a manager', () => {
    const empty = world.clubs.filter((c) => c.managerId === null).length
    expect(empty).toBeLessThan(world.clubs.length * 0.1)
    const filled = world.vacancies.filter((v) => v.filledWeek !== null)
    expect(filled.length).toBeGreaterThan(50)
    const weeksOpen = filled.map((v) => (v.filledWeek as number) - v.openedWeek)
    expect(Math.max(...weeksOpen)).toBeLessThan(T.SEASON_WEEKS)
    expect(world.log.some((e) => e.type === 'manager.hired' && e.payload['genesis'] === false)).toBe(true)
  })

  it('produces poaching, careers ending, cohorts, tags and a steady population', () => {
    const types = new Set(world.log.map((e) => e.type))
    for (const t of ['approach.made', 'vacancy.shortlisted', 'vacancy.filled', 'career.ended', 'cohort.joined', 'tag.assigned', 'unemployed.activity']) {
      expect(types.has(t), t).toBe(true)
    }
    expect(world.managers.filter((m) => m.status.kind !== 'retired')).toHaveLength(T.POPULATION)
  })

  it('keeps managers, spells, clubs and vacancies consistent', () => {
    for (const spell of activeSpells(world)) {
      const manager = managerById(world, spell.managerId)
      expect(manager.status).toEqual({ kind: 'employed', post: spell.post, spellId: spell.id })
    }
    for (const club of world.clubs) {
      if (club.managerId === null) continue
      const manager = managerById(world, club.managerId)
      expect(manager.status.kind).toBe('employed')
      expect(spellOf(world, manager)!.post).toEqual({ kind: 'home', clubId: club.id })
    }
    for (const league of world.foreign) {
      for (const club of league.clubs) {
        if (club.managerId === null) continue
        expect(spellOf(world, managerById(world, club.managerId))!.post).toEqual({ kind: 'abroad', league: league.kind, clubId: club.id })
      }
    }
    const live = activeSpells(world).map((s) => s.managerId)
    expect(new Set(live).size).toBe(live.length)
    for (const v of openVacancies(world)) {
      if (v.post.kind === 'home') expect(clubById(world, v.post.clubId).managerId).toBeNull()
    }
  })

  it('stays deterministic', () => {
    const again = createWorld(1)
    runSeasons(again, 6)
    expect(digestWorld(again).hash).toBe(digestWorld(world).hash)
  })
})
