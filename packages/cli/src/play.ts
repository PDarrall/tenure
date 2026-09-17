/**
 * Terminal play: one match per turn, the inbox in text, decisions answered by
 * number and letter. `pnpm play --seed 1 --name "Your Name" --background coach`
 */
import { createInterface } from 'node:readline'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  advanceTurn,
  boardMood,
  careerSummary,
  competitionName,
  createCareer,
  inboxMark,
  inboxSince,
  nextFixture,
  openVacancies,
  seasonFixtures,
  ordinal,
  pendingDecisions,
  qualifies,
  seasonWeek,
  spellOf,
  tableFor,
  tunables,
  FORMATION_NAMES,
  type Background,
  type Decision,
  type HumanInputs,
  type InboxMark,
  type Manager,
  type Formation,
  type Mentality,
  type Style,
  type Tier,
  type UnemployedActivity,
  type World,
} from '@tenure/engine'

interface Args {
  seed: number
  name: string
  background: Background
  load: string | null
  save: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { seed: tunables.DEFAULT_SEED, name: 'You', background: 'coach', load: null, save: null }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const value = argv[i + 1]
    if (key === '--seed' && value !== undefined) (args.seed = Number(value)), i++
    else if (key === '--name' && value !== undefined) (args.name = value), i++
    else if (key === '--background' && value !== undefined) (args.background = value as Background), i++
    else if (key === '--load' && value !== undefined) (args.load = value), i++
    else if (key === '--save' && value !== undefined) (args.save = value), i++
    else if (key === '--help' || key === '-h') {
      console.log('usage: play [--seed N] [--name "Name"] [--background ex-pro|coach|analyst] [--load file] [--save file]')
      process.exit(0)
    }
  }
  return args
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

function player(world: World): Manager {
  return world.managers[world.human!.managerId - 1] as Manager
}

function header(world: World): string {
  const me = player(world)
  const sw = seasonWeek(world.week)
  const phase = sw < tunables.MATCH_WEEKS ? `week ${sw + 1} of ${tunables.MATCH_WEEKS}` : `summer week ${sw - tunables.MATCH_WEEKS + 1}`
  const score = careerSummary(world).score
  const lines: string[] = []
  lines.push(`Season ${world.season}, ${phase}.  ${me.name}, ${me.age}.  Games ${score.games} · £${score.earnings}m · Trophy points ${score.trophyPoints} · Legacy ${score.legacy}`)
  if (me.status.kind === 'employed') {
    const spell = spellOf(world, me)!
    if (spell.post.kind === 'home') {
      const club = world.clubs[spell.post.clubId - 1]!
      const table = tableFor(world, club.tier)
      const pos = table.findIndex((r) => r.clubId === club.id) + 1
      lines.push(`${club.name} (tier ${club.tier}), ${ordinal(pos)} of ${table.length}.  Target ${ordinal(spell.expectation)}.  Board: ${boardMood(spell)}.  ${world.human!.tactic.formation}, ${world.human!.tactic.style}, ${world.human!.tactic.mentality}.  Contract to season ${Math.floor(spell.contract.endWeek / tunables.SEASON_WEEKS) + 1}.`)
      lines.push(nextFixtureLine(world))
    } else {
      lines.push(`Abroad in the ${spell.post.league} league.  Target ${ordinal(spell.expectation)}.  Board: ${boardMood(spell)}.`)
    }
  } else if (me.status.kind === 'unemployed') {
    const months = Math.floor((world.week - me.status.sinceWeek) / tunables.MONTH_WEEKS)
    lines.push(`Out of work: ${months} months (${me.status.activity}).  Reputation band: ${bandName(me.reputation)}.  ${tunables.NO_SHORTLIST_MONTHS - me.status.monthsSinceShortlisted} months before the phone stops ringing for good.`)
  }
  return lines.join('\n')
}

