import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema, withOrg } from "@rubiksdna/db";
import { ALL_AXES, type AxisKey } from "@rubiksdna/axes";
import type { SampleQcReport } from "@rubiksdna/ingest";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/org";
import { CubeFaceMap, type AxisTile } from "./cube-face";

export const dynamic = "force-dynamic";

export default async function StateMapPage({
  params,
}: {
  params: Promise<{ sampleId: string }>;
}) {
  const { sampleId } = await params;
  const org = await requireOrg();

  const data = await withOrg(db(), org.orgId, async (tx) => {
    const [sample] = await tx.select().from(schema.samples).where(eq(schema.samples.id, sampleId)).limit(1);
    if (!sample) return null;
    const [subject] = await tx
      .select()
      .from(schema.subjects)
      .where(eq(schema.subjects.id, sample.subjectId))
      .limit(1);
    const scores = await tx
      .select()
      .from(schema.hallmarkScores)
      .where(eq(schema.hallmarkScores.sampleId, sampleId));
    const clocks = await tx
      .select()
      .from(schema.clockResults)
      .where(eq(schema.clockResults.sampleId, sampleId));
    return { sample, subject, scores, clocks };
  });

  if (!data || !data.subject) notFound();
  const { sample, subject, scores, clocks } = data;
  const qc = sample.qcReport as SampleQcReport | null;

  const scoreByAxis = new Map(scores.map((s) => [s.axisKey, s]));
  const tiles: AxisTile[] = ALL_AXES.map((axisKey: AxisKey) => {
    const row = scoreByAxis.get(axisKey);
    return {
      axisKey,
      computable: row?.computable ?? false,
      score: row?.score == null ? null : Number(row.score),
      percentile: row?.percentile == null ? null : Number(row.percentile),
      confidence: row?.confidence ?? "none",
      inputsUsed: (row?.inputsUsed as string[]) ?? [],
      inputsMissing: (row?.inputsMissing as string[]) ?? [],
    };
  });

  const measured = tiles.filter((t) => t.computable).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">
          State map · {subject.externalRef} · {sample.collectedAt.toISOString().slice(0, 10)}
        </h1>
        <p className="text-[13px]" style={{ color: "var(--sub)" }}>
          {measured} of {tiles.length} axes measured from the supplied inputs ·{" "}
          <Link href={`/samples/${sample.id}`} style={{ color: "var(--accent)" }}>
            QC and provenance →
          </Link>
        </p>
      </div>

      {scores.length === 0 ? (
        <div className="card p-8 text-center text-[13px]" style={{ color: "var(--sub)" }}>
          No scores computed yet. Upload a lab file on the sample page; the pipeline runs
          automatically.
        </div>
      ) : (
        <CubeFaceMap tiles={tiles} />
      )}

      {clocks.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-bold">Clock estimates behind the epigenetic axis</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Clock</th>
                <th>Estimate</th>
                <th>Chronological age</th>
                <th>Provenance</th>
              </tr>
            </thead>
            <tbody>
              {clocks.map((row) => (
                <tr key={row.id}>
                  <td>{row.clockId}</td>
                  <td>
                    {row.value !== null ? `${Number(row.value).toFixed(1)} y` : `refused — ${row.refusedReason}`}
                  </td>
                  <td>{subject.chronologicalAge ?? "not provided"}</td>
                  <td style={{ color: "var(--sub)" }}>
                    {row.probesImputed > 0 ? `${row.probesImputed} probes imputed · ` : ""}
                    clock {row.clockVersion} · pipeline {row.pipelineVersion}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {qc && qc.checks.some((c) => c.severity !== "pass") && (
        <section
          className="card p-5"
          style={{ background: "var(--warn-wash)", borderColor: "var(--line)" }}
        >
          <h2 className="mb-2 text-sm font-bold" style={{ color: "var(--warn)" }}>
            QC caveats on this map
          </h2>
          <ul className="space-y-1 text-[13px]" style={{ color: "var(--warn)" }}>
            {qc.checks
              .filter((c) => c.severity !== "pass")
              .map((c) => (
                <li key={c.key}>· {c.detail}</li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
