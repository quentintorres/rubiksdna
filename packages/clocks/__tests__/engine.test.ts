import { describe, expect, it } from "vitest";
import { computeClock, horvathAntiTransform } from "../src/engine";
import { harmonizeBetas } from "../src/harmonize";
import { assessDelta, mdc95 } from "../src/mdc";
import { clockRegistry, getClock, resolveClocksForOrg } from "../src/registry";
import { imputationReference450k } from "../src/imputation";
import type { ClockDefinition } from "../src/types";

const toyClock: ClockDefinition = {
  id: "toy",
  version: "1.0.0",
  displayName: "Toy clock",
  yearPublished: 2026,
  tissue: "test",
  supportedPlatforms: ["methylation_450k"],
  coefficients: new Map([
    ["cgA", 2],
    ["cgB", -1],
    ["cgC", 10],
    ["cgD", 4],
  ]),
  intercept: 1,
  transform: (x) => x,
  maxImputedFraction: 0.25,
  technicalSd: 1,
  technicalSdSource: "test",
  license: {
    status: "open_published",
    allowedOrgTypes: ["research", "clinic"],
    source: "test",
    notes: "test",
  },
  preprocessingAssumptions: "test",
};

describe("computeClock", () => {
  it("computes transform(intercept + dot product)", () => {
    const betas = new Map([
      ["cgA", 0.5],
      ["cgB", 0.2],
      ["cgC", 0.1],
      ["cgD", 0.25],
    ]);
    const result = computeClock(toyClock, betas);
    // 1 + 2*0.5 - 1*0.2 + 10*0.1 + 4*0.25 = 3.8
    expect(result.value).toBeCloseTo(3.8, 10);
    expect(result.probesUsed).toBe(4);
    expect(result.probesImputed).toBe(0);
  });

  it("imputes a missing probe from the reference and records it", () => {
    const betas = new Map([
      ["cgA", 0.5],
      ["cgB", 0.2],
      ["cgC", 0.1],
    ]);
    const reference = new Map([["cgD", 0.25]]);
    const result = computeClock(toyClock, betas, { imputationReference: reference });
    expect(result.value).toBeCloseTo(3.8, 10);
    expect(result.probesImputed).toBe(1);
  });

  it("refuses when the imputed fraction exceeds the clock's maximum", () => {
    const betas = new Map([
      ["cgA", 0.5],
      ["cgB", 0.2],
    ]);
    const reference = new Map([
      ["cgC", 0.1],
      ["cgD", 0.25],
    ]);
    const result = computeClock(toyClock, betas, { imputationReference: reference });
    expect(result.value).toBeNull();
    expect(result.refusedReason).toMatch(/imputed fraction/);
  });

  it("refuses when a probe is missing from both sample and reference", () => {
    const betas = new Map([["cgA", 0.5]]);
    const result = computeClock(toyClock, betas);
    expect(result.value).toBeNull();
    expect(result.refusedReason).toMatch(/missing from sample and imputation reference/);
  });
});

describe("horvathAntiTransform (published anchor points)", () => {
  it("maps 0 to adult age 20", () => {
    expect(horvathAntiTransform(0)).toBe(20);
  });
  it("is linear above 0", () => {
    expect(horvathAntiTransform(1)).toBe(41);
  });
  it("is exponential below 0", () => {
    expect(horvathAntiTransform(-1)).toBeCloseTo(21 * Math.exp(-1) - 1, 10);
  });
  it("is continuous at 0", () => {
    const eps = 1e-9;
    expect(Math.abs(horvathAntiTransform(-eps) - horvathAntiTransform(eps))).toBeLessThan(1e-6);
  });
});

describe("mdc95 / assessDelta", () => {
  it("computes 1.96 * sqrt(2) * sd", () => {
    expect(mdc95(2.4)).toBeCloseTo(1.96 * Math.SQRT2 * 2.4, 12);
  });

  it("gates a delta below the MDC as within noise", () => {
    const assessment = assessDelta(50, 52, 2.4); // MDC ≈ 6.65
    expect(assessment.exceedsMdc).toBe(false);
    expect(assessment.direction).toBe("within_noise");
  });

  it("passes a delta above the MDC with direction", () => {
    const down = assessDelta(60, 50, 2.4);
    expect(down.exceedsMdc).toBe(true);
    expect(down.direction).toBe("decreased");
  });

  it("rejects non-positive sd", () => {
    expect(() => mdc95(0)).toThrow();
  });
});

describe("harmonizeBetas", () => {
  it("collapses EPICv2 replicate suffixes by mean", () => {
    const raw = new Map([
      ["cg00000029_TC21", 0.4],
      ["cg00000029_BC21", 0.6],
      ["cg99999999", 0.5],
    ]);
    const result = harmonizeBetas("methylation_epic_v2", raw);
    expect(result.betas.get("cg00000029")).toBeCloseTo(0.5, 10);
    expect(result.collapsedReplicates).toBe(1);
  });

  it("does not strip suffixes on 450k data", () => {
    const raw = new Map([["cg00000029_TC21", 0.4]]);
    const result = harmonizeBetas("methylation_450k", raw);
    expect(result.betas.has("cg00000029_TC21")).toBe(true);
  });

  it("drops out-of-range and non-finite values without clamping", () => {
    const raw = new Map([
      ["cgA", 1.2],
      ["cgB", Number.NaN],
      ["cgC", 0.9],
    ]);
    const result = harmonizeBetas("methylation_450k", raw);
    expect(result.betas.size).toBe(1);
    expect(result.droppedOutOfRange).toBe(1);
    expect(result.droppedNonFinite).toBe(1);
  });
});

describe("registry and license gating", () => {
  it("registers exactly the published clock probe counts", () => {
    expect(getClock("horvath2013").coefficients.size).toBe(353);
    expect(getClock("hannum2013").coefficients.size).toBe(71);
  });

  it("resolves only open_published clocks for an org", () => {
    const clocks = resolveClocksForOrg("clinic");
    expect(clocks.every((c) => c.license.status === "open_published")).toBe(true);
    expect(clocks.map((c) => c.id).sort()).toEqual(["hannum2013", "horvath2013"]);
  });

  it("every registered clock declares preprocessing assumptions and a noise source", () => {
    for (const clock of clockRegistry().values()) {
      expect(clock.preprocessingAssumptions.length).toBeGreaterThan(40);
      expect(clock.technicalSdSource.length).toBeGreaterThan(20);
      expect(clock.technicalSd).toBeGreaterThan(0);
      expect(clock.maxImputedFraction).toBeLessThanOrEqual(0.1);
    }
  });

  it("imputation reference covers every registered clock probe", () => {
    const reference = imputationReference450k();
    for (const clock of clockRegistry().values()) {
      for (const probe of clock.coefficients.keys()) {
        expect(reference.has(probe), `missing reference for ${probe}`).toBe(true);
      }
    }
  });
});
