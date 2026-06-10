# SQUALL.IROPS

> Airline irregular-operations intelligence. Predict the disruption *before* the airline does.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-orange.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![FastAPI](https://img.shields.io/badge/FastAPI-async-009688)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)

When a storm, ATC slowdown, or congestion event hits, airlines lose **$150K–$500K per disrupted wide-body rotation** — not from the cancellation itself, but from the slow, siloed recovery. By the time operations, crew scheduling, and passenger service coordinate, hours are gone and the call centre is melting down.

SQUALL.IROPS compresses that lag. It predicts disruption risk from **live** weather, news, and air-traffic signals *before* a flight is officially cancelled, then drafts proactive passenger outreach — turning a 3-hour reactive scramble into a minutes-long, coordinated response. Where its sibling [AirWave](https://github.com/Ashwath-VS/airwave) models airline **revenue** under pressure, Squall models **operations** under pressure.

**Live demo:** [irops.s-ashwath.com](https://irops.s-ashwath.com)

---

## What it does

Enter an origin–destination pair and a departure date — and the platform:

1. **Fans out to live signals concurrently** — weather (Open-Meteo), disruption news (SerpAPI Google News), and air-traffic density (OpenSky) at *both* endpoints, fetched in parallel so latency is bounded by the slowest call, not their sum
2. **Runs a deterministic risk cascade** — each signal is normalised to a 0–100 sub-score against declared thresholds, weight-blended (Weather 50% · News 30% · Traffic 20%) and renormalised over whatever is live, so it works from the busiest hub to a Tier-3 regional field
3. **Scores real flights on the route** — actual scheduled flights (SerpAPI Google Flights) inherit the route risk plus a departure-window overlay
4. **Drafts proactive passenger outreach** — synthetic passenger personas grounded in the real flight; Gemini writes a tailored, calm, action-oriented message per persona
5. **Quantifies the business case** — disruption cost avoided by acting early, plus a purchasable protection-fee revenue stream modelled on Air Canada's "On My Way"

Everything operationally measurable is **live and recomputed per request**. Only passenger identities are synthetic — declared openly. Predictions are capped to a credible **3-day nowcast horizon** (beyond short-range weather-forecast skill, no honest disruption signal exists yet).

---

## Screenshots

```
┌─────────────────────────────────────────────────────────────┐
│  SQUALL.IROPS_   Irregular Operations Intelligence  ● LIVE   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Predict the disruption BEFORE the airline does.            │
│                                                             │
│  [ LHR ] → [ SIN ]  [ 12/06/2026 ]  [ ASSESS RISK ]        │
│  ORIGIN · London Heathrow      DEST · Singapore Changi      │
│                                                             │
│  ┌──── PREDICTOR · LHR ────┐  ┌──── PREDICTOR · SIN ────┐  │
│  │  42 / 100   MODERATE     │  │  20 / 100   LOW          │  │
│  │  // HOW THE 42 IS BUILT  │  │                          │  │
│  │  News      78×30% = +23  │  │  Traffic  28×20% = +6    │  │
│  │  Traffic   28×20% = +6   │  │  Weather   0×50% = +0    │  │
│  │  Weather    0×50% = +0   │  │                          │  │
│  └──────────────────────────┘  └──────────────────────────┘ │
│                                                             │
│  LIVE FLIGHTS · RISK OVERLAY                                 │
│  ✈ SQ317  Singapore Airlines  11:05   22 · LOW             │
│  ✈ BA11   British Airways     12:30   44 · MODERATE        │
│                                                             │
│  BUSINESS CASE · THIS FLIGHT (180 PAX · RISK 43%)           │
│  $13,543  combined value = $13,003 saved + $540 fee revenue │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture

```
Open-Meteo        SerpAPI Google News      OpenSky          SerpAPI Google Flights
(weather)         (disruption headlines)   (traffic)        (real scheduled flights)
   │                      │                    │                       │
   └──────────┬───────────┴─────────┬──────────┘                       │
              ▼                      ▼                                  │
       async fan-out  (asyncio.gather — concurrent per request)        │
              │                                                        │
              ▼                                                        │
   PREDICTOR · deterministic cascade (NO LLM)                          │
   ────────────────────────────────────────────                       │
   • Normalise each signal → 0–100 (declared thresholds)              │
   • Weighted blend: Weather 50 · News 30 · Traffic 20                │
   • Renormalise over available signals (works at any airport)        │
   • Route compound = max(origin, dest)                               │
   • Per-flight overlay by departure window  ◄───────────────────────┘
              │
              ▼
   COMMUNICATOR · Gemini 2.5 Flash
   ────────────────────────────────
   • Synthetic personas grounded in the real flight
   • Tailored, proactive rebooking message per persona
   • Business-case panel: cost avoided + protection-fee revenue
   • Passenger identities never real — declared

   OPTIMIZER · architecture preview
   ────────────────────────────────
   • Production needs an OR solver (crew-legality,
     aircraft positioning, maintenance windows)
```

`nginx` serves the built React SPA and reverse-proxies `/api/*` to the FastAPI backend (`gunicorn` + `uvicorn` workers). Single always-on container on Fly.io, Singapore region.

---

## The scoring cascade

Three live signals, each normalised then weight-blended. Weather carries the most weight because it causes the most real-world disruption.

| Signal | Weight | Sub-score driven by |
|--------|--------|---------------------|
| Weather | `50%` | Wind gusts, visibility, precipitation, snowfall (Open-Meteo) |
| News | `30%` | Disruption-keyword headlines, weighted by recency/term count (SerpAPI) |
| Traffic | `20%` | Aircraft density in the terminal area (OpenSky) |

If a signal is unavailable (e.g. a small airport with no news), the remaining signals share its weight so the score still works everywhere. Every weight and threshold is exposed on the in-app **Methodology** panel — the score is auditable, not a black box.

---

## API

FastAPI auto-generates interactive OpenAPI docs at `/docs`.

### `GET /api/overview`
Live disruption-risk tiles for a fixed set of major hubs (assessed concurrently).

### `GET /api/airport/{iata}`
Full predictor detail for one airport — score, verdict, node breakdown, and the raw evidence signals.

### `GET /api/route?origin=LHR&dest=SIN&date=YYYY-MM-DD`
Assesses both endpoints and returns the live flight list with per-flight risk overlay. `date` is optional, capped at +3 days; past dates are rejected.

### `POST /api/communicate`
```json
{ "origin": "LHR", "dest": "SIN", "flight_index": 0, "date": "2026-06-12" }
```
Returns synthetic-persona outreach messages plus the quantified business case for the chosen flight.

### `GET /api/methodology`
Declared weights, thresholds, data-source cadence, and agent logic — the data behind the Methodology panel.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_API_KEY` | Yes (Communicator) | OpenAI-compatible key. Defaults target DeepSeek; the live deploy uses Gemini via its OpenAI-compatible endpoint |
| `LLM_BASE_URL` | No | OpenAI-compatible base URL (default `https://api.deepseek.com/v1`) |
| `LLM_MODEL_NAME` | No | Model id (default `deepseek-chat`) |
| `SERPAPI_KEY` | No | SerpAPI key for flights + news. Without it, the app runs degraded (weather + traffic only) and labels it honestly |
| `CACHE_TTL` | No | Response cache seconds (default `900`) |

Open-Meteo and OpenSky are keyless. Global airport coverage (28k+) is bundled via `airportsdata`.

---

## Project structure

```
squall/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app + routes
│   │   ├── config.py               # Env config
│   │   ├── api/                    # (routes mounted from main)
│   │   ├── services/
│   │   │   ├── data_sources.py     # Async live fetchers (weather/news/traffic/flights)
│   │   │   ├── predictor.py        # Deterministic risk cascade (no LLM)
│   │   │   ├── communicator.py     # Personas + Gemini outreach + business case
│   │   │   ├── airports.py         # Global airport lookup (airportsdata)
│   │   │   └── cache.py            # In-process TTL cache
│   │   └── utils/
│   │       └── llm_client.py       # OpenAI-compatible LLM client
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.tsx                 # Main UI (4 screens)
│       ├── MethodologyDrawer.tsx   # Transparency panel
│       ├── api.ts · types.ts · ui.ts
│       └── styles.css
├── Dockerfile.prod                 # Vue/React build + FastAPI + nginx
├── nginx.prod.conf · docker-entrypoint.sh
└── fly.toml
```

---

## Run locally

```bash
# Backend
cd backend
python -m venv .venv && . .venv/Scripts/activate   # (or source .venv/bin/activate)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 5001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev        # proxies /api to the backend
```

Create a `.env` at the repo root from `.env.example` and add your keys.

---

## Deploy to Fly.io

1. `fly apps create your-app-name`
2. `fly secrets set LLM_API_KEY=... SERPAPI_KEY=...`
3. `fly deploy` — builds the multi-stage Docker image (React → FastAPI → nginx)

---

## License

AGPL-3.0 — see [LICENSE](LICENSE)

---

Built by [S. Ashwath](https://s-ashwath.com) · sibling to [AirWave](https://github.com/Ashwath-VS/airwave)
