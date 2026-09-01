import { resolveAnalyte } from "./analytes";
import { MAX_REPORTED_ERRORS, type ParseOutcome, type RowError } from "./errors";

/**
 * Parser for blood chemistry panel CSVs.
 *
 * Accepted shape (long form, one analyte per row):
 *   analyte,value,unit[,below_loq]
 *
 * Analyte names resolve through the dictionary's aliases; unknown analytes
 * are per-row errors naming the row, not a rejected file.
 */

export interface PanelMeasurement {
  analyteKey: string;
  value: number;
  unit: string;
  belowLoq: boolean;
}

export function parseChemPanel(text: string): ParseOutcome<PanelMeasurement[]> {
  const errors: RowError[] = [];
  const warnings: RowError[] = [];
  const pushError = (e: RowError) => {
    if (errors.length < MAX_REPORTED_ERRORS) errors.push(e);
  };

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      ok: false,
      data: null,
      errors: [
        {
          row: 0,
          column: null,
          code: "missing_header",
          message: "Expected header 'analyte,value,unit[,below_loq]' and at least one row.",
        },
      ],
      warnings,
      truncatedErrors: false,
    };
  }

  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const analyteCol = col("analyte");
  const valueCol = col("value");
  const unitCol = col("unit");
  const loqCol = col("below_loq");

  if (analyteCol < 0 || valueCol < 0 || unitCol < 0) {
    return {
      ok: false,
      data: null,
      errors: [
        {
          row: 1,
          column: null,
          code: "missing_header",
          message: `Header must include 'analyte', 'value' and 'unit'. Found: ${header.join(", ")}.`,
        },
      ],
      warnings,
      truncatedErrors: false,
    };
  }

  const seen = new Set<string>();
  const measurements: PanelMeasurement[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cells = lines[i]!.split(",").map((c) => c.trim());
    const rawAnalyte = cells[analyteCol] ?? "";
    const rawValue = cells[valueCol] ?? "";
    const rawUnit = cells[unitCol] ?? "";
    const rawLoq = loqCol >= 0 ? (cells[loqCol] ?? "") : "";

    const spec = resolveAnalyte(rawAnalyte);
    if (!spec) {
      pushError({
        row: rowNumber,
        column: "analyte",
        code: "unknown_analyte",
        message: `"${rawAnalyte}" is not a recognized analyte. Recognized names are listed in the upload guide.`,
      });
      continue;
    }
    if (seen.has(spec.key)) {
      pushError({
        row: rowNumber,
        column: "analyte",
        code: "duplicate_key",
        message: `"${spec.displayName}" appears more than once.`,
      });
      continue;
    }

    const value = Number(rawValue);
    if (rawValue === "" || !Number.isFinite(value)) {
      pushError({
        row: rowNumber,
        column: "value",
        code: rawValue === "" ? "missing_value" : "non_numeric",
        message: `Value "${rawValue}" for ${spec.displayName} is not a number.`,
      });
      continue;
    }

    const normalizedUnit = rawUnit.toLowerCase().replace(/\s/g, "");
    const expectedUnit = spec.unit.toLowerCase().replace(/\s/g, "");
    if (normalizedUnit !== expectedUnit) {
      pushError({
        row: rowNumber,
        column: "unit",
        code: "unit_mismatch",
        message: `${spec.displayName} must be reported in ${spec.unit}; file says "${rawUnit}". v1 does not convert units.`,
      });
      continue;
    }

    if (value < spec.min || value > spec.max) {
      pushError({
        row: rowNumber,
        column: "value",
        code: "implausible_value",
        message: `${spec.displayName} = ${value} ${spec.unit} is outside the plausibility bounds [${spec.min}, ${spec.max}] used to catch unit mix-ups. If the value is genuine, contact support.`,
      });
      continue;
    }

    seen.add(spec.key);
    measurements.push({
      analyteKey: spec.key,
      value,
      unit: spec.unit,
      belowLoq: /^(true|1|yes)$/i.test(rawLoq),
    });
  }

  const ok = errors.length === 0 && measurements.length > 0;
  return {
    ok,
    data: ok ? measurements : null,
    errors,
    warnings,
    truncatedErrors: errors.length >= MAX_REPORTED_ERRORS,
  };
}
