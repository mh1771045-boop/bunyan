// Procedural pixel art for Bunyan: every tile, icon and skin is painted here in code.
import { TILES, TILE, BLOCKS, ITEMS, I, B } from './blocks.js';
import { mulberry32 } from './noise.js';

const T = 16;
const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;

class Tile {
  constructor(seed) { this.d = new Uint8ClampedArray(T * T * 4); this.r = mulberry32(seed * 9973 + 17); }
  set(x, y, c, a = 255) { if (x < 0 || y < 0 || x >= T || y >= T) return; const i = (y * T + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a; }
  get(x, y) { const i = (y * T + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  fill(c, v = 10, a = 255) { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const n = (this.r() - 0.5) * 2 * v; this.set(x, y, [clamp(c[0] + n), clamp(c[1] + n), clamp(c[2] + n)], a); } return this; }
  specks(c, n, v = 10, size = 1) { for (let k = 0; k < n; k++) { const x = (this.r() * T) | 0, y = (this.r() * T) | 0; for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) { const m = (this.r() - 0.5) * v; this.set(x + dx, y + dy, [clamp(c[0] + m), clamp(c[1] + m), clamp(c[2] + m)]); } } return this; }
  blobs(c, n, v = 14) { // little 2-4 pixel clusters (ore spots)
    for (let k = 0; k < n; k++) {
      const cx = 2 + ((this.r() * 12) | 0), cy = 2 + ((this.r() * 12) | 0);
      const cnt = 2 + ((this.r() * 3) | 0);
      for (let j = 0; j < cnt; j++) {
        const x = cx + ((this.r() * 3) | 0) - 1, y = cy + ((this.r() * 3) | 0) - 1, m = (this.r() - 0.5) * v;
        this.set(x, y, [clamp(c[0] + m), clamp(c[1] + m), clamp(c[2] + m)]);
        if (this.r() < 0.5) this.set(x + 1, y, [clamp(c[0] * 0.75), clamp(c[1] * 0.75), clamp(c[2] * 0.75)]);
      }
    }
    return this;
  }
  shade(fn) { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const p = this.get(x, y); const k = fn(x, y); this.set(x, y, [clamp(p[0] * k), clamp(p[1] * k), clamp(p[2] * k)], p[3]); } return this; }
  clear() { this.d.fill(0); return this; }
  border(c, a = 255) { for (let i = 0; i < T; i++) { this.set(i, 0, c, a); this.set(i, T - 1, c, a); this.set(0, i, c, a); this.set(T - 1, i, c, a); } return this; }
  map(rows, pal) { for (let y = 0; y < T; y++) { const row = rows[y] || ''; for (let x = 0; x < T; x++) { const ch = row[x]; if (!ch || ch === '.' || ch === ' ') continue; const c = pal[ch]; if (!c) continue; const m = (this.r() - 0.5) * (c[3] ?? 10); this.set(x, y, [clamp(c[0] + m), clamp(c[1] + m), clamp(c[2] + m)]); } } return this; }
  cells(pal, n, edge) { // voronoi stones
    const pts = []; for (let k = 0; k < n; k++) pts.push([this.r() * T, this.r() * T, pal[(this.r() * pal.length) | 0]]);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let b1 = 1e9, b2 = 1e9, c = null;
      for (const p of pts) for (let ox = -T; ox <= T; ox += T) for (let oy = -T; oy <= T; oy += T) {
        const dx = x - p[0] - ox, dy = y - p[1] - oy, d = dx * dx + dy * dy;
        if (d < b1) { b2 = b1; b1 = d; c = p[2]; } else if (d < b2) b2 = d;
      }
      const isEdge = Math.sqrt(b2) - Math.sqrt(b1) < 1.1;
      const m = (this.r() - 0.5) * 12;
      const col = isEdge ? edge : c;
      this.set(x, y, [clamp(col[0] + m), clamp(col[1] + m), clamp(col[2] + m)]);
    }
    return this;
  }
}

const C = {
  stone: [128, 128, 130], dirt: [128, 90, 62], grass: [92, 156, 58], sand: [222, 209, 160], wood: [176, 138, 84], woodDark: [118, 88, 52],
  bark: [96, 74, 46], leaf: [62, 128, 44], water: [48, 98, 210],
};

function planks(t, base, dark) {
  t.fill(base, 8);
  for (let y = 0; y < T; y++) {
    const row = y >> 2;
    for (let x = 0; x < T; x++) {
      if ((y & 3) === 3) t.set(x, y, dark);
      const seam = (row % 2 === 0 ? 4 : 12);
      if (x === seam && (y & 3) !== 3) t.set(x, y, dark);
    }
  }
  t.shade((x, y) => 0.94 + ((x * 7 + y * 3) % 5) * 0.02);
  return t;
}
function leaves(t, c, holes = 0.22) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (t.r() < holes) { t.set(x, y, [0, 0, 0], 0); continue; }
    const k = 0.7 + t.r() * 0.5;
    t.set(x, y, [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)]);
  }
  return t;
}
function bark(t, c) {
  t.fill(c, 10);
  for (let x = 0; x < T; x++) if (t.r() < 0.4) for (let y = 0; y < T; y++) if (t.r() < 0.8) { const p = t.get(x, y); t.set(x, y, [p[0] * 0.78, p[1] * 0.78, p[2] * 0.78]); }
  return t;
}
function rings(t, light, dark, barkC) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    let c = d > 6.6 ? barkC : ((d | 0) % 2 ? dark : light);
    const m = (t.r() - 0.5) * 10;
    t.set(x, y, [clamp(c[0] + m), clamp(c[1] + m), clamp(c[2] + m)]);
  }
  return t;
}
function ore(t, spot, n = 6) { t.fill(C.stone, 12).specks([105, 105, 108], 18); return t.blobs(spot, n, 16); }
function metal(t, c) {
  t.fill(c, 5);
  t.shade((x, y) => (x === 0 || y === 0) ? 1.25 : (x === 15 || y === 15) ? 0.7 : (x + y < 10 && (x === 2 || y === 2)) ? 1.15 : 1);
  for (let k = 3; k < 7; k++) t.set(k, 3, [clamp(c[0] * 1.3), clamp(c[1] * 1.3), clamp(c[2] * 1.3)]);
  return t;
}
function bricks(t, brick, mortar, h = 4, w = 8) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const row = (y / h) | 0, off = row % 2 ? w / 2 : 0;
    const isM = y % h === h - 1 || (x + off) % w === w - 1;
    const c = isM ? mortar : brick;
    const m = (t.r() - 0.5) * (isM ? 8 : 18);
    t.set(x, y, [clamp(c[0] + m), clamp(c[1] + m), clamp(c[2] + m)]);
  }
  return t;
}
function wool(t, c) { t.fill(c, 7); t.shade((x, y) => ((x + y * 2) % 4 === 0) ? 0.93 : ((x * 2 + y) % 5 === 0 ? 1.05 : 1)); return t; }
function plantStem(t, x, top, col) { for (let y = top; y < T; y++) t.set(x, y, col); }

