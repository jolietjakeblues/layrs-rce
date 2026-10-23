# Adding a city or a layer

## A city

Add `cities/<name>.json`, modelled on an existing one (see the README), and run:

```bash
python -m pipeline.run <name>
python -m http.server 8642 --directory web    # http://localhost:8642/?city=<name>
```

The periods are the city's own growth phases, not decades: ten at most, each with a colour from the shared palette.

## A theme

A theme follows one kind of monument across a province instead of a city (see the README). Export the kind's subtree
of the Referentienetwerk from PoolParty as TriG in a zip, copy `cities/molens-zh.json` and set `label`, `origin`,
`starts`, `home` (span the province), `periods` and the `theme`: the zip, the province as the register spells it, the
radius around each monument, its noun, who to credit and thank, and the facets with their groups as
`[key, English, Dutch, RN2 term label, regular expression]`. Run the pipeline with its name, as for a city.

When the theme leans on another source for what it says about each monument, link to it and thank it on every card
and in About, as the mills do with Allemolens.nl; never copy its texts or images.

## A layer

A context layer lights up a set of buildings that share a piece of history. Add a function to
[`pipeline/layers.py`](pipeline/layers.py) with the `@layer(...)` decorator, with every text in English and Dutch
(`title` / `title_nl`, ...) and group labels as `(key, English, Dutch)`. It returns `{BAG pand id: group}`. Helpers
are there for the common joins: `by_monument({monument number: group})` and `within(polygons, column)`.

Only openly licensed data can go in; add its download to a `s00_fetch_*` step and say which licence it carries. Check
the layer with:

```bash
python -m pipeline.run <name> s05 s03    # counts per group, then the tiles
```
