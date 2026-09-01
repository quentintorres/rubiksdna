import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema, withOrg } from "@rubiksdna/db";
import { Report, type ReportPayload } from "@rubiksdna/report";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/org";
import { signDownload } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const org = await requireOrg();

  const [report] = await withOrg(db(), org.orgId, (tx) =>
    tx.select().from(schema.reports).where(eq(schema.reports.id, reportId)).limit(1),
  );
  if (!report) notFound();

  const pdfUrl = report.objectKey ? await signDownload(report.objectKey) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px]" style={{ color: "var(--sub)" }}>
          Immutable report · issued {report.generatedAt.toISOString().slice(0, 10)} · the web
          view below and the PDF are the same component.
        </p>
        {pdfUrl && (
          <a className="btn btn-secondary" href={pdfUrl}>
            Download PDF
          </a>
        )}
      </div>
      <div className="card overflow-hidden">
        <Report payload={report.payload as unknown as ReportPayload} />
      </div>
    </div>
  );
}
