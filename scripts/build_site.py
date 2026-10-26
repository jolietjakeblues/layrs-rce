"""Put one city's viewer in a folder of its own, ready for static hosting (Cloudflare Pages): dist/<city>/.

  python scripts/build_site.py amersfoort

The folder holds the viewer (web/ without other cities' data), the city's data, and pages that open on the city and
name it from the start. Build and deploy in one go with scripts/deploy.ps1.

Every file a build can change gets a URL of its own, so a server may cache them for good (Apache on this host marks
everything but HTML and JSON `immutable`): the data goes into data/<city>-<hash>/, named on the page as data-dir, and
the viewer's scripts and styles are linked with ?v=<hash>. Only the pages themselves keep their URLs. The vendored
three.js modules are left as they are: they import one another without ?v, a ?v on some would load two copies of
THREE, and they change only when three.js is upgraded.
"""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

VIEWER = ["app.js", "styles.css", "logo.js", "worker.js", "vendor", "graph.js", "graph.css"]


def digest(*files: Path) -> str:
    h = hashlib.sha256()
    for f in files:
        h.update(f.as_posix().encode() + b"\0" + f.read_bytes())
    return h.hexdigest()[:10]


def version(out: Path, html: str, names: list[str]) -> str:
    """The page with ?v=<hash of the file> on its links to these files."""
    for name in names:
        html = html.replace(f'"{name}"', f'"{name}?v={digest(out / name)}"', 1)
    return html


def main():
    city = sys.argv[1]
    cfg = json.loads(Path(f"web/data/{city}/city.json").read_text(encoding="utf-8"))
    label, n = cfg["label"], cfg["stats"]["buildings"]
    out = Path("dist") / city
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name in VIEWER:
        src = Path("web") / name
        (shutil.copytree if src.is_dir() else shutil.copy2)(src, out / name)
    src = Path(f"web/data/{city}")
    data = f"{city}-{digest(*sorted(f for f in src.rglob('*') if f.is_file()))}"
    shutil.copytree(src, out / "data" / data)
    # app.js starts the tile workers; worker.js is final, so its hash goes into app.js before app.js is hashed
    app = (out / "app.js").read_text(encoding="utf-8")
    worker = f"new Worker('worker.js?v={digest(out / 'worker.js')}'"
    assert app.count("new Worker('worker.js'") == 1
    (out / "app.js").write_text(app.replace("new Worker('worker.js'", worker), encoding="utf-8")

    # The page names its city from the start, so nothing else shows before the map loads; noindex, it is a test.
    html = Path("web/index.html").read_text(encoding="utf-8")
    desc = f"All {n:,} buildings of {label} in 3D, coloured by the year they were built, with layers from the national monument register."
    html = html.replace('<html lang="en">', f'<html lang="en" data-city="{city}" data-dir="{data}">', 1)
    html = version(out, html, ["styles.css", "logo.js", "app.js"])
    noindex = '\n<meta name="robots" content="noindex">'
    html = re.sub(r"<title>.*?</title>", f"<title>LAYRS: {label}</title>{noindex}", html, count=1)
    html = re.sub(r'(<meta (?:name="description"|property="og:description") content=")[^"]*"',
                  lambda m: f'{m.group(1)}{desc}"', html)
    html = html.replace('<meta property="og:title" content="LAYRS">', f'<meta property="og:title" content="LAYRS: {label}">')
    html = html.replace('<span class="layrs" aria-label="LAYRS">LAYRS</span> <i', f'<span class="layrs" aria-label="LAYRS">LAYRS</span>{label}<i')
    (out / "index.html").write_text(html, encoding="utf-8")
    g = Path("web/graph.html").read_text(encoding="utf-8")
    g = g.replace('<html lang="en">', f'<html lang="en" data-city="{city}" data-dir="{data}">', 1)
    g = version(out, g, ["graph.css", "vendor/d3.min.js", "graph.js"])
    g = re.sub(r"<title>.*?</title>", f"<title>LAYRS: {label} — the graph</title>{noindex}", g, count=1)
    g = g.replace('<span class="g-mark">LAYRS</span> </a>', f'<span class="g-mark">LAYRS</span>{label}</a>')
    (out / "graph.html").write_text(g, encoding="utf-8")
    # the data folder is new with every change of its content, so its files can be cached for good
    (out / "_headers").write_text(f"/data/{data}/*\n  Cache-Control: public, max-age=31536000, immutable\n",
                                  encoding="utf-8")

    files = [f for f in out.rglob("*") if f.is_file()]
    big = max(files, key=lambda f: f.stat().st_size)
    print(f"{out}: {len(files)} files, {sum(f.stat().st_size for f in files) / 1e6:.1f} MB; largest {big.name} "
          f"{big.stat().st_size / 1e6:.1f} MB (Pages allows 20,000 files of at most 25 MiB)")


if __name__ == "__main__":
    main()
