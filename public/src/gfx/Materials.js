/* Material library. Wraps the procedural textures into PBR materials and keeps
   per-world-size clones so a 28 m wall and a 2 m door tile at the same density. */
import * as THREE from 'three';

export class MaterialLibrary {
  constructor(tex, opts = {}) {
    this.tex = tex;
    this.envIntensity = opts.envIntensity ?? 1.0;
    this._cache = new Map();
    this._texCache = new Map();
  }

  /** Clone a texture set with the repeat needed to cover `w x h` metres. */
  _tiled(name, w, h, rot = 0) {
    const key = `${name}|${w.toFixed(2)}|${h.toFixed(2)}|${rot}`;
    if (this._texCache.has(key)) return this._texCache.get(key);
    const src = this.tex.get(name);
    const ws = src.worldSize || 2;
    const out = {};
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      if (!src[k]) continue;
      const t = src[k].clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(0.01, w / ws), Math.max(0.01, h / ws));
      if (rot) { t.center.set(0.5, 0.5); t.rotation = rot; }
      out[k] = t;
    }
    this._texCache.set(key, out);
    return out;
  }

  /** Standard PBR surface from a generated texture set, tiled for a given area. */
  surface(name, w = 2, h = 2, over = {}) {
    const key = `s|${name}|${w.toFixed(2)}|${h.toFixed(2)}|${JSON.stringify(over)}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const t = this._tiled(name, w, h, over.rotation || 0);
    const m = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap,
      metalness: over.metalness ?? 0.0,
      roughness: over.roughness ?? 1.0,
      color: over.color ?? 0xffffff,
      side: over.side ?? THREE.FrontSide,
      envMapIntensity: over.envMapIntensity ?? this.envIntensity,
      normalScale: new THREE.Vector2(over.normalScale ?? 1, over.normalScale ?? 1),
      vertexColors: over.vertexColors ?? false,
      ...(over.extra || {}),
    });
    m.name = name;
    this._cache.set(key, m);
    return m;
  }

  /** Flat coloured surface (no texture) — plastic, rubber, trims. */
  plain(color, { roughness = 0.6, metalness = 0.0, envMapIntensity, ...rest } = {}) {
    const key = `p|${color}|${roughness}|${metalness}|${JSON.stringify(rest)}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color, roughness, metalness,
      envMapIntensity: envMapIntensity ?? this.envIntensity, ...rest,
    });
    this._cache.set(key, m);
    return m;
  }

  /** Automotive paint: base coat + clear coat, with a faint orange-peel normal. */
  carPaint(color, { metallic = 0.6, flake = true, clear = 1.0, roughness = 0.34 } = {}) {
    // real metallic paint is a dielectric clear coat over flake; full metalness
    // turns every panel into a blue sky mirror, so cap it
    metallic = Math.min(metallic, 0.62);
    roughness = Math.max(roughness, 0.38 + metallic * 0.10);
    const key = `cp|${color}|${metallic}|${flake}|${clear}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const m = new THREE.MeshPhysicalMaterial({
      color,
      metalness: metallic,
      roughness,
      clearcoat: clear,
      clearcoatRoughness: 0.045,
      envMapIntensity: this.envIntensity * 0.95,
      sheen: 0,
    });
    if (flake) {
      const n = this.tex.get('plaster').normalMap.clone();
      n.needsUpdate = true; n.repeat.set(14, 14);
      m.clearcoatNormalMap = n;
      m.clearcoatNormalScale = new THREE.Vector2(0.07, 0.07);
    }
    this._cache.set(key, m);
    return m;
  }

  /** Window glass. `transmission` is expensive, so it is opt-in for high presets. */
  glass({ tint = 0x101820, opacity = 0.62, transmission = false, roughness = 0.06 } = {}) {
    const key = `g|${tint}|${opacity}|${transmission}|${roughness}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const m = transmission
      ? new THREE.MeshPhysicalMaterial({
          color: tint, metalness: 0, roughness, transmission: 0.92, thickness: 0.02,
          ior: 1.5, transparent: true, opacity: 1, envMapIntensity: this.envIntensity * 1.5,
          side: THREE.DoubleSide,
        })
      : new THREE.MeshPhysicalMaterial({
          color: tint, metalness: 0.1, roughness, transparent: true, opacity,
          envMapIntensity: this.envIntensity * 1.35, clearcoat: 1, clearcoatRoughness: 0.02,
          // FrontSide matters: the cabin is a closed glass volume, so culling
          // back faces gives a clear view from the driver's seat while the car
          // still shows tinted windows from outside.
          side: THREE.FrontSide, depthWrite: false,
        });
    this._cache.set(key, m);
    return m;
  }

  /** Chrome / polished alloy. */
  chrome(color = 0xd8dde2, roughness = 0.12) {
    return this.plain(color, { roughness, metalness: 1.0, envMapIntensity: this.envIntensity * 1.6 });
  }

  /** Emissive lamp surface (headlights, taillights, yard floodlights). */
  lamp(color, intensity = 1) {
    const key = `l|${color}|${intensity}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: intensity,
      roughness: 0.25, metalness: 0, toneMapped: true,
    });
    this._cache.set(key, m);
    return m;
  }

  /** Alpha-cut foliage / mesh card. */
  cutout(name, { doubleSide = true, alphaTest = 0.42, color = 0xffffff, roughness = 0.85, repeat = null } = {}) {
    const key = `c|${name}|${doubleSide}|${alphaTest}|${color}|${repeat}`;
    if (this._cache.has(key)) return this._cache.get(key);
    let map = this.tex.get(name).map;
    if (repeat) {
      map = map.clone(); map.needsUpdate = true;
      map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(repeat[0], repeat[1]);
    }
    const m = new THREE.MeshStandardMaterial({
      map, color, transparent: false, alphaTest, roughness, metalness: 0,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      envMapIntensity: this.envIntensity * 0.8,
    });
    this._cache.set(key, m);
    return m;
  }

  setEnvIntensity(v) {
    this.envIntensity = v;
    for (const m of this._cache.values()) if ('envMapIntensity' in m) m.envMapIntensity = v;
  }
}
