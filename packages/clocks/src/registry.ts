import { loadCoefficients } from "./coefficients";
import { horvathAntiTransform } from "./engine";
import type { ClockDefinition, OrgType } from "./types";

/**
 * Horvath 2013 published intercept (Genome Biology 14:R115, Additional file 3).
 */
const HORVATH_INTERCEPT = 0.695507258;

let cache: Map<string, ClockDefinition> | null = null;

/**
 * Every clock this system is able to compute. A clock cannot be added without:
 *  - published coefficients in packages/clocks/data with provenance,
 *  - a passing golden-file test in __tests__/golden,
 *  - a written statement of preprocessing assumptions,
 *  - license metadata reviewed against docs/decisions.md.
 */
export function clockRegistry(): Map<string, ClockDefinition> {
  if (cache) return cache;

  const clocks: ClockDefinition[] = [
    {
      id: "horvath2013",
      version: "1.0.0",
      displayName: "Horvath multi-tissue clock (2013)",
      yearPublished: 2013,
      tissue: "multi-tissue",
      supportedPlatforms: ["methylation_450k", "methylation_epic", "methylation_epic_v2"],
      coefficients: loadCoefficients("horvath2013.raw.csv"),
      intercept: HORVATH_INTERCEPT,
      transform: horvathAntiTransform,
      maxImputedFraction: 0.05,
      technicalSd: 2.4,
      technicalSdSource:
        "Provisional, deliberately conservative estimate drawn from the replicate test-retest deviations reported for first-generation clocks in Higgins-Chen et al., Nature Aging 2, 644-661 (2022). To be replaced with an in-house replicate estimate once design-partner duplicate samples exist.",
      license: {
        status: "open_published",
        allowedOrgTypes: ["research", "clinic"],
        source:
          "Horvath S. Genome Biology 2013, 14:R115 — coefficients published in Additional file 3 (open access).",
        notes:
          "Coefficients are openly published. Commercial licensing posture around derivative uses is tracked in docs/decisions.md and must be re-confirmed by counsel before first commercial report issuance.",
      },
      preprocessingAssumptions:
        "Expects normalized beta values in [0,1] from Illumina 450k/EPIC arrays (the published model was trained on BMIQ-style normalized 450k data). v1 accepts customer-normalized matrices only and does not perform its own normalization; the source lab and platform are recorded on the sample for that reason.",
    },
    {
      id: "hannum2013",
      version: "1.0.0",
      displayName: "Hannum blood clock (2013)",
      yearPublished: 2013,
      tissue: "whole blood",
      supportedPlatforms: ["methylation_450k", "methylation_epic", "methylation_epic_v2"],
      coefficients: loadCoefficients("hannum2013.raw.csv"),
      intercept: 0,
      transform: (x) => x,
      maxImputedFraction: 0.05,
      technicalSd: 2.0,
      technicalSdSource:
        "Provisional, deliberately conservative estimate drawn from the replicate test-retest deviations reported for first-generation clocks in Higgins-Chen et al., Nature Aging 2, 644-661 (2022). To be replaced with an in-house replicate estimate once design-partner duplicate samples exist.",
      license: {
        status: "open_published",
        allowedOrgTypes: ["research", "clinic"],
        source:
          "Hannum G. et al. Molecular Cell 49, 359-367 (2013) — coefficients published in the supplement (open access).",
        notes: "Coefficients openly published; no known use restriction. Counsel confirmation tracked in docs/decisions.md.",
      },
      preprocessingAssumptions:
        "Trained on whole-blood 450k data. Expects normalized beta values in [0,1]. Applied to non-blood tissue the output is not interpretable; the pipeline restricts this clock to whole_blood samples.",
    },
  ];

  cache = new Map(clocks.map((c) => [c.id, c]));
  return cache;
}

/**
 * The only supported way to get a clock for computation. Hard-filters by the
 * organization's type against the clock's license terms. A clock with
 * unresolved terms is invisible here — disabled means disabled, not
 * "temporarily visible".
 */
export function resolveClocksForOrg(orgType: OrgType): ClockDefinition[] {
  return [...clockRegistry().values()].filter(
    (clock) =>
      clock.license.status === "open_published" &&
      clock.license.allowedOrgTypes.includes(orgType),
  );
}

export function getClock(id: string): ClockDefinition {
  const clock = clockRegistry().get(id);
  if (!clock) throw new Error(`Unknown clock: ${id}`);
  return clock;
}
