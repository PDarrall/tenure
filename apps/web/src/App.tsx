import { useEffect, useState } from 'react'
import type { Background } from '@tenure/engine'
import './styles.css'
import { newSession, nextWeek, parseSave, serialize, sessionFromWorld, type Session } from './controller.js'
import { clearSave, downloadText, loadSave, storeSave } from './storage.js'
import { NewCareer, type SaveState } from './screens/NewCareer.js'
import { Game } from './screens/Game.js'
import { CareerOver } from './screens/CareerOver.js'

/** careerKey changes with every new, restored or imported career so screen-local state starts fresh. */
type Screen = { kind: 'new' } | { kind: 'game'; session: Session; careerKey: number }

function restore(): Session | null {
  const text = loadSave()
  if (!text) return null
  try {
    return sessionFromWorld(parseSave(text))
  } catch {
    return null
  }
}

function savedState(): SaveState {
  const text = loadSave()
  if (text === null) return 'none'
  try {
    parseSave(text)
    return 'ok'
  } catch {
    return 'broken'
  }
}

export function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const restored = restore()
    return restored ? { kind: 'game', session: restored, careerKey: 1 } : { kind: 'new' }
  })
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [save, setSave] = useState<SaveState>(() => savedState())

  // Autosave whenever the world changes: a new, restored or imported world (object identity) or a played week (turn).
  const world = screen.kind === 'game' ? screen.session.world : null
  const turn = screen.kind === 'game' ? screen.session.turn : -1
  useEffect(() => {
    if (!world) return
    const ok = storeSave(serialize(world))
    setSaveNote(ok ? null : 'Autosave failed on this device; export a file to keep your career.')
    setSave(ok ? 'ok' : savedState())
  }, [world, turn])

  const open = (session: Session) => {
    setScreen((prev) => ({ kind: 'game', session, careerKey: (prev.kind === 'game' ? prev.careerKey : 0) + 1 }))
    setSaveNote(null)
  }

  const start = (seed: number, name: string, background: Background) => open(newSession(seed, name, background))

  const exportSave = () => {
    if (screen.kind !== 'game') return
    const me = screen.session.world.managers[screen.session.world.human!.managerId - 1]!
    const safe = me.name.replace(/[^\w-]+/g, '_')
    downloadText(`tenure-${safe}-season-${screen.session.world.season}.json`, serialize(screen.session.world))
  }

  const exportBroken = () => {
    const text = loadSave()
    if (text !== null) downloadText('tenure-unreadable-save.json', text)
  }

  const importSave = async (file: File) => {
    try {
      open(sessionFromWorld(parseSave(await file.text())))
    } catch (err) {
      setSaveNote(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const discard = () => {
    clearSave()
    setSave('none')
  }

  const reset = () => {
    discard()
    setScreen({ kind: 'new' })
  }

  if (screen.kind === 'new') {
    return (
      <>
        <NewCareer
          onStart={start}
          save={save}
          onResume={() => {
            const s = restore()
            if (s) open(s)
            else setSave(savedState())
          }}
          onExportBroken={exportBroken}
          onDiscard={discard}
        />
        <main>
          <h2>Import a save</h2>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importSave(file)
              e.target.value = ''
            }}
          />
          {saveNote && <p className="notice">{saveNote}</p>}
        </main>
      </>
    )
  }

  const me = screen.session.world.managers[screen.session.world.human!.managerId - 1]!
  if (me.status.kind === 'retired') {
    return <CareerOver world={screen.session.world} fromWeek={screen.session.shownFromWeek} onExport={exportSave} onNewCareer={reset} />
  }

  const careerKey = screen.careerKey
  return (
    <Game
      key={careerKey}
      session={screen.session}
      onChange={(session) => setScreen({ kind: 'game', session, careerKey })}
      onNextWeek={() => setScreen({ kind: 'game', session: nextWeek(screen.session), careerKey })}
      onExport={exportSave}
      onImport={(file) => void importSave(file)}
      onReset={reset}
      saveNote={saveNote}
    />
  )
}
