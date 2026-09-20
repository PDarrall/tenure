# TENURE — design bible v0.11

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

Trophy points (starting values): Champions Cup 120 · Europa Cup 70 · Conference Cup 40 · tier-1 title 100 · the Cup 50 · the League Cup 25 · tier-2 title 40 · tier-3/4/5 titles 25/15/10 · promotion without the title 20/12/8/5 by tier.
tier-2 title 40 · tier-3/4/5 titles 25/15/10 · promotion without the title 20/12/8/5 by tier.

## World

Fictional, generated, English-style pyramid. A 30-year world is fictional after year three anyway.

- Tier 1: 20 clubs. Tiers 2–4: 24 clubs each. Tier 5 ("non-league"): abstracted pool of 24.
- No foreign leagues. There are no jobs, careers or clubs abroad. European opponents are generated for each competition and round, squad included, with strength drawn by competition and round from a tunable distribution so the trophies are hard.
- Cups, real formats under the game's own names (the real ones are trademarks):
  - **The Cup** (FA Cup format): every club. Tiers 4–5 enter in round one, tier 3 in round two, tiers 1–2 in round three; single ties, no replays; weekends; semi-finals and the final at a neutral ground. The winner goes to the second European competition.
  - **The League Cup** (EFL Cup format): tiers 1–4. Tiers 2–4 enter in round one, tier 1 in round two, tier-1 clubs in Europe in round three; midweeks; two-leg semi-finals; a final. The winner goes to the third European competition.
  - **Europe**, three competitions, midweeks: the **Champions Cup** for the top four of tier 1, the **Europa Cup** for fifth and the Cup winner, the **Conference Cup** for sixth and the League Cup winner (a place passes down the table when a club has already qualified). Each is groups of four, six matches, then two-leg knockouts and a one-off final. Prize money and prestige follow the round reached.
- The calendar is 52 weeks. Weeks 1–41 are the season, August to May: league at weekends, the League Cup and Europe midweek, the Cup on its weekends. Weeks 42–52 are the summer: the window, awards, expiries, the new season's fixtures. Every fixture is scheduled inside those weeks with no club playing more than twice in a week, and that is tested.

Club: name, city, tier, prestige (0–100, slow-moving), wealth (0–100), owner {type: patient | normal | impatient | erratic, ambition}, fan patience, squad, wage budget, stadium capacity, honours, rivals[].

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

0–20 non-league · 20–40 tier 4 · 40–60 tier 3 · 60–75 tier 2 · 75–90 tier 1 · 90+ elite.
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

Vacancies carry a want-list of tags. This is typecasting: the survival specialist gets the relegation jobs, the big-club failure rarely gets a second big club.

### Job market

- Vacancies arise from AI sackings, resignations, poaching chains, and expiries. Each has: club, owner type, expectation, budget, contract offer (one to four years; salary by tier × reputation), and a shortlist of three to five managers drawn from those qualified (reputation, tag fit, agent quality, randomness).
- The player sees every vacancy, can apply to any, is told when shortlisted, and interviews.
- Interview: three choices set the terms. Promise "top half" → normal budget. Promise "promotion" → +30% budget, expectation +3 places. Promise "stability" → −10% budget, expectation −2 places. Ask for a longer contract → lower salary; shorter → higher salary.
- Approaches while employed: a bigger club calls. Accept (buy-out paid by them, "in demand") or decline (credit +3 at your club, loyalty progress).
- Your agent applies for you. Every week you are out of work he puts you forward for the most relevant vacancy — the best fit of tier within your band, tag match and the club's need — and the application appears in your inbox. You can withdraw it, or apply to other vacancies yourself.
- Unemployed, each month: wait | punditry (small income, halves decay) | assistant role (income, −5 once, decay stops). Waiting is a bet.
- The start: on day one your agent has one offer ready — a club at the bottom of your band, or one in crisis, with its terms on the table. Take it and manage from the first turn, or decline and start unemployed with the agent applying weekly. This guarantee holds only at the start of a career; after that the market decides, which is what makes permadeath possible.

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

