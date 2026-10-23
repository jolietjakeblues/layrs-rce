"""The graph (web/data/<city>/graph.json): the monuments with who made them, for whom, and in what style.

The monument register is the evidence: every rijksmonument names who made it and for whom (ceo:ActorEnRol, fetched
by s00_fetch_rce), and its style. Three kinds of point:
  makers   architects, garden architects, sculptors, engineers, builders  (type "architect")
  clients  the opdrachtgevers: councils, ministries, congregations, housing societies, private people  ("organisation")
  styles   the register's architecture styles with at least STYLE_MIN monuments  ("event", relabelled)
  complexes  monuments the register lists together, with at least two in the graph  ("person", relabelled)
Architects on Wikidata (P84 on the monuments' items, s00_fetch_wikidata) lend a maker of the same name their full name,
life and article, or join as makers of their own. Places are the monuments, each with the BAG panden it stands on; a
link's text quotes its source.
"""
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import geopandas as gpd
import pandas as pd

from .city import DATA, THEME, WEB
from .s03_tiles import ORIGIN

STYLE_MIN = 3
REGISTER = "https://monumentenregister.cultureelerfgoed.nl/monumenten/"
ROLES = {  # the register's role → (English, Dutch)
    "architect / bouwkundige / constructeur": ("architect", "architect"),
    "tuinarchitect / landschapsarchitect": ("garden architect", "tuinarchitect"),
    "beeldhouwer / steenhouwer / schrijnwerker": ("sculptor", "beeldhouwer"),
    "aannemer / uitvoerder": ("builder", "aannemer"),
    "ingenieur": ("engineer", "ingenieur"),
    "glazenier": ("stained-glass artist", "glazenier"),
    "keramist / plateelbakker / tegelbakker": ("ceramicist", "keramist"),
    "opdrachtgever": ("client", "opdrachtgever"),
}
TYPES = [dict(key="architect", en="Makers", nl="Makers"), dict(key="organisation", en="Clients", nl="Opdrachtgevers"),
         dict(key="person", en="Complexes", nl="Complexen"), dict(key="event", en="Styles", nl="Bouwstijlen"),
         dict(key="place", en="Buildings", nl="Gebouwen")]
TITLES = {"mr", "ir", "dr", "prof", "jhr", "ing"}


def person_key(name: str):
    """(surname, first initial) of a person's name, to match 'A.J.N. Boosten' with 'Alphons Boosten'."""
    words = [w for w in re.findall(r"[^\W\d_]+", name.lower()) if w not in TITLES]
    return (words[-1], words[0][0]) if len(words) >= 2 else None


def display(name: str) -> str:
    """'Wamelen, A.H. van ; Stad Amersfoort' → 'A.H. van Wamelen'; an organisation keeps its name."""
    base = name.split(" ; ")[0].strip()
    if "," in base:
        last, first = (s.strip() for s in base.split(",", 1))
        return f"{first} {last}"
    return base


def addresses(gid_bags: set) -> dict:
    """The main address of each pand: the lowest number on the street with most of its addresses (as s15)."""
    per = defaultdict(set)
    for a in json.load(open(f"{DATA}/raw/addresses.json", encoding="utf-8")):
        if a["pandidentificatie"] in gid_bags and a["openbare_ruimte"]:
            per[a["pandidentificatie"]].add((a["openbare_ruimte"], a["huisnummer"], a["huisletter"] or ""))
    out = {}
    for bag, addrs in per.items():
        street = Counter(s for s, _, _ in addrs).most_common(1)[0][0]
        n, letter = min((n, l) for s, n, l in addrs if s == street)
        out[bag] = f"{street} {n}{letter}"
    return out


