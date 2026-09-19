/**
 * DESIGN.md "Transfers": two windows, the director of football's cards, a
 * bid that negotiates itself with two rolls, every signing a bet revealed
 * over five matches, sales on the wage bill or an unsettled player, and
 * nothing moving between windows but free agents.
 */
import { describe, expect, it } from 'vitest'
import { createRng } from '../src/rng.js'
import { T } from '../src/tunables.js'
import { createWorld } from '../src/world/gen.js'
import { createCareer } from '../src/play/career.js'
import { advanceWeek } from '../src/sim/advance.js'
import { clubById, managerById, playerById, spellOf } from '../src/lookup.js'
import { human, pendingDecisions } from '../src/play/decisions.js'
import { startSpell } from '../src/tenure/spell.js'
import { squadOf } from '../src/players/select.js'
import { seasonWeek } from '../src/season/calendar.js'
import { clubAcceptP, deadlineOf, estimateSd, isCardClose, isDeadlineWeek, needs, playerAcceptP, proposeSale, proposeSignings, rangeHalf, resolveBids, revealSignings, scoutedView, wageBill, windowAt, windowState, placeBid } from '../src/market/director.js'
import { directorWeek } from '../src/play/transfers.js'
import type { World } from '../src/types.js'

/** A career with the human seated at a tier-3 club with money, on a chosen season week. */
function seated(seed: number, sw: number, tier = 3): { world: World; clubId: number } {
  const world = createCareer(seed, { name: 'Dealer', background: 'coach' })
  const me = human(world)
  const club = world.clubs.find((c) => c.tier === tier && c.managerId !== null)!
  const incumbent = managerById(world, club.managerId!)
  const old = spellOf(world, incumbent)!
  old.endWeek = world.week
  old.endReason = 'sacked'
  incumbent.status = { kind: 'unemployed', sinceWeek: world.week, activity: 'wait', monthsSinceShortlisted: 0 }
  club.managerId = null
  world.human!.pending = []
  startSpell(world, createRng(seed), me, { kind: 'home', clubId: club.id }, { years: 2, promise: 'top-half', crisis: false })
  // Move the calendar: the world is at week 0 of season 1; jump inside the season without playing it.
  world.week = sw
  club.transferPot = 30
  club.wageBudget = Math.max(club.wageBudget, wageBill(world, club) * 2)
  return { world, clubId: club.id }
}

describe('the windows', () => {
  it('knows the summer, January, deadline day and the weeks between', () => {
    expect(windowAt(T.JANUARY_WINDOW_WEEKS[0])).toBe('january')
    expect(windowAt(T.JANUARY_WINDOW_WEEKS[1])).toBe('january')
    expect(windowAt(T.JANUARY_WINDOW_WEEKS[1] + 1)).toBeNull()
    expect(windowAt(T.MATCH_WEEKS)).toBe('summer')
    expect(windowAt(T.SEASON_WEEKS - 1)).toBe('summer')
    expect(windowAt(5)).toBeNull()
    expect(isDeadlineWeek(deadlineOf('january'))).toBe(true)
    expect(isDeadlineWeek(deadlineOf('summer'))).toBe(true)
    expect(isDeadlineWeek(T.JANUARY_WINDOW_WEEKS[0])).toBe(false)
    // Cards come at the close of the week before each window week but deadline day and the summer's first week.
    expect(isCardClose(T.JANUARY_WINDOW_WEEKS[0] - 1)).toBe('january')
    expect(isCardClose(T.JANUARY_WINDOW_WEEKS[1] - 1)).toBeNull()
    expect(isCardClose(T.MATCH_WEEKS - 1)).toBeNull()
    expect(isCardClose(T.MATCH_WEEKS)).toBe('summer')
    expect(isCardClose(T.SEASON_WEEKS - 2)).toBeNull()
  })

  it('reports the banner: open, which window, weeks to the deadline', () => {
    const world = createWorld(3)
    world.week = T.JANUARY_WINDOW_WEEKS[0]
    expect(windowState(world)).toEqual({ open: true, window: 'january', deadlineWeek: T.JANUARY_WINDOW_WEEKS[1], weeksToDeadline: T.JANUARY_WINDOW_WEEKS[1] - T.JANUARY_WINDOW_WEEKS[0] })
    world.week = 3
    expect(windowState(world).open).toBe(false)
  })
})

