import { devices, expect, test, type Page } from '@playwright/test'
import { continueTurn, inMatch, playMatchQuickly, startCareer, state } from './helpers.js'

/**
 * The match screen's Continue (DESIGN.md "Interface", Result first; "Match",
 * pace and control) at 390 × 844: To full time is one press to the result
 * behind the ticker; To key events pauses at the goal, half time and the
 * whistle, a mentality change while paused takes effect, and an injury
 * needing a change replaces Continue until a substitute is chosen, where in
 * To full time the assistant makes that change; the toggle persists to the
 * next match and through a reload; Continue's label matches the mode at
 * every step.
 */

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' })

/** Seed 3 (on the 52-week calendar): the first match has two goals, ours at 10' and 30', and no injury, so its pauses are the goals, half time and the whistle. */
const SEED_GOAL = 3
/**
 * An injury needing a change is rare in any one match and the seed that
 * produced it moves whenever the match model does, so these tests play on
 * until one turns up rather than pinning a seed to it.
 */
const SEED_INJURY = 43
const INJURY_HUNT_TURNS = 60

interface Side {
  isHuman: boolean
  mentality: string
  subsUsed: number
  stats: { reds: number }
  players: { id: number; on: boolean; injured: boolean }[]
}
interface Match {
  over: boolean
  played: number
  home: Side
  away: Side
  events: { kind: string; side: string | null; minute: number; pause: boolean }[]
}

/** The human's match, read off the live world. */
async function match(page: Page): Promise<Match> {
  return page.evaluate(() => (window as unknown as { __tenure: { human: { watched: { matches: Match[] } } } }).__tenure.human.watched.matches[0]!)
}

async function ours(page: Page): Promise<{ key: 'home' | 'away'; side: Side; m: Match }> {
  const m = await match(page)
  return m.home.isHuman ? { key: 'home', side: m.home, m } : { key: 'away', side: m.away, m }
}

/** Day one: take the offer; Home stops before kick-off; the match screen at 0'. */
async function toMatchScreen(page: Page, seed: number): Promise<void> {
  await startCareer(page, seed, 'Presser')
  await page.getByTestId('accept-offer').click()
  await expect(page.getByTestId('continue')).toHaveAttribute('data-next', 'kick-off')
  await continueTurn(page)
  await expect(page.getByTestId('score')).toBeVisible()
  await expect(page.getByTestId('minute')).toHaveText("0'")
}

/**
 * Play on in To key events until a match stops for an injury the human must
 * answer, leaving the page on that stop. Returns false if none turned up.
 */
async function huntForcedChange(page: Page): Promise<boolean> {
  for (let turn = 0; turn < INJURY_HUNT_TURNS; turn++) {
    if ((await state(page)) === 'match') {
      for (let i = 0; i < 25; i++) {
        if ((await page.getByTestId('choice-default').count()) > 0) return true
        const next = await page.getByTestId('continue').getAttribute('data-next')
        if (next === 'result') break
        await page.getByTestId('continue').click()
      }
      if ((await page.getByTestId('choice-default').count()) > 0) return true
      if ((await page.getByTestId('continue').count()) > 0 && (await page.getByTestId('continue').getAttribute('data-next')) === 'result') await page.getByTestId('continue').click()
      if ((await page.getByTestId('continue-after-match').count()) > 0) await page.getByTestId('continue-after-match').click()
      continue
    }
    const st = await state(page)
    if (st === 'over' || st === 'unemployed') return false
    await continueTurn(page)
  }
  return false
}

test('to full time: one press from kick-off to the result card, inside three seconds', async ({ page }) => {
  await toMatchScreen(page, SEED_GOAL)
  await expect(page.getByTestId('play-fullTime')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('continue')).toHaveText(/Kick off · to full time/)
  const t0 = Date.now()
  await page.getByTestId('continue').click()
  await expect(page.getByTestId('continue-after-match')).toBeVisible({ timeout: 10_000 })
  const seconds = (Date.now() - t0) / 1000
  console.log(`to full time: the result card in ${seconds.toFixed(1)} s`)
  expect(seconds).toBeLessThan(3.5)
  await expect(page.locator('main[aria-label="Result"]')).toBeVisible()
  expect((await match(page)).over).toBe(true)
  expect(await page.getByTestId('commentary').locator('li').count()).toBeGreaterThan(5)
})

