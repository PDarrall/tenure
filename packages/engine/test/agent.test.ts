import { describe, expect, it } from 'vitest'
import { createCareer } from '../src/play/career.js'
import { pendingDecisions } from '../src/play/decisions.js'
import { advanceTurn } from '../src/sim/turn.js'
import { openVacancies } from '../src/market/vacancies.js'
import { agentFit, agentPick, applicationInFlight } from '../src/market/agent.js'
import { qualifies } from '../src/market/shortlist.js'
import { bandIndex } from '../src/managers/reputation.js'
import { clubById } from '../src/lookup.js'
import { T } from '../src/tunables.js'
import type { Background, Decision, World } from '../src/types.js'

function me(world: World) {
  return world.managers[world.human!.managerId - 1]!
}

function offerOf(world: World): Decision | undefined {
  return pendingDecisions(world).find((d) => d.kind === 'offer')
}

describe('a guaranteed first offer', () => {
  for (const background of ['ex-pro', 'coach', 'analyst'] as Background[]) {
    it(`${background}: day one has one offer on the table, with its terms`, () => {
      const world = createCareer(2, { name: 'Starter', background })
      const offer = offerOf(world)
      expect(offer).toBeDefined()
      expect(offer!.payload['firstOffer']).toBe(true)
      expect(offer!.blocking).toBe(true)
      for (const key of ['years', 'salary', 'budget', 'expectation']) expect(typeof offer!.payload[key]).toBe('number')
      const vacancy = world.vacancies[(offer!.payload['vacancyId'] as number) - 1]!
      const club = clubById(world, vacancy.post.clubId)
      // The bottom of the band: a club in the tiers the human's reputation covers, the lowest prestige of them (or one in crisis).
      const band = T.REPUTATION_BANDS[bandIndex(me(world).reputation)]!
      expect(band.tiers).toContain(club.tier)
      const cheaper = world.clubs.filter((c) => band.tiers.includes(c.tier) && c.prestige < club.prestige)
      expect(vacancy.crisis || cheaper.length === 0).toBe(true)
      expect(club.managerId).toBeNull()
      expect(offer!.options.some((o) => o.key === 'promotion:2')).toBe(true)
      expect(world.log.some((e) => e.type === 'agent.firstOffer')).toBe(true)
    })
  }

  it('accepted, the human manages from the first turn with the promise they chose', () => {
    const world = createCareer(2, { name: 'Starter', background: 'coach' })
    const offer = offerOf(world)!
    const clubId = (offer.payload['post'] as { clubId: number }).clubId
    advanceTurn(world, { answers: { [offer.id]: 'stability:3' } }, { watch: true })
    expect(me(world).status).toMatchObject({ kind: 'employed', post: { kind: 'home', clubId } })
    const spell = world.spells.find((s) => s.managerId === me(world).id)!
    expect(spell.contract.promise).toBe('stability')
    expect(spell.contract.yearsAtSigning).toBe(3)
    // The first turn stops at the first fixture, ready to play.
    expect(world.human!.watched).not.toBeNull()
    expect(world.week).toBe(0)
  })

  it('declined, the human starts unemployed and the agent applies every week until a job comes', () => {
    const world = createCareer(2, { name: 'Starter', background: 'ex-pro' })
    const offer = offerOf(world)!
    advanceTurn(world, { answers: { [offer.id]: 'decline' } })
    expect(me(world).status.kind).toBe('unemployed')
    expect(world.human!.declinedVacancies).toContain(offer.payload['vacancyId'])
    let applied = 0
    let hired = false
    for (let i = 0; i < 120 && !hired; i++) {
      const next = offerOf(world)
      if (next) {
        // The offer came through the agent's application, never through the one the human turned down.
        expect(next.payload['vacancyId']).not.toBe(offer.payload['vacancyId'])
        expect(world.log.some((e) => e.type === 'agent.applied' && e.payload['vacancyId'] === next.payload['vacancyId'])).toBe(true)
        advanceTurn(world, { answers: { [next.id]: 'top-half:2' } })
        hired = me(world).status.kind === 'employed'
        continue
      }
      advanceTurn(world, {})
      if (world.log.some((e) => e.type === 'agent.applied' && e.week === world.week - 1)) applied++
    }
    expect(hired).toBe(true)
    expect(applied).toBeGreaterThan(0)
    // Never at the club he turned down.
    expect(world.log.filter((e) => e.type === 'agent.applied').every((e) => e.payload['vacancyId'] !== offer.payload['vacancyId'])).toBe(true)
  })
})

