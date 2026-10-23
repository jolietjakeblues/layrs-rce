"""The register's entry for each monument, for the building card (web/data/<city>/register/<k>.json).

Shards keyed by the monument number modulo SHARDS, loaded when a card needs one:
  {nr: {name, text, url, cho, complex: {name, url, cho} | null, photos: [{src, desc, rights, page}]}}
url is the entry in the monument register, cho the object's URI in the RCE linked data.
text is the register's description, cut at TEXT_MAX characters on a sentence; the card links to the full entry.
Photos come from the RCE image bank (s00_fetch_rce), mostly CC BY 4.0, each with its page in the bank.
"""
import json
import re
from pathlib import Path

from .city import DATA, WEB

SHARDS = 16
TEXT_MAX = 900
OUT = Path(f"{WEB}/register")


def cut(txt: str) -> str:
    t = re.sub(r"^(Inleiding|Omschrijving( van het complex)?|Beschrijving)\s+", "", txt or "").strip()
    if len(t) <= TEXT_MAX:
        return t
    end = t.rfind(". ", 0, TEXT_MAX)
    return t[:end + 1] if end > TEXT_MAX // 2 else t[:TEXT_MAX].rsplit(" ", 1)[0] + "…"


def main():
    raw = Path(f"{DATA}/raw/layers")
    mons = json.load(open(raw / "monuments.json", encoding="utf-8"))
    cx = {c["id"]: c for c in json.load(open(raw / "complexes.json", encoding="utf-8"))} if (raw / "complexes.json").exists() else {}
    photos = json.load(open(raw / "rce_images.json", encoding="utf-8")) if (raw / "rce_images.json").exists() else {}
    shards = [{} for _ in range(SHARDS)]
    for m in mons:
        c = cx.get(m.get("complex"))
        shards[int(m["nr"]) % SHARDS][m["nr"]] = dict(
            name=m.get("name"), text=cut(m.get("txt")), place=m.get("place"),
            url=f"https://monumentenregister.cultureelerfgoed.nl/monumenten/{m['nr']}", cho=m.get("cho"),
            complex=dict(name=c["name"], url=c["url"], cho=c["id"]) if c else None,
            photos=photos.get(m["nr"], []))
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.json"):
        f.unlink()
    for k, s in enumerate(shards):
        (OUT / f"{k}.json").write_text(json.dumps(s, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = sum(f.stat().st_size for f in OUT.glob("*.json")) // 1024
    print(f"{len(mons)} monuments, {sum(len(v) for v in photos.values())} photos; {size} KB in {SHARDS} shards")


if __name__ == "__main__":
    main()
