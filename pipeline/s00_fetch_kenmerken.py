"""Fetch the building history of a city's national monuments from the RCE Kennisbank (kennis.cultureelerfgoed.nl).

Next to the monument's page (Monumenten/<nr>, s00_fetch_kennisbank) the Kennisbank holds its characteristics as data
(Monumentkenmerken/<nr>): every building activity with a kind (vervaardiging, verbouwing, restauratie, ...), a first
and a last year, how exact the dates are, and now and then a note ("poortgebouw en koffiekamer"). The first activity,
the vervaardiging, is the monument's own date; it agrees with the register's building years wherever both have one,
and gives the date where the register has none. The wiki's API lists the page titles to anyone, a page's source comes
from index.php?action=raw, one request every 0.4 seconds, only for the city's monuments. The RCE names the Kennisbank
CC0 on its copyright page (see s00_fetch_kennisbank); the card names the Kennisbank as the source.
  raw/layers/kenmerken.json   [{nr, kb, works: [{kind, from, to, exact, note}]}]
kb is the monument's page in the Kennisbank (null where it has none), works its activities in the order of the page.
"""
import json
import re
import time
from pathlib import Path

import requests

from .city import DATA, UA
from .s00_fetch_gemeentelijk import clean
from .s00_fetch_kennisbank import PAGE, SITE, titles

OUT = Path(f"{DATA}/raw/layers/kenmerken.json")
ACTIVITY = re.compile(r"\{\{#elementsubobject:HeeftBouwactiviteit(.*?)\}\}", re.S)


def year(s: str) -> int | None:
    """'1976-01-01' or '1976' → 1976."""
    return int(s[:4]) if re.match(r"\d{4}", s or "") else None


def activities(wt: str) -> list[dict]:
    out = []
    for blk in ACTIVITY.findall(wt):
        f = {k: (re.search(r"\|" + k + r"=([^\n|]*)", blk) or [None, ""])[1].strip()
             for k in ("Werkzaamheid", "BeginDatering", "EindDatering", "Nauwkeurigheid", "ToelichtingBouwactiviteit")}
        begin = year(f["BeginDatering"])
        if not begin:
            continue
        out.append(dict(kind=f["Werkzaamheid"], **{"from": begin}, to=year(f["EindDatering"]) or begin,
                        exact=f["Nauwkeurigheid"] == "exact", note=clean(f["ToelichtingBouwactiviteit"])))
    return out


def main():
    mine = {str(m["nr"]) for m in json.load(open(f"{DATA}/raw/layers/monuments.json", encoding="utf-8"))}
    page, kenmerken = titles(), titles("Monumentkenmerken/")
    have = sorted(mine & kenmerken, key=int)
    print(len(have), "of", len(mine), "monuments have a page of characteristics;", len(mine & page), "have a page")
    works = {}
    for nr in have:
        r = requests.get(f"{SITE}/index.php", params={"title": f"Monumentkenmerken/{nr}", "action": "raw"}, headers=UA, timeout=60)
        time.sleep(0.4)
        if r.ok:
            works[nr] = activities(r.text)
    out = [dict(nr=nr, kb=PAGE.format(nr=nr) if nr in page else None, works=works.get(nr, []))
           for nr in sorted((mine & page) | set(works), key=int)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    later = [w for r in out for w in r["works"] if w["kind"] != "vervaardiging"]
    print(len(out), "monuments;", sum(1 for r in out if r["works"]), "with activities;", len(later), "later works,",
          sum(1 for w in later if w["note"]), "with a note")


if __name__ == "__main__":
    main()
