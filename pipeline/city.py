"""The city a pipeline run builds: cities/<CITY>.json, with CITY from the environment (pipeline/run.py sets it).

Every step reads and writes under its city's own folders, so cities never overwrite each other:
  data/<city>/       raw downloads (raw/) and intermediate tables
  web/data/<city>/   what the viewer loads, opened as ?city=<city>
Run one step with `$env:CITY="amersfoort"; python -m pipeline.s02_attributes` (PowerShell), or all of them with
`python -m pipeline.run amersfoort`.
"""
import json
import math
import os
from pathlib import Path

CITY = os.environ["CITY"]
CFG = json.loads((Path(__file__).parent.parent / "cities" / f"{CITY}.json").read_text(encoding="utf-8"))

DATA = f"data/{CITY}"
WEB = f"web/data/{CITY}"
LABEL = CFG["label"]
GEMEENTE_CODE = CFG.get("gemeentecode")  # four digits, as BAG ids start: Amersfoort 0307, Maastricht 0935
# A theme instead of a city (cities/molens-zh.json): one kind of monument across a province, each in its surroundings.
# Its selection (s00_theme_select) takes the place of the municipality; there is no gemeentecode.
THEME = CFG.get("theme")
ORIGIN = tuple(CFG["origin"])         # RD New; the viewer's (0, 0), the centre of the old town
UA = {"User-Agent": f"layrs-{CITY}/0.1 (https://layrs-{CITY}.pages.dev)"}

Path(DATA, "raw").mkdir(parents=True, exist_ok=True)
Path(WEB).mkdir(parents=True, exist_ok=True)


def bounds(cell: int = 1000) -> tuple[int, int, int, int]:
    """The municipality's extent in RD New, out to whole cells; from the boundary s00_fetch_boundary wrote."""
    if "bounds" in CFG:
        return tuple(CFG["bounds"])
    import geopandas as gpd
    x0, y0, x1, y1 = gpd.read_file(f"{DATA}/raw/boundary.json").total_bounds
    return (math.floor(x0 / cell) * cell, math.floor(y0 / cell) * cell,
            math.ceil(x1 / cell) * cell, math.ceil(y1 / cell) * cell)


def cells(cell: int = 1000) -> list[tuple[int, int]]:
    """Lower-left corners of the cells of a grid over the bounds that touch the boundary: the whole municipality for a
    city, only the discs around its monuments for a theme (s00_theme_select)."""
    import geopandas as gpd
    from shapely.geometry import box
    x0, y0, x1, y1 = bounds(cell)
    area = gpd.read_file(f"{DATA}/raw/boundary.json").union_all()
    return [(x, y) for x in range(x0, x1, cell) for y in range(y0, y1, cell) if area.intersects(box(x, y, x + cell, y + cell))]
