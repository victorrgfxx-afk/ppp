"""
Extrage texturi reale (rectificate) din pozele de referinta -> assets/textures.
Rulare:  python3 tools/extract_textures.py   (din folderul game/)
Necesita: pip install pillow numpy opencv-python-headless
Coordonatele sunt in pixeli pe pozele originale 1932x2576 din reference/.
"""
import cv2, numpy as np, os

REF = os.path.join(os.path.dirname(__file__), '..', 'reference')
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'textures')
os.makedirs(OUT, exist_ok=True)

def load(i):
    return cv2.imread(os.path.join(REF, f'p{i}.jpg'))

def quad(img, tl, tr, br, bl, w, h):
    src = np.float32([tl, tr, br, bl])
    dst = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img, M, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)

def seamless(img, axis='xy', feather=0.5):
    """Tile fara cusaturi: amesteca imaginea cu versiunea ei rotita cu jumatate."""
    h, w = img.shape[:2]
    f = img.astype(np.float32)
    rolled = f.copy()
    if 'x' in axis: rolled = np.roll(rolled, w // 2, axis=1)
    if 'y' in axis: rolled = np.roll(rolled, h // 2, axis=0)
    def ramp(n):
        t = np.abs(np.linspace(-1, 1, n))  # 0 la centru, 1 la margini
        return np.clip((t - (1 - feather)) / feather, 0, 1)
    wx = ramp(w) if 'x' in axis else np.zeros(w)
    wy = ramp(h) if 'y' in axis else np.zeros(h)
    m = np.maximum(wx[None, :], wy[:, None])
    m = m * m * (3 - 2 * m)
    out = f * (1 - m[..., None]) + rolled * m[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)

def save(name, img, q=88):
    cv2.imwrite(os.path.join(OUT, name), img, [cv2.IMWRITE_JPEG_QUALITY, q])
    print(name, img.shape[1], 'x', img.shape[0])

def ground_rectify(img, X0, X1, Z0, Z1, W, H, f=1935.0, cx=966.0, vy=1023.0, cam_h=1.5):
    """Proiecteaza planul solului (camera orizontala) intr-o vedere de sus."""
    xs = np.linspace(X0, X1, W, dtype=np.float32)
    zs = np.linspace(Z1, Z0, H, dtype=np.float32)
    X, Z = np.meshgrid(xs, zs)
    mapx = cx + f * X / Z
    mapy = vy + f * cam_h / Z
    return cv2.remap(img, mapx.astype(np.float32), mapy.astype(np.float32), cv2.INTER_LANCZOS4)

def _unused_remove_fence(img, y_from):
    """Sterge (inpaint) varfurile/barele gardului din partea de jos a unei fatade."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    Hh, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    black = (V < 45)
    gold = (Hh > 12) & (Hh < 30) & (S > 60) & (S < 170) & (V > 120)
    mask = (black | gold).astype(np.uint8) * 255
    mask[:y_from] = 0
    # doar structuri verticale (bare) + varfuri
    vert = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 18)))
    tips = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    m = cv2.dilate(cv2.bitwise_or(vert, tips), np.ones((7, 7), np.uint8))
    return cv2.inpaint(img, m, 9, cv2.INPAINT_TELEA)

p1, p2, p3, p4, p5, p6, p7, p8 = (load(i) for i in range(1, 9))

# --- Fatada casei (poza 4, aproape frontala) ---
# Portiunea deschisa a prispei (perete cu fereastra alba, palaria rosie, ghivece).
# Taiem deasupra varfurilor de gard (modelate 3D) si completam peretele de jos.
porch = p4[900:1270, 0:830]
brick = p4[1099:1270, 0:130]                       # placaj caramida (stanga)
stucco = p4[1120:1220, 660:740]                    # tencuiala gri curata
low_h = 171                                        # ~0.68 m la ~251 px/m
low = np.zeros((low_h, 830, 3), np.uint8)
st = np.vstack([stucco, cv2.flip(stucco, 0)] * 2)
st = np.hstack([st, cv2.flip(st, 1)] * 6)
low[:, :] = st[:low_h, :830]
low[:, :130] = brick[-low_h:]
porch_full = np.vstack([porch, low])
save('facade_porch.jpg', cv2.resize(porch_full, (1280, 834), interpolation=cv2.INTER_LANCZOS4))

# Veranda inchisa (ferestre lemn cu jaluzele, usa). Prelungim ferestrele in jos.
ver = p4[948:1233, 830:1932].copy()
# the fence-post lantern in front of the right window pier: clone the clean rows above it
ver[230:285, 700:792] = ver[230 - 56:285 - 56, 700:792]
ext = ver[-66:]
ver_full = np.vstack([ver, ext])
save('facade_veranda.jpg', cv2.resize(ver_full, (1600, 510), interpolation=cv2.INTER_LANCZOS4))

# Peretele de sub acoperisul mare (bej, cu golurile de aerisire) - pe toata lungimea casei
knee = quad(p4, (0, 405), (1932, 540), (1932, 695), (0, 605), 2048, 232)
vent = knee[:, 927:1214]
plain = knee[:, 1300:1700]
tail = np.hstack([plain, plain[:, ::-1]])
knee_full = np.hstack([knee[:, :1971], vent, tail[:, :2442 - 1971 - vent.shape[1]]])
save('knee_wall.jpg', knee_full)

# Acoperis tabla (acoperisul copertinei)
roof = quad(p4, (0, 612), (1932, 700), (1932, 772), (0, 728), 2048, 300)
save('roof_panels.jpg', seamless(roof, 'x', 0.25))

# Gard: ecranul de iedera artificiala cu barele reale. Taiat exact intre doua bare
# (20 de intervale) ca sa se repete perfect; barele 3D se aliniaza pe acelasi pas.
ivy = quad(p4, (300, 1480), (1540, 1440), (1540, 1640), (300, 1730), 1536, 330)
save('ivy.jpg', cv2.resize(ivy[:, 92:1405], (1280, 330), interpolation=cv2.INTER_LANCZOS4))

# Placaj piatra (soclul verandei)
save('stone_cladding.jpg', seamless(cv2.resize(p4[1392:1628, 1602:1900], (768, 608), interpolation=cv2.INTER_LANCZOS4), 'xy', 0.3))
# Platforma de beton din fata portii
apron = cv2.resize(p4[1970:2130, 420:1750], (1024, 512), interpolation=cv2.INTER_LANCZOS4)
save('concrete.jpg', seamless(apron, 'xy', 0.35))
# Cornier ruginit (vopsit alb) de la bordura
save('rust_strip.jpg', quad(p4, (290, 2378), (1785, 2120), (1790, 2182), (292, 2490), 2048, 110))

# --- Asfaltul (poza 1, rectificat de sus) ---
asph = ground_rectify(p1, -0.35, 0.95, 1.9, 3.2, 1024, 1024)
save('asphalt.jpg', seamless(asph, 'xy', 0.35), 90)

# --- Zid de piatra sub gardul verde (poza 2) ---
wall = quad(p2, (252, 1356), (648, 1404), (648, 1488), (252, 1426), 1024, 250)
save('stone_wall.jpg', seamless(wall, 'x', 0.3))

# --- Zidul gri de vizavi (poza 8): tencuiala decorativa grunjoasa ---
plaster = cv2.resize(p8[1300:1430, 1450:1665], (512, 310), interpolation=cv2.INTER_LANCZOS4)
save('wall_plaster.jpg', seamless(plaster, 'xy', 0.4))
