// Terrain generator: deterministic per (seed, chunk). Runs inside the worker.
import { B, CHUNK, HEIGHT, SEA } from './blocks.js';
import { Simplex, hash2, hash3, mulberry32 } from './noise.js';

export const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, BIRCH: 4, DESERT: 5, SNOWY: 6, MOUNTAINS: 7 };
export const BIOME_NAMES = ['محيط', 'شاطئ', 'سهول', 'غابة', 'غابة بتولا', 'صحراء', 'تندرا ثلجية', 'جبال'];

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const IDX = (x, y, z) => x + (z << 4) + (y << 8);

export class Generator {
  constructor(seed, type = 'default') {
    this.seed = seed | 0;
    this.type = type;
    const s = this.seed;
    this.nC = new Simplex(s);
    this.nD = new Simplex(s + 101);
    this.nM = new Simplex(s + 202);
    this.nR = new Simplex(s + 303);
    this.nT = new Simplex(s + 404);
    this.nH = new Simplex(s + 505);
    this.nK1 = new Simplex(s + 606);
    this.nK2 = new Simplex(s + 707);
    this.nK3 = new Simplex(s + 808);
    this.colCache = new Map();
  }

  column(x, z) {
    const key = x * 65536 + z;
    const hit = this.colCache.get(key);
    if (hit) return hit;
    if (this.colCache.size > 6000) this.colCache.clear();
    let h, biome;
    if (this.type === 'flat') { h = 4; biome = BIOME.PLAINS; }
    else {
      const c = this.nC.fbm2(x / 700, z / 700, 4);
      h = SEA + 3 + c * 38 + this.nD.fbm2(x / 120, z / 120, 4) * 7 + this.nD.n2(x / 28 + 9, z / 28 - 3) * 1.6;
      const mf = smooth(0.12, 0.42, this.nM.fbm2(x / 900 + 33, z / 900 - 71, 3));
      if (mf > 0) { let r = 1 - Math.abs(this.nR.fbm2(x / 170, z / 170, 3)); r *= r; h += mf * (r * 48 + 8); }
      h = Math.max(6, Math.min(HEIGHT - 10, Math.floor(h)));
      const temp = this.nT.fbm2(x / 800 + 500, z / 800, 2);
      const hum = this.nH.fbm2(x / 600 - 300, z / 600 + 200, 2);
      if (h < SEA - 1) biome = BIOME.OCEAN;
      else if (h <= SEA + 1 && temp > -0.3) biome = BIOME.BEACH;
      else if (h > SEA + 36) biome = BIOME.MOUNTAINS;
      else if (temp > 0.22 && hum < 0.08) biome = BIOME.DESERT;
      else if (temp < -0.24) biome = BIOME.SNOWY;
      else if (hum > 0.12) biome = temp < -0.02 ? BIOME.BIRCH : BIOME.FOREST;
      else biome = BIOME.PLAINS;
      var cold = temp < -0.24;
    }
    const out = { h, biome, cold: !!cold };
    this.colCache.set(key, out);
    return out;
  }

