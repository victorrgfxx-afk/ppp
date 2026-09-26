"""Top-down debug render of assets/geo (for checking alignment)."""
import json, sys, numpy as np, cv2, os
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'geo')
g = json.load(open(os.path.join(OUT, 'geo.json')))
n, ext = g['meta']['grid']['n'], g['meta']['grid']['ext']
Y = np.fromfile(os.path.join(OUT, 'height.bin'), '<i2').reshape(n, n) / 100
cx, cz, R, S = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])   # centre, half-size (m), px/m
W = int(2 * R * S)
def px(p): return np.round(((np.asarray(p).reshape(-1, 2) - [cx - R, cz - R]) * S) * 8).astype(np.int32)
xs = np.linspace(cx - R, cx + R, W); X, Z = np.meshgrid(xs, np.linspace(cz - R, cz + R, W))
Yi = cv2.remap(Y.astype(np.float32), ((X + ext) / 5).astype(np.float32), ((Z + ext) / 5).astype(np.float32), cv2.INTER_LINEAR)
gx, gz = np.gradient(Yi, 1 / S)
shade = np.clip(0.75 + (-gx * 0.6 + gz * 0.4) * 1.5, 0.3, 1.2)
ortho = cv2.imread(os.path.join(OUT, 'ortho.jpg'))
O = cv2.remap(ortho, ((X + ext) / (2 * ext) * 1023).astype(np.float32), ((Z + ext) / (2 * ext) * 1023).astype(np.float32), cv2.INTER_LINEAR)
img = np.clip(O * shade[..., None] * 0.7 + 60, 0, 255).astype(np.uint8)
for i, j, l in g['water']:
    x0, z0 = -ext + i * 5, -ext + j * 5
    cv2.fillPoly(img, [px([[x0, z0], [x0 + 5, z0], [x0 + 5, z0 + 5], [x0, z0 + 5]])], (200, 120, 40), cv2.LINE_8, 3)
for r in g['roads']:
    col = (90, 90, 90) if r['s'] == 'asphalt' else (120, 170, 200)
    cv2.polylines(img, [px(r['p'])], False, col, max(1, int(r['w'] * S)), cv2.LINE_AA, 3)
for r in g['rails']:
    cv2.polylines(img, [px(r['p'])], False, (60, 40, 120), max(1, int(2 * S)), cv2.LINE_AA, 3)
for b in g['buildings']:
    col = (80, 80, 255) if b.get('hero') else (60, 200, 255) if b.get('o') else (200, 200, 230)
    cv2.fillPoly(img, [px(b['p'])], col, cv2.LINE_AA, 3)
    cv2.polylines(img, [px(b['p'])], True, (40, 40, 40), 1, cv2.LINE_AA, 3)
    if 'no' in b:
        c = np.array(b['p']).reshape(-1, 2).mean(0)
        cv2.putText(img, b['no'], tuple(int(v) for v in ((c - [cx - R, cz - R]) * S)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 0), 1)
for f in g['fences']:
    cols = [(40, 20, 120), (60, 140, 60), (30, 60, 150), (180, 200, 210), (20, 20, 20), (90, 110, 130)]
    cv2.polylines(img, [px(f[1:])], False, (255, 0, 255), 3, cv2.LINE_AA, 3)
for run in [r["p"] for r in g["poles"]]:
    for q in run:
        c = tuple(int(v) for v in ((np.array(q) - [cx - R, cz - R]) * S)); cv2.circle(img, c, 2, (0, 0, 0), -1)
t = np.fromfile(os.path.join(OUT, 'trees.bin'), dtype=[('x', '<i2'), ('z', '<i2'), ('t', 'u1'), ('s', 'u1')])
cols = [(30, 110, 30), (50, 150, 60), (20, 70, 20), (60, 180, 120), (20, 90, 60), (90, 170, 150)]
for x, z, ty, s in t:
    x, z = x / 10, z / 10
    if abs(x - cx) < R and abs(z - cz) < R:
        cv2.circle(img, (int((x - cx + R) * S), int((z - cz + R) * S)), max(1, int(2.5 * s / 100 * S)), cols[ty], 1, cv2.LINE_AA)
lx0, lx1, lz0, lz1 = g['meta']['lots']
cv2.rectangle(img, px([[lx0, lz0]])[0] // 8, px([[lx1, lz1]])[0] // 8, (0, 0, 255), 1)
cv2.imwrite(sys.argv[5], img)
