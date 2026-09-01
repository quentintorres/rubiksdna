"""Probe harmonization, in exact parity with packages/clocks/src/harmonize.ts.

1. EPICv2 replicate-suffixed probes ("cg00000029_TC21") collapse to their base
   CpG id, replicates averaged (the sesame strategy).
2. Probes dropped between array generations become candidates for reference
   imputation in the engine; harmonization never invents a value.
3. Betas outside [0,1] are evidence of malformed or non-beta input and are
   dropped (counted), not clamped.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Mapping

EPIC_V2_SUFFIX = re.compile(r"_[A-Z]{2}\d+$")

METHYLATION_PLATFORMS = {"methylation_450k", "methylation_epic", "methylation_epic_v2"}


@dataclass
class HarmonizationResult:
    betas: dict[str, float]
    collapsed_replicates: int
    dropped_out_of_range: int
    dropped_non_finite: int


def harmonize_betas(platform: str, raw: Mapping[str, float]) -> HarmonizationResult:
    sums: dict[str, list[float]] = {}
    collapsed = 0
    out_of_range = 0
    non_finite = 0

    for raw_probe, value in raw.items():
        if value is None or not math.isfinite(value):
            non_finite += 1
            continue
        if value < 0 or value > 1:
            out_of_range += 1
            continue

        probe = raw_probe
        if platform == "methylation_epic_v2" and EPIC_V2_SUFFIX.search(raw_probe):
            probe = EPIC_V2_SUFFIX.sub("", raw_probe)

        bucket = sums.get(probe)
        if bucket is not None:
            bucket[0] += value
            bucket[1] += 1
            collapsed += 1
        else:
            sums[probe] = [value, 1]

    betas = {probe: total / n for probe, (total, n) in sums.items()}
    return HarmonizationResult(
        betas=betas,
        collapsed_replicates=collapsed,
        dropped_out_of_range=out_of_range,
        dropped_non_finite=non_finite,
    )