  generate(cx, cz) {
    const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    if (this.type === 'flat') {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        data[IDX(x, 0, z)] = B.BEDROCK;
        for (let y = 1; y < 4; y++) data[IDX(x, y, z)] = B.DIRT;
        data[IDX(x, 4, z)] = B.GRASS;
      }
      return data;
    }
    const seed = this.seed;
    const heights = new Int16Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = x0 + x, wz = z0 + z;
      const { h, biome, cold } = this.column(wx, wz);
      heights[x + z * 16] = h;
      let top = B.GRASS, fill = B.DIRT, depth = 3 + ((hash2(wx, wz, seed) * 2) | 0), under = B.STONE;
      switch (biome) {
        case BIOME.OCEAN: { const r = hash2(wx >> 2, wz >> 2, seed + 9); top = r < 0.6 ? B.SAND : r < 0.85 ? B.GRAVEL : B.CLAY; fill = top === B.CLAY ? B.CLAY : B.SAND; break; }
        case BIOME.BEACH: top = B.SAND; fill = B.SAND; depth = 4; under = B.SANDSTONE; break;
        case BIOME.DESERT: top = B.SAND; fill = B.SAND; depth = 4; under = B.SANDSTONE; break;
        case BIOME.SNOWY: top = B.SNOW_GRASS; break;
        case BIOME.MOUNTAINS: top = h > SEA + 52 ? B.SNOW : h > SEA + 42 ? B.STONE : B.GRASS; fill = h > SEA + 42 ? B.STONE : B.DIRT; break;
      }
      data[IDX(x, 0, z)] = B.BEDROCK;
      for (let y = 1; y <= h; y++) {
        let id;
        if (y <= 3 && hash3(wx, y, wz, seed) < 0.6 - y * 0.15) id = B.BEDROCK;
        else if (y === h) id = top;
        else if (y > h - depth) id = fill;
        else if (y > h - depth - 3 && under === B.SANDSTONE) id = B.SANDSTONE;
        else id = B.STONE;
        data[IDX(x, y, z)] = id;
      }
      if (h < SEA) {
        for (let y = h + 1; y <= SEA; y++) data[IDX(x, y, z)] = B.WATER;
        if (cold) data[IDX(x, SEA, z)] = B.ICE;
      }
    }

    // caves: two crossed noise fields make spaghetti tunnels, a third makes deep caverns
    const k1 = this.nK1, k2 = this.nK2, k3 = this.nK3;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = x0 + x, wz = z0 + z;
      const h = heights[x + z * 16];
      const wet = h <= SEA + 2;
      const yMax = wet ? h - 6 : h;
      for (let y = 1; y <= yMax; y++) {
        const i = IDX(x, y, z);
        const id = data[i];
        if (id === B.BEDROCK || id === B.WATER) continue;
        const a = k1.n3(wx / 46, y / 28, wz / 46), b = k2.n3(wx / 46, y / 28, wz / 46);
        let carve = a * a + b * b < 0.011 * (y < 20 ? 1.5 : 1);
        if (!carve && y < 42) carve = k3.n3(wx / 70, y / 34, wz / 70) > 0.64 - (42 - y) * 0.002;
        if (carve) data[i] = y <= 9 ? B.LAVA : B.AIR;
      }
    }

    // ore veins
    const rnd = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ seed) | 0);
    const vein = (ore, count, size, yMin, yMax) => {
      for (let v = 0; v < count; v++) {
        let x = (rnd() * 16) | 0, y = yMin + ((rnd() * (yMax - yMin)) | 0), z = (rnd() * 16) | 0;
        const n = 1 + ((rnd() * size) | 0);
        for (let k = 0; k < n; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < HEIGHT) {
            const i = IDX(x, y, z);
            if (data[i] === B.STONE) data[i] = ore;
          }
          const d = (rnd() * 6) | 0;
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    };
    vein(B.DIRT, 5, 18, 5, 90);
    vein(B.GRAVEL, 4, 16, 5, 90);
    vein(B.COAL_ORE, 18, 9, 5, 100);
    vein(B.IRON_ORE, 12, 7, 5, 62);
    vein(B.GOLD_ORE, 3, 7, 5, 30);
    vein(B.DIAMOND_ORE, 2, 5, 3, 15);

    // surface plants
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = x0 + x, wz = z0 + z;
      const h = heights[x + z * 16];
      if (h + 1 >= HEIGHT) continue;
      const topId = data[IDX(x, h, z)], above = IDX(x, h + 1, z);
      if (data[above] !== B.AIR) continue;
      const r = hash2(wx, wz, seed + 77);
      const { biome } = this.column(wx, wz);
      if (topId === B.GRASS) {
        const grassChance = biome === BIOME.PLAINS ? 0.22 : biome === BIOME.MOUNTAINS ? 0.05 : 0.1;
        if (r < 0.018) data[above] = r < 0.008 ? B.FLOWER_RED : r < 0.014 ? B.FLOWER_YELLOW : B.FLOWER_BLUE;
        else if (r < grassChance) data[above] = B.TALL_GRASS;
      } else if (topId === B.SAND && biome === BIOME.DESERT && r < 0.012) data[above] = B.DEAD_BUSH;
    }

    // trees: one candidate per 5x5 cell, so trunks never touch; neighbours' trees spill into this chunk
    const cell = 5;
    const gx0 = Math.floor((x0 - 3) / cell), gx1 = Math.floor((x0 + 18) / cell);
    const gz0 = Math.floor((z0 - 3) / cell), gz1 = Math.floor((z0 + 18) / cell);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const r = hash2(gx, gz, seed + 31);
      const wx = gx * cell + ((hash2(gx, gz, seed + 32) * cell) | 0);
      const wz = gz * cell + ((hash2(gx, gz, seed + 33) * cell) | 0);
      const col = this.column(wx, wz);
      if (col.h <= SEA || col.h > HEIGHT - 14) continue;
      let type = null;
      switch (col.biome) {
        case BIOME.FOREST: if (r < 0.78) type = r < 0.12 ? 'birch' : 'oak'; break;
        case BIOME.BIRCH: if (r < 0.72) type = r < 0.15 ? 'oak' : 'birch'; break;
        case BIOME.PLAINS: if (r < 0.06) type = 'oak'; break;
        case BIOME.SNOWY: if (r < 0.45) type = 'spruce'; break;
        case BIOME.MOUNTAINS: if (r < 0.12 && col.h < SEA + 42) type = 'spruce'; break;
        case BIOME.DESERT: if (r < 0.1) type = 'cactus'; break;
      }
      if (!type) continue;
      this.tree(data, x0, z0, wx, col.h + 1, wz, type, mulberry32((Math.imul(wx, 341873128) ^ Math.imul(wz, 132897987) ^ seed) | 0));
    }
    return data;
  }

  tree(data, x0, z0, wx, y, wz, type, rnd) {
    const lx = wx - x0, lz = wz - z0;
    const inside = (x, z) => x >= 0 && x < 16 && z >= 0 && z < 16;
    // the trunk only grows on real ground inside this chunk
    if (inside(lx, lz)) {
      const g = data[IDX(lx, y - 1, lz)];
      if (type === 'cactus' ? g !== B.SAND : (g !== B.GRASS && g !== B.SNOW_GRASS && g !== B.DIRT)) return;
    }
    const set = (x, yy, z, id, force) => {
      const ax = x - x0, az = z - z0;
      if (!inside(ax, az) || yy <= 0 || yy >= HEIGHT) return;
      const i = IDX(ax, yy, az);
      const cur = data[i];
      if (cur === B.AIR || cur === B.TALL_GRASS || (force && (cur === B.LEAVES || cur === B.BIRCH_LEAVES || cur === B.SPRUCE_LEAVES))) data[i] = id;
    };
    if (type === 'cactus') {
      const n = 1 + ((rnd() * 3) | 0);
      for (let k = 0; k < n; k++) set(wx, y + k, wz, B.CACTUS);
      return;
    }
    if (type === 'spruce') {
      const n = 6 + ((rnd() * 4) | 0);
      for (let k = 0; k < n; k++) set(wx, y + k, wz, B.SPRUCE_LOG, true);
      set(wx, y + n, wz, B.SPRUCE_LEAVES);
      for (let k = n; k >= 2; k--) {
        const yy = y + k, i = n - k;
        const r = i === 0 ? 1 : i % 2 === 1 ? Math.min(3, 1 + Math.floor(i / 3)) : Math.max(1, Math.floor(i / 3));
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > r + (r > 1 ? 1 : 0)) continue;
          if (dx === 0 && dz === 0) continue;
          set(wx + dx, yy, wz + dz, B.SPRUCE_LEAVES);
        }
      }
      return;
    }
    const birch = type === 'birch';
    const log = birch ? B.BIRCH_LOG : B.LOG, leaf = birch ? B.BIRCH_LEAVES : B.LEAVES;
    const n = (birch ? 5 : 4) + ((rnd() * 3) | 0);
    const top = y + n - 1;
    for (let yy = top - 2; yy <= top + 1; yy++) {
      const r = yy >= top ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && (yy === top + 1 || rnd() < 0.5)) continue;
        if (yy === top + 1 && r === 1 && corner) continue;
        set(wx + dx, yy, wz + dz, leaf);
      }
    }
    for (let k = 0; k < n; k++) set(wx, y + k, wz, log, true);
  }

  findSpawn() {
    if (this.type === 'flat') return [0.5, 5.2, 0.5];
    // prefer green, gentle land; fall back to any dry land
    const good = [BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH];
    for (let r = 0; r < 600; r += 8) {
      for (let a = 0; a < 24; a++) {
        const x = Math.round(Math.cos(a / 24 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 24 * Math.PI * 2) * r);
        const c = this.column(x, z);
        if (good.includes(c.biome) && c.h > SEA + 2) return [x + 0.5, c.h + 1.2, z + 0.5];
        if (r === 0) break;
      }
    }
    for (let r = 0; r < 400; r += 4) {
      for (let a = 0; a < 16; a++) {
        const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 16 * Math.PI * 2) * r);
        const c = this.column(x, z);
        if (c.h > SEA + 1 && c.biome !== BIOME.MOUNTAINS && c.biome !== BIOME.OCEAN) return [x + 0.5, c.h + 1.2, z + 0.5];
        if (r === 0) break;
      }
    }
    return [0.5, this.column(0, 0).h + 1.2, 0.5];
  }
}
