"""The national monuments without a BAG pand, as markers on the map: statues, bridges, walls, graves, and houses the
register does not link to a pand.

The layers light buildings, so a monument without a pand shows nowhere. Its place is the register's own geometry
(WGS84 WKT, from the Elastic projection, as the Kennisbank step reads it); a line or an area is marked at its centre.
  web/data/<city>/pins.json   [{nr, name, kind, x, z}] in the viewer's local frame; s03_tiles puts it in city.json
The card of a marker is the monument's entry in web/data/<city>/register/ (s16_register).
"""
import json
import re
from pathlib import Path

import numpy as np
import shapely
from pyproj import Transformer

from . import rce
from .city import CITY, DATA, UA, WEB
from .layers import monument_panden, monuments
from .s03_tiles import ORIGIN

WKT = "http://www opengis net/ont/geosparql#asWKT"


def kind_of(function: str | None) -> str:
    """The register's function without its code: 'Woonhuis(K)' → 'Woonhuis'."""
    return re.sub(r"\s*\([^)]*\)", "", function or "").strip()


def main():
    panden = monument_panden()
    loose = [m for m in monuments() if not panden.get(str(m["nr"]))]
    docs = rce.elastic_all([{"term": {"@id.soort": "rijksmonument"}},
                            {"terms": {rce.F + "rijksmonumentnummer": [str(m["nr"]) for m in loose]}}], UA,
                           ["rijksmonumentnummer", WKT]) if loose else []
    where = {d[rce.F + "rijksmonumentnummer"][0]: d[WKT][0] for d in docs if d.get(WKT)}
    to_rd = Transformer.from_crs(4326, 28992, always_xy=True)
    out, missing = [], []
    for m in loose:
        wkt = where.get(str(m["nr"]))
        if not wkt:
            missing.append(m["nr"])
            continue
        g = shapely.transform(shapely.from_wkt(wkt), lambda xy: np.c_[to_rd.transform(xy[:, 0], xy[:, 1])]).centroid
        kind = kind_of(m.get("function"))
        out.append(dict(nr=str(m["nr"]), name=m.get("name") or (f"{kind} (rijksmonument {m['nr']})" if kind else f"Rijksmonument {m['nr']}"), kind=kind,
                        x=round(float(g.x) - ORIGIN[0], 1), z=round(-(float(g.y) - ORIGIN[1]), 1)))
    Path(f"{WEB}/pins.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    kinds = {}
    for p in out:
        kinds[p["kind"] or "?"] = kinds.get(p["kind"] or "?", 0) + 1
    print(f"{len(loose)} monuments without a pand: {len(out)} placed, {len(missing)} without a geometry", missing[:8])
    print("  most:", sorted(kinds.items(), key=lambda kv: -kv[1])[:6])


if __name__ == "__main__":
    main()
