# TENURE — design bible v0.1

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

### Permadeath

The career ends when no vacancy has shortlisted you for 24 consecutive months, at 72, or on a scandal event. The score is banked. Retire voluntarily at any time.

## Season and match (v1 abstraction — no players yet)

- Match: home/away strengths, form (last six), tactic matchup (three shapes, rock-paper-scissors ±5%), mentality (attack / balanced / defend shifts variance), manager ability. Produces win/draw/loss probabilities and a scoreline; a text summary from a template library.
- Squad: strength, age profile (peak 25–29; ageing squads lose 3–5 per year), morale. Summer window: spend budget to raise strength (diminishing returns), sell to raise cash, promote youth (cheap, slow, tag progress). Turnover feeds ownership.
- Season: 38 or 46 league games, cups, two windows, ~40 weekly turns.

What the player controls in v1: which jobs to chase and what to promise; contract terms; summer spend, sales and rebuild timing; a shape and a mentality per match; press and board responses; whether to take the approach; when to walk. That is enough to be a game. Players and transfers arrive in phase 5.

## Turn structure

One week per turn. The screen is an inbox: board, agent, press, staff, match report. Most weeks: one match, zero or one decision.
Target pace: a season in twenty minutes, a career in about ten hours.

## Validation targets

The model is right when the AI population looks like the real one. Simulate 500 AI careers with no human and check:

- Median first-spell length ≈ 1.5 seasons; ~30% of first spells end inside a season.
- ~40–50% of first-time managers never get a second job.
- Median career ≈ 6–8 seasons across three or four clubs; ~10% reach 20 seasons; a handful pass 1,000 games.
- At any moment, two to four top-tier managers have tenure over five years.
- Unjust sackings ≈ 20–30% of all sackings.

These are starting targets from memory, to verify against the LMA's end-of-season figures before locking in. Encode them as tests.

## Build phases

0. This document. CLAUDE.md. Repo.
1. Engine (TypeScript, pure, seeded): world gen, managers, tenure, career, market, season sim. CLI: `sim --careers 500` prints the validation stats. Tune until they pass.
2. Terminal play: same engine, one human manager, inbox in text. Play it. If "one more season" doesn't happen, fix the model, not the UI.
3. Claude Design: inbox, job market, contract talks, career page, obituary. Restraint; typographic; no dashboards.
4. Web app: engine package plus React shell, JSON saves, shareable career page.
5. Depth: players and transfers (the CM layer), tactics, commentary, foreign leagues simulated.
6. Meta: Hall of Fame across careers, obituary generated from the event log, shared leaderboard.

## Tunables

Every constant above lives in one file (`tunables.ts`), each with a comment naming the validation target it serves.
