import { eq, inArray } from "drizzle-orm";
import { PIPELINE_VERSION, recordAudit, schema, withOrg } from "@rubiksdna/db";
import {
  assessDelta,
  computeClock,
  getClock,
  harmonizeBetas,
  imputationReference450k,
  resolveClocksForOrg,
  type Platform,
} from "@rubiksdna/clocks";
import { parseBetaMatrix, parseChemPanel, runSampleQc } from "@rubiksdna/ingest";
import { scoreAllAxes } from "@rubiksdna/axes";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { getObjectText, objectKeys, putObject } from "@/lib/storage";
import { renderReportPdf } from "@/lib/render-pdf";
import { inngest } from "./client";

const METHYLATION_PLATFORMS = new Set([
  "methylation_450k",
  "methylation_epic",
  "methylation_epic_v2",
]);

/**
 * The pipeline: parse → QC → harmonize → clocks → axes → persist.
 * Each step is durable and independently retryable; a step never re-runs
 * once it has succeeded for a given event.
 */
export const processDataFile = inngest.createFunction(
  { id: "process-data-file", retries: 3, concurrency: { limit: 8 } },
  { event: "statemap/file.uploaded" },
  async ({ event, step }) => {
    const { orgId, fileId, sampleId, kind } = event.data;
    const database = db();

    const context = await step.run("load-context", async () =>
      withOrg(database, orgId, async (tx) => {
        const [file] = await tx.select().from(schema.dataFiles).where(eq(schema.dataFiles.id, fileId));
        const [sample] = await tx.select().from(schema.samples).where(eq(schema.samples.id, sampleId));
        if (!file || !sample) throw new Error("file or sample not found");
        const [subject] = await tx
          .select()
          .from(schema.subjects)
          .where(eq(schema.subjects.id, sample.subjectId));
        const [org] = await tx.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
        return {
          objectKey: file.objectKey,
          platform: sample.platform,
          tissue: sample.tissue,
          declaredSex: subject?.sex ?? ("unspecified" as const),
          chronologicalAge:
            subject?.chronologicalAge === null || subject?.chronologicalAge === undefined
              ? null
              : Number(subject.chronologicalAge),
          orgType: org?.type ?? ("research" as const),
        };
      }),
    );

    if (kind === "chem_panel") {
      await step.run("parse-chem-panel", async () => {
        const text = await getObjectText(context.objectKey);
        const outcome = parseChemPanel(text);

        await withOrg(database, orgId, async (tx) => {
          await tx
            .update(schema.dataFiles)
            .set({
              parseStatus: outcome.ok ? "parsed" : "failed",
              parseErrors: outcome.errors.length > 0 ? outcome.errors : null,
            })
            .where(eq(schema.dataFiles.id, fileId));

          if (outcome.ok && outcome.data) {
            for (const m of outcome.data) {
              await tx
                .insert(schema.measurements)
                .values({
                  orgId,
                  sampleId,
                  analyteKey: m.analyteKey,
                  value: m.value.toString(),
                  unit: m.unit,
                  belowLoq: m.belowLoq,
                })
                .onConflictDoUpdate({
                  target: [schema.measurements.sampleId, schema.measurements.analyteKey],
                  set: { value: m.value.toString(), unit: m.unit, belowLoq: m.belowLoq },
                });
            }
            await tx
              .update(schema.samples)
              .set({ qcStatus: "passed", qcReport: { checks: [] } })
              .where(eq(schema.samples.id, sampleId));
          }
        });

        if (!outcome.ok) {
          log.warn("chem panel parse failed", { orgId, fileId, errors: outcome.errors.length });
        }
        return { ok: outcome.ok };
      });
    } else {
      // ---- Methylation beta matrix path ----
      const parsed = await step.run("parse-and-qc", async () => {
        if (!METHYLATION_PLATFORMS.has(context.platform)) {
          throw new Error(
            `File kind beta_matrix requires a methylation platform sample, got ${context.platform}`,
          );
        }
        const text = await getObjectText(context.objectKey);
        const outcome = parseBetaMatrix(text);

        if (!outcome.ok || !outcome.data) {
          await withOrg(database, orgId, (tx) =>
            tx
              .update(schema.dataFiles)
              .set({ parseStatus: "failed", parseErrors: outcome.errors })
              .where(eq(schema.dataFiles.id, fileId)),
          );
          throw new Error(`beta matrix parse failed with ${outcome.errors.length} error(s)`);
        }

        // v1: one sample per upload — take the first column.
        const columnId = outcome.data.sampleIds[0]!;
        const qc = runSampleQc(outcome.data, columnId, context.declaredSex);

        const rawBetas: Record<string, number> = {};
        for (const [probe, bySample] of outcome.data.probes) {
          const value = bySample.get(columnId);
          if (value !== undefined) rawBetas[probe] = value;
        }

        await withOrg(database, orgId, async (tx) => {
          await tx
            .update(schema.dataFiles)
            .set({ parseStatus: "parsed", parseErrors: null })
            .where(eq(schema.dataFiles.id, fileId));
          await tx
            .update(schema.samples)
            .set({
              qcStatus: qc.overall === "pass" ? "passed" : qc.overall === "warn" ? "warned" : "failed",
              qcReport: qc,
            })
            .where(eq(schema.samples.id, sampleId));
        });

        return { rawBetas, qcOverall: qc.overall };
      });

      if (parsed.qcOverall === "fail") {
        log.warn("sample failed QC; stopping pipeline", { orgId, sampleId });
        return { stopped: "qc_failed" };
      }

      const harmonized = await step.run("harmonize", async () => {
        const raw = new Map(Object.entries(parsed.rawBetas));
        const result = harmonizeBetas(context.platform as Platform, raw);
        return {
          betas: Object.fromEntries(result.betas),
          stats: {
            collapsedReplicates: result.collapsedReplicates,
            droppedOutOfRange: result.droppedOutOfRange,
            droppedNonFinite: result.droppedNonFinite,
          },
        };
      });

      /**
       * Feature matrix + clocks: delegated to the Modal Python worker when
       * configured (Parquet in R2, heavy compute off Vercel). The TypeScript
       * engine is the fallback and the semantic reference — the worker's
       * golden tests assert exact parity, so which plane ran is an
       * infrastructure detail, never a scientific one.
       */
      const eligibleClockIds = resolveClocksForOrg(context.orgType)
        .filter((clock) => clock.tissue === "multi-tissue" || context.tissue === "whole_blood")
        .map((clock) => clock.id);

      const workerResult = await step.run("worker-process", async () => {
        const env = serverEnv();
        if (!env.WORKER_URL) return null;
        const response = await fetch(env.WORKER_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-worker-secret": env.WORKER_SHARED_SECRET ?? "",
          },
          body: JSON.stringify({
            org_id: orgId,
            sample_id: sampleId,
            platform: context.platform,
            tissue: context.tissue,
            pipeline_version: PIPELINE_VERSION,
            betas: parsed.rawBetas,
            clock_ids: eligibleClockIds,
          }),
        });
        if (!response.ok) {
          throw new Error(`worker returned ${response.status}`);
        }
        return (await response.json()) as {
          feature_matrix_key: string;
          probe_count: number;
          clocks: Array<{
            clock_id: string;
            clock_version: string;
            value: number | null;
            probes_used: number;
            probes_imputed: number;
            refused_reason: string | null;
          }>;
        };
      });

      await step.run("write-feature-matrix", async () => {
        let key: string;
        let probeCount: number;
        if (workerResult) {
          key = workerResult.feature_matrix_key;
          probeCount = workerResult.probe_count;
        } else {
          // TS fallback: CSV-in-R2 keeps the pipeline shippable without Modal.
          key = objectKeys.featureMatrix(orgId, sampleId, PIPELINE_VERSION).replace(/\.parquet$/, ".csv");
          const body =
            "probe_id,beta\n" +
            Object.entries(harmonized.betas)
              .map(([probe, beta]) => `${probe},${beta}`)
              .join("\n");
          await putObject(key, body, "text/csv");
          probeCount = Object.keys(harmonized.betas).length;
        }
        await withOrg(database, orgId, (tx) =>
          tx.insert(schema.featureMatrices).values({
            orgId,
            sampleId,
            objectKey: key,
            probeCount,
            pipelineVersion: PIPELINE_VERSION,
          }),
        );
      });

      await step.run("compute-clocks", async () => {
        const betas = new Map(Object.entries(harmonized.betas));
        const reference = imputationReference450k();
        const clocks = resolveClocksForOrg(context.orgType).filter(
          (clock) => clock.tissue === "multi-tissue" || context.tissue === "whole_blood",
        );
        const workerByClock = new Map(
          (workerResult?.clocks ?? []).map((c) => [c.clock_id, c]),
        );

        await withOrg(database, orgId, async (tx) => {
          // Persist only the probes registered clocks require.
          const needed = new Set<string>();
          for (const clock of clocks) for (const p of clock.coefficients.keys()) needed.add(p);
          for (const probe of needed) {
            const beta = betas.get(probe);
            if (beta !== undefined) {
              await tx
                .insert(schema.probeFeatures)
                .values({ orgId, sampleId, probeId: probe, beta: beta.toFixed(8), imputed: false })
                .onConflictDoNothing({
                  target: [schema.probeFeatures.sampleId, schema.probeFeatures.probeId],
                });
            }
          }

          for (const clock of clocks) {
            const fromWorker = workerByClock.get(clock.id);
            const result =
              fromWorker !== undefined
                ? {
                    value: fromWorker.value,
                    probesUsed: fromWorker.probes_used,
                    probesImputed: fromWorker.probes_imputed,
                    refusedReason: fromWorker.refused_reason,
                  }
                : computeClock(clock, betas, { imputationReference: reference });
            await tx
              .insert(schema.clockResults)
              .values({
                orgId,
                sampleId,
                clockId: clock.id,
                clockVersion: clock.version,
                pipelineVersion: PIPELINE_VERSION,
                value: result.value === null ? null : result.value.toFixed(4),
                probesUsed: result.probesUsed,
                probesImputed: result.probesImputed,
                refusedReason: result.refusedReason,
              })
              .onConflictDoUpdate({
                target: [
                  schema.clockResults.sampleId,
                  schema.clockResults.clockId,
                  schema.clockResults.clockVersion,
                ],
                set: {
                  value: result.value === null ? null : result.value.toFixed(4),
                  probesUsed: result.probesUsed,
                  probesImputed: result.probesImputed,
                  refusedReason: result.refusedReason,
                  pipelineVersion: PIPELINE_VERSION,
                },
              });
          }
        });
      });
    }

    // ---- Axis scoring runs for both paths, from whatever now exists ----
    await step.run("score-axes", async () => {
      await withOrg(database, orgId, async (tx) => {
        const clockRows = await tx
          .select()
          .from(schema.clockResults)
          .where(eq(schema.clockResults.sampleId, sampleId));
        const measurementRows = await tx
          .select()
          .from(schema.measurements)
          .where(eq(schema.measurements.sampleId, sampleId));

        const clockValues: Record<string, number> = {};
        for (const row of clockRows) {
          if (row.value !== null) clockValues[row.clockId] = Number(row.value);
        }
        const analytes: Record<string, number> = {};
        for (const row of measurementRows) analytes[row.analyteKey] = Number(row.value);

        const scores = scoreAllAxes({
          chronologicalAge: context.chronologicalAge,
          clockValues,
          analytes,
        });

        for (const score of scores) {
          await tx
            .insert(schema.hallmarkScores)
            .values({
              orgId,
              sampleId,
              axisKey: score.axisKey,
              score: score.score === null ? null : score.score.toFixed(4),
              percentile: score.percentile === null ? null : score.percentile.toFixed(3),
              computable: score.computable,
              confidence: score.confidence,
              inputsUsed: score.inputsUsed,
              inputsMissing: score.inputsMissing,
              pipelineVersion: PIPELINE_VERSION,
            })
            .onConflictDoUpdate({
              target: [schema.hallmarkScores.sampleId, schema.hallmarkScores.axisKey],
              set: {
                score: score.score === null ? null : score.score.toFixed(4),
                percentile: score.percentile === null ? null : score.percentile.toFixed(3),
                computable: score.computable,
                confidence: score.confidence,
                inputsUsed: score.inputsUsed,
                inputsMissing: score.inputsMissing,
                pipelineVersion: PIPELINE_VERSION,
              },
            });
        }
      });
    });

    await step.sendEvent("emit-processed", {
      name: "statemap/sample.processed",
      data: { orgId, sampleId },
    });

    return { processed: true };
  },
);

