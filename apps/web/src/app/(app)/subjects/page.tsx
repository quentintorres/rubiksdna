import Link from "next/link";
import { desc } from "drizzle-orm";
import { schema, withOrg } from "@rubiksdna/db";
import { createSubject } from "@/lib/actions";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  const org = await requireOrg();
  const subjects = await withOrg(db(), org.orgId, (tx) =>
    tx.select().from(schema.subjects).orderBy(desc(schema.subjects.createdAt)),
  );

  return (
    <div className="grid grid-cols-3 gap-6">
      <section className="col-span-2 card p-5">
        <h1 className="mb-4 text-sm font-bold">Subjects</h1>
        {subjects.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--sub)" }}>
            No subjects yet. Subjects are identified only by your own pseudonymous reference —
            this system stores no names or dates of birth in v1.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Your reference</th>
                <th>Age</th>
                <th>Sex</th>
                <th>Model system</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((subject) => (
                <tr key={subject.id}>
                  <td>
                    <Link href={`/subjects/${subject.id}`} style={{ color: "var(--accent)" }}>
                      {subject.externalRef}
                    </Link>
                  </td>
                  <td>{subject.chronologicalAge ?? "—"}</td>
                  <td>{subject.sex}</td>
                  <td>{subject.modelSystem ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card h-fit p-5">
        <h2 className="mb-3 text-sm font-bold">New subject</h2>
        <form action={createSubject} className="space-y-3">
          <div>
            <label className="label" htmlFor="externalRef">
              Your pseudonymous reference
            </label>
            <input className="input" id="externalRef" name="externalRef" required placeholder="e.g. P-0042" />
          </div>
          <div>
            <label className="label" htmlFor="chronologicalAge">
              Chronological age (years) — required for clock interpretation
            </label>
            <input className="input" id="chronologicalAge" name="chronologicalAge" type="number" step="0.1" min="0" max="120" />
          </div>
          <div>
            <label className="label" htmlFor="sex">
              Sex
            </label>
            <select className="input" id="sex" name="sex" defaultValue="unspecified">
              <option value="unspecified">unspecified</option>
              <option value="female">female</option>
              <option value="male">male</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="modelSystem">
              Model system (research orgs: cell line, organism)
            </label>
            <input className="input" id="modelSystem" name="modelSystem" placeholder="optional" />
          </div>
          <button className="btn" type="submit">
            Create subject
          </button>
        </form>
      </section>
    </div>
  );
}
