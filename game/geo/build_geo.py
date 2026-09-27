#!/usr/bin/env python3
"""Builds the real-world dataset for the geo version of the game (Strada Gării, Poiana Câmpina).

Open data sources (downloaded into geo/raw by fetch_raw.sh):
  * OpenStreetMap (c) OpenStreetMap contributors, ODbL - buildings, roads, railway, river, landuse, power lines
  * Terrain Tiles on AWS (terrarium, z15; EU-DEM / SRTM based)   - terrain of the playable map (+-8 km)
  * Copernicus GLO-30 DSM (c) ESA / DLR / Airbus                  - far terrain ring (+-20 km)
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

EXT, STEP = 3000.0, 5.0                     # near grid: +-3 km, 5 m cells (around the photographed street)
N = int(2 * EXT / STEP) + 1
WEXT, WSTEP = 8000.0, 10.0                  # world grid: the whole playable map, +-8 km, 10 m cells
WN = int(2 * WEXT / WSTEP) + 1
WSCALE = 50                                 # world heights stored in 2 cm steps (int16 covers +-655 m)
FAR_EXT, FAR_N = 20000.0, 401               # far ring grid (100 m cells), radius 20 km
TREE_SCALE = 4                              # tree positions stored in 25 cm steps (int16 covers +-8.19 km)
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


def cop_sampler(name='cop30'):
    C = np.load(os.path.join(RAW, name + '.npy')).astype(np.float32)
    C[C < -1000] = np.nan
    if np.isnan(C).any():
        C = np.where(np.isnan(C), np.nanmin(C), C)
    t = eval(open(os.path.join(RAW, name + '_transform.txt')).read())   # (a, b, c, d, e, f) affine
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


def fill_areas(n, ext, areas, value=1.0, dtype=np.float32):
    m = np.zeros((n, n), dtype)
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
    """sampling helpers on a square grid (index [j, i] = [z, x]); default: the near grid"""
    def __init__(self, H, ext=EXT, step=STEP):
        self.H, self.ext, self.step = H, ext, step

    def at(self, x, z):
        return cv2.remap(self.H, ((np.asarray(x, np.float32) + self.ext) / self.step), ((np.asarray(z, np.float32) + self.ext) / self.step), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


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


def window(p, R, ext=EXT, step=STEP):
    n = int(round(2 * ext / step)) + 1
    x0, z0 = p.min(0) - R; x1, z1 = p.max(0) + R
    i0 = max(0, int((x0 + ext) // step)); i1 = min(n - 1, int(math.ceil((x1 + ext) / step)))
    j0 = max(0, int((z0 + ext) // step)); j1 = min(n - 1, int(math.ceil((z1 + ext) / step)))
    if i1 < i0 or j1 < j0: return None
    return slice(j0, j1 + 1), slice(i0, i1 + 1)


def flatten_line(H, X, Z, p, half, smooth_r, blend=7.0, offset=0.0, ext=EXT, step=STEP):
    """cut & fill the terrain along a road/rail: flat cross-section, smoothed long profile"""
    if len(p) < 2: return None
    blend = max(blend, 1.4 * step)
    w = window(p, half + blend, ext, step)
    if w is None: return None
    G = Grid(H, ext, step)
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
    '264515510': dict(wall='stampedGray', roof='roofMetalRust', roofType='hip', levels=1, pitch=24, dx=-2.9, note='casa nr. 111 (poza 22): tencuială gri decorativă, acoperiș în patru ape din tablă veche ruginie'),
    '264516642': dict(wall='sand', roof='metalTileBrown', roofMat='metalTile', note='casa nr. 122 de după gardul cu stâlpi de piatră (poza 23)'),
    '304010713': dict(dx=-0.8, note='șopronul de lemn din spatele gardului maro (poza 17)'),
    '222896491': dict(wall='stuccoPeach', roof='metalTileBrown', roofMat='metalTile', roofType='gable', levels=2, ridge='x', note='casa piersicie cu 2 etaje și țiglă metalică maro, la capătul străzii (poza 17)'),
}
# landmarks from the user's photos: position from the coordinates they sent, orientation and size from the photo
LANDMARKS = [
    # photo 24: white lattice steel cross on the hill above Strada Măgurii (45.1184046 N, 25.7037585 E); nudged 5 m off the
    # lane that OSM maps right next to the pin; arms along bearing ~120 deg (right arm nearer in the photo) (the photo looks north, sun behind the camera)
    dict(type='cross', lat=45.1184046, lon=25.7037585, shift=(-4.8, -1.5), arms_bearing=120.0, pad=5.5, clear=28.0),
]
# forest stands whose OSM polygon has no leaf_type but the photos show the mix: the hill across the Prahova
# (photos 7, 17, 23: black pines between the beeches and hornbeams)
FOREST_MIXED_AT = [(20.0, 560.0), (-120.0, 520.0), (140.0, 520.0)]
HERO_SPLIT = 15.4, 10.1        # parts of footprint 123 not covered by the hand-built house: x > 15.4 (rear) and z > 9.95 (garden annex)


def main():
    import time
    from scipy.spatial import cKDTree
    t0 = time.time()
    log = lambda *a: print(f'[{time.time() - t0:5.1f}s]', *a, flush=True)
    osm = OSM(); log('osm', len(osm.nodes), len(osm.ways), len(osm.rels))
    os.makedirs(OUT, exist_ok=True)
    X, Z = grid_xz(N, EXT)                      # near grid, 5 m (photographed street and +-3 km)
    Xw, Zw = grid_xz(WN, WEXT)                  # world grid, 10 m (the whole map, +-8 km)
    lat, lon = game_to_ll(X, Z)
    latw, lonw = game_to_ll(Xw, Zw)
    terr, copf = terrarium_sampler(), cop_sampler('cop30_far')
    H = ndimage.gaussian_filter(terr(lat, lon), 0.7).astype(np.float32)
    Hw = ndimage.gaussian_filter(terr(latw, lonw), 0.4).astype(np.float32)

    # ---- land cover
    is_forest = lambda t: t.get('landuse') == 'forest' or t.get('natural') in ('wood',)
    forest_a = osm.areas(is_forest)
    farm_a = osm.areas(lambda t: t.get('landuse') in ('farmland', 'allotments'))
    orchard_a = osm.areas(lambda t: t.get('landuse') in ('orchard', 'vineyard'))
    resid_a = osm.areas(lambda t: t.get('landuse') in ('residential',))
    indus_a = osm.areas(lambda t: t.get('landuse') in ('industrial', 'railway', 'construction', 'military') or t.get('amenity') == 'parking')
    water_a = osm.areas(lambda t: t.get('natural') == 'water' and t.get('water') not in ('river', 'stream', 'canal'))
    rivers_a = osm.areas(lambda t: (t.get('natural') == 'water' and t.get('water') in ('river', 'stream', 'canal')) or t.get('waterway') == 'riverbank')
    H -= 4.0 * ndimage.gaussian_filter(fill_areas(N, EXT, forest_a), 2.0)       # DSM canopy bias -> approx. bare ground
    Hw -= 4.0 * ndimage.gaussian_filter(fill_areas(WN, WEXT, forest_a), 1.0)
    log('dem + landcover')

    # ---- Prahova: the whole waterway through the map, water level monotone downstream, riverbed carve
    def chain_river(name):
        segs = [list(nd) for nd, tg in osm.ways.values() if tg.get('waterway') == 'river' and tg.get('name') == name]
        chains = []
        while segs:
            c = segs.pop(0); changed = True
            while changed:
                changed = False
                for k, sg in enumerate(segs):
                    if sg[0] == c[-1]: c = c + sg[1:]
                    elif sg[-1] == c[0]: c = sg[:-1] + c
                    else: continue
                    segs.pop(k); changed = True; break
            q = np.array([osm.xz[n] for n in c if n in osm.xz])
            if len(q) > 1: chains.append(q)
        return max(chains, key=lambda q: float(np.hypot(*np.diff(q, axis=0).T).sum()))
    rv = chain_river('Prahova')
    rp, rd = resample(rv, 10)
    inside = (np.abs(rp[:, 0]) < WEXT + 400) & (np.abs(rp[:, 1]) < WEXT + 400)
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
    rq, rqd = resample(rp, 2.0)
    kd = cKDTree(rq)
    # river areas belonging to the Prahova (the others, e.g. Doftana, keep their own level)
    prah_a = [a_ for a_ in rivers_a if np.min(kd.query(a_[0][0][::max(1, len(a_[0][0]) // 40)])[0]) < 80]

    def carve_prahova(Hg, Xg, Zg, ext, step):
        n = Hg.shape[0]
        d, k = kd.query(np.stack([Xg.ravel(), Zg.ravel()], 1), workers=-1)
        d_r = d.reshape(Xg.shape).astype(np.float32)
        L_r = np.interp(rqd[k].reshape(Xg.shape), rd - rd[0], lev)
        rb = fill_areas(n, ext, prah_a)
        chan = d_r < 10.0
        noise = ndimage.gaussian_filter(np.random.default_rng(7).standard_normal((n, n)), 15.0 / step); noise /= noise.std()
        gravel = L_r + 0.6 + np.clip(0.3 * noise, -0.35, 0.6)
        wet = L_r - 0.25 - 1.3 * np.clip(1 - (d_r / 10.0) ** 2, 0, 1)
        T = np.where(chan, np.minimum(wet, gravel), gravel)
        zone = np.maximum(rb, chan.astype(np.float32))
        wz = np.clip(ndimage.gaussian_filter(zone, 6.5 / step) * 1.8, 0, 1)
        Hg[:] = Hg * (1 - wz) + np.minimum(T, Hg * (1 - wz) + T * wz) * wz
        return d_r, np.where((zone > 0) | (d_r < 14), L_r, np.nan).astype(np.float32)
    d_r, WL = carve_prahova(H, X, Z, EXT, STEP)
    d_rw, WLw = carve_prahova(Hw, Xw, Zw, WEXT, WSTEP)

    # smaller rivers and streams (Câmpinița, Doftana, brooks) and lakes, on both grids
    streams = []
    for wid, (nd, tg) in osm.ways.items():
        if tg.get('waterway') in ('river', 'stream') and tg.get('name') != 'Prahova':
            p = osm.pts(wid)
            if len(p): p = p[np.maximum(np.abs(p[:, 0]), np.abs(p[:, 1])) < WEXT + 300]   # only the part on the map
            if len(p) < 2: continue
            rp2, rd2 = resample(p, 5)
            la, lo = game_to_ll(rp2[:, 0], rp2[:, 1])
            l2 = np.minimum.accumulate(terr(la.reshape(1, -1), lo.reshape(1, -1)).ravel()) - 0.6
            streams.append((p, rd2, l2, num(tg.get('width'), 6.0 if tg.get('waterway') == 'river' else 2.0) / 2))

    def carve_streams(Hg, WLg, Xg, Zg, ext, step):
        for p, rd2, l2, half in streams:
            w = window(p, 20, ext, step)
            if w is None: continue
            d2, s2 = polyline_field(p, Xg[w], Zg[w])
            L2 = np.interp(s2, rd2, l2)
            bank = smoothstep(half + max(5, step), half, d2)
            Hg[w] = np.minimum(Hg[w], Hg[w] * (1 - bank) + (L2 - 0.5 * np.clip(1 - (d2 / half) ** 2, 0, 1)) * bank)
            # on the 10 m grid only real rivers get a water surface (a 2 m brook would become a 10-20 m strip)
            if step > 6 and half < 3: continue
            m = d2 < half + max(1.5, step * 0.5)
            WLg[w] = np.where(m, np.fmax(WLg[w], L2), WLg[w])
        n = Hg.shape[0]
        for outers, inners, tg, _ in water_a:
            m = fill_areas(n, ext, [(outers, inners)])
            if m.sum() == 0: continue
            ring = outers[0]
            lvl = float(np.percentile(Grid(Hg, ext, step).at(ring[:, 0], ring[:, 1]).ravel(), 15)) - 0.3
            Hg[:] = np.where(m > 0, np.minimum(Hg, lvl - 1.2), Hg)
            WLg[:] = np.where(ndimage.binary_dilation(m > 0, iterations=1), lvl, WLg)
    carve_streams(H, WL, X, Z, EXT, STEP)
    carve_streams(Hw, WLw, Xw, Zw, WEXT, WSTEP)
    log('rivers + lakes', len(streams))

    # ---- roads & railways: cut and fill, minor first
    roads, rails = [], []
    for wid, (nd, tg) in osm.ways.items():
        h = tg.get('highway')
        if h in ORDER and tg.get('area') != 'yes' and len(nd) > 1:
            p = osm.pts(wid)
            if len(p) > 1 and window(p, 10, WEXT - 20, WSTEP) is not None:
                roads.append((ORDER.index(h), wid, p, tg))
        r = tg.get('railway')
        if r in ('rail',) and len(nd) > 1:
            p = osm.pts(wid)
            if len(p) > 1 and window(p, 10, WEXT - 20, WSTEP) is not None:
                rails.append((wid, p, tg))
    roads.sort(key=lambda r: r[0])
    for Hg, Xg, Zg, ext, step in ((H, X, Z, EXT, STEP), (Hw, Xw, Zw, WEXT, WSTEP)):
        for _, wid, p, tg in roads:
            if tg.get('bridge') or tg.get('tunnel') or tg['highway'] == 'steps': continue
            flatten_line(Hg, Xg, Zg, p, road_width(wid, tg) / 2, SMOOTH.get(tg['highway'], 25 if tg['highway'] in ('residential', 'unclassified') else 35), ext=ext, step=step)
        for wid, p, tg in rails:
            if tg.get('bridge') or tg.get('tunnel'): continue
            flatten_line(Hg, Xg, Zg, p, 2.2, 60, blend=8, offset=0.35, ext=ext, step=step)
        log('roads', len(roads), 'rails', len(rails), 'grid', step)

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

    # ---- landmarks: a level pad for the foundation (near grid), recorded for the game
    lm_out = []
    for lm in LANDMARKS:
        x, z = ll_to_game(lm['lat'], lm['lon'])
        x, z = float(x) + lm['shift'][0], float(z) + lm['shift'][1]
        pad = float(Grid(H).at(np.float32([x]), np.float32([z])).ravel()[0])
        d = np.hypot(X - x, Z - z)
        w = 1 - smoothstep(lm['pad'], lm['pad'] + 9, d)
        H = H * (1 - w) + pad * w
        b = math.radians(lm['arms_bearing'])
        ax, az = math.cos(b - math.radians(312.02)), math.cos(b - THETA)      # bearing -> game (x, z)
        lm_out.append(dict(type=lm['type'], x=round(x, 2), z=round(z, 2), y=round(pad - H0, 2), rot=round(math.atan2(-az, ax), 4), clear=lm['clear']))
    log('landmarks', lm_out)

    # ---- stitch: the near grid's edge follows the world grid; the world grid takes the near grid inside
    edge = np.maximum(np.abs(X), np.abs(Z))
    we = smoothstep(EXT - 200, EXT, edge)
    H = H * (1 - we) + Grid(Hw, WEXT, WSTEP).at(X, Z) * we
    WL[we > 0.5] = np.nan
    kq = int(round((WEXT - EXT) / WSTEP)); rq_ = int(round(2 * EXT / WSTEP)) + 1
    stride = int(round(WSTEP / STEP))
    Hw[kq:kq + rq_, kq:kq + rq_] = H[::stride, ::stride]
    WLw[kq:kq + rq_, kq:kq + rq_] = np.nan
    # ... and the world grid's edge fades into the far Copernicus DEM
    edgew = np.maximum(np.abs(Xw), np.abs(Zw))
    wew = smoothstep(WEXT - 300, WEXT, edgew)
    Hw = Hw * (1 - wew) + copf(latw, lonw) * wew
    WLw[wew > 0.5] = np.nan

    Y = H - H0
    Yw = Hw - H0
    gzs, gxs = np.gradient(Y, STEP)
    slope = np.degrees(np.arctan(np.hypot(gxs, gzs)))
    cn = ndimage.gaussian_filter(np.random.default_rng(3).standard_normal((N, N)), 1.6); cn /= cn.std()
    # photos 7, 17, 23: two bare scars, one each side of the street axis (~40 m left, ~35 m right),
    # with forest between them
    CLAY = (slope > 16) & ((np.abs(X - 42 + 8 * cn) < 22 + 7 * cn) | (np.abs(X + 36 + 8 * cn) < 19 + 6 * cn)) & (Z > 395) & (Z < 545) & (cn > -0.9)
    CLAY = ndimage.binary_opening(CLAY, iterations=1)
    write_b64('height.json', np.clip(np.round(Y * 100), -32000, 32000).astype('<i2'))
    write_b64('height_w.json', np.clip(np.round(Yw * WSCALE), -32000, 32000).astype('<i2'))
    Xf, Zf = grid_xz(FAR_N, FAR_EXT)
    laf, lof = game_to_ll(Xf, Zf)
    Yf = copf(laf, lof) - H0
    Yf[np.hypot(Xf, Zf) > FAR_EXT * 1.02] = -3276.8      # corners: no data
    write_b64('far.json', np.clip(np.round(Yf * 10), -32768, 32000).astype('<i2'))
    log('height range', Y.min().round(1), Y.max().round(1), 'world', Yw.min().round(1), Yw.max().round(1), 'far', Yf.min().round(1), Yf.max().round(1))

    # water cells (cell (i, j) spans grid nodes i..i+1, j..j+1)
    def water_cells(WLg, Yg):
        W4 = np.stack([WLg[:-1, :-1], WLg[:-1, 1:], WLg[1:, :-1], WLg[1:, 1:]])
        Y4 = np.stack([Yg[:-1, :-1], Yg[:-1, 1:], Yg[1:, :-1], Yg[1:, 1:]]) + H0
        with np.errstate(invalid='ignore'), __import__('warnings').catch_warnings():
            __import__('warnings').simplefilter('ignore')
            lvl4 = np.nanmean(W4, 0)
        sel = ~np.isnan(W4).all(0) & (Y4 < lvl4 + 0.02).any(0)
        jj_, ii_ = np.nonzero(sel)
        return np.stack([ii_, jj_, np.round((lvl4[sel] - H0) * 100).astype(int)], 1).tolist()
    cells = water_cells(WL, Y)
    cells_w = water_cells(WLw, Yw)
    log('water cells', len(cells), 'world', len(cells_w))

    # ---- textures: Sentinel-2 ground colour (near, world, far) and land-cover splats
    bld_areas = osm.areas(lambda t: 'building' in t)

    def ground_colour(n, ext, zoom, halo_m=2.9, garden=0.45):
        Xt, Zt = grid_xz(n, ext)
        col = s2_mosaic_sampler(zoom)(*game_to_ll(Xt, Zt))
        # roofs are modelled in 3D: paint them out of the ground colour (else they glow as halos)
        bm = np.zeros((n, n), np.uint8)
        s = (n - 1) / (2 * ext)
        for outers, _, tg, _ in bld_areas:
            for r in outers:
                cv2.fillPoly(bm, [np.round(to_px(r, n, ext) * 8).astype(np.int32)], 255, cv2.LINE_8, 3)
        k = max(3, int(round(halo_m * s)) | 1)
        bm = cv2.dilate(bm, np.ones((k, k), np.uint8))
        col = cv2.inpaint(col, bm, 4, cv2.INPAINT_TELEA)
        # 10 m pixels in the village mix roofs, yards and gardens: pull them towards garden green
        k2 = max(5, int(round(5.3 * s)) | 1)
        vil = cv2.GaussianBlur(cv2.dilate(bm, np.ones((k2, k2), np.uint8)).astype(np.float32) / 255, (0, 0), max(1.0, 1.75 * s)) * garden
        return (col * (1 - vil[..., None]) + np.array([52, 92, 70], np.float32) * vil[..., None]).astype(np.uint8)

    def splat_map(n, ext, clay_t=None):
        sp = lambda a: fill_areas(n, ext, a)
        rb_t = fill_areas(n, ext, rivers_a)
        s = (n - 1) / (2 * ext)
        lines_rail = draw_lines(n, ext, [(p, 5.0) for _, p, _ in rails], 5.0)
        rd_mask = draw_lines(n, ext, [(p, road_width(w, t)) for _, w, p, t in roads if road_surface(t) in ('gravel', 'dirt')], 3)
        ct = clay_t if clay_t is not None else 0
        R_ = np.clip(sp(forest_a), 0, 1) * (1 - ct)
        G_ = np.clip(np.maximum(sp(farm_a) * 0.9, ct), 0, 1)
        B_ = np.clip(np.maximum.reduce([rb_t, lines_rail, sp(indus_a) * 0.6, rd_mask * 0.8]), 0, 1)
        return cv2.GaussianBlur(np.stack([B_, G_, R_], -1), (0, 0), max(0.8, 1.2 * s / 0.34))

    TN = 2048
    s2n = ground_colour(TN, EXT, 15)
    clay_t = cv2.GaussianBlur(cv2.resize(CLAY.astype(np.float32), (TN, TN), interpolation=cv2.INTER_LINEAR), (0, 0), 1.2)
    # erosion gullies: vertical streaks (down the slope, i.e. along +z) of darker clay and scrub
    streak = cv2.GaussianBlur(np.random.default_rng(4).random((TN, TN)).astype(np.float32), (0, 0), sigmaX=1.0, sigmaY=6.0)
    streak = (streak - streak.mean()) / streak.std()
    clay_t = np.clip(clay_t * (0.8 + 0.25 * streak), 0, 1)
    clay_bgr = np.array([118, 138, 156], np.float32)            # grey-ochre clay of the eroded bank (photo 7)
    s2n = (s2n * (1 - clay_t[..., None]) + clay_bgr * clay_t[..., None]).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, 'ortho.jpg'), s2n, [cv2.IMWRITE_JPEG_QUALITY, 88])
    cv2.imwrite(os.path.join(OUT, 'splat.png'), np.round(splat_map(TN, EXT, clay_t) * 255).astype(np.uint8))
    TW = 4096
    # z14 tiles are softer: roofs bleed ~15 m into the yards, so the halo and the garden blend are wider
    s2w = ground_colour(TW, WEXT, 14, halo_m=16.0, garden=0.62)
    cv2.imwrite(os.path.join(OUT, 'ortho_w.jpg'), s2w, [cv2.IMWRITE_JPEG_QUALITY, 86])
    cv2.imwrite(os.path.join(OUT, 'splat_w.png'), np.round(splat_map(TW, WEXT) * 255).astype(np.uint8))
    Xft, Zft = grid_xz(2048, FAR_EXT)
    cv2.imwrite(os.path.join(OUT, 'ortho_far.jpg'), s2_mosaic_sampler(11)(*game_to_ll(Xft, Zft)), [cv2.IMWRITE_JPEG_QUALITY, 85])
    log('textures')

    # ---- buildings
    Gy, Gyw = Grid(Y.astype(np.float32)), Grid(Yw.astype(np.float32), WEXT, WSTEP)

    def ysamp(xs, zs):
        xs, zs = np.asarray(xs, np.float32).ravel(), np.asarray(zs, np.float32).ravel()
        inner = (np.abs(xs) < EXT - 1) & (np.abs(zs) < EXT - 1)
        return np.where(inner, Gy.at(xs, zs).ravel(), Gyw.at(xs, zs).ravel())
    bl = []
    build_src = [(o, tg, wid) for o, _, tg, wid in osm.areas(lambda t: 'building' in t and t.get('building') not in ('roof', 'no'))]
    for outers, tg, wid in build_src:
        p = ring_clean(outers[0])
        if len(p) < 3: continue
        cx, cz = p.mean(0)
        if max(abs(cx), abs(cz)) > WEXT - 30: continue
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
        ys = ysamp(np.append(p[:, 0], cx), np.append(p[:, 1], cz))
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
    inmap = lambda q: len(q) and np.max(np.abs(q)) < WEXT + 200
    plat = [dict(id=wid, p=np.round(o[0], 2).ravel().tolist()) for o, _, tg, wid in osm.areas(lambda t: t.get('railway') == 'platform') if inmap(o[0])]
    power = []
    for wid, (nd, tg) in osm.ways.items():
        if tg.get('power') in ('line', 'minor_line'):
            pts = [(osm.xz[n], osm.nodes[n][2].get('power', '')) for n in nd if n in osm.xz]
            pts = [a for a in pts if max(abs(a[0][0]), abs(a[0][1])) < WEXT + 400]
            if len(pts) < 2: continue
            power.append(dict(id=wid, k=tg['power'], v=tg.get('voltage', ''), p=[[round(a[0][0], 2), round(a[0][1], 2), 1 if a[1] in ('tower', 'pole') else 0] for a in pts]))
    trees_osm = [[round(a, 2) for a in osm.xz[n]] for n, (la_, lo_, tg) in osm.nodes.items() if tg.get('natural') == 'tree' and max(abs(osm.xz[n][0]), abs(osm.xz[n][1])) < WEXT - 20]

    # ---- exclusion rasters for trees/fences/poles over the whole map (10240^2, 1.56 m/px)
    XN = 10240
    s_ = (XN - 1) / (2 * WEXT)
    EXR = np.zeros((XN, XN), np.uint8)
    for rec in bl:
        cv2.fillPoly(EXR, [np.round(to_px(np.array(rec['p']).reshape(-1, 2), XN, WEXT) * 8).astype(np.int32)], 1, cv2.LINE_8, 3)
    EXR = cv2.dilate(EXR, np.ones((3, 3), np.uint8))
    for _, wid, p, tg in roads:
        th = max(1, int(round((road_width(wid, tg) + 2.4) * s_)))
        cv2.polylines(EXR, [np.round(to_px(p, XN, WEXT) * 8).astype(np.int32)], False, 2, th, cv2.LINE_8, 3)
    for wid, p, tg in rails:
        cv2.polylines(EXR, [np.round(to_px(p, XN, WEXT) * 8).astype(np.int32)], False, 3, max(1, int(7 * s_)), cv2.LINE_8, 3)
    FN = 20001                                  # 0.8 m raster for fence clearances
    frs = (FN - 1) / (2 * WEXT)
    FR = np.zeros((FN, FN), np.uint8)
    for _, wid, p, tg in roads:
        cv2.polylines(FR, [np.round(to_px(p, FN, WEXT) * 8).astype(np.int32)], False, 1, max(1, int(round((road_width(wid, tg) + 0.4) * frs))), cv2.LINE_8, 3)
    for wid, p, tg in rails:
        cv2.polylines(FR, [np.round(to_px(p, FN, WEXT) * 8).astype(np.int32)], False, 1, int(round(6 * frs)), cv2.LINE_8, 3)
    for rec_ in bl:
        cv2.fillPoly(FR, [np.round(to_px(np.array(rec_['p']).reshape(-1, 2), FN, WEXT) * 8).astype(np.int32)], 1, cv2.LINE_8, 3)
    FR = cv2.dilate(FR, np.ones((3, 3), np.uint8))
    vx = np.linspace(-WEXT, WEXT, XN).astype(np.float32)
    XX, ZZ = vx[None, :], vx[:, None]                      # broadcast instead of two 10240^2 arrays
    rb_x = fill_areas(XN, WEXT, rivers_a, dtype=np.uint8) > 0
    dr_x = cv2.resize(np.clip(d_rw, 0, 255).astype(np.uint8), (XN, XN), interpolation=cv2.INTER_LINEAR)
    g16 = s2w.astype(np.int16)
    green = cv2.resize((g16[..., 1] - (g16[..., 0] + g16[..., 2]) // 2).astype(np.float32), (XN, XN), interpolation=cv2.INTER_LINEAR)
    del g16
    lots = ((XX > SKIP_TREES[0]) & (XX < SKIP_TREES[1])) & ((ZZ > SKIP_TREES[2]) & (ZZ < SKIP_TREES[3]))
    clay_x = np.zeros((XN, XN), bool)
    kc = (XN - 1) / (2 * WEXT)
    ci0 = int(round((WEXT - EXT) * kc)); ci1 = int(round((WEXT + EXT) * kc)) + 1
    clay_x[ci0:ci1, ci0:ci1] = cv2.resize(CLAY.astype(np.uint8), (ci1 - ci0, ci1 - ci0), interpolation=cv2.INTER_NEAREST) > 0
    edge_x = np.maximum(np.abs(XX), np.abs(ZZ))
    free = (EXR == 0) & ~clay_x & ~rb_x & (dr_x > 12) & ~lots & (edge_x < WEXT - 20)
    for lm in lm_out:                                     # meadow around the landmarks (photo 24)
        free &= (XX - lm['x']) ** 2 + (ZZ - lm['z']) ** 2 > lm['clear'] ** 2
    forest_x = fill_areas(XN, WEXT, forest_a, dtype=np.uint8) > 0
    orch_x = fill_areas(XN, WEXT, orchard_a, dtype=np.uint8) > 0
    resid_x = fill_areas(XN, WEXT, resid_a, dtype=np.uint8) > 0
    farm_x = fill_areas(XN, WEXT, farm_a, dtype=np.uint8) > 0
    near_b = cv2.dilate((EXR == 1).astype(np.uint8), np.ones((39, 39), np.uint8)) > 0     # within ~30 m of a building
    # town centres: blocks of flats, shops, industry -> no lot fences along those streets
    blk = np.zeros((XN, XN), np.uint8)
    for rec_ in bl:
        if rec_['roof'] == 'flat' or rec_['b'] in ('apartments', 'commercial', 'retail', 'industrial', 'school', 'hospital', 'public', 'office'):
            cv2.fillPoly(blk, [np.round(to_px(np.array(rec_['p']).reshape(-1, 2), XN, WEXT) * 8).astype(np.int32)], 1, cv2.LINE_8, 3)
    blk = cv2.dilate(blk, np.ones((29, 29), np.uint8)) > 0                                  # ~22 m around them
    log('exclusion rasters')
    trng = np.random.default_rng(11)

    def scatter(spacing, mask, keep=1.0, jitter=0.42, far_keep=1.0, out_keep=0.5):
        # density falls with distance from the street: full inside 1.6 km, far_keep to 3 km, then far_keep * out_keep
        n = int(2 * WEXT / spacing)
        g = (np.arange(n) + 0.5) * spacing - WEXT
        gx, gz = np.meshgrid(g, g)
        px = gx + trng.uniform(-jitter, jitter, gx.shape) * spacing
        pz = gz + trng.uniform(-jitter, jitter, gz.shape) * spacing
        ii = np.clip(np.round((px + WEXT) * s_).astype(int), 0, XN - 1)
        jj = np.clip(np.round((pz + WEXT) * s_).astype(int), 0, XN - 1)
        r = np.maximum(np.abs(px), np.abs(pz))
        k = keep * np.where(r > 3000, far_keep * out_keep, np.where(r > 1600, far_keep, 1.0))
        ok = mask[jj, ii] & (trng.random(px.shape) < k)
        return px[ok], pz[ok], jj[ok], ii[ok]
    T_ = []
    # ---- forest stands (the forest trees themselves are generated in the game around the player):
    # 5 m raster, 2 bits per cell: 0 none, 1 broadleaved (beech / oak / hornbeam), 2 mixed, 3 needleleaved
    F5 = int(round(2 * WEXT / 5)) + 1
    LEAF = {'broadleaved': 1, 'mixed': 2, 'needleleaved': 3}
    fcode = np.zeros((F5, F5), np.uint8)
    from shapely.geometry import Point, Polygon as SPoly
    for outers, inners, tg, _ in forest_a:
        code = LEAF.get(tg.get('leaf_type'), 9)
        if code == 9 and any(SPoly(outers[0]).contains(Point(*q)) for q in FOREST_MIXED_AT if len(outers[0]) > 2): code = 2
        for r in outers: cv2.fillPoly(fcode, [np.round(to_px(r, F5, WEXT) * 8).astype(np.int32)], int(code), cv2.LINE_8, 3)
        for r in inners: cv2.fillPoly(fcode, [np.round(to_px(r, F5, WEXT) * 8).astype(np.int32)], 0, cv2.LINE_8, 3)
    # untagged stands: mostly broadleaved, with mixed and pine stands in patches of a few hectares
    nz = ndimage.gaussian_filter(np.random.default_rng(21).standard_normal((F5 // 8 + 1,) * 2), 2.0)
    nz = cv2.resize((nz / nz.std()).astype(np.float32), (F5, F5), interpolation=cv2.INTER_CUBIC)
    unk = fcode == 9
    fcode[unk] = np.where(nz[unk] > 1.5, 3, np.where(nz[unk] > 0.9, 2, 1)).astype(np.uint8)
    blocked = cv2.resize((~free).astype(np.uint8) * 255, (F5, F5), interpolation=cv2.INTER_AREA) > 110
    fcode[blocked] = 0
    flat = np.concatenate([fcode.ravel(), np.zeros((-fcode.size) % 4, np.uint8)]).reshape(-1, 4)
    write_b64('forest.json', (flat[:, 0] | flat[:, 1] << 2 | flat[:, 2] << 4 | flat[:, 3] << 6).astype(np.uint8))
    log('forest stands', {k: int((fcode == v).sum() * 25 / 1e4) for k, v in (('broad ha', 1), ('mixed ha', 2), ('needle ha', 3))})
    # riverside willows / poplars on the green parts of the river corridor
    wx_, wz_, jj, ii = scatter(7.0, (EXR == 0) & ~rb_x & (dr_x > 11) & (dr_x < 120) & (green > 6) & ~forest_x & ~lots, out_keep=0.5)
    T_.append((wx_, wz_, trng.choice([5, 1], len(wx_), p=[0.7, 0.3]), trng.uniform(0.75, 1.15, len(wx_))))
    # orchards (plum / apple rows)
    ox_, oz_, _, _ = scatter(6.0, free & orch_x, keep=0.85, jitter=0.12, far_keep=0.5, out_keep=0.3)
    T_.append((ox_, oz_, np.full(len(ox_), 3), trng.uniform(0.8, 1.1, len(ox_))))
    # yards: fruit trees, walnuts, spruces where Sentinel-2 shows vegetation
    yx_, yz_, jj, ii = scatter(10.0, free & (resid_x | near_b) & ~forest_x & ~orch_x & ~farm_x & (green > 4), far_keep=0.75, out_keep=0.5)
    T_.append((yx_, yz_, trng.choice([3, 4, 1, 2, 0], len(yx_), p=[0.45, 0.18, 0.17, 0.12, 0.08]), trng.uniform(0.7, 1.15, len(yx_))))
    # scattered field trees
    sx_, sz_, _, _ = scatter(32.0, free & ~forest_x & ~resid_x & ~near_b & (green > 10), keep=0.35, out_keep=1.0)
    T_.append((sx_, sz_, trng.choice([0, 1, 4], len(sx_)), trng.uniform(0.8, 1.2, len(sx_))))
    if trees_osm:
        a = np.array(trees_osm)
        T_.append((a[:, 0], a[:, 1], np.full(len(a), 0), np.full(len(a), 1.0)))
    tx = np.concatenate([t[0] for t in T_]); tz = np.concatenate([t[1] for t in T_])
    tt = np.concatenate([t[2] for t in T_]); ts = np.concatenate([t[3] for t in T_])
    rec = np.zeros(len(tx), dtype=[('x', '<i2'), ('z', '<i2'), ('t', 'u1'), ('s', 'u1')])
    rec['x'] = np.round(tx * TREE_SCALE); rec['z'] = np.round(tz * TREE_SCALE); rec['t'] = tt; rec['s'] = np.round(ts * 100)
    write_b64('trees.json', rec)
    log('trees', len(rec), [len(t[0]) for t in T_])

    # ---- street fences (lot fronts) and utility poles along village streets
    from shapely.geometry import LineString
    fences, poles = [], []
    frng = np.random.default_rng(5)
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
            ii = np.clip(np.round((q[:, 0] + WEXT) * s_).astype(int), 0, XN - 1); jj = np.clip(np.round((q[:, 1] + WEXT) * s_).astype(int), 0, XN - 1)
            fi = np.clip(np.round((q[:, 0] + WEXT) * frs).astype(int), 0, FN - 1); fj = np.clip(np.round((q[:, 1] + WEXT) * frs).astype(int), 0, FN - 1)
            valid = (FR[fj, fi] == 0) & ~blk[jj, ii] & ~rb_x[jj, ii] & ~forest_x[jj, ii] & (near_b[jj, ii] | resid_x[jj, ii]) & ~lotsbox(q) & (np.maximum(np.abs(q[:, 0]), np.abs(q[:, 1])) < WEXT - 40)
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
                i_, j_ = int(round((c[0] + WEXT) * s_)), int(round((c[1] + WEXT) * s_))
                near_lm = any(math.hypot(c[0] - lm['x'], c[1] - lm['z']) < 45 for lm in lm_out)     # open hilltop around the cross (photo 24)
                if not (0 <= i_ < XN and 0 <= j_ < XN) or EXR[j_, i_] == 1 or lots[j_, i_] or rb_x[j_, i_] or near_lm or max(abs(c[0]), abs(c[1])) > WEXT - 30:
                    if len(seq) > 1: poles.append(dict(s=side, p=seq))
                    seq = []; continue
                seq.append([round(float(c[0]), 2), round(float(c[1]), 2)])
            if len(seq) > 1: poles.append(dict(s=side, p=seq))
    log('fences', len(fences), 'pole runs', len(poles))

    zs = zc[rows]
    geo = dict(
        meta=dict(origin=dict(lat=LAT0, lon=LON0, bearing=math.degrees(THETA), zShift=Z_SHIFT, h0=round(H0, 2)),
                  grid=dict(n=N, ext=EXT, step=STEP), world=dict(n=WN, ext=WEXT, step=WSTEP, scale=WSCALE),
                  far=dict(n=FAR_N, ext=FAR_EXT), trees=dict(scale=TREE_SCALE),
                  street=dict(z0=STREET_Z[0], z1=STREET_Z[1]), lots=LOTS,
                  sources=['OpenStreetMap contributors (ODbL)', 'Terrain Tiles on AWS (EU-DEM/SRTM, terrarium z15)',
                           'Copernicus GLO-30 DSM', 'Sentinel-2 cloudless 2023 by EOX (CC BY-NC-SA 4.0)']),
        profile=dict(z0=float(zs[0]), step=STEP, y=np.round(prof2[rows] - H0, 3).tolist()),
        buildings=bl, roads=rl, rails=ral, platforms=plat, power=power, water=cells, water2=cells_w,
        river=dict(p=np.round(rp, 1).ravel().tolist(), lev=np.round(lev - H0, 2).tolist()),
        fences=fences, poles=poles, landmarks=lm_out, forest=dict(n=F5, ext=WEXT, step=5.0))
    with open(os.path.join(OUT, 'geo.json'), 'w') as f:
        json.dump(geo, f, separators=(',', ':'), ensure_ascii=False)
    log('geo.json', os.path.getsize(os.path.join(OUT, 'geo.json')) // 1024, 'KB')


if __name__ == '__main__':
    main()
