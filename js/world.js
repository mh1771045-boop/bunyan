// Chunk store on the main thread: loading ring, worker jobs, block edits, fluids, random ticks.
import { B, BLOCKS, CHUNK, HEIGHT, isWater, isLiquid } from './blocks.js';
import { rleEncode, rleDecode } from './storage.js';

const key = (cx, cz) => cx + ',' + cz;
const IDX = (x, y, z) => x + (z << 4) + (y << 8);

class WorkerPool {
  constructor(n, seed, worldType) {
    this.workers = [];
    this.cb = new Map();
    this.nextId = 1;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.busy = 0;
      w.onmessage = (e) => {
        const m = e.data;
        w.busy--;
        const f = this.cb.get(m.id); this.cb.delete(m.id);
        if (m.type === 'error') console.warn('[worker]', m.message);
        if (f) f(m);
      };
      w.onerror = (e) => console.warn('[worker error]', e.message);
      this.workers.push(w);
    }
    this.ready = Promise.all(this.workers.map(w => this.send(w, { type: 'init', seed, worldType })));
  }
  send(w, msg, transfer) {
    return new Promise(res => {
      const id = this.nextId++;
      msg.id = id; this.cb.set(id, res); w.busy++;
      w.postMessage(msg, transfer || []);
    });
  }
  pick() { let best = this.workers[0]; for (const w of this.workers) if (w.busy < best.busy) best = w; return best; }
  get load() { let s = 0; for (const w of this.workers) s += w.busy; return s; }
  run(msg, transfer) { return this.send(this.pick(), msg, transfer); }
  terminate() { for (const w of this.workers) w.terminate(); this.cb.clear(); }
}

