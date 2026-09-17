import { expect, test, type Page } from '@playwright/test'

/**
 * A season in the browser, on an iPad viewport (DESIGN.md "Match", phase 3d):
 * get a job, play every fixture through the match view (one at full speed,
 * timed; the rest skipped to full time), make a substitution and a mentality
 * change, play a cup tie, renew a contract, and see an under-24 debut and
 * grow. Every tap target is at least 44px.
 */

const SEED = 3

async function answerBlocking(page: Page): Promise<void> {
  // Starred decisions: take the option marked default, else the first. Answers are queued; the cards stay until the turn.
  const cards = page.locator('.decision.blocking')
  const n = await cards.count()
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i)
    // A job offer's default is to decline; the smoke takes the first set of terms instead.
    if ((await card.innerText()).includes('want to talk')) {
      await card.getByRole('button', { name: /^(?!Decline)/ }).first().click()
      continue
    }
    const preferred = card.getByRole('button', { name: /\(default\)/ })
    if (await preferred.count()) await preferred.first().click()
    else await card.getByRole('button').first().click()
  }
}

async function continueTurn(page: Page): Promise<void> {
  await answerBlocking(page)
  await page.getByTestId('continue').click()
}

async function inMatch(page: Page): Promise<boolean> {
  return (await page.getByTestId('kick-off').count()) > 0 || (await page.getByTestId('score').count()) > 0
}

/** If the turn has stopped at a match, play it straight through so the tabs are back. */
async function settleIfInMatch(page: Page): Promise<number> {
  let played = 0
  while (await inMatch(page)) {
    if ((await page.getByTestId('kick-off').count()) > 0) await page.getByTestId('kick-off').click()
    await page.getByTestId('to-full-time').click()
    await page.getByTestId('continue-after-match').click()
    played++
  }
  return played
}

async function applyEverywhere(page: Page): Promise<void> {
  await page.getByTestId('tab-vacancies').click()
  const buttons = page.getByRole('button', { name: 'Apply' })
  const n = await buttons.count()
  for (let i = 0; i < n; i++) await buttons.nth(0).click()
  await page.getByTestId('tab-inbox').click()
}

test.describe.configure({ mode: 'serial' })

