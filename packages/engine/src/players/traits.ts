/**
 * The twelve traits, each exactly one rule (DESIGN.md "Players"). The rule
 * text here is the contract; the reader is the code that applies it. A test
 * fails on any trait with no reader, and, after phase 3(c), on any rule
 * still pending the minute engine.
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
  /** Where the rule is read. 'pending' until the minute engine owns it (phase 3c). */
  readBy: string | 'pending'
}

export const TRAIT_RULES: Readonly<Record<Trait, TraitRule>> = {
  poacher: { rule: 'Raises the chance a goal is his: he is weighted up when a scorer is drawn.', readBy: 'pending' },
  playmaker: { rule: 'Raises the chance an assist is his: he is weighted up when an assister is drawn.', readBy: 'pending' },
  pace: { rule: 'The direct style creates more with him: each pace or aerial player in the XI adds to expected goals under direct.', readBy: 'season/match.ts styleFactors' },
  aerial: { rule: 'The direct style creates more with him: each pace or aerial player in the XI adds to expected goals under direct.', readBy: 'season/match.ts styleFactors' },
  'tough tackler': { rule: 'Raises his yellow-card rate.', readBy: 'pending' },
  leader: { rule: 'Lifts the morale of every team-mate in the XI after a match he plays.', readBy: 'pending' },
  'big-game': { rule: 'Plays above his rating in cup ties and derbies.', readBy: 'players/select.ts effectiveRating' },
  consistent: { rule: 'No per-match rating noise: he plays to his number every week.', readBy: 'pending' },
  versatile: { rule: 'Halves positional penalties when played out of position.', readBy: 'players/select.ts positionPenalty' },
  loyal: { rule: 'Asks less to stay with, or follow, the manager he is bonded to.', readBy: 'pending' },
  'injury-prone': { rule: 'Raises his injury risk.', readBy: 'pending' },
  'hot-headed': { rule: 'Raises his yellow- and red-card rates.', readBy: 'pending' },
}

export function hasTrait(player: Player, trait: Trait): boolean {
  return player.traits.includes(trait)
}
