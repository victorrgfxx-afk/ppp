"""Horizon ring: the real relief and its colour from 20 to 100 km round the map (the Subcarpathian hills, the Bucegi,
Baiului, Ciucaș and Leaota mountains to the north, the Ploiești plain to the south).

  * Terrain Tiles on AWS (terrarium z10, ~110 m)       - s3.amazonaws.com/elevation-tiles-prod
  * Sentinel-2 cloudless 2023 by EOX (z10, ~110 m)      - tiles.maps.eox.at (CC BY-NC-SA 4.0)

Out to 100 km the plane of the map (build_geo.py: a local equirectangular frame) would put the peaks up to ~1.5 km off
their bearings; here the game frame is an azimuthal equidistant projection from the map's origin: every point keeps its
true distance and bearing (the map's own +-20 km agree with it to ~60 m at the seam). The Earth's curvature is applied
in the shader, from the camera (terrain.js).

-> assets/geo/horizon.json: heights (dm, over the street's level h0) on a 401 x 401 grid of 500 m over +-100 km
   assets/geo/horizon.jpg:  2048 x 2048 colour over +-100 km
"""
import os, math, json, base64, urllib.request, concurrent.futures as cf
import numpy as np, cv2
import build_geo as bg

EXT, N, TEX = 100000.0, 401, 2048
R_EARTH = 6371008.8
DEM_Z, S2_Z = 10, 10


def game_to_ll_aeqd(x, z):
    """game frame (x, z) -> (lat, lon), azimuthal equidistant from the map's origin"""
    zz = np.asarray(z, np.float64) - bg.Z_SHIFT
    x = np.asarray(x, np.float64)
    e = -x * bg.C_ + zz * bg.S_
    n = x * bg.S_ + zz * bg.C_
    d = np.hypot(e, n) / R_EARTH
    brg = np.arctan2(e, n)
    p1, l1 = math.radians(bg.LAT0), math.radians(bg.LON0)
    p2 = np.arcsin(np.sin(p1) * np.cos(d) + np.cos(p1) * np.sin(d) * np.cos(brg))
    l2 = l1 + np.arctan2(np.sin(brg) * np.sin(d) * np.cos(p1), np.cos(d) - np.sin(p1) * np.sin(p2))
    return np.degrees(p2), np.degrees(l2)


def tiles_for(lat0, lat1, lon0, lon1, z):
    x0, y1 = bg.tile_frac(lat0, lon0, z)
    x1, y0 = bg.tile_frac(lat1, lon1, z)
    return [(x, y) for x in range(int(x0) - 1, int(x1) + 2) for y in range(int(y0) - 1, int(y1) + 2)]


def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return True
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for _ in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = r.read()
            with open(path, 'wb') as f:
                f.write(data)
            return True
        except Exception:
            continue
    return False


def mosaic(tiles, path_of, decode):
    xs = sorted({x for x, _ in tiles}); ys = sorted({y for _, y in tiles})
    M = None
    for x, y in tiles:
        a = decode(path_of(x, y))
        if M is None:
            M = np.zeros((len(ys) * 256, len(xs) * 256) + a.shape[2:], a.dtype)
        j, i = ys.index(y), xs.index(x)
        M[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = a
    return M, xs[0], ys[0]


def main():
    # the lat / lon box of the +-100 km square (with its corners)
    v = np.linspace(-EXT * 1.42, EXT * 1.42, 9)
    X, Z = np.meshgrid(v, v)
    la, lo = game_to_ll_aeqd(X, Z)
    box = (la.min(), la.max(), lo.min(), lo.max())
    dem_t = tiles_for(box[0], box[1], box[2], box[3], DEM_Z)
    s2_t = tiles_for(box[0], box[1], box[2], box[3], S2_Z)
    dem_p = lambda x, y: os.path.join(bg.RAW, 'dem10', f'{DEM_Z}_{x}_{y}.png')
    s2_p = lambda x, y: os.path.join(bg.RAW, 's2', str(S2_Z), f'{x}_{y}.jpg')
    jobs = [(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{DEM_Z}/{x}/{y}.png', dem_p(x, y)) for x, y in dem_t]
    jobs += [(f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{S2_Z}/{y}/{x}.jpg', s2_p(x, y)) for x, y in s2_t]
    with cf.ThreadPoolExecutor(12) as ex:
        ok = list(ex.map(lambda j: get(*j), jobs))
    print('tiles', len(dem_t), 'dem', len(s2_t), 's2, missing', ok.count(False))

    # relief: terrarium -> metres, sampled on the game grid
    dec_dem = lambda p: (lambda a: a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)(cv2.imread(p, cv2.IMREAD_COLOR)[..., ::-1].astype(np.float32))
    M, x0, y0 = mosaic(dem_t, dem_p, dec_dem)
    gv = np.linspace(-EXT, EXT, N)
    GX, GZ = np.meshgrid(gv, gv)
    la, lo = game_to_ll_aeqd(GX, GZ)
    TX, TY = bg.tile_frac(la, lo, DEM_Z)
    H = cv2.remap(M, ((TX - x0) * 256 - 0.5).astype(np.float32), ((TY - y0) * 256 - 0.5).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    G = json.load(open(os.path.join(bg.OUT, 'geo.json')))
    h0 = G['meta']['origin']['h0']
    Y = np.clip(np.round((H - h0) * 10), -32768, 32767).astype('<i2')
    with open(os.path.join(bg.OUT, 'horizon.json'), 'w') as f:
        json.dump({'n': N, 'ext': EXT, 'scale': 10, 'b64': base64.b64encode(Y.tobytes()).decode()}, f)
    print('relief', round(float(H.min())), '..', round(float(H.max())), 'm; peak at',
          np.unravel_index(int(np.argmax(H)), H.shape))

    # colour
    S, sx0, sy0 = mosaic(s2_t, s2_p, lambda p: cv2.imread(p, cv2.IMREAD_COLOR))
    tv = np.linspace(-EXT, EXT, TEX)
    TXg, TZg = np.meshgrid(tv, tv)
    la, lo = game_to_ll_aeqd(TXg, TZg)
    TX, TY = bg.tile_frac(la, lo, S2_Z)
    C = cv2.remap(S, ((TX - sx0) * 256 - 0.5).astype(np.float32), ((TY - sy0) * 256 - 0.5).astype(np.float32), cv2.INTER_LINEAR)
    cv2.imwrite(os.path.join(bg.OUT, 'horizon.jpg'), C, [cv2.IMWRITE_JPEG_QUALITY, 86])
    print('horizon.json', os.path.getsize(os.path.join(bg.OUT, 'horizon.json')) // 1024, 'KB, horizon.jpg',
          os.path.getsize(os.path.join(bg.OUT, 'horizon.jpg')) // 1024, 'KB')


if __name__ == '__main__':
    main()
