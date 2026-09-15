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
  strength, not simulated teams.
- Rivals are drawn within one of twelve fictional regions, up to two per
  club, symmetric.

## Managers

- Foreign club slots are filled from the same 400-strong pool, so
  vacancies abroad arise the same way as at home.
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
  play two or three matches in a week.
- Three up, three down at every tier boundary, no play-offs. Nothing is
  relegated out of tier 5.
- Cups are single-leg knockouts with random draws and byes in the first
  round; level ties go to a shoot-out weighted by strength. Every club
  enters the national cup in round one.
- The European competition is a 32-club knockout: five home clubs (top
  four of tier 1 plus the cup winner, or fifth place) and 27 foreign
  clubs picked by strength. Foreign leagues are settled once a season by
  ranking strength, manager ability and noise; a season abroad counts as
  34 games.
- Goals are Poisson from an expected-goals figure driven by the strength
  gap, form, morale and tactical ability; expected points come from the
  same distribution, so credit is judged against the model's own odds.
- Attack and defend mentalities scale both sides' expected goals up or
  down (variance only); the AI attacks weaker sides and defends against
  stronger ones. Each manager has a fixed preferred shape.
- Summer: academy gains from last summer are released, the squad ages a
  year, ageing squads lose 3–5 and young ones gain 1, strength gravitates
  toward the wealth target, then the window spends the whole budget with
  diminishing returns and churns the first XI. The winter pot is 30% of
  the normal budget. Net spend is ranked within the division as played.
- Match summaries are stored as a template key on the event and rendered
  on demand from text/match.json; rendering never draws from the RNG.

## Tenure

- Genesis incumbents have already served 0–4 seasons (staleness applies)
  and hold 1–3 years of contract; their ownership is 0.35 per season served.
- A contract signed mid-season counts that season as its first year; one
  signed in the summer starts with the season about to begin. Contracts end
  on the season-end week. Payout is salary × weeks left / season weeks.
- "Deserved" means eight or more consecutive weeks below the threshold at
  the moment of sacking. Takeover replacements are always unjust.
- The board rolls every week, including summer weeks.
- Expectation: beating or meeting the target sets next target = finish;
  missing it eases the target one place, but never past the structural
  target and never tighter. A promoted or relegated club restarts from the
  structural target plus ambition. The structural target is the squad's
  strength rank after the summer window.
- The ceiling is 100 for seasons one to three and 90 for season four; the
  credit clamp to a lowered ceiling is applied after the summer window, so
  a big turnover that resets the ceiling keeps the credit.
- "Beat a top-three side" reads the opponent's position after the week's
  results. Monthly rolls (shocks, gap check, mutual consent) happen every
  four match weeks and not in the summer.
- Trophies count for credit and reputation only for the spell they were
  won in (honours record the club).
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
- Abroad, "ambition" is 0.5 for the expectation formula.
- Salary accrues weekly as a raw float; only displayed figures are rounded.

## Market

- A vacancy opens the week a post empties, the shortlist is drawn a week
  later, and the hire is attempted the week after. Unfilled searches widen
  by one reputation band a week from the third week.
- "Band covers its tier" is read as: the manager's band is at or above the
  club's band. AI managers apply no lower than one band below their own
  until a year out of work; foreign posts are open to that league's
  nationals and to managers who chose "abroad".
- "A bigger club calls" is an event: a quarter of vacancies approach the
  single best-fitting employed manager at a club at least 10 prestige
  points smaller; the AI accepts 70% of calls. If the hiring club cannot
  pay the buy-out (over half its wage budget) the manager must walk out,
  which the AI only does for a much bigger club.
- Salary is tier × reputation, scaled down 8% per contract year beyond
  two (and up for one-year deals). The AI takes the years offered and
  promises promotion when the squad ranks top four in tiers 2–5,
  stability when it ranks in the bottom four, top-half otherwise.
- The AI's unemployed activity: wait; punditry after six months if
  reputation ≥ 40; assistant after twelve months if reputation < 40;
  abroad after nine months with a 30% monthly chance if its band covers a
  foreign league.
- Punditry pays £10k a month, an assistant role £30k; both count toward
  career earnings. Waiting scores zero.
- Careers end after 24 months without a shortlist (also for entrants who
  never had a job, who are excluded from validation), at 72, on a scandal
  (0.05% a month), or when an AI manager over 60 chooses to retire
  (5% + 3% a year over 60, doubled when unemployed).
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
- Career length is seasons employed (sum of spell lengths), not calendar
  years; "clubs" is the number of spells.
- "Inside a season" means the first spell lasted fewer than 46 weeks.
- "Unjust" means credit was below the threshold for fewer than eight
  consecutive weeks at the sacking, or the sacking followed a takeover;
  the share is over every sacking in the run, not only tracked careers.
- Top-tier long tenures are counted at every season end from season nine,
  at the clubs then in tier 1, and the reported figure is the mean.
- "A handful" past 1,000 games is read as 2 to 15 of 500.
