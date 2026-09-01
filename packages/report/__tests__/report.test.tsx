import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { scoreAllAxes } from "@rubiksdna/axes";
import { CURRENT_DISCLAIMER_VERSION } from "@rubiksdna/claims";
import { Report } from "../src/Report";
import { REPORT_TEMPLATE_VERSION, type ReportPayload } from "../src/payload";

const basePayload = (): ReportPayload => ({
  templateVersion: REPORT_TEMPLATE_VERSION,
  disclaimerVersion: CURRENT_DISCLAIMER_VERSION,
  pipelineVersion: "2026.08.0",
  generatedAt: "2026-08-31",
  organizationName: "Alpha Clinic",
  subject: { externalRef: "A-001", chronologicalAge: 51, sex: "female" },
  sample: {
    collectedAt: "2026-08-01",
    tissue: "whole_blood",
    platform: "methylation_epic",
    sourceLab: "Example CLIA Lab",
    qcStatus: "passed",
    qcSummary: [],
  },
  clocks: [
    {
      clockId: "horvath2013",
      displayName: "Horvath multi-tissue clock (2013)",
      clockVersion: "1.0.0",
      value: 54.2,
      probesUsed: 353,
      probesImputed: 2,
      refusedReason: null,
      technicalSd: 2.4,
    },
  ],
  axes: scoreAllAxes({
    chronologicalAge: 51,
    clockValues: { horvath2013: 54.2 },
    analytes: { crp_hs: 1.1 },
  }),
  deltas: [],
});

describe("Report component", () => {
  it("renders disclaimer, version stamps and clock provenance", () => {
    const html = renderToStaticMarkup(<Report payload={basePayload()} />);
    expect(html).toContain("not a diagnosis");
    expect(html).toContain("pipeline 2026.08.0");
    expect(html).toContain("horvath2013@1.0.0");
    expect(html).toContain("54.2 years");
    expect(html).toMatch(/imputed/);
  });

  it("renders unmeasured axes as not measured, never as a number", () => {
    const html = renderToStaticMarkup(<Report payload={basePayload()} />);
    expect(html).toContain('data-axis="cellular_senescence" data-measured="false"');
    expect(html).toContain("Not measured");
    // The unmeasured card must not contain a score rendering
    const senescenceCard = html.split('data-axis="cellular_senescence"')[1]!.split("</div></div>")[0]!;
    expect(senescenceCard).not.toMatch(/\/ 100/);
  });

  it("renders a refused clock as refused, not as a value", () => {
    const payload = basePayload();
    payload.clocks[0] = {
      ...payload.clocks[0]!,
      value: null,
      refusedReason: "imputed fraction 0.080 exceeds configured maximum 0.05 for horvath2013",
    };
    const html = renderToStaticMarkup(<Report payload={payload} />);
    expect(html).toContain("not reported");
    expect(html).not.toContain("years</span>");
  });

  describe("MDC gate is structural", () => {
    const delta = (exceeds: boolean): ReportPayload => {
      const payload = basePayload();
      payload.deltas = [
        {
          metricKey: "horvath2013",
          displayName: "Horvath clock",
          preValue: 54.2,
          postValue: exceeds ? 44.2 : 52.9,
          preDate: "2026-01-05",
          postDate: "2026-08-01",
          delta: exceeds ? -10 : -1.3,
          mdc: 6.65,
          exceedsMdc: exceeds,
          unit: "years",
        },
      ];
      return payload;
    };

    it("a delta within noise is described only as within measurement noise", () => {
      const html = renderToStaticMarkup(<Report payload={delta(false)} />);
      expect(html).toContain("within measurement noise");
      expect(html).not.toContain("decreased by more than");
      expect(html).not.toContain("-1.3 years —");
    });

    it("a delta beyond noise carries direction and magnitude", () => {
      const html = renderToStaticMarkup(<Report payload={delta(true)} />);
      expect(html).toContain("decreased by more than");
      expect(html).toContain("-10.0 years");
    });

    it("always draws the noise band", () => {
      const html = renderToStaticMarkup(<Report payload={delta(false)} />);
      expect(html).toContain("Measurement noise band");
      expect(html).toContain("noise band ±6.7 years");
    });
  });
});
