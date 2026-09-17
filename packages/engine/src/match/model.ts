/**
 * The match model shared by the minute engine and the fast path (DESIGN.md
 * "Match"): a side's rating on the day, where pressure heads, how often a
 * side creates a chance and how good it is, and what a chance converts at.
 * The minute engine reads these live, minute by minute; the fast path reads
 * them once before kick-off, so the two paths agree on their inputs by
 * construction and the calibration table only has to carry what the
 * minutes add: score-state, momentum, tiredness and substitutions.
 */
import { T } from '../tunables.js'
import type { XiBands } from '../players/select.js'
import type { Mentality, Result, Style } from '../types.js'
import { clamp } from '../world/gen.js'

/** A side as the model reads it: the XI in bands plus the manager, form and morale. */
export interface SideView {
  /** Mean effective rating of the eleven. */
  strength: number
  /** Manager's tactical ability, 0–100. */
  tactical: number
  form: readonly Result[]
  /** The XI's mean morale, 0–100. */
  morale: number
  mentality: Mentality
  style: Style
  bands: XiBands
}

export function formScore(form: readonly Result[]): number {
  if (form.length === 0) return 0
  let points = 0
  for (const r of form) points += r === 'W' ? 3 : r === 'D' ? 1 : 0
  return (points / (3 * form.length) - 0.5) * 2
}

/** The side's rating on the day: the XI, form, the manager's tactical ability and morale. */
export function sideRating(v: SideView): number {
  return v.strength + T.FORM_WEIGHT * formScore(v.form) + (T.ABILITY_WEIGHT * (v.tactical - T.SCALE_MIDPOINT)) / T.SCALE_MIDPOINT + (T.MORALE_WEIGHT * (v.morale - T.SCALE_MIDPOINT)) / T.SCALE_MIDPOINT
}

/** Midfielders as a quality-weighted count: the band over the side's own level, so a 4-5-1 outnumbers a 4-4-2 whatever the tier. */
export function midfieldPresence(b: XiBands): number {
  return b.midfield / Math.max(0.01, b.strength / 100)
}

function mentalityLean(m: Mentality): number {
  return m === 'attack' ? T.MENTALITY_LEAN : m === 'defend' ? -T.MENTALITY_LEAN : 0
}

function styleLean(v: SideView, better: boolean): number {
  const s = T.STYLE_PRESSURE
  if (v.style === 'possession') return better ? s.possessionBetter : 0
  if (v.style === 'pressing') return s.pressing
  if (v.style === 'counter') return s.counter
  return 0
}

/**
 * Where pressure heads (DESIGN.md "Match"): strength by band, the midfield,
 * mentality, style, home advantage as a lean, the score (a leading side sits
 * deeper unless attacking) and momentum. Positive favours the home side.
 */
export function pressureLean(home: SideView, away: SideView, homeGoals: number, awayGoals: number, momentum: number): number {
  const rh = sideRating(home)
  const ra = sideRating(away)
  let target = T.PRESSURE_PER_POINT * (rh - ra)
  target += T.PRESSURE_PER_MID * (midfieldPresence(home.bands) - midfieldPresence(away.bands))
  target += mentalityLean(home.mentality) - mentalityLean(away.mentality)
  target += styleLean(home, rh > ra) - styleLean(away, ra > rh)
  target += T.HOME_PRESSURE_LEAN
  if (homeGoals > awayGoals && home.mentality !== 'attack') target -= T.LEAD_SIT_DEEP
  if (awayGoals > homeGoals && away.mentality !== 'attack') target += T.LEAD_SIT_DEEP
  target += momentum
  return clamp(target, -100, 100)
}

/** The home side's share of chances at a pressure level: a logistic curve, even at nil. */
export function chanceShare(pressure: number): number {
  return 1 / (1 + Math.exp(-pressure / T.CHANCE_SHARE_SCALE))
}

function tempoOf(m: Mentality): number {
  return m === 'attack' ? T.MENTALITY_TEMPO : m === 'defend' ? -T.MENTALITY_TEMPO : 0
}

/** Chances per minute across both sides: the game opens up when one side is on top, and with attacking mentalities. */
export function chanceRate(pressure: number, home: Mentality = 'balanced', away: Mentality = 'balanced'): number {
  return T.CHANCE_BASE * (1 + (T.CHANCE_PRESSURE * Math.abs(pressure)) / 100) * (1 + tempoOf(home) + tempoOf(away))
}

