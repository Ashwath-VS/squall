"""Squall — FastAPI app. Async, concurrent live-data fan-out.

Auto-generated OpenAPI docs at /docs double as a live API transparency surface,
reinforcing the 'declared methodology' story.
"""

import asyncio
import datetime
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import Config
from .services import predictor, communicator, airports
from .services.predictor import WEIGHTS, GUST_HIGH_KT, WIND_HIGH_KT, VIS_LOW_M, TRAFFIC_BUSY
from .utils.logger import get_logger

_log = get_logger("squall")

app = FastAPI(
    title="Squall · Airline IROPS Intelligence",
    description="Live disruption-risk prediction + proactive passenger outreach. "
                "All data live; only passenger personas are synthetic (declared).",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OVERVIEW_HUBS = ["LHR", "JFK", "SIN", "FRA", "DXB", "HKG"]


@app.on_event("startup")
async def _startup():
    for err in Config.validate():
        _log.warning(err)
    _log.info("Squall (FastAPI) initialised")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "squall"}


@app.get("/api/overview")
async def overview():
    """Live risk tiles for major hubs (Screen 1 network view) — assessed concurrently."""
    results = await asyncio.gather(*[predictor.assess_airport(h) for h in OVERVIEW_HUBS])
    tiles = [
        {
            "iata": a["iata"], "name": a["airport"]["name"], "city": a["airport"]["city"],
            "score": a["score"], "verdict": a["verdict"], "sources": a["sources"],
        }
        for a in results if not a.get("error")
    ]
    return {"hubs": tiles}


@app.get("/api/lookup/{iata}")
async def lookup(iata: str):
    """Lightweight airport name lookup (no external calls) — for input hints."""
    apt = airports.lookup(iata)
    if not apt:
        raise HTTPException(status_code=404, detail={"error": "unknown_airport", "iata": iata})
    return {"iata": apt["iata"], "name": apt["name"], "city": apt["city"], "country": apt["country"]}


def _validate_date(date: str | None):
    """Reject past dates — you cannot list flights for a date already gone."""
    if not date:
        return
    try:
        d = datetime.date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": "bad_date", "detail": "Use YYYY-MM-DD."})
    if d < datetime.date.today():
        raise HTTPException(status_code=400, detail={"error": "past_date",
                            "detail": "Departure date cannot be in the past."})


@app.get("/api/airport/{iata}")
async def airport_detail(iata: str):
    """Predictor detail for a single airport (Screen 2)."""
    result = await predictor.assess_airport(iata)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result)
    return result


@app.get("/api/route")
async def route(origin: str, dest: str, date: str | None = None):
    """Assess a route + live flight list (Screen 1 -> 2). Optional date=YYYY-MM-DD."""
    if not origin or not dest:
        raise HTTPException(status_code=400, detail="origin and dest required")
    _validate_date(date)
    result = await predictor.assess_route(origin, dest, date)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result)
    return result


class CommunicateRequest(BaseModel):
    origin: str
    dest: str
    flight_index: int = 0
    date: str | None = None


@app.post("/api/communicate")
async def communicate(req: CommunicateRequest):
    """Proactive passenger outreach for a chosen flight (Screen 3)."""
    _validate_date(req.date)
    route_result = await predictor.assess_route(req.origin, req.dest, req.date)
    if route_result.get("error"):
        raise HTTPException(status_code=404, detail=route_result)
    flights = route_result.get("flights", [])
    if not flights:
        raise HTTPException(
            status_code=422,
            detail={"error": "no_flights_available", "detail": "Flight list degraded — set SERPAPI_KEY."},
        )
    idx = max(0, min(req.flight_index, len(flights) - 1))
    return await communicator.compose(flights[idx], route_result)


@app.get("/api/methodology")
async def methodology() -> Dict[str, Any]:
    """Transparency panel — declared weights, thresholds, source cadence."""
    return {
        "weights": WEIGHTS,
        "thresholds": {
            "wind_high_kt": WIND_HIGH_KT,
            "gust_saturate_kt": GUST_HIGH_KT,
            "visibility_low_m": VIS_LOW_M,
            "traffic_busy_aircraft": TRAFFIC_BUSY,
        },
        "sources": [
            {"name": "Open-Meteo", "feeds": "wind, gusts, visibility, precip, snow",
             "live": True, "key": "keyless", "cadence": "per request (15-min cache)"},
            {"name": "SerpAPI Google News", "feeds": "disruption headlines",
             "live": bool(Config.SERPAPI_KEY), "key": "required",
             "cadence": "per request (15-min cache)"},
            {"name": "OpenSky Network", "feeds": "terminal-area aircraft density",
             "live": True, "key": "keyless", "cadence": "per request (15-min cache)"},
            {"name": "SerpAPI Google Flights", "feeds": "real scheduled flights on route",
             "live": bool(Config.SERPAPI_KEY), "key": "required",
             "cadence": "per request (15-min cache)"},
            {"name": "DeepSeek LLM", "feeds": "Communicator message generation",
             "live": bool(Config.LLM_API_KEY), "key": "required", "cadence": "per request"},
        ],
        "agents": {
            "predictor": "Deterministic cascade (no LLM). Live signals -> normalised "
                         "sub-scores -> weighted blend -> route compounding -> per-flight overlay. "
                         "All four signals fetched concurrently.",
            "communicator": "Synthetic personas grounded in flight profile; DeepSeek drafts "
                            "tailored proactive comms. Passenger identities never real.",
            "optimizer": "Architecture preview. Production requires an OR solver "
                         "(crew-legality, aircraft positioning, maintenance windows).",
        },
        "coverage": "Global. Weather + traffic work for any airport (28k+ via airportsdata). "
                    "News + flight density are richer at major hubs; score renormalises over "
                    "available signals at regional fields.",
    }
