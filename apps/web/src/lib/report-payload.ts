import { desc, eq } from "drizzle-orm";
import type { Db } from "@rubiksdna/db";
import { schema } from "@rubiksdna/db";
import { PIPELINE_VERSION } from "@rubiksdna/db";
import { CURRENT_DISCLAIMER_VERSION } from "@rubiksdna/claims";
import { getClock, mdc95 } from "@rubiksdna/clocks";
import type { AxisScore } from "@rubiksdna/axes";
import {
  REPORT_TEMPLATE_VERSION,
  type ReportClockRow,
  type ReportDeltaRow,
  type ReportPayload,
} from "@rubiksdna/report";
import type { OrgContext } from "./org";

/**
 * Assembles the immutable report payload from persisted results. Reads only —
 * computation happened in the pipeline; the report is a snapshot of it.
 */
export async function buildReportPayload(
  tx: Db,
  org: OrgContext,
  sampleId: string,
): Promise<{
  payload: ReportPayload;
  subjectId: string;
  episodeId: string | null;
  clockVersions: Record<string, string>;
}> {
  const [sample] = await tx
    .select()
    .from(schema.samples)
    .where(eq(schema.samples.id, sampleId))
    .limit(1);
  if (!sample) throw new Error("Sample not found");

  const [subject] = await tx
    .select()
    .from(schema.subjects)
    .where(eq(schema.subjects.id, sample.subjectId))
    .limit(1);
  if (!subject) throw new Error("Subject not found");

  const clockRows = await tx
    .select()
    .from(schema.clockResults)
    .where(eq(schema.clockResults.sampleId, sampleId));

  const axisRows = await tx
    .select()
    .from(schema.hallmarkScores)
    .where(eq(schema.hallmarkScores.sampleId, sampleId));

  if (clockRows.length === 0 && axisRows.length === 0) {
    throw new Error("No computed results for this sample yet — run processing first.");
  }

  const clocks: ReportClockRow[] = clockRows.map((row) => {
    const def = getClock(row.clockId);
    return {
      clockId: row.clockId,
      displayName: def.displayName,
      clockVersion: row.clockVersion,
      value: row.value === null ? null : Number(row.value),
      probesUsed: row.probesUsed,
      probesImputed: row.probesImputed,
      refusedReason: row.refusedReason,
      technicalSd: def.technicalSd,
    };
  });

  const axes = axisRows.map(
    (row): AxisScore => ({
      axisKey: row.axisKey as AxisScore["axisKey"],
      computable: row.computable,
      score: row.score === null ? null : Number(row.score),
      percentile: row.percentile === null ? null : Number(row.percentile),
      confidence: row.confidence as AxisScore["confidence"],
      inputsUsed: (row.inputsUsed as string[]) ?? [],
      inputsMissing: (row.inputsMissing as string[]) ?? [],
      notes: [],
    }),
  );

  // Longitudinal: most recent episode whose post-sample is this sample.
  const [episode] = await tx
    .select()
    .from(schema.episodes)
    .where(eq(schema.episodes.postSampleId, sampleId))
    .orderBy(desc(schema.episodes.createdAt))
    .limit(1);

  const deltas: ReportDeltaRow[] = [];
  if (episode) {
    const deltaRows = await tx
      .select()
      .from(schema.deltaResults)
      .where(eq(schema.deltaResults.episodeId, episode.id));
    const [pre] = await tx
      .select()
      .from(schema.samples)
      .where(eq(schema.samples.id, episode.preSampleId))
      .limit(1);
    for (const row of deltaRows) {
      const def = getClock(row.metricKey);
      deltas.push({
        metricKey: row.metricKey,
        displayName: def.displayName,
        preValue: Number(row.preValue),
        postValue: Number(row.postValue),
        preDate: pre ? pre.collectedAt.toISOString().slice(0, 10) : "",
        postDate: sample.collectedAt.toISOString().slice(0, 10),
        delta: Number(row.delta),
        mdc: Number(row.mdc),
        exceedsMdc: row.exceedsMdc,
        unit: "years",
      });
    }
  }

  const qcReport = sample.qcReport as { checks?: { detail: string; severity: string }[] } | null;

  const payload: ReportPayload = {
    templateVersion: REPORT_TEMPLATE_VERSION,
    disclaimerVersion: CURRENT_DISCLAIMER_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    generatedAt: new Date().toISOString().slice(0, 10),
    organizationName: org.orgName,
    subject: {
      externalRef: subject.externalRef,
      chronologicalAge: subject.chronologicalAge === null ? null : Number(subject.chronologicalAge),
      sex: subject.sex,
    },
    sample: {
      collectedAt: sample.collectedAt.toISOString().slice(0, 10),
      tissue: sample.tissue,
      platform: sample.platform,
      sourceLab: sample.sourceLab,
      qcStatus: sample.qcStatus,
      qcSummary:
        qcReport?.checks?.filter((c) => c.severity !== "pass").map((c) => c.detail) ?? [],
    },
    clocks,
    axes,
    deltas,
  };

  return {
    payload,
    subjectId: subject.id,
    episodeId: episode?.id ?? null,
    clockVersions: Object.fromEntries(clockRows.map((r) => [r.clockId, r.clockVersion])),
  };
}

export { mdc95 };
