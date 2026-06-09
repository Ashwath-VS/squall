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
