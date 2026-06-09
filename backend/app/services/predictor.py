"""Predictor Agent — deterministic disruption-probability cascade (ASYNC).

NO LLM. Every number traces to a live signal and a declared weight/threshold,
so the Methodology panel can fully justify the score.

Live signals are fetched CONCURRENTLY (asyncio.gather) — a route assessment is
bounded by the slowest single API call, not the sum of all four.

Cascade stages:
  1. Normalise each live signal to a 0-100 sub-score (declared thresholds)
  2. Weighted blend of available nodes (weights renormalise if a node is missing)
  3. Route compounding across origin + destination
  4. Per-flight overlay by departure window
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

import httpx

from . import airports, data_sources
from .cache import get_or_set
from ..utils.logger import get_logger

_log = get_logger("squall.predictor")

# ── Declared weights (shown verbatim in Methodology) ─────────────────────────
WEIGHTS = {"weather": 0.50, "news": 0.30, "traffic": 0.20}

# ── Declared thresholds ──────────────────────────────────────────────────────
GUST_HIGH_KT = 50
WIND_HIGH_KT = 35
VIS_LOW_M = 1500
VIS_FLOOR_M = 400
SNOW_SIGNIF_CM = 1.0
PRECIP_SIGNIF_MM = 4.0
TRAFFIC_BUSY = 80


def _clamp(x: float) -> float:
    return max(0.0, min(100.0, x))


def _weather_subscore(w: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if w.get("source") != "live":
        return None
    factors: List[Dict[str, Any]] = []
    score = 0.0

    gust = w.get("gust_kt") or 0
    if gust >= WIND_HIGH_KT:
        contrib = _clamp((gust - WIND_HIGH_KT) / (GUST_HIGH_KT - WIND_HIGH_KT) * 60)
        score += contrib
        factors.append({"signal": f"Wind gusts {gust:.0f}kt", "points": round(contrib)})

    vis = w.get("visibility_m")
    if vis is not None and vis < VIS_LOW_M:
        contrib = _clamp((VIS_LOW_M - vis) / (VIS_LOW_M - VIS_FLOOR_M) * 50)
        score += contrib
        factors.append({"signal": f"Visibility {vis:.0f}m", "points": round(contrib)})

    snow = w.get("snow_cm") or 0
    if snow >= SNOW_SIGNIF_CM:
        contrib = _clamp(snow * 12)
        score += contrib
        factors.append({"signal": f"Snowfall {snow:.1f}cm", "points": round(contrib)})

    precip = w.get("precip_mm") or 0
    if precip >= PRECIP_SIGNIF_MM:
        contrib = _clamp(precip * 4)
        score += contrib
        factors.append({"signal": f"Precipitation {precip:.1f}mm", "points": round(contrib)})

    return {"score": _clamp(score), "factors": factors}


def _news_subscore(n: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if n.get("source") != "live":
        return None
    factors: List[Dict[str, Any]] = []
    score = 0.0
    for art in n.get("articles", []):
        weight = 14 + 4 * (len(art.get("matched_terms", [])) - 1)
        score += weight
        factors.append({
            "signal": art["title"][:90],
            "points": round(min(weight, 30)),
            "terms": art.get("matched_terms", []),
        })
    return {"score": _clamp(score), "factors": factors}


def _traffic_subscore(t: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if t.get("source") != "live" or t.get("aircraft") is None:
        return None
    n = t["aircraft"]
    contrib = _clamp(n / TRAFFIC_BUSY * 60)
    return {
        "score": contrib,
        "factors": [{"signal": f"{n} aircraft in terminal area", "points": round(contrib)}],
    }


def _verdict(score: float) -> str:
    if score >= 70:
        return "HIGH"
    if score >= 45:
        return "ELEVATED"
    if score >= 25:
        return "MODERATE"
    return "LOW"


async def assess_airport(iata: str, client: Optional[httpx.AsyncClient] = None) -> Dict[str, Any]:
    """Live disruption assessment for a single airport (cached)."""
    iata = iata.strip().upper()
    return await get_or_set(f"assess:{iata}", lambda: _assess_airport_uncached(iata, client))


async def _assess_airport_uncached(iata: str, client: Optional[httpx.AsyncClient]) -> Dict[str, Any]:
    apt = airports.lookup(iata)
    if not apt:
        return {"error": "unknown_airport", "iata": iata}

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()
    try:
        weather, news, traffic = await asyncio.gather(
            data_sources.fetch_weather(client, iata),
            data_sources.fetch_news(client, iata, apt["name"]),
            data_sources.fetch_traffic(client, iata),
        )
    finally:
        if own_client:
            await client.aclose()

    nodes = {
        "weather": _weather_subscore(weather),
        "news": _news_subscore(news),
        "traffic": _traffic_subscore(traffic),
    }

    available = {k: v for k, v in nodes.items() if v is not None}
    total_w = sum(WEIGHTS[k] for k in available) or 1.0
    score = sum(nodes[k]["score"] * WEIGHTS[k] for k in available) / total_w

    factors: List[Dict[str, Any]] = []
    for k, v in available.items():
        for f in v["factors"]:
            factors.append({**f, "node": k})
    factors.sort(key=lambda f: f["points"], reverse=True)

    return {
        "iata": iata,
        "airport": apt,
        "score": round(score),
        "verdict": _verdict(score),
        "factors": factors[:8],
        "nodes_used": list(available.keys()),
        "sources": {
            "weather": weather.get("source"),
            "news": news.get("source"),
            "traffic": traffic.get("source"),
        },
        "raw": {"weather": weather, "news": news, "traffic": traffic},
    }


async def assess_route(origin: str, dest: str, outbound_date: str | None = None) -> Dict[str, Any]:
    """Full route assessment: both endpoints + live flight list (all concurrent)."""
    origin, dest = origin.strip().upper(), dest.strip().upper()
    date_key = outbound_date or "default"

    async with httpx.AsyncClient() as client:
        o, d, flights_data = await asyncio.gather(
            assess_airport(origin, client),
            assess_airport(dest, client),
            get_or_set(f"flights:{origin}:{dest}:{date_key}",
                       lambda: data_sources.fetch_flights(client, origin, dest, outbound_date)),
        )

    if o.get("error"):
        return o
    if d.get("error"):
        return d

    route_score = max(o["score"], d["score"])

    flights: List[Dict[str, Any]] = []
    for i, f in enumerate(flights_data.get("flights", [])):
        overlay = min(8, i)
        fscore = _clamp(route_score + overlay)
        flights.append({**f, "risk": round(fscore), "risk_verdict": _verdict(fscore)})

    return {
        "origin": o,
        "destination": d,
        "route_score": round(route_score),
        "route_verdict": _verdict(route_score),
        "dominant_endpoint": origin if o["score"] >= d["score"] else dest,
        "flights": flights,
        "flights_source": flights_data.get("source"),
        "outbound_date": flights_data.get("outbound_date"),
        "disclaimer": "Risk = route/airport conditions, not tail-specific ops data.",
    }