test('to key events: pauses at the goal, half time and the whistle; a mentality change while paused takes effect; the label matches at every step', async ({ page }) => {
  await toMatchScreen(page, SEED_GOAL)
  await page.getByTestId('play-keyEvents').click()
  await expect(page.getByTestId('play-keyEvents')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('continue')).toHaveText(/Kick off · to next event/)
  const pauses: string[] = []
  let presses = 0
  let changed = false
  for (let i = 0; i < 20; i++) {
    const next = await page.getByTestId('continue').getAttribute('data-next')
    if (next === 'result') break
    expect(next).toBe('next-event')
    if (i > 0) await expect(page.getByTestId('continue')).toHaveText(/To next event/)
    await page.getByTestId('continue').click()
    presses++
    const at = await page.getByTestId('match-state').innerText()
    pauses.push(at)
    if (!changed && /goal/i.test(at)) {
      await page.getByTestId('mentality-attack').click()
      await expect(page.getByTestId('mentality-attack')).toHaveAttribute('aria-pressed', 'true')
      expect((await ours(page)).side.mentality).toBe('attack')
      expect(await page.getByTestId('commentary').locator('li', { hasText: /attack/ }).count()).toBeGreaterThan(0)
      changed = true
    }
  }
  expect(pauses.some((p) => /goal/i.test(p))).toBe(true)
  expect(pauses.some((p) => /half time/i.test(p))).toBe(true)
  expect(pauses[pauses.length - 1]).toMatch(/full time/i)
  expect(changed).toBe(true)
  await expect(page.getByTestId('continue')).toHaveText(/Result/)
  await page.getByTestId('continue').click()
  presses++
  await expect(page.getByTestId('continue-after-match')).toBeVisible()
  console.log(`to key events: ${presses} presses; pauses ${pauses.join(' / ')}`)
  expect(presses).toBeGreaterThanOrEqual(4)
  expect(presses).toBeLessThanOrEqual(8)
})

test('to key events: an injury needing a change replaces Continue until a substitute is chosen; switching to full time takes effect on the next press', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000)
  await toMatchScreen(page, SEED_INJURY)
  await page.getByTestId('play-keyEvents').click()
  const forced = await huntForcedChange(page)
  expect(forced, 'no injury needing a change turned up in the matches played').toBe(true)
  await expect(page.getByTestId('match-state')).toHaveText(/injury/i)
  expect(await page.getByTestId('continue').count()).toBe(0)
  await expect(page.locator('.foot .foot-title')).toHaveText(/is injured/)
  const before = await ours(page)
  const injured = before.side.players.find((p) => p.injured)!
  expect(injured).toBeDefined()
  expect(injured.on).toBe(false)
  await page.getByTestId('choice-default').click()
  await expect(page.getByTestId('continue')).toBeVisible()
  const after = await ours(page)
  expect(after.side.subsUsed).toBe(before.side.subsUsed + 1)
  expect(after.side.players.filter((p) => p.on).length).toBe(11 - after.side.stats.reds)
  // The toggle mid-match: the next press plays the rest to full time.
  await page.getByTestId('play-fullTime').click()
  await expect(page.getByTestId('continue')).toHaveText(/To full time/)
  await page.getByTestId('continue').click()
  await expect(page.getByTestId('continue-after-match')).toBeVisible({ timeout: 10_000 })
  expect((await match(page)).over).toBe(true)
})

test('to full time: the assistant makes the change an injury needs', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000)
  await toMatchScreen(page, SEED_INJURY)
  // Play matches to full time until one costs us a player to injury.
  let found: { key: string; side: Side; m: Match } | null = null
  for (let i = 0; i < INJURY_HUNT_TURNS && !found; i++) {
    const st = await state(page)
    if (st === 'over' || st === 'unemployed') break
    if (st === 'match') {
      await page.getByTestId('continue').click()
      await expect(page.getByTestId('continue-after-match')).toBeVisible({ timeout: 20_000 })
      const seen = await ours(page)
      if (seen.m.events.some((e) => e.kind === 'injury' && e.side === seen.key)) {
        found = seen
        break
      }
      await page.getByTestId('continue-after-match').click()
      continue
    }
    await continueTurn(page)
    if (await inMatch(page)) {
      await page.getByTestId('continue').click()
      await expect(page.getByTestId('continue-after-match')).toBeVisible({ timeout: 20_000 })
      const seen = await ours(page)
      if (seen.m.events.some((e) => e.kind === 'injury' && e.side === seen.key)) {
        found = seen
        break
      }
      await page.getByTestId('continue-after-match').click()
    }
  }
  expect(found, 'nobody was injured in the matches played').not.toBeNull()
  const { key, side, m } = found!
  const injury = m.events.find((e) => e.kind === 'injury' && e.side === key)!
  // The assistant made the change at the minute it happened, with nobody left off the pitch.
  const change = m.events.find((e) => e.kind === 'sub' && e.side === key && e.minute === injury.minute)
  expect(change).toBeDefined()
  expect(side.subsUsed).toBeGreaterThanOrEqual(1)
  expect(side.players.filter((p) => p.on).length).toBe(11 - side.stats.reds)
})

test('the toggle survives to the next match and a reload', async ({ page }) => {
  await toMatchScreen(page, SEED_GOAL)
  await page.getByTestId('play-keyEvents').click()
  await playMatchQuickly(page)
  for (let i = 0; i < 30 && (await state(page)) !== 'match'; i++) await continueTurn(page)
  expect(await state(page)).toBe('match')
  await expect(page.getByTestId('play-keyEvents')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('continue')).toHaveText(/Kick off · to next event/)
  // The autosave restores the career before kick-off; the toggle is as it was left.
  await page.reload()
  await expect(page.getByTestId('continue')).toHaveAttribute('data-next', 'kick-off')
  await continueTurn(page)
  await expect(page.getByTestId('score')).toBeVisible()
  await expect(page.getByTestId('play-keyEvents')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('continue')).toHaveText(/Kick off · to next event/)
})
