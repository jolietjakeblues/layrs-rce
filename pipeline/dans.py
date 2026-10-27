"""Archaeological and building-historical reports of the DANS Data Station (s00_fetch_dans) linked to BAG panden.

A report with a coordinate (RD or lon/lat) inside the municipality marks the buildings within a few metres of it. A report
without one but with an address in its title ("Prinsenstraat 6 te Dordrecht", "Wijnstraat 158 - 160") marks that pand.
Reports about finds or a whole plan area carry neither and stay out of the map.
"""
import json
import re
from functools import cache
from pathlib import Path

import geopandas as gpd
from pyproj import Transformer

from .city import DATA

PATH = Path(f"{DATA}/raw/layers/dans.json")
RADIUS = 20  # m: buildings this close to a report's coordinate

BUILDING = r"bouwhistor|kleurhistor|bouwkundig|bouwtechn|bouwsporen"
DIG = r"opgraving|begeleiding|proefsleuf|proefput|waarneming|onderzoeksgebied|sleuf|ondergronds|fotogrammetrie|documentatie"
SURVEY = r"bureauonderzoek|booronderzoek|boring|prospectie|inventariserend|verkennend|vooronderzoek|quickscan|archeologische verwachting"


def available() -> bool:
    return PATH.exists()


@cache
def rows() -> list[dict]:
    out = json.load(open(PATH, encoding="utf-8")) if available() else []
    for r in out:
        for k in ("title", "alt", "desc"):
            r[k] = (r.get(k) or "").replace("�", "'")
    return out


def kind(r: dict) -> str:
    t = f"{r['title']} {r['alt']} {r['desc'][:200]} {' '.join(r['keywords'])}".lower()
    for k, pat in (("building", BUILDING), ("dig", DIG), ("survey", SURVEY)):
        if re.search(pat, t):
            return k
    return "other"


def panden() -> dict[int, list[str]]:
    """{index of the report in rows(): [bag pand id, ...]} for the reports that could be placed."""
    return {i: bags for i, (bags, _) in placed().items() if bags}


def where() -> dict[int, tuple[float, float]]:
    """{index of the report: (x, y) in RD}: its coordinate, else the middle of the panden its title names."""
    return {i: at for i, (_, at) in placed().items()}


@cache
def placed() -> dict[int, tuple[list[str], tuple[float, float]]]:
    rs = rows()
    b = gpd.read_parquet(f"{DATA}/buildings.parquet", columns=["identificatie", "geometry"])
    b["bag"] = b.identificatie.str.slice(-16)
    area = gpd.read_file(f"{DATA}/raw/boundary.json").union_all()
    to_rd = Transformer.from_crs(4326, 28992, always_xy=True)

    idx, streets = {}, set()
    for a in json.load(open(f"{DATA}/raw/addresses.json", encoding="utf-8")):
        if a["pandidentificatie"] and a["openbare_ruimte"]:
            idx.setdefault((a["openbare_ruimte"].lower(), a["huisnummer"], (a["huisletter"] or "").lower()), set()).add(
                a["pandidentificatie"])
            streets.add(a["openbare_ruimte"])
    # longest names first, so "Lange Breestraat" is not read as "Breestraat"
    street_rx = re.compile(r"(?<![\w-])(" + "|".join(re.escape(s) for s in sorted(streets, key=len, reverse=True)) +
                           r")\s+(\d+)\s*([A-Za-z]\b)?", re.I)

    centre = dict(zip(b.bag, b.geometry.centroid))
    out = {}
    for i, r in enumerate(rs):
        x, y, found = r["x"], r["y"], set()
        if x and y and "lon" in (r.get("scheme") or ""):
            x, y = to_rd.transform(x, y)
        inside = bool(x and y and area.contains(gpd.points_from_xy([x], [y])[0]))
        if inside:
            pt = gpd.points_from_xy([x], [y])[0]
            found = set(b.bag[b.geometry.distance(pt) <= RADIUS])
        elif not (x and y):
            m = street_rx.search(f"{r['title']} {r['alt']}")
            if m:
                key = (m.group(1).lower(), int(m.group(2)), (m.group(3) or "").lower())
                found = idx.get(key) or idx.get((key[0], key[1], "")) or set()
        found = [p for p in found if p in centre]
        if found or inside:  # an excavation in an empty field has a place, though no building
            if inside:
                at = (x, y)
            else:
                at = (sum(centre[p].x for p in found) / len(found), sum(centre[p].y for p in found) / len(found))
            out[i] = (sorted(found), at)
    return out


if __name__ == "__main__":
    rs, p = rows(), panden()
    by_kind = {}
    for i in p:
        by_kind[kind(rs[i])] = by_kind.get(kind(rs[i]), 0) + 1
    print(len(rs), "reports,", len(p), "placed on", len({q for v in p.values() for q in v}), "panden;", by_kind)
