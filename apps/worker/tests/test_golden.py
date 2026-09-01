"""Golden parity: the Python engine must match the same published reference
outputs the TypeScript engine is validated against (biolearn reference values
for 10 GSE41169 whole-blood samples; provenance in packages/clocks/data).

Tolerances mirror packages/clocks/__tests__/golden.test.ts exactly, including
the documented Horvath intercept-rounding disagreement.
"""

import csv
from pathlib import Path

import pytest

from rubiks_worker.engine import clock_registry, compute_clock

REPO_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_DIR = REPO_ROOT / "packages" / "clocks" / "__tests__" / "golden"

TOLERANCES = {
    "horvath2013": 0.02,
    "hannum2013": 1e-5,
}


def load_fixture() -> dict[str, dict[str, float]]:
    with (GOLDEN_DIR / "gse41169_clock_probes.csv").open(newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        samples = header[1:]
        by_sample: dict[str, dict[str, float]] = {s: {} for s in samples}
        for row in reader:
            probe = row[0]
            for i, sample in enumerate(samples):
                cell = row[i + 1] if i + 1 < len(row) else ""
                if cell and cell.lower() != "null":
                    try:
                        by_sample[sample][probe] = float(cell)
                    except ValueError:
                        pass
    return by_sample


def load_expected(filename: str) -> dict[str, float]:
    out = {}
    with (GOLDEN_DIR / "expected" / filename).open(newline="") as fh:
        reader = csv.reader(fh)
        next(reader)
        for row in reader:
            if len(row) >= 2 and row[0]:
                out[row[0]] = float(row[1])
    return out


FIXTURE = load_fixture()
CASES = [
    (clock_id, sample, expected_value)
    for clock_id, expected_file in [
        ("horvath2013", "horvath2013.csv"),
        ("hannum2013", "hannum2013.csv"),
    ]
    for sample, expected_value in load_expected(expected_file).items()
]


def test_reference_coverage():
    for filename in ("horvath2013.csv", "hannum2013.csv"):
        expected = load_expected(filename)
        assert len(expected) == 10
        for sample in expected:
            assert sample in FIXTURE


@pytest.mark.parametrize("clock_id,sample,expected_value", CASES)
def test_golden_parity(clock_id: str, sample: str, expected_value: float):
    clock = clock_registry()[clock_id]
    result = compute_clock(
        clock,
        FIXTURE[sample],
        # Reference outputs were generated with NaN-skipping semantics;
        # mirror them exactly, as the TypeScript golden test does.
        missing_contributes_zero_for_golden_parity=True,
    )
    assert result.refused_reason is None
    assert result.value is not None
    assert abs(result.value - expected_value) < TOLERANCES[clock_id]
