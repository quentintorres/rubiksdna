import { AXIS_LABELS } from "@rubiksdna/axes";
import type { AxisScore } from "@rubiksdna/axes";
import { getDisclaimer, PHRASES } from "@rubiksdna/claims";
import type { ReportDeltaRow, ReportPayload } from "./payload";

/**
 * The one report component. The web app renders it live; the PDF renderer
 * prints the same tree via Playwright, so web and PDF cannot drift.
 *
 * Claim boundaries are structural here: the delta row is physically unable
 * to describe a direction when the change is within measurement noise, and
 * unmeasured axes have no numeric rendering path.
 */

const palette = {
  ink: "#16181d",
  sub: "#5a6472",
  line: "#e3e7ee",
  paper: "#ffffff",
  wash: "#f6f8fb",
  accent: "#2757d6",
  warn: "#8a6d1a",
  warnWash: "#fdf6e3",
  muted: "#9aa4b2",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: palette.sub,
  margin: "32px 0 12px",
};

const noteStyle: React.CSSProperties = {
  fontSize: 12,
  color: palette.sub,
  lineHeight: 1.55,
};

export function NoiseBand({ delta, mdc }: { delta: number; mdc: number }) {
  // Symmetric band [-mdc, +mdc] with the observed delta plotted on it.
  const range = Math.max(Math.abs(delta), mdc) * 1.3;
  const pct = (x: number) => 50 + (x / range) * 50;
  return (
    <svg width="220" height="26" role="img" aria-label="Measurement noise band">
      <rect
        x={`${pct(-mdc)}%`}
        y="8"
        width={`${pct(mdc) - pct(-mdc)}%`}
        height="10"
        fill={palette.wash}
        stroke={palette.line}
      />
      <line x1="50%" x2="50%" y1="4" y2="22" stroke={palette.muted} strokeWidth="1" />
      <circle cx={`${pct(delta)}%`} cy="13" r="4.5" fill={palette.accent} />
    </svg>
  );
}

export function DeltaRow({ row }: { row: ReportDeltaRow }) {
  const description = !row.exceedsMdc
    ? PHRASES.delta.belowNoise
    : row.delta > 0
      ? PHRASES.delta.increased
      : PHRASES.delta.decreased;

  return (
    <tr>
      <td style={cell}>{row.displayName}</td>
      <td style={cell}>
        {row.preValue.toFixed(1)} → {row.postValue.toFixed(1)} {row.unit}
        <div style={{ ...noteStyle, fontSize: 11 }}>
          {row.preDate} → {row.postDate}
        </div>
      </td>
      <td style={cell}>
        <NoiseBand delta={row.delta} mdc={row.mdc} />
        <div style={{ ...noteStyle, fontSize: 11 }}>
          noise band ±{row.mdc.toFixed(1)} {row.unit}
        </div>
      </td>
      <td style={{ ...cell, fontWeight: row.exceedsMdc ? 600 : 400 }}>
        {!row.exceedsMdc ? (
          <span style={{ color: palette.warn }}>{description}</span>
        ) : (
          <span>
            {row.delta > 0 ? "+" : ""}
            {row.delta.toFixed(1)} {row.unit} — {description}
          </span>
        )}
      </td>
    </tr>
  );
}

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: `1px solid ${palette.line}`,
  fontSize: 13,
  verticalAlign: "top",
  textAlign: "left",
};

const th: React.CSSProperties = {
  ...cell,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: palette.sub,
};

