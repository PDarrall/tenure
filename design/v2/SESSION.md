# Session: the feed — build design v2 into apps/web

Bucket: UI, with a text pass at the end. Read `CLAUDE.md`, then `DESIGN.md` "Interface" (the rules), then `design/v2/README.md` (the numbers). The artboards in `design/v2/canvas/` are the source: recreate from them, copy exact values, never round to a grid. Play the current build first so you know what you are replacing. Keep the game; change how it feels.

Plan before code. For each step below, restate its rule in five lines, show the plan and the tunables you will add, then build. One PR for the lot, small commits that name the piece. Do not touch the engine's rules; the two engine additions are pure derivations.

## Order

1. **Tokens.** Add `design/v2/tokens.css` to `apps/web/src/styles.css` (win, draw, loss = accent, the tints, the monogram ground, the `beat` keyframes). Form becomes five marks everywhere the letters were.
2. **The feed (Home).** The head keeps the label, the club and one state line ("12th of 24 · target 12th · board uneasy"). Pinned: the fixture card with Watch and any decision card. Below, a region that scrolls: posts from the event log, newest first — a result as a score card (chip, score in its colour, scorers), the board, the press, the agent, the league, a player, the staff — each with a monogram, a stamp ("Wk 12"), one or two lines, and the reaction. The inbox's "Earlier" becomes the feed's scroll. Out of work, the agent's application and the month's choice stay pinned and the vacancies become posts.
3. **The reaction.** A pure function in the engine (`play/feed.ts`): `reactionFor(event, club)` → `{ count, direction }` from the club's attendance and the event's kind and size, one tunable per kind (`REACTION_*`). Derived at render; never stored.
4. **The ticker and the result.** Continue on a match week plays the match at once: the fixture card becomes the ticker (minutes at 33 ms, the line, goals dropping in, Continue pressed and reading "Playing · 61′"), then the result card lands in its place with the beat: the chip, the score in its colour, the scorers, one line ("Up two. 12th."), Ratings behind a tap. Continue reads "To the feed"; the next press passes to the next week and the result joins the feed as a score card. The full-time screen goes.
5. **Watch.** A quiet Watch on the fixture card opens the watched match: the v1 match view cut to the design — the head with the state and the minute, the score, the pressure bar, the last three lines, the paused controls (mentality, Subs · n left, Change), the two elevens, Latest. It pauses at goals, reds, injuries needing a change and half time. Play on runs to the next pause; Continue skips to the result. Hold to run, Run and To full time go.
6. **Contained tabs.** Squad: the filter (All · Yours · Out), the header line, one-line rows, the list scrolling inside its region. Tactics: formation chips, mentality, style, the eleven as a shape with the bench under a dashed line — tap two to swap — all on the frame. Fixtures: the next card, Last as a score row, The season ›, the five neighbours, Full table ›, the cup lines; the season and the full table are their own screens with a back link. Career: four figures, Legacy, spells, players made, tags on the frame; export, import, resign, retire and delete stay at the foot as in v1. No tab's primary state scrolls the page.
7. **The text pass.** Every template in `packages/engine/src/text/*.json` held to the budget: no line over 140 characters, numbers and marks first, no paragraphs. The chairman's lines as in the README. Add the streak and milestone posts the feed calls out ("Two wins running." "Three defeats. We notice."). Add a test that renders every template with worst-case variables and fails over 140.
8. **Tests.** Rewrite the smokes for the layout: `season.spec.ts` plays a season by pressing Continue only, asserts the ticker finishes inside 3.5 s and that no tab's primary state scrolls the page (`scrollHeight <= clientHeight` on the app root for Home, Squad, Tactics, Fixtures, Career). Keep the 60 s full-speed watched match. `jobs.spec.ts` and `transfers.spec.ts` follow the feed (a forced decision still replaces Continue; the director's cards are posts with their bets).

## What must still be true

- One primary button on every screen, ink, two lines. A forced decision replaces it and there is no way past.
- Someone can play a whole season by pressing Continue.
- Decision cards show likely, downside and confidence per option, the default marked, and Continue applies the default.
- Five tabs. 390-point baseline, targets of 44 or more, tabular figures, dark and light.
- The validation targets in `DESIGN.md` are untouched: nothing here changes the model.

## PR description

For a non-coder: what the player will notice on each tab, the text budget before and after (count it from the rendered app, not the canvas), which `DESIGN.md` sections changed (none beyond "Interface"; say so), the tunables added, and every assumption taken under **Assumptions**.
