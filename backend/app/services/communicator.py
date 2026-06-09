"""Communicator Agent — proactive passenger outreach (async wrapper).

Passengers are SYNTHETIC personas, generated fresh per request from the real
flight's attributes. Never real PII — declared openly. In production this layer
binds to the carrier's PNR/DCS feed.

Message text is LLM-generated (DeepSeek, run in a threadpool to stay async).
Personas are deterministic.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

from ..utils.llm_client import LLMClient
from ..utils.logger import get_logger

_log = get_logger("squall.communicator")

_ARCHETYPES = [
    {"id": "PAX-01", "segment": "Business · connecting", "tier": "Gold",
     "context": "tight onward connection, time-sensitive", "party": "solo"},
    {"id": "PAX-02", "segment": "Family · leisure", "tier": "None",
     "context": "travelling with an infant, needs assistance", "party": "3 incl. infant"},
    {"id": "PAX-03", "segment": "Premium leisure", "tier": "Silver",
     "context": "flexible plans, values lounge access", "party": "couple"},
    {"id": "PAX-04", "segment": "Price-sensitive", "tier": "None",
     "context": "booked cheapest fare, no connection", "party": "solo"},
]


def build_personas(flight: Dict[str, Any]) -> List[Dict[str, Any]]:
    mix = [dict(a) for a in _ARCHETYPES]
    stops = flight.get("stops", 0)
    if stops and stops > 0:
        mix[0]["context"] = f"{stops}-stop itinerary, onward connection at risk"
    return mix


def _compose_sync(flight: Dict[str, Any], route: Dict[str, Any]) -> Dict[str, Any]:
    origin = route["origin"]["iata"]
    dest = route["destination"]["iata"]
    risk = flight.get("risk", route.get("route_score"))
    verdict = flight.get("risk_verdict", route.get("route_verdict"))
    factors = ", ".join(f["signal"] for f in route["origin"]["factors"][:2]) or "deteriorating conditions"

    personas = build_personas(flight)
    client = LLMClient()

    sys = (
        "You are an airline disruption-communications agent. Write a SHORT (2-3 sentence) "
        "proactive passenger message for a flight at risk of disruption. Be calm, specific, "
        "and action-oriented. Tailor tone and rebooking offer to the passenger segment. "
        "Do NOT invent flight numbers other than the one given. Output JSON only: "
        '{"messages":[{"id":"PAX-01","message":"..."},...]}'
    )
    persona_lines = "\n".join(
        f"- {p['id']}: {p['segment']}, {p['tier']} tier, {p['context']}, party: {p['party']}"
        for p in personas
    )
    user = (
        f"Flight {flight.get('airline','')} {flight.get('flight_number','')} "
        f"{origin}->{dest}, departs {flight.get('depart','')}. "
        f"Disruption risk: {risk}% ({verdict}). Drivers: {factors}.\n"
        f"Passengers (synthetic personas):\n{persona_lines}\n"
        "Write one tailored proactive message per passenger."
    )

    try:
        out = client.chat_json(
            [{"role": "system", "content": sys}, {"role": "user", "content": user}],
            temperature=0.6,
        )
        msgs = {m["id"]: m["message"] for m in out.get("messages", []) if m.get("id")}
    except Exception as exc:
        _log.warning(f"Communicator LLM failed: {exc}")
        msgs = {}

    results = [{**p, "message": msgs.get(p["id"], "")} for p in personas]
    return {
        "flight": flight,
        "route": f"{origin}->{dest}",
        "passenger_data": "simulated",
        "disclaimer": "Personas are synthetic. Production binds to the carrier PNR/DCS feed.",
        "outreach": results,
        "drafted": sum(1 for r in results if r["message"]),
    }


async def compose(flight: Dict[str, Any], route: Dict[str, Any]) -> Dict[str, Any]:
    return await asyncio.to_thread(_compose_sync, flight, route)
