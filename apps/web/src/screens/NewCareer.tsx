import { useState } from 'react'
import { tunables, type Background } from '@tenure/engine'
import { Chevron, Continue, Foot, FootSpace, Seg } from './ui.js'

const BACKGROUNDS: { key: Background; label: string; blurb: string }[] = [
  { key: 'ex-pro', label: 'Ex-pro', blurb: 'A name and the players’ trust; the boardroom is another matter.' },
  { key: 'coach', label: 'Coach', blurb: 'Tactically sharp, and nobody has heard of you.' },
  { key: 'analyst', label: 'Analyst', blurb: 'Deals and development; the dressing room will take convincing.' },
]

export type SaveState = 'none' | 'ok' | 'broken'

interface Props {
  onStart: (seed: number, name: string, background: Background) => void
  save: SaveState
  /** Who the save on this device belongs to, for the resume line. */
  saveLine: string | null
  onResume: () => void
  onExportBroken: () => void
  onDiscard: () => void
  onImport: (file: File) => void
  note: string | null
}

/** Name, background and seed, then the agent's offer (DESIGN.md "Job market", the start). */
export function NewCareer({ onStart, save, saveLine, onResume, onExportBroken, onDiscard, onImport, note }: Props) {
  const [name, setName] = useState('')
  const [background, setBackground] = useState<Background>('coach')
  const [seed, setSeed] = useState(String(tunables.DEFAULT_SEED))

  return (
    <main className="screen">
      <div className="scroll">
        <div className="stack g20" style={{ paddingTop: 18 }}>
          <div className="stack g10">
            <div className="title big">Tenure</div>
            <div className="body lead ink2" style={{ maxWidth: 320 }}>
              You start with no record. Clubs are episodes; the career is the game. The score is how long you lasted, what you earned, what you won and the players you made.
            </div>
          </div>
          <div className="stack g6">
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="off" />
          </div>
          <div className="stack g8">
            <div className="label">Background</div>
            <Seg options={BACKGROUNDS.map((b) => ({ key: b.key, label: b.label }))} value={background} onChange={setBackground} />
            <div className="caption">{BACKGROUNDS.find((b) => b.key === background)?.blurb}</div>
          </div>
          <div className="stack g8">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div className="stack g6" style={{ width: 150 }}>
                <label className="label" htmlFor="seed">
                  World seed
                </label>
                <input id="seed" className="field" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value)} autoComplete="off" />
              </div>
              <button type="button" className="btn" onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000)))}>
                Random
              </button>
            </div>
            <div className="caption">The same seed always builds the same world.</div>
          </div>
          {save === 'ok' && (
            <button type="button" className="link-row" onClick={onResume} data-testid="resume">
              <span className="stack g2">
                <span className="row-name">A career in progress on this device</span>
                {saveLine && <span className="caption">{saveLine}</span>}
              </span>
              <span className="go">
                Resume <Chevron dir="right" />
              </span>
            </button>
          )}
          {save === 'broken' && (
            <div className="link-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <span className="row-name">A save on this device could not be read</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn small" onClick={onExportBroken}>
                  Export it as a file
                </button>
                <button type="button" className="btn small" onClick={onDiscard}>
                  Delete it
                </button>
              </span>
            </div>
          )}
          <label className="link-row" style={{ cursor: 'pointer' }}>
            <span className="stack g2">
              <span className="row-name">Import a save</span>
              <span className="caption">A file exported from the career page.</span>
            </span>
            <span className="go">
              Choose file <Chevron dir="right" />
            </span>
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
          {note && <div className="note">{note}</div>}
        </div>
        <div className="tail" />
      </div>
      <Foot>
        <Continue next="Start the career" testId="start-career" onClick={() => onStart(Number(seed) || tunables.DEFAULT_SEED, name, background)} />
      </Foot>
      <FootSpace />
    </main>
  )
}
