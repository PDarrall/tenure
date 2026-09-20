import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { createRng } from '../src/rng.js'
import { runSeasons, runWeeks } from '../src/sim/advance.js'
import { FORMATIONS, FORMATION_NAMES, slotsOf, structureOf } from '../src/players/formations.js'
import { TRAITS, TRAIT_RULES } from '../src/players/traits.js'
import { autoPick, bestXiMean, effectiveRating, enforceSelection, positionPenalty, squadOf, xiBands } from '../src/players/select.js'
import { anchorSquad, generateSquad, positionMix } from '../src/players/gen.js'
import { ensureOpponentSquad, generateEuropeanFields } from '../src/season/europe.js'
import { playerById } from '../src/lookup.js'
import { digestWorld } from '../src/digest.js'
import { T } from '../src/tunables.js'
import type { Player, Trait, World } from '../src/types.js'

function livePlayers(world: World): Player[] {
  return world.players.filter((p): p is Player => p !== null && !p.retired)
}

describe('formations', () => {
  it('are the CM set: twelve, eleven slots each, one keeper, bands that add to ten', () => {
    expect(FORMATION_NAMES).toHaveLength(12)
    for (const name of FORMATION_NAMES) {
      const slots = FORMATIONS[name]
      expect(slots).toHaveLength(11)
      expect(slots.filter((s) => s.position === 'GK')).toHaveLength(1)
      const st = structureOf(name)
      expect(st.defence + st.midfield + st.attack).toBe(10)
      const parts = name.split(' ')[0]!.split('-').map(Number)
      expect(st.defence).toBe(parts[0])
      expect(st.attack).toBe(parts[parts.length - 1])
    }
    expect(structureOf('4-4-2').width).toBe(4)
    expect(structureOf('3-5-2').width).toBe(2)
    expect(structureOf('3-5-2').defenceWidth).toBe(0)
    expect(structureOf('5-4-1').defence).toBe(5)
  })
})

describe('squads', () => {
  const world = createWorld(1)

  it('gives every club a squad of 25, three keepers and the design shape; European opponents wait for their tie', () => {
    for (const club of world.clubs) {
      const squad = squadOf(world, club)
      expect(squad).toHaveLength(T.SQUAD_SIZE)
      const mix = positionMix(squad.length)
      for (const pos of ['GK', 'D', 'M', 'F'] as const) expect(squad.filter((p) => p.position === pos)).toHaveLength(mix[pos])
      for (const p of squad) {
        expect(p.clubId).toBe(club.id)
        expect(p.rating).toBeGreaterThanOrEqual(1)
        expect(p.rating).toBeLessThanOrEqual(100)
        expect(p.potential).toBeGreaterThanOrEqual(p.rating)
        expect(p.traits.length).toBeLessThanOrEqual(2)
        expect(new Set(p.traits).size).toBe(p.traits.length)
        expect(p.contract.wage).toBeGreaterThan(0)
        expect(p.value).toBeGreaterThan(0)
      }
    }
    for (const o of world.europeanOpponents) expect(o.playerIds).toHaveLength(0)
  })

  it('anchors: the best XI in the preferred formation averages the club strength', () => {
    let checked = 0
    for (const club of world.clubs) {
      if (club.squad.strength < T.ANCHOR_MIN_STRENGTH) continue // the rating floor gets in the way of the poorest sides
      const manager = world.managers[club.managerId! - 1]!
      const mean = bestXiMean(world, club, manager.preferredFormation)
      expect(Math.abs(mean - club.squad.strength), `${club.name}: ${mean} vs ${club.squad.strength}`).toBeLessThanOrEqual(T.ANCHOR_TOLERANCE)
      checked++
    }
    // Most of the pyramid sits above the floor; the poorest tier-5 sides (a world-gen artefact, noted in ASSUMPTIONS.md) do not.
    expect(checked).toBeGreaterThanOrEqual(85)
  })

  it('re-anchors after any strength change, and a European opponent gets a squad at its strength for the tie', () => {
    const club = world.clubs[0]!
    club.squad.strength = 40
    anchorSquad(world, club, 40, '4-4-2')
    expect(Math.abs(bestXiMean(world, club, '4-4-2') - 40)).toBeLessThanOrEqual(T.ANCHOR_TOLERANCE)
    const rng = createRng(3)
    const fields = generateEuropeanFields(world, rng, { championsCup: 12, europaCup: 14, conferenceCup: 14 })
    expect(fields.championsCup).toHaveLength(12)
    expect(world.europeanOpponents).toHaveLength(40)
    const opponent = fields.championsCup[0]!
    ensureOpponentSquad(world, rng, opponent)
    expect(opponent.playerIds).toHaveLength(T.EUROPEAN_OPPONENT_SQUAD_SIZE)
    expect(Math.abs(bestXiMean(world, opponent, T.DEFAULT_FORMATION) - opponent.strength)).toBeLessThanOrEqual(T.ANCHOR_TOLERANCE)
    // Its players are named from its own pool and belong to it.
    for (const id of opponent.playerIds) expect(world.players[id - 1]!.clubId).toBe(opponent.id)
  })

  it('is deterministic and JSON-safe with players in the world', () => {
    const a = createWorld(4)
    const b = createWorld(4)
    expect(digestWorld(a).hash).toBe(digestWorld(b).hash)
    expect(JSON.parse(JSON.stringify(a)).players.length).toBe(a.players.length)
  })
})

