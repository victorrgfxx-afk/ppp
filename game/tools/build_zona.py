"""
Construieste game/src/zona.js din date reale:
  - OpenStreetMap (c) contribuitorii OpenStreetMap, ODbL
  - Copernicus GLO-30 DEM (c) DLR e.V. 2010-2014 si (c) Airbus Defence and Space GmbH 2014-2018,
    furnizat prin programul COPERNICUS al Uniunii Europene si ESA
Cadrul de joc: strada-erou pe axa Z (x = 0), capatul dinspre rau spre -Z.
"""
import json, math, sys
import numpy as np, rasterio
sys.path.insert(0, '.')
from osmload import load, assemble_rings, LAT0, LON0, KX, KY

OUT = sys.argv[1]
nodes, ntags, ways, rels = load('area.osm')
wn, _, ww, wr = load('rel_water_full.osm')
nodes.update(wn); ways.update(ww); rels.update(wr)

# ---------------- cadrul de joc ----------------
HERO = '16947629'
hp = ways[HERO]['pts']
TH = math.atan2(hp[3][0] - hp[1][0], hp[3][1] - hp[1][1])       # azimutul strazii
C, S = math.cos(TH), math.sin(TH)
def rot(p):  return (p[0] * C - p[1] * S, -(p[0] * S + p[1] * C))

# centrul culoarului dintre fatadele reale (axul OSM e decalat fata de cladiri)
fronts = {-1: [], 1: []}
for w in ways.values():
    if 'building' not in w['tags']: continue
    g = [rot(p) for p in w['pts']]
    zs = [q[1] for q in g]
    if max(zs) < -170 or min(zs) > 112: continue
    for side in (-1, 1):
        side_pts = [abs(q[0]) for q in g if (q[0] < 0) == (side < 0)]
        if side_pts and min(side_pts) < 9: fronts[side].append(min(side_pts))
medL = float(np.median(fronts[-1])); medR = float(np.median(fronts[1]))
SHIFT = (medL - medR) / 2.0                     # >0 muta totul spre dreapta
def G(p):
    r = rot(p); return (r[0] + SHIFT, r[1])
def G_inv(gx, gz):
    rx, rz = gx - SHIFT, gz
    return (rx * C - rz * S, -rx * S - rz * C)

hero_g = [G(p) for p in hp]
Z_SW, Z_NE = hero_g[0][1], hero_g[-1][1]
print(f"azimut {math.degrees(TH):.2f} deg | fatade med. stanga {medL:.2f} dreapta {medR:.2f} -> decalaj ax {SHIFT:+.2f} m")
print(f"strada: z {Z_SW:.1f} (SV) -> {Z_NE:.1f} (NE), x ~ {np.mean([q[0] for q in hero_g]):+.2f}")

BX0, BX1, BZ0, BZ1 = -170.0, 170.0, -320.0, 160.0      # zona in care se poate merge
DX0, DX1, DZ0, DZ1 = -330.0, 330.0, -340.0, 185.0      # grila detaliata (vizibila)
STEP = 3.0

# ---------------- relief Copernicus ----------------
ds = rasterio.open('cop.tif'); band = ds.read(1).astype(np.float64)
def cop_ll(lat, lon):
    c, r = ~ds.transform * (lon, lat); c -= 0.5; r -= 0.5
    c0, r0 = int(math.floor(c)), int(math.floor(r)); fc, fr = c - c0, r - r0
    v = band[r0:r0 + 2, c0:c0 + 2]
    return v[0,0]*(1-fc)*(1-fr) + v[0,1]*fc*(1-fr) + v[1,0]*(1-fc)*fr + v[1,1]*fc*fr
def cop_g(gx, gz):
    x, y = G_inv(gx, gz); return cop_ll(LAT0 + y / KY, LON0 + x / KX)

def gauss(a, sigma_cells):
    r = int(math.ceil(sigma_cells * 3)); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma_cells) ** 2); k /= k.sum()
    p = np.pad(a, r, mode='edge')
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 1, p)
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 0, p)
    return p

