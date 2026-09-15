import { runCareers, tunables, type PopulationStats, type StatLine } from '@tenure/engine'

interface Args {
  careers: number
  seed: number
  years: number
  quiet: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { careers: 500, seed: tunables.DEFAULT_SEED, years: 120, quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const value = argv[i + 1]
    if (key === '--careers' && value !== undefined) {
      args.careers = Number(value)
      i++
    } else if (key === '--seed' && value !== undefined) {
      args.seed = Number(value)
      i++
    } else if (key === '--years' && value !== undefined) {
      args.years = Number(value)
      i++
    } else if (key === '--quiet') {
      args.quiet = true
    } else if (key === '--help' || key === '-h') {
      console.log('usage: sim [--careers N] [--seed S] [--years Y] [--quiet]')
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
    case 'seasons':
      return `${line.value.toFixed(2)}`
    default:
      return `${line.value.toFixed(2)}`
  }
}

function formatBand(line: StatLine): string {
  const f = (x: number) => (line.format === 'share' ? `${Math.round(x * 100)}%` : line.format === 'count' ? `${x}` : `${x}`)
  return `${f(line.band.min)}–${f(line.band.max)} (≈${f(line.band.target)})`
}

function printStats(stats: PopulationStats): void {
  console.log('')
  console.log(`Tenure population validation — seed ${stats.seed}, ${stats.seasonsSimulated} seasons, ${stats.careersTracked} careers tracked, ${stats.careersEnded} ended`)
  console.log('Targets are starting figures to verify (DESIGN.md).')
  console.log('')
  const width = Math.max(...stats.lines.map((l) => l.label.length))
  for (const line of stats.lines) {
    console.log(`${line.pass ? 'PASS' : 'FAIL'}  ${line.label.padEnd(width)}  ${formatValue(line).padStart(7)}   target ${formatBand(line)}`)
  }
  const passed = stats.lines.filter((l) => l.pass).length
  console.log('')
  console.log(`${passed} of ${stats.lines.length} targets pass.`)
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

const args = parseArgs(process.argv.slice(2))
const started = Date.now()
if (!args.quiet) console.log(`tenure sim: careers=${args.careers} seed=${args.seed} years<=${args.years}`)
const result = runCareers({
  seed: args.seed,
  careers: args.careers,
  maxYears: args.years,
  onSeason: args.quiet
    ? undefined
    : (world, tracked, ended) => {
        if ((world.season - 1) % 10 === 0) console.log(`  season ${world.season - 1}: ${tracked} tracked, ${ended} ended, ${world.log.length} events`)
      },
})
printStats(result.stats)
console.log(`\n${((Date.now() - started) / 1000).toFixed(1)}s`)
