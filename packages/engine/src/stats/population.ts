/**
 * Validation statistics over a population of AI careers (DESIGN.md
 * "Validation targets"). A career is tracked from a manager's first hire
 * after genesis to the end of their career.
 */
import { T } from '../tunables.js'
import { spellById } from '../lookup.js'
import type { Manager, ManagerId, Player, Spell, World } from '../types.js'
import { careerScore } from '../scoring/score.js'
import { averageRating } from '../match/aftermath.js'

export interface Band {
  target: number
  min: number
  max: number
}

export interface StatLine {
  key: string
  label: string
  value: number
  band: Band
  pass: boolean
  /** How the value is shown: a share, a count, or seasons. */
  format: 'share' | 'count' | 'seasons' | 'number'
}

export interface Histogram {
  label: string
  buckets: { label: string; count: number }[]
}

export interface PopulationStats {
  seed: number
  seasonsSimulated: number
  careersTracked: number
  careersEnded: number
  lines: StatLine[]
  histograms: Histogram[]
  extras: Record<string, number>
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))
  return sorted[index] as number
}

function spellSeasons(spell: Spell, now: number): number {
  return ((spell.endWeek ?? now) - spell.startWeek) / T.SEASON_WEEKS
}

/** The first non-genesis spell of a manager, if any. */
export function firstCareerSpell(world: World, manager: Manager): Spell | undefined {
  const id = manager.history.spellIds[0]
  if (id === undefined) return undefined
  const spell = spellById(world, id)
  return spell.startWeek > 0 ? spell : undefined
}

/** Managers with a tracked career, in order of first hire. */
export function trackedManagers(world: World): Manager[] {
  return world.managers
    .filter((m) => firstCareerSpell(world, m) !== undefined)
    .sort((a, b) => (firstCareerSpell(world, a) as Spell).startWeek - (firstCareerSpell(world, b) as Spell).startWeek || a.id - b.id)
}

function histogram(label: string, values: number[], edges: number[], unit: string): Histogram {
  const buckets = edges.map((edge, i) => {
    const next = edges[i + 1]
    const lo = edge
    const count = values.filter((v) => v >= lo && (next === undefined || v < next)).length
    return { label: next === undefined ? `${lo}+ ${unit}` : `${lo}–${next} ${unit}`, count }
  })
  return { label, buckets }
}

/**
 * Compute the stats for a set of tracked managers, using top-tier tenure
 * samples gathered during the run.
 */
