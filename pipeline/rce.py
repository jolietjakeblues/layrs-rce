"""The national monument register (RCE, CC0): its Elasticsearch projection first, its SPARQL endpoint for the rest.

Two ways into the same data, the CHO knowledge graph modelled on the CEO ontology
(https://linkeddata.cultureelerfgoed.nl/def/ceo):

- Elastic: the search projection of github.com/jolietjakeblues/elastic-ceo, one flat document per heritage object
  (service Erfgoed-ceo on dataset rce/erfgoed). One request returns a municipality's monuments with their
  description, style, function, building years (beginjaar, eindjaar) and BAG verblijfsobjecten. Still an experiment:
  when it fails, the SPARQL queries below give the same files, without the building years.
- SPARQL (rce/cho): the only route to ceo:heeftPand, the BAG pand a monument stands on, which the projection leaves
  out. The queries were worked out with the RCE MCP server, which wraps this endpoint; the pipeline calls the endpoint
  itself because the MCP caps results at 100 rows.

What the endpoint teaches:
- A monument names its municipality and its BAG objects on its basisregistratie relation: ceo:heeftBasisregistratieRelatie
  / ceo:gemeentenaam, and / ceo:heeftBAGRelatie / ceo:heeftPand or ceo:heeftVerblijfsobject. Most relations give only
  the verblijfsobject (Amersfoort: 170 panden, 735 verblijfsobjecten): its pand comes from BAG (s00_fetch_addresses).
- Triples come back several times (one object sits in several graphs): select DISTINCT, and dedupe.
- A monument has up to two descriptions; the register's own has ceo:heeftOmschrijvingstype 'rijksmonumentomschrijving',
  the other lists literature, whose years date the books.
- Spatial filters (geof:sfWithin) time out: protected townscapes come as WKT (WGS84) and are cut locally.
- Heavy queries answer 504: one kind of fact per query, paged with LIMIT/OFFSET.
"""
import re
import time

import requests

ENDPOINT = "https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/cho/services/cho/sparql"
ELASTIC = "https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/erfgoed/services/Erfgoed-ceo/_search"
F = "https://linkeddata cultureelerfgoed nl/def/ceo-elastic#"  # field prefix: Triply turns the dots into spaces
PREFIXES = """PREFIX ceo: <https://linkeddata.cultureelerfgoed.nl/def/ceo#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
"""
PAGE = 5000
PAND = "http://bag.basisregistraties.overheid.nl/bag/id/pand/"
VBO = "http://bag.basisregistraties.overheid.nl/bag/id/verblijfsobject/"
RIJKSMONUMENT = "https://data.cultureelerfgoed.nl/term/id/rn/2/b2d9a59a-fe1e-4552-9a05-3c2acddff864"
OMSCHRIJVING = "https://data.cultureelerfgoed.nl/term/id/rn/2/0273a12d-7259-4391-aee2-5dac264aebe9"


GENERIC = {"huis", "pand", "woonhuis", "winkelhuis", "hoekhuis", "hoek", "dubbel", "boerderij", "woning", "woningen",
           "pakhuis", "inleiding", "omschrijving", "gepleisterd", "terrein", "groep", "twee", "drie", "pomp", "nederige",
           "eenvoudig", "eenvoudige", "klein", "kleine", "groot", "grote", "fragment", "restant", "gedeelte", "onderdeel",
           "regentenkamer", "toegangspoort", "het", "de", "een", "werkplaats"}
LANDMARK = r"(toren|poort|kerk|kapel|klooster|gasthuis|molen|kasteel|brug|hofje|huisje|burcht|waag|synagoge|kazerne)$"


