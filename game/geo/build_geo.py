#!/usr/bin/env python3
"""Builds the real-world dataset for the geo version of the game (Strada Gării, Poiana Câmpina).

Open data sources (downloaded into geo/raw by fetch_raw.sh):
  * OpenStreetMap (c) OpenStreetMap contributors, ODbL - buildings, roads, railway, river, landuse, power lines
  * Terrain Tiles on AWS (terrarium, z15; EU-DEM / SRTM based)   - near terrain (+-1.5 km)
  * Copernicus GLO-30 DSM (c) ESA / DLR / Airbus                  - far terrain ring (+-8 km)
  * Sentinel-2 cloudless 2023 by EOX (CC BY-NC-SA 4.0, modified Copernicus Sentinel data 2023) - ground colour

Game frame: metres, y up, +z along Strada Gării towards NE (bearing 42.02 deg), +x towards NW.
The origin lies on the street axis in front of the photographed house, Strada Gării 123H
(mapped in OSM as way 264516816, housenumber 123, without the letter).
Outputs go to ../assets/geo.
"""
import base64, json, math, os, glob, xml.etree.ElementTree as ET
import numpy as np, cv2
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
OUT = os.path.join(HERE, '..', 'assets', 'geo')

LAT0, LON0 = 45.13403, 25.71109             # the user's pin on Strada Gării
THETA = math.radians(42.02)                 # bearing of the street axis (from OSM way 16947629)
Z_SHIFT = -14.6                             # game origin = 14.6 m NE of the pin (house no. 123)
KX = 111320 * math.cos(math.radians(LAT0))
KY = 111132.954 - 559.822 * math.cos(2 * math.radians(LAT0))
S_, C_ = math.sin(THETA), math.cos(THETA)

EXT, STEP = 3000.0, 5.0                     # near grid: +-3 km, 5 m cells
N = int(2 * EXT / STEP) + 1
FAR_EXT, FAR_N = 12000.0, 385               # far ring grid (62.5 m cells), radius 12 km
HERO_ID = '264516816'
GARII_ID = '16947629'                        # straight part of Strada Gării (built by hand in the game)


def write_b64(name, arr):
    """little-endian binary as base64 inside JSON (artifact hosting serves only web types)"""
    with open(os.path.join(OUT, name), 'w') as f:
        json.dump({'dtype': str(arr.dtype), 'b64': base64.b64encode(arr.tobytes()).decode()}, f)


def ll_to_game(lat, lon):
    e = (np.asarray(lon) - LON0) * KX
    n = (np.asarray(lat) - LAT0) * KY
    return -e * C_ + n * S_, e * S_ + n * C_ + Z_SHIFT


def game_to_ll(x, z):
    zz = np.asarray(z) - Z_SHIFT
    x = np.asarray(x)
    e = -x * C_ + zz * S_
    n = x * S_ + zz * C_
    return LAT0 + n / KY, LON0 + e / KX


def grid_xz(n, ext):
    v = np.linspace(-ext, ext, n)
    return np.meshgrid(v, v)                 # X[j, i], Z[j, i]


# ------------------------------------------------------------------ OSM
def load_osm():
    nodes, ways, rels = {}, {}, {}
    for f in sorted(glob.glob(os.path.join(RAW, 'osm', '*.xml'))):
        for e in ET.parse(f).getroot():
            tg = {c.get('k'): c.get('v') for c in e if c.tag == 'tag'}
            i = e.get('id')
            if e.tag == 'node':
                nodes[i] = (float(e.get('lat')), float(e.get('lon')), tg)
            elif e.tag == 'way':
                ways[i] = ([c.get('ref') for c in e if c.tag == 'nd'], tg)
            elif e.tag == 'relation':
                rels[i] = ([(c.get('type'), c.get('ref'), c.get('role')) for c in e if c.tag == 'member'], tg)
    return nodes, ways, rels


class OSM:
    def __init__(self):
        self.nodes, self.ways, self.rels = load_osm()
        ids = list(self.nodes)
        lat = np.array([self.nodes[i][0] for i in ids]); lon = np.array([self.nodes[i][1] for i in ids])
        x, z = ll_to_game(lat, lon)
        self.xz = {i: (float(a), float(b)) for i, a, b in zip(ids, x, z)}
        # the hand-built street lies exactly on x = 0: snap the OSM axis (<= 0.3 m off) onto it
        for nid in self.ways[GARII_ID][0]:
            self.xz[nid] = (0.0, self.xz[nid][1])

    def pts(self, wid):
        return np.array([self.xz[n] for n in self.ways[wid][0] if n in self.xz])

    def rings(self, rid):
        """outer and inner rings of a multipolygon relation (joins open ways)"""
        out = {'outer': [], 'inner': []}
        segs = {'outer': [], 'inner': []}
        for typ, ref, role in self.rels[rid][0]:
            if typ == 'way' and ref in self.ways:
                segs['inner' if role == 'inner' else 'outer'].append(list(self.ways[ref][0]))
        for role, ss in segs.items():
            ss = [s for s in ss if len(s) > 1]
            while ss:
                ring = ss.pop(0)
                changed = True
                while ring[0] != ring[-1] and changed:
                    changed = False
                    for k, s in enumerate(ss):
                        if s[0] == ring[-1]: ring += s[1:]
                        elif s[-1] == ring[-1]: ring += s[::-1][1:]
                        elif s[-1] == ring[0]: ring = s[:-1] + ring
                        elif s[0] == ring[0]: ring = s[::-1][:-1] + ring
                        else: continue
                        ss.pop(k); changed = True; break
                p = np.array([self.xz[n] for n in ring if n in self.xz])
                if len(p) >= 3: out[role].append(p)
        return out

    def areas(self, pred):
        """closed ways + multipolygons matching pred(tags) -> list of (outer rings, inner rings, tags, id)"""
        res = []
        for wid, (nd, tg) in self.ways.items():
            if len(nd) > 3 and nd[0] == nd[-1] and pred(tg):
                res.append(([self.pts(wid)], [], tg, wid))
        for rid, (m, tg) in self.rels.items():
            if tg.get('type') == 'multipolygon' and pred(tg):
                r = self.rings(rid)
                if r['outer']: res.append((r['outer'], r['inner'], tg, 'r' + rid))
        return res


# ------------------------------------------------------------------ rasters
def tile_frac(lat, lon, z):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n