export function populationStats(world: World, tracked: ManagerId[], longTenureSamples: number[]): PopulationStats {
  const now = world.week
  const managers = tracked.map((id) => world.managers[id - 1] as Manager)
  const ended = managers.filter((m) => m.status.kind === 'retired')
  const targets = T.VALIDATION_TARGETS

  const firstSpells = managers.map((m) => firstCareerSpell(world, m) as Spell)
  const firstSpellLengths = firstSpells.filter((s) => s.endWeek !== null).map((s) => spellSeasons(s, now))
  const insideSeason = firstSpells.filter((s) => s.endWeek !== null && s.endWeek - s.startWeek < T.SEASON_WEEKS).length

  // Career length is the calendar span from first hire to the end of the career.
  const careerSeasons = ended.map((m) => {
    const first = firstCareerSpell(world, m) as Spell
    const endWeek = m.status.kind === 'retired' ? m.status.week : now
    return (endWeek - first.startWeek) / T.SEASON_WEEKS
  })
  const employedSeasons = ended.map((m) => m.history.spellIds.reduce((sum, id) => sum + spellSeasons(spellById(world, id), now), 0))
  const careerClubs = ended.map((m) => m.history.spellIds.length)
  const neverSecond = ended.filter((m) => m.history.spellIds.length === 1).length
  const twentySeasons = careerSeasons.filter((s) => s >= T.LONG_CAREER_SEASONS).length
  const thousandGames = ended.filter((m) => m.history.games >= T.LONG_CAREER_GAMES).length

  const sackings = world.log.filter((e) => e.type === 'manager.sacked')
  const unjust = sackings.filter((e) => e.payload['deserved'] === false).length
  const meanLongTenures = longTenureSamples.length ? longTenureSamples.reduce((a, b) => a + b, 0) / longTenureSamples.length : 0

  const line = (key: keyof typeof targets, label: string, value: number, format: StatLine['format']): StatLine => {
    const band = targets[key]
    return { key, label, value, band, pass: value >= band.min && value <= band.max, format }
  }

  // Players and tactics (DESIGN.md v0.5): ratings, the structural fairness of formations and styles, the makers.
  const ratingAverages: number[] = []
  for (const p of world.players) {
    if (!p) continue
    for (const rec of [...p.history, p.season]) {
      const a = averageRating(rec)
      if (a !== null && rec.rated >= 10) ratingAverages.push(a)
    }
  }
  const ratingMean = ratingAverages.length ? ratingAverages.reduce((a, b) => a + b, 0) / ratingAverages.length : 0
  const ratingSpread = ratingAverages.length ? Math.sqrt(ratingAverages.reduce((a, b) => a + (b - ratingMean) ** 2, 0) / ratingAverages.length) : 0
  const ppg = (key: 'homeFormation' | 'awayFormation' | 'homeStyle' | 'awayStyle', pointsFor: (e: { payload: Record<string, unknown> }, home: boolean) => number) => {
    const totals = new Map<string, { points: number; games: number }>()
    for (const e of world.log) {
      if (e.type !== 'match.played' || e.payload['competition'] !== 'league') continue
      for (const home of [true, false]) {
        const k = String(e.payload[home ? key.replace('away', 'home') as typeof key : key.replace('home', 'away') as typeof key] ?? '')
        if (!k) continue
        const t = totals.get(k) ?? { points: 0, games: 0 }
        t.points += pointsFor(e, home)
        t.games++
        totals.set(k, t)
      }
    }
    const rates = [...totals.values()].filter((t) => t.games >= T.EDGE_MIN_GAMES).map((t) => t.points / t.games)
    if (rates.length === 0) return 0
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length
    return mean > 0 ? Math.max(...rates) / mean - 1 : 0
  }
  const pointsOf = (e: { payload: Record<string, unknown> }, home: boolean) => {
    const hg = e.payload['homeGoals'] as number
    const ag = e.payload['awayGoals'] as number
    const mine = home ? hg : ag
    const theirs = home ? ag : hg
    return mine > theirs ? T.POINTS_WIN : mine === theirs ? T.POINTS_DRAW : 0
  }
  const formationEdge = ppg('homeFormation', pointsOf)
  const styleEdge = ppg('homeStyle', pointsOf)
  // The climber and the maker: the best career among the ten biggest trophy-winners against the best among the ten biggest makers.
  const scored = managers.map((m) => ({ m, score: careerScore(m) }))
  const topN = T.MAKER_WINNER_TOP_N
  const winners = scored.filter((s) => s.score.trophyPoints > 0).sort((a, b) => b.score.trophyPoints - a.score.trophyPoints).slice(0, topN)
  const makers = scored.filter((s) => s.score.playersMade > 0).sort((a, b) => b.score.playersMade - a.score.playersMade).slice(0, topN)
  const bestWinner = [...winners].sort((a, b) => b.score.legacy - a.score.legacy)[0]
  const bestMaker = [...makers].sort((a, b) => b.score.legacy - a.score.legacy)[0]
  const makerLegacyRatio = bestWinner && bestMaker && bestWinner.score.legacy > 0 ? bestMaker.score.legacy / bestWinner.score.legacy : 0
  let madePoints = 0
  let boughtFinished = 0
  for (const e of world.log) {
    if (e.type !== 'players.made') continue
    const pts = e.payload['points'] as number
    madePoints += pts
    const player = world.players[(e.payload['playerId'] as number) - 1] as Player | null
    const tag = player ? player.madeBy.find((t) => t.managerId === e.payload['managerId']) : undefined
    if (tag && tag.circumstance === 'signed' && tag.rating >= T.BOUGHT_FINISHED_RATING) boughtFinished += pts
  }
  const boughtFinishedShare = madePoints > 0 ? boughtFinished / madePoints : 0
  const match = matchAverages(world)
  const europe = europeanTitles(world)
  const calendar = calendarStats(world)
  const margins = marginStats(world)
  const decisions = decisionFairness(world)
  const follow = followStats(world)
  const signings = signingStats(world)
  const lines: StatLine[] = [
    line('firstSpellMedianSeasons', 'Median first-spell length (seasons)', median(firstSpellLengths), 'seasons'),
    line('firstSpellInsideSeasonShare', 'First spells ending inside a season', firstSpells.length ? insideSeason / firstSpells.length : 0, 'share'),
    line('neverSecondJobShare', 'First-time managers who never get a second job', ended.length ? neverSecond / ended.length : 0, 'share'),
    line('careerMedianSeasons', 'Median career length (seasons, first job to the end)', median(careerSeasons), 'seasons'),
    line('careerMedianClubs', 'Median clubs per career', median(careerClubs), 'number'),
    line('twentySeasonShare', 'Careers reaching 20 seasons', ended.length ? twentySeasons / ended.length : 0, 'share'),
    line('thousandGameCount', 'Careers past 1,000 games', thousandGames, 'count'),
    line('topTierLongTenures', 'Top-tier managers with tenure over five years (mean per season)', meanLongTenures, 'number'),
    line('unjustSackingShare', 'Unjust sackings as a share of all sackings', sackings.length ? unjust / sackings.length : 0, 'share'),
    line('ratingMean', 'Match rating average (season averages)', ratingMean, 'number'),
    line('ratingSpread', 'Match rating spread (sd of season averages)', ratingSpread, 'number'),
    line('formationEdge', 'Best formation over the mean points per game', formationEdge, 'share'),
    line('styleEdge', 'Best style over the mean points per game', styleEdge, 'share'),
    line('makerLegacyRatio', "Best maker's Legacy over the best trophy-winner's", makerLegacyRatio, 'number'),
    line('boughtFinishedShare', 'Players-made points from players bought finished', boughtFinishedShare, 'share'),
    line('goalsPerGame', 'Goals per league game', match.goals, 'number'),
    line('homeWinShare', 'Home wins (league)', match.home, 'share'),
    line('drawShare', 'Draws (league)', match.draw, 'share'),
    line('awayWinShare', 'Away wins (league)', match.away, 'share'),
    line('yellowsPerGame', 'Yellow cards per match', match.yellows, 'number'),
    line('redsPerGame', 'Red cards per match', match.reds, 'number'),
    line('championsCupHomeShare', 'Seasons the Champions Cup came home', europe.homeShare, 'share'),
    line('championsCupOutsideTopThree', 'Champions Cups won from outside the top three of tier 1', europe.outsideTopThree, 'share'),
    line('unscheduledFixtures', 'Matches played outside the season weeks', calendar.unscheduled, 'count'),
    line('clubWeekMaxFixtures', 'Most matches by one club in one week', calendar.maxPerWeek, 'count'),
    line('tier5CupThirdRound', "A tier-5 club's chance of reaching the Cup's third round in a season", calendar.tier5ThirdRound, 'share'),
    line('worstLeagueMargin', 'Worst league margin', margins.worstLeague, 'count'),
    line('bigMarginShare', 'League matches won by five or more', margins.bigShare, 'share'),
    line('cupOneTierUpset', 'Cup ties won by a side one tier below', margins.upsets[1] ?? 0, 'share'),
    line('cupTwoTierUpset', 'Cup ties won by a side two tiers below', margins.upsets[2] ?? 0, 'share'),
    line('cupFourTierUpset', 'Cup ties won by a side four tiers below', margins.upsets[4] ?? 0, 'share'),
    line('decisionFairnessGap', `Decisions: worst gap between bold and cautious means net of sampling noise, in bold spreads (${decisions.worstGapKind})`, decisions.worstGap, 'number'),
    line('decisionVarianceRatio', `Decisions: lowest bold-to-cautious variance ratio (${decisions.worstRatioKind})`, decisions.worstRatio, 'number'),
    line('signingsBeatShare', "Signings that beat the director's estimate", signings.beat, 'share'),
    line('signingsShortShare', "Signings that fell short of the director's estimate", signings.short, 'share'),
    line('followMovesPerJobChange', 'Follow-you moves per job change', follow.perHire, 'number'),
    line('followMaxPerMove', 'Most follow-you moves in one job change', follow.maxPerMove, 'count'),
  ]

  const endReasons: Record<string, number> = {}
  for (const m of ended) if (m.status.kind === 'retired') endReasons[m.status.reason] = (endReasons[m.status.reason] ?? 0) + 1
  const endReasonHist: Histogram = { label: 'Career end reasons', buckets: Object.entries(endReasons).map(([label, count]) => ({ label, count })) }
  const exitReasons: Record<string, number> = {}
  for (const m of managers) for (const id of m.history.spellIds) {
    const s = spellById(world, id)
    if (s.endReason) exitReasons[s.endReason] = (exitReasons[s.endReason] ?? 0) + 1
  }
  const exitHist: Histogram = { label: 'Spell end reasons (tracked careers)', buckets: Object.entries(exitReasons).map(([label, count]) => ({ label, count })) }

  const histograms: Histogram[] = [
    histogram('First-spell length', firstSpellLengths, [0, 0.5, 1, 1.5, 2, 3, 5, 8], 'seasons'),
    histogram('Career length', careerSeasons, [0, 2, 4, 6, 8, 12, 16, 20, 30], 'seasons'),
    histogram('Clubs per career', careerClubs, [1, 2, 3, 4, 5, 7, 10], 'clubs'),
    histogram('Games per career', ended.map((m) => m.history.games), [0, 100, 250, 500, 750, 1000, 1500], 'games'),
    histogram('Top-tier long tenures per sampled season', longTenureSamples, [0, 1, 2, 3, 4, 5, 7, 10], 'managers'),
    endReasonHist,
    exitHist,
  ]

  const sackedTakeover = sackings.filter((e) => e.payload['cause'] === 'takeover').length
  const extras: Record<string, number> = {
    'sackings (all managers)': sackings.length,
    'sackings by takeover': sackedTakeover,
    'sackings per season': sackings.length / Math.max(1, world.season - 1),
    'poaches': world.log.filter((e) => e.type === 'manager.poached').length,
    'walkouts': world.log.filter((e) => e.type === 'manager.walkedOut').length,
    'mutual consents': world.log.filter((e) => e.type === 'manager.mutual').length,
    'resignations': world.log.filter((e) => e.type === 'manager.resigned').length,
    'expiries (released)': world.log.filter((e) => e.type === 'contract.expired').length,
    'first-spell p25 (seasons)': quantile(firstSpellLengths, 0.25),
    'first-spell p75 (seasons)': quantile(firstSpellLengths, 0.75),
    'career p25 (seasons)': quantile(careerSeasons, 0.25),
    'career p75 (seasons)': quantile(careerSeasons, 0.75),
    'career p90 (seasons)': quantile(careerSeasons, 0.9),
    'median seasons employed': median(employedSeasons),
    'p90 seasons employed': quantile(employedSeasons, 0.9),
    'max games (tracked)': ended.length ? Math.max(...ended.map((m) => m.history.games)) : 0,
    'median earnings £m (ended)': median(ended.map((m) => Math.round(m.history.earnings * 10) / 10)),
    'median trophy points (ended)': median(ended.map((m) => m.history.trophyPoints)),
    'median players made (ended)': median(ended.map((m) => m.history.playersMade)),
    'best players made': bestMaker ? bestMaker.score.playersMade : 0,
    'best maker legacy': bestMaker ? bestMaker.score.legacy : 0,
    'best trophy winner legacy': bestWinner ? bestWinner.score.legacy : 0,
    'best trophy points': bestWinner ? bestWinner.score.trophyPoints : 0,
    'goals per league game': match.goals,
    'home win share': match.home,
    'draw share': match.draw,
    'away win share': match.away,
    'yellows per game': match.yellows,
    'reds per game': match.reds,
    'league matches': match.leagueMatches,
    'champions cups (home clubs)': europe.homeTitles,
    'champions cup finals played': europe.seasons,
    'mean age at career end': ended.length ? ended.reduce((s, m) => s + m.age, 0) / ended.length : 0,
    'events logged': world.log.length,
  }
  extras['signings revealed'] = signings.revealed
  extras['signings (transfers completed)'] = signings.transfers
  extras['signings abroad'] = signings.abroad
  extras['signings from the pool'] = signings.free
  extras['bids failed'] = signings.failed
  extras['mean strength tier 1'] = signings.tierStrength[0] ?? 0
  extras['mean strength tier 3'] = signings.tierStrength[2] ?? 0
  extras['mean strength tier 5'] = signings.tierStrength[4] ?? 0
  extras['strength sd within tier 1'] = signings.tierSpread[0] ?? 0
  extras['strength sd within tier 3'] = signings.tierSpread[2] ?? 0
  extras['follow moves'] = follow.moves
  extras['follow asks'] = follow.asks
  extras['hires'] = follow.hires
  for (const k of decisions.kinds) {
    extras[`decision ${k.kind}: bold rolls`] = k.boldN
    extras[`decision ${k.kind}: cautious rolls`] = k.cautiousN
    extras[`decision ${k.kind}: bold mean`] = k.boldMean
    extras[`decision ${k.kind}: cautious mean`] = k.cautiousMean
    extras[`decision ${k.kind}: gap observed`] = k.gapObserved
    extras[`decision ${k.kind}: gap net of noise`] = k.gap
    extras[`decision ${k.kind}: variance ratio`] = k.ratio
  }

  return {
    seed: world.seed,
    seasonsSimulated: world.season - 1,
    careersTracked: managers.length,
    careersEnded: ended.length,
    lines,
    histograms,
    extras,
  }
}

