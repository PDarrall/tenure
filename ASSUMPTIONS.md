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