describe('the agent applies for you', () => {
  it('an unemployed human with a fitting vacancy always has an application in flight within a week', () => {
    const world = createCareer(3, { name: 'Waiter', background: 'coach' })
    const offer = offerOf(world)!
    advanceTurn(world, { answers: { [offer.id]: 'decline' } })
    for (let i = 0; i < 60; i++) {
      if (me(world).status.kind !== 'unemployed') break
      const fitting = openVacancies(world).filter((v) => qualifies(world, me(world), v) && !world.human!.declinedVacancies.includes(v.id))
      if (fitting.length > 0) expect(applicationInFlight(world, me(world))).toBeDefined()
      const answers: Record<number, string> = {}
      for (const d of pendingDecisions(world)) if (d.blocking) answers[d.id] = 'decline'
      advanceTurn(world, { answers })
    }
  })

  it('picks the best fit by band, tags and need, and says why', () => {
    const world = createCareer(3, { name: 'Waiter', background: 'coach' })
    const offer = offerOf(world)!
    advanceTurn(world, { answers: { [offer.id]: 'decline' } })
    // Wait for a week with a choice of vacancies.
    for (let i = 0; i < 40; i++) {
      const fitting = openVacancies(world).filter((v) => qualifies(world, me(world), v) && !world.human!.declinedVacancies.includes(v.id) && !v.applicants.includes(me(world).id))
      if (fitting.length >= 2 && !applicationInFlight(world, me(world))) {
        const pick = agentPick(world)!
        const scores = fitting.map((v) => agentFit(world, me(world), v)!.score)
        expect(agentFit(world, me(world), pick)!.score).toBe(Math.max(...scores))
        expect(agentFit(world, me(world), pick)!.why.length).toBeGreaterThan(3)
        return
      }
      const answers: Record<number, string> = {}
      for (const d of pendingDecisions(world)) if (d.blocking) answers[d.id] = 'decline'
      advanceTurn(world, { answers })
    }
  })

  it('a withdrawn application is not resubmitted to the same club', () => {
    const world = createCareer(3, { name: 'Waiter', background: 'analyst' })
    const offer = offerOf(world)!
    advanceTurn(world, { answers: { [offer.id]: 'decline' } })
    let checked = false
    for (let i = 0; i < 60 && !checked; i++) {
      const inFlight = applicationInFlight(world, me(world))
      if (inFlight && world.log.some((e) => e.type === 'agent.applied' && e.payload['vacancyId'] === inFlight.id)) {
        advanceTurn(world, { withdraw: [inFlight.id] })
        expect(inFlight.applicants).not.toContain(me(world).id)
        expect(world.human!.agentWithdrawn).toContain(inFlight.id)
        // Two more weeks: the agent may apply elsewhere but never there.
        for (let k = 0; k < 2; k++) {
          const answers: Record<number, string> = {}
          for (const d of pendingDecisions(world)) if (d.blocking) answers[d.id] = 'decline'
          advanceTurn(world, { answers })
          expect(inFlight.applicants).not.toContain(me(world).id)
        }
        checked = true
      } else {
        const answers: Record<number, string> = {}
        for (const d of pendingDecisions(world)) if (d.blocking) answers[d.id] = 'decline'
        advanceTurn(world, { answers })
      }
    }
    expect(checked).toBe(true)
  })
})
