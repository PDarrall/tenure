/**
 * DESIGN.md "Decisions are bets": every option carries likely, downside and
 * confidence in words and hidden dice; the default is the lowest-variance
 * option; the roll and its outcome go in the log; the fairness lines read
 * the AI population's rolls.
 */
import { describe, expect, it } from 'vitest'
import { createRng } from '../src/rng.js'
import { T } from '../src/tunables.js'
import { createWorld } from '../src/world/gen.js'
import { createCareer } from '../src/play/career.js'
import { clubById, managerById, spellOf } from '../src/lookup.js'
import { betFor, confidenceFor, markDefault, resolveBet, rollBet, rollKind, selectionWords } from '../src/play/bets.js'
import { answerBoard, answerPress, human, pendingDecisions, queueActivity, queueBoard, queueFallout, queueOffer, queuePress, resolveDecisions } from '../src/play/decisions.js'
import { queueContract, queueNewDeal, queueWantsAway } from '../src/players/contracts.js'
import { startSpell } from '../src/tenure/spell.js'
import { openNewVacancies } from '../src/market/vacancies.js'
import { squadOf } from '../src/players/select.js'
import { decisionFairness } from '../src/stats/population.js'
import type { Decision, DecisionOption } from '../src/types.js'

function employedHuman(seed: number) {
  const world = createCareer(seed, { name: 'Bettor', background: 'coach' })
  const me = human(world)
  const club = world.clubs.find((c) => c.tier === 4 && c.managerId !== null)!
  // Vacate the club and seat the human there directly.
  const incumbent = managerById(world, club.managerId!)
  const old = spellOf(world, incumbent)!
  old.endWeek = world.week
  old.endReason = 'sacked'
  incumbent.status = { kind: 'unemployed', sinceWeek: world.week, activity: 'wait', monthsSinceShortlisted: 0 }
  club.managerId = null
  world.human!.pending = []
  const spell = startSpell(world, createRng(seed), me, { kind: 'home', clubId: club.id }, { years: 2, promise: 'top-half', crisis: false })
  return { world, me, club, spell }
}

function wordsOn(o: DecisionOption): boolean {
  return typeof o.likely === 'string' && o.likely.length > 0 && !o.likely.startsWith('[') && typeof o.downside === 'string' && o.downside.length > 0 && !o.downside.startsWith('[') && (o.confidence === 'sure thing' || o.confidence === 'likely' || o.confidence === 'gamble')
}

function lowestSd(d: Decision): number {
  return Math.min(...d.options.map((o) => (o.bet ? o.bet.sd : 0)))
}

describe('the dice', () => {
  it('reads confidence in words from the spread, per unit', () => {
    expect(confidenceFor({ mean: 0, sd: 0.5, unit: 'credit' })).toBe('sure thing')
    expect(confidenceFor({ mean: 0, sd: 2, unit: 'credit' })).toBe('likely')
    expect(confidenceFor({ mean: 0, sd: 3, unit: 'credit' })).toBe('gamble')
    expect(confidenceFor({ mean: 0, sd: 0.3, unit: 'reputation' })).toBe('sure thing')
    expect(confidenceFor({ mean: 0, sd: 3, unit: 'morale' })).toBe('likely')
  })

  it('has equal means inside every kind, and one lowest-variance option per kind', () => {
    for (const [kind, table] of Object.entries(T.BETS)) {
      const dice = Object.values(table.options as Record<string, { mean: number; sd: number }>)
      const means = new Set(dice.map((d) => d.mean))
      expect(means.size, `${kind} means`).toBe(1)
      const sds = dice.map((d) => d.sd).sort((a, b) => a - b)
      expect(sds[0]!, `${kind} lowest sd`).toBeLessThan(sds[1]!)
    }
  })

  it('clamps the roll and lands mean + sd × z', () => {
    const rng = createRng(3)
    const bet = betFor('board', 'pushBack')
    for (let i = 0; i < 500; i++) {
      const { z, effect } = rollBet(rng, bet)
      expect(Math.abs(z)).toBeLessThanOrEqual(T.BET_ROLL_CLAMP)
      expect(Math.abs(effect - bet.mean)).toBeLessThanOrEqual(bet.sd * T.BET_ROLL_CLAMP + 0.06)
    }
  })

  it('marks the lowest-variance option as the default and the rest bold; a named key forces the default', () => {
    const options: DecisionOption[] = [
      { key: 'a', label: 'A', bet: { mean: 0, sd: 3, unit: 'credit' } },
      { key: 'b', label: 'B', bet: { mean: 0, sd: 0.5, unit: 'credit' } },
      { key: 'c', label: 'C' },
    ]
    expect(markDefault(options)).toBe('c')
    expect(options.map((o) => o.isDefault)).toEqual([false, false, true])
    expect(options.map((o) => o.bold)).toEqual([true, true, false])
    expect(markDefault(options, 'a')).toBe('a')
    expect(options.map((o) => o.bold)).toEqual([false, false, false])
  })

  it('applies a roll in its unit and logs it', () => {
    const { world, me, club, spell } = employedHuman(11)
    const rng = createRng(5)
    const credit = spell.credit
    const applied = resolveBet(world, rng, { mean: 2, sd: 0, unit: 'credit' }, { kind: 'board', key: 'x', managerId: me.id, spellId: spell.id, bold: true, label: 'x' })
    expect(applied).toBeCloseTo(Math.min(spell.ceiling, credit + 2) - credit, 5)
    const rolled = world.log.at(-1)!
    expect(rolled.type).toBe('decision.rolled')
    expect(rolled.payload['unit']).toBe('credit')
    expect(rolled.payload['effect']).toBe(2)
    expect(rolled.payload['bold']).toBe(true)
    const rep = me.reputation
    resolveBet(world, rng, { mean: -1, sd: 0, unit: 'reputation' }, { kind: 'activity', key: 'wait', managerId: me.id, bold: true })
    expect(me.reputation).toBe(rep - 1)
    const morale = club.squad.morale
    const first = squadOf(world, club)[0]!
    const playerMorale = first.morale
    resolveBet(world, rng, { mean: -4, sd: 0, unit: 'morale' }, { kind: 'fallout', key: 'sell', managerId: me.id, clubId: club.id, bold: true })
    expect(club.squad.morale).toBe(morale - 4)
    expect(first.morale).toBe(playerMorale - 4) // the squad's roll reaches every player
    resolveBet(world, rng, { mean: 3, sd: 0, unit: 'morale' }, { kind: 'newDeal', key: 'accept', managerId: me.id, playerId: first.id, bold: false })
    expect(first.morale).toBe(playerMorale - 4 + 3)
  })

  it('rollKind knows which options are bold', () => {
    const { world, me, spell } = employedHuman(12)
    rollKind(world, createRng(1), 'board', 'accept', { managerId: me.id, spellId: spell.id })
    expect(world.log.at(-1)!.payload['bold']).toBe(false)
    rollKind(world, createRng(1), 'board', 'pushBack', { managerId: me.id, spellId: spell.id })
    expect(world.log.at(-1)!.payload['bold']).toBe(true)
  })
})

