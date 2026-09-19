import { describe, expect, it } from 'vitest'
import { performance } from 'node:perf_hooks'
import { createWorld } from '../src/world/gen.js'
import { createRng, type Rng } from '../src/rng.js'
import { runSeasons, runWeeks } from '../src/sim/advance.js'
import { lineupFor } from '../src/season/season.js'
import { bestReplacement, createMatch, factsOf, injuredNeedingChange, runToEnd, runToEndWithDefaults, runToNextPause, setMentality, substitute, tick, type MatchState, type SideSetup } from '../src/match/minute.js'
import { T } from '../src/tunables.js'
import type { Club, World } from '../src/types.js'

function setupFor(world: World, rng: Rng, club: Club, isHuman = false): SideSetup {
  const s = lineupFor(world, rng, club.id, { bigGame: false })
  return { clubId: club.id, name: club.name, isHuman, managerId: null, participant: s.participant, xi: s.lineup.xi, bench: s.lineup.bench, formation: club.formation }
}

function matchBetween(world: World, rng: Rng, home: Club, away: Club, humanHome = false, knockout = false): MatchState {
  return createMatch(world, rng, setupFor(world, rng, home, humanHome), setupFor(world, rng, away), knockout)
}

function sameTierPair(world: World, rng: Rng): [Club, Club] {
  for (;;) {
    const home = rng.pick(world.clubs)
    const away = rng.pick(world.clubs)
    if (home.id !== away.id && home.tier === away.tier) return [home, away]
  }
}

/** The same human-home match every time from one seed: the pair, the lineups and the match's own generator all follow the seed. */
function seededMatch(seed: number): MatchState {
  const world = createWorld(seed)
  const rng = createRng(seed)
  const [home, away] = sameTierPair(world, rng)
  return matchBetween(world, rng, home, away, true)
}

function tickTo(state: MatchState, minute: number): void {
  let guard = 0
  while (!state.over && state.minute < minute && guard++ < 200) tick(state)
}

function onPitch(state: MatchState, key: 'home' | 'away'): number {
  return state[key].players.filter((p) => p.on).length
}

describe('the minute engine', () => {
  it('plays the same match twice from the same seed', () => {
    const play = () => {
      const world = createWorld(21)
      runWeeks(world, 2)
      const rng = createRng(5)
      const [home, away] = sameTierPair(world, rng)
      const state = matchBetween(world, rng, home, away)
      runToEnd(state)
      return state
    }
    const a = play()
    const b = play()
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.events.length).toBeGreaterThan(10)
  })

  it('finishes a match headless well inside the budget', () => {
    const world = createWorld(22)
    runWeeks(world, 2)
    const rng = createRng(9)
    const time = () => {
      const [home, away] = sameTierPair(world, rng)
      const state = matchBetween(world, rng, home, away)
      const t0 = performance.now()
      runToEnd(state)
      return performance.now() - t0
    }
    for (let i = 0; i < 5; i++) time()
    const times: number[] = []
    for (let i = 0; i < 20; i++) times.push(time())
    expect(Math.max(...times)).toBeLessThan(T.MATCH_HEADLESS_MS)
  })

  it('saves and resumes mid-match to the same result', () => {
    const play = (interruptAt: number | null) => {
      const world = createWorld(23)
      runWeeks(world, 2)
      const rng = createRng(3)
      const [home, away] = sameTierPair(world, rng)
      let state = matchBetween(world, rng, home, away)
      if (interruptAt !== null) {
        tickTo(state, interruptAt)
        state = JSON.parse(JSON.stringify(state)) as MatchState
      }
      runToEnd(state)
      return state
    }
    const straight = play(null)
    const resumed = play(40)
    expect(resumed.home.goals).toBe(straight.home.goals)
    expect(resumed.away.goals).toBe(straight.away.goals)
    expect(resumed.events.map((e) => e.text)).toEqual(straight.events.map((e) => e.text))
  })
})

