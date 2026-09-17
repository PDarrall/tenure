import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { createRng, rngFromState } from '../src/rng.js'
import { runSeasons, runWeeks, advanceWeek } from '../src/sim/advance.js'
import { attributeGoals, averageRating, cardChance, injuryChance, matchRating, moraleAfterMatch, playersWeekly } from '../src/match/aftermath.js'
import { squadOf } from '../src/players/select.js'
import { createCareer } from '../src/play/career.js'
import { pendingDecisions, resolveDecisions } from '../src/play/decisions.js'
import { queueContract, queueNewDeal, queueWantsAway, wageDemand, wantsAway, wantsNewDeal } from '../src/players/contracts.js'
import { openVacancies } from '../src/market/vacancies.js'
import { qualifies } from '../src/market/shortlist.js'
import { playerById, spellOf } from '../src/lookup.js'
import { T } from '../src/tunables.js'
import type { Player, World } from '../src/types.js'

function live(world: World): Player[] {
  return world.players.filter((p): p is Player => p !== null && !p.retired)
}

describe('match aftermath over a season', () => {
  const world = createWorld(8)
  runSeasons(world, 1)
  const matches = world.log.filter((e) => e.type === 'match.played')

  it('gives every goal a scorer, most an assist, and forwards most of them', () => {
    let goals = 0
    let scorers = 0
    let assists = 0
    const byPosition = { GK: 0, D: 0, M: 0, F: 0 }
    for (const e of matches) {
      goals += (e.payload['homeGoals'] as number) + (e.payload['awayGoals'] as number)
      for (const side of ['homeScorers', 'awayScorers'] as const) {
        for (const s of e.payload[side] as { playerId: number; assistId: number | null }[]) {
          scorers++
          if (s.assistId !== null) assists++
          const p = world.players[s.playerId - 1]
          if (p) byPosition[p.position]++
        }
      }
    }
    expect(scorers).toBe(goals)
    expect(assists / scorers).toBeGreaterThan(0.55)
    expect(assists / scorers).toBeLessThan(0.85)
    expect(byPosition.F).toBeGreaterThan(byPosition.M)
    expect(byPosition.M).toBeGreaterThan(byPosition.D)
  })

  it('books about three to four yellows and a fifth of a red a match (to verify)', () => {
    const cards = matches.reduce((n, e) => n + (e.payload['cards'] as number), 0) / matches.length
    const reds = matches.reduce((n, e) => n + (e.payload['reds'] as number), 0) / matches.length
    expect(cards).toBeGreaterThan(2.5)
    expect(cards).toBeLessThan(4.5)
    expect(reds).toBeGreaterThan(0.1)
    expect(reds).toBeLessThan(0.35)
  })

  it('averages match ratings near 6.9 with a spread near 0.6, and records apps, minutes and cards', () => {
    const avgs: number[] = []
    let apps = 0
    for (const p of live(world)) {
      for (const s of [...p.history, p.season]) {
        const a = averageRating(s)
        if (a !== null && s.rated >= 10) avgs.push(a)
        apps += s.apps
      }
    }
    // Only players still on the books are counted; those released or retired took their records with them.
    expect(apps).toBeGreaterThan(matches.length * 12)
    const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length
    const sd = Math.sqrt(avgs.reduce((a, b) => a + (b - mean) ** 2, 0) / avgs.length)
    expect(mean).toBeGreaterThan(6.6)
    expect(mean).toBeLessThan(7.2)
    expect(sd).toBeGreaterThan(0.3)
    expect(sd).toBeLessThan(0.9)
  })

  it('injures, bans and heals: injuries appear and clear, five yellows cost a match, condition drains and recovers', () => {
    expect(world.log.filter((e) => e.type === 'player.injured').length).toBeGreaterThan(50)
    const bans = world.log.filter((e) => e.type === 'player.suspended')
    expect(bans.some((e) => e.payload['reason'] === 'yellows' && e.payload['yellows'] === 5)).toBe(true)
    expect(bans.some((e) => e.payload['reason'] === 'red')).toBe(true)
    // After the summer everyone is fit, unbanned and at full condition.
    for (const p of live(world)) {
      if (p.clubId >= T.FOREIGN_CLUB_ID_BASE || p.clubId === 0) continue
      expect(p.condition).toBe(T.CONDITION_MAX)
      expect(p.injuryWeeks).toBe(0)
      expect(p.suspension).toBe(0)
      expect(p.yellows).toBe(0)
    }
    const during = createWorld(8)
    runWeeks(during, 12)
    const players = live(during).filter((p) => p.clubId > 0 && p.clubId < T.FOREIGN_CLUB_ID_BASE)
    expect(players.some((p) => p.condition < T.CONDITION_MAX)).toBe(true)
    expect(players.some((p) => p.injuryWeeks > 0)).toBe(true)
    const tired = players.find((p) => p.condition < 60)!
    const before = tired.condition
    playersWeekly(during)
    expect(tired.condition).toBeCloseTo(Math.min(100, before + T.CONDITION_RECOVERY_PER_WEEK), 5)
  })
})

