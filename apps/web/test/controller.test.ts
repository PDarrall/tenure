import { describe, expect, it } from 'vitest'
import { applicationInFlight, openVacancies, pendingDecisions, qualifies, tunables } from '@tenure/engine'
import {
  blockingUnanswered,
  canAdvance,
  isApplying,
  newSession,
  nextTurn,
  parseSave,
  serialize,
  sessionFromWorld,
  withAnswer,
  withApply,
  withFormation,
  withMentality,
  withResign,
  withRetire,
  withWithdraw,
  type Session,
} from '../src/controller.js'

function me(s: Session) {
  return s.world.managers[s.world.human!.managerId - 1]!
}

/** Apply to every qualifying home vacancy each week until an offer arrives. */
function untilOffer(s: Session): Session {
  for (let i = 0; i < 400; i++) {
    if (pendingDecisions(s.world).some((d) => d.kind === 'offer')) return s
    for (const v of openVacancies(s.world)) {
      if (v.post.kind === 'home' && qualifies(s.world, me(s), v) && !isApplying(s, v.id)) s = withApply(s, v.id)
    }
    s = nextTurn(s)
  }
  throw new Error('no offer')
}

describe('the web controller', () => {
  it('queues and cancels resignation and retirement without ending anything until the turn is played', () => {
    let s = newSession(1, 'Paul', 'coach')
    s = withRetire(s, true)
    expect(s.inputs.retire).toBe(true)
    s = withRetire(s, false)
    s = withResign(withResign(s, true), false)
    expect(s.inputs.retire).toBe(false)
    expect(s.inputs.resign).toBe(false)
    s = nextTurn(s)
    expect(me(s).status.kind).toBe('unemployed')
    s = nextTurn(withRetire(s, true))
    expect(me(s).status.kind).toBe('retired')
  })

  it('starts a career and queues inputs without touching the world until the turn is played', () => {
    let s = newSession(1, ' Paul ', 'ex-pro')
    expect(me(s).name).toBe('Paul')
    expect(me(s).background).toBe('ex-pro')
    expect(s.world.week).toBe(0)
    s = withFormation(withMentality(s, 'attack'), '3-5-2')
    expect(s.inputs.tactic).toEqual({ mentality: 'attack', formation: '3-5-2' })
    expect(s.world.human!.tactic.formation).not.toBe('3-5-2')
    s = nextTurn(s)
    expect(s.world.week).toBe(1)
    expect(s.world.human!.tactic.formation).toBe('3-5-2')
    expect(s.world.human!.tactic.mentality).toBe('attack')
    expect(s.inputs).toEqual({ answers: {} })
    expect(s.turn).toBe(1)
    expect(s.shownFrom.week).toBe(0)
    expect(s.earlier).toEqual([{ index: 0, week: 0 }])
  })

  it('applies and withdraws, and knows what the human is applying for', () => {
    let s = newSession(1, 'Paul', 'coach')
    s = withApply(s, 3)
    expect(isApplying(s, 3)).toBe(true)
    s = withWithdraw(s, 3)
    expect(isApplying(s, 3)).toBe(false)
    expect(s.inputs.apply).toEqual([])
    expect(s.inputs.withdraw).toEqual([3])
  })

  it('blocks the turn on a starred decision until it is answered, then hires on the chosen terms', () => {
    let s = untilOffer(newSession(1, 'Paul', 'ex-pro'))
    // Several clubs can come in the same week; take the first, turn the rest down.
    const offers = pendingDecisions(s.world).filter((d) => d.kind === 'offer')
    expect(blockingUnanswered(s).length).toBeGreaterThanOrEqual(1)
    expect(canAdvance(s)).toBe(false)
    s = withAnswer(s, offers[0]!.id, 'promotion:3')
    for (const other of offers.slice(1)) s = withAnswer(s, other.id, 'decline')
    expect(canAdvance(s)).toBe(true)
    s = nextTurn(s)
    expect(me(s).status.kind).toBe('employed')
    expect(pendingDecisions(s.world).some((d) => d.kind === 'offer')).toBe(false)
  })

  it('the day-one offer: taken, the human manages from the first turn; declined, the agent applies and a withdrawal sticks', () => {
    // Accepting: the answer travels with the session into the turn (a re-render is not waited for).
    const a = newSession(1, 'Paul', 'coach')
    const offer = pendingDecisions(a.world).find((d) => d.kind === 'offer' && d.payload['firstOffer'] === true)
    expect(offer).toBeDefined()
    expect(canAdvance(a)).toBe(false)
    const key = offer!.options.find((o) => o.key.startsWith('promotion:'))!.key
    const hired = nextTurn(withAnswer(a, offer!.id, key))
    expect(me(hired).status.kind).toBe('employed')
    // The first turn already stops at their first match.
    expect(hired.world.human!.watched).not.toBeNull()

    // Declining: unemployed, the agent's application is in flight within a week, and a withdrawal is not resubmitted.
    let d = newSession(1, 'Paul', 'coach')
    const first = pendingDecisions(d.world).find((dd) => dd.kind === 'offer' && dd.payload['firstOffer'] === true)!
    d = nextTurn(withAnswer(d, first.id, 'decline'))
    expect(me(d).status.kind).toBe('unemployed')
    expect(canAdvance(d)).toBe(true)
    // Within a few weeks something fits and the agent has put the name in.
    // The fit can take a while on a quiet market (seed 1 opens few tier-5 posts in the autumn).
    for (let i = 0; i < 40 && !applicationInFlight(d.world, me(d)); i++) d = nextTurn(d)
    const inFlight = applicationInFlight(d.world, me(d))
    expect(inFlight).toBeDefined()
    expect(d.world.log.some((e) => e.type === 'agent.applied' && e.payload['vacancyId'] === inFlight!.id)).toBe(true)
    d = nextTurn(withWithdraw(d, inFlight!.id))
    expect(inFlight!.applicants).not.toContain(me(d).id)
    expect(d.world.human!.agentWithdrawn).toContain(inFlight!.id)
    const next = applicationInFlight(d.world, me(d))
    expect(next?.id).not.toBe(inFlight!.id)
  })

  it('round-trips a save through JSON and rejects things that are not saves', () => {
    let s = newSession(2, 'Paul', 'analyst')
    for (let i = 0; i < 5; i++) s = nextTurn(s)
    const text = serialize(s.world)
    const restored = sessionFromWorld(parseSave(text))
    expect(restored.world.week).toBe(s.world.week)
    expect(restored.shownFrom.week).toBe(s.world.week - 1)
    const a = nextTurn(restored)
    const b = nextTurn(s)
    expect(serialize(a.world)).toBe(serialize(b.world))
    expect(() => parseSave('42')).toThrow()
    expect(() => parseSave('{"week": 1}')).toThrow()
    expect(() => parseSave(JSON.stringify({ ...s.world, human: null }))).toThrow(/human/)
  })

  it('keeps a season of saves small enough for localStorage', () => {
    let s = newSession(3, 'Paul', 'coach')
    for (let i = 0; i < tunables.SEASON_WEEKS; i++) s = nextTurn(s)
    expect(serialize(s.world).length).toBeLessThan(4_000_000)
  })
})

