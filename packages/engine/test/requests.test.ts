/**
 * DESIGN.md "Requests": each ask is a bet with a stated likelihood. The
 * board grants raise expectation and refusals cost credit (the third is a
 * board row); the director serves a profile, goes for a named player,
 * finds a buyer or a loan; a player talks terms, takes the armband or a
 * promise of playing time, and a promise unkept is a fallout. The
 * shortlist and search by position, age and rating.
 */
import { describe, expect, it } from 'vitest'
import { createRng, type Rng } from '../src/rng.js'
import { T } from '../src/tunables.js'
import { createCareer } from '../src/play/career.js'
import { clubById, managerById, playerById, spellOf } from '../src/lookup.js'
import { human, pendingDecisions } from '../src/play/decisions.js'
import { startSpell } from '../src/tenure/spell.js'
import { squadOf } from '../src/players/select.js'
import { applyInputs } from '../src/play/inputs.js'
import { checkPromises, makeRequest, requestLikelihood, requestOptions, returnLoans, searchPlayers, shortlistRows, wordsFor } from '../src/play/requests.js'
import type { World } from '../src/types.js'

function seated(seed: number, sw: number) {
  const world = createCareer(seed, { name: 'Asker', background: 'coach' })
  const me = human(world)
  const club = world.clubs.find((c) => c.tier === 3 && c.managerId !== null)!
  const incumbent = managerById(world, club.managerId!)
  const old = spellOf(world, incumbent)!
  old.endWeek = world.week
  old.endReason = 'sacked'
  incumbent.status = { kind: 'unemployed', sinceWeek: world.week, activity: 'wait', monthsSinceShortlisted: 0 }
  club.managerId = null
  world.human!.pending = []
  const spell = startSpell(world, createRng(seed), me, { kind: 'home', clubId: club.id }, { years: 2, promise: 'top-half', crisis: false })
  world.week = sw
  club.transferPot = 20
  return { world, me, club, spell }
}

/** An rng whose float is fixed: 0 grants everything, 0.999 refuses everything. */
function fixed(value: number): Rng {
  const real = createRng(1)
  return { ...real, float: () => value, chance: (p) => value < p, normal: (mean) => mean, int: real.int.bind(real), pick: real.pick.bind(real), weighted: real.weighted.bind(real), shuffle: real.shuffle.bind(real), state: real.state }
}

describe('the likelihoods', () => {
  it('states every ask with a chance and words, and marks the ones that are not on', () => {
    const { world } = seated(31, 3)
    const rows = requestOptions(world)
    expect(rows.map((r) => r.ask)).toEqual(['budget', 'wages', 'backing', 'profile', 'named', 'sell', 'loan', 'contract', 'captaincy', 'playingTime'])
    for (const r of rows) {
      expect(r.likelihood.p).toBeGreaterThanOrEqual(0)
      expect(['sure thing', 'likely', 'gamble']).toContain(r.likelihood.words)
    }
    // Between windows the director cannot sell, loan or go for a name.
    expect(rows.find((r) => r.ask === 'sell')!.likelihood.available).toBe(false)
    expect(rows.find((r) => r.ask === 'sell')!.likelihood.why).toBe('closed')
    expect(wordsFor(0.9)).toBe('sure thing')
    expect(wordsFor(0.5)).toBe('likely')
    expect(wordsFor(0.2)).toBe('gamble')
  })

  it('the board listens to credit: a manager on the brink is less likely to get money', () => {
    const { world, spell } = seated(32, 3)
    spell.credit = spell.threshold + 40
    const safe = requestLikelihood(world, { to: 'board', ask: 'budget' }).p
    spell.credit = spell.threshold - 10
    const brink = requestLikelihood(world, { to: 'board', ask: 'budget' }).p
    expect(safe).toBeGreaterThan(brink)
  })
})

describe('the board', () => {
  it('granted: the pot grows and the target moves a place; refused: credit falls, and the third refusal is a board row', () => {
    const { world, club, spell } = seated(33, 3)
    const pot = club.transferPot
    const expectation = spell.expectation
    makeRequest(world, fixed(0), { to: 'board', ask: 'budget' })
    expect(club.transferPot).toBeGreaterThan(pot)
    expect(spell.expectation).toBe(Math.max(1, expectation - T.REQUEST_GRANT_PLACES))
    const wages = club.wageBudget
    makeRequest(world, fixed(0), { to: 'board', ask: 'wages' })
    expect(club.wageBudget).toBeGreaterThan(wages)
    const credit = spell.credit
    const rows = spell.season.boardRows
    makeRequest(world, fixed(0.999), { to: 'board', ask: 'backing' })
    expect(spell.credit).toBeLessThan(credit)
    expect(spell.season.refusals).toBe(1)
    makeRequest(world, fixed(0.999), { to: 'board', ask: 'backing' })
    makeRequest(world, fixed(0.999), { to: 'board', ask: 'backing' })
    expect(spell.season.refusals).toBe(3)
    expect(spell.season.boardRows).toBe(rows + 1)
    expect(world.log.filter((e) => e.type === 'request.answered' && e.payload['third'] === true).length).toBe(1)
  })
})

