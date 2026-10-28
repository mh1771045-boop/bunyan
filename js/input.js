// Keyboard + mouse (pointer lock), touch (dynamic joystick, look pad, movable buttons) and gamepad.
import { isTouch } from './settings.js';

const ICONS = {
  jump: '<path d="M6 15l6-6 6 6"/>',
  sneak: '<path d="M6 9l6 6 6-6"/><path d="M6 4l6 6 6-6" opacity=".45"/>',
  sprint: '<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>',
  flyUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  flyDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  attack: '<path d="M19.5 4.5L9.5 14.5"/><path d="M19.5 4.5h-4M19.5 4.5v4"/><path d="M6.5 11.5l6 6"/><path d="M8 16l-3.5 3.5"/>',
  use: '<rect x="5" y="5" width="14" height="14" rx="2.5"/><path d="M12 9v6M9 12h6"/>',
};
const LABELS = { jump: 'قفز', sneak: 'انحناء', sprint: 'جري', flyUp: 'طيران لأعلى', flyDown: 'طيران لأسفل', attack: 'ضرب', use: 'استخدام', joystick: 'عصا التحكم' };

export class Input {
  constructor({ canvas, layer, settings, onAction }) {
    this.canvas = canvas; this.layer = layer; this.s = settings; this.onAction = onAction || (() => {});
    this.keys = new Set();
    this.reset();
    this.enabled = false;
    this.locked = false;
    this.touches = new Map();
    this.joy = null;
    this.buttons = {};
    this.btnState = { jump: false, sneak: false, sprint: false, flyUp: false, flyDown: false, attack: false, use: false };
    this.toggles = { sneak: false, sprint: false };
    this.lastJump = 0;
    this.gpPrev = {};
    this.editing = false;
    this.bind();
    this.buildTouch();
  }
  reset() {
    this.lookDX = 0; this.lookDY = 0; this.scroll = 0;
    this.edges = { jump: false, use: false, attack: false, inventory: false, pause: false, drop: false, pick: false, flyToggle: false, useRelease: false, hotbar: -1, perspective: false, chat: false };
    this.tap = null;
    this.mouse = { left: false, right: false };
  }
  get lockSupported() { return !isTouch && 'pointerLockElement' in document; }

