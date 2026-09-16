/** localStorage with the failures Safari can throw (private mode, quota) swallowed. */
export const SAVE_KEY = 'tenure.save.v1'

export function loadSave(): string | null {
  try {
    return window.localStorage.getItem(SAVE_KEY)
  } catch {
    return null
  }
}

export function storeSave(text: string): boolean {
  try {
    window.localStorage.setItem(SAVE_KEY, text)
    return true
  } catch {
    return false
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY)
  } catch {
    // nothing to clear
  }
}

/** Hand the player a file to save. On iPad Safari this opens the share sheet. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Safari shows a confirmation before it reads the blob; revoking early leaves an empty download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
