import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeClock } from "../src/engine";
import { getClock } from "../src/registry";

/**
 * Golden-file validation, required for clock registration.
 *
 * Input: 10 whole-blood 450k samples from GEO series GSE41169 (one of the
 * evaluation datasets of the Horvath 2013 paper), restricted to registered
 * clock probes. Expected outputs are the published reference values from the
 * biolearn project's test suite — an independent implementation of the same
 * published models. Provenance: ../data/PROVENANCE.md.
 *
 * Tolerances are per clock. Hannum matches the reference project's own golden
 * tolerance (1e-5). Horvath is compared at 0.02 years because the reference
 * implementation rounds the published intercept 0.695507258 to 0.696; through
 * the adult branch of the age transform (slope 21) that rounding alone
 * shifts every output by (0.696 - 0.695507258) * 21 ≈ 0.0103 years. We keep
 * the full-precision published intercept and accept the reference's rounding
 * as documented disagreement, rather than copying the rounding to make the
 * numbers match.
 */

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), "golden");
const TOLERANCES: Record<string, number> = {
  horvath2013: 0.02,
  hannum2013: 1e-5,
};

function loadFixture(): Map<string, Map<string, number>> {
  const lines = readFileSync(join(goldenDir, "gse41169_clock_probes.csv"), "utf8")
    .trim()
    .split(/\r?\n/);
  const header = lines[0]!.split(",");
  const samples = header.slice(1);
  const bySample = new Map<string, Map<string, number>>(
    samples.map((s) => [s, new Map<string, number>()]),
  );
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const probe = cells[0]!;
    samples.forEach((sample, i) => {
      const raw = cells[i + 1];
      if (raw !== undefined && raw !== "" && raw.toLowerCase() !== "null") {
        const value = Number(raw);
        if (Number.isFinite(value)) bySample.get(sample)!.set(probe, value);
      }
    });
  }
  return bySample;
}

function loadExpected(file: string): Map<string, number> {
  const lines = readFileSync(join(goldenDir, "expected", file), "utf8").trim().split(/\r?\n/);
  const out = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const [id, predicted] = line.split(",");
    if (id && predicted !== undefined) out.set(id, Number(predicted));
  }
  return out;
}

const fixture = loadFixture();

describe.each([
  ["horvath2013", "horvath2013.csv"],
  ["hannum2013", "hannum2013.csv"],
])("golden validation: %s vs published reference outputs (GSE41169)", (clockId, expectedFile) => {
  const clock = getClock(clockId);
  const expected = loadExpected(expectedFile);
  const TOLERANCE = TOLERANCES[clockId]!;

  it("covers all 10 reference samples", () => {
    expect(expected.size).toBe(10);
    for (const sample of expected.keys()) expect(fixture.has(sample)).toBe(true);
  });

  for (const [sample, expectedValue] of loadExpected(expectedFile)) {
    it(`${sample}: matches published value ${expectedValue.toFixed(4)} within ${TOLERANCE}`, () => {
      const betas = fixture.get(sample)!;
      const result = computeClock(clock, betas, {
        // The published expected outputs were generated with the reference
        // implementation's NaN-skipping semantics; mirror them exactly here.
        missingContributesZeroForGoldenParity: true,
      });
      expect(result.refusedReason).toBeNull();
      expect(result.value).not.toBeNull();
      expect(Math.abs(result.value! - expectedValue)).toBeLessThan(TOLERANCE);
    });
  }
});