M = 0.0
gx = np.arange(DX0, DX1 + 0.01, STEP); gz = np.arange(DZ0, DZ1 + 0.01, STEP)
H = np.array([[cop_g(x, z) for x in gx] for z in gz])
H = gauss(H, 3.0)                                     # sigma 9 m: scoate fatetele de 25-30 m
print(f"relief: grila {len(gx)}x{len(gz)} la {STEP} m, {H.min():.1f}..{H.max():.1f} m")

# ---------------- utilitare geometrice ----------------
def clip_poly(poly, x0, x1, z0, z1):
    def clip(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            ia, ib = inside(a), inside(b)
            if ib:
                if not ia: out.append(inter(a, b))
                out.append(b)
            elif ia: out.append(inter(a, b))
        return out
    def ix(xc):  return lambda a, b: (xc, a[1] + (b[1] - a[1]) * (xc - a[0]) / (b[0] - a[0]))
    def iz(zc):  return lambda a, b: (a[0] + (b[0] - a[0]) * (zc - a[1]) / (b[1] - a[1]), zc)
    p = list(poly)
    for ins, it in ((lambda q: q[0] >= x0, ix(x0)), (lambda q: q[0] <= x1, ix(x1)),
                    (lambda q: q[1] >= z0, iz(z0)), (lambda q: q[1] <= z1, iz(z1))):
        if not p: break
        p = clip(p, ins, it)
    return p

def clip_line(pts, x0, x1, z0, z1):
    """Imparte o polilinie in bucatile din interiorul dreptunghiului."""
    inside = lambda q: x0 <= q[0] <= x1 and z0 <= q[1] <= z1
    runs, cur = [], []
    for i, q in enumerate(pts):
        if inside(q): cur.append(q)
        else:
            if cur: runs.append(cur); cur = []
    if cur: runs.append(cur)
    return [r for r in runs if len(r) >= 2]

def pip(pt, poly):
    x, z = pt; inside = False
    for i in range(len(poly)):
        (x1, z1), (x2, z2) = poly[i - 1], poly[i]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1: inside = not inside
    return inside

def seg_dist(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]; L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))

def poly_dist(p, poly):
    return min(seg_dist(p, poly[i - 1], poly[i]) for i in range(len(poly)))

def line_dist(p, pts):
    return min(seg_dist(p, pts[i], pts[i + 1]) for i in range(len(pts) - 1))

def r2(v): return round(v, 2)

# ---------------- apa: albia Prahovei ----------------
outer = [ways[ref]['refs'] for (ty, ref, role) in rels['1308475']['members'] if ty == 'way' and ref in ways]
rings = [[G(nodes[n]) for n in ring if n in nodes] for ring in assemble_rings(outer)]
rings = [r for r in rings if len(r) > 3]
water_polys = []
for r in rings:
    cp = clip_poly(r, DX0, DX1, DZ0, DZ1)
    if len(cp) > 3: water_polys.append(cp)
print(f"albie: {len(rings)} inele, {len(water_polys)} poligoane in zona, puncte {[len(p) for p in water_polys]}")

rivers = []
for wid, w in ways.items():
    t = w['tags']
    if t.get('waterway') in ('river', 'stream'):
        for run in clip_line([G(p) for p in w['pts']], DX0, DX1, DZ0, DZ1):
            rivers.append({'name': t.get('name', ''), 'kind': t['waterway'], 'pts': run})
prahova = max((r for r in rivers if r['name'] == 'Prahova'), key=lambda r: len(r['pts']))

