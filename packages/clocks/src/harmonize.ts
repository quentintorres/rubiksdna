import type { Platform } from "./types";

/**
 * Probe harmonization across Illumina array generations.
 *
 * The concrete problems this solves, explicitly and nowhere else:
 *
 * 1. EPICv2 renamed probes with replicate suffixes ("cg00000029_TC21").
 *    Clocks are keyed on base CpG ids, so suffixed probes are collapsed to
 *    their base id, replicates averaged (the strategy used by sesame).
 * 2. EPIC and EPICv2 dropped a subset of 450k probes that older clocks were
 *    trained on. Those become candidates for reference imputation in the
 *    engine, which records `probesImputed` and refuses above the clock's
 *    threshold. Harmonization itself never invents a value.
 * 3. Beta values outside [0,1] are evidence of a malformed or non-beta input
 *    and are dropped (counted), not clamped.
 */

export interface HarmonizationResult {
  betas: Map<string, number>;
  collapsedReplicates: number;
  droppedOutOfRange: number;
  droppedNonFinite: number;
}

const EPIC_V2_SUFFIX = /_[A-Z]{2}\d+$/;

export function harmonizeBetas(
  platform: Platform,
  raw: ReadonlyMap<string, number>,
): HarmonizationResult {
  const sums = new Map<string, { total: number; n: number }>();
  let collapsedReplicates = 0;
  let droppedOutOfRange = 0;
  let droppedNonFinite = 0;

  for (const [rawProbe, value] of raw) {
    if (!Number.isFinite(value)) {
      droppedNonFinite += 1;
      continue;
    }
    if (value < 0 || value > 1) {
      droppedOutOfRange += 1;
      continue;
    }

    let probe = rawProbe;
    if (platform === "methylation_epic_v2" && EPIC_V2_SUFFIX.test(rawProbe)) {
      probe = rawProbe.replace(EPIC_V2_SUFFIX, "");
    }

    const bucket = sums.get(probe);
    if (bucket) {
      bucket.total += value;
      bucket.n += 1;
      collapsedReplicates += 1;
    } else {
      sums.set(probe, { total: value, n: 1 });
    }
  }

  const betas = new Map<string, number>();
  for (const [probe, { total, n }] of sums) betas.set(probe, total / n);

  return { betas, collapsedReplicates, droppedOutOfRange, droppedNonFinite };
}
