"""The archaeology mode's data (web/data/<city>/archeo/), from what s00_fetch_archeo fetched.

The viewer turns the city over and shows, under the ground, every onderzoeksgebied (research area) once for each
archaeological period its finds and features date from: the deeper, the older. The periods are ABR periods from the
Referentienetwerk, one layer each:
  Recent, Nieuwe Tijd, Late and Vroege Middeleeuwen, Romeinse Tijd, IJzertijd, Bronstijd, Neolithicum, Mesolithicum,
  Paleolithicum
An object (archeologisch complex, grondspoor, vondst) belongs to every layer its years overlap; one spanning more than
SPREAD_MAX layers says little about when, and counts as undated.

  areas.bin   the areas' outlines (s04_water's polygon format), areas in order, each one or more polygons
  terrains.bin  the archaeological rijksmonumenten (protected sites)
  areas.json  {layers: [...], areas: [{nr, cho, poly: [first, count], mask, name, spots, counts, complexes, features,
               finds, materials, registered}], terrains: [{nr, cho, name, txt, poly}]}
  reports.json  the city's reports of the DANS Data Station Archaeology (s00_fetch_dans), each a borehole through the
              layers of the periods it covers: {layers: [...], reports: [{t, a, y, d, k, at: [x, z], m, f}]}
  graph.json  periods, archeologische complexen, grondsporen and materials, linked to the areas they occur in, every
              point a term of the Referentienetwerk; in s13_graph's format, for graph.html?mode=archeo
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import shapely
from pyproj import Transformer

from . import dans
from .city import CFG, DATA, WEB
from .s03_tiles import ORIGIN
from .s04_water import pack, polygons

RAW = Path(f"{DATA}/raw/archeo")
OUT = Path(f"{WEB}/archeo")
SPREAD_MAX = 3
TOP = 8
GRAPH_MIN_OBJECTS = 40  # areas in the graph: the larger investigations, with at least this many objects
# terms in the graph: found in at least this many of those areas (archeologische complexen are few, so all of them)
GRAPH_MIN_AREAS = {"person": 2, "architect": 8, "organisation": 10}
LDV = "https://linkeddata.cultureelerfgoed.nl/cho-kennis/id/"
# the layers, shallow to deep: (parent period's label or own label, English name, colour)
LAYERS = [
    ("Recent", "Recent", "#d8c7a8"),
    ("Nieuwe Tijd", "Modern period", "#c49a62"),
    ("Late Middeleeuwen", "Late Middle Ages", "#a8703a"),
    ("Vroege Middeleeuwen", "Early Middle Ages", "#8a5a2e"),
    ("Romeinse Tijd", "Roman period", "#b5452b"),
    ("IJzertijd", "Iron Age", "#7a4f73"),
    ("Bronstijd", "Bronze Age", "#b08532"),
    ("Neolithicum", "Neolithic", "#5f7d4a"),
    ("Mesolithicum", "Mesolithic", "#3f6f73"),
    ("Paleolithicum", "Palaeolithic", "#344a63"),
]
KIND_NL = {"archeologischcomplex": "archeologische complexen", "grondsporen": "grondsporen", "vondsten": "vondsten"}
TO_RD = Transformer.from_crs(4326, 28992, always_xy=True)


def local_polys(wkt: str) -> list:
    g = shapely.transform(shapely.from_wkt(wkt), lambda xy: np.c_[TO_RD.transform(xy[:, 0], xy[:, 1])])
    g = shapely.make_valid(g).simplify(1.0)
    return [p for p in polygons(g) if p.area > 4]  # in RD: pack() puts them in the viewer's frame


# the ABR 1 period names DANS cites, as the layer they fall in: the first that is contained in the name wins
PERIOD_LAYER = [("Late Middeleeuwen", ["Late Middeleeuwen"]), ("Vroege Middeleeuwen", ["Vroege Middeleeuwen"]),
                ("Vroeg Middeleeuwen", ["Vroege Middeleeuwen"]), ("Middeleeuwen", ["Late Middeleeuwen", "Vroege Middeleeuwen"]),
                ("Nieuwe Tijd", ["Nieuwe Tijd"]), ("Recent", ["Recent"]), ("Romeinse Tijd", ["Romeinse Tijd"]),
                ("IJzertijd", ["IJzertijd"]), ("Bronstijd", ["Bronstijd"]), ("Neolithicum", ["Neolithicum"]),
                ("Mesolithicum", ["Mesolithicum"]), ("Paleolithicum", ["Paleolithicum"])]


def reports(layers: list[dict]) -> list[dict]:
    """The DANS reports with a place, as boreholes: the layers (bits) of the periods they name, none when undated."""
    if not dans.available():
        return []
    bit = {L["label"]: i for i, L in enumerate(layers)}
    rs, where, out = dans.rows(), dans.where(), []
    for i, (x, y) in where.items():
        r, m = rs[i], 0
        for name in r.get("periodLabels", []):
            for key, targets in PERIOD_LAYER:
                if key in name:
                    for t in targets:
                        m |= 1 << bit[t]
                    break
        out.append(dict(t=r["title"], a="; ".join(r["authors"][:2]), y=r["year"], d=r["doi"], k=dans.kind(r),
                        at=[round(x - ORIGIN[0], 1), round(-(y - ORIGIN[1]), 1)], m=m, f=r.get("files") or 0))
    return out


def main():
    load = lambda n: json.load(open(RAW / f"{n}.json", encoding="utf-8"))
    areas, spots, objects, terrains, periods, terms = (load(n) for n in
                                                       ("areas", "spots", "objects", "terrains", "periods", "terms"))
    by_label = {p["label"]: p for p in periods}
    layers = []
    for label, en, color in LAYERS:
        p = by_label[label]
        layers.append(dict(key=p["code"] or label, label=label, label_en=en, uri=p["uri"], code=p["code"],
                           begin=p["begin"], end=p["end"], color=color))

    def layer_bits(o) -> list[int]:
        lo, hi = o["begin"], o["end"]
        if lo is None:
            p = by_label.get(o["beginLabel"]), by_label.get(o["endLabel"] or o["beginLabel"])
            if not p[0]:
                return []
            lo, hi = p[0]["begin"], (p[1] or p[0])["end"]
        hi = lo if hi is None else hi
        # periods touching only at a boundary year (ending in 1945, Recent starting in 1945) do not overlap
        bits = [i for i, L in enumerate(layers) if L["begin"] <= hi and L["end"] >= lo
                and not (lo < hi and (hi == L["begin"] or lo == L["end"]))]
        return bits if 0 < len(bits) <= SPREAD_MAX else []

    per_area = defaultdict(list)
    for o in objects:
        per_area[o["area"]].append(o)
    spots_of = defaultdict(list)
    for s in spots:
        spots_of[s["area"]].append(s)

    rings, out_areas, nr_of = [], [], {}
    for a in areas:
        polys = local_polys(a["wkt"])
        objs = per_area.get(a["id"], [])
        mask = 0
        for o in objs:
            for b in layer_bits(o):
                mask |= 1 << b
        if not polys or not mask:
            continue  # nothing dated found here: no layer to draw it in
        first = len(rings)
        rings += polys
        count = Counter(o["kind"] for o in objs)
        top = lambda kind, key, uri: [[l, u, n] for (l, u), n in Counter(
            (o[key], o[uri]) for o in objs if o["kind"] == kind and o[key]).most_common(TOP)]
        names = [s["name"] for s in spots_of[a["id"]] if s["name"]]
        nr_of[a["id"]] = len(out_areas)
        out_areas.append(dict(
            nr=a["nr"], cho=a["id"], poly=[first, len(polys)], mask=mask,
            name=short_name(names, a["nr"]),
            spots=[dict(name=s["name"], cho=s["id"], how=s["how"]) for s in spots_of[a["id"]]][:12],
            counts=dict(complexes=count["archeologischcomplex"], features=count["grondsporen"], finds=count["vondsten"],
                        objects=sum(o["n"] or 1 for o in objs if o["kind"] == "vondsten")),
            complexes=top("archeologischcomplex", "type", "typeUri"), features=top("grondsporen", "type", "typeUri"),
            finds=top("vondsten", "type", "typeUri"), materials=top("vondsten", "material", "materialUri"),
            registered=(a["registered"] or "")[:4]))
    for i, L in enumerate(layers):
        L["count"] = sum(bool(a["mask"] >> i & 1) for a in out_areas)

    t_rings, out_terrains = [], []
    for t in terrains:
        polys = local_polys(t["wkt"])
        if polys:
            out_terrains.append(dict(nr=t["nr"], cho=t["id"], name=t["name"], txt=t["txt"][:600],
                                     poly=[len(t_rings), len(polys)]))
            t_rings += polys

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "areas.bin").write_bytes(pack(rings))
    if t_rings:
        (OUT / "terrains.bin").write_bytes(pack(t_rings))
    (OUT / "areas.json").write_text(json.dumps(dict(layers=layers, areas=out_areas, terrains=out_terrains),
                                               ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(out_areas), "of", len(areas), "areas with dated finds,", len(rings), "polygons;",
          {L["label"]: L["count"] for L in layers})

    reps = reports(layers)
    if reps:
        (OUT / "reports.json").write_text(json.dumps(dict(url=CFG["dans"]["url"], reports=reps), ensure_ascii=False,
                                                     separators=(",", ":")), encoding="utf-8")
        print(len(reps), "DANS reports in the archaeology mode,", sum(1 for r in reps if r["m"]), "dated")

    # ---------- the graph: Referentienetwerk terms linked to the areas they occur in ----------
    nodes, links = {}, defaultdict(lambda: defaultdict(Counter))
    for i, L in enumerate(layers):
        nodes[L["uri"]] = dict(id=L["uri"], type="event", label=L["label_en"], label_nl=L["label"],
                               years=f"{fmt_year(L['begin'])}–{fmt_year(L['end'])}", desc=f"ABR {L['code']}", url=L["uri"])
    kind_type = {"archeologischcomplex": "person", "grondsporen": "architect"}
    rich = {a["cho"] for a in out_areas
            if a["counts"]["complexes"] + a["counts"]["features"] + a["counts"]["finds"] >= GRAPH_MIN_OBJECTS}
    for o in objects:
        if o["area"] not in rich:
            continue
        place = f"a:{areas_nr(o['area'])}"
        for b in layer_bits(o):
            links[layers[b]["uri"]][place][KIND_NL[o["kind"]]] += 1
        if o["kind"] in kind_type and o["typeUri"]:
            links[o["typeUri"]][place][o["type"]] += 1
            nodes.setdefault(o["typeUri"], dict(id=o["typeUri"], type=kind_type[o["kind"]], label=o["type"],
                                                label_nl=o["type"], desc=KIND_NL[o["kind"]], url=o["typeUri"]))
        if o["kind"] == "vondsten" and o["materialUri"]:
            links[o["materialUri"]][place][o["material"]] += o["n"] or 1
            nodes.setdefault(o["materialUri"], dict(id=o["materialUri"], type="organisation", label=o["material"],
                                                    label_nl=o["material"], desc="materiaal", url=o["materialUri"]))
    # only terms found in at least three areas, so the graph stays readable
    keep = {u for u, places in links.items() if nodes.get(u, {}).get("type") == "event"
            or len(places) >= GRAPH_MIN_AREAS.get(nodes.get(u, {}).get("type"), 3)}
    places = {}
    for a in out_areas:
        pid = f"a:{a['nr']}"
        places[pid] = dict(name=a["name"], bags=[], areas=[a["nr"]], year=a["registered"] or "", photo=None, url=a["cho"])
    out_links = []
    for u in keep:
        for pid, c in links[u].items():
            text = ", ".join(f"{n}× {l}" for l, n in c.most_common(4))
            out_links.append(dict(e=u, p=pid, texts=[dict(text=text, text_nl=text)]))
    used = {l["p"] for l in out_links}
    for n in nodes.values():
        n.setdefault("years", "")
        if n["id"] in terms and terms[n["id"]].get("broaderLabel") and n["type"] != "event":
            n["desc"] = f"{n['desc']} · {terms[n['id']]['broaderLabel']}"
    graph = dict(
        mode="archeo",
        types=[dict(key="event", en="Periods (ABR)", nl="Perioden (ABR)"),
               dict(key="person", en="Archaeological complexes", nl="Archeologische complexen"),
               dict(key="architect", en="Features", nl="Grondsporen"),
               dict(key="organisation", en="Materials", nl="Materialen"),
               dict(key="place", en="Research areas", nl="Onderzoeksgebieden")],
        intro=dict(title="Under the city: periods, archaeological complexes and finds",
                   title_nl="Onder de stad: perioden, archeologische complexen en vondsten",
                   lede=("Every point is a term of the Referentienetwerk (ABR); every square a research area. Pick one or "
                         "more points, then open them on the map, under the ground."),
                   lede_nl=("Elk punt is een begrip uit het Referentienetwerk (ABR); elk vierkantje een onderzoeksgebied. "
                            "Kies een of meer punten en open ze op de kaart, onder de grond."),
                   hint="Squares are research areas. Click a point to select it; click more to add them.",
                   hint_nl="Vierkantjes zijn onderzoeksgebieden. Klik op een punt om het te kiezen; klik op meer om ze toe te voegen."),
        nodes=[n for n in nodes.values() if n["id"] in keep and any(l["e"] == n["id"] for l in out_links)],
        places={p: v for p, v in places.items() if p in used}, links=out_links)
    (OUT / "graph.json").write_text(json.dumps(graph, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(graph["nodes"]), "terms,", len(graph["places"]), "areas,", len(out_links), "links in the graph")


def short_name(names: list[str], nr: str, limit: int = 48) -> str:
    """An area's name for labels: its first find spot's name, '(+n)' when it has more, at most `limit` characters.
    One large survey (Knooppunt Hoevelaken) holds dozens of spots; all their names together would fill a screen."""
    names = list(dict.fromkeys(names))
    if not names:
        return f"Onderzoeksgebied {nr}"
    first = names[0] if len(names[0]) <= limit else names[0][:limit - 1].rsplit(" ", 1)[0] + "…"
    return first + (f" (+{len(names) - 1})" if len(names) > 1 else "")


def fmt_year(y: int) -> str:
    return f"{-y} v.Chr." if y < 0 else str(y)


_NR = {}


def areas_nr(area_id: str) -> str:
    return _NR.setdefault(area_id, area_id.rsplit("/", 1)[1])


if __name__ == "__main__":
    main()
