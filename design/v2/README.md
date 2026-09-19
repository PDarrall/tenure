# Tenure · design v2 — the feed

The export of the design canvas ("Tenure", the v2 rows), for the session that builds it. `DESIGN.md` "Interface" holds the rules; this file holds the numbers. The artboards in `canvas/` are the source: copy their values, never round them. Each is a self-contained page; `{{accent}}` in them is the accent token.

## What changed since v1

- Continue plays the match at once: the fixture card becomes a three-second ticker, then the result lands in its place. Watching is a secondary Watch on the card.
- Home is a feed. Fixture and decision pinned; posts newest first in a region that scrolls.
- Text is rationed: no post over 140 characters; numbers and marks first.
- Every tab's primary state fits 390 × 844. Regions scroll; the page never does.
- Colour carries the result: green, amber, the accent. Form is marks. Results land with a beat.

## Tokens

`tokens.css` adds to `styles.css`. Everything from v1 stays (ground, surface, surface 2, three inks, hairline, accent, the disabled and pressed states, Schibsted Grotesk, tabular figures, the 4-point scale, gutter 20, card radius 14, buttons 13, controls 9).

| Token | Light | Dark | Carries |
| --- | --- | --- | --- |
| `--win` | `#167A38` | `#4CC46E` | the W, a winning score, the form mark, a rating up, the fans' approval, a condition at 80+ |
| `--draw` | `#9C5E08` | `#E8A33A` | the D, a drawn score, the form mark, a condition at 70–79 |
| `--loss` = `--accent` | `#C8391A` | `#FF6A45` | the L, a losing score, the live minute, a goal, pressure, the fans turning, the selected tab, the mark on your players, "Next" |
| `--win-tint` / `--draw-tint` / `--loss-tint` | 10 % | 14 % | the result card's ground as it lands |
| `--mono-bg` | `#ECEAE4` | `#262623` | behind a monogram's letters |

Contrast, checked: win and draw text on the ground ≥ 4.75:1 light, ≥ 8:1 dark; white on a win or draw chip ≥ 5.2:1.

## Type scale (px / weight / letter-spacing)

| Use | Size | Weight | Tracking | Line |
| --- | --- | --- | --- | --- |
| Result score, landing | 44 | 800 | −0.03em | 44 |
| Watched-match score | 40 | 800 | −0.03em | 40 |
| Ticker score | 30 | 800 | −0.03em | 32 |
| Title (club, tab) | 26 | 700 | −0.015em | 30 |
| Figure (career) | 28 | 700 | −0.02em | 32 |
| Score in a post | 24 | 800 | −0.02em | 26 |
| Live minute | 22–24 | 800 | −0.02em | 24–26 |
| Fixture card opponent | 20 | 700 | −0.01em | 24 |
| Post body, row name | 15 | 400 / 600 | 0 | 20 |
| Source, option label, state line | 13–14 | 600 | 0 | 17–18 |
| Bet words, scorers, captions | 12–13 | 400 | 0 | 15–16 |
| Label, stamp | 11 | 600 | 0.06–0.08em, caps | 14 |
| Chip (default, confidence) | 10 | 700 | 0.06em, caps | — |

## Marks

- **Result chip**: the letter W/D/L, white, 800, on its colour; 28 px in a score post, 26 on the landing card, 20 in the season list; radius 30 % of the size.
- **Form**: five 8 px squares, radius 2, gap 3, newest right, each in its result colour. 7 px in the neighbours table. Replaces "W D L W W".
- **Monogram**: a 28 px circle (24 on a decision card) on `--mono-bg`, ink letters 12/700 for one letter, 10/700 for two. Chairman C, press P, agent A, league L, staff S, a player his initials. Never a crest, never a face.
- **Reaction**: a 10 px triangle up (win) or down (accent) or a 2 px dash (ink 3), then the count 12/600 ink 3: "4.2k", "640". One per post; none on a post with nothing to react to.
- **Stamp**: "Wk 12", 11/600 caps 0.06em ink 3, right of the source.
- **Condition dot**: 8 px, win ≥ 80, draw ≥ 70, else accent; an injury or ban is "3w" / "1" in the accent instead.
- **Your mark**: the v1 star, 8–10 px, accent, before the name.

## Components

**Feed post** — `canvas/Feed-Light.dc.html`. A row: monogram · a column of [source 13/600 + stamp on one line; body 15/20 ink, one or two lines; reaction]. Padding 12 0, a hairline below. Text-wrap pretty.

**Score post** — the same row with the result chip (28) for a monogram; line one "Win · Bramford Town (A)" 13/600 with the venue in ink 3; line two the score 24/800 in the result colour with an en dash in ink 3, then the scorers 13 ink 2 on the same baseline; the reaction.