def name_from_text(txt: str) -> str | None:
    """A name for a monument the register leaves unnamed, read from its description, or None.

    Two forms are trusted: a type in capitals with a quoted name (VILLA "Klein Groenesteijn" → Villa Klein
    Groenesteijn), and a short proper name as the first sentence ("O.L.Vrouwetoren. Oorspronkelijk ..."). A first
    sentence that only describes ("Huis met lijstgevel") has no capitals inside and no landmark ending, and is left.
    """
    head = txt[:300]
    m = re.search(r"\b([A-Z]{4,}(?:[- ][A-Z]{2,})*)\b[^.\"'“‘]{0,40}?[\"“'‘]([A-Z][^\"”'’]{2,40})[\"”'’]", head)
    if m:
        return f"{m.group(1).capitalize()} {m.group(2).strip()}"
    # the first sentence, not ending at an abbreviation (St., Ned., Herv., R.K.)
    first = re.split(r"(?<!\bSt)(?<!\bNed)(?<!\bZgn)(?<!\bHerv)(?<!\bK)(?<!\bL)[.,;:]\s|\s\(", head, maxsplit=1)[0]
    first = first.strip().rstrip(".")
    words = first.split()
    if not words:
        return None
    if words[0].isupper():
        first = words[0].capitalize() + first[len(words[0]):]
    if (len(words) <= 4 and len(first) <= 40 and words[0].lower() not in GENERIC
            and (re.search(r"[A-Z]", first[1:]) or re.search(LANDMARK, first.lower()))):
        return first
    return None


def monument(nr, name=None, function=None, styles=(), years=None, txt=None, vbos=(), panden=(), complex=None, cho=None,
             **more):
    """One monument as the pipeline keeps it, whichever route it came by; cho is its URI in the linked data
    (https://linkeddata.cultureelerfgoed.nl/cho-kennis/id/rijksmonument/<cho number>, not the monument number)."""
    return dict(nr=str(nr), status="Rijksmonument", name=name, function=function, styles=list(styles), years=years,
                txt=txt, vbos=sorted(set(vbos)), panden=sorted(set(panden)), address=None, architect=None,
                complex=complex, cho=cho, **more)


# ---------- Elastic ----------

WKT = "http://www opengis net/ont/geosparql#asWKT"

def from_elastic(gemeente: str | None, ua: dict, select: dict | None = None) -> list[dict]:
    """Every rijksmonument of a municipality from the Erfgoed-ceo projection, in one request; or, for a theme, every
    one matching `select` (a bool query part, e.g. terms of the Referentienetwerk in a province). A theme's monuments
    carry their place, their outline or point (wkt, WGS84) and the terms they were selected by."""
    where = [{"term": {F + "gemeente.keyword": gemeente}}] if gemeente else []
    body = {"size": 10000, "track_total_hits": True, "query": {"bool": {"filter": [
        {"term": {"@id.soort": "rijksmonument"}},
        {"term": {F + "juridischeStatus.keyword": "rijksmonument"}}, *where], **(select or {})}}}
    r = requests.post(ELASTIC, json=body, headers=ua, timeout=120)
    r.raise_for_status()
    d = r.json()
    assert d["hits"]["total"]["value"] == len(d["hits"]["hits"]) < 10000, "page the request"
    out = []
    for h in d["hits"]["hits"]:
        s = h["_source"]
        get = lambda k: s.get(F + k) or []
        begin, end = get("beginjaar"), get("eindjaar")
        # Building years only when the record names one event: the projection is flat, so with two events
        # (building and rebuilding) it no longer says which year belongs to which.
        years = (int(begin[0]), int((end or begin)[0])) if len(begin) == 1 and len(end) <= 1 else None
        out.append(monument(get("rijksmonumentnummer")[0], name=(get("naam") or [None])[0],
                            function=(get("oorspronkelijkeFunctie") or get("functie") or [None])[0],
                            styles=[s for s in get("stijl") if s != "n.v.t."], years=years, txt=" ".join((get("omschrijving") or [""])[0].split()),
                            vbos=get("verblijfsobjectIdentificatie"), complex=(get("isOnderdeelVanComplex") or [None])[0],
                            cho=s["@id"], **(dict(place=(get("woonplaatsnaam") or get("gemeente") or [None])[0],
                                                  gemeente=(get("gemeente") or [None])[0],
                                                  wkt=(s.get(WKT) or [None])[0],
                                                  terms=get("heeftFunctieNaam") + get("heeftTypeNaam"),
                                                  type=(get("type") or [None])[0]) if select else {})))
    return out


