// Bunyan boot: settings, renderer, menus with a live 3D panorama, game sessions, PWA plumbing.
import { Renderer } from './renderer.js';
import { World } from './world.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { UI, VERSION } from './ui.js';
import { Sound } from './audio.js';
import { Store, local } from './storage.js';
import { loadSettings, saveSettings, isTouch } from './settings.js';
import { seedFromString } from './noise.js';
import { Generator, BIOME_NAMES } from './worldgen.js';

const $ = s => document.querySelector(s);
const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

class App {
  constructor() {
    this.local = local;
    this.settings = loadSettings();
    this.paused = false;
    this.game = null;
    this.menuWorld = null;
    this.fps = 60; this.frames = 0; this.fpsT = 0;
    this.last = performance.now(); this.acc = 0;
    this.installEvent = null;
  }

  async boot() {
    this.applyTheme();
    try { this.renderer = new Renderer($('#view')); }
    catch (e) { this.fatal('الجهاز ده مش بيدعم الرسومات ثلاثية الأبعاد (WebGL).'); return; }
    this.sound = new Sound();
    this.store = new Store();
    try { await this.store.open(); } catch (e) { this.storeError = true; }
    this.input = new Input({ canvas: $('#view'), layer: $('#touchLayer'), settings: this.settings, onAction: a => this.onInputAction(a) });
    this.ui = new UI(this);
    this.applySettings(true);
    addEventListener('resize', () => { this.renderer.resize(); this.input.layoutButtons(); });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    addEventListener('pagehide', () => { if (this.game) this.game.save(); });
    const unlock = () => this.sound.unlock();
    addEventListener('pointerdown', unlock, { capture: true }); addEventListener('keydown', unlock, { capture: true });
    $('#pauseBtn').addEventListener('click', () => this.ui.pause());
    $('#rotateHint').addEventListener('click', e => e.currentTarget.classList.remove('want'));
    this.setupPWA();
    requestAnimationFrame(t => this.loop(t));
    await this.startPanorama();
    setTimeout(() => {
      $('#splash').classList.add('hide');
      if (this.storeError) this.ui.alert({ title: 'التخزين مقفول', message: 'المتصفح مانع الحفظ (ممكن تكون فاتح في وضع التصفح الخفي). تقدر تلعب، بس العوالم مش هتتحفظ.' });
      if (local.get('onboarded', null) !== VERSION && !local.get('onboarded', null)) this.ui.whatsNew(true);
      else this.ui.home();
    }, 650);
  }
  fatal(msg) {
    document.body.innerHTML = `<div style="position:fixed;inset:0;display:grid;place-items:center;background:#111;color:#fff;font-family:system-ui;text-align:center;padding:24px"><div><h2>بُنيان</h2><p>${msg}</p></div></div>`;
  }

