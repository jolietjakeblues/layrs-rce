"""Layers: historical contexts, each a set of buildings, built from the national registers for any municipality.

A layer has one or more groups; every group takes one bit of a 64-bit mask per building. Each source function
returns {bag pand id (16 digits): group key}, or {pand: (group, note)} when a building carries a story. The viewer
shows the layers in the order they are declared here. Texts name the city from its config, in English and Dutch;
group labels carry their Dutch as a third element.

Every source is fetched by s00_fetch_rce (monument register, CC0): the monuments with their BAG panden, the register's
descriptions and styles, and the protected townscapes. Wikidata (s00_fetch_wikidata) adds panden for monuments the
register does not link.
"""
import csv
import json
import re
from functools import cache
from pathlib import Path

import geopandas as gpd

from .city import DATA, LABEL, THEME
from .monuments import wd_monuments

LAYERS = []
RAW = f"{DATA}/raw/layers"
REGISTER = ("Rijksmonumentenregister, RCE", "https://monumentenregister.cultureelerfgoed.nl")


def layer(**meta):
    """Register a layer. scope="city" keeps it out of a theme, where the monuments are all of one kind."""
    def wrap(fn):
        if not (THEME and meta.pop("scope", None) == "city"):
            meta.pop("scope", None)
            LAYERS.append(dict(meta, source_fn=fn))
        return fn
    return wrap


# ---------- shared lookups ----------

@cache
def buildings() -> gpd.GeoDataFrame:
    b = gpd.read_parquet(f"{DATA}/buildings.parquet", columns=["identificatie", "year", "geometry"])
    b["bag"] = b.identificatie.str.slice(-16)
    return b


@cache
def monuments() -> list[dict]:
    return json.load(open(f"{RAW}/monuments.json", encoding="utf-8"))


@cache
def monument_panden() -> dict[str, set[str]]:
    """Buildings of each monument: the register's own links, else Wikidata's."""
    out = {}
    for m in monuments():
        out.setdefault(str(m["nr"]), set()).update(m["panden"])
    for r in wd_monuments():
        if r["bag"] and not out.get(r["nr"]):
            out.setdefault(r["nr"], set()).add(r["bag"].zfill(16))
    return out


@cache
def rce_texts() -> dict[str, str]:
    return {r["nr"]: r["txt"] for r in csv.DictReader(open(f"{DATA}/raw/rce_descriptions.csv", encoding="utf-8"))}


def by_monument(keyed: dict[str, str]) -> dict[str, str]:
    """{monument nr: group} → {pand: group}."""
    mp = monument_panden()
    return {p: g for nr, g in keyed.items() for p in mp.get(str(nr), ())}


@cache
def addresses() -> dict[str, str]:
    """The main address of each pand: the lowest number on the street with most of its addresses."""
    per = {}
    for a in json.load(open(f"{DATA}/raw/addresses.json", encoding="utf-8")):
        if a["pandidentificatie"] and a["openbare_ruimte"]:
            per.setdefault(a["pandidentificatie"], []).append((a["openbare_ruimte"], a["huisnummer"], a["huisletter"] or ""))
    out = {}
    for bag, addrs in per.items():
        street = max({s for s, _, _ in addrs}, key=lambda st: sum(s == st for s, _, _ in addrs))
        n, letter = min((n, l) for s, n, l in addrs if s == street)
        out[bag] = f"{street} {n}{letter}"
    return out


def short(txt: str, limit: int = 200) -> str:
    """The register's description cut to its first sentence, without the heading the newer entries start with."""
    t = re.sub(r"^(Inleiding|Omschrijving( van het complex)?|Beschrijving)\s+", "", txt or "").strip()
    # sentences end at a full stop after a word, not after an abbreviation (St., Ned., ca., plm.)
    parts = re.split(r"(?<!\bSt)(?<!\bNed)(?<!\bca)(?<!\bplm)(?<=[a-z0-9)])\.\s", t, maxsplit=2)
    first = parts[0].rstrip(".")
    if len(first) < 40 and len(parts) > 1:  # "O.L.Vrouwetoren." alone says little: take the next sentence too
        first = f"{first}. {parts[1].rstrip('.')}"
    if len(first) > limit:
        first = first[:limit].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return first + ("" if first.endswith("…") else ".")


def story(name: str, txt: str, url: str) -> dict:
    """A note for the walks and the card: the place's name and a line from the register, in Dutch either way; its
    source is the record the line comes from, in the RCE's Linked Data Voorziening (url)."""
    line = short(txt)
    return {"name": name, "name_nl": name, "story": line, "story_nl": line, "source": url}


