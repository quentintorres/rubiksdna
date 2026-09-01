import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema, withoutTenantScopeBecause } from "@rubiksdna/db";
import { Report, type ReportPayload } from "@rubiksdna/report";
import { db } from "@/lib/db";
import { verifyPrintToken } from "@/lib/render-pdf";

export const dynamic = "force-dynamic";

/**
 * Print view for the PDF renderer. No user session: access requires a
 * short-lived HMAC token minted by the render job for exactly this report.
 * Renders the identical <Report> component the app shows.
 */
export default async function PrintReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { reportId } = await params;
  const { token } = await searchParams;

  if (!token || !verifyPrintToken(reportId, token)) notFound();

  const [report] = await withoutTenantScopeBecause(
    db(),
    "print renderer authorizes via signed per-report token, no user session",
    (d) => d.select().from(schema.reports).where(eq(schema.reports.id, reportId)).limit(1),
  );
  if (!report) notFound();

  return <Report payload={report.payload as unknown as ReportPayload} />;
}
