/**
 * Calibrate the fast path from the minute engine (DESIGN.md "Match").
 *
 * Plays every league pairing of several worlds at several ages, plus
 * cross-tier cup-style pairings, through the minute engine; records the
 * pre-match model's expected goals for each side against what the minutes
 * produced; fits a table over (ln expected home, ln expected away) of mean
 * goals per cell, a smooth fit for sparse cells, and the low-score
 * correlation that reproduces the draw share. Writes
 * packages/engine/src/match/fastpath.json and a results table beside it.
 *
 *   pnpm calibrate:fast-path            # full run
 *   pnpm calibrate:fast-path -- --quick # fewer worlds, for a smoke
 */
import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createWorld } from '../packages/engine/src/world/gen.js'
import { createRng, type Rng } from '../packages/engine/src/rng.js'
import { runSeasons, runWeeks } from '../packages/engine/src/sim/advance.js'
import { aiMentality, lineupFor } from '../packages/engine/src/season/season.js'
import { analyticGoals } from '../packages/engine/src/match/model.js'
import { createMatch, runToEnd, type SideSetup } from '../packages/engine/src/match/minute.js'
import { fastOdds, jointPmf, type FastPathTable } from '../packages/engine/src/match/fastpath.js'
import { T } from '../packages/engine/src/tunables.js'
import type { Club, World } from '../packages/engine/src/types.js'

const quick = process.argv.includes('--quick')
const SEEDS = quick ? [101, 102] : [101, 102, 103, 104, 105, 106]
const AGES = quick ? [0, 2] : [0, 1, 2, 4]
const CUP_PAIRS = quick ? 150 : 400
const K = 16
const LN_MIN = Math.log(0.12)
const LN_MAX = Math.log(7)
const MIN_CELL = 150

interface Sample {
  lnH: number
  lnA: number
  hg: number
  ag: number
  cup: boolean
}

function setupFor(world: World, rng: Rng, club: Club, bigGame: boolean): SideSetup {
  const s = lineupFor(world, rng, club.id, { bigGame })
  return { clubId: club.id, name: club.name, isHuman: false, managerId: null, participant: s.participant, xi: s.lineup.xi, bench: s.lineup.bench, formation: club.formation }
}

function play(world: World, rng: Rng, home: Club, away: Club, cup: boolean): Sample {
  aiMentality(world, home.id, away.squad.strength)
  aiMentality(world, away.id, home.squad.strength)
  const h = setupFor(world, rng, home, cup)
  const a = setupFor(world, rng, away, cup)
  const an = analyticGoals(h.participant, a.participant)
  const state = createMatch(world, rng, h, a, cup, cup)
  runToEnd(state)
  return { lnH: Math.log(Math.max(0.01, an.home)), lnA: Math.log(Math.max(0.01, an.away)), hg: state.home.goals, ag: state.away.goals, cup }
}

const samples: Sample[] = []
const t0 = performance.now()
for (const seed of SEEDS) {
  const world = createWorld(seed)
  let age = 0
  for (const target of AGES) {
    if (target > age) {
      runSeasons(world, target - age)
      age = target
    }
    runWeeks(world, 1)
    const rng = createRng(seed * 1000 + target)
    const byTier = new Map<number, Club[]>()
    for (const c of world.clubs) {
      if (!byTier.has(c.tier)) byTier.set(c.tier, [])
      byTier.get(c.tier)!.push(c)
    }
    for (const clubs of byTier.values()) {
      for (const home of clubs) for (const away of clubs) if (home.id !== away.id) samples.push(play(world, rng, home, away, false))
    }
    for (let i = 0; i < CUP_PAIRS; i++) {
      const home = rng.pick(world.clubs)
      const away = rng.pick(world.clubs)
      if (home.id === away.id) continue
      samples.push(play(world, rng, home, away, true))
    }
    console.log(`seed ${seed} age ${target}: ${samples.length} samples so far, ${((performance.now() - t0) / 1000).toFixed(0)} s`)
  }
}

// The grid.
const edges: number[] = []
for (let i = 0; i <= K; i++) edges.push(LN_MIN + ((LN_MAX - LN_MIN) * i) / K)
const bin = (x: number): number => Math.min(K - 1, Math.max(0, Math.floor(((x - LN_MIN) / (LN_MAX - LN_MIN)) * K)))
const sumH: number[][] = Array.from({ length: K }, () => Array<number>(K).fill(0))
const sumA: number[][] = Array.from({ length: K }, () => Array<number>(K).fill(0))
const counts: number[][] = Array.from({ length: K }, () => Array<number>(K).fill(0))
for (const s of samples) {
  const i = bin(s.lnH)
  const j = bin(s.lnA)
  sumH[i]![j]! += s.hg
  sumA[i]![j]! += s.ag
  counts[i]![j]! += 1
}

