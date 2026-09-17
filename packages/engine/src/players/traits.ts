/**
 * The twelve traits, each exactly one rule (DESIGN.md "Players"). The rule
 * text here is the contract; the reader is the code that applies it. A test
 * fails on any trait with no reader; since phase 3(c) none may be pending.
 */
import type { Player, Trait } from '../types.js'

export const TRAITS: readonly Trait[] = [
  'poacher',
  'playmaker',
  'pace',
  'aerial',
  'tough tackler',
  'leader',
  'big-game',
  'consistent',
  'versatile',
  'loyal',
  'injury-prone',
  'hot-headed',
]

export interface TraitRule {
  rule: string
  /** Where the rule is read. 'pending' was allowed until the minute engine took ownership (phase 3c). */
  readBy: string | 'pending'
}

export const TRAIT_RULES: Readonly<Record<Trait, TraitRule>> = {
  poacher: { rule: 'Raises the chance a goal is his: he is weighted up when a scorer is drawn.', readBy: 'players/select.ts scorerWeight, drawn in match/minute.ts chance and match/aftermath.ts attributeGoals' },
  playmaker: { rule: 'Raises the chance an assist is his: he is weighted up when an assister is drawn.', readBy: 'players/select.ts assisterWeight, drawn in match/minute.ts chance and match/aftermath.ts attributeGoals' },
  pace: { rule: 'The direct style creates more with him: each pace or aerial player in the XI adds to chance frequency under direct.', readBy: 'match/model.ts chanceProfile, counted in players/select.ts xiBands and match/minute.ts liveBands' },
  aerial: { rule: 'The direct style creates more with him: each pace or aerial player in the XI adds to chance frequency under direct.', readBy: 'match/model.ts chanceProfile, counted in players/select.ts xiBands and match/minute.ts liveBands' },
  'tough tackler': { rule: 'Raises his yellow-card rate.', readBy: 'match/aftermath.ts cardChance, drawn per foul in match/minute.ts fouls' },
  leader: { rule: 'Lifts the morale of every team-mate in the XI after a match he plays.', readBy: 'match/aftermath.ts moraleAfterMatch, counted in players/select.ts xiBands' },
  'big-game': { rule: 'Plays above his rating in cup ties and derbies.', readBy: 'players/select.ts effectiveRating' },
  consistent: { rule: 'No per-match rating noise: he plays to his number every week.', readBy: 'match/aftermath.ts matchRating' },
  versatile: { rule: 'Halves positional penalties when played out of position.', readBy: 'players/select.ts positionPenalty' },
  loyal: { rule: 'Asks less to stay with, or follow, the manager he is bonded to.', readBy: 'players/contracts.ts wageDemand' },
  'injury-prone': { rule: 'Raises his injury risk.', readBy: 'match/aftermath.ts injuryChance, drawn per minute in match/minute.ts injuries' },
  'hot-headed': { rule: 'Raises his yellow- and red-card rates.', readBy: 'match/aftermath.ts cardChance, drawn per foul in match/minute.ts fouls' },
}

export function hasTrait(player: Player, trait: Trait): boolean {
  return player.traits.includes(trait)
}