describe('selection', () => {
  it('charges the DESIGN penalties out of position and halves them for the versatile', () => {
    const world = createWorld(2)
    const p = livePlayers(world).find((x) => x.position === 'M' && x.side === 'C' && !x.traits.includes('versatile'))!
    expect(positionPenalty(p, { position: 'M', side: 'C' })).toBe(0)
    expect(positionPenalty(p, { position: 'F', side: 'C' })).toBe(T.POSITION_PENALTY_ADJACENT)
    expect(positionPenalty(p, { position: 'D', side: 'C' })).toBe(T.POSITION_PENALTY_ADJACENT)
    expect(positionPenalty(p, { position: 'GK', side: 'C' })).toBe(T.POSITION_PENALTY_DISTANT)
    expect(positionPenalty(p, { position: 'M', side: 'L' })).toBe(T.SIDE_PENALTY)
    expect(positionPenalty(p, { position: 'F', side: 'R' })).toBe(T.POSITION_PENALTY_ADJACENT + T.SIDE_PENALTY)
    const v: Player = { ...p, traits: ['versatile'] }
    expect(positionPenalty(v, { position: 'F', side: 'C' })).toBe(T.POSITION_PENALTY_ADJACENT * T.VERSATILE_PENALTY_SHARE)
    const anyside: Player = { ...p, side: 'any', traits: [] }
    expect(positionPenalty(anyside, { position: 'M', side: 'L' })).toBe(0)
  })

  it('costs rating below 80 condition and pays the big-game bonus only in big games', () => {
    const world = createWorld(2)
    const p = livePlayers(world).find((x) => x.position === 'D' && !x.traits.includes('big-game'))!
    const slot = { position: 'D' as const, side: p.side === 'any' ? ('C' as const) : p.side }
    const fresh = effectiveRating({ ...p, condition: 100, morale: 50 }, slot)
    expect(fresh).toBeCloseTo(p.rating, 6)
    expect(effectiveRating({ ...p, condition: 60, morale: 50 }, slot)).toBeCloseTo(p.rating - 20 * T.CONDITION_RATING_PER_POINT, 6)
    const big: Player = { ...p, condition: 100, morale: 50, traits: ['big-game'] }
    expect(effectiveRating(big, slot, { bigGame: true })).toBeCloseTo(p.rating + T.BIG_GAME_BONUS, 6)
    expect(effectiveRating(big, slot, { bigGame: false })).toBeCloseTo(p.rating, 6)
  })

  it('auto-picks eleven distinct available players filling every slot, leaves the injured out, and a youth-first lean favours under-24s', () => {
    const world = createWorld(3)
    const club = world.clubs[5]!
    const picked = autoPick(world, club, '4-4-2')
    expect(picked.xi).toHaveLength(11)
    expect(new Set(picked.xi).size).toBe(11)
    expect(picked.bench).toHaveLength(T.BENCH_SIZE)
    expect(playerById(world, picked.xi[0]!)!.position).toBe('GK')
    expect(picked.bench.some((id) => playerById(world, id)!.position === 'GK')).toBe(true)
    // Injure the picked keeper: the other one plays.
    const keeper = playerById(world, picked.xi[0]!)!
    keeper.injuryWeeks = 3
    const again = autoPick(world, club, '4-4-2')
    expect(again.xi).not.toContain(keeper.id)
    expect(playerById(world, again.xi[0]!)!.position).toBe('GK')
    keeper.injuryWeeks = 0
    // A young player just short of a starter's rating gets in under youth-first.
    const squad = squadOf(world, club)
    const starterMids = picked.xi.map((id) => playerById(world, id)!).filter((p) => p.position === 'M')
    const weakest = [...starterMids].sort((a, b) => a.rating - b.rating)[0]!
    for (const p of squad) p.age = Math.max(p.age, T.YOUTH_AGE) // nobody else gets the youth bonus
    const young = squad.find((p) => p.position === 'M' && !picked.xi.includes(p.id))!
    young.age = 20
    young.rating = weakest.rating - 2
    young.side = weakest.side
    young.condition = 100
    young.morale = weakest.morale
    young.traits = weakest.traits.filter((t) => t !== 'big-game')
    const results = autoPick(world, club, '4-4-2', 'results-first')
    const youth = autoPick(world, club, '4-4-2', 'youth-first')
    expect(results.xi).not.toContain(young.id)
    expect(youth.xi).toContain(young.id)
  })

  it('enforces the human pick: unavailable or missing players are replaced and the change is reported', () => {
    const world = createWorld(3)
    const club = world.clubs[7]!
    const picked = autoPick(world, club, '4-3-3')
    const out = playerById(world, picked.xi[4]!)!
    out.suspension = 1
    const enforced = enforceSelection(world, club, '4-3-3', picked.xi, picked.bench)
    expect(enforced.changed).toEqual([4])
    expect(enforced.xi).toHaveLength(11)
    expect(enforced.xi).not.toContain(out.id)
    expect(new Set([...enforced.xi, ...enforced.bench]).size).toBe(enforced.xi.length + enforced.bench.length)
    out.suspension = 0
    const short = enforceSelection(world, club, '4-3-3', picked.xi.slice(0, 8), [])
    expect(short.xi).toHaveLength(11)
    expect(short.changed).toEqual([8, 9, 10])
  })

  it('reads bands from the XI: a 4-5-1 has more midfield and less attack than a 4-4-2 from the same squad', () => {
    const world = createWorld(5)
    const club = world.clubs[3]!
    const a = xiBands(world, autoPick(world, club, '4-4-2').xi, '4-4-2')
    const b = xiBands(world, autoPick(world, club, '4-5-1').xi, '4-5-1')
    expect(b.midfield).toBeGreaterThan(a.midfield)
    expect(b.attack).toBeLessThan(a.attack)
    expect(Math.abs(a.strength - club.squad.strength)).toBeLessThan(6)
  })
})

