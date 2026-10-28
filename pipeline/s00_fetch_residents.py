"""Well-known residents: people whose Dutch Wikipedia article names the address in the city where they lived or worked.

1. People tied to the city: those on the city's list of natives (config "residents": {"list": page title}) and those
   Wikidata ties to it (born, died, lived or worked there), each with a Dutch article. Only people who have died: a
   living person's home address does not belong on a map.
2. Their article's wikitext is searched for a street of the city followed by a house number, in a sentence about
   living, moving, dying or working there. Articles that name such an address without being on either list are found
   with a regex search on the streets with monuments.
3. The address is matched to a pand in the BAG addresses (exact house number, one pand).
The sentence is kept as the source quote; house numbers can have changed since the person lived there.
  raw/layers/residents.json   [{bag, address, person, url, desc, born, died, links, quote}]
"""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, unquote

import requests

from . import gemeentelijk
from .city import CFG, DATA, LABEL, UA

OUT = Path(f"{DATA}/raw/layers/residents.json")
WD = "https://query.wikidata.org/sparql"
NLW = "https://nl.wikipedia.org/w/api.php"
VERBS = re.compile(r"\b(woonde|woonden|woont|bewoonde|verhuisde|betrok|vestigde|kocht|overleed|stierf|geboren|"
                   r"atelier|werkte|leefde|groeide op|woonachtig|ging wonen|gingen wonen|geboortehuis|sterfhuis)\b", re.I)
# a sentence about what the person designed or built names addresses that were not theirs
WORK = re.compile(r"\b(ontwerp|ontwierp|bouwde|werken van zijn hand|werken van haar hand|architect|restaureerde|verbouwde)\w*", re.I)
SELF = re.compile(r"\b(hij|zij|ze|het gezin|het echtpaar|de familie|het paar)\b", re.I)


def get(url, **kw):
    for attempt in range(6):
        r = requests.request(kw.pop("method", "GET"), url, headers=UA, timeout=300, **kw)
        if r.ok and r.headers.get("content-type", "").startswith("application/"):
            return r.json()
        time.sleep(3 * 2 ** attempt)
    r.raise_for_status()


def title_of(article: str) -> str:
    return unquote(article.rsplit("/wiki/", 1)[1]).replace("_", " ")


def wikidata_city() -> str:
    """The city's Wikidata item, found by its CBS municipality code (P382, written with or without the leading zero)."""
    for code in (CFG["gemeentecode"].lstrip("0"), CFG["gemeentecode"]):
        rows = get(WD, params={"query": f'SELECT ?c WHERE {{ ?c wdt:P382 "{code}" . }}', "format": "json"})["results"]["bindings"]
        if rows:
            return rows[0]["c"]["value"].rsplit("/", 1)[1]
    raise RuntimeError(f"no Wikidata item with CBS code {CFG['gemeentecode']}")


PERSON = """SELECT ?p ?pLabel ?article ?desc ?born ?died ?img (MAX(?sl) AS ?links) WHERE {{
  {values}
  ?article schema:about ?p ; schema:isPartOf <https://nl.wikipedia.org/> . ?p wdt:P31 wd:Q5 ; wikibase:sitelinks ?sl ; wdt:P570 ?died .
  OPTIONAL {{ ?p schema:description ?desc FILTER(lang(?desc) = "nl") }}
  OPTIONAL {{ ?p wdt:P569 ?born }} OPTIONAL {{ ?p wdt:P18 ?img }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "nl,en". }}
}} GROUP BY ?p ?pLabel ?article ?desc ?born ?died ?img"""


def deceased(values: str) -> list[dict]:
    rows = get(WD, method="POST", data={"query": PERSON.format(values=values), "format": "json"})["results"]["bindings"]
    out = {}
    for b in rows:
        v = {k: x["value"] for k, x in b.items()}
        out.setdefault(v["p"], v)
    return list(out.values())


def tied_to_city(qid: str) -> list[dict]:
    values = f"VALUES ?prop {{ wdt:P19 wdt:P20 wdt:P551 wdt:P937 }} ?p ?prop wd:{qid} ."
    return deceased(values)