def within(polygons: gpd.GeoDataFrame, key_col: str) -> dict[str, str]:
    """Buildings whose centroid falls inside a polygon, keyed by the polygon's group."""
    b = buildings()
    pts = gpd.GeoDataFrame({"bag": b.bag}, geometry=b.geometry.centroid, crs=28992)
    j = gpd.sjoin(pts, polygons[[key_col, "geometry"]], predicate="within")
    return dict(zip(j.bag, j[key_col]))


# ---------- layers ----------

FUNCTIONS = [
    # (group, label, label_nl, pattern on the original function as the register names it)
    ("home", "Houses", "Woonhuizen", r"woonhuis|woning|landhuis|pastorie|koetshuis|herenhuis|villa"),
    ("faith", "Faith and care", "Geloof en zorg",
     r"kerk|kapel|klooster|synagoge|hofje|gasthuis|zorg|liefdadig|infirmerie|gesticht|begraaf|graf"),
    ("defence", "Defence", "Verdediging", r"kazemat|stelling|fort|vesting|kazerne|tankhindernis|poort|stadsmuur|wal"),
    ("work", "Trade and work", "Handel en bedrijf",
     r"opslag|pakhuis|werkplaats|winkel|handel|kantoor|industrie|fabriek|molen|bank|waag|boerderij|stal|melk"),
    ("works", "Water, power and roads", "Water, energie en verkeer",
     r"transformator|watertoren|pomp|brug|stuw|sluis|transport|station|weeg"),
    ("green", "Gardens and parks", "Tuinen en parken", r"tuin|park|plantsoen|aanleg|orangerie"),
]


@layer(
    scope="city", id="register", section="Architecture", section_nl="Architectuur",
    title="National monuments", title_nl="Rijksmonumenten", era="All periods", era_nl="Alle perioden",
    text=(f"The State lists the buildings of national value in {LABEL} in its monument register, with what each "
          "was built for: houses, churches and convents, defences, warehouses and shops, waterworks, gardens."),
    text_nl=(f"Het Rijk legt de gebouwen van nationale waarde in {LABEL} vast in het monumentenregister, met waarvoor "
             "elk gebouwd werd: woonhuizen, kerken en kloosters, verdediging, pakhuizen en winkels, waterwerken, tuinen."),
    caveat="Grouped by the original function the register gives; a monument without one is left out.",
    caveat_nl="Gegroepeerd naar de oorspronkelijke functie die het register noemt; een monument zonder functie valt weg.",
    source=REGISTER,
    groups=[(k, label, nl) for k, label, nl, _ in FUNCTIONS],
)
def register():
    # every monument with its group, and the register's own words as its story: the stops of a walk
    out, addr = {}, addresses()
    for m in monuments():
        f = (m.get("function") or "").lower()
        k = next((k for k, _, _, pat in FUNCTIONS if re.search(pat, f)), None)
        if not k:
            continue
        url = m.get("cho") or f"https://monumentenregister.cultureelerfgoed.nl/monumenten/{m['nr']}"
        for p in m["panden"]:
            name = m.get("name") or addr.get(p) or f"Rijksmonument {m['nr']}"
            out[p] = (k, story(name, m.get("txt"), url)) if m.get("txt") else k
    return out


@layer(
    scope="city", id="gables", section="Architecture", section_nl="Architectuur",
    title="Gables", title_nl="Gevels", era="1500–1800", era_nl="1500–1800",
    text=("An old town house shows its age in its top. Stepped gables belong to the late Middle Ages and the early "
          "1600s, neck gables to the middle of that century, bell gables to the decades around 1700, and the flat "
          "cornice to the 1700s and after."),
    text_nl=("Een oud stadshuis toont zijn leeftijd in de top. Trapgevels horen bij de late middeleeuwen en de vroege "
             "zeventiende eeuw, halsgevels bij het midden van die eeuw, klokgevels bij de jaren rond 1700 en de "
             "rechte lijst bij de achttiende eeuw en later."),
    caveat="Listed houses only: the register's description names the gable.",
    caveat_nl="Alleen rijksmonumenten: de omschrijving in het register noemt de gevel.",
    source=REGISTER,
    groups=[("trap", "Stepped gable", "Trapgevel"), ("hals", "Neck gable", "Halsgevel"),
            ("klok", "Bell gable", "Klokgevel"), ("lijst", "Cornice", "Rechte lijst")],
)
def gables():
    pats = [("trap", r"trapgevel"), ("hals", r"halsgevel"), ("klok", r"klokgevel"),
            ("lijst", r"rechte lijst|lijstgevel|verhoogde lijst")]
    keyed = {}
    for nr, t in rce_texts().items():
        t = t.lower()
        hits = [(m.start(), k) for k, p in pats for m in [re.search(p, t)] if m]
        if hits:
            keyed[nr] = min(hits)[1]  # the first gable named is the house's own
    return by_monument(keyed)