# nivelul apei: DSM-ul vede luciul apei. Potrivim 1D pe TOT tronsonul OSM al
# raului (~2 km), pe anvelopa inferioara (vegetatia de mal ridica DSM-ul).
full = [G(p) for p in ways['17505025']['pts']]
arc = [0.0]
for i in range(1, len(full)): arc.append(arc[-1] + math.hypot(full[i][0]-full[i-1][0], full[i][1]-full[i-1][1]))
S_, Y_ = [], []
for i in range(len(full) - 1):
    a, b = full[i], full[i + 1]; L = arc[i + 1] - arc[i]
    for k in range(int(L // 5) + 1):
        t = k * 5 / max(L, 1e-6)
        q = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        S_.append(arc[i] + t * L); Y_.append(cop_g(*q))
S_ = np.array(S_); Y_ = np.array(Y_)
lo = []
for c0 in np.arange(0, S_.max(), 60):                 # minimul pe ferestre de 60 m
    m = (S_ >= c0) & (S_ < c0 + 60)
    if m.sum() > 3: lo.append((S_[m][np.argmin(Y_[m])], Y_[m].min()))
lo = np.array(lo)
k1, k0 = np.polyfit(lo[:, 0], lo[:, 1], 1)
print(f"rau: {arc[-1]:.0f} m de curs analizati, {len(lo)} ferestre; panta {abs(k1)*1000:.2f} m/km")
def wl_arc(sv): return k0 + k1 * sv
def nearest_arc(x, z):
    best, bs = 1e9, 0.0
    for i in range(len(full) - 1):
        a, b = full[i], full[i + 1]; dx, dz = b[0]-a[0], b[1]-a[1]; LL = dx*dx + dz*dz
        u = 0 if LL == 0 else max(0, min(1, ((x-a[0])*dx + (z-a[1])*dz) / LL))
        d = math.hypot(x - (a[0]+u*dx), z - (a[1]+u*dz))
        if d < best: best, bs = d, arc[i] + u * math.sqrt(LL)
    return bs
# planul exportat pentru client: potrivit pe nivelul 1D in zona de joc
P_ = []
for x in np.arange(DX0, DX1 + 1, 20):
    for z in np.arange(DZ0, DZ1 + 1, 20):
        P_.append((x, z, wl_arc(nearest_arc(x, z))))
P_ = np.array(P_)
coef = np.linalg.lstsq(np.c_[np.ones(len(P_)), P_[:, 0], P_[:, 1]], P_[:, 2], rcond=None)[0]
wl = lambda x, z: coef[0] + coef[1] * x + coef[2] * z
print(f"nivelul apei (1D): {wl_arc(nearest_arc(0, -225)):.2f} m la axul strazii prelungit")

# ---------------- sapam albia in relief ----------------
GX, GZ = np.meshgrid(gx, gz)
inside_w = np.zeros(H.shape, bool); dist_w = np.full(H.shape, 99.0)
for poly in water_polys:
    xs = [q[0] for q in poly]; zs = [q[1] for q in poly]
    for j in range(len(gz)):
        for i in range(len(gx)):
            p = (gx[i], gz[j])
            if not (min(xs) - 14 < p[0] < max(xs) + 14 and min(zs) - 14 < p[1] < max(zs) + 14): continue
            if pip(p, poly): inside_w[j, i] = True
            d = poly_dist(p, poly)
            if d < dist_w[j, i]: dist_w[j, i] = d
chan_d = np.array([[line_dist((gx[i], gz[j]), prahova['pts']) for i in range(len(gx))] for j in range(len(gz))])
CH_HW = 12.0                                           # semi-latimea firului de apa
WL = np.array([[wl_arc(nearest_arc(gx[i], gz[j])) for i in range(len(gx))] for j in range(len(gz))])
bed = WL + 0.55                                        # prundisul albiei, putin peste apa
# profil CONTINUU: fund -0,9 m in ax, luciul apei la CH_HW, prundisul la CH_HW + 7
u = np.clip(chan_d / CH_HW, 0, 1)
chan = WL - 0.9 + 0.9 * u * u
rise = np.clip((chan_d - CH_HW) / 7.0, 0, 1); rise = rise * rise * (3 - 2 * rise)
Hin = np.where(chan_d < CH_HW, chan, WL + 0.55 * rise)
Hc = H.copy()
Hc = np.where(inside_w, np.minimum(Hc, Hin), Hc)
# malul: panta abrupta pe 9 m in afara poligonului
t = np.clip(dist_w / 9.0, 0, 1); t = t * t * (3 - 2 * t)
bank = bed + 0.35 + (H - bed - 0.35) * t
Hc = np.where(~inside_w & (dist_w < 9.0), np.minimum(H, np.maximum(bank, bed + 0.2)), Hc)
# netezire usoara in jurul albiei: fara trepte de grila la mal si la luciul apei
near_w = dist_w < 14
Hs = gauss(Hc, 0.9)
Hc = np.where(near_w | inside_w, Hs, Hc)

# ---------------- drumuri ----------------
ROADCLS = {'residential': 3.0, 'living_street': 2.2, 'unclassified': 2.6, 'service': 1.8, 'track': 1.6,
           'secondary': 3.4, 'tertiary': 3.2, 'trunk': 3.6, 'path': 0.7, 'footway': 0.8}
roads = []
for wid, w in ways.items():
    t = w['tags']; hw = t.get('highway')
    if hw not in ROADCLS or wid == HERO: continue
    for run in clip_line([G(p) for p in w['pts']], DX0 + 3, DX1 - 3, DZ0 + 3, DZ1 - 3):
        roads.append({'id': wid, 'name': t.get('name', ''), 'kind': hw, 'hw': ROADCLS[hw],
                      'surface': t.get('surface') or ('gravel' if hw in ('track', 'path') else 'asphalt'),
                      'bridge': t.get('bridge') == 'yes', 'pts': run})
hero = {'id': HERO, 'name': ways[HERO]['tags'].get('name'), 'kind': 'hero', 'hw': 3.0, 'surface': 'asphalt',
        'bridge': False, 'pts': [(0.0, Z_SW + 6.0), (0.0, Z_NE)]}

def interp(v, s):                                      # bilinear pe grila curenta
    fi = (v[0] - gx[0]) / STEP; fj = (v[1] - gz[0]) / STEP
    i0 = int(max(0, min(len(gx) - 2, math.floor(fi)))); j0 = int(max(0, min(len(gz) - 2, math.floor(fj))))
    fx, fz = fi - i0, fj - j0
    return (s[j0, i0] * (1-fx) * (1-fz) + s[j0, i0+1] * fx * (1-fz) + s[j0+1, i0] * (1-fx) * fz + s[j0+1, i0+1] * fx * fz)

def flatten(Hs, road, window=30.0, blend=6.0):
    pts = road['pts']
    ch = [0.0]
    for i in range(1, len(pts)): ch.append(ch[-1] + math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]))
    Ltot = ch[-1]
    n = max(2, int(Ltot // 2) + 1)
    prof_s = np.linspace(0, Ltot, n)
    def at(sv):
        k = max(0, min(len(ch) - 2, np.searchsorted(ch, sv) - 1))
        seg = max(ch[k + 1] - ch[k], 1e-6); u = (sv - ch[k]) / seg
        return (pts[k][0] + (pts[k+1][0] - pts[k][0]) * u, pts[k][1] + (pts[k+1][1] - pts[k][1]) * u)
    raw = np.array([interp(at(sv), Hs) for sv in prof_s])
    ks = max(1, int(window / 2 / 2))
    kern = np.ones(2 * ks + 1) / (2 * ks + 1)
    prof = np.convolve(np.pad(raw, ks, mode='edge'), kern, mode='valid')
    road['profile'] = [r2(v) for v in prof]
    road['profile_step'] = float(Ltot / (n - 1))
    hw = road['hw']
    xs = [q[0] for q in pts]; zs = [q[1] for q in pts]
    for j in range(len(gz)):
        if not (min(zs) - hw - blend - 3 < gz[j] < max(zs) + hw + blend + 3): continue
        for i in range(len(gx)):
            if not (min(xs) - hw - blend - 3 < gx[i] < max(xs) + hw + blend + 3): continue
            p = (gx[i], gz[j]); best = 1e9; bs = 0
            for k in range(len(pts) - 1):
                a, b = pts[k], pts[k + 1]
                dx, dz = b[0] - a[0], b[1] - a[1]; LL = dx * dx + dz * dz
                u = 0 if LL == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / LL))
                d = math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dz))
                if d < best: best = d; bs = ch[k] + u * math.sqrt(LL)
            if best > hw + blend: continue
            ry = np.interp(bs, prof_s, prof)
            w = 1.0 if best <= hw + 0.6 else 1 - (best - hw - 0.6) / (blend - 0.6)
            w = w * w * (3 - 2 * w)
            Hs[j, i] = Hs[j, i] * (1 - w) + ry * w

