import { devices, expect, test, type Page } from '@playwright/test'
import { continueTurn, getAJob, playMatchQuickly, startCareer, state } from './helpers.js'

/**
 * The calendar and the cups (DESIGN.md "World") at 390 × 844: play through
 * a cup tie and see it named by competition and round on Fixtures; reach
 * the summer and watch the window open with the last match; the calendar
 * shows the eleven summer weeks and what happens in them.
 */

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' })

const SEED = 14

async function snap(page: Page): Promise<{ seasonWeek: number; season: number; clubId: number | null; cupsPlayed: number }> {
  return page.evaluate(() => {
    const w = (window as unknown as { __tenure: any }).__tenure
    const me = w.managers[w.human.managerId - 1]
    const clubId = me.status.kind === 'employed' && me.status.post.kind === 'home' ? me.status.post.clubId : null
    const log = w.log as { type: string; payload: Record<string, unknown> }[]
    return { seasonWeek: w.week % 52, season: w.season, clubId, cupsPlayed: log.filter((e) => e.type === 'match.played' && e.payload['competition'] !== 'league' && (e.payload['homeId'] === clubId || e.payload['awayId'] === clubId)).length }
  })
}

test('a cup tie played through and named by round, then the summer: the window opens with the last match', async ({ page }) => {
  test.setTimeout(15 * 60 * 1000)
  await startCareer(page, SEED, 'Cup Tester')
  await page.getByTestId('accept-offer').click()
  let cupSeen = false
  let s = await snap(page)
  for (let i = 0; i < 500; i++) {
    s = await snap(page)
    if (s.seasonWeek >= 41 && cupSeen) break
    const st = await state(page)
    if (st === 'over') break
    if (st === 'unemployed') {
      expect(await getAJob(page)).toBe(true)
      continue
    }
    if (st === 'match') {
      const eyebrow = await page.locator('main[aria-label="Match"] .head .label').first().innerText()
      const cup = /cup/i.test(eyebrow)
      await playMatchQuickly(page)
      if (cup && !cupSeen) {
        cupSeen = true
        // Fixtures names the tie by competition and round.
        await page.getByTestId('tab-fixtures').click()
        const ties = page.locator('[data-testid="fixture-row"]:not([data-competition="league"])')
        expect(await ties.count()).toBeGreaterThan(0)
        expect(await ties.first().getAttribute('data-round')).toBeTruthy()
        await expect(page.locator('[data-testid^="competition-"]:not([data-testid="competition-league"])').first()).toBeVisible()
        await page.getByTestId('tab-home').click()
      }
      continue
    }
    await continueTurn(page)
  }
  expect(cupSeen).toBe(true)
  s = await snap(page)
  expect(s.seasonWeek).toBeGreaterThanOrEqual(41)
  console.log(`summer reached in season ${s.season} after ${s.cupsPlayed} cup ties`)
  if (s.clubId !== null) {
    // The summer window opened with the last match week.
    await expect(page.getByTestId('window-banner')).toContainText('Summer window')
    await expect(page.getByTestId('fixture-card')).toContainText(/summer/i)
  }
  // The calendar: 41 match weeks and 11 summer weeks, with what happens in them.
  await page.getByTestId('tab-fixtures').click()
  await page.getByTestId('view-calendar').click()
  await expect(page.locator('[data-testid="calendar-week"]')).toHaveCount(52)
  await expect(page.locator('[data-testid="calendar-week"].summer')).toHaveCount(11)
  await expect(page.locator('[data-testid="calendar-week"][data-week="40"]')).toContainText(/summer window opens/i)
  await expect(page.locator('[data-testid="calendar-week"][data-week="41"]')).toContainText(/season ends/i)
  await expect(page.locator('[data-testid="calendar-week"][data-week="2"]')).toContainText(/deadline day/i)
  await expect(page.locator('[data-testid="calendar-week"][aria-current="true"]')).toHaveCount(1)
})