STYLES = [
    # (group, label, label_nl, the register's style names)
    ("classic", "Classicism", "Classicisme", ("Hollands classicisme", "Neo-Classicisme", "Um 1800-stijl", "Lodewijk XIV",
                                              "Lodewijk XV", "Lodewijk XVI", "Empire")),
    ("neo", "Neo-styles", "Neostijlen", ("Neo-Renaissance", "Neo-Hollandse Renaissance", "Neo-Franse Renaissance",
                                         "Neo-Gotiek", "Neo-Romaanse stijl", "Neo-Barok", "Eclecticisme")),
    ("villa", "Chalets, cottages and Art Nouveau", "Chalets, cottages en jugendstil",
     ("Chalet-stijl", "Cottage-stijl", "Overgangsarchitectuur", "Art Nouveau", "Jugendstil", "Wrightiaanse stijl")),
    ("as", "Amsterdam School and Dudok", "Amsterdamse School en Dudok",
     ("Amsterdamse school", "Late Amsterdamse school", "Zakelijk Expressionisme", "Expressionisme", "Dudok-trant",
      "Art Déco")),
    ("trad", "Traditionalism", "Traditionalisme", ("Traditionalisme", "Delftse School", "ambachtelijk-traditionele bouwtrant")),
    ("modern", "Rationalism and Nieuwe Bouwen", "Rationalisme en Nieuwe Bouwen",
     ("Rationalisme", "Berlagianisme", "Nieuwe Bouwen", "Functionalisme", "Nieuwe Zakelijkheid")),
]


@layer(
    scope="city", id="styles", section="Architecture", section_nl="Architectuur",
    title="Architecture styles", title_nl="Bouwstijlen", era="1800–1940", era_nl="1800–1940",
    text=(f"From the sober classicism around 1800, through the revival styles and the villa parks of the railway era, "
          f"to the brick expressionism and the Nieuwe Bouwen between the wars: {LABEL} tried on the styles of its time."),
    text_nl=(f"Van het sobere classicisme rond 1800, via de neostijlen en de villaparken van de spoorwegtijd, naar het "
             f"baksteenexpressionisme en het Nieuwe Bouwen tussen de oorlogen: {LABEL} paste de stijlen van zijn tijd."),
    caveat="Listed buildings only: the register names a style for part of the national monuments.",
    caveat_nl="Alleen rijksmonumenten: het register noemt bij een deel van de monumenten een stijl.",
    source=REGISTER,
    groups=[(k, label, nl) for k, label, nl, _ in STYLES],
)
def styles():
    to_group = {s.lower(): k for k, _, _, names in STYLES for s in names}
    keyed = {}
    for r in json.load(open(f"{RAW}/rce_styles.json", encoding="utf-8")):
        g = to_group.get(r["style"].lower())
        if g:
            keyed.setdefault(r["nr"], g)
    return by_monument(keyed)


@cache
def complexes() -> dict[str, dict]:
    f = Path(f"{RAW}/complexes.json")
    return {c["id"]: c for c in json.load(open(f, encoding="utf-8"))} if f.exists() else {}


@layer(
    id="complexes", section="Architecture", section_nl="Architectuur",
    title="Complexes", title_nl="Complexen", era="All periods", era_nl="Alle perioden",
    text=("Some monuments were listed together, because they only make sense as a whole: a convent with its school "
          "and garden, a country house with its coach house, gardener's house and park, a housing block."),
    text_nl=("Sommige monumenten zijn samen beschermd, omdat ze alleen als geheel te begrijpen zijn: een klooster met "
             "school en tuin, een buitenplaats met koetshuis, tuinmanswoning en park, een woonblok."),
    caveat="Each complex shows as one stop on a walk, with the register's description of the whole.",
    caveat_nl="Elk complex is één stop op een wandeling, met de omschrijving van het geheel uit het register.",
    source=("Rijksmonumentenregister, RCE: complexen", "https://monumentenregister.cultureelerfgoed.nl"),
    groups=[("estate", "Country estates", "Buitenplaatsen"), ("complex", "Other complexes", "Overige complexen")],
)
def complexes_layer():
    out, cx = {}, complexes()
    for m in monuments():
        c = cx.get(m.get("complex"))
        if not c:
            continue
        note = story(c["name"] or f"Complex {c['nr']}", c["txt"], c["id"])
        for p in m["panden"]:
            out[p] = ("estate" if c["estate"] else "complex", note)
    return out


def _townscapes() -> gpd.GeoDataFrame:
    f = Path(f"{RAW}/gezichten.geojson")
    g = gpd.read_file(f).set_crs(28992, allow_override=True) if f.exists() else gpd.GeoDataFrame(
        {"nr": [], "naam": []}, geometry=[], crs=28992)
    g["nr"] = g.nr.astype(str)
    return g


