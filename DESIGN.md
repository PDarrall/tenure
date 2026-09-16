# TENURE — design bible v0.2

Working title. A football management game about surviving a career.

## Premise

You are a manager. You start with no record. Clubs are episodes; the career is the game.
The career ends when nobody will employ you (permadeath), or when you choose to retire.
Success is measured three ways: how long you lasted, how much you earned, what you won.

## The score

Three numbers, always visible:

- **Years / games managed**
- **Career earnings** — salary, bonuses, and payouts when sacked
- **Trophy points** — see table below

Composite for leaderboards: `Legacy = a·games + b·earnings(£m) + c·trophy points`.
Tune a, b, c so that a 30-year mid-table career and a 12-year trophy-laden career land within ~20% of each other.
Nothing is ever deducted. Unemployment scores zero — that is the real cost of being sacked.
Age caps a career at a little under 40 seasons (see Age), so "longest" has a ceiling and Legacy stays comparable across careers.

Trophy points (starting values): European title 120 · tier-1 title 100 · national cup 50 · league cup 25 ·
tier-2 title 40 · tier-3/4/5 titles 25/15/10 · promotion without the title 20/12/8/5 by tier ·
foreign titles by league prestige (big 80, mid 40, small 20).

## World

Fictional, generated, English-style pyramid. A 30-year world is fictional after year three anyway.

- Tier 1: 20 clubs. Tiers 2–4: 24 clubs each. Tier 5 ("non-league"): abstracted pool of 24.
- Abroad: three abstracted foreign leagues (big, mid, small). They exist as a job market and as European opposition; not simulated match by match in v1.
- Cups: one national cup (all tiers), one league cup (tiers 1–2), one European competition (top four of tier 1 plus the cup winner).

Club: name, city, tier, prestige (0–100, slow-moving), wealth (0–100), owner {type: patient | normal | impatient | erratic, ambition}, fan patience, squad {strength 0–100, age profile, size}, wage budget, honours, rivals[].

Squad strength drifts toward a level set by wealth ("gravity"). Manager decisions push it above or below.

## Managers

~400 managers, AI and player, all on the same model. State:

- age (start 33–38), background (ex-pro | coach | analyst), nationality
- reputation 0–100 (employability)
- tags[] with expiry
- ability: tactical, motivation, development, dealing (hidden for AI; for the player, earned through play rather than set)
- history: spells[], honours[], earnings
- status: employed {club, contract} | unemployed {since, activity}

Backgrounds: ex-pro starts with high player trust and low board trust; coach starts tactically strong with no name; analyst starts with dealing/development and no player trust.

## Tenure model (the spell)

State per spell: expectation, credit, staleness, ownership, contract.

### Expectation

- Set at hire: board target finish, derived from the squad's strength rank in the division, adjusted by owner ambition and by the interview promise (see Job market).
- Reset each summer against your own last season. If you beat expectation, next target = your actual finish (the bar rises to meet you). If you missed, the target eases by one place toward the structural target. Rises fast, falls slowly.

### Credit (0–100) — the sacking variable

- On hire: 55. +15 if the club was in crisis (bottom four, just relegated, or previous manager sacked mid-season). −10 at a top-six-prestige club.
- Per match: `Δ = k × (points − expected points)`, expected points from pre-match probabilities. Losses weighted ×1.5. Third consecutive defeat and beyond: extra −2 each. Derby defeat −4. Cup exit to a lower-tier side −6. Win against a top-three side +2. k is a tunable (start at 2). The loss weighting means credit erodes unless you overachieve — intentional, but watch it in validation.
- Monthly: league position worse than expectation by four or more places, −3.
- Season end: `(expectation − actual finish) × 3`, clamped to [−20, +20]. Promotion +20, relegation −25, trophy +15.
- Ceiling: 100 for seasons one to three, then −10 per season (staleness). Reset to 100 by a trophy, a promotion, or ≥50% first-XI turnover in one summer. This is how Ferguson-length tenures stay possible without being the default.
- Blame: in the first two seasons, negative deltas are scaled by `0.5 + 0.5 × ownership`, where ownership is the share of the first XI you signed. Inherit a bad squad and you get a pass — briefly.