  bind() {
    addEventListener('keydown', e => {
      if (!this.enabled || e.target.closest && e.target.closest('input,textarea')) return;
      const k = e.code;
      if (!e.repeat) {
        if (k === 'Space') { const now = performance.now(); if (now - this.lastJump < 300) this.edges.flyToggle = true; this.lastJump = now; this.edges.jump = true; }
        if (k === 'KeyE') this.edges.inventory = true;
        if (k === 'KeyQ') this.edges.drop = true;
        if (k === 'KeyF') this.edges.flyToggle = true;
        if (k === 'Escape') this.edges.pause = true;
        if (k === 'F5') this.edges.perspective = true;
        if (/^Digit[1-9]$/.test(k)) this.edges.hotbar = +k.slice(5) - 1;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
      this.keys.add(k);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; this.touches.clear(); this.joy = null; this.updateJoyVisual(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.enabled && this.lockSupported && !this.editing) this.onAction('unlocked');
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked || !this.enabled) return;
      const k = 0.0024 * this.s.sensitivity;
      this.lookDX -= e.movementX * k; this.lookDY -= e.movementY * k * (this.s.invertY ? -1 : 1);
    });
    this.canvas.addEventListener('mousedown', e => {
      if (!this.enabled || isTouch) return;
      if (!this.locked && this.lockSupported) { this.requestLock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.edges.attack = true; }
      if (e.button === 2) { this.mouse.right = true; this.edges.use = true; }
      if (e.button === 1) { this.edges.pick = true; e.preventDefault(); }
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) { if (this.mouse.right) this.edges.useRelease = true; this.mouse.right = false; }
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('wheel', e => { if (this.enabled && this.locked) this.scroll += Math.sign(e.deltaY); }, { passive: true });

    // the touch layer: joystick on the left, look + tap/hold everywhere else
    const L = this.layer;
    L.addEventListener('pointerdown', e => this.pDown(e));
    L.addEventListener('pointermove', e => this.pMove(e));
    L.addEventListener('pointerup', e => this.pUp(e));
    L.addEventListener('pointercancel', e => this.pUp(e, true));
    L.addEventListener('contextmenu', e => e.preventDefault());
  }
  requestLock() {
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  pDown(e) {
    if (!this.enabled || this.editing) return;
    if (e.pointerType === 'mouse' && this.lockSupported) return;
    e.preventDefault();
    try { this.layer.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    const W = innerWidth, H = innerHeight;
    const fixed = this.s.joystickMode === 'fixed';
    const jl = this.s.layout.joystick;
    const inJoyZone = fixed ? Math.hypot(e.clientX - jl.x * W, e.clientY - jl.y * H) < 90 * jl.s * this.s.buttonSize : (e.clientX < W * 0.4 && e.clientY > H * 0.22);
    if (!this.joy && inJoyZone) {
      const cx = fixed ? jl.x * W : e.clientX, cy = fixed ? jl.y * H : e.clientY;
      this.joy = { id: e.pointerId, cx, cy, x: e.clientX, y: e.clientY, t0: performance.now(), lastUp: this.joyLastTap || 0 };
      // double tap forward on the stick starts sprinting
      this.updateJoyVisual();
      return;
    }
    const now = performance.now();
    this.touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now, still: now, moved: false, hold: false, dist: 0 });
  }
  pMove(e) {
    if (!this.enabled) return;
    if (this.joy && e.pointerId === this.joy.id) { this.joy.x = e.clientX; this.joy.y = e.clientY; this.updateJoyVisual(); return; }
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX; t.y = e.clientY;
    t.dist += Math.hypot(dx, dy);
    if (Math.hypot(t.x - t.x0, t.y - t.y0) > 12) t.moved = true;
    if (Math.hypot(dx, dy) > 1.5) t.still = performance.now();
    const k = 0.0058 * this.s.sensitivity;
    this.lookDX -= dx * k; this.lookDY -= dy * k * (this.s.invertY ? -1 : 1);
  }
  pUp(e, cancel) {
    if (this.joy && e.pointerId === this.joy.id) {
      const now = performance.now();
      if (now - this.joy.t0 < 220 && Math.hypot(this.joy.x - this.joy.cx, this.joy.y - this.joy.cy) < 14) this.joyLastTap = now;
      this.joy = null; this.updateJoyVisual(); return;
    }
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    this.touches.delete(e.pointerId);
    if (cancel) return;
    const dur = performance.now() - t.t0;
    if (!t.hold && !t.moved && dur < 300) this.tap = { x: t.x, y: t.y };
    if (t.hold) this.edges.useRelease = true;
  }

  // movable on-screen buttons
  buildTouch() {
    for (const name of Object.keys(ICONS)) {
      const b = document.createElement('button');
      b.className = 'tbtn'; b.dataset.name = name; b.type = 'button';
      b.setAttribute('aria-label', LABELS[name]);
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
      b.addEventListener('pointerdown', e => {
        e.stopPropagation(); e.preventDefault();
        if (this.editing) { this.startDrag(name, e); return; }
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        this.press(name, true);
      });
      const up = e => { e.stopPropagation(); if (!this.editing) this.press(name, false); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
      this.layer.parentElement.appendChild(b);
      this.buttons[name] = b;
    }
    const j = document.createElement('div');
    j.className = 'joy'; j.innerHTML = '<div class="joy-knob"></div>';
    j.addEventListener('pointerdown', e => { if (this.editing) { e.stopPropagation(); this.startDrag('joystick', e); } });
    this.layer.parentElement.appendChild(j);
    this.joyEl = j;
    this.layoutButtons();
  }
  press(name, down) {
    if (name === 'sneak' || name === 'sprint') {
      if (down) { this.toggles[name] = !this.toggles[name]; this.buttons[name].classList.toggle('on', this.toggles[name]); if (this.s.haptics && navigator.vibrate) navigator.vibrate(8); }
      return;
    }
    if (name === 'jump' && down) { const now = performance.now(); if (now - this.lastJump < 300) this.edges.flyToggle = true; this.lastJump = now; this.edges.jump = true; }
    if (name === 'attack' && down) this.edges.attack = true;
    if (name === 'use' && down) this.edges.use = true;
    if (name === 'use' && !down && this.btnState.use) this.edges.useRelease = true;
    this.btnState[name] = down;
    this.buttons[name].classList.toggle('down', down);
  }
  setFlying(f) { this.flying = f; this.layoutButtons(); }
  setTouchVisible(v) { this.touchVisible = v; this.layoutButtons(); }
  layoutButtons() {
    const s = this.s, W = innerWidth, H = innerHeight;
    const show = this.touchVisible && isTouch || this.editing;
    const base = Math.max(54, Math.min(76, Math.min(W, H) * 0.15)) * s.buttonSize;
    for (const [name, b] of Object.entries(this.buttons)) {
      const l = s.layout[name];
      let vis = show;
      if (!this.editing) {
        if ((name === 'flyUp' || name === 'flyDown')) vis = vis && this.flying;
        if ((name === 'attack' || name === 'use')) vis = vis && (s.showActionButtons || s.controlScheme === 'crosshair');
      }
      b.style.display = vis ? '' : 'none';
      const size = base * l.s;
      b.style.width = b.style.height = size + 'px';
      b.style.left = (l.x * W - size / 2) + 'px'; b.style.top = (l.y * H - size / 2) + 'px';
      b.style.opacity = this.editing ? 0.9 : s.buttonOpacity;
      b.classList.toggle('sel', this.editing && this.selectedBtn === name);
    }
    this.joyBase = base * 1.9 * s.layout.joystick.s;
    this.updateJoyVisual();
  }
  updateJoyVisual() {
    const j = this.joyEl; if (!j) return;
    const s = this.s, W = innerWidth, H = innerHeight, size = this.joyBase || 130;
    const show = (this.touchVisible && isTouch) || this.editing;
    const fixed = s.joystickMode === 'fixed' || this.editing;
    let cx, cy, kx = 0, ky = 0;
    if (this.joy) { cx = this.joy.cx; cy = this.joy.cy; const dx = this.joy.x - cx, dy = this.joy.y - cy, d = Math.hypot(dx, dy), m = size * 0.36; const f = d > m ? m / d : 1; kx = dx * f; ky = dy * f; }
    else { cx = s.layout.joystick.x * W; cy = s.layout.joystick.y * H; }
    j.style.display = show ? '' : 'none';
    j.style.width = j.style.height = size + 'px';
    j.style.left = (cx - size / 2) + 'px'; j.style.top = (cy - size / 2) + 'px';
    j.style.opacity = this.joy ? Math.min(1, s.buttonOpacity + 0.25) : this.editing ? 0.9 : fixed ? s.buttonOpacity * 0.8 : s.buttonOpacity * 0.4;
    j.firstChild.style.transform = `translate(${kx}px, ${ky}px)`;
    j.classList.toggle('sel', this.editing && this.selectedBtn === 'joystick');
  }

  // layout editor
  setEditing(on, onSelect) {
    this.editing = on; this.onSelect = onSelect; this.selectedBtn = on ? 'jump' : null;
    document.body.classList.toggle('editing-layout', on);
    this.layoutButtons();
    if (on && onSelect) onSelect(this.selectedBtn);
  }
  startDrag(name, e) {
    this.selectedBtn = name; if (this.onSelect) this.onSelect(name);
    const el = name === 'joystick' ? this.joyEl : this.buttons[name];
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const move = ev => {
      const l = this.s.layout[name];
      l.x = Math.max(0.04, Math.min(0.96, ev.clientX / innerWidth)); l.y = Math.max(0.06, Math.min(0.94, ev.clientY / innerHeight));
      this.layoutButtons();
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    this.layoutButtons();
  }

  // one frame of intent
  frame() {
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    let jump = k.has('Space'), sneak = k.has('ShiftLeft') || k.has('ShiftRight'), sprint = k.has('ControlLeft') || k.has('KeyR');
    let breakHeld = this.mouse.left, useHeld = this.mouse.right;
    let aim = null;
    if (this.joy) {
      const size = this.joyBase || 130, m = size * 0.36;
      let dx = (this.joy.x - this.joy.cx) / m, dy = (this.joy.y - this.joy.cy) / m;
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      if (d > 0.12) { mx += dx; mz -= dy; }
      if (performance.now() - (this.joy.lastUp || 0) < 400 && -dy > 0.6) this.toggles.sprintTap = true;
      if (d > 1.35 && -dy > 0.7) this.toggles.sprintTap = true;
    } else this.toggles.sprintTap = false;
    jump = jump || this.btnState.jump || this.btnState.flyUp;
    sneak = sneak || this.toggles.sneak;
    const flyDown = this.btnState.flyDown || sneak;
    sprint = sprint || this.toggles.sprint || this.toggles.sprintTap;
    if (this.btnState.attack) breakHeld = true;
    if (this.btnState.use) useHeld = true;
    // touch holds
    const now = performance.now();
    for (const t of this.touches.values()) {
      if (!t.hold && now - t.still > 320 && (!t.moved || now - t.t0 > 320)) t.hold = true;
      if (t.hold) { breakHeld = true; useHeld = true; aim = this.s.controlScheme === 'touch' ? { x: t.x, y: t.y } : null; this.holdTouch = true; }
    }
    this.holdTouch = [...this.touches.values()].some(t => t.hold);
    // gamepad
    const gp = this.pollGamepad();
    if (gp) {
      mx += gp.mx; mz += gp.mz; this.lookDX += gp.lx; this.lookDY += gp.ly;
      jump = jump || gp.jump; sneak = sneak || gp.sneak; sprint = sprint || gp.sprint; breakHeld = breakHeld || gp.brk; useHeld = useHeld || gp.use;
    }
    const tapAim = this.tap ? (this.s.controlScheme === 'touch' ? this.tap : null) : null;
    const out = {
      moveX: Math.max(-1, Math.min(1, mx)), moveZ: Math.max(-1, Math.min(1, mz)),
      lookDX: this.lookDX, lookDY: this.lookDY, jump, sneak, sprint, flyDown,
      breakHeld, useHeld, aim, holdTouch: this.holdTouch,
      tap: !!this.tap, tapAim,
      edges: this.edges, scroll: this.scroll,
    };
    this.lookDX = 0; this.lookDY = 0; this.scroll = 0; this.tap = null;
    this.edges = { jump: false, use: false, attack: false, inventory: false, pause: false, drop: false, pick: false, flyToggle: false, useRelease: false, hotbar: -1, perspective: false };
    return out;
  }

  pollGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    const p = pads && [...pads].find(x => x && x.connected);
    if (!p) return null;
    this.hasGamepad = true;
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed);
    const edge = (i, name) => { const v = b(i); if (v && !this.gpPrev[i]) this.edges[name] = true; this.gpPrev[i] = v; return v; };
    const out = {
      mx: dz(p.axes[0] || 0), mz: -dz(p.axes[1] || 0),
      lx: -dz(p.axes[2] || 0) * 0.05 * this.s.sensitivity, ly: -dz(p.axes[3] || 0) * 0.04 * this.s.sensitivity * (this.s.invertY ? -1 : 1),
      jump: b(0), sneak: b(1), sprint: b(10), brk: b(7), use: b(6),
    };
    edge(0, 'jump'); edge(3, 'inventory'); edge(9, 'pause'); edge(6, 'use'); edge(7, 'attack');
    if (b(6) === false && this.gpPrev.u6) this.edges.useRelease = true; this.gpPrev.u6 = b(6);
    if (edge(4, '_lb')) { if (!this.gpPrev.lb) this.scroll -= 1; } this.gpPrev.lb = b(4);
    if (edge(5, '_rb')) { if (!this.gpPrev.rb) this.scroll += 1; } this.gpPrev.rb = b(5);
    edge(2, 'drop');
    return out;
  }
}
export { isTouch };
