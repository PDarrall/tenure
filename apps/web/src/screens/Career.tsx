import { useState } from 'react'
import { careerSummary, competitionName, ordinal, type World } from '@tenure/engine'
import { withResign, withRetire, type Session } from '../controller.js'
import { bandLine, player, seasonLine } from './common.js'
import { Head, SectionLabel, Star, Stat } from './ui.js'

const BACKGROUND: Record<string, string> = { 'ex-pro': 'Ex-pro', coach: 'Coach', analyst: 'Analyst' }
const TAG_NAMES: Record<string, string> = {
  'in-demand': 'In demand',
  promotion: 'Promotion man',
  firefighter: 'Firefighter',
  loyal: 'Loyal',
  mercenary: 'Mercenary',
  youth: 'Youth developer',
  cup: 'Cup manager',
  survivor: 'Survivor',
}

function tagName(tag: string): string {
  return TAG_NAMES[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, ' ')
}

function endText(reason: string | null): string {
  if (!reason) return 'still there'
  return reason.replace(/-/g, ' ')
}

/** The career page body: the four score lines, spells, honours, tags, players made (DESIGN.md "Scoring"). */
export function CareerBody({ world }: { world: World }) {
  const s = careerSummary(world)
  return (
    <>
      <div className="stat-grid">
        <Stat value={s.score.games} label="Games" />
        <Stat value={`£${s.score.earnings}m`} label="Earned" />
        <Stat value={s.score.trophyPoints} label="Trophy points" />
        <Stat value={s.score.playersMade} label="Players made" />
      </div>
      <div className="legacy-row">
        <div className="label">Legacy</div>
        <span className="h bold">{s.score.legacy}</span>
      </div>
      <SectionLabel>Spells</SectionLabel>
      {s.spells.length === 0 && <div className="sub ink3" style={{ padding: '4px 0 6px' }}>No clubs yet.</div>}
      {[...s.spells].reverse().map((sp) => (
        <div className="list-row" key={sp.spellId}>
          <div className="between">
            <span className="row-name">{sp.club}</span>
            <span className="caption shrink0">{sp.where.charAt(0).toUpperCase() + sp.where.slice(1)}</span>
          </div>
          <div className="caption ink2">
            Season {sp.fromSeason}
            {sp.toSeason === null ? ' to now' : sp.toSeason !== sp.fromSeason ? ` to ${sp.toSeason}` : ''}
            {sp.finishes.length ? ` · ${sp.finishes.map((f) => ordinal(f)).join(', ')}${sp.toSeason === null ? ' so far' : ''}` : ''} · {endText(sp.endReason)}
          </div>
        </div>
      ))}
      <SectionLabel>Honours</SectionLabel>
      {s.honours.length === 0 && <div className="sub ink3" style={{ padding: '4px 0 6px' }}>None yet.</div>}
      {s.honours.map((h, i) => (
        <div className="body" key={i} style={{ padding: '4px 0 6px' }}>
          {h.tier ? `Tier ${h.tier} ` : ''}
          {competitionName(h.competition)}, season {h.season}
        </div>
      ))}
      <SectionLabel>Tags</SectionLabel>
      {s.tags.length === 0 && <div className="sub ink3" style={{ padding: '4px 0 6px' }}>None yet. Tags are what the market calls you.</div>}
      {s.tags.map((t) => (
        <div className="body" key={t.tag} style={{ padding: '4px 0 6px' }}>
          <span className="strong">{tagName(t.tag)}</span> <span className="ink3">— expires season {t.expiresSeason}.</span>
        </div>
      ))}
      <SectionLabel>Players made</SectionLabel>
      {s.playersMade.length === 0 && <div className="sub ink3" style={{ padding: '4px 0 6px' }}>Nobody yet. Sign, debut or promote a player and he is yours for good.</div>}
      {s.playersMade.map((m) => (
        <div className="list-row" key={m.playerId}>
          <div className="between">
            <span className="name-cell">
              <Star />
              <span className="row-name">{m.name}</span>
              <span className="caption">{m.position}</span>
            </span>
            <span className="row-name bold shrink0">
              {m.points} <span className="caption" style={{ fontSize: 12 }}>pts</span>
            </span>
          </div>
          <div className="caption ink2">
            {m.circumstance.charAt(0).toUpperCase() + m.circumstance.slice(1)} at {m.club}, season {m.season} · {Math.round(m.ratingThen)} then, {Math.round(m.ratingNow)} now · {m.now}
          </div>
        </div>
      ))}
    </>
  )
}

interface Props {
  session: Session
  onChange: (s: Session) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
}

/** The career tab: the page, then what you can do with the career itself. */
export function Career({ session, onChange, onExport, onImport, onReset }: Props) {
  const world = session.world
  const me = player(world)
  const s = careerSummary(world)
  const [confirm, setConfirm] = useState<'resign' | 'retire' | 'reset' | null>(null)
  const employed = me.status.kind === 'employed'
  return (
    <>
      <Head eyebrow={seasonLine(world)} title={`${s.name}, ${s.age}`} sub={`${BACKGROUND[s.background] ?? s.background} · ${bandLine(s.reputation)} · ${s.score.games} games`} />
      <div className="scroll" aria-label="Career page">
        <CareerBody world={world} />
        <SectionLabel>This career</SectionLabel>
        <div className="stack g8" style={{ padding: '6px 0 16px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn small" onClick={onExport} data-testid="export-save">
              Export save
            </button>
            <label className="btn small" style={{ cursor: 'pointer' }}>
              Import save
              <input
                type="file"
                className="hidden-input"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onImport(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <div className="caption">The game saves itself on this device every turn. Export a file to keep it or move it.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 6 }}>
            {employed &&
              (confirm === 'resign' ? (
                <>
                  <button type="button" className="btn small" onClick={() => { onChange(withResign(session, true)); setConfirm(null) }} data-testid="resign-confirm">
                    Yes, resign when I continue
                  </button>
                  <button type="button" className="btn small" onClick={() => setConfirm(null)}>
                    Stay
                  </button>
                </>
              ) : session.inputs.resign ? (
                <button type="button" className="btn small" onClick={() => onChange(withResign(session, false))}>
                  Cancel resignation
                </button>
              ) : (
                <button type="button" className="btn small" onClick={() => setConfirm('resign')} data-testid="resign">
                  Resign
                </button>
              ))}
            {confirm === 'retire' ? (
              <>
                <button type="button" className="btn small" onClick={() => { onChange(withRetire(session, true)); setConfirm(null) }} data-testid="retire-confirm">
                  Yes, retire and bank the score
                </button>
                <button type="button" className="btn small" onClick={() => setConfirm(null)}>
                  Carry on
                </button>
              </>
            ) : session.inputs.retire ? (
              <button type="button" className="btn small" onClick={() => onChange(withRetire(session, false))}>
                Cancel retirement
              </button>
            ) : (
              <button type="button" className="btn small" onClick={() => setConfirm('retire')} data-testid="retire">
                Retire
              </button>
            )}
            {confirm === 'reset' ? (
              <>
                <button type="button" className="btn small" onClick={onReset} data-testid="reset-confirm">
                  Yes, delete this career
                </button>
                <button type="button" className="btn small" onClick={() => setConfirm(null)}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" className="btn small" onClick={() => setConfirm('reset')} data-testid="reset">
                Delete this career
              </button>
            )}
          </div>
          {session.inputs.resign && <div className="caption">You resign when you continue. The board will not stand in your way.</div>}
          {session.inputs.retire && <div className="caption">You retire when you continue: the career ends and the score is banked.</div>}
        </div>
        <div className="tail" />
      </div>
    </>
  )
}
