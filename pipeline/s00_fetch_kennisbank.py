"""Fetch the monument pages of the RCE Kennisbank (kennis.cultureelerfgoed.nl) for a city's national monuments.

The Kennisbank is a MediaWiki of the RCE with a page for some of the national monuments (Monumenten/<monument number>):
a short introduction, features, and for some a full article. The wiki's API lists the page titles to anyone; a page's
source comes from index.php?action=raw. Only the pages of the city's monuments are fetched, one request every half second.
The texts fall under the RCE's copyright page: re-use under CC0 with the RCE named as the source; photos with a (c) sign
and third-party content are not covered, so no photo is taken from the pages.
  raw/layers/kennisbank.json   [{nr, name, address, place, intro, features, text, author, batch, wkt}]
"""
import json
import re
import time
from pathlib import Path

import requests

from . import rce
from .city import CFG, DATA, UA
from .s00_fetch_gemeentelijk import clean, split_top

OUT = Path(f"{DATA}/raw/layers/kennisbank.json")
SITE = "https://kennis.cultureelerfgoed.nl"
PAGE = SITE + "/index.php/Monumenten/{nr}"


def titles() -> set[str]:
    out, cont = set(), None
    while True:
        p = {"action": "query", "list": "allpages", "apprefix": "Monumenten/", "aplimit": "500", "format": "json"}
        if cont:
            p["apcontinue"] = cont
        r = requests.get(f"{SITE}/api.php", params=p, headers=UA, timeout=60)
        r.raise_for_status()
        j = r.json()
        out |= {x["title"].split("/", 1)[1] for x in j["query"]["allpages"]}
        cont = j.get("continue", {}).get("apcontinue")
        if not cont:
            return out
        time.sleep(0.3)


def text_of(wt: str) -> str:
    """Wikitext of a page section to plain paragraphs: templates and images out, headings kept as their own line."""
    wt = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|<!--.*?-->", "", wt, flags=re.S)
    for _ in range(4):
        wt = re.sub(r"\{\{[^{}]*\}\}", "", wt)
    wt = re.sub(r"\[\[(?:Bestand|File|Afbeelding):[^\[\]]*(?:\[\[[^\]]*\]\][^\[\]]*)*\]\]", "", wt, flags=re.I)
    wt = re.sub(r"^=+\s*([^=\n]+?)\s*=+\s*$", r"\n\1.\n", wt, flags=re.M)
    wt = re.sub(r"\[https?://\S+\s*([^\]]*)\]", r"\1", wt)
    wt = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", wt)
    wt = re.sub(r"'{2,}|<[^>]+>", "", wt)
    paras = [" ".join(p.split()) for p in re.split(r"\n\s*\n", wt)]
    return "\n".join(p for p in paras if p)


def parse(nr: str, wt: str) -> dict | None:
    m = re.search(r"\{\{#element:(.*)\}\}", wt, re.S)
    if not m:
        return None
    f = {}
    for part in split_top(m.group(1)):
        k, _, v = part.partition("=")
        f[k.strip()] = v
    body = f.get("Omschrijving", "")
    author = re.search(r"Auteur:\s*([^'\n]+)", body)
    text = text_of(re.sub(r"''\s*Auteur:[^\n]*", "", body))
    return dict(nr=nr, name=clean(f.get("Naam monument", "")), address=clean(f.get("Adres", "")),
                place=clean(f.get("Plaatsnaam", "")), intro=text_of(f.get("Introductie", "")),
                features=text_of(f.get("Kenmerken", "")), text=text, author=author.group(1).strip() if author else "",
                batch=clean(f.get("Batch", "")))


def main():
    if not CFG.get("kennisbank"):
        print("no kennisbank in the config: skipped")
        return
    mine = {str(m["nr"]) for m in json.load(open(f"{DATA}/raw/layers/monuments.json", encoding="utf-8"))}
    have = sorted(mine & titles(), key=int)
    print(len(have), "of", len(mine), "monuments have a page")
    out = []
    for nr in have:
        r = requests.get(f"{SITE}/index.php", params={"title": f"Monumenten/{nr}", "action": "raw"}, headers=UA, timeout=60)
        time.sleep(0.5)
        if r.ok and (row := parse(nr, r.text)):
            out.append(row)
    # where the monument lies (WGS84 WKT, from the register's Elastic projection), for pages the BAG addresses cannot place
    wkt_key = "http://www opengis net/ont/geosparql#asWKT"
    docs = rce.elastic_all([{"term": {"@id.soort": "rijksmonument"}},
                            {"terms": {rce.F + "rijksmonumentnummer": [r["nr"] for r in out]}}], UA,
                           ["rijksmonumentnummer", wkt_key])
    where = {d[rce.F + "rijksmonumentnummer"][0]: d[wkt_key][0] for d in docs if d.get(wkt_key)}
    for r in out:
        r["wkt"] = where.get(r["nr"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(len(out), "pages;", sum(1 for r in out if r["intro"]), "with an introduction;",
          sum(1 for r in out if r["text"] and "Kennis in register" not in r["text"] and len(r["text"]) > 80), "with a text")


if __name__ == "__main__":
    main()
