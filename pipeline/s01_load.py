"""Load 3D BAG tiles, clip to the municipality, keep one row per pand + LoD1.3 parts.

Without 3D BAG tiles (raw/3dbag/) the 3D Basisvoorziening sheets (raw/3dbv/, s00_fetch_3dbv) stand in: the same
columns, filled from its roof statistics, with each pand as its own single part.
"""
import glob
import geopandas as gpd
import pandas as pd
import pyogrio
from .city import DATA

PAND_COLS = ["identificatie", "oorspronkelijkbouwjaar", "status", "b3_bouwlagen",
             "b3_h_maaiveld", "b3_h_dak_50p", "b3_h_dak_70p", "b3_h_dak_max",
             "b3_dak_type", "b3_opp_grond", "b3_kwaliteitsindicator", "b3_pw_datum"]

GONE = {"Pand gesloopt", "Niet gerealiseerd pand", "Pand ten onrechte opgevoerd", "Bouwvergunning verleend"}


def from_3dbv(area):
    """panden and parts in 3D BAG's columns, from the 3D Basisvoorziening (one LoD 1.2/1.3 prism per pand). Each sheet
    is read only inside the area (the municipality, or a theme's discs): a sheet holds 5 x 6.25 km of buildings."""
    x = pd.concat(pyogrio.read_dataframe(f, mask=area) for f in sorted(glob.glob(f"{DATA}/raw/3dbv/*.gpkg")))
    x = x[x.eindgeldigheid.isna() & ~x.status.isin(GONE)]
    x = x.sort_values("voorkomenidentificatie").drop_duplicates("identificatie", keep="last")
    x["identificatie"] = "NL.IMBAG.Pand." + x.identificatie
    p = gpd.GeoDataFrame(dict(
        identificatie=x.identificatie, oorspronkelijkbouwjaar=x.oorspronkelijkbouwjaar, status=x.status,
        b3_bouwlagen=float("nan"), b3_h_maaiveld=x.rf_h_ground, b3_h_dak_50p=x.rf_h_roof_50p,
        b3_h_dak_70p=x.rf_h_roof_70p, b3_h_dak_max=x.rf_h_roof_max, b3_dak_type=x.rf_roof_type,
        b3_opp_grond=x.geometry.area, b3_kwaliteitsindicator=x.rf_success, b3_pw_datum=x.rf_pc_year),
        geometry=x.geometry.values, crs=28992)
    q = gpd.GeoDataFrame(dict(
        identificatie=x.identificatie, b3_pand_deel_id=0, b3_dd_id=0, b3_h_min=x.rf_h_roof_min,
        b3_h_50p=x.rf_h_roof_50p, b3_h_70p=x.rf_h_roof_70p, b3_h_max=x.rf_h_roof_max),
        geometry=x.geometry.values, crs=28992)
    return p, q


def main():
    boundary = gpd.read_file(f"{DATA}/raw/boundary.json").set_crs(28992, allow_override=True)
    city = boundary.union_all()
    panden, parts = [], []
    for f in sorted(glob.glob(f"{DATA}/raw/3dbag/*.gpkg")):
        p = pyogrio.read_dataframe(f, layer="pand", columns=PAND_COLS)
        q = pyogrio.read_dataframe(f, layer="lod13_2d")
        panden.append(p); parts.append(q)
    if panden:
        p = pd.concat(panden).drop_duplicates("identificatie")
        p = gpd.GeoDataFrame(p, geometry="geometry", crs=28992)
        q = gpd.GeoDataFrame(pd.concat(parts), geometry="geometry", crs=28992)
    else:
        print("no 3D BAG tiles: building from the 3D Basisvoorziening")
        p, q = from_3dbv(city)
    p = p[p.representative_point().within(city)]
    q = q[q.identificatie.isin(p.identificatie)].drop_duplicates(["identificatie", "b3_pand_deel_id", "b3_dd_id"])
    p.to_parquet(f"{DATA}/panden.parquet"); q.to_parquet(f"{DATA}/parts.parquet")
    print(len(p), "panden;", len(q), "lod13 parts")

if __name__ == "__main__":
    main()