export class World {
  constructor({ renderer, meta, store, settings }) {
    this.r = renderer;
    this.meta = meta;
    this.store = store; // null for the menu panorama
    this.settings = settings;
    this.chunks = new Map();
    this.savedKeys = new Set();
    this.pending = new Map();
    this.modified = new Set();
    this.blockEntities = new Map();
    this.fluidQ = new Map();
    this.gravityQ = [];
    this.renderDistance = 4;
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
    this.pool = new WorkerPool(n, meta.seed, meta.type);
    this.listeners = {};
    this.clock = 0;
    this.meshBudget = 0;
    this.destroyed = false;
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { for (const f of this.listeners[ev] || []) f(...a); }

  async init() {
    const r = await this.pool.ready;
    this.spawnGuess = r[0].spawn;
    if (this.store) {
      const keys = await this.store.chunkKeys(this.meta.id);
      for (const k of keys) this.savedKeys.add(k);
      const be = await this.store.getExtra(this.meta.id, 'be');
      if (be) for (const [k, v] of be) this.blockEntities.set(k, v);
    }
  }

  // ---------- block access ----------
  getChunk(cx, cz) { return this.chunks.get(key(cx, cz)); }
  getBlock(x, y, z) {
    if (y < 0 || y >= HEIGHT) return 0;
    const c = this.chunks.get(key(x >> 4, z >> 4));
    if (!c || !c.data) return 0;
    return c.data[IDX(x & 15, y, z & 15)];
  }
  getBlockSafe(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return 0;
    const c = this.chunks.get(key(x >> 4, z >> 4));
    if (!c || !c.data) return -1;
    return c.data[IDX(x & 15, y, z & 15)];
  }
  isLoaded(x, z) { const c = this.chunks.get(key(x >> 4, z >> 4)); return !!(c && c.data); }
  isMeshed(x, z) { const c = this.chunks.get(key(x >> 4, z >> 4)); return !!(c && c.meshed); }
  light(x, y, z) {
    if (y >= HEIGHT) return { sky: 15, block: 0 };
    if (y < 0) return { sky: 0, block: 0 };
    const c = this.chunks.get(key(x >> 4, z >> 4));
    if (!c || !c.light) return { sky: 15, block: 0 };
    const v = c.light[IDX(x & 15, y, z & 15)];
    return { sky: v >> 4, block: v & 15 };
  }
  // 0..1 brightness at a point for entities and the held item
  brightness(x, y, z, daylight) {
    const l = this.light(Math.floor(x), Math.floor(y), Math.floor(z));
    const s = (l.sky / 15) * daylight, b = l.block / 15;
    const c = v => v / (3 - 2 * v);
    return Math.max(0.06, Math.max(c(s), c(b)));
  }
  topY(x, z) {
    for (let y = HEIGHT - 1; y > 0; y--) { const id = this.getBlock(x, y, z); if (id && BLOCKS[id].solid) return y; }
    return 0;
  }

  setBlock(x, y, z, id, opts = {}) {
    if (y < 0 || y >= HEIGHT) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.data) return false;
    const i = IDX(x & 15, y, z & 15);
    const old = c.data[i];
    if (old === id) return false;
    c.data[i] = id;
    c.modified = true; this.modified.add(c.key);
    if (BLOCKS[old].use && !opts.keepEntity) this.blockEntities.delete(x + ',' + y + ',' + z);
    this.markDirty(cx, cz, true);
    const lx = x & 15, lz = z & 15;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) this.markDirty(cx + dx, cz + dz, false);
    void lx; void lz;
    if (!opts.noUpdate) this.neighborChanged(x, y, z, id, old);
    this.emit('block', x, y, z, id, old);
    return true;
  }

  neighborChanged(x, y, z, id, old) {
    const near = [[x, y, z], [x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]];
    for (const [a, b, c] of near) if (isWater(this.getBlock(a, b, c))) this.scheduleFluid(a, b, c, 0.25);
    const above = this.getBlock(x, y + 1, z);
    if (BLOCKS[above].gravity && !BLOCKS[id].solid) this.gravityQ.push([x, y + 1, z, this.clock + 0.05]);
    if (BLOCKS[id].gravity) this.gravityQ.push([x, y, z, this.clock + 0.05]);
    // plants pop off when their ground goes
    if (BLOCKS[above].needsSoil || BLOCKS[above].shape === 'crop' || above === B.TORCH || above === B.SIGN) {
      if (!BLOCKS[id].solid) { this.setBlock(x, y + 1, z, 0); this.emit('popped', x, y + 1, z, above); }
    }
    if (old === B.FARMLAND && BLOCKS[above].shape === 'crop') { this.setBlock(x, y + 1, z, 0); this.emit('popped', x, y + 1, z, above); }
  }

  markDirty(cx, cz, urgent) {
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.data) return;
    c.dirty = true;
    if (urgent) c.urgent = true;
    c.rev++;
  }

  // ---------- loading ring ----------
  update(dt, px, pz) {
    if (this.destroyed) return;
    this.clock += dt;
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    const R = this.renderDistance;
    // request missing chunks, nearest first
    if (this.pending.size < 6) {
      const want = [];
      for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > (R + 1.5) * (R + 1.5)) continue;
        const k = key(pcx + dx, pcz + dz);
        if (!this.chunks.has(k)) want.push([d2, pcx + dx, pcz + dz]);
      }
      want.sort((a, b) => a[0] - b[0]);
      for (let n = 0; n < want.length && this.pending.size < 6; n++) this.loadChunk(want[n][1], want[n][2]);
    }
    // mesh: urgent first, then nearest
    const cands = [];
    for (const c of this.chunks.values()) {
      if (!c.data || !c.dirty || c.meshing) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
      if (!this.neighborsReady(c.cx, c.cz)) continue;
      cands.push([c.urgent ? -1 : dx * dx + dz * dz, c]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const maxJobs = this.pool.workers.length * 2;
    for (const [, c] of cands) { if (this.pool.load >= maxJobs && !c.urgent) break; this.meshChunk(c); }
    // unload far chunks
    for (const c of this.chunks.values()) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (R + 3) * (R + 3)) this.unload(c);
    }
    this.tickFluids();
    this.tickGravity();
  }

  neighborsReady(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const n = this.chunks.get(key(cx + dx, cz + dz)); if (!n || !n.data) return false; }
    return true;
  }

  async loadChunk(cx, cz) {
    const k = key(cx, cz);
    const c = { key: k, cx, cz, data: null, light: null, solid: null, water: null, dirty: true, meshing: false, rev: 0, modified: false, meshed: false, urgent: false };
    this.chunks.set(k, c);
    this.pending.set(k, c);
    let data = null, fresh = false;
    try {
      if (this.store && this.savedKeys.has(k)) {
        const raw = await this.store.getChunk(this.meta.id, k);
        if (raw) data = rleDecode(raw, CHUNK * CHUNK * HEIGHT);
      }
      if (!data) { const m = await this.pool.run({ type: 'gen', cx, cz }); data = m.data; fresh = true; }
    } catch (e) { console.warn('chunk load failed', k, e); }
    this.pending.delete(k);
    if (this.destroyed || this.chunks.get(k) !== c) return;
    if (!data) { this.chunks.delete(k); return; }
    c.data = data;
    c.dirty = true;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) this.markDirty(cx + dx, cz + dz, false);
    if (fresh) this.emit('newChunk', c);
  }

  orientFor(c) {
    let o = null;
    const x0 = c.cx * 16, z0 = c.cz * 16;
    for (const [k, be] of this.blockEntities) {
      if (be.facing === undefined) continue;
      const [x, y, z] = k.split(',').map(Number);
      if (x >> 4 !== c.cx || z >> 4 !== c.cz) continue;
      (o ||= {})[(x - x0) + (z - z0) * 16 + y * 256] = be.facing;
    }
    return o;
  }

  meshChunk(c) {
    c.meshing = true; c.dirty = false; c.urgent = false;
    const rev = c.rev;
    const W = 48, vol = new Uint8Array(W * W * HEIGHT);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.chunks.get(key(c.cx + dx, c.cz + dz));
      const d = n.data, ox = (dx + 1) * 16, oz = (dz + 1) * 16;
      for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < 16; z++) {
        const s = (z << 4) + (y << 8);
        vol.set(d.subarray(s, s + 16), ox + (oz + z) * W + y * W * W);
      }
    }
    const s = this.settings;
    this.pool.run({ type: 'mesh', cx: c.cx, cz: c.cz, vol, rev, smooth: s.smoothLight, fancy: s.fancyLeaves, orient: this.orientFor(c) }, [vol.buffer]).then(m => {
      c.meshing = false;
      if (this.destroyed || this.chunks.get(c.key) !== c || m.type !== 'mesh') return;
      this.r.disposeMesh(c.solid); this.r.disposeMesh(c.water);
      c.solid = this.r.makeChunkMesh(m.solid, c.cx, c.cz, false);
      c.water = this.r.makeChunkMesh(m.water, c.cx, c.cz, true);
      c.light = m.light;
      c.meshed = true;
      if (c.rev !== rev) c.dirty = true;
      this.emit('meshed', c);
    });
  }

  unload(c) {
    if (c.modified && this.store && c.data) { this.store.putChunk(this.meta.id, c.key, rleEncode(c.data)); this.savedKeys.add(c.key); }
    this.modified.delete(c.key);
    this.r.disposeMesh(c.solid); this.r.disposeMesh(c.water);
    this.chunks.delete(c.key);
    this.pending.delete(c.key);
    this.emit('unload', c);
  }

  remeshAll() { for (const c of this.chunks.values()) if (c.data) { c.dirty = true; c.rev++; } }

  loadedAround(px, pz, r) {
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    let total = 0, done = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r + 1) continue;
      total++;
      const c = this.chunks.get(key(pcx + dx, pcz + dz));
      if (c && c.meshed) done++;
    }
    return done / total;
  }

  async save() {
    if (!this.store) return;
    const jobs = [];
    for (const k of this.modified) {
      const c = this.chunks.get(k);
      if (!c || !c.data) continue;
      jobs.push(this.store.putChunk(this.meta.id, k, rleEncode(c.data)));
      this.savedKeys.add(k);
      c.modified = false;
    }
    this.modified.clear();
    jobs.push(this.store.putExtra(this.meta.id, 'be', [...this.blockEntities.entries()]));
    await Promise.all(jobs);
  }

  destroy() {
    this.destroyed = true;
    for (const c of this.chunks.values()) { this.r.disposeMesh(c.solid); this.r.disposeMesh(c.water); }
    this.chunks.clear();
    this.pool.terminate();
  }

  // ---------- fluids ----------
  scheduleFluid(x, y, z, delay) {
    const k = x + ',' + y + ',' + z;
    const t = this.clock + delay;
    const cur = this.fluidQ.get(k);
    if (cur === undefined || t < cur) this.fluidQ.set(k, t);
  }
  tickFluids() {
    if (!this.fluidQ.size) return;
    let n = 0;
    const due = [];
    for (const [k, t] of this.fluidQ) { if (t <= this.clock) { due.push(k); if (++n > 160) break; } }
    for (const k of due) {
      this.fluidQ.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      this.updateWater(x, y, z);
    }
  }
  levelAt(x, y, z) { const id = this.getBlock(x, y, z); return isWater(id) ? id - B.WATER : -1; }
  canFlowInto(id) { return id === 0 || (BLOCKS[id].replaceable && !isLiquid(id)) || (BLOCKS[id].needsSoil && !BLOCKS[id].solid); }
  updateWater(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (!isWater(id)) return;
    let L = id - B.WATER;
    if (L > 0) {
      // a flowing cell needs a feeder: water above, or a horizontal neighbour with a lower level
      const above = isWater(this.getBlock(x, y + 1, z));
      let feed = above, sources = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const l = this.levelAt(x + dx, y, z + dz);
        if (l >= 0 && l < L) feed = true;
        if (l === 0) sources++;
      }
      const below = this.getBlock(x, y - 1, z);
      if (sources >= 2 && (BLOCKS[below].solid || below === B.WATER)) { this.setBlock(x, y, z, B.WATER, { noUpdate: true }); L = 0; }
      else if (!feed) { this.setBlock(x, y, z, 0, { noUpdate: true }); this.wake(x, y, z); return; }
      else if (above && L !== 1) { this.setBlock(x, y, z, B.WATER + 1, { noUpdate: true }); L = 1; }
    }
    const below = this.getBlock(x, y - 1, z);
    if (y > 0 && this.canFlowInto(below)) {
      if (below !== 0) this.emit('popped', x, y - 1, z, below);
      this.setBlock(x, y - 1, z, B.WATER + 1, { noUpdate: true });
      this.scheduleFluid(x, y - 1, z, 0.25);
      return;
    }
    if (isWater(below) && L > 0) return;
    if (L >= 7) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.getBlock(x + dx, y, z + dz);
      if (this.canFlowInto(n)) {
        if (n !== 0) this.emit('popped', x + dx, y, z + dz, n);
        this.setBlock(x + dx, y, z + dz, B.WATER + L + 1, { noUpdate: true });
        this.scheduleFluid(x + dx, y, z + dz, 0.3);
      } else if (isWater(n) && n - B.WATER > L + 1) {
        this.setBlock(x + dx, y, z + dz, B.WATER + L + 1, { noUpdate: true });
        this.scheduleFluid(x + dx, y, z + dz, 0.3);
      }
    }
  }
  wake(x, y, z) {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (isWater(this.getBlock(x + dx, y + dy, z + dz))) this.scheduleFluid(x + dx, y + dy, z + dz, 0.3);
  }

  tickGravity() {
    if (!this.gravityQ.length) return;
    const now = this.clock, keep = [];
    for (const g of this.gravityQ) {
      if (g[3] > now) { keep.push(g); continue; }
      const [x, y, z] = g;
      const id = this.getBlock(x, y, z);
      if (!BLOCKS[id].gravity) continue;
      let ty = y;
      while (ty > 1) { const b = this.getBlock(x, ty - 1, z); if (b === 0 || isLiquid(b) || BLOCKS[b].replaceable) ty--; else break; }
      if (ty !== y) { this.setBlock(x, y, z, 0); this.setBlock(x, ty, z, id); }
    }
    this.gravityQ = keep;
  }
}
