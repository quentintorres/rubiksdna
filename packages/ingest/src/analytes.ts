/**
 * The analyte dictionary: canonical keys, accepted units, and plausibility
 * bounds for the panels v1 ingests.
 *
 * Bounds are data-validation bounds — the widest range a real laboratory
 * value could plausibly take. They exist to catch unit mix-ups and column
 * swaps. They are NOT reference intervals and are never shown as normal
 * ranges anywhere in the product.
 */

export interface AnalyteSpec {
  key: string;
  displayName: string;
  unit: string;
  /** Accepted spellings in uploaded files, lowercased. */
  aliases: string[];
  /** Plausibility bounds in canonical unit (validation only, see above). */
  min: number;
  max: number;
}

export const ANALYTES: readonly AnalyteSpec[] = [
  {
    key: "crp_hs",
    displayName: "hs-CRP",
    unit: "mg/L",
    aliases: ["crp", "hs-crp", "hscrp", "c-reactive protein", "crp_hs"],
    min: 0,
    max: 300,
  },
  {
    key: "il6",
    displayName: "IL-6",
    unit: "pg/mL",
    aliases: ["il-6", "il6", "interleukin 6", "interleukin-6"],
    min: 0,
    max: 1000,
  },
  {
    key: "neutrophils",
    displayName: "Neutrophils (absolute)",
    unit: "10^9/L",
    aliases: ["neutrophils", "anc", "neutrophil count", "neut"],
    min: 0,
    max: 60,
  },
  {
    key: "lymphocytes",
    displayName: "Lymphocytes (absolute)",
    unit: "10^9/L",
    aliases: ["lymphocytes", "alc", "lymphocyte count", "lymph"],
    min: 0,
    max: 60,
  },
  {
    key: "glucose_fasting",
    displayName: "Fasting glucose",
    unit: "mg/dL",
    aliases: ["glucose", "fasting glucose", "glucose_fasting", "fbg", "gluc"],
    min: 20,
    max: 1000,
  },
  {
    key: "insulin_fasting",
    displayName: "Fasting insulin",
    unit: "uIU/mL",
    aliases: ["insulin", "fasting insulin", "insulin_fasting"],
    min: 0,
    max: 300,
  },
  {
    key: "hba1c",
    displayName: "HbA1c",
    unit: "%",
    aliases: ["hba1c", "a1c", "hemoglobin a1c", "glycated hemoglobin"],
    min: 2,
    max: 20,
  },
  {
    key: "igf1",
    displayName: "IGF-1",
    unit: "ng/mL",
    aliases: ["igf-1", "igf1", "insulin-like growth factor 1"],
    min: 0,
    max: 1500,
  },
  {
    key: "cholesterol_total",
    displayName: "Total cholesterol",
    unit: "mg/dL",
    aliases: ["total cholesterol", "cholesterol", "chol", "cholesterol_total", "tc"],
    min: 40,
    max: 1000,
  },
  {
    key: "ldl_c",
    displayName: "LDL-C",
    unit: "mg/dL",
    aliases: ["ldl", "ldl-c", "ldl cholesterol", "ldl_c"],
    min: 10,
    max: 800,
  },
  {
    key: "hdl_c",
    displayName: "HDL-C",
    unit: "mg/dL",
    aliases: ["hdl", "hdl-c", "hdl cholesterol", "hdl_c"],
    min: 5,
    max: 200,
  },
  {
    key: "triglycerides",
    displayName: "Triglycerides",
    unit: "mg/dL",
    aliases: ["triglycerides", "tg", "trig"],
    min: 10,
    max: 5000,
  },
  {
    key: "bmi",
    displayName: "Body mass index",
    unit: "kg/m^2",
    aliases: ["bmi", "body mass index"],
    min: 8,
    max: 100,
  },
  {
    key: "waist_circumference",
    displayName: "Waist circumference",
    unit: "cm",
    aliases: ["waist", "waist circumference", "wc"],
    min: 30,
    max: 250,
  },
  {
    key: "telomere_length",
    displayName: "Telomere length (T/S ratio)",
    unit: "t/s",
    aliases: ["telomere", "telomere length", "t/s", "ts ratio", "telomere_length"],
    min: 0.1,
    max: 5,
  },
] as const;

const byAlias = new Map<string, AnalyteSpec>();
for (const spec of ANALYTES) {
  byAlias.set(spec.key.toLowerCase(), spec);
  for (const alias of spec.aliases) byAlias.set(alias.toLowerCase(), spec);
}

export const resolveAnalyte = (name: string): AnalyteSpec | undefined =>
  byAlias.get(name.trim().toLowerCase());
