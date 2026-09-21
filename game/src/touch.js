/**
 * Comenzi tactile. Pe telefon nu exista nici tastatura, nici pointer lock,
 * deci jocul ar fi fost imposibil de jucat: jumatatea stanga e un joystick
 * analogic (apare unde pui degetul), jumatatea dreapta roteste privirea, iar
 * butoanele din dreapta-jos fac saritura, ghemuitul si schimbarea camerei.
 */
import { clamp } from './noise.js';

export function isTouchDevice() {
  return (typeof window !== 'undefined')
    && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);
}

export function isPhone() {
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPod|IEMobile|Opera Mini/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  // iPadOS se da drept Mac, dar are ecran tactil
  if (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1) return true;
  return false;
}

const STICK_R = 62;          // raza maxima a joystick-ului, in px CSS
const DEAD = 0.14;

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.lookSens = 0.0038;
    this.moveId = null;
    this.lookId = null;
    this.origin = { x: 0, y: 0 };
    this.last = { x: 0, y: 0 };
    this.ui = document.getElementById('touchui');
    this.stick = document.getElementById('stick');
    this.nub = document.getElementById('stickNub');
    this.crouchOn = false;
    this.enabled = false;
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('touch');
    if (this.ui) this.ui.style.display = 'block';

    const c = this.game.canvas;
    const opts = { passive: false };
    c.addEventListener('touchstart', (e) => this.onStart(e), opts);
    c.addEventListener('touchmove', (e) => this.onMove(e), opts);
    c.addEventListener('touchend', (e) => this.onEnd(e), opts);
    c.addEventListener('touchcancel', (e) => this.onEnd(e), opts);

    this.bindButton('btnJump', () => { this.input.jump = true; },
      () => { this.input.jump = false; });
    this.bindButton('btnCrouch', () => {
      this.crouchOn = !this.crouchOn;
      this.input.crouch = this.crouchOn;
      document.getElementById('btnCrouch').classList.toggle('on', this.crouchOn);
    });
    this.bindButton('btnCam', () => this.game.cycleCamera());
    this.bindButton('btnMenu', () => this.game.openMenu());
  }

  bindButton(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('press');
      onDown();
    }, { passive: false });
    const up = (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('press');
      if (onUp) onUp();
    };
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
  }

  onStart(e) {
    e.preventDefault();
    const half = window.innerWidth * 0.46;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.clientX < half && this.moveId === null) {
        this.moveId = t.identifier;
        this.origin.x = t.clientX; this.origin.y = t.clientY;
        this.showStick(t.clientX, t.clientY, 0, 0);
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.last.x = t.clientX; this.last.y = t.clientY;
      }
    }
  }

  onMove(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.moveId) {
        let dx = t.clientX - this.origin.x;
        let dy = t.clientY - this.origin.y;
        const len = Math.hypot(dx, dy);
        if (len > STICK_R) {
          // degetul "trage" originea dupa el, ca sa nu se blocheze la margine
          this.origin.x += dx * (1 - STICK_R / len);
          this.origin.y += dy * (1 - STICK_R / len);
          dx *= STICK_R / len; dy *= STICK_R / len;
        }
        const nx = dx / STICK_R, ny = dy / STICK_R;
        const mag = Math.hypot(nx, ny);
        this.input.axisX = mag < DEAD ? 0 : nx;
        this.input.axisY = mag < DEAD ? 0 : ny;
        // la deflexie maxima se trece automat in alergare
        this.input.sprint = mag > 0.93;
        this.showStick(this.origin.x, this.origin.y, dx, dy);
      } else if (t.identifier === this.lookId) {
        const p = this.game.player;
        p.yaw -= (t.clientX - this.last.x) * this.lookSens;
        p.pitch = clamp(p.pitch - (t.clientY - this.last.y) * this.lookSens, -1.25, 1.05);
        this.last.x = t.clientX; this.last.y = t.clientY;
      }
    }
  }

  onEnd(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.moveId) {
        this.moveId = null;
        this.input.axisX = 0; this.input.axisY = 0; this.input.sprint = false;
        this.hideStick();
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  }

  showStick(ox, oy, dx, dy) {
    if (!this.stick) return;
    this.stick.style.display = 'block';
    this.stick.style.left = ox + 'px';
    this.stick.style.top = oy + 'px';
    this.nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  hideStick() {
    if (this.stick) this.stick.style.display = 'none';
  }
}
