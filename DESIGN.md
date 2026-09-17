# TENURE — design bible v0.5

Working title. A football management game about surviving a career. Depth of Football Chairman Pro 2; texture of Championship Manager 01/02.
FEATURES.md lists what that means system by system, and what is deliberately out. It is the target; this document is the rules.

## Premise

You are a manager. You start with no record. Clubs are episodes; the career is the game.
The career ends when nobody will employ you (permadeath), or when you choose to retire.
Success is measured three ways: how long you lasted, how much you earned, what you won.

## The score

Four numbers, always visible:

- **Years / games managed**
- **Career earnings** — salary, bonuses, and payouts when sacked
- **Trophy points** — see table below
- **Players made** — see Your players

Composite for leaderboards: `Legacy = a·games + b·earnings(£m) + c·trophy points + d·players made`.
Tune the weights so that a 30-year mid-table career, a 12-year trophy-laden career and a 30-year career making players at small clubs land within ~20% of each other. There are two legitimate careers — the climber and the maker — and the score must let either win.
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

The next fixture is always on screen: competition, opponent, venue, date, the opponent's form and league position. A fixtures tab lists the season's fixtures and results by competition, with the table beside it. Cup draws arrive in the inbox. AI clubs in the human's division play at the same time as the human, and their scores tick over during the match (see Match).

## Turn structure

One match per turn. Continue plays the next fixture; everything due before it — board, agent, press, transfers, cup draw, injuries and suspensions — arrives first as inbox items and decisions. Weeks with no fixture (international breaks, cup rounds you are out of, the summer) pass as single steps with their own inbox. A season is the league games plus cup ties plus around ten non-match steps.
Target pace: a match in about a minute at full speed; a season in under an hour; a career in a long weekend.

## Players

Every home club has a squad: 22 players in tiers 1–2, 20 in tiers 3–4, 18 in tier 5. Foreign clubs get a squad generated on demand, seeded, when they meet a home club.

A player: name, age, nationality, position and side, rating 1–100, hidden potential, condition 0–100, morale, injury (weeks out), suspension (matches), yellow cards this season, contract (years, wage), value, up to two traits, season and career statistics, history.

