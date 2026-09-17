import matchTemplates from './match.json'
import boardTemplates from './board.json'
import pressTemplates from './press.json'
import agentTemplates from './agent.json'
import staffTemplates from './staff.json'
import newsTemplates from './news.json'
import playerTemplates from './players.json'
import commentaryTemplates from './commentary.json'
import type { Event, World } from '../types.js'

type Templates = Record<string, string[]>

const templates: Templates = matchTemplates

export type Bank = 'board' | 'press' | 'agent' | 'staff' | 'news' | 'players' | 'commentary'
const banks: Record<Bank, Templates> = {
  board: boardTemplates,
  press: pressTemplates,
  agent: agentTemplates,
  staff: staffTemplates,
  news: newsTemplates,
  players: playerTemplates,
  commentary: commentaryTemplates,
}

/** 1 → 1st, 2 → 2nd, 11 → 11th, 23 → 23rd. */
export function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  const last = n % 10
  return `${n}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`
}

/** Render a template from a bank; the variant is a function of `salt`, never of the RNG. */
export function renderText(bank: Bank, key: string, vars: Record<string, string | number>, salt: number): string {
  const options = banks[bank][key]
  if (!options || options.length === 0) return `[${bank}.${key}]`
  return fill(options[Math.abs(salt) % options.length] as string, vars)
}

export function matchTemplateKey(homeGoals: number, awayGoals: number, shootout: boolean): string {
  if (shootout) return 'shootout'
  const margin = homeGoals - awayGoals
  if (margin >= 3) return 'home_win_big'
  if (margin > 0) return 'home_win'
  if (margin <= -3) return 'away_win_big'
  if (margin < 0) return 'away_win'
  return homeGoals === 0 ? 'draw_goalless' : 'draw'
}

export function clubNameOf(world: World, clubId: number): string {
  const home = world.clubs.find((c) => c.id === clubId)
  if (home) return home.name
  for (const league of world.foreign) {
    const club = league.clubs.find((c) => c.id === clubId)
    if (club) return club.name
  }
  return `Club ${clubId}`
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`))
}

/** Render a match.played event. Template choice is a function of the event, never of the RNG. */
export function renderMatch(world: World, event: Event): string {
  const p = event.payload as {
    homeId: number
    awayId: number
    homeGoals: number
    awayGoals: number
    shootoutWinnerId?: number
    text: string
  }
  const options = templates[p.text] ?? templates['draw'] ?? ['{home} {hg}-{ag} {away}']
  const index = (event.week + p.homeId + p.awayId) % options.length
  const winner = p.shootoutWinnerId === p.homeId ? p.homeId : p.awayId
  const loser = winner === p.homeId ? p.awayId : p.homeId
  return fill(options[index] as string, {
    home: clubNameOf(world, p.homeId),
    away: clubNameOf(world, p.awayId),
    hg: p.homeGoals,
    ag: p.awayGoals,
    winner: clubNameOf(world, winner),
    loser: clubNameOf(world, loser),
  })
}