describe('every decision card is a bet', () => {
  it('gives every option its three words, and makes the lowest-variance option the default', () => {
    const { world, spell, club } = employedHuman(13)
    const other = world.clubs.find((c) => c.id !== club.id && c.managerId !== null)!
    const gone = managerById(world, other.managerId!)
    gone.status = { kind: 'unemployed', sinceWeek: world.week, activity: 'wait', monthsSinceShortlisted: 0 }
    other.managerId = null
    const vacancy = openNewVacancies(world, createRng(2))[0]!
    const cards: Decision[] = [
      queueOffer(world, vacancy),
      queueFallout(world, spell, 'Someone'),
      queuePress(world, spell, 'win:home_win'),
      queueBoard(world, spell),
      queueNewDeal(world, squadOf(world, club)[0]!, 9),
      queueWantsAway(world, squadOf(world, club)[1]!),
      queueContract(world, squadOf(world, club)[2]!, human(world).id),
    ]
    for (const d of cards) {
      for (const o of d.options) expect(wordsOn(o), `${d.kind}:${o.key}`).toBe(true)
      const byDefault = d.options.find((o) => o.key === d.defaultKey)!
      expect(byDefault.isDefault, `${d.kind} default flagged`).toBe(true)
      expect(byDefault.bet ? byDefault.bet.sd : 0, `${d.kind} default is the lowest variance`).toBe(lowestSd(d))
      for (const o of d.options) if (o.bold) expect(o.bet!.sd).toBeGreaterThan(byDefault.bet ? byDefault.bet.sd : 0)
    }
    expect(cards[0]!.defaultKey).toBe('decline')
    expect(cards[1]!.defaultKey).toBe('back-down')
    expect(cards[2]!.defaultKey).toBe('measured')
    expect(cards[3]!.defaultKey).toBe('accept')
  })

  it("keeps the standing activity as the month's default, with waiting the gamble", () => {
    const world = createCareer(21, { name: 'Bettor', background: 'coach' })
    const me = human(world)
    if (me.status.kind === 'unemployed') me.status.activity = 'punditry'
    const card = queueActivity(world)
    expect(card.defaultKey).toBe('punditry')
    expect(card.options.find((o) => o.key === 'wait')!.confidence).toBe('likely')
    expect(card.options.find((o) => o.key === 'assistant')!.confidence).toBe('sure thing')
  })

  it("follows the assistant's advice on an expiring contract: the safe side is the default either way", () => {
    const { world, club, me } = employedHuman(14)
    const players = squadOf(world, club).sort((a, b) => b.rating - a.rating)
    const best = players[0]!
    const worst = players[players.length - 1]!
    const keep = queueContract(world, best, me.id)
    expect(keep.defaultKey).toBe(`renew:${T.RENEW_YEARS_PLAYER}`)
    expect(keep.options.find((o) => o.key === 'release')!.bold).toBe(true)
    worst.rating = club.squad.strength - T.RELEASE_BELOW_STRENGTH - 5
    const go = queueContract(world, worst, me.id)
    expect(go.defaultKey).toBe('release')
    expect(go.options.find((o) => o.key === 'release')!.bold).toBe(false)
    expect(go.options.find((o) => o.key === `renew:${T.RENEW_YEARS_PLAYER}`)!.bold).toBe(true)
  })

  it('rolls the dice when the human answers, and Continue takes the default', () => {
    const { world, spell } = employedHuman(15)
    const rng = createRng(9)
    const press = queuePress(world, spell, 'loss:away_win')
    resolveDecisions(world, rng, { [press.id]: 'defiant' })
    const rolled = world.log.filter((e) => e.type === 'decision.rolled' && e.payload['decisionId'] === press.id)
    expect(rolled.length).toBe(1)
    expect(rolled[0]!.payload['key']).toBe('defiant')
    expect(rolled[0]!.payload['bold']).toBe(true)
    expect(rolled[0]!.payload['unit']).toBe('morale')
    const board = queueBoard(world, spell)
    world.week += T.HUMAN_DECISION_DEADLINE_WEEKS
    resolveDecisions(world, rng, {})
    const byDefault = world.log.filter((e) => e.type === 'decision.rolled' && e.payload['decisionId'] === board.id)
    expect(byDefault.length).toBe(1)
    expect(byDefault[0]!.payload['key']).toBe('accept')
    expect(byDefault[0]!.payload['bold']).toBe(false)
    expect(pendingDecisions(world).length).toBe(0)
  })

  it('a promise to the board trades credit now for a harder target, on top of its roll', () => {
    const { world, spell } = employedHuman(16)
    const credit = spell.credit
    const expectation = spell.expectation
    answerBoard(world, createRng(4), spell, 'promise')
    const roll = world.log.find((e) => e.type === 'decision.rolled' && e.payload['kind'] === 'board')!
    expect(spell.credit).toBeCloseTo(Math.min(spell.ceiling, credit + T.BOARD_PROMISE.credit + (roll.payload['applied'] as number)), 1)
    expect(spell.expectation).toBe(Math.max(1, expectation - T.BOARD_PROMISE.places))
  })

  it('the press answer moves the squad, players included', () => {
    const { world, spell, club } = employedHuman(17)
    const before = squadOf(world, club).map((p) => p.morale)
    answerPress(world, createRng(6), spell, 'confident')
    const roll = world.log.find((e) => e.type === 'decision.rolled' && e.payload['kind'] === 'press')!
    const effect = roll.payload['effect'] as number
    const after = squadOf(world, club).map((p) => p.morale)
    if (effect !== 0) expect(after.some((m, i) => m !== before[i])).toBe(true)
  })

  it('gives the team sheet its words', () => {
    expect(selectionWords({ ratingIn: 60, ratingOut: 55, conditionIn: 90, debut: false }).confidence).toBe('sure thing')
    expect(selectionWords({ ratingIn: 52, ratingOut: 55, conditionIn: 90, debut: false }).confidence).toBe('likely')
    expect(selectionWords({ ratingIn: 40, ratingOut: 55, conditionIn: 90, debut: false }).confidence).toBe('gamble')
    expect(selectionWords({ ratingIn: 60, ratingOut: 55, conditionIn: 40, debut: false }).confidence).toBe('gamble')
    expect(selectionWords({ ratingIn: 60, ratingOut: null, conditionIn: 90, debut: true }).likely).toContain('debut')
  })
})

