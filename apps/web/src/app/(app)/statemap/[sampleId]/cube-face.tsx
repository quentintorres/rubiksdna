"use client";

import { useState } from "react";
import { AXIS_LABELS, type AxisKey } from "@rubiksdna/axes";

/**
 * The cube-face state map. Each axis is a sticker on a 4×4 face (13 axes:
 * 12 hallmarks + the metabolic companion axis, plus filler tiles that stay
 * blank). Measured axes are tinted by reference position; unmeasured axes
 * render as grey hatching — a cube with missing stickers, deliberately.
 */

export interface AxisTile {
  axisKey: AxisKey;
  computable: boolean;
  score: number | null;
  percentile: number | null;
  confidence: string;
  inputsUsed: string[];
  inputsMissing: string[];
}

const tint = (score: number): string => {
  // 0 → calm blue wash, 100 → saturated amber. Not green/red on purpose:
  // this is position relative to a reference, not good/bad.
  const t = Math.max(0, Math.min(1, score / 100));
  const hue = 215 - t * 175; // 215 (blue) → 40 (amber)
  const sat = 42 + t * 30;
  const light = 88 - t * 30;
  return `hsl(${hue} ${sat}% ${light}%)`;
};

export function CubeFaceMap({ tiles }: { tiles: AxisTile[] }) {
  const [active, setActive] = useState<AxisTile | null>(null);

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <div
          className="grid grid-cols-4 gap-2 rounded-xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--paper)" }}
        >
          {tiles.map((tile) => (
            <button
              key={tile.axisKey}
              onClick={() => setActive(tile)}
              className="aspect-square rounded-lg border p-2 text-left transition-transform hover:scale-[1.03]"
              style={
                tile.computable && tile.score !== null
                  ? { background: tint(tile.score), borderColor: "rgba(0,0,0,0.08)" }
                  : tile.computable
                    ? { background: "var(--accent-soft)", borderColor: "var(--line)" }
                    : {
                        background:
                          "repeating-linear-gradient(45deg,#fafbfd,#fafbfd 6px,#eef1f6 6px,#eef1f6 12px)",
                        borderColor: "var(--line)",
                        borderStyle: "dashed",
                      }
              }
              aria-label={`${AXIS_LABELS[tile.axisKey]}: ${
                tile.computable ? `position ${tile.score ?? "recorded"}` : "not measured"
              }`}
            >
              <span
                className="block text-[10px] font-bold leading-tight"
                style={{ color: tile.computable ? "var(--ink)" : "var(--sub)" }}
              >
                {AXIS_LABELS[tile.axisKey].replace(" (companion axis)", "")}
              </span>
              <span className="mt-1 block text-[15px] font-extrabold" style={{ color: "var(--ink)" }}>
                {tile.computable ? (tile.score !== null ? tile.score.toFixed(0) : "·") : "—"}
              </span>
            </button>
          ))}
          {/* filler stickers to complete the 4×4 face without pretending they mean anything */}
          {Array.from({ length: Math.max(0, 16 - tiles.length) }).map((_, i) => (
            <div key={`filler-${i}`} className="aspect-square rounded-lg" style={{ background: "var(--wash)" }} />
          ))}
        </div>
        <p className="mt-3 text-[12px]" style={{ color: "var(--sub)" }}>
          Numbers are positions relative to a provisional reference distribution (0–100), not
          grades. Hatched stickers are axes the supplied inputs cannot measure — a face with
          missing stickers is not a solved face, and we show it that way.
        </p>
      </div>

      <div className="card p-5">
        {active ? (
          <div>
            <h3 className="text-sm font-bold">{AXIS_LABELS[active.axisKey]}</h3>
            {active.computable ? (
              <div className="mt-3 space-y-3 text-[13px]">
                {active.score !== null ? (
                  <div>
                    <div className="text-3xl font-extrabold" style={{ color: "var(--accent)" }}>
                      {active.score.toFixed(0)}
                      <span className="text-sm font-normal" style={{ color: "var(--sub)" }}>
                        {" "}
                        / 100 reference position
                      </span>
                    </div>
                    <div
                      className="mt-2 h-2 w-full rounded-full"
                      style={{
                        background: "linear-gradient(90deg, hsl(215 42% 88%), hsl(40 72% 58%))",
                        position: "relative",
                      }}
                    >
                      <div
                        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                        style={{ left: `${active.score}%`, background: "var(--ink)" }}
                      />
                    </div>
                  </div>
                ) : (
                  <p style={{ color: "var(--sub)" }}>
                    Value recorded without a reference position (no defensible cross-lab
                    reference exists for this input).
                  </p>
                )}
                <div>
                  <span className="label">Confidence</span>
                  <span className={`pill ${active.confidence === "high" ? "pill-pass" : "pill-warn"}`}>
                    {active.confidence}
                  </span>
                </div>
                <div>
                  <span className="label">Inputs used</span>
                  {active.inputsUsed.join(", ") || "—"}
                </div>
                {active.inputsMissing.length > 0 && (
                  <div>
                    <span className="label">Expected but missing</span>
                    <span style={{ color: "var(--sub)" }}>{active.inputsMissing.join(", ")}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-2 text-[13px]" style={{ color: "var(--sub)" }}>
                <p>
                  <strong>Not measured.</strong> The inputs supplied for this sample do not
                  support scoring this axis. No inference should be drawn from its absence.
                </p>
                {active.inputsMissing.length > 0 && (
                  <p>Would require: {active.inputsMissing.join(", ")}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--sub)" }}>
            Select a sticker to see exactly which inputs produced its number — or why it has
            none.
          </p>
        )}
      </div>
    </div>
  );
}