/** Count of tier-1 managers whose spell is older than the long-tenure bar, right now. */
export function countLongTopTierTenures(world: World): number {
  let count = 0
  for (const club of world.clubs) {
    if (club.tier !== 1 || club.managerId === null) continue
    const manager = world.managers[club.managerId - 1] as Manager
    if (manager.status.kind !== 'employed') continue
    const spell = spellById(world, manager.status.spellId)
    if (world.week - spell.startWeek >= T.LONG_TENURE_SEASONS * T.SEASON_WEEKS) count++
  }
  return count
}

/** The match layer's averages from the log (DESIGN.md "Validation targets", Match). */
export function matchAverages(world: World): { goals: number; home: number; draw: number; away: number; yellows: number; reds: number; leagueMatches: number } {
  let league = 0
  let goals = 0
  let home = 0
  let draw = 0
  let all = 0
  let yellows = 0
  let reds = 0
  for (const e of world.log) {
    if (e.type !== 'match.played') continue
    all++
    yellows += (e.payload['cards'] as number) ?? 0
    reds += (e.payload['reds'] as number) ?? 0
    if (e.payload['competition'] !== 'league') continue
    league++
    const hg = e.payload['homeGoals'] as number
    const ag = e.payload['awayGoals'] as number
    goals += hg + ag
    if (hg > ag) home++
    else if (hg === ag) draw++
  }
  return {
    goals: league ? goals / league : 0,
    home: league ? home / league : 0,
    draw: league ? draw / league : 0,
    away: league ? (league - home - draw) / league : 0,
    yellows: all ? yellows / all : 0,
    reds: all ? reds / all : 0,
    leagueMatches: league,
  }
}

