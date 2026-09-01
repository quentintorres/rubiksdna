import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/**
 * Loads a published coefficient CSV (columns: CpGmarker,CoefficientTraining).
 * The files in ../data are unmodified copies of the published supplements as
 * redistributed by the biolearn project; see ../data/PROVENANCE.md.
 */
export function loadCoefficients(filename: string): Map<string, number> {
  const text = readFileSync(join(dataDir, filename), "utf8");
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0];
  if (!header?.startsWith("CpGmarker,")) {
    throw new Error(`Unexpected coefficient file header in ${filename}: ${header}`);
  }
  const out = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const [probe, coef] = line.split(",");
    if (!probe || coef === undefined) continue;
    const value = Number(coef);
    if (!Number.isFinite(value)) {
      throw new Error(`Non-numeric coefficient for ${probe} in ${filename}`);
    }
    out.set(probe.trim(), value);
  }
  return out;
}
