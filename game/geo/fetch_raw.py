#!/usr/bin/env python3
"""Downloads the open data used by build_geo.py into geo/raw (not committed: ~40 MB).

  * OpenStreetMap: api.openstreetmap.org/api/0.6/map, 4 bbox quadrants (ODbL)
  * Terrain Tiles on AWS (terrarium, z15)            - s3.amazonaws.com/elevation-tiles-prod
  * Copernicus GLO-30 DSM (COG, windowed read)       - copernicus-dem-30m.s3.amazonaws.com (needs rasterio)
  * FABDEM V1-2 (Copernicus GLO-30 with forests and buildings removed; Hawker et al. 2022, CC BY-NC-SA 4.0)
    - data.bris.ac.uk: the N45E025 tile read out of its 2 GB zip by HTTP range requests (~27 MB fetched)
  * Sentinel-2 cloudless 2023 by EOX (z15 + z12)     - tiles.maps.eox.at (CC BY-NC-SA 4.0)
  * land cover of the trees, 10 m, windows over the playable world (exportImage of the EEA image services):
    - Copernicus HRL Forest Type 2018 (broadleaved / coniferous forest, FAO-like: 0.5 ha, no urban or farm trees)
    - Copernicus HRL Tree Cover Density 2018 (0-100 %)
    - Copernicus CLC+ Backbone 2021 (needle / broadleaved trees, low woody plants, grass, arable, sealed ...)
      (Copernicus Land Monitoring Service, EEA: free, full and open data policy)
    - National 10 m Forest Tree-Genus and Stand-Composition Map of Romania (Keskes & Nita 2026, Zenodo 21786853,
      CC BY 4.0; reference year 2025): 22 classes, pure (>= 80 %) or dominant (50-80 %) Fagus, Quercus, Carpinus,
      Abies, Picea, Pinus, Populus, Robinia, Salix, Tilia ... (COG, windowed read)
"""
import math, os, time, urllib.request
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw')
BBOX = (45.094, 25.655, 45.175, 25.768)          # lat0, lon0, lat1, lon1: game square +-3 km (rotated 42 deg)
FAR = (45.02, 25.54, 45.25, 25.88)               # far ring, radius 12 km
WORLD = (45.028, 25.562, 45.240, 25.860)         # playable world +-8 km (rotated 42 deg) and a 200 m margin


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
    if not os.path.exists(os.path.join(RAW, 'fabdem.npy')):
        import io, zipfile, numpy as np, rasterio
        from rasterio.windows import from_bounds
        url = 'https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/N40E020-N50E030_FABDEM_V1-2.zip'

        class Remote(io.RawIOBase):                  # a seekable file over HTTP range requests
            def __init__(s):
                s.pos = 0
                s.size = int(urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=60).headers['Content-Length'])
            def seekable(s): return True
            def readable(s): return True
            def tell(s): return s.pos
            def seek(s, off, whence=0):
                s.pos = off if whence == 0 else s.pos + off if whence == 1 else s.size + off
                return s.pos
            def read(s, n=-1):
                if s.pos >= s.size or n == 0: return b''
                end = s.size - 1 if n is None or n < 0 else min(s.size, s.pos + n) - 1
                d = urllib.request.urlopen(urllib.request.Request(url, headers={'Range': f'bytes={s.pos}-{end}'}), timeout=300).read()
                s.pos += len(d)
                return d
            def readinto(s, b):
                d = s.read(len(b)); b[:len(d)] = d
                return len(d)
        tif = os.path.join(RAW, 'N45E025_FABDEM_V1-2.tif')
        if not os.path.exists(tif):
            open(tif, 'wb').write(zipfile.ZipFile(Remote()).read('N45E025_FABDEM_V1-2.tif'))
        with rasterio.open(tif) as ds:
            w = from_bounds(FAR[1], FAR[0], FAR[3], FAR[2], ds.transform)
            np.save(os.path.join(RAW, 'fabdem.npy'), ds.read(1, window=w))
            open(os.path.join(RAW, 'fabdem_transform.txt'), 'w').write(repr(tuple(ds.window_transform(w))[:6]))
    # ---- land cover of the trees (10 m): raw/lc_<name>.npy + lc_<name>_t.txt (transform, crs)
    import numpy as np
    from rasterio.warp import transform as reproject_pts

    def lc_box(crs):
        LA, LO = np.meshgrid(np.linspace(WORLD[0], WORLD[2], 9), np.linspace(WORLD[1], WORLD[3], 9))
        x, y = map(np.array, reproject_pts('EPSG:4326', crs, LO.ravel().tolist(), LA.ravel().tolist()))
        return np.floor(x.min() / 10) * 10, np.floor(y.min() / 10) * 10, np.ceil(x.max() / 10) * 10, np.ceil(y.max() / 10) * 10

    def lc_save(name, A, t, crs):
        np.save(os.path.join(RAW, f'lc_{name}.npy'), A)
        open(os.path.join(RAW, f'lc_{name}_t.txt'), 'w').write(repr((tuple(t)[:6], crs)))
    EEA = 'https://image.discomap.eea.europa.eu/arcgis/rest/services/'
    for name, svc, crs in (('fty', 'GioLandPublic/HRL_ForestType_2018', 'EPSG:3857'), ('tcd', 'GioLandPublic/HRL_TreeCoverDensity_2018', 'EPSG:3857'),
                           ('clcp', 'CLC_plus/CLMS_CLCplus_RASTER_2021_010m_eu', 'EPSG:3035')):
        if os.path.exists(os.path.join(RAW, f'lc_{name}.npy')): continue
        import rasterio
        x0, y0, x1, y1 = lc_box(crs)
        tif = os.path.join(RAW, f'lc_{name}.tif')
        get(f'{EEA}{svc}/ImageServer/exportImage?bbox={x0},{y0},{x1},{y1}&bboxSR={crs[5:]}&imageSR={crs[5:]}'
            f'&size={int((x1 - x0) / 10)},{int((y1 - y0) / 10)}&format=tiff&pixelType=U8&interpolation=RSP_NearestNeighbor&f=image', tif)
        with rasterio.open(tif) as ds: lc_save(name, ds.read(1), ds.transform, crs)
    if not os.path.exists(os.path.join(RAW, 'lc_genus.npy')):
        import rasterio
        from rasterio.windows import from_bounds
        os.environ.setdefault('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '.tif,/content'); os.environ.setdefault('GDAL_HTTP_MULTIRANGE', 'NO')
        url = '/vsicurl/https://zenodo.org/api/records/21786853/files/Romania_Forest_Tree_Genera_Stand_Composition_10m.tif/content'
        with rasterio.open(url) as ds:
            w = from_bounds(*lc_box('EPSG:3857'), ds.transform).round_offsets().round_lengths()
            lc_save('genus', ds.read(1, window=w), ds.window_transform(w), 'EPSG:3857')
    print('ok')
