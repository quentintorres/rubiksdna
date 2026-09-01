"""Clock computation, in exact parity with packages/clocks/src/engine.ts.

Any change to semantics here must land in the TypeScript engine in the same
commit, and vice versa. The golden tests compare both implementations against
the same published reference outputs.
"""

from __future__ import annotations

import csv
import math
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Mapping

# packages/clocks/data in the monorepo checkout; overridden with DATA_DIR when
# the worker runs on Modal with the data files mounted elsewhere.
_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "packages" / "clocks" / "data"

# Horvath 2013 published intercept (Genome Biology 14:R115, Additional file 3).
# Full precision, deliberately NOT the reference project's 0.696 rounding;
# see the tolerance note in the golden tests.
HORVATH_INTERCEPT = 0.695507258


def data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", str(_DEFAULT_DATA_DIR)))


def load_coefficients(filename: str) -> dict[str, float]:
    """Loads a published coefficient CSV (columns: CpGmarker,CoefficientTraining)."""
    path = data_dir() / filename
    out: dict[str, float] = {}
    with path.open(newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        if not header or header[0] != "CpGmarker":
            raise ValueError(f"Unexpected coefficient file header in {filename}: {header}")
        for row in reader:
            if len(row) < 2 or not row[0]:
                continue
            out[row[0].strip()] = float(row[1])
    return out


def load_imputation_reference() -> dict[str, float]:
    """Sesame 450k reference medians, filtered to registered clock probes."""
    path = data_dir() / "imputation_reference_450k.csv"
    out: dict[str, float] = {}
    with path.open(newline="") as fh:
        reader = csv.reader(fh)
        next(reader)  # Probe_ID,median
        for row in reader:
            if len(row) < 2 or not row[0]:
                continue
            out[row[0].strip()] = float(row[1])
    return out


def horvath_anti_transform(x: float, adult_age: float = 20.0) -> float:
    """Horvath 2013 age transform (adult_age = 20), exactly as published."""
    if x < 0:
        return (1 + adult_age) * math.exp(x) - 1
    return (1 + adult_age) * x + adult_age


@dataclass(frozen=True)
class ClockDefinition:
    id: str
    version: str
    tissue: str
    coefficients: Mapping[str, float]
    intercept: float
    transform: Callable[[float], float]
    max_imputed_fraction: float
    technical_sd: float


@dataclass
class ClockComputation:
    clock_id: str
    clock_version: str
    value: float | None
    probes_used: int
    probes_imputed: int
    refused_reason: str | None = None
    unrecoverable: list[str] = field(default_factory=list)


_registry_cache: dict[str, ClockDefinition] | None = None


def clock_registry() -> dict[str, ClockDefinition]:
    """The two v1 clocks with openly published coefficients.

    License gating happens in the web tier (packages/clocks registry); the
    worker only ever receives compute requests for clocks that passed it.
    """
    global _registry_cache
    if _registry_cache is None:
        _registry_cache = {
            "horvath2013": ClockDefinition(
                id="horvath2013",
                version="1.0.0",
                tissue="multi-tissue",
                coefficients=load_coefficients("horvath2013.raw.csv"),
                intercept=HORVATH_INTERCEPT,
                transform=horvath_anti_transform,
                max_imputed_fraction=0.05,
                technical_sd=2.4,
            ),
            "hannum2013": ClockDefinition(
                id="hannum2013",
                version="1.0.0",
                tissue="whole blood",
                coefficients=load_coefficients("hannum2013.raw.csv"),
                intercept=0.0,
                transform=lambda x: x,
                max_imputed_fraction=0.05,
                technical_sd=2.0,
            ),
        }
    return _registry_cache


def compute_clock(
    definition: ClockDefinition,
    betas: Mapping[str, float],
    imputation_reference: Mapping[str, float] | None = None,
    *,
    missing_contributes_zero_for_golden_parity: bool = False,
) -> ClockComputation:
    """transform(intercept + sum(coef * beta)) with the one explicit imputation strategy.

    A probe missing from the sample is taken from the imputation reference and
    counted in probes_imputed. If the imputed fraction exceeds the clock's
    configured maximum, or a probe is missing from both sample and reference,
    the computation is refused rather than silently degraded.
    """
    total = definition.intercept
    probes_used = 0
    probes_imputed = 0
    unrecoverable: list[str] = []

    for probe, coefficient in definition.coefficients.items():
        sample_value = betas.get(probe)
        if sample_value is not None and math.isfinite(sample_value):
            total += coefficient * sample_value
            probes_used += 1
            continue

        if missing_contributes_zero_for_golden_parity:
            probes_used += 1
            continue

        reference_value = (imputation_reference or {}).get(probe)
        if reference_value is not None and math.isfinite(reference_value):
            total += coefficient * reference_value
            probes_used += 1
            probes_imputed += 1
            continue

        unrecoverable.append(probe)

    base = dict(
        clock_id=definition.id,
        clock_version=definition.version,
        probes_used=probes_used,
        probes_imputed=probes_imputed,
    )

    if unrecoverable:
        return ClockComputation(
            **base,
            value=None,
            refused_reason=(
                f"{len(unrecoverable)} required probe(s) missing from sample and "
                f"imputation reference (first: {unrecoverable[0]})"
            ),
            unrecoverable=unrecoverable,
        )

    imputed_fraction = probes_imputed / len(definition.coefficients)
    if imputed_fraction > definition.max_imputed_fraction:
        return ClockComputation(
            **base,
            value=None,
            refused_reason=(
                f"imputed fraction {imputed_fraction:.3f} exceeds configured maximum "
                f"{definition.max_imputed_fraction} for {definition.id}"
            ),
        )

    return ClockComputation(**base, value=definition.transform(total))
