/**
 * Fictional name generation. Everything is built from syllable pools so no
 * real club, town or league is reproduced.
 */
import type { Rng } from '../rng.js'
import type { ForeignLeagueKind } from '../types.js'

const TOWN_PREFIXES = [
  'Ash', 'Bram', 'Cald', 'Dun', 'Eller', 'Fen', 'Gart', 'Hal', 'Ilk', 'Kel',
  'Lang', 'Mar', 'Nor', 'Oak', 'Pen', 'Rad', 'Stan', 'Thorn', 'Wel', 'Wyn',
  'Bex', 'Cros', 'Dray', 'Ever', 'Fair', 'Gris', 'Hol', 'Ken', 'Lud', 'Mel',
  'Nether', 'Ox', 'Pad', 'Quen', 'Ros', 'Sel', 'Tam', 'Ul', 'Ver', 'Whit',
]
const TOWN_SUFFIXES = [
  'ford', 'bury', 'ton', 'ham', 'wick', 'mouth', 'field', 'ley', 'stone',
  'bridge', 'worth', 'by', 'thorpe', 'chester', 'minster', 'dale', 'combe',
  'port', 'sea', 'moor',
]
const CLUB_SUFFIXES = [
  'Town', 'United', 'City', 'Athletic', 'Rovers', 'Wanderers', 'Albion',
  'County', 'Argyle', 'Orient', 'Rangers', 'Villa', 'Alexandra', 'Stanley',
  'Harriers', 'North End', 'Vale', 'Wednesday', 'Forest', 'Dynamo',
]

const FOREIGN_SYLLABLES: Record<ForeignLeagueKind, { first: string[]; second: string[]; prefix: string[] }> = {
  big: {
    prefix: ['Real', 'Atlético', 'Sporting', 'Deportivo', 'Unión', 'Racing'],
    first: ['Val', 'Sal', 'Cor', 'Mon', 'Tar', 'Bur', 'Gra', 'Alm', 'Car', 'Log'],
    second: ['encia', 'amanca', 'doba', 'tilla', 'ragona', 'gos', 'nada', 'ería', 'tagena', 'roño'],
  },
  mid: {
    prefix: ['FC', 'SV', 'VfB', 'SC', 'TSV', 'Eintracht'],
    first: ['Rhein', 'Ober', 'Nieder', 'Wald', 'Berg', 'Frank', 'Reut', 'Kass', 'Osna', 'Mann'],
    second: ['hausen', 'bach', 'brück', 'stadt', 'heim', 'burg', 'lingen', 'feld', 'furt', 'dorf'],
  },
  small: {
    prefix: ['IF', 'FK', 'SK', 'BK', 'AIK', 'Viking'],
    first: ['Nor', 'Sol', 'Lil', 'Hau', 'Kris', 'Sand', 'Trom', 'Var', 'Brann', 'Hal'],
    second: ['vik', 'strand', 'sund', 'nes', 'berg', 'fjord', 'sø', 'køb', 'holm', 'stad'],
  },
}

const FOREIGN_LEAGUE_NAMES: Record<ForeignLeagueKind, string> = {
  big: 'Liga Primera',
  mid: 'Bundesland Liga',
  small: 'Nordisk Serien',
}

export function foreignLeagueName(kind: ForeignLeagueKind): string {
  return FOREIGN_LEAGUE_NAMES[kind]
}

/** A generator that hands out unique town names in seed order. */
export class TownNamer {
  private readonly used = new Set<string>()
  constructor(private readonly rng: Rng) {}

  next(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const name = this.rng.pick(TOWN_PREFIXES) + this.rng.pick(TOWN_SUFFIXES)
      if (!this.used.has(name)) {
        this.used.add(name)
        return name
      }
    }
    throw new Error('TownNamer: exhausted name space')
  }
}

/** Club name from a town. Roughly half the clubs are just the town name. */
export function clubName(rng: Rng, town: string, plainShare: number): string {
  return rng.chance(plainShare) ? town : `${town} ${rng.pick(CLUB_SUFFIXES)}`
}

export class ForeignNamer {
  private readonly used = new Set<string>()
  constructor(private readonly rng: Rng) {}

  next(kind: ForeignLeagueKind, prefixShare: number): string {
    const pools = FOREIGN_SYLLABLES[kind]
    for (let attempt = 0; attempt < 1000; attempt++) {
      const town = this.rng.pick(pools.first) + this.rng.pick(pools.second)
      const name = this.rng.chance(prefixShare) ? `${this.rng.pick(pools.prefix)} ${town}` : town
      if (!this.used.has(name)) {
        this.used.add(name)
        return name
      }
    }
    throw new Error('ForeignNamer: exhausted name space')
  }
}
