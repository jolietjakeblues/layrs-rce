"""A theme's monuments on their BAG panden, once the buildings around them are loaded (s01_load).

A city gets its monuments' panden from the register and the city's own addresses (s00_fetch_rce). A theme's register
links reach a pand for most monuments too, directly (ceo:heeftPand) or through a verblijfsobject (s00_fetch_addresses
fetched the sites' addresses); the rest stand where the register puts them: on the pand under its point, or the
nearest one within NEAREST metres. Rewrites raw/layers/monuments.json with the panden.
"""
import json
from pathlib import Path

import geopandas as gpd
import shapely

from .city import DATA

NEAREST = 25.0


def main():
    f = Path(f"{DATA}/raw/layers/monuments.json")
    mons = json.loads(f.read_text(encoding="utf-8"))
    p = gpd.read_parquet(f"{DATA}/panden.parquet", columns=["identificatie", "geometry"])
    p["bag"] = p.identificatie.str.slice(-16)
    known = set(p.bag)
    vbo = Path(f"{DATA}/raw/verblijfsobjecten.json")
    vbo_pand = json.loads(vbo.read_text()) if vbo.exists() else {}
    sidx = p.sindex
    how = {"register": 0, "point": 0, "nearest": 0, "none": 0}
    for m in mons:
        panden = {q for q in m["panden"] if q in known} | {vbo_pand[v] for v in m["vbos"] if vbo_pand.get(v) in known}
        if panden:
            how["register"] += 1
        elif m.get("x") is not None:
            pt = shapely.Point(m["x"], m["y"])
            hit = p.iloc[sidx.query(pt, predicate="within")]
            if len(hit):
                panden, k = set(hit.bag), "point"
            else:
                near = p.iloc[sidx.query(pt.buffer(NEAREST), predicate="intersects")]
                panden, k = ({near.iloc[near.distance(pt).argmin()].bag}, "nearest") if len(near) else (set(), "none")
            how[k] += 1
        else:
            how["none"] += 1
        m["panden"] = sorted(panden)
    f.write_text(json.dumps(mons, ensure_ascii=False), encoding="utf-8")
    print(len(mons), "monuments on their panden:", how)


if __name__ == "__main__":
    main()
