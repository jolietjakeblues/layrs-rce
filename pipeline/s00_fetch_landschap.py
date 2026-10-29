"""Fetch the landscape maps of the province of Gelderland (WFS, geoserver.gelderland.nl) for the city's extent, in RD New.

The province maps its landscape types as they were around 1850 and as they are now (public domain, data.overheid.nl) and
the areas of earth-science value (aardkundig waardevolle gebieden; the catalogue gives their licence as unknown). The
config names the ones to fetch: "landschap": ["landschapstypen_1850", "landschapstypen_nu", "aardkundig"].
  raw/landschap/<name>.geojson   the polygons that fall in the city's extent, clipped to it
"""
from pathlib import Path

import geopandas as gpd
import requests
from shapely.geometry import box

from .city import CFG, DATA, UA, bounds

OUT = Path(f"{DATA}/raw/landschap")
WFS = "https://geoserver.gelderland.nl/geoserver/ows"
SOURCES = {
    "landschapstypen_1850": "ngr_b:Ls_Landschapstypen_1850",
    "landschapstypen_nu": "ngr_b:Ls_Landschapstypen_19nu",
    "aardkundig": "ngr_a:Ab_Aardkundige_waarde",
}


def main():
    wanted = CFG.get("landschap")
    if not wanted:
        print("no landschap in the config: skipped")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    x0, y0, x1, y1 = bounds()
    for name in wanted:
        r = requests.get(WFS, headers=UA, timeout=300, params=dict(
            service="WFS", version="2.0.0", request="GetFeature", typeNames=SOURCES[name], outputFormat="application/json",
            srsName="EPSG:28992", bbox=f"{x0},{y0},{x1},{y1},EPSG:28992", count=5000))
        r.raise_for_status()
        feats = r.json()["features"]
        if not feats:
            print(f"{name}: nothing in the extent")
            continue
        g = gpd.GeoDataFrame.from_features(feats, crs=28992)
        g["geometry"] = g.geometry.make_valid()
        g = g.clip(box(x0, y0, x1, y1), keep_geom_type=True)
        g = g[~g.geometry.is_empty]
        g.to_file(OUT / f"{name}.geojson", driver="GeoJSON")
        print(f"{name}: {len(feats)} features, {len(g)} in the extent")


if __name__ == "__main__":
    main()