def complexes(ids: list[str], ua: dict) -> list[dict]:
    """The complexes (groups of monuments registered together: a convent with its school and garden, a country
    house with its outbuildings) with these CHO ids, from the Elastic projection."""
    if not ids:
        return []
    r = requests.post(ELASTIC, json={"size": len(ids), "query": {"terms": {"@id.keyword": ids}}}, headers=ua, timeout=120)
    r.raise_for_status()
    out = []
    for h in r.json()["hits"]["hits"]:
        s = h["_source"]
        get = lambda k: s.get(F + k) or []
        out.append(dict(id=s["@id"], nr=get("complexnummer")[0], name=(get("naam") or [None])[0],
                        txt=" ".join((get("omschrijving") or [""])[0].split()),
                        estate=get("buitenplaats") == ["true"],
                        url=f"https://monumentenregister.cultureelerfgoed.nl/complexen/{get('complexnummer')[0]}"))
    return out


def elastic_all(filters: list[dict], ua: dict, fields: list[str] | None = None) -> list[dict]:
    """Every document matching the filters, page by page (sorted on @id, continued with search_after)."""
    out, after = [], None
    while True:
        body = {"size": 5000, "sort": [{"@id.keyword": "asc"}], "query": {"bool": {"filter": filters}}}
        if fields:
            body["_source"] = ["@id"] + [f if f.startswith("http") else F + f for f in fields]
        if after:
            body["search_after"] = after
        r = requests.post(ELASTIC, json=body, headers=ua, timeout=300)
        r.raise_for_status()
        hits = r.json()["hits"]["hits"]
        out += [h["_source"] for h in hits]
        if len(hits) < 5000:
            return out
        after = hits[-1]["sort"]


# ---------- SPARQL ----------

def select(body: str, ua: dict) -> list[dict]:
    """Run a SELECT, page by page, and return its rows as {variable: value}."""
    rows, offset = [], 0
    while True:
        q = f"{PREFIXES}{body}\nLIMIT {PAGE} OFFSET {offset}"
        for attempt in range(5):
            r = requests.post(ENDPOINT, data={"query": q}, timeout=300,
                              headers={"Accept": "application/sparql-results+json", **ua})
            if r.ok:
                break
            if attempt == 4:
                r.raise_for_status()
            time.sleep(5 * (attempt + 1))
        page = [{k: v["value"] for k, v in b.items()} for b in r.json()["results"]["bindings"]]
        rows += page
        if len(page) < PAGE:
            return rows
        offset += PAGE


def in_municipality(gemeente: str) -> str:
    """Graph pattern binding ?m and ?nr to every current rijksmonument of a municipality."""
    return f"""?br ceo:gemeentenaam "{gemeente}" .
  ?m ceo:heeftBasisregistratieRelatie ?br ; ceo:rijksmonumentnummer ?nr ;
     ceo:heeftJuridischeStatus <{RIJKSMONUMENT}> ."""


def of_numbers(nrs: list[str]) -> str:
    """Graph pattern binding ?m and ?nr to these monuments (for a theme, which spans municipalities)."""
    return f"""VALUES ?nr {{ {" ".join(f'"{n}"' for n in nrs)} }} ?m ceo:rijksmonumentnummer ?nr ."""


def bag_links(gemeente: str | None, ua: dict, nrs: list[str] | None = None) -> dict[str, tuple[set, set]]:
    """{monument nr: (panden, verblijfsobjecten)}, the 16-digit BAG ids the register links the monument to."""
    if nrs is not None:
        out = {}
        for i in range(0, len(nrs), 200):
            out.update(_bag_links(of_numbers(nrs[i:i + 200]), ua))
        return out
    return _bag_links(in_municipality(gemeente), ua)


def _bag_links(pattern: str, ua: dict) -> dict[str, tuple[set, set]]:
    rows = select(f"""SELECT DISTINCT ?nr ?pand ?vbo WHERE {{ {pattern}
  ?m ceo:heeftBasisregistratieRelatie/ceo:heeftBAGRelatie ?bag .
  OPTIONAL {{ ?bag ceo:heeftPand ?pand }} OPTIONAL {{ ?bag ceo:heeftVerblijfsobject ?vbo }} }}""", ua)
    out = {}
    for r in rows:
        panden, vbos = out.setdefault(r["nr"], (set(), set()))
        if "pand" in r:
            panden.add(r["pand"].removeprefix(PAND))
        if "vbo" in r:
            vbos.add(r["vbo"].removeprefix(VBO))
    return out


