# -*- coding: utf-8 -*-
"""
Poiana Campina -> Unreal Engine 5.5+ : imports the world exported by `tools/export-unreal.mjs`.

In the Unreal Editor (a level open, ideally made from the "Empty Open World" template):
    Tools > Execute Python Script...  ->  this file
or in the Output Log (Cmd):  py "C:/path/to/import_poiana.py"

Set EXPORT_DIR below to the export folder (the one with manifest.json). Every step logs "[Poiana]" lines in the
Output Log; if something fails, the step is skipped with the reason and the others go on. Steps can be switched off
in STEPS and the script re-run (it replaces what it made before).
"""
import json
import math
import os
import struct
import time
import traceback

import unreal

# ------------------------------------------------------------------ settings
EXPORT_DIR = r"C:\PoianaCampina\unreal-export"      # <- the folder with manifest.json
CONTENT = "/Game/PoianaCampina"                       # where the assets go
STEPS = {
    "textures": True,        # PNG -> Texture2D (sRGB / linear / normal maps set per use)
    "materials": True,       # master materials + one material instance per exported material
    "tiles": True,           # terrain + static world per 1 km tile (Nanite, complex collision)
    "far_terrain": True,     # the relief out to 20 km (horizon)
    "trees": True,           # tree models + HISM instances (mapped trees, forest, understory)
    "understory": False,     # the forest's shrubs and saplings (+1.4 M instances: switch on for a denser forest)
    "instances": True,       # other instanced meshes
    "cars": True,            # the parked cars
    "cameras": True,         # a CineCamera per photo + PlayerStart
    "lighting": True,        # sun at the real position, sky atmosphere, clouds, fog, Lumen post process
}
NANITE = True
TREE_TILE_M = 2000            # one actor with an HISM per tree type for every 2 x 2 km
TREE_REPLACE = {              # optional: your own tree meshes per type label, e.g. "beech": "/Game/Megascans/..."
}

# ------------------------------------------------------------------ helpers
AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
ACTORS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
LEVEL = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
FOLDER = "PoianaCampina"


def log(msg):
    unreal.log("[Poiana] " + msg)


def warn(msg):
    unreal.log_warning("[Poiana] " + msg)


def path_join(*a):
    return os.path.join(EXPORT_DIR, *a)


def asset_name(p):
    return p.split("/")[-1].split(".")[0]


def import_files(files, dest, names=None):
    """Plain AssetImportTasks (Interchange handles .gltf and .png in UE 5.5); returns the imported object paths."""
    tasks = []
    for i, f in enumerate(files):
        t = unreal.AssetImportTask()
        t.set_editor_property("filename", f)
        t.set_editor_property("destination_path", dest)
        t.set_editor_property("automated", True)
        t.set_editor_property("replace_existing", True)
        t.set_editor_property("save", False)
        if names:
            t.set_editor_property("destination_name", names[i])
        tasks.append(t)
    AT.import_asset_tasks(tasks)
    out = []
    for t in tasks:
        try:
            out += [str(p) for p in (t.get_editor_property("imported_object_paths") or [])]
        except Exception:
            pass
    return out


def assets_in(folder, cls=None):
    res = []
    for p in EAL.list_assets(folder, recursive=True, include_folder=False):
        a = EAL.load_asset(p)
        if a is not None and (cls is None or isinstance(a, cls)):
            res.append(a)
    return res


def find_mesh(folder, name):
    """The StaticMesh imported for the glTF mesh `name` (Interchange may add a prefix or a suffix)."""
    best = None
    for m in assets_in(folder, unreal.StaticMesh):
        n = m.get_name()
        if n == name or n == "SM_" + name:
            return m
        if name in n and best is None:
            best = m
    return best


class Progress:
    def __init__(self, total, text):
        self.task = unreal.ScopedSlowTask(total, text)
        self.task.make_dialog(True)

    def step(self, text, amount=1):
        if self.task.should_cancel():
            raise KeyboardInterrupt("cancelled")
        self.task.enter_progress_frame(amount, text)

    def done(self):
        del self.task


