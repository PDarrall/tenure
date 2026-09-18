import { useState } from 'react'
import { autoPick, available, effectiveRating, playerById, slotsOf, squadOf, FORMATION_NAMES, type Formation, type FormationSlot, type Mentality, type Player, type PlayerId, type Style, type World } from '@tenure/engine'
import { withFormation, withMentality, withSelection, withStyle, type Session } from '../controller.js'
import { fitness, humanClub, isMine, positionLabel, rating, seasonLine } from './common.js'
import { Head, Seg, Star } from './ui.js'

/** The tactic as it will be at the next match: the world's, with this turn's changes on top. */
export function currentTactic(session: Session) {
  return { ...session.world.human!.tactic, ...(session.inputs.tactic ?? {}) }
}

export function currentSelection(session: Session) {
  return { ...session.world.human!.selection, ...(session.inputs.selection ?? {}) }
}

function slotLabel(slot: FormationSlot): string {
  return slot.position === 'GK' ? 'GK' : `${slot.position}${slot.side}`
}

const MENTALITIES: { key: Mentality; label: string }[] = [
  { key: 'defend', label: 'Defend' },
  { key: 'balanced', label: 'Balanced' },
  { key: 'attack', label: 'Attack' },
]
const STYLES: { key: Style; label: string; blurb: string }[] = [
  { key: 'possession', label: 'Possession', blurb: 'Fewer, better chances.' },
  { key: 'direct', label: 'Direct', blurb: 'Pace and aerial players.' },
  { key: 'counter', label: 'Counter', blurb: 'On the break.' },
  { key: 'pressing', label: 'Pressing', blurb: 'More pressure, more fouls, tired legs.' },
]

function formationBlurb(f: Formation): string {
  const [d, ...rest] = f.split(' ')[0]!.split('-').map(Number)
  const forwards = rest[rest.length - 1] ?? 0
  const mids = rest.slice(0, -1).reduce((s, n) => s + n, 0)
  const parts: string[] = []
  parts.push(forwards >= 3 ? 'Three up top' : forwards === 2 ? 'Two up top' : 'One up top')
  if ((d ?? 4) >= 5) parts.push('a back five concedes less')
  else if ((d ?? 4) === 3) parts.push('a back three, width from the wing-backs')
  if (mids >= 5) parts.push('and the midfield is won')
  else if (mids <= 2) parts.push('and the midfield can be lost to a five')
  return parts.join(', ') + '.'
}