describe('the director', () => {
  it('has a judgement from wealth, and his range and error narrow with it', () => {
    const world = createWorld(4)
    for (const c of world.clubs) {
      expect(c.director.name.length).toBeGreaterThan(0)
      expect(c.director.judgement).toBeGreaterThanOrEqual(T.DIRECTOR_JUDGEMENT_RANGE[0])
      expect(c.director.judgement).toBeLessThanOrEqual(T.DIRECTOR_JUDGEMENT_RANGE[1])
    }
    const rich = [...world.clubs].sort((a, b) => b.wealth - a.wealth).slice(0, 10)
    const poor = [...world.clubs].sort((a, b) => a.wealth - b.wealth).slice(0, 10)
    const mean = (cs: typeof rich) => cs.reduce((s, c) => s + c.director.judgement, 0) / cs.length
    expect(mean(rich)).toBeGreaterThan(mean(poor))
    expect(estimateSd(90)).toBeLessThan(estimateSd(30))
    expect(rangeHalf(90)).toBeLessThan(rangeHalf(30))
    expect(estimateSd(50)).toBeCloseTo(3, 5)
  })

  it('brings up to three cards a week inside the pot and the wage budget, with ranges, fee, wage, reason, confidence and the pot after', () => {
    const { world, clubId } = seated(5, T.JANUARY_WINDOW_WEEKS[0] - 1)
    const club = clubById(world, clubId)
    directorWeek(world, createRng(5), 'january')
    const cards = pendingDecisions(world).filter((d) => d.kind === 'signing')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBeLessThanOrEqual(T.DIRECTOR_CARDS_PER_WEEK)
    for (const d of cards) {
      expect(d.from).toBe('director')
      expect(d.defaultKey).toBe('decline')
      expect(d.options.map((o) => o.key)).toEqual(['approve', 'decline', 'another'])
      for (const o of d.options) expect(typeof o.likely).toBe('string')
      const p = d.payload
      expect(p['lo']).toBeLessThanOrEqual(p['hi'] as number)
      expect((p['fee'] as number) + (p['after'] as number)).toBeCloseTo(p['pot'] as number, 1)
      expect(p['fee']).toBeLessThanOrEqual(club.transferPot)
      expect(['need', 'request', 'bargain']).toContain(p['reason'])
      expect(['sure thing', 'likely', 'gamble']).toContain(p['confidence'])
      // The card names a real player at another club, a free agent, or one generated from abroad.
      const player = playerById(world, p['playerId'] as number)!
      expect(player.clubId).not.toBe(clubId)
      expect(player.position).toBe((p['need'] as { position: string }).position)
    }
    // The wage the director offers keeps the bill inside the budget.
    const bill = wageBill(world, club)
    for (const d of cards) expect(bill + ((d.payload['wage'] as number) * T.WAGE_WEEKS_PER_YEAR) / 1000).toBeLessThanOrEqual(club.wageBudget + 0.01)
  })

  it('serves the profile asked for, then goes back to needs', () => {
    const { world, clubId } = seated(6, T.JANUARY_WINDOW_WEEKS[0] - 1)
    world.human!.targetProfile = { position: 'F', maxAge: 26 }
    directorWeek(world, createRng(6), 'january')
    const cards = pendingDecisions(world).filter((d) => d.kind === 'signing')
    expect(cards.length).toBeGreaterThan(0)
    for (const d of cards) {
      expect(d.payload['position']).toBe('F')
      expect(d.payload['age'] as number).toBeLessThanOrEqual(26)
      expect(d.payload['reason']).toBe('request')
    }
    expect(world.human!.targetProfile).toBeNull()
    void clubId
  })

  it('an approved bid negotiates itself with a roll on the club and one on the player, and the answer is logged at the close', () => {
    const { world, clubId } = seated(7, T.JANUARY_WINDOW_WEEKS[0])
    const club = clubById(world, clubId)
    const rng = createRng(7)
    const cards = proposeSignings(world, rng, club, 3, null, new Set(), 'january')
    expect(cards.length).toBeGreaterThan(0)
    const c = cards[0]!
    const bid = placeBid(world, club, c, human(world).id)
    expect(world.bids).toContain(bid)
    expect(clubAcceptP(world, c.player, c.fee, 'january')).toBeGreaterThan(0)
    expect(playerAcceptP(world, c.player, club, c.wage)).toBeGreaterThan(0)
    const pot = club.transferPot
    resolveBids(world, rng)
    expect(world.bids.length).toBe(0)
    const answer = world.log.filter((e) => (e.type === 'transfer.completed' || e.type === 'bid.failed') && e.payload['playerId'] === c.player.id)
    expect(answer.length).toBe(1)
    if (answer[0]!.type === 'transfer.completed') {
      const p = playerById(world, c.player.id)!
      expect(p.clubId).toBe(clubId)
      expect(p.scouted).not.toBeNull()
      expect(p.scouted!.revealed).toBe(false)
      expect(club.transferPot).toBeCloseTo(pot - c.fee, 1)
      expect(p.madeBy.some((t) => t.managerId === human(world).id && t.circumstance === 'signed')).toBe(true)
      // The card shows the estimate as a range; the truth is hidden until five matches are seen.
      const view = scoutedView(p)!
      expect(view.lo).toBeLessThanOrEqual(view.hi)
      expect(view.of).toBe(T.SIGNING_REVEAL_MATCHES)
    } else {
      expect(['club', 'player']).toContain(answer[0]!.payload['reason'])
      expect(club.transferPot).toBe(pot)
    }
  })

  it('reveals a signing over five matches as a hit, a flop or as estimated, with credit and reputation', () => {
    const { world, clubId } = seated(8, T.JANUARY_WINDOW_WEEKS[0])
    const club = clubById(world, clubId)
    const me = human(world)
    const spell = spellOf(world, me)!
    const p = squadOf(world, club)[0]!
    p.scouted = { estimate: p.rating - 3, potentialEstimate: p.potential, halfWidth: 4, matchesSeen: 0, revealed: false, fee: 1, fromClubId: 0, managerId: me.id, week: world.week }
    const before = scoutedView(p)!
    p.scouted.matchesSeen = 2
    const mid = scoutedView(p)!
    expect(mid.hi - mid.lo).toBeLessThan(before.hi - before.lo)
    p.scouted.matchesSeen = T.SIGNING_REVEAL_MATCHES
    const credit = spell.credit
    const rep = me.reputation
    revealSignings(world, [clubId])
    expect(p.scouted.revealed).toBe(true)
    const e = world.log.find((ev) => ev.type === 'signing.revealed' && ev.payload['playerId'] === p.id)!
    expect(e.payload['verdict']).toBe('hit')
    expect(spell.credit).toBeCloseTo(Math.min(spell.ceiling, credit + T.SIGNING_HIT_CREDIT), 1)
    expect(me.reputation).toBeCloseTo(rep + T.SIGNING_HIT_REP, 5)
    expect(scoutedView(p)).toBeNull()
    // A flop costs credit.
    const q = squadOf(world, club)[1]!
    q.scouted = { estimate: q.rating + 5, potentialEstimate: q.potential, halfWidth: 4, matchesSeen: T.SIGNING_REVEAL_MATCHES, revealed: false, fee: 1, fromClubId: 0, managerId: me.id, week: world.week }
    const c2 = spell.credit
    revealSignings(world, [clubId])
    expect(world.log.at(-1)!.payload['verdict']).toBe('flop')
    // A flop costs credit (the loss is scaled by blame, like every negative delta).
    expect(spell.credit).toBeLessThan(c2)
    expect(spell.credit).toBeGreaterThanOrEqual(c2 + T.SIGNING_FLOP_CREDIT)
  })

  it('proposes a sale when the wage bill is over budget or a player is unsettled', () => {
    const { world, clubId } = seated(9, T.JANUARY_WINDOW_WEEKS[0])
    const club = clubById(world, clubId)
    expect(proposeSale(world, club, new Set())).toBeNull()
    club.wageBudget = wageBill(world, club) / 2
    const wages = proposeSale(world, club, new Set())!
    expect(wages.reason).toBe('wages')
    club.wageBudget = wageBill(world, club) * 2
    const restless = squadOf(world, club)[3]!
    restless.morale = T.UNSETTLED_MORALE - 5
    const sale = proposeSale(world, club, new Set())!
    expect(sale.reason).toBe('unsettled')
    expect(sale.player.id).toBe(restless.id)
  })

  it('needs are the best XI from its weakest slot up', () => {
    const { world, clubId } = seated(10, 3)
    const n = needs(world, clubById(world, clubId))
    expect(n.length).toBe(11)
    for (let i = 1; i < n.length; i++) expect(n[i]!.rating).toBeGreaterThanOrEqual(n[i - 1]!.rating)
  })
})