function AxisCard({ axis }: { axis: AxisScore }) {
  const label = AXIS_LABELS[axis.axisKey];
  if (!axis.computable) {
    return (
      <div
        data-axis={axis.axisKey}
        data-measured="false"
        style={{
          border: `1px dashed ${palette.line}`,
          borderRadius: 8,
          padding: "12px 14px",
          background: "repeating-linear-gradient(45deg, #fafbfd, #fafbfd 6px, #f3f5f9 6px, #f3f5f9 12px)",
          color: palette.muted,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Not measured</div>
      </div>
    );
  }

  return (
    <div
      data-axis={axis.axisKey}
      data-measured="true"
      style={{
        border: `1px solid ${palette.line}`,
        borderRadius: 8,
        padding: "12px 14px",
        background: palette.paper,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: palette.ink }}>{label}</div>
      {axis.score !== null ? (
        <div style={{ fontSize: 22, fontWeight: 700, color: palette.accent, marginTop: 4 }}>
          {axis.score.toFixed(0)}
          <span style={{ fontSize: 12, color: palette.sub, fontWeight: 400 }}> / 100 (reference position)</span>
        </div>
      ) : (
        <div style={{ ...noteStyle, marginTop: 4 }}>Recorded without a reference position.</div>
      )}
      <div style={{ ...noteStyle, marginTop: 6 }}>{PHRASES.confidence[axis.confidence]}</div>
      <div style={{ ...noteStyle, fontSize: 11, marginTop: 4 }}>
        inputs: {axis.inputsUsed.join(", ") || "—"}
        {axis.inputsMissing.length > 0 && <> · missing: {axis.inputsMissing.join(", ")}</>}
      </div>
      {axis.notes.map((n) => (
        <div key={n} style={{ ...noteStyle, fontSize: 11, marginTop: 4 }}>
          {n}
        </div>
      ))}
    </div>
  );
}

export function Report({ payload }: { payload: ReportPayload }) {
  const disclaimer = getDisclaimer(payload.disclaimerVersion);

  return (
    <div
      style={{
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        color: palette.ink,
        background: palette.paper,
        maxWidth: 820,
        margin: "0 auto",
        padding: "40px 32px",
      }}
    >
      <header style={{ borderBottom: `2px solid ${palette.ink}`, paddingBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.02em" }}>
            RUBIKS DNA · State Map
          </div>
          <div style={{ ...noteStyle }}>
            template {payload.templateVersion} · pipeline {payload.pipelineVersion}
          </div>
        </div>
        <div style={{ ...noteStyle, marginTop: 10 }}>{disclaimer.header}</div>
      </header>

      <section>
        <h2 style={sectionTitle}>Subject and sample</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            <tr>
              <td style={cell}>Subject reference</td>
              <td style={cell}>{payload.subject.externalRef}</td>
              <td style={cell}>Organization</td>
              <td style={cell}>{payload.organizationName}</td>
            </tr>
            <tr>
              <td style={cell}>Chronological age</td>
              <td style={cell}>
                {payload.subject.chronologicalAge !== null
                  ? `${payload.subject.chronologicalAge} years`
                  : "not provided"}
              </td>
              <td style={cell}>Sex</td>
              <td style={cell}>{payload.subject.sex}</td>
            </tr>
            <tr>
              <td style={cell}>Collected</td>
              <td style={cell}>{payload.sample.collectedAt}</td>
              <td style={cell}>Platform / tissue</td>
              <td style={cell}>
                {payload.sample.platform} · {payload.sample.tissue}
              </td>
            </tr>
            <tr>
              <td style={cell}>Source lab</td>
              <td style={cell}>{payload.sample.sourceLab ?? "not recorded"}</td>
              <td style={cell}>QC</td>
              <td style={cell}>{payload.sample.qcStatus}</td>
            </tr>
          </tbody>
        </table>
        {payload.sample.qcSummary.length > 0 && (
          <div style={{ ...noteStyle, marginTop: 8 }}>
            {payload.sample.qcSummary.map((s) => (
              <div key={s}>· {s}</div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={sectionTitle}>Epigenetic clock estimates</h2>
        <div style={{ ...noteStyle, marginBottom: 10 }}>{disclaimer.clockContext}</div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Clock</th>
              <th style={th}>Estimate</th>
              <th style={th}>Probes used / imputed</th>
              <th style={th}>Provenance</th>
            </tr>
          </thead>
          <tbody>
            {payload.clocks.map((clock) => (
              <tr key={clock.clockId}>
                <td style={cell}>
                  {clock.displayName}
                  <div style={{ ...noteStyle, fontSize: 11 }}>v{clock.clockVersion}</div>
                </td>
                <td style={cell}>
                  {clock.value !== null ? (
                    <span style={{ fontWeight: 600 }}>{clock.value.toFixed(1)} years</span>
                  ) : (
                    <span style={{ color: palette.warn }}>{PHRASES.provenance.refused}</span>
                  )}
                </td>
                <td style={cell}>
                  {clock.probesUsed} / {clock.probesImputed}
                </td>
                <td style={cell}>
                  <span style={noteStyle}>
                    {clock.refusedReason ??
                      (clock.probesImputed > 0 ? PHRASES.provenance.imputed : PHRASES.provenance.published)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={sectionTitle}>State map — hallmark axes</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          {payload.axes.map((axis) => (
            <AxisCard key={axis.axisKey} axis={axis} />
          ))}
        </div>
        <div style={{ ...noteStyle, marginTop: 10 }}>{disclaimer.notMeasured}</div>
      </section>

      {payload.deltas.length > 0 && (
        <section>
          <h2 style={sectionTitle}>Change between timepoints</h2>
          <div
            style={{
              ...noteStyle,
              marginBottom: 10,
              background: palette.warnWash,
              border: `1px solid ${palette.line}`,
              borderRadius: 6,
              padding: "8px 12px",
            }}
          >
            {disclaimer.deltaContext}
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={th}>Metric</th>
                <th style={th}>Values</th>
                <th style={th}>Noise band</th>
                <th style={th}>Assessment</th>
              </tr>
            </thead>
            <tbody>
              {payload.deltas.map((row) => (
                <DeltaRow key={row.metricKey} row={row} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer
        style={{
          marginTop: 40,
          paddingTop: 16,
          borderTop: `1px solid ${palette.line}`,
          ...noteStyle,
        }}
      >
        <div>{disclaimer.footer}</div>
        <div style={{ marginTop: 6 }}>
          Generated {payload.generatedAt} · disclaimer {payload.disclaimerVersion} · clocks:{" "}
          {payload.clocks.map((c) => `${c.clockId}@${c.clockVersion}`).join(", ") || "none"}
        </div>
      </footer>
    </div>
  );
}