### Sacking

- Each week with credit below the threshold, the board rolls. Threshold: patient 15, normal 25, impatient 35, erratic random 10–45 (re-rolled monthly).
- Roll probability per week `= 10% × (1 − 0.2 × contract years remaining)`, floor 3%. Payout cost is why long contracts buy patience.
- Credit ≤ 5: sacked immediately.
- On sacking you receive the remaining contract value (earnings). Reputation: −8 if "deserved" (credit below threshold for eight or more weeks), −2 if not.

### Shocks (monthly rolls, independent of results)

- Takeover (1%/month, higher at low-wealth clubs): new owner type; 35% chance they replace you within six months regardless of results. Unjust-sacking rules apply.
- Financial crisis (0.5%/month, higher at low-wealth clubs): budget cut 40%, expectation eased by three places.
- Forced star sale (1%/month at low-wealth clubs): squad strength −5, expectation eased by one.
- Dressing-room fallout (event-driven): a senior player turns. Back down (motivation −) or sell (ownership +, strength −, "difficult" progress).

### Ways out

- Sacked: full payout; reputation as above.
- Mutual consent (offered when credit is 10–25): half payout, reputation −4.
- Resign: no payout; reputation −1 if credit > 50, else −5.
- Poached: the new club pays the buy-out; reputation +2; "in demand" tag.
- Contract expiry: renewed if credit > 40, otherwise released, reputation −3.

## Career model

### Reputation → employability band

0–20 non-league / minor abroad · 20–40 tier 4 · 40–60 tier 3 · 60–75 tier 2 · 75–90 tier 1 · 90+ elite.
A club shortlists you if your band covers its tier, or one band below with a matching tag.

Reputation moves: season end vs expectation (±2 per place, clamped ±8); trophy +6 (tier-weighted); promotion +5; relegation −6; sacking as above; walking out on a contract −3 and "mercenary"; unemployment −1/month after month three (halved by punditry); stepping down to an assistant/coaching role −5 once, then decay stops.

### Tags (the press assign them; they expire if not renewed within their window)

- promotion specialist — two promotions within five seasons
- survival specialist — two escapes from the bottom four within five seasons
- youth developer — four or more academy players in the XI for a season
- big spender — net spend in the division's top three for two seasons
- overachiever — three seasons beating expectation by five or more places
- cup manager — two cup finals within four seasons
- loyal — six or more consecutive seasons at one club
- in demand — poached within the last two seasons
- mercenary — walked out twice
- difficult — two dressing-room fallouts or board rows within three seasons
- abroad — one or more seasons outside the home pyramid

Vacancies carry a want-list of tags. This is typecasting: the survival specialist gets the relegation jobs, the big-club failure rarely gets a second big club.

### Job market

- Vacancies arise from AI sackings, resignations, poaching chains, and expiries. Each has: club, owner type, expectation, budget, contract offer (one to four years; salary by tier × reputation), and a shortlist of three to five managers drawn from those qualified (reputation, tag fit, agent quality, randomness).
- The player sees every vacancy, can apply to any, is told when shortlisted, and interviews.
- Interview: three choices set the terms. Promise "top half" → normal budget. Promise "promotion" → +30% budget, expectation +3 places. Promise "stability" → −10% budget, expectation −2 places. Ask for a longer contract → lower salary; shorter → higher salary.
- Approaches while employed: a bigger club calls. Accept (buy-out paid by them, "in demand") or decline (credit +3 at your club, loyalty progress).
- Unemployed, each month: wait | punditry (small income, halves decay) | assistant role (income, −5 once, decay stops) | abroad (opens foreign vacancies; "abroad" tag after a season). Waiting is a bet.

### Age

Age ends every career. Success delays it; nothing prevents it.

- Managers start at 33–38 and age one year per season. The same rules apply to the AI population, so managers retire, vacancies open, and a new cohort enters every summer.
- From 60, shortlists apply an age penalty: `effective reputation = reputation − 3 × (age − 60)`. At 65 that costs about a band; at 70, two. A 95-reputation manager at 70 can still get a tier-2 job; a 60-reputation one is down to tier 4.
- Contract offers shorten with age: up to three years at 60–64, two at 65–69, one at 70+. Payout protection fades as you need it most.
- Hard cap: the season in which you turn 72 is your last. You retire at its end, employed or not, and the score is banked.
- From 65 your agent raises retirement each summer — the prompt to choose the final chapter rather than have it chosen.
- v2: international management. Associations discount age less, so it becomes the natural last chapter.

