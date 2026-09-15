import type { Event, World } from './types.js'

/** Append an event to the log. Every state change goes through here. */
export function emit(world: World, type: string, payload: Record<string, unknown> = {}): Event {
  const event: Event = { week: world.week, type, payload }
  world.log.push(event)
  return event
}
