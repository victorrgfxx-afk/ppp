#!/usr/bin/env python3
"""Downloads the open data used by build_geo.py into geo/raw (not committed: ~40 MB).

  * OpenStreetMap: api.openstreetmap.org/api/0.6/map, 4 bbox quadrants (ODbL)
  * Terrain Tiles on AWS (terrarium, z15)            - s3.amazonaws.com/elevation-tiles-prod
  * Copernicus GLO-30 DSM (COG, windowed read)       - copernicus-dem-30m.s3.amazonaws.com (needs rasterio)
  * Sentinel-2 cloudless 2023 by EOX (z15 + z12)     - tiles.maps.eox.at (CC BY-NC-SA 4.0)
"""
import math, os, time, urllib.request
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw')
BBOX = (45.094, 25.655, 45.175, 25.768)          # lat0, lon0, lat1, lon1: game square +-3 km (rotated 42 deg)
FAR = (45.02, 25.54, 45.25, 25.88)               # far ring, radius 12 km


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
    K = 4                                           # 4 x 4 map calls (the API caps nodes per call)
    for i in range(K):
        for j in range(K):
            a, c = lo0 + (lo1 - lo0) * i / K, lo0 + (lo1 - lo0) * (i + 1) / K
            b, d = la0 + (la1 - la0) * j / K, la0 + (la1 - la0) * (j + 1) / K
            get(f'https://api.openstreetmap.org/api/0.6/map?bbox={a:.5f},{b:.5f},{c:.5f},{d:.5f}', os.path.join(RAW, 'osm', f't{i}{j}.xml'))
    for x, y in tiles((BBOX[0] - 0.004, BBOX[1] - 0.006, BBOX[2] + 0.004, BBOX[3] + 0.006), 15):
        get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/{x}/{y}.png', os.path.join(RAW, 'dem', f'15_{x}_{y}.png'))
    for z, bb in ((15, BBOX), (12, FAR)):
        for x, y in tiles(bb, z):
            get(f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg', os.path.join(RAW, 's2', str(z), f'{x}_{y}.jpg'))
    if not os.path.exists(os.path.join(RAW, 'cop30.npy')):
        import numpy as np, rasterio
        from rasterio.windows import from_bounds
        url = '/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N45_00_E025_00_DEM/Copernicus_DSM_COG_10_N45_00_E025_00_DEM.tif'
        with rasterio.open(url) as ds:
            w = from_bounds(FAR[1], FAR[0], FAR[3], FAR[2], ds.transform)
            np.save(os.path.join(RAW, 'cop30.npy'), ds.read(1, window=w))
            open(os.path.join(RAW, 'cop30_transform.txt'), 'w').write(repr(tuple(ds.window_transform(w))[:6]))
    print('ok')
