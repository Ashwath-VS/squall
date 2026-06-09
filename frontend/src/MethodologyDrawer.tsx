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
          <div style={{ fontSize: 13, lineHeight: 1.75, color: "var(--txt-dim)" }}>
            <p style={{ marginBottom: 16 }}>
              How we turn live data into one risk score from 0 to 100. There's <strong style={{ color: "var(--amber)" }}>no
              AI guesswork here</strong> — it's a plain formula you can check.
            </p>

            <p style={{ color: "var(--txt)", fontWeight: 600, marginBottom: 4 }}>1 · We check three live things</p>
            <p style={{ marginBottom: 14 }}>
              At each airport we look at the <b>weather</b>, recent <b>news</b>, and how <b>busy the skies</b> are
              right now. Each one gets its own 0–100 score — worse weather, more disruption headlines, or heavier
              traffic all push that number up.
            </p>

            <p style={{ color: "var(--txt)", fontWeight: 600, marginBottom: 4 }}>2 · We combine them by importance</p>
            <p style={{ marginBottom: 8 }}>
              The three don't count equally. Weather matters most because it causes the most real-world disruption:
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <span className="badge badge-sim">Weather {Math.round((data.weights.weather ?? 0.5) * 100)}%</span>
              <span className="badge badge-sim">News {Math.round((data.weights.news ?? 0.3) * 100)}%</span>
              <span className="badge badge-sim">Traffic {Math.round((data.weights.traffic ?? 0.2) * 100)}%</span>
            </div>

            <p style={{ color: "var(--txt)", fontWeight: 600, marginBottom: 4 }}>3 · Missing data doesn't break it</p>
            <p style={{ marginBottom: 14 }}>
              If one source isn't available (say a small airport with no news), the other two simply share its
              importance — so the score still works everywhere, from the busiest hub to a remote regional field.
            </p>

            <p style={{ color: "var(--txt)", fontWeight: 600, marginBottom: 4 }}>4 · From airport to flight</p>
            <p style={{ marginBottom: 16 }}>
              For a route we take the riskier of the two airports. Each flight then nudges up slightly if it leaves
              later, when conditions are forecast to be worse.
            </p>

            <div className="disclaimer">
              What the number means — 0–24: calm. 25–44: minor delays possible. 45–69: delays likely.
              70+: serious disruption expected.
            </div>
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