def from_sparql(gemeente: str, ua: dict) -> list[dict]:
    """The same monuments as from_elastic, by SPARQL, without building years."""
    m = in_municipality(gemeente)
    first = lambda rows, key: {r["nr"]: r[key] for r in sorted(rows, key=lambda r: r[key], reverse=True)}
    names = first(select(f"SELECT DISTINCT ?nr ?naam WHERE {{ {m} ?m ceo:heeftNaam/ceo:naam ?naam }}", ua), "naam")
    funcs = first(select(f"""SELECT DISTINCT ?nr (STR(?l) AS ?function) WHERE {{ {m}
  ?m ceo:heeftOorspronkelijkeFunctie/ceo:heeftFunctieNaam/skos:prefLabel ?l FILTER(lang(?l) = "nl") }}""", ua), "function")
    texts = first(select(f"""SELECT DISTINCT ?nr ?txt WHERE {{ {m}
  ?m ceo:heeftOmschrijving ?o . ?o ceo:heeftOmschrijvingstype <{OMSCHRIJVING}> ; ceo:omschrijving ?txt }}""", ua), "txt")
    styles = {}
    for r in select(f"""SELECT DISTINCT ?nr (STR(?l) AS ?style) WHERE {{ {m}
  ?m ceo:heeftStijlEnCultuur/ceo:heeftStijlEnCultuurNaam/skos:prefLabel ?l FILTER(STR(?l) != "n.v.t.") }}""", ua):
        styles.setdefault(r["nr"], []).append(r["style"])
    cho = {r["nr"]: r["m"] for r in select(f"SELECT DISTINCT ?nr ?m WHERE {{ {m} }}", ua)}
    return [monument(nr, name=names.get(nr), function=funcs.get(nr), styles=styles.get(nr, ()),
                     txt=" ".join(texts.get(nr, "").split()), cho=uri) for nr, uri in cho.items()]


def actors(gemeente: str | None, ua: dict, nrs: list[str] | None = None) -> list[dict]:
    """Who made each monument, with their role: architect, garden architect, sculptor, client (opdrachtgever), ...

    ceo:heeftGebeurtenis / ceo:heeftActorEnRol pairs an actor (a term with a label such as 'Kroes, H. ; Stad
    Amersfoort') with a role. The Elastic projection flattens the two into separate lists, so this comes by SPARQL.
    """
    if nrs is not None:
        return [a for i in range(0, len(nrs), 200) for a in _actors(of_numbers(nrs[i:i + 200]), ua)]
    return _actors(in_municipality(gemeente), ua)


def _actors(pattern: str, ua: dict) -> list[dict]:
    rows = select(f"""SELECT DISTINCT ?nr ?actor (STR(?al) AS ?name) (STR(?rl) AS ?role) WHERE {{ {pattern}
  ?m ceo:heeftGebeurtenis/ceo:heeftActorEnRol ?ar .
  ?ar ceo:heeftActor ?actor . FILTER(isIRI(?actor))
  ?actor skos:prefLabel ?al .
  OPTIONAL {{ ?ar ceo:heeftRol/skos:prefLabel ?rl }} }}""", ua)
    return [dict(nr=r["nr"], actor=r["actor"], name=r["name"], role=r.get("role")) for r in rows]


IMAGE_GRAPH = "https://linkeddata.cultureelerfgoed.nl/graph/image"
PHOTOS_PER_MONUMENT = 6


