# Decision log

Decisions the plan flags as blocking before Phase 2, with the defaults the
build currently implements. Each default is reversible; what is not acceptable
is treating any of them as decided-by-silence, so this file is the single
place they are tracked.

## 1. Which clocks ship in v1 (licensing review)

**Default implemented:** only clocks with openly published coefficients —
Horvath 2013 multi-tissue and Hannum 2013 blood. Both sets of coefficients
were published in open-access supplements; provenance is documented in
`packages/clocks/data/PROVENANCE.md` and license metadata lives on each
registry entry (`packages/clocks/src/registry.ts`).

**What the registry enforces:** `resolveClocksForOrg` hard-filters to
`license_status === "open_published"`. A clock with unresolved terms is not
"temporarily visible" — it does not resolve at all.

**Still owed:** counsel confirmation that report-layer commercial use of
openly published coefficients carries no restriction we missed, before the
first paid report is issued. Explicitly out of v1 regardless of counsel:
GrimAge, PhenoAge derivatives with encumbered coefficient sets, and any
clock whose coefficients are only available under academic license.

## 2. Design partner type (sets default org vocabulary)

**Default implemented:** the schema supports `research` and `clinic` org
types with clock license gating by type. UI copy is written in
research/wellness vocabulary that works for both, leaning clinic
("subjects", "samples", "reports") because clinics are the paying segment.

**Recommendation:** recruit both — two or three longevity clinics plus one
research group (see `docs/design-partners.md`). The clinics teach the
vocabulary that sells; the research group stress-tests scientific honesty
and is the source of methods credibility. If forced to one: clinics.

## 3. Proteomics in v1

**Decision implemented: deferred to Phase 8.** The `olink` platform value
exists in the schema (so a sample can be recorded), but no proteomic parser,
reference distribution, or axis mapping ships in v1. Rationale: no validated
reference ranges on hand, heterogeneous vendor panels, and the two paying
workflows (methylation + chem panel) are already end-to-end. The `measurements`
long-form table is the landing zone when it arrives, so accepting Olink CSVs
later is a parser plus references, not a schema change.

## 4. Recorded implementation decisions (not in the plan's blocking list)

- **No raw IDAT ingestion in v1** — pre-normalized beta matrices only, per the
  plan; normalization ownership is a Phase 8 burden with its own validation.
- **Horvath intercept precision:** we keep the full published intercept
  (0.695507258); the golden tolerance documents the reference project's 0.696
  rounding rather than copying it (`packages/clocks/__tests__/golden.test.ts`).
- **Technical SD values are provisional** and labeled as such on each registry
  entry; replacing them with in-house replicate estimates is a design-partner
  deliverable (duplicate samples).
- **Compute plane:** the TypeScript engine is the semantic reference; the
  Modal worker must pass the same golden files (`apps/worker/tests/`) and is
  used when `WORKER_URL` is configured. Divergence is a CI failure, not a
  runtime surprise.
