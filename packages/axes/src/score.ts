import { burdenPercentile } from "./reference";
import {
  ALL_AXES,
  COMPUTABLE_AXES,
  type AxisInputs,
  type AxisKey,
  type AxisScore,
} from "./types";

/**
 * Hallmark axis scoring, honestly scoped.
 *
 * Rules this module never breaks:
 * 1. An axis with no usable inputs is returned with computable=false and no
 *    number — the state map renders it as "not measured", never as zero.
 * 2. Every score records exactly which inputs produced it and which expected
 *    inputs were absent.
 * 3. All percentiles come from the provisional reference table and cap
 *    confidence at "partial"; "high" additionally requires the axis's full
 *    input set.
 */

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function notComputable(axisKey: AxisKey, expected: string[], notes: string[] = []): AxisScore {
  return {
    axisKey,
    computable: false,
    score: null,
    percentile: null,
    confidence: "none",
    inputsUsed: [],
    inputsMissing: expected,
    notes,
  };
}

function scoreEpigenetic(inputs: AxisInputs): AxisScore {
  const expected = ["clock:horvath2013", "clock:hannum2013", "chronological_age"];
  const clockIds = Object.keys(inputs.clockValues);
  if (clockIds.length === 0 || inputs.chronologicalAge === null) {
    return notComputable(
      "epigenetic_alterations",
      expected,
      inputs.chronologicalAge === null && clockIds.length > 0
        ? ["Clock values exist but chronological age is missing, so age acceleration cannot be computed."]
        : [],
    );
  }

  const percentiles: number[] = [];
  const inputsUsed: string[] = [];
  for (const clockId of clockIds) {
    const acceleration = inputs.clockValues[clockId]! - inputs.chronologicalAge;
    const p = burdenPercentile("age_acceleration", acceleration);
    if (p !== null) {
      percentiles.push(p);
      inputsUsed.push(`clock:${clockId}`);
    }
  }
  inputsUsed.push("chronological_age");

  const missing = expected.filter((e) => !inputsUsed.includes(e));
  const score = mean(percentiles);
  return {
    axisKey: "epigenetic_alterations",
    computable: true,
    score: Number(score.toFixed(1)),
    percentile: Number(score.toFixed(1)),
    confidence: missing.length === 0 ? "high" : "partial",
    inputsUsed,
    inputsMissing: missing,
    notes: [
      "Scored as clock age acceleration (clock estimate minus chronological age) against a provisional reference spread.",
    ],
  };
}

function scoreInflammation(inputs: AxisInputs): AxisScore {
  const expected = ["crp_hs", "il6", "neutrophils", "lymphocytes"];
  const percentiles: number[] = [];
  const inputsUsed: string[] = [];
  const notes: string[] = [];

  for (const key of ["crp_hs", "il6"] as const) {
    const value = inputs.analytes[key];
    if (value !== undefined) {
      const p = burdenPercentile(key, value);
      if (p !== null) {
        percentiles.push(p);
        inputsUsed.push(key);
      }
    }
  }

  const neut = inputs.analytes["neutrophils"];
  const lymph = inputs.analytes["lymphocytes"];
  if (neut !== undefined && lymph !== undefined && lymph > 0) {
    const p = burdenPercentile("nlr", neut / lymph);
    if (p !== null) {
      percentiles.push(p);
      inputsUsed.push("neutrophils", "lymphocytes");
      notes.push("Neutrophil-lymphocyte ratio derived from the CBC.");
    }
  }

  if (percentiles.length === 0) return notComputable("chronic_inflammation", expected);

  const missing = expected.filter((e) => !inputsUsed.includes(e));
  return {
    axisKey: "chronic_inflammation",
    computable: true,
    score: Number(mean(percentiles).toFixed(1)),
    percentile: Number(mean(percentiles).toFixed(1)),
    confidence: missing.length === 0 ? "high" : "partial",
    inputsUsed,
    inputsMissing: missing,
    notes,
  };
}