describe('the minute engine over many matches', () => {
  const world = createWorld(24)
  runSeasons(world, 2)
  runWeeks(world, 1)
  const rng = createRng(17)
  const matches: MatchState[] = []
  const N = 700
  for (let i = 0; i < N; i++) {
    const [home, away] = sameTierPair(world, rng)
    const state = matchBetween(world, rng, home, away)
    runToEnd(state)
    matches.push(state)
  }
  const sum = (f: (m: MatchState) => number) => matches.reduce((s, m) => s + f(m), 0)

  it('lands the DESIGN Match targets: goals, results, cards, injuries, shots', () => {
    const goals = sum((m) => m.home.goals + m.away.goals) / N
    const homeWins = sum((m) => (m.home.goals > m.away.goals ? 1 : 0)) / N
    const draws = sum((m) => (m.home.goals === m.away.goals ? 1 : 0)) / N
    const awayWins = 1 - homeWins - draws
    const yellows = sum((m) => m.home.stats.yellows + m.away.stats.yellows) / N
    const reds = sum((m) => m.home.stats.reds + m.away.stats.reds) / N
    const injuries = sum((m) => m.home.players.filter((p) => p.injured).length + m.away.players.filter((p) => p.injured).length) / N
    const shots = sum((m) => m.home.stats.shots + m.away.stats.shots) / N
    const onTarget = sum((m) => m.home.stats.onTarget + m.away.stats.onTarget) / N
    expect(goals).toBeGreaterThan(2.2)
    expect(goals).toBeLessThan(3.3)
    expect(homeWins).toBeGreaterThan(awayWins)
    expect(draws).toBeGreaterThan(0.18)
    expect(draws).toBeLessThan(0.34)
    expect(yellows).toBeGreaterThan(2.5)
    expect(yellows).toBeLessThan(4.8)
    expect(reds).toBeGreaterThan(0.08)
    expect(reds).toBeLessThan(0.4)
    expect(injuries).toBeGreaterThan(0.05)
    expect(shots).toBeGreaterThan(14)
    expect(shots).toBeLessThan(32)
    expect(onTarget).toBeGreaterThan(0)
    expect(onTarget).toBeLessThan(shots)
  })

  it('pauses at goals, red cards, half time and full time, and not at fouls; an injury pauses only when it is the human\'s to answer', () => {
    const kinds = new Map<string, { pause: number; total: number }>()
    for (const m of matches) {
      for (const e of m.events) {
        const k = kinds.get(e.kind) ?? { pause: 0, total: 0 }
        k.total++
        if (e.pause) k.pause++
        kinds.set(e.kind, k)
      }
    }
    for (const kind of ['goal', 'red', 'halftime', 'fulltime']) {
      const k = kinds.get(kind)
      expect(k, kind).toBeDefined()
      expect(k!.pause, kind).toBe(k!.total)
    }
    // Nobody here is human: the AI replaces its injured at once, so nothing stops.
    for (const kind of ['injury', 'foul', 'yellow', 'save', 'miss', 'block', 'sub', 'mentality']) {
      const k = kinds.get(kind)
      expect(k, kind).toBeDefined()
      expect(k!.pause, kind).toBe(0)
    }
    expect(matches.every((m) => m.events.filter((e) => e.kind === 'halftime').length === 1)).toBe(true)
    expect(matches.every((m) => m.events[m.events.length - 1]?.kind === 'fulltime')).toBe(true)
  })

  it('names players in every commentary line and leaves no placeholder unfilled', () => {
    for (const m of matches) {
      for (const e of m.events) {
        expect(e.text).not.toMatch(/[{}]/)
        if (e.playerId !== undefined) {
          const p = m.home.players.find((x) => x.id === e.playerId) ?? m.away.players.find((x) => x.id === e.playerId)
          expect(p).toBeDefined()
          if (e.kind !== 'sub') expect(e.text).toContain(p!.name)
        }
      }
      for (const s of m.home.scorers) expect(m.events.some((e) => e.kind === 'goal' && e.text.includes(s.name))).toBe(true)
    }
  })

  it('leaves a side with ten after a red card, and never more than eleven', () => {
    let reds = 0
    for (const m of matches) {
      for (const key of ['home', 'away'] as const) {
        const side = m[key]
        expect(onPitch(m, key)).toBeLessThanOrEqual(11 - side.stats.reds)
        expect(onPitch(m, key)).toBeLessThanOrEqual(11)
        reds += side.stats.reds
        expect(side.subsUsed).toBeLessThanOrEqual(T.SUBS_MAX)
      }
    }
    expect(reds).toBeGreaterThan(0)
  })

  it('substitutes by rule: AI sides replace injuries, and the changes keep their distance', () => {
    let replacedInjuries = 0
    let injuriesWithSubsLeft = 0
    for (const m of matches) {
      for (const key of ['home', 'away'] as const) {
        const side = m[key]
        const injuryEvents = m.events.filter((e) => e.kind === 'injury' && e.side === key)
        for (const inj of injuryEvents) {
          const subAfter = m.events.find((e) => e.kind === 'sub' && e.side === key && e.minute === inj.minute)
          if (subAfter) replacedInjuries++
          injuriesWithSubsLeft++
        }
        const voluntary = m.events.filter((e) => e.kind === 'sub' && e.side === key && !injuryEvents.some((i) => i.minute === e.minute)).map((e) => e.minute)
        for (let i = 1; i < voluntary.length; i++) expect((voluntary[i] as number) - (voluntary[i - 1] as number)).toBeGreaterThanOrEqual(T.SUB_MIN_GAP)
      }
    }
    expect(injuriesWithSubsLeft).toBeGreaterThan(0)
    expect(replacedInjuries / injuriesWithSubsLeft).toBeGreaterThan(0.8)
  })

  it('adds the facts up: goals to scorers, minutes to players, ratings in range', () => {
    for (const m of matches) {
      for (const key of ['home', 'away'] as const) {
        const facts = factsOf(m, key)
        const side = m[key]
        expect(facts.scorers).toHaveLength(side.goals)
        expect(facts.players.reduce((s, p) => s + p.goals, 0)).toBe(side.goals)
        expect(facts.players.filter((p) => p.started)).toHaveLength(11)
        for (const p of facts.players) {
          expect(p.minutes).toBeGreaterThan(0)
          expect(p.minutes).toBeLessThanOrEqual(m.played)
          expect(p.rating).toBeGreaterThanOrEqual(T.RATING_MIN)
          expect(p.rating).toBeLessThanOrEqual(T.RATING_MAX)
        }
        expect(facts.stats.yellows).toBe(side.stats.yellows)
        expect(facts.stats.possession + m[key === 'home' ? 'away' : 'home'].stats.possession).toBe(100)
      }
    }
  })

  it('rates players around the DESIGN mean', () => {
    let sum = 0
    let n = 0
    for (const m of matches) {
      for (const key of ['home', 'away'] as const) {
        for (const p of factsOf(m, key).players) {
          if (!p.started) continue
          sum += p.rating
          n++
        }
      }
    }
    const mean = sum / n
    expect(mean).toBeGreaterThan(6.4)
    expect(mean).toBeLessThan(7.2)
  })
})

