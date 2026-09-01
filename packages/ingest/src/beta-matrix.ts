import { MAX_REPORTED_ERRORS, type ParseOutcome, type RowError } from "./errors";

/**
 * Parser for pre-normalized methylation beta matrices.
 *
 * Accepted shape: CSV or TSV, first column CpG probe ids, remaining columns
 * one sample each. Values are beta in [0,1]; empty / NA cells are recorded,
 * never invented. v1 deliberately does not accept raw IDATs — normalization
 * choices belong to the source lab and are recorded on the sample.
 */

export interface BetaMatrix {
  sampleIds: string[];
  /** probe -> sampleId -> beta. NA cells are simply absent. */
  probes: Map<string, Map<string, number>>;
  naCells: number;
  totalCells: number;
}

const PROBE_ID = /^(cg|ch\.|rs)[\w.]+$/i;

export function parseBetaMatrix(text: string): ParseOutcome<BetaMatrix> {
  const errors: RowError[] = [];
  const warnings: RowError[] = [];
  const pushError = (e: RowError) => {
    if (errors.length < MAX_REPORTED_ERRORS) errors.push(e);
  };

  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) {
    return {
      ok: false,
      data: null,
      errors: [
        {
          row: 0,
          column: null,
          code: "missing_header",
          message: "File must contain a header row and at least one probe row.",
        },
      ],
      warnings,
      truncatedErrors: false,
    };
  }

  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const header = lines[0]!.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));
  const sampleIds = header.slice(1);

  if (sampleIds.length === 0) {
    pushError({
      row: 1,
      column: null,
      code: "missing_header",
      message: "Header must name at least one sample column after the probe id column.",
    });
  }
  const seenSamples = new Set<string>();
  sampleIds.forEach((s, i) => {
    if (!s) {
      pushError({
        row: 1,
        column: `column ${i + 2}`,
        code: "missing_header",
        message: "Empty sample column name.",
      });
    } else if (seenSamples.has(s)) {
      pushError({
        row: 1,
        column: s,
        code: "duplicate_key",
        message: `Duplicate sample column "${s}".`,
      });
    }
    seenSamples.add(s);
  });

  const probes = new Map<string, Map<string, number>>();
  let naCells = 0;
  let totalCells = 0;

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cells = lines[i]!.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
    const probe = cells[0];

    if (!probe) {
      pushError({
        row: rowNumber,
        column: null,
        code: "malformed_row",
        message: "Row has no probe id.",
      });
      continue;
    }
    if (!PROBE_ID.test(probe.replace(/_[A-Z]{2}\d+$/, ""))) {
      pushError({
        row: rowNumber,
        column: probe,
        code: "malformed_row",
        message: `"${probe}" does not look like an Illumina probe id (cg/ch./rs prefix).`,
      });
      continue;
    }
    if (probes.has(probe)) {
      pushError({
        row: rowNumber,
        column: probe,
        code: "duplicate_key",
        message: `Probe "${probe}" appears more than once.`,
      });
      continue;
    }
    if (cells.length - 1 !== sampleIds.length) {
      pushError({
        row: rowNumber,
        column: probe,
        code: "malformed_row",
        message: `Expected ${sampleIds.length} values, found ${cells.length - 1}.`,
      });
      continue;
    }

    const rowValues = new Map<string, number>();
    for (let c = 0; c < sampleIds.length; c++) {
      totalCells += 1;
      const rawValue = cells[c + 1]!;
      const sampleId = sampleIds[c]!;
      if (rawValue === "" || /^(na|nan|null)$/i.test(rawValue)) {
        naCells += 1;
        continue;
      }
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        pushError({
          row: rowNumber,
          column: sampleId,
          code: "non_numeric",
          message: `"${rawValue}" is not a number.`,
        });
        continue;
      }
      if (value < 0 || value > 1) {
        pushError({
          row: rowNumber,
          column: sampleId,
          code: "out_of_range",
          message: `Beta value ${value} is outside [0,1]. Is this an M-value or intensity matrix?`,
        });
        continue;
      }
      rowValues.set(sampleId, value);
    }
    probes.set(probe, rowValues);
  }

  const ok = errors.length === 0 && probes.size > 0;
  return {
    ok,
    data: ok ? { sampleIds, probes, naCells, totalCells } : null,
    errors,
    warnings,
    truncatedErrors: errors.length >= MAX_REPORTED_ERRORS,
  };
}
