// Every menu, sheet and HUD element. iOS look for the chrome, pixel art for the items.
import { iconURL } from './textures.js';
import { BLOCKS, ITEMS, nameOf, maxStack, RECIPES, creativeList, smeltOf, fuelOf, I, B, info, armorOf } from './blocks.js';
import { canCraft, craft, maxCrafts, stack } from './inventory.js';
import { applyBattery, DEFAULT_LAYOUT, isTouch } from './settings.js';
import { BIOME_NAMES } from './worldgen.js';

export const VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const svg = (p, fill) => `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  chev: '<svg class="chev" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>',
  back: '<svg class="chev" viewBox="0 0 12 20" width="12" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2L2 10l8 8"/></svg>',
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  more: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', true),
  play: svg('<path d="M7 4.5v15l12-7.5z"/>', true),
  gear: svg('<path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  install: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  bag: svg('<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  hand: svg('<path d="M8 13V5.5a1.5 1.5 0 013 0V11"/><path d="M11 10.5V4a1.5 1.5 0 013 0v6.5"/><path d="M14 10.5V5.5a1.5 1.5 0 013 0V14a6 6 0 01-6 6h-.5a6 6 0 01-4.7-2.3L3.4 14.6a1.6 1.6 0 012.4-2.1L8 14.5"/>'),
  speaker: svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14"/>'),
  paint: svg('<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 000 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0022 9.8C22 5.5 17.5 2 12 2z"/>'),
  data: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  battery: svg('<rect x="2" y="7" width="17" height="10" rx="2.5"/><path d="M22 11v2"/><path d="M6 10v4M9.5 10v4"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>'),
  cube: svg('<path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/>'),
  shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  wifi: svg('<path d="M2 8.8a15 15 0 0120 0M5 12.6a10 10 0 0114 0M8.5 16.3a5 5 0 017 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  share: svg('<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>'),
  flame: svg('<path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-7 0 3 1.5 4 3 4 0-4-1-6 0-9z"/>', true),
  pad: svg('<path d="M6 9h4M8 7v4"/><circle cx="15.5" cy="10" r="1" fill="currentColor"/><circle cx="17.5" cy="12" r="1" fill="currentColor"/><path d="M7.5 5h9a5.5 5.5 0 015.3 6.9l-1.3 5A3 3 0 0115.6 18L14 16H10l-1.6 2a3 3 0 01-4.9-1.1l-1.3-5A5.5 5.5 0 017.5 5z"/>'),
  move: svg('<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>'),
  camera: svg('<path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/><circle cx="12" cy="13" r="4"/>'),
  exit: svg('<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4"/><path d="M10 17l-5-5 5-5M5 12h11"/>'),
  heart: svg('<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z"/>', true),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>'),
  pencil: svg('<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z"/>'),
  doc: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
  sparkles: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
};

const TIPS = [
  'اكسر جذع شجرة بإيدك، واعمل منه ألواح خشب ثم طاولة صناعة.',
  'الوحوش بتطلع في الضلمة. حط شعلة عشان تنوّر حواليك.',
  'السرير بيخليك تنام بالليل ويحفظ مكان رجوعك.',
  'تقدر تحرّك كل زرار وتكبّره من الإعدادات ← التحكم.',
  'عالمك بيتحفظ تلقائياً كل 20 ثانية. خد نسخة احتياطية من «البيانات».',
  'الفحم بتلاقيه في الصخر قريب من السطح، والألماس تحت خالص.',
  'وضع توفير البطارية بيقلل السخونة ويطوّل الشحن.',
  'اكتب على اللافتة بالعربي، الحروف بتتشبك صح.',
  'اغرف المية بالجردل واسقي بيها زرعك.',
];

// tiny pixel icons for the HUD bars
function pixIcon(rows, pal) {
  const cv = document.createElement('canvas'); cv.width = 9; cv.height = 9;
  const g = cv.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return cv.toDataURL();
}
const HEART = ['.kk...kk.', 'krrk.krrk', 'krwrkrrrk', 'krrrrrrrk', 'krrrrrrrk', '.krrrrrk.', '..krrrk..', '...krk...', '....k....'];
const HEART_HALF = HEART.map(r => r.slice(0, 5).replace(/[rw]/g, x => x) + r.slice(5).replace(/[rw]/g, 'e'));
const LOAF = ['.........', '..kkkkk..', '.kbbllbk.', 'kbllbbllk', 'kbbbbbbbk', 'kddddddddk'.slice(0, 9), '.kkkkkkk.', '.........', '.........'];
const SHIELD = ['.kkkkkkk.', 'kwsssssk.', 'kssssssk.', 'kssssssk.', '.kssssk..', '.kssssk..', '..kssk...', '...kk....', '.........'];
const BUB = ['.........', '..kkkk...', '.kwbbbk..', '.kbbbbk..', '.kbbbbk..', '.kbbbbk..', '..kkkk...', '.........', '.........'];
let HUD_ICONS = null;
function hudIcons() {
  if (HUD_ICONS) return HUD_ICONS;
  const hp = { k: '#1a0505', r: '#e2262c', w: '#ffb3b3', e: '#3a1414' };
  const he = { k: '#1a0505', r: '#3a1414', w: '#3a1414', e: '#3a1414' };
  const fp = { k: '#2b1606', b: '#d09048', l: '#f2c483', d: '#8c5524' };
  const fe = { k: '#2b1606', b: '#3d2a1a', l: '#3d2a1a', d: '#3d2a1a' };
  const fh = { k: '#2b1606', b: '#d09048', l: '#f2c483', d: '#8c5524' };
  HUD_ICONS = {
    heart: pixIcon(HEART, hp), heartHalf: pixIcon(HEART_HALF, hp), heartEmpty: pixIcon(HEART, he),
    food: pixIcon(LOAF, fp), foodEmpty: pixIcon(LOAF, fe), foodHalf: pixIcon(LOAF.map(r => r.slice(0, 4).replace(/[bld]/g, 'e') + r.slice(4)), Object.assign({ e: '#3d2a1a' }, fh)),
    bubble: pixIcon(BUB, { k: '#0b2a5a', w: '#ffffff', b: '#5aa8ff' }),
    armor: pixIcon(SHIELD, { k: '#202430', w: '#ffffff', s: '#c8ccd6' }), armorHalf: pixIcon(SHIELD.map(r => r.slice(0, 4) + r.slice(4).replace(/[sw]/g, 'e')), { k: '#202430', w: '#ffffff', s: '#c8ccd6', e: '#4a4f5c' }),
  };
  return HUD_ICONS;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.sheets = [];
    this.carry = null;
    this.hudCache = {};
    this.lastInfo = 0;
    this.creativeTab = 'build';
    this.recipeFilter = 'can';
  }
  get s() { return this.app.settings; }
  get blocking() { return this.sheets.some(x => x.game) || this.app.paused; }
  pct(v) { return this.fmt(Math.round(v * 100)) + (this.s.digits === 'arabic' ? '٪' : '%'); }
  fmt(n) {
    if (this.s.digits === 'arabic') return Number(n).toLocaleString('ar-EG').replace(/٬/g, ' ');
    return String(n);
  }

  // ---------- primitives ----------
  toast(text, icon) {
    const t = h('div', { class: 'toast' }, icon ? h('img', { class: 'px', src: icon, alt: '' }) : null, text);
    $('#toasts').append(t);
    while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2200);
  }
  alert({ title, message, buttons = [{ text: 'حسناً', value: true, bold: true }], input, vertical }) {
    return new Promise(res => {
      const field = input ? h('input', { type: 'text', value: input.value || '', placeholder: input.placeholder || '', dir: 'auto', maxlength: input.max || 40 }) : null;
      const wrap = h('div', { class: 'alert-wrap', role: 'alertdialog', 'aria-label': title });
      const close = v => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 220); res(v); };
      const btns = h('div', { class: 'btns' + (vertical || buttons.length > 2 ? ' v' : '') }, buttons.map(b => h('button', { class: (b.bold ? 'bold ' : '') + (b.red ? 'red' : ''), onclick: () => close(field && b.value === true ? field.value : b.value) }, b.text)));
      wrap.append(h('div', { class: 'alert' }, h('div', { class: 'body' }, h('h3', null, title), message ? h('p', null, message) : null, field), btns));
      document.body.append(wrap);
      requestAnimationFrame(() => wrap.classList.add('show'));
      if (field) setTimeout(() => { field.focus(); field.select(); }, 250);
    });
  }
  actions({ title, items }) {
    return new Promise(res => {
      const dim = h('div', { class: 'dim show', style: { zIndex: 70 } });
      const close = v => { el.classList.remove('show'); dim.classList.remove('show'); setTimeout(() => { el.remove(); dim.remove(); }, 380); res(v); };
      dim.onclick = () => close(null);
      const el = h('div', { class: 'asheet' },
        h('div', { class: 'grp' }, title ? h('div', { class: 'ttl' }, title) : null, items.map(it => h('button', { class: it.red ? 'red' : '', onclick: () => close(it.value) }, it.text))),
        h('div', { class: 'grp' }, h('button', { class: 'cancel', onclick: () => close(null) }, 'إلغاء')));
      document.body.append(dim, el);
      requestAnimationFrame(() => el.classList.add('show'));
    });
  }
  sheet({ title, body, left, right, game, cls, onClose, side }) {
    const el = h('div', { class: 'sheet' + (game ? ' game' : '') + (side ? ' side' : '') + (cls ? ' ' + cls : ''), role: 'dialog', 'aria-label': title });
    const head = h('div', { class: 'sheet-h' }, left || h('span', { style: { width: '44px' } }), h('h2', null, title), right || h('button', { class: 'nav-btn', onclick: () => handle.close() }, 'تم'));
    el.append(h('div', { class: 'grab' }), head, h('div', { class: 'sheet-body' }, body));
    $('#sheets').append(el);
    const handle = { el, game, closed: false, close: () => {
      if (handle.closed) return;
      handle.closed = true;
      el.classList.remove('show');
      this.sheets = this.sheets.filter(x => x !== handle);
      if (!this.sheets.length) $('#dim').classList.remove('show');
      setTimeout(() => el.remove(), 450);
      onClose && onClose();
      this.app.onSheetsChanged();
    } };
    this.sheets.push(handle);
    $('#dim').classList.add('show');
    $('#dim').onclick = () => { const top = this.sheets[this.sheets.length - 1]; if (top && !top.modal) top.close(); };
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    // drag the grabber/header down to dismiss
    let y0 = null, dy = 0;
    const start = e => { y0 = e.clientY; dy = 0; el.classList.add('dragging'); };
    const move = e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); el.style.transform = `translateY(${dy}px)`; };
    const end = () => { if (y0 === null) return; el.classList.remove('dragging'); el.style.transform = ''; if (dy > 90) handle.close(); y0 = null; };
    for (const t of [el.firstChild, head]) { t.addEventListener('pointerdown', start); t.style.touchAction = 'none'; }
    addEventListener('pointermove', move); addEventListener('pointerup', end);
    this.app.onSheetsChanged();
    return handle;
  }
  closeAllSheets() { for (const s of [...this.sheets]) s.close(); }

  slotEl(st, opts = {}) {
    const el = h('div', { class: 'slot' + (opts.cls ? ' ' + opts.cls : ''), role: 'button', 'aria-label': st ? `${nameOf(st.id)} ${st.count}` : 'خانة فاضية' });
    if (st) {
      el.append(h('img', { class: 'px', src: iconURL(st.id), alt: '', draggable: 'false' }));
      if (st.count > 1) el.append(h('span', { class: 'cnt' }, this.fmt(st.count)));
      const t = ITEMS[st.id] && (ITEMS[st.id].tool || ITEMS[st.id].armor);
      if (t && st.dur !== undefined && st.dur < t.durability) {
        const p = Math.max(0, st.dur / t.durability);
        const b = h('b'); b.style.width = (p * 100) + '%'; b.style.background = p > 0.5 ? 'var(--green)' : p > 0.2 ? 'var(--orange)' : 'var(--red)';
        el.append(h('span', { class: 'dur' }, b));
      }
    }
    if (opts.onTap || opts.onLong) bindTap(el, opts.onTap, opts.onLong, opts.onDouble);
    return el;
  }

  // ---------- screens ----------
  show(id) {
    for (const s of document.querySelectorAll('.screen')) if (s.id !== 'splash') s.classList.toggle('show', s.id === id);
    this.current = id;
  }
  home() {
    const el = $('#home');
    const app = this.app;
    el.innerHTML = '';
    const installBtn = app.canInstall() ? h('button', { class: 'glass-btn', onclick: () => app.install() }, h('span', { html: IC.install }), 'تثبيت') : null;
    el.append(
      h('div', { class: 'home-card' },
        h('h1', { class: 'home-title' }, 'بُنيان'),
        h('p', { class: 'home-sub' }, 'ابنِ عالمك… مكعّب ورا مكعّب'),
        h('button', { class: 'glass-btn primary', id: 'playBtn', onclick: () => this.worlds() }, h('span', { html: IC.play }), 'العب'),
        h('div', { class: 'home-row' },
          h('button', { class: 'glass-btn', onclick: () => this.settingsPage('root') }, h('span', { html: IC.gear }), 'الإعدادات'),
          installBtn)),
      h('div', { class: 'home-foot' }, 'الإصدار ' + VERSION + ' · ', h('a', { href: 'https://wa.me/201206580045', target: '_blank', rel: 'noopener' }, 'تصميم وتطوير: محمد الشيخ')));
    this.show('home');
    app.menuMode(true);
  }

  navBar(title, { back, actions } = {}) {
    const nav = h('div', { class: 'nav' },
      h('div', { class: 'nav-bar' },
        back ? h('button', { class: 'nav-btn', onclick: back.fn, 'aria-label': 'رجوع' }, h('span', { html: IC.back }), back.text) : h('span'),
        h('div', { class: 'nav-title' }, title),
        h('div', { style: { display: 'flex' } }, actions || [])));
    return nav;
  }
  page(container, title, opts, content) {
    container.innerHTML = '';
    const nav = this.navBar(title, opts);
    const sc = h('div', { class: 'scroll' }, h('h1', { class: 'large-title' }, title), content);
    sc.addEventListener('scroll', () => nav.classList.toggle('scrolled', sc.scrollTop > 30), { passive: true });
    container.append(nav, sc);
    return sc;
  }

  async worlds() {
    const app = this.app;
    const el = $('#worlds');
    const list = await app.store.listWorlds().catch(() => []);
    const content = h('div');
    if (!list.length) {
      content.append(h('div', { class: 'empty' }, h('img', { class: 'ico', src: 'icons/icon-192.png', alt: '' }), h('h3', null, 'لسه معندكش عوالم'), h('p', null, 'ابدأ عالم جديد، وبُنيان يحفظه على جهازك أوتوماتيك.'), h('div', { style: { maxWidth: '280px', margin: '18px auto 0' } }, h('button', { class: 'btn', onclick: () => this.createWorld() }, 'عالم جديد'))));
    } else {
      const rows = list.map(w => {
        const sub = `${w.mode === 'creative' ? 'إبداعي' : 'بقاء'} · اليوم ${this.fmt(w.day || 1)} · ${relTime(w.lastPlayed)}`;
        const row = h('div', { class: 'row world-row tap', role: 'button', tabindex: 0 },
          w.thumb ? h('img', { class: 'world-thumb', src: w.thumb, alt: '' }) : h('div', { class: 'world-thumb' }),
          h('div', { class: 'grow' }, h('div', { class: 't' }, h('bdi', null, w.name)), h('div', { class: 'st' }, sub)),
          h('button', { class: 'more-btn', html: IC.more, 'aria-label': 'خيارات', onclick: e => { e.stopPropagation(); this.worldActions(w); } }));
        row.addEventListener('click', () => app.play(w));
        return row;
      });
      content.append(h('div', { class: 'group' }, h('div', { class: 'list' }, rows), h('div', { class: 'group-f' }, 'عوالمك محفوظة على الجهاز ده بس. صدّر نسخة من «⋯» عشان تنقلها لموبايل تاني.')));
    }
    this.page(el, 'عوالمي', {
      back: { text: 'الرئيسية', fn: () => this.home() },
      actions: [h('button', { class: 'nav-btn', onclick: () => this.importWorld() }, 'استيراد'), h('button', { class: 'nav-btn', html: IC.plus, 'aria-label': 'عالم جديد', onclick: () => this.createWorld() })],
    }, content);
    this.show('worlds');
    app.menuMode(true);
    this.maybeBackupReminder(list);
  }

  async worldActions(w) {
    const app = this.app;
    const v = await this.actions({ title: w.name, items: [
      { text: 'العب', value: 'play' }, { text: 'إعادة تسمية', value: 'rename' }, { text: 'تصدير نسخة (ملف)', value: 'export' },
      navigator.share ? { text: 'مشاركة العالم', value: 'share' } : null, { text: 'حذف العالم', value: 'delete', red: true }].filter(Boolean) });
    if (v === 'play') app.play(w);
    if (v === 'rename') {
      const n = await this.alert({ title: 'إعادة تسمية العالم', input: { value: w.name, max: 32 }, buttons: [{ text: 'إلغاء', value: null }, { text: 'حفظ', value: true, bold: true }] });
      if (n && n.trim()) { w.name = n.trim(); await app.store.putWorld(w); this.worlds(); }
    }
    if (v === 'export') this.exportWorld(w, false);
    if (v === 'share') this.exportWorld(w, true);
    if (v === 'delete') {
      const ok = await this.alert({ title: `حذف «${w.name}»؟`, message: 'العالم هيتمسح من الجهاز ومش هينفع ترجّعه إلا لو عندك نسخة.', buttons: [{ text: 'إلغاء', value: false }, { text: 'حذف', value: true, red: true, bold: true }] });
      if (ok) { await app.store.deleteWorld(w.id); this.toast('اتحذف العالم'); this.worlds(); }
    }
  }
  async exportWorld(w, share) {
    const data = await this.app.store.exportWorld(w.id);
    const name = `bunyan-${w.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.json`;
    await this.saveFile(name, JSON.stringify(data), share);
  }
  async saveFile(name, text, share) {
    const blob = new Blob([text], { type: 'application/json' });
    if (share && navigator.canShare) {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); this.markBackup(); return; } catch (e) { if (e.name === 'AbortError') return; } }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    this.markBackup();
    this.toast('اتحفظ الملف: ' + name);
  }
  markBackup() { this.s.lastBackup = Date.now(); this.app.saveSettings(); }
  pickFile() {
    return new Promise(res => {
      const inp = h('input', { type: 'file', accept: '.json,.bunyan,application/json', style: { display: 'none' } });
      inp.onchange = () => { const f = inp.files[0]; inp.remove(); if (!f) return res(null); f.text().then(t => res(t)).catch(() => res(null)); };
      document.body.append(inp); inp.click();
    });
  }
  async importWorld() {
    const text = await this.pickFile();
    if (!text) return;
    try {
      const obj = JSON.parse(text);
      if (obj.kind === 'all') { for (const w of obj.worlds) await this.app.store.importWorld(w); this.toast(`اتستورد ${this.fmt(obj.worlds.length)} عوالم`); }
      else { const m = await this.app.store.importWorld(obj); this.toast('اتستورد «' + m.name + '»'); }
      this.worlds();
    } catch (e) { this.alert({ title: 'الملف ده مش عالم بُنيان', message: 'اختار ملف اتصدّر من بُنيان (امتداده json).' }); }
  }
  maybeBackupReminder(list) {
    if (!this.s.backupReminder || !list.length || this.remindedThisSession) return;
    const week = 7 * 864e5;
    const played = list.some(w => w.lastPlayed > (this.s.lastBackup || 0));
    if (played && Date.now() - (this.s.lastBackup || 0) > week && Date.now() - (list[list.length - 1].created || 0) > 864e5) {
      this.remindedThisSession = true;
      setTimeout(async () => {
        const ok = await this.alert({ title: 'خد نسخة احتياطية', message: 'بقالك أسبوع من غير نسخة. لو اتمسحت بيانات المتصفح العوالم هتضيع.', buttons: [{ text: 'بعدين', value: false }, { text: 'انسخ دلوقتي', value: true, bold: true }] });
        if (ok) this.backupAll();
      }, 600);
    }
  }
  async backupAll() {
    const list = await this.app.store.listWorlds();
    const worlds = [];
    for (const w of list) worlds.push(await this.app.store.exportWorld(w.id));
    const d = new Date();
    await this.saveFile(`bunyan-backup-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}.json`, JSON.stringify({ app: 'bunyan', kind: 'all', format: 1, worlds }), !!navigator.share && isTouch);
  }

  createWorld() {
    const o = { name: 'عالمي الجديد', mode: 'survival', difficulty: 2, type: 'default', seed: '', keepInventory: false, daylightCycle: true, bonusChest: true };
    const body = h('div');
    const nameF = h('input', { class: 'field', value: o.name, maxlength: 32, dir: 'auto', 'aria-label': 'اسم العالم', oninput: e => o.name = e.target.value });
    const seedF = h('input', { class: 'field', placeholder: 'عشوائية', dir: 'auto', 'aria-label': 'البذرة', oninput: e => o.seed = e.target.value });
    body.append(
      h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'اسم العالم'), h('div', { class: 'list' }, h('div', { class: 'row' }, nameF))),
      h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'طريقة اللعب'), h('div', { class: 'list' },
        h('div', { class: 'row stack' }, seg([['survival', 'بقاء'], ['creative', 'إبداعي']], o.mode, v => { o.mode = v; foot.textContent = v === 'creative' ? 'بلوكات من غير حدود، طيران، ومفيش وحوش تهاجمك.' : 'اجمع، اصنع أدواتك، وكُل عشان تفضل عايش لحد الصبح.'; })),
        h('div', { class: 'row stack' }, h('div', { class: 'st' }, 'الصعوبة'), seg([[0, 'سِلمي'], [1, 'سهل'], [2, 'عادي'], [3, 'صعب']], o.difficulty, v => o.difficulty = v))),
        (() => { var f = h('div', { class: 'group-f' }, 'اجمع، اصنع أدواتك، وكُل عشان تفضل عايش لحد الصبح.'); return (foot = f); })()),
      h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'العالم'), h('div', { class: 'list' },
        h('div', { class: 'row stack' }, seg([['default', 'عادي'], ['flat', 'مسطّح']], o.type, v => o.type = v)),
        h('div', { class: 'row' }, h('div', { class: 't', style: { flex: 'none' } }, 'البذرة'), seedF))),
      h('div', { class: 'group' }, h('div', { class: 'list' },
        swRow('صندوق بداية', o.bonusChest, v => o.bonusChest = v),
        swRow('احتفظ بحاجتك لما تموت', o.keepInventory, v => o.keepInventory = v),
        swRow('دورة الليل والنهار', o.daylightCycle, v => o.daylightCycle = v))),
      h('div', { class: 'group' }, h('button', { class: 'btn', id: 'createBtn', onclick: async () => {
        if (!o.name.trim()) { this.toast('اكتب اسم للعالم'); nameF.focus(); return; }
        sh.close();
        const meta = await this.app.newWorld(o);
        this.app.play(meta);
      } }, 'إنشاء العالم')));
    var foot;
    const sh = this.sheet({ title: 'عالم جديد', body, left: h('button', { class: 'nav-btn', onclick: () => sh.close() }, 'إلغاء'), right: h('span', { style: { width: '44px' } }) });
  }

  // ---------- settings (iOS Settings) ----------
  settingsPage(name, fromGame) {
    const app = this.app, s = this.s;
    const el = $('#settings');
    this.settingsFromGame = fromGame ?? this.settingsFromGame;
    const back = name === 'root'
      ? { text: this.settingsFromGame ? 'اللعبة' : 'الرئيسية', fn: () => { if (this.settingsFromGame) { this.show(null); app.resumeFromSettings(); } else this.home(); } }
      : { text: 'الإعدادات', fn: () => this.settingsPage('root') };
    const change = () => { app.saveSettings(); app.applySettings(); };
    const sw = (label, key, tile, color, after) => iconRow(tile, color, label, toggle(s[key], v => { s[key] = v; change(); after && after(v); }));
    const sl = (label, key, min, max, step, show) => sliderRow(label, s[key], min, max, step, v => { s[key] = v; change(); }, show || (v => this.fmt(v)));
    const sg = (label, key, opts) => h('div', { class: 'row stack' }, h('div', { class: 't' }, label), seg(opts, s[key], v => { s[key] = v; change(); }));
    let title, content;
    if (name === 'root') {
      title = 'الإعدادات';
      const av = h('div', { class: 'avatar' }, faceCanvas());
      content = [
        h('div', { class: 'group' }, h('div', { class: 'list' }, h('div', { class: 'profile row tap', role: 'button', onclick: async () => {
          const n = await this.alert({ title: 'اسمك في اللعبة', input: { value: s.playerName, max: 20 }, buttons: [{ text: 'إلغاء', value: null }, { text: 'حفظ', value: true, bold: true }] });
          if (n && n.trim()) { s.playerName = n.trim(); change(); this.settingsPage('root'); }
        } }, av, h('div', { class: 'grow' }, h('div', { class: 't' }, h('bdi', null, s.playerName)), h('div', { class: 'st' }, 'بُنيان ' + VERSION + ' · اضغط لتغيير الاسم')), h('span', { html: IC.chev })))),
        h('div', { class: 'group' }, h('div', { class: 'list' },
          navRow(IC.eye, 'var(--blue)', 'الرسومات والأداء', `${this.fmt(s.renderDistance)} قطع`, () => this.settingsPage('graphics')),
          navRow(IC.hand, 'var(--orange)', 'التحكم', s.controlScheme === 'touch' ? 'لمس مباشر' : 'نقطة تصويب', () => this.settingsPage('controls')),
          navRow(IC.speaker, 'var(--pink)', 'الصوت', s.music ? 'موسيقى شغالة' : '', () => this.settingsPage('sound')),
          navRow(IC.paint, 'var(--indigo)', 'المظهر', { auto: 'تلقائي', light: 'فاتح', dark: 'غامق' }[s.theme], () => this.settingsPage('appearance')))),
        h('div', { class: 'group' }, h('div', { class: 'list' },
          iconRow(IC.battery, 'var(--green)', 'توفير البطارية', toggle(s.batterySaver, v => { applyBattery(s, v); change(); this.settingsPage('root'); })),
          navRow(IC.data, 'var(--gray)', 'البيانات والنسخ الاحتياطي', '', () => this.settingsPage('data')),
          navRow(IC.info, 'var(--teal)', 'عن بُنيان', '', () => this.settingsPage('about'))),
          h('div', { class: 'group-f' }, 'توفير البطارية بيثبّت 30 إطار في الثانية ويقلل الدقة ومسافة الرؤية عشان الموبايل ميسخنش.')),
      ];
    } else if (name === 'graphics') {
      title = 'الرسومات والأداء';
      content = [
        h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'الرؤية'), h('div', { class: 'list' },
          sl('مسافة الرؤية (قطع)', 'renderDistance', 2, 12, 1),
          sl('مجال الرؤية', 'fov', 50, 110, 1, v => this.fmt(v) + '°'),
          sl('السطوع', 'brightness', 0, 1, 0.05, v => this.pct(v)))),
        h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'الأداء'), h('div', { class: 'list' },
          sl('دقة العرض', 'resScale', 0.4, 1, 0.05, v => this.pct(v)),
          h('div', { class: 'row stack' }, h('div', { class: 't' }, 'حد الإطارات'), seg([[30, '30'], [60, '60'], [0, 'بلا حد']], s.fpsCap, v => { s.fpsCap = v; change(); })),
          sw('توفير البطارية', 'batterySaver', IC.battery, 'var(--green)', v => { applyBattery(s, v); change(); this.settingsPage('graphics'); })),
          h('div', { class: 'group-f' }, 'لو الموبايل بيسخن أو بيقطّع: قلّل مسافة الرؤية والدقة، أو شغّل توفير البطارية.')),
        h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'الشكل'), h('div', { class: 'list' },
          sg('أسلوب الرسومات', 'textureStyle', [['pixel', 'بكسل كلاسيك'], ['smooth', 'ناعم']]),
          sw('إضاءة ناعمة وظلال', 'smoothLight', IC.sun, 'var(--yellow)'),
          sw('أوراق شجر فاخرة', 'fancyLeaves', IC.sparkles, 'var(--green)'),
          sw('السحاب', 'clouds', IC.globe, 'var(--blue)'),
          sw('اهتزاز الكاميرا مع المشي', 'viewBob', IC.move, 'var(--gray)'))),
        h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'معلومات على الشاشة'), h('div', { class: 'list' },
          sw('إظهار الإحداثيات', 'showCoords', IC.globe, 'var(--teal)'),
          sw('إظهار عدد الإطارات', 'showFps', IC.clock, 'var(--gray)'))),
      ];
    } else if (name === 'controls') {
      title = 'التحكم';
      content = [
        h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'اللمس'), h('div', { class: 'list' },
          h('div', { class: 'row stack' }, h('div', { class: 't' }, 'طريقة اللعب باللمس'), seg([['touch', 'لمس مباشر'], ['crosshair', 'نقطة تصويب']], s.controlScheme, v => { s.controlScheme = v; change(); this.settingsPage('controls'); })),
          h('div', { class: 'row stack' }, h('div', { class: 't' }, 'عصا الحركة'), seg([['floating', 'تظهر مكان صباعك'], ['fixed', 'ثابتة']], s.joystickMode, v => { s.joystickMode = v; change(); })),
          sw('أزرار ضرب واستخدام', 'showActionButtons', IC.hand, 'var(--orange)'),
          sw('قفز تلقائي', 'autoJump', IC.move, 'var(--green)'),
          sw('اهتزاز الموبايل', 'haptics', IC.sparkles, 'var(--indigo)')),
          h('div', { class: 'group-f' }, s.controlScheme === 'touch' ? 'لمس مباشر: دوس مرة على المكان عشان تحط بلوك أو تضرب، ودوس مطوّل عشان تكسر. اسحب عشان تبص حواليك.' : 'نقطة تصويب: اسحب عشان توجّه النقطة اللي في النص، دوس مرة تحط، ودوس مطوّل تكسر.')),
        h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'الأزرار'), h('div', { class: 'list' },
          navRow(IC.move, 'var(--blue)', 'تخصيص مكان الأزرار وحجمها', '', () => this.app.editLayout()),
          sl('حجم الأزرار', 'buttonSize', 0.7, 1.5, 0.05, v => this.pct(v)),
          sl('وضوح الأزرار', 'buttonOpacity', 0.2, 1, 0.05, v => this.pct(v)))),
        h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'الكاميرا'), h('div', { class: 'list' },
          sl('الحساسية', 'sensitivity', 0.3, 2.5, 0.05, v => this.pct(v)),
          iconRow(IC.move, 'var(--gray)', 'عكس الاتجاه الرأسي', toggle(s.invertY, v => { s.invertY = v; change(); })))),
        h('div', { class: 'group' }, h('div', { class: 'list' }, iconRow(IC.pad, 'var(--indigo)', 'يد تحكم (جيم باد)', h('span', { class: 'val' }, this.app.input.hasGamepad ? 'متوصلة' : 'وصّل واضغط أي زرار'))),
          h('div', { class: 'group-f' }, 'على الكمبيوتر: W A S D للحركة، المسافة للقفز، Shift للانحناء، Ctrl للجري، E للحقيبة، Q لرمي حاجة، F للطيران في الإبداعي.')),
      ];
    } else if (name === 'sound') {
      title = 'الصوت';
      content = [h('div', { class: 'group' }, h('div', { class: 'list' },
        sl('الصوت العام', 'masterVolume', 0, 1, 0.05, v => this.pct(v)),
        sl('المؤثرات', 'sfxVolume', 0, 1, 0.05, v => this.pct(v)),
        sw('موسيقى هادية', 'music', IC.speaker, 'var(--pink)'),
        sl('صوت الموسيقى', 'musicVolume', 0, 1, 0.05, v => this.pct(v))),
        h('div', { class: 'group-f' }, 'كل الأصوات والموسيقى بتتولّد على الجهاز، مفيش ملفات بتتحمّل.'))];
    } else if (name === 'appearance') {
      title = 'المظهر';
      content = [
        h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'القوائم'), h('div', { class: 'list' },
          h('div', { class: 'row stack' }, h('div', { class: 't' }, 'الوضع'), seg([['auto', 'تلقائي'], ['light', 'فاتح'], ['dark', 'غامق']], s.theme, v => { s.theme = v; change(); })))),
        h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'الأرقام'), h('div', { class: 'list' },
          h('div', { class: 'row stack' }, seg([['latin', '123'], ['arabic', '١٢٣']], s.digits, v => { s.digits = v; change(); this.settingsPage('appearance'); })))),
        h('div', { class: 'group' }, h('div', { class: 'list' }, sw('تقليل الحركة', 'reducedMotion', IC.sparkles, 'var(--gray)')), h('div', { class: 'group-f' }, 'بيوقف حركات القوائم. اللعبة نفسها مش بتتأثر.')),
      ];
    } else if (name === 'data') {
      title = 'البيانات';
      const usage = h('span', { class: 'val num' }, '…');
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => usage.textContent = this.fmt((e.usage / 1048576).toFixed(1)) + ' م.ب').catch(() => usage.textContent = '—');
      content = [
        h('div', { class: 'group' }, h('div', { class: 'list' },
          actRow(IC.share, 'var(--blue)', 'نسخة احتياطية لكل العوالم', () => this.backupAll()),
          actRow(IC.doc, 'var(--green)', 'استعادة من ملف', () => this.importWorld().then(() => this.settingsPage('data'))),
          iconRow(IC.clock, 'var(--orange)', 'تذكير أسبوعي بالنسخ', toggle(s.backupReminder, v => { s.backupReminder = v; change(); }))),
          h('div', { class: 'group-f' }, (s.lastBackup ? 'آخر نسخة: ' + relTime(s.lastBackup) + '. ' : 'لسه مخدتش نسخة. ') + 'الملف تقدر تبعته لنفسك على واتساب أو تحفظه على Drive.')),
        h('div', { class: 'group' }, h('div', { class: 'list' }, iconRow(IC.data, 'var(--gray)', 'المساحة المستخدمة', usage))),
        h('div', { class: 'group' }, h('div', { class: 'list' }, h('button', { class: 'row tap danger center', onclick: () => this.resetAll() }, h('div', { class: 't' }, 'مسح كل البيانات'))), h('div', { class: 'group-f' }, 'بيمسح كل العوالم والإعدادات من الجهاز ده.')),
      ];
    } else if (name === 'about') {
      title = 'عن بُنيان';
      content = [
        h('div', { class: 'group' }, h('div', { class: 'list' },
          iconRow(IC.cube, 'var(--indigo)', 'الإصدار', h('span', { class: 'val num' }, VERSION)),
          navRow(IC.sparkles, 'var(--orange)', 'الجديد في الإصدار', '', () => this.whatsNew(false)))),
        h('div', { class: 'group' }, h('div', { class: 'group-h' }, 'الخصوصية'), h('div', { class: 'list' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'st', style: { fontSize: '15px', color: 'var(--label)' } }, 'مفيش حسابات ولا إعلانات ولا شراء جوه اللعبة ولا تتبّع. عوالمك وإعداداتك محفوظة على جهازك بس، واللعبة بتشتغل من غير إنترنت بعد أول فتحة.'))))),
        h('div', { class: 'group' }, h('div', { class: 'list' },
          h('a', { class: 'row tap accent', href: 'https://wa.me/201206580045', target: '_blank', rel: 'noopener', style: { textDecoration: 'none' } }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'تصميم وتطوير: محمد الشيخ')), h('span', { html: IC.chev }))),
          h('div', { class: 'group-f' }, 'كل الرسومات والأصوات معمولة جوه بُنيان. محرك العرض three.js (رخصة MIT).')),
      ];
    }
    this.page(el, title, { back }, content);
    this.show('settings');
  }
  async resetAll() {
    const v = await this.alert({ title: 'مسح كل البيانات؟', message: 'اكتب كلمة «احذف» للتأكيد. العوالم مش هترجع.', input: { placeholder: 'احذف' }, buttons: [{ text: 'إلغاء', value: null }, { text: 'مسح', value: true, red: true }] });
    if (v && v.trim() === 'احذف') {
      const list = await this.app.store.listWorlds();
      for (const w of list) await this.app.store.deleteWorld(w.id);
      try { localStorage.removeItem('bunyan.settings'); localStorage.removeItem('bunyan.onboarded'); } catch (e) { /* ignore */ }
      location.reload();
    } else if (v !== null) this.toast('الكلمة مش مطابقة، متمسحش حاجة');
  }

  whatsNew(first) {
    const el = $('#onboard');
    el.innerHTML = '';
    const feat = (ic, t, p) => h('div', { class: 'feat' }, h('div', { class: 'fi', html: ic }), h('div', null, h('b', null, t), h('p', null, p)));
    el.append(
      h('h1', null, first ? h('span', null, 'أهلاً بيك في بُنيان') : h('span', null, 'الجديد في ' + VERSION)),
      h('div', { class: 'feats' }, feat(IC.cube, 'ابنِ أي حاجة', 'عالم لا نهائي فيه غابات وصحاري وجبال وكهوف. اكسر وابني واصنع أدواتك من طاولة الصناعة.'),
      feat(IC.moon, 'اصمد لحد الصبح', 'بالليل الوحوش بتطلع. ولّع شعلة، ابني بيت، ونام في سريرك. أو العب إبداعي وطير براحتك.'),
      feat(IC.hand, 'تحكم على مقاسك', 'حرّك كل زرار وكبّره زي ما تحب، واختار بين اللمس المباشر ونقطة التصويب. ويد التحكم شغالة كمان.'),
      feat(IC.wifi, 'من غير نت ومجانية', 'تتثبت على الشاشة الرئيسية وتشتغل أوفلاين. عوالمك بتتحفظ على جهازك وتقدر تاخد منها نسخة.')),
      h('div', { class: 'bottom' }, h('button', { class: 'btn', onclick: () => { this.app.local.set('onboarded', VERSION); el.classList.remove('show'); if (first) this.home(); else this.settingsPage('about'); } }, 'متابعة')));
    for (const s of document.querySelectorAll('.screen')) if (s.id !== 'splash') s.classList.toggle('show', s.id === 'onboard');
  }

  installSheetIOS() {
    const body = h('div', { class: 'group' }, h('div', { class: 'list' },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, '١. دوس على زرار المشاركة ', h('span', { html: IC.share, style: { display: 'inline-block', width: '18px', verticalAlign: '-3px', color: 'var(--blue)' } })))),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, '٢. اختار «إضافة إلى الشاشة الرئيسية»'))),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, '٣. دوس «إضافة»، وبُنيان هيفتح زي أي تطبيق')))),
      h('div', { class: 'group-f' }, 'لازم تكون فاتح من Safari.'));
    this.sheet({ title: 'تثبيت بُنيان', body });
  }

  // ---------- HUD ----------
  renderHotbar() {
    const g = this.app.game;
    if (!g) return;
    const hb = $('#hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const st = g.inv.slots[i];
      const el = this.slotEl(st, { cls: i === g.inv.selected ? 'sel' : '' });
      bindTap(el, () => { g.inv.selected = i; this.renderHotbar(); this.app.sound.play('click'); }, () => { g.inv.selected = i; g.dropHeld(false); if (this.s.haptics && navigator.vibrate) navigator.vibrate(20); });
      hb.append(el);
    }
    hb.append(h('button', { class: 'slot bag', html: IC.bag, 'aria-label': 'الحقيبة', onclick: () => this.toggleInventory() }));
    const held = g.inv.held;
    const key = held ? held.id : 0;
    if (key !== this.lastHeld) {
      this.lastHeld = key;
      const n = $('#heldName');
      n.textContent = held ? nameOf(held.id) : '';
      n.classList.toggle('show', !!held);
      clearTimeout(this.heldT); this.heldT = setTimeout(() => n.classList.remove('show'), 1600);
    }
    if (this.invRefresh) this.invRefresh();
  }
  updateHud(g) {
    const p = g.player, c = this.hudCache, ic = hudIcons();
    const survival = g.mode !== 'creative';
    const hp = Math.ceil(p.health), food = Math.ceil(p.food), air = p.eyeInWater ? Math.ceil(p.air / 30) : -1;
    if (c.surv !== survival) { c.surv = survival; $('#bars').style.visibility = survival ? '' : 'hidden'; }
    if (survival && c.hp !== hp) { c.hp = hp; $('#hearts').innerHTML = range(10).map(i => `<i style="background-image:url(${hp >= i * 2 + 2 ? ic.heart : hp === i * 2 + 1 ? ic.heartHalf : ic.heartEmpty})"></i>`).join(''); }
    if (survival && c.food !== food) { c.food = food; $('#food').innerHTML = range(10).map(i => `<i style="background-image:url(${food >= i * 2 + 2 ? ic.food : food === i * 2 + 1 ? ic.foodHalf : ic.foodEmpty})"></i>`).join(''); }
    const def = survival ? g.inv.defense() : 0;
    if (c.def !== def) { c.def = def; $('#armorBar').innerHTML = def ? range(10).map(i => def >= i * 2 + 2 ? `<i style="background-image:url(${ic.armor})"></i>` : def === i * 2 + 1 ? `<i style="background-image:url(${ic.armorHalf})"></i>` : '<i></i>').join('') : ''; }
    if (c.air !== air) { c.air = air; $('#air').innerHTML = air >= 0 && survival ? range(Math.max(0, air)).map(() => `<i style="background-image:url(${ic.bubble})"></i>`).join('') : ''; }
    const scheme = this.s.controlScheme;
    const cross = !isTouch || scheme === 'crosshair' || this.app.input.locked;
    if (c.cross !== cross) { c.cross = cross; $('#crosshair').style.display = cross ? '' : 'none'; }
    const wt = p.eyeInWater;
    if (c.wt !== wt) { c.wt = wt; $('#waterTint').classList.toggle('on', wt); }
    const now = performance.now();
    if (now - this.lastInfo > 250) {
      this.lastInfo = now;
      let t = '';
      if (this.s.showFps) t += this.fmt(Math.round(this.app.fps)) + ' FPS\n';
      if (this.s.showCoords) {
        const col = g.world.pool && g.world.meta.type !== 'flat' ? '' : '';
        t += `XYZ ${this.fmt(Math.floor(p.x))} ${this.fmt(Math.floor(p.y))} ${this.fmt(Math.floor(p.z))}\n`;
        t += `اليوم ${this.fmt(g.meta.day || 1)}` + col;
        if (g.biomeName) t += ' · ' + g.biomeName;
      }
      if ($('#hudInfo').textContent !== t) $('#hudInfo').textContent = t;
      $('#hudInfo').style.direction = 'rtl';
    }
  }
  hurtFlash() { const f = $('#flash'); f.classList.add('on'); clearTimeout(this.flashT); this.flashT = setTimeout(() => f.classList.remove('on'), 80); }
  sleepFade(fn) {
    const s = $('#sleepFade');
    s.classList.add('on');
    setTimeout(() => { fn(); setTimeout(() => s.classList.remove('on'), 300); }, 1500);
  }

  // ---------- inventory ----------
  toggleInventory() {
    const open = this.sheets.find(x => x.kind === 'inv');
    if (open) { open.close(); return; }
    if (this.app.game.mode === 'creative') this.openCreative(); else this.openCrafting(false);
  }
  invGrid(onTap, opts = {}) {
    const g = this.app.game;
    const wrap = h('div');
    const render = () => {
      wrap.innerHTML = '';
      const back = h('div', { class: 'inv c9' }), hot = h('div', { class: 'inv c9' });
      for (let i = 9; i < 36; i++) back.append(this.slotEl(g.inv.slots[i], { cls: this.carry && this.carry.i === i ? 'pick' : '', onTap: () => onTap(i), onLong: opts.onLong && (() => opts.onLong(i)), onDouble: opts.onDouble && (() => opts.onDouble(i)) }));
      for (let i = 0; i < 9; i++) hot.append(this.slotEl(g.inv.slots[i], { cls: 'hot' + (this.carry && this.carry.i === i ? ' pick' : ''), onTap: () => onTap(i), onLong: opts.onLong && (() => opts.onLong(i)), onDouble: opts.onDouble && (() => opts.onDouble(i)) }));
      wrap.append(back, h('div', { class: 'inv-sep' }), hot);
    };
    render();
    wrap.render = render;
    return wrap;
  }
  // tap a stack to pick it up, tap another slot to drop / merge / swap; long-press takes half; double-tap moves it between hotbar and backpack
  invTap(i, refresh) {
    const inv = this.app.game.inv, sl = inv.slots;
    if (!this.carry) { if (sl[i]) { this.carry = { i }; refresh(); } return; }
    const from = this.carry.i, half = this.carry.half;
    this.carry = null;
    if (from === i) { refresh(); return; }
    const a = sl[from], b = sl[i];
    if (!a) { refresh(); return; }
    if (half) {
      const n = Math.ceil(a.count / 2);
      if (!b) { sl[i] = { ...a, count: n }; a.count -= n; if (!a.count) sl[from] = null; }
      else if (b.id === a.id && b.count < maxStack(b.id)) { const k = Math.min(n, maxStack(b.id) - b.count); b.count += k; a.count -= k; if (!a.count) sl[from] = null; }
    } else if (b && b.id === a.id && b.dur === undefined && b.count < maxStack(b.id)) {
      const k = Math.min(a.count, maxStack(b.id) - b.count); b.count += k; a.count -= k; if (!a.count) sl[from] = null;
    } else { sl[i] = a; sl[from] = b; }
    inv.changed(); refresh();
  }
  quickMove(i) {
    const inv = this.app.game.inv, sl = inv.slots, st = sl[i];
    if (!st) return;
    const range2 = i < 9 ? [9, 36] : [0, 9];
    for (let j = range2[0]; j < range2[1] && st.count; j++) { const b = sl[j]; if (b && b.id === st.id && b.dur === undefined && b.count < maxStack(b.id)) { const k = Math.min(st.count, maxStack(b.id) - b.count); b.count += k; st.count -= k; } }
    for (let j = range2[0]; j < range2[1] && st.count; j++) if (!sl[j]) { sl[j] = { ...st }; st.count = 0; }
    if (!st.count) sl[i] = null;
    this.carry = null;
    inv.changed();
  }

  openCrafting(table) {
    const g = this.app.game;
    if (g.mode === 'creative' && !table) { this.openCreative(); return; }
    const body = h('div');
    const carryRow = h('div', { class: 'carry' });
    const recWrap = h('div', { class: 'recipes' });
    const grid = this.invGrid(i => this.invTap(i, refresh), { onLong: i => { if (!this.carry && g.inv.slots[i] && g.inv.slots[i].count > 1) { this.carry = { i, half: true }; refresh(); } }, onDouble: i => this.quickMove(i) });
    let armorRowReady = false;
    const filterSeg = seg([['can', 'المتاح'], ['all', 'الكل']], this.recipeFilter, v => { this.recipeFilter = v; renderRec(); });
    const renderRec = () => {
      recWrap.innerHTML = '';
      let list = RECIPES.map(r => ({ r, can: canCraft(r, g.inv) && (table || !r.big), max: maxCrafts(r, g.inv) }));
      if (this.recipeFilter === 'can') list = list.filter(x => x.can);
      list.sort((a, b) => (b.can - a.can) || ((a.r.big - b.r.big)));
      const needTable = table ? 0 : RECIPES.filter(r => r.big && canCraft(r, g.inv)).length;
      if (!list.length) recWrap.append(h('div', { class: 'st', style: { padding: '14px 6px', color: 'var(--label-2)', fontSize: '14px', lineHeight: '20px' } },
        table ? 'مفيش حاجة تقدر تصنعها بالخامات اللي معاك. اجمع خشب وحجر.'
          : needTable ? `معاك خامات لـ ${this.fmt(needTable)} وصفة محتاجين طاولة صناعة. اعمل طاولة من ٤ ألواح خشب وحطها ودوس عليها.`
          : 'ابدأ بخشب: اكسر جذع شجرة. وصفات كتير محتاجة طاولة صناعة.'));
      for (const { r, can, max } of list.slice(0, 80)) {
        const chips = r.need.map(n => {
          const have = g.inv.count(n.key);
          const id = typeof n.key === 'string' ? tagIcon(n.key) : n.key;
          return h('span', { class: 'chip' + (have < n.n ? ' miss' : ''), title: typeof n.key === 'string' ? tagName(n.key) : nameOf(n.key) }, h('img', { class: 'px', src: iconURL(id), alt: '' }), this.fmt(n.n));
        });
        const needsTable = r.big && !table;
        recWrap.append(h('div', { class: 'rec' + (can ? '' : ' no') },
          h('img', { class: 'px', src: iconURL(r.out), alt: '' }),
          h('div', { class: 'info' }, h('div', { class: 'nm' }, nameOf(r.out) + (r.count > 1 ? ' ×' + this.fmt(r.count) : '')), h('div', { class: 'ing' }, chips, needsTable ? h('span', { class: 'lock' }, '· محتاج طاولة') : null)),
          h('div', { class: 'acts' },
            can && max > 1 ? h('button', { class: 'pill gray', onclick: () => doCraft(r, Math.min(max, Math.floor(64 / r.count) || 1)) }, '×' + this.fmt(Math.min(max, Math.floor(64 / r.count) || 1))) : null,
            h('button', { class: 'pill', disabled: !can, onclick: () => doCraft(r, 1) }, 'اصنع'))));
      }
    };
    const doCraft = (r, n) => {
      const res = craft(r, g.inv, n);
      if (!res) return;
      if (res.left) g.entities.drop(r.out, res.left, g.player.x, g.player.y + 1, g.player.z);
      this.app.sound.play('craft');
      if (this.s.haptics && navigator.vibrate) navigator.vibrate(10);
      this.toast(`صنعت ${nameOf(r.out)}${r.count * n > 1 ? ' ×' + this.fmt(r.count * n) : ''}`, iconURL(r.out));
      refresh();
    };
    const refresh = () => {
      grid.render(); renderRec(); if (typeof renderArmor === 'function' && armorRowReady) renderArmor();
      const c = this.carry && g.inv.slots[this.carry.i];
      carryRow.innerHTML = '';
      if (c) carryRow.append(h('img', { class: 'px', src: iconURL(c.id), alt: '' }), (this.carry.half ? 'نص ' : '') + nameOf(c.id) + ' — دوس على الخانة اللي عايز تحطه فيها');
      else carryRow.append('دوس على حاجة عشان تنقلها · دوستين تنقلها للشريط · مطوّل تقسمها');
    };
    const armorRow = h('div', { class: 'inv armor-row' });
    const renderArmor = () => {
      armorRow.innerHTML = '';
      const labels = ['خوذة', 'صدر', 'رجلين', 'قدم'];
      g.inv.armor.forEach((a, k) => armorRow.append(this.slotEl(a, { cls: 'armor-slot' + (a ? '' : ' empty-' + k), onTap: () => {
        const c = this.carry && g.inv.slots[this.carry.i];
        if (c && armorOf(c.id) && armorOf(c.id).slot === k) { g.inv.equip(this.carry.i); this.carry = null; this.app.sound.play('door'); }
        else if (a) g.inv.unequip(k);
        else this.toast('شيل ' + labels[k] + ' من الحقيبة ودوس هنا، أو البسها من الشريط');
        refresh();
      } })));
      armorRow.append(h('div', { class: 'def' }, h('span', { html: IC.shield }), this.fmt(g.inv.defense())));
    };
    body.append(carryRow, h('div', { class: 'two-col' },
      h('div', { class: 'panel' }, h('div', { class: 'tabs-row', style: { padding: '0 0 8px' } }, h('h4', { style: { margin: 0, flex: 'none' } }, table ? 'وصفات الطاولة' : 'اصنع'), filterSeg), recWrap),
      h('div', { class: 'panel' }, h('h4', null, 'الدروع'), armorRow, h('h4', { style: { marginTop: '10px' } }, 'الحقيبة'), grid)));
    armorRowReady = true;
    refresh();
    this.invRefresh = refresh;
    const sh = this.sheet({ title: table ? 'طاولة الصناعة' : 'الحقيبة', body, game: true, side: true, onClose: () => { this.carry = null; this.invRefresh = null; } });
    sh.kind = 'inv';
  }

  openCreative() {
    const g = this.app.game;
    const lists = creativeList();
    const body = h('div');
    const gridEl = h('div', { class: 'cgrid' });
    const hot = h('div', { class: 'inv c9', style: { padding: '0 12px 12px' } });
    let q = '';
    const tabs = [['build', 'بناء'], ['nature', 'طبيعة'], ['misc', 'أدوات بيت'], ['tools', 'عِدّة'], ['food', 'أكل']];
    const renderHot = () => { hot.innerHTML = ''; for (let i = 0; i < 9; i++) hot.append(this.slotEl(g.inv.slots[i], { cls: i === g.inv.selected ? 'pick' : 'hot', onTap: () => { g.inv.selected = i; g.inv.changed(); renderHot(); }, onLong: () => { g.inv.slots[i] = null; g.inv.changed(); renderHot(); } })); };
    const render = () => {
      gridEl.innerHTML = '';
      let ids = q ? [...new Set(Object.values(lists).flat())].filter(id => nameOf(id).includes(q)) : lists[this.creativeTab];
      if (!ids.length) gridEl.append(h('div', { class: 'st', style: { gridColumn: '1/-1', padding: '16px', textAlign: 'center', color: 'var(--label-2)' } }, 'مفيش نتايج'));
      for (const id of ids) gridEl.append(this.slotEl({ id, count: 1 }, { onTap: () => {
        g.inv.slots[g.inv.selected] = stack(id, maxStack(id)); g.inv.changed(); renderHot(); this.app.sound.play('click');
        if (this.s.haptics && navigator.vibrate) navigator.vibrate(6);
      } }));
    };
    const tabSeg = seg(tabs, this.creativeTab, v => { this.creativeTab = v; q = ''; sInput.value = ''; render(); });
    const sInput = h('input', { type: 'search', placeholder: 'بحث', dir: 'auto', 'aria-label': 'بحث', oninput: e => { q = e.target.value.trim(); render(); } });
    body.append(h('div', { class: 'tabs-row' }, h('div', { class: 'search' }, h('span', { html: IC.search }), sInput)), h('div', { class: 'tabs-row' }, tabSeg), gridEl,
      h('div', { class: 'carry' }, 'اختار خانة من الشريط تحت، ودوس على أي بلوك تحطه فيها · مطوّل تفضّي الخانة'), hot);
    render(); renderHot();
    this.invRefresh = renderHot;
    const sh = this.sheet({ title: 'كل البلوكات', body, game: true, side: true, onClose: () => { this.invRefresh = null; } });
    sh.kind = 'inv';
  }

  moveToContainer(st, slots, accept) {
    for (let j = 0; j < slots.length && st.count; j++) { const b = slots[j]; if (b && b.id === st.id && b.dur === undefined && b.count < maxStack(b.id) && (!accept || accept(j))) { const k = Math.min(st.count, maxStack(b.id) - b.count); b.count += k; st.count -= k; } }
    for (let j = 0; j < slots.length && st.count; j++) if (!slots[j] && (!accept || accept(j))) { slots[j] = { ...st }; st.count = 0; }
  }
  openChest(be) {
    const g = this.app.game;
    const body = h('div');
    const chestGrid = h('div', { class: 'inv c9' });
    let grid;
    const refresh = () => {
      chestGrid.innerHTML = '';
      be.slots.forEach((st, i) => chestGrid.append(this.slotEl(st, { onTap: () => { if (!st) return; const left = g.inv.add(st.id, st.count, st.dur); if (left) st.count = left; else be.slots[i] = null; this.app.sound.play('click'); refresh(); } })));
      grid.render();
    };
    grid = this.invGrid(i => { const st = g.inv.slots[i]; if (!st) return; this.moveToContainer(st, be.slots); if (!st.count) g.inv.slots[i] = null; g.inv.changed(); refresh(); });
    body.append(h('div', { class: 'carry' }, 'دوس على أي حاجة عشان تنقلها بين الصندوق والحقيبة'), h('div', { class: 'two-col' }, h('div', { class: 'panel' }, h('h4', null, 'الصندوق'), chestGrid), h('div', { class: 'panel' }, h('h4', null, 'الحقيبة'), grid)));
    refresh();
    this.invRefresh = refresh;
    const sh = this.sheet({ title: 'صندوق', body, game: true, side: true, onClose: () => { this.invRefresh = null; this.app.sound.play('door'); } });
    sh.kind = 'inv';
  }
  openFurnace(be) {
    const g = this.app.game;
    const body = h('div');
    const fz = h('div', { class: 'furnace' });
    let grid;
    const takeBack = key => { const st = be[key]; if (!st) return; const left = g.inv.add(st.id, st.count, st.dur); if (left) st.count = left; else be[key] = null; refresh(); };
    const flame = h('div', { class: 'flame' }, h('span', { html: IC.flame }), h('span', { class: 'fill', html: IC.flame }));
    const arrow = h('div', { class: 'arrow' }, h('b'));
    const slots = {};
    const renderSlots = () => {
      fz.innerHTML = '';
      slots.input = this.slotEl(be.input, { onTap: () => takeBack('input') });
      slots.fuel = this.slotEl(be.fuel, { onTap: () => takeBack('fuel') });
      slots.output = this.slotEl(be.output, { onTap: () => takeBack('output') });
      fz.append(h('div', { class: 'col' }, slots.input, h('div', { class: 'lbl' }, 'خامة'), flame, slots.fuel, h('div', { class: 'lbl' }, 'وقود')), arrow, h('div', { class: 'col' }, slots.output, h('div', { class: 'lbl' }, 'الناتج')));
    };
    const live = () => {
      flame.style.setProperty('--f', (be.burn > 0 && be.burnMax ? (1 - be.burn / be.burnMax) * 100 : 100) + '%');
      arrow.firstChild.style.width = (be.progress * 100) + '%';
      const sig = JSON.stringify([be.input, be.fuel, be.output]);
      if (sig !== this.furnSig) { this.furnSig = sig; renderSlots(); grid && grid.render(); }
    };
    const refresh = () => { this.furnSig = ''; live(); grid.render(); };
    grid = this.invGrid(i => {
      const st = g.inv.slots[i]; if (!st) return;
      const key = smeltOf(st.id) ? 'input' : fuelOf(st.id) ? 'fuel' : null;
      if (!key) { this.toast('ده مش بيتطبخ ولا بيولّع'); return; }
      const cur = be[key];
      if (!cur) { be[key] = { ...st }; g.inv.slots[i] = null; }
      else if (cur.id === st.id) { const k = Math.min(st.count, maxStack(st.id) - cur.count); cur.count += k; st.count -= k; if (!st.count) g.inv.slots[i] = null; }
      else { be[key] = { ...st }; g.inv.slots[i] = cur; }
      g.inv.changed(); refresh();
    });
    body.append(h('div', { class: 'carry' }, 'دوس على خام أو أكل نيّء يتحط في الفرن، وعلى فحم أو خشب يبقى وقود'), h('div', { class: 'two-col' }, h('div', { class: 'panel' }, h('h4', null, 'الفرن'), fz), h('div', { class: 'panel' }, h('h4', null, 'الحقيبة'), grid)));
    renderSlots(); live();
    const timer = setInterval(live, 200);
    this.invRefresh = () => grid.render();
    const sh = this.sheet({ title: 'فرن', body, game: true, side: true, onClose: () => { clearInterval(timer); this.invRefresh = null; } });
    sh.kind = 'inv';
  }
  openSign(be, onDone) {
    const ta = h('textarea', { class: 'sign-input', dir: 'auto', maxlength: 90, rows: 4, placeholder: 'اكتب أي حاجة… بالعربي أو الإنجليزي' });
    ta.value = be.text || '';
    const body = h('div', { class: 'group', style: { marginTop: '6px' } }, ta, h('div', { class: 'group-f' }, 'لحد ٤ سطور. الحروف العربية بتتشبك وبتتقري من اليمين للشمال صح.'));
    const sh = this.sheet({ title: 'لافتة', body, game: true, right: h('button', { class: 'nav-btn', style: { fontWeight: 600 }, onclick: () => { be.text = ta.value.split('\n').slice(0, 4).join('\n'); sh.close(); onDone && onDone(); } }, 'تم'), left: h('button', { class: 'nav-btn', onclick: () => sh.close() }, 'إلغاء') });
    setTimeout(() => ta.focus(), 400);
  }

  // ---------- pause / death ----------
  pause() {
    const app = this.app, g = app.game;
    if (!g || this.sheets.find(x => x.kind === 'pause')) return;
    app.setPaused(true);
    const body = h('div');
    const timeRow = g.mode === 'creative' ? h('div', { class: 'row stack' }, h('div', { class: 't' }, 'الوقت'), seg([[0, 'الصبح'], [6000, 'الضهر'], [12000, 'المغرب'], [18000, 'الليل']], -1, v => { g.meta.time = v; this.toast('اتغيّر الوقت'); })) : null;
    body.append(
      h('div', { class: 'group' }, h('div', { class: 'list' },
        actRow(IC.play, 'var(--green)', 'متابعة اللعب', () => sh.close()),
        actRow(IC.gear, 'var(--gray)', 'الإعدادات', () => { sh.close(true); app.setPaused(true); this.settingsPage('root', true); }),
        isTouch ? actRow(IC.move, 'var(--blue)', 'تخصيص الأزرار', () => { sh.close(true); app.editLayout(); }) : null,
        actRow(IC.camera, 'var(--indigo)', 'لقطة شاشة', () => { sh.close(); setTimeout(() => app.screenshot(), 350); }))),
      h('div', { class: 'group' }, h('div', { class: 'list' },
        h('div', { class: 'row stack' }, h('div', { class: 't' }, 'الصعوبة'), seg([[0, 'سِلمي'], [1, 'سهل'], [2, 'عادي'], [3, 'صعب']], g.difficulty, v => { g.meta.difficulty = v; })),
        timeRow)),
      h('div', { class: 'group' }, h('div', { class: 'list' }, h('button', { class: 'row tap danger center', onclick: () => { sh.close(true); app.quit(); } }, h('div', { class: 't' }, 'حفظ والخروج')))),
      h('div', { class: 'group-f', style: { textAlign: 'center', padding: '0 16px 12px' } }, `«${g.meta.name}» · اليوم ${this.fmt(g.meta.day || 1)}`));
    const sh = this.sheet({ title: 'متوقفة مؤقتاً', body, onClose: () => { if (!sh.keepPaused) app.setPaused(false); } });
    const close = sh.close; sh.close = keep => { sh.keepPaused = keep === true; close(); };
    sh.kind = 'pause';
    g.save();
  }
  showDeath(msg, day) {
    const el = $('#death');
    el.innerHTML = '';
    el.append(h('h1', null, 'مِتّ!'), h('p', null, msg + (msg ? ' · ' : '') + 'وصلت لليوم ' + this.fmt(day)),
      h('button', { class: 'glass-btn primary', onclick: () => { el.classList.remove('show'); this.app.respawn(); } }, 'ارجع للحياة'),
      h('button', { class: 'glass-btn', onclick: () => { el.classList.remove('show'); this.app.quit(); } }, 'القائمة الرئيسية'));
    this.closeAllSheets();
    el.classList.add('show');
    this.app.input.exitLock();
  }
  loading(p, title) {
    $('#ringFg').style.strokeDashoffset = 169.6 * (1 - p);
    if (title) $('#loadTitle').textContent = title;
  }
  showLoading() {
    this.show('loading');
    $('#loadTip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
    this.loading(0, 'بنجهّز العالم…');
  }

  layoutEditor() {
    const app = this.app, s = this.s;
    const panel = h('div', { class: 'edit-panel' });
    let sel = 'jump';
    const nameAr = { joystick: 'عصا الحركة', jump: 'القفز', sneak: 'الانحناء', sprint: 'الجري', flyUp: 'طيران لفوق', flyDown: 'طيران لتحت', attack: 'الضرب', use: 'الاستخدام' };
    const render = () => {
      panel.innerHTML = '';
      const l = s.layout[sel];
      panel.append(
        h('div', { class: 'r' }, h('b', null, nameAr[sel] || sel), h('span', { class: 'st', style: { fontSize: '12px', color: 'var(--label-2)' } }, 'اسحب أي زرار لمكانه، واختاره عشان تغيّر حجمه')),
        h('div', { class: 'r' }, h('b', null, 'الحجم'), slider(l.s, 0.6, 1.8, 0.05, v => { l.s = v; app.input.layoutButtons(); }, v => this.pct(v))),
        h('div', { class: 'r' }, h('b', null, 'الوضوح'), slider(s.buttonOpacity, 0.2, 1, 0.05, v => { s.buttonOpacity = v; app.input.layoutButtons(); }, v => this.pct(v))),
        h('div', { class: 'acts' },
          h('button', { class: 'btn gray', onclick: () => { s.layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); s.buttonOpacity = 0.55; app.input.s = s; app.input.layoutButtons(); render(); } }, 'الافتراضي'),
          h('button', { class: 'btn', onclick: () => { app.input.setEditing(false); panel.remove(); app.saveSettings(); app.endEditLayout(); } }, 'حفظ')));
    };
    app.input.setEditing(true, name => { sel = name; render(); });
    document.body.append(panel);
    render();
  }
}

// ---------- helpers ----------
function range(n) { return Array.from({ length: n }, (_, i) => i); }
function relTime(t) {
  if (!t) return 'جديد';
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'دلوقتي';
  if (d < 3600) return `من ${Math.round(d / 60)} دقيقة`;
  if (d < 86400) return `من ${Math.round(d / 3600)} ساعة`;
  if (d < 86400 * 2) return 'امبارح';
  return `من ${Math.round(d / 86400)} يوم`;
}
function bindTap(el, onTap, onLong, onDouble) {
  let t0 = 0, timer = null, longed = false, lastTap = 0, x0 = 0, y0 = 0;
  el.addEventListener('pointerdown', e => {
    e.stopPropagation(); t0 = performance.now(); longed = false; x0 = e.clientX; y0 = e.clientY;
    if (onLong) timer = setTimeout(() => { longed = true; onLong(); }, 480);
  });
  el.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) clearTimeout(timer); });
  el.addEventListener('pointerup', e => {
    e.stopPropagation(); clearTimeout(timer);
    if (longed) return;
    const now = performance.now();
    if (onDouble && now - lastTap < 300) { lastTap = 0; onDouble(); return; }
    lastTap = now;
    onTap && onTap();
  });
  el.addEventListener('pointercancel', () => clearTimeout(timer));
  el.addEventListener('contextmenu', e => e.preventDefault());
}
function toggle(val, onChange) {
  const inp = h('input', { type: 'checkbox', role: 'switch' });
  inp.checked = !!val;
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label', { class: 'switch' }, inp, h('span'));
}
function seg(opts, val, onChange) {
  const el = h('div', { class: 'seg', role: 'tablist' });
  for (const [v, label] of opts) {
    const b = h('button', { class: v === val ? 'on' : '', role: 'tab', 'aria-selected': v === val ? 'true' : 'false', type: 'button' }, label);
    b.onclick = () => { for (const c of el.children) { c.classList.remove('on'); c.setAttribute('aria-selected', 'false'); } b.classList.add('on'); b.setAttribute('aria-selected', 'true'); onChange(v); };
    el.append(b);
  }
  return el;
}
function slider(val, min, max, step, onChange, show) {
  const out = h('span', { class: 'sv num' }, show(val));
  const inp = h('input', { type: 'range', min, max, step, value: val });
  const paint = () => inp.style.setProperty('--p', ((inp.value - min) / (max - min) * 100) + '%');
  inp.addEventListener('input', () => { const v = +inp.value; out.textContent = show(v); paint(); onChange(v); });
  paint();
  return h('div', { class: 'slider' }, inp, out);
}
function sliderRow(label, val, min, max, step, onChange, show) {
  return h('div', { class: 'row stack', style: { gap: '0', paddingBottom: '0' } }, h('div', { class: 't' }, label), slider(val, min, max, step, onChange, show));
}
function iconRow(icon, color, label, trailing) {
  return h('div', { class: 'row has-icon' }, h('div', { class: 'tile', style: { background: color }, html: icon }), h('div', { class: 'grow' }, h('div', { class: 't' }, label)), trailing);
}
function navRow(icon, color, label, value, fn) {
  return h('button', { class: 'row has-icon tap', onclick: fn }, h('div', { class: 'tile', style: { background: color }, html: icon }), h('div', { class: 'grow' }, h('div', { class: 't' }, label)), value ? h('span', { class: 'val' }, value) : null, h('span', { html: IC.chev, style: { display: 'flex' } }));
}
function actRow(icon, color, label, fn) {
  return h('button', { class: 'row has-icon tap', onclick: fn }, h('div', { class: 'tile', style: { background: color }, html: icon }), h('div', { class: 'grow' }, h('div', { class: 't' }, label)));
}
function swRow(label, val, onChange) { return h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, label)), toggle(val, onChange)); }
function tagIcon(tag) { return { '#planks': B.PLANKS, '#log': B.LOG, '#coal': I.COAL, '#stone': B.COBBLE }[tag] || B.PLANKS; }
function tagName(tag) { return { '#planks': 'أي ألواح خشب', '#log': 'أي جذع', '#coal': 'فحم أو فحم نباتي', '#stone': 'حجر مكسّر' }[tag] || ''; }
function faceCanvas() {
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
  const g = cv.getContext('2d');
  g.fillStyle = '#c4966f'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#3b2a1e'; g.fillRect(0, 0, 8, 2);
  g.fillStyle = '#fff'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1); g.fillStyle = '#335'; g.fillRect(2, 3, 1, 1); g.fillRect(5, 3, 1, 1);
  g.fillStyle = '#8a5a44'; g.fillRect(3, 6, 2, 1);
  return cv;
}
export { h, IC };
export { BIOME_NAMES, info, BLOCKS };