function crack(t, stage, seed) {
  t.clear();
  const r = mulberry32(seed);
  const lines = 2 + stage * 2;
  for (let l = 0; l < lines; l++) {
    let x = 7.5 + (r() - 0.5) * 4, y = 7.5 + (r() - 0.5) * 4;
    const a = r() * Math.PI * 2, len = 3 + stage * 0.8 + r() * 3;
    let dx = Math.cos(a), dy = Math.sin(a);
    for (let s = 0; s < len; s++) {
      t.set(x | 0, y | 0, [20, 20, 20], 200);
      x += dx; y += dy; dx += (r() - 0.5) * 0.6; dy += (r() - 0.5) * 0.6;
      const n = Math.hypot(dx, dy); dx /= n; dy /= n;
    }
  }
  return t;
}

const PAINT = {
  stone: t => t.fill(C.stone, 12).specks([108, 108, 110], 22).specks([150, 150, 152], 10),
  dirt: t => t.fill(C.dirt, 12).specks([102, 70, 46], 26).specks([150, 112, 80], 12),
  grass_top: t => t.fill(C.grass, 14).specks([74, 132, 44], 30).specks([116, 178, 72], 14),
  grass_side: t => {
    PAINT.dirt(t);
    for (let x = 0; x < T; x++) { const d = 3 + ((t.r() * 3) | 0) - (x % 5 === 0 ? 1 : 0); for (let y = 0; y < d; y++) { const k = 0.85 + t.r() * 0.3; t.set(x, y, [clamp(C.grass[0] * k), clamp(C.grass[1] * k), clamp(C.grass[2] * k)]); } }
    return t;
  },
  cobble: t => t.cells([[132, 132, 134], [112, 112, 114], [146, 146, 148], [122, 122, 124]], 9, [72, 72, 74]),
  planks: t => planks(t, C.wood, C.woodDark),
  bedrock: t => t.fill([70, 70, 72], 30).specks([30, 30, 32], 40, 10, 2).specks([120, 120, 120], 14),
  sand: t => t.fill(C.sand, 8).specks([200, 188, 140], 26).specks([238, 228, 186], 14),
  gravel: t => t.cells([[132, 124, 120], [110, 104, 100], [150, 140, 132], [96, 92, 90], [140, 120, 100]], 14, [80, 76, 74]),
  log_side: t => bark(t, C.bark),
  log_top: t => rings(t, [186, 150, 96], [160, 124, 76], C.bark),
  leaves: t => leaves(t, C.leaf),
  glass: t => {
    t.clear();
    t.border([214, 238, 246], 255);
    for (let k = 0; k < 4; k++) { t.set(3 + k, 4 - k + 3, [236, 250, 255]); t.set(9 + k, 12 - k, [236, 250, 255]); }
    t.set(1, 1, [255, 255, 255]); t.set(14, 14, [180, 210, 220]);
    return t;
  },
  water: t => { t.fill(C.water, 10, 190); for (let y = 0; y < T; y += 4) for (let x = 0; x < T; x++) if (((x + y) >> 1) % 3 === 0) t.set(x, y + ((x >> 2) % 2), [96, 150, 238], 200); return t; },
  water_flow: t => { t.fill([44, 92, 205], 12, 190); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x * 2 + y) % 7 === 0) t.set(x, y, [100, 152, 240], 200); return t; },
  coal_ore: t => ore(t, [36, 36, 38], 6),
  iron_ore: t => ore(t, [214, 172, 142], 5),
  gold_ore: t => ore(t, [250, 214, 64], 5),
  diamond_ore: t => ore(t, [96, 232, 224], 4),
  table_top: t => { planks(t, [182, 140, 86], [120, 88, 52]); t.border([96, 70, 40]); for (let i = 1; i < 15; i++) { t.set(i, 5, [110, 80, 46]); t.set(i, 10, [110, 80, 46]); t.set(5, i, [110, 80, 46]); t.set(10, i, [110, 80, 46]); } return t; },
  table_side: t => { planks(t, [168, 128, 78], [112, 82, 48]); for (let x = 0; x < T; x++) { t.set(x, 0, [96, 70, 40]); t.set(x, 1, [130, 98, 60]); } t.map(['', '', '', '...kk.....ss....', '...kk....ssss...', '...kk.....ss....', '...kk.....ss....', '...kk.....ss....', '...kk.....ss....', '....h.....ss....'], { k: [90, 90, 96], s: [120, 90, 56], h: [60, 60, 66] }); return t; },
  table_front: t => { planks(t, [168, 128, 78], [112, 82, 48]); for (let x = 0; x < T; x++) { t.set(x, 0, [96, 70, 40]); t.set(x, 1, [130, 98, 60]); } t.map(['', '', '', '..mmmmm.........', '..mmmmm.....ww..', '....s......w..w.', '....s......w..w.', '....s.......ww..', '....s...........', '....s...........'], { m: [100, 100, 108], s: [120, 90, 56], w: [150, 150, 158] }); return t; },
  furnace_side: t => t.fill([118, 118, 120], 10).specks([96, 96, 98], 24).border([84, 84, 86]),
  furnace_top: t => t.fill([126, 126, 128], 8).specks([100, 100, 102], 16).border([90, 90, 92]),
  furnace_front: t => { PAINT.furnace_side(t); for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) t.set(x, y, [22, 22, 24]); for (let x = 4; x < 12; x++) t.set(x, 7, [70, 70, 72]); for (let x = 5; x < 11; x += 2) t.set(x, 12, [50, 50, 52]); t.map(['', '', '..ssssssssssss..', '..s..........s..', '..ssssssssssss..'], { s: [80, 80, 82] }); return t; },
  furnace_lit: t => { PAINT.furnace_front(t); for (let y = 9; y < 14; y++) for (let x = 5; x < 11; x++) { const k = t.r(); t.set(x, y, k < 0.4 ? [255, 220, 90] : k < 0.8 ? [250, 140, 30] : [200, 60, 20]); } return t; },
  torch: t => { t.clear(); for (let y = 8; y < 16; y++) { t.set(7, y, [120, 88, 50]); t.set(8, y, [96, 70, 40]); } t.set(7, 6, [255, 248, 200]); t.set(8, 6, [255, 230, 120]); t.set(7, 7, [255, 200, 70]); t.set(8, 7, [240, 150, 40]); return t; },
  bricks: t => bricks(t, [150, 74, 58], [180, 168, 160]),
  snow: t => t.fill([242, 248, 252], 5).specks([222, 232, 242], 18),
  snow_side: t => { PAINT.dirt(t); for (let x = 0; x < T; x++) { const d = 3 + ((t.r() * 2) | 0); for (let y = 0; y < d; y++) t.set(x, y, [clamp(240 + (t.r() - 0.5) * 10), 246, 252]); } return t; },
  ice: t => { t.fill([150, 196, 246], 8, 190); for (let k = 0; k < 6; k++) t.set(3 + k, 10 - k, [230, 244, 255], 220); for (let k = 0; k < 4; k++) t.set(9 + k, 6 - k, [230, 244, 255], 220); return t; },
  cactus_side: t => { t.fill([74, 140, 54], 8); for (let y = 0; y < T; y++) { t.set(3, y, [52, 106, 40]); t.set(8, y, [52, 106, 40]); t.set(12, y, [52, 106, 40]); } for (let k = 0; k < 10; k++) t.set((t.r() * 16) | 0, (t.r() * 16) | 0, [220, 226, 170]); for (let y = 0; y < T; y++) { t.set(0, y, [0, 0, 0], 0); t.set(15, y, [0, 0, 0], 0); } return t; },
  cactus_top: t => { t.fill([86, 152, 62], 8); t.border([60, 116, 44]); t.set(7, 7, [220, 226, 170]); t.set(8, 8, [220, 226, 170]); return t; },
  birch_side: t => { t.fill([226, 226, 216], 6); for (let k = 0; k < 9; k++) { const x = (t.r() * 13) | 0, y = (t.r() * 16) | 0, l = 2 + ((t.r() * 3) | 0); for (let i = 0; i < l; i++) t.set(x + i, y, [44, 44, 40]); } return t; },
  birch_top: t => rings(t, [216, 200, 160], [196, 176, 134], [224, 224, 214]),
  birch_leaves: t => leaves(t, [110, 160, 66]),
  spruce_side: t => bark(t, [72, 52, 32]),
  spruce_top: t => rings(t, [150, 112, 68], [124, 90, 54], [72, 52, 32]),
  spruce_leaves: t => leaves(t, [44, 92, 60], 0.18),
  birch_planks: t => planks(t, [212, 192, 140], [160, 140, 96]),
  spruce_planks: t => planks(t, [116, 84, 52], [78, 56, 34]),
  tall_grass: t => { t.clear(); for (let k = 0; k < 9; k++) { const x = 1 + ((t.r() * 14) | 0), h = 5 + ((t.r() * 10) | 0); for (let y = T - 1; y > T - 1 - h; y--) { const c = 0.75 + t.r() * 0.4; t.set(x + (y < 8 && k % 2 ? 1 : 0), y, [clamp(84 * c), clamp(150 * c), clamp(52 * c)]); } } return t; },
  flower_red: t => { t.clear(); plantStem(t, 7, 7, [60, 130, 40]); t.set(6, 11, [60, 130, 40]); t.set(5, 10, [60, 130, 40]); t.map(['', '', '', '.....rrrrr......', '....rrrrrrr.....', '....rrrkrrr.....', '....rrkkkrr.....', '....rrrkrrr.....', '.....rrrrr......'], { r: [214, 30, 34], k: [26, 20, 24] }); return t; },
  flower_yellow: t => { t.clear(); plantStem(t, 7, 8, [60, 130, 40]); t.set(8, 12, [60, 130, 40]); t.set(9, 11, [60, 130, 40]); t.map(['', '', '', '', '......yy.......', '.....yyyy......', '....yyooyy.....', '.....yyyy......', '......yy.......'], { y: [250, 214, 40], o: [220, 140, 30] }); return t; },
  flower_blue: t => { t.clear(); plantStem(t, 7, 8, [60, 130, 40]); t.set(6, 12, [60, 130, 40]); t.map(['', '', '', '.....b..b......', '......bb.......', '....bbwwbb.....', '......bb.......', '.....b..b......'], { b: [70, 110, 230], w: [240, 240, 255] }); return t; },
  dead_bush: t => { t.clear(); t.map(['', '', '', '...b.......b....', '....b.....b.....', '.....b...b...b..', '..b...b.b...b...', '...b...b...b....', '....b..b..b.....', '.....b.b.b......', '......bbb.......', '.......b........', '.......b........', '.......b........', '.......b........'], { b: [128, 88, 46] }); return t; },
  sandstone_side: t => { t.fill([216, 200, 148], 6); for (let x = 0; x < T; x++) { t.set(x, 0, [196, 180, 128]); t.set(x, 5, [200, 184, 132]); t.set(x, 11, [200, 184, 132]); t.set(x, 15, [190, 172, 120]); } return t; },
  sandstone_top: t => t.fill([220, 206, 154], 5).specks([206, 190, 140], 10),
  stone_bricks: t => bricks(t, [124, 124, 126], [88, 88, 90], 8, 16).specks([110, 110, 112], 10),
  bookshelf: t => {
    planks(t, C.wood, C.woodDark);
    const cols = [[160, 40, 40], [40, 80, 160], [50, 130, 60], [190, 150, 50], [110, 50, 130], [200, 200, 190]];
    for (const y0 of [2, 9]) { for (let x = 1; x < 15; x++) { const c = cols[(x * 5 + y0) % cols.length]; const top = y0 + ((x * 3) % 2); for (let y = top; y < y0 + 5; y++) t.set(x, y, c); } }
    return t;
  },
  chest_side: t => { planks(t, [168, 122, 62], [112, 78, 38]); t.border([86, 58, 28]); for (let x = 0; x < T; x++) t.set(x, 5, [86, 58, 28]); return t; },
  chest_front: t => { PAINT.chest_side(t); for (let y = 4; y < 8; y++) for (let x = 6; x < 10; x++) t.set(x, y, y === 4 || y === 7 || x === 6 || x === 9 ? [70, 70, 76] : [200, 200, 210]); return t; },
  chest_top: t => { planks(t, [176, 130, 68], [118, 82, 40]); t.border([86, 58, 28]); return t; },
  bed_top: t => { t.fill([176, 40, 44], 8); for (let y = 0; y < 5; y++) for (let x = 1; x < 15; x++) t.set(x, y, [236, 236, 236]); for (let x = 0; x < T; x++) t.set(x, 5, [140, 30, 34]); return t; },
  bed_side: t => { planks(t, C.wood, C.woodDark); for (let y = 7; y < 12; y++) for (let x = 0; x < T; x++) t.set(x, y, [176, 40, 44]); return t; },
  wool: t => wool(t, [234, 234, 234]),
  wool_red: t => wool(t, [170, 44, 40]),
  wool_blue: t => wool(t, [52, 70, 168]),
  wool_green: t => wool(t, [80, 124, 34]),
  wool_yellow: t => wool(t, [236, 196, 48]),
  wool_black: t => wool(t, [32, 32, 36]),
  lava: t => { t.fill([210, 80, 20], 14); for (let k = 0; k < 12; k++) { const x = (t.r() * 16) | 0, y = (t.r() * 16) | 0; t.set(x, y, [255, 200, 60]); t.set(x + 1, y, [255, 160, 40]); t.set(x, y + 1, [255, 150, 40]); } return t; },
  obsidian: t => t.fill([26, 18, 36], 8).specks([70, 50, 100], 14).specks([12, 8, 18], 16),
  clay: t => t.fill([160, 166, 178], 7).specks([146, 152, 164], 14),
  lamp: t => { t.fill([250, 214, 120], 18); t.border([150, 110, 50]); for (let i = 2; i < 14; i++) { t.set(i, 7, [255, 240, 190]); t.set(7, i, [255, 240, 190]); } return t; },
  farmland: t => { t.fill([96, 64, 40], 10); for (let y = 1; y < T; y += 4) for (let x = 0; x < T; x++) t.set(x, y, [70, 46, 28]); return t; },
  wheat0: t => { t.clear(); for (const x of [3, 7, 11]) for (let y = 13; y < 16; y++) t.set(x, y, [90, 170, 50]); return t; },
  wheat1: t => { t.clear(); for (const x of [2, 5, 8, 11, 13]) for (let y = 10; y < 16; y++) t.set(x, y, [86, 160, 48]); return t; },
  wheat2: t => { t.clear(); for (const x of [1, 4, 7, 10, 13]) for (let y = 6; y < 16; y++) t.set(x + (y < 9 ? 1 : 0), y, y < 9 ? [170, 170, 60] : [96, 150, 50]); return t; },
  wheat3: t => { t.clear(); for (const x of [1, 4, 7, 10, 13]) { for (let y = 6; y < 16; y++) t.set(x, y, [180, 150, 60]); for (let y = 2; y < 7; y++) { t.set(x, y, [222, 190, 80]); t.set(x + 1, y, [200, 166, 64]); } } return t; },
  sapling: t => { t.clear(); plantStem(t, 7, 8, [110, 80, 46]); t.map(['', '', '...gg..gg......', '..gggggggg.....', '.gggggggggg....', '..gggggggg.....', '...gggggg......', '....gggg.......'], { g: [62, 136, 44, 30] }); return t; },
  mossy: t => { PAINT.cobble(t); for (let k = 0; k < 40; k++) { const x = (t.r() * 16) | 0, y = (t.r() * 16) | 0; t.set(x, y, [76, 120, 56]); } return t; },
  gold_block: t => metal(t, [240, 200, 60]),
  iron_block: t => metal(t, [214, 214, 218]),
  diamond_block: t => metal(t, [100, 220, 214]),
  coal_block: t => t.fill([30, 30, 32], 8).specks([60, 60, 64], 18),
  mud_brick: t => { bricks(t, [178, 146, 104], [140, 112, 78], 4, 8); for (let k = 0; k < 14; k++) t.set((t.r() * 16) | 0, (t.r() * 16) | 0, [214, 190, 120]); return t; },
  terracotta: t => t.fill([168, 92, 60], 6).specks([156, 84, 54], 12),
  sign: t => planks(t, [190, 150, 92], [140, 104, 60]),
};