/** What Continue plays next (DESIGN.md "Fixtures"). */
function nextFixtureLine(world: World): string {
  const next = nextFixture(world)
  const sw = seasonWeek(world.week)
  if (!next) return sw >= tunables.MATCH_WEEKS ? 'Next: the summer; fixtures come out with the new season.' : 'Next: no more fixtures this season.'
  const when = next.seasonWeek === sw ? 'this week' : `week ${next.seasonWeek + 1}`
  if (next.kind === 'draw') return `Next: ${next.competitionLabel} round ${next.round}, ${when}, draw to come.`
  const where = next.opponentAbroad ?? `${next.opponentPosition !== null ? ordinal(next.opponentPosition) : '?'} in tier ${next.opponentTier}`
  const form = next.opponentForm.length ? next.opponentForm.join('') : 'no games yet'
  return `Next: ${next.opponent} (${next.home ? 'H' : 'A'}), ${next.competitionLabel}${next.competition === 'league' ? '' : ` round ${next.round}`}, ${when}.  They are ${where}, form ${form}.`
}

function showFixtures(world: World): void {
  const groups = seasonFixtures(world)
  if (groups.length === 0) {
    console.log('  No club, no fixtures.')
    return
  }
  for (const g of groups) {
    console.log(`  ${g.label}${g.status ? `  (${g.status})` : ''}`)
    for (const f of g.fixtures) {
      const score = f.played ? `${f.result} ${f.goalsFor}-${f.goalsAgainst}${f.shootoutWon === null ? '' : f.shootoutWon ? ' (pens won)' : ' (pens lost)'}` : ''
      console.log(`    wk ${String(f.seasonWeek + 1).padStart(2)}  ${`${f.opponent} (${f.home ? 'H' : 'A'})`.padEnd(32)}${f.competition === 'league' ? '' : `r${f.round} `}${score}`)
    }
  }
}

function bandName(rep: number): string {
  if (rep >= 90) return 'elite'
  if (rep >= 75) return 'tier 1'
  if (rep >= 60) return 'tier 2'
  if (rep >= 40) return 'tier 3'
  if (rep >= 20) return 'tier 4'
  return 'non-league'
}

function showInbox(world: World, from: InboxMark): void {
  const items = inboxSince(world, from)
  if (items.length === 0) return
  console.log('')
  for (const item of items) console.log(`  ${item.from.padEnd(6)} ${item.text}`)
}

function showDecisions(decisions: Decision[]): void {
  if (decisions.length === 0) return
  console.log('')
  decisions.forEach((d, i) => {
    console.log(`  ${i + 1}${d.blocking ? '*' : ' '} [${d.from}] ${d.title}`)
    console.log(`     ${d.body}`)
    d.options.forEach((o, j) => console.log(`       ${LETTERS[j]}) ${o.label}${o.detail ? ` — ${o.detail}` : ''}`))
  })
  if (decisions.some((d) => d.blocking)) console.log('  Answer the starred decisions before moving on: e.g. "1 b".')
}

function showVacancies(world: World): void {
  const me = player(world)
  const open = openVacancies(world)
  if (open.length === 0) {
    console.log('  No vacancies open.')
    return
  }
  for (const v of open) {
    const name = v.post.kind === 'home' ? world.clubs[v.post.clubId - 1]!.name : (world.foreign.find((l) => l.kind === (v.post.kind === 'abroad' ? v.post.league : ''))?.clubs.find((c) => c.id === v.post.clubId)?.name ?? 'abroad')
    const where = v.post.kind === 'home' ? `tier ${world.clubs[v.post.clubId - 1]!.tier}` : `${v.post.league} league abroad`
    const applied = v.applicants.includes(me.id) ? ' (applied)' : ''
    const fits = qualifies(world, me, v) ? ' *' : ''
    console.log(`  #${v.id} ${name} (${where}) ${v.ownerType} owner, ${v.contract.years}y, target ${ordinal(v.expectation)}${v.crisis ? ', crisis' : ''}${fits}${applied}`)
  }
  console.log('  * = your reputation qualifies.  Apply with "a <id>".')
}

