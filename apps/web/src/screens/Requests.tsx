import { useState } from 'react'
import { renderText, requestCard, requestOptions, seasonWeek, shortlistRows, squadOf, tunables, type PlayerId, type Position, type Request, type RequestOffer } from '@tenure/engine'
import { requested, withRequest, withoutRequest, type Session } from '../controller.js'
import { humanClub, positionLabel, seasonLine, weekLabel } from './common.js'
import { BetOptions, Card, Chevron, SectionLabel, Seg } from './ui.js'

type Group = Request['to']

const GROUPS: { key: Group; label: string }[] = [
  { key: 'board', label: 'The board' },
  { key: 'director', label: 'The director' },
  { key: 'player', label: 'Players' },
]

function fromLabel(from: string): string {
  return from.charAt(0).toUpperCase() + from.slice(1)
}

/** Why an ask is off, in a few words, from the text bank. */
function whyText(why: string | undefined): string {
  if (!why) return 'not now'
  const text = renderText('requests', why, {}, 0)
  return text.startsWith('[') ? 'not now' : text
}

interface Props {
  session: Session
  onChange: (s: Session) => void
  onBack: () => void
}

/**
 * Requests on their own screen (DESIGN.md "Requests"): the full list grouped
 * by the board, the director and the players, each row with its likelihood,
 * cost and effect; a tap opens the decision card, the ask against holding.
 */