export function buildAtlas(style = 'pixel') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  TILES.forEach((name, i) => {
    const t = new Tile(i + 1);
    if (name.startsWith('crack')) crack(t, +name.slice(5), 99 + (+name.slice(5)) * 0);
    else (PAINT[name] || (x => x.fill([255, 0, 255], 0)))(t);
    if (style === 'smooth' && !name.startsWith('crack')) smoothTile(t);
    const img = new ImageData(t.d, T, T);
    g.putImageData(img, (i & 15) * 16, (i >> 4) * 16);
  });
  return cv;
}
// the "smooth" look: same tiles, pixel noise flattened into soft gradients
function smoothTile(t) {
  const src = new Uint8ClampedArray(t.d);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = (y * T + x) * 4;
    if (src[i + 3] === 0) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= T || yy >= T) continue;
      const j = (yy * T + xx) * 4; if (src[j + 3] === 0) continue;
      r += src[j]; g += src[j + 1]; b += src[j + 2]; n++;
    }
    t.d[i] = (src[i] * 0.35 + (r / n) * 0.65); t.d[i + 1] = (src[i + 1] * 0.35 + (g / n) * 0.65); t.d[i + 2] = (src[i + 2] * 0.35 + (b / n) * 0.65);
  }
}

// ---------- item icons (16x16 pixel maps) ----------
const TOOL_HEAD = {
  WOOD: [[168, 128, 76], [118, 88, 52]], STONE: [[150, 150, 152], [96, 96, 98]], IRON: [[226, 226, 230], [150, 150, 156]], DIAMOND: [[110, 236, 226], [40, 160, 150]],
};
const STICK = [[150, 112, 64], [96, 70, 40]];
const MAPS = {
  pick: ['', '...hhhhhhhh.....', '..hdddddddhh....', '..h......ssh....', '.........sk.h...', '........sk..h...', '.......sk...hd..', '......sk.....d..', '.....sk.........', '....sk..........', '...sk...........', '..sk............', '.sk.............', '.k..............'],
  axe: ['', '.......hh.......', '......hhhh......', '.....hhhhds.....', '.....hhhdsk.....', '......hdsk......', '.......sk.......', '......sk........', '.....sk.........', '....sk..........', '...sk...........', '..sk............', '.sk.............', '.k..............'],
  shovel: ['', '...........hh...', '..........hhhh..', '.........hhhhh..', '.........dhhhd..', '..........ddd...', '.........sk.....', '........sk......', '.......sk.......', '......sk........', '.....sk.........', '....sk..........', '...sk...........', '..k.............'],
  sword: ['', '............hd..', '...........hhd..', '..........hhd...', '.........hhd....', '........hhd.....', '.......hhd......', '..d...hhd.......', '...d.hhd........', '....dhd.........', '....ss..........', '...sdd..........', '..sk..d.........', '.kk.............'],
  hoe: ['', '.......hhhhh....', '......hdddds....', '..........sk....', '.........sk.....', '........sk......', '.......sk.......', '......sk........', '.....sk.........', '....sk..........', '...sk...........', '..sk............', '.sk.............', '.k..............'],
};
const IMAP = {
  [I.STICK]: [['', '', '', '', '...........sk...', '..........sk....', '.........sk.....', '........sk......', '.......sk.......', '......sk........', '.....sk.........', '....sk..........', '...sk...........', '...k............'], { s: STICK[0], k: STICK[1] }],
  [I.COAL]: [['', '', '', '', '.....kkk........', '....kkgkkk......', '...kkkkkkkk.....', '...kkgkkkgkk....', '...kkkkkkkkk....', '....kkkkgkk.....', '.....kkkkk......', '.......kk.......'], { k: [34, 34, 38], g: [80, 80, 86] }],
  [I.CHARCOAL]: [['', '', '', '', '.....kkk........', '....kkbkkk......', '...kkkkkkkk.....', '...kkbkkkbkk....', '...kkkkkkkkk....', '....kkkkbkk.....', '.....kkkkk......', '.......kk.......'], { k: [52, 42, 34], b: [100, 80, 60] }],
  [I.IRON]: [['', '', '', '', '', '.....hhhhhh.....', '....hwwwwwwh....', '...hwwwwwwwwh...', '..hddddddddddh..', '..hddddddddddh..', '...hhhhhhhhhh...'], { h: [120, 120, 126], w: [236, 236, 240], d: [190, 190, 196] }],
  [I.GOLD]: [['', '', '', '', '', '.....hhhhhh.....', '....hwwwwwwh....', '...hwwwwwwwwh...', '..hddddddddddh..', '..hddddddddddh..', '...hhhhhhhhhh...'], { h: [170, 120, 30], w: [255, 240, 140], d: [240, 196, 50] }],
  [I.DIAMOND]: [['', '', '', '....hhhhhhhh....', '...hwwddddddh...', '..hwwdddddddbh..', '..hdddddddddbh..', '...hddddddddh...', '....hddddddh.....', '.....hddddh.....', '......hddh......', '.......hh.......'], { h: [30, 120, 120], w: [220, 255, 250], d: [100, 232, 222], b: [60, 180, 174] }],
  [I.APPLE]: [['', '.......s........', '........sl......', '.......sll......', '....rrr.rrr.....', '...rrwrrrrrr....', '...rwrrrrrrrr...', '...rrrrrrrrrr...', '...rrrrrrrrrr...', '...rrrrrrrrdr...', '....rrrrrrdr....', '.....rrrrrr.....', '......r..r......'], { r: [210, 36, 40], w: [255, 170, 170], d: [150, 20, 24], s: [96, 70, 40], l: [80, 160, 50] }],
  [I.DATES]: [['', '', '......s.........', '.....s.s........', '....s...s.......', '...dd...dd......', '..dbbd.dbbd.....', '..dbbd.dbbd..dd.', '..dbbd.dbbd.dbbd', '...dd...dd..dbbd', '.............dd.'], { s: [120, 90, 50], d: [92, 44, 24], b: [150, 76, 36] }],
  [I.BREAD]: [['', '', '', '', '', '....bbbbbbb.....', '..bbllbbllbbb...', '.bllbbllbbllbb..', '.bbbbbbbbbbbbb..', '.dbbbbbbbbbbbd..', '..dddddddddddd..'], { b: [196, 140, 64], l: [230, 190, 110], d: [140, 92, 36] }],
  [I.RAW_MUTTON]: [['', '', '', '....pppp........', '...pppppppp.....', '..ppwppppppp....', '..ppppppwpppp...', '..ppppppppppp...', '...pppppppppp...', '....ppppppp.ww..', '......pppp..ww..'], { p: [214, 92, 92], w: [240, 230, 220] }],
  [I.COOKED_MUTTON]: [['', '', '', '....bbbb........', '...bbbbbbbb.....', '..bblbbbbbbb....', '..bbbbbbblbbb...', '..bbbbbbbbbbb...', '...bbbbbbbbbb...', '....bbbbbbb.ww..', '......bbbb..ww..'], { b: [140, 76, 40], l: [190, 120, 70], w: [240, 230, 220] }],
  [I.RAW_BEEF]: [['', '', '', '...pppppp.......', '..pwwppppppp....', '..ppppwwpppp....', '..pppppppwwpp...', '..ppwwppppppp...', '...pppppppppp...', '....ppppppp.....'], { p: [196, 46, 46], w: [240, 200, 200] }],
  [I.STEAK]: [['', '', '', '...bbbbbb.......', '..bllbbbbbbb....', '..bbbbllbbbb....', '..bbbbbbbllbb...', '..bbllbbbbbbb...', '...bbbbbbbbbb...', '....bbbbbbb.....'], { b: [120, 64, 34], l: [176, 110, 60] }],
  [I.RAW_CHICKEN]: [['', '', '', '.......pppp.....', '......pppppp....', '.....ppppppp....', '....pppppppp....', '...pppppppp.....', '..w.pppppp......', '.ww..pppp.......', '..w.............'], { p: [240, 186, 170], w: [250, 246, 236] }],
  [I.COOKED_CHICKEN]: [['', '', '', '.......bbbb.....', '......blbbbb....', '.....bbbbbbb....', '....bbbblbbb....', '...bbbbbbbb.....', '..w.bbbbbb......', '.ww..bbbb.......', '..w.............'], { b: [196, 128, 60], l: [236, 180, 100], w: [250, 246, 236] }],
  [I.ROTTEN_FLESH]: [['', '', '', '....gggg........', '...gpgggpgg.....', '..ggggpgggpg....', '..gpggggpggg....', '...gggpggggg....', '....ggggggg.....', '......ggg.......'], { g: [120, 140, 70], p: [170, 90, 80] }],
  [I.BONE]: [['', '', '..ww............', '.wwww...........', '..wwww..........', '....www.........', '.....www........', '......www.......', '.......www......', '........wwww....', '.........wwww...', '..........ww....'], { w: [236, 232, 214] }],
  [I.STRING]: [['', '', '..........ww....', '.........w..w...', '........w.......', '.......w........', '......w.........', '.....w..........', '....w...........', '...w............', '..ww............', '.w..w...........'], { w: [236, 236, 240] }],
  [I.ARROW]: [['', '.........ffff...', '..........fff...', '.........s.ff...', '........s...f...', '.......s........', '......s.........', '.....s..........', '..f.s...........', '..fs............', '.fff............', 'ff..............'], { f: [180, 180, 186], s: [150, 112, 64] }],
  [I.FEATHER]: [['', '...........ww...', '..........wwww..', '.........wwwww..', '........wwwww...', '.......wwwww....', '......wwwww.....', '.....wwwww......', '....wwww........', '...sww..........', '..s.............', '.s..............'], { w: [240, 240, 246], s: [200, 200, 200] }],
  [I.LEATHER]: [['', '', '...llll..llll...', '..lllllllllll...', '..lldllllllll...', '..lllllldllll...', '...llllllllll...', '...llldlllll....', '..lllllllllll...', '..lllll..llll...'], { l: [170, 100, 54], d: [130, 72, 36] }],
  [I.SEEDS]: [['', '', '', '', '.....g...g......', '...g...g....g...', '.....g...g......', '..g...g....g....', '....g...g...g...', '......g...g.....', '...g....g.......'], { g: [80, 170, 60] }],
  [I.WHEAT]: [['', '.........y.y....', '........yyyy....', '.......yyyy.....', '......yyyy......', '.....ss.........', '....ss..........', '...ss...........', '..ss............', '.ss.............', 'ss..............'], { y: [226, 192, 80], s: [180, 150, 60] }],
  [I.BUCKET]: [['', '', '', '...hhhhhhhhhh...', '..h..........h..', '..hmmmmmmmmmmh..', '...hmmmmmmmmh...', '...hmmmmmmmmh...', '....hmmmmmmh....', '....hmmmmmmh....', '.....hhhhhh.....'], { h: [110, 110, 116], m: [200, 200, 206] }],
  [I.WATER_BUCKET]: [['', '', '', '...hhhhhhhhhh...', '..hwwwwwwwwwwh..', '..hmmmmmmmmmmh..', '...hmmmmmmmmh...', '...hmmmmmmmmh...', '....hmmmmmmh....', '....hmmmmmmh....', '.....hhhhhh.....'], { h: [110, 110, 116], m: [200, 200, 206], w: [60, 110, 220] }],
  [I.LAVA_BUCKET]: [['', '', '', '...hhhhhhhhhh...', '..hwwwwwwwwwwh..', '..hmmmmmmmmmmh..', '...hmmmmmmmmh...', '...hmmmmmmmmh...', '....hmmmmmmh....', '....hmmmmmmh....', '.....hhhhhh.....'], { h: [110, 110, 116], m: [200, 200, 206], w: [240, 120, 30] }],
  [I.BOW]: [['', '.......sss......', '.....ss...x.....', '....s.....x.....', '...s......x.....', '..s.......x.....', '..s.......x.....', '..s.......x.....', '..s.......x.....', '...s......x.....', '....s.....x.....', '.....ss...x.....', '.......sss......'], { s: [140, 100, 56], x: [230, 230, 230] }],
  [I.FLINT]: [['', '', '', '.....kk.........', '....kkgk........', '...kkkkkk.......', '...kgkkkkk......', '..kkkkkgkk......', '..kkkkkkkk......', '...kkkkkk.......'], { k: [56, 56, 62], g: [110, 110, 120] }],
  [I.CLAY_BALL]: [['', '', '', '', '.....cccc.......', '....cwcccc......', '...cccccccc.....', '...cccccccc.....', '....cccccc......', '.....cccc.......'], { c: [160, 166, 180], w: [210, 214, 224] }],
  [I.BRICK]: [['', '', '', '', '', '...bbbbbbbbbb...', '..bllbbbbbbbbb..', '..bbbbbbbbbbbb..', '..dddddddddddd..'], { b: [170, 82, 60], l: [214, 130, 100], d: [120, 56, 40] }],
};
const ARMOR_MAPS = {
  HELMET: ['', '', '', '....hhhhhhhh....', '...hddddddddh...', '...hdlddddddh...', '...hd......dh...', '...hd......dh...', '...hh......hh...'],
  CHEST: ['', '...hh......hh...', '..hdhh....hhdh..', '..hddhhhhhhddh..', '..hdlddddddddh..', '...hlddddddh....', '....hddddddh....', '....hddddddh....', '....hddddddh....', '....hddddddh....', '....hhhhhhhh....'],
  LEGS: ['', '', '....hhhhhhhh....', '....hdlddddh....', '....hddhhddh....', '....hdh..hdh....', '....hdh..hdh....', '....hdh..hdh....', '....hdh..hdh....', '....hdh..hdh....', '....hhh..hhh....'],
  BOOTS: ['', '', '', '', '', '', '...hh....hh.....', '...hd....hd.....', '...hd....hd.....', '..hld...hld.....', '.hddd..hddd.....', '.hhhh..hhhh.....'],
};
const ARMOR_PAL = { LEATHER: { h: [96, 54, 28], d: [156, 92, 50], l: [196, 130, 80] }, IRON: { h: [120, 120, 126], d: [214, 214, 220], l: [250, 250, 252] }, DIAMOND: { h: [24, 120, 120], d: [100, 228, 218], l: [200, 255, 250] } };
for (const m of Object.keys(ARMOR_PAL)) for (const p of Object.keys(ARMOR_MAPS)) IMAP[I[m + '_' + p]] = [ARMOR_MAPS[p], ARMOR_PAL[m]];
for (const [k] of Object.entries(TOOL_HEAD)) {
  const pal = { h: TOOL_HEAD[k][0], d: TOOL_HEAD[k][1], s: STICK[0], k: STICK[1] };
  IMAP[I[k + '_PICK']] = [MAPS.pick, pal];
  IMAP[I[k + '_AXE']] = [MAPS.axe, pal];
  IMAP[I[k + '_SHOVEL']] = [MAPS.shovel, pal];
  IMAP[I[k + '_SWORD']] = [MAPS.sword, pal];
  if (I[k + '_HOE']) IMAP[I[k + '_HOE']] = [MAPS.hoe, pal];
}

