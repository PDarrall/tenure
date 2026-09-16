import { describe, expect, it } from 'vitest'
import { openVacancies, pendingDecisions, qualifies, tunables } from '@tenure/engine'
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
  withMentality,
  withResign,
  withRetire,
  withShape,
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
    s = withShape(withMentality(s, 'attack'), 'C')
    expect(s.inputs.shape).toBe('C')
    expect(s.world.human!.shape).not.toBe('C')
    s = nextTurn(s)
    expect(s.world.week).toBe(1)
    expect(s.world.human!.shape).toBe('C')
    expect(s.world.human!.mentality).toBe('attack')
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
    const offer = pendingDecisions(s.world).find((d) => d.kind === 'offer')!
    expect(blockingUnanswered(s)).toHaveLength(1)
    expect(canAdvance(s)).toBe(false)
    s = withAnswer(s, offer.id, 'promotion:3')
    expect(canAdvance(s)).toBe(true)
    s = nextTurn(s)
    expect(me(s).status.kind).toBe('employed')
    expect(pendingDecisions(s.world).some((d) => d.kind === 'offer')).toBe(false)
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
    expect(serialize(s.world).length).toBeLessThan(2_000_000)
  })
})
