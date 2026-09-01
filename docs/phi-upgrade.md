# PHI upgrade checklist (the phi_later plan)

v1 ships de-identified / research-only. Every boundary below already exists in
code so the upgrade to handling PHI is **configuration plus paperwork**, not a
migration. Nothing on this list may be marked done by assertion — each item
names the artifact that proves it.

## What is already true in v1 (verify, don't rebuild)

- [x] **Subject identity confined to one table.** `subjects` stores only
  `external_ref` (customer's own pseudonymous code), `chronological_age`, `sex`.
  No name, DOB, or contact fields exist anywhere in the schema.
  Proof: `packages/db/src/schema.ts`, enforced by the PHI-gate trigger in
  `packages/db/sql/rls.sql` (writing `display_name` with `phi_enabled=false` raises).
- [x] **`organizations.phi_enabled` flag** exists and defaults false; it gates
  identity fields, export behavior, and retention decisions.
- [x] **Row-level security** keyed on `app.org_id`, with a cross-tenant
  isolation test that runs in CI (`packages/db/__tests__/tenant-isolation.test.ts`).
- [x] **Audit log** (`audit_events`) written from day one: actor, action,
  resource, timestamp. Proof: `packages/db/src/audit.ts` and call sites in
  server actions and Inngest functions.
- [x] **Log scrubbing.** `apps/web/src/lib/log.ts` drops forbidden keys
  (subject refs, betas, analyte values) before anything reaches a log sink;
  `packages/db/src/audit.ts` refuses forbidden metadata keys outright.
- [x] **Region pinning hook.** `DATA_REGION` is part of the environment
  contract (`apps/web/src/lib/env.ts`); R2 bucket and Neon region must be
  created in that region.
- [x] **Worker payload minimization.** The Modal worker receives pseudonymous
  ids and probe values only — never subject fields (`apps/worker/rubiks_worker/app.py`).

## Vendor BAA matrix (chosen BAA-eligible from the start)

| Vendor | Role | BAA availability | Plan required |
|---|---|---|---|
| Neon | Postgres | Yes | Business/Enterprise |
| Cloudflare R2 | Object storage | Yes (Enterprise HIPAA addendum) | Enterprise |
| Vercel | App hosting | Yes | Enterprise |
| Clerk | Auth | Yes | Enterprise add-on |
| Modal | Python compute | Yes | Team/Enterprise |
| Inngest | Job queue (metadata only — payloads carry ids, not measurements where avoidable) | Yes | Enterprise |
| Stripe | Billing (never sees health data) | N/A — keep it that way | — |
| Sentry/Axiom | Telemetry (scrubbed) | Yes | Business+ |

Rule: **no new vendor may be added to the data path unless it offers a BAA**,
even while we operate de-identified. That is what makes this document an
upgrade checklist instead of a migration plan.

## The upgrade itself (execute in order)

1. [ ] Counsel review: confirm intended use still fits wellness/research
   framing, or engage a regulatory consultant on CLIA/medical-device
   boundaries before any identity field is enabled.
2. [ ] Sign BAAs with every vendor in the matrix above; store executed copies.
3. [ ] Upgrade plans where the BAA requires it (Neon, Vercel, Clerk, R2).
4. [ ] Write and publish: retention policy, breach notification process
   (72-hour internal clock), access review cadence (quarterly).
5. [ ] Penetration test by an external firm; remediate criticals before flip.
6. [ ] Flip `organizations.phi_enabled` per contracted org only — it is a
   per-tenant setting, not a global one.
7. [ ] Enable the identity fields UI (subjects gain `display_name` etc.) —
   the PHI-gate trigger stops this from happening accidentally before step 6.
8. [ ] Update export behavior: PHI orgs' exports require re-authentication
   and are audit-logged with actor + reason.
9. [ ] Workforce items: security training records, access provisioning /
   deprovisioning checklist, signed confidentiality agreements.

## Standing rules (apply now, not later)

- Subject identity never appears in: logs, Inngest event payloads, Stripe
  metadata, R2 object keys, error messages, or analytics.
- Every result row carries `pipeline_version` and `clock_version` — the audit
  trail for *how* a number was produced is part of the compliance posture.
- Data deletion requests: delete the subject row; every dependent row cascades
  by foreign key. Verify with the deletion test before claiming compliance.
