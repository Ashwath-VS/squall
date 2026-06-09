"""Live data sources for Squall — ASYNC (concurrent fan-out).

Every fetch returns a dict carrying a `source` flag: 'live' (real API hit) or
'degraded' (API down / missing key -> safe nulls). Nothing is ever fabricated;
a missing source yields nulls, not fake numbers.

All four sources are fetched concurrently per request (asyncio.gather), so a
route assessment is bounded by the slowest single call, not their sum.
"""

from __future__ import annotations

import datetime
from typing import Any, Dict, List

import httpx

from ..config import Config
from ..utils.logger import get_logger
from . import airports

_log = get_logger("squall.data")

_TIMEOUT = httpx.Timeout(12.0)
_FLIGHTS_TIMEOUT = httpx.Timeout(20.0)


# ── Weather (Open-Meteo, keyless, global) ────────────────────────────────────
async def fetch_weather(client: httpx.AsyncClient, iata: str) -> Dict[str, Any]:
    c = airports.coords(iata)
    if not c:
        return {"source": "degraded", "reason": "unknown_airport", "iata": iata}
    lat, lon = c
    try:
        r = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,wind_speed_10m,wind_gusts_10m,"
                           "precipitation,snowfall,visibility,weather_code",
                "wind_speed_unit": "kn",
            },
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        cur = r.json().get("current", {})
        return {
            "source": "live", "iata": iata,
            "temp_c": cur.get("temperature_2m"),
            "wind_kt": cur.get("wind_speed_10m"),
            "gust_kt": cur.get("wind_gusts_10m"),
            "precip_mm": cur.get("precipitation"),
            "snow_cm": cur.get("snowfall"),
            "visibility_m": cur.get("visibility"),
            "weather_code": cur.get("weather_code"),
        }
    except Exception as exc:
        _log.warning(f"Open-Meteo failed for {iata}: {exc}")
        return {"source": "degraded", "reason": "weather_api_error", "iata": iata}


# ── Air traffic density (OpenSky, keyless) ───────────────────────────────────
async def fetch_traffic(client: httpx.AsyncClient, iata: str) -> Dict[str, Any]:
    c = airports.coords(iata)
    if not c:
        return {"source": "degraded", "reason": "unknown_airport", "aircraft": None}
    lat, lon = c
    d = 1.0
    try:
        r = await client.get(
            "https://opensky-network.org/api/states/all",
            params={"lamin": lat - d, "lamax": lat + d, "lomin": lon - d, "lomax": lon + d},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        states = r.json().get("states") or []
        return {"source": "live", "aircraft": len(states)}
    except Exception as exc:
        _log.warning(f"OpenSky failed for {iata}: {exc}")
        return {"source": "degraded", "reason": "traffic_api_error", "aircraft": None}


# ── Disruption news signals (SerpAPI Google News) ────────────────────────────
_DISRUPTION_TERMS = [
    "strike", "cancel", "delay", "closure", "closed", "storm", "snow",
    "fog", "ground stop", "air traffic control", "atc", "diverted",
]


async def fetch_news(client: httpx.AsyncClient, iata: str, name: str = "") -> Dict[str, Any]:
    if not Config.SERPAPI_KEY:
        return {"source": "degraded", "reason": "no_serpapi_key", "articles": [], "hits": 0}
    query = f"{name or iata} airport disruption OR delay OR strike OR weather"
    try:
        r = await client.get(
            "https://serpapi.com/search",
            params={"engine": "google_news", "q": query, "api_key": Config.SERPAPI_KEY},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        results = r.json().get("news_results", []) or []
        articles: List[Dict[str, Any]] = []
        for item in results[:8]:
            title = (item.get("title") or "").strip()
            low = title.lower()
            matched = [t for t in _DISRUPTION_TERMS if t in low]
            if matched:
                articles.append({
                    "title": title,
                    "source_name": (item.get("source") or {}).get("name", ""),
                    "date": item.get("date", ""),
                    "matched_terms": matched,
                })
        return {"source": "live", "articles": articles, "hits": len(articles),
                "scanned": len(results)}
    except Exception as exc:
        _log.warning(f"SerpAPI News failed for {iata}: {exc}")
        return {"source": "degraded", "reason": "news_api_error", "articles": [], "hits": 0}


# ── Real flights on a route (SerpAPI Google Flights) ─────────────────────────
async def fetch_flights(client: httpx.AsyncClient, origin: str, dest: str) -> Dict[str, Any]:
    if not Config.SERPAPI_KEY:
        return {"source": "degraded", "reason": "no_serpapi_key", "flights": []}
    # Google Flights requires an outbound_date. Use ~3 days out for availability.
    outbound = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
    try:
        r = await client.get(
            "https://serpapi.com/search",
            params={
                "engine": "google_flights",
                "departure_id": origin.upper(),
                "arrival_id": dest.upper(),
                "outbound_date": outbound,
                "type": "2",
                "currency": "USD",
                "hl": "en",
                "api_key": Config.SERPAPI_KEY,
            },
            timeout=_FLIGHTS_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        raw = (data.get("best_flights") or []) + (data.get("other_flights") or [])
        flights: List[Dict[str, Any]] = []
        for f in raw[:12]:
            legs = f.get("flights", [])
            if not legs:
                continue
            first, last = legs[0], legs[-1]
            flights.append({
                "airline": first.get("airline", ""),
                "flight_number": first.get("flight_number", ""),
                "logo": first.get("airline_logo", ""),
                "depart": (first.get("departure_airport") or {}).get("time", ""),
                "arrive": (last.get("arrival_airport") or {}).get("time", ""),
                "duration_min": f.get("total_duration"),
                "stops": len(legs) - 1,
                "price": f.get("price"),
            })
        return {"source": "live", "flights": flights}
    except Exception as exc:
        _log.warning(f"SerpAPI Flights failed for {origin}->{dest}: {exc}")
        return {"source": "degraded", "reason": "flights_api_error", "flights": []}
