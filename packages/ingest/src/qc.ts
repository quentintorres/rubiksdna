import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clockRegistry } from "@rubiksdna/clocks";
import type { BetaMatrix } from "./beta-matrix";

/**
 * Sample-level QC for methylation uploads. Checks flag; they do not silently
 * repair. A warned sample is still processable, a failed one is not.
 */

export type QcSeverity = "pass" | "warn" | "fail";

export interface QcCheck {
  key: string;
  severity: QcSeverity;
  detail: string;
  metrics: Record<string, number | string | null>;
}

export interface SampleQcReport {
  sampleId: string;
  overall: QcSeverity;
  checks: QcCheck[];
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

let xProbeCache: Set<string> | null = null;
/** chrX cg probes from the Zhou-lab hg38 HM450 manifest (see data provenance). */
export function xProbes450k(): Set<string> {
  if (xProbeCache) return xProbeCache;
  xProbeCache = new Set(
    readFileSync(join(dataDir, "x_probes_450k.txt"), "utf8").trim().split("\n"),
  );
  return xProbeCache;
}

/**
 * Sex concordance heuristic: on chrX, X-inactivation gives female samples a
 * high fraction of intermediate beta values (0.2–0.8) while male samples are
 * bimodal. Thresholds calibrated on GSE41169 (95 samples: males 0.17–0.27,
 * females 0.68–0.75 with two probable metadata mislabels flagged at ~0.21).
 */
const FEMALE_LIKE_MIN = 0.55;
const MALE_LIKE_MAX = 0.35;
const MIN_X_PROBES = 200;

export function sexConcordanceCheck(
  betasForSample: ReadonlyMap<string, number>,
  declaredSex: "female" | "male" | "unspecified",
): QcCheck {
  const xSet = xProbes450k();
  let intermediate = 0;
  let total = 0;
  for (const [probe, beta] of betasForSample) {
    if (!xSet.has(probe)) continue;
    total += 1;
    if (beta >= 0.2 && beta <= 0.8) intermediate += 1;
  }

  if (total < MIN_X_PROBES) {
    return {
      key: "sex_concordance",
      severity: "warn",
      detail: `Not performed: only ${total} chrX probes in the upload (needs ${MIN_X_PROBES}). Upload the full matrix to enable this check.`,
      metrics: { x_probes: total, intermediate_fraction: null, inferred_sex: "unknown" },
    };
  }

  const fraction = intermediate / total;
  const inferred =
    fraction >= FEMALE_LIKE_MIN ? "female" : fraction <= MALE_LIKE_MAX ? "male" : "indeterminate";

  const metrics = {
    x_probes: total,
    intermediate_fraction: Number(fraction.toFixed(4)),
    inferred_sex: inferred,
  };

  if (declaredSex === "unspecified") {
    return {
      key: "sex_concordance",
      severity: "pass",
      detail: `No declared sex to check against; methylation pattern is ${inferred}-like.`,
      metrics,
    };
  }
  if (inferred === "indeterminate") {
    return {
      key: "sex_concordance",
      severity: "warn",
      detail: `chrX methylation pattern is indeterminate (intermediate fraction ${fraction.toFixed(3)}).`,
      metrics,
    };
  }
  if (inferred !== declaredSex) {
    return {
      key: "sex_concordance",
      severity: "warn",
      detail: `Declared sex is ${declaredSex} but chrX methylation looks ${inferred}. Possible sample swap or metadata error — confirm before interpreting results.`,
      metrics,
    };
  }
  return {
    key: "sex_concordance",
    severity: "pass",
    detail: `chrX methylation pattern is consistent with declared sex (${declaredSex}).`,
    metrics,
  };
}

/** Coverage of registered clock probes; a clock refused for coverage is caught early here. */
export function clockCoverageCheck(betasForSample: ReadonlyMap<string, number>): QcCheck {
  const perClock: Record<string, number | string | null> = {};
  let worst = 1;
  for (const clock of clockRegistry().values()) {
    let present = 0;
    for (const probe of clock.coefficients.keys()) {
      if (betasForSample.has(probe)) present += 1;
    }
    const coverage = present / clock.coefficients.size;
    perClock[clock.id] = Number(coverage.toFixed(4));
    worst = Math.min(worst, coverage);
  }
  const severity: QcSeverity = worst >= 0.95 ? "pass" : worst >= 0.8 ? "warn" : "fail";
  return {
    key: "clock_probe_coverage",
    severity,
    detail:
      severity === "pass"
        ? "All registered clocks have at least 95% of their probes present."
        : `Lowest clock probe coverage is ${(worst * 100).toFixed(1)}%. Missing probes will be imputed up to each clock's limit; below that the clock refuses.`,
    metrics: perClock,
  };
}

/**
 * Global beta distribution sanity. Whole-genome methylomes are strongly
 * bimodal; a mean far outside the typical band or a collapsed distribution
 * indicates a non-beta matrix, failed normalization, or a corrupted column.
 */
export function betaDistributionCheck(betasForSample: ReadonlyMap<string, number>): QcCheck {
  let sum = 0;
  let n = 0;
  let extreme = 0;
  for (const beta of betasForSample.values()) {
    sum += beta;
    n += 1;
    if (beta < 0.2 || beta > 0.8) extreme += 1;
  }
  if (n === 0) {
    return {
      key: "beta_distribution",
      severity: "fail",
      detail: "No usable beta values in this sample column.",
      metrics: { n: 0, mean: null, extreme_fraction: null },
    };
  }
  const mean = sum / n;
  const extremeFraction = extreme / n;
  const metrics = {
    n,
    mean: Number(mean.toFixed(4)),
    extreme_fraction: Number(extremeFraction.toFixed(4)),
  };

  if (mean < 0.3 || mean > 0.75) {
    return {
      key: "beta_distribution",
      severity: "fail",
      detail: `Mean beta ${mean.toFixed(3)} is outside the plausible band [0.30, 0.75] for a normalized methylome. This does not look like a beta matrix.`,
      metrics,
    };
  }
  if (extremeFraction < 0.4) {
    return {
      key: "beta_distribution",
      severity: "warn",
      detail: `Only ${(extremeFraction * 100).toFixed(1)}% of values are in the bimodal extremes; methylomes are typically majority-extreme. Check normalization.`,
      metrics,
    };
  }
  return {
    key: "beta_distribution",
    severity: "pass",
    detail: "Beta distribution looks like a normalized methylome.",
    metrics,
  };
}

/** Missingness within the sample column. */
export function missingnessCheck(present: number, expected: number): QcCheck {
  const missingFraction = expected === 0 ? 1 : 1 - present / expected;
  const metrics = { present, expected, missing_fraction: Number(missingFraction.toFixed(4)) };
  if (missingFraction > 0.2) {
    return {
      key: "missingness",
      severity: "fail",
      detail: `${(missingFraction * 100).toFixed(1)}% of probe values are missing for this sample.`,
      metrics,
    };
  }
  if (missingFraction > 0.05) {
    return {
      key: "missingness",
      severity: "warn",
      detail: `${(missingFraction * 100).toFixed(1)}% of probe values are missing for this sample.`,
      metrics,
    };
  }
  return { key: "missingness", severity: "pass", detail: "Missingness is within bounds.", metrics };
}

const worstOf = (checks: QcCheck[]): QcSeverity =>
  checks.some((c) => c.severity === "fail")
    ? "fail"
    : checks.some((c) => c.severity === "warn")
      ? "warn"
      : "pass";

/** Runs the full QC battery for one sample column of a parsed beta matrix. */
export function runSampleQc(
  matrix: BetaMatrix,
  sampleId: string,
  declaredSex: "female" | "male" | "unspecified",
): SampleQcReport {
  const betas = new Map<string, number>();
  for (const [probe, bySample] of matrix.probes) {
    const value = bySample.get(sampleId);
    if (value !== undefined) betas.set(probe, value);
  }

  const checks = [
    missingnessCheck(betas.size, matrix.probes.size),
    betaDistributionCheck(betas),
    clockCoverageCheck(betas),
    sexConcordanceCheck(betas, declaredSex),
  ];

  return { sampleId, overall: worstOf(checks), checks };
}
