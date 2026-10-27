"""Names, photos and article extracts for buildings that have a Wikidata item (P5208 BAG id).

wiki.json: list of {label, wiki: {lang, url, extract} | null, architects, styles, image: {thumb, page,
artist, license, licenseUrl} | null}. data/wiki_index.parquet maps each pand to its entry.
Photos are Wikimedia Commons files with their author and licence, as the Commons API reports them.
"""
import csv
import html
import json
import re
import time
from pathlib import Path
from urllib.parse import unquote

import pandas as pd
import requests
from . import gemeentelijk
from .city import CFG, DATA, LABEL, UA, WEB



def get_json(url, params):
    """GET with backoff: the Wikimedia APIs answer bursts with 429 and an HTML page."""
    for attempt in range(6):
        r = requests.get(url, params=params, headers=UA, timeout=60)
        if r.ok and r.headers.get("content-type", "").startswith("application/json"):
            time.sleep(0.3)
            return r.json()
        time.sleep(2 ** attempt)
    r.raise_for_status()
    raise RuntimeError(f"{url}: {r.status_code} {r.text[:200]}")


def batched(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def extracts(lang, titles):
    out = {}
    for chunk in batched(sorted(titles), 20):
        r = get_json(f"https://{lang}.wikipedia.org/w/api.php", {
            "action": "query", "format": "json", "prop": "extracts", "exintro": 1, "explaintext": 1,
            "exsentences": 3, "exlimit": 20, "redirects": 1, "titles": "|".join(chunk)})
        norm = {n["to"]: n["from"] for n in r["query"].get("normalized", []) + r["query"].get("redirects", [])}
        for p in r["query"]["pages"].values():
            t = p.get("title")
            while t in norm:
                t = norm[t]
            if p.get("extract"):
                out[t] = p["extract"].strip()
    return out


def strip_html(s):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or ""))).strip()


def artist_of(meta):
    a = strip_html(meta.get("Artist", {}).get("value"))[:80]
    if not a or re.match(r"^\d{1,2}:\d{2}|^\d{1,2} \w+ \d{4}|^\d{4}-\d{2}-\d{2}|^unknown", a, re.I):
        return None
    return a


def images(files):
    out = {}
    for chunk in batched(sorted(files), 50):
        r = get_json("https://commons.wikimedia.org/w/api.php", {
            "action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata",
            "iiurlwidth": 500, "titles": "|".join("File:" + f for f in chunk)})
        norm = {n["to"]: n["from"] for n in r["query"].get("normalized", [])}
        for p in r["query"]["pages"].values():
            ii = (p.get("imageinfo") or [None])[0]
            if not ii:
                continue
            m = ii.get("extmetadata", {})
            key = norm.get(p["title"], p["title"])[5:]
            out[key] = dict(thumb=ii.get("thumburl"), page=ii.get("descriptionurl"),
                            artist=artist_of(m),
                            license=m.get("LicenseShortName", {}).get("value"),
                            licenseUrl=m.get("LicenseUrl", {}).get("value"))
    return out


def title_of(url):
    return unquote(url.rsplit("/wiki/", 1)[1]).replace("_", " ")


