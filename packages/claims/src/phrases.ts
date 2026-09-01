/**
 * Every externally visible phrase that interprets a number lives here.
 *
 * The point is not tidiness. It is that the set of things this product is
 * willing to say out loud should be reviewable in one file by someone who is
 * not an engineer.
 */

export const PHRASES = {
  /** How we describe a value relative to a reference population. */
  distribution: {
    lower: "lower than most of the reference distribution",
    typical: "within the middle of the reference distribution",
    higher: "higher than most of the reference distribution",
    unknown: "no reference distribution available for this input",
  },

  /** How we describe a change between two timepoints. */
  delta: {
    belowNoise: "within measurement noise — no change can be claimed",
    decreased: "decreased by more than the assay's minimum detectable change",
    increased: "increased by more than the assay's minimum detectable change",
    insufficient: "not enough comparable timepoints to compute a change",
  },

  /** How we describe our own confidence in an axis score. */
  confidence: {
    high: "computed from the full set of inputs this axis expects",
    partial: "computed from a subset of inputs — interpret with caution",
    none: "not computed",
  },

  /** How we describe clock provenance. */
  provenance: {
    published: "computed locally from published model coefficients",
    imputed: "some model inputs were absent from the supplied file and were imputed",
    refused:
      "not reported — too many model inputs were absent from the supplied file to produce a defensible value",
  },
} as const;

/**
 * Language this product will not emit. Enforced in CI by scripts/claims-lint.mjs
 * over the report and UI source, so a well-meaning copy edit cannot quietly
 * turn an interpretation into a medical claim.
 */
export const FORBIDDEN_TERMS: readonly string[] = [
  "diagnose",
  "diagnosis",
  "diagnostic",
  "treat",
  "treatment for",
  "cure",
  "prevents disease",
  "reverses aging",
  "reverse your age",
  "biological age is",
  "medical advice",
  "prescribe",
  "FDA approved",
  "clinically proven",
];

/**
 * Contexts where a forbidden term is legitimate — for example our own copy
 * saying we do NOT diagnose. The linter allows a line if it also matches one
 * of these.
 */
export const FORBIDDEN_TERM_EXEMPTIONS: readonly RegExp[] = [
  /not a diagnosis/i,
  /does not diagnose/i,
  /is not diagnostic/i,
  /no medical advice/i,
  /not a substitute for clinical judgment/i,
  /FORBIDDEN_TERMS/,
];
