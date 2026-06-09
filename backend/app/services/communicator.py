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


# ── Impact & revenue model (declared, illustrative assumptions) ──────────────
# These are transparent industry-blended estimates, NOT carrier-specific figures.
# In production they'd be calibrated to the airline's own cost base.
PAX_PER_FLIGHT = 180          # typical single-aisle load
CARE_COST_PER_PAX = 180       # duty of care: hotel + meals if stranded (USD)
COMPENSATION_PER_PAX = 300    # blended statutory comp exposure (EU261 / APPR), USD
PROACTIVE_REDUCTION = 0.35    # cost avoided by acting early (fewer missed connections,
                              # fewer care nights, timely re-accommodation)
PROTECTION_FEE = 25           # opt-in disruption-protection fee, USD (cf. Air Canada "On My Way")
OPTIN_RATE = 0.12             # share of passengers who buy the fee


def estimate_impact(risk: int) -> Dict[str, Any]:
    p = max(0.0, min(1.0, risk / 100))
    reactive_per_pax = CARE_COST_PER_PAX + COMPENSATION_PER_PAX
    exposure_if_disrupted = PAX_PER_FLIGHT * reactive_per_pax
    expected_reactive_cost = exposure_if_disrupted * p
    proactive_saving = expected_reactive_cost * PROACTIVE_REDUCTION
    fee_revenue = PAX_PER_FLIGHT * OPTIN_RATE * PROTECTION_FEE
    return {
        "assumptions": {
            "pax_per_flight": PAX_PER_FLIGHT,
            "care_cost_per_pax": CARE_COST_PER_PAX,
            "compensation_per_pax": COMPENSATION_PER_PAX,
            "proactive_reduction_pct": round(PROACTIVE_REDUCTION * 100),
            "protection_fee": PROTECTION_FEE,
            "optin_rate_pct": round(OPTIN_RATE * 100),
        },
        "risk_pct": risk,
        "exposure_if_disrupted": round(exposure_if_disrupted),
        "expected_reactive_cost": round(expected_reactive_cost),
        "proactive_saving": round(proactive_saving),
        "fee_revenue_per_flight": round(fee_revenue),
        "combined_benefit": round(proactive_saving + fee_revenue),
        "note": "Illustrative, industry-blended estimates that scale with the live risk score — "
                "not carrier figures. Protection-fee model mirrors Air Canada's 'On My Way'. "
                "Figures are per single flight; network-wide they compound across every departure.",
    }


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
        "impact": estimate_impact(int(flight.get("risk", route.get("route_score", 0)))),
    }


async def compose(flight: Dict[str, Any], route: Dict[str, Any]) -> Dict[str, Any]:
    return await asyncio.to_thread(_compose_sync, flight, route)
