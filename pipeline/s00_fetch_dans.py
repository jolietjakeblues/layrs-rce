"""Fetch the archaeological reports of a city from the DANS Data Station Archaeology (Dataverse API).

The station holds the municipality's excavation and survey reports (for Dordrecht: Dordrecht Ondergronds). The config
names the search: "dans": {"q": "Dordrecht", "url": search_url}. Every dataset has a DOI and, mostly, a coordinate in RD,
ABR periods and an Archis number.
  raw/layers/dans.json   [{doi, title, alt, authors, year, desc, x, y, place, periods, periodLabels, archis, files}]
"""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from .city import CFG, DATA, UA

OUT = Path(f"{DATA}/raw/layers/dans.json")
BASE = "https://archaeology.datastations.nl/api"


def get(url, **params):
    for attempt in range(5):
        r = requests.get(url, params=params, headers=UA, timeout=60)
        if r.ok:
            return r.json()
        time.sleep(2 ** attempt)
    r.raise_for_status()


def text(html: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", html or "").split())


def search(q: str) -> list[dict]:
    items, start = [], 0
    while True:
        d = get(f"{BASE}/search", q=q, type="dataset", per_page=100, start=start)["data"]
        items += d["items"]
        start += 100
        if start >= d["total_count"]:
            return items


def fields(blocks: dict) -> dict:
    return {f["typeName"]: f["value"] for b in blocks.values() for f in b["fields"]}


def one(item: dict) -> dict:
    f = fields(get(f"{BASE}/datasets/:persistentId/", persistentId=item["global_id"])["data"]["latestVersion"]["metadataBlocks"])
    pt = (f.get("dansSpatialPoint") or [{}])[0]
    cell = lambda k: (pt.get(k) or {}).get("value")
    desc = " ".join(text(d["dsDescriptionValue"]["value"]) for d in f.get("dsDescription", []))
    return dict(doi=item["url"], title=item["name"], alt=(f.get("alternativeTitle") or [""])[0],
                authors=[a["authorName"]["value"] for a in f.get("author", [])],
                year=(item.get("published_at") or "")[:4], date=f.get("productionDate"),
                desc=desc, x=float(cell("dansSpatialPointX")) if cell("dansSpatialPointX") else None,
                y=float(cell("dansSpatialPointY")) if cell("dansSpatialPointY") else None,
                scheme=cell("dansSpatialPointScheme"), place=f.get("dansSpatialCoverageText") or [],
                periods=f.get("dansAbrPeriod") or [], complex=f.get("dansAbrComplex") or [],
                archis=[a.get("dansArchisNumberValue", {}).get("value") for a in f.get("dansArchisNumber", [])],
                keywords=[k["keywordValue"]["value"] for k in f.get("keyword", [])], files=item.get("fileCount"))


ABR1 = "https://data.cultureelerfgoed.nl/PoolParty/sparql/abr"  # ABR version 1 (deprecated), the one DANS still cites


def period_labels(uris: list[str]) -> dict[str, str]:
    """{ABR 1 period URI: its Dutch label} ("Late Middeleeuwen A", "Nieuwe Tijd Vroeg")."""
    out = {}
    for i in range(0, len(uris), 100):
        values = " ".join(f"<{u}>" for u in uris[i:i + 100])
        q = ("PREFIX skos: <http://www.w3.org/2004/02/skos/core#> SELECT ?c ?l WHERE { VALUES ?c { " + values +
             " } ?c skos:prefLabel ?l . FILTER(lang(?l) = 'nl') }")
        r = requests.post(ABR1, data={"query": q}, headers={**UA, "Accept": "application/sparql-results+json"}, timeout=60)
        r.raise_for_status()
        out |= {b["c"]["value"]: b["l"]["value"] for b in r.json()["results"]["bindings"]}
    return out


def main():
    cfg = CFG.get("dans")
    if not cfg:
        print("no dans in the config: skipped")
        return
    items = search(cfg["q"])
    print(len(items), "datasets for", cfg["q"])
    with ThreadPoolExecutor(6) as ex:
        out = list(ex.map(one, items))
    labels = period_labels(sorted({u for r in out for u in r["periods"]}))
    for r in out:
        r["periodLabels"] = [labels[u] for u in r["periods"] if u in labels]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(sum(1 for r in out if r["x"]), "with a coordinate")


if __name__ == "__main__":
    main()
