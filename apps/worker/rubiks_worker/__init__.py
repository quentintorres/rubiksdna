"""RUBIKS DNA State Map — Python analysis worker (Modal).

Heavy compute for the pipeline: probe harmonization, clock computation,
and Parquet feature matrices written to R2. Scientific semantics are kept
in exact parity with the TypeScript engine in packages/clocks; the golden
tests in ../tests assert that parity against the same published reference
outputs.
"""

WORKER_VERSION = "0.1.0"
