import { describe, expect, it } from "vitest";
import { parseBetaMatrix } from "../src/beta-matrix";
import { parseChemPanel } from "../src/chem-panel";
import {
  betaDistributionCheck,
  missingnessCheck,
  sexConcordanceCheck,
  xProbes450k,
} from "../src/qc";

describe("parseBetaMatrix", () => {
  it("parses a valid matrix and records NA cells", () => {
    const csv = [
      "probe_id,S1,S2",
      "cg00000029,0.4,0.6",
      "cg00000108,NA,0.9",
      "cg00000155,0.878,",
    ].join("\n");
    const result = parseBetaMatrix(csv);
    expect(result.ok).toBe(true);
    expect(result.data!.sampleIds).toEqual(["S1", "S2"]);
    expect(result.data!.probes.get("cg00000029")!.get("S2")).toBe(0.6);
    expect(result.data!.naCells).toBe(2);
  });

  it("reports out-of-range values with row and column", () => {
    const csv = ["probe_id,S1", "cg00000029,1.4"].join("\n");
    const result = parseBetaMatrix(csv);
    expect(result.ok).toBe(false);
    const error = result.errors[0]!;
    expect(error.code).toBe("out_of_range");
    expect(error.row).toBe(2);
    expect(error.column).toBe("S1");
    expect(error.message).toMatch(/M-value/);
  });

  it("rejects duplicate probes and samples", () => {
    const csv = ["probe_id,S1,S1", "cg00000029,0.4,0.5", "cg00000029,0.4,0.5"].join("\n");
    const result = parseBetaMatrix(csv);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("duplicate_key");
  });

  it("accepts tab-delimited input", () => {
    const tsv = "probe_id\tS1\ncg00000029\t0.5";
    expect(parseBetaMatrix(tsv).ok).toBe(true);
  });
});

describe("parseChemPanel", () => {
  it("parses recognized analytes through aliases", () => {
    const csv = ["analyte,value,unit", "hs-CRP,1.2,mg/L", "A1C,5.4,%"].join("\n");
    const result = parseChemPanel(csv);
    expect(result.ok).toBe(true);
    expect(result.data!.map((m) => m.analyteKey).sort()).toEqual(["crp_hs", "hba1c"]);
  });

  it("rejects unit mismatches instead of converting", () => {
    const csv = ["analyte,value,unit", "glucose,5.2,mmol/L"].join("\n");
    const result = parseChemPanel(csv);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.code).toBe("unit_mismatch");
  });

  it("flags implausible values as probable unit mix-ups", () => {
    const csv = ["analyte,value,unit", "hba1c,54,%"].join("\n");
    const result = parseChemPanel(csv);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.code).toBe("implausible_value");
  });

  it("names unknown analytes per row", () => {
    const csv = ["analyte,value,unit", "midichlorians,9000,count"].join("\n");
    const result = parseChemPanel(csv);
    expect(result.errors[0]!.code).toBe("unknown_analyte");
    expect(result.errors[0]!.row).toBe(2);
  });

  it("parses below_loq flags", () => {
    const csv = ["analyte,value,unit,below_loq", "il-6,0.1,pg/mL,true"].join("\n");
    const result = parseChemPanel(csv);
    expect(result.ok).toBe(true);
    expect(result.data![0]!.belowLoq).toBe(true);
  });
});

describe("QC checks", () => {
  it("loads the committed chrX probe list", () => {
    expect(xProbes450k().size).toBe(11136);
  });

  it("flags a declared/inferred sex mismatch", () => {
    const xList = [...xProbes450k()].slice(0, 400);
    // Male-like: bimodal chrX values
    const betas = new Map(xList.map((p, i) => [p, i % 2 === 0 ? 0.05 : 0.95]));
    const check = sexConcordanceCheck(betas, "female");
    expect(check.severity).toBe("warn");
    expect(check.detail).toMatch(/sample swap|metadata error/);
    expect(check.metrics.inferred_sex).toBe("male");
  });

  it("passes a concordant female-like sample", () => {
    const xList = [...xProbes450k()].slice(0, 400);
    const betas = new Map(xList.map((p) => [p, 0.5]));
    expect(sexConcordanceCheck(betas, "female").severity).toBe("pass");
  });

  it("declines to infer sex from too few chrX probes", () => {
    const betas = new Map([["cg00000029", 0.5]]);
    const check = sexConcordanceCheck(betas, "male");
    expect(check.severity).toBe("warn");
    expect(check.detail).toMatch(/Not performed/);
  });

  it("fails a non-beta-looking distribution", () => {
    const betas = new Map(Array.from({ length: 1000 }, (_, i) => [`cg${i}`, 0.02]));
    expect(betaDistributionCheck(betas).severity).toBe("fail");
  });

  it("grades missingness", () => {
    expect(missingnessCheck(99, 100).severity).toBe("pass");
    expect(missingnessCheck(90, 100).severity).toBe("warn");
    expect(missingnessCheck(70, 100).severity).toBe("fail");
  });
});
