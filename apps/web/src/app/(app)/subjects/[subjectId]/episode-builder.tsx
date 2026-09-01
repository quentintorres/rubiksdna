"use client";

import { useState, useTransition } from "react";
import { createEpisode } from "@/lib/actions";

interface Option {
  id: string;
  label: string;
}

/**
 * Binds a pre-sample, one or more interventions, and a post-sample into an
 * episode — the comparable unit longitudinal deltas are computed over.
 */
export function EpisodeBuilder({
  subjectId,
  samples,
  interventions,
  episodes,
}: {
  subjectId: string;
  samples: Option[];
  interventions: Option[];
  episodes: Option[];
}) {
  const [pre, setPre] = useState("");
  const [post, setPost] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = pre && post && pre !== post && selected.length > 0;

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-sm font-bold">Episodes</h2>
      <p className="mb-4 text-[12px]" style={{ color: "var(--sub)" }}>
        An episode binds pre-sample → interventions → post-sample so the change between the two
        timepoints can be attributed and queried. {episodes.length} existing.
      </p>

      {samples.length < 2 || interventions.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--sub)" }}>
          Needs at least two samples and one logged intervention.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Pre sample</label>
            <select className="input" value={pre} onChange={(e) => setPre(e.target.value)}>
              <option value="">select…</option>
              {samples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Post sample</label>
            <select className="input" value={post} onChange={(e) => setPost(e.target.value)}>
              <option value="">select…</option>
              {samples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Interventions in the window</label>
            <div className="flex flex-wrap gap-2">
              {interventions.map((iv) => {
                const active = selected.includes(iv.id);
                return (
                  <button
                    key={iv.id}
                    type="button"
                    className={`pill ${active ? "pill-pass" : "pill-muted"}`}
                    onClick={() =>
                      setSelected((prev) =>
                        active ? prev.filter((x) => x !== iv.id) : [...prev, iv.id],
                      )
                    }
                  >
                    {iv.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="col-span-2">
            <label className="label">Label</label>
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. 6-month protocol A"
            />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <button
              className="btn"
              disabled={!canSubmit || pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    await createEpisode({
                      subjectId,
                      preSampleId: pre,
                      postSampleId: post,
                      interventionIds: selected,
                      label: label || undefined,
                    });
                    setPre("");
                    setPost("");
                    setSelected([]);
                    setLabel("");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to create episode");
                  }
                })
              }
            >
              {pending ? "Creating…" : "Create episode"}
            </button>
            {error && (
              <span className="text-[12px]" style={{ color: "var(--fail)" }}>
                {error}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
