"""Fetch current BGT waterdeel polygons for the city from the PDOK OGC API, in 2 km cells."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from .city import DATA, cells as grid

API = "https://api.pdok.nl/lv/bgt/ogc/v1/collections/{c}/items"
RD = "http://www.opengis.net/def/crs/EPSG/0/28992"
CELL = 2000


def fetch_cell(collection, x, y):
    url = API.format(c=collection)
    params = {"f": "json", "limit": 1000, "bbox": f"{x},{y},{x + CELL},{y + CELL}", "bbox-crs": RD, "crs": RD}
    feats = []
    while url:
        r = requests.get(url, params=params, timeout=120)
        r.raise_for_status()
        d = r.json()
        feats += [f for f in d["features"] if not f["properties"].get("eind_registratie")]
        url = next((l["href"] for l in d["links"] if l["rel"] == "next"), None)
        params = None
    return feats


def fetch(collection):
    cells = grid(CELL)
    with ThreadPoolExecutor(8) as ex:
        parts = list(ex.map(lambda c: fetch_cell(collection, *c), cells))
    seen, feats = set(), []
    for f in (f for p in parts for f in p):
        key = f["properties"]["lokaal_id"]
        if key not in seen:
            seen.add(key); feats.append(f)
    out = Path(f"{DATA}/raw/bgt_{collection}.geojson")
    out.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    print(collection, len(feats))


if __name__ == "__main__":
    import sys
    for c in sys.argv[1:] or ["waterdeel"]:
        fetch(c)