**Fixture card, with Watch** — surface, hairline, radius 14, padding 12 × 14. Row one: the label "Next · League · Wk 12" and the stamp "Away". Row two: the opponent 20/700, and under it the standing "9th of 24" 13 ink 2 with the form marks; Watch at the right: an ink outline 1.5 px, 34 px tall, radius 9, 13/600. Row three: the odds "W 29%  D 27%  L 44%" 12 ink 3 and, right, "Last: D 1–1 Radbury". A blank week keeps the card without Watch and says so in the odds line: "Wk 13: no fixture. Cup round, out in R1."

**Ticker** — the fixture card, replaced in place for three seconds. Label "Playing · League" and the minute 22/800 in the accent at the right; the two names 15/600 either side of the score 30/800; a 3 px line filling left to right in the accent (minute ÷ 90); goal lines dropping in below, "23′" in the accent then "Pickering. Bramford 1–0." 13 ink. Minutes run at 33 ms each. Continue shows its pressed state and reads "Playing · 61′". 420 ms after 90′ the result lands.

**Result, landing** — the card with `--win-tint` (or draw, loss) for a ground and no border, `animation: beat 520ms cubic-bezier(0.2, 0.8, 0.2, 1)` on mount. Row one: the result chip (26) and "Win · Away" 13/600, the stamp right. Row two: home name and scorers left, the score 44/800 in the result colour centred, away name and scorers right. Row three: one line 14 ink ("Up two. 12th.") and "Ratings ›" 13/600 at the right. Continue reads "To the feed". The ratings sheet replaces the card in place: two columns of slot · name · rating, the best in the accent, Close at the top right.

**Decision card** — surface card. A 24 px monogram, the source "Press" 13/600 (with "· must answer" when forced) and the question 14 ink under it, then one button per option: label 14/600 left; at the right a "default" chip and the confidence chip (sure thing / likely / gamble — gamble in the accent); under it one line 12/15: likely in ink 2, then "· " and the downside in ink 3. The chosen option is an ink fill with `--on-ink` text and the sub-line in `--on-ink-dim`; the rest are hairline outlines, radius 10, padding 8 × 10. The foot: "Continue answers Measured." 12 ink 3. Forced: no button is filled, the foot says "Answer below. No way past it.", and the options live in the replaced Continue bar (the v1 component), each with a second line "default · sure thing" / "gamble". Answered: "Answered: Stay where you are."

**Continue, Watch, Play on** — Continue as in v1: ink, 58 px, radius 13, two lines. Its second line: "Play · Bramford Town (A)", "To the feed", "Pass the week · Halstone United (H) in week 14", "Skip to the result", and the pressed "Playing · 61′". Watch is the only secondary on Home (above). In a watched match, Play on is an ink outline 58 px beside Continue, which skips to the result.

**Watched match** — `canvas/Watch-Light.dc.html`. Head: the label "League · Wk 14 · Home", right of it the state "Paused · goal" and the minute 24/800 in the accent; the two names 17/700 either side of the score 40/800; the pressure bar (v1, 6 px, the lean from the centre); the last three commentary lines, the minute 12/700 (accent for a goal), the text 14 (ink for a goal or the latest, else ink 2). A hairline. Then the region: "While paused" with the mentality control and "Subs · 3 left" with a small Change button; the two elevens in two columns (24 px rows: slot 10/600, name 13/500, live rating 12/600); Latest, five rows. Pauses: goals, reds, injuries needing a change, half time, full time. Full time turns Play on into the result.

**Neighbours table** — rows 34 px: position 13/600 (accent for you), club 15 (700 for you), P, GD, Pts 15/700, the form marks. Five rows around you on Fixtures; the same row for the full table.

**The shape (Tactics)** — bands of chips, forwards at the top, then midfield, defence, the keeper; each chip minimum 58 px wide, radius 10, hairline on surface: name 13/600 (a C chip for the captain, your mark) over "slot · rating" 11 ink 3. The bench is a dashed hairline above a horizontal row of the same chips on the ground.

**Squad row** — one line, 44 px: mark + name 15/600, position 12/600 ink 3, age 13 ink 2, rating 15/700, change 12/600 (green when up), the condition dot. A header line: "20 players · 3 yours" and Pos · Age · Rat · Δ. A small segmented filter above the list: All · Yours · Out.

**Tab bar, segmented control, chips, hairlines** — v1, unchanged.

## Screens, contained

Each is a head (label, title, one state line), an optional pinned block, a region that scrolls, and the foot. Nothing but the region scrolls. The list gives what fits on the frame.

