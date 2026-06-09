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

export function factorExplain(node: string, signal: string, points: number, terms?: string[]): string {
  switch (node) {
    case "traffic":
      return `${signal}. A lot of aircraft are flying near this airport right now — that means congestion, holding patterns and pressure on landing/takeoff slots, which pushes delay risk up. This signal added +${points} points to the score.`;
    case "weather":
      return `${signal}. This weather slows or suspends runway operations (wider aircraft spacing, holds, or temporary stoppages), raising the chance of delays and cancellations. Added +${points} points.`;
    case "news":
      return `Live news signal: "${signal}". A recent headline mentions a real disruption event${terms && terms.length ? ` (${terms.join(", ")})` : ""}. Added +${points} points.`;
    default:
      return `${signal}. Added +${points} points to the disruption score.`;
  }
}

export function flightRiskExplain(risk: number, verdict: Verdict): string {
  return `This flight's disruption risk: ${risk} out of 100 ("${verdict}"). It inherits the live conditions at both ends of the route, plus its departure window — a later flight in worsening conditions scores slightly higher. Same scale as the airport scores above. ${SCALE}`;
}
