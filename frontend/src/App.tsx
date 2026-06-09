import { useEffect, useState } from "react";
import { api } from "./api";
import { verdictColor, riskBg, fmtDuration } from "./ui";
import { MethodologyDrawer } from "./MethodologyDrawer";
import type { HubTile, RouteAssessment, CommunicateResult, AirportAssessment, Flight } from "./types";

function SourceBadges({ sources }: { sources: Record<string, string> }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {Object.entries(sources).map(([k, v]) => (
        <span key={k} className={`badge ${v === "live" ? "badge-live" : "badge-degraded"}`}>
          {k}: {v}
        </span>
      ))}
    </div>
  );
}

function SectionHead({ idx, title }: { idx: string; title: string }) {
  return (
    <div className="sec-head">
      <span className="sec-idx">{idx}</span>
      <span className="sec-title">{title}</span>
      <span className="sec-line" />
    </div>
  );
}

function AirportGauge({ a, label }: { a: AirportAssessment; label: string }) {
  return (
    <div className="card">
      <div className="mono" style={{ fontSize: 10, color: "var(--txt-faint)", letterSpacing: "0.14em" }}>
        {label} · {a.iata}
      </div>
      <div style={{ fontSize: 13, color: "var(--txt-dim)", margin: "2px 0 14px" }}>{a.airport.name}</div>
      <div className="gauge-num" style={{ color: verdictColor(a.verdict) }}>{a.score}</div>
      <div className="gauge-label" style={{ color: verdictColor(a.verdict) }}>{a.verdict}</div>
      <SourceBadges sources={a.sources} />
      <div style={{ marginTop: 18 }}>
        {a.factors.length === 0 && (
          <div className="mono" style={{ fontSize: 11, color: "var(--txt-faint)" }}>
            No elevated signals — calm conditions.
          </div>
        )}
        {a.factors.map((f, i) => (
          <div className="factor" key={i}>
            <div className="factor-top">
              <span>{f.signal} <span className="node-tag">[{f.node}]</span></span>
              <span style={{ color: "var(--amber)" }}>+{f.points}</span>
            </div>
            <div className="factor-bar">
              <div className="factor-fill" style={{ width: `${Math.min(100, f.points)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [hubs, setHubs] = useState<HubTile[]>([]);
  const [origin, setOrigin] = useState("LHR");
  const [dest, setDest] = useState("SIN");
  const [route, setRoute] = useState<RouteAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [outreach, setOutreach] = useState<CommunicateResult | null>(null);
  const [composing, setComposing] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    api.overview().then((r) => setHubs(r.hubs)).catch(() => {});
  }, []);

  async function assess(o = origin, d = dest) {
    setLoading(true); setError(""); setRoute(null); setSelected(null); setOutreach(null);
    try {
      const r = await api.route(o.toUpperCase(), d.toUpperCase());
      setRoute(r);
    } catch (e) {
      setError(`Could not assess ${o.toUpperCase()} → ${d.toUpperCase()}. Check the airport codes.`);
    } finally {
      setLoading(false);
    }
  }

  async function pickFlight(i: number) {
    setSelected(i); setOutreach(null); setComposing(true);
    try {
      const r = await api.communicate(origin.toUpperCase(), dest.toUpperCase(), i);
      setOutreach(r);
    } catch {
      setError("Outreach unavailable — flight list may be degraded (SerpAPI key needed).");
    } finally {
      setComposing(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <span className="brand">SQUALL<span className="dot">.</span></span>
          <span className="brand-sub" style={{ marginLeft: 12 }}>IROPS Intelligence</span>
        </div>
        <span className="live-pill"><span className="live-dot" /> LIVE DATA</span>
      </div>

      <div className="wrap">
        {/* HERO + SEARCH */}
        <section className="hero">
          <div className="kicker">S-ASHWATH / TRAVEL-TECH / IROPS</div>
          <h1>Predict the disruption<br /><span className="accent">before</span> the airline does.</h1>
          <p>
            Pick a route. Squall pulls live weather, disruption news, and air-traffic density at both
            endpoints, runs a deterministic risk cascade, then drafts proactive passenger outreach —
            the forward-looking signal that turns a 3-hour scramble into a minutes-long response.
          </p>
          <div className="search-row">
            <input className="od-input" value={origin} maxLength={3}
              onChange={(e) => setOrigin(e.target.value)} placeholder="LHR" />
            <span className="od-arrow">→</span>
            <input className="od-input" value={dest} maxLength={3}
              onChange={(e) => setDest(e.target.value)} placeholder="SIN" />
            <button className="btn" onClick={() => assess()} disabled={loading || !origin || !dest}>
              {loading ? "Assessing…" : "Assess Risk"}
            </button>
          </div>
          {error && <div className="err" style={{ marginTop: 14 }}>{error}</div>}
        </section>

        {/* SCREEN 1 — NETWORK OVERVIEW */}
        {!route && (
          <section>
            <SectionHead idx="01" title="Network Risk Overview · Live Hubs" />
            <div className="tiles">
              {hubs.length === 0 && <div className="spinner">Loading live hub status…</div>}
              {hubs.map((h) => (
                <div key={h.iata} className="tile" onClick={() => { setOrigin(h.iata); assess(h.iata, dest); }}>
                  <div className="tile-iata">{h.iata}</div>
                  <div className="tile-city">{h.city || h.name}</div>
                  <div className="tile-score" style={{ color: verdictColor(h.verdict) }}>{h.score}</div>
                  <div className="tile-verdict" style={{ color: verdictColor(h.verdict) }}>{h.verdict}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SCREEN 2 — ROUTE DETAIL */}
        {route && (
          <section>
            <SectionHead idx="02" title={`Predictor · ${route.origin.iata} → ${route.destination.iata}`} />
            <div className="detail-grid">
              <AirportGauge a={route.origin} label="ORIGIN" />
              <AirportGauge a={route.destination} label="DESTINATION" />
            </div>
            <div className="disclaimer">{route.disclaimer}</div>

            {/* SCREEN 2b — FLIGHTS */}
            <SectionHead idx="03" title="Live Flights · Risk Overlay" />
            {route.flights.length === 0 && (
              <div className="disclaimer">
                Flight list is degraded (SerpAPI key needed in production). Risk scoring above is fully live.
              </div>
            )}
            {route.flights.map((f: Flight, i) => (
              <div key={i} className={`flight ${selected === i ? "selected" : ""}`} onClick={() => pickFlight(i)}>
                <div className="flight-meta">
                  <div className="flight-airline">{f.airline} {f.flight_number}</div>
                  <div className="flight-time">
                    {f.depart} → {f.arrive} · {fmtDuration(f.duration_min)}
                    {f.stops > 0 ? ` · ${f.stops} stop` : " · nonstop"}
                  </div>
                </div>
                <div className="risk-chip" style={{ background: riskBg(f.risk_verdict), color: verdictColor(f.risk_verdict) }}>
                  {f.risk} · {f.risk_verdict}
                </div>
              </div>
            ))}

            {/* SCREEN 3 — COMMUNICATOR */}
            {selected !== null && (
              <>
                <SectionHead idx="04" title="Communicator · Proactive Outreach" />
                {composing && <div className="spinner">Drafting tailored passenger comms…</div>}
                {outreach && (
                  <>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                      <span className="badge badge-sim">PASSENGER DATA · SIMULATED</span>
                      <span className="mono" style={{ fontSize: 11, color: "var(--txt-faint)" }}>
                        {outreach.drafted} messages drafted
                      </span>
                    </div>
                    {outreach.outreach.map((p) => (
                      <div className="pax" key={p.id}>
                        <div className="pax-head">
                          <span className="pax-id">{p.id}</span>
                          <span className="pax-seg">{p.segment} · {p.tier} tier · {p.party}</span>
                        </div>
                        <div className="pax-msg">{p.message || "—"}</div>
                        <div className="pax-ctx">context: {p.context}</div>
                      </div>
                    ))}
                    <div className="disclaimer">{outreach.disclaimer}</div>
                  </>
                )}
              </>
            )}

            <button className="btn btn-ghost" style={{ marginTop: 26 }}
              onClick={() => { setRoute(null); setSelected(null); setOutreach(null); }}>
              ← Back to network overview
            </button>
          </section>
        )}

        <footer className="footer">
          // SQUALL · Predictor + Communicator live · Optimizer (architecture preview) · FastAPI + React ·
          all data live, passenger personas synthetic
        </footer>
      </div>

      <div className="drawer-trigger">
        <button className="btn btn-ghost" onClick={() => setDrawer(true)}>Methodology</button>
      </div>
      {drawer && <MethodologyDrawer onClose={() => setDrawer(false)} />}
    </>
  );
}