/** The European trophy (DESIGN.md "World"): how often a home club lifts it, and from where in the table. */
/** Calendar and cups (DESIGN.md "Validation targets"): matches outside the season weeks, the most by one club in a week, tier-5 clubs in the Cup's third round per season. */
/**
 * Mismatch (DESIGN.md "Validation targets"): the worst league margin, how
 * often a league match is won by five or more, and how often a cup tie goes
 * to the side from a lower tier — read by the size of the gap, from the draw
 * that named the two tiers.
 */
export function marginStats(world: World): { worstLeague: number; bigShare: number; upsets: Record<number, number> } {
  const tiers = new Map<string, { h: number; a: number }>()
  let league = 0
  let big = 0
  let worstLeague = 0
  const played: Record<number, number> = {}
  const won: Record<number, number> = {}
  for (const e of world.log) {
    if (e.type === 'cup.tie') {
      const c = String(e.payload['competition'])
      tiers.set(`${c}:${String(e.payload['homeId'])}:${String(e.payload['awayId'])}`, { h: e.payload['homeTier'] as number, a: e.payload['awayTier'] as number })
      tiers.set(`${c}:${String(e.payload['awayId'])}:${String(e.payload['homeId'])}`, { h: e.payload['awayTier'] as number, a: e.payload['homeTier'] as number })
      continue
    }
    if (e.type !== 'match.played') continue
    const hg = e.payload['homeGoals'] as number
    const ag = e.payload['awayGoals'] as number
    const margin = Math.abs(hg - ag)
    if (e.payload['competition'] === 'league') {
      league++
      if (margin >= T.BIG_MARGIN) big++
      if (margin > worstLeague) worstLeague = margin
      continue
    }
    const t = tiers.get(`${String(e.payload['competition'])}:${String(e.payload['homeId'])}:${String(e.payload['awayId'])}`)
    if (!t) continue
    const gap = Math.abs(t.h - t.a)
    if (gap === 0) continue
    played[gap] = (played[gap] ?? 0) + 1
    const lowerIsHome = t.h > t.a
    if ((lowerIsHome ? hg : ag) > (lowerIsHome ? ag : hg)) won[gap] = (won[gap] ?? 0) + 1
  }
  const upsets: Record<number, number> = {}
  for (const key of Object.keys(played)) {
    const g = Number(key)
    upsets[g] = (won[g] ?? 0) / (played[g] as number)
  }
  return { worstLeague, bigShare: league ? big / league : 0, upsets }
}

