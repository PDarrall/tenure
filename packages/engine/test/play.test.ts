import { describe, expect, it } from 'vitest'
import { careerSummary, createCareer } from '../src/play/career.js'
import { pendingDecisions, resolveDecisions } from '../src/play/decisions.js'
import { tryToFill } from '../src/market/hiring.js'
import { rngFromState } from '../src/rng.js'
import { advanceWeek, runWeeks } from '../src/sim/advance.js'
import { openVacancies } from '../src/market/vacancies.js'
import { qualifies } from '../src/market/shortlist.js'
import { clubById, spellOf } from '../src/lookup.js'
import { boardMood } from '../src/tenure/hooks.js'
import { digestWorld } from '../src/digest.js'
import { createWorld } from '../src/world/gen.js'
import { T } from '../src/tunables.js'
import type { Decision, HumanInputs, World } from '../src/types.js'

function me(world: World) {
  return world.managers[world.human!.managerId - 1]!
}

/** Apply to everything the human qualifies for until an offer arrives, then take it. */
function getFirstJob(world: World, answer: (offer: Decision) => string): Decision {
  const player = me(world)
  let offer: Decision | undefined
  for (let i = 0; i < 400 && !offer; i++) {
    const apply = openVacancies(world)
      .filter((v) => v.post.kind === 'home' && qualifies(world, player, v) && !v.applicants.includes(player.id))
      .map((v) => v.id)
    advanceWeek(world, { apply })
    offer = pendingDecisions(world).find((d) => d.kind === 'offer')
  }
  if (!offer) throw new Error('no offer arrived')
  advanceWeek(world, { answers: { [offer.id]: answer(offer) } })
  return offer
}