let atlasCanvas = null;
export function setAtlasCanvas(cv) { atlasCanvas = cv; iconCache.clear(); }
const iconCache = new Map();

export function itemCanvas(id) {
  const m = IMAP[id];
  const t = new Tile(id);
  t.clear();
  if (m) t.map(m[0], m[1]);
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  cv.getContext('2d').putImageData(new ImageData(t.d, 16, 16), 0, 0);
  return cv;
}

function tileCanvas(tile) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  cv.getContext('2d').drawImage(atlasCanvas, (tile & 15) * 16, (tile >> 4) * 16, 16, 16, 0, 0, 16, 16);
  return cv;
}

// isometric block icon (64x64) or flat item icon, as a data URL
export function iconURL(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  let url;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (id >= 256) {
    g.drawImage(itemCanvas(id), 0, 0, 64, 64);
  } else {
    const b = BLOCKS[id];
    if (!b || !b.tex) { iconCache.set(id, ''); return ''; }
    const flat = ['cross', 'torch', 'crop', 'water', 'sign'].includes(b.shape);
    if (flat) {
      if (b.shape === 'sign') drawSignIcon(g, tileCanvas(b.tex.side));
      else g.drawImage(tileCanvas(b.shape === 'water' ? b.tex.top : b.tex.side), 4, 4, 56, 56);
    } else {
      const h = b.shape === 'bed' ? 0.56 : 1;
      const top = tileCanvas(b.tex.top), side = tileCanvas(b.tex.front !== undefined ? b.tex.front : b.tex.side), side2 = tileCanvas(b.tex.side);
      const s = 28, cx = 32, cy = 22 + (1 - h) * 14;
      // top rhombus
      g.save(); g.setTransform(s / 16, s / 32, -s / 16, s / 32, cx, cy - s / 2 - 2); g.drawImage(top, 0, 0); g.restore();
      // left face
      g.save(); g.setTransform(s / 16, s / 32, 0, (s / 16) * h, cx - s, cy - 2); g.drawImage(side, 0, 16 - 16 * h, 16, 16 * h, 0, 0, 16, 16); g.restore();
      g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.moveTo(cx - s, cy - 2); g.lineTo(cx, cy + s / 2 - 2); g.lineTo(cx, cy + s / 2 + s * h - 2); g.lineTo(cx - s, cy + s * h - 2); g.closePath(); g.fill(); g.restore();
      // right face
      g.save(); g.setTransform(s / 16, -s / 32, 0, (s / 16) * h, cx, cy + s / 2 - 2); g.drawImage(side2, 0, 16 - 16 * h, 16, 16 * h, 0, 0, 16, 16); g.restore();
      g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,0,0,0.36)'; g.beginPath(); g.moveTo(cx, cy + s / 2 - 2); g.lineTo(cx + s, cy - 2); g.lineTo(cx + s, cy + s * h - 2); g.lineTo(cx, cy + s / 2 + s * h - 2); g.closePath(); g.fill(); g.restore();
    }
  }
  url = cv.toDataURL();
  iconCache.set(id, url);
  return url;
}
function drawSignIcon(g, tile) {
  g.drawImage(tile, 0, 0, 16, 10, 6, 8, 52, 32);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(14, 18, 36, 3); g.fillRect(14, 26, 28, 3);
  g.drawImage(tile, 6, 0, 3, 16, 29, 40, 7, 20);
}

