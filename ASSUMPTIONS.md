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
  missing it moves the target one place toward the structural target (in
  whichever direction that lies). A promoted or relegated club restarts
  from the structural target plus ambition. The structural target is the
  squad's strength rank after the summer window.
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