describe('trait rules in the aftermath', () => {
  const world = createWorld(9)
  const p = live(world).find((x) => x.position === 'F' && x.traits.length === 0)!

  it('poachers score more and playmakers assist more, all else equal', () => {
    const plain: Player = { ...p, id: 1 }
    const poacher: Player = { ...p, id: 2, traits: ['poacher'] }
    const playmaker: Player = { ...p, id: 3, traits: ['playmaker'] }
    const rng = createRng(1)
    let poacherGoals = 0
    let playmakerAssists = 0
    let plainAssists = 0
    for (let i = 0; i < 4000; i++) {
      const goals = attributeGoals(rng, [plain, poacher, playmaker], 1)
      if (goals[0]!.playerId === 2) poacherGoals++
      if (goals[0]!.assistId === 3) playmakerAssists++
      if (goals[0]!.assistId === 1) plainAssists++
    }
    expect(poacherGoals / 4000).toBeGreaterThan(0.36) // three equal forwards would give a third
    expect(playmakerAssists).toBeGreaterThan(plainAssists * 1.3)
  })

  it('tough tacklers and the hot-headed see more cards, the injury-prone more injuries, the consistent no noise', () => {
    const base = cardChance(p, 'possession')
    expect(cardChance({ ...p, traits: ['tough tackler'] }, 'possession').yellow).toBeCloseTo(base.yellow * T.TOUGH_TACKLER_CARD_MULT, 9)
    expect(cardChance({ ...p, traits: ['hot-headed'] }, 'possession').red).toBeCloseTo(base.red * T.HOT_HEADED_RED_MULT, 9)
    expect(cardChance(p, 'pressing').yellow).toBeCloseTo(base.yellow * T.STYLE_EFFECTS.pressing.fouls, 9)
    expect(injuryChance({ ...p, traits: ['injury-prone'], condition: 100 })).toBeCloseTo(injuryChance({ ...p, condition: 100 }) * T.INJURY_PRONE_MULT, 9)
    expect(injuryChance({ ...p, condition: 60 })).toBeGreaterThan(injuryChance({ ...p, condition: 100 }))
    const rng = createRng(2)
    const steady = new Set<number>()
    const noisy = new Set<number>()
    for (let i = 0; i < 30; i++) {
      steady.add(matchRating(rng, { ...p, traits: ['consistent'] }, 60, 60, 'D', 0, 0, 1, 'F'))
      noisy.add(matchRating(rng, p, 60, 60, 'D', 0, 0, 1, 'F'))
    }
    expect(steady.size).toBe(1)
    expect(noisy.size).toBeGreaterThan(5)
  })

  it('a leader lifts the morale of the whole XI after a match', () => {
    const squad = [1, 2, 3].map((id) => ({ ...p, id, morale: 50 }))
    const xi = new Set([1, 2])
    moraleAfterMatch(squad, xi, 'D', 50, false)
    const without = squad[0]!.morale
    const squad2 = [1, 2, 3].map((id) => ({ ...p, id, morale: 50 }))
    moraleAfterMatch(squad2, xi, 'D', 50, true)
    expect(squad2[0]!.morale).toBeCloseTo(without + T.LEADER_MORALE_LIFT, 5)
    expect(squad2[2]!.morale).toBeLessThan(squad2[0]!.morale) // left out and no lift
  })
})

