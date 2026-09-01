import { eq, sql } from "drizzle-orm";
import { schema, withOrg } from "@rubiksdna/db";
import { exportOrgData } from "@/lib/actions";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/org";
import { BillingButtons } from "./billing-buttons";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const org = await requireOrg();

  const data = await withOrg(db(), org.orgId, async (tx) => {
    const [subscription] = await tx
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.orgId, org.orgId))
      .limit(1);
    const usage = await tx
      .select({
        kind: schema.usageEvents.kind,
        total: sql<number>`sum(${schema.usageEvents.quantity})`.mapWith(Number),
      })
      .from(schema.usageEvents)
      .groupBy(schema.usageEvents.kind);
    return { subscription, usage };
  });

  return (
    <div className="grid grid-cols-2 gap-6">
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold">Organization</h2>
        <table className="data">
          <tbody>
            <tr>
              <td>Name</td>
              <td>{org.orgName}</td>
            </tr>
            <tr>
              <td>Type</td>
              <td>{org.orgType}</td>
            </tr>
            <tr>
              <td>Your role</td>
              <td>{org.role}</td>
            </tr>
            <tr>
              <td>PHI mode</td>
              <td>
                {org.phiEnabled ? (
                  <span className="pill pill-warn">enabled</span>
                ) : (
                  <span className="pill pill-muted">off — pseudonymous references only (v1)</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-[12px]" style={{ color: "var(--sub)" }}>
          PHI mode is a contractual upgrade (BAA plus the checklist in docs/phi-upgrade.md), not
          a toggle in this UI. Until then the database rejects identifiable subject fields.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold">Billing</h2>
        <table className="data">
          <tbody>
            <tr>
              <td>Plan</td>
              <td>{data.subscription?.plan ?? "pilot"}</td>
            </tr>
            <tr>
              <td>Status</td>
              <td>{data.subscription?.status ?? "trialing"}</td>
            </tr>
            <tr>
              <td>Seats</td>
              <td>{data.subscription?.seats ?? 1}</td>
            </tr>
            <tr>
              <td>Report credits</td>
              <td>{data.subscription?.reportCredits ?? "unlimited during pilot"}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-4">
          <BillingButtons />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold">Usage</h2>
        {data.usage.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--sub)" }}>
            No metered usage yet.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Event</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.usage.map((row) => (
                <tr key={row.kind}>
                  <td>{row.kind}</td>
                  <td>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold">Data export</h2>
        <p className="mb-3 text-[13px]" style={{ color: "var(--sub)" }}>
          Owners can export everything the organization owns (subjects, samples, results,
          interventions, episodes, deltas) as a JSON archive to your storage area. Your data is
          yours; leaving must be easy for trust to be real.
        </p>
        <form action={exportOrgData}>
          <button className="btn btn-secondary" type="submit" disabled={org.role !== "owner"}>
            {org.role === "owner" ? "Export organization data" : "Owner role required"}
          </button>
        </form>
      </section>
    </div>
  );
}