def main():
    b = gpd.read_parquet(f"{DATA}/buildings.parquet", columns=["identificatie", "year", "geometry"])
    b["bag"] = b.identificatie.str.slice(-16)
    c = b.geometry.centroid
    where = {k: (round(x - ORIGIN[0], 1), round(-(y - ORIGIN[1]), 1), int(yr))
             for k, x, y, yr in zip(b.bag, c.x, c.y, b.year)}
    mons = {m["nr"]: m for m in json.load(open(f"{DATA}/raw/layers/monuments.json", encoding="utf-8"))}
    bags_of = {nr: [p for p in m["panden"] if p in where] for nr, m in mons.items()}
    # a fact's source: the monument's record in the Linked Data Voorziening, else its entry in the register
    ldv = lambda nr: mons[nr].get("cho") or REGISTER + nr
    addr = addresses({p for ps in bags_of.values() for p in ps})
    wiki = json.load(open(f"{WEB}/wiki.json", encoding="utf-8"))
    wk = pd.read_parquet(f"{DATA}/wiki_index.parquet").set_index("bag").wk

    # (point id, monument nr, English text, Dutch text)
    raw, nodes = [], {}
    roles_of = defaultdict(Counter)
    for a in json.load(open(f"{DATA}/raw/layers/rce_actors.json", encoding="utf-8")):
        if not bags_of.get(a["nr"]):
            continue
        en, nl = ROLES.get(a["role"] or "", (a["role"] or "maker", a["role"] or "maker"))
        aid = "rce:" + a["actor"].rsplit("/", 1)[1]
        who = display(a["name"])
        roles_of[aid][en] += 1
        nodes.setdefault(aid, dict(id=aid, label=who, label_nl=who, roles_nl=Counter()))["roles_nl"][nl] += 1
        raw.append((aid, a["nr"], f"The monument register names {who} as {en}.",
                    f"Het monumentenregister noemt {who} als {nl}.", ldv(a["nr"])))
    for aid, n in nodes.items():
        top = roles_of[aid].most_common(1)[0][0]
        n["type"] = "organisation" if top == "client" and not THEME else "architect"
        n["desc"] = ", ".join(r for r, _ in roles_of[aid].most_common())
        n.pop("roles_nl")

    # A theme's facets (layers.theme_facet) take the place of the styles: the types of mill and what they did,
    # each a term of the Referentienetwerk, linked to the monuments the layer sorts under it.
    if THEME:
        from .layers import LAYERS
        terms = json.load(open(f"{DATA}/raw/theme/terms.json", encoding="utf-8"))
        uri_of = {label.lower(): u for u, label in terms.items()}
        nr_of = {q: nr for nr, qs in bags_of.items() for q in qs}
        for facet, kind in zip(THEME["facets"], ("event", "organisation")):
            L = next(L for L in LAYERS if L["id"] == f"theme-{facet['id']}")
            got = defaultdict(set)
            for q, v in L["source_fn"]().items():
                if q in nr_of:
                    got[v[0] if isinstance(v, tuple) else v].add(nr_of[q])
            for k, en, nl, term, _ in facet["groups"]:
                if not got.get(k):
                    continue
                fid = f"facet:{facet['id']}:{k}"
                nodes[fid] = dict(id=fid, type=kind, label=en, label_nl=nl, desc=facet["title_nl"].lower(),
                                  url=uri_of.get(term.lower()))
                raw += [(fid, nr, f"{facet['title']}: {en}.", f"{facet['title_nl']}: {nl}.", ldv(nr)) for nr in got[k]]

    styles = defaultdict(set)
    for r in json.load(open(f"{DATA}/raw/layers/rce_styles.json", encoding="utf-8")) if not THEME else []:
        if bags_of.get(r["nr"]):
            styles[r["style"]].add(r["nr"])
    for style, nrs in styles.items():
        if len(nrs) < STYLE_MIN:
            continue
        sid = "style:" + "".join(ch for ch in style.lower() if ch.isalnum())
        nodes[sid] = dict(id=sid, type="event", label=style, label_nl=style, desc="style")
        raw += [(sid, nr, f"The monument register gives its style as {style}.",
                 f"Het monumentenregister noemt als stijl {style}.", ldv(nr)) for nr in nrs]

    # Complexes: monuments registered together, as one point linked to each of its monuments
    f = Path(f"{DATA}/raw/layers/complexes.json")
    cx = {c["id"]: c for c in json.load(open(f, encoding="utf-8"))} if f.exists() else {}
    members = defaultdict(list)
    for nr, m in mons.items():
        if m.get("complex") in cx and bags_of.get(nr):
            members[m["complex"]].append(nr)
    for cid, nrs in members.items():
        if len(nrs) < 2:
            continue
        c = cx[cid]
        name = c["name"] or f"Complex {c['nr']}"
        xid = "cx:" + c["nr"]
        nodes[xid] = dict(id=xid, type="person", label=name, label_nl=name,
                          desc="country estate" if c["estate"] else "complex", url=c["url"])
        raw += [(xid, nr, f"Part of the complex {name} in the monument register.",
                 f"Onderdeel van het complex {name} in het monumentenregister.", c["id"]) for nr in nrs]

    # Architects on Wikidata: a maker of the same name gets their full name, life and article; others join
    f = Path(f"{DATA}/raw/wd_architects.csv")
    makers = {person_key(n["label"]): k for k, n in nodes.items() if n.get("type") == "architect" and person_key(n["label"])}
    for r in csv.DictReader(open(f, encoding="utf-8")) if f.exists() else []:
        if not bags_of.get(r["nr"]):
            continue
        aid = makers.get(person_key(r["label"])) or "wd:" + r["a"].rsplit("/", 1)[1]
        n = nodes.setdefault(aid, dict(id=aid, type="architect", desc="architect"))
        n.update(label=r["label"], label_nl=r["label"], url=r["nl"] or r["a"])
        if r["born"]:
            n["years"] = f"{r['born']}–{r['died']}" if r["died"] else f"{r['born']}–"
        if not any(x[0] == aid and x[1] == r["nr"] for x in raw):
            raw.append((aid, r["nr"], f"Wikidata names {r['label']} as its architect.",
                        f"Wikidata noemt {r['label']} als architect.", r["nl"] or r["a"]))

    places = {}
    for nr in sorted({x[1] for x in raw}, key=int):
        bags = bags_of[nr]
        m = mons[nr]
        photo = next(((wiki[wk[p]].get("image") or {}).get("thumb") for p in bags if p in wk.index
                      and (wiki[wk[p]].get("image") or {}).get("thumb")), None)
        places[f"p:rm-{nr}"] = dict(
            name=m.get("name") or next((addr[p] for p in bags if p in addr), f"Rijksmonument {nr}"),
            bags=bags, year=min(where[p][2] for p in bags), photo=photo,
            x=round(sum(where[p][0] for p in bags) / len(bags), 1), z=round(sum(where[p][1] for p in bags) / len(bags), 1))

    links = {}
    for pid, nr, en, nl, src in raw:
        l = links.setdefault((pid, nr), dict(e=pid, p=f"p:rm-{nr}", texts=[]))
        t = dict(text=en, text_nl=nl, source=src, via="Wikidata" if "wiki" in src else "Linked Data Voorziening")
        if t not in l["texts"]:
            l["texts"].append(t)
    # a point's years: a person's life where Wikidata gives it, else the span of the buildings it is linked to
    span = defaultdict(list)
    for l in links.values():
        span[l["e"]].append(places[l["p"]]["year"])
    for n in nodes.values():
        if n.get("years"):
            continue
        lo, hi = min(span[n["id"]]), max(span[n["id"]])
        n["years"] = str(lo) if lo == hi else f"{lo}–{hi}"

    types = TYPES if not THEME else [
        dict(key="event", en="Types of mill", nl="Bouwtypen"), dict(key="organisation", en="What they did", nl="Functies"),
        dict(key="person", en="Complexes", nl="Complexen"), dict(key="architect", en="Makers and clients", nl="Makers en opdrachtgevers"),
        dict(key="place", en="Mills", nl="Molens")]
    out = dict(
        types=types,
        intro=dict(title="Makers, clients, complexes and styles of the monuments" if not THEME else "Types of mill, what they did, complexes",
                   title_nl="Makers, opdrachtgevers, complexen en stijlen van de monumenten" if not THEME else "Bouwtypen, functies en complexen van de molens",
                   lede=("Every line is an entry in the national monument register or on Wikidata. Pick one or more points, "
                         "then open them on the map."),
                   lede_nl=("Elke lijn is een vermelding in het rijksmonumentenregister of op Wikidata. Kies een of meer "
                            "punten en open ze op de kaart.")),
        nodes=list(nodes.values()), places=places, links=list(links.values()))
    Path(f"{WEB}/graph.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    deg = Counter(l["e"] for l in links.values())
    print(len(nodes), "points,", len(places), "monuments,", sum(len(p["bags"]) for p in places.values()), "buildings,",
          len(links), "links")
    print([(nodes[k]["label"], v) for k, v in deg.most_common(12)])


if __name__ == "__main__":
    main()
