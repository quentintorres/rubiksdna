import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

let cache: Map<string, number> | null = null;

/**
 * v1 imputation reference: sesame 450k median beta per probe, filtered to the
 * union of probes required by registered clocks. Provenance in
 * data/PROVENANCE.md. This is the single imputation strategy the pipeline
 * uses; there is deliberately no second one.
 */
export function imputationReference450k(): Map<string, number> {
  if (cache) return cache;
  const text = readFileSync(join(dataDir, "imputation_reference_450k.csv"), "utf8");
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] !== "Probe_ID,median") {
    throw new Error("Unexpected imputation reference header");
  }
  cache = new Map();
  for (const line of lines.slice(1)) {
    const [probe, median] = line.split(",");
    if (probe && median !== undefined) cache.set(probe, Number(median));
  }
  return cache;
}
