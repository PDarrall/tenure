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
import type { Rng } from '../rng.js'
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
  /** The club's tier, for the width of the day's draw; absent for a generated opponent. */
  tier?: number | null
  /** The performance level drawn for this match, as a rating delta the manager cannot see (DESIGN.md "Match": mismatch and upsets). */
  day?: number
  /** The keeper's form for the night, a rating delta on his effective rating alone. */
  keeperDay?: number
}

/** A ratio that saturates: 1 at parity, never past the cap, monotone between (DESIGN.md "Match": chance quality saturates). */
export function saturate(x: number, cap: number): number {
  return (cap * x) / (cap - 1 + x)
}

/** The keeper's rating for the night: his band plus the form drawn for him. */
export function keeperEffOf(v: SideView): number {
  return v.bands.keeperEff + (v.keeperDay ?? 0)
}

export interface DayDraw {
  day: number
  keeperDay: number
}

/**
 * The day a side has (DESIGN.md "Match": mismatch and upsets). A performance
 * level drawn per match, wider at lower tiers and in cups, so any side can
 * have a night; the keeper's form is drawn separately, because one
 * goalkeeper decides more upsets than any other cause. In a cup the weaker
 * side is lifted, which is what shortens the favourite's edge.
 */
export function drawDay(rng: Rng, us: SideView, them: SideView, cup: boolean): DayDraw {
  const tier = us.tier ?? 1
  const spread = (T.MISMATCH_DAY_SD_BASE + T.MISMATCH_DAY_SD_PER_TIER * (tier - 1)) * (cup ? T.MISMATCH_DAY_SD_CUP : 1)
  const behind = sideRating(them) - sideRating(us)
  const lift = cup && behind > 0 ? T.MISMATCH_CUP_UNDERDOG : 0
  return { day: rng.normal(lift, spread), keeperDay: rng.normal(0, T.MISMATCH_KEEPER_SD * (cup ? T.MISMATCH_DAY_SD_CUP : 1)) }
}

/** Both sides' days, drawn before either is applied so neither reads the other's. */
export function drawMatchDays(rng: Rng, home: SideView, away: SideView, cup: boolean): { home: DayDraw; away: DayDraw } {
  const h = drawDay(rng, home, away, cup)
  const a = drawDay(rng, away, home, cup)
  return { home: h, away: a }
}

export function formScore(form: readonly Result[]): number {
  if (form.length === 0) return 0
  let points = 0
  for (const r of form) points += r === 'W' ? 3 : r === 'D' ? 1 : 0
  return (points / (3 * form.length) - 0.5) * 2
}

