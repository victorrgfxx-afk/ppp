"""The houses OSM lacks, from Microsoft's Global ML Building Footprints (ODbL; footprints traced by a neural network from
Bing aerial imagery, https://github.com/microsoft/GlobalMLBuildingFootprints).

The user's drone photos of 27 Sep 2026 show about three times the houses OSM maps along some streets (Strada
Zarzărului: 11 mapped, 30-odd in photo 163818). The tile of quadkey 120320322 (zoom 9) holds the whole map (+-8 km).
Its footprints are projected like build_geo.py's, then moved by the offset measured against the buildings both have
(the median of the matched pairs within 1.5 km: ~2.6 m, the two imageries' registration, drifting over the map), and
kept only where OSM has no building (less than a quarter of either footprint shared; a smaller overlap, an annex
against a mapped house, is cut away), off the rails and the platforms (a rake of tank wagons looks like a long roof),
off the middle of the mapped roads (lorries, buses), off the water, at least 12 m2.

Output: assets/geo/ml_buildings.json, records like geo.json's buildings (p, b, lv, r, roof; no ground heights: the game
reads them off its terrain) for src/geo/amprente.js, which adds them once the roads are planned (clear of the planned
ribbons and of the places built from photos). Run after build_geo.py:  python3 geo/ml_footprints.py
"""
import csv
import gzip
import io
import json
import math
import os
import urllib.request

import numpy as np
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'geo')
CACHE = os.path.join(HERE, 'raw')
QUADKEY = '120320322'
LINKS = 'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv'

LAT0, LON0 = 45.13403, 25.71109             # as build_geo.py
THETA = math.radians(42.02)
Z_SHIFT = -14.6
KX = 111320 * math.cos(math.radians(LAT0))
KY = 111132.954 - 559.822 * math.cos(2 * math.radians(LAT0))
S_, C_ = math.sin(THETA), math.cos(THETA)
EXT, STEP = 3000.0, 5.0                     # the near grid (+-3 km, 5 m cells)
REACH = 7960.0                              # the whole map: the world grid's +-8 km, 40 m in


def ll_to_game(lon, lat):
    e = (lon - LON0) * KX
    n = (lat - LAT0) * KY
    return -e * C_ + n * S_, e * S_ + n * C_ + Z_SHIFT


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'ml_{QUADKEY}.csv.gz')
    if not os.path.exists(path):
        links = urllib.request.urlopen(LINKS, timeout=120).read().decode()
        url = next(r['Url'] for r in csv.DictReader(io.StringIO(links)) if r['Location'] == 'Romania' and r['QuadKey'] == QUADKEY)
        with open(path, 'wb') as f:
            f.write(urllib.request.urlopen(url, timeout=600).read())
    return path


def signed_area(p):
    x, z = p[:, 0], p[:, 1]
    return 0.5 * float(np.sum(x * np.roll(z, -1) - np.roll(x, -1) * z))


def inside(poly, x, z):
    c = False
    n = len(poly)
    for i in range(n):
        x1, z1 = poly[i]; x2, z2 = poly[i - 1]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
            c = not c
    return c


def decompose(p):
    """build_geo.py's decompose (<= 5 overlapping rectangles for hip roofs: [cx, cz, hw, hd, angle]), without OpenCV"""
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
        qq = [tuple(v) for v in q]
        occ = np.array([[inside(qq, (xs[k] + xs[k + 1]) / 2, (zs[l] + zs[l + 1]) / 2) for l in range(len(zs) - 1)] for k in range(len(xs) - 1)])
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
    # the minimum-area rectangle (shapely's)
    mr = Polygon(p).minimum_rotated_rectangle
    v = np.asarray(mr.exterior.coords)[:4]
    e0, e1 = v[1] - v[0], v[2] - v[1]
    w, h = float(np.hypot(*e0)), float(np.hypot(*e1))
    cx, cz = v.mean(0)
    return [[round(float(cx), 2), round(float(cz), 2), round(w / 2, 2), round(h / 2, 2), round(math.atan2(e0[1], e0[0]), 4)]], area / max(w * h, 1e-3) > 0.8