for rd in sorted(roads, key=lambda r: r['hw']):
    if rd['kind'] not in ('path', 'footway') and not rd['bridge']:
        flatten(Hc, rd, window=24.0, blend=4.0)
flatten(Hc, hero, window=36.0, blend=7.0)              # strada-erou ultima: are prioritate

BASE = 400.0
print(f"profil strada-erou: {hero['profile'][0]:.2f} (SV) -> {hero['profile'][-1]:.2f} (NE)")

# ---------------- cladiri ----------------
def obb(poly):
    best = None
    for i in range(len(poly)):
        a, b = poly[i - 1], poly[i]
        ang = math.atan2(b[1] - a[1], b[0] - a[0]); ca, sa = math.cos(-ang), math.sin(-ang)
        r = [(q[0] * ca - q[1] * sa, q[0] * sa + q[1] * ca) for q in poly]
        x0, x1 = min(q[0] for q in r), max(q[0] for q in r); z0, z1 = min(q[1] for q in r), max(q[1] for q in r)
        area = (x1 - x0) * (z1 - z0)
        if best is None or area < best[0]:
            cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
            c2, s2 = math.cos(ang), math.sin(ang)
            best = (area, (cx * c2 - cz * s2, cx * s2 + cz * c2), x1 - x0, z1 - z0, ang)
    return best