// A smooth fit for sparse cells: ln(goals) = a + b·ln(own expected) + c·ln(their expected), weighted least squares on the dense cells, both sides pooled.
function fit(): { a: number; b: number; c: number } {
  const rows: { x1: number; x2: number; y: number; w: number }[] = []
  const centre = (i: number): number => (edges[i]! + edges[i + 1]!) / 2
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      const n = counts[i]![j]!
      if (n < 5) continue
      rows.push({ x1: centre(i), x2: centre(j), y: Math.log(Math.max(0.02, sumH[i]![j]! / n)), w: n })
      rows.push({ x1: centre(j), x2: centre(i), y: Math.log(Math.max(0.02, sumA[i]![j]! / n)), w: n })
    }
  }
  // Normal equations for [1, x1, x2].
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const v = [0, 0, 0]
  for (const r of rows) {
    const x = [1, r.x1, r.x2]
    for (let p = 0; p < 3; p++) {
      v[p]! += r.w * x[p]! * r.y
      for (let q = 0; q < 3; q++) m[p]![q]! += r.w * x[p]! * x[q]!
    }
  }
  // Solve 3×3 by Gaussian elimination.
  const A = m.map((row, i) => [...row, v[i]!])
  for (let col = 0; col < 3; col++) {
    let pivot = col
    for (let r = col + 1; r < 3; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[pivot]![col]!)) pivot = r
    const tmp = A[col]!
    A[col] = A[pivot]!
    A[pivot] = tmp
    for (let r = 0; r < 3; r++) {
      if (r === col) continue
      const f = A[r]![col]! / A[col]![col]!
      for (let c = col; c < 4; c++) A[r]![c]! -= f * A[col]![c]!
    }
  }
  return { a: A[0]![3]! / A[0]![0]!, b: A[1]![3]! / A[1]![1]!, c: A[2]![3]! / A[2]![2]! }
}
const coef = fit()
const home: number[][] = []
const away: number[][] = []
for (let i = 0; i < K; i++) {
  const rowH: number[] = []
  const rowA: number[] = []
  for (let j = 0; j < K; j++) {
    const n = counts[i]![j]!
    const ci = (edges[i]! + edges[i + 1]!) / 2
    const cj = (edges[j]! + edges[j + 1]!) / 2
    const fitH = Math.exp(coef.a + coef.b * ci + coef.c * cj)
    const fitA = Math.exp(coef.a + coef.b * cj + coef.c * ci)
    // Cells carry their own mean shrunk toward the fit by how many matches stand behind them, so sparse corners stay smooth.
    const w = n / (n + MIN_CELL)
    rowH.push(Number((w * (n ? sumH[i]![j]! / n : 0) + (1 - w) * fitH).toFixed(4)))
    rowA.push(Number((w * (n ? sumA[i]![j]! / n : 0) + (1 - w) * fitA).toFixed(4)))
  }
  home.push(rowH)
  away.push(rowA)
}

// The draw share, then rho to reproduce it through the table.
const league = samples.filter((s) => !s.cup)
const share = (f: (s: Sample) => boolean): number => league.filter(f).length / league.length
const observed = { homeWin: share((s) => s.hg > s.ag), draw: share((s) => s.hg === s.ag), awayWin: share((s) => s.hg < s.ag) }
const table: FastPathTable = { version: 1, edges: edges.map((e) => Number(e.toFixed(5))), home, away, counts, rho: 0, meta: {} }
function predictedDraws(rho: number): number {
  let d = 0
  for (const s of league) {
    const lh = Math.exp(Math.log(Math.max(0.01, lookupLambda(table.home, s.lnH, s.lnA))))
    const la = lookupLambda(table.away, s.lnH, s.lnA)
    const pmf = jointPmf(lh, la, rho)
    for (let k = 0; k <= T.MAX_GOALS; k++) d += pmf[k]![k]!
  }
  return d / league.length
}
function lookupLambda(grid: number[][], x: number, y: number): number {
  return grid[bin(x)]![bin(y)]!
}
let best = 0
let bestGap = Infinity
for (let rho = -0.6; rho <= 0.3001; rho += 0.01) {
  const gap = Math.abs(predictedDraws(rho) - observed.draw)
  if (gap < bestGap) {
    bestGap = gap
    best = Number(rho.toFixed(2))
  }
}
table.rho = best

