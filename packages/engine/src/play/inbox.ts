/**
 * The inbox: the week's events for the human, rendered from the text banks.
 * Nothing here reads ad-hoc state; every line comes from the log.
 */
import { T } from '../tunables.js'
import type { Event, Post, World } from '../types.js'
import { renderMatch, renderText, clubNameOf, ordinal } from '../text/render.js'
import { qualifies } from '../market/shortlist.js'

export type InboxFrom = 'board' | 'agent' | 'press' | 'staff' | 'match' | 'news'

export interface InboxItem {
  week: number
  from: InboxFrom
  text: string
}

function postName(world: World, post: Post): string {
  return clubNameOf(world, post.clubId)
}

function postTier(world: World, post: Post): string {
  if (post.kind === 'home') return `tier ${world.clubs[post.clubId - 1]?.tier ?? '?'}`
  return `${post.league} league abroad`
}

/** The competition as a fixture list names it. */
export function competitionLabel(c: unknown): string {
  switch (c) {
    case 'league':
      return 'League'
    case 'nationalCup':
      return 'National Cup'
    case 'leagueCup':
      return 'League Cup'
    case 'european':
      return 'European Cup'
    default:
      return String(c)
  }
}

export function competitionName(c: unknown): string {
  switch (c) {
    case 'league':
      return 'league title'
    case 'nationalCup':
      return 'national cup'
    case 'leagueCup':
      return 'league cup'
    case 'european':
      return 'European title'
    case 'foreignLeague':
      return 'league title'
    default:
      return String(c)
  }
}

/** A place in the log to read the inbox from: taken before a turn, read after it. */
export interface InboxMark {
  /** Log length when the mark was taken. */
  index: number
  /** World week when the mark was taken. */
  week: number
}

export function inboxMark(world: World): InboxMark {
  return { index: world.log.length, week: world.week }
}

/** Everything logged since the mark, as inbox items: one turn's post. */
export function inboxSince(world: World, mark: InboxMark): InboxItem[] {
  return render(world, world.log.slice(Math.max(0, Math.min(mark.index, world.log.length))), mark.week, world.week)
}

/** Events between fromWeek (inclusive) and toWeek (exclusive), as inbox items. */
export function inbox(world: World, fromWeek: number, toWeek: number = world.week): InboxItem[] {
  return render(
    world,
    world.log.filter((e) => e.week >= fromWeek && e.week < toWeek),
    fromWeek,
    toWeek,
  )
}