export function calendarStats(world: World): { unscheduled: number; maxPerWeek: number; tier5ThirdRound: number } {
  let unscheduled = 0
  const perClubWeek = new Map<string, number>()
  let tier5 = 0
  let seasons = 0
  for (const e of world.log) {
    if (e.type === 'season.end') seasons++
    if (e.type === 'cup.tie' && e.payload['competition'] === 'nationalCup' && e.payload['round'] === 3) {
      if (e.payload['homeTier'] === 5) tier5++
      if (e.payload['awayTier'] === 5) tier5++
      continue
    }
    if (e.type !== 'match.played') continue
    if (e.week % T.SEASON_WEEKS >= T.MATCH_WEEKS) unscheduled++
    for (const key of ['homeId', 'awayId'] as const) {
      const k = `${e.week}:${String(e.payload[key])}`
      perClubWeek.set(k, (perClubWeek.get(k) ?? 0) + 1)
    }
  }
  let maxPerWeek = 0
  for (const n of perClubWeek.values()) if (n > maxPerWeek) maxPerWeek = n
  // Read per club: how often a given tier-5 club gets there in a season.
  const tier5Clubs = T.TIER_SIZES[T.TIER_SIZES.length - 1] as number
  return { unscheduled, maxPerWeek, tier5ThirdRound: seasons ? tier5 / seasons / tier5Clubs : 0 }
}

