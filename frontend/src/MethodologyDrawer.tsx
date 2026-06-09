import { useEffect, useState } from "react";
import { api } from "./api";
import type { Methodology } from "./types";

const TABS = ["Data Sources", "Scoring Cascade", "Agent Logic"] as const;

export function MethodologyDrawer({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Methodology | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Data Sources");

  useEffect(() => {
    api.methodology().then(setData).catch(() => {});
  }, []);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <h2>METHODOLOGY</h2>
        <div className="mono" style={{ fontSize: 11, color: "var(--txt-faint)" }}>
          Every number is declared. Nothing hidden.
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <div key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t}
            </div>
          ))}
        </div>

        {!data && <div className="spinner">Loading…</div>}

        {data && tab === "Data Sources" && (
          <div>
            {data.sources.map((s) => (
              <div className="src-row" key={s.name}>
                <div className="src-name">
                  <span>{s.name}</span>
                  <span className={`badge ${s.live ? "badge-live" : "badge-degraded"}`}>
                    {s.live ? "LIVE" : "INACTIVE"}
                  </span>
                </div>
                <div className="src-feeds">{s.feeds}</div>
                <div className="src-cadence">{s.key} · {s.cadence}</div>
              </div>
            ))}
            <div className="disclaimer">{data.coverage}</div>
          </div>
        )}

        {data && tab === "Scoring Cascade" && (
          <div className="mono" style={{ fontSize: 12, lineHeight: 1.9, color: "var(--txt-dim)" }}>
            <p style={{ marginBottom: 12 }}>
              Deterministic — <strong style={{ color: "var(--amber)" }}>no LLM in the math</strong>.
            </p>
            <p>// WEIGHTED BLEND</p>
            {Object.entries(data.weights).map(([k, v]) => (
              <div key={k}>{k.padEnd(9)} → {(v as number).toFixed(2)}</div>
            ))}
            <p style={{ marginTop: 14 }}>// THRESHOLDS</p>
            {Object.entries(data.thresholds).map(([k, v]) => (
              <div key={k}>{k} = {v as number}</div>
            ))}
            <p style={{ marginTop: 14 }}>// CASCADE</p>
            <div>1. Normalise each live signal → 0–100</div>
            <div>2. Weighted blend (renormalise if a node is missing)</div>
            <div>3. Route compound = max(origin, dest)</div>
            <div>4. Per-flight overlay by departure window</div>
          </div>
        )}

        {data && tab === "Agent Logic" && (
          <div>
            {Object.entries(data.agents).map(([k, v]) => (
              <div className="src-row" key={k}>
                <div className="src-name" style={{ textTransform: "capitalize" }}>{k}</div>
                <div className="src-feeds">{v}</div>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-ghost" style={{ marginTop: 22 }} onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}
