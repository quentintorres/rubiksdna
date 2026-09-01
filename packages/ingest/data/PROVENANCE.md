# Ingest reference data provenance

## x_probes_450k.txt

- 11,136 chrX cg probe ids from the Zhou-lab Infinium annotation
  (`HM450.hg38.manifest.tsv.gz`, https://github.com/zhou-lab/InfiniumAnnotationV1),
  downloaded 2026-08-31, filtered to `CpG_chrm == chrX` and `Probe_ID` starting
  with `cg`.
- Used by the sex-concordance QC check. Thresholds for the intermediate-beta
  fraction heuristic were calibrated on GEO series GSE41169 (95 whole-blood
  450k samples): declared males ranged 0.169–0.270, declared females
  0.679–0.748, with two declared-female samples at ~0.21 — consistent with
  metadata mislabels, i.e. the very failure mode the check is for.
