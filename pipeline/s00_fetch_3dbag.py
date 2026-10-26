"""Download the 3D BAG tiles that cover the municipality (TU Delft 3D geoinformation, CC BY 4.0) into raw/3dbag/.

The tile index (FlatGeobuf) lists every tile with its outline and the URL of its download; only the tiles that
touch the municipality's outline are fetched. Since an outage the release is served from object
storage as CityJSON only (no GeoPackage): each tile is checked against its sha256 and rewritten into the three
GeoPackage layers the later steps read (pand, lod13_2d, lod22_3d), with 3D BAG's own column names. Should the
index list GeoPackages again (gpkg_download), those are fetched as they are.
A tile already on disk is kept, so a broken run can simply be rerun.
When the server cannot be reached the step says so and stops without an error: s00_fetch_3dbv then fetches the
3D Basisvoorziening, from which s01_load builds the same tables without LoD 2.2 roofs.
"""
import gzip
import hashlib
import io
import json
import shutil
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import geopandas as gpd
import numpy as np
import pyogrio
import requests
import shapely

from .city import DATA, UA

# data.3dbag.nl/v20250903 (release of 3 September 2025) is not fully back after the outage; the same release on
# the object storage behind it
INDEX = "https://3dbag.fsn1.your-objectstorage.com/v20250903/tile_index.fgb"
OUT = Path(f"{DATA}/raw/3dbag")
LABEL = {"GroundSurface": 0, "RoofSurface": 1}  # anything else (walls) is 2, as in 3D BAG's lod22_3d labels


def polygon(face, v, z=True):
    rings = [v[r] if z else v[r][:, :2] for r in face]
    return shapely.Polygon(rings[0], rings[1:])


def solid(o, lod):
    """The exterior shell of a part's Solid at this LoD: its faces and their semantic surface indices."""
    g = next((g for g in o.get("geometry", []) if g["type"] == "Solid" and g["lod"] == lod), None)
    if g is None:
        return [], [], []
    surfaces = g.get("semantics", {}).get("surfaces", [])
    values = g.get("semantics", {}).get("values", [[None] * len(g["boundaries"][0])])[0]
    return g["boundaries"][0], values, surfaces


def to_gpkg(cj: dict, target: Path):
    """One CityJSON tile as 3D BAG's GeoPackage layers pand, lod13_2d and lod22_3d."""
    t = cj["transform"]
    v = np.array(cj["vertices"]) * t["scale"] + t["translate"]
    objects = cj["CityObjects"]
    pand, lod13, lod22 = [], [], []
    for key, o in objects.items():
        if o["type"] == "Building":
            g = next(g for g in o["geometry"] if g["lod"] == "0")
            foot = shapely.union_all([polygon(f, v, z=False) for f in g["boundaries"]])
            pand.append(dict(o["attributes"], identificatie=key, geometry=foot))
        elif o["type"] == "BuildingPart":
            pid, deel = o["parents"][0], int(key.rsplit("-", 1)[1])
            faces, values, surfaces = solid(o, "1.3")
            for dd, s in enumerate(surfaces):
                if s["type"] != "RoofSurface":
                    continue
                roof = [polygon(f, v, z=False) for f, i in zip(faces, values) if i == dd]
                if roof:
                    lod13.append(dict(identificatie=pid, b3_pand_deel_id=deel, b3_dd_id=dd,
                                      b3_h_min=s.get("b3_h_dak_min"), b3_h_50p=s.get("b3_h_dak_50p"),
                                      b3_h_70p=s.get("b3_h_dak_70p"), b3_h_max=s.get("b3_h_dak_max"),
                                      geometry=shapely.union_all(roof)))
            faces, values, surfaces = solid(o, "2.2")
            if faces:
                codes = [2 if i is None else LABEL.get(surfaces[i]["type"], 2) for i in values]
                lod22.append(dict(identificatie=pid, b3_pand_deel_id=deel,
                                  labels=f"({len(codes)}:{','.join(map(str, codes))})",
                                  geometry=shapely.MultiPolygon([polygon(f, v) for f in faces])))
    tmp = target.parent / "partial" / target.name  # out of the *.gpkg the later steps glob, until complete
    tmp.parent.mkdir(exist_ok=True)
    tmp.unlink(missing_ok=True)
    for name, rows in (("pand", pand), ("lod13_2d", lod13), ("lod22_3d", lod22)):
        pyogrio.write_dataframe(gpd.GeoDataFrame(rows, geometry="geometry", crs=28992), tmp, layer=name,
                                driver="GPKG", append=name != "pand")
    tmp.rename(target)


def fetch(tile_id: str, url: str, sha256: str | None) -> str:
    name = tile_id.replace("/", "-")
    target = OUT / f"{name}.gpkg"
    if target.exists():
        return "kept"
    for attempt in range(4):
        try:
            # the object storage sends the .gz with Content-Encoding: gzip; keep the bytes the index hashed
            r = requests.get(url, headers=UA, timeout=600, stream=True)
            r.raise_for_status()
            body = r.raw.read(decode_content=False)
            if sha256 and hashlib.sha256(body).hexdigest() != sha256:
                raise requests.RequestException(f"{name}: sha256 does not match the index")
            break
        except requests.RequestException:
            if attempt == 3:
                raise
    if url.endswith(".city.json.gz"):
        to_gpkg(json.loads(gzip.decompress(body)), target)
    elif url.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            member = next(n for n in z.namelist() if n.endswith(".gpkg"))
            target.write_bytes(z.read(member))
    else:
        target.write_bytes(body)
    return "new"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    city = gpd.read_file(f"{DATA}/raw/boundary.json").set_crs(28992, allow_override=True)
    try:
        tiles = gpd.read_file(INDEX, bbox=tuple(city.total_bounds)).to_crs(28992)
    except Exception as e:
        print(f"3D BAG out of reach ({type(e).__name__}): falling back to the 3D Basisvoorziening")
        return
    tiles = tiles[tiles.intersects(city.union_all())]
    print(len(tiles), "tiles")
    if "gpkg_download" in tiles:
        urls, sums = tiles.gpkg_download, [None] * len(tiles)
    else:
        urls, sums = tiles.cj_download, tiles.cj_sha256
    with ThreadPoolExecutor(4) as ex:
        done = list(ex.map(fetch, tiles.tile_id, urls, sums))
    shutil.rmtree(OUT / "partial", ignore_errors=True)
    print(done.count("new"), "downloaded,", done.count("kept"), "already there")


if __name__ == "__main__":
    main()
