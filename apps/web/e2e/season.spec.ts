import { expect, test } from '@playwright/test'
import { applyEverywhere, clubOf, continueTurn, getAJob, inMatch, playMatchQuickly, seasonOf, startCareer, state } from './helpers.js'

/**
 * A season in the browser, on an iPad viewport (DESIGN.md "Match", phase 3d):
 * turn the day-one offer down, get a job through the market, play every
 * fixture through the match view (one at full speed, timed; the rest skipped
 * to full time), make a substitution and a mentality change, play a cup tie,
 * renew a contract, see an under-24 debut and grow, and visit every tab.
 * Every tap target on Home is at least 32px.
 */

const SEED = 3

test.describe.configure({ mode: 'serial' })

test('a season on an iPad: the match view, subs, mentality, a cup tie, a contract, a debut', async ({ page }) => {
  await startCareer(page, SEED, 'Smoke Tester')
  // This smoke goes through the market instead (jobs.spec.ts takes the offer).
  await page.getByTestId('start-unemployed').click()
  await expect(page.getByTestId('continue')).toBeVisible()

  // Tap targets on the first screen.
  for (const b of await page.getByRole('button').all()) {
    const box = await b.boundingBox()
    if (box && (await b.isVisible())) expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(32)
  }

  // Get a job: apply to everything until an offer stops the turn, then take it.
  const hired = await getAJob(page)
  console.log(`hired after ${hired ? 'some' : 'no'} weeks`)
  expect(hired).toBe(true)
  let matches = 0
  if (await inMatch(page)) {
    await playMatchQuickly(page)
    matches++
  }
  const firstClub = await clubOf(page)
  expect(firstClub).not.toBeNull()

  // Every tab renders.
  await page.getByTestId('tab-squad').click()
  await expect(page.getByTestId('squad-row').first()).toBeVisible()
  await page.getByTestId('tab-tactics').click()
  await expect(page.getByTestId('pick-xi').first()).toBeVisible()
  await page.getByTestId('tab-fixtures').click()
  await expect(page.getByTestId('fixture-row').first()).toBeVisible()
  await page.getByTestId('view-table').click()
  await expect(page.getByTestId('table-row').first()).toBeVisible()
  await page.getByTestId('tab-career').click()
  await expect(page.getByText(/Players made/).first()).toBeVisible()
  await expect(page.getByText(/Legacy/).first()).toBeVisible()
  // The version stamp at the foot: the commit and date the Pages workflow injects, "dev" in a local build.
  await expect(page.getByTestId('build-stamp')).toHaveText(/^Build (dev|[0-9a-f]{7})/)

  // Renew a contract: open the squad, the first player in his last year, talk terms.
  await page.getByTestId('tab-squad').click()
  const rows = page.getByTestId('squad-row')
  const total = await rows.count()
  expect(total).toBeGreaterThan(15)
  let talked = false
  for (let i = 0; i < total && !talked; i++) {
    const text = await rows.nth(i).innerText()
    if (/· 1 yr$/.test(text.trim())) {
      await rows.nth(i).click()
      // Talking terms is an ask with a stated likelihood now (DESIGN.md "Requests"): queued for the turn.
      await page.getByRole('button', { name: /Talk terms/ }).click()
      await expect(page.getByTestId('ask-contract')).toHaveText(/Asked/)
      talked = true
    }
  }
  expect(talked).toBe(true)

  // The youngest player on the books and his rating today: a debut and growth are checked at the end.
  await page.getByTestId('tab-squad').click()
  const ageHeader = page.getByRole('button', { name: /^Age/ })
  await ageHeader.click()
  if (Number(await rows.first().getAttribute('data-age')) > Number(await rows.last().getAttribute('data-age'))) await ageHeader.click()
  const youngest = rows.first()
  const youngName = (await youngest.getAttribute('data-name')) ?? ''
  const youngAge = Number(await youngest.getAttribute('data-age'))
  expect(youngAge).toBeLessThan(24)
  const youngRatingBefore = Number(await youngest.getAttribute('data-rating'))
  await page.getByTestId('tab-home').click()

  let cupTies = 0
  let timedSeconds: number | null = null
  let subbed = false
  let mentalityChanged = false
  let renewed = false
  const startSeason = await seasonOf(page)

  for (let turn = 0; turn < 420; turn++) {
    const s = await state(page)
    if (turn % 10 === 0) console.log(`turn ${turn}: matches ${matches}, cups ${cupTies}, ${s}`)
    if (s === 'over') break
    if (s === 'unemployed') {
      // Sacked or released: that is the game; get another job and play on.
      console.log(`turn ${turn}: out of work after ${matches} matches, looking again`)
      if (!(await getAJob(page))) break
      continue
    }
    if (s === 'match') {
      const eyebrow = await page.locator('main[aria-label="Match"] .head .label').first().innerText()
      if (eyebrow.toLowerCase().includes('cup')) cupTies++
      if (timedSeconds === null) {
        // One match at full speed: Continue to each pause, timed from kick-off to the whistle.
        const t0 = Date.now()
        for (let i = 0; i < 600; i++) {
          if ((await page.getByTestId('continue-after-match').count()) > 0) break
          if ((await page.getByTestId('play-on').count()) > 0) {
            // Paused at a goal, a card, an injury or half time: change mentality once, substitute once, play on.
            if (!mentalityChanged && (await page.getByTestId('mentality-attack').count()) > 0 && i > 0) {
              await page.getByTestId('mentality-attack').click()
              mentalityChanged = true
            }
            if (!subbed && i > 0 && (await page.getByTestId('make-a-change').count()) > 0) {
              await page.getByTestId('make-a-change').click()
              await page.getByTestId('sub-off').last().click()
              await page.getByTestId('sub-best').click()
              subbed = true
            }
            await page.getByTestId('play-on').click()
          }
          await page.waitForTimeout(400)
        }
        timedSeconds = (Date.now() - t0) / 1000
        await expect(page.getByTestId('continue-after-match')).toBeVisible()
      } else {
        await page.getByTestId('to-full-time').click()
      }
      await expect(page.getByTestId('continue-after-match')).toBeVisible()
      // The commentary names players; the ratings and, for the league, the table at full time are there.
      expect(await page.getByTestId('commentary').locator('li').count()).toBeGreaterThan(5)
      matches++
      await page.getByTestId('continue-after-match').click()
      continue
    }
    // A season's worth of matches, at least one cup tie, and into the next season.
    const season = await seasonOf(page)
    if (season !== null && startSeason !== null && season > startSeason && matches > 30 && cupTies >= 1) break
    if (matches > 110) break

    // Between matches: a contract decision may be waiting; renew once.
    if (!renewed) {
      const renew = page.locator('main').getByRole('button', { name: /renew|offer|years/i }).first()
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

  // The youngster made his debut and grew: checked at the club he was noted at, by his exact name.
  if ((await state(page)) === 'match') await playMatchQuickly(page)
  const clubNow = await clubOf(page)
  if (clubNow === firstClub) {
    await page.getByTestId('tab-squad').click()
    const row = page.locator(`[data-testid="squad-row"][data-name="${youngName}"]`)
    if ((await row.count()) > 0) {
      const apps = Number(await row.first().getAttribute('data-apps'))
      const ratingNow = Number(await row.first().getAttribute('data-rating'))
      expect(apps).toBeGreaterThanOrEqual(1)
      expect(ratingNow).toBeGreaterThanOrEqual(youngRatingBefore)
      console.log(`youngster ${youngName}: debut and growth checked`)
    } else {
      console.log(`youngster ${youngName}: no longer at the club`)
    }
  } else {
    console.log(`moved on from ${firstClub} to ${clubNow}: the youngster check is skipped`)
  }
  // The career page shows the four score lines and the players made.
  await page.getByTestId('tab-career').click()
  await expect(page.getByText(/Players made/).first()).toBeVisible()
  await expect(page.getByText(/Legacy/).first()).toBeVisible()
  // Unused but exercised: applying from Home works while employed too (no vacancies list, so nothing to click).
  await page.getByTestId('tab-home').click()
  await applyEverywhere(page)
})
