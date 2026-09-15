import { tunables } from '@tenure/engine'

interface Args {
  careers: number
  seed: number
  years: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = { careers: 500, seed: tunables.DEFAULT_SEED, years: 120 }
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
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
console.log(`tenure sim: careers=${args.careers} seed=${args.seed} years=${args.years}`)
console.log('engine not built yet: world gen, managers, season, tenure, market and scoring follow in later steps.')