- Rating is the number. Traits are the texture: zero to two per player from a list of twelve — poacher, playmaker, pace, aerial, tough tackler, leader, big-game, consistent, versatile, loyal, injury-prone, hot-headed. Each trait is exactly one rule in the engine (poacher raises conversion; leader lifts the XI's morale; hot-headed raises cards; injury-prone raises injury risk; versatile halves positional penalties; loyal takes less money to stay with, or follow, the manager he is bonded to — see Your players), and a test fails on any trait no rule reads.
- Position: GK, D, M or F; side L, C, R or any. Playing an adjacent role (D at M, M at F) costs −15 rating, a distant one −30, the wrong side −5 (tunables).
- Potential is hidden. A scout report gives it as a range whose width depends on the club's scouting level (see Club).

The rule that keeps the validated world intact until phase 4: **club strength stays the master number.** A squad is generated to match it — the best XI in the club's preferred formation averages the club's strength — and is re-anchored each summer, with players ageing (peak 26–30, decline from 31, goalkeepers from 33) and developing toward potential under 24 at a speed set by the club's coaching level. The human's club is the exception: match strength comes from the XI actually picked, with positional penalties, condition and morale applied. AI clubs pick their best XI by the same rule. Phase 4 reverses the direction: strength derived from the squad, named transfers against the budget.

Condition drops with minutes played and recovers with rest; below 80 it costs rating, below 70 it raises injury risk. Injuries come from matches and last 1–20 weeks, shortened by the medical level. Suspensions: five yellows is one match, ten is two; a red is one to three. Morale moves with playing time, results, contract state and events.

Every player who plays gets a match rating out of 10 from his events, his side's result and minutes; average rating to two decimals. Per season: appearances, goals, assists, cards, rating. Career history season by season, club by club.

Selection: a formation, an XI, a captain, and a bench of five with three substitutions. The assistant auto-picks in one tap and proposes changes in the pre-match step when injuries or suspensions force them.

Contracts: renew (wage and years) or release. A player whose rating has outgrown his wage asks for a new deal; a player short of playing time asks to leave. Both are decisions with morale consequences that feed the tenure model's fallout events. Until phase 4, the summer window stays abstract: spending the budget raises squad strength by improving or adding generated players, and the engine picks which.

## Your players

The premise makes clubs episodes. Players are the thread that runs through a career, and the thing a manager keeps that no board can take away.

- **Tagging.** A player becomes yours the moment you sign him, give him his first-team debut, or promote him from the academy. The tag is permanent and records the club, the date, the circumstance and his rating that day.
- **Making.** Players under 24 grow toward potential only with minutes: a season of starts moves a player a full step toward his potential (tunable), a season on the bench moves him nowhere. Growth speed also follows the club's coaching level (phase 5) and the manager's development ability. Growth is visible: his match ratings rise across the season and the squad screen marks the change. This is the manager's real dilemma — the nineteen-year-old you will be remembered for costs points today, and points today are what keep you employed.
- **They keep living.** Once tagged, a player's career keeps running after you leave, and his milestones reach your inbox wherever you are — a transfer above a fee threshold, a promotion, a cup final, a title, a retirement — each line naming the club where you made him.
- **Players made** is the fourth line of the score. Points for growth achieved while a player was with you, weighted up for players you debuted or promoted and down to almost nothing for players bought at 70 or above (you did not make him), plus later milestones: playing in a tier above the one he debuted in, a transfer above the threshold, a top-tier or European title, a season award (phase 6). The line is normalised against the other three (see The score). Players-made points also feed reputation and the youth-developer tag, which is how a maker gets the bigger job — the way clubs with academies and small budgets hire.
- **Following you.** Every tagged player has a bond that grows with starts, a debut, a promotion, a renewal and any decision that backed him (a fallout where you took his side). When you take a new job, up to two players with a bond above the threshold, at clubs that would sell and on wages your new club can pay, ask to follow you; the old club sets an asking price and the press notices. The loyal trait lowers the wage he asks. This is how a manager carries a nucleus through a career, and how a striker found in tier five ends up in the top flight ten years later, still yours.
- **The career page becomes a record of people.** Beside spells, honours and earnings: players made, ordered by growth under you, each with what became of him. The obituary names the three he is most remembered for. The Hall of Fame keeps a makers' list beside the trophy list.

Every AI manager runs on the same rules, with a youth-first or results-first lean as part of their identity, so the population contains makers to compare against.

## Formations and tactics

A tactic is three choices: a formation, a mentality and a style.

- Formations, the CM 01/02 set: 4-4-2, 4-4-2 diamond, 4-3-3, 4-5-1, 4-2-4, 4-1-3-2, 4-3-1-2, 3-5-2, 3-4-3, 5-3-2, 5-4-1, and 5-3-2 with a sweeper (to verify against the game's default list). Each is counted in three bands — defence, midfield, attack — and by width. Advantages come from structure: the midfield difference drives pressure; attackers against defenders drive chance quality; width against a narrow defence adds chances from the flanks; a defensive overload reduces chances conceded. So 4-5-1 wins the midfield against 4-4-2 but creates less; 4-2-4 makes chances and concedes them; 3-5-2 is strong through the middle and open on the flanks; 5-4-1 concedes little and scores little.
- Mentality: defend, balanced, attack. Shifts every band's weight and the pressure lean.
- Style, one rule each: possession (more pressure with a higher-rated XI, fewer but better chances), direct (chances from pace and aerial traits, more shots of lower quality), counter (chances after sustained defending, lower own pressure), pressing (more pressure, faster condition drain, more fouls).

No player instructions, arrows or set-piece takers. Every AI manager runs a preferred formation and style, part of their identity, and changes mentality by rule when chasing or protecting a result. Before each match the assistant gives an opposition report: formation, style, key players, form, absentees. The validation target: across the AI population, no formation or style beats the mean points per game by more than 10% when its squad fits it.

## Match

The engine runs minute by minute, 0 to 90 plus stoppage. State: score, minute, pressure (a lean from −100 to +100), the two XIs with condition draining, cards, injuries, substitutions used, running stats.

Each minute:
- Pressure drifts toward a target set by effective XI strength by band, the midfield difference, mentality, style, home advantage (a lean of 8 to the home side, tunable, to verify against real home-win rates), the score state (a leading side sits deeper unless attacking) and momentum from the last few events.
- A chance may arise from pressure and the attack-versus-defence bands. The players involved are drawn by position and rating, weighted by traits — poachers finish more, playmakers assist more, pace and aerial traits fit the direct style. It resolves to a goal, a save, a miss or a block from the attacker's rating against the keeper's and defenders'. Every chance and event is a commentary line from templates naming the players.
- Fouls and cards follow the pressing style, tough-tackler and hot-headed traits and the referee; injuries follow condition and the injury-prone trait; substitutions happen, AI managers by rule — injured, condition below 60, chasing or holding.
- Stats accumulate: shots, on target, possession, corners, fouls, cards. Pre-match odds come from the fast path's probabilities.

Pace and control: the match runs at full speed — CM with the space bar held — with hold-to-run and pause. It pauses on its own at goals, red cards, injuries that need a change, and half time. Mentality changes and substitutions are made while paused. Other matches in the human's division run in the same engine at the same minute; a latest-scores panel shows them, and the table is live at full time.

Fast path: every match nobody is watching, and the whole population sim, samples results from a table calibrated from the minute engine (regenerated by a script whenever match tunables change). A test asserts that the minute engine and the fast path agree on result distributions, goals per game and the size of home advantage, so the 500-career simulation stays fast and honest.

The tenure model reads results exactly as before. What the player controls: which jobs to chase and what to promise; contract terms; summer spend and rebuild timing; formation, mentality, style, XI and substitutions; player contracts; press and board responses; whether to take the approach; when to walk.

## Transfers (phase 4)

- A market: every player in the home pyramid, searchable by position, age, rating, price and availability; transfer-listed players and free agents flagged; a shortlist. A scout report on any player gives a potential range and a recommendation, with reach and accuracy set by the scouting level.
- Buying: the selling club's asking price, then at most two rounds — offer, counter, accept or reject. Loans for a season with a wage share. Free agents sign for wages alone. A contract is a wage and a length; the player accepts if the wage meets his demand (rating, age, tier) and he expects to play. No agents, clauses or instalments.
- Selling: list a player at an asking price and receive bids; AI clubs also bid unprompted for your best players; refuse a player three times and he is unsettled.
- Two windows, summer and January. Nothing moves between them.
- Budgets: transfer and wage budgets from the board by tier and wealth. The direction of strength flips here — club strength is derived from the squad — and AI clubs trade toward the level their wealth sets, so the population targets hold. That is tested.

## Club (phase 5)

Four levels, 1 to 5: coaching (development speed), scouting (search reach and potential accuracy), medical (injury length), academy (youth intake quality). Wealth sets them; once a season the manager can ask the board to raise one, which is a credit gamble — a refusal costs credit, and a raise granted lifts expectation. Youth players arrive each summer from the academy level. Money is the board's business, reported in the inbox: balance, income by tier, attendance and prestige, wages, transfers; attendance grows with success. No stadium building or ticket prices. Insolvency is a shock, as specified in the tenure model.

## Media, awards and history (phase 6)

The inbox exists. Add rumours; monthly and season awards (player, manager, team of the month; player of the year, top scorer, manager of the year), which feed reputation and tags; histories for clubs, players and managers; competition records; and the game's all-time list beside the manager's own career page.

## Validation targets

The model is right when the AI population looks like the real one. Simulate 500 AI careers with no human and check:

- Median first-spell length ≈ 1.5 seasons; ~30% of first spells end inside a season.
- ~40–50% of first-time managers never get a second job.
- Median career ≈ 6–8 seasons across three or four clubs; ~10% reach 20 seasons; a handful pass 1,000 games.
- At any moment, two to four top-tier managers have tenure over five years.
- Unjust sackings ≈ 20–30% of all sackings.
- Age: nobody is employed past the cap; of managers still working at 60, most are out of the game by 68; the population stays stable with a new cohort each summer.
- Match: goals per game ≈ 2.7; home win / draw / away win ≈ 45 / 26 / 29; yellow cards ≈ 3–4 a match, reds ≈ 0.2 — all to verify against real league averages. The minute engine and the fast path agree within tolerance. A match plays in about a minute at full speed.
- Players and tactics: the best XI per club averages club strength (until phase 4); every trait is read by a rule; match ratings average ≈ 6.9 with a spread of about 0.6; no formation or style beats the mean points per game by more than 10%.
- Your players: across the AI population, the best maker's Legacy lands within 20% of the best trophy-winner's; buying finished players yields under 10% of players-made points; follow-you moves average about one per two job changes and never exceed two per move; a player under 24 who starts a season gains at least three times the rating of one who sits it out.
- After phase 4: the population targets still hold with strength derived from squads. After phase 5: fewer than 2% of clubs are insolvent in any season.

These are starting targets from memory, to verify against the LMA's end-of-season reports and real league statistics before locking in. Encode them as tests.

## Build phases

0. This document. CLAUDE.md. Repo. (done)
1. Engine, headless sim, validation. (done)
2. Browser play, deployed to GitHub Pages. (done)
3. Match layer. (a) fixtures and one match per turn (done); (b) players, traits, positions, ratings, contracts, formations and tactics, tagging, growth with minutes, milestone news, the players-made line and its career-page list, with the one-shot model taking effective XI, bands, width, mentality and style until (c) replaces it; (c) the minute engine, the fast path, their validation; (d) the screens — squad, player profile, tactics, pre-match with the opposition report, the match view with commentary, stats, latest scores and controls — unstyled.
4. Transfers, including players who follow you.
5. Club levels, youth, money.
6. Media, awards, histories; the obituary's three names and the makers' list.
7. Claude Design, then the designed web app replaces the unstyled one; JSON saves, shareable career page.
8. Meta and world: Hall of Fame across careers, the obituary from the event log, shared leaderboard, international management, foreign leagues simulated.

## Tunables

Every constant above lives in one file (`tunables.ts`), each with a comment naming the validation target it serves.
