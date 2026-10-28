// Light propagation + chunk meshing. Runs in the worker.
// Input is a 48x48xH volume: the chunk to mesh in the middle and its 8 neighbours around it.
// Light is at most 15 levels, so every source that can reach the middle chunk lies inside the
// volume: the lighting computed here is exact for the middle chunk.
import { BLOCKS, HEIGHT } from './blocks.js';

const W = 48, H = HEIGHT, WW = W * W, N = WW * H;
const S_NONE = 0, S_CUBE = 1, S_CROSS = 2, S_TORCH = 3, S_LIQUID = 4, S_CACTUS = 5, S_BED = 6, S_CROP = 7;
const SHAPES = { none: 0, cube: 1, cross: 2, torch: 3, water: 4, cactus: 5, bed: 6, crop: 7, sign: 0 };

const SHAPE = new Uint8Array(256), OPQ = new Uint8Array(256), ATT = new Uint8Array(256), EMIT = new Uint8Array(256);
const CUTOUT = new Uint8Array(256), CULLSAME = new Uint8Array(256), TRANS = new Uint8Array(256), LEAF = new Uint8Array(256);
const LIQ = new Uint8Array(256), LEVEL = new Uint8Array(256), LAVA = new Uint8Array(256);
const TEX = new Uint8Array(256 * 6), FRONT = new Int16Array(256).fill(-1);
for (let id = 0; id < 256; id++) {
  const b = BLOCKS[id];
  SHAPE[id] = SHAPES[b.shape] ?? 0;
  OPQ[id] = b.opaque && SHAPE[id] === S_CUBE ? 1 : 0;
  ATT[id] = b.attenuate || 0;
  EMIT[id] = b.light || 0;
  CUTOUT[id] = b.cutout ? 1 : 0;
  CULLSAME[id] = b.cullSame ? 1 : 0;
  TRANS[id] = b.translucent ? 1 : 0;
  LEAF[id] = b.leaves ? 1 : 0;
  LIQ[id] = b.liquid ? (b.lava ? 2 : 1) : 0;
  LAVA[id] = b.lava ? 1 : 0;
  LEVEL[id] = b.level || 0;
  if (b.tex) {
    TEX[id * 6] = b.tex.top; TEX[id * 6 + 1] = b.tex.bottom;
    for (let f = 2; f < 6; f++) TEX[id * 6 + f] = b.tex.side;
    if (b.tex.front !== undefined) FRONT[id] = b.tex.front;
  }
}

// faces: 0 top, 1 bottom, 2 +x, 3 -x, 4 +z, 5 -z
const FACE = [
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.55 },
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], uv: [[1, 0], [1, 1], [0, 1], [0, 0]], shade: 0.8 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], uv: [[1, 0], [1, 1], [0, 1], [0, 0]], shade: 0.8 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], uv: [[1, 0], [1, 1], [0, 1], [0, 0]], shade: 0.66 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], uv: [[1, 0], [1, 1], [0, 1], [0, 0]], shade: 0.66 },
];
const D = (x, y, z) => x + z * W + y * WW;
// per face, per corner: offsets of the two side cells and the corner cell in the layer in front of the face
for (const f of FACE) {
  f.off = D(f.n[0], f.n[1], f.n[2]);
  f.ao = f.c.map(c => {
    const t = [];
    for (let a = 0; a < 3; a++) if (f.n[a] === 0) t.push(a);
    const d1 = [0, 0, 0], d2 = [0, 0, 0];
    d1[t[0]] = c[t[0]] ? 1 : -1;
    d2[t[1]] = c[t[1]] ? 1 : -1;
    const o1 = D(f.n[0] + d1[0], f.n[1] + d1[1], f.n[2] + d1[2]);
    const o2 = D(f.n[0] + d2[0], f.n[1] + d2[1], f.n[2] + d2[2]);
    const o3 = D(f.n[0] + d1[0] + d2[0], f.n[1] + d1[1] + d2[1], f.n[2] + d1[2] + d2[2]);
    return [o1, o2, o3];
  });
}
const AO_CURVE = [0.48, 0.66, 0.83, 1.0];

const QN = 1 << 20, QM = QN - 1;
let queue = null, sky = null, blk = null;

