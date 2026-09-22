/* Pause menu: settings, teleports, map info. Wires directly to the settings
   store and calls back into the game for actions. */
import { settings, QUALITY_PRESETS } from '../core/Settings.js';
import * as PLAN from '../world/SitePlan.js';

export class Menu {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('menu');
    this.open = false;
    this._wireTabs();
    this._wireActions();
    this._wireSettings();
    this._fillTeleports();
    this._fillMapInfo();
    this.refresh();
  }

  _wireTabs() {
    for (const tab of this.el.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => {
        this.el.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === tab));
        this.el.querySelectorAll('.tabbody').forEach(b =>
          b.classList.toggle('on', b.dataset.body === tab.dataset.tab));
      });
    }
  }

  _wireActions() {
    const g = this.game;
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    on('m-resume', () => this.hide());
    on('m-respawn', () => { g.respawn(); this.hide(); });
    on('m-exitcar', () => { g.exitVehicle(); this.hide(); });
    on('m-reset', () => { g.resetVehicles(); this.hide(); });
    on('m-fs', () => g.toggleFullscreen());
  }

  _wireSettings() {
    const g = this.game;
    const bind = (id, key, fmt, after) => {
      const el = document.getElementById(id);
      const out = document.getElementById('v-' + id.slice(2));
      const apply = (v) => { if (out) out.textContent = fmt ? fmt(v) : v; };
      if (el.type === 'checkbox') {
        el.checked = !!settings.get(key);
        el.addEventListener('change', () => { settings.set(key, el.checked); after?.(el.checked); });
      } else {
        el.value = settings.get(key);
        apply(el.value);
        el.addEventListener('input', () => {
          const v = +el.value;
          settings.set(key, v); apply(v); after?.(v);
        });
      }
    };
    bind('s-res', 'resScale', v => v + '%', () => g.engine.applyQuality());
    bind('s-fov', 'fov', v => v + '°', () => g.engine.applyQuality());
    bind('s-sd', 'shadowDist', v => v + ' m', v => g.atmo.setShadowDistance(v));
    bind('s-post', 'post', null, () => g.engine.applyQuality());
    bind('s-ao', 'ao', null, () => g.engine.applyQuality());
    bind('s-shadows', 'shadows', null, () => g.engine.applyQuality());
    bind('s-adaptive', 'adaptive');
    bind('s-grain', 'grain', null, () => g.engine.applyQuality());
    bind('s-sens', 'sens', v => v + '%');
    bind('s-dz', 'deadzone', v => v + '%');
    bind('s-inv', 'invertY');
    bind('s-gyro', 'gyro', null, v => { if (v) g.requestGyro(); });
    bind('s-tilt', 'tiltSteer');
    bind('s-haptic', 'haptics');
    bind('s-bob', 'headbob');
    bind('s-vol', 'volume', v => v + '%');
    bind('s-time', 'timeOfDay', v => {
      const h = Math.floor(v / 60), m = v % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }, v => g.atmo.setTime(v));
    bind('s-timeflow', 'timeFlow');
    bind('s-wind', 'wind', v => v + '%', v => { g.atmo.windStrength = v / 100; });
    bind('s-traffic', 'npcs');

    for (const c of document.querySelectorAll('#m-quality .chip')) {
      c.addEventListener('click', () => {
        settings.set('quality', c.dataset.q);
        g.engine.applyQuality();
        g.atmo.setShadowDistance(g.engine.preset.shadowDist);
        g.atmo.setShadowMapSize(g.engine.preset.shadowSize);
        this.refresh();
        g.hud.toast('Calitate: ' + c.dataset.q.toUpperCase());
      });
    }
    for (const c of document.querySelectorAll('#m-weather .chip')) {
      c.addEventListener('click', () => {
        settings.set('weather', c.dataset.w);
        g.atmo.setWeather(c.dataset.w);
        this.refresh();
      });
    }
  }

  _fillTeleports() {
    const wrap = document.getElementById('m-teleports');
    wrap.innerHTML = '';
    for (const t of PLAN.TELEPORTS) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = t.name;
      b.addEventListener('click', () => { this.game.teleport(t); this.hide(); });
      wrap.appendChild(b);
    }
    for (const p of PLAN.PHOTO_SPOTS) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = '📷 ' + p.name.split('—')[0].trim();
      b.addEventListener('click', () => { this.game.gotoPhotoSpot(p.id - 1); this.hide(); });
      wrap.appendChild(b);
    }
  }

  _fillMapInfo() {
    const el = document.getElementById('mapinfo');
    const rows = PLAN.LANDMARKS.map(l =>
      `<tr><td>${l.name}</td><td>x ${l.x}, z ${l.z}</td></tr>`).join('');
    el.innerHTML = `
      <h3>Harta — reconstrucție 1:1</h3>
      <p>Curtea este reconstruită din cele șase fotografii de referință. Axele:
      <b>+X est, +Z sud</b>, originea în mijlocul curții. Toate dimensiunile sunt
      în metri, ancorate în obiecte cu dimensiuni cunoscute (mașini, plăcuțe de
      înmatriculare, butoaie de 200 l, panouri sandwich de 1 m).</p>
      <table>${rows}</table>
      <p>Suprafața construită: hala service 15,5 × 13 m (3 boxe cu uși de 3,2 × 3,9 m,
      la pas de 4,95 m), garajul 12 × 12 m cu streașină pe console și acoperiș
      într-o apă, biroul-container 6,0 × 2,45 m. Curtea din fața halei are circa
      40 m adâncime. Livada are ${PLAN.TREES.filter(t => t.kind === 'orchard').length} pomi pe rânduri de 4,2 m.</p>
      <p>Detalii complete despre cum a fost dedusă harta: <code>docs/MAP-SURVEY.md</code>.</p>`;
  }

  refresh() {
    const q = settings.get('quality');
    for (const c of document.querySelectorAll('#m-quality .chip')) c.classList.toggle('on', c.dataset.q === q);
    const w = settings.get('weather');
    for (const c of document.querySelectorAll('#m-weather .chip')) c.classList.toggle('on', c.dataset.w === w);
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    this.game.input.exitLock();
  }
  hide() {
    this.open = false;
    this.el.hidden = true;
    this.game.input.requestLock();
  }
  toggle() { this.open ? this.hide() : this.show(); }
}
