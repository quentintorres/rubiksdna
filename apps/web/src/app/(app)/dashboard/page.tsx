import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { schema, withOrg } from "@rubiksdna/db";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const org = await requireOrg();

  const stats = await withOrg(db(), org.orgId, async (tx) => {
    const [subjects] = await tx.select({ n: count() }).from(schema.subjects);
    const [samples] = await tx.select({ n: count() }).from(schema.samples);
    const [reports] = await tx.select({ n: count() }).from(schema.reports);
    const [episodes] = await tx.select({ n: count() }).from(schema.episodes);
    const recentSamples = await tx
      .select()
      .from(schema.samples)
      .orderBy(desc(schema.samples.createdAt))
      .limit(6);
    return {
      subjects: subjects?.n ?? 0,
      samples: samples?.n ?? 0,
      reports: reports?.n ?? 0,
      episodes: episodes?.n ?? 0,
      recentSamples,
    };
  });

  const tiles = [
    { label: "Subjects", value: stats.subjects, href: "/subjects" },
    { label: "Samples", value: stats.samples, href: "/subjects" },
    { label: "Issued reports", value: stats.reports, href: "/reports" },
    { label: "Episodes", value: stats.episodes, href: "/dataset" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">{org.orgName}</h1>
        <p className="text-[13px]" style={{ color: "var(--sub)" }}>
          {org.orgType} organization · data region pinned · PHI mode{" "}
          {org.phiEnabled ? "enabled" : "off (v1 default: pseudonymous references only)"}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="card p-5 hover:shadow-sm">
            <div className="text-3xl font-extrabold">{tile.value}</div>
            <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--sub)" }}>
              {tile.label}
            </div>
          </Link>
        ))}
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Recent samples</h2>
          <Link href="/subjects" className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
            Manage subjects →
          </Link>
        </div>
        {stats.recentSamples.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--sub)" }}>
            No samples yet. Create a subject, add a sample, upload its lab file.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Sample</th>
                <th>Platform</th>
                <th>Collected</th>
                <th>QC</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentSamples.map((sample) => (
                <tr key={sample.id}>
                  <td>
                    <Link href={`/samples/${sample.id}`} style={{ color: "var(--accent)" }}>
                      {sample.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td>{sample.platform}</td>
                  <td>{sample.collectedAt.toISOString().slice(0, 10)}</td>
                  <td>
                    <span className={`pill pill-${sample.qcStatus === "passed" ? "pass" : sample.qcStatus === "pending" ? "muted" : sample.qcStatus === "warned" ? "warn" : "fail"}`}>
                      {sample.qcStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
