"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { recordAudit, schema, withOrg, PIPELINE_VERSION } from "@rubiksdna/db";
import { CURRENT_DISCLAIMER_VERSION } from "@rubiksdna/claims";
import { REPORT_TEMPLATE_VERSION } from "@rubiksdna/report";
import { db } from "./db";
import { inngest } from "@/inngest/client";
import { requireOrg } from "./org";
import { buildReportPayload } from "./report-payload";
import { objectKeys, signUpload } from "./storage";
import { meterUsage } from "./billing";

/* ============================================================
   Subjects
   ============================================================ */

const subjectSchema = z.object({
  externalRef: z.string().min(1).max(120),
  chronologicalAge: z.coerce.number().min(0).max(120).nullable(),
  sex: z.enum(["female", "male", "unspecified"]),
  modelSystem: z.string().max(200).optional(),
});

export async function createSubject(formData: FormData) {
  const org = await requireOrg();
  const parsed = subjectSchema.parse({
    externalRef: formData.get("externalRef"),
    chronologicalAge: formData.get("chronologicalAge") || null,
    sex: formData.get("sex") ?? "unspecified",
    modelSystem: formData.get("modelSystem") || undefined,
  });

  await withOrg(db(), org.orgId, async (tx) => {
    await tx.insert(schema.subjects).values({
      orgId: org.orgId,
      externalRef: parsed.externalRef,
      chronologicalAge: parsed.chronologicalAge?.toString() ?? null,
      sex: parsed.sex,
      modelSystem: parsed.modelSystem ?? null,
    });
    await recordAudit(tx, {
      orgId: org.orgId,
      actorUserId: org.userId,
      action: "subject.create",
      resourceType: "subject",
    });
  });
  revalidatePath("/subjects");
}

/* ============================================================
   Samples
   ============================================================ */

const sampleSchema = z.object({
  subjectId: z.string().uuid(),
  collectedAt: z.coerce.date(),
  tissue: z.string().min(1).max(80),
  platform: z.enum([
    "methylation_450k",
    "methylation_epic",
    "methylation_epic_v2",
    "chem_panel",
    "olink",
    "telomere",
  ]),
  sourceLab: z.string().max(200).optional(),
});

export async function createSample(formData: FormData) {
  const org = await requireOrg();
  const parsed = sampleSchema.parse({
    subjectId: formData.get("subjectId"),
    collectedAt: formData.get("collectedAt"),
    tissue: formData.get("tissue") || "whole_blood",
    platform: formData.get("platform"),
    sourceLab: formData.get("sourceLab") || undefined,
  });

  await withOrg(db(), org.orgId, async (tx) => {
    await tx.insert(schema.samples).values({
      orgId: org.orgId,
      subjectId: parsed.subjectId,
      collectedAt: parsed.collectedAt,
      tissue: parsed.tissue,
      platform: parsed.platform,
      sourceLab: parsed.sourceLab ?? null,
    });
    await recordAudit(tx, {
      orgId: org.orgId,
      actorUserId: org.userId,
      action: "sample.create",
      resourceType: "sample",
      resourceId: parsed.subjectId,
    });
  });
  revalidatePath(`/subjects/${parsed.subjectId}`);
}

/* ============================================================
   Uploads: sign, register, ingest
   ============================================================ */

const uploadRequestSchema = z.object({
  sampleId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  kind: z.enum(["beta_matrix", "chem_panel"]),
});

export async function requestUpload(input: z.infer<typeof uploadRequestSchema>) {
  const org = await requireOrg();
  const parsed = uploadRequestSchema.parse(input);
  const fileId = randomUUID();
  const key = objectKeys.rawUpload(org.orgId, fileId, parsed.filename);
  const url = await signUpload(key, parsed.contentType, 500 * 1024 * 1024);
  return { fileId, key, url };
}