// texture for a held item / dropped item sprite (canvas, 16x16)
export function spriteCanvas(id) {
  if (id >= 256) return itemCanvas(id);
  const b = BLOCKS[id];
  return tileCanvas(b.tex.side);
}

// ---------- mob skins ----------
function skin(w, h, base, v, seed, paint) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const r = mulberry32(seed);
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const m = (r() - 0.5) * 2 * v; img.data[i * 4] = clamp(base[0] + m); img.data[i * 4 + 1] = clamp(base[1] + m); img.data[i * 4 + 2] = clamp(base[2] + m); img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  if (paint) paint(g, r);
  return cv;
}
const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
export const SKINS = {
  sheep: {
    body: () => skin(8, 8, [236, 236, 230], 10, 1),
    head: () => skin(8, 8, [222, 200, 176], 8, 2),
    face: () => skin(8, 8, [222, 200, 176], 8, 3, g => { px(g, '#fff', 1, 3, 2, 1); px(g, '#222', 2, 3); px(g, '#fff', 5, 3, 2, 1); px(g, '#222', 5, 3); px(g, '#b98', 3, 5, 2, 1); px(g, '#eee', 0, 0, 8, 2); }),
    leg: () => skin(4, 8, [222, 200, 176], 8, 4),
  },
  cow: {
    body: () => skin(8, 8, [96, 66, 46], 8, 5, (g, r) => { for (let k = 0; k < 5; k++) px(g, '#eee', (r() * 7) | 0, (r() * 7) | 0, 2, 2); }),
    head: () => skin(8, 8, [96, 66, 46], 8, 6),
    face: () => skin(8, 8, [96, 66, 46], 8, 7, g => { px(g, '#eee', 2, 0, 4, 3); px(g, '#111', 1, 3); px(g, '#111', 6, 3); px(g, '#d9a9a0', 2, 5, 4, 3); px(g, '#644', 3, 6); px(g, '#644', 4, 6); }),
    leg: () => skin(4, 8, [86, 60, 40], 8, 8, g => px(g, '#333', 0, 6, 4, 2)),
    horn: () => skin(2, 2, [230, 226, 210], 4, 9),
  },
  chicken: {
    body: () => skin(8, 8, [246, 246, 240], 6, 10),
    head: () => skin(8, 8, [246, 246, 240], 6, 11),
    face: () => skin(8, 8, [246, 246, 240], 6, 12, g => { px(g, '#111', 1, 2); px(g, '#111', 6, 2); px(g, '#f5b31b', 2, 4, 4, 2); px(g, '#d22', 3, 6, 2, 2); }),
    leg: () => skin(2, 6, [240, 180, 40], 6, 13),
  },
  camel: {
    body: () => skin(8, 8, [206, 166, 110], 8, 14),
    head: () => skin(8, 8, [200, 160, 104], 8, 15),
    face: () => skin(8, 8, [200, 160, 104], 8, 16, g => { px(g, '#222', 1, 2); px(g, '#222', 6, 2); px(g, '#8a6a44', 2, 6, 4, 1); }),
    leg: () => skin(4, 8, [196, 156, 102], 8, 17),
  },
  zombie: {
    body: () => skin(8, 8, [112, 84, 56], 12, 18, (g, r) => { for (let k = 0; k < 6; k++) px(g, '#5a4028', (r() * 8) | 0, (r() * 8) | 0); }),
    head: () => skin(8, 8, [104, 136, 96], 10, 19),
    face: () => skin(8, 8, [104, 136, 96], 10, 20, g => { px(g, '#1d2a1d', 1, 3, 2, 2); px(g, '#1d2a1d', 5, 3, 2, 2); px(g, '#c33', 2, 3); px(g, '#c33', 5, 3); px(g, '#3d4f37', 2, 6, 4, 1); }),
    arm: () => skin(4, 8, [104, 136, 96], 10, 21),
    leg: () => skin(4, 8, [70, 60, 50], 8, 22),
  },
  skeleton: {
    body: () => skin(8, 8, [210, 210, 204], 10, 23, g => { for (let y = 1; y < 8; y += 2) px(g, '#555', 1, y, 6, 1); }),
    head: () => skin(8, 8, [214, 214, 208], 8, 24),
    face: () => skin(8, 8, [214, 214, 208], 8, 25, g => { px(g, '#222', 1, 3, 2, 2); px(g, '#222', 5, 3, 2, 2); px(g, '#555', 3, 5, 2, 1); px(g, '#333', 2, 6, 4, 1); }),
    arm: () => skin(2, 8, [214, 214, 208], 8, 26),
    leg: () => skin(2, 8, [214, 214, 208], 8, 27),
  },
  spider: {
    body: () => skin(8, 8, [52, 42, 38], 10, 28),
    head: () => skin(8, 8, [44, 36, 32], 8, 29),
    face: () => skin(8, 8, [44, 36, 32], 8, 30, g => { px(g, '#e22', 1, 2, 2, 1); px(g, '#e22', 5, 2, 2, 1); px(g, '#e22', 2, 4); px(g, '#e22', 5, 4); }),
    leg: () => skin(8, 2, [40, 32, 28], 6, 31),
  },
  player: {
    body: () => skin(8, 8, [52, 120, 160], 8, 32),
    head: () => skin(8, 8, [196, 150, 116], 6, 33, g => px(g, '#3b2a1e', 0, 0, 8, 2)),
    face: () => skin(8, 8, [196, 150, 116], 6, 34, g => { px(g, '#3b2a1e', 0, 0, 8, 2); px(g, '#fff', 1, 3, 2, 1); px(g, '#335', 2, 3); px(g, '#fff', 5, 3, 2, 1); px(g, '#335', 5, 3); px(g, '#8a5a44', 3, 6, 2, 1); }),
    arm: () => skin(4, 8, [196, 150, 116], 6, 35, g => px(g, '#347aa0', 0, 0, 4, 3)),
    leg: () => skin(4, 8, [60, 56, 90], 6, 36),
  },
};