def terrarium_sampler():
    files = glob.glob(os.path.join(RAW, 'dem', '15_*.png'))
    xs = sorted({int(os.path.basename(f).split('_')[1]) for f in files})
    ys = sorted({int(os.path.basename(f).split('_')[2][:-4]) for f in files})
    M = np.zeros((len(ys) * 256, len(xs) * 256), np.float32)
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            a = cv2.imread(os.path.join(RAW, 'dem', f'15_{x}_{y}.png'), cv2.IMREAD_COLOR)[..., ::-1].astype(np.float32)
            M[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    x0, y0 = xs[0], ys[0]

    def sample(lat, lon):
        X, Y = tile_frac(lat, lon, 15)
        # terrarium pixels are centred at +0.5
        return cv2.remap(M, ((X - x0) * 256 - 0.5).astype(np.float32), ((Y - y0) * 256 - 0.5).astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return sample


def cop_sampler():
    C = np.load(os.path.join(RAW, 'cop30.npy')).astype(np.float32)
    t = eval(open(os.path.join(RAW, 'cop30_transform.txt')).read())   # (a, b, c, d, e, f) affine
    a, _, c, _, e, f = t

    def sample(lat, lon):
        return cv2.remap(C, ((lon - c) / a - 0.5).astype(np.float32), ((lat - f) / e - 0.5).astype(np.float32), cv2.INTER_LINEAR)
    return sample


def s2_mosaic_sampler(z):
    files = glob.glob(os.path.join(RAW, 's2', str(z), '*.jpg'))
    xs = sorted({int(os.path.basename(f).split('_')[0]) for f in files})
    ys = sorted({int(os.path.basename(f).split('_')[1][:-4]) for f in files})
    M = np.zeros((len(ys) * 256, len(xs) * 256, 3), np.uint8)
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            M[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = cv2.imread(os.path.join(RAW, 's2', str(z), f'{x}_{y}.jpg'))
    x0, y0 = xs[0], ys[0]

    def sample(lat, lon):
        X, Y = tile_frac(lat, lon, z)
        return cv2.remap(M, ((X - x0) * 256 - 0.5).astype(np.float32), ((Y - y0) * 256 - 0.5).astype(np.float32), cv2.INTER_LINEAR)
    return sample


def to_px(p, n, ext):
    """game xz -> pixel coords of an n x n raster covering [-ext, ext]^2 (row = z)"""
    s = (n - 1) / (2 * ext)
    return np.stack([(p[:, 0] + ext) * s, (p[:, 1] + ext) * s], 1)


def fill_areas(n, ext, areas, value=1.0):
    m = np.zeros((n, n), np.float32)
    for outers, inners, *_ in areas:
        for r in outers:
            cv2.fillPoly(m, [np.round(to_px(r, n, ext) * 8).astype(np.int32)], value, cv2.LINE_8, 3)
        for r in inners:
            cv2.fillPoly(m, [np.round(to_px(r, n, ext) * 8).astype(np.int32)], 0.0, cv2.LINE_8, 3)
    return m


def draw_lines(n, ext, lines, width_m, value=1.0):
    m = np.zeros((n, n), np.float32)
    s = (n - 1) / (2 * ext)
    for p, w in lines:
        th = max(1, int(round((w if w else width_m) * s)))
        cv2.polylines(m, [np.round(to_px(p, n, ext) * 8).astype(np.int32)], False, value, th, cv2.LINE_8, 3)
    return m


def resample(p, step):
    """polyline -> points every ~step m (keeps vertices), with cumulative distance"""
    out = [p[0]]
    for a, b in zip(p[:-1], p[1:]):
        L = float(np.hypot(*(b - a)))
        k = max(1, int(math.ceil(L / step)))
        for t in range(1, k + 1):
            out.append(a + (b - a) * t / k)
    out = np.array(out)
    d = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(out, axis=0).T))])
    return out, d


def smooth1d(v, d, radius):
    """distance-weighted moving average along a polyline"""
    out = np.empty_like(v)
    for i in range(len(v)):
        w = np.clip(1 - np.abs(d - d[i]) / radius, 0, None)
        out[i] = (v * w).sum() / w.sum()
    return out