function showTable(world: World): void {
  const me = player(world)
  const spell = spellOf(world, me)
  const tier: Tier = spell && spell.post.kind === 'home' ? world.clubs[spell.post.clubId - 1]!.tier : 1
  const table = tableFor(world, tier)
  console.log(`  Tier ${tier}`)
  table.forEach((r, i) => {
    const club = world.clubs[r.clubId - 1]!
    const mark = spell && spell.post.kind === 'home' && spell.post.clubId === r.clubId ? '>' : ' '
    console.log(`  ${mark}${String(i + 1).padStart(2)} ${club.name.padEnd(26)} P${String(r.played).padStart(3)} W${String(r.won).padStart(3)} D${String(r.drawn).padStart(3)} L${String(r.lost).padStart(3)}  ${String(r.goalsFor - r.goalsAgainst).padStart(4)}  ${String(r.points).padStart(3)}`)
  })
}

function showCareer(world: World): void {
  const s = careerSummary(world)
  console.log(`  ${s.name}, ${s.age}, ${s.background}. ${s.status}. Reputation ${s.reputation} (${bandName(s.reputation)}).`)
  console.log(`  Games ${s.score.games} · Earnings £${s.score.earnings}m · Trophy points ${s.score.trophyPoints} · Legacy ${s.score.legacy} · Seasons managed ${s.seasonsManaged}`)
  for (const sp of s.spells) {
    console.log(`  ${sp.club} (${sp.where}), season ${sp.fromSeason}${sp.toSeason !== null ? `–${sp.toSeason}` : '–'}, ${sp.seasons} seasons${sp.endReason ? `, ${sp.endReason}` : ''}${sp.finishes.length ? `, finishes ${sp.finishes.join(', ')}` : ''}`)
  }
  if (s.honours.length) console.log(`  Honours: ${s.honours.map((h) => `${competitionName(h.competition)} (season ${h.season})`).join(', ')}`)
  if (s.tags.length) console.log(`  Tags: ${s.tags.map((t) => t.tag).join(', ')}`)
}

function help(): void {
  console.log(`  enter          continue: play the next fixture, or take the next step
  1 b            answer decision 1 with option b
  a <id>         apply for vacancy    w <id>         withdraw an application
  form <name>    formation (e.g. form 4-4-2)   style possession|direct|counter|pressing
  m attack|balanced|defend   mentality
  act <what>     wait|punditry|assistant|abroad       v   vacancies   f   fixtures   t   table   c   career page
  resign         resign now           retire         end the career and bank the score
  save [file]    save                 q              quit (autosaves if --save given)   h   help`)
}