export function Requests({ session, onChange, onBack }: Props) {
  const world = session.world
  const club = humanClub(world)
  const [open, setOpen] = useState<RequestOffer | null>(null)
  const [playerId, setPlayerId] = useState<PlayerId | null>(null)
  const [years, setYears] = useState<number>(tunables.REQUEST_NEW_CONTRACT_YEARS[1] as number)
  const [profile, setProfile] = useState<{ position: Position | 'any'; maxAge: number | null }>({ position: 'any', maxAge: null })
  const back = (label: string, onClick: () => void) => (
    <button type="button" className="text-btn" onClick={onClick} style={{ fontSize: 14 }} data-testid="requests-back">
      <Chevron dir="left" />
      {label}
    </button>
  )
  if (!club) {
    return (
      <>
        <div className="head">
          {back('Career', onBack)}
          <h1 className="title">Requests</h1>
          <div className="sub">No club, nobody to ask.</div>
        </div>
        <div className="scroll" aria-label="Requests" />
      </>
    )
  }
  const rows = requestOptions(world)
  const queued = session.inputs.requests ?? []

  if (open) {
    const needsPlayer = open.needsPlayer
    const candidates = open.ask === 'named' ? shortlistRows(world).map((r) => ({ id: r.playerId, name: `${r.name} · ${r.club}` })) : squadOf(world, club).map((p) => ({ id: p.id, name: `${p.name} · ${positionLabel(p)} ${Math.round(p.rating)}` }))
    const chosen = needsPlayer ? (playerId ?? candidates[0]?.id ?? null) : null
    const req: Request = {
      to: open.to,
      ask: open.ask,
      ...(chosen !== null ? { playerId: chosen } : {}),
      ...(open.ask === 'newContract' ? { years } : {}),
      ...(open.ask === 'profile' ? { profile: { ...(profile.position === 'any' ? {} : { position: profile.position }), ...(profile.maxAge === null ? {} : { maxAge: profile.maxAge }) } } : {}),
    }
    const card = requestCard(world, req)
    const on = requested(session, req)
    const available = card !== null && card.likelihood.available && (!needsPlayer || chosen !== null)
    const choose = (key: string) => {
      if (key === 'ask') {
        if (available) onChange(withRequest(session, req))
      } else onChange(withoutRequest(session, req))
    }
    return (
      <>
        <div className="head">
          {back('Requests', () => setOpen(null))}
          <h1 className="title">{open.label}</h1>
          <div className="sub">
            {fromLabel(open.to)} · {card && card.likelihood.available ? card.likelihood.words : whyText(card?.likelihood.why)}
          </div>
        </div>
        <div className="scroll" aria-label="Request">
          <div className="stack g10 pt2">
            {card && (
              <Card label={`${fromLabel(open.to)} · a bet`} testId="request-card">
                <div className="h">{card.title}</div>
                <div className="sub">{card.body}</div>
                {needsPlayer && (
                  <div className="field-row">
                    {candidates.length === 0 ? (
                      <span className="caption">{open.ask === 'named' ? 'Nobody on the shortlist: search and shortlist under Squad first.' : 'Nobody to ask.'}</span>
                    ) : (
                      <select aria-label="Player" value={chosen ?? ''} onChange={(e) => setPlayerId(Number(e.target.value))} data-testid="request-player">
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {open.ask === 'newContract' && (
                  <Seg small options={tunables.REQUEST_NEW_CONTRACT_YEARS.map((y) => ({ key: String(y), label: `${y} year${y === 1 ? '' : 's'}` }))} value={String(years)} onChange={(k) => setYears(Number(k))} testId={(k) => `years-${k}`} />
                )}
                {open.ask === 'profile' && (
                  <div className="field-row">
                    <Seg small options={[{ key: 'any', label: 'Any' }, { key: 'GK', label: 'GK' }, { key: 'D', label: 'D' }, { key: 'M', label: 'M' }, { key: 'F', label: 'F' }]} value={profile.position} onChange={(k) => setProfile({ ...profile, position: k as Position | 'any' })} testId={(k) => `profile-${k}`} />
                    <select aria-label="Age at most" value={profile.maxAge ?? ''} onChange={(e) => setProfile({ ...profile, maxAge: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">any age</option>
                      {[21, 24, 27, 30].map((a) => (
                        <option key={a} value={a}>
                          under {a + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <BetOptions options={card.options.map((o) => (o.key === 'ask' && !available ? { ...o, detail: whyText(card.likelihood.why) } : o))} value={on ? 'ask' : 'hold'} defaultKey={card.defaultKey} onChoose={choose} testId={(key) => `request-${key}`} />
                <div className="caption" data-testid="request-state">
                  {on ? 'Asked when you continue.' : available ? 'Continue holds unless you ask.' : `Not now: ${whyText(card.likelihood.why)}.`}
                </div>
              </Card>
            )}
          </div>
          <div className="tail" />
        </div>
      </>
    )
  }

  const sw = seasonWeek(world.week)
  return (
    <>
      <div className="head">
        {back('Career', onBack)}
        <h1 className="title">Requests</h1>
        <div className="sub">
          {seasonLine(world)} · {queued.length ? `${queued.length} queued for the turn` : 'each ask a bet'} · the board hear one a month
        </div>
      </div>
      <div className="scroll" aria-label="Requests">
        {GROUPS.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <SectionLabel>{g.label}</SectionLabel>
            {rows
              .filter((r) => r.to === g.key)
              .map((row) => {
                const asked = queued.filter((q) => q.to === row.to && q.ask === row.ask)
                const like = row.likelihood
                return (
                  <button type="button" className="list-row req-row" key={row.ask} onClick={() => { setOpen(row); setPlayerId(null) }} data-testid={`req-${row.ask}`} data-likely={like.words} data-available={like.available ? 'true' : 'false'}>
                    <div className="between center">
                      <span className="row-name">{row.label}</span>
                      <span className={`chip small ${like.available && like.words === 'gamble' ? 'chip-gamble' : ''}`}>{like.available ? like.words : whyText(like.why)}</span>
                    </div>
                    <div className="caption">
                      <span className="strong">Cost</span> {row.cost} · <span className="strong">Effect</span> {row.effect}
                    </div>
                    {asked.length > 0 && <div className="caption ink">Asked when you continue{asked.some((q) => q.playerId !== undefined) ? ` · ${asked.map((q) => world.players[(q.playerId ?? 0) - 1]?.name ?? 'a player').join(', ')}` : ''}.</div>}
                  </button>
                )
              })}
          </section>
        ))}
        <div className="caption" style={{ padding: '12px 0' }}>
          {weekLabel(sw)}. A refusal costs credit and locks the ask for three months; the third in a season makes you difficult.
        </div>
        <div className="tail" />
      </div>
    </>
  )
}