### Permadeath

The career ends when no vacancy has shortlisted you for 24 consecutive months, at the age cap, or on a scandal event. The score is banked. Retire voluntarily at any time.

## Fixtures

The next fixture is always on screen: competition, opponent, venue, date, the opponent's form and league position. A fixtures tab lists the season's fixtures and results by competition, with the table beside it. Cup draws arrive in the inbox. AI clubs in the human's division play their matches at the same time as the human's, and their scores tick over during the match (see Match).

## Turn structure

One match per turn. Continue plays the next fixture; everything due before it — board, agent, press, transfer window, cup draw, injuries and suspensions — arrives first as inbox items and decisions. Weeks with no fixture (international breaks, cup rounds you are out of, the summer) pass as single steps with their own inbox. A season is the league games plus cup ties plus around ten non-match steps.
Target pace: a match in about a minute at full speed; a season in under an hour; a career in a long weekend.

## Players

Every home club has a squad: 22 players in tiers 1–2, 20 in tiers 3–4, 18 in tier 5. Foreign clubs get a squad generated on demand, seeded, when they meet a home club.

A player: name, age, nationality, positions, ability 1–100, potential (hidden), fitness 0–100, morale, injury (weeks out), suspension (matches), yellow cards this season, contract years, wage, value.

Positions are CM-style: a role — GK, SW, D, WB, DM, M, AM, F — and a side — L, C, R. A player holds one or more role/side combinations, each at a competence: natural, accomplished, competent or unconvincing. Playing outside a competence costs ability: 0 natural, −5 accomplished, −12 competent, −25 unconvincing, −40 anywhere else (tunables). Generated squads follow realistic shapes: for a 22, about 2 GK, 7 defenders, 8 midfielders, 4 forwards, with a spread of sides.

The rule that keeps the validated world intact: **club strength stays the master number.** A squad is generated to match it — the best XI in the club's preferred formation averages the club's strength — and is re-anchored each summer, with players ageing (peak 26–30, decline from 31, goalkeepers from 33), developing toward potential under 24, and declining inside that. The human's club is the exception: match strength comes from the XI actually picked, in the formation picked, with positional penalties, fitness and morale applied. AI clubs pick their best XI by the same rule. Phase 6 reverses the direction — strength derived from the squad, named transfers against the budget.

Fitness drops with minutes played and recovers with rest; below 80 it costs ability, below 70 it raises injury risk. Injuries come from matches (tunable rate) and last 1–20 weeks. Suspensions: five yellows is one match, ten is two; a red is one to three. Morale moves with playing time, results and events.

Selection: a formation, an XI, and a bench of five with three substitutions, as in 2001. The assistant auto-picks in one tap and proposes changes in the pre-match step when injuries or suspensions force them.

The summer window stays abstract in this phase: spending the budget raises squad strength by improving or adding generated players, and the engine picks which; named transfers arrive in phase 6.

## Formations

