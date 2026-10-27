"""Fetch the municipal monuments (gemeentelijke monumenten) of a city from Wikipedia's lists (CC BY-SA).

The municipality's own register is not open data; Wikipedia's volunteers keep a list with the municipality's monument
number, the object, the year, the architect, the address and a coordinate. The list may be split per district; the
config names the pages: "gemeentelijke_monumenten": {"pages": [title, ...], "url": list_url}.
  raw/layers/gemeentelijk.json   [{nr, object, year, architect, address, postcode, lat, lon, wd, image, district}]
"""
import json
import re
from pathlib import Path

import requests

from .city import CFG, DATA, UA

OUT = Path(f"{DATA}/raw/layers/gemeentelijk.json")
API = "https://nl.wikipedia.org/w/api.php"


def split_top(s: str) -> list[str]:
    """Split at the '|' that are not inside [[links]] or {{templates}}."""
    parts, depth, cur, i = [], 0, "", 0
    while i < len(s):
        two = s[i:i + 2]
        if two in ("[[", "{{"):
            depth += 1
            cur += two
            i += 2
        elif two in ("]]", "}}"):
            depth -= 1
            cur += two
            i += 2
        elif s[i] == "|" and depth == 0:
            parts.append(cur)
            cur, i = "", i + 1
        else:
            cur += s[i]
            i += 1
    return parts + [cur]


def clean(v: str) -> str:
    v = re.sub(r"<!--.*?-->|<ref.*?</ref>|<ref[^>]*/>", "", v, flags=re.S)
    v = re.sub(r"\{\{Sorteer\|[^|}]*\|([^}]*)\}\}", r"\1", v, flags=re.I)  # {{Sorteer|1904|gevel 1904}} → gevel 1904
    v = re.sub(r"\{\{[^{}]*\}\}", "", v)
    v = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"'{2,}|<[^>]+>", "", v)
    return " ".join(v.split())


def rows(wikitext: str, district_default: str | None):
    district = district_default
    for line in wikitext.splitlines():
        m = re.match(r"==\s*([^=]+?)\s*==\s*$", line)
        if m:
            district = clean(m.group(1))
        if not line.startswith("{{Tabelrij gemeentelijk monument"):
            continue
        body = line.strip()[2:-2]
        fields = {}
        for part in split_top(body)[1:]:
            k, _, v = part.partition("=")
            fields[k.strip()] = v
        f = {k: clean(v) for k, v in fields.items()}
        if not f.get("objnr"):
            continue
        yield dict(nr=f["objnr"], object=f.get("object", ""), year=f.get("bouwjaar", ""), architect=f.get("architect", ""),
                   address=f.get("adres", ""), postcode=f.get("postcode", ""),
                   lat=float(f["lat"]) if f.get("lat") else None, lon=float(f["lon"]) if f.get("lon") else None,
                   wd=f.get("wd_item", ""), image=f.get("image", ""), district=district)


def main():
    cfg = CFG.get("gemeentelijke_monumenten")
    if not cfg:
        print("no gemeentelijke_monumenten in the config: skipped")
        return
    out, seen = [], set()
    for title, district in cfg["pages"]:
        r = requests.get(API, params=dict(action="parse", page=title, prop="wikitext", format="json", redirects=1),
                         headers=UA, timeout=60)
        r.raise_for_status()
        n = 0
        for row in rows(r.json()["parse"]["wikitext"]["*"], district):
            if row["nr"] in seen:
                continue
            seen.add(row["nr"])
            out.append(row)
            n += 1
        print(f"{title}: {n}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(len(out), "gemeentelijke monumenten")


if __name__ == "__main__":
    main()