export function europeanTitles(world: World): { seasons: number; homeTitles: number; homeShare: number; outsideTopThree: number } {
  let seasons = 0
  let homeTitles = 0
  let outside = 0
  for (const e of world.log) {
    if (e.type !== 'trophy' || e.payload['competition'] !== 'championsCup') continue
    seasons++
    const clubId = e.payload['clubId'] as number
    if (clubId >= T.EUROPEAN_OPPONENT_ID_BASE) continue
    homeTitles++
    const position = e.payload['position']
    if (typeof position === 'number' && position > 3) outside++
  }
  return { seasons, homeTitles, homeShare: seasons ? homeTitles / seasons : 0, outsideTopThree: homeTitles ? outside / homeTitles : 0 }
}

export interface DecisionKindFairness {
  kind: string
  boldN: number
  cautiousN: number
  boldMean: number
  cautiousMean: number
  boldSd: number
  cautiousSd: number
  /** |bold mean − cautious mean| in units of the bold spread, as observed. */
  gapObserved: number
  /** The same gap net of sampling noise (BET_GAP_SE_ALLOWANCE standard errors): what the line tests. */
  gap: number
  /** Bold variance over cautious variance. */
  ratio: number
}

function meanSd(values: number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
  return { mean, sd }
}

/**
 * DESIGN.md "Decisions are bets": per decision kind, across the AI
 * population, the bold options' mean effect against the cautious options',
 * and the variance ratio. Only AI rolls count; a kind needs BET_MIN_ROLLS on
 * each side to be measured. The worst kind sets each line.
 */
