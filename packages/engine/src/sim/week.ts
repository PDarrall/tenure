/**
 * The end of a week, shared by the simulation and the career loop: monthly
 * rolls, windows, the season's end, salaries, the board's roll and the
 * market. The order here is the simulation's; the career loop calls it
 * after the last football of the week.
 */
import type { Rng } from '../rng.js'
import { T } from '../tunables.js'
import type { World } from '../types.js'
import { emit } from '../events.js'
import { isMonthly } from '../season/calendar.js'
import { endSeason, summerWindow, winterWindow } from '../season/season.js'
import { managerById, spellOf } from '../lookup.js'
import * as tenure from '../tenure/hooks.js'
import * as market from '../market/hooks.js'
import { playersWeekly } from '../match/aftermath.js'
import { aiPlayerRequests, queuePlayerRequests, queueExpiringContracts } from '../players/contracts.js'
import { agentWeekly } from '../market/agent.js'
import { closeWindow, humanClub, isCardClose, isDeadlineWeek, refreshPot, resolveBids, settleSoldShines, windowAt } from '../market/director.js'
import { directorWeek } from '../play/transfers.js'
import { checkPromises, returnLoans } from '../play/requests.js'

export function extrasFor(world: World) {
  return (managerId: number) => {
    const spell = spellOf(world, managerById(world, managerId))
    return spell
      ? { expectation: spell.expectation, fallouts: spell.season.fallouts, boardRows: spell.season.boardRows }
      : { expectation: 0, fallouts: 0, boardRows: 0 }
  }
}

/** Everything a week does after its matches, before the clock moves. */
export function closeWeekHooks(world: World, rng: Rng, sw: number): void {
  if (isMonthly(sw)) {
    tenure.monthly(world, rng)
    market.monthly(world, rng)
  }
  if (sw < T.MATCH_WEEKS) playersWeekly(world)
  if (isMonthly(sw)) {
    aiPlayerRequests(world, rng)
    if (world.human) queuePlayerRequests(world, rng)
  }
  if (world.human && sw === T.MATCH_WEEKS - 1) queueExpiringContracts(world)
  if (sw === T.WINTER_WINDOW_WEEK) tenure.afterWinterWindow(world, winterWindow(world, rng))
  if (world.human) checkPromises(world)
  if (sw === T.MATCH_WEEKS) {
    returnLoans(world)
    settleSoldShines(world)
    tenure.seasonEnd(world, endSeason(world, rng, extrasFor(world)))
    market.seasonEnd(world, rng)
  }
  if (sw === T.SUMMER_WINDOW_WEEK) tenure.afterSummerWindow(world, summerWindow(world, rng, (clubId) => tenure.budgetMultiplierFor(world, clubId)))
  // The windows (DESIGN.md "Transfers"): bids answer at the close; the director brings next week's cards; deadline day shuts it.
  const window = windowAt(sw)
  if (window) resolveBids(world, rng)
  const opening = windowAt(sw + 1)
  if (opening && !windowAt(sw)) {
    for (const club of world.clubs) refreshPot(world, club, opening, tenure.budgetMultiplierFor(world, club.id))
    const mine = humanClub(world)
    if (mine) emit(world, 'window.opened', { clubId: mine.club.id, managerId: mine.manager.id, window: opening, deadline: opening === 'january' ? T.JANUARY_WINDOW_WEEKS[1] : T.SUMMER_WINDOW_WEEKS[1], pot: mine.club.transferPot, wages: mine.club.wageBudget, season: world.season })
  }
  const cards = isCardClose(sw)
  if (cards && world.human) directorWeek(world, rng, cards)
  if (window && isDeadlineWeek(sw)) closeWindow(world, rng, window)
  tenure.weekly(world, rng)
  market.weekly(world, rng)
  if (world.human) agentWeekly(world)
}
