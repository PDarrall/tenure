import { useState } from 'react'
import { tunables, type Background } from '@tenure/engine'

const BACKGROUNDS: { key: Background; label: string; blurb: string }[] = [
  { key: 'ex-pro', label: 'Ex-pro', blurb: 'A name and the players’ trust; the boardroom is another matter.' },
  { key: 'coach', label: 'Coach', blurb: 'Tactically sharp and nobody has heard of you.' },
  { key: 'analyst', label: 'Analyst', blurb: 'Deals and development; the dressing room will take convincing.' },
]

export type SaveState = 'none' | 'ok' | 'broken'

interface Props {
  onStart: (seed: number, name: string, background: Background) => void
  save: SaveState
  onResume: () => void
  onExportBroken: () => void
  onDiscard: () => void
}

export function NewCareer({ onStart, save, onResume, onExportBroken, onDiscard }: Props) {
  const [name, setName] = useState('')
  const [background, setBackground] = useState<Background>('coach')
  const [seed, setSeed] = useState(String(tunables.DEFAULT_SEED))

  return (
    <main>
      <h1>Tenure</h1>
      <p>A football management game about surviving a career. You start with no record and no job.</p>
      {save === 'ok' && (
        <p className="notice">
          There is a career in progress on this device. <button onClick={onResume}>Resume it</button>
        </p>
      )}
      {save === 'broken' && (
        <p className="notice">
          There is a save on this device that could not be read. <button onClick={onExportBroken}>Export it as a file</button>{' '}
          <button onClick={onDiscard}>Delete it</button>
        </p>
      )}
      <label htmlFor="name">Your name</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="off" />
      <label>Background</label>
      <div>
        {BACKGROUNDS.map((b) => (
          <button key={b.key} className={background === b.key ? 'selected' : ''} onClick={() => setBackground(b.key)} aria-pressed={background === b.key}>
            <span>{b.label}</span>
          </button>
        ))}
      </div>
      <p className="muted">{BACKGROUNDS.find((b) => b.key === background)?.blurb}</p>
      <label htmlFor="seed">World seed</label>
      <div className="row">
        <input id="seed" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value)} style={{ width: '10rem' }} />
        <button onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000)))}>Random</button>
      </div>
      <p className="muted">The same seed always builds the same world.</p>
      <p>
        <button className="primary" onClick={() => onStart(Number(seed) || tunables.DEFAULT_SEED, name, background)}>
          Start the career
        </button>
      </p>
    </main>
  )
}
