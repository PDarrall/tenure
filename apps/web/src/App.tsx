import { useEffect, useState } from 'react'
import type { Background } from '@tenure/engine'
import './styles.css'
import { newSession, nextWeek, parseSave, serialize, sessionFromWorld, type Session } from './controller.js'
import { clearSave, downloadText, loadSave, storeSave } from './storage.js'
import { NewCareer } from './screens/NewCareer.js'
import { Game } from './screens/Game.js'
import { CareerOver } from './screens/CareerOver.js'

type Screen = { kind: 'new' } | { kind: 'game'; session: Session }

function restore(): Session | null {
  const text = loadSave()
  if (!text) return null
  try {
    return sessionFromWorld(parseSave(text))
  } catch {
    return null
  }
}

export function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const restored = restore()
    return restored ? { kind: 'game', session: restored } : { kind: 'new' }
  })
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [hasSave, setHasSave] = useState<boolean>(() => loadSave() !== null)

  useEffect(() => {
    if (screen.kind !== 'game') return
    const ok = storeSave(serialize(screen.session.world))
    setSaveNote(ok ? null : 'Autosave failed on this device; export a file to keep your career.')
    setHasSave(ok)
  }, [screen.kind === 'game' ? screen.session.turn : -1, screen.kind])

  const start = (seed: number, name: string, background: Background) => {
    setScreen({ kind: 'game', session: newSession(seed, name, background) })
  }

  const exportSave = () => {
    if (screen.kind !== 'game') return
    const me = screen.session.world.managers[screen.session.world.human!.managerId - 1]!
    const safe = me.name.replace(/[^\w-]+/g, '_')
    downloadText(`tenure-${safe}-season-${screen.session.world.season}.json`, serialize(screen.session.world))
  }

  const importSave = async (file: File) => {
    try {
      const world = parseSave(await file.text())
      setScreen({ kind: 'game', session: sessionFromWorld(world) })
      setSaveNote(null)
    } catch (err) {
      setSaveNote(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const reset = () => {
    clearSave()
    setHasSave(false)
    setScreen({ kind: 'new' })
  }

  if (screen.kind === 'new') {
    return (
      <>
        <NewCareer onStart={start} hasSave={hasSave} onResume={() => { const s = restore(); if (s) setScreen({ kind: 'game', session: s }) }} />
        <main>
          <h2>Import a save</h2>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importSave(file)
            }}
          />
          {saveNote && <p className="notice">{saveNote}</p>}
        </main>
      </>
    )
  }

  const me = screen.session.world.managers[screen.session.world.human!.managerId - 1]!
  if (me.status.kind === 'retired') {
    return <CareerOver world={screen.session.world} onExport={exportSave} onNewCareer={reset} />
  }

  return (
    <Game
      session={screen.session}
      onChange={(session) => setScreen({ kind: 'game', session })}
      onNextWeek={() => setScreen({ kind: 'game', session: nextWeek(screen.session) })}
      onExport={exportSave}
      onImport={(file) => void importSave(file)}
      onReset={reset}
      saveNote={saveNote}
    />
  )
}
