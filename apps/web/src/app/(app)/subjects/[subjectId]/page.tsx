import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { schema, withOrg } from "@rubiksdna/db";
import { createIntervention, createSample } from "@/lib/actions";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/org";
import { EpisodeBuilder } from "./episode-builder";
import { TimepointCompare } from "./timepoint-compare";

export const dynamic = "force-dynamic";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  const org = await requireOrg();

  const data = await withOrg(db(), org.orgId, async (tx) => {
    const [subject] = await tx
      .select()
      .from(schema.subjects)
      .where(eq(schema.subjects.id, subjectId))
      .limit(1);
    if (!subject) return null;
    const samples = await tx
      .select()
      .from(schema.samples)
      .where(eq(schema.samples.subjectId, subjectId))
      .orderBy(asc(schema.samples.collectedAt));
    const interventions = await tx
      .select()
      .from(schema.interventions)
      .where(eq(schema.interventions.subjectId, subjectId))
      .orderBy(desc(schema.interventions.startedAt));
    const episodes = await tx
      .select()
      .from(schema.episodes)
      .where(eq(schema.episodes.subjectId, subjectId))
      .orderBy(desc(schema.episodes.createdAt));
    const deltas =
      episodes.length === 0
        ? []
        : await tx
            .select()
            .from(schema.deltaResults)
            .where(inArray(schema.deltaResults.episodeId, episodes.map((e) => e.id)));
    return { subject, samples, interventions, episodes, deltas };
  });

  if (!data) notFound();
  const { subject, samples, interventions, episodes, deltas } = data;
  const deltasByEpisode = new Map<string, typeof deltas>();
  for (const delta of deltas) {
    const list = deltasByEpisode.get(delta.episodeId) ?? [];
    list.push(delta);
    deltasByEpisode.set(delta.episodeId, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Subject {subject.externalRef}</h1>
        <p className="text-[13px]" style={{ color: "var(--sub)" }}>
          age {subject.chronologicalAge ?? "—"} · {subject.sex}
          {subject.modelSystem ? ` · ${subject.modelSystem}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <section className="col-span-2 space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold">Samples (timeline)</h2>
            {samples.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--sub)" }}>
                No samples yet.
              </p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Collected</th>
                    <th>Platform</th>
                    <th>Tissue</th>
                    <th>QC</th>
                    <th>State map</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((sample) => (
                    <tr key={sample.id}>
                      <td>
                        <Link href={`/samples/${sample.id}`} style={{ color: "var(--accent)" }}>
                          {sample.collectedAt.toISOString().slice(0, 10)}
                        </Link>
                      </td>
                      <td>{sample.platform}</td>
                      <td>{sample.tissue}</td>
                      <td>
                        <span className={`pill pill-${sample.qcStatus === "passed" ? "pass" : sample.qcStatus === "pending" ? "muted" : sample.qcStatus === "warned" ? "warn" : "fail"}`}>
                          {sample.qcStatus}
                        </span>
                      </td>
                      <td>
                        <Link href={`/statemap/${sample.id}`} style={{ color: "var(--accent)" }}>
                          view →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold">Interventions</h2>
            {interventions.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--sub)" }}>
                Nothing logged. The intervention log is what makes two timepoints comparable.
              </p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Agent</th>
                    <th>Window</th>
                    <th>Supervision</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {interventions.map((iv) => (
                    <tr key={iv.id}>
                      <td>{iv.category}</td>
                      <td>
                        {iv.agent}
                        {iv.dose ? ` · ${iv.dose}` : ""}
                      </td>
                      <td>
                        {iv.startedAt.toISOString().slice(0, 10)} →{" "}
                        {iv.endedAt ? iv.endedAt.toISOString().slice(0, 10) : "ongoing"}
                      </td>
                      <td>{iv.physicianSupervised ? "physician-supervised" : "—"}</td>
                      <td>{iv.evidenceSource === "org_entered" ? "clinic-entered" : "self-reported"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <EpisodeBuilder
            subjectId={subjectId}
            samples={samples.map((s) => ({
              id: s.id,
              label: `${s.collectedAt.toISOString().slice(0, 10)} · ${s.platform}`,
            }))}
            interventions={interventions.map((iv) => ({ id: iv.id, label: `${iv.category}: ${iv.agent}` }))}
            episodes={episodes.map((e) => ({ id: e.id, label: e.label ?? e.id.slice(0, 8) }))}
          />

          <TimepointCompare episodes={episodes} deltasByEpisode={deltasByEpisode} />
        </section>

        <aside className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold">New sample</h2>
            <form action={createSample} className="space-y-3">
              <input type="hidden" name="subjectId" value={subjectId} />
              <div>
                <label className="label" htmlFor="collectedAt">Collection date</label>
                <input className="input" id="collectedAt" name="collectedAt" type="date" required />
              </div>
              <div>
                <label className="label" htmlFor="platform">Platform</label>
                <select className="input" id="platform" name="platform" required>
                  <option value="methylation_epic">Methylation EPIC</option>
                  <option value="methylation_450k">Methylation 450k</option>
                  <option value="methylation_epic_v2">Methylation EPIC v2</option>
                  <option value="chem_panel">Blood chemistry panel</option>
                  <option value="telomere">Telomere assay</option>
                  <option value="olink">Olink (Phase 8)</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="tissue">Tissue</label>
                <input className="input" id="tissue" name="tissue" defaultValue="whole_blood" />
              </div>
              <div>
                <label className="label" htmlFor="sourceLab">Source lab</label>
                <input className="input" id="sourceLab" name="sourceLab" placeholder="who ran the assay" />
              </div>
              <button className="btn" type="submit">Add sample</button>
            </form>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold">Log intervention</h2>
            <form action={createIntervention} className="space-y-3">
              <input type="hidden" name="subjectId" value={subjectId} />
              <div>
                <label className="label" htmlFor="category">Category</label>
                <select className="input" id="category" name="category" required>
                  <option value="nutrition">nutrition</option>
                  <option value="exercise">exercise</option>
                  <option value="mtor_modulating">mTOR-modulating</option>
                  <option value="senolytic">senolytic</option>
                  <option value="reprogramming">reprogramming</option>
                  <option value="other">other</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="agent">Agent / protocol</label>
                <input className="input" id="agent" name="agent" required placeholder="e.g. rapamycin, CR protocol" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="dose">Dose</label>
                  <input className="input" id="dose" name="dose" placeholder="optional" />
                </div>
                <div>
                  <label className="label" htmlFor="route">Route</label>
                  <input className="input" id="route" name="route" placeholder="optional" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="startedAt">Started</label>
                  <input className="input" id="startedAt" name="startedAt" type="date" required />
                </div>
                <div>
                  <label className="label" htmlFor="endedAt">Ended</label>
                  <input className="input" id="endedAt" name="endedAt" type="date" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="evidenceSource">Evidence source</label>
                <select className="input" id="evidenceSource" name="evidenceSource">
                  <option value="org_entered">clinic/lab entered</option>
                  <option value="self_reported">self-reported</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="physicianSupervised" /> physician-supervised
              </label>
              <button className="btn" type="submit">Log intervention</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
