#!/usr/bin/env bash
# Descarca datele brute pentru build_zona.py in tools/data/.
#   OpenStreetMap  (c) contribuitorii OpenStreetMap, ODbL
#   Copernicus GLO-30 DEM (c) DLR e.V. 2010-2014 si (c) Airbus Defence and Space GmbH 2014-2018,
#   furnizat prin programul COPERNICUS al Uniunii Europene si ESA
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data && cd data
UA="strada-3d/1.0 (joc 3D, Strada Garii Campina)"

# cartierul (bbox lon_min,lat_min,lon_max,lat_max in jurul pinului 45.13403 N, 25.71109 E)
curl -fsS -m 90 -A "$UA" -o area.osm \
  "https://api.openstreetmap.org/api/0.6/map?bbox=25.7020,45.1285,25.7200,45.1395"
# multipoligonul albiei Prahovei (relatia 1308475), complet
curl -fsS -m 120 -A "$UA" -o rel_water_full.osm \
  "https://api.openstreetmap.org/api/0.6/relation/1308475/full"
# placa DEM 1x1 grad care contine zona (~42 MB)
T=Copernicus_DSM_COG_10_N45_00_E025_00_DEM
curl -fsS -m 600 -o cop.tif "https://copernicus-dem-30m.s3.amazonaws.com/$T/$T.tif"

ls -la
