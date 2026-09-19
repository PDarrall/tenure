# Assumptions

Where DESIGN.md is ambiguous the engine takes the simplest reading. Each
reading is listed here, by system, so it can be challenged. CLAUDE.md asks for
these in the PR description; phase 1 is built as one commit per system on a
single branch, so they live here instead.

## Scaffold

- The design documents were renamed to `CLAUDE.md` and `DESIGN.md` (uppercase)
  so that tooling finds them.
- Phase 1 is delivered as one commit per system on one branch, as agreed,
  rather than one pull request per system.
- `population.test.ts` runs in its own CI job that is allowed to fail until
  the model is tuned. Every other test blocks.
- The RNG is xoshiro128** seeded via splitmix32. Its state is four unsigned
  32-bit integers stored inside the world state, so a saved game resumes on
  exactly the same sequence.

## World gen

- Tier 5 ("non-league pool") is a real 24-club division simulated like
  the others, so it is the bottom of the pyramid with no relegation out.
- Foreign leagues are lists of named job slots with a prestige and a
  strength, not simulated teams. (Settled by DESIGN.md v0.6 § World: there are no foreign leagues, jobs or careers abroad; the European competition's opponents are generated for each tie.)
- Rivals are drawn within one of twelve fictional regions, up to two per
  club, symmetric.

## Managers

- Foreign club slots are filled from the same 400-strong pool, so
  vacancies abroad arise the same way as at home. (Settled by DESIGN.md v0.6 § World: there are no foreign leagues, jobs or careers abroad; the European competition's opponents are generated for each tie.)
- "Coach starts with no name" is a reputation offset; "ex-pro" gets a
  small positive one.
- Entrants' reputation is capped so that nobody qualifies above tier 4 on
  day one, matching "you start with no record".
- Elite clubs are the six highest-prestige tier-1 clubs at the moment of
  the check.

## Season sim

- A season is 40 match weeks plus 6 summer weeks. Every tier shares the
  weeks; tier 1 plays 38 rounds with two blank weeks, tiers 2–5 play 46
  rounds with six double weeks, and cup ties land on top, so a club can
  play two or three matches in a week. (DESIGN.md v0.2 § Turn structure
  makes each of those matches its own turn; see Match layer below.) (Settled by DESIGN.md v0.10 § World: a 52-week year, 41 of season and 11 of summer, with every fixture scheduled by a template so no club plays more than twice in a week; the Cup, the League Cup and three European competitions in real formats.)
- Three up, three down at every tier boundary, no play-offs. Nothing is
  relegated out of tier 5.
- Cups are single-leg knockouts with random draws and byes in the first
  round; level ties go to a shoot-out weighted by strength. Every club
  enters the national cup in round one. (Settled by DESIGN.md v0.10 § World: tiered entry, single ties in the Cup, two-leg semi-finals in the League Cup, groups then two-leg knockouts in Europe.)
- The European competition is a 32-club knockout: five home clubs (top
  four of tier 1 plus the cup winner, or fifth place) and 27 foreign
  clubs picked by strength. Foreign leagues are settled once a season by
  ranking strength, manager ability and noise; a season abroad counts as
  34 games. (Settled by DESIGN.md v0.6 § World: there are no foreign leagues, jobs or careers abroad; the European competition's opponents are generated for each tie. DESIGN.md v0.10 § World replaces the one 32-club knockout with three competitions of groups of four then two-leg knockouts.)
- Goals are Poisson from an expected-goals figure driven by the strength
  gap, form, morale and tactical ability; expected points come from the
  same distribution, so credit is judged against the model's own odds.
  (Stands until phase 3(c): DESIGN.md § Match replaces it with the minute
  engine and a fast path calibrated from it.)
- Attack and defend mentalities scale both sides' expected goals up or
  down (variance only); the AI attacks weaker sides and defends against
  stronger ones. Each manager has a fixed preferred shape. (Settled by
  DESIGN.md v0.5 § Formations and tactics, built in phase 3(b): a tactic
  is a formation, a mentality and a style; every AI manager has a
  preferred formation and style; shapes are gone.)
- Summer: academy gains from last summer are released, the squad ages a
  year, ageing squads lose 3–5 and young ones gain 1, strength gravitates
  toward the wealth target, then the window spends the whole budget with
  diminishing returns and churns the first XI. The winter pot is 30% of
  the normal budget. Net spend is ranked within the division as played.
  (DESIGN.md v0.5 § Players keeps the window abstract until phase 4 and
  makes club strength the master number that squads are anchored to.
  Settled by DESIGN.md v0.7 § Transfers: the director of football trades
  real players against real budgets, AI clubs included, and strength is
  derived from the squad.)
- Match summaries are stored as a template key on the event and rendered
  on demand from text/match.json; rendering never draws from the RNG.

## Tenure

- Genesis incumbents have already served 0–4 seasons (staleness applies)
  and hold 1–3 years of contract; their ownership is 0.35 per season served.
- A contract signed mid-season counts that season as its first year; one
  signed in the summer starts with the season about to begin. Contracts end
  on the season-end week. Payout is salary × weeks left / season weeks.
- "Deserved" means the manager has spent eight or more weeks of the spell
  below the threshold, counted cumulatively rather than consecutively, at
  the moment of sacking, or has collapsed to the instant-sack line (credit
  5). Takeover replacements are always unjust.
- The board rolls every week, including summer weeks.
- Expectation: beating or meeting the target sets next target = finish;
  missing it eases the target one place, but never past the structural
  target and never tighter. A promoted or relegated club restarts from the
  structural target plus ambition. The structural target is the squad's
  strength rank after the summer window.
- The ceiling is 100 for seasons one to three and 90 for season four; the
  credit clamp to a lowered ceiling is applied after the summer window, so
  a big turnover that resets the ceiling keeps the credit.
- "Beat a top-three side" reads the opponent's position at kick-off. Monthly rolls (shocks, gap check, mutual consent) happen every
  four match weeks and not in the summer.
- Trophies count for credit and reputation only for the spell they were
  won in (honours record the club).
- The season-end reputation move (±2 per place, clamped ±8) is measured
  against the structural expectation, the squad's strength rank, rather
  than the board's ratcheting target. Credit uses the board's target.
  Measured against the board's target the whole population's reputation
  drained by about two places a season.
- Blame applies while fewer than two seasons of the spell are complete.
- Cup ties: points are 3 for the winner (shoot-outs included) and 0 for
  the loser; expected points fold the shoot-out into the win chance.
- "Beat a top-three side" reads the opponent's current position in its own
  division. "Derby" means the opponent is in the club's rivals list.
- A financial crisis multiplies the next summer budget by 0.6 and the
  multiplier returns to the promise level after that window.
- Fallout triggers once per losing run of four; the AI sells the player
  when its motivation ability is below 50, else backs down (morale −10).
  Both count toward "difficult".
- Board rows: 5% a month while credit is within 10 of the threshold, −3.
- AI takes mutual consent 30% of the months it is offered, and resigns
  2% of months while below the threshold.
- Spells abroad only move credit at season end (no match-by-match play)
  and see no shocks.
- Abroad, "ambition" is 0.5 for the expectation formula. (Settled by DESIGN.md v0.6 § World: there are no foreign leagues, jobs or careers abroad; the European competition's opponents are generated for each tie.)
- Salary accrues weekly as a raw float; only displayed figures are rounded.

## Market

- A vacancy opens the week a post empties, the shortlist is drawn a week
  later, and the hire is attempted the week after. Unfilled searches widen
  by one reputation band a week from the third week.
- "Band covers its tier" is read as: the manager's band is at or above the
  club's band. AI managers apply no lower than one band below their own
  until a year out of work; foreign posts are open to that league's
  nationals and to managers who chose "abroad". (Settled by DESIGN.md v0.6 § World: there are no foreign leagues, jobs or careers abroad; the European competition's opponents are generated for each tie.)
- "A bigger club calls" is an event: a quarter of vacancies approach the
  single best-fitting employed manager at a club at least 10 prestige
  points smaller who has been in post at least a season; the AI accepts
  70% of calls. If the hiring club cannot
  pay the buy-out (over half its wage budget) the manager must walk out,
  which the AI only does for a much bigger club.
- Salary is tier × reputation, scaled down 8% per contract year beyond
  two (and up for one-year deals). The AI takes the years offered and
  promises promotion when the squad ranks top four in tiers 2–5,
  stability when it ranks in the bottom four, top-half otherwise.
- The AI's unemployed activity: wait; punditry after six months if
  reputation ≥ 40; assistant after twelve months if reputation < 40;
  abroad after nine months with a 30% monthly chance if its band covers a
  foreign league. (Settled by DESIGN.md v0.6 § World: there are no foreign leagues, jobs or careers abroad; the European competition's opponents are generated for each tie.)
- Punditry pays £10k a month, an assistant role £30k; both count toward
  career earnings. Waiting scores zero.
- Careers end after 24 months without a shortlist (also for entrants who
  never had a job, who are excluded from validation), at 72, on a scandal
  (0.05% a month), or when an AI manager over 60 chooses to retire
  (5% + 3% a year over 60, doubled when unemployed). (The cap is settled:
  DESIGN.md § Age makes the season a manager turns 72 their last. The
  AI retirement odds remain an assumption; § Age's shortlist penalty,
  shorter contracts with age and the agent's prompt from 65 are not yet
  in the code.)
- Tags are reviewed at season end from season records with the windows
  in DESIGN.md; each expires a fixed number of seasons after it was last
  earned (see TAG_RULES). "Loyal" counts declined approaches as a season.
- The working population is topped up to 400 with new entrants each
  summer.

## Scoring

- Trophy points are banked the moment the trophy is won by the manager in
  post, so a sacking later in the season does not cost them.
- Promotion points go to the manager in post at season end; a champion
  gets the title points, not the promotion points.
- Bonuses are a share of the season's salary: 25% for a trophy, 50% for a
  promotion. They count toward career earnings.
- The Legacy weights are checked against two fixture careers (1,260 games,
  £35m, 30 points versus 600 games, £45m, 900 points) rather than drawn
  from the simulation.

## Validation

- A tracked career belongs to a manager whose first spell began after
  genesis. `sim --careers N` follows the first N such managers to the end
  of their careers (bounded by the age limit), so no career is censored.
- Career length is the calendar span from first hire to the end of the
  career, unemployment included, which is what makes "10% reach 20
  seasons" and "a handful pass 1,000 games" consistent. Seasons employed
  is reported alongside. "Clubs" is the number of spells.
- Spells abroad get a monthly credit move drawn from normal(−1.5, 6) in
  place of match-by-match credit, so a job abroad carries a similar
  hazard to one at home. (Settled by DESIGN.md v0.6 § World: there are no foreign leagues, jobs or careers abroad; the European competition's opponents are generated for each tie.)
- "Inside a season" means the first spell lasted fewer than 46 weeks.
- "Unjust" means credit had been below the threshold for fewer than eight
  weeks of the spell at the sacking, or the sacking followed a takeover;
  the share is over every sacking in the run, not only tracked careers.
- Top-tier long tenures are counted at every season end from season nine,
  at the clubs then in tier 1, and the reported figure is the mean.
- "A handful" past 1,000 games is read as 2 to 15 of 500.

## Tuning (phase 1)

Values were chosen by sweeping seeds 1 to 3 and confirmed on seeds 1 to 5
with `pnpm sim --seeds 1,2,3,4,5`. Readings taken while tuning:

- Credit no longer drifts: the loss weighting is 1.0 (DESIGN started at
  1.5). With any drift every top-tier manager eroded to the threshold in
  about three seasons and no five-year tenure existed. Variance still
  ends spells; k is 2.5.
- A collapse to the instant-sack line (now credit 8) counts as deserved.
- Blame protection lasts one season at 0.85 + 0.15 × ownership. At the
  DESIGN's two seasons of 0.5 + 0.5 × ownership first spells were the
  longest spells in the game.
- Mutual consent is accepted by the AI 5% of the months it is offered.
  At 30% it removed most long-suffering managers before eight weeks
  below the threshold, so nearly every remaining sacking read as unjust.
- Erratic owners are 5% of clubs and patient ones 30%; takeover
  replacements happen 25% of the time and 1.5× as often at poor clubs.
- The squad model's equilibrium is about 8 points above the wealth
  level (gravity 0.5, slope 0.85, spend gain 6). Before, summer spending
  outran gravity and every rich club sat at the 100 cap, which made
  titles a lottery.
- Manager ability moves strength by ±8 (was ±4), so good managers last
  and bad ones fail.
- Hiring: a quarter of vacancies became a tenth calling an employed
  manager, who accepts half the time; shortlist randomness is 0.4; AI
  managers rest nine months after losing a job and never apply below
  one band under their own; AI managers start considering retirement
  at 55.
- Not reached: "median career across three or four clubs". With 40–50%
  of managers never getting a second job, a median of three clubs would
  need almost nobody to stop at exactly two, which no reading of the
  rules produced. The median is two clubs on every seed. The
  20-season share sits at the top of its band (12–14% by seed).

## Play (phase 2)

- Phase 2 is played in the browser, not the terminal: the developer works
  from an iPad. `apps/web` is an unstyled but playable single page over
  the engine's play module, deployed to GitHub Pages from `main`. The
  terminal `play` command stays as a second client over the same module.

- The human enters as an ordinary entrant: unemployed, entry reputation,
  chosen name and background. They are one of the 400 and the AI treats
  them like any other manager except where a decision is theirs.
- Decisions are queued by the engine with options and a default, and
  answered from the next turn's inputs. Unanswered decisions take their
  default after one week. Blocking decisions (offers, approaches, mutual
  consent, renewals, fallouts, window plans) hold the club for a week;
  press and board questions and the monthly activity choice do not.
- Applying is an active act: a qualifying application by the human makes
  the shortlist with a 30% chance, and a shortlisted human interviews
  first. Scored like the AI, a novice ranked around 100th of 180
  applicants for every non-league vacancy and never got a first job.
- At interview the human picks a promise and a contract length; salary
  moves 8% per year away from a two-year deal. Declining marks the
  vacancy and the club moves on.
- An employed human may apply elsewhere; if the club calls, the usual
  approach rules apply (buy-out or walk-out). Declining an approach is
  recorded like declining an offer: the club works down its shortlist
  and does not call the human again for that vacancy.
- The career-over board message is one template per ending (voluntary,
  no offers, age, scandal) with a generic line as fallback.
- A human offered renewal may decline and leave when the contract ends,
  with nothing owed and no mark on the record.
- Window plans are presets: spend, rebuild, youth first, sell a senior
  player, hold. Selling raises cash worth 40% of the normal budget per
  player and costs 3 strength. (Settled by DESIGN.md v0.7 § Transfers:
  the presets give way to the director's recommendation and sale cards.)
- Press responses: confident +2 morale, measured nothing, defiant −2
  morale and +1 credit. Board responses when uneasy: accept nothing,
  push back a coin flip of ±3 credit, promise +3 credit and a target one
  place harder. DESIGN names these controls without effects; these are
  the smallest ones that matter. (Settled by DESIGN.md v0.7 § Decisions
  are bets: every option carries a likely effect, a downside and a
  confidence, and the seeded dice decide.)
- The board's mood is shown in words derived from credit against the
  threshold; the number itself is never shown.
- In a career the log keeps only events that concern the human plus the
  news (hires, sackings, trophies, promotions, vacancies), so saves stay
  small. Every state change is still emitted.

## Match layer (phase 3a)

- A turn plays the human club's next fixture. A match week is a run of
  slots played together: the earliest unplayed league round of every
  tier, then any cup round due, in the order national cup, league cup,
  European. AI clubs in the human's division play their round in the
  same slot as the human's.
- After the week's football the week closes (morale settles, monthly
  rolls, windows, salaries, the board's roll, the market, next week's
  cup draws) and, when the human's club plays next week and nothing is
  waiting for an answer, the turn runs straight on into that fixture. A
  pending decision of any kind stops the turn before the fixture (the
  pre-match step); so do a change in the human's employment, the start
  of the summer, and a week with no fixture for the human, which passes
  as one step with its own inbox (the previous match week's close is
  shown with it).
- Summer weeks are one step each. The new season's fixtures are drawn at
  the end of the last summer week, so the opening fixture is on the card
  before it is played.
- In a career, cup rounds are drawn at the close of the week before they
  are played, so the tie is on the card and the draw is in the inbox.
  The population simulation draws at kick-off, which keeps its random
  sequence identical (`simpath.test.ts` hashes its state).
- A career consumes the random sequence per slot rather than per week,
  so a career and a no-human simulation of the same seed diverge; each
  is deterministic on its own, and a save taken between two turns of
  one week continues identically. `advanceWeek` on a career plays and
  closes the whole week through the same loop.
- "Date" on the fixture card is the season week; the calendar has weeks,
  not dates, until something needs them.
- Home advantage in the one-shot model is 0.35 extra expected goals for
  the home side against an equal opponent (phase 1's 1.5 / 1.15 split,
  restated as one tunable). The model reads about 3.1 goals a game and
  47 / 19 / 34 home / draw / away over a season; DESIGN's 2.7 and
  45 / 26 / 29 (to verify) are phase 3(c)'s calibration targets.
  (DESIGN.md v0.5 § Match settles the replacement: a pressure lean of 8
  in the minute engine, with the fast path calibrated from it.)
- The round-robin's venues were keyed on round plus pair index, which
  sat every rotating club at one ground for half a season; venues now
  alternate, at most two rounds running at one ground. This shifts the
  simulation's random sequence, so the validation readings moved within
  seed noise; the turn loop itself moved nothing.
- A season in post at tier 5 is about 55 turns: 47 matches and 8
  non-match steps (six summer weeks and a couple of pre-match stops),
  measured on seeds 1 to 3.

## Players and tactics (phase 3b)

- A player is one rating out of 100 anchored to his club: the best XI
  in the club's preferred formation averages club strength, and the
  whole squad shifts together whenever strength changes (generation,
  windows, summer, strength shocks, an appointment). Below strength 10
  the rating floor of 1 gets in the way, so the anchoring test skips
  those clubs. (Settled by DESIGN.md v0.7 § Transfers: from phase 4
  strength is derived from the squad and nothing is anchored.)
- Position is one of GK, D, M, F with a side (L, C, R or any). Playing
  an adjacent role costs 15, a distant one 30, the wrong side 5;
  versatile halves the penalty. Condition below 80 costs a quarter of a
  point per point; morale swings ±3; the big-game trait adds 3 in a cup
  tie, a derby or against a top side. An effective rating floors at 0.
- Each trait is exactly one rule and names its reader in
  `players/traits.ts`; a test fails on any trait no engine code reads.
- Formations are the CM 01/02 twelve, each eleven slots, read in three
  bands and a width. A midfielder counts 0.35 of an attacker and 0.5 of
  a defender in openness, so 4-5-1 wins the midfield against 4-4-2 but
  creates less, as DESIGN says.
- AI managers carry a preferred formation, a style and a youth-first or
  results-first lean; the assistant's auto-pick takes the best available
  player slot by slot, with a +4 nudge for under-24s under youth-first.
  A human pick that is no longer legal (injury, suspension) is repaired
  slot by slot and the change is in the inbox.
- Contract renewals, new-deal requests (a wage more than 30% short of
  demand) and requests to leave (little football, low morale, or the
  club well below him) arrive as decisions; a refusal costs morale and
  bond and counts as a fallout. Loyal players bonded to the manager ask
  20% less.
- Squads sign and top up by positional need (the position furthest
  below its share of the squad), not by list order.
- A generated senior (over 19, not from the academy) has already made
  his debut; a debut is the first first-team match of an academy player
  or a generated teenager. Tagging happens once per manager: on that
  debut, on promotion from the academy, or on signing; a player bought
  finished (rating 70 or more on signing) counts 5% of a debut.
- Growth: an under-24 moves toward his potential by minutes played,
  scaled by the manager's development ability; a season of starts is
  worth at least three times a season on the bench (tested).
- A made player who leaves a club waits in a free-agent pool for a
  season and is signed by a club within 10 points of his rating, or
  retires; untagged leavers are forgotten so saves stay small.
- Milestones for made players (a tier above, a transfer of £3m or more,
  a title, a promotion, a cup final, retirement) reach the inbox of every
  manager who made him, weighted by how he was made.
- The fourth Legacy weight is 0.045 per players-made point; the maker
  archetype (30 years, 2,000 points) lands within 10% of the other
  three. The maker-versus-winner target compares the best Legacy among
  the ten managers with most players made against the best among the
  ten with most trophy points.
- The fallout shock names the club's best senior outfielder (27 or
  over); selling him moves him on, backing down bonds him.

## Match engine and fast path (phase 3c)

- The minute engine runs 0 to 90 plus stoppage (0–3 and 1–5 minutes,
  drawn per half). Each minute: pressure drifts 30% of the way to its
  target with noise; a chance arises with probability 0.36 per minute
  at level pressure, goes to the home side by a logistic share of
  pressure (scale 25), and passes a gate from openness and style; it
  converts at 0.11 × e^(0.12 × edge), the edge being the attacker
  against 0.6 of the keeper and 0.4 of the back line in rating points
  ÷ 10, plus ln(quality). Not a goal: 30% saved, 45% wide, the rest
  blocked; 40% of those go for a corner.
- The home lean is 12 rather than DESIGN's 8: with a leading side
  sitting deep (16) and the trailing AI side attacking from 65 minutes,
  12 is what nets out to the home-win target. To verify with the rest.
- AI managers by rule: chasing from 65 minutes goes to attack and swaps
  the weakest defender for a forward; holding from 78 minutes (a lead,
  or a point against a better side) goes to defend; a player under 60
  condition comes off from 55 minutes; injuries are replaced at once;
  voluntary changes are at least 8 minutes apart; three substitutions.
- Fouls at 0.22 a minute (pressing sides 1.3×); a yellow at 0.15 and a
  straight red at 0.003 per foul, scaled by the card rule; a booked
  player fouls 30% as often. Injuries at 0.0014 per side per minute,
  drawn by the injury rule.
- Condition recovers 24 a week (a full match's drain), so a weekly
  starter is fresh and a midweek game leaves him short; the tired rule
  then bites in congested weeks. Ratings are computed on kick-off
  condition, not on how tired a player finished.
- The fast path samples a scoreline from a table calibrated by
  `pnpm calibrate:fast-path`: a 16 × 16 grid over the pre-match model's
  expected goals for each side (ln scale), carrying the minute engine's
  mean goals per cell from ~72,000 matches across six worlds at four
  ages, blended toward a smooth fit where cells are sparse, plus a
  low-score correlation (ρ = −0.2) that reproduces the draw share. Odds
  before a match are the same distribution.
- Every match nobody watches, and the whole population sim, uses the
  fast path; a watched match runs the minute engine and commits its
  facts through the same settlement as the fast path.
- A match rating's spread is measured on season averages (the
  population test); per-match ratings spread wider (about 0.85).
- Possession is cosmetic: 50 plus 0.6 per point of the share of minutes
  a side spent on top.
- Shots, corners and fouls on the fast path are sketched to the minute
  engine's averages, since the fast path never sees them.
- The fast path's draw-heavier results stretched the median first spell
  to the top of its band, so instant sackings now fire at credit 9
  rather than 8 (CREDIT_INSTANT_SACK); the tenure model is otherwise
  untouched and reads results exactly as before.
- Anchoring passes up to four times: rounding to a decimal and the
  rating floor can leave a residue after one pass. A club never signs
  back from the pool a player it released in the same window.
- The formation and style edge targets count only formations and styles
  with at least 600 logged games; a rarely chosen shape with a handful
  of games is noise, not an edge.

## Screens and the match view (phase 3d)

- A fixture of the human's stops the turn before kick-off with the slot
  read: the human's division (or the human's cup tie) sits in the minute
  engine inside the save (`world.human.watched`), the rest of the slot
  waits for the fast path. Continue after the whistle commits the lot
  and runs the week on as before; a Continue mid-match runs the match
  to the end headless first. "Change the side" forgets the prepared slot
  and reads it again at the next Continue, consuming a few more random
  draws, so a career that goes back is a different career from one that
  does not; each is deterministic on its own.
- Other matches in the division run in the same engine at the same
  minute and show in the latest-scores panel; cup ties from other
  divisions and other tiers' league matches are fast-path results at
  full time. The table at full time is the standings with the day's
  results applied, shown in the match view before the commit.
- Full speed is 640 ms a match minute, so ninety minutes and stoppage
  take about a minute of wall time; hold-to-run and the space bar run
  the match while held, Run/Pause runs it until the next automatic
  pause, To full time finishes it at once. Substitutions and mentality
  changes are made while paused, including the pauses the match makes
  itself (goals, red cards, injuries, half time).
- An injured player on the human's side leaves the pitch and waits for
  a change: the view says so and pauses; if the human runs on without
  one, the side plays short, as an AI side does once its changes are
  used.
- The squad screen marks a player as yours (★) when the human's tag is
  on him; the rating change shown is against the rating when the
  season's record opened (`ratingAtStart`), which includes anchoring
  shifts in windows.
- Potential shows as a range only for your own club's players under 24
  (the assistant knows them; scouting levels are phase 5): from the
  rating to the hidden potential ± 4, whole numbers. (Widened by
  DESIGN.md v0.7 § Transfers: the director's cards carry rating and
  potential ranges for any player he recommends.)
- "Talk terms" on a player's profile queues the same contract decision
  an expiring deal raises; the assistant's demand is his wage demand.
- Tap-to-swap on the tactics screen exchanges two players' places (a
  slot, a bench seat or the stands); taking over the sheet turns the
  assistant's pick off; injured and banned players left in are replaced
  at kick-off and reported in the inbox. The captain is a mark for the
  team sheet with no rule reading it yet.
- The Playwright smoke runs Chromium at an iPad viewport (WebKit is not
  on the runner); tap targets are asserted at 32px or more on the
  buttons, with the stylesheet setting 44px minimum height for controls.

## Jobs and world (DESIGN v0.6)

- There are no foreign leagues, posts, careers or tags. Nationality
  stays on players and managers as a name pool and nothing else.
- The European competition is the same 32-club knockout: the five home
  entrants and 27 opponents generated with the season. Each opponent's
  strength is drawn afresh before every round from a tunable
  distribution (means 68, 76, 83, 90, 95 by round), so the later rounds
  are harder whoever survives; a squad is generated when a tie against a
  home club is prepared and dropped when it is settled, so a save
  carries nothing it does not need. Two generated sides meeting each
  other are settled on strength alone with no named scorers. The trophy
  event carries the winner's league position at the time; the targets
  read from it: home clubs win the trophy in 10–60% of seasons, and
  fewer than a quarter of those wins come from outside the top three.
- DESIGN's "~400 managers" was written for 170 posts, 54 of them abroad.
  The abroad posts were also the safe long spells (no match-by-match
  hazard) that kept careers going, so the same managers per post (280
  for 116 posts) still left too many without a second job and careers
  too short. The market was retuned, not the targets: the population is
  260 (POPULATION) and an AI manager rests six months after losing a
  job instead of nine (AI_REST_MONTHS_AFTER_EXIT). Every other market
  rule is untouched.
- The foreign-title trophy points went with the leagues.

## Decisions are bets (DESIGN v0.7)

- One unit per decision kind. A kind's dice all move the same thing so
  bold and cautious can be compared: the press and the fallout move the
  squad's morale (the club's number and every player in it, so the match
  feels it), a new deal or an expiring contract the player's, the board's
  warning and the interview promise the spell's credit, an approach the
  credit where you end up (declining, at this club; accepting, the new
  board's welcome on the new spell), the month out of work, a renewal
  and mutual consent the manager's reputation. Means are equal inside a
  kind by construction (BETS in tunables.ts), so the population test
  checks the implementation rolls as designed, not whether the designer
  balanced the numbers.
- Fixed trades stay outside the dice. A promise to the board still buys
  credit now for a target a place harder (BOARD_PROMISE); selling the
  player in a fallout still moves ownership and strength; a refused
  player still loses the fixed morale and counts as a fallout; declining
  an approach still earns loyalty. The card's detail names the trade;
  the roll is on top of it, and only the roll is in the fairness lines.
- "Within 10%" is read in units of the bold option's own spread, since
  most cautious means are zero. The line tests the gap net of sampling
  noise (two standard errors of the difference, BET_GAP_SE_ALLOWANCE):
  a kind the AI rolls 150 times a run cannot resolve a 10% gap
  otherwise. The observed gap is reported beside it. Kinds under
  BET_MIN_ROLLS on either side are reported and not measured; every
  kind must still show BET_PRESENT_ROLLS on both sides.
- The AI rolls every kind so the lines can be measured: it answers the
  press (bold half the time, on morale, mean zero) and the board's
  warning (AI_BOARD_ANSWER_WEIGHTS; a promise 5% of the time, since at
  20% the credit it buys cut sackings by a third), it rolls the promise
  at hire, the approach both ways, the fallout, mutual consent, the
  month out of work, a renewal (declining 15% of the time when its
  reputation band is above the club's; at 30% careers shortened), and
  its clubs answer their players' requests (a new deal when the wage
  bill allows, a wants-away sold 30% of the time) and settle expiring
  contracts against their own rule one time in ten (AI_CONTRACT_GAMBLE_P).
- The default is the lowest-variance option on every card but two. The
  month out of work keeps the standing activity as its default: the
  lowest-variance option is the assistant role, and stepping down by
  default would be a trap. The window plan's default is Hold (its dice
  are the window itself, so the options carry words and confidence but
  no roll). The interview's default is still to turn the job down,
  which has no variance at all.
- The substitution and the kid in the eleven are bets whose dice are the
  match engine. They carry the three words (selectionWords) from the
  rating gap, the condition and whether it is a debut, and no roll of
  their own.
- Population on the day: over seeds 1–3 the bets leave every existing
  line where main had it (means within the seed-to-seed noise). On seed
  1 alone, three lines that passed by a hair on main now fail by a hair
  (never a second job 51.6% against 50%, median career 5.97 against 6,
  1,000-game careers 17 against 15) and clubs per career stays red as it
  has been since phase 1; the flip retunes the population through the
  directors' trading, and the numbers are in the PR.

## Transfers (DESIGN v0.7)

- The director's judgement comes from wealth alone until phase 5 brings a
  scouting level (DIRECTOR_JUDGEMENT_BASE + DIRECTOR_JUDGEMENT_PER_WEALTH ×
  wealth, with noise). Old saves get one per club from wealth, no noise.
- Candidates are real players at other home clubs and in the free-agent
  pool, plus players "from abroad" generated at the level asked (a share
  of the cards, DIRECTOR_ABROAD_SHARE); an unsigned candidate from abroad
  is forgotten on deadline day. The world has no foreign leagues, so
  abroad is where new quality comes from and where a player sold without
  a named buyer goes (into the pool, for a club at his level).
- The estimate's error is normal with sd 3 at judgement 50 (scaled by
  1.5 − judgement/100); a hit beats the estimate by SIGNING_BEAT_MARGIN
  (0.5), a flop falls short by SIGNING_SHORT_MARGIN (2), so about 43% hit
  and 25% flop at judgement 50. "About 40% / about 25%" is met by the
  margins, not by a skewed error.
- The fee is value × DIRECTOR_FEE_PREMIUM for a contracted player, half
  of value for one in his last year, nothing for a free agent; the wage
  offered is his demand plus SIGNING_WAGE_PREMIUM. There is no haggling
  (FEATURES: agents, clauses, instalments, haggling rounds ✗).
- The two rolls: the selling club accepts at BID_CLUB_ACCEPT_BASE moved by
  the premium over value, halved in January for one of its starters; the
  player at BID_PLAYER_ACCEPT_BASE, a step per tier up or down, a bonus
  per 10% on the wage. The answer arrives at the next close.
- Cards come at the close of the week before each window week except
  deadline day and the summer's first week (the season closes at that
  week's close, and the squads change with it), so the summer's first
  cards are seen in its second week. A bid approved on deadline day is
  answered at that day's close, inside the window.
- Deadline day is its own step in the career loop: the turn stops after
  the deadline week's close whatever the next week holds. On it, every
  squad is brought back to its tier's size (reserves from the pool and
  generated backups, the surplus released).
- Sales: the director proposes one when a bid is in, the wage bill is
  over WAGE_OVERRUN_FACTOR × budget, or a player's morale is under
  UNSETTLED_MORALE. A big bid is BIG_BID_SHARE × value; refusing one for
  an unsettled player costs him REFUSED_BIG_BID_MORALE and counts as a
  fallout. A player sold who then averages SOLD_SHINES_RATING over
  SOLD_SHINES_MIN_APPS at his new club within SOLD_SHINES_SEASONS costs the
  seller SOLD_SHINES_REP once.
- The pot is the board's normal budget × the promise's multiplier each
  summer, plus WINTER_BUDGET_SHARE of it for January, plus sales; the
  abstract "cash" stays as a record. Academy promotions follow the
  manager's development ability for every club, the human's included: the
  old window plan (spend / rebuild / youth / sell / hold) is gone, since
  the director's cards are the plan.
- Requests: the likelihood is stated in words (sure thing / likely /
  gamble at REQUEST_WORDS) and the chance is in the state for the
  interface. Board asks depend on credit over the threshold, the owner's
  ambition and refusals already this season. A named player is served as
  a bid at the close (the roll is the deal's own). "Loan out" is a season
  at a club at his level with a return at the season's end; nothing else
  about loans exists. The captaincy has no effect in the match yet; it is
  the armband on the team sheet. Ratings in the search are shown as the
  director's range around the truth (no noise: the search is a list, the
  card is his opinion). AI managers make no requests, so requests are not
  in the fairness lines.
- Following you: the bond threshold is FOLLOW_BOND_THRESHOLD (10, the
  loyal threshold); the asking price is value × FOLLOW_ASKING_PREMIUM;
  the move waits for the next window and negotiates like any other bid,
  so nothing moves between windows. AI managers take a follower who asks
  with AI_FOLLOW_P. A follower is known, so nothing is revealed.
- The flip: club strength is the best XI's mean in the club's formation,
  refreshed weekly and after every move; a new manager's formation can
  change it. Anchoring, gravity, the abstract summer ageing, the spend
  gain and the turnover churn are gone; anchoring remains only at genesis
  (and for European opponents generated for a tie). Generated players —
  reserves, academy graduates, candidates from abroad — are pegged to the
  wealth level (0.85 × wealth), not to the squad's current strength:
  pegged to strength, growth with minutes ratcheted every squad upward
  (tier 5 reached 57 in 49 seasons) and the tiers collapsed into one
  another. AI directors aim at the level plus AI_TRADE_AMBITION ×
  (wealth/100)²: without the ambition term the top tier sat at 68 ± 9 and
  home clubs won the European Cup in 2% of seasons. A club above its aim
  by AI_TRADE_HOLD_ABOVE buys nothing; one over its wage budget sells its
  highest-paid at each close. The star-sale shock and a fallout's sale
  now sell the player for real. The numbers before and after are in the
  PR.

## The match screen's Continue (DESIGN v0.9)

- The toggle is a preference on the human state (`matchPlay`), saved with
  the career like the sticky tactic and never logged: nothing renders from
  it but the match screen. Old saves without it read MATCH_PLAY_DEFAULT.
- "Continue's label" is the button's second line under the standing
  "Continue": "Kick off · to full time" or "Kick off · to next event"
  before kick-off, "To full time" or "To next event" at a pause, "Result"
  at the whistle. The result card keeps "To the inbox".
- The ticker replays the finished match from its events over TICKER_MS
  (2.2 s) plus a 0.3 s beat, on the wall clock, so it lands inside three
  seconds whatever the frame rate. A match switched to full time mid-way
  replays from the minute it was at. Nothing on the screen is live during
  the ticker but the minute, the score and the goal lines.
- Only the human side's injury pauses: the AI replaces its own in the same
  minute, so an opponent's injury is not a key event. A red card on either
  side is. The forced decision is "Best available" (the default) or
  "Choose", which opens the bench; with no bench player or no change left
  there is no decision and the side plays short.
- "To full time with defaults" replaces an injured player needing a change
  in the minute he goes down; nothing else the AI does by rule (chasing,
  holding, tired legs) is done for the human.
- The Interface validation line was added to DESIGN.md's list (none was
  there); the Match line's "a match plays in about a minute at full speed"
  was left as the brief did not name it, though the mode it describes no
  longer exists.

