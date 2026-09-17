/**
 * The fast path (DESIGN.md "Match"): every match nobody is watching, and the
 * whole population sim, samples a scoreline from a table calibrated from
 * the minute engine. Both paths read the same pre-match model
 * (match/model.ts); the table maps the model's expected goals for each side
 * to what the minutes actually produce (score-state, momentum, tiredness,
 * substitutions), and a low-score correlation term sets the draw share.
 * scripts/calibrate-fast-path regenerates fastpath.json whenever match
 * tunables change; a test asserts the two paths agree.
 */
import { T } from '../tunables.js'
import { analyticGoals, type SideView } from './model.js'
import table from './fastpath.json'

export interface FastPathTable {
  version: number
  /** Bin edges in ln(expected goals) for both axes; K + 1 edges for K bins. Empty means identity. */
  edges: number[]
  /** Mean goals the minute engine produced for the home side in cell [homeBin][awayBin], and for the away side. */
  home: number[][]
  away: number[][]
  /** Matches behind each cell (a sparse cell carries the fitted value instead). */
  counts: number[][]
  /** Low-score correlation (Dixon–Coles ρ); negative lifts 0-0 and 1-1. */
  rho: number
  /** What the calibration saw, for the record. */
  meta: Record<string, number>
}

export const FAST_PATH_TABLE: FastPathTable = table as FastPathTable

function centres(edges: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < edges.length; i++) out.push(((edges[i] as number) + (edges[i + 1] as number)) / 2)
  return out
}

/** Interpolate ln(value) bilinearly over the grid of cell centres. */
function lookup(grid: number[][], edges: number[], x: number, y: number): number {
  const c = centres(edges)
  const k = c.length
  if (k === 0) return NaN
  const place = (v: number): [number, number] => {
    const lo = c[0] as number
    const hi = c[k - 1] as number
    const t = Math.min(hi, Math.max(lo, v))
    let i = 0
    while (i + 1 < k - 1 && t > (c[i + 1] as number)) i++
    const span = (c[i + 1] as number) - (c[i] as number)
    return [i, k === 1 ? 0 : (t - (c[i] as number)) / span]
  }
  const [i, tx] = place(x)
  const [j, ty] = place(y)
  const at = (a: number, b: number): number => Math.log(Math.max(0.01, (grid[Math.min(a, k - 1)] as number[])[Math.min(b, k - 1)] as number))
  const top = at(i, j) * (1 - ty) + at(i, j + 1) * ty
  const bottom = at(i + 1, j) * (1 - ty) + at(i + 1, j + 1) * ty
  return Math.exp(top * (1 - tx) + bottom * tx)
}

/** Expected goals for each side after calibration: the model's reading corrected by the table. */
export function calibratedGoals(home: SideView, away: SideView, t: FastPathTable = FAST_PATH_TABLE): { home: number; away: number; lean: number } {
  const a = analyticGoals(home, away)
  if (t.edges.length < 2) return { home: bound(a.home), away: bound(a.away), lean: a.lean }
  const x = Math.log(Math.max(0.01, a.home))
  const y = Math.log(Math.max(0.01, a.away))
  return { home: bound(lookup(t.home, t.edges, x, y)), away: bound(lookup(t.away, t.edges, x, y)), lean: a.lean }
}

function bound(lambda: number): number {
  if (!Number.isFinite(lambda)) return T.LAMBDA_MIN
  return Math.min(T.LAMBDA_MAX, Math.max(T.LAMBDA_MIN, lambda))
}

export function poissonPmf(lambda: number, max: number): number[] {
  const pmf: number[] = []
  let p = Math.exp(-lambda)
  let total = 0
  for (let k = 0; k <= max; k++) {
    if (k > 0) p = (p * lambda) / k
    pmf.push(p)
    total += p
  }
  return pmf.map((x) => x / total)
}

/** The scoreline distribution: independent Poissons with the low-score correlation applied and renormalised. */
export function jointPmf(lambdaHome: number, lambdaAway: number, rho: number): number[][] {
  const ph = poissonPmf(lambdaHome, T.MAX_GOALS)
  const pa = poissonPmf(lambdaAway, T.MAX_GOALS)
  // Keep every adjusted cell positive whatever the lambdas.
  const r = Math.max(rho, -0.95 / Math.max(1e-6, lambdaHome * lambdaAway), -0.95)
  const tau = (h: number, a: number): number => {
    if (h === 0 && a === 0) return 1 - lambdaHome * lambdaAway * r
    if (h === 1 && a === 0) return 1 + lambdaAway * r
    if (h === 0 && a === 1) return 1 + lambdaHome * r
    if (h === 1 && a === 1) return 1 - r
    return 1
  }
  const grid: number[][] = []
  let total = 0
  for (let h = 0; h <= T.MAX_GOALS; h++) {
    const row: number[] = []
    for (let a = 0; a <= T.MAX_GOALS; a++) {
      const p = Math.max(0, (ph[h] as number) * (pa[a] as number) * tau(h, a))
      row.push(p)
      total += p
    }
    grid.push(row)
  }
  return grid.map((row) => row.map((p) => p / total))
}

export interface FastOdds {
  lambdaHome: number
  lambdaAway: number
  lean: number
  pmf: number[][]
  pHome: number
  pDraw: number
  pAway: number
}

/** Pre-match odds from the fast path: the calibrated lambdas and the scoreline distribution. */
export function fastOdds(home: SideView, away: SideView, t: FastPathTable = FAST_PATH_TABLE): FastOdds {
  const g = calibratedGoals(home, away, t)
  const pmf = jointPmf(g.home, g.away, t.rho)
  let pHome = 0
  let pDraw = 0
  let pAway = 0
  for (let h = 0; h <= T.MAX_GOALS; h++) {
    for (let a = 0; a <= T.MAX_GOALS; a++) {
      const p = (pmf[h] as number[])[a] as number
      if (h > a) pHome += p
      else if (h === a) pDraw += p
      else pAway += p
    }
  }
  return { lambdaHome: g.home, lambdaAway: g.away, lean: g.lean, pmf, pHome, pDraw, pAway }
}

/** One scoreline from the distribution, with a single draw. */
export function sampleScoreline(u: number, pmf: number[][]): { homeGoals: number; awayGoals: number } {
  let r = u
  for (let h = 0; h <= T.MAX_GOALS; h++) {
    const row = pmf[h] as number[]
    for (let a = 0; a <= T.MAX_GOALS; a++) {
      r -= row[a] as number
      if (r < 0) return { homeGoals: h, awayGoals: a }
    }
  }
  return { homeGoals: T.MAX_GOALS, awayGoals: T.MAX_GOALS }
}
