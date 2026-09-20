import type { Event, World } from './types.js'

/** Event types kept in a career log whoever they concern: the news of the game. */
const NEWS = new Set([
  'world.created',
  'managers.created',
  'career.started',
  'season.start',
  'season.end',
  'promotion',
  'relegation',
  'trophy',
  'cup.final',
  'europe.group',
  'manager.hired',
  'manager.sacked',
  'manager.mutual',
  'manager.resigned',
  'manager.poached',
  'manager.walkedOut',
  'contract.expired',
  'manager.retired',
  'career.ended',
  'vacancy.opened',
  'vacancy.filled',
  'shock.takeover',
  'window.closed',
  'human.decision',
  'human.decided',
  'human.input',
])

/** Does an event touch the human: their id, their spell, their club, a vacancy they applied to? */
export function concernsHuman(world: World, event: Event): boolean {
  const human = world.human
  if (!human) return true
  if (NEWS.has(event.type)) return true
  const p = event.payload
  const id = human.managerId
  if (p['managerId'] === id || p['homeManagerId'] === id || p['awayManagerId'] === id) return true
  if (Array.isArray(p['managers']) && (p['managers'] as unknown[]).includes(id)) return true
  const manager = world.managers[id - 1]
  if (manager && typeof p['spellId'] === 'number' && manager.history.spellIds.includes(p['spellId'])) return true
  if (manager && manager.status.kind === 'employed') {
    const clubId = manager.status.post.clubId
    if (p['clubId'] === clubId || p['homeId'] === clubId || p['awayId'] === clubId) return true
  }
  if (typeof p['vacancyId'] === 'number') {
    const vacancy = world.vacancies[p['vacancyId'] - 1]
    if (vacancy && vacancy.applicants.includes(id)) return true
  }
  return false
}

/**
 * Append an event to the log. Every state change goes through here. In a
 * career the log keeps only what concerns the human plus the news, so a
 * save stays small; the event object is returned either way.
 */
export function emit(world: World, type: string, payload: Record<string, unknown> = {}): Event {
  const event: Event = { week: world.week, type, payload }
  if (world.logPolicy === 'full' || concernsHuman(world, event)) world.log.push(event)
  return event
}
