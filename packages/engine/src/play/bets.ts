/**
 * Decisions are bets (DESIGN.md "Decisions are bets"). Every option carries
 * three words for the card (likely, downside, confidence) and hidden dice:
 * the roll is mean + sd × z on the seeded RNG. The default is the option
 * with the lowest sd. The roll and its outcome go in the event log as
 * `decision.rolled`, for the inbox, the career page and the population test.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { clubById, managerById, playerById, spellById } from '../lookup.js'
import { squadOf } from '../players/select.js'
import type { Bet, BetUnit, Confidence, DecisionKind, DecisionOption, World } from '../types.js'
import { addCredit } from '../tenure/credit.js'
import { bumpReputation } from '../tenure/exits.js'
import { renderText } from '../text/render.js'

type BetKind = keyof typeof T.BETS

/** The dice for a kind and key from the tunables table. */
export function betFor(kind: BetKind, key: string): Bet {
  const table = T.BETS[kind] as { unit: BetUnit; options: Record<string, { mean: number; sd: number }> }
  const dice = table.options[key]
  if (!dice) throw new Error(`no bet for ${kind}:${key}`)
  return { mean: dice.mean, sd: dice.sd, unit: table.unit }
}

/** Confidence in words from the sd, per unit. */
export function confidenceFor(bet: Bet): Confidence {
  const [sure, likely] = T.BET_CONFIDENCE_BANDS[bet.unit]
  if (bet.sd <= sure) return 'sure thing'
  if (bet.sd <= likely) return 'likely'
  return 'gamble'
}

/**
 * An option with its words and dice. The words come from text/decisions.json
 * under `<kind>_<word>_likely` and `_downside`; `word` defaults to the key.
 */
export function betOption(
  kind: DecisionKind,
  key: string,
  label: string,
  bet: Bet,
  vars: Record<string, string | number> = {},
  salt = 0,
  detail?: string,
  word = key,
): DecisionOption {
  const option: DecisionOption = {
    key,
    label,
    likely: renderText('decisions', `${kind}_${word}_likely`, vars, salt),
    downside: renderText('decisions', `${kind}_${word}_downside`, vars, salt),
    confidence: confidenceFor(bet),
    bet,
  }
  if (detail !== undefined) option.detail = detail
  return option
}

/** An option with words but no dice of its own: a plain refusal, or one another system settles. */
export function plainOption(kind: DecisionKind, key: string, label: string, confidence: Confidence, vars: Record<string, string | number> = {}, salt = 0, detail?: string, word = key): DecisionOption {
  const option: DecisionOption = {
    key,
    label,
    likely: renderText('decisions', `${kind}_${word}_likely`, vars, salt),
    downside: renderText('decisions', `${kind}_${word}_downside`, vars, salt),
    confidence,
  }
  if (detail !== undefined) option.detail = detail
  return option
}

/**
 * Mark the default (lowest sd; an option without dice counts as sd 0) and
 * the bold options (more sd than the default). A named key forces the
 * default: a repeated question keeps its standing answer. Returns the key.
 */
export function markDefault(options: DecisionOption[], forceKey?: string): string {
  const sdOf = (o: DecisionOption) => (o.bet ? o.bet.sd : 0)
  let chosen = options[0]
  if (!chosen) throw new Error('markDefault: no options')
  for (const o of options) if (sdOf(o) < sdOf(chosen)) chosen = o
  if (forceKey !== undefined) {
    const forced = options.find((o) => o.key === forceKey)
    if (forced) chosen = forced
  }
  for (const o of options) {
    o.isDefault = o === chosen
    o.bold = sdOf(o) > sdOf(chosen)
  }
  return chosen.key
}

/** Roll the dice: z clamped, the effect rounded to a tenth. */
export function rollBet(rng: Rng, bet: Bet): { z: number; effect: number } {
  const z = clamp(rng.normal(0, 1), -T.BET_ROLL_CLAMP, T.BET_ROLL_CLAMP)
  return { z: round1(z * 100) / 100, effect: round1(bet.mean + bet.sd * z) }
}

export interface RollTarget {
  kind: DecisionKind
  key: string
  managerId: number
  /** The spell whose credit the roll moves (unit credit). */
  spellId?: number
  /** The player whose morale the roll moves (unit morale); else the club's squad. */
  playerId?: number
  clubId?: number
  decisionId?: number
  bold: boolean
  /** Extra words for the log line. */
  label?: string
}