| Screen | Pinned | Region | Foot |
| --- | --- | --- | --- |
| Home, match day | fixture card with Watch; the decision card | Feed: the two newest posts on the frame, the rest scroll | Continue "Play · …" |
| Home, ticking | the ticker | Feed | Continue pressed, "Playing · 61′" |
| Home, result | the result card (or the ratings sheet) | Feed | Continue "To the feed" |
| Home, blank week | the next-fixture card without Watch | Feed: four posts on the frame | Continue "Pass the week · …" |
| Home, forced | next fixture; the forced decision card | Feed | the replaced bar |
| Watch | — | paused controls, the elevens, latest | Play on · Continue "Skip to the result" |
| Squad | the filter | header line, 11 rows on the frame, the rest scroll | Continue |
| Tactics | — | formation chips (scroll sideways), mentality, style, the shape with its bench: all on the frame | Continue |
| Fixtures | — | next card, "Last" score row, The season ›, the five neighbours, Full table ›, the two cup lines: all on the frame | Continue |
| Full table | back link | 24 rows, scroll | Continue |
| The season | back link | results and fixtures, scroll | Continue |
| Career | — | four figures, Legacy, two spells, three players made, tags: all on the frame | Continue |

Out of work, the day-one offer, the player page and the career-over page keep their v1 layout with the v2 tokens and the text budget; they are not on the v2 rows.

## Copy

- A post is one or two lines, never over 140 characters. The longest on the canvas is 51.
- No paragraphs anywhere. A card body is one line.
- Numbers and marks first. "12th. Up two. Halstone stay top." "7.9. Best on the pitch. One of yours." "Eccles out 3 weeks. Clegg starts."
- The chairman: "A point. We expected three." "Three points. Noted." "Two wins. The board notice." After three defeats: "Three defeats. We notice."
- The press, as a post: "Thornwick are watching, we hear." As a question: "A point. Two dropped or one gained?"
- The agent: "Jobs going: Penley Rovers, Stanmoor." "Thornwick City have called. Tier 2. Buy-out paid." "You turned Thornwick down. Your board approve."
- Bet words, one sentence each. Press: Measured — "The room stays level." / "Nobody remembers it." / sure thing. Confident — "The room lifts." / "Reads as arrogance after a loss." / likely. Defiant — "The room rallies to you." / "The board hear a man under pressure." / gamble. Approach: Stay — "Credit and loyalty here." / "The call may not come again." / sure thing. Accept — "A bigger club. 'In demand.'" / "A new board's welcome is a roll." / gamble.
- The state line under the club: "12th of 24 · target 12th · board uneasy". The contract moved to Career.
- Continue's second line stays: it is the only explanation on the screen.

The text budget, counted from the artboards (every visible character a state holds, scrolled content included): Home 645 → 902 (the feed holds seven posts where the inbox held three, and the decision card carries its bets); result 910 → 614; watched match 1,020 → 753; Squad 1,284 → 616; Tactics 778 → 620; Fixtures 669 → 488; Table 1,035 → 689; Career 759 → 397. Total 7,100 → 5,079, −28 %. Characters per item: inbox 44 → post 35.

## The fans' reaction

A number the game does not have yet. Each post carries a count and a direction: how many supporters reacted and which way. A pure function of the event and the club — attendance sets the scale (a tier-3 club reacts in the low thousands), the event's kind and size set the share and the direction (a win up, a loss down, a chairman's warning down, a debut up, a signing by its confidence). One tunable per kind; log nothing, derive it at render from the event. Nothing else reads it.

## The eight presses

The script beside the prototype on the canvas (`canvas/Prototype-EightPresses.dc.html`, light):

1. Continue. The press question stays on Measured. The fixture card becomes the ticker; three seconds later the result lands: W 2–1 at Bramford.
2. Continue. The feed after it: the score card, the chairman, Kitson, the league.
3. Continue. Week 13 passes. Halstone United at home, with Watch.
4. Watch. The match runs and pauses at 18′: Kitson. Play on runs to the next pause; Continue skips.
5. Continue. The result lands: W 2–0. Ratings is a tap.
6. Continue. Week 15: Thornwick City have called. The button is replaced.
7. Stay where you are.
8. Continue. Week 16.

The tabs work on every Home; Fixtures shows the Bramford result from press 2; Full table and The season are taps.

## Decisions taken on the canvas

- Loss shares the accent. One accent plus two result colours; the accent means consequence wherever it appears.
- The ticker runs in the pinned slot, not full screen. Home never leaves; the feed is already underneath.
- The decision card shows likely and downside for every option at once, one line each. A compact variant showing only the chosen option's words is the fallback if the pinned block runs tall.
- The stamp is the week ("Wk 12"), which is the engine's clock; a match day is a week with a fixture.
- The Play on / Continue pair in a watched match replaces v1's Hold to run, Run and To full time.