def named_articles(titles: list[str]) -> list[dict]:
    out = []
    for i in range(0, len(titles), 150):
        vals = " ".join(f"<https://nl.wikipedia.org/wiki/{quote(t.replace(' ', '_'), safe='')}>" for t in titles[i:i + 150])
        out += deceased(f"VALUES ?article {{ {vals} }}")
        time.sleep(1)
    return out


def listed_titles(page: str) -> list[str]:
    wt = get(NLW, params=dict(action="parse", page=page, prop="wikitext", format="json", redirects=1))["parse"]["wikitext"]["*"]
    return sorted({m.group(1).strip() for m in re.finditer(r"^\*\s*\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]", wt, re.M)})


def street_hits(streets: list[str]) -> list[str]:
    """Dutch Wikipedia articles whose source has '<street> <number>', by regex search, for streets of the city."""
    def one(st):
        titles, offset = [], 0
        while offset is not None:
            d = get(NLW, params=dict(action="query", list="search", format="json", srlimit=500, srprop="", sroffset=offset,
                                     srnamespace=0, srsearch=f"insource:/{st} [0-9]/ Dordrecht"))
            titles += [x["title"] for x in d.get("query", {}).get("search", [])]
            offset = d.get("continue", {}).get("sroffset")
            time.sleep(0.4)
        return titles
    with ThreadPoolExecutor(3) as ex:
        return sorted({t for ts in ex.map(one, streets) for t in ts})


def wikitexts(titles: list[str]) -> dict[str, str]:
    texts = {}
    for i in range(0, len(titles), 50):
        d = get(NLW, params={"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "format": "json",
                             "formatversion": 2, "redirects": 1, "titles": "|".join(titles[i:i + 50])})["query"]
        back = {n["to"]: n["from"] for n in d.get("normalized", []) + d.get("redirects", [])}
        for p in d["pages"]:
            t = p["title"]
            while t in back:
                t = back[t]
            if p.get("revisions"):
                texts[t] = p["revisions"][0]["slots"]["main"]["content"]
        time.sleep(0.3)
    return texts


def clean(wt: str) -> str:
    """Wikitext to plain sentences; headings become sentence breaks so a quote never spans sections."""
    wt = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|<!--.*?-->", "", wt, flags=re.S)
    for _ in range(3):
        wt = re.sub(r"\{\{[^{}]*\}\}", "", wt)
    wt = re.sub(r"\[\[(?:Bestand|File|Afbeelding|Categorie|Image):[^\[\]]*(?:\[\[[^\]]*\]\][^\[\]]*)*\]\]", "", wt, flags=re.I)
    wt = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", wt)
    wt = re.sub(r"\[https?://\S+\s*([^\]]*)\]", r"\1", wt)
    wt = re.sub(r"^=+[^=\n]*=+\s*$", ". ", wt, flags=re.M)
    wt = re.sub(r"^[*#:;|!{].*$", ". ", wt, flags=re.M)
    wt = re.sub(r"<[^>]+>|'{2,}|thumb\|", "", wt)
    return re.sub(r"\s+", " ", wt)


GEO = {}


def geocode(address: str):
    """RD coordinates of a house number in the city, from the PDOK Locatieserver (exact number only), else None."""
    if address not in GEO:
        d = get("https://api.pdok.nl/bzk/locatieserver/search/v3_1/free", params={
            "q": f"{address} {LABEL}", "fq": ["type:adres", f"woonplaatsnaam:{LABEL}"], "rows": 3, "fl": "weergavenaam,centroide_rd"})
        hit = [x for x in d["response"]["docs"] if re.match(re.escape(address) + r"(?:[A-Za-z]|-\w+)?,", x["weergavenaam"], re.I)]
        GEO[address] = [float(v) for v in hit[0]["centroide_rd"][6:-1].split()] if hit else None
    return GEO[address]


