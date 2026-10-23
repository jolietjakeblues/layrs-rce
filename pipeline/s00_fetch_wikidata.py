"""Buildings and monuments of the city on Wikidata (CC0): the inputs of s06_wiki and the graph.

Two ways in: items with a BAG pand id (P5208) starting with the municipality's code, and items with the rijksmonument
number (P359) of one of the city's monuments (s00_fetch_rce). The second finds far more, since most monuments carry
their number and a photo from Wiki Loves Monuments but no pand id; they reach their buildings through the register.

raw/wd_buildings.csv  i, bag, labelEn, labelNl, en, nl, image, architects, styles (| separated): names, articles
                      and photos for the building cards
raw/wd_monuments.csv  nr, bag, inception, label: rijksmonuments with their pand, for monuments.py
raw/wd_architects.csv nr, a, label, born, died, nl: the architects (P84) of the monuments, for the graph
raw/wd_kinds.json     {nr: [what the item is an instance of (P31), Dutch labels]}: 'grondzeiler', 'korenmolen', ...
A theme (no gemeentecode) is found by number only; it runs after s01b_theme_panden, which gives its monuments panden.
"""
import csv
import json
import time
from pathlib import Path

import requests

from .city import DATA, GEMEENTE_CODE, UA

WDQS = "https://query.wikidata.org/sparql"
BATCH = 250

BUILDINGS = """SELECT ?i ?bag ?labelEn ?labelNl ?en ?nl (SAMPLE(?img) AS ?image)
  (GROUP_CONCAT(DISTINCT ?archL; separator="|") AS ?architects) (GROUP_CONCAT(DISTINCT ?styleL; separator="|") AS ?styles)
WHERE {
  ?i wdt:P5208 ?bag . FILTER(STRSTARTS(?bag, "%(code)s"))
  OPTIONAL { ?i rdfs:label ?labelEn FILTER(LANG(?labelEn) = "en") }
  OPTIONAL { ?i rdfs:label ?labelNl FILTER(LANG(?labelNl) = "nl") }
  OPTIONAL { ?en schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?nl schema:about ?i ; schema:isPartOf <https://nl.wikipedia.org/> }
  OPTIONAL { ?i wdt:P18 ?img }
  OPTIONAL { ?i wdt:P84 ?a . ?a rdfs:label ?archL FILTER(LANG(?archL) = "nl") }
  OPTIONAL { ?i wdt:P149 ?s . ?s rdfs:label ?styleL FILTER(LANG(?styleL) = "nl") }
} GROUP BY ?i ?bag ?labelEn ?labelNl ?en ?nl"""

MONUMENTS = """SELECT ?nr ?bag (MIN(?inc) AS ?inception) (SAMPLE(?l) AS ?label) WHERE {
  ?i wdt:P359 ?nr ; wdt:P5208 ?bag . FILTER(STRSTARTS(?bag, "%(code)s"))
  OPTIONAL { ?i wdt:P571 ?inc }
  OPTIONAL { ?i rdfs:label ?l FILTER(LANG(?l) = "nl") }
} GROUP BY ?nr ?bag"""

BY_NUMBER = """SELECT ?i ?nr ?labelEn ?labelNl ?en ?nl (SAMPLE(?img) AS ?image)
  (GROUP_CONCAT(DISTINCT ?archL; separator="|") AS ?architects) (GROUP_CONCAT(DISTINCT ?styleL; separator="|") AS ?styles)
  (GROUP_CONCAT(DISTINCT ?kindL; separator="|") AS ?kinds)
WHERE {
  VALUES ?nr { %(values)s }
  ?i wdt:P359 ?nr .
  OPTIONAL { ?i rdfs:label ?labelEn FILTER(LANG(?labelEn) = "en") }
  OPTIONAL { ?i rdfs:label ?labelNl FILTER(LANG(?labelNl) = "nl") }
  OPTIONAL { ?en schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?nl schema:about ?i ; schema:isPartOf <https://nl.wikipedia.org/> }
  OPTIONAL { ?i wdt:P18 ?img }
  OPTIONAL { ?i wdt:P84 ?a . ?a rdfs:label ?archL FILTER(LANG(?archL) = "nl") }
  OPTIONAL { ?i wdt:P149 ?s . ?s rdfs:label ?styleL FILTER(LANG(?styleL) = "nl") }
  OPTIONAL { ?i wdt:P31 ?k . ?k rdfs:label ?kindL FILTER(LANG(?kindL) = "nl") }
} GROUP BY ?i ?nr ?labelEn ?labelNl ?en ?nl"""