@layer(
    id="townscapes", section="Architecture", section_nl="Architectuur",
    title="Protected townscapes", title_nl="Beschermde gezichten", era="All periods", era_nl="Alle perioden",
    text=("Beyond single buildings the State protects whole areas whose streets, buildings and greenery together "
          "tell the history of a place: the beschermde stads- en dorpsgezichten."),
    text_nl=("Naast losse gebouwen beschermt het Rijk hele gebieden waarvan straten, bebouwing en groen samen de "
             "geschiedenis van een plek vertellen: de beschermde stads- en dorpsgezichten."),
    caveat="Every building whose centre lies inside the protected area, listed or not.",
    caveat_nl="Elk gebouw waarvan het midden binnen het beschermde gebied ligt, monument of niet.",
    source=("Beschermde stads- en dorpsgezichten, RCE", "https://linkeddata.cultureelerfgoed.nl"),
    groups=[(nr, naam, naam) for nr, naam in zip(_townscapes().nr, _townscapes().naam)],
)
def townscapes():
    g = _townscapes()
    return within(g, "nr") if len(g) else {}


@layer(
    id="heritage", section="Architecture", section_nl="Architectuur",
    title="Protected heritage", title_nl="Beschermd erfgoed", era="All periods", era_nl="Alle perioden",
    text=f"The buildings of {LABEL} that the State lists as national monuments.",
    text_nl=f"De gebouwen in {LABEL} die het Rijk als rijksmonument beschermt.",
    source=REGISTER,
    groups=[("Rijksmonument", "National monument", "Rijksmonument")],
)
def heritage():
    return {p: "Rijksmonument" for m in monuments() for p in m["panden"]}


# ---------- a theme's facets ----------
# A theme (cities/<theme>.json "theme") sorts its monuments by the facets of its config: for mills the type of mill
# and what it did. A monument's facet comes from the terms it is registered with and what Wikidata calls it, else
# from the first of the facet's words in the register's description. Each monument carries its register line as its
# story, so a walk can string the mills of a polder together.

def theme_facet(facet: dict):
    groups = [(k, en, nl, re.compile(rf"\b({pat})", re.I)) for k, en, nl, _term, pat in facet["groups"]]
    tpath, kpath = Path(f"{DATA}/raw/theme/terms.json"), Path(f"{DATA}/raw/wd_kinds.json")
    terms = json.load(open(tpath, encoding="utf-8")) if tpath.exists() else {}
    kinds = json.load(open(kpath, encoding="utf-8")) if kpath.exists() else {}

    # the facet's fallback group (a broad kind, like 'bovenkruier') counts only when no other group is found
    rest = facet.get("fallback")

    def group_of(m) -> str | None:
        known = " ".join([terms.get(u, "") for u in m.get("terms", [])] + kinds.get(m["nr"], []) + [m.get("type") or ""])
        txt = (m.get("txt") or "")[:600]
        for among in ([g for g in groups if g[0] != rest], [g for g in groups if g[0] == rest]):
            for k, _, _, rx in among:
                if rx.search(known):
                    return k
            hits = [(h.start(), k) for k, _, _, rx in among for h in [rx.search(txt)] if h]
            if hits:
                return min(hits)[1]
        return None

    # only the groups the province has: a layer colours MAX_GROUPS of them at most (web/app.js)
    if Path(f"{RAW}/monuments.json").exists():
        used = {group_of(m) for m in monuments()}
        groups = [g for g in groups if g[0] in used]

    def fn():
        out = {}
        for m in monuments():
            k = group_of(m)
            if not k:
                continue
            url = m.get("cho") or f"https://monumentenregister.cultureelerfgoed.nl/monumenten/{m['nr']}"
            name = m.get("name") or f"{dict((g[0], g[2]) for g in groups)[k]}, {m.get('place') or ''}".rstrip(", ")
            for q in m["panden"]:
                out[q] = (k, story(name, m.get("txt"), url)) if m.get("txt") else k
        return out

    LAYERS.insert(0, dict(id=f"theme-{facet['id']}", section="Architecture", section_nl="Architectuur",
                          title=facet["title"], title_nl=facet["title_nl"], era="All periods", era_nl="Alle perioden",
                          text=f"The {THEME['noun'][1]} of {LABEL}, by {facet['title'].lower()}.",
                          text_nl=f"De {THEME['noun'][3]} in {LABEL.split(' in ')[-1]}, naar {facet['title_nl'].lower()}.",
                          caveat=("From the terms they are registered with and what Wikidata calls them, else from the "
                                  "register's description."),
                          caveat_nl=("Uit de begrippen in het register en wat Wikidata ze noemt, anders uit de omschrijving "
                                     "in het register."),
                          source=REGISTER, groups=[(k, en, nl) for k, en, nl, _ in groups], source_fn=fn))


if THEME:
    for _facet in reversed(THEME["facets"]):
        theme_facet(_facet)