def main():
    geo = json.load(open(os.path.join(OUT, 'geo.json')))
    osm = []
    for b in geo['buildings']:
        p = b['p']
        if len(p) >= 6:
            P = Polygon([(p[i], p[i + 1]) for i in range(0, len(p), 2)]).buffer(0)
            if P.area > 1: osm.append(P)
    tree = STRtree(osm)
    blocked = []
    for r in geo['rails']:
        p = r['p']
        if len(p) >= 4: blocked.append(LineString([(p[i], p[i + 1]) for i in range(0, len(p), 2)]).buffer(4.0))
    for pl in geo.get('platforms', []):
        p = pl['p']
        if len(p) >= 6: blocked.append(Polygon([(p[i], p[i + 1]) for i in range(0, len(p), 2)]).buffer(1.0))
    for r in geo['roads']:
        p = r['p']
        if len(p) >= 4: blocked.append(LineString([(p[i], p[i + 1]) for i in range(0, len(p), 2)]).buffer(max(1.0, (r.get('w') or 4) / 2 - 0.8)))
    btree = STRtree(blocked)
    # the water: the near grid's 5 m cells and the world grid's 10 m ones
    wm = geo['meta']['world']
    wet_n = {(c[0], c[1]) for c in geo.get('water', [])}
    wet_w = {(c[0], c[1]) for c in geo.get('water2', [])}

    def wet(x, z):
        if abs(x) < EXT and abs(z) < EXT: return (int((x + EXT) // STEP), int((z + EXT) // STEP)) in wet_n
        return (int((x + wm['ext']) // wm['step']), int((z + wm['ext']) // wm['step'])) in wet_w

    raw = []
    for line in gzip.open(fetch(), 'rt'):
        f = json.loads(line)
        ring = f['geometry']['coordinates'][0]
        xy = np.array([ll_to_game(lon, lat) for lon, lat in ring])
        if xy[:, 0].min() > REACH or xy[:, 0].max() < -REACH or xy[:, 1].min() > REACH or xy[:, 1].max() < -REACH: continue
        raw.append(xy)
    # the offset between the two imageries, from the buildings both have (similar size, overlapping): it drifts over
    # the map (2.70, -0.84 m round the street; 2.58, -0.70 m over all of it), so the median of the pairs within 1.5 km
    # of each 1 km cell where there are 25 of them, the whole map's elsewhere
    d = []
    for xy in raw:
        P = Polygon(xy).buffer(0)
        if P.area < 40: continue
        best = None
        for i in tree.query(P.buffer(4)):
            o = osm[i]
            if abs(o.area - P.area) > 0.35 * max(o.area, P.area): continue
            inter = P.intersection(o).area
            if best is None or inter > best[0]: best = (inter, o)
        if best and best[0] > 0.3 * P.area:
            d.append((P.centroid.x, P.centroid.y, best[1].centroid.x - P.centroid.x, best[1].centroid.y - P.centroid.y))
    d = np.array(d)
    off0 = np.median(d[:, 2:], 0)
    cells = {}

    def offset(x, z):
        k = (int(x // 1000), int(z // 1000))
        if k not in cells:
            c = np.array([(k[0] + 0.5) * 1000, (k[1] + 0.5) * 1000])
            sel = np.hypot(d[:, 0] - c[0], d[:, 1] - c[1]) < 1500
            cells[k] = np.median(d[sel, 2:], 0) if sel.sum() >= 25 else off0
        return cells[k]
    print(f'{len(raw)} footprints on the map; offset to OSM from {len(d)} pairs: dx {off0[0]:.2f} dz {off0[1]:.2f}')

    out, kept, kcell = [], [], {}
    stats = dict(small=0, osm=0, blocked=0, wet=0, ml=0, cut=0)
    near = lambda P, m=1.0: {i for gx in range(int((P.bounds[0] - m) // 50), int((P.bounds[2] + m) // 50) + 1) for gz in range(int((P.bounds[1] - m) // 50), int((P.bounds[3] + m) // 50) + 1) for i in kcell.get((gx, gz), ())}
    for xy in raw:
        c = xy.mean(0)
        xy = xy + offset(c[0], c[1])
        P = Polygon(xy).buffer(0)
        if P.geom_type != 'Polygon' or P.area < 12: stats['small'] += 1; continue
        mapped = [osm[i] for i in tree.query(P.buffer(0.3))]
        if any(P.intersection(o).area > 0.25 * min(P.area, o.area) for o in mapped): stats['osm'] += 1; continue
        if any(P.intersects(blocked[i]) for i in btree.query(P)): stats['blocked'] += 1; continue
        if any(wet(x, z) for x, z in list(xy) + [tuple(c)]): stats['wet'] += 1; continue
        mine = [kept[i] for i in near(P)]
        if any(P.intersection(k).area > 0.25 * min(P.area, k.area) for k in mine): stats['ml'] += 1; continue
        # a small overlap (an annex against a mapped house, the two imageries' registration): cut away, 0.3 m clear
        touch = [o for o in mapped + mine if o.distance(P) < 0.3]
        if touch:
            Q = P.difference(unary_union(touch).buffer(0.3, join_style=2, mitre_limit=2.0))
            parts = [g for g in getattr(Q, 'geoms', [Q]) if g.geom_type == 'Polygon']
            Q = max(parts, key=lambda g: g.area) if parts else None
            if Q is None or Q.area < 12 or Q.area < 0.6 * P.area: stats['cut'] += 1; continue
            P = Q
        P = P.simplify(0.25)
        if P.geom_type != 'Polygon': continue
        p = np.asarray(P.exterior.coords)[:-1]
        if len(p) < 3: continue
        if signed_area(p) < 0: p = p[::-1]
        k = len(kept)
        kept.append(P)
        b = P.bounds
        for gx in range(int(b[0] // 50), int(b[2] // 50) + 1):
            for gz in range(int(b[1] // 50), int(b[3] // 50) + 1): kcell.setdefault((gx, gz), []).append(k)
        out.append((p, P.area))
    print('dropped:', stats)
    recs = []
    for k, (p, area) in enumerate(out):
        cx, cz = p.mean(0)
        rects, ok = decompose(p)
        hsh = (int(abs(cx) * 7919) ^ int(abs(cz) * 104729)) % 100
        # what they are by their size (no heights in this tile): sheds and garages under 30 m2; houses, of two storeys a
        # third of those of 75-140 m2 and 55 % of the larger ones (an estimate, not measured); the big ones flat-roofed
        # works. Their ground heights are read in the game (amprente.js), off the terrain as the places leave it
        if area < 30: b, lv, roof = 'shed', 1, 'shed'
        elif area > 700: b, lv, roof = 'industrial', 1, 'flat'
        else: b, lv, roof = 'house', (2 if (area > 75 and hsh < (55 if area > 140 else 33)) else 1), 'hip'
        rec = dict(id=f'ml{k}', p=np.round(p, 1).ravel().tolist(), b=b, lv=lv, r=[[round(v, 1) for v in r[:4]] + [r[4]] for r in rects], roof=roof)
        if not ok and roof == 'hip': rec['fit'] = 0
        recs.append(rec)
    src = dict(source='Microsoft Global ML Building Footprints (ODbL), quadkey ' + QUADKEY, offset=[round(float(off0[0]), 2), round(float(off0[1]), 2)], buildings=recs)
    with open(os.path.join(OUT, 'ml_buildings.json'), 'w') as f:
        json.dump(src, f, separators=(',', ':'))
    kinds = {}
    for r in recs: kinds[r['b']] = kinds.get(r['b'], 0) + 1
    print(f'{len(recs)} buildings OSM lacks:', kinds)


if __name__ == '__main__':
    main()
