import * as THREE from 'three';

// The mirrors show what is behind you (V74): from a seat in the car, the rear-view mirror on the windscreen and the
// two door mirrors each show the world as their glass reflects it to your eye. Each is the view from your eye
// mirrored in the glass's plane, through the glass's own rectangle (an off-axis frustum with the glass as its screen:
// Kooima, "Generalized Perspective Projection", 2008), rendered into a small texture the glass then shows turned left
// for right. The near plane is the glass, so nothing in front of it (its housing, the windscreen) gets in.
//  * the far relief and the sky first (the far pass's own camera: post.js), then the scene over them, as the frame is;
//  * the rear-view mirror ~80 % (a day mirror), the door mirrors ~50 % (ECE R46 asks >= 40 %); the passenger's door
//    mirror is convex (R46: obligatory there), so it shows more: as the view from an eye nearer its glass;
//  * one mirror every other frame (main.js), the rear-view mirror every other time: at 60 FPS it shows 15 images a
//    second, each door mirror 7.5; to 200 m behind (a narrow frustum, but through the village ~390 draws); Medium and
//    up, and the setting can turn them back to the sky's reflection.
const _E = new THREE.Vector3(), _P = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export class Mirrors {
  constructor(renderer, scene, farScene, { size = 512 } = {}) {
    this.renderer = renderer; this.scene = scene; this.farScene = farScene;
    this.cam = new THREE.PerspectiveCamera(); this.farCam = new THREE.PerspectiveCamera();
    for (const c of [this.cam, this.farCam]) { c.matrixAutoUpdate = false; c.matrixWorldAutoUpdate = false; }
    this.size = size; this.car = null; this.list = []; this.turn = 0;
  }
  // a glass: its image plane over it (1 mm toward the eye) and its own target
  make(g, parent, k, convex = 1) {
    const aspect = g.w / g.h, W = this.size, H = Math.max(32, Math.round(W / Math.min(aspect, 4.5)));
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true });
    rt.texture.generateMipmaps = false;
    const geo = new THREE.PlaneGeometry(g.w, g.h), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));             // (a mirror: left for right)
    const mat = new THREE.MeshBasicMaterial({ map: rt.texture, color: new THREE.Color(k, k, k), fog: false });
    mat.userData.noWet = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(g.m).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.001));
    mesh.userData.noAO = true; mesh.userData.ueSkip = 'mirror'; mesh.frustumCulled = false;
    parent.add(mesh); mesh.updateMatrixWorld();
    return { g, mesh, rt, convex, ready: false };
  }
  // the car you sit in (null: none); on: the setting allows it
  attach(car, on) {
    const v = on ? car : null;
    if (v === this.car) return;
    for (const m of this.list) { m.mesh.parent?.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose(); m.rt.dispose(); }
    this.list = []; this.car = v;
    if (!v) return;
    const c = v.car;
    if (c.cabin?.mirror) this.list.push(this.make(c.cabin.mirror, c.cabin.group, 0.8));
    for (const g of c.mirrors ?? []) this.list.push(this.make(g, c.bodyPivot, 0.5, g.side > 0 ? 0.62 : 1));
    for (const m of this.list) m.mesh.visible = false;             // (until its first image)
  }
  // render one mirror (in turn) from the eye at camera
  update(camera, far) {
    if (!this.list.length) return;
    const t = this.turn++, n = this.list.length, hasRear = !!this.car.car.cabin?.mirror;
    const m = this.list[hasRear && n > 1 ? (t & 1 ? 1 + ((t >> 1) % (n - 1)) : 0) : t % n], r = this.renderer;
    const mesh = m.mesh;
    mesh.updateMatrixWorld();
    camera.updateMatrixWorld();
    // the glass's corners and its normal toward the eye; the eye mirrored behind it
    const M = mesh.matrixWorld, hw = m.g.w / 2, hh = m.g.h / 2;
    M.decompose(_P, _q, _s);
    _n.set(0, 0, 1).applyQuaternion(_q);
    _E.setFromMatrixPosition(camera.matrixWorld);
    const de = _E.clone().sub(_P).dot(_n);
    if (de <= 0.01) { mesh.visible = false; return; }                 // (the eye behind the glass: nothing in it)
    _E.addScaledVector(_n, -(1 + m.convex) * de);                        // (a convex glass: as from an eye nearer it)
    // seen from the mirrored eye: its lower right is the screen's lower left (Kooima: pa, pb, pc)
    _a.set(hw, -hh, 0).applyMatrix4(M); _b.set(-hw, -hh, 0).applyMatrix4(M); _c.set(hw, hh, 0).applyMatrix4(M);
    _r.subVectors(_b, _a).normalize(); _u.subVectors(_c, _a).normalize();
    const vn = new THREE.Vector3().crossVectors(_r, _u).normalize();
    const va = _a.clone().sub(_E), vb = _b.clone().sub(_E), vc = _c.clone().sub(_E);
    const d = -va.dot(vn);
    if (d <= 0.005) return;
    const frustum = (c, n, f) => {
      const k = n / d;
      c.projectionMatrix.makePerspective(_r.dot(va) * k, _r.dot(vb) * k, _u.dot(vc) * k, _u.dot(va) * k, n, f);
      c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
      c.matrixWorld.makeBasis(_r, _u, vn).setPosition(_E);
      c.matrixWorldInverse.copy(c.matrixWorld).invert();
    };
    frustum(this.cam, d + 0.004, far);
    frustum(this.farCam, 30, 430000);
    const rt0 = r.getRenderTarget(), ac = r.autoClear, sm = r.shadowMap.autoUpdate;
    r.autoClear = false; r.shadowMap.autoUpdate = false;
    for (const o of this.list) o.mesh.visible = false;               // (no glass shows itself)
    r.setRenderTarget(m.rt);
    r.clear();
    if (this.farScene) { r.render(this.farScene, this.farCam); r.clearDepth(); }
    r.render(this.scene, this.cam);
    r.setRenderTarget(rt0);
    r.autoClear = ac; r.shadowMap.autoUpdate = sm;
    m.ready = true;
    for (const o of this.list) o.mesh.visible = o.ready;
  }
}
