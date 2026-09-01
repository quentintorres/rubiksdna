"""Parquet feature matrices written to R2 (S3-compatible).

Object keys mirror apps/web/src/lib/storage.ts objectKeys.featureMatrix so
the web tier and the worker address the same objects.
"""

from __future__ import annotations

import io
import os
from typing import Mapping

import pyarrow as pa
import pyarrow.parquet as pq


def feature_matrix_key(org_id: str, sample_id: str, pipeline_version: str) -> str:
    return f"orgs/{org_id}/features/{sample_id}/{pipeline_version}.parquet"


def betas_to_parquet(betas: Mapping[str, float]) -> bytes:
    """Two-column (probe_id, beta) Parquet, sorted by probe for determinism."""
    probes = sorted(betas.keys())
    table = pa.table(
        {
            "probe_id": pa.array(probes, type=pa.string()),
            "beta": pa.array([betas[p] for p in probes], type=pa.float64()),
        }
    )
    buffer = io.BytesIO()
    pq.write_table(table, buffer, compression="zstd")
    return buffer.getvalue()


def parquet_to_betas(data: bytes) -> dict[str, float]:
    table = pq.read_table(io.BytesIO(data))
    probes = table.column("probe_id").to_pylist()
    values = table.column("beta").to_pylist()
    return dict(zip(probes, values))


def r2_client():
    import boto3

    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def put_feature_matrix(org_id: str, sample_id: str, pipeline_version: str, betas: Mapping[str, float]) -> str:
    key = feature_matrix_key(org_id, sample_id, pipeline_version)
    r2_client().put_object(
        Bucket=os.environ["R2_BUCKET"],
        Key=key,
        Body=betas_to_parquet(betas),
        ContentType="application/vnd.apache.parquet",
    )
    return key
