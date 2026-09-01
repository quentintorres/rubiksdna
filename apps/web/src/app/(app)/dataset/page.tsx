import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { schema, withOrg } from "@rubiksdna/db";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

/**
 * The dataset view: per-episode couplings (which metrics moved together,
 * beyond noise, and what was done in between) and the org-level aggregate of
 * intervention category × metric. This table is the asset the product
 * accumulates; in v1 it is honest about being small.
 */
export default async function DatasetPage() {
  const org = await requireOrg();

  const data = await withOrg(db(), org.orgId, async (tx) => {
    const episodes = await tx
      .select({
        episode: schema.episodes,
        subjectRef: schema.subjects.externalRef,
      })
      .from(schema.episodes)
      .innerJoin(schema.subjects, eq(schema.episodes.subjectId, schema.subjects.id))
      .orderBy(desc(schema.episodes.createdAt));

    const deltas = await tx.select().from(schema.deltaResults);
    const links = await tx
      .select({
        episodeId: schema.episodeInterventions.episodeId,
        category: schema.interventions.category,
        agent: schema.interventions.agent,
      })
      .from(schema.episodeInterventions)
      .innerJoin(
        schema.interventions,
        eq(schema.episodeInterventions.interventionId, schema.interventions.id),
      );

    return { episodes, deltas, links };
  });

  const deltasByEpisode = new Map<string, typeof data.deltas>();
  for (const delta of data.deltas) {
    const list = deltasByEpisode.get(delta.episodeId) ?? [];
    list.push(delta);
    deltasByEpisode.set(delta.episodeId, list);
  }
  const linksByEpisode = new Map<string, { category: string; agent: string }[]>();
  for (const link of data.links) {
    const list = linksByEpisode.get(link.episodeId) ?? [];
    list.push({ category: link.category, agent: link.agent });
    linksByEpisode.set(link.episodeId, list);
  }

  // Aggregate: intervention category × metric → episodes, moved-beyond-noise count.
  const aggregate = new Map<string, { episodes: number; beyondNoise: number }>();
  for (const [episodeId, deltas] of deltasByEpisode) {
    const categories = [...new Set((linksByEpisode.get(episodeId) ?? []).map((l) => l.category))];
    for (const category of categories) {
      for (const delta of deltas) {
        const key = `${category} × ${delta.metricKey}`;
        const bucket = aggregate.get(key) ?? { episodes: 0, beyondNoise: 0 };
        bucket.episodes += 1;
        if (delta.exceedsMdc) bucket.beyondNoise += 1;
        aggregate.set(key, bucket);
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Intervention → delta dataset</h1>
        <p className="text-[13px]" style={{ color: "var(--sub)" }}>
          Every row is an episode: pre-sample, logged interventions, post-sample, and which
          metrics moved beyond measurement noise. Small numbers are shown as small numbers.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold">Episodes ({data.episodes.length})</h2>
        {data.episodes.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--sub)" }}>
            None yet. Build episodes from a subject's page once two timepoints exist.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Episode</th>
                <th>Subject</th>
                <th>Interventions</th>
                <th>Metric movements</th>
              </tr>
            </thead>
            <tbody>
              {data.episodes.map(({ episode, subjectRef }) => {
                const deltas = deltasByEpisode.get(episode.id) ?? [];
                const interventions = linksByEpisode.get(episode.id) ?? [];
                return (
                  <tr key={episode.id}>
                    <td>{episode.label ?? episode.id.slice(0, 8)}</td>
                    <td>
                      <Link href={`/subjects/${episode.subjectId}`} style={{ color: "var(--accent)" }}>
                        {subjectRef}
                      </Link>
                    </td>
                    <td>
                      {interventions.map((iv) => (
                        <span key={iv.agent} className="pill pill-muted mr-1">
                          {iv.category}: {iv.agent}
                        </span>
                      ))}
                    </td>
                    <td>
                      {deltas.length === 0 ? (
                        <span style={{ color: "var(--sub)" }}>pending computation</span>
                      ) : (
                        deltas.map((delta) => (
                          <div key={delta.id} className="text-[12px]">
                            {delta.metricKey}:{" "}
                            {delta.exceedsMdc ? (
                              <strong>
                                {Number(delta.delta) > 0 ? "+" : ""}
                                {Number(delta.delta).toFixed(1)} y (beyond noise)
                              </strong>
                            ) : (
                              <span style={{ color: "var(--sub)" }}>within noise (±{Number(delta.mdc).toFixed(1)} y)</span>
                            )}
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-bold">Aggregate: category × metric</h2>
        <p className="mb-3 text-[12px]" style={{ color: "var(--sub)" }}>
          Counts of episodes where the metric moved beyond its minimum detectable change. This
          is an observational tally inside your organization, not an effect estimate.
        </p>
        {aggregate.size === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--sub)" }}>
            Appears once episodes have computed deltas.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Intervention category × metric</th>
                <th>Episodes</th>
                <th>Moved beyond noise</th>
              </tr>
            </thead>
            <tbody>
              {[...aggregate.entries()].map(([key, bucket]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{bucket.episodes}</td>
                  <td>
                    {bucket.beyondNoise} of {bucket.episodes}
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