describe('a human career', () => {
  it('starts the human as an unemployed entrant in a career-policy world', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    const player = me(world)
    expect(player.isHuman).toBe(true)
    expect(player.name).toBe('Test Player')
    expect(player.background).toBe('coach')
    expect(player.status.kind).toBe('unemployed')
    expect(player.history.spellIds).toEqual([])
    expect(world.managers).toHaveLength(T.POPULATION + 1)
    expect(world.logPolicy).toBe('career')
    expect(world.log.at(-1)!.type).toBe('career.started')
  })

  it('gets a first job by applying and negotiating at interview, then picks a tactic', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    const player = me(world)
    const offer = getFirstJob(world, () => 'stability:2')
    expect(offer.blocking).toBe(true)
    expect(offer.options.some((o) => o.key === 'promotion:3')).toBe(true)
    expect(offer.options.some((o) => o.key === 'decline')).toBe(true)
    expect(player.status.kind).toBe('employed')
    const spell = spellOf(world, player)!
    expect(spell.contract.promise).toBe('stability')
    expect(spell.contract.yearsAtSigning).toBe(2)
    expect(world.log.some((e) => e.type === 'vacancy.applied' && e.payload['managerId'] === player.id)).toBe(true)
    expect(world.log.some((e) => e.type === 'manager.hired' && e.payload['managerId'] === player.id)).toBe(true)
    expect(pendingDecisions(world).some((d) => d.kind === 'offer')).toBe(false)

    if (spell.post.kind === 'home') {
      advanceWeek(world, { tactic: { formation: '4-3-3', mentality: 'attack', style: 'pressing' } })
      const club = clubById(world, spell.post.clubId)
      if (spellOf(world, player) === spell && world.week % T.SEASON_WEEKS < T.MATCH_WEEKS) {
        expect(club.formation).toBe('4-3-3')
        expect(club.style).toBe('pressing')
        expect(club.mentality).toBe('attack')
      }
      expect(world.human!.tactic.formation).toBe('4-3-3')
    }
  })

  it('lets the human turn a job down and the club moves on', () => {
    const world = createCareer(2, { name: 'Test Player', background: 'ex-pro' })
    const player = me(world)
    const offer = getFirstJob(world, () => 'decline')
    expect(player.status.kind).toBe('unemployed')
    const vacancyId = offer.payload['vacancyId'] as number
    expect(world.human!.declinedVacancies).toContain(vacancyId)
    runWeeks(world, 6)
    const vacancy = world.vacancies[vacancyId - 1]!
    expect(vacancy.hiredManagerId === null || vacancy.hiredManagerId !== player.id).toBe(true)
  })

  it('asks an employed human about an approach once; a decline sends the club down its shortlist', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    const player = me(world)
    getFirstJob(world, () => 'stability:2')
    // Find a week in post with another club's job open, then make the human that club's chosen target.
    let vacancy = openVacancies(world).find((v) => v.post.kind === 'home')
    for (let i = 0; i < 60 && (!vacancy || player.status.kind !== 'employed'); i++) {
      advanceWeek(world, {})
      vacancy = openVacancies(world).find((v) => v.post.kind === 'home')
    }
    expect(player.status.kind).toBe('employed')
    expect(vacancy).toBeDefined()
    const rng = rngFromState(world.rng)
    vacancy!.poachTargetId = player.id
    vacancy!.shortlist = [player.id, ...vacancy!.shortlist.filter((id) => id !== player.id)]
    expect(tryToFill(world, rng, vacancy!)).toBe('waiting')
    const approach = pendingDecisions(world).find((d) => d.kind === 'approach' && d.payload['vacancyId'] === vacancy!.id)
    expect(approach).toBeDefined()
    resolveDecisions(world, rng, { [approach!.id]: 'decline' })
    expect(player.status.kind).toBe('employed')
    expect(world.human!.declinedVacancies).toContain(vacancy!.id)
    expect(tryToFill(world, rng, vacancy!)).not.toBe('waiting')
    expect(pendingDecisions(world).some((d) => d.kind === 'approach' && d.payload['vacancyId'] === vacancy!.id)).toBe(false)
  })

  it('applies defaults to unanswered decisions and gets through a season in post', () => {
    const world = createCareer(3, { name: 'Test Player', background: 'analyst' })
    const player = me(world)
    getFirstJob(world, () => 'top-half:3')
    const kinds = new Set<string>()
    for (let i = 0; i < T.SEASON_WEEKS && player.status.kind === 'employed'; i++) {
      for (const d of pendingDecisions(world)) kinds.add(d.kind)
      advanceWeek(world)
    }
    const decided = world.log.filter((e) => e.type === 'human.decided' && e.payload['kind'] !== 'offer')
    expect(decided.length).toBeGreaterThan(0)
    expect(decided.every((e) => e.payload['byDefault'] === true)).toBe(true)
    // Nothing waits forever: every decision is resolved within its deadline.
    for (const d of pendingDecisions(world)) expect(d.deadlineWeek).toBeGreaterThanOrEqual(world.week)
    expect(player.history.games).toBeGreaterThan(0)
    expect(['secure', 'settled', 'uneasy', 'under review', 'on the brink']).toContain(boardMood(spellOf(world, player) ?? world.spells[0]!))
    expect(world.log.some((e) => e.type === 'board.note' && e.payload['managerId'] === player.id) || player.status.kind !== 'employed').toBe(true)
  })

  it('takes the window plan when the human answers it', () => {
    const world = createCareer(4, { name: 'Test Player', background: 'coach' })
    const player = me(world)
    getFirstJob(world, () => 'top-half:4')
    let window: Decision | undefined
    for (let i = 0; i < 2 * T.SEASON_WEEKS && !window; i++) {
      if (player.status.kind !== 'employed') break
      advanceWeek(world)
      window = pendingDecisions(world).find((d) => d.kind === 'summerWindow')
    }
    if (!window || player.status.kind !== 'employed') return // sacked before a summer: nothing to plan
    advanceWeek(world, { answers: { [window.id]: 'rebuild' } })
    const event = world.log.filter((e) => e.type === 'squad.window' && e.payload['human'] === true).at(-1)
    expect(event).toBeDefined()
    expect(event!.payload['youth']).toBe(T.YOUTH_MAX_PER_SUMMER)
    expect(world.human!.windowChoice).toBeNull()
  })

  it('resigns, chooses an activity, and retires', () => {
    const world = createCareer(5, { name: 'Test Player', background: 'coach' })
    const player = me(world)
    getFirstJob(world, () => 'top-half:1')
    advanceWeek(world, { resign: true })
    expect(player.status.kind).toBe('unemployed')
    expect(world.log.some((e) => e.type === 'manager.resigned' && e.payload['managerId'] === player.id)).toBe(true)
    advanceWeek(world, { activity: 'punditry' })
    expect(player.status.kind === 'unemployed' && player.status.activity).toBe('punditry')
    advanceWeek(world, { retire: true })
    expect(player.status).toMatchObject({ kind: 'retired', reason: 'voluntary' })
    const summary = careerSummary(world)
    expect(summary.spells).toHaveLength(1)
    expect(summary.spells[0]!.endReason).toBe('resigned')
    expect(summary.score.games).toBe(player.history.games)
    expect(summary.status).toContain('career over')
    // Inputs after the career has ended change nothing.
    const before = JSON.stringify(player)
    advanceWeek(world, { apply: [1], resign: true })
    expect(JSON.stringify(player)).toBe(before)
  })

  it('is deterministic for the same inputs and survives a JSON save mid-career', () => {
    const script = (world: World): HumanInputs => {
      const player = me(world)
      const answers: Record<number, string> = {}
      for (const d of pendingDecisions(world)) answers[d.id] = d.options[0]!.key
      const apply = openVacancies(world)
        .filter((v) => qualifies(world, player, v) && !v.applicants.includes(player.id))
        .map((v) => v.id)
      return { apply, answers, tactic: { formation: '3-5-2' } }
    }
    const a = createCareer(7, { name: 'Test Player', background: 'coach' })
    const b = createCareer(7, { name: 'Test Player', background: 'coach' })
    for (let i = 0; i < 60; i++) {
      advanceWeek(a, script(a))
      advanceWeek(b, script(b))
    }
    expect(digestWorld(a).hash).toBe(digestWorld(b).hash)
    const restored = JSON.parse(JSON.stringify(a)) as World
    for (let i = 0; i < 60; i++) {
      advanceWeek(a, script(a))
      advanceWeek(restored, script(restored))
    }
    expect(digestWorld(restored).hash).toBe(digestWorld(a).hash)
  })

  it('keeps the career log to what concerns the human plus the news', () => {
    const career = createCareer(1, { name: 'Test Player', background: 'coach' })
    const full = createWorld(1)
    runWeeks(career, T.SEASON_WEEKS)
    runWeeks(full, T.SEASON_WEEKS)
    expect(career.log.length).toBeLessThan(full.log.length / 5)
    expect(career.log.some((e) => e.type === 'match.played')).toBe(false) // no club of their own yet
    expect(career.log.some((e) => e.type === 'vacancy.opened')).toBe(true)
    expect(career.log.some((e) => e.type === 'season.end')).toBe(true)
  })
})

