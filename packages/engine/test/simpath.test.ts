/**
 * The population simulation must not move when the career loop changes.
 * These hashes cover every piece of state except the event log (new event
 * types may be added freely): clubs, tables, spells, managers and the RNG
 * state after two seasons. A change here means the AI world plays out
 * differently, so the validation targets in DESIGN.md have moved too.
 */
import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { runSeasons } from '../src/sim/advance.js'
import { fnv1a } from '../src/digest.js'
import type { World } from '../src/types.js'

function stateHash(world: World): string {
  return fnv1a(JSON.stringify({ ...world, log: [] }))
}

describe('the population simulation path', () => {
  it('produces the same state after two seasons of seed 1', () => {
    const world = createWorld(1)
    runSeasons(world, 2)
    expect(stateHash(world)).toMatchSnapshot()
  })

  it('produces the same state after one season of seed 7', () => {
    const world = createWorld(7)
    runSeasons(world, 1)
    expect(stateHash(world)).toMatchSnapshot()
  })
})