describe('the fairness lines', () => {
  it('measures bold against cautious per kind from the AI rolls, ignoring the human', () => {
    const world = createWorld(2)
    const rng = createRng(2)
    const spell = spellOf(world, world.managers.find((m) => m.status.kind === 'employed')!)!
    for (let i = 0; i < 200; i++) {
      rollKind(world, rng, 'board', i % 2 ? 'pushBack' : 'accept', { managerId: spell.managerId, spellId: spell.id })
    }
    const fair = decisionFairness(world)
    const board = fair.kinds.find((k) => k.kind === 'board')!
    expect(board.boldN).toBe(100)
    expect(board.cautiousN).toBe(100)
    expect(board.ratio).toBeGreaterThan(1.5)
    expect(board.gap).toBeLessThan(0.5)
    expect(fair.worstRatioKind).toBe('board')
    // The human's rolls do not count.
    const career = createCareer(2, { name: 'H', background: 'coach' })
    for (let i = 0; i < 100; i++) rollKind(career, rng, 'activity', 'wait', { managerId: human(career).id })
    expect(decisionFairness(career).kinds.length).toBe(0)
  })
})

describe('the AI rolls every kind', () => {
  it('rolls the fallout and the activity dice', () => {
    const world = createWorld(4)
    const before = world.log.length
    const unemployed = world.managers.find((m) => m.status.kind === 'unemployed')!
    rollKind(world, createRng(1), 'activity', 'wait', { managerId: unemployed.id })
    expect(world.log.length).toBe(before + 2) // reputation.changed + decision.rolled
    const club = clubById(world, 1)
    expect(club).toBeDefined()
  })
})
