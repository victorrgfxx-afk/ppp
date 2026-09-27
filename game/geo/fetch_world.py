#!/usr/bin/env python3
"""Downloads the extra open data for the enlarged map (+-8 km playable, far ring +-20 km) into geo/raw.

  * OpenStreetMap: api.openstreetmap.org/api/0.6/map, adaptive tiles (split while the API refuses) (ODbL)
  * Terrain Tiles on AWS (terrarium z15)             - whole +-8.4 km square
  * Sentinel-2 cloudless 2023 by EOX (z14 world, z11 far ring) (CC BY-NC-SA 4.0)
  * Copernicus GLO-30 DSM: 1x1 degree COG tiles merged over the far ring (windowed reads, rasterio)
"""
import os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from fetch_raw import RAW, get, tiles

WORLD = (45.0274, 25.5601, 45.2409, 25.8623)      # rotated +-8.4 km square (lat0, lon0, lat1, lon1)
FAR = (44.88, 25.35, 45.39, 26.08)                 # rotated +-20 km square


def osm_tile(a, b, c, d, depth=0):
    """bbox lon0, lat0, lon1, lat1; splits in four when the API answers 400 (too many nodes)"""
    path = os.path.join(RAW, 'osm', f'w_{a:.5f}_{b:.5f}_{c:.5f}_{d:.5f}.xml')
    if os.path.exists(path) and os.path.getsize(path) > 500: return 1
    url = f'https://api.openstreetmap.org/api/0.6/map?bbox={a:.5f},{b:.5f},{c:.5f},{d:.5f}'
    for k in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'strada-prahova-geo/1.0 (personal game)'})
            with urllib.request.urlopen(req, timeout=180) as r: data = r.read()
            open(path, 'wb').write(data)
            print('osm', depth, f'{len(data) / 1e6:.1f} MB', flush=True)
            return 1
        except urllib.error.HTTPError as e:
            if e.code in (400, 509) and depth < 6:
                mx, my = (a + c) / 2, (b + d) / 2
                return sum(osm_tile(*q, depth=depth + 1) for q in ((a, b, mx, my), (mx, b, c, my), (a, my, mx, d), (mx, my, c, d)))
            print('retry', e.code, url, flush=True); time.sleep(2 ** k * 3)
        except Exception as e:
            print('retry', e, flush=True); time.sleep(2 ** k * 3)
    raise RuntimeError(url)


def cop_mosaic():
    out = os.path.join(RAW, 'cop30_far.npy')
    if os.path.exists(out): return
    import numpy as np, rasterio
    from rasterio.merge import merge
    srcs = []
    for la in range(int(FAR[0]), int(FAR[2]) + 1):
        for lo in range(int(FAR[1]), int(FAR[3]) + 1):
            n = f'Copernicus_DSM_COG_10_N{la:02d}_00_E{lo:03d}_00_DEM'
            srcs.append(rasterio.open(f'/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif'))
    # 2 arc-seconds (~60 m) is plenty for the ring beyond the playable map
    arr, tr = merge(srcs, bounds=(FAR[1], FAR[0], FAR[3], FAR[2]), res=(2 / 3600, 2 / 3600), nodata=-9999)
    np.save(out, arr[0].astype(np.float32))
    open(os.path.join(RAW, 'cop30_far_transform.txt'), 'w').write(repr(tuple(tr)[:6]))
    print('copernicus', arr.shape)


if __name__ == '__main__':
    what = sys.argv[1:] or ['dem', 's2', 'cop', 'osm']
    if 'dem' in what:
        jobs = [(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/{x}/{y}.png', os.path.join(RAW, 'dem', f'15_{x}_{y}.png')) for x, y in tiles(WORLD, 15)]
        with ThreadPoolExecutor(16) as ex: list(ex.map(lambda j: get(*j), jobs))
        print('dem tiles', len(jobs))
    if 's2' in what:
        jobs = [(f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg', os.path.join(RAW, 's2', str(z), f'{x}_{y}.jpg'))
                for z, bb in ((14, WORLD), (11, FAR)) for x, y in tiles(bb, z)]
        with ThreadPoolExecutor(8) as ex: list(ex.map(lambda j: get(*j), jobs))
        print('s2 tiles', len(jobs))
    if 'cop' in what:
        cop_mosaic()
    if 'osm' in what:
        la0, lo0, la1, lo1 = WORLD
        K = 8
        n = 0
        for i in range(K):
            for j in range(K):
                n += osm_tile(lo0 + (lo1 - lo0) * i / K, la0 + (la1 - la0) * j / K, lo0 + (lo1 - lo0) * (i + 1) / K, la0 + (la1 - la0) * (j + 1) / K)
        print('osm tiles', n)
    print('ok')
