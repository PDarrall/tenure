/**
 * Every constant in the engine lives here. Each one carries a comment naming
 * the validation target (DESIGN.md, "Validation targets") it serves, or the
 * DESIGN.md rule it encodes. No magic numbers anywhere else.
 *
 * Validation targets are starting figures from memory, marked "to verify"
 * until a source is attached (see CLAUDE.md).
 */

/** Seed the `sim` CLI uses when none is given. Serves: reproducibility. */
export const DEFAULT_SEED = 1
