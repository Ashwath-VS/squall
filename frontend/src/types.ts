export type Verdict = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
export type SourceFlag = "live" | "degraded";

export interface Factor {
  signal: string;
  points: number;
  node: string;
  terms?: string[];
}

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tier: string;
}

export interface AirportAssessment {
  iata: string;
  airport: Airport;
  score: number;
  verdict: Verdict;
  factors: Factor[];
  nodes_used: string[];
  sources: Record<string, SourceFlag>;
}

export interface HubTile {
  iata: string;
  name: string;
  city: string;
  score: number;
  verdict: Verdict;
  sources: Record<string, SourceFlag>;
}

export interface Flight {
  airline: string;
  flight_number: string;
  logo: string;
  depart: string;
  arrive: string;
  duration_min: number | null;
  stops: number;
  price: number | null;
  risk: number;
  risk_verdict: Verdict;
}

export interface RouteAssessment {
  origin: AirportAssessment;
  destination: AirportAssessment;
  route_score: number;
  route_verdict: Verdict;
  dominant_endpoint: string;
  flights: Flight[];
  flights_source: SourceFlag;
  outbound_date: string | null;
  disclaimer: string;
}

export interface OutreachItem {
  id: string;
  segment: string;
  tier: string;
  context: string;
  party: string;
  message: string;
}

export interface CommunicateResult {
  route: string;
  passenger_data: string;
  disclaimer: string;
  outreach: OutreachItem[];
  drafted: number;
}

export interface Methodology {
  weights: Record<string, number>;
  thresholds: Record<string, number>;
  sources: { name: string; feeds: string; live: boolean; key: string; cadence: string }[];
  agents: Record<string, string>;
  coverage: string;
}