/** A mentality moves weight between a side's attack and defence bands. */
function bandShift(m: Mentality): number {
  return m === 'attack' ? T.MENTALITY_BAND_SHIFT : m === 'defend' ? -T.MENTALITY_BAND_SHIFT : 0
}

/** Openness: our attack (forwards and a share of the midfield) against their defence (keeper, backs and a share of the midfield), against a 4-4-2 pairing; mentalities shift the bands. */
export function openness(us: XiBands, them: XiBands, usMentality: Mentality = 'balanced', themMentality: Mentality = 'balanced'): number {
  const attack = Math.max(0, (us.attack + T.MID_ATTACK_SHARE * us.midfield) * (1 + bandShift(usMentality)))
  // A band is a quality-weighted count; a side of nobodies still has a back line, so the ratio is floored.
  const defence = Math.max(T.BAND_FLOOR, (them.defence + T.MID_DEFENCE_SHARE * them.midfield) * (1 - bandShift(themMentality)))
  return attack / defence / T.OPENNESS_STANDARD
}

/**
 * How often we create and how good it is (DESIGN.md "Formations and tactics",
 * one rule per style): possession fewer but better, direct more with pace and
 * aerial players, counter on the break, pressing more; width against a narrow
 * back line; a five-man defence soaks.
 */
export function chanceProfile(us: SideView, them: SideView, underPressure: boolean): { frequency: number; quality: number } {
  const open = openness(us.bands, them.bands, us.mentality, them.mentality)
  let frequency = clamp(Math.sqrt(open), T.OPENNESS_MIN, T.OPENNESS_MAX)
  let quality = open
  const sc = T.STYLE_CHANCE
  switch (us.style) {
    case 'possession':
      frequency *= sc.possession.chance
      quality *= sc.possession.quality
      break
    case 'direct':
      frequency *= 1 + sc.direct.perTrait * (us.bands.pace + us.bands.aerial)
      quality *= sc.direct.quality
      break
    case 'counter':
      frequency *= underPressure ? sc.counter.onBreak : sc.counter.notOnBreak
      quality *= sc.counter.quality
      break
    case 'pressing':
      frequency *= sc.pressing.chance
      break
  }
  if (them.bands.defenceWidth < T.NARROW_DEFENCE_WIDTH && us.bands.width >= T.WIDE_ATTACK_WIDTH) frequency *= T.WIDTH_CHANCE
  if (them.bands.backLine >= T.OVERLOAD_BACK_LINE) frequency *= T.OVERLOAD_CHANCE
  return { frequency, quality }
}

/** The share of our minutes on the ball that become a chance, from the frequency. */
export function chanceGate(frequency: number): number {
  return clamp(frequency / T.OPENNESS_MAX, 0, 1)
}

/** What a chance converts at: the attacker against the keeper and the back line, and the chance's quality. */
export function goalChance(attackerEff: number, keeperEff: number, defenderEff: number, quality: number): number {
  const edge = (attackerEff - T.KEEPER_SHARE * keeperEff - T.DEFENCE_SHARE * defenderEff) / T.EDGE_SCALE + Math.log(Math.max(T.QUALITY_FLOOR, quality))
  return Math.min(T.GOAL_P_MAX, T.GOAL_BASE_P * Math.exp(T.GOAL_SENS * edge))
}

/** A side's expected goals read once before kick-off, before the calibration table corrects for the minutes. */
export function analyticGoals(home: SideView, away: SideView): { home: number; away: number; lean: number } {
  const lean = pressureLean(home, away, 0, 0, 0)
  const minutes = T.MATCH_MINUTES + (T.STOPPAGE_FIRST[0] + T.STOPPAGE_FIRST[1] + T.STOPPAGE_SECOND[0] + T.STOPPAGE_SECOND[1]) / 2
  const rate = chanceRate(lean, home.mentality, away.mentality) * minutes
  const share = chanceShare(lean)
  const side = (us: SideView, them: SideView, ourShare: number, underPressure: boolean): number => {
    const profile = chanceProfile(us, them, underPressure)
    const conv = goalChance(us.bands.attackerEff, them.bands.keeperEff, them.bands.defenderEff, profile.quality)
    return rate * ourShare * chanceGate(profile.frequency) * conv
  }
  return { home: side(home, away, share, lean < 0), away: side(away, home, 1 - share, lean > 0), lean }
}