/**
 * Longitudinal deltas for an episode, MDC-gated at computation time so the
 * exceeds_mdc flag is stored, not recomputed by display code.
 */
export const computeEpisodeDeltas = inngest.createFunction(
  { id: "compute-episode-deltas", retries: 3 },
  { event: "statemap/episode.created" },
  async ({ event, step }) => {
    const { orgId, episodeId } = event.data;
    const database = db();

    await step.run("compute-deltas", async () => {
      await withOrg(database, orgId, async (tx) => {
        const [episode] = await tx
          .select()
          .from(schema.episodes)
          .where(eq(schema.episodes.id, episodeId));
        if (!episode) throw new Error("episode not found");

        const results = await tx
          .select()
          .from(schema.clockResults)
          .where(inArray(schema.clockResults.sampleId, [episode.preSampleId, episode.postSampleId]));

        const preByClock = new Map(
          results.filter((r) => r.sampleId === episode.preSampleId && r.value !== null).map((r) => [r.clockId, r]),
        );
        const postByClock = new Map(
          results.filter((r) => r.sampleId === episode.postSampleId && r.value !== null).map((r) => [r.clockId, r]),
        );

        for (const [clockId, pre] of preByClock) {
          const post = postByClock.get(clockId);
          if (!post) continue;
          const def = getClock(clockId);
          const assessment = assessDelta(Number(pre.value), Number(post.value), def.technicalSd);
          await tx
            .insert(schema.deltaResults)
            .values({
              orgId,
              episodeId,
              metricKey: clockId,
              preValue: Number(pre.value).toFixed(4),
              postValue: Number(post.value).toFixed(4),
              delta: assessment.delta.toFixed(4),
              mdc: assessment.mdc.toFixed(4),
              exceedsMdc: assessment.exceedsMdc,
              pipelineVersion: PIPELINE_VERSION,
            })
            .onConflictDoUpdate({
              target: [schema.deltaResults.episodeId, schema.deltaResults.metricKey],
              set: {
                preValue: Number(pre.value).toFixed(4),
                postValue: Number(post.value).toFixed(4),
                delta: assessment.delta.toFixed(4),
                mdc: assessment.mdc.toFixed(4),
                exceedsMdc: assessment.exceedsMdc,
                pipelineVersion: PIPELINE_VERSION,
              },
            });
        }
      });
    });

    return { computed: true };
  },
);