describe('the director', () => {
  it('takes a profile, goes for a named player as a bid, and finds a buyer or a loan in a window', () => {
    const { world, club, me } = seated(34, T.JANUARY_WINDOW_WEEKS[0])
    makeRequest(world, fixed(0), { to: 'director', ask: 'profile', profile: { position: 'F', maxAge: 25 } })
    expect(world.human!.targetProfile).toEqual({ position: 'F', maxAge: 25 })
    // A named player from another club within the pot becomes a bid at the close.
    const rows = searchPlayers(world, { position: 'M', maxRating: club.squad.strength + 5 })
    const target = rows.find((r) => r.fee > 0 && r.fee <= club.transferPot)!
    expect(target).toBeDefined()
    makeRequest(world, fixed(0), { to: 'director', ask: 'named', playerId: target.playerId })
    expect(world.bids.some((b) => b.playerId === target.playerId && b.managerId === me.id)).toBe(true)
    // A sale: a buyer found becomes a sale card with a bidder.
    const p = squadOf(world, club)[5]!
    makeRequest(world, fixed(0), { to: 'director', ask: 'sell', playerId: p.id })
    const sale = pendingDecisions(world).find((d) => d.kind === 'sale' && d.payload['playerId'] === p.id)!
    expect(sale).toBeDefined()
    expect(sale.payload['bidderId']).not.toBeNull()
    // A loan: he goes and comes back at the season's end.
    const q = squadOf(world, club)[6]!
    makeRequest(world, fixed(0), { to: 'director', ask: 'loan', playerId: q.id })
    expect(q.loan).not.toBeNull()
    expect(q.clubId).not.toBe(club.id)
    expect(club.playerIds).not.toContain(q.id)
    returnLoans(world)
    expect(q.loan).toBeNull()
    expect(q.clubId).toBe(club.id)
    expect(club.playerIds).toContain(q.id)
  })

  it('says why a named player is off: the window shut, the pot short, the wage bill', () => {
    const { world, club } = seated(35, 3)
    const row = searchPlayers(world, { position: 'D' })[0]!
    expect(requestLikelihood(world, { to: 'director', ask: 'named', playerId: row.playerId }).why).toBe('closed')
    world.week = T.JANUARY_WINDOW_WEEKS[0]
    club.transferPot = 0
    const priced = searchPlayers(world, { position: 'D' }).find((r) => r.fee > 0)!
    expect(requestLikelihood(world, { to: 'director', ask: 'named', playerId: priced.playerId }).why).toBe('money')
  })
})

describe('the players', () => {
  it('a contract talk puts the demand on the desk when he agrees; the armband and playing time move morale; a promise unkept is a fallout', () => {
    const { world, club, me, spell } = seated(36, 3)
    const p = squadOf(world, club)[0]!
    makeRequest(world, fixed(0), { to: 'player', ask: 'contract', playerId: p.id })
    expect(pendingDecisions(world).some((d) => d.kind === 'playerContract' && d.payload['playerId'] === p.id)).toBe(true)
    const q = squadOf(world, club)[1]!
    const morale = q.morale
    makeRequest(world, fixed(0.999), { to: 'player', ask: 'contract', playerId: q.id })
    expect(q.morale).toBeLessThan(morale)
    makeRequest(world, fixed(0), { to: 'player', ask: 'captaincy', playerId: q.id })
    expect(world.human!.selection.captain).toBe(q.id)
    const r = squadOf(world, club)[2]!
    const before = r.morale
    makeRequest(world, fixed(0), { to: 'player', ask: 'playingTime', playerId: r.id })
    expect(r.morale).toBeGreaterThan(before)
    expect(world.human!.promises!.length).toBe(1)
    // The weeks pass and he did not start: a fallout.
    const fallouts = spell.season.fallouts
    world.week += T.PROMISE_WEEKS
    checkPromises(world)
    expect(world.human!.promises!.length).toBe(0)
    expect(spell.season.fallouts).toBe(fallouts + 1)
    expect(world.log.some((e) => e.type === 'promise.broken' && e.payload['playerId'] === r.id)).toBe(true)
    // Kept: the starts came.
    const s = squadOf(world, club)[3]!
    makeRequest(world, fixed(0), { to: 'player', ask: 'playingTime', playerId: s.id })
    s.season.starts += T.PROMISE_STARTS
    world.week += T.PROMISE_WEEKS
    checkPromises(world)
    expect(world.log.some((e) => e.type === 'promise.kept' && e.payload['playerId'] === s.id)).toBe(true)
    void me
  })
})

describe('the shortlist and search', () => {
  it('searches other clubs and the pool by position, age and rating, as ranges, and keeps a shortlist through the inputs', () => {
    const { world, club } = seated(37, 3)
    const rows = searchPlayers(world, { position: 'F', maxAge: 24, minRating: 30 })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.position).toBe('F')
      expect(r.age).toBeLessThanOrEqual(24)
      expect(r.lo).toBeLessThanOrEqual(r.hi)
      expect(r.clubId).not.toBe(club.id)
      const p = playerById(world, r.playerId)!
      expect(p.rating).toBeGreaterThanOrEqual(30)
    }
    const first = rows[0]!
    applyInputs(world, createRng(2), { shortlistAdd: [first.playerId] })
    expect(world.human!.shortlist).toEqual([first.playerId])
    expect(shortlistRows(world).map((r) => r.playerId)).toEqual([first.playerId])
    applyInputs(world, createRng(2), { shortlistRemove: [first.playerId] })
    expect(shortlistRows(world)).toEqual([])
  })
})

function unused(_w: World): void {}
void unused
