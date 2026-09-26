#!/usr/bin/env python3
"""Downloads the open data used by build_geo.py into geo/raw (not committed: ~40 MB).

  * OpenStreetMap: api.openstreetmap.org/api/0.6/map, 4 bbox quadrants (ODbL)
  * Terrain Tiles on AWS (terrarium, z15)            - s3.amazonaws.com/elevation-tiles-prod
  * Copernicus GLO-30 DSM (COG, windowed read)       - copernicus-dem-30m.s3.amazonaws.com (needs rasterio)
  * Sentinel-2 cloudless 2023 by EOX (z15 + z12)     - tiles.maps.eox.at (CC BY-NC-SA 4.0)
"""
import math, os, time, urllib.request
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw')
BBOX = (45.108, 25.676, 45.160, 25.752)          # lat0, lon0, lat1, lon1


def get(url, path, tries=5):
    if os.path.exists(path) and os.path.getsize(path) > 500: return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'strada-prahova-geo/1.0 (personal game)'})
            with urllib.request.urlopen(req, timeout=120) as r, open(path, 'wb') as f: f.write(r.read())
            return
        except Exception as e:
            print('retry', url, e); time.sleep(2 ** k)
    raise RuntimeError(url)


def tile(lat, lon, z):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def tiles(bbox, z):
    x0, y1 = tile(bbox[0], bbox[1], z); x1, y0 = tile(bbox[2], bbox[3], z)
    return [(x, y) for x in range(int(x0), int(x1) + 1) for y in range(int(y0), int(y1) + 1)]


if __name__ == '__main__':
    la0, lo0, la1, lo1 = BBOX
    lam, lom = (la0 + la1) / 2, (lo0 + lo1) / 2
    for i, (a, b, c, d) in enumerate([(lo0, la0, lom, lam), (lom, la0, lo1, lam), (lo0, lam, lom, la1), (lom, lam, lo1, la1)]):
        get(f'https://api.openstreetmap.org/api/0.6/map?bbox={a},{b},{c},{d}', os.path.join(RAW, 'osm', f'q{i + 1}.xml'))
    for x, y in tiles((45.095, 25.668, 45.165, 25.772), 15):
        get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/{x}/{y}.png', os.path.join(RAW, 'dem', f'15_{x}_{y}.png'))
    for z, bb in ((15, BBOX), (12, (45.05, 25.58, 45.22, 25.84))):
        for x, y in tiles(bb, z):
            get(f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg', os.path.join(RAW, 's2', str(z), f'{x}_{y}.jpg'))
    if not os.path.exists(os.path.join(RAW, 'cop30.npy')):
        import numpy as np, rasterio
        from rasterio.windows import from_bounds
        url = '/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N45_00_E025_00_DEM/Copernicus_DSM_COG_10_N45_00_E025_00_DEM.tif'
        with rasterio.open(url) as ds:
            w = from_bounds(25.60, 45.06, 25.82, 45.21, ds.transform)
            np.save(os.path.join(RAW, 'cop30.npy'), ds.read(1, window=w))
            open(os.path.join(RAW, 'cop30_transform.txt'), 'w').write(repr(tuple(ds.window_transform(w))[:6]))
    print('ok')
