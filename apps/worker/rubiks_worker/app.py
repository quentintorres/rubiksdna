"""Modal app: the analysis worker's deployable surface.

Deploy with:
    modal deploy apps/worker/rubiks_worker/app.py

Secrets expected on Modal (create once):
    modal secret create rubiksdna-worker \
        WORKER_SHARED_SECRET=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... \
        R2_SECRET_ACCESS_KEY=... R2_BUCKET=...

The web tier calls the endpoint with header `x-worker-secret`; requests
without it are rejected before any payload is examined. Payloads contain
pseudonymous ids and probe values only — no subject identity ever reaches
this process (PHI boundary, see docs/phi-upgrade.md).
"""

from __future__ import annotations

import hmac
import os
from pathlib import Path

import modal

from . import WORKER_VERSION
from .engine import clock_registry, compute_clock, load_imputation_reference
from .feature_matrix import put_feature_matrix
from .harmonize import METHYLATION_PLATFORMS, harmonize_betas

_REPO_ROOT = Path(__file__).resolve().parents[3]

app = modal.App("rubiksdna-worker")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("numpy>=1.26", "pyarrow>=17", "boto3>=1.34", "fastapi[standard]")
    .add_local_dir(str(_REPO_ROOT / "packages" / "clocks" / "data"), remote_path="/data/clocks")
    .add_local_python_source("rubiks_worker")
)


def _authorized(headers) -> bool:
    secret = os.environ.get("WORKER_SHARED_SECRET", "")
    provided = headers.get("x-worker-secret", "")
    return bool(secret) and hmac.compare_digest(secret, provided)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("rubiksdna-worker")],
    timeout=600,
)
@modal.fastapi_endpoint(method="POST")
def process_sample(payload: dict, request: "fastapi.Request"):  # noqa: F821
    """Harmonize → Parquet feature matrix to R2 → clock computation.

    Request: {
      org_id, sample_id, platform, tissue, pipeline_version,
      betas: {probe_id: beta}, clock_ids: [..]
    }
    Response: {
      feature_matrix_key, probe_count, harmonization: {...},
      clocks: [{clock_id, clock_version, value, probes_used, probes_imputed, refused_reason}]
    }
    """
    from fastapi.responses import JSONResponse

    if not _authorized(request.headers):
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    os.environ.setdefault("DATA_DIR", "/data/clocks")

    platform = payload["platform"]
    if platform not in METHYLATION_PLATFORMS:
        return JSONResponse({"error": f"unsupported platform {platform}"}, status_code=422)

    raw = {str(k): float(v) for k, v in payload["betas"].items()}
    harmonized = harmonize_betas(platform, raw)

    key = put_feature_matrix(
        payload["org_id"], payload["sample_id"], payload["pipeline_version"], harmonized.betas
    )

    registry = clock_registry()
    reference = load_imputation_reference()
    clocks = []
    for clock_id in payload.get("clock_ids", []):
        definition = registry.get(clock_id)
        if definition is None:
            clocks.append({"clock_id": clock_id, "refused_reason": "unknown clock"})
            continue
        result = compute_clock(definition, harmonized.betas, reference)
        clocks.append(
            {
                "clock_id": result.clock_id,
                "clock_version": result.clock_version,
                "value": result.value,
                "probes_used": result.probes_used,
                "probes_imputed": result.probes_imputed,
                "refused_reason": result.refused_reason,
            }
        )

    return {
        "worker_version": WORKER_VERSION,
        "feature_matrix_key": key,
        "probe_count": len(harmonized.betas),
        "harmonization": {
            "collapsed_replicates": harmonized.collapsed_replicates,
            "dropped_out_of_range": harmonized.dropped_out_of_range,
            "dropped_non_finite": harmonized.dropped_non_finite,
        },
        "clocks": clocks,
    }