# ------------------------------------------------------------------ the importer's axis conversion, measured
class Frame:
    """game (m, +Y up, right-handed glTF) -> Unreal (cm, +Z up, left-handed), measured on calibration.gltf"""

    def __init__(self):
        self.M = [[1, 0, 0], [0, 0, 1], [0, 1, 0]]       # what UE 5's glTF import does (X, Z, Y); replaced below
        self.scale = 100.0

    def calibrate(self, manifest):
        dest = CONTENT + "/_Calibration"
        import_files([path_join(manifest.get("calibration", "calibration.gltf"))], dest)
        mesh = find_mesh(dest, "UE_Calibration")
        if mesh is None:
            warn("calibration mesh not found: using the default glTF conversion (X, Z, Y) x100")
            return
        b = mesh.get_bounds()
        o, e = b.origin, b.box_extent
        mn = [o.x - e.x, o.y - e.y, o.z - e.z]
        mx = [o.x + e.x, o.y + e.y, o.z + e.z]
        size = [mx[k] - mn[k] for k in range(3)]
        scale = sum(size) / 6.0                                   # the box is 1 x 2 x 3 m
        M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        for k in range(3):                                        # UE axis k shows game axis g (size g+1)
            g = int(round(size[k] / scale)) - 1
            if g not in (0, 1, 2):
                warn("calibration unreadable (sizes %s): default conversion kept" % size)
                return
            sign = -1 if abs(mn[k]) > abs(mx[k]) else 1
            M[k][g] = sign
        centred = all(abs(mn[k] + mx[k]) < 0.05 * scale for k in range(3))
        self.M, self.scale = M, scale
        log("importer frame: UE = %.1f x %s * game%s" % (scale, M, " (pivots re-centred by the importer: actors placed by bounds)" if centred else ""))

    def vec(self, p):                                             # a direction / offset
        return [sum(self.M[k][g] * p[g] for g in range(3)) * self.scale for k in range(3)]

    def point(self, p):
        v = self.vec(p)
        return unreal.Vector(v[0], v[1], v[2])

    def dir(self, p):
        v = [sum(self.M[k][g] * p[g] for g in range(3)) for k in range(3)]
        return v

    def rot_matrix(self, R):
        """game rotation matrix (3x3) -> UE rotation matrix M R M^T"""
        M = self.M
        MR = [[sum(M[i][k] * R[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
        return [[sum(MR[i][k] * M[j][k] for k in range(3)) for j in range(3)] for i in range(3)]


def rotator_from_dir(d):
    x, y, z = d
    yaw = math.degrees(math.atan2(y, x))
    pitch = math.degrees(math.atan2(z, math.hypot(x, y)))
    return unreal.Rotator(roll=0.0, pitch=pitch, yaw=yaw)


def quat_from_matrix(R):
    tr = R[0][0] + R[1][1] + R[2][2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        w, x, y, z = 0.25 * s, (R[2][1] - R[1][2]) / s, (R[0][2] - R[2][0]) / s, (R[1][0] - R[0][1]) / s
    elif R[0][0] > R[1][1] and R[0][0] > R[2][2]:
        s = math.sqrt(1.0 + R[0][0] - R[1][1] - R[2][2]) * 2
        w, x, y, z = (R[2][1] - R[1][2]) / s, 0.25 * s, (R[0][1] + R[1][0]) / s, (R[0][2] + R[2][0]) / s
    elif R[1][1] > R[2][2]:
        s = math.sqrt(1.0 + R[1][1] - R[0][0] - R[2][2]) * 2
        w, x, y, z = (R[0][2] - R[2][0]) / s, (R[0][1] + R[1][0]) / s, 0.25 * s, (R[1][2] + R[2][1]) / s
    else:
        s = math.sqrt(1.0 + R[2][2] - R[0][0] - R[1][1]) * 2
        w, x, y, z = (R[1][0] - R[0][1]) / s, (R[0][2] + R[2][0]) / s, (R[1][2] + R[2][1]) / s, 0.25 * s
    return x, y, z, w


def matrix_from_quat(x, y, z, w):
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def ue_rotator(R_ue):
    """rotation matrix (UE frame, column vectors = rotated axes) -> Rotator; UE rotations use the left-handed frame
    of the engine, so the rotator is taken from where the matrix sends the X and Y axes"""
    fx = [R_ue[0][0], R_ue[1][0], R_ue[2][0]]
    fy = [R_ue[0][1], R_ue[1][1], R_ue[2][1]]
    fz = [R_ue[0][2], R_ue[1][2], R_ue[2][2]]
    m = unreal.Matrix(unreal.Plane(fx[0], fx[1], fx[2], 0.0), unreal.Plane(fy[0], fy[1], fy[2], 0.0), unreal.Plane(fz[0], fz[1], fz[2], 0.0), unreal.Plane(0.0, 0.0, 0.0, 1.0))
    return unreal.MathLibrary.matrix_get_rotator(m)


# ------------------------------------------------------------------ textures
def import_textures(mats):
    uses = {}                                                     # file -> set(kind)
    for m in mats["materials"]:
        for key, ref in (m.get("maps") or {}).items():
            if not ref:
                continue
            kind = "normal" if key in ("normal", "grassN") else ("color" if ref.get("srgb") else "linear")
            uses.setdefault(ref["file"], {}).setdefault(kind, tuple(ref.get("wrap", ("wrap", "wrap"))))
    files = sorted(uses.keys()) + ["textures/_Default_White.png", "textures/_Default_WhiteLinear.png", "textures/_Default_Normal.png"]
    uses["textures/_Default_White.png"] = {"color": ("wrap", "wrap")}
    uses["textures/_Default_WhiteLinear.png"] = {"linear": ("wrap", "wrap")}
    uses["textures/_Default_Normal.png"] = {"normal": ("wrap", "wrap")}
    dest = CONTENT + "/Textures"
    prog = Progress(len(files), "Poiana: texturi")
    textures = {}
    try:
        batch = 24
        for i in range(0, len(files), batch):
            part = files[i:i + batch]
            prog.step("texturi %d/%d" % (i, len(files)), len(part))
            names = [os.path.splitext(os.path.basename(f))[0] for f in part]
            import_files([path_join(f) for f in part], dest, names)
            for f, n in zip(part, names):
                tex = EAL.load_asset(dest + "/" + n)
                if tex is None:
                    warn("texture not imported: " + f)
                    continue
                kinds = uses[f]
                if "normal" in kinds:
                    tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
                    tex.set_editor_property("srgb", False)
                    tex.set_editor_property("flip_green_channel", True)     # three.js normal maps are OpenGL (+Y)
                elif "linear" in kinds and "color" not in kinds:
                    tex.set_editor_property("srgb", False)
                wrap = list(kinds.values())[0]
                ta = lambda w: unreal.TextureAddress.TA_CLAMP if w == "clamp" else unreal.TextureAddress.TA_WRAP
                tex.set_editor_property("address_x", ta(wrap[0]))
                tex.set_editor_property("address_y", ta(wrap[1]))
                textures[f] = tex
        # a file used both as colour (sRGB) and as data (linear): a second, linear copy for the data use
        both = [f for f in files if "linear" in uses[f] and "color" in uses[f]]
        if both:
            names = [os.path.splitext(os.path.basename(f))[0] + "_Lin" for f in both]
            import_files([path_join(f) for f in both], dest, names)
            for f, n in zip(both, names):
                tex = EAL.load_asset(dest + "/" + n)
                if tex is not None:
                    tex.set_editor_property("srgb", False)
                    textures[f + "|lin"] = tex
    finally:
        prog.done()
    log("textures: %d" % len(textures))
    return textures


# ------------------------------------------------------------------ master materials (built node by node)
def new_material(name, folder):
    path = folder + "/" + name
    if EAL.does_asset_exist(path):
        EAL.delete_asset(path)
    return AT.create_asset(name, folder, unreal.Material, unreal.MaterialFactoryNew())


def node(mat, cls, x, y, **props):
    e = MEL.create_material_expression(mat, cls, x, y)
    for k, v in props.items():
        e.set_editor_property(k, v)
    return e


def link(a, a_out, b, b_in):
    if not MEL.connect_material_expressions(a, a_out, b, b_in):
        warn("could not connect %s.%s -> %s.%s" % (a.get_name(), a_out, b.get_name(), b_in))


PARAMS = {}                                                    # master material name -> its parameter names


def _param(mat, name):
    PARAMS.setdefault(mat.get_name(), set()).add(name)


def scalar(mat, name, default, x, y):
    _param(mat, name)
    return node(mat, unreal.MaterialExpressionScalarParameter, x, y, parameter_name=name, default_value=default)


def vector(mat, name, default, x, y):
    _param(mat, name)
    return node(mat, unreal.MaterialExpressionVectorParameter, x, y, parameter_name=name, default_value=unreal.LinearColor(*default))


def tex_param(mat, name, tex, sampler, x, y, uv=None):
    _param(mat, name)
    e = node(mat, unreal.MaterialExpressionTextureSampleParameter2D, x, y, parameter_name=name, texture=tex, sampler_type=sampler)
    if uv is not None:
        link(uv, "", e, "UVs")
    return e


def binop(mat, cls, a, a_out, b, b_out, x, y):
    e = node(mat, cls, x, y)
    link(a, a_out, e, "A")
    link(b, b_out, e, "B")
    return e


def lerp(mat, a, a_out, b, b_out, alpha, alpha_out, x, y):
    e = node(mat, unreal.MaterialExpressionLinearInterpolate, x, y)
    link(a, a_out, e, "A")
    link(b, b_out, e, "B")
    link(alpha, alpha_out, e, "Alpha")
    return e


def const(mat, v, x, y):
    return node(mat, unreal.MaterialExpressionConstant, x, y, r=v)


def build_masters(tex):
    folder = CONTENT + "/Materials/Masters"
    W, WL, N = tex["textures/_Default_White.png"], tex["textures/_Default_WhiteLinear.png"], tex["textures/_Default_Normal.png"]
    COLOR, LIN, NRM = unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL
    MP = unreal.MaterialProperty
    masters = {}

    def uv_chain(m):
        tc = node(m, unreal.MaterialExpressionTextureCoordinate, -1800, 0)
        til = node(m, unreal.MaterialExpressionAppendVector, -1800, 150)
        link(scalar(m, "UTile", 1.0, -2000, 120), "", til, "A")
        link(scalar(m, "VTile", 1.0, -2000, 200), "", til, "B")
        off = node(m, unreal.MaterialExpressionAppendVector, -1800, 300)
        link(scalar(m, "UOffset", 0.0, -2000, 280), "", off, "A")
        link(scalar(m, "VOffset", 0.0, -2000, 360), "", off, "B")
        mul = binop(m, unreal.MaterialExpressionMultiply, tc, "", til, "", -1600, 50)
        return binop(m, unreal.MaterialExpressionAdd, mul, "", off, "", -1450, 80)

    # --- M_Poiana_PBR: opaque by default; the instances switch to masked / translucent and two-sided
    m = new_material("M_Poiana_PBR", folder)
    m.set_editor_property("used_with_instanced_static_meshes", True)
    uv = uv_chain(m)
    base = tex_param(m, "BaseTex", W, COLOR, -1200, -400, uv)
    rough_t = tex_param(m, "RoughTex", WL, LIN, -1200, 200, uv)
    metal_t = tex_param(m, "MetalTex", WL, LIN, -1200, 450, uv)
    alpha_t = tex_param(m, "AlphaTex", WL, LIN, -1200, 700, uv)
    nrm_t = tex_param(m, "NormalTex", N, NRM, -1200, 950, uv)
    emis_t = tex_param(m, "EmissiveTex", W, COLOR, -1200, 1200, uv)
    tint = vector(m, "BaseColor", (1, 1, 1, 1), -1000, -600)
    vc = node(m, unreal.MaterialExpressionVertexColor, -1000, -250)
    one = const(m, 1.0, -900, -150)
    # vertex colour, only on the wall part of the facade textures when FacadeMask = 1 (RoughTex.b is the wall mask)
    fmask = lerp(m, one, "", rough_t, "B", scalar(m, "FacadeMask", 0.0, -900, -60), "", -750, -120)
    use_vc = binop(m, unreal.MaterialExpressionMultiply, scalar(m, "UseVertexColor", 0.0, -900, 20), "", fmask, "", -600, -60)
    vcol = lerp(m, one, "", vc, "", use_vc, "", -450, -200)
    c1 = binop(m, unreal.MaterialExpressionMultiply, base, "RGB", tint, "", -600, -450)
    color = binop(m, unreal.MaterialExpressionMultiply, c1, "", vcol, "", -250, -350)
    MEL.connect_material_property(color, "", MP.MP_BASE_COLOR)
    rough = binop(m, unreal.MaterialExpressionMultiply, scalar(m, "Roughness", 0.8, -900, 150), "", lerp(m, one, "", rough_t, "G", scalar(m, "UseRoughTex", 0.0, -900, 330), "", -700, 250), "", -350, 200)
    MEL.connect_material_property(rough, "", MP.MP_ROUGHNESS)
    metal = binop(m, unreal.MaterialExpressionMultiply, scalar(m, "Metallic", 0.0, -900, 420), "", lerp(m, one, "", metal_t, "B", scalar(m, "UseMetalTex", 0.0, -900, 560), "", -700, 480), "", -350, 450)
    MEL.connect_material_property(metal, "", MP.MP_METALLIC)
    alpha1 = lerp(m, one, "", base, "A", scalar(m, "UseBaseAlpha", 0.0, -900, 640), "", -700, 640)
    alpha2 = lerp(m, one, "", alpha_t, "G", scalar(m, "UseAlphaTex", 0.0, -900, 780), "", -700, 760)
    alpha = binop(m, unreal.MaterialExpressionMultiply, binop(m, unreal.MaterialExpressionMultiply, alpha1, "", alpha2, "", -500, 700), "", scalar(m, "Opacity", 1.0, -700, 880), "", -300, 720)
    MEL.connect_material_property(alpha, "", MP.MP_OPACITY)
    MEL.connect_material_property(alpha, "", MP.MP_OPACITY_MASK)
    # normal: xy scaled (three.js normalScale)
    ns = scalar(m, "NormalStrength", 1.0, -1000, 1100)
    nxy = node(m, unreal.MaterialExpressionComponentMask, -900, 950, r=True, g=True, b=False, a=False)
    link(nrm_t, "RGB", nxy, "")
    nz = node(m, unreal.MaterialExpressionComponentMask, -900, 1050, r=False, g=False, b=True, a=False)
    link(nrm_t, "RGB", nz, "")
    nsc = binop(m, unreal.MaterialExpressionMultiply, nxy, "", ns, "", -700, 1000)
    napp = node(m, unreal.MaterialExpressionAppendVector, -500, 1000)
    link(nsc, "", napp, "A")
    link(nz, "", napp, "B")
    nn = node(m, unreal.MaterialExpressionNormalize, -300, 1000)
    link(napp, "", nn, "")
    MEL.connect_material_property(nn, "", MP.MP_NORMAL)
    emis = binop(m, unreal.MaterialExpressionMultiply, vector(m, "Emissive", (0, 0, 0, 1), -900, 1250), "", emis_t, "RGB", -500, 1250)
    MEL.connect_material_property(emis, "", MP.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m)
    masters["pbr"] = m

    # --- M_Poiana_Foliage: masked two-sided foliage, per-instance brightness, a light wind higher up the tree
    m = new_material("M_Poiana_Foliage", folder)
    m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
    m.set_editor_property("two_sided", True)
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
    m.set_editor_property("used_with_instanced_static_meshes", True)
    uv = uv_chain(m)
    base = tex_param(m, "BaseTex", W, COLOR, -1200, -300, uv)
    c1 = binop(m, unreal.MaterialExpressionMultiply, base, "RGB", vector(m, "BaseColor", (1, 1, 1, 1), -1000, -500), "", -800, -350)
    pir = node(m, unreal.MaterialExpressionPerInstanceRandom, -1000, -100)
    var = lerp(m, const(m, 0.85, -900, -50), "", const(m, 1.15, -900, 0), "", pir, "", -750, -60)
    color = binop(m, unreal.MaterialExpressionMultiply, c1, "", var, "", -550, -250)
    MEL.connect_material_property(color, "", MP.MP_BASE_COLOR)
    MEL.connect_material_property(binop(m, unreal.MaterialExpressionMultiply, color, "", const(m, 0.55, -500, -120), "", -350, -150), "", MP.MP_SUBSURFACE_COLOR)
    MEL.connect_material_property(scalar(m, "Roughness", 0.8, -500, 50), "", MP.MP_ROUGHNESS)
    MEL.connect_material_property(base, "A", MP.MP_OPACITY_MASK)
    wp = node(m, unreal.MaterialExpressionWorldPosition, -1400, 400)
    op = node(m, unreal.MaterialExpressionObjectPositionWS, -1400, 500)
    dz = binop(m, unreal.MaterialExpressionSubtract, wp, "", op, "", -1200, 450)
    dzb = node(m, unreal.MaterialExpressionComponentMask, -1050, 450, r=False, g=False, b=True, a=False)
    link(dz, "", dzb, "")
    hw = node(m, unreal.MaterialExpressionSaturate, -700, 450)
    link(binop(m, unreal.MaterialExpressionDivide, dzb, "", const(m, 1800.0, -1050, 550), "", -880, 470), "", hw, "")
    fn = unreal.load_asset("/Engine/Functions/Engine_MaterialFunctions01/WorldPositionOffset/SimpleGrassWind.SimpleGrassWind")
    if fn:
        wind = node(m, unreal.MaterialExpressionMaterialFunctionCall, -450, 400)
        wind.set_editor_property("material_function", fn)
        link(scalar(m, "WindIntensity", 0.25, -700, 350), "", wind, "WindIntensity")
        link(hw, "", wind, "WindWeight")
        link(scalar(m, "WindSpeed", 0.35, -700, 560), "", wind, "WindSpeed")
        MEL.connect_material_property(wind, "", MP.MP_WORLD_POSITION_OFFSET)
    else:
        warn("SimpleGrassWind not found: foliage without wind")
    MEL.recompile_material(m)
    masters["foliage"] = m

    # --- M_Poiana_Glass: translucent, lit per pixel on the surface (reflections), no refraction
    m = new_material("M_Poiana_Glass", folder)
    m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    try:
        m.set_editor_property("translucency_lighting_mode", unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
    except Exception:
        pass
    m.set_editor_property("used_with_instanced_static_meshes", True)
    uv = uv_chain(m)
    base = tex_param(m, "BaseTex", W, COLOR, -1000, -200, uv)
    MEL.connect_material_property(binop(m, unreal.MaterialExpressionMultiply, base, "RGB", vector(m, "BaseColor", (0.05, 0.06, 0.07, 1), -900, -400), "", -600, -250), "", MP.MP_BASE_COLOR)
    MEL.connect_material_property(scalar(m, "Roughness", 0.05, -600, 0), "", MP.MP_ROUGHNESS)
    MEL.connect_material_property(scalar(m, "Metallic", 0.0, -600, 100), "", MP.MP_METALLIC)
    MEL.connect_material_property(scalar(m, "Specular", 0.8, -600, 200), "", MP.MP_SPECULAR)
    MEL.connect_material_property(binop(m, unreal.MaterialExpressionMultiply, scalar(m, "Opacity", 0.35, -800, 300), "", base, "A", -600, 300), "", MP.MP_OPACITY)
    MEL.recompile_material(m)
    masters["glass"] = m

    # --- M_Poiana_CarPaint: clear coat
    m = new_material("M_Poiana_CarPaint", folder)
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_CLEAR_COAT)
    uv = uv_chain(m)
    base = tex_param(m, "BaseTex", W, COLOR, -1000, -200, uv)
    MEL.connect_material_property(binop(m, unreal.MaterialExpressionMultiply, base, "RGB", vector(m, "BaseColor", (0.5, 0.5, 0.5, 1), -900, -400), "", -600, -250), "", MP.MP_BASE_COLOR)
    MEL.connect_material_property(scalar(m, "Metallic", 0.6, -600, 0), "", MP.MP_METALLIC)
    MEL.connect_material_property(scalar(m, "Roughness", 0.35, -600, 100), "", MP.MP_ROUGHNESS)
    MEL.connect_material_property(scalar(m, "ClearCoat", 1.0, -600, 200), "", MP.MP_CUSTOM_DATA0)
    MEL.connect_material_property(scalar(m, "ClearCoatRoughness", 0.05, -600, 300), "", MP.MP_CUSTOM_DATA1)
    MEL.recompile_material(m)
    masters["paint"] = m

    # --- M_Poiana_Unlit (signs painted as light, lamp glows)
    m = new_material("M_Poiana_Unlit", folder)
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    uv = uv_chain(m)
    base = tex_param(m, "BaseTex", W, COLOR, -1000, -200, uv)
    col = binop(m, unreal.MaterialExpressionMultiply, base, "RGB", vector(m, "BaseColor", (1, 1, 1, 1), -900, -400), "", -600, -250)
    MEL.connect_material_property(col, "", MP.MP_EMISSIVE_COLOR)
    op = binop(m, unreal.MaterialExpressionMultiply, scalar(m, "Opacity", 1.0, -800, 100), "", base, "A", -600, 100)
    MEL.connect_material_property(op, "", MP.MP_OPACITY)
    MEL.connect_material_property(op, "", MP.MP_OPACITY_MASK)
    MEL.recompile_material(m)
    masters["unlit"] = m
    return masters


TERRAIN_HLSL = r"""
// the game's terrain shader (src/geo/terrain.js): satellite colour tint over grass / forest floor / farmland / gravel
float2 xz = float2(dot(WP, AxisX), dot(WP, AxisZ)) / Scale;
float2 guv = (xz + Ext) / (2.0 * Ext);
float3 sp = Texture2DSample(Splat, SplatSampler, guv).rgb;
float3 orth = Texture2DSample(Ortho, OrthoSampler, guv).rgb;
float2 duv = xz / 2.6;
float3 cg = Texture2DSample(Grass, GrassSampler, duv).rgb;
float3 cs = Texture2DSample(Soil, SoilSampler, duv * 0.8).rgb;
float3 cr = Texture2DSample(Gravel, GravelSampler, duv * 1.3).rgb;
float lit = Texture2DSample(Soil, SoilSampler, duv * 0.37 + 0.31).r;
float3 cf = lerp(cs * float3(0.78, 0.6, 0.42), cs * float3(0.52, 0.4, 0.3), smoothstep(0.35, 0.65, lit));
cf = lerp(cf, cg * float3(0.55, 0.65, 0.45), 0.14);
float wf = sp.r, wa = sp.g, wr = sp.b;
float wg = max(0.0, 1.0 - wf - wa - wr);
float ws = wg + wf + wa + wr + 1e-4;
float3 det = (cg * wg + cf * wf + cs * wa + cr * wr) / ws;
float3 avg = (AvgG * wg + (AvgS * float3(0.8, 0.72, 0.6) * 0.65 + AvgG * 0.25) * wf + AvgS * wa + AvgR * wr) / ws;
float3 tint = clamp(orth / max(avg, 0.01), 0.35, 2.4);
float farK = smoothstep(35.0, 420.0, length(WP - Cam) / Scale);
float3 nearCol = det * lerp(float3(1.0, 1.0, 1.0), tint, 0.6 * (1.0 - 0.75 * wf / ws));
return lerp(nearCol, orth * 1.08, farK);
"""

WATER_HLSL = r"""
// panning ripples in the game's frame (xz / 9 + time * flow), as in src/geo/terrain.js
float2 xz = float2(dot(WP, AxisX), dot(WP, AxisZ)) / Scale;
return xz * UVScale + Time * Flow;
"""


def custom_node(mat, code, inputs, out_type, x, y):
    c = node(mat, unreal.MaterialExpressionCustom, x, y)
    c.set_editor_property("code", code)
    c.set_editor_property("output_type", out_type)
    ins = []
    for n in inputs:
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", n)
        ins.append(ci)
    c.set_editor_property("inputs", ins)
    return c


def build_special(tex, frame, terrain_recs, water_rec):
    """terrain (one per terrain material: near grid / world grid) and water, their parameters baked in"""
    folder = CONTENT + "/Materials/Masters"
    MP = unreal.MaterialProperty
    COLOR, LIN = unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR
    ax = frame.vec([1, 0, 0])
    az = frame.vec([0, 0, 1])
    axn = [v / frame.scale for v in ax]
    azn = [v / frame.scale for v in az]
    out = {}
    for rec in terrain_recs:
        m = new_material("M_Poiana_" + rec["name"][2:], folder)
        c = custom_node(m, TERRAIN_HLSL, ["WP", "Cam", "AxisX", "AxisZ", "Scale", "Ext", "AvgG", "AvgS", "AvgR", "Ortho", "Splat", "Grass", "Soil", "Gravel"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -400, 0)
        link(node(m, unreal.MaterialExpressionWorldPosition, -900, -300), "", c, "WP")
        link(node(m, unreal.MaterialExpressionCameraPositionWS, -900, -200), "", c, "Cam")
        link(node(m, unreal.MaterialExpressionConstant3Vector, -900, -100, constant=unreal.LinearColor(axn[0], axn[1], axn[2], 0)), "", c, "AxisX")
        link(node(m, unreal.MaterialExpressionConstant3Vector, -900, 0, constant=unreal.LinearColor(azn[0], azn[1], azn[2], 0)), "", c, "AxisZ")
        link(const(m, frame.scale, -900, 100), "", c, "Scale")
        link(const(m, float(rec["ext"]), -900, 180), "", c, "Ext")
        for i, (k, n) in enumerate((("grass", "AvgG"), ("soil", "AvgS"), ("gravel", "AvgR"))):
            a = rec["avg"][k]
            link(node(m, unreal.MaterialExpressionConstant3Vector, -900, 260 + 80 * i, constant=unreal.LinearColor(a[0], a[1], a[2], 0)), "", c, n)
        for i, (k, n, s) in enumerate((("ortho", "Ortho", COLOR), ("splat", "Splat", LIN), ("grass", "Grass", COLOR), ("soil", "Soil", COLOR), ("gravel", "Gravel", COLOR))):
            t = tex.get(rec["maps"][k]["file"])
            to = node(m, unreal.MaterialExpressionTextureObjectParameter, -900, 520 + 110 * i, parameter_name=n, texture=t, sampler_type=s)
            link(to, "", c, n)
        MEL.connect_material_property(c, "", MP.MP_BASE_COLOR)
        MEL.connect_material_property(const(m, rec.get("roughness", 0.97), -400, 200), "", MP.MP_ROUGHNESS)
        MEL.connect_material_property(const(m, 0.3, -400, 280), "", MP.MP_SPECULAR)
        MEL.recompile_material(m)
        out[rec["name"]] = m
    if water_rec:
        m = new_material("M_Poiana_Water", folder)
        c = custom_node(m, WATER_HLSL, ["WP", "AxisX", "AxisZ", "Scale", "UVScale", "Time", "Flow"], unreal.CustomMaterialOutputType.CMOT_FLOAT2, -900, 300)
        link(node(m, unreal.MaterialExpressionWorldPosition, -1300, 200), "", c, "WP")
        link(node(m, unreal.MaterialExpressionConstant3Vector, -1300, 300, constant=unreal.LinearColor(axn[0], axn[1], axn[2], 0)), "", c, "AxisX")
        link(node(m, unreal.MaterialExpressionConstant3Vector, -1300, 400, constant=unreal.LinearColor(azn[0], azn[1], azn[2], 0)), "", c, "AxisZ")
        link(const(m, frame.scale, -1300, 500), "", c, "Scale")
        link(const(m, water_rec.get("uvScale", 1 / 9.0), -1300, 580), "", c, "UVScale")
        link(node(m, unreal.MaterialExpressionTime, -1300, 660), "", c, "Time")
        f = water_rec.get("flow", [0.018, 0.05])
        link(node(m, unreal.MaterialExpressionConstant2Vector, -1300, 740, r=f[0], g=f[1]), "", c, "Flow")
        nref = (water_rec.get("maps") or {}).get("normal")
        nt = tex.get(nref["file"]) if nref else tex["textures/_Default_Normal.png"]
        ns = node(m, unreal.MaterialExpressionTextureSample, -600, 300, texture=nt, sampler_type=unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        link(c, "", ns, "UVs")
        flat = node(m, unreal.MaterialExpressionConstant3Vector, -600, 500, constant=unreal.LinearColor(0, 0, 1, 0))
        MEL.connect_material_property(lerp(m, flat, "", ns, "RGB", const(m, water_rec.get("normalScale", 0.35), -600, 600), "", -300, 400), "", MP.MP_NORMAL)
        col = water_rec.get("color", [0.07, 0.1, 0.085])
        MEL.connect_material_property(node(m, unreal.MaterialExpressionConstant3Vector, -300, 0, constant=unreal.LinearColor(col[0], col[1], col[2], 0)), "", MP.MP_BASE_COLOR)
        MEL.connect_material_property(const(m, max(0.02, water_rec.get("roughness", 0.07)), -300, 100), "", MP.MP_ROUGHNESS)
        MEL.connect_material_property(const(m, 0.5, -300, 180), "", MP.MP_SPECULAR)
        MEL.recompile_material(m)
        out[water_rec["name"]] = m
    return out


def make_instances(mats, masters, special, tex):
    folder = CONTENT + "/Materials"
    res = dict(special)
    BM = unreal.BlendMode
    for rec in mats["materials"]:
        if rec["name"] in res:
            continue
        kind = rec.get("kind", "pbr")
        parent = masters.get(kind) or masters["pbr"]
        path = folder + "/" + rec["name"]
        if EAL.does_asset_exist(path):
            EAL.delete_asset(path)
        mi = AT.create_asset(rec["name"], folder, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        MEL.set_material_instance_parent(mi, parent)
        have = PARAMS.get(parent.get_name(), set())

        def sc(n, v):
            if n in have:
                MEL.set_material_instance_scalar_parameter_value(mi, n, float(v))

        def ve(n, c):
            if n in have:
                MEL.set_material_instance_vector_parameter_value(mi, n, unreal.LinearColor(c[0], c[1], c[2], 1))

        def tx(n, t):
            if n in have:
                MEL.set_material_instance_texture_parameter_value(mi, n, t)
                return True
            return False
        ve("BaseColor", rec.get("color", [1, 1, 1]))
        for k, p in (("roughness", "Roughness"), ("metalness", "Metallic"), ("opacity", "Opacity"), ("normalScale", "NormalStrength")):
            if k in rec:
                sc(p, rec[k])
        if kind == "paint":
            sc("ClearCoat", rec.get("clearcoat", 1))
            sc("ClearCoatRoughness", rec.get("clearcoatRoughness", 0.05))
        e = rec.get("emissive", [0, 0, 0])
        if any(v > 0 for v in e):
            ve("Emissive", e)
        maps = rec.get("maps") or {}
        tile = None
        for key, param, flag in (("base", "BaseTex", None), ("normal", "NormalTex", None), ("rough", "RoughTex", "UseRoughTex"), ("metal", "MetalTex", "UseMetalTex"), ("emissive", "EmissiveTex", None), ("alpha", "AlphaTex", "UseAlphaTex")):
            ref = maps.get(key)
            if not ref or ref["file"] not in tex:
                continue
            t = tex.get(ref["file"] + "|lin", tex[ref["file"]]) if key in ("rough", "metal", "alpha") else tex[ref["file"]]
            if not tx(param, t):
                continue
            if flag:
                sc(flag, 1.0)
            if tile is None:
                tile = ref
        if tile:
            sc("UTile", tile["repeat"][0])
            sc("VTile", tile["repeat"][1])
            sc("UOffset", tile["offset"][0])
            sc("VOffset", tile["offset"][1])
        if rec.get("vertexColors"):
            sc("UseVertexColor", 1.0)
        if rec.get("facadeMask"):
            sc("FacadeMask", 1.0)
        blend = rec.get("blend", "opaque")
        if blend in ("masked", "translucent") and "base" in maps:
            sc("UseBaseAlpha", 1.0)
        if kind in ("pbr", "unlit"):
            ov = mi.get_editor_property("base_property_overrides")
            if blend != "opaque":
                ov.set_editor_property("override_blend_mode", True)
                ov.set_editor_property("blend_mode", BM.BLEND_MASKED if blend == "masked" else BM.BLEND_TRANSLUCENT)
                if blend == "masked":
                    ov.set_editor_property("override_opacity_mask_clip_value", True)
                    ov.set_editor_property("opacity_mask_clip_value", float(rec.get("alphaCutoff", 0.5)))
            if rec.get("twoSided"):
                ov.set_editor_property("override_two_sided", True)
                ov.set_editor_property("two_sided", True)
            mi.set_editor_property("base_property_overrides", ov)
        MEL.update_material_instance(mi)
        res[rec["name"]] = mi
    log("material instances: %d" % len(res))
    return res


# ------------------------------------------------------------------ meshes
def setup_mesh(mesh, materials, nanite, collision):
    for i, sm in enumerate(mesh.get_editor_property("static_materials")):
        slot = str(sm.get_editor_property("material_slot_name"))
        mi = materials.get(slot)
        if mi is None:                                            # Interchange may decorate the slot name
            for k in materials:
                if slot.endswith(k) or k in slot:
                    mi = materials[k]
                    break
        if mi is not None:
            mesh.set_material(i, mi)
        else:
            warn("no material for slot %s of %s" % (slot, mesh.get_name()))
    try:
        unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem).set_generate_lightmap_uv(mesh, False)
    except Exception:
        pass
    if nanite:
        try:
            ns = mesh.get_editor_property("nanite_settings")
            ns.set_editor_property("enabled", True)
            mesh.set_editor_property("nanite_settings", ns)
        except Exception as e:
            warn("nanite on %s: %s" % (mesh.get_name(), e))
    bs = mesh.get_editor_property("body_setup")
    if bs is not None:
        bs.set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE if collision else unreal.CollisionTraceFlag.CTF_USE_DEFAULT)
    EAL.save_loaded_asset(mesh, False)


def placement(frame, mesh, gmin, gmax):
    """actor location that puts the imported mesh where its exported bounds say (whatever the importer did with pivots)"""
    b = mesh.get_bounds()
    want = frame.point([(gmin[k] + gmax[k]) / 2.0 for k in range(3)])
    return unreal.Vector(want.x - b.origin.x, want.y - b.origin.y, want.z - b.origin.z)


def spawn_mesh_actor(mesh, loc, label, sub):
    a = ACTORS.spawn_actor_from_object(mesh, loc, unreal.Rotator(0, 0, 0))
    a.set_actor_label(label)
    a.set_folder_path(FOLDER + "/" + sub)
    return a


def delete_imported_materials(folder):
    for a in assets_in(folder):
        if isinstance(a, (unreal.MaterialInterface, unreal.Texture)):
            EAL.delete_asset(a.get_path_name())


def import_tiles(man, frame, materials):
    tiles = man["tiles"]
    prog = Progress(len(tiles), "Poiana: tile-uri")
    n = 0
    try:
        for t in tiles:
            prog.step(t["name"])
            dest = CONTENT + "/World/" + t["name"]
            import_files([path_join(t["file"])], dest)
            for mm in t["meshes"]:
                mesh = find_mesh(dest, mm["name"])
                if mesh is None:
                    warn("mesh missing after import: " + mm["name"])
                    continue
                kind = mm["kind"]
                setup_mesh(mesh, materials, NANITE and kind in ("Terrain", "Static"), kind != "Water")
                spawn_mesh_actor(mesh, placement(frame, mesh, mm["min"], mm["max"]), mm["name"], "Tiles")
                n += 1
            delete_imported_materials(dest)
    finally:
        prog.done()
    log("tile meshes placed: %d" % n)


def import_single(entry, sub, frame, materials, nanite=True, collision=True, spawn=True):
    dest = CONTENT + "/" + sub
    import_files([path_join(entry["file"])], dest)
    mesh = find_mesh(dest, entry["mesh"])
    if mesh is None:
        warn("mesh missing after import: " + entry["mesh"])
        return None
    setup_mesh(mesh, materials, nanite, collision)
    delete_imported_materials(dest)
    if spawn:
        spawn_mesh_actor(mesh, placement(frame, mesh, entry["min"], entry["max"]), entry["mesh"], sub)
    return mesh


# ------------------------------------------------------------------ instances (HISM)
SUBOBJ = None


def add_hism(actor, mesh, name):
    global SUBOBJ
    if SUBOBJ is None:
        SUBOBJ = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    root = SUBOBJ.k2_gather_subobject_data_for_instance(actor)[0]
    params = unreal.AddNewSubobjectParams(parent_handle=root, new_class=unreal.HierarchicalInstancedStaticMeshComponent, blueprint_context=None)
    handle, fail = SUBOBJ.add_new_subobject(params)
    if str(fail):
        raise RuntimeError(str(fail))
    SUBOBJ.rename_subobject(handle, unreal.Text(name))
    comp = unreal.SubobjectDataBlueprintFunctionLibrary.get_object(unreal.SubobjectDataBlueprintFunctionLibrary.get_data(handle))
    comp.set_static_mesh(mesh)
    return comp


def container(label, sub, loc=None):
    a = ACTORS.spawn_actor_from_class(unreal.Actor, loc or unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    if a.get_editor_property("root_component") is None:
        # a scene root so the instanced components have a transform to hang from
        global SUBOBJ
        if SUBOBJ is None:
            SUBOBJ = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
        h = SUBOBJ.k2_gather_subobject_data_for_instance(a)[0]
        SUBOBJ.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=h, new_class=unreal.SceneComponent, blueprint_context=None))
    a.set_actor_label(label)
    a.set_folder_path(FOLDER + "/" + sub)
    return a


def pivot_fix(frame, mesh, entry):
    """offset (UE, mesh space) between the exported pivot and the imported one"""
    b = mesh.get_bounds()
    want = frame.point([(entry["min"][k] + entry["max"][k]) / 2.0 for k in range(3)])
    return [want.x - b.origin.x, want.y - b.origin.y, want.z - b.origin.z]


def import_trees(man, frame, materials):
    tr = man.get("trees")
    if not tr:
        warn("no trees in the export")
        return
    sets = ["mapped", "forest"] + (["understory"] if STEPS.get("understory") else [])
    # the yaw of a rotation about game +Y as seen in UE (sign from the measured frame)
    R = [[math.cos(0.5), 0, math.sin(0.5)], [0, 1, 0], [-math.sin(0.5), 0, math.cos(0.5)]]
    Rue = frame.rot_matrix(R)
    yaw_sign = 1.0 if math.atan2(Rue[1][0], Rue[0][0]) > 0 else -1.0
    up = frame.dir([0, 1, 0])
    if abs(up[2]) < 0.99:
        warn("game +Y is not UE +Z in this import: tree yaw may be wrong")
    types = tr["types"]
    prog = Progress(len(types), "Poiana: copaci")
    by_tile = {}                                                  # (tx, ty) -> [(type entry, mesh, set, start, count)]
    meshes = {}
    try:
        for t in types:
            prog.step(t["label"])
            repl = TREE_REPLACE.get(t["label"])
            mesh = unreal.load_asset(repl) if repl else import_single(t, "Trees", frame, materials, nanite=NANITE, collision=False, spawn=False)
            if mesh is None:
                continue
            fix = [0, 0, 0] if repl else pivot_fix(frame, mesh, t)
            meshes[t["name"]] = (mesh, fix)
            for s in sets:
                info = t["sets"].get(s)
                if not info:
                    continue
                for tile, start, count in info["tiles"]:
                    ti, tj = tile_index(tile)
                    key = (math.floor(ti * man["tile"] / TREE_TILE_M), math.floor(tj * man["tile"] / TREE_TILE_M))
                    by_tile.setdefault(key, []).append((t, s, info["file"], start, count))
    finally:
        prog.done()
    cache = {}
    prog = Progress(len(by_tile), "Poiana: instanțe copaci")
    total = 0
    try:
        for key in sorted(by_tile):
            prog.step("copaci %s" % (key,))
            actor = container("Trees_%d_%d" % key, "Trees")
            per_type = {}
            for t, s, file, start, count in by_tile[key]:
                per_type.setdefault(t["name"], []).append((file, start, count))
            for name, parts in per_type.items():
                mesh, fix = meshes[name]
                xf = []
                for file, start, count in parts:
                    if file not in cache:
                        with open(path_join(file), "rb") as f:
                            data = f.read()
                        cache[file] = struct.unpack("<%df" % (len(data) // 4), data)
                    d = cache[file]
                    for i in range(start, start + count):
                        x, y, z, yaw, s = d[i * 5:i * 5 + 5]
                        p = frame.vec([x, y, z])
                        a = yaw * yaw_sign
                        ca, sa = math.cos(a), math.sin(a)
                        p = [p[0] + (ca * fix[0] - sa * fix[1]) * s, p[1] + (sa * fix[0] + ca * fix[1]) * s, p[2] + fix[2] * s]
                        xf.append(unreal.Transform(unreal.Vector(p[0], p[1], p[2]), unreal.Rotator(roll=0.0, pitch=0.0, yaw=math.degrees(a)), unreal.Vector(s, s, s)))
                comp = add_hism(actor, mesh, name)
                comp.add_instances(xf, False, True)
                comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
                comp.set_editor_property("cast_shadow", True)
                total += len(xf)
            if len(cache) > 24:
                cache.clear()
    finally:
        prog.done()
    log("trees placed: %d instances in %d actors" % (total, len(by_tile)))


def tile_index(name):
    # T_p03_m12 -> (3, -12)
    a, b = name[2:].split("_")
    return (int(a[1:]) * (-1 if a[0] == "m" else 1), int(b[1:]) * (-1 if b[0] == "m" else 1))


def import_instances(man, frame, materials):
    for e in man.get("instances", []):
        mesh = import_single(e, "Instances", frame, materials, nanite=NANITE, collision=True, spawn=False)
        if mesh is None:
            continue
        fix = pivot_fix(frame, mesh, e)
        with open(path_join(e["transforms"]), "rb") as f:
            data = f.read()
        d = struct.unpack("<%df" % (len(data) // 4), data)
        xf = []
        for i in range(len(d) // 10):
            px, py, pz, qx, qy, qz, qw, sx, sy, sz = d[i * 10:i * 10 + 10]
            Rg = matrix_from_quat(qx, qy, qz, qw)
            Rue = frame.rot_matrix(Rg)
            sc = frame.dir([sx, sy, sz])
            sc = [abs(v) for v in sc]
            p = frame.vec([px, py, pz])
            f = [Rue[r][0] * fix[0] * sc[0] + Rue[r][1] * fix[1] * sc[1] + Rue[r][2] * fix[2] * sc[2] for r in range(3)]
            xf.append(unreal.Transform(unreal.Vector(p[0] + f[0], p[1] + f[1], p[2] + f[2]), ue_rotator(Rue), unreal.Vector(sc[0], sc[1], sc[2])))
        actor = container(e["name"], "Instances")
        comp = add_hism(actor, mesh, e["name"])
        comp.add_instances(xf, False, True)
        log("instances %s: %d" % (e["name"], len(xf)))


# ------------------------------------------------------------------ cameras, player start, lighting
def place_cameras(man, frame):
    n = 0
    for c in man.get("cameras", []):
        p = list(c["position"])
        p[1] += c.get("eye", 1.6)
        loc = frame.point(p)
        rot = rotator_from_dir(frame.dir(c["forward"]))
        cam = ACTORS.spawn_actor_from_class(unreal.CineCameraActor, loc, rot)
        cam.set_actor_label(c["label"])
        cam.set_folder_path(FOLDER + "/Cameras")
        comp = cam.get_cine_camera_component()
        fb = comp.get_editor_property("filmback")
        fb.set_editor_property("sensor_width", 36.0)
        fb.set_editor_property("sensor_height", 20.25)
        comp.set_editor_property("filmback", fb)
        comp.set_editor_property("current_focal_length", 10.125 / math.tan(math.radians(c.get("vfov", 70)) / 2.0))
        n += 1
    ps = man.get("playerStart")
    if ps:
        p = list(ps["position"])
        p[1] += 1.0
        a = ACTORS.spawn_actor_from_class(unreal.PlayerStart, frame.point(p), rotator_from_dir(frame.dir(ps["forward"])))
        a.set_folder_path(FOLDER)
    log("cameras: %d" % n)


def lighting(man, frame):
    sun = man.get("sun") or {"toSun": [0.3, 0.6, 0.7]}
    d = frame.dir([-v for v in sun["toSun"]])                    # the light travels away from the sun
    L = ACTORS.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 50000), rotator_from_dir(d))
    L.set_actor_label("Soare (" + sun.get("date", "") + ")")
    lc = L.get_component_by_class(unreal.DirectionalLightComponent)
    lc.set_editor_property("atmosphere_sun_light", True)
    lc.set_editor_property("intensity", 10.0)
    for cls, label in ((unreal.SkyAtmosphere, "Atmosfera"), (unreal.SkyLight, "Lumina cerului"), (unreal.VolumetricCloud, "Nori"), (unreal.ExponentialHeightFog, "Ceață")):
        a = ACTORS.spawn_actor_from_class(cls, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
        a.set_actor_label(label)
        a.set_folder_path(FOLDER + "/Lighting")
        if cls is unreal.SkyLight:
            a.get_component_by_class(unreal.SkyLightComponent).set_editor_property("real_time_capture", True)
        if cls is unreal.ExponentialHeightFog:
            fc = a.get_component_by_class(unreal.ExponentialHeightFogComponent)
            fc.set_editor_property("volumetric_fog", True)
            fc.set_editor_property("fog_density", 0.004)
    L.set_folder_path(FOLDER + "/Lighting")
    ppv = ACTORS.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    ppv.set_actor_label("Post process (Lumen)")
    ppv.set_folder_path(FOLDER + "/Lighting")
    ppv.set_editor_property("unbound", True)
    s = ppv.get_editor_property("settings")
    try:
        s.set_editor_property("override_dynamic_global_illumination_method", True)
        s.set_editor_property("dynamic_global_illumination_method", unreal.DynamicGlobalIlluminationMethod.LUMEN)
        s.set_editor_property("override_reflection_method", True)
        s.set_editor_property("reflection_method", unreal.ReflectionMethod.LUMEN)
    except Exception as e:
        warn("post process: %s" % e)
    ppv.set_editor_property("settings", s)
    log("lighting: sun elevation %.1f deg, azimuth %.1f deg" % (sun.get("elevation", 0), sun.get("azimuth", 0)))


def clear_previous():
    n = 0
    for a in ACTORS.get_all_level_actors():
        try:
            if str(a.get_folder_path()).startswith(FOLDER):
                ACTORS.destroy_actor(a)
                n += 1
        except Exception:
            pass
    if n:
        log("removed %d actors from a previous run" % n)


# ------------------------------------------------------------------ main
def run():
    t0 = time.time()
    man_path = path_join("manifest.json")
    if not os.path.exists(man_path):
        unreal.log_error("[Poiana] manifest.json not found in EXPORT_DIR = " + EXPORT_DIR)
        return
    with open(man_path, "r", encoding="utf-8") as f:
        man = json.load(f)
    with open(path_join(man.get("materials", "materials.json")), "r", encoding="utf-8") as f:
        mats = json.load(f)
    log("export: %s" % json.dumps(man.get("stats", {})))
    clear_previous()
    frame = Frame()
    frame.calibrate(man)

    def step(name, fn, *a):
        if not STEPS.get(name, True):
            return None
        t = time.time()
        try:
            r = fn(*a)
            log("%s: done in %.0f s" % (name, time.time() - t))
            return r
        except KeyboardInterrupt:
            raise
        except Exception:
            unreal.log_error("[Poiana] step %s failed:\n%s" % (name, traceback.format_exc()))
            return None

    tex = step("textures", import_textures, mats) or {}
    materials = {}
    if STEPS.get("materials") and tex:
        masters = step("materials", build_masters, tex) or {}
        terrain = [m for m in mats["materials"] if m.get("kind") == "terrain"]
        water = next((m for m in mats["materials"] if m.get("kind") == "water"), None)
        special = step("materials", build_special, tex, frame, terrain, water) or {}
        if masters:
            materials = step("materials", make_instances, mats, masters, special, tex) or {}
    step("tiles", import_tiles, man, frame, materials)
    if man.get("farTerrain"):
        step("far_terrain", import_single, man["farTerrain"], "FarTerrain", frame, materials, False, False)
    step("trees", import_trees, man, frame, materials)
    step("instances", import_instances, man, frame, materials)
    step("cars", lambda: [import_single(c, "Cars", frame, materials, NANITE, True) for c in man.get("cars", [])])
    step("cameras", place_cameras, man, frame)
    step("lighting", lighting, man, frame)
    EAL.save_directory(CONTENT, only_if_is_dirty=True, recursive=True)
    try:
        LEVEL.save_current_level()
    except Exception as e:
        warn("save level: %s" % e)
    log("ALL DONE in %.1f min" % ((time.time() - t0) / 60.0))


run()