def main():
    cfg = CFG.get("residents")
    if not cfg:
        print("no residents in the config: skipped")
        return
    addresses = json.load(open(f"{DATA}/raw/addresses.json", encoding="utf-8"))
    idx, streets = {}, set()
    for a in addresses:
        if a["pandidentificatie"] and a["openbare_ruimte"]:
            idx.setdefault((a["openbare_ruimte"].lower(), a["huisnummer"], (a["huisletter"] or "").lower()), set()).add(
                a["pandidentificatie"])
            streets.add(a["openbare_ruimte"])

    qid = cfg.get("wikidata") or wikidata_city()
    ppl = {p["p"]: dict(p, tied=True) for p in tied_to_city(qid)}
    listed = named_articles(listed_titles(cfg["list"]))
    ppl |= {p["p"]: dict(p, tied=True) for p in listed}
    print(qid, ":", len(ppl), "deceased people tied to", LABEL, f"({len(listed)} from the list)")

    # articles that name an address here without being on either list
    monument_streets = sorted(set(CFG["tier1"]) | {re.sub(r"\s+\d.*$", "", r["address"]) for r in gemeentelijk.rows()
                                                  if re.search(r"\s\d", r["address"])}, key=len, reverse=True)
    monument_streets = [st for st in monument_streets if st in streets]
    found_titles = street_hits(monument_streets)
    known = {title_of(p["article"]) for p in ppl.values()}
    extra = named_articles([t for t in found_titles if t not in known])
    ppl |= {p["p"]: dict(p, tied=False) for p in extra}
    print(len(extra), "more from a search on", len(monument_streets), "streets")

    texts = wikitexts(sorted({title_of(p["article"]) for p in ppl.values()}))
    addr_re = re.compile(r"(?<![\w-])(?<!Tweede )(?<!Eerste )(?<!Derde )(?<!Nieuwe )(" + "|".join(re.escape(s) for s in sorted(streets, key=len, reverse=True)) +
                         r")\s+(\d{1,4})\s?([a-z]\b)?")
    found = []
    for p in ppl.values():
        text = clean(texts.get(title_of(p["article"]), ""))
        if "Dordrecht" not in text:
            continue
        seen = set()
        for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text):
            if not VERBS.search(sentence) or WORK.search(sentence) or len(sentence) > 400:
                continue
            if not p["tied"] and LABEL not in sentence:
                continue  # an address in another city's street of the same name
            for m in addr_re.finditer(sentence):
                key = (m.group(1).lower(), int(m.group(2)), (m.group(3) or "").lower())
                bags = idx.get(key) or idx.get((key[0], key[1], "")) or set()
                address = f"{m.group(1)} {m.group(2)}{m.group(3) or ''}"
                if len(bags) > 1 or address in seen:
                    continue
                rd = None if bags else geocode(address)
                if not bags and not rd:
                    continue
                seen.add(address)
                found.append(dict(bag=next(iter(bags)) if bags else None, rd=rd, address=address, person=p["pLabel"], url=p["article"],
                                  desc=p.get("desc"), born=(p.get("born") or "")[:4], died=(p.get("died") or "")[:4],
                                  links=int(p["links"]), quote=sentence.strip()[:400]))
    # people named in the config with the sentence that places them: their house comes from a monument, at build time
    for e in cfg.get("extra", []):
        got = named_articles([e["title"]])
        if got:
            p = got[0]
            found.append(dict(bag=None, rd=None, monument=e["monument"], address=e["address"], person=p["pLabel"], url=p["article"],
                              desc=p.get("desc"), born=(p.get("born") or "")[:4], died=(p.get("died") or "")[:4],
                              links=int(p["links"]), quote=e["quote"]))
    found.sort(key=lambda f: -f["links"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # the people themselves, for the layer to look them up in the monument register's descriptions
    Path(f"{DATA}/raw/layers/people.json").write_text(json.dumps(
        [dict(person=p["pLabel"], url=p["article"], desc=p.get("desc"), born=(p.get("born") or "")[:4],
              died=(p.get("died") or "")[:4], links=int(p["links"])) for p in ppl.values()], ensure_ascii=False), encoding="utf-8")
    OUT.write_text(json.dumps(found, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(found), "addresses;", len({f["person"] for f in found}), "people;", len({f["bag"] for f in found}), "buildings")


if __name__ == "__main__":
    main()