export function decisionFairness(world: World): { kinds: DecisionKindFairness[]; worstGap: number; worstGapKind: string; worstRatio: number; worstRatioKind: string } {
  const byKind = new Map<string, { bold: number[]; cautious: number[] }>()
  for (const e of world.log) {
    if (e.type !== 'decision.rolled' || e.payload['human'] === true) continue
    const kind = String(e.payload['kind'])
    const bucket = byKind.get(kind) ?? { bold: [], cautious: [] }
    ;(e.payload['bold'] === true ? bucket.bold : bucket.cautious).push(e.payload['effect'] as number)
    byKind.set(kind, bucket)
  }
  const kinds: DecisionKindFairness[] = []
  for (const [kind, { bold, cautious }] of [...byKind.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const b = meanSd(bold)
    const c = meanSd(cautious)
    const diff = Math.abs(b.mean - c.mean)
    const se = Math.sqrt((bold.length ? (b.sd * b.sd) / bold.length : 0) + (cautious.length ? (c.sd * c.sd) / cautious.length : 0))
    kinds.push({
      kind,
      boldN: bold.length,
      cautiousN: cautious.length,
      boldMean: Math.round(b.mean * 1000) / 1000,
      cautiousMean: Math.round(c.mean * 1000) / 1000,
      boldSd: Math.round(b.sd * 1000) / 1000,
      cautiousSd: Math.round(c.sd * 1000) / 1000,
      gapObserved: b.sd > 0 ? Math.round((diff / b.sd) * 1000) / 1000 : 0,
      gap: b.sd > 0 ? Math.round((Math.max(0, diff - T.BET_GAP_SE_ALLOWANCE * se) / b.sd) * 1000) / 1000 : 0,
      ratio: c.sd > 0 ? Math.round(((b.sd * b.sd) / (c.sd * c.sd)) * 100) / 100 : bold.length > 0 ? 1000 : 0,
    })
  }
  const measured = kinds.filter((k) => k.boldN >= T.BET_MIN_ROLLS && k.cautiousN >= T.BET_MIN_ROLLS)
  let worstGap = 0
  let worstGapKind = 'none'
  let worstRatio = measured.length ? Infinity : 0
  let worstRatioKind = 'none'
  for (const k of measured) {
    if (k.gap > worstGap) {
      worstGap = k.gap
      worstGapKind = k.kind
    }
    if (k.ratio < worstRatio) {
      worstRatio = k.ratio
      worstRatioKind = k.kind
    }
  }
  if (worstRatio === Infinity) worstRatio = 0
  return { kinds, worstGap, worstGapKind, worstRatio, worstRatioKind }
}

/** Following you (DESIGN.md "Your players"): moves per job change and the most in one move, from the log. */
export function followStats(world: World): { moves: number; asks: number; hires: number; perHire: number; maxPerMove: number } {
  let moves = 0
  let asks = 0
  let hires = 0
  const perManagerHire = new Map<string, number>()
  for (const e of world.log) {
    if (e.type === 'vacancy.filled') hires++
    else if (e.type === 'follow.asked') asks++
    else if (e.type === 'follow.moved') {
      moves++
      const key = `${e.payload['managerId']}:${e.payload['clubId']}:${e.payload['season']}`
      perManagerHire.set(key, (perManagerHire.get(key) ?? 0) + 1)
    }
  }
  let maxPerMove = 0
  for (const n of perManagerHire.values()) if (n > maxPerMove) maxPerMove = n
  return { moves, asks, hires, perHire: hires ? Math.round((moves / hires) * 1000) / 1000 : 0, maxPerMove }
}

/** Signings (DESIGN.md "Transfers"): hits and flops among the AI's revealed signings, and where the squads sit. */
export function signingStats(world: World): { revealed: number; beat: number; short: number; transfers: number; abroad: number; free: number; failed: number; tierStrength: number[]; tierSpread: number[] } {
  let revealed = 0
  let hits = 0
  let flops = 0
  let transfers = 0
  let abroad = 0
  let free = 0
  let failed = 0
  for (const e of world.log) {
    if (e.type === 'signing.revealed' && e.payload['human'] !== true) {
      revealed++
      if (e.payload['verdict'] === 'hit') hits++
      else if (e.payload['verdict'] === 'flop') flops++
    } else if (e.type === 'transfer.completed') {
      transfers++
      if (e.payload['abroad'] === true) abroad++
      if (e.payload['free'] === true) free++
    } else if (e.type === 'bid.failed') failed++
  }
  const tierStrength: number[] = []
  const tierSpread: number[] = []
  for (let tier = 1; tier <= T.TIER_SIZES.length; tier++) {
    const values = world.clubs.filter((c) => c.tier === tier).map((c) => c.squad.strength)
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    tierStrength.push(Math.round(mean * 10) / 10)
    tierSpread.push(values.length ? Math.round(Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) * 10) / 10 : 0)
  }
  return { revealed, beat: revealed ? hits / revealed : 0, short: revealed ? flops / revealed : 0, transfers, abroad, free, failed, tierStrength, tierSpread }
}