describe('the calendar in a career', () => {
  it('opens January with cards, shuts on deadline day with its own inbox line, and nothing else moves between windows', () => {
    const { world } = seated(11, 0)
    const me = human(world)
    const club = clubById(world, (me.status as { post: { clubId: number } }).post.clubId)
    club.transferPot = 40
    // Through the autumn: no cards outside a window.
    while (seasonWeek(world.week) < T.JANUARY_WINDOW_WEEKS[0] - 1) {
      advanceWeek(world, {})
      expect(pendingDecisions(world).some((d) => d.kind === 'signing')).toBe(false)
      if (me.status.kind !== 'employed') return // sacked in the autumn: the rest is another test's job
    }
    advanceWeek(world, {}) // the close of the week before January brings the first cards
    expect(world.log.some((e) => e.type === 'window.opened' && e.payload['window'] === 'january')).toBe(true)
    const first = pendingDecisions(world).filter((d) => d.kind === 'signing')
    expect(first.length).toBeGreaterThan(0)
    // Approve the first, decline the rest; the answer comes at the close.
    const answers: Record<number, string> = {}
    first.forEach((d, i) => (answers[d.id] = i === 0 ? 'approve' : 'decline'))
    advanceWeek(world, { answers })
    expect(world.log.some((e) => e.type === 'bid.made')).toBe(true)
    expect(world.log.some((e) => e.type === 'transfer.completed' || (e.type === 'bid.failed' && (e.payload['reason'] === 'club' || e.payload['reason'] === 'player')))).toBe(true)
    while (seasonWeek(world.week) <= T.JANUARY_WINDOW_WEEKS[1]) advanceWeek(world, {})
    expect(world.log.some((e) => e.type === 'window.deadline' && e.payload['window'] === 'january')).toBe(true)
    expect(world.log.some((e) => e.type === 'window.closed')).toBe(true)
    // Candidates from abroad nobody signed are gone; nothing else is queued after the deadline.
    expect(world.players.some((p) => p && !p.retired && p.abroad)).toBe(false)
    expect(pendingDecisions(world).some((d) => d.kind === 'signing')).toBe(false)
  })
})