One match per turn. Continue plays the next fixture; everything due before it — board, agent, press, transfers, cup draw, injuries and suspensions — arrives first as feed posts and decisions. Weeks with no fixture pass as single steps with their own posts; a week with nothing in it passes as one line. The year is 52 weeks (see World): 41 of season, 11 of summer, and the summer's steps are where the window, the awards and the expiries happen.
Target pace: a match in one press, or about a minute if watched; a season in half an hour; a career in a weekend.

## Players

Every club has a squad of 25 at every tier, plus academy players. Foreign opponents in the European competition are generated for the tie, squad included.

Generated squads follow realistic shapes: of 25, about 3 GK, 8 defenders, 9 midfielders, 5 forwards, with a spread of sides. Depth falls away below the XI, and further down at lower tiers — a tier-5 squad is a strong XI and little else.

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

Pace and control: a toggle on the match screen. To full time, the default, runs the match to its result in one press behind a brief ticker, the assistant applying the defaults to anything that would have needed a decision. To key events pauses at goals, red cards, injuries that need a change, half time and full time, and mentality changes and substitutions are made while paused. The engine still simulates every minute; the interface never shows them one by one. Other matches in the human's division run in the same engine at the same minute; latest scores update at each pause, and the table is live at full time.

Mismatch and upsets. The gap between two sides is real and never decisive on its own.

- The strength difference maps to expected goals through a saturating curve, not a straight line: a 10-point gap is worth about half a goal, 30 points about a goal and a half, 60 points about two and a half, and nothing beyond three. Chance quality saturates the same way — a much better side takes many more shots, but the marginal ones are poor.
- A leading side eases off: at two clear, its pressure target falls; at three, further, and its substitutions turn to rest. A trailing side commits, which raises both its chances and the ones it concedes.
- Every match carries variance the manager cannot see: each side draws a performance level for the day, wider at lower tiers and in cups, so any side can have a night. Keeper form is drawn separately, because one goalkeeper decides more upsets than any other cause.
- Cup ties raise the underdog's variance and shorten the favourite's edge — the crowd, the pitch, one game and nothing to lose.

Fast path: every match nobody is watching, and the whole population sim, samples results from a table calibrated from the minute engine (regenerated by a script whenever match tunables change). A test asserts that the minute engine and the fast path agree on result distributions, goals per game and the size of home advantage, so the 500-career simulation stays fast and honest.

The tenure model reads results exactly as before. What the player controls: which jobs to chase and what to promise; contract terms; summer spend and rebuild timing; formation, mentality, style, XI and substitutions; player contracts; press and board responses; whether to take the approach; when to walk.

## Transfers (phase 4)

Two windows: summer, from the last match of one season to the end of the third week of the next; January, the calendar month. Nothing moves outside them except free agents, who can sign at any time.

No budget is not no market. A club with nothing to spend still has three routes, and the director leads with them when the pot is empty: **free agents**, signable in or out of a window for wages alone, released players and expiries, better the later a summer runs; **loans**, a season or half a season, the parent club paying part of the wage, sometimes with a fee; and **exchanges**, a player out for a player in. Wage room, not cash, is the constraint on all three, and a club with no wage room either has only the academy. Loans carry their own bet: the parent club can recall an in-form player mid-season, and a loan that goes well raises the fee if you try to buy him.

The director of football runs the market; the manager decides. Every club has a director of football with a judgement rating set by the club's scouting level and wealth. In a window he brings up to three recommendations a week, each a card: the player — name, age, position, rating and potential as ranges narrowed by the club's scouting level, traits — the fee and wage, the reason (the squad's need, the manager's request, or a bargain), his confidence in three words (sure thing, likely, gamble), and the budget after. The manager approves, declines, or asks for a different profile. An approved bid negotiates itself with one roll on the selling club and one on the player, and the answer arrives next turn. Sales work the same way: the director proposes a sale when a bid arrives, when the wage bill is over budget, or when a player is unsettled; the manager approves or refuses — and refusing a big bid for an unsettled player has its own downside.

**On arrival.** The director's first cards come the week you take a job, not at the next window: his assessment of the squad — the two positions that need cover, the players he would sell — and his first recommendations. In a window they are bids. Outside one they are free agents you can sign now, plus targets he lines up for the window, agreed in principle and confirmed when it opens.