describe('the match view', () => {
  it('stops before the human fixture, plays the division in step to the next pause, takes a substitution and a mentality change, and commits on Continue', { timeout: 60_000 }, async () => {
    const mod = await import('../src/controller.js')
    let s = mod.newSession(3, 'Paul', 'coach')
    s = untilOffer(s)
    const offer = pendingDecisions(s.world).find((d) => d.kind === 'offer')!
    s = mod.nextTurn(mod.withAnswer(s, offer.id, 'top-half:2'))
    for (let i = 0; i < 30 && !mod.watched(s); i++) {
      for (const d of pendingDecisions(s.world)) if (d.blocking) s = mod.withAnswer(s, d.id, d.defaultKey)
      s = mod.nextTurn(s)
    }
    const w = mod.watched(s)!
    const m = mod.humanMatch(s)!
    expect(w.matches.length).toBeGreaterThan(1)
    expect(m.played).toBe(0)
    const side = mod.humanSide(s)
    expect(m[side].isHuman).toBe(true)
    // To key events: the first press stops at the first pause, the rest of the division level with it.
    expect(mod.matchPlay(s)).toBe('fullTime')
    const events = mod.playToNextPause(s)
    expect(events.some((e) => e.pause)).toBe(true)
    expect(m.played).toBeGreaterThan(0)
    expect(m.over).toBe(false)
    for (const other of w.matches) expect(other.played).toBe(m.played)
    const played = m.played
    mod.mentalityWatched(s, 'attack')
    expect(m[side].mentality).toBe('attack')
    const off = m[side].players.find((p) => p.on && p.slot?.position === 'F')!
    const on = m[side].players.find((p) => !p.started && !p.on)!
    expect(mod.substituteWatched(s, off.id, on.id)).toBe(true)
    expect(m[side].subsUsed).toBe(1)
    // A save mid-match keeps the minute, and the toggle travels with it.
    s = mod.withMatchPlay(s, 'keyEvents')
    const saved = mod.parseSave(mod.serialize(s.world))
    expect(saved.human!.watched!.matches[0]!.played).toBe(played)
    expect(saved.human!.matchPlay).toBe('keyEvents')
    // To full time: the whistle for every match in the week.
    mod.playToFullTime(s)
    expect(m.over).toBe(true)
    for (const other of w.matches) expect(other.over).toBe(true)
    const keys = [...w.prepared.map((p) => p.fixture), ...w.others]
    const slotFixtures = keys.map((k) => s.world.fixtures.find((f) => f.competition === k.competition && f.round === k.round && f.homeId === k.homeId && f.awayId === k.awayId)!)
    expect(slotFixtures.some((f) => f.played)).toBe(false)
    s = mod.nextTurn(s)
    expect(mod.watched(s)).toBeNull()
    // The whole slot settled: the division in the minute engine, the rest on the fast path.
    expect(slotFixtures.every((f) => f.played)).toBe(true)
    expect(s.world.log.some((e) => e.type === 'match.played' && e.payload['watched'] === true)).toBe(true)
  })

  it('queues a selection, a captain and a contract talk without touching the world until the turn', async () => {
    const mod = await import('../src/controller.js')
    let s = mod.newSession(1, 'Paul', 'coach')
    s = mod.withSelection(s, { xi: [1, 2, 3], autoPick: false })
    s = mod.withSelection(s, { captain: 2 })
    expect(s.inputs.selection).toEqual({ xi: [1, 2, 3], autoPick: false, captain: 2 })
    expect(s.world.human!.selection.autoPick).toBe(true)
    s = mod.withContractOffer(s, 7)
    s = mod.withContractOffer(s, 7)
    expect(s.inputs.contractOffers).toEqual([7])
    s = mod.nextTurn(s)
    expect(s.world.human!.selection.captain).toBe(2)
    expect(s.world.human!.selection.autoPick).toBe(false)
  })
})