function render(world: World, events: Event[], fromWeek: number, toWeek: number): InboxItem[] {
  const state = world.human
  if (!state) return []
  const me = state.managerId
  const player = world.managers[me - 1]
  if (!player) return []
  const myClubId = player.status.kind === 'employed' ? player.status.post.clubId : null
  const mySpells = new Set(player.history.spellIds)
  const items: InboxItem[] = []
  const vacanciesByWeek = new Map<number, Event[]>()

  const push = (e: Event, from: InboxFrom, text: string) => items.push({ week: e.week, from, text })
  const mine = (e: Event) => e.payload['managerId'] === me
  const mySpell = (e: Event) => typeof e.payload['spellId'] === 'number' && mySpells.has(e.payload['spellId'] as number)
  const myClub = (e: Event) => myClubId !== null && e.payload['clubId'] === myClubId
  const nameOf = (id: unknown) => (typeof id === 'number' ? (world.managers[id - 1]?.name ?? 'A manager') : 'A manager')

  for (const e of events) {
    const p = e.payload
    switch (e.type) {
      case 'match.played': {
        if (p['homeManagerId'] !== me && p['awayManagerId'] !== me) break
        const position = typeof p['positionAfter'] === 'number' && p['competition'] === 'league' ? ` You are ${ordinal(p['positionAfter'])}.` : ''
        const comp = p['competition'] === 'league' ? '' : ` (${competitionName(p['competition'])}, round ${p['round']})`
        push(e, 'match', `${renderMatch(world, e)}${comp}${position}`)
        break
      }
      case 'cup.tie': {
        if (!myClub(e) && p['homeId'] !== myClubId && p['awayId'] !== myClubId) break
        if (myClubId === null) break
        const home = p['homeId'] === myClubId
        const opponent = clubNameOf(world, (home ? p['awayId'] : p['homeId']) as number)
        const key = p['final'] === true ? 'cup_draw_final' : home ? 'cup_draw_home' : 'cup_draw_away'
        push(e, 'news', renderText('news', key, { competition: competitionLabel(p['competition']), round: p['round'] as number, opponent, week: (p['week'] as number) + 1 }, e.week))
        break
      }
      case 'cup.bye':
        if (myClub(e)) push(e, 'news', renderText('news', 'cup_draw_bye', { competition: competitionLabel(p['competition']), round: p['round'] as number }, e.week))
        break
      case 'manager.hired':
        if (mine(e)) push(e, 'board', renderText('board', 'welcome', { club: postName(world, p['post'] as Post), expectation: ordinal(p['expectation'] as number), years: p['years'] as number, salary: p['salary'] as number }, e.week))
        break
      case 'manager.sacked':
        if (mine(e)) push(e, 'board', renderText('board', p['deserved'] ? 'sacked_deserved' : 'sacked_unjust', { club: postName(world, p['post'] as Post), payout: p['payout'] as number }, e.week))
        else push(e, 'news', renderText('news', 'sacked', { manager: nameOf(p['managerId']), club: postName(world, p['post'] as Post), tier: postTier(world, p['post'] as Post).replace('tier ', '') }, e.week))
        break
      case 'manager.mutual':
        if (mine(e)) push(e, 'board', renderText('board', 'mutual', { club: postName(world, p['post'] as Post), payout: p['payout'] as number }, e.week))
        break
      case 'manager.resigned':
        if (mine(e)) push(e, 'board', renderText('board', 'resigned', { club: postName(world, p['post'] as Post) }, e.week))
        break
      case 'manager.poached':
        if (mine(e)) push(e, 'agent', renderText('agent', 'approach_taken', { club: postName(world, p['to'] as Post), buyout: p['buyout'] as number }, e.week))
        else push(e, 'news', renderText('news', 'poached', { manager: nameOf(p['managerId']), from: postName(world, p['from'] as Post), to: postName(world, p['to'] as Post) }, e.week))
        break
      case 'manager.walkedOut':
        if (mine(e)) push(e, 'agent', renderText('agent', 'walked_out', { club: postName(world, p['to'] as Post) }, e.week))
        break
      case 'approach.declined':
        if (mine(e)) {
          const vacancy = world.vacancies[(p['vacancyId'] as number) - 1]
          push(e, 'agent', renderText('agent', 'approach_declined', { club: vacancy ? postName(world, vacancy.post) : 'them' }, e.week))
        }
        break
      case 'contract.renewed':
        if (mine(e)) push(e, 'board', renderText('board', 'renewed', { club: myClubId !== null ? clubNameOf(world, myClubId) : 'the club', years: p['years'] as number, salary: p['salary'] as number }, e.week))
        break
      case 'contract.expired':
        if (mine(e)) push(e, 'board', renderText('board', 'released', { club: postName(world, p['post'] as Post) }, e.week))
        break
      case 'contract.declined':
        if (mine(e)) push(e, 'board', renderText('board', 'left', { club: postName(world, p['post'] as Post) }, e.week))
        break
      case 'credit.season': {
        if (!mySpell(e)) break
        const finish = p['finish'] as number
        const expectation = p['expectation'] as number
        const key = finish < expectation ? 'review_beat' : finish === expectation ? 'review_met' : 'review_missed'
        push(e, 'board', renderText('board', key, { finish: ordinal(finish), expectation: ordinal(expectation) }, e.week))
        break
      }
      case 'expectation.reset':
        if (mySpell(e)) push(e, 'board', renderText('board', 'target', { to: ordinal(p['to'] as number) }, e.week))
        break
      case 'board.note': {
        if (!mine(e)) break
        const mood = String(p['mood'])
        if (mood === 'secure' || mood === 'settled') break
        push(e, 'board', renderText('board', `mood_${mood}`, { position: ordinal(p['position'] as number), expectation: ordinal(p['expectation'] as number) }, e.week))
        break
      }
      case 'shock.takeover':
        if (mySpell(e)) push(e, 'board', renderText('board', 'takeover', { club: clubNameOf(world, p['clubId'] as number), to: String(p['to']) }, e.week))
        else push(e, 'news', renderText('news', 'takeover', { club: clubNameOf(world, p['clubId'] as number) }, e.week))
        break
      case 'shock.crisis':
        if (mySpell(e)) push(e, 'board', renderText('board', 'crisis', { expectation: ordinal(p['expectation'] as number) }, e.week))
        break
      case 'shock.starSale':
        if (mySpell(e)) push(e, 'board', renderText('board', 'star_sale', { expectation: ordinal(p['expectation'] as number) }, e.week))
        break
      case 'shock.boardRow':
        if (mySpell(e)) push(e, 'board', renderText('board', 'row', {}, e.week))
        break
      case 'shock.fallout':
        if (mySpell(e)) push(e, 'staff', renderText('staff', 'fallout', {}, e.week))
        break
      case 'shock.falloutResolved':
        if (mySpell(e)) push(e, 'staff', renderText('staff', p['choice'] === 'sell' ? 'fallout_sold' : 'fallout_backed_down', {}, e.week))
        break
      case 'promotion':
        if (mine(e)) push(e, 'board', renderText('board', 'promoted', { club: clubNameOf(world, p['clubId'] as number), toTier: p['toTier'] as number }, e.week))
        else push(e, 'news', renderText('news', 'promotion', { club: clubNameOf(world, p['clubId'] as number), toTier: p['toTier'] as number }, e.week))
        break
      case 'relegation':
        if (mine(e)) push(e, 'board', renderText('board', 'relegated', { club: clubNameOf(world, p['clubId'] as number), toTier: p['toTier'] as number }, e.week))
        else push(e, 'news', renderText('news', 'relegation', { club: clubNameOf(world, p['clubId'] as number), toTier: p['toTier'] as number }, e.week))
        break
      case 'trophy':
        if (mine(e)) push(e, 'board', renderText('board', 'trophy', { club: clubNameOf(world, p['clubId'] as number), competition: competitionName(p['competition']) }, e.week))
        else if (p['competition'] === 'league' && p['tier'] === 1) push(e, 'news', renderText('news', 'trophy', { club: clubNameOf(world, p['clubId'] as number), competition: competitionName(p['competition']) }, e.week))
        break
      case 'season.end': {
        const champions = p['champions'] as Record<string, number> | undefined
        const champion = champions && champions['1'] !== undefined ? clubNameOf(world, champions['1']) : 'unknown'
        push(e, 'news', renderText('news', 'season_end', { season: p['season'] as number, champion }, e.week))
        break
      }
      case 'squad.window': {
        if (!myClub(e)) break
        const youth = p['youth'] as number
        const youthNote = youth > 0 ? `, ${youth} from the academy` : ''
        push(e, 'staff', renderText('staff', 'window', { spend: p['spend'] as number, gain: p['gain'] as number, turnoverPct: Math.round((p['turnover'] as number) * 100), youthNote }, e.week))
        if (typeof p['sold'] === 'number' && p['sold'] > 0) push(e, 'staff', renderText('staff', 'window_sold', { sold: p['sold'], soldPlural: p['sold'] === 1 ? '' : 's', cash: p['cash'] as number }, e.week))
        break
      }
      case 'squad.summer':
        if (myClub(e)) push(e, 'staff', renderText('staff', 'summer', { ageing: p['ageing'] as number, gravity: p['gravity'] as number, youthReleased: p['youthReleased'] as number, strength: p['strength'] as number }, e.week))
        break
      case 'vacancy.opened': {
        const list = vacanciesByWeek.get(e.week) ?? []
        list.push(e)
        vacanciesByWeek.set(e.week, list)
        break
      }
      case 'vacancy.shortlisted':
        if (mine(e)) push(e, 'agent', renderText('agent', 'shortlisted', { club: postName(world, p['post'] as Post) }, e.week))
        break
      case 'vacancy.applied':
        if (mine(e)) push(e, 'agent', renderText('agent', 'applied', { club: postName(world, p['post'] as Post) }, e.week))
        break
      case 'vacancy.filled': {
        const vacancy = world.vacancies[(p['vacancyId'] as number) - 1]
        if (vacancy && vacancy.applicants.includes(me) && p['managerId'] !== me) push(e, 'agent', renderText('agent', 'missed_out', { club: postName(world, vacancy.post) }, e.week))
        break
      }
      case 'earnings.payout':
        if (mine(e)) push(e, 'agent', renderText('agent', 'payout', { amount: p['amount'] as number }, e.week))
        break
      case 'unemployed.activity':
        if (mine(e)) push(e, 'agent', renderText('agent', `activity_${String(p['activity'])}`, {}, e.week))
        break
      case 'tag.assigned':
        if (mine(e)) push(e, 'press', renderText('press', 'tag', { tag: String(p['tag']) }, e.week))
        break
      case 'tag.expired':
        if (mine(e)) push(e, 'press', renderText('press', 'tag_expired', { tag: String(p['tag']) }, e.week))
        break
      case 'human.decided':
        if (p['byDefault'] === true) push(e, 'agent', renderText('agent', 'default_taken', { key: String(p['key']) }, e.week))
        break
      case 'career.ended':
        if (mine(e)) {
          // One message per ending; the generic line covers any reason without its own template.
          const reason = String(p['reason'])
          const vars = { games: p['games'] as number, earnings: p['earnings'] as number, trophyPoints: p['trophyPoints'] as number, reason }
          const specific = renderText('board', `career_over_${reason}`, vars, e.week)
          push(e, 'board', specific.startsWith('[board.') ? renderText('board', 'career_over', vars, e.week) : specific)
        }
        break
      default:
        break
    }
  }

  // Vacancies: one agent line per week, the ones the human qualifies for marked.
  for (const [week, events] of vacanciesByWeek) {
    const parts = events.map((e) => {
      const post = e.payload['post'] as Post
      const id = e.payload['vacancyId'] as number
      const vacancy = world.vacancies[id - 1]
      const fits = vacancy ? qualifies(world, player, vacancy) : false
      return `#${id} ${postName(world, post)} (${postTier(world, post)})${fits ? ' *' : ''}`
    })
    items.push({ week, from: 'agent', text: renderText('agent', 'vacancies', { count: parts.length, list: parts.join(', ') }, week) })
  }

  // The clock, once a month while out of work.
  if (player.status.kind === 'unemployed') {
    const lastWeek = toWeek - 1
    if (lastWeek >= fromWeek && lastWeek % T.MONTH_WEEKS === 0) {
      const months = Math.floor((lastWeek - player.status.sinceWeek) / T.MONTH_WEEKS)
      const monthsLeft = T.NO_SHORTLIST_MONTHS - player.status.monthsSinceShortlisted
      items.push({ week: lastWeek, from: 'agent', text: renderText('agent', 'months_out', { months, shortlistMonths: player.status.monthsSinceShortlisted }, toWeek) })
      if (monthsLeft <= 6) items.push({ week: lastWeek, from: 'agent', text: renderText('agent', 'clock', { monthsLeft }, toWeek) })
    }
  }

  items.sort((a, b) => a.week - b.week)
  return items
}
