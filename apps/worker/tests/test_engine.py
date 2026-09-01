import math

import pytest

from rubiks_worker.engine import (
    ClockDefinition,
    compute_clock,
    horvath_anti_transform,
    load_imputation_reference,
)
from rubiks_worker.feature_matrix import betas_to_parquet, feature_matrix_key, parquet_to_betas
from rubiks_worker.harmonize import harmonize_betas


def make_clock(coefficients: dict[str, float], max_imputed_fraction: float = 0.05) -> ClockDefinition:
    return ClockDefinition(
        id="test",
        version="1.0.0",
        tissue="multi-tissue",
        coefficients=coefficients,
        intercept=1.0,
        transform=lambda x: x,
        max_imputed_fraction=max_imputed_fraction,
        technical_sd=1.0,
    )


class TestComputeClock:
    def test_linear_combination(self):
        clock = make_clock({"cg1": 2.0, "cg2": -1.0})
        result = compute_clock(clock, {"cg1": 0.5, "cg2": 0.25})
        assert result.value == pytest.approx(1.0 + 1.0 - 0.25)
        assert result.probes_used == 2
        assert result.probes_imputed == 0

    def test_imputes_from_reference(self):
        clock = make_clock({"cg1": 2.0, "cg2": -1.0}, max_imputed_fraction=0.5)
        result = compute_clock(clock, {"cg1": 0.5}, {"cg2": 0.4})
        assert result.value == pytest.approx(1.0 + 1.0 - 0.4)
        assert result.probes_imputed == 1

    def test_refuses_when_imputation_exceeds_threshold(self):
        clock = make_clock({"cg1": 2.0, "cg2": -1.0}, max_imputed_fraction=0.4)
        result = compute_clock(clock, {"cg1": 0.5}, {"cg2": 0.4})
        assert result.value is None
        assert "exceeds configured maximum" in result.refused_reason

    def test_refuses_on_unrecoverable_probe(self):
        clock = make_clock({"cg1": 2.0, "cg2": -1.0})
        result = compute_clock(clock, {"cg1": 0.5}, {})
        assert result.value is None
        assert "missing from sample and imputation reference" in result.refused_reason

    def test_non_finite_sample_value_falls_back_to_reference(self):
        clock = make_clock({"cg1": 2.0}, max_imputed_fraction=1.0)
        result = compute_clock(clock, {"cg1": math.nan}, {"cg1": 0.3})
        assert result.value == pytest.approx(1.0 + 0.6)
        assert result.probes_imputed == 1


class TestHorvathTransform:
    def test_adult_branch_is_linear(self):
        assert horvath_anti_transform(0.0) == 20.0
        assert horvath_anti_transform(1.0) == 41.0

    def test_juvenile_branch_is_exponential(self):
        assert horvath_anti_transform(-1.0) == pytest.approx(21 * math.exp(-1) - 1)


class TestHarmonize:
    def test_collapses_epicv2_replicates(self):
        result = harmonize_betas(
            "methylation_epic_v2",
            {"cg00000029_TC21": 0.4, "cg00000029_BC21": 0.6, "cg00000108": 0.5},
        )
        assert result.betas["cg00000029"] == pytest.approx(0.5)
        assert result.collapsed_replicates == 1

    def test_does_not_strip_suffix_on_450k(self):
        result = harmonize_betas("methylation_450k", {"cg00000029_TC21": 0.4})
        assert "cg00000029_TC21" in result.betas

    def test_drops_out_of_range_and_non_finite(self):
        result = harmonize_betas(
            "methylation_450k",
            {"cg1": 1.5, "cg2": -0.1, "cg3": math.nan, "cg4": 0.5},
        )
        assert list(result.betas) == ["cg4"]
        assert result.dropped_out_of_range == 2
        assert result.dropped_non_finite == 1


class TestFeatureMatrix:
    def test_parquet_round_trip(self):
        betas = {"cg2": 0.25, "cg1": 0.5, "cg3": 0.999999}
        restored = parquet_to_betas(betas_to_parquet(betas))
        assert restored == pytest.approx(betas)

    def test_key_matches_web_tier_convention(self):
        # Must stay identical to apps/web/src/lib/storage.ts objectKeys.featureMatrix.
        assert (
            feature_matrix_key("org1", "sample1", "2026.01")
            == "orgs/org1/features/sample1/2026.01.parquet"
        )


def test_imputation_reference_loads():
    reference = load_imputation_reference()
    assert len(reference) > 300
    assert all(0.0 <= v <= 1.0 for v in reference.values())