def poly_area(p):
    return abs(sum(p[i - 1][0] * p[i][1] - p[i][0] * p[i - 1][1] for i in range(len(p)))) / 2

buildings = []
nudged = []
for wid, w in ways.items():
    t = w['tags']
    if 'building' not in t or len(w['pts']) < 4: continue
    g = [G(p) for p in w['pts']]
    if g[0] == g[-1]: g = g[:-1]
    cx = sum(q[0] for q in g) / len(g); cz = sum(q[1] for q in g) / len(g)
    if not (DX0 + 10 < cx < DX1 - 10 and DZ0 + 10 < cz < DZ1 - 10): continue
    # impingem putin in afara casele care intra pe carosabil (sub precizia OSM)
    if Z_NE - 2 < cz < Z_SW + 2:
        near = min(abs(q[0]) for q in g)
        if near < 3.45:
            dx = (3.45 - near) * (1 if cx > 0 else -1)
            g = [(q[0] + dx, q[1]) for q in g]; nudged.append((t.get('addr:housenumber', wid), round(abs(dx), 2)))
    area, (ocx, ocz), ow, od, oang = obb(g)
    rect = poly_area(g) / max(area, 1e-6)
    ground = min(interp(q, Hc) for q in g)
    lv = t.get('building:levels')
    try: lv = int(float(lv))
    except (TypeError, ValueError): lv = None
    buildings.append({'pts': [(r2(q[0]), r2(q[1])) for q in g], 'kind': t.get('building'),
                      'levels': lv, 'nr': t.get('addr:housenumber'), 'street': t.get('addr:street'),
                      'obb': [r2(ocx), r2(ocz), r2(ow), r2(od), round(oang, 4)], 'rect': round(rect, 3),
                      'ground': r2(ground - BASE)})
print(f"cladiri: {len(buildings)} in zona; impinse de pe carosabil: {nudged}")

# ---------------- restul straturilor ----------------
rail = []
for wid, w in ways.items():
    t = w['tags']
    if t.get('railway') in ('rail', 'platform', 'disused'):
        for run in clip_line([G(p) for p in w['pts']], DX0, DX1, DZ0, DZ1):
            rail.append({'kind': t['railway'], 'main': t.get('usage') == 'main', 'pts': run})
landuse = []
for wid, w in ways.items():
    t = w['tags']; k = t.get('landuse') or (t.get('natural') if t.get('natural') in ('wood', 'scrub', 'grassland') else None)
    if not k or len(w['pts']) < 4: continue
    cp = clip_poly([G(p) for p in w['pts']], DX0, DX1, DZ0, DZ1)
    if len(cp) > 3: landuse.append({'kind': k, 'pts': cp})
trees = [G(nodes[n]) for n, t in ntags.items() if t.get('natural') == 'tree' and n in nodes]
towers = [G(nodes[n]) for n, t in ntags.items() if t.get('power') == 'tower' and n in nodes]
towers = [q for q in towers if BX0 - 150 < q[0] < BX1 + 150 and BZ0 - 150 < q[1] < BZ1 + 150]

