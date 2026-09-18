import { useState } from 'react'
import { seasonFixtures, seasonWeek, spellOf, tableFor, type FixtureView, type Tier, type World } from '@tenure/engine'
import { humanClub, ordinalOf, player, seasonLine, standing, weekLabel } from './common.js'
import { Form, Head, Label, Seg, SectionLabel } from './ui.js'

function letterClass(r: string | null): string {
  return r === 'W' ? 'ink' : r === 'D' ? 'ink2' : 'ink3'
}

function FixtureRow({ f, kind }: { f: FixtureView; kind: 'next' | 'played' | 'ahead' }) {
  const venue = <span className="venue"> ({f.home ? 'H' : 'A'})</span>
  const round = f.competition === 'league' ? '' : ` · round ${f.round}`
  const pens = f.shootoutWon === null ? '' : f.shootoutWon ? ' pens' : ' pens'
  return (
    <div className={`fixture-row ${kind}`} data-testid="fixture-row">
      {kind === 'next' ? (
        <span className="w58 label accent shrink0">Next</span>
      ) : kind === 'played' ? (
        <span className="result">
          <span className={`letter ${letterClass(f.result)}`}>{f.result}</span>
          <span className="score">
            {f.goalsFor}–{f.goalsAgainst}
            {pens}
          </span>
        </span>
      ) : (
        <span className="w58 caption shrink0">—</span>
      )}
      <span className="who">
        {f.opponent}
        {venue}
        {round ? <span className="venue">{round}</span> : null}
      </span>
      <span className="when">{weekLabel(f.seasonWeek)}</span>
    </div>
  )
}

/** The season's fixtures and results, and the table (DESIGN.md "Fixtures"). */
export function Fixtures({ world }: { world: World }) {
  const [view, setView] = useState<'fixtures' | 'table'>('fixtures')
  const club = humanClub(world)
  if (!club) {
    return (
      <>
        <Head eyebrow={seasonLine(world)} title="Fixtures" sub="No club, no fixtures." />
        <div className="scroll" aria-label="Fixtures" />
      </>
    )
  }
  const { pos, of } = standing(world, club)
  const row = tableFor(world, club.tier).find((r) => r.clubId === club.id)
  const sw = seasonWeek(world.week)
  const groups = seasonFixtures(world)
  return (
    <>
      <Head eyebrow={seasonLine(world)} title="Fixtures" sub={`${ordinalOf(pos)} of ${of} · ${row?.points ?? 0} points from ${row?.played ?? 0}`} />
      <div className="scroll" aria-label="Fixtures">
        <div className="pt2">
          <Seg small options={[{ key: 'fixtures', label: 'Fixtures' }, { key: 'table', label: 'Table' }]} value={view} onChange={setView} testId={(k) => `view-${k}`} />
        </div>
        {view === 'fixtures' &&
          groups.map((g) => {
            const played = g.fixtures.filter((f) => f.played).sort((a, b) => b.seasonWeek - a.seasonWeek || b.round - a.round)
            const upcoming = g.fixtures.filter((f) => !f.played).sort((a, b) => a.seasonWeek - b.seasonWeek || a.round - b.round)
            const next = upcoming[0]
            const ahead = upcoming.slice(1)
            return (
              <div key={g.competition}>
                <SectionLabel>
                  {g.label}
                  {g.competition === 'league' ? ` · tier ${club.tier}` : g.status ? ` · ${g.status}` : ''}
                </SectionLabel>
                {g.fixtures.length === 0 && <div className="sub ink3" style={{ padding: '10px 0 16px' }}>{g.competition === 'leagueCup' ? 'Not entered at this tier.' : 'No ties yet.'}</div>}
                {next && <FixtureRow f={next} kind="next" />}
                {played.map((f) => (
                  <FixtureRow key={`${f.round}-${f.opponentId}-${f.seasonWeek}`} f={f} kind="played" />
                ))}
                {ahead.length > 0 && g.competition === 'league' && (
                  <>
                    <Label className="section-label" >Ahead</Label>
                    {ahead.map((f) => (
                      <FixtureRow key={`${f.round}-${f.opponentId}-${f.seasonWeek}`} f={f} kind="ahead" />
                    ))}
                  </>
                )}
              </div>
            )
          })}
        {view === 'table' && <Table world={world} tier={club.tier} mine={club.id} after={sw} />}
        <div className="tail" />
      </div>
    </>
  )
}

/** The division, your club pinned to the top. */
export function Table({ world, tier, mine, after, label }: { world: World; tier: Tier; mine: number | null; after: number; label?: string }) {
  const rows = tableFor(world, tier)
  const me = rows.findIndex((r) => r.clubId === mine)
  const pinned = me >= 0 ? [rows[me]!] : []
  const formOf = (clubId: number) => world.clubs[clubId - 1]?.form.slice(-5) ?? []
  const render = (r: (typeof rows)[number], i: number, pin: boolean) => (
    <div className={`table-row${r.clubId === mine ? ' me' : ''}`} key={`${pin ? 'pin-' : ''}${r.clubId}`} data-testid="table-row">
      <span className="w22 pos">{i + 1}</span>
      <span className="grow">{world.clubs[r.clubId - 1]?.name}</span>
      <span className="w26 num">{r.played}</span>
      <span className="w34 num">{r.goalsFor - r.goalsAgainst > 0 ? `+${r.goalsFor - r.goalsAgainst}` : r.goalsFor - r.goalsAgainst}</span>
      <span className="w34 pts">{r.points}</span>
      <span className="w54">
        <Form form={formOf(r.clubId)} />
      </span>
    </div>
  )
  return (
    <div className="stack">
      <div className="label" style={{ padding: '14px 0 0' }}>
        {label ?? `Tier ${tier} · after ${weekLabel(after).toLowerCase()}`}
      </div>
      <div className="table-head">
        <span className="w22" style={{ textAlign: 'left' }}>
          #
        </span>
        <span className="grow">Club</span>
        <span className="w26">P</span>
        <span className="w34">GD</span>
        <span className="w34">Pts</span>
        <span className="w54">Form</span>
      </div>
      {pinned.map((r) => render(r, me, true))}
      {rows.map((r, i) => render(r, i, false))}
    </div>
  )
}

export function tierOf(world: World): Tier | null {
  const me = player(world)
  const spell = spellOf(world, me)
  return spell && spell.post.kind === 'home' ? (world.clubs[spell.post.clubId - 1]?.tier ?? null) : null
}
