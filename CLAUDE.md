# CLAUDE.md

Project: **Tenure** (working title) — a football management game about surviving a career.
Read `DESIGN.md` before anything else. It is the source of truth. If code and `DESIGN.md` disagree, say so and ask before changing either.

## Architecture

- `packages/engine` — pure TypeScript. No UI, no I/O, no `Date.now()`, no `Math.random()`. All randomness comes through the injected seeded RNG. All state is plain JSON-serialisable objects; a saved game is the state object and nothing else.
- `packages/cli` — headless simulation (`sim`) and terminal play (`play`). Depends on engine only.
- `apps/web` — React shell. Depends on engine only. Do not scaffold until phase 4.
- `packages/engine/src/tunables.ts` — every constant, each with a comment naming the validation target it serves. No magic numbers anywhere else.

## Rules

- **Determinism.** Same seed and same inputs produce the same career. Tests rely on it.
- **Validation targets are tests.** `packages/engine/test/population.test.ts` runs 500 AI careers and asserts the distributions in `DESIGN.md`. A change that moves them out of range fails the build, whatever else it improves.
- **Event log.** Every state change emits an event `{week, type, payload}`. The inbox, the career page and the obituary all render from the log. Nothing renders from ad-hoc state.
- **Text is data.** Match summaries, press questions, board messages live in `packages/engine/src/text/*.json` as templates, not inline strings.
- **One system per PR**, in this order: world gen → managers → season sim → tenure → market → scoring → CLI play.
- Plain code. No frameworks in the engine. Tests with vitest.

## Working style

- Plan first. For anything over ~100 lines, show the plan and the tunables you will add before writing code.
- Before implementing a system, restate the relevant `DESIGN.md` section in five lines. If a rule is ambiguous, take the simplest reading, implement it, and list it under **Assumptions** in the PR description.
- Never state real-world football statistics as fact. Real-world targets are marked "to verify" until a source is attached.
- Small commits with messages that name the system and the tunable touched.