Every signing is a bet. His true rating and potential differ from the director's estimate by an amount scaled by the director's judgement, and they reveal over his first five matches. A hit lifts credit and reputation; a flop costs credit — the board question your signings — and wages for the length of the contract. A player sold who shines elsewhere costs reputation. The pot stays: transfer and wage budgets from the board by tier and wealth; the director keeps inside them; anything beyond is a request (see Requests).

AI clubs run the same director model, and their trading moves squads toward the level their wealth sets, which is what lets club strength be derived from the squad from this phase on. The population targets must hold through the flip, and that is tested.

## Requests

Requests live on their own screen, reached from Career, never on Home. Each is a bet with a stated likelihood, a short-term cost and a long-term effect on the card, in the decision-card format. One request to the board a month; a refusal cannot be repeated for three months. Granted requests raise expectation; refusals cost credit; a third refusal in a season adds progress toward "difficult".

To the board:
- **Transfer budget** — cash now; expectation up.
- **Wage budget** — room for a signing or a renewal; expectation up.
- **Expand the stadium** — a cash hit and a season of reduced capacity, then more attendance and income every season after; wealth rises over three seasons. Likely when attendances run near capacity and the club is solvent.
- **Coaching** — the coaching level up one: faster development. **Academy** — better youth intake. **Medical** — shorter injuries. **Scouting** — better reports and a sharper director.
- **Back me** — public backing in a dispute with a player or the press: credit up if granted, the dispute ends; a refusal is itself news.
- **A new contract** — length and salary; a longer deal buys patience and payout, and lifts expectation.

To the director: a target profile, a named player from the shortlist, sell a player, loan a player out, open contract talks with a player.

To players: a new contract, the captaincy, a promise of playing time. A promise unkept is a fallout.

## Decisions are bets

Nothing in this game is safe. Every decision card shows, for each option, what it will likely do, what could go wrong, and how confident the adviser is — in words, not numbers — and then the seeded dice decide. The roll and its outcome go in the event log, so the career page can say which gambles paid. The default option, the one Continue applies, is always the lowest-variance choice, never the best one: the cautious path costs upside, and the game says so on the card.

This applies to every decision the game already has — the interview promise, the approach, the press question, the board warning, the fallout, the contract, the substitution, the kid in the eleven — and to every one transfers add. Results were always a roll; now so is everything else.

Validation target: for each decision type, across the AI population, the bold options' mean effect lands within 10% of the cautious options', with at least 1.5× the variance. Gambles are fair, not free.

## Interface

The design canvas ("Tenure") is the reference. `design/v2/` holds its export — the tokens, the component specifications, the copy rules, the eight-press script and the artboards — and `apps/web/src/styles.css` carries the tokens. These rules win over anything in the current app.

- **Result first.** On the match screen a toggle sets how Continue plays the match. *To full time* (the default): one press, straight to the result behind a brief ticker of minutes and goals; forced in-match decisions don't exist, the assistant applies the defaults. *To key events*: each press plays to the next pause — goal, red card, injury needing a change, half time, full time — so you can change mentality or make a substitution while paused. There is no minute-by-minute mode. The choice persists across matches until you change it.
- **Home is a feed, not an inbox.** The next fixture and any decision are pinned at the top. Below, in a region that scrolls, posts newest first: results as score cards, the chairman, the press, the agent, the league, a player, the staff — one or two lines each, the week's stamp, and the fans' reaction as a count with a direction. Sources are monograms, never crests or faces. The top of the feed is the state of your world.
- **Text is rationed.** No post over 140 characters. No paragraphs. Numbers and marks before words. Enough to understand, never the whole explanation. After three defeats the chairman posts "Three defeats. We notice." — not a letter. The templates in `text/*.json` are held to this budget.
- **Contained.** Every tab's primary state fits 390 × 844 with no page scroll; only the feed and lists scroll, inside their region. The table shows your club and its neighbours, the full table a tap away. Fixtures show the next and the last, the season a tap away. Tactics shows the eleven as a shape, not a list.
- **Fun, not work.** Colour carries meaning: green for a win, amber for a draw, the accent for a loss and for what is live — the running minute, a goal, pressure — and for what is yours. Form is five marks. Results land with a beat. Streaks and milestones are called out in the feed. Nothing looks like a form or a spreadsheet. Restraint holds: typographic, tabular figures, one accent plus the two result colours, no illustration, dark and light.
- **Five tabs, one tap each:** Home, Squad, Tactics, Fixtures (fixtures and results by competition, the table, the cups), Career (the four score lines, history, Requests, the job market when out of work). Requests never appear on Home; only their answers do.

