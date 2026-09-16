import type { World } from './types.js'

/** FNV-1a 32-bit hash of a string, as 8 hex digits. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** A compact, human-readable projection of a world plus a hash of the whole thing. */
export function digestWorld(world: World) {
  return {
    hash: fnv1a(JSON.stringify(world)),
    week: world.week,
    season: world.season,
    clubs: world.clubs.map(
      (c) =>
        `${c.id} ${c.name} [${c.city} r${c.region}] t${c.tier} p${c.prestige} w${c.wealth} s${c.squad.strength} ` +
        `${c.owner.type}/${c.owner.ambition} rivals=${c.rivals.join(',')} mgr=${c.managerId}`,
    ),
    foreign: world.foreign.map((l) => `${l.kind} ${l.name}: ${l.clubs.map((c) => `${c.id} ${c.name} mgr=${c.managerId}`).join('; ')}`),
    managers: world.managers.map(
      (m) =>
        `${m.id} ${m.name} (${m.nationality}, ${m.age}, ${m.background}) rep=${m.reputation} ` +
        `${m.status.kind}${m.status.kind === 'employed' ? '@' + m.status.post.clubId : ''}`,
    ),
    spells: world.spells.length,
    vacancies: world.vacancies.length,
    events: world.log.length,
  }
}