describe('contracts and requests', () => {
  it('asks less of a bonded loyal player, spots an outgrown wage and a starter left out', () => {
    const world = createWorld(10)
    const club = world.clubs[2]!
    const p = squadOf(world, club)[3]!
    p.traits = ['loyal']
    p.madeBy = [{ managerId: 7, clubId: club.id, week: 0, circumstance: 'signed', rating: p.rating, bond: T.BOND_LOYAL_THRESHOLD, growth: 0, tier: club.tier }]
    expect(wageDemand(p, 7)).toBeLessThan(wageDemand(p, null))
    expect(wageDemand(p, 8)).toBe(wageDemand(p, null))
    p.contract.wage = Math.round(wageDemand(p, null) / 2)
    expect(wantsNewDeal(p, null)).toBe(true)
    p.rating = club.squad.strength
    p.season.starts = 0
    expect(wantsAway(p, club, 10)).toBe(true)
    p.season.starts = 8
    expect(wantsAway(p, club, 10)).toBe(false)
  })

  it('turns expiring contracts, new-deal and leave requests into decisions the human answers', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    const me = world.managers[world.human!.managerId - 1]!
    // Take the first job.
    for (let i = 0; i < 400 && me.status.kind !== 'employed'; i++) {
      const offer = pendingDecisions(world).find((d) => d.kind === 'offer')
      if (offer) advanceWeek(world, { answers: { [offer.id]: 'top-half:2' } })
      else advanceWeek(world, { apply: openVacancies(world).filter((v) => v.post.kind === 'home' && qualifies(world, me, v) && !v.applicants.includes(me.id)).map((v) => v.id) })
    }
    expect(me.status.kind).toBe('employed')
    const spell = spellOf(world, me)!
    const club = world.clubs[(spell.post as { clubId: number }).clubId - 1]!
    const squad = squadOf(world, club)
    const expiring = squad[0]!
    expiring.contract.years = 1
    const contract = queueContract(world, expiring, me.id)
    expect(contract.options.some((o) => o.key === 'release')).toBe(true)
    world.human!.contractChoices = {}
    advanceWeek(world, { answers: { [contract.id]: 'renew:3' } })
    expect(world.human!.contractChoices[expiring.id]).toEqual({ years: 3, wage: contract.payload['demand'] })
    const asker = squad[1]!
    asker.contract.wage = 1
    const deal = queueNewDeal(world, asker, wageDemand(asker, me.id))
    const falloutsBefore = spellOf(world, me)?.season.fallouts ?? 0
    // Answered in place: a week's advance could cross into a new season and reset the season's counts.
    resolveDecisions(world, rngFromState(world.rng), { [deal.id]: 'refuse' })
    expect(asker.morale).toBeLessThan(50)
    expect(spellOf(world, me)?.season.fallouts ?? 1).toBe(falloutsBefore + 1)
    expect(world.log.some((e) => e.type === 'player.refused' && e.payload['playerId'] === asker.id)).toBe(true)
    const leaver = squad[2]!
    const cashBefore = club.cash
    const away = queueWantsAway(world, leaver)
    advanceWeek(world, { answers: { [away.id]: 'sell' } })
    expect(club.cash).toBeGreaterThan(cashBefore)
    expect(club.playerIds).not.toContain(leaver.id)
    const gone = playerById(world, leaver.id)
    expect(gone === undefined || gone.clubId !== club.id).toBe(true) // dropped, or in the pool if somebody made him
  })
})