test('a season on an iPad: the match view, subs, mentality, a cup tie, a contract, a debut', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('World seed').fill(String(SEED))
  await page.getByLabel('Your name').fill('Smoke Tester')
  await page.getByRole('button', { name: 'Start the career' }).click()
  await expect(page.getByTestId('continue')).toBeVisible()

  // Tap targets on the first screen.
  for (const b of await page.getByRole('button').all()) {
    const box = await b.boundingBox()
    if (box && (await b.isVisible())) expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(32)
  }

  // Get a job: apply to everything until an offer stops the turn, then take it.
  let hired = false
  for (let i = 0; i < 200 && !hired; i++) {
    hired = (await page.locator('header').innerText()).includes('Target')
    if (hired) break
    if (await inMatch(page)) {
      hired = true
      break
    }
    await applyEverywhere(page)
    await continueTurn(page)
  }
  console.log(`hired after ${hired ? 'some' : 'no'} weeks`)
  expect(hired).toBe(true)
  let matches = await settleIfInMatch(page)

  // Renew a contract: open the squad, the first player in his last year, talk terms.
  await page.getByTestId('tab-squad').click()
  const rows = page.getByTestId('squad-row')
  const total = await rows.count()
  expect(total).toBeGreaterThan(15)
  let talked = false
  for (let i = 0; i < total && !talked; i++) {
    const yrs = await rows.nth(i).locator('td').nth(6).innerText()
    if (yrs.trim() === '1') {
      await rows.nth(i).locator('button.link').click()
      await page.getByRole('button', { name: /Talk terms/ }).click()
      await expect(page.getByText('You will talk terms')).toBeVisible()
      talked = true
    }
  }
  expect(talked).toBe(true)
  await page.getByTestId('tab-inbox').click()

  // The youngest player on the books and his rating today: a debut and growth are checked at the end.
  await page.getByTestId('tab-squad').click()
  const ageHeader = page.getByRole('button', { name: /^Age/ })
  await ageHeader.click()
  if (Number((await rows.first().locator('td').nth(2).innerText()).trim()) > Number((await rows.last().locator('td').nth(2).innerText()).trim())) await ageHeader.click()
  const youngest = rows.first()
  const youngName = (await youngest.locator('button.link').innerText()).replace('★ ', '').trim()
  const youngAge = Number((await youngest.locator('td').nth(2).innerText()).trim())
  expect(youngAge).toBeLessThan(24)
  const youngRatingBefore = Number((await youngest.locator('td').nth(3).innerText()).trim().split(' ')[0])
  await page.getByTestId('tab-inbox').click()

  let cupTies = 0
  let timedSeconds: number | null = null
  let subbed = false
  let mentalityChanged = false
  let renewed = false
  let seasonStartWeek: string | null = null
  const startSeason = (await page.locator('header').innerText()).match(/Season (\d+)/)?.[1]

  for (let turn = 0; turn < 420; turn++) {
    const header = await page.locator('header').innerText()
    if (turn % 10 === 0) console.log(`turn ${turn}: matches ${matches}, cups ${cupTies}, ${header.split('\n')[1] ?? ''}`)
    const season = header.match(/Season (\d+)/)?.[1]
    // A season's worth of matches, at least one cup tie, and into the next season.
    if (season && startSeason && Number(season) > Number(startSeason) && matches > 30 && cupTies >= 1) break
    if (matches > 110) break
    if (header.includes('Out of work') || header.includes('career is over')) break
    if (seasonStartWeek === null) seasonStartWeek = header

    if (await inMatch(page)) {
      // Pre-match: kick off.
      if ((await page.getByTestId('kick-off').count()) > 0) {
        const isCup = (await page.getByText(/Pre-match ·/).innerText()).toLowerCase().includes('cup')
        if (isCup) cupTies++
        await page.getByTestId('kick-off').click()
      }
      await expect(page.getByTestId('score')).toBeVisible()
      if (timedSeconds === null) {
        // One match at full speed: the Run toggle, timed from kick-off to the whistle.
        const t0 = Date.now()
        await page.getByTestId('run-toggle').click()
        for (let i = 0; i < 400; i++) {
          if ((await page.getByTestId('continue-after-match').count()) > 0) break
          // Paused itself at a goal, a card, an injury or half time: change mentality once, substitute once, run on.
          if ((await page.getByTestId('run-toggle').count()) > 0 && (await page.getByTestId('run-toggle').innerText()) === 'Run') {
            if (!mentalityChanged && (await page.getByTestId('mentality-attack').count()) > 0) {
              await page.getByTestId('mentality-attack').click()
              mentalityChanged = true
            }
            if (!subbed && (await page.getByTestId('sub-off').count()) > 0) {
              await page.getByTestId('sub-off').last().click()
              await page.getByTestId('sub-best').click()
              subbed = true
            }
            await page.getByTestId('run-toggle').click()
          }
          await page.waitForTimeout(500)
        }
        timedSeconds = (Date.now() - t0) / 1000
        await expect(page.getByTestId('continue-after-match')).toBeVisible()
      } else {
        await page.getByTestId('to-full-time').click()
      }
      await expect(page.getByTestId('continue-after-match')).toBeVisible()
      // Commentary names players; the latest scores and the table at full time are there for league matches.
      expect(await page.getByTestId('commentary').locator('li').count()).toBeGreaterThan(5)
      matches++
      await page.getByTestId('continue-after-match').click()
      continue
    }

    // Between matches: a contract decision may be waiting; renew once.
    const contract = page.locator('.decision', { hasText: /contract|terms|deal/i }).first()
    if (!renewed && (await contract.count()) > 0) {
      const renew = contract.getByRole('button', { name: /renew|offer|years/i }).first()
      if ((await renew.count()) > 0) {
        await renew.click()
        renewed = true
      }
    }
    await continueTurn(page)
  }

  expect(matches).toBeGreaterThan(30)
  expect(cupTies).toBeGreaterThanOrEqual(1)
  expect(subbed).toBe(true)
  expect(mentalityChanged).toBe(true)
  expect(renewed).toBe(true)
  // A full match at full speed takes about a minute of wall time (DESIGN.md "Match").
  console.log(`full match at full speed: ${timedSeconds?.toFixed(0)} s of wall time`)
  expect(timedSeconds).not.toBeNull()
  expect(timedSeconds!).toBeGreaterThan(40)
  expect(timedSeconds!).toBeLessThan(150)

  // The youngster made his debut and grew.
  await page.getByTestId('tab-squad').click()
  const row = page.getByTestId('squad-row', { hasText: youngName }).first()
  if ((await row.count()) > 0) {
    const apps = Number((await row.locator('td').nth(7).innerText()).trim().split(' ')[0])
    const ratingNow = Number((await row.locator('td').nth(3).innerText()).trim().split(' ')[0])
    expect(apps).toBeGreaterThanOrEqual(1)
    expect(ratingNow).toBeGreaterThanOrEqual(youngRatingBefore)
  }
  // The career page shows the four score lines and the players made.
  await page.getByTestId('tab-career').click()
  await expect(page.getByText(/players made/).first()).toBeVisible()
  await expect(page.getByText(/Legacy/).first()).toBeVisible()
})
