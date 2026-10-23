"""A theme's monuments (cities/<theme>.json "theme"): one kind of monument across a province, each in its surroundings.

Takes the place of s00_fetch_boundary and s00_fetch_rce for a theme. The kind is a subtree of the Referentienetwerk
(RN2), exported as TriG (theme.terms_zip): every rijksmonument in the province whose function or type is one of its
terms. Each gets a disc of theme.radius metres around it; the discs together are the 'municipality' the later steps
work in, so a mill stands in its own small diorama of buildings, water and roads.

Writes what s00_fetch_rce and s00_fetch_boundary write, in the same shapes, plus:
  raw/theme/terms.json   {uri: label} of the subtree
  raw/boundary.json      the discs, RD New
  web/data/<theme>/labels.json  empty: a theme has no street names
"""
import csv
import json
import re
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import requests
import shapely
from pyproj import Transformer

from . import rce
from .city import DATA, THEME, UA, WEB

OUT = Path(f"{DATA}/raw/layers")
TO_RD = Transformer.from_crs(4326, 28992, always_xy=True)


def subtree_terms(path: str) -> dict[str, str]:
    """{uri: label} of every concept in a PoolParty subtree export (TriG in a zip)."""
    z = zipfile.ZipFile(path)
    src = z.read(next(n for n in z.namelist() if n.endswith(".trig"))).decode("utf-8")
    out = {}
    for block in re.split(r"\n\s*\n", src):
        m = re.search(r"<(https://data\.cultureelerfgoed\.nl/term/id/rn/2/[0-9a-f-]+)>\s*\n\s*a skos:Concept", block)
        label = re.search(r'skos:prefLabel "([^"]+)"@nl', block)
        if m and label:
            out[m.group(1)] = label.group(1)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    Path(f"{DATA}/raw/theme").mkdir(parents=True, exist_ok=True)
    terms = subtree_terms(THEME["terms_zip"])
    (Path(f"{DATA}/raw/theme") / "terms.json").write_text(json.dumps(terms, ensure_ascii=False), encoding="utf-8")
    F = rce.F
    select = {"filter": [{"term": {F + "provincie.keyword": THEME["provincie"]}}],
              "should": [{"terms": {F + "heeftFunctieNaam": list(terms)}}, {"terms": {F + "heeftTypeNaam": list(terms)}}],
              "minimum_should_match": 1}
    mons = rce.from_elastic(None, UA, select)
    print(len(mons), "rijksmonumenten in", THEME["provincie"], "with one of", len(terms), "terms")
    for m in mons:
        if not m["name"] and m["txt"]:
            m["name"] = rce.name_from_text(m["txt"])
        m["terms"] = [u for u in m["terms"] if u in terms]

    # where each one stands: its point, or the middle of its outline, in RD
    pts = []
    for m in mons:
        g = shapely.from_wkt(m["wkt"]) if m["wkt"] else None
        if g is None:
            pts.append(None)
            continue
        c = g.representative_point() if g.geom_type != "Point" else g
        x, y = TO_RD.transform(c.x, c.y)
        m["x"], m["y"] = round(x, 1), round(y, 1)
        pts.append(shapely.Point(x, y))
    discs = [p.buffer(THEME["radius"], quad_segs=16) for p in pts if p is not None]
    boundary = gpd.GeoDataFrame(geometry=[shapely.union_all(discs)], crs=28992)
    boundary.to_file(f"{DATA}/raw/boundary.json", driver="GeoJSON")
    print(len(discs), "sites;", round(boundary.area.sum() / 1e6, 1), "km² in all")

    # the register's links to BAG; verblijfsobjecten become panden in s01b_theme_panden, once BAG is fetched
    nrs = [m["nr"] for m in mons]
    links = rce.bag_links(None, UA, nrs)
    for m in mons:
        panden, vbos = links.get(m["nr"], (set(), set()))
        m["vbos"] = sorted(vbos | set(m["vbos"]))
        m["panden"] = sorted(panden)
    (OUT / "monuments.json").write_text(json.dumps(mons, ensure_ascii=False), encoding="utf-8")

    with open(f"{DATA}/raw/rce_descriptions.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, ["nr", "txt"])
        w.writeheader()
        w.writerows(dict(nr=m["nr"], txt=m["txt"]) for m in mons if m["txt"])
    (OUT / "rce_styles.json").write_text(json.dumps(
        [dict(nr=m["nr"], style=s) for m in mons for s in m["styles"]], ensure_ascii=False), encoding="utf-8")
    cx = rce.complexes(sorted({m["complex"] for m in mons if m.get("complex")}), UA)
    (OUT / "complexes.json").write_text(json.dumps(cx, ensure_ascii=False), encoding="utf-8")
    photos = rce.images(nrs, UA)
    (OUT / "rce_images.json").write_text(json.dumps(photos, ensure_ascii=False), encoding="utf-8")
    act = rce.actors(None, UA, nrs)
    (OUT / "rce_actors.json").write_text(json.dumps(act, ensure_ascii=False), encoding="utf-8")
    print(len(cx), "complexes;", sum(len(v) for v in photos.values()), "RCE photos of", len(photos), "monuments;",
          len(act), "makers and clients")

    rows = rce.townscapes(UA)
    g = gpd.GeoDataFrame([{k: r.get(k) for k in ("nr", "naam", "status")} for r in rows],
                         geometry=[shapely.from_wkt(r["wkt"]) for r in rows], crs=4326).to_crs(28992)
    g = g[g.intersects(boundary.union_all()) & (g.status != "ingetrokken")]
    g.to_file(OUT / "gezichten.geojson", driver="GeoJSON")
    print(len(g), "protected townscapes touch the sites")

    Path(f"{WEB}/labels.json").write_text("[]", encoding="utf-8")
    province_map()


def province_map():
    """The province and its municipalities, for the overview from afar (Kadaster Bestuurlijke Gebieden, CC0):
    raw/theme/provincie.json and raw/theme/gemeenten.json, RD New."""
    api = "https://api.pdok.nl/kadaster/bestuurlijkegebieden/ogc/v1/collections/{}/items"
    rd = "http://www.opengis.net/def/crs/EPSG/0/28992"
    for coll, name, prop in (("provinciegebied", "provincie", "naam"), ("gemeentegebied", "gemeenten", "ligt_in_provincie_naam")):
        r = requests.get(api.format(coll), headers=UA, timeout=120,
                         params={"f": "json", prop: THEME["provincie"], "crs": rd, "limit": 1000})
        r.raise_for_status()
        d = r.json()
        (Path(f"{DATA}/raw/theme") / f"{name}.json").write_text(json.dumps(d), encoding="utf-8")
        print(len(d["features"]), coll, "in", THEME["provincie"])


if __name__ == "__main__":
    main()
