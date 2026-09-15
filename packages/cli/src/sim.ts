import { applyOverrides, runCareers, tunables, type PopulationStats, type StatLine } from '@tenure/engine'

interface Args {
  careers: number
  seeds: number[]
  years: number
  quiet: boolean
  json: boolean
  set: Record<string, unknown>
}

function parseValue(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = { careers: 500, seeds: [tunables.DEFAULT_SEED], years: 120, quiet: false, json: false, set: {} }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const value = argv[i + 1]
    if (key === '--careers' && value !== undefined) {
      args.careers = Number(value)
      i++
    } else if (key === '--seed' && value !== undefined) {
      args.seeds = [Number(value)]
      i++
    } else if (key === '--seeds' && value !== undefined) {
      args.seeds = value.split(',').map((s) => Number(s.trim()))
      i++
    } else if (key === '--years' && value !== undefined) {
      args.years = Number(value)
      i++
    } else if (key === '--set' && value !== undefined) {
      const eq = value.indexOf('=')
      if (eq <= 0) throw new Error(`--set expects NAME=value, got ${value}`)
      args.set[value.slice(0, eq)] = parseValue(value.slice(eq + 1))
      i++
    } else if (key === '--quiet') {
      args.quiet = true
    } else if (key === '--json') {
      args.json = true
    } else if (key === '--help' || key === '-h') {
      console.log('usage: sim [--careers N] [--seed S | --seeds S1,S2,...] [--years Y] [--set NAME=value]... [--quiet] [--json]')
      process.exit(0)
    }
  }
  return args
}

function formatValue(line: StatLine): string {
  switch (line.format) {
    case 'share':
      return `${(line.value * 100).toFixed(1)}%`
    case 'count':
      return `${line.value}`
    default:
      return `${line.value.toFixed(2)}`
  }
}

function formatBand(line: StatLine): string {
  const f = (x: number) => (line.format === 'share' ? `${Math.round(x * 100)}%` : `${x}`)
  return `${f(line.band.min)}–${f(line.band.max)} (≈${f(line.band.target)})`
}

function printSingle(stats: PopulationStats): void {
  console.log('')
  console.log(`Tenure population validation — seed ${stats.seed}, ${stats.seasonsSimulated} seasons, ${stats.careersTracked} careers tracked, ${stats.careersEnded} ended`)
  console.log('Targets are starting figures to verify (DESIGN.md).')
  console.log('')
  const width = Math.max(...stats.lines.map((l) => l.label.length))
  for (const line of stats.lines) {
    console.log(`${line.pass ? 'PASS' : 'FAIL'}  ${line.label.padEnd(width)}  ${formatValue(line).padStart(7)}   target ${formatBand(line)}`)
  }
  console.log('')
  console.log(`${stats.lines.filter((l) => l.pass).length} of ${stats.lines.length} targets pass.`)
  console.log('')
  for (const h of stats.histograms) {
    console.log(h.label)
    const total = h.buckets.reduce((s, b) => s + b.count, 0) || 1
    for (const b of h.buckets) {
      const share = b.count / total
      console.log(`  ${b.label.padEnd(18)} ${String(b.count).padStart(5)}  ${'#'.repeat(Math.round(share * 40)).padEnd(40)} ${(share * 100).toFixed(0)}%`)
    }
    console.log('')
  }
  console.log('Extras')
  for (const [k, v] of Object.entries(stats.extras)) console.log(`  ${k.padEnd(30)} ${Number.isInteger(v) ? v : v.toFixed(2)}`)
}

function printMatrix(all: PopulationStats[]): void {
  console.log('')
  console.log(`Tenure population validation — seeds ${all.map((s) => s.seed).join(', ')}, ${all[0]?.careersTracked ?? 0} careers each`)
  console.log('')
  const first = all[0]
  if (!first) return
  const width = Math.max(...first.lines.map((l) => l.label.length))
  console.log(`${''.padEnd(width + 2)}${all.map((s) => `seed ${s.seed}`.padStart(11)).join('')}   target`)
  let allPass = 0
  for (let i = 0; i < first.lines.length; i++) {
    const cells = all.map((s) => {
      const line = s.lines[i] as StatLine
      return `${line.pass ? ' ' : '!'}${formatValue(line)}`.padStart(11)
    })
    const pass = all.every((s) => (s.lines[i] as StatLine).pass)
    if (pass) allPass++
    console.log(`${(first.lines[i] as StatLine).label.padEnd(width + 2)}${cells.join('')}   ${formatBand(first.lines[i] as StatLine)}`)
  }
  console.log('')
  console.log(`${allPass} of ${first.lines.length} targets pass on every seed. (! marks a miss)`)
  console.log('')
  const keys = ['sackings per season', 'poaches', 'mutual consents', 'expiries (released)', 'median earnings £m (ended)', 'max games (tracked)']
  for (const k of keys) console.log(`  ${k.padEnd(30)} ${all.map((s) => String(Math.round((s.extras[k] ?? 0) * 100) / 100).padStart(11)).join('')}`)
}

const args = parseArgs(process.argv.slice(2))
const started = Date.now()
const applied = applyOverrides(args.set)
if (!args.quiet && !args.json) {
  console.log(`tenure sim: careers=${args.careers} seeds=${args.seeds.join(',')} years<=${args.years}${applied.length ? ` set ${applied.map((k) => `${k}=${JSON.stringify(args.set[k])}`).join(' ')}` : ''}`)
}
const results: PopulationStats[] = []
for (const seed of args.seeds) {
  const result = runCareers({
    seed,
    careers: args.careers,
    maxYears: args.years,
    onSeason:
      args.quiet || args.json
        ? undefined
        : (world, tracked, ended) => {
            if ((world.season - 1) % 10 === 0) console.log(`  seed ${seed} season ${world.season - 1}: ${tracked} tracked, ${ended} ended, ${world.log.length} events`)
          },
  })
  results.push(result.stats)
}
if (args.json) {
  console.log(JSON.stringify({ set: args.set, results: results.map((s) => ({ seed: s.seed, seasons: s.seasonsSimulated, lines: s.lines, extras: s.extras })) }))
} else {
  if (results.length === 1) printSingle(results[0] as PopulationStats)
  else printMatrix(results)
  console.log(`\n${((Date.now() - started) / 1000).toFixed(1)}s`)
}