class Grid:
    """sampling helpers on the near N x N grid (index [j, i] = [z, x])"""
    def __init__(self, H):
        self.H = H

    def at(self, x, z):
        return cv2.remap(self.H, ((np.asarray(x, np.float32) + EXT) / STEP), ((np.asarray(z, np.float32) + EXT) / STEP), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def polyline_field(p, X, Z):
    """distance from grid points (X, Z) to polyline p and the arc-length of the nearest point"""
    best = np.full(X.shape, 1e9, np.float32); st = np.zeros(X.shape, np.float32)
    acc = 0.0
    for a, b in zip(p[:-1], p[1:]):
        ab = b - a; L2 = float(ab @ ab)
        if L2 < 1e-6: continue
        t = np.clip(((X - a[0]) * ab[0] + (Z - a[1]) * ab[1]) / L2, 0, 1)
        d = np.hypot(X - (a[0] + t * ab[0]), Z - (a[1] + t * ab[1]))
        m = d < best
        best[m] = d[m]; st[m] = acc + t[m] * math.sqrt(L2)
        acc += math.sqrt(L2)
    return best, st



# ------------------------------------------------------------------ feature rules
LANE_W = {'trunk': 3.5, 'trunk_link': 3.5, 'primary': 3.5, 'primary_link': 3.5, 'secondary': 3.25, 'secondary_link': 3.25,
          'tertiary': 3.0, 'tertiary_link': 3.0, 'unclassified': 2.8, 'residential': 2.6}
ROAD_W = {'living_street': 3.6, 'service': 3.2, 'track': 2.6, 'pedestrian': 3.0, 'footway': 1.6, 'path': 1.2,
          'cycleway': 1.8, 'steps': 1.6, 'road': 4.0}
ORDER = ['path', 'footway', 'cycleway', 'steps', 'track', 'pedestrian', 'service', 'living_street', 'road', 'residential',
         'unclassified', 'tertiary_link', 'tertiary', 'secondary_link', 'secondary', 'primary_link', 'primary', 'trunk_link', 'trunk']
SMOOTH = {'path': 8, 'footway': 8, 'cycleway': 8, 'steps': 4, 'track': 12, 'pedestrian': 10, 'service': 12, 'living_street': 16}


def num(v, default=None):
    try:
        return float(str(v).replace(',', '.').split()[0])
    except (TypeError, ValueError, IndexError):
        return default


def road_width(wid, tg):
    h = tg['highway']
    if wid == GARII_ID:
        return 4.1                                   # measured on the photos
    if num(tg.get('width')):
        return num(tg.get('width'))
    if h in LANE_W:
        lanes = num(tg.get('lanes'))
        if lanes is None:
            lanes = 1 if tg.get('oneway') == 'yes' and h.endswith('link') else 2
        if tg.get('oneway') == 'yes' and h in ('trunk', 'primary') and lanes >= 2:
            return lanes * LANE_W[h] + 1.0
        return max(4.0, lanes * LANE_W[h] + (1.0 if h in ('trunk', 'primary', 'secondary') else 0.4))
    return ROAD_W.get(h, 3.0)


def road_surface(tg):
    s = tg.get('surface', '')
    h = tg['highway']
    if s in ('asphalt', 'paved'): return 'asphalt'
    if s in ('concrete', 'concrete:plates'): return 'concrete'
    if s in ('paving_stones', 'sett', 'cobblestone', 'unhewn_cobblestone'): return 'paving' if s == 'paving_stones' else 'cobble'
    if s in ('gravel', 'fine_gravel', 'compacted', 'pebblestone', 'unpaved'): return 'gravel'
    if s in ('dirt', 'ground', 'earth', 'mud', 'grass', 'sand'): return 'dirt'
    if h == 'track': return 'gravel'
    if h in ('path',): return 'dirt'
    if h in ('footway', 'pedestrian', 'steps', 'cycleway'): return 'paving'
    return 'asphalt'


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def window(p, R):
    x0, z0 = p.min(0) - R; x1, z1 = p.max(0) + R
    i0 = max(0, int((x0 + EXT) // STEP)); i1 = min(N - 1, int(math.ceil((x1 + EXT) / STEP)))
    j0 = max(0, int((z0 + EXT) // STEP)); j1 = min(N - 1, int(math.ceil((z1 + EXT) / STEP)))
    if i1 < i0 or j1 < j0: return None
    return slice(j0, j1 + 1), slice(i0, i1 + 1)


def flatten_line(H, X, Z, p, half, smooth_r, blend=7.0, offset=0.0):
    """cut & fill the terrain along a road/rail: flat cross-section, smoothed long profile"""
    if len(p) < 2: return None
    w = window(p, half + blend)
    if w is None: return None
    G = Grid(H)
    rp, rd = resample(p, 2.5)
    prof = smooth1d(G.at(rp[:, 0], rp[:, 1]).ravel(), rd, smooth_r) + offset
    d, st = polyline_field(p, X[w], Z[w])
    target = np.interp(st, rd, prof)
    wg = 1 - smoothstep(half + 1.0, half + blend, d)
    H[w] = H[w] * (1 - wg) + target * wg
    return rp, rd, prof


def chain_ways(osm, ids):
    out = []
    for wid in ids:
        p = osm.pts(wid)
        if out and np.allclose(out[-1][-1], p[0]): p = p[1:]
        out.append(p)
    return np.concatenate(out)


# ------------------------------------------------------------------ roof decomposition
def ring_clean(p):
    p = np.asarray(p, float)
    if len(p) > 1 and np.allclose(p[0], p[-1]): p = p[:-1]
    changed = True
    while changed and len(p) > 3:
        changed = False
        for i in range(len(p)):
            a, b, c = p[i - 1], p[i], p[(i + 1) % len(p)]
            u, v = b - a, c - b
            lu, lv = np.hypot(*u), np.hypot(*v)
            if lu < 0.35 or abs(u[0] * v[1] - u[1] * v[0]) < math.sin(math.radians(7)) * lu * lv and u @ v > 0:
                p = np.delete(p, i, 0); changed = True; break
    return p


def signed_area(p):
    x, z = p[:, 0], p[:, 1]
    return 0.5 * float(np.sum(x * np.roll(z, -1) - np.roll(x, -1) * z))


def decompose(p):
    """cover a footprint with <= 5 (overlapping) rectangles for hip roofs: [cx, cz, hw, hd, angle]"""
    e = np.roll(p, -1, 0) - p
    L = np.hypot(e[:, 0], e[:, 1]); th = np.arctan2(e[:, 1], e[:, 0])
    a = math.atan2(float(np.sum(L * np.sin(4 * th))), float(np.sum(L * np.cos(4 * th)))) / 4
    c, s = math.cos(a), math.sin(a)
    q = np.stack([p[:, 0] * c + p[:, 1] * s, -p[:, 0] * s + p[:, 1] * c], 1)
    dev = np.abs(((th - a) + math.pi / 4) % (math.pi / 2) - math.pi / 4)
    rectilinear = bool(np.all((dev < math.radians(14)) | (L < 1.2)))
    area = abs(signed_area(p))

    def to_world(x0, x1, z0, z1):
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        return [round(cx * c - cz * s, 2), round(cx * s + cz * c, 2), round((x1 - x0) / 2, 2), round((z1 - z0) / 2, 2), round(a, 4)]

    if rectilinear and 4 <= len(p) <= 24:
        def clus(v):
            v = np.sort(v); out = [v[0]]
            for t in v[1:]:
                if t - out[-1] > 0.6: out.append(t)
                else: out[-1] = (out[-1] + t) / 2
            return np.array(out)
        xs, zs = clus(q[:, 0]), clus(q[:, 1])
        cont = q.astype(np.float32).reshape(-1, 1, 2)
        occ = np.array([[cv2.pointPolygonTest(cont, ((xs[k] + xs[k + 1]) / 2, (zs[l] + zs[l + 1]) / 2), False) > 0
                         for l in range(len(zs) - 1)] for k in range(len(xs) - 1)])
        if occ.size and occ.any():
            cov = np.zeros_like(occ); rects = []
            nk, nl = occ.shape
            for _ in range(5):
                best, bA = None, 0.0
                for k0 in range(nk):
                    for k1 in range(k0, nk):
                        for l0 in range(nl):
                            for l1 in range(l0, nl):
                                blk = occ[k0:k1 + 1, l0:l1 + 1]
                                if not blk.all() or cov[k0:k1 + 1, l0:l1 + 1].all(): continue
                                A = (xs[k1 + 1] - xs[k0]) * (zs[l1 + 1] - zs[l0])
                                if A > bA: bA, best = A, (k0, k1, l0, l1)
                if best is None or (rects and bA < 4.0): break
                k0, k1, l0, l1 = best
                cov[k0:k1 + 1, l0:l1 + 1] = True
                rects.append(to_world(xs[k0], xs[k1 + 1], zs[l0], zs[l1 + 1]))
                if cov[occ].all(): break
            if rects: return rects, True
    (cx, cz), (w, h), ang = cv2.minAreaRect(p.astype(np.float32))
    a2 = math.radians(ang)
    return [[round(cx, 2), round(cz, 2), round(w / 2, 2), round(h / 2, 2), round(a2, 4)]], area / max(w * h, 1e-3) > 0.8


# ------------------------------------------------------------------ main pipeline
PRAHOVA = ['17504937', '17504973', '17505025', '17505075', '17505230']
RIVER_REL = '1308475'
LOTS = (-35.0, 35.0, -60.0, 45.0)            # hand-built photographed lots (x0, x1, z0, z1)
STREET_Z = (-118.0, 143.0)                    # hand-built part of Strada Gării
ZONE_FLAT = (-38.0, 34.0)                     # the photographed stretch is level (as on the photos)
SKIP_TREES = (-40.0, 40.0, -62.0, 48.0)

# photographed neighbours: appearance from the photos, footprint from OSM
OVERRIDES = {
    '264516818': dict(wall='stuccoWhite', roof='roofMetalGray', roofType='hip', plinth='stoneCladding', frame='woodDark', note='casa albă (poza 1-2)'),
    '264516920': dict(wall='shingle', roof='roofMetalLight', roofType='gable', levels=2, ridge='x', pitch=20, note='casa înaltă cu șindrilă închisă și fereastră arcuită (pozele 1, 19, 20)'),
    '264516921': dict(wall='gray', roof='roofMetalLight', note='anexa joasă cu tablă zincată din fața casei cu șindrilă (poza 20)'),
    '264515491': dict(wall='stuccoWhite', roof='roofMetalLight', roofType='gable', levels=2, chimney=True, ridge='x', dx=-3.0, note='casa albă cu coș de cărămidă, fronton spre stradă (pozele 1, 18, 20)'),
    '264515456': dict(wall='gray', roof='roofMetalLight', roofType='gable', ridge='x', ridgeAll=True, pitch=17, note='clădirea joasă cu tablă zincată din spatele gardului mentă (poza 18)'),
    '264515508': dict(wall='ochre', roof='metalTileBrown', roofMat='metalTile', roofType='gable', ridge='z', note='casa ocru cu țiglă metalică maro de după zidul gri, poarta nr. 10 (pozele 8, 21)'),
    '264515510': dict(wall='stuccoPeach', roof='roofMetalBrown', roofType='gable', dx=-2.9, note='casa de după gardul vișiniu (poza 7): în spatele scumpiei'),
    '304010713': dict(dx=-0.8, note='șopronul de lemn din spatele gardului maro (poza 17)'),
    '222896491': dict(wall='stuccoPeach', roof='metalTileBrown', roofMat='metalTile', roofType='gable', levels=2, ridge='x', note='casa piersicie cu 2 etaje și țiglă metalică maro, la capătul străzii (poza 17)'),
}
HERO_SPLIT = 15.4, 10.1        # parts of footprint 123 not covered by the hand-built house: x > 15.4 (rear) and z > 9.95 (garden annex)


def main():
    import time
    t0 = time.time()
    log = lambda *a: print(f'[{time.time() - t0:5.1f}s]', *a, flush=True)
    osm = OSM(); log('osm', len(osm.nodes), len(osm.ways), len(osm.rels))
    os.makedirs(OUT, exist_ok=True)
    X, Z = grid_xz(N, EXT)
    lat, lon = game_to_ll(X, Z)
    terr, cop = terrarium_sampler(), cop_sampler()
    H = ndimage.gaussian_filter(terr(lat, lon), 0.7).astype(np.float32)
    raw_dem = H.copy()

    # ---- land cover (near grid + 1024 splat)
    is_forest = lambda t: t.get('landuse') == 'forest' or t.get('natural') in ('wood',)
    forest_a = osm.areas(is_forest)
    farm_a = osm.areas(lambda t: t.get('landuse') in ('farmland', 'allotments'))
    orchard_a = osm.areas(lambda t: t.get('landuse') in ('orchard', 'vineyard'))
    resid_a = osm.areas(lambda t: t.get('landuse') in ('residential',))
    indus_a = osm.areas(lambda t: t.get('landuse') in ('industrial', 'railway', 'construction', 'military') or t.get('amenity') == 'parking')
    grass_a = osm.areas(lambda t: t.get('landuse') in ('grass', 'meadow', 'recreation_ground', 'cemetery', 'village_green') or t.get('natural') in ('grassland', 'scrub') or t.get('leisure') in ('park', 'pitch', 'stadium', 'playground'))
    water_a = osm.areas(lambda t: t.get('natural') == 'water' and t.get('water') not in ('river',))
    river_r = osm.rings(RIVER_REL)
    forest = fill_areas(N, EXT, forest_a)
    H -= 4.0 * ndimage.gaussian_filter(forest, 2.0)          # DSM canopy bias -> approx. bare ground
    log('dem + landcover')

    # ---- Prahova: water level along the channel (monotone downstream), riverbed carve
    rv = chain_ways(osm, PRAHOVA)
    rp, rd = resample(rv, 10)
    inside = (np.abs(rp[:, 0]) < EXT + 400) & (np.abs(rp[:, 1]) < EXT + 400)
    k0, k1 = np.argmax(inside), len(inside) - np.argmax(inside[::-1])
    rp, rd = rp[max(0, k0 - 5):k1 + 5], rd[max(0, k0 - 5):k1 + 5]
    tang = np.gradient(rp, axis=0); tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    nrm = np.stack([-tang[:, 1], tang[:, 0]], 1)
    cs = []
    for off in (-30, -20, -10, 0, 10, 20, 30):
        q = rp + nrm * off
        la, lo = game_to_ll(q[:, 0], q[:, 1])
        cs.append(terr(la.reshape(1, -1), lo.reshape(1, -1)).ravel())
    lev = np.min(cs, 0)
    lev = np.minimum.accumulate(lev)
    lev = smooth1d(lev, rd, 250)
    lev = np.minimum.accumulate(lev) - 0.3
    log('river level', lev[0].round(1), '->', lev[-1].round(1), 'over', round(rd[-1] - rd[0]), 'm')
    rb = fill_areas(N, EXT, [(river_r['outer'], river_r['inner'])])
    d_r, st_r = polyline_field(rp, X, Z)
    L_r = np.interp(st_r, rd - rd[0], lev)
    chan = d_r < 10.0
    rng = np.random.default_rng(7)
    noise = ndimage.gaussian_filter(rng.standard_normal((N, N)), 3.0); noise /= noise.std()
    gravel = L_r + 0.6 + np.clip(0.3 * noise, -0.35, 0.6)
    wet = L_r - 0.25 - 1.3 * np.clip(1 - (d_r / 10.0) ** 2, 0, 1)
    T = np.where(chan, np.minimum(wet, gravel), gravel)
    zone = np.maximum(rb, chan.astype(np.float32))
    wz = np.clip(ndimage.gaussian_filter(zone, 1.3) * 1.8, 0, 1)
    H = H * (1 - wz) + np.minimum(T, H * (1 - wz) + T * wz) * wz
    WL = np.where((zone > 0) | (d_r < 14), L_r, np.nan).astype(np.float32)
    # small river Câmpinița (4 m) and lakes
    for wid, (nd, tg) in osm.ways.items():
        if tg.get('waterway') in ('river', 'stream') and tg.get('name') != 'Prahova':
            p = osm.pts(wid)
            if len(p): p = p[np.maximum(np.abs(p[:, 0]), np.abs(p[:, 1])) < EXT + 300]   # only the part on the map
            if len(p) < 2 or window(p, 20) is None: continue
            w = window(p, 20)
            rp2, rd2 = resample(p, 5)
            la, lo = game_to_ll(rp2[:, 0], rp2[:, 1])
            l2 = np.minimum.accumulate(terr(la.reshape(1, -1), lo.reshape(1, -1)).ravel()) - 0.6
            d2, s2 = polyline_field(p, X[w], Z[w])
            half = (num(tg.get('width'), 2.0)) / 2
            L2 = np.interp(s2, rd2, l2)
            bank = smoothstep(half + 5, half, d2)
            H[w] = np.minimum(H[w], H[w] * (1 - bank) + (L2 - 0.5 * np.clip(1 - (d2 / half) ** 2, 0, 1)) * bank)
            m = d2 < half + 1.5
            WL[w] = np.where(m, np.fmax(WL[w], L2), WL[w])
    for outers, inners, tg, _ in water_a:
        m = fill_areas(N, EXT, [(outers, inners)])
        if m.sum() == 0: continue
        ring = outers[0]
        lvl = float(np.percentile(Grid(H).at(ring[:, 0], ring[:, 1]).ravel(), 15)) - 0.3
        H = np.where(m > 0, np.minimum(H, lvl - 1.2), H)
        WL = np.where(ndimage.binary_dilation(m > 0, iterations=1), lvl, WL)
    log('rivers + lakes')

    # ---- roads & railways: cut and fill, minor first
    roads, rails = [], []
    for wid, (nd, tg) in osm.ways.items():
        h = tg.get('highway')
        if h in ORDER and tg.get('area') != 'yes' and len(nd) > 1:
            p = osm.pts(wid)
            if len(p) > 1 and window(p, 10) is not None:
                roads.append((ORDER.index(h), wid, p, tg))
        r = tg.get('railway')
        if r in ('rail',) and len(nd) > 1:
            p = osm.pts(wid)
            if len(p) > 1 and window(p, 10) is not None:
                rails.append((wid, p, tg))
    roads.sort(key=lambda r: r[0])
    for _, wid, p, tg in roads:
        if tg.get('bridge') or tg.get('tunnel') or tg['highway'] == 'steps': continue
        w = road_width(wid, tg)
        flatten_line(H, X, Z, p, w / 2, SMOOTH.get(tg['highway'], 25 if tg['highway'] in ('residential', 'unclassified') else 35))
    for wid, p, tg in rails:
        if tg.get('bridge') or tg.get('tunnel'): continue
        flatten_line(H, X, Z, p, 2.2, 60, blend=8, offset=0.35)
    log('roads', len(roads), 'rails', len(rails))

    # ---- the hand-built stretch of Strada Gării and the photographed lots
    zc = np.linspace(-EXT, EXT, N)
    ic = N // 2
    prof = H[:, ic].copy()
    H0 = float(prof[ic])
    fw = 1 - np.maximum(smoothstep(ZONE_FLAT[0], ZONE_FLAT[0] - 40, zc), smoothstep(ZONE_FLAT[1], ZONE_FLAT[1] + 40, zc))
    prof2 = H0 + (prof - H0) * (1 - fw)
    x0, x1, z0, z1 = LOTS
    din = np.maximum(np.maximum(x0 - X, X - x1), np.maximum(z0 - Z, Z - z1))       # >0 outside the lots box
    wl = 1 - smoothstep(0, 30, din)
    lotH = prof2[:, None] + np.where(X > 0, 0.13, 0.04)
    H = H * (1 - wl) + lotH * wl
    rows = (zc >= STREET_Z[0] - 2) & (zc <= STREET_Z[1] + 2)
    H[rows, ic] = prof2[rows] - 0.15
    H[rows, ic + 1] = prof2[rows] + 0.13
    H[rows, ic - 1] = prof2[rows] + 0.04
    for di, off in ((2, 0.13), (-2, 0.04)):
        outside = rows & ~((zc >= z0) & (zc <= z1))
        H[outside, ic + di] = 0.5 * H[outside, ic + di] + 0.5 * (prof2[outside] + off)
    log('street + lots, H0 =', round(H0, 2))

    # ---- blend the near edge into the far DEM
    edge = np.maximum(np.abs(X), np.abs(Z))
    we = smoothstep(EXT - 200, EXT, edge)
    H = H * (1 - we) + cop(lat, lon) * we
    WL[we > 0.5] = np.nan

    Y = H - H0
    gzs, gxs = np.gradient(Y, STEP)
    slope = np.degrees(np.arctan(np.hypot(gxs, gzs)))
    cn = ndimage.gaussian_filter(np.random.default_rng(3).standard_normal((N, N)), 1.6); cn /= cn.std()
    # position from photos 7 and 17: left of the street axis, i.e. towards +x (NW), ~80 m wide
    CLAY = (slope > 16) & (np.abs(X - 45 + 12 * cn) < 42 + 10 * cn) & (Z > 395) & (Z < 545) & (cn > -0.9)
    CLAY = ndimage.binary_opening(CLAY, iterations=1)
    write_b64('height.json', np.clip(np.round(Y * 100), -32000, 32000).astype('<i2'))
    Xf, Zf = grid_xz(FAR_N, FAR_EXT)
    laf, lof = game_to_ll(Xf, Zf)
    Yf = cop(laf, lof) - H0
    Yf[np.hypot(Xf, Zf) > FAR_EXT * 1.02] = -3276.8      # outside the DEM window: no data
    write_b64('far.json', np.clip(np.round(Yf * 10), -32768, 32000).astype('<i2'))
    log('height range', Y.min().round(1), Y.max().round(1), 'far', Yf.min().round(1), Yf.max().round(1))

    # water cells (cell (i, j) spans grid nodes i..i+1, j..j+1)
    W4 = np.stack([WL[:-1, :-1], WL[:-1, 1:], WL[1:, :-1], WL[1:, 1:]])
    Y4 = np.stack([Y[:-1, :-1], Y[:-1, 1:], Y[1:, :-1], Y[1:, 1:]]) + H0
    with np.errstate(invalid='ignore'), __import__('warnings').catch_warnings():
        __import__('warnings').simplefilter('ignore')
        lvl4 = np.nanmean(W4, 0)
    sel = ~np.isnan(W4).all(0) & (Y4 < lvl4 + 0.02).any(0)
    jj_, ii_ = np.nonzero(sel)
    cells = np.stack([ii_, jj_, np.round((lvl4[sel] - H0) * 100).astype(int)], 1).tolist()
    log('water cells', len(cells))

    # ---- textures: Sentinel-2 ground colour (near + far) and land-cover splat
    TN = 2048
    Xt, Zt = grid_xz(TN, EXT)
    s2n = s2_mosaic_sampler(15)(*game_to_ll(Xt, Zt))
    clay_t = cv2.GaussianBlur(cv2.resize(CLAY.astype(np.float32), (TN, TN), interpolation=cv2.INTER_LINEAR), (0, 0), 1.2)
    # erosion gullies: vertical streaks (down the slope, i.e. along +z) of darker clay and scrub
    streak = cv2.GaussianBlur(np.random.default_rng(4).random((TN, TN)).astype(np.float32), (0, 0), sigmaX=1.0, sigmaY=6.0)
    streak = (streak - streak.mean()) / streak.std()
    clay_t = np.clip(clay_t * (0.8 + 0.25 * streak), 0, 1)
    clay_bgr = np.array([118, 138, 156], np.float32)            # grey-ochre clay of the eroded bank (photo 7)
    s2n = (s2n * (1 - clay_t[..., None]) + clay_bgr * clay_t[..., None]).astype(np.uint8)
    # roofs and asphalt are modelled in 3D: paint them out of the ground colour (else they glow as halos)
    bm = np.zeros((TN, TN), np.uint8)
    for outers, _, tg, _ in osm.areas(lambda t: 'building' in t):
        for r in outers:
            cv2.fillPoly(bm, [np.round(to_px(r, TN, EXT) * 8).astype(np.int32)], 255, cv2.LINE_8, 3)
    bm = cv2.dilate(bm, np.ones((5, 5), np.uint8))
    s2n = cv2.inpaint(s2n, bm, 4, cv2.INPAINT_TELEA)
    # 10 m pixels in the village mix roofs, yards and gardens: pull them towards garden green
    vil = cv2.GaussianBlur(cv2.dilate(bm, np.ones((9, 9), np.uint8)).astype(np.float32) / 255, (0, 0), 3) * 0.45
    s2n = (s2n * (1 - vil[..., None]) + np.array([52, 92, 70], np.float32) * vil[..., None]).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, 'ortho.jpg'), s2n, [cv2.IMWRITE_JPEG_QUALITY, 88])
    Xft, Zft = grid_xz(TN, FAR_EXT)
    cv2.imwrite(os.path.join(OUT, 'ortho_far.jpg'), s2_mosaic_sampler(12)(*game_to_ll(Xft, Zft)), [cv2.IMWRITE_JPEG_QUALITY, 85])
    sp = lambda a: fill_areas(TN, EXT, a)
    rb_t = fill_areas(TN, EXT, [(river_r['outer'], river_r['inner'])])
    lines_rail = draw_lines(TN, EXT, [(p, 5.0) for _, p, _ in rails], 5.0)
    rd_mask = draw_lines(TN, EXT, [(p, road_width(w, t)) for _, w, p, t in roads if road_surface(t) in ('gravel', 'dirt')], 3)
    R_ = np.clip(sp(forest_a), 0, 1) * (1 - clay_t)
    G_ = np.clip(np.maximum(sp(farm_a) * 0.9, clay_t), 0, 1)
    B_ = np.clip(np.maximum.reduce([rb_t, lines_rail, sp(indus_a) * 0.6, rd_mask * 0.8]), 0, 1)
    splat = np.stack([B_, G_, R_], -1)                      # BGR for cv2 -> RGB = forest floor, farmland, gravel
    splat = cv2.GaussianBlur(splat, (0, 0), 1.2)
    cv2.imwrite(os.path.join(OUT, 'splat.png'), np.round(splat * 255).astype(np.uint8))
    log('textures')

    # ---- buildings
    Gy = Grid(Y.astype(np.float32))
    bl = []
    build_src = [(o, tg, wid) for o, _, tg, wid in osm.areas(lambda t: 'building' in t and t.get('building') not in ('roof', 'no'))]
    for outers, tg, wid in build_src:
        p = ring_clean(outers[0])
        if len(p) < 3: continue
        cx, cz = p.mean(0)
        if max(abs(cx), abs(cz)) > EXT - 30: continue
        area = abs(signed_area(p))
        if area < 6: continue
        if signed_area(p) < 0: p = p[::-1]
        dx = OVERRIDES.get(wid, {}).get('dx', 0.0)
        if STREET_Z[0] - 5 < cz < STREET_Z[1] + 5 and abs(cx) < 60:
            # keep buildings behind the hand-built verges / fences (east face 3.7 m, west face -3.3 m)
            if cx > 0: dx = max(dx, 4.2 - p[:, 0].min())
            else: dx = min(dx, -3.8 - p[:, 0].max())
        p = p + [max(dx, 0) if cx > 0 else min(dx, 0), 0]
        cx = p[:, 0].mean()
        ys = Gy.at(np.append(p[:, 0], cx), np.append(p[:, 1], cz)).ravel()
        b = tg.get('building')
        lv = num(tg.get('building:levels'))
        ht = num(tg.get('height'))
        rects, ok = decompose(p)
        flat = (b in ('industrial', 'warehouse', 'retail', 'supermarket', 'commercial', 'office', 'manufacture', 'hangar', 'storage_tank', 'sports_hall', 'hospital')
                or (lv or 1) >= 3 or area > 900)
        roof = 'flat' if flat else ('tank' if b == 'storage_tank' else 'hip')
        if b in ('garage', 'garages', 'shed') and area < 60: roof = 'shed'
        if b == 'church' or tg.get('amenity') == 'place_of_worship': roof = 'church'
        rec = dict(id=wid, p=np.round(p, 2).ravel().tolist(), y0=round(float(ys.min()), 2), y1=round(float(ys.max()), 2),
                   b=b, lv=int(lv) if lv else 1, r=rects, roof=roof)
        if ht and not (ht == 4 and (lv or 1) == 1): rec['h'] = ht
        if not ok and roof in ('hip',): rec['fit'] = 0
        if tg.get('addr:housenumber'): rec['no'] = tg['addr:housenumber']
        if tg.get('name'): rec['name'] = tg['name']
        if wid in OVERRIDES: rec['o'] = OVERRIDES[wid]
        if wid == HERO_ID:
            from shapely.geometry import Polygon, box
            poly = Polygon(p)
            for k, part in enumerate([poly.intersection(box(HERO_SPLIT[0], -6.0, 99, HERO_SPLIT[1])), poly.intersection(box(-99, HERO_SPLIT[1], 99, 99))]):
                if part.geom_type == 'MultiPolygon': part = max(part.geoms, key=lambda g_: g_.area)
                if part.is_empty or part.area < 4: continue
                q = ring_clean(np.array(part.exterior.coords))
                if signed_area(q) < 0: q = q[::-1]
                bl.append(dict(rec, id=wid + ('r' if k == 0 else 'a'), p=np.round(q, 2).ravel().tolist(), r=decompose(q)[0],
                               o=dict(wall='stuccoGrayLight', roof='roofMetalGray', roofType='hip', eave=2.75 if k == 0 else 2.5, note='casa 123: corpul din spate / anexa din grădină (OSM)'),
                               y0=0.25, y1=0.25))
            continue
        bl.append(rec)
    log('buildings', len(bl))

    # ---- road / rail / power records
    rl = []
    for _, wid, p, tg in roads:
        rec = dict(id=wid, c=tg['highway'], w=round(road_width(wid, tg), 2), s=road_surface(tg), p=np.round(p, 2).ravel().tolist())
        for k, kk in (('name', 'n'), ('ref', 'ref'), ('lanes', 'lanes'), ('oneway', 'ow'), ('layer', 'layer')):
            if tg.get(k): rec[kk] = tg[k]
        if tg.get('bridge'): rec['br'] = 1
        if tg.get('tunnel'): rec['tu'] = 1
        if wid == GARII_ID: rec['hand'] = list(STREET_Z)
        rl.append(rec)
    ral = []
    for wid, p, tg in rails:
        rec = dict(id=wid, p=np.round(p, 2).ravel().tolist(), svc=tg.get('service', ''), el=1 if tg.get('electrified') == 'contact_line' else 0,
                   main=1 if tg.get('usage') == 'main' and not tg.get('service') else 0)
        if tg.get('bridge'): rec['br'] = 1
        ral.append(rec)
    plat = [dict(id=wid, p=np.round(o[0], 2).ravel().tolist()) for o, _, tg, wid in osm.areas(lambda t: t.get('railway') == 'platform')]
    power = []
    for wid, (nd, tg) in osm.ways.items():
        if tg.get('power') in ('line', 'minor_line'):
            pts = [(osm.xz[n], osm.nodes[n][2].get('power', '')) for n in nd if n in osm.xz]
            power.append(dict(id=wid, k=tg['power'], v=tg.get('voltage', ''), p=[[round(a[0][0], 2), round(a[0][1], 2), 1 if a[1] in ('tower', 'pole') else 0] for a in pts]))
    trees_osm = [[round(a, 2) for a in osm.xz[n]] for n, (la_, lo_, tg) in osm.nodes.items() if tg.get('natural') == 'tree']

    # ---- exclusion raster for trees/fences/poles (2048^2, 1.465 m/px)
    XN = 4096
    def ex_raster():
        m = np.zeros((XN, XN), np.uint8)
        s = (XN - 1) / (2 * EXT)
        for rec in bl:
            q = np.array(rec['p']).reshape(-1, 2)
            cv2.fillPoly(m, [np.round(to_px(q, XN, EXT) * 8).astype(np.int32)], 1, cv2.LINE_8, 3)
        m = cv2.dilate(m, np.ones((3, 3), np.uint8))
        for _, wid, p, tg in roads:
            th = max(1, int(round((road_width(wid, tg) + 2.4) * s)))
            cv2.polylines(m, [np.round(to_px(p, XN, EXT) * 8).astype(np.int32)], False, 2, th, cv2.LINE_8, 3)
        for wid, p, tg in rails:
            cv2.polylines(m, [np.round(to_px(p, XN, EXT) * 8).astype(np.int32)], False, 3, max(1, int(7 * s)), cv2.LINE_8, 3)
        return m
    EXR = ex_raster()
    FN = 10001                                  # 0.6 m raster for fence clearances
    FR = np.zeros((FN, FN), np.uint8)
    for _, wid, p, tg in roads:
        cv2.polylines(FR, [np.round(to_px(p, FN, EXT) * 8).astype(np.int32)], False, 1, max(1, int(round((road_width(wid, tg) + 1.0) * (FN - 1) / (2 * EXT)))), cv2.LINE_8, 3)
    for wid, p, tg in rails:
        cv2.polylines(FR, [np.round(to_px(p, FN, EXT) * 8).astype(np.int32)], False, 1, int(round(6 * (FN - 1) / (2 * EXT))), cv2.LINE_8, 3)
    for rec_ in bl:
        cv2.fillPoly(FR, [np.round(to_px(np.array(rec_['p']).reshape(-1, 2), FN, EXT) * 8).astype(np.int32)], 1, cv2.LINE_8, 3)
    FR = cv2.dilate(FR, np.ones((3, 3), np.uint8))
    frs = (FN - 1) / (2 * EXT)
    XX, ZZ = grid_xz(XN, EXT)
    rb_x = fill_areas(XN, EXT, [(river_r['outer'], river_r['inner'])])
    dr_x = cv2.resize(d_r, (XN, XN), interpolation=cv2.INTER_LINEAR)
    s2x = cv2.resize(s2n, (XN, XN), interpolation=cv2.INTER_LINEAR).astype(np.int16)
    green = s2x[..., 1] - (s2x[..., 0] + s2x[..., 2]) / 2      # BGR
    bright = s2x.mean(-1)
    lots = (np.abs(XX) < 1e9) & (XX > SKIP_TREES[0]) & (XX < SKIP_TREES[1]) & (ZZ > SKIP_TREES[2]) & (ZZ < SKIP_TREES[3])
    clay_x = cv2.resize(CLAY.astype(np.uint8), (XN, XN), interpolation=cv2.INTER_NEAREST) > 0
    free = (EXR == 0) & ~clay_x & (rb_x < 0.5) & (dr_x > 12) & ~lots & (np.maximum(np.abs(XX), np.abs(ZZ)) < EXT - 20)
    forest_x = fill_areas(XN, EXT, forest_a) > 0.5
    orch_x = fill_areas(XN, EXT, orchard_a) > 0.5
    resid_x = fill_areas(XN, EXT, resid_a) > 0.5
    farm_x = fill_areas(XN, EXT, farm_a) > 0.5
    near_b = cv2.dilate((EXR == 1).astype(np.uint8), np.ones((41, 41), np.uint8)) > 0     # within ~30 m of a building
    # town centre: blocks of flats, shops, industry -> no lot fences along those streets
    blk = np.zeros((XN, XN), np.uint8)
    for rec_ in bl:
        if rec_['roof'] == 'flat' or rec_['b'] in ('apartments', 'commercial', 'retail', 'industrial', 'school', 'hospital', 'public', 'office'):
            cv2.fillPoly(blk, [np.round(to_px(np.array(rec_['p']).reshape(-1, 2), XN, EXT) * 8).astype(np.int32)], 1, cv2.LINE_8, 3)
    blk = cv2.dilate(blk, np.ones((31, 31), np.uint8)) > 0                                  # ~22 m around them
    trng = np.random.default_rng(11)

    def scatter(spacing, mask, keep=1.0, jitter=0.42, far_keep=1.0):
        n = int(2 * EXT / spacing)
        g = (np.arange(n) + 0.5) * spacing - EXT
        gx, gz = np.meshgrid(g, g)
        px = gx + trng.uniform(-jitter, jitter, gx.shape) * spacing
        pz = gz + trng.uniform(-jitter, jitter, gz.shape) * spacing
        ii = np.clip(np.round((px + EXT) / (2 * EXT) * (XN - 1)).astype(int), 0, XN - 1)
        jj = np.clip(np.round((pz + EXT) / (2 * EXT) * (XN - 1)).astype(int), 0, XN - 1)
        k = np.where(np.maximum(np.abs(px), np.abs(pz)) > 1600, keep * far_keep, keep)
        ok = mask[jj, ii] & (trng.random(px.shape) < k)
        return px[ok], pz[ok], jj[ok], ii[ok]
    T_ = []
    # forests: oak / hornbeam / beech with some spruce (CLC: broad-leaved forest)
    fx_, fz_, _, _ = scatter(6.5, free & forest_x, far_keep=0.55)
    ty = trng.choice([0, 1, 2], len(fx_), p=[0.5, 0.38, 0.12])
    T_.append((fx_, fz_, ty, trng.uniform(0.8, 1.2, len(fx_))))
    # riverside willows / poplars on the green parts of the river corridor
    wx_, wz_, jj, ii = scatter(7.0, (EXR == 0) & (rb_x < 0.5) & (dr_x > 11) & (dr_x < 120) & (green > 6) & ~forest_x & ~lots)
    T_.append((wx_, wz_, trng.choice([5, 1], len(wx_), p=[0.7, 0.3]), trng.uniform(0.75, 1.15, len(wx_))))
    # orchards (plum / apple rows)
    ox_, oz_, _, _ = scatter(6.0, free & orch_x, keep=0.85, jitter=0.12, far_keep=0.6)
    T_.append((ox_, oz_, np.full(len(ox_), 3), trng.uniform(0.8, 1.1, len(ox_))))
    # yards: fruit trees, walnuts, spruces where Sentinel-2 shows vegetation
    yx_, yz_, jj, ii = scatter(10.0, free & (resid_x | near_b) & ~forest_x & ~orch_x & ~farm_x & (green > 4), far_keep=0.75)
    T_.append((yx_, yz_, trng.choice([3, 4, 1, 2, 0], len(yx_), p=[0.45, 0.18, 0.17, 0.12, 0.08]), trng.uniform(0.7, 1.15, len(yx_))))
    # scattered field trees
    sx_, sz_, _, _ = scatter(32.0, free & ~forest_x & ~resid_x & ~near_b & (green > 10), keep=0.35)
    T_.append((sx_, sz_, trng.choice([0, 1, 4], len(sx_)), trng.uniform(0.8, 1.2, len(sx_))))
    if trees_osm:
        a = np.array(trees_osm)
        T_.append((a[:, 0], a[:, 1], np.full(len(a), 0), np.full(len(a), 1.0)))
    tx = np.concatenate([t[0] for t in T_]); tz = np.concatenate([t[1] for t in T_])
    tt = np.concatenate([t[2] for t in T_]); ts = np.concatenate([t[3] for t in T_])
    rec = np.zeros(len(tx), dtype=[('x', '<i2'), ('z', '<i2'), ('t', 'u1'), ('s', 'u1')])
    rec['x'] = np.round(tx * 10); rec['z'] = np.round(tz * 10); rec['t'] = tt; rec['s'] = np.round(ts * 100)
    write_b64('trees.json', rec)
    log('trees', len(rec), [len(t[0]) for t in T_])

    # ---- street fences (lot fronts) and utility poles along village streets
    from shapely.geometry import LineString
    fences, poles = [], []
    frng = np.random.default_rng(5)
    s_ = (XN - 1) / (2 * EXT)
    lotsbox = lambda q: (q[:, 0] > LOTS[0] - 5) & (q[:, 0] < LOTS[1] + 5) & (q[:, 1] > LOTS[2] - 5) & (q[:, 1] < LOTS[3] + 5)
    for _, wid, p, tg in roads:
        h = tg['highway']
        if h not in ('residential', 'living_street', 'unclassified', 'tertiary', 'secondary', 'service') or tg.get('bridge'): continue
        if h == 'service' and tg.get('service') in ('parking_aisle', 'drive-through'): continue
        w = road_width(wid, tg)
        ls = LineString(p)
        if ls.length < 8: continue
        for side in (-1, 1):
            off = ls.offset_curve(side * (w / 2 + (1.7 if h != 'service' else 0.6)), join_style=2, mitre_limit=3)
            if off.is_empty or off.geom_type != 'LineString' or off.length < 6: continue
            nS = int(off.length / 1.5)
            q = np.array([off.interpolate(k * 1.5).coords[0] for k in range(nS + 1)])
            ii = np.clip(np.round((q[:, 0] + EXT) * s_).astype(int), 0, XN - 1); jj = np.clip(np.round((q[:, 1] + EXT) * s_).astype(int), 0, XN - 1)
            fi = np.clip(np.round((q[:, 0] + EXT) * frs).astype(int), 0, FN - 1); fj = np.clip(np.round((q[:, 1] + EXT) * frs).astype(int), 0, FN - 1)
            valid = (FR[fj, fi] == 0) & ~blk[jj, ii] & (rb_x[jj, ii] < 0.5) & ~forest_x[jj, ii] & (near_b[jj, ii] | resid_x[jj, ii]) & ~lotsbox(q) & (np.maximum(np.abs(q[:, 0]), np.abs(q[:, 1])) < EXT - 40)
            if wid == GARII_ID: valid &= ~((q[:, 1] > LOTS[2] - 8) & (q[:, 1] < LOTS[3] + 8))
            k = 0
            while k < len(q):
                if not valid[k]: k += 1; continue
                e = k
                while e + 1 < len(q) and valid[e + 1]: e += 1
                run = q[k:e + 1]
                if len(run) >= 5:
                    # split into lots with their own fence and a gate
                    a = 0
                    while a < len(run) - 3:
                        L = int(frng.integers(9, 18))
                        b = min(len(run) - 1, a + L)
                        if len(run) - 1 - b < 4: b = len(run) - 1
                        style = int(frng.choice(6, p=[0.26, 0.2, 0.22, 0.14, 0.1, 0.08]))
                        lot = run[a:b + 1]
                        if len(lot) >= 8 and frng.random() < 0.75:
                            g0 = int(frng.integers(1, len(lot) - 3)); g1 = g0 + 2
                            parts = [lot[:g0 + 1], lot[g1:]]
                        else:
                            parts = [lot]
                        for part in parts:
                            if len(part) >= 2:
                                ln = LineString(part).simplify(0.15)
                                fences.append([style] + np.round(np.array(ln.coords), 2).ravel().tolist())
                        a = b
                k = e + 1
        # concrete poles every ~38 m on one side of village streets
        if h in ('residential', 'living_street', 'unclassified', 'tertiary') and wid != GARII_ID and ls.length > 30:
            side = 1 if frng.random() < 0.5 else -1
            off = ls.offset_curve(side * (w / 2 + 0.9), join_style=2, mitre_limit=3)
            if off.is_empty or off.geom_type != 'LineString': continue
            seq = []
            for k in range(int(off.length // 38) + 1):
                c = np.array(off.interpolate(min(off.length, 6 + k * 38)).coords[0])
                i_, j_ = int(round((c[0] + EXT) * s_)), int(round((c[1] + EXT) * s_))
                if not (0 <= i_ < XN and 0 <= j_ < XN) or EXR[j_, i_] == 1 or lots[j_, i_] or rb_x[j_, i_] > 0.5:
                    if len(seq) > 1: poles.append(dict(s=side, p=seq))
                    seq = []; continue
                seq.append([round(float(c[0]), 2), round(float(c[1]), 2)])
            if len(seq) > 1: poles.append(dict(s=side, p=seq))
    log('fences', len(fences), 'pole runs', len(poles))

    zs = zc[rows]
    geo = dict(
        meta=dict(origin=dict(lat=LAT0, lon=LON0, bearing=math.degrees(THETA), zShift=Z_SHIFT, h0=round(H0, 2)),
                  grid=dict(n=N, ext=EXT, step=STEP), far=dict(n=FAR_N, ext=FAR_EXT),
                  street=dict(z0=STREET_Z[0], z1=STREET_Z[1]), lots=LOTS,
                  sources=['OpenStreetMap contributors (ODbL)', 'Terrain Tiles on AWS (EU-DEM/SRTM, terrarium z15)',
                           'Copernicus GLO-30 DSM', 'Sentinel-2 cloudless 2023 by EOX (CC BY-NC-SA 4.0)']),
        profile=dict(z0=float(zs[0]), step=STEP, y=np.round(prof2[rows] - H0, 3).tolist()),
        buildings=bl, roads=rl, rails=ral, platforms=plat, power=power, water=cells,
        river=dict(p=np.round(rp, 1).ravel().tolist(), lev=np.round(lev - H0, 2).tolist()),
        fences=fences, poles=poles)
    with open(os.path.join(OUT, 'geo.json'), 'w') as f:
        json.dump(geo, f, separators=(',', ':'), ensure_ascii=False)
    log('geo.json', os.path.getsize(os.path.join(OUT, 'geo.json')) // 1024, 'KB')


if __name__ == '__main__':
    main()