def images(nrs: list[str], ua: dict) -> dict[str, list[dict]]:
    """Photos of the monuments from the RCE image bank (graph 'image'): {nr: [{src, desc, rights, page}]}.

    Every record names its rijksmonumentnummer, a 640 px thumbnail (images.memorix.nl), a caption, its licence
    (mostly CC BY 4.0) and its page in the image bank. Views of the outside come first; at most PHOTOS_PER_MONUMENT.
    """
    rows = []
    for i in range(0, len(nrs), 200):
        values = " ".join(f'"{n}"' for n in nrs[i:i + 200])
        rows += select(f"""PREFIX edm: <http://www.europeana.eu/schemas/edm/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
SELECT ?nr ?thumb ?desc ?rights ?page WHERE {{ GRAPH <{IMAGE_GRAPH}> {{
  VALUES ?nr {{ {values} }}
  ?b ceo:rijksmonumentnummer ?nr ; foaf:depiction ?thumb ; dc:rights ?rights .
  OPTIONAL {{ ?b dc:description ?desc }}
  OPTIONAL {{ ?b edm:isShownAt ?page FILTER(STRSTARTS(STR(?page), "https://beeldbank")) }} }} }}""", ua)
    outside = re.compile(r"^(exterieur|overzicht|aanzicht|gezicht|voorgevel|straatbeeld|front)", re.I)
    out = {}
    for r in rows:
        ph = dict(src=r["thumb"], desc=r.get("desc"), rights=r["rights"], page=r.get("page"))
        if ph not in out.setdefault(r["nr"], []):
            out[r["nr"]].append(ph)
    return {nr: sorted(ps, key=lambda p: (not outside.search(p["desc"] or ""), p["src"]))[:PHOTOS_PER_MONUMENT]
            for nr, ps in out.items()}


RNCE = "https://data.cultureelerfgoed.nl/id/rnce#"
THESAURUS = "https://data.cultureelerfgoed.nl/term/id/rn/2/thesaurus"


def abr_periods(ua: dict) -> list[dict]:
    """The archaeological periods of the ABR, as the Referentienetwerk (RN2) holds them: every term with
    rnce:beginYearAbr and endYearAbr, with its code (skos:hiddelLabel, sic), label and broader period."""
    rows = select(f"""SELECT DISTINCT ?c (STR(?l) AS ?label) (STR(?k) AS ?code) ?begin ?end ?broader WHERE {{
  GRAPH <{THESAURUS}> {{ ?c <{RNCE}beginYearAbr> ?begin ; <{RNCE}endYearAbr> ?end ; skos:prefLabel ?l .
    OPTIONAL {{ ?c skos:hiddelLabel ?k }} OPTIONAL {{ ?c skos:broader ?broader }} }} }}""", ua)
    out = {}
    for r in rows:
        out.setdefault(r["c"], dict(uri=r["c"], label=r["label"], code=r.get("code"), begin=int(float(r["begin"])),
                                    end=int(float(r["end"])), broader=r.get("broader")))
    return list(out.values())


def terms(uris: list[str], ua: dict) -> dict[str, dict]:
    """Label and broader term (with its label) of Referentienetwerk terms: {uri: {label, broader, broaderLabel}}."""
    out = {}
    for i in range(0, len(uris), 200):
        values = " ".join(f"<{u}>" for u in uris[i:i + 200])
        for r in select(f"""SELECT ?c (STR(?l) AS ?label) ?b (STR(?bl) AS ?blabel) WHERE {{ GRAPH <{THESAURUS}> {{
  VALUES ?c {{ {values} }} ?c skos:prefLabel ?l . OPTIONAL {{ ?c skos:broader ?b . ?b skos:prefLabel ?bl }} }} }}""", ua):
            out.setdefault(r["c"], dict(label=r["label"], broader=r.get("b"), broaderLabel=r.get("blabel")))
    return out


def townscapes(ua: dict) -> list[dict]:
    """All protected town and village views (beschermde stads- en dorpsgezichten) in the country, WKT in WGS84."""
    rows = select("""SELECT DISTINCT ?nr ?naam (STR(?sl) AS ?status) ?wkt WHERE {
  ?g a ceo:Gezicht ; ceo:gezichtsnummer ?nr ; ceo:heeftGeometrie/geo:asWKT ?wkt .
  OPTIONAL { ?g ceo:heeftNaam/ceo:naam ?naam }
  OPTIONAL { ?g ceo:heeftGezichtsstatus/skos:prefLabel ?sl } }""", ua)
    out = {}
    for r in rows:
        out.setdefault(r["nr"], r)
    return list(out.values())