function propagate(arr, vol, head, tail) {
  const q = queue;
  while (head !== tail) {
    const i = q[head]; head = (head + 1) & QM;
    const L = arr[i];
    if (L <= 1) continue;
    const x = i % W, t = (i - x) / W, z = t % W, y = (t - z) / W;
    for (let d = 0; d < 6; d++) {
      let j;
      if (d === 0) { if (x === W - 1) continue; j = i + 1; }
      else if (d === 1) { if (x === 0) continue; j = i - 1; }
      else if (d === 2) { if (z === W - 1) continue; j = i + W; }
      else if (d === 3) { if (z === 0) continue; j = i - W; }
      else if (d === 4) { if (y === H - 1) continue; j = i + WW; }
      else { if (y === 0) continue; j = i - WW; }
      const id = vol[j];
      if (OPQ[id]) continue;
      const nl = L - 1 - ATT[id];
      if (nl > arr[j]) { arr[j] = nl; q[tail] = j; tail = (tail + 1) & QM; }
    }
  }
}

export function computeLight(vol) {
  if (!queue) { queue = new Int32Array(QN); sky = new Uint8Array(N); blk = new Uint8Array(N); }
  sky.fill(0); blk.fill(0);
  const tops = new Int16Array(WW);
  // straight-down sunlight
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    let L = 15, top = -1;
    for (let y = H - 1; y >= 0; y--) {
      const i = x + z * W + y * WW;
      const id = vol[i];
      if (L > 0) {
        if (OPQ[id]) L = 0;
        else if (ATT[id]) L = Math.max(0, L - ATT[id]);
      }
      if (L < 15 && top < 0) top = y;
      sky[i] = L;
      if (L === 0 && top >= 0) break;
    }
    tops[x + z * W] = top;
  }
  // seed only the lit cells that sit beside a shadow
  let tail = 0;
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    let m = tops[x + z * W];
    if (x > 0) m = Math.max(m, tops[x - 1 + z * W]);
    if (x < W - 1) m = Math.max(m, tops[x + 1 + z * W]);
    if (z > 0) m = Math.max(m, tops[x + (z - 1) * W]);
    if (z < W - 1) m = Math.max(m, tops[x + (z + 1) * W]);
    for (let y = Math.min(H - 1, m + 1); y >= 0; y--) {
      const i = x + z * W + y * WW;
      if (sky[i] > 1) { queue[tail] = i; tail = (tail + 1) & QM; }
      else if (OPQ[vol[i]] && y < tops[x + z * W]) break;
    }
  }
  propagate(sky, vol, 0, tail);
  // block light
  tail = 0;
  for (let i = 0; i < N; i++) {
    const e = EMIT[vol[i]];
    if (e) { blk[i] = e; queue[tail] = i; tail = (tail + 1) & QM; }
  }
  if (tail) propagate(blk, vol, 0, tail);
  return { sky, blk };
}

class Buf {
  constructor(cap) { this.cap = cap; this.n = 0; this.ni = 0; this.pos = new Uint16Array(cap * 3); this.uv = new Uint16Array(cap * 2); this.lt = new Uint8Array(cap * 4); this.idx = new Uint32Array(cap * 1.5); }
  grow() {
    const c = this.cap * 2;
    const p = new Uint16Array(c * 3); p.set(this.pos); this.pos = p;
    const u = new Uint16Array(c * 2); u.set(this.uv); this.uv = u;
    const l = new Uint8Array(c * 4); l.set(this.lt); this.lt = l;
    const ix = new Uint32Array(c * 1.5); ix.set(this.idx); this.idx = ix;
    this.cap = c;
  }
  v(x, y, z, u, v, s, b, sh, fl) {
    if (this.n >= this.cap) this.grow();
    const n = this.n++;
    this.pos[n * 3] = Math.round(x * 16); this.pos[n * 3 + 1] = Math.round(y * 16); this.pos[n * 3 + 2] = Math.round(z * 16);
    this.uv[n * 2] = u; this.uv[n * 2 + 1] = v;
    this.lt[n * 4] = s; this.lt[n * 4 + 1] = b; this.lt[n * 4 + 2] = sh; this.lt[n * 4 + 3] = fl;
    return n;
  }
  quad(a, b, c, d, flip) {
    const ix = this.idx, k = this.ni;
    if (flip) { ix[k] = b; ix[k + 1] = c; ix[k + 2] = d; ix[k + 3] = b; ix[k + 4] = d; ix[k + 5] = a; }
    else { ix[k] = a; ix[k + 1] = b; ix[k + 2] = c; ix[k + 3] = a; ix[k + 4] = c; ix[k + 5] = d; }
    this.ni += 6;
  }
  out() {
    return { pos: this.pos.slice(0, this.n * 3), uv: this.uv.slice(0, this.n * 2), lt: this.lt.slice(0, this.n * 4), idx: this.idx.slice(0, this.ni), verts: this.n };
  }
}

