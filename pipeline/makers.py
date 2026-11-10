"""The makers, builders and clients of the national monuments, from the register's actors (s00_fetch_rce).

rce_actors.json holds a row per monument and actor: {nr, actor, name, role}. The register names the role in its own
words ("architect / bouwkundige / constructeur", "aannemer / uitvoerder", "opdrachtgever"); they fall in three groups,
for the layer "Makers and builders" (layers.py) and the card (s16_register.py). An actor whose name is "Onbekend" says
nothing and is left out.
"""
import json
import re
from functools import cache
from pathlib import Path

from .city import CFG, DATA

# (key, English, Dutch, what the group did in English, in Dutch)
GROUPS = [
    ("makers", "Makers", "Makers", "Design and making", "Ontwerp en maakwerk"),
    ("builders", "Builders", "Bouwers", "Building", "Bouw"),
    ("clients", "Clients", "Opdrachtgevers", "Client", "Opdrachtgever"),
]
ROLES = [
    ("makers", r"architect|ingenieur|constructeur|beeldhouwer|steenhouwer|glazenier|ijzergieter|schrijnwerker|kunstenaar"),
    ("builders", r"aannemer|uitvoerder"),
    ("clients", r"opdrachtgever"),
]


def person(name: str) -> str | None:
    """'Reus, H.A. ; Zuid-Holland' → 'H.A. Reus'; the place after the semicolon is where the actor worked, not who."""
    name = name.split(";")[0].strip()
    if not name or name.lower().startswith("onbekend"):
        return None
    if "," in name:
        surname, rest = (s.strip() for s in name.split(",", 1))
        return f"{rest} {surname}".strip()
    return name


@cache
def by_monument() -> dict[str, list[dict]]:
    """Monument number → [{name, group, role, actor}], one row per person and group; empty unless the city's config
    says "makers": true."""
    path = Path(f"{DATA}/raw/layers/rce_actors.json")
    out = {}
    for a in json.load(open(path, encoding="utf-8")) if CFG.get("makers") and path.exists() else []:
        name = person(a["name"])
        group = next((g for g, pat in ROLES if re.search(pat, a["role"], re.I)), None)
        if not name or not group:
            continue
        rows = out.setdefault(str(a["nr"]), [])
        if not any(r["name"] == name and r["group"] == group for r in rows):
            rows.append(dict(name=name, group=group, role=a["role"], actor=a["actor"]))
    return out


def note(name: str, people: list[dict], url: str) -> dict:
    """The note a building carries in the layer: who made, built and commissioned it, in English and in Dutch."""
    def line(i):
        return " ".join(f"{g[3 + i]}: {', '.join(p['name'] for p in people if p['group'] == g[0])}."
                        for g in GROUPS if any(p["group"] == g[0] for p in people))
    return {"name": name, "name_nl": name, "story": line(0), "story_nl": line(1), "source": url}
