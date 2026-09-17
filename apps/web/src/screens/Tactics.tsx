import { useState } from 'react'
import { autoPick, available, effectiveRating, playerById, slotsOf, squadOf, FORMATION_NAMES, type Formation, type FormationSlot, type Mentality, type Player, type PlayerId, type Style, type World } from '@tenure/engine'
import { withFormation, withMentality, withSelection, withStyle, type Session } from '../controller.js'
import { fitness, humanClub, isMine, positionLabel, rating } from './common.js'

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

/** Formation, mentality, style, the XI and bench with tap-to-swap, the captain, the assistant's pick (DESIGN.md "Formations and tactics"). */
export function Tactics({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const world: World = session.world
  const club = humanClub(world)
  const [picked, setPicked] = useState<PlayerId | null>(null)
  if (!club) {
    return (
      <section aria-label="Tactics">
        <p className="muted">No club, no side to pick. Your formation and style still travel with you.</p>
        <TacticButtons session={session} onChange={onChange} />
      </section>
    )
  }
  const tactic = currentTactic(session)
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

  const takeAssistantPick = () => {
    setPicked(null)
    onChange(withSelection(session, { xi: [...assistant.xi], bench: [...assistant.bench], autoPick: false }))
  }
  const toggleAssistant = () => {
    setPicked(null)
    if (selection.autoPick) onChange(withSelection(session, { xi: [...assistant.xi], bench: [...assistant.bench], autoPick: false }))
    else onChange(withSelection(session, { autoPick: true }))
  }

  const row = (id: PlayerId | 0, slot: FormationSlot | null, where: string) => {
    const p = id === 0 ? null : playerById(world, id)
    if (!p) {
      return (
        <li key={`${where}-empty-${slot ? slotLabel(slot) : ''}`} className="item">
          <span className="muted">{slot ? slotLabel(slot) : where}: nobody</span>
        </li>
      )
    }
    const eff = slot ? Math.round(effectiveRating(p, slot)) : rating(p)
    const fit = available(p)
    return (
      <li key={`${where}-${p.id}`} className="item">
        <button className={picked === p.id ? 'selected' : ''} onClick={() => tap(p.id)} aria-pressed={picked === p.id} data-testid={`pick-${where}`} data-player={p.id}>
          <span>
            {slot ? `${slotLabel(slot)} · ` : ''}
            {isMine(world, p) ? '★ ' : ''}
            {p.name} · {positionLabel(p)} {rating(p)}
            {slot && eff !== rating(p) ? ` (${eff} here)` : ''}
            {!fit ? ` · ${fitness(p)}` : ''}
          </span>
        </button>
        {where === 'xi' && (
          <button className={selection.captain === p.id ? 'selected' : ''} onClick={() => onChange(withSelection(session, { captain: p.id, autoPick: selection.autoPick }))} aria-pressed={selection.captain === p.id} title="Captain">
            <span>C</span>
          </button>
        )}
      </li>
    )
  }

  return (
    <section aria-label="Tactics">
      <TacticButtons session={session} onChange={onChange} />
      <h3>Side</h3>
      <div className="row">
        <button className={selection.autoPick ? 'selected' : ''} onClick={toggleAssistant} aria-pressed={selection.autoPick}>
          <span>Assistant picks</span>
        </button>
        {!selection.autoPick && <button onClick={takeAssistantPick}>Auto-pick now</button>}
      </div>
      <p className="muted">
        {selection.autoPick ? "The assistant's side for this shape. Tap two players to swap them and take the sheet over." : picked === null ? 'Tap a player, then another, to swap them. Injured and banned players are replaced by the assistant at kick-off.' : 'Now tap the player to swap him with.'}
      </p>
      <h4>Starting XI</h4>
      <ul className="plain">{slots.map((slot, i) => row(xi[i] ?? 0, slot, 'xi'))}</ul>
      <h4>Bench</h4>
      <ul className="plain">{bench.map((id) => row(id, null, 'bench'))}</ul>
      <h4>Not in the squad</h4>
      <ul className="plain">{rest.map((p: Player) => row(p.id, null, 'rest'))}</ul>
    </section>
  )
}

function TacticButtons({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const tactic = currentTactic(session)
  return (
    <>
      <h3>Formation</h3>
      <div className="row">
        {FORMATION_NAMES.map((f: Formation) => (
          <button key={f} className={tactic.formation === f ? 'selected' : ''} onClick={() => onChange(withFormation(session, f))} aria-pressed={tactic.formation === f}>
            <span>{f}</span>
          </button>
        ))}
      </div>
      <h3>Mentality</h3>
      <div className="row">
        {(['defend', 'balanced', 'attack'] as Mentality[]).map((m) => (
          <button key={m} className={tactic.mentality === m ? 'selected' : ''} onClick={() => onChange(withMentality(session, m))} aria-pressed={tactic.mentality === m}>
            <span>{m}</span>
          </button>
        ))}
      </div>
      <h3>Style</h3>
      <div className="row">
        {(['possession', 'direct', 'counter', 'pressing'] as Style[]).map((st) => (
          <button key={st} className={tactic.style === st ? 'selected' : ''} onClick={() => onChange(withStyle(session, st))} aria-pressed={tactic.style === st}>
            <span>{st}</span>
          </button>
        ))}
      </div>
      <p className="muted">Midfielders win pressure; forwards against defenders make chances; width opens a narrow back line; a back five concedes less. Attack opens the game up and leans on pressure; defend closes it. Possession: fewer, better chances. Direct: pace and aerial players. Counter: on the break. Pressing: more pressure, more fouls, tired legs. All from the next match.</p>
    </>
  )
}
