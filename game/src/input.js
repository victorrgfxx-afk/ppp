// Keyboard + mouse (pointer lock, with drag-to-look fallback). (V123: no touch screen - the phone version is given up.)
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();         // edge-triggered this frame
    this.mouse = { dx: 0, dy: 0, locked: false, dragging: false };
    this.sensitivity = 0.0022;
    this.enabled = false;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = document.pointerLockElement === canvas;
      if (!this.mouse.locked) { this.keys.delete('Mouse0'); this.keys.delete('Mouse2'); }
    });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.mouse.locked || this.mouse.dragging) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    // (the buttons, while the pointer is locked, as keys: Mouse0 the left, Mouse2 the right - the pistol: weapon.js)
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (this.mouse.locked) { const c = 'Mouse' + e.button; if (!this.keys.has(c)) this.pressed.add(c); this.keys.add(c); return; }
      if (e.button !== 0) return;
      if (!this.mouse.locked) {
        this.requestLock();
        this.mouse.dragging = true;
      }
    });
    addEventListener('mouseup', (e) => { this.mouse.dragging = false; this.keys.delete('Mouse' + e.button); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
      // (the second try's promise caught too: without a click to allow it the browser refuses, an unhandled rejection - V121)
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock()?.catch?.(() => {}); } catch (_) { /* drag fallback */ } });
    } catch (_) { /* iframe sandbox: drag-to-look fallback */ }
  }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  axis() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  consumeMouse() { const d = { x: this.mouse.dx, y: this.mouse.dy }; this.mouse.dx = this.mouse.dy = 0; return d; }
  endFrame() { this.pressed.clear(); }
}
