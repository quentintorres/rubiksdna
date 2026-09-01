/**
 * Reference distributions used to place an input relative to a population.
 *
 * PROVISIONAL v1 references: rounded adult population parameters drawn from
 * large public survey summaries (NHANES publications and widely reproduced
 * cohort statistics). They are deliberately coarse; every score derived from
 * them is marked `provisionalReference: true` and capped at confidence
 * "partial" until replaced by an in-house reference cohort with documented
 * composition. Replace values only together with the source note.
 */

export interface ReferenceStat {
  /** Distribution of the underlying value. */
  shape: "normal" | "lognormal";
  /** Mean of value (normal) or of ln(value) (lognormal). */
  mu: number;
  /** SD of value (normal) or of ln(value) (lognormal). */
  sigma: number;
  /** Whether a higher value maps to higher aging-burden orientation. */
  higherIsBurden: boolean;
  source: string;
}

export const PROVISIONAL_REFERENCES: Record<string, ReferenceStat> = {
  // ln(CRP mg/L): median ~1.4 → mu ≈ 0.34; broad spread in adults.
  crp_hs: {
    shape: "lognormal",
    mu: 0.34,
    sigma: 1.0,
    higherIsBurden: true,
    source: "Rounded from NHANES adult hs-CRP distributions (log-normal fit).",
  },
  il6: {
    shape: "lognormal",
    mu: 0.55,
    sigma: 0.8,
    higherIsBurden: true,
    source: "Rounded from published healthy-adult IL-6 distributions (log-normal fit).",
  },
  nlr: {
    shape: "lognormal",
    mu: 0.55,
    sigma: 0.45,
    higherIsBurden: true,
    source: "Rounded from published adult neutrophil-lymphocyte ratio distributions (median ~1.7).",
  },
  glucose_fasting: {
    shape: "normal",
    mu: 99,
    sigma: 17,
    higherIsBurden: true,
    source: "Rounded from NHANES adult fasting plasma glucose (mg/dL).",
  },
  hba1c: {
    shape: "normal",
    mu: 5.5,
    sigma: 0.6,
    higherIsBurden: true,
    source: "Rounded from NHANES adult HbA1c (%).",
  },
  homa_ir: {
    shape: "lognormal",
    mu: 0.53,
    sigma: 0.65,
    higherIsBurden: true,
    source: "Rounded from published adult HOMA-IR distributions (median ~1.7).",
  },
  triglycerides: {
    shape: "lognormal",
    mu: 4.62,
    sigma: 0.5,
    higherIsBurden: true,
    source: "Rounded from NHANES adult triglycerides (mg/dL, median ~100).",
  },
  hdl_c: {
    shape: "normal",
    mu: 53,
    sigma: 15,
    higherIsBurden: false,
    source: "Rounded from NHANES adult HDL-C (mg/dL).",
  },
  // Age acceleration (clock minus chronological age), first-generation clocks.
  age_acceleration: {
    shape: "normal",
    mu: 0,
    sigma: 5.5,
    higherIsBurden: true,
    source:
      "Zero-centered by construction; spread rounded from published first-generation clock error distributions (Horvath 2013 reports ~3.6y median absolute error; SD set conservatively wider).",
  },
};

/** Standard normal CDF via the Abramowitz–Stegun erf approximation (|err| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const poly =
    t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - d * poly;
  return z >= 0 ? p : 1 - p;
}

/**
 * Percentile (0–100) of `value` in the named reference, oriented so that
 * higher always means "further toward aging burden".
 */
export function burdenPercentile(referenceKey: string, value: number): number | null {
  const ref = PROVISIONAL_REFERENCES[referenceKey];
  if (!ref) return null;
  if (ref.shape === "lognormal" && value <= 0) return null;
  const z =
    ref.shape === "lognormal" ? (Math.log(value) - ref.mu) / ref.sigma : (value - ref.mu) / ref.sigma;
  const p = normalCdf(z) * 100;
  return ref.higherIsBurden ? p : 100 - p;
}