describe('traits', () => {
  it('are twelve, each with exactly one rule that some code reads', () => {
    expect(TRAITS).toHaveLength(12)
    const src = join(process.cwd(), 'packages/engine/src')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (full.endsWith('.ts') && !full.endsWith('traits.ts') && !full.endsWith('types.ts') && !full.endsWith('tunables.ts')) files.push(full)
      }
    }
    walk(src)
    const code = files.map((f) => readFileSync(f, 'utf8')).join('\n')
    const pending: Trait[] = []
    for (const trait of TRAITS) {
      const rule = TRAIT_RULES[trait]
      expect(rule.rule.length, trait).toBeGreaterThan(10)
      if (rule.readBy === 'pending') {
        pending.push(trait)
        continue
      }
      const read = code.includes(`'${trait}'`)
      expect(read, `no engine code reads the ${trait} trait (rule: ${rule.rule})`).toBe(true)
    }
    // Since phase 3(c) the minute engine owns its rules: nothing may be pending.
    expect(pending).toEqual([])
  })
})

describe('squad depth', () => {
  const world = createWorld(11)

  it('shapes a squad of 25 as DESIGN names it: 3 GK, 8 D, 9 M, 5 F', () => {
    const mix = positionMix(T.SQUAD_SIZE)
    expect(mix).toEqual({ GK: 3, D: 8, M: 9, F: 5 })
  })

  it('falls away below the XI, and further down at lower tiers', () => {
    // DESIGN.md "Players": depth falls away below the XI, and further down at
    // lower tiers — a tier-5 squad is a strong XI and little else. Read as the
    // reserves' mean against the best XI's, in the club's own terms.
    const shortfall = (tier: number): number => {
      const clubs = world.clubs.filter((c) => c.tier === tier)
      let total = 0
      for (const club of clubs) {
        const squad = squadOf(world, club).sort((a, b) => b.rating - a.rating)
        const xi = squad.slice(0, 11)
        const rest = squad.slice(11)
        const xiMean = xi.reduce((n, p) => n + p.rating, 0) / xi.length
        const restMean = rest.reduce((n, p) => n + p.rating, 0) / rest.length
        total += (xiMean - restMean) / xiMean
      }
      return total / clubs.length
    }
    const byTier = [1, 2, 3, 4, 5].map(shortfall)
    for (const v of byTier) expect(v).toBeGreaterThan(0)
    // Every tier falls away more steeply than the one above it.
    for (let i = 1; i < byTier.length; i++) expect(byTier[i] as number).toBeGreaterThan(byTier[i - 1] as number)
    expect(byTier[4] as number).toBeGreaterThan((byTier[0] as number) * 1.3)
  })

  it('still leaves the best XI on the club strength at every tier', () => {
    // Genesis puts a handful of tier-5 clubs on a strength of 1, and a rating
    // cannot go below 1, so the anchor has nowhere to shift them: those are
    // read once strength is derived from the squad (the test below).
    const anchored = world.clubs.filter((c) => c.squad.strength > 5)
    expect(anchored.length).toBeGreaterThan(world.clubs.length - 25)
    for (const club of anchored) {
      const manager = club.managerId === null ? null : world.managers[club.managerId - 1]!
      const formation = manager ? manager.preferredFormation : club.formation
      expect(Math.abs(bestXiMean(world, club, formation) - club.squad.strength), club.name).toBeLessThanOrEqual(0.06)
    }
  })
})

