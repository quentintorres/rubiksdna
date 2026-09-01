import type { ClockComputation, ClockDefinition } from "./types";

export interface EngineOptions {
  /**
   * Reference beta values used to impute probes absent from the sample
   * (v1 strategy: sesame 450k reference medians, see data/PROVENANCE.md).
   * A probe absent from both the sample and this reference is unrecoverable.
   */
  imputationReference?: ReadonlyMap<string, number>;
  /**
   * Reference-parity mode used ONLY by golden-file tests: probes absent from
   * the sample contribute zero, matching the NaN-skipping semantics of the
   * published reference implementation the expected outputs were generated
   * with. Never enabled in the pipeline.
   */
  missingContributesZeroForGoldenParity?: boolean;
}

/**
 * Computes a linear methylation clock: transform(intercept + Σ coef·beta).
 *
 * The one explicit imputation strategy: a probe missing from the sample is
 * taken from the imputation reference and counted in `probesImputed`. If the
 * imputed fraction exceeds the clock's configured maximum, or a probe is
 * missing from both sample and reference, the computation is refused rather
 * than silently degraded.
 */
export function computeClock(
  def: ClockDefinition,
  betas: ReadonlyMap<string, number>,
  options: EngineOptions = {},
): ClockComputation {
  const { imputationReference, missingContributesZeroForGoldenParity = false } = options;

  let sum = def.intercept;
  let probesUsed = 0;
  let probesImputed = 0;
  const unrecoverable: string[] = [];

  for (const [probe, coefficient] of def.coefficients) {
    const sampleValue = betas.get(probe);
    if (sampleValue !== undefined && Number.isFinite(sampleValue)) {
      sum += coefficient * sampleValue;
      probesUsed += 1;
      continue;
    }

    if (missingContributesZeroForGoldenParity) {
      probesUsed += 1;
      continue;
    }

    const referenceValue = imputationReference?.get(probe);
    if (referenceValue !== undefined && Number.isFinite(referenceValue)) {
      sum += coefficient * referenceValue;
      probesUsed += 1;
      probesImputed += 1;
      continue;
    }

    unrecoverable.push(probe);
  }

  const base = {
    clockId: def.id,
    clockVersion: def.version,
    probesUsed,
    probesImputed,
  };

  if (unrecoverable.length > 0) {
    return {
      ...base,
      value: null,
      refusedReason: `${unrecoverable.length} required probe(s) missing from sample and imputation reference (first: ${unrecoverable[0]})`,
    };
  }

  const imputedFraction = probesImputed / def.coefficients.size;
  if (imputedFraction > def.maxImputedFraction) {
    return {
      ...base,
      value: null,
      refusedReason: `imputed fraction ${imputedFraction.toFixed(3)} exceeds configured maximum ${def.maxImputedFraction} for ${def.id}`,
    };
  }

  return { ...base, value: def.transform(sum), refusedReason: null };
}

/**
 * Horvath 2013 age transform (adult_age = 20), exactly as published:
 * calibrated ages below adulthood are log-linear, above are linear.
 */
export const horvathAntiTransform = (x: number, adultAge = 20): number =>
  x < 0 ? (1 + adultAge) * Math.exp(x) - 1 : (1 + adultAge) * x + adultAge;
