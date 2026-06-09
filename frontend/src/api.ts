import type {
  AirportAssessment,
  CommunicateResult,
  HubTile,
  Methodology,
  RouteAssessment,
} from "./types";

// Same-origin in prod (nginx proxies /api). Vite proxies in dev.
// Strip any trailing slash so BASE + "/api/..." never becomes "//api/..."
// (a protocol-relative URL that resolves the host to "api").
const BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export const api = {
  overview: () => get<{ hubs: HubTile[] }>("/api/overview"),
  airport: (iata: string) => get<AirportAssessment>(`/api/airport/${iata}`),
  route: (origin: string, dest: string, date?: string) =>
    get<RouteAssessment>(`/api/route?origin=${origin}&dest=${dest}${date ? `&date=${date}` : ""}`),
  methodology: () => get<Methodology>("/api/methodology"),
  communicate: async (origin: string, dest: string, flight_index: number, date?: string) => {
    const r = await fetch(`${BASE}/api/communicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, dest, flight_index, date }),
    });
    if (!r.ok) throw new Error(`communicate → ${r.status}`);
    return r.json() as Promise<CommunicateResult>;
  },
};