/** Renders the issued report to PDF and attaches the object key. */
export const renderReport = inngest.createFunction(
  { id: "render-report-pdf", retries: 2 },
  { event: "statemap/report.issued" },
  async ({ event, step }) => {
    const { orgId, reportId } = event.data;
    const database = db();

    const needsRender = await step.run("load-report", async () =>
      withOrg(database, orgId, async (tx) => {
        const [report] = await tx.select().from(schema.reports).where(eq(schema.reports.id, reportId));
        if (!report) throw new Error("report not found");
        return report.objectKey === null;
      }),
    );
    if (!needsRender) return { skipped: "already rendered" };

    const key = await step.run("render-pdf", async () => {
      const pdf = await renderReportPdf(reportId);
      const objectKey = objectKeys.reportPdf(orgId, reportId);
      await putObject(objectKey, pdf, "application/pdf");
      return objectKey;
    });

    await step.run("attach-pdf", async () =>
      withOrg(database, orgId, (tx) =>
        tx.update(schema.reports).set({ objectKey: key }).where(eq(schema.reports.id, reportId)),
      ),
    );

    return { rendered: true };
  },
);

/** Self-service org data export: JSON archive of everything the org owns. */
export const exportOrgData = inngest.createFunction(
  { id: "export-org-data", retries: 2 },
  { event: "statemap/export.requested" },
  async ({ event, step }) => {
    const { orgId, requestedBy } = event.data;
    const database = db();

    await step.run("build-export", async () => {
      const bundle = await withOrg(database, orgId, async (tx) => ({
        exportedAt: new Date().toISOString(),
        subjects: await tx.select().from(schema.subjects),
        samples: await tx.select().from(schema.samples),
        measurements: await tx.select().from(schema.measurements),
        clockResults: await tx.select().from(schema.clockResults),
        hallmarkScores: await tx.select().from(schema.hallmarkScores),
        interventions: await tx.select().from(schema.interventions),
        episodes: await tx.select().from(schema.episodes),
        deltaResults: await tx.select().from(schema.deltaResults),
      }));

      const key = objectKeys.exportArchive(orgId, `${Date.now()}`).replace(/\.zip$/, ".json");
      await putObject(key, JSON.stringify(bundle, null, 2), "application/json");

      await withOrg(database, orgId, (tx) =>
        recordAudit(tx, {
          orgId,
          actorUserId: requestedBy,
          action: "export.complete",
          resourceType: "organization",
          resourceId: orgId,
          metadata: { objectKeyRef: key },
        }),
      );
    });

    return { exported: true };
  },
);

export const functions = [processDataFile, computeEpisodeDeltas, renderReport, exportOrgData];