## The 52-week calendar and the cups (DESIGN v0.10)

- Weeks are 0-based in the code: 0–40 the season, 41–51 the summer.
  Each week has two slots, the weekend and the midweek, and every
  fixture has one; a club plays at most one fixture per slot, which is
  what keeps it to two a week. The template in the tunables fixes the
  cups' weeks; a tier's league round moves to the midweek on the Cup
  weekends it has entered; tiers 2–5 play two league rounds in five
  weeks kept clear of every cup; tier 1 sits out three weekends.
- The Cup's field is not a power of two (48, then 48, then 68), so entry
  rounds pair everyone and the fourth round, the first without entrants,
  pares 34 to 32 with two ties on a midweek and thirty byes. The League
  Cup pairs everyone in its entry rounds too (one bye when odd, which
  depends on how many tier-1 clubs are in Europe) and pares in the
  fourth round if it must. Byes are drawn at random.
- Two-legged ties settle on aggregate; a level aggregate goes to a
  shoot-out at the end of the second leg. No away-goals rule. The first
  leg pays credit and form like a league match; the second leg pays the
  tie in full. A group match pays like a league match.
- Neutral ground means no home lean in the odds or the minute engine; the
  side listed first still fields as "home" on the card.
- Europe: 16 clubs a competition, four groups of four drawn at random
  (home clubs can share a group), six matchdays, the top two through;
  group winners meet runners-up of other groups in the quarter-finals,
  the runner-up at home first. Opponents are generated per competition
  and drawn again at each stage. Prize money and prestige land on wealth
  and prestige by the stage reached (EUROPE_PRIZE), small numbers on a
  0–100 scale. Season one's places go by prestige as if it were last
  season's table.
