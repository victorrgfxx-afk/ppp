/* Unified input: keyboard + mouse (pointer lock), multi-touch joystick + look
   drag + on-screen buttons, and optional device orientation.
   Everything lands in one flat state object the game reads each frame. */
import { settings, Device } from './Settings.js';

export class Input {
  constructor() {
    this.state = {
      move: { x: 0, y: 0 },      // x = strafe, y = forward
      look: { x: 0, y: 0 },      // consumed each frame
      sprint: false, jump: false, crouch: false,
      use: false, throttle: 0, brake: 0, handbrake: false,
      horn: false, lights: false,
      armUp: false, armDown: false, boomUp: false, boomDown: false,
    };
    this.pressed = new Set();     // edge-triggered actions for this frame
    this.keys = new Set();
    this.pointerLocked = false;
    this.touchMode = false;
    this._touchLook = new Map();
    this._stickId = null;
    this._stickOrigin = { x: 0, y: 0 };
    this._btnHold = new Set();
    this._gyroBase = null;

    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
    this._bindGyro();
  }

  /* ------------------------------ keyboard ------------------------------- */
  _bindKeyboard() {
    const down = (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (['Space', 'Tab', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      const map = {
        KeyE: 'use', Tab: 'menu', Escape: 'menu', KeyP: 'photo', KeyF: 'lights',
        KeyH: 'horn', KeyR: 'reset', KeyV: 'camera', KeyC: 'crouch', KeyG: 'flip',
        Digit1: 'photo1', Digit2: 'photo2', Digit3: 'photo3', Digit4: 'photo4',
      };
      if (map[k]) this.pressed.add(map[k]);
    };
    const up = (e) => this.keys.delete(e.code);
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', () => this.keys.clear());
  }

  /* -------------------------------- mouse -------------------------------- */
  _bindMouse() {
    const canvas = document.getElementById('view');
    this._canvas = canvas;
    addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      const s = settings.get('sens') / 100;
      this.state.look.x += e.movementX * 0.0022 * s;
      this.state.look.y += e.movementY * 0.0022 * s * (settings.get('invertY') ? -1 : 1);
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) this.pressed.add('unlock');
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.pressed.add('fire');
    });
  }

  requestLock() {
    if (Device.mobile) return;
    this._canvas.requestPointerLock?.();
  }
  exitLock() { document.exitPointerLock?.(); }

  /* -------------------------------- touch -------------------------------- */
  _bindTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    const lookZone = document.getElementById('look-zone');
    if (!stick || !lookZone) return;
    const markTouch = () => {
      if (this.touchMode) return;
      this.touchMode = true;
      document.body.classList.add('touch-ui');
      document.getElementById('touch').hidden = false;
    };

    const stickRadius = () => stick.getBoundingClientRect().width / 2;

    stick.addEventListener('pointerdown', (e) => {
      markTouch();
      try { stick.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      this._stickId = e.pointerId;
      const r = stick.getBoundingClientRect();
      this._stickOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      stick.classList.add('active');
      this._moveStick(e, knob, stickRadius());
      e.preventDefault();
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickId) return;
      this._moveStick(e, knob, stickRadius());
      e.preventDefault();
    });
    const endStick = (e) => {
      if (e.pointerId !== this._stickId) return;
      this._stickId = null;
      this.state.move.x = this.state.move.y = 0;
      knob.style.transform = 'translate(-50%,-50%)';
      stick.classList.remove('active');
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    lookZone.addEventListener('pointerdown', (e) => {
      markTouch();
      if (e.pointerType === 'mouse') return;
      try { lookZone.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      this._touchLook.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 });
    });
    lookZone.addEventListener('pointermove', (e) => {
      const p = this._touchLook.get(e.pointerId);
      if (!p) return;
      const s = settings.get('sens') / 100;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      this.state.look.x += dx * 0.0042 * s;
      this.state.look.y += dy * 0.0042 * s * (settings.get('invertY') ? -1 : 1);
      p.moved += Math.abs(dx) + Math.abs(dy);
      p.x = e.clientX; p.y = e.clientY;
      e.preventDefault();
    });
    const endLook = (e) => {
      const p = this._touchLook.get(e.pointerId);
      if (p && p.moved < 12 && performance.now() - p.t < 260) this.pressed.add('fire');
      this._touchLook.delete(e.pointerId);
    };
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);

    /* on-screen buttons */
    for (const btn of document.querySelectorAll('[data-act]')) {
      const act = btn.dataset.act;
      const on = (e) => {
        markTouch();
        btn.classList.add('on');
        this._btnHold.add(act);
        this.pressed.add(act);
        try { btn.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
        e.preventDefault(); e.stopPropagation();
      };
      const off = (e) => {
        btn.classList.remove('on');
        this._btnHold.delete(act);
        e.preventDefault(); e.stopPropagation();
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    }
    addEventListener('touchstart', markTouch, { once: true, passive: true });
  }

  _moveStick(e, knob, radius) {
    const dz = settings.get('deadzone') / 100;
    let dx = (e.clientX - this._stickOrigin.x) / radius;
    let dy = (e.clientY - this._stickOrigin.y) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    const mag = Math.min(1, len);
    const scaled = mag < dz ? 0 : (mag - dz) / (1 - dz);
    const nx = len > 0 ? dx / Math.max(len, 1) : 0;
    const ny = len > 0 ? dy / Math.max(len, 1) : 0;
    const ux = len > 0 ? dx / (len || 1) : 0, uy = len > 0 ? dy / (len || 1) : 0;
    this.state.move.x = ux * scaled;
    this.state.move.y = -uy * scaled;
    knob.style.transform = `translate(calc(-50% + ${dx * radius * 0.62}px), calc(-50% + ${dy * radius * 0.62}px))`;
  }

  /* -------------------------------- gyro --------------------------------- */
  _bindGyro() {
    addEventListener('deviceorientation', (e) => {
      if (!settings.get('gyro') || e.beta == null) return;
      if (!this._gyroBase) { this._gyroBase = { beta: e.beta, gamma: e.gamma, alpha: e.alpha }; return; }
      const db = e.beta - this._gyroBase.beta;
      const dg = e.gamma - this._gyroBase.gamma;
      this.state.look.x += dg * 0.0016;
      this.state.look.y += db * 0.0016;
      this._gyroBase.beta += db * 0.35;
      this._gyroBase.gamma += dg * 0.35;
      this.tilt = e.gamma || 0;
    }, true);
  }
  static async requestGyroPermission() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      try { return (await D.requestPermission()) === 'granted'; } catch { return false; }
    }
    return true;
  }

  /* ------------------------------ per-frame ------------------------------ */
  /** Fold keyboard + touch into the flat state. Call once per frame. */
  sample() {
    const k = this.keys, h = this._btnHold, s = this.state;
    if (this._stickId === null) {
      let mx = 0, my = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      const l = Math.hypot(mx, my) || 1;
      s.move.x = mx / Math.max(1, l);
      s.move.y = my / Math.max(1, l);
    }
    s.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || h.has('primary');
    s.jump = k.has('Space') || h.has('jump');
    s.crouch = k.has('ControlLeft') || k.has('ControlRight') || h.has('crouch');
    s.use = k.has('KeyE') || h.has('use');
    s.handbrake = k.has('Space') || h.has('handbrake');
    s.horn = k.has('KeyH') || h.has('horn');
    s.armUp = k.has('KeyT') || h.has('armUp');
    s.armDown = k.has('KeyG') || h.has('armDown');
    s.boomUp = k.has('KeyY') || h.has('boomUp');
    s.boomDown = k.has('KeyB') || h.has('boomDown');

    /* driving pedals: analogue on touch, digital on keys */
    if (h.has('throttle')) s.throttle = 1;
    else if (k.has('KeyW') || k.has('ArrowUp')) s.throttle = 1;
    else s.throttle = 0;
    if (h.has('brake')) s.brake = 1;
    else if (k.has('KeyS') || k.has('ArrowDown')) s.brake = 1;
    else s.brake = 0;
    return s;
  }

  /** Read and clear look accumulation. */
  consumeLook() {
    const l = { x: this.state.look.x, y: this.state.look.y };
    this.state.look.x = 0; this.state.look.y = 0;
    return l;
  }
  took(action) {
    if (this.pressed.has(action)) { this.pressed.delete(action); return true; }
    return false;
  }
  endFrame() { this.pressed.clear(); }
}