Unchanged: one primary button on every screen, ink, its second line saying what it will do; a forced decision replaces it; decision cards show likely, downside and confidence per option with the default marked; the 390-point baseline, targets of 44 points or more, tabular figures.

## Club (phase 5)

Four levels, 1 to 5: coaching (development speed), scouting (search reach, potential accuracy and the director of football's judgement), medical (injury length), academy (youth intake quality). Wealth sets them; the manager can ask the board to raise one (see Requests). Youth players arrive each summer from the academy level. Money is the board's business, reported in the feed: balance, income by tier, attendance against capacity and prestige, wages, transfers; attendance grows with success and is capped by the stadium, which only a granted request (see Requests) expands. No ticket prices. Insolvency is a shock, as specified in the tenure model.

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
- Match: goals per game ≈ 2.7; home win / draw / away win ≈ 45 / 26 / 29; yellow cards ≈ 3–4 a match, reds ≈ 0.2 — all to verify against real league averages.
- Mismatch: no league match in a thousand seasons ends with a margin above 7; margins of 5 or more are under 1% of matches; within a division the bottom club beats the top club about one meeting in six, and draws one in five; across a two-tier gap in a cup the underdog wins about one tie in five; a tier-5 side beating a tier-1 side is about one tie in forty. Starting points, to verify against real cup records.
- Players and tactics: the best XI per club averages club strength (until phase 4); every trait is read by a rule; match ratings average ≈ 6.9 with a spread of about 0.6; no formation or style beats the mean points per game by more than 10%.
- Your players: across the AI population, the best maker's Legacy lands within 20% of the best trophy-winner's; buying finished players yields under 10% of players-made points; follow-you moves average about one per two job changes and never exceed two per move; a player under 24 who starts a season gains at least three times the rating of one who sits it out.
- Decisions: for each decision type, bold options' mean effect within 10% of cautious options', with at least 1.5× the variance. Signings: about 40% beat the director's estimate, about 25% fall short, scaled by his judgement (a starting point, not a real-world figure).
- Calendar and cups: 52 weeks a year, every fixture scheduled, no club plays more than twice in a week; a tier-5 club reaches the Cup's third round about once in twenty seasons; the Champions Cup is won by a home club about one year in five (starting points).
- Interface: a season is playable with Continue alone; a match is one press in To full time and four to six in To key events; no tab's primary state scrolls at 390 × 844; no post exceeds 140 characters.
- After phase 4: the population targets still hold with strength derived from squads. After phase 5: fewer than 2% of clubs are insolvent in any season.

These are starting targets from memory, to verify against the LMA's end-of-season reports and real league statistics before locking in. Encode them as tests.

## Build phases

0. This document. CLAUDE.md. Repo. (done)
1. Engine, headless sim, validation. (done)
2. Browser play, deployed to GitHub Pages. (done)
3. Match layer. (a) fixtures and one match per turn (done); (b) players, traits, positions, ratings, contracts, formations and tactics, tagging, growth with minutes, milestone news, the players-made line and its career-page list, with the one-shot model taking effective XI, bands, width, mentality and style until (c) replaces it; (c) the minute engine, the fast path, their validation; (d) the screens — squad, player profile, tactics, pre-match with the opposition report, the match view with commentary, stats, latest scores and controls — unstyled.
4. Transfers: the windows, the director of football, requests, decisions as bets retrofitted to every existing decision, players who follow you, and the flip to strength derived from the squad.
5. Club levels, youth, money.
6. Media, awards, histories; the obituary's three names and the makers' list.
7. Claude Design, then the designed web app replaces the unstyled one (done, v1); the redesign — the feed, the ticker, the watched match, the contained tabs (`design/v2/`) — replaces it; JSON saves, shareable career page.
8. Meta and world: Hall of Fame across careers, the obituary from the event log, shared leaderboard, international management.

## Tunables

Every constant above lives in one file (`tunables.ts`), each with a comment naming the validation target it serves.
