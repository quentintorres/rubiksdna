import type { schema } from "@rubiksdna/db";

type DeltaRow = typeof schema.deltaResults.$inferSelect;
type EpisodeRow = typeof schema.episodes.$inferSelect;

/**
 * Longitudinal comparison with the noise band drawn, not implied.
 *
 * The grey band is pre ± MDC (95% minimum detectable change from the clock's
 * technical variance). A post marker inside the band is presented as within
 * measurement noise — that presentation rule is enforced where the delta is
 * computed (exceeds_mdc is stored), and this component only ever renders what
 * was stored.
 */
export function TimepointCompare({
  episodes,
  deltasByEpisode,
}: {
  episodes: EpisodeRow[];
  deltasByEpisode: Map<string, DeltaRow[]>;
}) {
  const rendered = episodes.filter((e) => (deltasByEpisode.get(e.id) ?? []).length > 0);
  if (rendered.length === 0) return null;

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-sm font-bold">Timepoint comparison</h2>
      <p className="mb-4 text-[12px]" style={{ color: "var(--sub)" }}>
        Grey band = pre-value ± minimum detectable change. A change inside the band is
        indistinguishable from measurement noise and is reported that way.
      </p>
      <div className="space-y-5">
        {rendered.map((episode) => (
          <div key={episode.id}>
            <p className="mb-2 text-[13px] font-semibold">
              {episode.label ?? `Episode ${episode.id.slice(0, 8)}`}
            </p>
            <div className="space-y-3">
              {(deltasByEpisode.get(episode.id) ?? []).map((delta) => (
                <NoiseBandRow key={delta.id} delta={delta} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoiseBandRow({ delta }: { delta: DeltaRow }) {
  const pre = Number(delta.preValue);
  const post = Number(delta.postValue);
  const mdc = Number(delta.mdc);

  // Scale: noise band plus headroom so the post marker never clips.
  const lo = Math.min(pre - mdc, post) - mdc * 0.5;
  const hi = Math.max(pre + mdc, post) + mdc * 0.5;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;

  return (
    <div className="text-[12px]">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-medium">{delta.metricKey}</span>
        {delta.exceedsMdc ? (
          <strong>
            {post - pre > 0 ? "+" : ""}
            {(post - pre).toFixed(1)} y — beyond noise
          </strong>
        ) : (
          <span style={{ color: "var(--sub)" }}>
            within measurement noise (±{mdc.toFixed(1)} y)
          </span>
        )}
      </div>
      <div
        className="relative h-6 w-full rounded"
        style={{ background: "var(--bg-subtle, #f5f6f8)", border: "1px solid var(--border, #e5e7eb)" }}
      >
        {/* noise band: pre ± mdc */}
        <div
          className="absolute top-0 h-full"
          style={{
            left: `${pct(pre - mdc)}%`,
            width: `${pct(pre + mdc) - pct(pre - mdc)}%`,
            background: "rgba(120,128,140,0.18)",
          }}
          title={`noise band ${(pre - mdc).toFixed(1)}–${(pre + mdc).toFixed(1)}`}
        />
        {/* pre marker */}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ left: `${pct(pre)}%`, borderColor: "var(--ink, #1a1d23)", background: "white" }}
          title={`pre ${pre.toFixed(1)}`}
        />
        {/* post marker */}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${pct(post)}%`,
            background: delta.exceedsMdc ? "var(--accent, #2456e6)" : "var(--sub, #6b7280)",
          }}
          title={`post ${post.toFixed(1)}`}
        />
      </div>
      <div className="mt-0.5 flex justify-between" style={{ color: "var(--sub)" }}>
        <span>pre {pre.toFixed(1)} y</span>
        <span>post {post.toFixed(1)} y</span>
      </div>
    </div>
  );
}
