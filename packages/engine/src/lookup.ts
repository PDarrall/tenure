import type { Club, ClubId, EuropeanOpponent, Manager, ManagerId, Player, Post, Spell, SpellId, World } from './types.js'

/** Ids are sequential from 1 and never removed, so position is id − 1. */
export function clubById(world: World, id: ClubId): Club {
  const club = world.clubs[id - 1]
  if (club && club.id === id) return club
  const found = world.clubs.find((c) => c.id === id)
  if (!found) throw new Error(`no home club ${id}`)
  return found
}

export function homeClub(world: World, id: ClubId): Club | undefined {
  const club = world.clubs[id - 1]
  if (club && club.id === id) return club
  return world.clubs.find((c) => c.id === id)
}

/** A generated European opponent in this season's field. */
export function europeanOpponentById(world: World, id: ClubId): EuropeanOpponent | undefined {
  return world.europeanOpponents.find((o) => o.id === id)
}

/** Any side by id: a home club's name, or a generated opponent's. */
export function anyClubName(world: World, id: ClubId): string {
  const home = homeClub(world, id)
  if (home) return home.name
  return europeanOpponentById(world, id)?.name ?? `Club ${id}`
}

export function managerById(world: World, id: ManagerId): Manager {
  const manager = world.managers[id - 1]
  if (manager && manager.id === id) return manager
  const found = world.managers.find((m) => m.id === id)
  if (!found) throw new Error(`no manager ${id}`)
  return found
}

export function spellById(world: World, id: SpellId): Spell {
  const spell = world.spells[id - 1]
  if (spell && spell.id === id) return spell
  const found = world.spells.find((s) => s.id === id)
  if (!found) throw new Error(`no spell ${id}`)
  return found
}

/** The manager's live spell, if employed. */
export function spellOf(world: World, manager: Manager): Spell | undefined {
  if (manager.status.kind !== 'employed') return undefined
  return spellById(world, manager.status.spellId)
}

/** The manager at a home club, if any. */
export function managerAt(world: World, club: Club): Manager | undefined {
  return club.managerId === null ? undefined : managerById(world, club.managerId)
}

export function postClubName(world: World, post: Post): string {
  return clubById(world, post.clubId).name
}

export function samePost(a: Post, b: Post): boolean {
  return a.kind === b.kind && a.clubId === b.clubId
}

/** A player by id, or undefined once his record has been dropped. */
export function playerById(world: World, id: number): Player | undefined {
  const p = world.players[id - 1]
  return p ?? undefined
}