/** The side's rating on the day: the XI, form, the manager's tactical ability and morale. */
export function sideRating(v: SideView): number {
  return v.strength + T.FORM_WEIGHT * formScore(v.form) + (T.ABILITY_WEIGHT * (v.tactical - T.SCALE_MIDPOINT)) / T.SCALE_MIDPOINT + (T.MORALE_WEIGHT * (v.morale - T.SCALE_MIDPOINT)) / T.SCALE_MIDPOINT + (v.day ?? 0)
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
export function pressureLean(home: SideView, away: SideView, homeGoals: number, awayGoals: number, momentum: number, neutral = false): number {
  const rh = sideRating(home)
  const ra = sideRating(away)
  let target = T.PRESSURE_PER_POINT * (rh - ra)
  target += T.PRESSURE_PER_MID * (midfieldPresence(home.bands) - midfieldPresence(away.bands))
  target += mentalityLean(home.mentality) - mentalityLean(away.mentality)
  target += styleLean(home, rh > ra) - styleLean(away, ra > rh)
  if (!neutral) target += T.HOME_PRESSURE_LEAN
  target -= leadEase(homeGoals - awayGoals, home.mentality)
  target += leadEase(awayGoals - homeGoals, away.mentality)
  target += momentum
  return clamp(target, -100, 100)
}

/** A leading side eases off: a step at one goal, further at two, further again at three (DESIGN.md "Match": mismatch and upsets). */
export function leadEase(lead: number, m: Mentality): number {
  if (lead <= 0 || m === 'attack') return 0
  if (lead === 1) return T.LEAD_SIT_DEEP
  if (lead === 2) return T.LEAD_SIT_DEEP_TWO
  return T.LEAD_SIT_DEEP_THREE + (lead - 3) * T.LEAD_SIT_DEEP_PER_GOAL
}

/** The home side's share of chances at a pressure level: even at nil, and never past the cap — the side under the cosh still gets out (DESIGN.md "Match": mismatch and upsets). */
export function chanceShare(pressure: number): number {
  return 0.5 + (T.MISMATCH_SHARE_MAX - 0.5) * Math.tanh(pressure / T.CHANCE_SHARE_SCALE)
}

function tempoOf(m: Mentality): number {
  return m === 'attack' ? T.MENTALITY_TEMPO : m === 'defend' ? -T.MENTALITY_TEMPO : 0
}

/** Chances per minute across both sides: the game opens up when one side is on top, with attacking mentalities, and when a side is committing to chase a deficit of `chase` goals. */
export function chanceRate(pressure: number, home: Mentality = 'balanced', away: Mentality = 'balanced', chase = 0): number {
  const commit = chase >= T.TRAIL_COMMIT_FROM ? T.TRAIL_COMMIT_RATE : 1
  return T.CHANCE_BASE * (1 + (T.CHANCE_PRESSURE * Math.abs(pressure)) / 100) * (1 + tempoOf(home) + tempoOf(away)) * commit
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
  // A much better side takes many more shots, but the marginal ones are poor: quality saturates (DESIGN.md "Match": mismatch and upsets).
  let quality = saturate(open, T.MISMATCH_QUALITY_CAP)
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
  const raw = (attackerEff - T.KEEPER_SHARE * keeperEff - T.DEFENCE_SHARE * defenderEff) / T.EDGE_SCALE
  // The rating edge saturates too, so a gap of eighty points is not eight times a gap of ten.
  const edge = T.MISMATCH_EDGE_MAX * Math.tanh(raw / T.MISMATCH_EDGE_MAX) + Math.log(Math.max(T.QUALITY_FLOOR, quality))
  return Math.min(T.GOAL_P_MAX, T.GOAL_BASE_P * Math.exp(T.GOAL_SENS * edge))
}

/** What the model makes of the pair at a given lean, before the governor: each side's expected goals over the match. */
export function rawGoalsAt(home: SideView, away: SideView, lean: number, chase = 0): { home: number; away: number } {
  const minutes = T.MATCH_MINUTES + (T.STOPPAGE_FIRST[0] + T.STOPPAGE_FIRST[1] + T.STOPPAGE_SECOND[0] + T.STOPPAGE_SECOND[1]) / 2
  const rate = chanceRate(lean, home.mentality, away.mentality, chase) * minutes
  const share = chanceShare(lean)
  const side = (us: SideView, them: SideView, ourShare: number, underPressure: boolean): number => {
    const profile = chanceProfile(us, them, underPressure)
    const conv = goalChance(us.bands.attackerEff, keeperEffOf(them), them.bands.defenderEff, profile.quality)
    return rate * ourShare * chanceGate(profile.frequency) * conv
  }
  return { home: side(home, away, share, lean < 0), away: side(away, home, 1 - share, lean > 0) }
}

/**
 * The governor (DESIGN.md "Match": mismatch and upsets). The gap between two
 * sides maps to expected goals through a saturating curve — about half a goal
 * at ten points, a goal and a half at thirty, two and a half at sixty and
 * nothing beyond three — so a better side wins more often, not by more. The
 * lean carries everything that makes one side better: strength, the midfield,
 * mentality, style, home advantage and the score. The model's own reading
 * gives the shape and the governor binds only where it would run away, so
 * ordinary football passes through untouched.
 */
export function governed(raw: { home: number; away: number }, lean: number): { home: number; away: number } {
  let total = raw.home + raw.away
  if (total > T.MISMATCH_TOTAL_SOFT) {
    const span = T.MISMATCH_TOTAL_MAX - T.MISMATCH_TOTAL_SOFT
    total = T.MISMATCH_TOTAL_SOFT + span * Math.tanh((total - T.MISMATCH_TOTAL_SOFT) / span)
  }
  const cap = T.MISMATCH_MAX_GOALS * Math.tanh(Math.abs(lean) / T.MISMATCH_GAP_SCALE)
  let diff = raw.home - raw.away
  if (Math.abs(diff) > cap) diff = diff < 0 ? -cap : cap
  return { home: Math.max(0, (total + diff) / 2), away: Math.max(0, (total - diff) / 2) }
}

/** A side's expected goals read once before kick-off, before the calibration table corrects for the minutes. */
export function analyticGoals(home: SideView, away: SideView, neutral = false): { home: number; away: number; lean: number } {
  const lean = pressureLean(home, away, 0, 0, 0, neutral)
  const g = governed(rawGoalsAt(home, away, lean), lean)
  return { home: g.home, away: g.away, lean }
}

/**
 * What the governor does to each side's conversion, read live, so a minute
 * played obeys the same curve as a match sampled from the table.
 */
export function mismatchScale(home: SideView, away: SideView, lean: number, chase = 0): { home: number; away: number } {
  const raw = rawGoalsAt(home, away, lean, chase)
  const g = governed(raw, lean)
  return { home: g.home / Math.max(1e-6, raw.home), away: g.away / Math.max(1e-6, raw.away) }
}