describe('decisions during a match', () => {
  const world = createWorld(25)
  runWeeks(world, 2)

  it('the AI takes a tired player off, chases a deficit and holds a lead', () => {
    const rng = createRng(4)
    const [home, away] = sameTierPair(world, rng)
    // Tired.
    const tired = matchBetween(world, rng, home, away)
    tickTo(tired, T.SUB_TIRED_FROM - 1)
    const victim = tired.home.players.find((p) => p.on && p.slot?.position !== 'GK')!
    victim.condition = T.SUB_TIRED_BELOW - 30
    tickTo(tired, T.SUB_TIRED_FROM + 1)
    expect(victim.on).toBe(false)
    expect(tired.events.some((e) => e.kind === 'sub' && e.side === 'home' && e.text.includes(victim.name))).toBe(true)
    // Chasing: two down at 64, attack from 65 with a forward on for a defender.
    const chase = matchBetween(world, rng, home, away)
    tickTo(chase, T.SUB_CHASE_FROM - 1)
    chase.away.goals = chase.home.goals + 2
    chase.home.mentality = 'balanced'
    const defendersBefore = chase.home.players.filter((p) => p.on && p.slot?.position === 'D').length
    tickTo(chase, T.SUB_CHASE_FROM + 1)
    expect(chase.home.mentality).toBe('attack')
    expect(chase.events.some((e) => e.kind === 'mentality' && e.side === 'home')).toBe(true)
    if (chase.home.players.some((p) => !p.started && p.position === 'F' && p.minutes > 0)) {
      expect(chase.home.players.filter((p) => p.on && p.slot?.position === 'D').length).toBe(defendersBefore - 1)
    }
    // Holding: a goal up at 77, defend from 78.
    const hold = matchBetween(world, rng, home, away)
    tickTo(hold, T.SUB_HOLD_FROM - 1)
    hold.home.goals = hold.away.goals + 1
    hold.home.mentality = 'balanced'
    tickTo(hold, T.SUB_HOLD_FROM + 1)
    expect(hold.home.mentality).toBe('defend')
  })

  it('the human substitutes and changes mentality while paused, and the record shows it', () => {
    const rng = createRng(6)
    const [home, away] = sameTierPair(world, rng)
    const state = matchBetween(world, rng, home, away, true)
    tickTo(state, 30)
    const starter = state.home.players.find((p) => p.on && p.slot?.position === 'M')!
    const onId = bestReplacement(state, 'home', starter.id)!
    expect(onId).toBeDefined()
    expect(substitute(state, 'home', starter.id, onId)).toBe(true)
    expect(state.home.subsUsed).toBe(1)
    expect(starter.on).toBe(false)
    const sub = state.home.players.find((p) => p.id === onId)!
    expect(sub.on).toBe(true)
    expect(sub.slot).toEqual(starter.slot)
    const last = state.events[state.events.length - 1]!
    expect(last.kind).toBe('sub')
    expect(last.text).toContain(sub.name)
    expect(last.text).toContain(starter.name)
    // The same player cannot come back, and a used sub cannot be re-used.
    expect(substitute(state, 'home', sub.id, starter.id)).toBe(false)
    expect(substitute(state, 'home', state.home.players.find((p) => p.on && p.id !== sub.id)!.id, starter.id)).toBe(false)
    // Whatever the side started on, a change is recorded once and a repeat is not.
    const target = state.home.mentality === 'attack' ? 'defend' : 'attack'
    setMentality(state, 'home', target)
    expect(state.home.mentality).toBe(target)
    expect(state.events[state.events.length - 1]!.kind).toBe('mentality')
    setMentality(state, 'home', target)
    expect(state.events[state.events.length - 1]!.kind).toBe('mentality')
    // The human's side is not managed by the AI rules.
    state.away.goals = state.home.goals + 3
    tickTo(state, T.SUB_CHASE_FROM + 5)
    expect(state.home.subsUsed).toBe(1)
    runToEnd(state)
    const facts = factsOf(state, 'home')
    expect(facts.players.find((p) => p.playerId === sub.id)!.minutes).toBeGreaterThan(0)
    expect(facts.players.find((p) => p.playerId === sub.id)!.started).toBe(false)
    expect(facts.players.find((p) => p.playerId === starter.id)!.minutes).toBeLessThan(state.played)
  })

  it('to key events: each call plays to the next pause and returns what stopped it', () => {
    const m = seededMatch(31)
    const stops: string[] = []
    let calls = 0
    while (!m.over && calls++ < 60) {
      const events = runToNextPause(m)
      expect(events.length).toBeGreaterThan(0)
      // The call stops on the minute of its first pause: every pausing event it returns is from that minute.
      const pausing = events.filter((e) => e.pause)
      expect(pausing.length).toBeGreaterThanOrEqual(1)
      expect(new Set(pausing.map((e) => `${m.half}-${e.minute}`)).size).toBe(1)
      stops.push(pausing[pausing.length - 1]!.kind)
    }
    expect(m.over).toBe(true)
    expect(stops).toContain('halftime')
    expect(stops[stops.length - 1]).toBe('fulltime')
    expect(stops.every((k) => ['goal', 'red', 'injury', 'halftime', 'fulltime', 'shootout'].includes(k))).toBe(true)
    // The same match, minute by minute, lands on the same result and the same events.
    const again = seededMatch(31)
    runToEnd(again)
    expect(again.events.map((e) => e.text)).toEqual(m.events.map((e) => e.text))
  })

  it('to full time with defaults: the assistant replaces the human side\'s injury with the best on the bench', () => {
    // Find a match where the human side is injured while it still has a change to make.
    let found: { seed: number; minute: number; playerId: number } | null = null
    for (let seed = 40; seed < 400 && !found; seed++) {
      const m = seededMatch(seed)
      runToEnd(m)
      const inj = m.events.find((e) => e.kind === 'injury' && e.side === 'home')
      if (inj && inj.minute < 45 && m.home.subsUsed === 0) found = { seed, minute: inj.minute, playerId: inj.playerId! }
    }
    expect(found).not.toBeNull()
    const { seed, minute, playerId } = found!
    // Plain: the human side plays on with ten, and the injury needs a change.
    const plain = seededMatch(seed)
    tickTo(plain, minute)
    expect(injuredNeedingChange(plain, 'home').map((p) => p.id)).toEqual([playerId])
    expect(plain.events.find((e) => e.kind === 'injury' && e.side === 'home')!.pause).toBe(true)
    // With defaults: the best on the bench takes his slot in the same minute, and the pause is not the view's concern.
    const assisted = seededMatch(seed)
    const wanted = bestReplacement(plain, 'home', playerId)
    runToEndWithDefaults(assisted)
    const sub = assisted.events.find((e) => e.kind === 'sub' && e.side === 'home' && e.minute === minute)
    expect(sub).toBeDefined()
    expect(sub!.playerId).toBe(wanted)
    expect(assisted.home.subsUsed).toBeGreaterThanOrEqual(1)
    expect(assisted.home.players.find((p) => p.id === playerId)!.on).toBe(false)
    expect(injuredNeedingChange(assisted, 'home')).toEqual([])
    expect(assisted.over).toBe(true)
  })

  it('settles a level cup tie on penalties', () => {
    const rng = createRng(8)
    let shootouts = 0
    for (let i = 0; i < 60 && shootouts === 0; i++) {
      const [home, away] = sameTierPair(world, rng)
      const state = matchBetween(world, rng, home, away, false, true)
      runToEnd(state)
      if (state.home.goals === state.away.goals) {
        shootouts++
        expect([state.home.clubId, state.away.clubId]).toContain(state.shootoutWinnerId)
        expect(state.events.some((e) => e.kind === 'shootout')).toBe(true)
      } else expect(state.shootoutWinnerId).toBeNull()
    }
    expect(shootouts).toBe(1)
  })
})