ARCHITECTS = """SELECT DISTINCT ?nr ?a ?label (YEAR(?b) AS ?born) (YEAR(?d) AS ?died) ?nl WHERE {
  VALUES ?nr { %(values)s }
  ?i wdt:P359 ?nr ; wdt:P84 ?a .
  ?a rdfs:label ?label FILTER(LANG(?label) = "nl")
  OPTIONAL { ?a wdt:P569 ?b } OPTIONAL { ?a wdt:P570 ?d }
  OPTIONAL { ?nl schema:about ?a ; schema:isPartOf <https://nl.wikipedia.org/> }
}"""


def query(q: str, **args) -> list[dict]:
    for attempt in range(5):
        r = requests.post(WDQS, data={"query": q % {"code": GEMEENTE_CODE, **args}}, timeout=300,
                          headers={"Accept": "application/sparql-results+json", **UA})
        if r.ok:
            return [{k: v["value"] for k, v in b.items()} for b in r.json()["results"]["bindings"]]
        time.sleep(10 * (attempt + 1))
    r.raise_for_status()


def by_number(q: str, nrs: list[str]) -> list[dict]:
    rows = []
    for i in range(0, len(nrs), BATCH):
        rows += query(q, values=" ".join(f'"{n}"' for n in nrs[i:i + BATCH]))
    return rows


def write(name: str, rows: list[dict], cols: list[str]):
    with open(f"{DATA}/raw/{name}", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, cols)
        w.writeheader()
        w.writerows({c: r.get(c, "") for c in cols} for r in rows)
    print(name, len(rows))


def main():
    mons = json.load(open(f"{DATA}/raw/layers/monuments.json", encoding="utf-8"))
    panden = {m["nr"]: m["panden"] for m in mons}
    rows = query(BUILDINGS) if GEMEENTE_CODE else []
    seen = {(r["i"], r["bag"]) for r in rows}
    found = by_number(BY_NUMBER, sorted(panden))
    for r in found:  # one row per building of the monument, as the pand query gives them
        for bag in panden.get(r["nr"], ()):
            if (r["i"], bag) not in seen:
                seen.add((r["i"], bag))
                rows.append(dict(r, bag=bag))
    print(len({r["nr"] for r in found}), "monuments found on Wikidata by their number,",
          sum(bool(r.get("image")) for r in found), "with a photo,", sum(bool(r.get("nl")) for r in found),
          "with a Dutch article")
    write("wd_buildings.csv", rows, ["i", "bag", "labelEn", "labelNl", "en", "nl", "image", "architects", "styles"])
    write("wd_monuments.csv", query(MONUMENTS) if GEMEENTE_CODE else [], ["nr", "bag", "inception", "label"])
    kinds = {}
    for r in found:
        kinds.setdefault(r["nr"], set()).update(k for k in (r.get("kinds") or "").split("|") if k)
    Path(f"{DATA}/raw/wd_kinds.json").write_text(json.dumps({k: sorted(v) for k, v in kinds.items()}, ensure_ascii=False),
                                                 encoding="utf-8")
    write("wd_architects.csv", by_number(ARCHITECTS, sorted(panden)), ["nr", "a", "label", "born", "died", "nl"])


if __name__ == "__main__":
    main()
