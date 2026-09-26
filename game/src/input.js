// Keyboard + mouse (pointer lock, with drag-to-look fallback) + touch (virtual stick & buttons).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();         // edge-triggered this frame
    this.mouse = { dx: 0, dy: 0, locked: false, dragging: false };
    this.stick = { x: 0, y: 0, active: false, id: null, ox: 0, oy: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.touchButtons = new Set();
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
    });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.mouse.locked || this.mouse.dragging) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (!this.mouse.locked) {
        this.requestLock();
        this.mouse.dragging = true;
      }
    });
    addEventListener('mouseup', () => { this.mouse.dragging = false; });

    // touch
    const stickEl = document.getElementById('stick');
    const knob = document.getElementById('knob');
    canvas.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && this.stick.id === null) {
          this.stick.id = t.identifier; this.stick.ox = t.clientX; this.stick.oy = t.clientY; this.stick.active = true;
          if (stickEl) { stickEl.style.left = (t.clientX - 60) + 'px'; stickEl.style.top = (t.clientY - 60) + 'px'; stickEl.classList.add('on'); }
        } else if (this.look.id === null) {
          this.look.id = t.identifier; this.look.x = t.clientX; this.look.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          const dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
          const l = Math.hypot(dx, dy), m = Math.min(l, 55) / (l || 1);
          this.stick.x = dx * m / 55; this.stick.y = dy * m / 55;
          if (knob) knob.style.transform = `translate(${dx * m}px, ${dy * m}px)`;
        } else if (t.identifier === this.look.id) {
          this.mouse.dx += (t.clientX - this.look.x) * 1.6;
          this.mouse.dy += (t.clientY - this.look.y) * 1.6;
          this.look.x = t.clientX; this.look.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          this.stick.id = null; this.stick.x = this.stick.y = 0; this.stick.active = false;
          if (knob) knob.style.transform = '';
          if (stickEl) stickEl.classList.remove('on');
        } else if (t.identifier === this.look.id) this.look.id = null;
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
    document.querySelectorAll('[data-key]').forEach((b) => {
      const code = b.dataset.key;
      const down = (e) => { e.preventDefault(); if (!this.keys.has(code)) this.pressed.add(code); this.keys.add(code); b.classList.add('on'); };
      const up = (e) => { e.preventDefault(); this.keys.delete(code); b.classList.remove('on'); };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('mousedown', down);
      b.addEventListener('mouseup', up);
    });
  }
  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (_) { /* drag fallback */ } });
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
    if (this.stick.active) { x += this.stick.x; y += this.stick.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  consumeMouse() { const d = { x: this.mouse.dx, y: this.mouse.dy }; this.mouse.dx = this.mouse.dy = 0; return d; }
  endFrame() { this.pressed.clear(); }
}
