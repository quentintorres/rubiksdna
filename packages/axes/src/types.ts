/**
 * The twelve hallmarks of aging (López-Otín et al., Cell 2023) as axis keys.
 * Every one is always present in output; the ones we cannot compute from the
 * supplied inputs say so instead of disappearing.
 */
export const ALL_AXES = [
  "genomic_instability",
  "telomere_attrition",
  "epigenetic_alterations",
  "loss_of_proteostasis",
  "disabled_macroautophagy",
  "deregulated_nutrient_sensing",
  "mitochondrial_dysfunction",
  "cellular_senescence",
  "stem_cell_exhaustion",
  "altered_intercellular_communication",
  "chronic_inflammation",
  "dysbiosis",
  // Not one of the twelve hallmarks: a companion axis the plan calls for,
  // labeled as such in the UI so it is never mistaken for one.
  "metabolic_set_point",
] as const;

export type AxisKey = (typeof ALL_AXES)[number];

/** Axes v1 can actually score, given the right inputs. */
export const COMPUTABLE_AXES: readonly AxisKey[] = [
  "epigenetic_alterations",
  "chronic_inflammation",
  "deregulated_nutrient_sensing",
  "metabolic_set_point",
  "telomere_attrition",
];

export const AXIS_LABELS: Record<AxisKey, string> = {
  genomic_instability: "Genomic instability",
  telomere_attrition: "Telomere attrition",
  epigenetic_alterations: "Epigenetic alterations",
  loss_of_proteostasis: "Loss of proteostasis",
  disabled_macroautophagy: "Disabled macroautophagy",
  deregulated_nutrient_sensing: "Deregulated nutrient sensing",
  mitochondrial_dysfunction: "Mitochondrial dysfunction",
  cellular_senescence: "Cellular senescence",
  stem_cell_exhaustion: "Stem cell exhaustion",
  altered_intercellular_communication: "Altered intercellular communication",
  chronic_inflammation: "Chronic inflammation",
  dysbiosis: "Dysbiosis",
  metabolic_set_point: "Metabolic set point (companion axis)",
};

export type Confidence = "high" | "partial" | "none";

export interface AxisScore {
  axisKey: AxisKey;
  computable: boolean;
  /**
   * 0–100 position relative to the reference distribution, oriented so higher
   * means further from the reference median in the direction associated with
   * aging burden for this axis. Null when not computable, or when inputs
   * exist but no cross-lab reference is defensible (telomere T/S).
   */
  score: number | null;
  percentile: number | null;
  confidence: Confidence;
  inputsUsed: string[];
  inputsMissing: string[];
  /** Human-readable notes about what limited the computation. */
  notes: string[];
}

/** Everything the scorer may consume. All optional; absence is recorded. */
export interface AxisInputs {
  chronologicalAge: number | null;
  /** clockId -> clock output (years). Refused clocks are absent. */
  clockValues: Record<string, number>;
  /** analyteKey -> value in the canonical unit from the analyte dictionary. */
  analytes: Record<string, number>;
}
