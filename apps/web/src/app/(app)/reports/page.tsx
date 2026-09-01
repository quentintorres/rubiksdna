import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { schema, withOrg } from "@rubiksdna/db";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const org = await requireOrg();
  const reports = await withOrg(db(), org.orgId, (tx) =>
    tx
      .select({
        report: schema.reports,
        subjectRef: schema.subjects.externalRef,
      })
      .from(schema.reports)
      .innerJoin(schema.subjects, eq(schema.reports.subjectId, schema.subjects.id))
      .orderBy(desc(schema.reports.generatedAt)),
  );

  return (
    <div className="card p-5">
      <h1 className="mb-1 text-sm font-bold">Issued reports</h1>
      <p className="mb-4 text-[12px]" style={{ color: "var(--sub)" }}>
        Reports are immutable snapshots: the payload, disclaimer version and clock versions are
        frozen at issuance. Reissue rather than edit.
      </p>
      {reports.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--sub)" }}>
          No reports issued yet. Issue one from a processed sample's page.
        </p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Issued</th>
              <th>Subject</th>
              <th>Template</th>
              <th>Disclaimer</th>
              <th>Pipeline</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(({ report, subjectRef }) => (
              <tr key={report.id}>
                <td>
                  <Link href={`/reports/${report.id}`} style={{ color: "var(--accent)" }}>
                    {report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </Link>
                </td>
                <td>{subjectRef}</td>
                <td>{report.templateVersion}</td>
                <td>{report.disclaimerVersion}</td>
                <td>{report.pipelineVersion}</td>
                <td>
                  {report.objectKey ? (
                    <span className="pill pill-pass">rendered</span>
                  ) : (
                    <span className="pill pill-muted">rendering…</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