/** Formation, mentality, style, the XI and bench with tap-to-swap, the captain, the assistant's pick (DESIGN.md "Formations and tactics"). */
export function Tactics({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const world: World = session.world
  const club = humanClub(world)
  const [picked, setPicked] = useState<PlayerId | null>(null)
  const tactic = currentTactic(session)
  const sub = `${tactic.formation} · ${tactic.mentality} · ${tactic.style}`

  const tacticControls = (
    <>
      <div className="stack g8">
        <div className="label">Formation</div>
        <div className="chips">
          {FORMATION_NAMES.map((f: Formation) => (
            <button key={f} type="button" className="chip" aria-pressed={tactic.formation === f} onClick={() => onChange(withFormation(session, f))} data-testid={`formation-${f}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="caption">{formationBlurb(tactic.formation)}</div>
      </div>
      <div className="stack g8">
        <div className="label">Mentality</div>
        <Seg options={MENTALITIES} value={tactic.mentality} onChange={(m) => onChange(withMentality(session, m))} testId={(k) => `tactic-${k}`} />
      </div>
      <div className="stack g8">
        <div className="label">Style</div>
        <Seg options={STYLES.map((s) => ({ key: s.key, label: s.label }))} value={tactic.style} onChange={(s) => onChange(withStyle(session, s))} testId={(k) => `style-${k}`} />
        <div className="caption">{STYLES.find((s) => s.key === tactic.style)?.blurb} All from the next match.</div>
      </div>
    </>
  )

  if (!club) {
    return (
      <>
        <Head eyebrow={seasonLine(world)} title="Tactics" sub={sub} />
        <div className="scroll" aria-label="Tactics">
          <div className="stack g16 pt2">
            {tacticControls}
            <div className="caption">No club, no side to pick. Your formation and style travel with you.</div>
          </div>
          <div className="tail" />
        </div>
      </>
    )
  }
  const selection = currentSelection(session)
  const slots = slotsOf(tactic.formation)
  const squad = squadOf(world, club)
  const assistant = autoPick(world, club, tactic.formation, 'results-first')
  const xi: (PlayerId | 0)[] = selection.autoPick ? [...assistant.xi] : slots.map((_, i) => selection.xi[i] ?? 0)
  const bench: (PlayerId | 0)[] = selection.autoPick ? [...assistant.bench] : Array.from({ length: 5 }, (_, i) => selection.bench[i] ?? 0)
  const inSide = new Set([...xi, ...bench].filter((id) => id !== 0))
  const rest = squad.filter((p) => !inSide.has(p.id))

  const place = (id: PlayerId): { list: 'xi' | 'bench' | 'rest'; index: number } => {
    const i = xi.indexOf(id)
    if (i >= 0) return { list: 'xi', index: i }
    const j = bench.indexOf(id)
    if (j >= 0) return { list: 'bench', index: j }
    return { list: 'rest', index: rest.findIndex((p) => p.id === id) }
  }

  /** Tap one player, then another: they swap places (slot, bench seat or the stands). */
  const tap = (id: PlayerId) => {
    if (picked === null) {
      setPicked(id)
      return
    }
    if (picked === id) {
      setPicked(null)
      return
    }
    const a = place(picked)
    const b = place(id)
    const nextXi = [...xi]
    const nextBench = [...bench]
    const set = (where: { list: 'xi' | 'bench' | 'rest'; index: number }, value: PlayerId) => {
      if (where.list === 'xi') nextXi[where.index] = value
      else if (where.list === 'bench') nextBench[where.index] = value
    }
    set(a, id)
    set(b, picked)
    setPicked(null)
    onChange(withSelection(session, { xi: nextXi.filter((x): x is PlayerId => x !== 0), bench: nextBench.filter((x): x is PlayerId => x !== 0), autoPick: false }))
  }

  const setPicker = (who: 'assistant' | 'mine') => {
    setPicked(null)
    if (who === 'assistant') onChange(withSelection(session, { autoPick: true }))
    else onChange(withSelection(session, { xi: [...assistant.xi], bench: [...assistant.bench], autoPick: false }))
  }

  const row = (id: PlayerId | 0, slot: FormationSlot | null, where: string) => {
    const p = id === 0 ? null : playerById(world, id)
    if (!p) {
      return (
        <div key={`${where}-empty-${slot ? slotLabel(slot) : ''}`} className="pitch-row">
          <span className="slot">{slot ? slotLabel(slot) : ''}</span>
          <span className="who ink3">nobody</span>
        </div>
      )
    }
    const eff = slot ? Math.round(effectiveRating(p, slot)) : rating(p)
    const fit = available(p)
    return (
      <div key={`${where}-${p.id}`} className={`pitch-row${picked === p.id ? ' picked' : ''}`}>
        <button type="button" className="who" onClick={() => tap(p.id)} aria-pressed={picked === p.id} data-testid={`pick-${where}`} data-player={p.id} style={{ minHeight: 44 }}>
          <span className="slot">{slot ? slotLabel(slot) : positionLabel(p)}</span>
          {isMine(world, p) && <Star />}
          <span className="nm">{p.name}</span>
          {slot && eff !== rating(p) && <span className="note">{eff} here</span>}
          {!fit && <span className="note">{fitness(p)}</span>}
        </button>
        {where === 'xi' && selection.captain === p.id && (
          <span className="cap on" aria-label="captain">
            C
          </span>
        )}
        <span className="rt">{rating(p)}</span>
      </div>
    )
  }

  return (
    <>
      <Head eyebrow={seasonLine(world)} title="Tactics" sub={sub} />
      <div className="scroll" aria-label="Tactics">
        <div className="stack g16 pt2">
          {tacticControls}
          <div className="stack">
            <div className="between center" style={{ padding: '4px 0 6px' }}>
              <div className="label">Starting XI</div>
              <div style={{ width: 150 }}>
                <Seg small options={[{ key: 'assistant', label: 'Assistant' }, { key: 'mine', label: 'Mine' }]} value={selection.autoPick ? 'assistant' : 'mine'} onChange={setPicker} testId={(k) => `picker-${k}`} />
              </div>
            </div>
            {slots.map((slot, i) => row(xi[i] ?? 0, slot, 'xi'))}
          </div>
          <div className="stack">
            <div className="label" style={{ padding: '2px 0 4px' }}>
              Bench
            </div>
            {bench.map((id) => row(id, null, 'bench'))}
          </div>
          {rest.length > 0 && (
            <div className="stack">
              <div className="label" style={{ padding: '2px 0 4px' }}>
                Not in the squad
              </div>
              {rest.map((p: Player) => row(p.id, null, 'rest'))}
            </div>
          )}
          <div className="caption" style={{ paddingBottom: 8 }}>
            {picked === null ? 'Tap two players to swap them. Injured and banned players are replaced by the assistant at kick-off. The captain is chosen on his page.' : 'Now tap the player to swap him with.'}
            {selection.autoPick ? ' The assistant picks the side for this shape until you take it over.' : ''}
          </div>
        </div>
      </div>
    </>
  )
}