// sky sprites
export function sunCanvas(moon) {
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
  const g = cv.getContext('2d');
  if (moon) {
    g.fillStyle = '#e6ecf4'; g.fillRect(8, 8, 16, 16);
    g.fillStyle = '#c4ccd8'; g.fillRect(11, 11, 4, 4); g.fillRect(18, 16, 3, 3); g.fillRect(13, 19, 2, 2);
  } else {
    g.fillStyle = 'rgba(255,240,170,0.35)'; g.fillRect(2, 2, 28, 28);
    g.fillStyle = '#fff6c8'; g.fillRect(6, 6, 20, 20);
    g.fillStyle = '#ffe680'; g.fillRect(9, 9, 14, 14);
  }
  return cv;
}
export function cloudCanvas(seed) {
  const n = 64;
  const cv = document.createElement('canvas'); cv.width = n; cv.height = n;
  const g = cv.getContext('2d');
  const img = g.createImageData(n, n);
  const r = mulberry32(seed);
  // blocky cloud blobs on a wrapping grid
  const grid = new Uint8Array(n * n);
  for (let k = 0; k < 26; k++) {
    const cx = (r() * n) | 0, cy = (r() * n) | 0, w = 3 + ((r() * 8) | 0), h = 2 + ((r() * 5) | 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[((cy + y) % n) * n + ((cx + x) % n)] = 1;
  }
  for (let i = 0; i < n * n; i++) { img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = grid[i] ? 220 : 0; }
  g.putImageData(img, 0, 0);
  return cv;
}

export { TILE };