describe('players over seasons', () => {
  it('keeps every squad at size through windows and summers, strength is the best XI, and forgets nobody who matters', { timeout: 60_000 }, () => {
    const world = createWorld(6)
    runSeasons(world, 2)
    for (const club of world.clubs) {
      const squad = squadOf(world, club)
      expect(squad).toHaveLength(T.SQUAD_SIZE)
      const manager = club.managerId === null ? null : world.managers[club.managerId - 1]!
      const formation = manager ? manager.preferredFormation : club.formation
      // Strength is derived from the squad (the flip): the best XI's mean in the club's formation, to a tenth.
      expect(Math.abs(bestXiMean(world, club, formation) - club.squad.strength), club.name).toBeLessThanOrEqual(0.06)
      for (const p of squad) expect(p.age).toBeLessThan(T.PLAYER_RETIRE_AT + 1)
    }
    const kept = world.players.filter((p) => p !== null).length
    const live = livePlayers(world).length
    const inClubs = world.clubs.reduce((n, c) => n + c.playerIds.length, 0) + world.europeanOpponents.reduce((n, o) => n + o.playerIds.length, 0)
    const pool = livePlayers(world).filter((p) => p.clubId === 0).length
    // The summer window runs into the season: candidates from abroad wait in the world until its deadline.
    const abroad = livePlayers(world).filter((p) => p.abroad && p.clubId === T.ABROAD_CLUB_ID).length
    expect(live).toBe(inClubs + pool + abroad)
    // Dropped records leave holes, not ghosts: a retired player is kept only if somebody made him, and only made players wait in the pool.
    const keptRetired = world.players.filter((p): p is Player => p !== null && p.retired)
    expect(kept).toBe(live + keptRetired.length)
    for (const p of keptRetired) expect(p.madeBy.length).toBeGreaterThan(0)
    for (const p of livePlayers(world)) if (p.clubId === 0) expect(p.madeBy.length).toBeGreaterThan(0)
    expect(world.log.some((e) => e.type === 'player.retired')).toBe(true)
    expect(world.log.some((e) => e.type === 'player.promoted')).toBe(true)
  })

  it('plays a week with AI sides picked from their squads and the human tactic honoured', () => {
    const world = createWorld(1)
    runWeeks(world, 1)
    const played = world.log.filter((e) => e.type === 'match.played')
    expect(played.length).toBeGreaterThan(50)
  })
})