# ---------------- fundal: relief larg, fara detalii ----------------
BGS = 24.0
bgx = np.arange(-900, 900.1, BGS); bgz = np.arange(-1100, 800.1, BGS)
BG = np.array([[cop_g(x, z) for x in bgx] for z in bgz]); BG = gauss(BG, 1.2)

def pack(a):
    return [int(round((v - BASE) * 100)) for v in a.ravel()]

zona = {
    'meta': {
        'lat0': LAT0, 'lon0': LON0, 'azimuthDeg': round(math.degrees(TH), 3), 'axisShift': round(SHIFT, 3),
        'base': BASE, 'street': 'Strada Gării (segmentul nr. 103-128), Câmpina, jud. Prahova',
        'attribution': [
            '© contribuitorii OpenStreetMap (ODbL) — openstreetmap.org/copyright',
            'Copernicus GLO-30 DEM © DLR e.V. 2010-2014 și © Airbus Defence and Space GmbH 2014-2018, '
            'furnizat prin programul COPERNICUS al Uniunii Europene și ESA',
        ],
    },
    'bounds': [BX0, BX1, BZ0, BZ1],
    'detail': [DX0, DX1, DZ0, DZ1],
    'dem': {'x0': float(gx[0]), 'z0': float(gz[0]), 'step': STEP, 'nx': len(gx), 'nz': len(gz), 'cm': pack(Hc)},
    'bg': {'x0': float(bgx[0]), 'z0': float(bgz[0]), 'step': BGS, 'nx': len(bgx), 'nz': len(bgz), 'cm': pack(BG)},
    'hero': {'z0': r2(Z_SW), 'z1': r2(Z_NE), 'hw': 3.0, 'profile': [r2(v - BASE) for v in hero['profile']],
             'pstep': round(hero['profile_step'], 4), 'ps0': r2(Z_SW + 6.0)},
    'roads': [{'name': r['name'], 'kind': r['kind'], 'hw': r['hw'], 'surface': r['surface'], 'bridge': r['bridge'],
               'pts': [(r2(q[0]), r2(q[1])) for q in r['pts']]} for r in roads],
    'water': [[(r2(q[0]), r2(q[1])) for q in p] for p in water_polys],
    'rivers': [{'name': r['name'], 'kind': r['kind'], 'pts': [(r2(q[0]), r2(q[1])) for q in r['pts']],
                'wl': [round(wl_arc(nearest_arc(q[0], q[1])) - BASE, 3) for q in r['pts']] if r['name'] == 'Prahova' else None}
               for r in rivers],
    'waterLevel': [round(coef[0] - BASE, 3), round(coef[1], 6), round(coef[2], 6)],
    'channelHW': CH_HW,
    'buildings': buildings,
    'rail': [{'kind': r['kind'], 'main': r['main'], 'pts': [(r2(q[0]), r2(q[1])) for q in r['pts']]} for r in rail],
    'landuse': [{'kind': l['kind'], 'pts': [(r2(q[0]), r2(q[1])) for q in l['pts']]} for l in landuse],
    'trees': [(r2(q[0]), r2(q[1])) for q in trees],
    'towers': [(r2(q[0]), r2(q[1])) for q in towers],
}
js = ('/* Generat de tools/build_zona.py din date reale - nu edita manual.\n'
      ' * ' + '\n * '.join(zona['meta']['attribution']) + '\n */\n'
      'export const ZONA = ' + json.dumps(zona, separators=(',', ':'), ensure_ascii=False) + ';\n')
open(OUT, 'w').write(js)
np.save('H_final.npy', Hc)
json.dump({'gx0': float(gx[0]), 'gz0': float(gz[0]), 'step': STEP}, open('H_final_meta.json', 'w'))
print(f"scris {OUT}: {len(js)/1024:.0f} KB | drumuri {len(roads)}, apa {len(water_polys)}, rauri {len(rivers)}, "
      f"cai ferate {len(rail)}, landuse {len(landuse)}, copaci {len(trees)}, piloni {len(towers)}")
