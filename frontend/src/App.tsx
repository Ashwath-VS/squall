import { useEffect, useState } from "react";
import { api } from "./api";
import { verdictColor, riskBg, fmtDuration, fmtUSD, verdictExplain, nodeExplain, signalExplain, nodeLabel, flightRiskExplain, impactExplain } from "./ui";
import { Tooltip, HintMark } from "./Tooltip";
import { MethodologyDrawer } from "./MethodologyDrawer";
import type { HubTile, RouteAssessment, CommunicateResult, AirportAssessment, Flight, Verdict } from "./types";

const TODAY = new Date().toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
// Default departure date: ~3 days out (matches backend default).
const DEFAULT_DATE = addDays(3);
// Operational nowcast horizon: weather-forecast skill is meaningful to ~3 days,
// so risk is only credible inside that window. Cap the date accordingly.
const MAX_DATE = addDays(3);

// Staged loading — shows the real pipeline so the result doesn't feel static.
const LOAD_STEPS = [
  "Fetching live weather · Open-Meteo",
  "Scanning disruption news · SerpAPI",
  "Polling air-traffic density · OpenSky",
  "Running deterministic risk cascade",
  "Scoring live flights on the route",
];
const STEP_MS = 850;
const MIN_LOAD_MS = LOAD_STEPS.length * STEP_MS; // ~4.25s minimum
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      <Tooltip text={verdictExplain(a.score, a.verdict)}>
        <div>
          <div className="gauge-num" style={{ color: verdictColor(a.verdict) }}>
            {a.score}<span style={{ fontSize: 18, color: "var(--txt-faint)" }}>/100</span>
          </div>
          <div className="gauge-label" style={{ color: verdictColor(a.verdict), display: "flex", alignItems: "center" }}>
            {a.verdict}<HintMark />
          </div>
        </div>
      </Tooltip>
      <SourceBadges sources={a.sources} />

      {/* Node breakdown — contributions sum to the score */}
      <div style={{ marginTop: 20 }}>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.14em", color: "var(--txt-faint)", marginBottom: 12 }}>
          // HOW THE {a.score} IS BUILT — WEIGHTED BLEND
        </div>
        {a.node_breakdown.map((n) => (
          <div key={n.node} style={{ marginBottom: 16 }}>
            <Tooltip text={nodeExplain(n.node, n.subscore, n.weight_pct, n.contribution)} pos="top" block>
              <div className="factor-top" style={{ width: "100%" }}>
                <span style={{ fontWeight: 600 }}>
                  {nodeLabel(n.node)} <span className="node-tag">{n.subscore}/100 × {n.weight_pct}%</span><HintMark />
                </span>
                <span style={{ color: "var(--amber)", fontWeight: 700 }}>+{n.contribution}</span>
              </div>
            </Tooltip>
            <div className="factor-bar" style={{ marginTop: 5 }}>
              <div className="factor-fill" style={{ width: `${Math.min(100, n.contribution)}%` }} />
            </div>
            {/* Raw evidence signals under each node */}
            {n.signals.slice(0, 4).map((s, j) => (
              <Tooltip key={j} text={signalExplain(n.node, s.signal, s.points, s.terms)} pos="top" block>
                <div className="signal-row">
                  <span className="signal-dot" />
                  <span className="signal-text">{s.signal}</span>
                  <span className="signal-strength">{s.points}</span>
                </div>
              </Tooltip>
            ))}
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
  const [date, setDate] = useState(DEFAULT_DATE);
  const [route, setRoute] = useState<RouteAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [outreach, setOutreach] = useState<CommunicateResult | null>(null);
  const [composing, setComposing] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [originName, setOriginName] = useState("");
  const [destName, setDestName] = useState("");

  useEffect(() => {
    api.overview().then((r) => setHubs(r.hubs)).catch(() => {});
  }, []);

  // Resolve full airport names as the user types valid 3-letter codes.
  useEffect(() => {
    if (origin.length !== 3) { setOriginName(""); return; }
    let live = true;
    api.lookup(origin.toUpperCase())
      .then((a) => { if (live) setOriginName(`${a.name}${a.city ? `, ${a.city}` : ""}`); })
      .catch(() => { if (live) setOriginName("— unknown code —"); });
    return () => { live = false; };
  }, [origin]);

  useEffect(() => {
    if (dest.length !== 3) { setDestName(""); return; }
    let live = true;
    api.lookup(dest.toUpperCase())
      .then((a) => { if (live) setDestName(`${a.name}${a.city ? `, ${a.city}` : ""}`); })
      .catch(() => { if (live) setDestName("— unknown code —"); });
    return () => { live = false; };
  }, [dest]);

  async function assess(o = origin, d = dest) {
    if (date < TODAY) {
      setError("Departure date cannot be in the past — pick today or a future date.");
      return;
    }
    setLoading(true); setLoadStep(0); setError(""); setRoute(null); setSelected(null); setOutreach(null);
    const t0 = Date.now();
    const iv = setInterval(() => setLoadStep((s) => Math.min(s + 1, LOAD_STEPS.length - 1)), STEP_MS);
    try {
      const r = await api.route(o.toUpperCase(), d.toUpperCase(), date);
      // Keep the pipeline visible for a realistic minimum, even when cached.
      const elapsed = Date.now() - t0;
      if (elapsed < MIN_LOAD_MS) await sleep(MIN_LOAD_MS - elapsed);
      setRoute(r);
    } catch (e) {
      setError(`Could not assess ${o.toUpperCase()} → ${d.toUpperCase()}. Check the airport codes are valid IATA codes.`);
    } finally {
      clearInterval(iv);
      setLoading(false);
    }
  }

  async function pickFlight(i: number) {
    setSelected(i); setOutreach(null); setComposing(true);
    try {
      const r = await api.communicate(origin.toUpperCase(), dest.toUpperCase(), i, date);
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
          <span className="brand">SQUALL<span className="dot">.</span>IROPS</span>
          <span className="brand-sub" style={{ marginLeft: 12 }}>Irregular Operations Intelligence</span>
        </div>
        <span className="live-pill"><span className="live-dot" /> LIVE DATA</span>
      </div>

      <div className="wrap">
        {/* HERO + SEARCH */}
        <section className="hero">
          <div className="kicker">S-ASHWATH / TRAVEL-TECH / SQUALL.IROPS</div>
          <h1>Predict the disruption<br /><span className="accent">before</span> the airline does.</h1>
          <p>
            Pick a route. Squall checks live weather, disruption news, and how busy the skies are at both
            airports, scores the chance of disruption, then drafts passenger messages in advance — so an
            airline can see trouble coming and act early, instead of scrambling to rebook stranded
            passengers after a flight is already cancelled.
          </p>
          <div className="search-row">
            <input className="od-input" value={origin} maxLength={3}
              onChange={(e) => setOrigin(e.target.value)} placeholder="LHR" />
            <span className="od-arrow">→</span>
            <input className="od-input" value={dest} maxLength={3}
              onChange={(e) => setDest(e.target.value)} placeholder="SIN" />
            <Tooltip text="Departure date for the live flight list. Risk is a NOWCAST — built from current weather, news and traffic — so the date is capped at 3 days out, the window where short-range weather forecasting stays skilful. Beyond that, no honest disruption signal exists yet.">
              <input className="od-input" type="date" value={date} min={TODAY} max={MAX_DATE} style={{ width: "auto" }}
                onChange={(e) => setDate(e.target.value)} />
            </Tooltip>
            <button className="btn" onClick={() => assess()} disabled={loading || !origin || !dest}>
              {loading ? "Assessing…" : "Assess Risk"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <div className="od-hint">{originName && `ORIGIN · ${originName}`}</div>
            <div className="od-hint">{destName && `DEST · ${destName}`}</div>
          </div>
          {error && <div className="err" style={{ marginTop: 14 }}>{error}</div>}
        </section>

        {/* STAGED LOADING */}
        {loading && (
          <section style={{ marginTop: 20 }}>
            <div className="loading-panel">
              <div className="loading-title">// ASSESSING {origin.toUpperCase()} → {dest.toUpperCase()} · LIVE PIPELINE</div>
              {LOAD_STEPS.map((s, i) => (
                <div key={i} className={`load-step ${i < loadStep ? "done" : i === loadStep ? "active" : ""}`}>
                  {i < loadStep
                    ? <span className="load-icon">✓</span>
                    : i === loadStep
                      ? <span className="load-spin" />
                      : <span className="load-icon">·</span>}
                  {s}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SCREEN 1 — NETWORK OVERVIEW */}
        {!route && !loading && (
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

            {/* Verdict legend — shared key for all scores on the page */}
            <div className="legend">
              {([["LOW", "0–24"], ["MODERATE", "25–44"], ["ELEVATED", "45–69"], ["HIGH", "70+"]] as [Verdict, string][]).map(
                ([v, range]) => (
                  <span className="legend-item" key={v}>
                    <span className="legend-dot" style={{ background: verdictColor(v) }} /> {v} <span style={{ opacity: 0.6 }}>{range}</span>
                  </span>
                )
              )}
            </div>

            {/* SCREEN 2b — FLIGHTS */}
            <SectionHead idx="03" title="Live Flights · Risk Overlay" />
            {route.outbound_date && route.flights.length > 0 && (
              <div className="flights-date">
                Showing <b>{route.flights.length}</b> live flights departing <b>{route.outbound_date}</b>.
                Use the date picker above to change it. Each flight carries the live route risk plus its departure-window adjustment.
              </div>
            )}
            {route.flights.length === 0 && (
              <div className="disclaimer">
                No flights returned for this route/date (try a major route or a different date). Risk scoring above is fully live.
              </div>
            )}
            {route.flights.map((f: Flight, i) => (
              <div key={i} className={`flight ${selected === i ? "selected" : ""}`} onClick={() => pickFlight(i)}>
                <div className="flight-left">
                  {f.logo
                    ? <img className="flight-logo" src={f.logo} alt={f.airline} loading="lazy" />
                    : <div className="flight-logo" style={{ background: "var(--surface-2)" }} />}
                  <div className="flight-meta">
                    <div className="flight-airline">{f.airline} {f.flight_number}</div>
                    <div className="flight-time">
                      {f.depart} → {f.arrive} · {fmtDuration(f.duration_min)}
                      {f.stops > 0 ? ` · ${f.stops} stop` : " · nonstop"}
                    </div>
                  </div>
                </div>
                <Tooltip text={flightRiskExplain(f.risk, f.risk_verdict)}>
                  <div className="risk-chip" style={{ background: riskBg(f.risk_verdict), color: verdictColor(f.risk_verdict) }}>
                    {f.risk} · {f.risk_verdict}<HintMark />
                  </div>
                </Tooltip>
              </div>
            ))}

            {/* SCREEN 3 — COMMUNICATOR */}
            {selected !== null && (
              <>
                <SectionHead idx="04" title="Communicator · Proactive Outreach" />
                {composing && <div className="spinner">Drafting tailored passenger comms…</div>}
                {outreach && (
                  <>
                    {/* Monetary impact + revenue model */}
                    {(() => {
                      const ix = impactExplain(outreach.impact);
                      const a = outreach.impact.assumptions;
                      return (
                        <div className="impact">
                          <div className="impact-title">// BUSINESS CASE · THIS FLIGHT ({a.pax_per_flight} PAX · RISK {outreach.impact.risk_pct}%) — hover any figure</div>
                          <Tooltip text={ix.combined} block>
                            <div className="impact-headline" style={{ cursor: "help" }}>
                              <span className="impact-big">{fmtUSD(outreach.impact.combined_benefit)}</span>
                              <span className="impact-eq">
                                combined value per flight = <b>{fmtUSD(outreach.impact.proactive_saving)}</b> disruption cost avoided
                                + <b>{fmtUSD(outreach.impact.fee_revenue_per_flight)}</b> protection-fee revenue<HintMark />
                              </span>
                            </div>
                          </Tooltip>
                          <div className="impact-grid">
                            <Tooltip text={ix.exposure} block>
                              <div className="impact-cell">
                                <div className="impact-val" style={{ color: "var(--high)" }}>{fmtUSD(outreach.impact.exposure_if_disrupted)}</div>
                                <div className="impact-lbl">Cost exposure if fully disrupted ({a.pax_per_flight} pax × ${a.care_cost_per_pax + a.compensation_per_pax}/pax care + comp)<HintMark /></div>
                              </div>
                            </Tooltip>
                            <Tooltip text={ix.expected} block>
                              <div className="impact-cell">
                                <div className="impact-val" style={{ color: "var(--moderate)" }}>{fmtUSD(outreach.impact.expected_reactive_cost)}</div>
                                <div className="impact-lbl">Expected reactive cost (exposure × {outreach.impact.risk_pct}% live risk)<HintMark /></div>
                              </div>
                            </Tooltip>
                            <Tooltip text={ix.saving} block>
                              <div className="impact-cell">
                                <div className="impact-val" style={{ color: "var(--low)" }}>{fmtUSD(outreach.impact.proactive_saving)}</div>
                                <div className="impact-lbl">Saved by acting early (−{a.proactive_reduction_pct}% via timely re-accommodation)<HintMark /></div>
                              </div>
                            </Tooltip>
                            <Tooltip text={ix.fee} block>
                              <div className="impact-cell">
                                <div className="impact-val" style={{ color: "var(--amber)" }}>{fmtUSD(outreach.impact.fee_revenue_per_flight)}</div>
                                <div className="impact-lbl">Protection-fee revenue ({a.optin_rate_pct}% opt-in × ${a.protection_fee} — cf. Air Canada "On My Way")<HintMark /></div>
                              </div>
                            </Tooltip>
                          </div>
                          <div className="disclaimer">{outreach.impact.note}</div>
                        </div>
                      );
                    })()}

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
          // SQUALL.IROPS · Predictor + Communicator live · Optimizer (architecture preview) · FastAPI + React ·
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