The basic shapes CM 01/02 offered, each defined by the positions it fields: 4-4-2, 4-4-2 diamond, 4-3-3, 4-5-1, 4-2-4, 4-1-3-2, 4-3-1-2, 3-5-2, 3-4-3, 5-3-2, 5-4-1, and 5-3-2 with a sweeper (to verify against the game's default list). Advantages come from structure, not a lookup table. Each formation is counted in three bands — defence (D, SW, WB, DM), midfield (M, AM), attack (F) — and by width (players on L or R sides). In the match model: the midfield difference drives pressure; attackers against defenders drive chance quality; width against a narrow defence adds chances from the flanks; a defensive overload reduces chances conceded. So 4-5-1 wins the midfield against 4-4-2 but creates less; 4-2-4 makes chances and concedes them; 3-5-2 is strong through the middle and open on the flanks; 5-4-1 concedes little and scores little. Mentality — attack, balanced, defend — shifts the bands' weight and the pressure lean. Every AI manager has a preferred formation and a fallback, part of their identity, and changes mentality by rule when chasing or protecting a result.

## Match

The engine runs minute by minute, 0 to 90 plus stoppage. State: score, minute, pressure (a lean from −100 to +100), the two XIs with fitness draining, cards, injuries, substitutions used.

Each minute:
- Pressure drifts toward a target set by effective XI strength, the midfield band difference, mentality, home advantage (a lean of 8 to the home side, tunable, to verify against real home-win rates), the score state (a leading side sits deeper unless attacking) and momentum from the last few events.
- A chance may arise, with probability from pressure, the attack-versus-defence bands and chance-creation quality. It resolves to a goal, a save, a miss or a block from the striker against keeper and defenders. Every chance and event is a commentary line from templates naming the players.
- Cards, injuries and substitutions happen; AI managers substitute by rule — injured, tired below 60, chasing or holding.

Pace and control: the match runs at full speed — CM with the space bar held — with hold-to-run and pause available. It pauses on its own at goals, red cards, injuries that need a change, and half time. Mentality changes and substitutions are made while paused. Other matches in the human's division run in the same engine at the same minute; a latest-scores panel shows them, and the table is live at full time.

Fast path: every match nobody is watching, and the whole population sim, samples results from a table calibrated from the minute engine (regenerated by a script whenever match tunables change). A test asserts that the minute engine and the fast path agree on result distributions, goals per game and the size of home advantage, so the 500-career simulation stays fast and honest.

The tenure model reads results exactly as before. What the player controls now: which jobs to chase and what to promise; contract terms; summer spend and rebuild timing; formation, XI, mentality and substitutions; press and board responses; whether to take the approach; when to walk.

## Validation targets

The model is right when the AI population looks like the real one. Simulate 500 AI careers with no human and check:

- Median first-spell length ≈ 1.5 seasons; ~30% of first spells end inside a season.
- ~40–50% of first-time managers never get a second job.
- Median career ≈ 6–8 seasons across three or four clubs; ~10% reach 20 seasons; a handful pass 1,000 games.
- At any moment, two to four top-tier managers have tenure over five years.
- Unjust sackings ≈ 20–30% of all sackings.
- Age: nobody is employed past the cap; of managers still working at 60, most are out of the game by 68; the population stays stable with a new cohort each summer.
- Match: goals per game ≈ 2.7; home win / draw / away win ≈ 45 / 26 / 29; yellow cards ≈ 3–4 a match, reds ≈ 0.2 — all to verify against real league averages. Across the AI population, no formation's points per game exceeds the mean by more than 10% when its squad fits it. The minute engine and the fast path agree within tolerance. A match plays in about a minute at full speed.

These are starting targets from memory, to verify against the LMA's end-of-season figures before locking in. Encode them as tests.

## Build phases

0. This document. CLAUDE.md. Repo.
1. Engine (TypeScript, pure, seeded): world gen, managers, tenure, career, market, season sim. CLI: `sim --careers 500` prints the validation stats. Tune until they pass.
2. Browser play: same engine, one human manager, the inbox as plain unstyled HTML, deployed to GitHub Pages. Play it in Safari. If "one more season" doesn't happen, fix the model, not the UI.
3. Match layer, in four PRs: (a) fixtures and one match per turn, with home advantage as an explicit tunable in the existing match model; (b) players, positions, formations and selection, with the one-shot model taking effective XI, bands and width until (c) replaces it; (c) the minute engine, the fast path and their validation; (d) the match view, squad and tactics screens, fixtures tab and latest scores — unstyled.
4. Claude Design: match view, squad, inbox, job market, contract talks, career page, obituary. Restraint; typographic; no dashboards.
5. Web app: the designed shell replaces the unstyled one; JSON saves, shareable career page.
6. Transfers and depth: named transfers against the budget, strength derived from the squad, scouting, contracts, foreign leagues simulated.
7. Meta: Hall of Fame across careers, obituary generated from the event log, shared leaderboard.

## Tunables

Every constant above lives in one file (`tunables.ts`), each with a comment naming the validation target it serves.