def main():
    rows = list(csv.DictReader(open(f"{DATA}/raw/wd_buildings.csv")))
    items = {}
    for r in rows:
        it = items.setdefault(r["i"], dict(bags=set(), label=r["labelEn"] or r["labelNl"], label_nl=r["labelNl"] or r["labelEn"],
                                           en=r["en"], nl=r["nl"],
                                           image=None, architects=[a for a in r["architects"].split("|") if a],
                                           styles=[s for s in r["styles"].split("|") if s]))
        it["bags"].add(r["bag"].zfill(16))
        if r["image"] and not it["image"]:
            it["image"] = unquote(r["image"].rsplit("/", 1)[1]).replace("_", " ")

    ex_en = extracts("en", {title_of(i["en"]) for i in items.values() if i["en"]})
    ex_nl = extracts("nl", {title_of(i["nl"]) for i in items.values() if i["nl"]})
    imgs = images({i["image"] for i in items.values() if i["image"]})
    print(f"extracts en {len(ex_en)}, nl {len(ex_nl)}; images {len(imgs)}")

    entries, index = [], {}
    # Rank: an article first, then a photo, so a pand with two items shows the richer one.
    for it in sorted(items.values(), key=lambda i: (not (i["en"] or i["nl"]), not i["image"])):
        wiki = None
        if it["en"]:
            wiki = dict(lang="en", url=it["en"], extract=ex_en.get(title_of(it["en"])))
        elif it["nl"]:
            wiki = dict(lang="nl", url=it["nl"], extract=ex_nl.get(title_of(it["nl"])))
        img = imgs.get(it["image"]) if it["image"] else None
        if not (wiki or img):
            continue
        k = len(entries)
        wiki_nl = dict(lang="nl", url=it["nl"], extract=ex_nl.get(title_of(it["nl"]))) if it["nl"] else None
        entries.append(dict(label=it["label"], label_nl=it["label_nl"], wiki=wiki, wiki_nl=wiki_nl,
                            architects=it["architects"], styles=it["styles"], image=img))
        for b in it["bags"]:
            index.setdefault(b, k)
    # Photos found on Commons by address (s10_commons) fill buildings that have none yet.
    commons = Path(f"{DATA}/commons_best.json")
    if commons.exists():
        best = json.loads(commons.read_text())
        need = {bag: f for bag, f in best.items()
                if bag not in index or not entries[index[bag]].get("image")}
        found = images({f["title"][5:] for f in need.values()})
        added = 0
        for bag, f in need.items():
            img = found.get(f["title"][5:])
            if not img or not img.get("thumb"):
                continue
            if bag in index:
                entries[index[bag]]["image"] = img
            else:
                index[bag] = len(entries)
                entries.append(dict(label=None, label_nl=None, wiki=None, wiki_nl=None, architects=[], styles=[], image=img))
            added += 1
        print(added, "buildings got a Commons photo by address")
    # Photos the list of municipal monuments names (s00_fetch_gemeentelijk) fill buildings that still have none.
    if gemeentelijk.available():
        listed = {nr: r["image"] for r in gemeentelijk.rows() if r["image"] for nr in [r["nr"]]}
        found = images(set(listed.values()))
        added = 0
        for nr, f in listed.items():
            img = found.get(f)
            if not img or not img.get("thumb"):
                continue
            for bag in gemeentelijk.panden().get(nr, ())[:1]:
                if bag in index:
                    if entries[index[bag]].get("image"):
                        continue
                    entries[index[bag]]["image"] = img
                else:
                    index[bag] = len(entries)
                    entries.append(dict(label=None, label_nl=None, wiki=None, wiki_nl=None, architects=[], styles=[], image=img))
                added += 1
        print(added, "buildings got a photo from the list of municipal monuments")
    # Monuments the register names (s00_fetch_rce) give their name to buildings that have none yet.
    named = 0
    for m in json.load(open(f"{DATA}/raw/layers/monuments.json", encoding="utf-8")):
        if not m.get("name"):
            continue
        for bag in m["panden"]:
            if bag not in index:
                index[bag] = len(entries)
                entries.append(dict(label=m["name"], label_nl=m["name"], wiki=None, wiki_nl=None, architects=[], styles=[],
                                    image=None))
            elif not entries[index[bag]].get("label"):
                entries[index[bag]].update(label=m["name"], label_nl=m["name"])
            else:
                continue
            named += 1
    print(named, "buildings named by the monument register")

    # The city's own article, for the about text: its Wikipedia titles are the label unless the config names them.
    titles = CFG.get("wikipedia", {"nl": LABEL, "en": LABEL})
    about = {}
    for lang, title in titles.items():
        ex = extracts(lang, {title}).get(title)
        if ex:
            about[lang] = dict(extract=ex, url=f"https://{lang}.wikipedia.org/wiki/{title.replace(' ', '_')}")
    Path(f"{WEB}/about.json").write_text(json.dumps(about, ensure_ascii=False), encoding="utf-8")
    print("city article:", ", ".join(about) or "none")
    Path(f"{WEB}/wiki.json").write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")))
    pd.DataFrame({"bag": list(index), "wk": list(index.values())}).to_parquet(f"{DATA}/wiki_index.parquet")
    print(len(entries), "entries for", len(index), "panden;", Path(f"{WEB}/wiki.json").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