- Qualification passes down the table in the order the places are
  listed: a Cup winner already in the top four hands the Europa place to
  the next unplaced club, and the Conference Cup's sixth place moves down
  behind it.
- The summer window runs from the last match week to the third week of
  the new season. The tenure model reads it at the season boundary:
  ownership, the ceiling reset and the credit clamp use the turnover up
  to the last summer week, and the new season's expectation is set then;
  the three window weeks in the new season count for trading but not for
  ownership. The winter window is read at its deadline as before.
- The next cup round is drawn the moment the previous one is settled,
  in the simulation and in a career alike, so the tie is on the card
  from that week; the population simulation's random sequence moved
  with the calendar (the simpath snapshot was retaken).
- The "tier-5 club in the Cup's third round about once in twenty
  seasons" line is read per club: a given tier-5 club reaches the third
  round about once in twenty seasons. The model reads about once in ten
  (a tier-5 side beats a tier-4 side about a third of the time), which
  the band allows; per season, two or three tier-5 clubs get there.
- Saves from the 46-week calendar are refused with a message: a week
  number no longer means the same thing. There is no migration.
- The weekly board roll and the monthly rolls happen in every week of
  the longer year, so their per-week chances were scaled by 46/52 to
  keep the per-season hazard where it was; the numbers are in the PR.
