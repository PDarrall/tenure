/**
 * The CM 01/02 formation set (DESIGN.md "Formations and tactics"). Each is
 * eleven slots; advantages come from the structure counted in three bands
 * (defence, midfield, attack) and by width, never from a lookup table.
 */
import type { Formation, FormationSlot, Position, Side } from '../types.js'

function slot(position: Position, side: Side): FormationSlot {
  return { position, side }
}
const gk = slot('GK', 'C')
const D = (side: Side) => slot('D', side)
const M = (side: Side) => slot('M', side)
const F = (side: Side) => slot('F', side)

export const FORMATIONS: Readonly<Record<Formation, readonly FormationSlot[]>> = {
  '4-4-2': [gk, D('L'), D('C'), D('C'), D('R'), M('L'), M('C'), M('C'), M('R'), F('C'), F('C')],
  '4-4-2 diamond': [gk, D('L'), D('C'), D('C'), D('R'), M('C'), M('C'), M('C'), M('C'), F('C'), F('C')],
  '4-3-3': [gk, D('L'), D('C'), D('C'), D('R'), M('C'), M('C'), M('C'), F('L'), F('C'), F('R')],
  '4-5-1': [gk, D('L'), D('C'), D('C'), D('R'), M('L'), M('C'), M('C'), M('C'), M('R'), F('C')],
  '4-2-4': [gk, D('L'), D('C'), D('C'), D('R'), M('C'), M('C'), F('L'), F('C'), F('C'), F('R')],
  '4-1-3-2': [gk, D('L'), D('C'), D('C'), D('R'), M('C'), M('L'), M('C'), M('R'), F('C'), F('C')],
  '4-3-1-2': [gk, D('L'), D('C'), D('C'), D('R'), M('C'), M('C'), M('C'), M('C'), F('C'), F('C')],
  '3-5-2': [gk, D('C'), D('C'), D('C'), M('L'), M('C'), M('C'), M('C'), M('R'), F('C'), F('C')],
  '3-4-3': [gk, D('C'), D('C'), D('C'), M('L'), M('C'), M('C'), M('R'), F('L'), F('C'), F('R')],
  '5-3-2': [gk, D('L'), D('C'), D('C'), D('C'), D('R'), M('C'), M('C'), M('C'), F('C'), F('C')],
  '5-4-1': [gk, D('L'), D('C'), D('C'), D('C'), D('R'), M('L'), M('C'), M('C'), M('R'), F('C')],
  '5-3-2 sweeper': [gk, D('C'), D('L'), D('C'), D('C'), D('R'), M('C'), M('C'), M('C'), F('C'), F('C')],
}

export const FORMATION_NAMES = Object.keys(FORMATIONS) as Formation[]

export function slotsOf(formation: Formation): readonly FormationSlot[] {
  return FORMATIONS[formation]
}

export interface Structure {
  defence: number
  midfield: number
  attack: number
  /** Slots on the left or right. */
  width: number
  /** Defenders on the left or right: a narrow back line is open on the flanks. */
  defenceWidth: number
}

/** Count a formation in bands and width. */
export function structureOf(formation: Formation): Structure {
  const slots = slotsOf(formation)
  const wide = (s: FormationSlot) => s.side === 'L' || s.side === 'R'
  return {
    defence: slots.filter((s) => s.position === 'D').length,
    midfield: slots.filter((s) => s.position === 'M').length,
    attack: slots.filter((s) => s.position === 'F').length,
    width: slots.filter(wide).length,
    defenceWidth: slots.filter((s) => s.position === 'D' && wide(s)).length,
  }
}
