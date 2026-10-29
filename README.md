# LAYRS: a Dutch city, building by building

Every building standing in a Dutch municipality today, in 3D, coloured by the year it was built and set in its
history, from national open data only. Or one kind of monument across a province, each in its surroundings. Live:

- Amersfoort: https://layrs-amersfoort.pages.dev (with an archaeology mode)
- Maastricht: https://layrs-maastricht.pages.dev
- Dordrecht: https://layrs-dordrecht.pages.dev (with an archaeology mode)
- Zwolle: https://layrs-zwolle.pages.dev (with an archaeology mode)
- Mills in Zuid-Holland: https://layrs-molens-zh.pages.dev (a theme, see below)

- Zie ook de Gouda versie van @coret https://www.goudatijdmachine.nl/layrs/

A non-commercial test. It grew out of Alex Barakov's
[Amsterdam, building by building](https://github.com/alexbarakov/amsterdam-by-building) (MIT), itself inspired by
Sasha Bogachev's [Paris, building by building](https://paris.bogachev.fr); the viewer and the tile format are his.

## How it works

```
national open data ──► pipeline/ (Python) ──► web/data/<city>/ (binary tiles + JSON) ──► web/ (three.js, no build step)
```

Every city has a config in [`cities/`](cities/): its municipality code, the centre of its old town, its periods, the
main streets to label from afar, and the pipeline steps. The pipeline reads and writes `data/<city>/` and
`web/data/<city>/`.

| Step | Source | What it gives |
|---|---|---|
| `s00_fetch_boundary` | PDOK Bestuurlijke Gebieden | the municipality's outline |
| `s00_theme_select` (a theme only) | Referentienetwerk subtree, RCE Elastic projection, PDOK Bestuurlijke Gebieden | the theme's monuments in the province, a disc around each as its 'municipality', the province and its municipalities for the overview |
| `s00_fetch_3dbag`, `s00_fetch_3dbv` | 3D BAG (TU Delft), or else Kadaster's 3D Basisvoorziening | buildings, heights, years; the fallback has no roof shapes. While `data.3dbag.nl` is down (since 2026-10-21) the same release is read as CityJSON from 3D BAG's object storage and rewritten into the GeoPackage layers the later steps read (after [@coret](https://github.com/gouda-tijdmachine/layrs-gtm)) |
| `s00_fetch_water`, `s00_fetch_addresses` | BGT and BAG via PDOK | water, every address with its building |
| `s00_fetch_energy` | RVO via RIVM Atlas Leefomgeving | energy labels |
| `s00_fetch_rce` ([`rce.py`](pipeline/rce.py)) | RCE monument register: its Elastic projection ([elastic-ceo](https://github.com/jolietjakeblues/elastic-ceo)), then SPARQL | monuments on their BAG panden, descriptions, styles, building years, makers and clients, complexes, photos from the RCE image bank, protected townscapes |
| `s00_fetch_wikidata` | Wikidata | names, articles, photos and architects, by BAG pand id and by monument number |
| `s01_load`, `s02_attributes` | | buildings and parts; years cleaned: placeholders, rounded years, the register's earlier dates |
| `s01b_theme_panden` (a theme only) | | each monument on its BAG panden: the register's links, else the pand under or nearest its point |
| `s01c_roofs`, `s01d_spires` | 3D BAG LoD 2.2, AHN | roofs, towers and spires (3D BAG only) |
| `s05_layers` ([`layers.py`](pipeline/layers.py)) | | the context layers: monuments by function (each with a line from the register, the stops of a walk), gables, styles, complexes, protected townscapes, protected heritage |
| `s07_labels` | Nationaal Wegenbestand | street names along their streets |
| `s10_commons`, `s06_wiki` | Wikimedia Commons, Wikipedia | photos (also by address or monument number in the file name), article extracts, the city's own article |
| `s03_tiles`, `s04_water` | | 600 m tiles in 8 packs, per-building attributes, water and land |
| `s13_graph` | | makers, clients, complexes and styles of the monuments, linked to their buildings; architects with their Wikipedia article |
| `s14_search`, `s15_addresses` | | search index, an address per building |
| `s16_register` | | the register's entry per monument for the building card: text, complex, RCE photos |
| `s00_fetch_archeo`, `s17_archeo` | RCE Elastic projection and Referentienetwerk (ABR) | archaeology mode (optional: Amersfoort, Dordrecht, Zwolle): research areas under the city, one layer per ABR period, the deeper the older; archeologische complexen, grondsporen, vondsten; protected sites; a graph of ABR terms |
| `s00_fetch_gemeentelijk` | Wikipedia's lists of municipal monuments (optional, per city) | the municipal monuments, placed on their panden by address and coordinate |
| `s00_fetch_kennisbank` | RCE Kennisbank (kennis.cultureelerfgoed.nl), MediaWiki API and page source | the introductions and articles of the city's national monuments |
| `s00_fetch_dans` | DANS Data Station Archaeology (Dataverse API) | the city's excavation, survey and building-history reports: layer, and boreholes in the archaeology mode |
| `s00_fetch_residents` | Wikipedia (the city's list of natives) and Wikidata | deceased people whose article names the address where they lived or worked |
| `s00_fetch_flood` | LIWO, Rijkswaterstaat (WCS) | maximum flood depth per probability class: the flood and flood-depth layers |
| `s00_fetch_landschap` (optional, Gelderland) | Province of Gelderland, open geodata (WFS) | landscape types around 1850 and now, and the areas of earth-science value: the three landscape layers |

## Run it

Plain Python 3.12 or newer, no virtual environment:

```bash
python -m pip install -r requirements.txt
python -m pipeline.run amersfoort                 # every step; or: ... amersfoort s05 s03, or --from s02
python -m http.server 8642 --directory web        # http://localhost:8642/?city=amersfoort
.\scripts\deploy.ps1 amersfoort                   # dist/amersfoort/ onto Cloudflare Pages, project layrs-amersfoort
```

Raw downloads (`data/`), generated output (`web/data/`) and built sites (`dist/`) are not in the repository: they are
large and rebuilt by the pipeline.

`scripts/build_site.py` gives every file a build can change a URL of its own, so a server may cache them for good: the
data sits in `dist/<city>/data/<city>-<hash>/` (named on the pages as `data-dir`; its `_headers` entry caches it for a
year), and the scripts and styles are linked with `?v=<hash>`. The vendored three.js modules keep plain URLs; after
upgrading three.js, rename its folder.

In the viewer: drag to turn, right-drag or Shift-drag to move, scroll or the buttons on the right to zoom; the
bottom button of those three flies back to the overview the map opens on. The timeline plays the city's growth; with the repeat button on it runs back and forth, resting 10 s at either end.

## Another city

Copy a file in `cities/`, set `label`, `gemeentecode` (the four digits BAG ids start with), `origin` (RD New),
`starts`, `home`, `periods` and `tier1`, and run the pipeline with its name. The register's name for the municipality
is `label`, or `gemeentenaam` when it differs. See [CONTRIBUTING.md](CONTRIBUTING.md).

## A theme instead of a city

A config with a `theme` (see [`cities/molens-zh.json`](cities/molens-zh.json)) follows one kind of monument across a
province: every rijksmonument whose function or type is a term in a subtree of the Referentienetwerk (exported as TriG,
`theme.terms_zip`), each in a disc of `theme.radius` metres of its surroundings. `s00_theme_select` takes the place of
the boundary and RCE steps, `s01b_theme_panden` puts the monuments on their panden, and `theme.facets` become layers
(for mills: type of mill, what it did), classified from the register's terms, Wikidata and the description; a group
no monument falls in is left out, as a layer colours eight groups at most.

The viewer counts the theme's monuments, not the buildings around them: the legend per period, the counter by the
year and the timeline are about the mills. From afar every monument is a marker on a map of the province and its
municipalities (Bestuurlijke Gebieden). The markers follow the map as the buildings do: the year shown, the periods
picked in the legend, the colours of the layer shown. Playing the timeline, each mill appears in the year it was built
with a ring around it; the film gives every mill the same time. Close up, a windmill gets a turning cross of sails, an
illustration: no 3D model of the buildings has sails.

```bash
python -m pipeline.run molens-zh                  # http://localhost:8642/?city=molens-zh
.\scripts\deploy.ps1 molens-zh
```

The mills link to [Allemolens.nl](https://www.allemolens.nl/) of the Vereniging De Hollandsche Molen, credited and
thanked on every card and in About. Their texts and images are their own and are not copied.

## Data decisions

- **Years.** BAG gives every building a construction year but not always a true one: placeholders (1005) are estimated
  from dated neighbours, and round years before 1800 are spread across their rounding step. Where the monument
  register dates a building earlier than BAG, which often records a rebuilding, the register wins: its building years
  where it records them as data, else the first date in its description.
- **Names.** A monument the register leaves unnamed gets a name from its description when that names it plainly
  ("O.L.Vrouwetoren.", VILLA "Rusthof").

## Licence

Code: MIT (see [LICENSE](LICENSE)). Data keeps the licence of its source: 3D BAG and 3D Basisvoorziening CC BY 4.0;
BAG, BGT, NWB, RCE and Wikidata CC0; Wikipedia text CC BY-SA; Wikimedia Commons photos each under their own licence,
credited in the app. The RCE Kennisbank texts fall under the RCE's copyright page (CC0, with the RCE named as the source;
photos marked (c) and third-party content excepted, so no photo is taken from it). The DANS reports are linked, not
copied: only their title, authors, year and periods are shown, and each report keeps its own licence at DANS. LIWO licence: Rijkswaterstaat makes flood data available for
re-use, and CC0 is confirmed for other flood datasets (for example the ROR risk areas, on data.overheid.nl). The licence terms of
the LIWO layer used here, Maximale waterdiepte Nederland, still have to be checked. The Gelderland landscape types
(1850 and now) are public domain (data.overheid.nl). The earth-science areas (aardkundig waardevolle gebieden) are listed
there with an unknown licence and restricted access rights, although the Nationaal Georegister gives no restrictions of use:
ask the province before publishing that layer, or leave `aardkundig` out of `landschap` in the city's config.