function scoreNutrientSensing(inputs: AxisInputs): AxisScore {
  const expected = ["glucose_fasting", "insulin_fasting", "hba1c", "igf1"];
  const percentiles: number[] = [];
  const inputsUsed: string[] = [];
  const notes: string[] = [];

  const glucose = inputs.analytes["glucose_fasting"];
  const insulin = inputs.analytes["insulin_fasting"];

  for (const key of ["glucose_fasting", "hba1c"] as const) {
    const value = inputs.analytes[key];
    if (value !== undefined) {
      const p = burdenPercentile(key, value);
      if (p !== null) {
        percentiles.push(p);
        inputsUsed.push(key);
      }
    }
  }

  if (glucose !== undefined && insulin !== undefined) {
    const homaIr = (glucose * insulin) / 405; // mg/dL formulation
    const p = burdenPercentile("homa_ir", homaIr);
    if (p !== null) {
      percentiles.push(p);
      if (!inputsUsed.includes("glucose_fasting")) inputsUsed.push("glucose_fasting");
      inputsUsed.push("insulin_fasting");
      notes.push("HOMA-IR derived from fasting glucose and insulin (mg/dL formulation).");
    }
  }

  if (inputs.analytes["igf1"] !== undefined) {
    notes.push(
      "IGF-1 was supplied but is not folded into the score: its reference distribution is strongly age- and assay-dependent and a defensible reference is not yet in place.",
    );
  }

  if (percentiles.length === 0) return notComputable("deregulated_nutrient_sensing", expected);

  const missing = expected.filter((e) => !inputsUsed.includes(e));
  return {
    axisKey: "deregulated_nutrient_sensing",
    computable: true,
    score: Number(mean(percentiles).toFixed(1)),
    percentile: Number(mean(percentiles).toFixed(1)),
    confidence: "partial",
    inputsUsed,
    inputsMissing: missing,
    notes,
  };
}

function scoreMetabolic(inputs: AxisInputs): AxisScore {
  const expected = ["triglycerides", "hdl_c", "bmi", "waist_circumference"];
  const percentiles: number[] = [];
  const inputsUsed: string[] = [];
  const notes: string[] = [];

  for (const key of ["triglycerides", "hdl_c"] as const) {
    const value = inputs.analytes[key];
    if (value !== undefined) {
      const p = burdenPercentile(key, value);
      if (p !== null) {
        percentiles.push(p);
        inputsUsed.push(key);
      }
    }
  }

  for (const key of ["bmi", "waist_circumference"] as const) {
    if (inputs.analytes[key] !== undefined) {
      inputsUsed.push(key);
      notes.push(
        `${key} recorded for context but not folded into the score: body composition references depend on cohort in ways the provisional table cannot honestly capture.`,
      );
    }
  }

  if (percentiles.length === 0) return notComputable("metabolic_set_point", expected);

  const missing = expected.filter((e) => !inputsUsed.includes(e));
  return {
    axisKey: "metabolic_set_point",
    computable: true,
    score: Number(mean(percentiles).toFixed(1)),
    percentile: Number(mean(percentiles).toFixed(1)),
    confidence: "partial",
    inputsUsed,
    inputsMissing: missing,
    notes,
  };
}

function scoreTelomere(inputs: AxisInputs): AxisScore {
  const expected = ["telomere_length"];
  const ts = inputs.analytes["telomere_length"];
  if (ts === undefined) {
    return notComputable("telomere_attrition", expected, [
      "Scored only when the customer's lab supplied a telomere assay.",
    ]);
  }
  return {
    axisKey: "telomere_attrition",
    computable: true,
    // T/S ratios are not comparable across labs; report the value, refuse the percentile.
    score: null,
    percentile: null,
    confidence: "partial",
    inputsUsed: ["telomere_length"],
    inputsMissing: [],
    notes: [
      `Telomere T/S ratio ${ts} recorded. No percentile is shown: T/S ratios are assay- and lab-specific, and no cross-lab reference distribution is defensible.`,
    ],
  };
}

/**
 * Scores every hallmark axis. Axes outside v1 scope always return
 * computable=false — rendering them is the state map's job, inventing
 * numbers for them is nobody's.
 */
export function scoreAllAxes(inputs: AxisInputs): AxisScore[] {
  const scorers: Partial<Record<AxisKey, (i: AxisInputs) => AxisScore>> = {
    epigenetic_alterations: scoreEpigenetic,
    chronic_inflammation: scoreInflammation,
    deregulated_nutrient_sensing: scoreNutrientSensing,
    metabolic_set_point: scoreMetabolic,
    telomere_attrition: scoreTelomere,
  };

  return ALL_AXES.map((axisKey) => {
    const scorer = scorers[axisKey];
    if (!scorer) {
      return notComputable(axisKey, [], ["Not measurable from v1 inputs."]);
    }
    return scorer(inputs);
  });
}

export { COMPUTABLE_AXES };