describe('the inbox', () => {
  it('renders every week of a scripted career from templates with nothing left unresolved', async () => {
    const { inbox } = await import('../src/play/inbox.js')
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    const player = me(world)
    const froms = new Set<string>()
    let items = 0
    for (let week = 0; week < 3 * T.SEASON_WEEKS && player.status.kind !== 'retired'; week++) {
      const answers: Record<number, string> = {}
      for (const d of pendingDecisions(world)) answers[d.id] = d.kind === 'offer' ? 'top-half:2' : d.options[0]!.key
      const apply = openVacancies(world)
        .filter((v) => v.post.kind === 'home' && qualifies(world, player, v) && !v.applicants.includes(player.id))
        .map((v) => v.id)
      advanceWeek(world, { apply, answers })
      for (const item of inbox(world, world.week - 1, world.week)) {
        items++
        froms.add(item.from)
        expect(item.text, item.text).not.toMatch(/\{\w+\}/)
        expect(item.text, item.text).not.toMatch(/^\[\w+\.\w+\]/)
        expect(item.text.length).toBeGreaterThan(10)
      }
    }
    expect(items).toBeGreaterThan(100)
    expect(froms.has('agent')).toBe(true)
    expect(froms.has('news')).toBe(true)
    if (player.history.spellIds.length > 0) {
      expect(froms.has('match')).toBe(true)
      expect(froms.has('board')).toBe(true)
    }
  })
})

describe('ordinals', () => {
  it('spell positions the way people say them', async () => {
    const { ordinal } = await import('../src/text/render.js')
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '24th', '101st', '111th',
    ])
  })
})
