"""Municipal monuments (s00_fetch_gemeentelijk) linked to BAG panden.

The list gives an address and a coordinate. The address finds the pand through the BAG addresses; a pand it finds is kept
only when it lies near the coordinate (a street name may recur in another village). A monument the address does not find
takes the nearest building within a few metres of its coordinate.
"""
import json
import re
from functools import cache
from pathlib import Path

import geopandas as gpd
import numpy as np
from pyproj import Transformer

from .city import DATA

PATH = Path(f"{DATA}/raw/layers/gemeentelijk.json")
NEAR_ADDRESS = 60   # m: a pand found by address must lie this close to the listed coordinate
NEAR_POINT = 15     # m: otherwise the nearest building this close to the coordinate


def available() -> bool:
    return PATH.exists()


@cache
def rows() -> list[dict]:
    return json.load(open(PATH, encoding="utf-8")) if available() else []


@cache
def panden() -> dict[str, list[str]]:
    """{monument nr: [bag pand id, ...]} for the monuments that could be placed."""
    rs = rows()
    b = gpd.read_parquet(f"{DATA}/buildings.parquet", columns=["identificatie", "geometry"])
    b["bag"] = b.identificatie.str.slice(-16)
    to_rd = Transformer.from_crs(4326, 28992, always_xy=True)
    placed = [i for i, r in enumerate(rs) if r["lat"] is not None and r["lon"] is not None]  # some list rows have no coordinate
    xs, ys = to_rd.transform([rs[i]["lon"] for i in placed], [rs[i]["lat"] for i in placed])
    pts = gpd.GeoSeries(gpd.points_from_xy(xs, ys), crs=28992, index=placed)
    geom = dict(zip(b.bag, b.geometry))

    idx = {}
    for a in json.load(open(f"{DATA}/raw/addresses.json", encoding="utf-8")):
        if a["pandidentificatie"]:
            idx.setdefault((a["openbare_ruimte"].lower(), a["huisnummer"], (a["huisletter"] or "").lower()), set()).add(
                a["pandidentificatie"])

    # nearest building to every coordinate, for the monuments the address does not place
    near = gpd.sjoin_nearest(gpd.GeoDataFrame({"i": placed}, geometry=pts.values, crs=28992), b[["bag", "geometry"]],
                             max_distance=NEAR_POINT, distance_col="d").drop_duplicates("i").set_index("i").bag

    out = {}
    for i, r in enumerate(rs):
        found = set()
        m = re.match(r"^(.*?)\s+(\d+)\s*([A-Za-z]?)\b", r["address"])
        if m:
            street, n, letter = m.group(1).lower(), int(m.group(2)), m.group(3).lower()
            found = idx.get((street, n, letter)) or idx.get((street, n, "")) or set()
        if i in pts.index:
            found = [p for p in found if p in geom and geom[p].distance(pts[i]) <= NEAR_ADDRESS]
        else:  # no coordinate to check against: take the address only when it names a single pand
            found = [p for p in found if p in geom] if len(found) == 1 else []
        if not found and i in near.index:
            found = [near[i]]
        if found:
            out[r["nr"]] = sorted(found)
    return out


if __name__ == "__main__":
    rs, p = rows(), panden()
    print(len(rs), "monuments,", len(p), "placed on", len({q for v in p.values() for q in v}), "panden")
    print("not placed:", [r["address"] for r in rs if r["nr"] not in p])
