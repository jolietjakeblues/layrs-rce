"""Fetch the national maps of the maximum flood depth (LIWO, Rijkswaterstaat) for the city's extent, as GeoTIFFs.

The LIWO composes five maps of the whole country from the individual flood scenarios of the Landelijk Database
Overstromingsgegevens, one for each probability class: grote kans (about once in ten years), middelgrote (100),
kleine (1,000), zeer kleine (10,000) and extreem kleine kans (100,000, the map of overstroomik.nl). They are numbered
Kaart1 to Kaart5 in that order (LIWO, Technische uitgangspunten en methode afgeleide kaarten, annex A.1.1). Each cell holds
the greatest depth in metres any scenario of that class gives there; no data where no scenario floods.
  raw/flood/kaart1.tif … kaart5.tif   5 m cells, RD New
"""
from pathlib import Path

import requests

from .city import CFG, DATA, UA, bounds

OUT = Path(f"{DATA}/raw/flood")
WCS = "https://geodata.basisinformatie-overstromingen.nl/geoserver/wcs"
CLASSES = 5


def main():
    if not CFG.get("flood"):
        print("no flood in the config: skipped")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    x0, y0, x1, y1 = bounds()
    for k in range(1, CLASSES + 1):
        r = requests.get(WCS, params=[("service", "WCS"), ("version", "2.0.1"), ("request", "GetCoverage"),
                                      ("coverageId", f"LIWO_Basis__MaximaleWaterdiepteNederland_Kaart{k}"),
                                      ("format", "image/tiff"), ("subset", f"X({x0},{x1})"), ("subset", f"Y({y0},{y1})")],
                         headers=UA, timeout=600)
        r.raise_for_status()
        (OUT / f"kaart{k}.tif").write_bytes(r.content)
        print(f"kaart{k}: {len(r.content) / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