const uploadCompleteSchema = z.object({
  sampleId: z.string().uuid(),
  key: z.string().min(1),
  filename: z.string().min(1),
  kind: z.enum(["beta_matrix", "chem_panel"]),
  byteSize: z.number().int().positive(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

export async function completeUpload(input: z.infer<typeof uploadCompleteSchema>) {
  const org = await requireOrg();
  const parsed = uploadCompleteSchema.parse(input);

  const fileId = await withOrg(db(), org.orgId, async (tx) => {
    const [file] = await tx
      .insert(schema.dataFiles)
      .values({
        orgId: org.orgId,
        sampleId: parsed.sampleId,
        objectKey: parsed.key,
        sha256: parsed.sha256 ?? "pending",
        byteSize: parsed.byteSize,
        kind: parsed.kind,
        originalFilename: parsed.filename,
      })
      .returning();
    await recordAudit(tx, {
      orgId: org.orgId,
      actorUserId: org.userId,
      action: "file.upload",
      resourceType: "data_file",
      resourceId: file!.id,
      metadata: { kind: parsed.kind, byteSize: parsed.byteSize },
    });
    return file!.id;
  });

  await inngest.send({
    name: "statemap/file.uploaded",
    data: { orgId: org.orgId, fileId, sampleId: parsed.sampleId, kind: parsed.kind },
  });

  revalidatePath(`/samples/${parsed.sampleId}`);
  return { fileId };
}

/**
 * Small-file path used by the upload form: the file body is posted through a
 * server action, hashed, stored, registered and queued in one step.
 */
export async function uploadSmallFile(formData: FormData) {
  const org = await requireOrg();
  const file = formData.get("file") as File | null;
  const sampleId = z.string().uuid().parse(formData.get("sampleId"));
  const kind = z.enum(["beta_matrix", "chem_panel"]).parse(formData.get("kind"));
  if (!file) throw new Error("No file supplied");
  if (file.size > 4 * 1024 * 1024) {
    throw new Error("Files over 4MB must go through the signed-URL upload path.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fileId = randomUUID();
  const key = objectKeys.rawUpload(org.orgId, fileId, file.name);

  const { putObject } = await import("./storage");
  await putObject(key, bytes, file.type || "text/csv");

  await completeUpload({
    sampleId,
    key,
    filename: file.name,
    kind,
    byteSize: file.size,
    sha256,
  });
}

/* ============================================================
   Interventions and episodes
   ============================================================ */

const interventionSchema = z.object({
  subjectId: z.string().uuid(),
  category: z.enum([
    "reprogramming",
    "senolytic",
    "mtor_modulating",
    "nutrition",
    "exercise",
    "other",
  ]),
  agent: z.string().min(1).max(200),
  dose: z.string().max(120).optional(),
  route: z.string().max(120).optional(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().optional(),
  physicianSupervised: z.boolean(),
  evidenceSource: z.enum(["org_entered", "self_reported"]),
  notes: z.string().max(2000).optional(),
});

export async function createIntervention(formData: FormData) {
  const org = await requireOrg();
  const parsed = interventionSchema.parse({
    subjectId: formData.get("subjectId"),
    category: formData.get("category"),
    agent: formData.get("agent"),
    dose: formData.get("dose") || undefined,
    route: formData.get("route") || undefined,
    startedAt: formData.get("startedAt"),
    endedAt: formData.get("endedAt") || undefined,
    physicianSupervised: formData.get("physicianSupervised") === "on",
    evidenceSource: formData.get("evidenceSource") ?? "org_entered",
    notes: formData.get("notes") || undefined,
  });

  await withOrg(db(), org.orgId, async (tx) => {
    await tx.insert(schema.interventions).values({
      orgId: org.orgId,
      subjectId: parsed.subjectId,
      category: parsed.category,
      agent: parsed.agent,
      dose: parsed.dose ?? null,
      route: parsed.route ?? null,
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt ?? null,
      physicianSupervised: parsed.physicianSupervised,
      evidenceSource: parsed.evidenceSource,
      notes: parsed.notes ?? null,
    });
    await recordAudit(tx, {
      orgId: org.orgId,
      actorUserId: org.userId,
      action: "intervention.create",
      resourceType: "intervention",
      resourceId: parsed.subjectId,
      metadata: { category: parsed.category },
    });
  });
  revalidatePath(`/subjects/${parsed.subjectId}`);
}

const episodeSchema = z.object({
  subjectId: z.string().uuid(),
  preSampleId: z.string().uuid(),
  postSampleId: z.string().uuid(),
  interventionIds: z.array(z.string().uuid()).min(1),
  label: z.string().max(200).optional(),
});

export async function createEpisode(input: z.infer<typeof episodeSchema>) {
  const org = await requireOrg();
  const parsed = episodeSchema.parse(input);
  if (parsed.preSampleId === parsed.postSampleId) {
    throw new Error("Pre and post sample must differ");
  }

  const episodeId = await withOrg(db(), org.orgId, async (tx) => {
    const [pre] = await tx
      .select()
      .from(schema.samples)
      .where(and(eq(schema.samples.id, parsed.preSampleId), eq(schema.samples.subjectId, parsed.subjectId)));
    const [post] = await tx
      .select()
      .from(schema.samples)
      .where(and(eq(schema.samples.id, parsed.postSampleId), eq(schema.samples.subjectId, parsed.subjectId)));
    if (!pre || !post) throw new Error("Samples must belong to the subject");
    if (post.collectedAt <= pre.collectedAt) {
      throw new Error("Post sample must be collected after the pre sample");
    }

    const [episode] = await tx
      .insert(schema.episodes)
      .values({
        orgId: org.orgId,
        subjectId: parsed.subjectId,
        preSampleId: parsed.preSampleId,
        postSampleId: parsed.postSampleId,
        label: parsed.label ?? null,
      })
      .returning();

    await tx.insert(schema.episodeInterventions).values(
      parsed.interventionIds.map((interventionId) => ({
        episodeId: episode!.id,
        interventionId,
      })),
    );
    await recordAudit(tx, {
      orgId: org.orgId,
      actorUserId: org.userId,
      action: "episode.create",
      resourceType: "episode",
      resourceId: episode!.id,
    });
    return episode!.id;
  });

  await inngest.send({
    name: "statemap/episode.created",
    data: { orgId: org.orgId, episodeId },
  });

  revalidatePath(`/subjects/${parsed.subjectId}`);
  return { episodeId };
}

/* ============================================================
   Reports
   ============================================================ */

export async function issueReport(formData: FormData) {
  const org = await requireOrg();
  const sampleId = z.string().uuid().parse(formData.get("sampleId"));

  const reportId = await withOrg(db(), org.orgId, async (tx) => {
    const payloadBundle = await buildReportPayload(tx, org, sampleId);

    const [report] = await tx
      .insert(schema.reports)
      .values({
        orgId: org.orgId,
        subjectId: payloadBundle.subjectId,
        sampleId,
        episodeId: payloadBundle.episodeId,
        templateVersion: REPORT_TEMPLATE_VERSION,
        disclaimerVersion: CURRENT_DISCLAIMER_VERSION,
        clockVersions: payloadBundle.clockVersions,
        pipelineVersion: PIPELINE_VERSION,
        payload: payloadBundle.payload,
        generatedBy: org.userId,
      })
      .returning();

    await recordAudit(tx, {
      orgId: org.orgId,
      actorUserId: org.userId,
      action: "report.issue",
      resourceType: "report",
      resourceId: report!.id,
    });
    return report!.id;
  });

  await meterUsage(org.orgId, "report_issued");
  await inngest.send({
    name: "statemap/report.issued",
    data: { orgId: org.orgId, reportId },
  });

  revalidatePath("/reports");
  redirect(`/reports/${reportId}`);
}

/* ============================================================
   Data export (org self-service)
   ============================================================ */

export async function exportOrgData() {
  const org = await requireOrg();
  if (org.role !== "owner") throw new Error("Only owners can export organization data");

  await inngest.send({
    name: "statemap/export.requested",
    data: { orgId: org.orgId, requestedBy: org.userId },
  });

  await withOrg(db(), org.orgId, (tx) =>
    recordAudit(tx, {
      orgId: org.orgId,
      actorUserId: org.userId,
      action: "export.request",
      resourceType: "organization",
      resourceId: org.orgId,
    }),
  );
}