// tile uv in 1/16-pixel units, inset a hair so neighbouring tiles never bleed
const uvOf = (tile, u, v) => [((tile & 15) * 16 + u * 16) * 16 + (u <= 0 ? 1 : u >= 1 ? -1 : 0), ((tile >> 4) * 16 + (1 - v) * 16) * 16 + (v >= 1 ? 1 : v <= 0 ? -1 : 0)];

export function meshChunk(vol, opts = {}) {
  const smoothLight = opts.smooth !== false;
  const fancy = !!opts.fancy;
  const orient = opts.orient || null;
  const { sky, blk } = computeLight(vol);
  const solid = new Buf(8192), water = new Buf(2048);
  const ox = 16, oz = 16;

  for (let y = 0; y < H; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = (x + ox) + (z + oz) * W + y * WW;
    const id = vol[i];
    if (!id) continue;
    const shape = SHAPE[id];
    if (shape === S_NONE) continue;

    if (shape === S_CUBE || shape === S_BED || shape === S_CACTUS) {
      const buf = TRANS[id] ? water : solid;
      const leaf = LEAF[id];
      const top = shape === S_BED ? 9 / 16 : 1;
      for (let f = 0; f < 6; f++) {
        if (f === 1 && y === 0) continue;
        const F = FACE[f];
        let j = i + F.off;
        let nb = (f === 0 && y === H - 1) ? 0 : vol[j];
        let visible;
        if (shape === S_CACTUS && f >= 2) visible = true;
        else if (shape === S_BED && f === 0) visible = true;
        else visible = !OPQ[nb] && !(CULLSAME[id] && nb === id) && !(leaf && !fancy && LEAF[nb]);
        if (!visible) continue;
        let tile = TEX[id * 6 + f];
        if (FRONT[id] >= 0 && f >= 2) {
          let front;
          if (id === 24) front = f === 4 || f === 5; // crafting table: two working faces
          else { const o = orient ? orient[x + z * 16 + y * 256] : undefined; front = f === (o === undefined ? 4 : o); }
          if (front) tile = FRONT[id];
        }
        const fl = leaf ? 2 : 0;
        const vs = [];
        const aos = [];
        for (let c = 0; c < 4; c++) {
          const cc = F.c[c];
          let px = x + cc[0], py = y + cc[1] * top, pz = z + cc[2];
          if (shape === S_CACTUS && f >= 2) {
            if (f === 2) px = x + 15 / 16; else if (f === 3) px = x + 1 / 16;
            else if (f === 4) pz = z + 15 / 16; else pz = z + 1 / 16;
          }
          let s, b, ao = 3;
          const nbLit = (f === 0 && y === H - 1) ? 15 : sky[j], nbBlk = (f === 0 && y === H - 1) ? 0 : blk[j];
          if (smoothLight && !(shape === S_CACTUS && f >= 2) && !(shape === S_BED && f === 0)) {
            const [o1, o2, o3] = F.ao[c];
            const j1 = i + o1, j2 = i + o2, j3 = i + o3;
            const a1 = j1 >= 0 && j1 < N ? OPQ[vol[j1]] : 0;
            const a2 = j2 >= 0 && j2 < N ? OPQ[vol[j2]] : 0;
            const a3 = j3 >= 0 && j3 < N ? OPQ[vol[j3]] : 0;
            ao = a1 && a2 ? 0 : 3 - (a1 + a2 + a3);
            let ss = nbLit, bb = nbBlk, cnt = 1;
            if (!a1 && j1 >= 0 && j1 < N) { ss += sky[j1]; bb += blk[j1]; cnt++; }
            if (!a2 && j2 >= 0 && j2 < N) { ss += sky[j2]; bb += blk[j2]; cnt++; }
            if (!a3 && !(a1 && a2) && j3 >= 0 && j3 < N) { ss += sky[j3]; bb += blk[j3]; cnt++; }
            s = ss / cnt; b = bb / cnt;
          } else {
            const self = (shape === S_CACTUS && f >= 2) || (shape === S_BED && f === 0);
            s = self ? sky[i] : nbLit; b = self ? blk[i] : nbBlk;
            if (shape !== S_CUBE) { s = Math.max(s, sky[i]); b = Math.max(b, blk[i]); }
          }
          aos.push(ao);
          let uvv = F.uv[c][1];
          if (shape === S_BED && f >= 2 && uvv > 0) uvv = top;
          const [u, v] = uvOf(tile, F.uv[c][0], uvv);
          vs.push(buf.v(px, py, pz, u, v, Math.round(s * 17), Math.round(b * 17), Math.round(255 * F.shade * AO_CURVE[ao]), fl | (cc[1] ? 4 : 0)));
        }
        buf.quad(vs[0], vs[1], vs[2], vs[3], aos[0] + aos[2] < aos[1] + aos[3]);
      }
      continue;
    }

    if (shape === S_LIQUID) {
      const lava = LAVA[id];
      const buf = lava ? solid : water;
      const kind = LIQ[id];
      const above = y < H - 1 ? vol[i + WW] : 0;
      const full = LIQ[above] === kind;
      const ht = full ? 1 : LEVEL[id] === 0 ? 14 / 16 : Math.max(2 / 16, (8 - LEVEL[id]) / 9);
      const s = sky[i], b = blk[i];
      const tile = TEX[id * 6];
      for (let f = 0; f < 6; f++) {
        if (f === 1 && y === 0) continue;
        const F = FACE[f];
        const nb = (f === 0 && y === H - 1) ? 0 : vol[i + F.off];
        if (LIQ[nb] === kind) { if (f !== 0 || full) continue; }
        if (OPQ[nb] && f !== 0) continue;
        if (f === 0 && full) continue;
        const vs = [];
        for (let c = 0; c < 4; c++) {
          const cc = F.c[c];
          const [u, v] = uvOf(tile, F.uv[c][0], f >= 2 && F.uv[c][1] ? ht : F.uv[c][1]);
          const ls = f === 0 ? s : Math.max(s, sky[i + F.off] || 0), lb = Math.max(b, blk[i + F.off] || 0);
          vs.push(buf.v(x + cc[0], y + cc[1] * ht, z + cc[2], u, v, ls * 17, lb * 17, Math.round(255 * (lava ? 1 : F.shade)), (f === 0 ? 1 : 0) | (lava ? 8 : 0)));
        }
        buf.quad(vs[0], vs[1], vs[2], vs[3], false);
        if (!lava && f === 0) buf.quad(vs[3], vs[2], vs[1], vs[0], false); // seen from below the surface too
      }
      continue;
    }

    const s = sky[i] * 17, b = blk[i] * 17;
    const tile = TEX[id * 6 + 2];
    if (shape === S_CROSS || shape === S_CROP) {
      const quads = shape === S_CROSS
        ? [[[0.15, 0.15], [0.85, 0.85]], [[0.15, 0.85], [0.85, 0.15]]]
        : [[[0.25, 0], [0.25, 1]], [[0.75, 0], [0.75, 1]], [[0, 0.25], [1, 0.25]], [[0, 0.75], [1, 0.75]]];
      const ht = shape === S_CROP ? 15 / 16 : 1;
      const yb = y - (vol[i - WW] === 58 ? 1 / 16 : 0);
      for (const [[ax, az], [bx, bz]] of quads) {
        const [u0, v0] = uvOf(tile, 0, 0), [u1, v1] = uvOf(tile, 1, 1);
        const a = solid.v(x + ax, yb, z + az, u0, v0, s, b, 230, 2);
        const bb = solid.v(x + ax, yb + ht, z + az, u0, v1, s, b, 230, 6);
        const c = solid.v(x + bx, yb + ht, z + bz, u1, v1, s, b, 230, 6);
        const d = solid.v(x + bx, yb, z + bz, u1, v0, s, b, 230, 2);
        solid.quad(a, bb, c, d, false);
        solid.quad(d, c, bb, a, false);
      }
      continue;
    }
    if (shape === S_TORCH) {
      const x0 = 7 / 16, x1 = 9 / 16, h = 10 / 16;
      for (let f = 0; f < 6; f++) {
        if (f === 1) continue;
        const F = FACE[f];
        const vs = [];
        for (let c = 0; c < 4; c++) {
          const cc = F.c[c];
          const px = x + (cc[0] ? x1 : x0), pz = z + (cc[2] ? x1 : x0), py = y + cc[1] * h;
          let uu, vv;
          if (f === 0) { uu = 7 / 16 + F.uv[c][0] * 2 / 16; vv = 8 / 16 + F.uv[c][1] * 2 / 16; }
          else { uu = 7 / 16 + F.uv[c][0] * 2 / 16; vv = F.uv[c][1] * 10 / 16; }
          const [u, v] = uvOf(tile, uu, vv);
          vs.push(solid.v(px, py, pz, u, v, s, 255, 255, 0));
        }
        solid.quad(vs[0], vs[1], vs[2], vs[3], false);
      }
    }
  }

  const light = new Uint8Array(16 * 16 * H);
  for (let y = 0; y < H; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = (x + ox) + (z + oz) * W + y * WW;
    light[x + z * 16 + y * 256] = (sky[i] << 4) | blk[i];
  }
  return { solid: solid.out(), water: water.out(), light };
}
