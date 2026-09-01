import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema, withOrg } from "@rubiksdna/db";
import type { SampleQcReport } from "@rubiksdna/ingest";
import { issueReport, uploadSmallFile } from "@/lib/actions";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function SamplePage({
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
    const files = await tx.select().from(schema.dataFiles).where(eq(schema.dataFiles.sampleId, sampleId));
    const clockResults = await tx
      .select()
      .from(schema.clockResults)
      .where(eq(schema.clockResults.sampleId, sampleId));
    const measurements = await tx
      .select()
      .from(schema.measurements)
      .where(eq(schema.measurements.sampleId, sampleId));
    return { sample, subject, files, clockResults, measurements };
  });

  if (!data || !data.subject) notFound();
  const { sample, subject, files, clockResults, measurements } = data;
  const qc = sample.qcReport as SampleQcReport | null;
  const isMethylation = sample.platform.startsWith("methylation");

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold">
            Sample · {sample.collectedAt.toISOString().slice(0, 10)}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--sub)" }}>
            subject{" "}
            <Link href={`/subjects/${subject.id}`} style={{ color: "var(--accent)" }}>
              {subject.externalRef}
            </Link>{" "}
            · {sample.platform} · {sample.tissue} · source lab: {sample.sourceLab ?? "not recorded"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn btn-secondary" href={`/statemap/${sample.id}`}>
            State map
          </Link>
          {(clockResults.length > 0 || measurements.length > 0) && (
            <form action={issueReport}>
              <input type="hidden" name="sampleId" value={sample.id} />
              <button className="btn" type="submit">
                Issue report
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <section className="col-span-2 space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold">QC and provenance</h2>
            {!qc ? (
              <p className="text-[13px]" style={{ color: "var(--sub)" }}>
                No QC yet — runs automatically after upload.
              </p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Result</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {qc.checks.map((check) => (
                    <tr key={check.key}>
                      <td className="font-medium">{check.key.replaceAll("_", " ")}</td>
                      <td>
                        <span className={`pill pill-${check.severity === "pass" ? "pass" : check.severity === "warn" ? "warn" : "fail"}`}>
                          {check.severity}
                        </span>
                      </td>
                      <td style={{ color: "var(--sub)" }}>{check.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {clockResults.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-bold">Clock results</h2>
              <table className="data">
                <thead>
                  <tr>
                    <th>Clock</th>
                    <th>Estimate</th>
                    <th>Probes used / imputed</th>
                    <th>Versions</th>
                  </tr>
                </thead>
                <tbody>
                  {clockResults.map((row) => (
                    <tr key={row.id}>
                      <td>{row.clockId}</td>
                      <td>
                        {row.value !== null ? (
                          <strong>{Number(row.value).toFixed(1)} y</strong>
                        ) : (
                          <span className="pill pill-warn">refused: {row.refusedReason}</span>
                        )}
                      </td>
                      <td>
                        {row.probesUsed} / {row.probesImputed}
                      </td>
                      <td style={{ color: "var(--sub)" }}>
                        clock {row.clockVersion} · pipeline {row.pipelineVersion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {measurements.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-bold">Panel measurements</h2>
              <table className="data">
                <thead>
                  <tr>
                    <th>Analyte</th>
                    <th>Value</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((m) => (
                    <tr key={m.id}>
                      <td>{m.analyteKey}</td>
                      <td>
                        {Number(m.value)}
                        {m.belowLoq ? " (below LOQ)" : ""}
                      </td>
                      <td>{m.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold">Upload lab file</h2>
            <form action={uploadSmallFile} className="space-y-3">
              <input type="hidden" name="sampleId" value={sample.id} />
              <div>
                <label className="label" htmlFor="kind">File kind</label>
                <select className="input" id="kind" name="kind" defaultValue={isMethylation ? "beta_matrix" : "chem_panel"}>
                  <option value="beta_matrix">Beta matrix (CSV/TSV, probes × samples)</option>
                  <option value="chem_panel">Chem panel (CSV: analyte,value,unit)</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="file">File</label>
                <input className="input" id="file" name="file" type="file" accept=".csv,.tsv,.txt" required />
              </div>
              <button className="btn" type="submit">
                Upload and process
              </button>
              <p className="text-[11px]" style={{ color: "var(--sub)" }}>
                Files over 4MB upload directly to storage via a signed URL from the API. v1
                accepts pre-normalized matrices only — no raw IDATs.
              </p>
            </form>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold">Files</h2>
            {files.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--sub)" }}>
                Nothing uploaded yet.
              </p>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {files.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{file.originalFilename}</span>
                    <span className={`pill pill-${file.parseStatus === "parsed" ? "pass" : file.parseStatus === "pending" ? "muted" : "fail"}`}>
                      {file.parseStatus}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {files.some((f) => f.parseErrors) && (
              <div className="mt-3 space-y-1 text-[12px]" style={{ color: "var(--fail)" }}>
                {files
                  .flatMap((f) => (f.parseErrors as { row: number; column: string | null; message: string }[] | null) ?? [])
                  .slice(0, 10)
                  .map((e, i) => (
                    <div key={i}>
                      row {e.row}
                      {e.column ? `, ${e.column}` : ""}: {e.message}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
