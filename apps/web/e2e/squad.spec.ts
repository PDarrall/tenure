import { devices, expect, test, type Page } from '@playwright/test'
import { continueTurn, inMatch, playMatchQuickly, startCareer, state } from './helpers.js'

/**
 * Squads of 25 and a heavy win's scorers at 390 × 844 (DESIGN.md "Players",
 * "Interface"): the Squad screen holds 25 without the tab's primary state
 * scrolling, and a result card with a long list of scorers shows four names
 * and folds the rest behind a tap.
 */

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' })
test.describe.configure({ mode: 'serial' })

const SEED = 8

async function squadSize(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = (window as unknown as { __tenure: any }).__tenure
    const me = w.managers[w.human.managerId - 1]
    const clubId = me.status.kind === 'employed' && me.status.post.kind === 'home' ? me.status.post.clubId : null
    if (clubId === null) return 0
    return (w.clubs[clubId - 1].playerIds as number[]).filter((id: number) => w.players[id - 1] && !w.players[id - 1].retired).length
  })
}

test('the Squad screen holds twenty-five without the page scrolling', async ({ page }) => {
  await startCareer(page, SEED, 'Lister')
  await page.getByTestId('accept-offer').click()
  await page.getByTestId('tab-squad').click()
  const rows = page.getByTestId('squad-row')
  expect(await rows.count()).toBe(25)
  expect(await squadSize(page)).toBe(25)
  // The list scrolls inside its region; the page itself does not.
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return { page: doc.scrollHeight - doc.clientHeight, list: (document.querySelector('.scroll') as HTMLElement).scrollHeight > (document.querySelector('.scroll') as HTMLElement).clientHeight }
  })
  expect(overflow.page).toBeLessThanOrEqual(1)
  expect(overflow.list).toBe(true)
  // Every row reads: a position, an age and a rating.
  const first = rows.first()
  await expect(first).toHaveAttribute('data-rating', /\d/)
  await expect(first).toHaveAttribute('data-age', /\d\d/)
})

test('the result card never runs to a wall of names', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000)
  await startCareer(page, SEED, 'Watcher')
  await page.getByTestId('accept-offer').click()
  let matches = 0
  let folded = false
  for (let i = 0; i < 30 && matches < 12; i++) {
    const st = await state(page)
    if (st === 'over' || st === 'unemployed') break
    if (st === 'match') await playMatchQuickly(page)
    else {
      await continueTurn(page)
      if (await inMatch(page)) await playMatchQuickly(page)
      else continue
    }
    matches++
    for (const side of ['scorers-home', 'scorers-away']) {
      const el = page.getByTestId(side)
      if ((await el.count()) === 0) continue
      const total = Number((await el.first().getAttribute('data-scorers')) ?? 0)
      const text = await el.first().innerText()
      const listed = text.replace(/\band \d+ more\b/, '').split(',').filter((t) => t.trim().length > 0).length
      // Folded or not, the card never lists more than four names at once.
      expect(listed, `${side}: ${text}`).toBeLessThanOrEqual(4)
      if (total > 4) {
        folded = true
        const more = page.getByTestId(`${side}-more`)
        await expect(more).toContainText(`and ${total - 4} more`)
        await more.click()
        expect((await el.first().innerText()).split(',').length).toBe(total)
      }
    }
  }
  expect(matches).toBeGreaterThan(0)
  console.log(`${matches} result cards read; a folded list ${folded ? 'was' : 'was not'} among them`)
})
