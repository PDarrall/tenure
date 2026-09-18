import { T } from '../tunables.js'
import type { Club, Tier, World } from '../types.js'

/** Index into REPUTATION_BANDS for a reputation value. */
export function bandIndex(reputation: number): number {
  let index = 0
  for (let i = 0; i < T.REPUTATION_BANDS.length; i++) {
    if (reputation >= (T.REPUTATION_BANDS[i] as { min: number }).min) index = i
  }
  return index
}

/** Band a home club recruits from: its tier's band, or the elite band for elite clubs. */
export function clubBandIndex(world: World, club: Club): number {
  if (club.tier === 1 && isElite(world, club)) {
    return T.REPUTATION_BANDS.findIndex((b) => b.elite)
  }
  return T.REPUTATION_BANDS.findIndex((b) => !b.elite && b.tiers.includes(club.tier))
}

/** Tier-1 clubs in the top ELITE_PRESTIGE_RANK by prestige. */
export function isElite(world: World, club: Club): boolean {
  if (club.tier !== 1) return false
  const ranked = world.clubs
    .filter((c) => c.tier === 1)
    .sort((a, b) => b.prestige - a.prestige || a.id - b.id)
    .slice(0, T.ELITE_PRESTIGE_RANK)
  return ranked.some((c) => c.id === club.id)
}

/** The home tiers a reputation covers outright. */
export function tiersForReputation(reputation: number): readonly Tier[] {
  return (T.REPUTATION_BANDS[bandIndex(reputation)] as { tiers: readonly Tier[] }).tiers
}