  // ---------- settings ----------
  saveSettings() { saveSettings(this.settings); }
  applyTheme() {
    const t = this.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    document.body.classList.toggle('reduce-motion', !!this.settings.reducedMotion);
  }
  applySettings(first) {
    const s = this.settings, r = this.renderer;
    this.applyTheme();
    r.setScale(s.resScale);
    r.setAtlasStyle(s.textureStyle);
    r.setBrightness(s.brightness);
    r.cloudsOn = s.clouds;
    if (this.game) { this.game.world.renderDistance = s.renderDistance; r.setView(s.renderDistance); }
    const key = [s.smoothLight, s.fancyLeaves, s.textureStyle].join();
    if (!first && key !== this.meshKey) { if (this.game) this.game.world.remeshAll(); if (this.menuWorld) this.menuWorld.remeshAll(); }
    this.meshKey = key;
    this.sound.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume, s.music);
    this.input.s = s;
    this.input.layoutButtons();
    if (this.game) this.ui.renderHotbar();
  }

  // ---------- menu panorama ----------
  async startPanorama() {
    if (this.menuWorld || this.game) return;
    const w = new World({ renderer: this.renderer, meta: { id: 'menu', seed: 20250, type: 'default' }, store: null, settings: this.settings });
    w.renderDistance = Math.min(4, Math.max(3, this.settings.renderDistance));
    this.menuWorld = w;
    this.renderer.setView(w.renderDistance);
    await w.init();
    if (this.menuWorld !== w) return;
    const [x, y, z] = w.spawnGuess;
    this.pano = { x, y: Math.max(y + 16, 76), z, yaw: 0.6 };
  }
  stopPanorama() { if (this.menuWorld) { this.menuWorld.destroy(); this.menuWorld = null; } }
  menuMode(on) {
    if (on && !this.game) { $('#hud').classList.remove('show'); this.input.enabled = false; this.input.setTouchVisible(false); this.startPanorama(); }
  }

  // ---------- sessions ----------
  async newWorld(o) {
    const seed = o.seed && o.seed.trim() ? seedFromString(o.seed) : (Math.random() * 2 ** 31) | 0;
    const meta = { id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: o.name.trim(), mode: o.mode, difficulty: o.difficulty, type: o.type, seed, seedText: o.seed || String(seed), keepInventory: o.keepInventory, daylightCycle: o.daylightCycle, bonusChest: o.bonusChest, created: Date.now(), lastPlayed: Date.now(), time: 1000, day: 1, format: 1 };
    if (this.store.db) await this.store.putWorld(meta);
    return meta;
  }
  async play(meta) {
    if (this.starting) return;
    this.starting = true;
    if (isTouch && !standalone && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ } }).catch(() => {});
    }
    this.ui.showLoading();
    this.stopPanorama();
    const store = this.store.db ? this.store : null;
    const game = new Game({ renderer: this.renderer, input: this.input, ui: this.ui, sound: this.sound, settings: this.settings, store });
    this.game = game;
    try {
      await game.start(meta, p => this.ui.loading(p));
      game.gen = new Generator(meta.seed, meta.type);
    } catch (e) {
      console.error(e);
      this.game = null; this.starting = false;
      await this.ui.alert({ title: 'العالم مفتحش', message: 'حصلت مشكلة وإحنا بنحمّل العالم. جرّب تاني.' });
      this.ui.worlds();
      return;
    }
    this.starting = false;
    this.ui.loading(1);
    this.ui.show(null);
    $('#hud').classList.add('show');
    this.input.enabled = true;
    this.input.setTouchVisible(true);
    this.input.setFlying(game.player.flying);
    this.paused = false;
    this.renderer.handVisible = true;
    if (!isTouch) this.showClickToPlay();
    if (game.mode === 'survival' && !local.get('tutorial', false)) {
      local.set('tutorial', true);
      setTimeout(() => this.ui.toast(isTouch ? (this.settings.controlScheme === 'touch' ? 'دوس مطوّل على شجرة عشان تكسرها 🌳' : 'وجّه النقطة على شجرة ودوس مطوّل 🌳') : 'اضغط مطوّل بالماوس على شجرة عشان تكسرها 🌳'), 1200);
    }
  }
  async quit() {
    const g = this.game;
    if (!g) return;
    this.input.enabled = false; this.input.exitLock();
    this.ui.closeAllSheets();
    this.hideClickToPlay();
    $('#hud').classList.remove('show');
    this.input.setTouchVisible(false);
    // a fresh thumbnail for the worlds list
    try { g.meta.thumb = this.thumbnail(); } catch (e) { /* ignore */ }
    await g.stop();
    this.game = null;
    this.paused = false;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    this.ui.worlds();
  }
  respawn() { if (this.game) { this.game.respawn(); this.ui.renderHotbar(); if (!isTouch) this.showClickToPlay(); } }
  setPaused(p) {
    this.paused = p;
    if (p) this.input.exitLock();
    else if (this.game && !isTouch && !this.ui.blocking) this.showClickToPlay();
  }
  resumeFromSettings() { this.paused = false; $('#hud').classList.add('show'); if (!isTouch) this.showClickToPlay(); }
  onSheetsChanged() {
    if (!this.game) return;
    if (this.ui.blocking) this.input.exitLock();
    else if (!isTouch && !this.paused && !this.input.locked) this.showClickToPlay();
  }
  onInputAction(a) { if (a === 'unlocked' && this.game && !this.ui.blocking && !this.paused && !this.editing) this.ui.pause(); }
  showClickToPlay() {
    if (!this.input.lockSupported || this.input.locked) return;
    if (this.clickEl) return;
    const el = document.createElement('div');
    el.className = 'click-play';
    el.innerHTML = '<div><b>اضغط للعب</b>الماوس للنظر · W A S D للحركة · E للحقيبة · Esc للإيقاف</div>';
    el.addEventListener('click', () => { this.input.requestLock(); this.hideClickToPlay(); });
    document.body.append(el);
    this.clickEl = el;
    const off = () => { if (this.input.locked) { this.hideClickToPlay(); document.removeEventListener('pointerlockchange', off); } };
    document.addEventListener('pointerlockchange', off);
  }
  hideClickToPlay() { if (this.clickEl) { this.clickEl.remove(); this.clickEl = null; } }

  editLayout() {
    this.editing = true;
    this.editReturn = this.game ? 'game' : 'settings';
    this.ui.show(null);
    $('#hud').classList.add('show');
    this.input.setTouchVisible(true);
    this.paused = true;
    this.ui.layoutEditor();
  }
  endEditLayout() {
    this.editing = false;
    if (this.editReturn === 'game') { this.paused = false; this.input.setTouchVisible(true); }
    else { $('#hud').classList.remove('show'); this.input.setTouchVisible(false); this.ui.settingsPage('controls'); }
    this.ui.toast('اتحفظ مكان الأزرار');
  }

  thumbnail() {
    const r = this.renderer;
    r.render(0, false);
    const src = r.canvas;
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 108;
    const g = cv.getContext('2d');
    const ar = src.width / src.height, tw = ar > 16 / 9 ? src.height * 16 / 9 : src.width, th = ar > 16 / 9 ? src.height : src.width * 9 / 16;
    g.drawImage(src, (src.width - tw) / 2, (src.height - th) / 2, tw, th, 0, 0, 192, 108);
    return cv.toDataURL('image/jpeg', 0.7);
  }
  async screenshot() {
    const r = this.renderer;
    const handWas = r.handVisible; r.handVisible = false;
    r.render(0, false);
    r.handVisible = handWas;
    const blob = await new Promise(res => r.canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const name = `bunyan-${Date.now()}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    this.ui.toast('اتحفظت اللقطة');
  }

  onVisibility() {
    if (document.hidden) {
      if (this.game) { this.game.save(); if (!this.paused && !this.editing) this.ui.pause(); }
      this.sound.suspend();
    } else this.sound.resume();
  }

  // ---------- PWA ----------
  setupPWA() {
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.installEvent = e; if (this.ui.current === 'home') this.ui.home(); });
    addEventListener('appinstalled', () => { this.installEvent = null; this.ui.toast('بُنيان اتثبّت على جهازك 🎉'); });
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      const watch = w => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) this.showUpdate(reg); });
      if (reg.waiting && navigator.serviceWorker.controller) this.showUpdate(reg);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
    let reloading = false;
    // reload only for an update the player asked for, never on the very first install
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !this.updating) return; reloading = true; if (this.game) this.game.save().then(() => location.reload()); else location.reload(); });
  }
  showUpdate(reg) {
    $('#update').classList.add('show');
    $('#updateBtn').onclick = () => { $('#update').classList.remove('show'); this.updating = true; if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); };
  }
  canInstall() { return !!this.installEvent || (isIOS && !standalone); }
  async install() {
    if (this.installEvent) { this.installEvent.prompt(); const r = await this.installEvent.userChoice.catch(() => null); if (r && r.outcome === 'accepted') this.installEvent = null; this.ui.home(); }
    else this.ui.installSheetIOS();
  }

  // ---------- loop ----------
  loop(t) {
    requestAnimationFrame(tt => this.loop(tt));
    const s = this.settings;
    const cap = this.game ? s.fpsCap : (isTouch ? 30 : 60);
    const elapsed = t - this.last;
    if (cap && elapsed < 1000 / cap - 2) return;
    this.last = t;
    const dt = Math.min(0.1, elapsed / 1000);
    this.frames++; this.fpsT += elapsed;
    if (this.fpsT > 500) { this.fps = this.frames * 1000 / this.fpsT; this.frames = 0; this.fpsT = 0; }
    const r = this.renderer;
    if (this.game && this.game.running) {
      const g = this.game;
      if (!this.paused) {
        const it = this.input.frame();
        g.update(dt, it);
        this.bioT = (this.bioT || 0) + dt;
        if (this.bioT > 1 && g.gen && s.showCoords) { this.bioT = 0; g.biomeName = BIOME_NAMES[g.gen.column(Math.floor(g.player.x), Math.floor(g.player.z)).biome]; }
      } else { this.input.frame(); g.updateCamera(0, {}); }
      r.render(this.paused ? 0 : dt, Math.hypot(g.player.vx, g.player.vz) > 0.5 && g.player.onGround);
      this.sound.tickMusic(t / 1000);
    } else if (this.menuWorld && this.pano) {
      const p = this.pano, cam = r.camera;
      p.yaw += dt * 0.035;
      cam.position.set(p.x, p.y, p.z);
      cam.rotation.set(-0.22, p.yaw, 0);
      cam.updateMatrixWorld();
      if (Math.abs(cam.fov - 75) > 0.1) { cam.fov = 75; cam.updateProjectionMatrix(); }
      this.menuWorld.update(dt, p.x, p.z);
      r.underwater = 0;
      r.setTime(2600);
      r.handVisible = false;
      r.render(dt, false);
      r.handVisible = true;
      this.sound.tickMusic(t / 1000);
    } else {
      r.r.clear();
    }
  }
}

const app = new App();
window.bunyan = app;
app.boot();
