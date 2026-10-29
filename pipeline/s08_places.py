"""The names of the villages and hamlets of a municipality, to find one's way by from afar.

Source: the woonplaatsen of the BAG (PDOK OGC API, CC0). Every woonplaats with at least MIN buildings in the city gets its
name at the middle of its buildings (the median of their centres, so scattered farms do not pull it out of the village).
  web/data/<city>/places.json   [{name, x, z, n}] in the viewer's local frame; s03_tiles puts it in city.json
"""
import json
from pathlib import Path

import geopandas as gpd
import requests

from .city import DATA, UA, WEB, bounds
from .s03_tiles import ORIGIN

API = "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/woonplaats/items"
RD = "http://www.opengis.net/def/crs/EPSG/0/28992"
MIN = 40


def woonplaatsen() -> gpd.GeoDataFrame:
    x0, y0, x1, y1 = bounds()
    url, params, feats = API, {"f": "json", "limit": 1000, "bbox": f"{x0},{y0},{x1},{y1}", "bbox-crs": RD, "crs": RD}, []
    while url:
        r = requests.get(url, params=params, headers=UA, timeout=120)
        r.raise_for_status()
        d = r.json()
        feats += d["features"]
        url = next((l["href"] for l in d["links"] if l["rel"] == "next"), None)
        params = None
    return gpd.GeoDataFrame.from_features(feats, crs=28992)[["woonplaats", "geometry"]]


def main():
    b = gpd.read_parquet(f"{DATA}/buildings.parquet", columns=["identificatie", "geometry"])
    pts = gpd.GeoDataFrame(geometry=b.geometry.centroid, crs=28992)
    j = gpd.sjoin(pts, woonplaatsen(), predicate="within")
    out = []
    for name, g in j.groupby("woonplaats"):
        if len(g) >= MIN:
            out.append(dict(name=name, x=round(float(g.geometry.x.median()) - ORIGIN[0], 1),
                            z=round(-(float(g.geometry.y.median()) - ORIGIN[1]), 1), n=len(g)))
    out.sort(key=lambda p: -p["n"])
    Path(f"{WEB}/places.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(out), "places:", ", ".join(f'{p["name"]} {p["n"]}' for p in out))


if __name__ == "__main__":
    main()
