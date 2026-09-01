import { describe, expect, it } from "vitest";
import { normalCdf } from "../src/reference";
import { scoreAllAxes } from "../src/score";
import { ALL_AXES, type AxisInputs } from "../src/types";

const emptyInputs: AxisInputs = {
  chronologicalAge: null,
  clockValues: {},
  analytes: {},
};

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe("scoreAllAxes", () => {
  it("always returns every axis, none invented", () => {
    const scores = scoreAllAxes(emptyInputs);
    expect(scores).toHaveLength(ALL_AXES.length);
    for (const s of scores) {
      expect(s.computable).toBe(false);
      expect(s.score).toBeNull();
    }
  });

  it("scores epigenetic axis from age acceleration", () => {
    const scores = scoreAllAxes({
      chronologicalAge: 50,
      clockValues: { horvath2013: 50, hannum2013: 50 },
      analytes: {},
    });
    const epi = scores.find((s) => s.axisKey === "epigenetic_alterations")!;
    expect(epi.computable).toBe(true);
    // zero acceleration = middle of the reference
    expect(epi.score).toBeCloseTo(50, 0);
    expect(epi.confidence).toBe("high");
    expect(epi.inputsUsed).toContain("clock:horvath2013");
  });

  it("refuses epigenetic axis without chronological age", () => {
    const scores = scoreAllAxes({
      chronologicalAge: null,
      clockValues: { horvath2013: 55 },
      analytes: {},
    });
    const epi = scores.find((s) => s.axisKey === "epigenetic_alterations")!;
    expect(epi.computable).toBe(false);
    expect(epi.notes.join(" ")).toMatch(/chronological age is missing/);
  });

  it("derives NLR for inflammation and records partial confidence", () => {
    const scores = scoreAllAxes({
      ...emptyInputs,
      analytes: { neutrophils: 4, lymphocytes: 2 },
    });
    const inflammation = scores.find((s) => s.axisKey === "chronic_inflammation")!;
    expect(inflammation.computable).toBe(true);
    expect(inflammation.confidence).toBe("partial");
    expect(inflammation.inputsMissing).toContain("crp_hs");
  });

  it("higher CRP produces a higher burden score", () => {
    const low = scoreAllAxes({ ...emptyInputs, analytes: { crp_hs: 0.5 } });
    const high = scoreAllAxes({ ...emptyInputs, analytes: { crp_hs: 10 } });
    const pick = (xs: ReturnType<typeof scoreAllAxes>) =>
      xs.find((s) => s.axisKey === "chronic_inflammation")!.score!;
    expect(pick(high)).toBeGreaterThan(pick(low));
  });

  it("low HDL scores as higher metabolic burden (orientation flip)", () => {
    const lowHdl = scoreAllAxes({ ...emptyInputs, analytes: { hdl_c: 30 } });
    const highHdl = scoreAllAxes({ ...emptyInputs, analytes: { hdl_c: 80 } });
    const pick = (xs: ReturnType<typeof scoreAllAxes>) =>
      xs.find((s) => s.axisKey === "metabolic_set_point")!.score!;
    expect(pick(lowHdl)).toBeGreaterThan(pick(highHdl));
  });

  it("derives HOMA-IR when glucose and insulin are both present", () => {
    const scores = scoreAllAxes({
      ...emptyInputs,
      analytes: { glucose_fasting: 100, insulin_fasting: 10 },
    });
    const axis = scores.find((s) => s.axisKey === "deregulated_nutrient_sensing")!;
    expect(axis.computable).toBe(true);
    expect(axis.notes.join(" ")).toMatch(/HOMA-IR/);
  });

  it("records telomere value but refuses a cross-lab percentile", () => {
    const scores = scoreAllAxes({ ...emptyInputs, analytes: { telomere_length: 1.1 } });
    const axis = scores.find((s) => s.axisKey === "telomere_attrition")!;
    expect(axis.computable).toBe(true);
    expect(axis.percentile).toBeNull();
    expect(axis.notes.join(" ")).toMatch(/lab-specific/);
  });

  it("never scores out-of-scope hallmarks", () => {
    const scores = scoreAllAxes({
      chronologicalAge: 50,
      clockValues: { horvath2013: 60 },
      analytes: { crp_hs: 3 },
    });
    const senescence = scores.find((s) => s.axisKey === "cellular_senescence")!;
    expect(senescence.computable).toBe(false);
    expect(senescence.notes.join(" ")).toMatch(/Not measurable from v1 inputs/);
  });
});
