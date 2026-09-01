/**
 * Minimum detectable change.
 *
 * For a difference of two measurements each carrying technical standard
 * deviation sdTechnical, the standard error of the difference is
 * sdTechnical * sqrt(2); the 95% MDC is 1.96 times that.
 *
 * A delta smaller than the MDC cannot be distinguished from measurement
 * noise, and the report layer is required to say so.
 */
export const mdc95 = (sdTechnical: number): number => {
  if (!(sdTechnical > 0)) {
    throw new Error("mdc95 requires a positive technical standard deviation");
  }
  return 1.96 * Math.SQRT2 * sdTechnical;
};

export interface DeltaAssessment {
  delta: number;
  mdc: number;
  exceedsMdc: boolean;
  direction: "increased" | "decreased" | "within_noise";
}

/** The single choke point deltas must pass through before being described. */
export const assessDelta = (pre: number, post: number, sdTechnical: number): DeltaAssessment => {
  const delta = post - pre;
  const mdc = mdc95(sdTechnical);
  const exceedsMdc = Math.abs(delta) > mdc;
  return {
    delta,
    mdc,
    exceedsMdc,
    direction: !exceedsMdc ? "within_noise" : delta > 0 ? "increased" : "decreased",
  };
};
