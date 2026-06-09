"""Airport lookup — global coverage (28k+ airports) via the airportsdata package.

Delivers the 'busiest hub -> Tier-3 regional' coverage promise: any valid IATA
code resolves to lat/lon/name so live weather works anywhere on earth.
"""

from functools import lru_cache
from typing import Optional, Dict

import airportsdata

from ..utils.logger import get_logger

_log = get_logger("squall.airports")

# Loaded once. Keyed by IATA code.
_IATA = airportsdata.load("IATA")

# Rough hub tiers for the network-overview tiles (busiest first). Everything
# not listed is treated as 'regional' — coverage still works, signal is thinner.
TIER1 = {"LHR", "JFK", "LAX", "ORD", "ATL", "DXB", "SIN", "HKG", "CDG", "FRA",
         "AMS", "PEK", "PVG", "HND", "ICN", "DEL", "BOM", "SYD", "DFW", "DEN"}
TIER2 = {"MAN", "BCN", "MAD", "MUC", "ZRH", "VIE", "CPH", "OSL", "DUB", "BRU",
         "FCO", "LIS", "SEA", "BOS", "SFO", "YYZ", "GRU", "JNB", "CAI", "BLR"}


@lru_cache(maxsize=4096)
def lookup(iata: str) -> Optional[Dict]:
    """Return {iata, name, city, country, lat, lon, tier} or None if unknown."""
    if not iata:
        return None
    rec = _IATA.get(iata.strip().upper())
    if not rec:
        return None
    code = rec["iata"]
    tier = "tier1" if code in TIER1 else "tier2" if code in TIER2 else "regional"
    return {
        "iata": code,
        "name": rec.get("name", code),
        "city": rec.get("city", ""),
        "country": rec.get("country", ""),
        "lat": rec.get("lat"),
        "lon": rec.get("lon"),
        "tier": tier,
    }


def coords(iata: str):
    rec = lookup(iata)
    if rec and rec["lat"] is not None:
        return rec["lat"], rec["lon"]
    return None
