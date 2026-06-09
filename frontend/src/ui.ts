import type { Verdict } from "./types";

export function verdictColor(v: Verdict): string {
  switch (v) {
    case "HIGH": return "var(--high)";
    case "ELEVATED": return "var(--elevated)";
    case "MODERATE": return "var(--moderate)";
    default: return "var(--low)";
  }
}

export function riskBg(v: Verdict): string {
  switch (v) {
    case "HIGH": return "rgba(239,83,80,0.15)";
    case "ELEVATED": return "rgba(255,112,67,0.15)";
    case "MODERATE": return "rgba(255,183,77,0.15)";
    default: return "rgba(76,175,80,0.15)";
  }
}

export function fmtUSD(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function fmtDuration(min: number | null): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

// ── Plain-language explanations (for tooltips) ───────────────────────────────
const BANDS: Record<Verdict, string> = {
  LOW: "calm conditions — minimal disruption risk; flights should operate normally.",
  MODERATE: "some elevated signals — minor delays possible, cancellations unlikely.",
  ELEVATED: "meaningful risk — delays likely and some cancellations possible.",
  HIGH: "severe risk — significant delays and cancellations expected.",
};

const SCALE = "Scale: 0–24 LOW · 25–44 MODERATE · 45–69 ELEVATED · 70+ HIGH.";

export function verdictExplain(score: number, verdict: Verdict): string {
  return `Disruption risk ${score} out of 100. "${verdict}" means ${BANDS[verdict]} ${SCALE}`;
}

const NODE_MEANING: Record<string, string> = {
  weather: "Adverse weather slows or suspends runway operations (wider aircraft spacing, holds, stoppages).",
  news: "Recent news headlines mentioning real disruption events at this airport.",
  traffic: "How many aircraft are airborne near the airport right now — a proxy for congestion and slot pressure.",
};

const NODE_LABEL: Record<string, string> = { weather: "Weather", news: "News signals", traffic: "Traffic density" };

export function nodeLabel(node: string): string {
  return NODE_LABEL[node] || node;
}

/** Explains a node's WEIGHTED contribution — these numbers sum to the score. */
export function nodeExplain(node: string, subscore: number, weightPct: number, contribution: number): string {
  return `${NODE_LABEL[node] || node}: ${NODE_MEANING[node] || ""} This signal scores ${subscore}/100 on its own, carries ${weightPct}% weight in the blend, so it adds ${contribution} points to the final risk score. (The blend is Weather 50% · News 30% · Traffic 20%, renormalised over whatever signals are live.)`;
}

/** Explains a single raw signal (evidence strength within a node). */
export function signalExplain(node: string, signal: string, points: number, terms?: string[]): string {
  const base = node === "news"
    ? `Live headline: "${signal}"${terms && terms.length ? ` — matched: ${terms.join(", ")}` : ""}.`
    : `${signal}.`;
  return `${base} Relative strength ${points}/100 within the ${NODE_LABEL[node] || node} signal (not a direct score addition — see the signal's weighted contribution above).`;
}

export function flightRiskExplain(risk: number, verdict: Verdict): string {
  return `This flight's disruption risk: ${risk} out of 100 ("${verdict}"). It inherits the live conditions at both ends of the route, plus its departure window — a later flight in worsening conditions scores slightly higher. Same scale as the airport scores above. ${SCALE}`;
}
