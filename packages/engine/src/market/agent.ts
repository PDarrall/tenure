/**
 * Your agent (DESIGN.md "Job market"). Every week the human is out of work
 * he puts them forward for the best-fitting open vacancy — the tier within
 * their band, the tags the club wants, the club's need — and says so in
 * the inbox. One application in flight at a time; a vacancy the human
 * withdrew from, or turned down, is never resubmitted. On day one of a
 * career he has one offer ready: the club at the bottom of the band, or
 * one in crisis, with its terms on the table.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clubById, spellOf } from '../lookup.js'
import { bandIndex, clubBandIndex } from '../managers/reputation.js'
import { endSpell } from '../tenure/spell.js'
import { human, humanState, queueOffer } from '../play/decisions.js'
import { openNewVacancies, openVacancies, isCrisis, lastReason } from './vacancies.js'
import { qualifies } from './shortlist.js'
import type { Manager, Vacancy, World } from '../types.js'

export interface AgentFit {
  score: number
  /** The strongest reason, in the agent's words. */
  why: string
}

/** How well a vacancy fits: tier within the band, tag match, the club's need. Null when the human does not qualify. */
export function agentFit(world: World, manager: Manager, vacancy: Vacancy): AgentFit | null {
  if (!qualifies(world, manager, vacancy)) return null
  const club = clubById(world, vacancy.post.clubId)
  const gap = bandIndex(manager.reputation) - clubBandIndex(world, club)
  // Own band fits best; each band below the manager's own costs a share.
  const tier = Math.max(0, 1 - T.AGENT_FIT.perBandBelow * Math.max(0, gap))
  const tags = vacancy.wantTags.length ? manager.tags.filter((t) => vacancy.wantTags.includes(t.tag)).length / vacancy.wantTags.length : 0
  const need = vacancy.crisis ? 1 : vacancy.widened > 0 ? T.AGENT_FIT.needWidened : T.AGENT_FIT.needNormal
  const w = T.AGENT_FIT
  const parts: [number, string][] = [
    [w.tier * tier, gap === 0 ? 'a club in your band' : 'a club within reach'],
    [w.tags * tags, 'they want what you are known for'],
    [w.need * need, vacancy.crisis ? 'they need someone now' : 'they are looking'],
  ]
  parts.sort((a, b) => b[0] - a[0])
  return { score: parts.reduce((s, p) => s + p[0], 0), why: (parts[0] as [number, string])[1] }
}

/** The vacancy the human is applying for right now, if any. */
export function applicationInFlight(world: World, manager: Manager): Vacancy | undefined {
  // A vacancy whose offer the human turned down keeps them listed but is dead to them: it must not hold the agent back.
  const declined = world.human?.declinedVacancies ?? []
  return openVacancies(world).find((v) => v.applicants.includes(manager.id) && !declined.includes(v.id))
}

/** The agent's pick this week, or null when nothing fits or an application is already in flight. */
export function agentPick(world: World): Vacancy | null {
  const state = humanState(world)
  const manager = human(world)
  if (manager.status.kind !== 'unemployed') return null
  if (applicationInFlight(world, manager)) return null
  let best: { vacancy: Vacancy; fit: AgentFit } | null = null
  for (const vacancy of openVacancies(world)) {
    if (state.declinedVacancies.includes(vacancy.id) || state.agentWithdrawn.includes(vacancy.id)) continue
    const fit = agentFit(world, manager, vacancy)
    if (!fit) continue
    if (!best || fit.score > best.fit.score || (fit.score === best.fit.score && vacancy.id < best.vacancy.id)) best = { vacancy, fit }
  }
  return best ? best.vacancy : null
}

/** Weekly: put the human's name in for the best fit. */
export function agentWeekly(world: World): Vacancy | null {
  if (!world.human) return null
  const manager = human(world)
  const vacancy = agentPick(world)
  if (!vacancy) return null
  const fit = agentFit(world, manager, vacancy) as AgentFit
  vacancy.applicants.push(manager.id)
  emit(world, 'agent.applied', { vacancyId: vacancy.id, managerId: manager.id, post: vacancy.post, why: fit.why, season: world.season })
  return vacancy
}

/** The human withdrew: the agent leaves that club alone from now on. */
export function noteWithdrawal(world: World, vacancyId: number): void {
  const state = humanState(world)
  if (!state.agentWithdrawn.includes(vacancyId)) state.agentWithdrawn.push(vacancyId)
}

/**
 * Day one: the club at the bottom of the human's band (lowest prestige in
 * its tiers), or one already in crisis, has its terms on the table. The
 * incumbent leaves by mutual consent to make the post; the offer is the
 * usual interview, promise and years included.
 */
export function firstOffer(world: World, rng: Rng): Vacancy {
  const manager = human(world)
  const band = T.REPUTATION_BANDS[bandIndex(manager.reputation)] as { tiers: readonly number[] }
  const candidates = world.clubs.filter((c) => band.tiers.includes(c.tier))
  const crisis = candidates.filter((c) => isCrisis(world, { kind: 'home', clubId: c.id }, lastReason(world, { kind: 'home', clubId: c.id }), world.week))
  const pool = crisis.length ? crisis : candidates
  const club = [...pool].sort((a, b) => a.prestige - b.prestige || a.id - b.id)[0]
  if (!club) throw new Error('firstOffer: no club in the band')
  if (club.managerId !== null) {
    const incumbent = world.managers[club.managerId - 1]
    const spell = incumbent ? spellOf(world, incumbent) : undefined
    if (spell) endSpell(world, spell, 'mutual', T.MUTUAL_PAYOUT_SHARE)
  }
  const opened = openNewVacancies(world, rng)
  const vacancy = opened.find((v) => v.post.clubId === club.id) ?? openVacancies(world).find((v) => v.post.clubId === club.id)
  if (!vacancy) throw new Error('firstOffer: no vacancy opened')
  vacancy.applicants.push(manager.id)
  queueOffer(world, vacancy, true)
  emit(world, 'agent.firstOffer', { vacancyId: vacancy.id, managerId: manager.id, post: vacancy.post, crisis: vacancy.crisis, season: world.season })
  return vacancy
}