function save(world: World, path: string): void {
  writeFileSync(path, JSON.stringify(world))
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  let world: World
  if (args.load) {
    world = JSON.parse(readFileSync(args.load, 'utf8')) as World
    console.log(`Loaded ${args.load}.`)
  } else {
    world = createCareer(args.seed, { name: args.name, background: args.background })
    console.log(`A new career. ${args.name}, ${player(world).age}, ${args.background}. Seed ${args.seed}.`)
    console.log('You start with no record and no job. Vacancies marked * are ones your reputation qualifies for. "h" for help.')
  }
  // A queued line reader: works the same for a terminal and for piped input.
  const rl = createInterface({ input: process.stdin, terminal: false })
  const queued: string[] = []
  let waiter: ((line: string | null) => void) | null = null
  let ended = false
  let closed = false
  rl.on('line', (line) => {
    if (waiter) {
      const w = waiter
      waiter = null
      w(line)
    } else queued.push(line)
  })
  rl.on('close', () => {
    ended = true
    if (waiter) {
      const w = waiter
      waiter = null
      w(null)
    }
  })
  const ask = (prompt: string): Promise<string | null> => {
    process.stdout.write(prompt)
    if (queued.length) return Promise.resolve(queued.shift() as string)
    if (ended) return Promise.resolve(null)
    return new Promise((resolve) => {
      waiter = resolve
    })
  }

  let inputs: HumanInputs = { answers: {} }
  const lastWeek = Math.max(0, world.week - 1)
  const firstIndex = world.log.findIndex((e) => e.week >= lastWeek)
  let shownFrom: InboxMark = { index: firstIndex < 0 ? world.log.length : firstIndex, week: lastWeek }
  let confirmRetire = false

  while (!closed) {
    const me = player(world)
    console.log('')
    console.log(header(world))
    showInbox(world, shownFrom)
    if (me.status.kind === 'retired') {
      console.log('')
      console.log('The career is over.')
      showCareer(world)
      if (args.save) save(world, args.save)
      break
    }
    const decisions = pendingDecisions(world)
    showDecisions(decisions)

    let advance = false
    while (!advance && !closed) {
      const raw = await ask('> ')
      if (raw === null) {
        closed = true
        break
      }
      const line = raw.trim()
      if (!process.stdin.isTTY) console.log(line)
      const [cmd = '', ...rest] = line.split(/\s+/)
      const arg = rest.join(' ')
      if (cmd === '') {
        const unanswered = decisions.filter((d) => d.blocking && inputs.answers![d.id] === undefined)
        if (unanswered.length) {
          console.log(`  Answer decision ${decisions.indexOf(unanswered[0]!) + 1} first.`)
          continue
        }
        advance = true
      } else if (/^\d+$/.test(cmd) && rest.length === 1) {
        const d = decisions[Number(cmd) - 1]
        const idx = LETTERS.indexOf(rest[0]!.toLowerCase())
        const opt = d?.options[idx]
        if (!d || !opt) console.log('  No such decision or option.')
        else {
          inputs.answers![d.id] = opt.key
          console.log(`  ${d.title}: ${opt.label}.`)
        }
      } else if (cmd === 'a' && /^\d+$/.test(arg)) {
        inputs.apply = [...(inputs.apply ?? []), Number(arg)]
        console.log(`  Applying for #${arg}.`)
      } else if (cmd === 'w' && /^\d+$/.test(arg)) {
        inputs.withdraw = [...(inputs.withdraw ?? []), Number(arg)]
      } else if (cmd === 'form' && (FORMATION_NAMES as string[]).includes(arg)) {
        inputs.tactic = { ...(inputs.tactic ?? {}), formation: arg as Formation }
        console.log(`  ${arg} from the next match.`)
      } else if (cmd === 'style' && ['possession', 'direct', 'counter', 'pressing'].includes(arg)) {
        inputs.tactic = { ...(inputs.tactic ?? {}), style: arg as Style }
        console.log(`  ${arg} from the next match.`)
      } else if (cmd === 'm' && ['attack', 'balanced', 'defend'].includes(arg)) {
        inputs.tactic = { ...(inputs.tactic ?? {}), mentality: arg as Mentality }
        console.log(`  Mentality ${arg} from the next match.`)
      } else if (cmd === 'act' && ['wait', 'punditry', 'assistant', 'abroad'].includes(arg)) {
        inputs.activity = arg as UnemployedActivity
        console.log(`  ${arg} from this week.`)
      } else if (cmd === 'v') showVacancies(world)
      else if (cmd === 'f') showFixtures(world)
      else if (cmd === 't') showTable(world)
      else if (cmd === 'c') showCareer(world)
      else if (cmd === 'resign') {
        inputs.resign = true
        console.log('  You will resign this turn.')
      } else if (cmd === 'retire') {
        if (confirmRetire) {
          inputs.retire = true
          advance = true
        } else {
          confirmRetire = true
          console.log('  Retiring banks the score and ends the career. Type "retire" again to confirm.')
          continue
        }
      } else if (cmd === 'save') {
        const path = arg || args.save
        if (!path) console.log('  Give a file name: save career.json')
        else {
          save(world, path)
          console.log(`  Saved to ${path}.`)
        }
      } else if (cmd === 'q') {
        if (args.save) save(world, args.save)
        closed = true
      } else if (cmd === 'h') help()
      else console.log('  Unknown command. "h" for help.')
      confirmRetire = cmd === 'retire'
    }
    if (closed) break
    shownFrom = inboxMark(world)
    advanceTurn(world, inputs)
    inputs = { answers: {} }
    if (args.save) save(world, args.save)
  }
  rl.close()
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
