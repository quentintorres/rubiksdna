#!/usr/bin/env python3
"""Builds the committed golden fixture for clock validation.

Input:  GSE41169_series_matrix.txt.gz from the NCBI GEO FTP
        (https://ftp.ncbi.nlm.nih.gov/geo/series/GSE41nnn/GSE41169/matrix/).
Output: __tests__/golden/gse41169_clock_probes.csv containing beta values for
        the union of registered clock probes, restricted to the samples that
        appear in the published expected outputs.

Run:    python3 scripts/build-golden-fixture.py /path/to/GSE41169_series_matrix.txt.gz
"""

import csv
import gzip
import sys
from pathlib import Path

pkg_root = Path(__file__).resolve().parent.parent


def load_probes() -> set[str]:
    probes: set[str] = set()
    for name in ("horvath2013.raw.csv", "hannum2013.raw.csv"):
        with open(pkg_root / "data" / name) as fh:
            reader = csv.reader(fh)
            next(reader)
            for row in reader:
                if row:
                    probes.add(row[0].strip())
    return probes


def load_expected_sample_ids() -> list[str]:
    ids: list[str] = []
    with open(pkg_root / "__tests__" / "golden" / "expected" / "horvath2013.csv") as fh:
        reader = csv.reader(fh)
        next(reader)
        for row in reader:
            if row:
                ids.append(row[0].strip())
    return ids


def main() -> None:
    matrix_path = Path(sys.argv[1])
    probes = load_probes()
    wanted_samples = load_expected_sample_ids()

    header: list[str] | None = None
    rows: dict[str, list[str]] = {}

    with gzip.open(matrix_path, "rt") as fh:
        in_table = False
        for line in fh:
            if line.startswith("!series_matrix_table_begin"):
                in_table = True
                continue
            if line.startswith("!series_matrix_table_end"):
                break
            if not in_table:
                continue
            parts = [p.strip().strip('"') for p in line.rstrip("\n").split("\t")]
            if header is None:
                header = parts
                continue
            if parts[0] in probes:
                rows[parts[0]] = parts[1:]

    assert header is not None, "series matrix table not found"
    sample_cols = header[1:]
    col_index = {gsm: i for i, gsm in enumerate(sample_cols)}
    missing_samples = [s for s in wanted_samples if s not in col_index]
    assert not missing_samples, f"samples missing from matrix: {missing_samples}"

    out_path = pkg_root / "__tests__" / "golden" / "gse41169_clock_probes.csv"
    with open(out_path, "w", newline="") as out:
        writer = csv.writer(out)
        writer.writerow(["probe_id", *wanted_samples])
        for probe in sorted(probes):
            values = rows.get(probe)
            if values is None:
                writer.writerow([probe, *([""] * len(wanted_samples))])
                continue
            writer.writerow([probe, *[values[col_index[s]] for s in wanted_samples]])

    n_missing = sum(1 for p in probes if p not in rows)
    print(f"wrote {out_path}")
    print(f"probes requested: {len(probes)}, absent from matrix: {n_missing}")
    empty_cells = 0
    for p, vals in rows.items():
        for s in wanted_samples:
            v = vals[col_index[s]]
            if v == "" or v.lower() in ("na", "nan", "null"):
                empty_cells += 1
    print(f"empty/NA cells among kept probes+samples: {empty_cells}")


if __name__ == "__main__":
    main()