/**
 * Roll an option's dice and apply the effect in its unit. Emits
 * `decision.rolled` with the roll, the effect and what it landed on. Returns
 * the effect applied (credit and reputation may clamp).
 */
export function resolveBet(world: World, rng: Rng, bet: Bet, target: RollTarget): number {
  const { z, effect } = rollBet(rng, bet)
  let applied = effect
  let on = ''
  switch (bet.unit) {
    case 'credit': {
      const spell = target.spellId === undefined ? undefined : spellById(world, target.spellId)
      if (spell && spell.endWeek === null) {
        applied = addCredit(spell, effect)
        on = 'credit'
      } else applied = 0
      break
    }
    case 'reputation': {
      applied = bumpReputation(world, target.managerId, effect, `decision ${target.kind}`)
      on = 'reputation'
      break
    }
    case 'morale': {
      const player = target.playerId === undefined ? undefined : playerById(world, target.playerId)
      if (player && !player.retired) {
        const before = player.morale
        player.morale = round1(clamp(player.morale + effect, 0, 100))
        applied = round1(player.morale - before)
        on = 'his morale'
      } else if (target.clubId !== undefined) {
        // The squad: the club's morale and every player in it, so the match feels it.
        const club = clubById(world, target.clubId)
        const before = club.squad.morale
        club.squad.morale = round1(clamp(club.squad.morale + effect, 0, 100))
        for (const p of squadOf(world, club)) p.morale = round1(clamp(p.morale + effect, 0, 100))
        applied = round1(club.squad.morale - before)
        on = 'the squad'
      } else applied = 0
      break
    }
  }
  const manager = managerById(world, target.managerId)
  emit(world, 'decision.rolled', {
    kind: target.kind,
    key: target.key,
    managerId: target.managerId,
    human: manager.isHuman,
    ...(target.spellId !== undefined ? { spellId: target.spellId } : {}),
    ...(target.playerId !== undefined ? { playerId: target.playerId } : {}),
    ...(target.clubId !== undefined ? { clubId: target.clubId } : {}),
    ...(target.decisionId !== undefined ? { decisionId: target.decisionId } : {}),
    ...(target.label !== undefined ? { label: target.label } : {}),
    unit: bet.unit,
    mean: bet.mean,
    sd: bet.sd,
    z,
    effect,
    applied,
    on,
    bold: target.bold,
    season: world.season,
  })
  return applied
}

/** Roll a kind's option for an AI manager (or the human off a card): the dice from the table, bold if its sd is above the kind's lowest. */
export function rollKind(world: World, rng: Rng, kind: BetKind, key: string, target: Omit<RollTarget, 'kind' | 'key' | 'bold'>): number {
  const bet = betFor(kind, key)
  const table = T.BETS[kind] as { options: Record<string, { sd: number }> }
  const lowest = Math.min(...Object.values(table.options).map((o) => o.sd))
  return resolveBet(world, rng, bet, { ...target, kind, key, bold: bet.sd > lowest })
}

/** In words, for the card: what the roll did. */
export function rollOutcome(effect: number, unit: BetUnit): 'paid' | 'cost' | 'even' {
  const quiet = unit === 'reputation' ? 0.2 : 0.5
  if (effect > quiet) return 'paid'
  if (effect < -quiet) return 'cost'
  return 'even'
}

/**
 * The substitution and the kid in the eleven are bets too, but the match
 * engine is their dice: these are the three words for the bench sheet and
 * the team sheet, from the rating gap and the player's condition.
 */
export function selectionWords(input: { ratingIn: number; ratingOut: number | null; conditionIn: number; debut: boolean }): { likely: string; downside: string; confidence: Confidence } {
  const gap = input.ratingOut === null ? 0 : input.ratingIn - input.ratingOut
  const tired = input.conditionIn < T.SELECTION_WORDS_TIRED_BELOW
  const confidence: Confidence = input.debut || tired ? 'gamble' : gap >= 0 ? 'sure thing' : gap > -T.SELECTION_WORDS_GAP ? 'likely' : 'gamble'
  const key = input.debut ? 'debut' : tired ? 'tired' : gap >= 0 ? 'upgrade' : 'downgrade'
  return {
    likely: renderText('decisions', `selection_${key}_likely`, {}, 0),
    downside: renderText('decisions', `selection_${key}_downside`, {}, 0),
    confidence,
  }
}