// Check the finished table against the samples with the real interpolating lookup.
let fh = 0
let fa = 0
let fHome = 0
let fDraw = 0
let fAway = 0
let mh = 0
let ma = 0
for (const s of league) {
  mh += s.hg
  ma += s.ag
  const view = (ln: number) => ln
  void view
}
// The engine-side lookup needs SideViews; recompute through the same grid instead by mapping samples to cells.
for (const s of league) {
  const lh = lookupLambda(table.home, s.lnH, s.lnA)
  const la = lookupLambda(table.away, s.lnH, s.lnA)
  const pmf = jointPmf(lh, la, table.rho)
  for (let h = 0; h <= T.MAX_GOALS; h++) {
    for (let a = 0; a <= T.MAX_GOALS; a++) {
      const p = pmf[h]![a]!
      fh += p * h
      fa += p * a
      if (h > a) fHome += p
      else if (h === a) fDraw += p
      else fAway += p
    }
  }
}
const n = league.length
table.meta = {
  samples: samples.length,
  leagueSamples: n,
  engineGoals: Number(((mh + ma) / n).toFixed(3)),
  engineHomeGoals: Number((mh / n).toFixed(3)),
  engineAwayGoals: Number((ma / n).toFixed(3)),
  engineHomeWin: Number(observed.homeWin.toFixed(3)),
  engineDraw: Number(observed.draw.toFixed(3)),
  engineAwayWin: Number(observed.awayWin.toFixed(3)),
  fastGoals: Number(((fh + fa) / n).toFixed(3)),
  fastHomeGoals: Number((fh / n).toFixed(3)),
  fastAwayGoals: Number((fa / n).toFixed(3)),
  fastHomeWin: Number((fHome / n).toFixed(3)),
  fastDraw: Number((fDraw / n).toFixed(3)),
  fastAwayWin: Number((fAway / n).toFixed(3)),
  fitA: Number(coef.a.toFixed(4)),
  fitB: Number(coef.b.toFixed(4)),
  fitC: Number(coef.c.toFixed(4)),
}
void fastOdds
writeFileSync('packages/engine/src/match/fastpath.json', JSON.stringify(table, null, 1) + '\n')

const lines: string[] = []
lines.push('# Fast path calibration')
lines.push('')
lines.push(`Generated by \`pnpm calibrate:fast-path\` from ${samples.length} minute-engine matches (${n} league pairings, the rest cup-style) across ${SEEDS.length} worlds at ages ${AGES.join(', ')} seasons.`)
lines.push('')
lines.push('| Measure | Minute engine | Fast path |')
lines.push('| --- | --- | --- |')
lines.push(`| Goals per game | ${table.meta['engineGoals']} | ${table.meta['fastGoals']} |`)
lines.push(`| Home goals | ${table.meta['engineHomeGoals']} | ${table.meta['fastHomeGoals']} |`)
lines.push(`| Away goals | ${table.meta['engineAwayGoals']} | ${table.meta['fastAwayGoals']} |`)
lines.push(`| Home win | ${table.meta['engineHomeWin']} | ${table.meta['fastHomeWin']} |`)
lines.push(`| Draw | ${table.meta['engineDraw']} | ${table.meta['fastDraw']} |`)
lines.push(`| Away win | ${table.meta['engineAwayWin']} | ${table.meta['fastAwayWin']} |`)
lines.push('')
lines.push(`Low-score correlation ρ = ${table.rho}. Each cell's mean is shrunk toward the fit by n ÷ (n + ${MIN_CELL}); the fit is ln(goals) = ${coef.a.toFixed(3)} + ${coef.b.toFixed(3)}·ln(own expected) ${coef.c < 0 ? '−' : '+'} ${Math.abs(coef.c).toFixed(3)}·ln(their expected).`)
lines.push('')
lines.push('Cell counts (rows: home expected-goals bin, low to high; columns: away):')
lines.push('')
lines.push('```')
for (const row of counts) lines.push(row.map((c) => String(c).padStart(5)).join(''))
lines.push('```')
writeFileSync('packages/engine/src/match/FASTPATH.md', lines.join('\n') + '\n')
console.log(table.meta)
console.log(`rho ${table.rho}; done in ${((performance.now() - t0) / 1000).toFixed(0)} s`)
