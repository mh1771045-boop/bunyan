// Mobs, dropped items and arrows: models, simple AI, spawning, combat.
import { THREE } from './renderer.js';
import { SKINS, spriteCanvas } from './textures.js';
import { moveBox, collides, raycast } from './physics.js';
import { BLOCKS, B, I, SEA, isWater, isBlockId } from './blocks.js';
import { BIOME } from './worldgen.js';

const texCache = new Map();
function tex(kind, part) {
  const k = kind + ':' + part;
  if (texCache.has(k)) return texCache.get(k);
  const f = SKINS[kind][part] || SKINS[kind].body;
  const t = new THREE.CanvasTexture(f()); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.NoColorSpace;
  texCache.set(k, t);
  return t;
}
function box(kind, part, w, h, d, faceFront) {
  const g = new THREE.BoxGeometry(w, h, d);
  const base = new THREE.MeshBasicMaterial({ map: tex(kind, part) });
  let mat = base;
  if (faceFront) {
    const face = new THREE.MeshBasicMaterial({ map: tex(kind, 'face') });
    mat = [base, base, base, base, face, base];
  }
  const m = new THREE.Mesh(g, mat);
  return m;
}
function pivot(mesh, px, py, pz, offY) { const g = new THREE.Group(); g.position.set(px, py, pz); mesh.position.y = offY; g.add(mesh); return g; }

export const MOBS = {
  sheep: { name: 'خروف', w: 0.9, h: 1.3, hp: 8, speed: 1.2, hostile: false, drops: [[B.WOOL, 1, 1], [I.RAW_MUTTON, 1, 2]], sound: 'sheep' },
  cow: { name: 'بقرة', w: 0.9, h: 1.4, hp: 10, speed: 1.1, hostile: false, drops: [[I.RAW_BEEF, 1, 3], [I.LEATHER, 0, 2]], sound: 'cow' },
  chicken: { name: 'دجاجة', w: 0.45, h: 0.7, hp: 4, speed: 1.3, hostile: false, drops: [[I.RAW_CHICKEN, 1, 1], [I.FEATHER, 0, 2]], sound: 'chicken' },
  camel: { name: 'جمل', w: 1.2, h: 2.0, hp: 16, speed: 1.4, hostile: false, drops: [[I.LEATHER, 1, 3]], sound: 'camel' },
  zombie: { name: 'زومبي', w: 0.6, h: 1.95, hp: 20, speed: 2.3, hostile: true, damage: 3, burns: true, drops: [[I.ROTTEN_FLESH, 0, 2]], sound: 'zombie' },
  skeleton: { name: 'هيكل عظمي', w: 0.6, h: 1.95, hp: 20, speed: 2.4, hostile: true, ranged: true, damage: 3, burns: true, drops: [[I.BONE, 0, 2], [I.ARROW, 0, 2]], sound: 'skeleton' },
  spider: { name: 'عنكبوت', w: 1.3, h: 0.9, hp: 16, speed: 3.2, hostile: true, damage: 2, drops: [[I.STRING, 0, 2]], sound: 'spider' },
};

function buildModel(kind) {
  const g = new THREE.Group();
  const parts = { legs: [], arms: [] };
  const S = 1 / 16;
  if (kind === 'sheep' || kind === 'cow' || kind === 'camel') {
    const camel = kind === 'camel';
    const bw = camel ? 14 : 12, bh = camel ? 10 : 9, bl = camel ? 20 : 16, legH = camel ? 14 : 8;
    const body = box(kind, 'body', bw * S, bh * S, bl * S); body.position.set(0, (legH + bh / 2) * S, 0); g.add(body);
    if (camel) { const hump = box(kind, 'body', 8 * S, 5 * S, 8 * S); hump.position.set(0, (legH + bh + 2.5) * S, 0); g.add(hump); }
    const head = box(kind, 'head', 8 * S, 8 * S, (camel ? 10 : 8) * S, true);
    const neckY = camel ? (legH + bh + 6) : (legH + bh - 1);
    const hp = pivot(head, 0, neckY * S, (bl / 2 + (camel ? 2 : 1)) * S, 0);
    head.position.z = 3 * S;
    if (camel) { const neck = box(kind, 'body', 5 * S, 10 * S, 5 * S); neck.position.set(0, -5 * S, 1 * S); hp.add(neck); }
    if (kind === 'cow') { for (const sx of [-1, 1]) { const horn = box(kind, 'horn', 1.5 * S, 3 * S, 1.5 * S); horn.position.set(sx * 4.5 * S, 4.5 * S, 3 * S); hp.add(horn); } }
    g.add(hp); parts.head = hp;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = box(kind, 'leg', 4 * S, legH * S, 4 * S);
      const p = pivot(leg, sx * (bw / 2 - 2.5) * S, legH * S, sz * (bl / 2 - 3) * S, -legH / 2 * S);
      g.add(p); parts.legs.push(p);
    }
  } else if (kind === 'chicken') {
    const body = box(kind, 'body', 6 * S, 6 * S, 8 * S); body.position.set(0, 7 * S, 0); g.add(body);
    for (const sx of [-1, 1]) { const wing = box(kind, 'body', 1 * S, 4 * S, 6 * S); wing.position.set(sx * 3.5 * S, 7.5 * S, 0); g.add(wing); }
    const head = box(kind, 'head', 4 * S, 6 * S, 3 * S, true);
    const hp = pivot(head, 0, 11 * S, 4 * S, 0); g.add(hp); parts.head = hp;
    for (const sx of [-1, 1]) { const leg = box(kind, 'leg', 1 * S, 4 * S, 1 * S); const p = pivot(leg, sx * 1.5 * S, 4 * S, 0, -2 * S); g.add(p); parts.legs.push(p); }
  } else if (kind === 'spider') {
    const body = box(kind, 'body', 10 * S, 8 * S, 12 * S); body.position.set(0, 7 * S, -4 * S); g.add(body);
    const neck = box(kind, 'head', 6 * S, 6 * S, 6 * S); neck.position.set(0, 7 * S, 3 * S); g.add(neck);
    const head = box(kind, 'head', 8 * S, 8 * S, 6 * S, true);
    const hp = pivot(head, 0, 7 * S, 8 * S, 0); g.add(hp); parts.head = hp;
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, row = i % 4;
      const leg = box(kind, 'leg', 14 * S, 2 * S, 2 * S); leg.position.x = side * 7 * S;
      const p = new THREE.Group(); p.position.set(side * 3 * S, 7 * S, (2 - row * 2.2) * S); p.add(leg);
      p.rotation.z = side * -0.6; p.rotation.y = (row - 1.5) * 0.35 * side;
      g.add(p); parts.legs.push(p);
    }
  } else {
    // humanoids: zombie, skeleton, player
    const thin = kind === 'skeleton';
    const body = box(kind, 'body', 8 * S, 12 * S, 4 * S); body.position.set(0, 18 * S, 0); g.add(body);
    const head = box(kind, 'head', 8 * S, 8 * S, 8 * S, true);
    const hp = pivot(head, 0, 24 * S, 0, 4 * S); g.add(hp); parts.head = hp;
    for (const sx of [-1, 1]) {
      const arm = box(kind, 'arm', (thin ? 2 : 4) * S, 12 * S, (thin ? 2 : 4) * S);
      const p = pivot(arm, sx * (thin ? 5 : 6) * S, 23 * S, 0, -5 * S); g.add(p); parts.arms.push(p);
      const leg = box(kind, 'leg', (thin ? 2 : 4) * S, 12 * S, (thin ? 2 : 4) * S);
      const q = pivot(leg, sx * 2 * S, 12 * S, 0, -6 * S); g.add(q); parts.legs.push(q);
    }
    if (kind === 'zombie') for (const a of parts.arms) a.rotation.x = -1.4;
    if (kind === 'skeleton') {
      const bowM = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: itemTex(I.BOW), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
      bowM.position.set(0, -10 * S, 2 * S); bowM.rotation.y = Math.PI / 2; parts.arms[1].add(bowM);
      parts.arms[1].rotation.x = -1.4;
    }
  }
  const mats = [];
  g.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (!mats.includes(m)) mats.push(m); } });
  return { group: g, parts, mats };
}
const itemTexCache = new Map();
function itemTex(id) {
  if (itemTexCache.has(id)) return itemTexCache.get(id);
  const t = new THREE.CanvasTexture(spriteCanvas(id)); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.NoColorSpace;
  itemTexCache.set(id, t); return t;
}

let uid = 1;
class Mob {
  constructor(kind, x, y, z) {
    this.id = uid++;
    this.kind = kind; this.def = MOBS[kind];
    this.x = x; this.y = y; this.z = z; this.vx = 0; this.vy = 0; this.vz = 0;
    this.w = this.def.w; this.h = this.def.h;
    this.yaw = Math.random() * Math.PI * 2; this.targetYaw = this.yaw;
    this.hp = this.def.hp; this.onGround = false;
    this.state = 'idle'; this.timer = Math.random() * 3; this.walk = 0; this.hurtT = 0; this.deadT = 0; this.attackCd = 0;
    this.burnT = 0; this.age = 0; this.panic = 0;
    const m = buildModel(kind);
    this.model = m.group; this.parts = m.parts;
    // each mob owns its materials so its brightness and hurt flash are its own
    const map = new Map();
    this.model.traverse(o => {
      if (!o.material) return;
      const swap = mm => { if (!map.has(mm)) map.set(mm, mm.clone()); return map.get(mm); };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    this.mats = [...map.values()];
  }
}

class Drop {
  constructor(id, count, dur, x, y, z, vx, vy, vz) {
    this.uid = uid++;
    this.item = id; this.count = count; this.dur = dur;
    this.x = x; this.y = y; this.z = z; this.vx = vx; this.vy = vy; this.vz = vz;
    this.w = 0.25; this.h = 0.25; this.age = 0; this.pickDelay = 0.6; this.onGround = false;
    this.model = dropModel(id);
  }
}
function dropModel(id) {
  if (isBlockId(id) && BLOCKS[id].tex && !['cross', 'torch', 'crop', 'sign'].includes(BLOCKS[id].shape)) {
    const b = BLOCKS[id];
    const g = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const uv = g.attributes.uv;
    const faces = [b.tex.side, b.tex.side, b.tex.top, b.tex.bottom, b.tex.side, b.tex.side];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k, t = faces[f]; uv.setXY(i, ((t & 15) * 16 + 0.01 + uv.getX(i) * 15.98) / 256, ((t >> 4) * 16 + 0.01 + (1 - uv.getY(i)) * 15.98) / 256); }
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: Drop.atlas, alphaTest: 0.5 }));
    return m;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: itemTex(id), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  return m;
}

class Arrow {
  constructor(x, y, z, vx, vy, vz, fromPlayer, dmg) {
    this.uid = uid++;
    this.x = x; this.y = y; this.z = z; this.vx = vx; this.vy = vy; this.vz = vz; this.fromPlayer = fromPlayer; this.dmg = dmg;
    this.stuck = false; this.age = 0;
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.6), new THREE.MeshBasicMaterial({ color: 0x8a6438 }));
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.1), new THREE.MeshBasicMaterial({ color: 0x9a9aa2 })); tip.position.z = -0.3;
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 0.14), new THREE.MeshBasicMaterial({ color: 0xeeeeee })); fl.position.z = 0.25;
    g.add(shaft, tip, fl);
    this.model = g;
  }
}

export class Entities {
  constructor(renderer, world, game) {
    this.r = renderer; this.world = world; this.game = game;
    this.mobs = []; this.drops = []; this.arrows = [];
    this.group = renderer.entityGroup;
    Drop.atlas = renderer.atlas;
    this.spawnTimer = 0;
    this.events = [];
  }
  clear() {
    for (const e of [...this.mobs, ...this.drops, ...this.arrows]) this.dispose(e);
    this.mobs = []; this.drops = []; this.arrows = [];
  }
  dispose(e) { this.group.remove(e.model); e.model.traverse(o => { if (o.geometry) o.geometry.dispose(); }); if (e.mats) for (const m of e.mats) m.dispose(); }

  spawnMob(kind, x, y, z) {
    const m = new Mob(kind, x, y, z);
    this.mobs.push(m); this.group.add(m.model);
    return m;
  }
  drop(id, count, x, y, z, opts = {}) {
    if (!id || count <= 0) return;
    const a = Math.random() * Math.PI * 2, sp = opts.toss ? 0 : 1.6;
    const d = new Drop(id, count, opts.dur, x, y, z, opts.vx ?? Math.cos(a) * sp, opts.vy ?? 3.5, opts.vz ?? Math.sin(a) * sp);
    if (opts.pickDelay) d.pickDelay = opts.pickDelay;
    this.drops.push(d); this.group.add(d.model);
  }
  shoot(x, y, z, dx, dy, dz, speed, fromPlayer, dmg) {
    const a = new Arrow(x, y, z, dx * speed, dy * speed, dz * speed, fromPlayer, dmg);
    this.arrows.push(a); this.group.add(a.model);
    return a;
  }

  // ray vs mob boxes; returns {mob, dist}
  raycast(ox, oy, oz, dx, dy, dz, maxD) {
    let best = null;
    for (const m of this.mobs) {
      if (m.deadT > 0) continue;
      const hw = m.w / 2 + 0.1;
      const t = rayBox(ox, oy, oz, dx, dy, dz, m.x - hw, m.y, m.z - hw, m.x + hw, m.y + m.h + 0.1, m.z + hw);
      if (t !== null && t <= maxD && (!best || t < best.dist)) best = { mob: m, dist: t };
    }
    return best;
  }

  hit(mob, dmg, fromX, fromZ, byPlayer = true) {
    if (mob.deadT > 0 || mob.hurtT > 0.3) return false;
    mob.hp -= dmg; mob.hurtT = 0.5;
    const dx = mob.x - fromX, dz = mob.z - fromZ, l = Math.hypot(dx, dz) || 1;
    mob.vx += dx / l * 7; mob.vz += dz / l * 7; mob.vy = 5;
    if (!mob.def.hostile) mob.panic = 5;
    else if (byPlayer) mob.aggro = 30;
    this.events.push({ t: 'mobHurt', kind: mob.kind, x: mob.x, y: mob.y, z: mob.z });
    if (mob.hp <= 0) {
      mob.deadT = 0.001;
      for (const [id, a, b] of mob.def.drops) { const n = a + ((Math.random() * (b - a + 1)) | 0); if (n > 0) this.drop(id, n, mob.x, mob.y + 0.5, mob.z); }
      this.events.push({ t: 'mobDie', kind: mob.kind, x: mob.x, y: mob.y, z: mob.z });
    }
    return true;
  }

  update(dt, player, daylight, opts) {
    const world = this.world, game = this.game;
    const peaceful = game.difficulty === 0;
    // ---- mobs
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.age += dt;
      if (!world.isLoaded(Math.floor(m.x), Math.floor(m.z))) { if (m.def.hostile) { this.dispose(m); this.mobs.splice(i, 1); } continue; }
      const dist = Math.hypot(m.x - player.x, m.z - player.z);
      if (m.deadT > 0) {
        m.deadT += dt;
        m.model.rotation.z = Math.min(Math.PI / 2, m.deadT * 5);
        if (m.deadT > 0.9) { this.events.push({ t: 'poof', x: m.x, y: m.y + 0.5, z: m.z }); this.dispose(m); this.mobs.splice(i, 1); }
        this.light(m, daylight, true);
        continue;
      }
      if ((m.def.hostile && (peaceful || dist > 110)) || (m.def.hostile && dist > 48 && daylight > 0.8 && Math.random() < dt * 0.05)) { this.dispose(m); this.mobs.splice(i, 1); continue; }
      m.hurtT = Math.max(0, m.hurtT - dt); m.attackCd = Math.max(0, m.attackCd - dt); m.panic = Math.max(0, m.panic - dt);
      if (m.aggro) m.aggro = Math.max(0, m.aggro - dt);

      // brain
      let wantX = 0, wantZ = 0, speed = m.def.speed;
      const hostileActive = m.def.hostile && !player.dead && game.mode !== 'creative' && (daylight < 0.6 || m.kind !== 'spider' || m.aggro) && dist < 24;
      if (hostileActive) {
        const dx = player.x - m.x, dz = player.z - m.z;
        if (m.def.ranged && dist < 7) { wantX = -dx; wantZ = -dz; speed *= 0.6; }
        else if (!m.def.ranged || dist > 10) { wantX = dx; wantZ = dz; }
        m.targetYaw = Math.atan2(dx, dz);
        if (!m.def.ranged && dist < 1.3 + m.w / 2 && Math.abs(player.y - m.y) < 1.6 && m.attackCd <= 0) {
          m.attackCd = 1;
          if (player.hurt(m.def.damage, 'mob', game, m)) this.events.push({ t: 'mobAttack', kind: m.kind });
        }
        if (m.kind === 'spider' && m.onGround && dist < 4 && dist > 2 && Math.random() < dt * 1.5) { m.vy = 6.5; m.vx += dx / dist * 4; m.vz += dz / dist * 4; }
        if (m.def.ranged && dist < 16 && m.attackCd <= 0) {
          const ex = m.x, ey = m.y + 1.5, ez = m.z;
          const tx = player.x - ex, ty = player.eye - 0.3 - ey, tz = player.z - ez, tl = Math.hypot(tx, ty, tz);
          const clear = !raycast(world, ex, ey, ez, tx / tl, ty / tl, tz / tl, tl, id => BLOCKS[id].solid && BLOCKS[id].opaque);
          if (clear) { m.attackCd = 2.2; this.shoot(ex + tx / tl * 0.6, ey, ez + tz / tl * 0.6, tx / tl, ty / tl + tl * 0.012, tz / tl, 22, false, m.def.damage); this.events.push({ t: 'bow' }); }
        }
      } else if (m.panic > 0) {
        if (m.timer <= 0) { m.targetYaw = Math.random() * Math.PI * 2; m.timer = 1; }
        wantX = Math.sin(m.targetYaw); wantZ = Math.cos(m.targetYaw); speed *= 1.8;
      } else {
        m.timer -= dt;
        if (m.timer <= 0) {
          if (m.state === 'idle') { m.state = 'walk'; m.targetYaw = Math.random() * Math.PI * 2; m.timer = 1.5 + Math.random() * 3; }
          else { m.state = 'idle'; m.timer = 2 + Math.random() * 5; }
        }
        // passive animals follow a player holding wheat
        if (!m.def.hostile && opts.lure && dist < 9 && dist > 2) { m.state = 'walk'; m.targetYaw = Math.atan2(player.x - m.x, player.z - m.z); m.timer = 0.5; }
        if (m.state === 'walk') { wantX = Math.sin(m.targetYaw); wantZ = Math.cos(m.targetYaw); }
      }
      m.timer -= dt * (m.panic > 0 ? 1 : 0);
      const wl = Math.hypot(wantX, wantZ);
      if (wl > 0) {
        wantX /= wl; wantZ /= wl;
        if (!hostileActive) m.targetYaw = Math.atan2(wantX, wantZ);
        // don't walk off cliffs or into deep water when calm
        const ax = Math.floor(m.x + wantX * (m.w / 2 + 0.6)), az = Math.floor(m.z + wantZ * (m.w / 2 + 0.6));
        if (!hostileActive && m.panic <= 0) {
          let drop = 0; while (drop < 4 && !BLOCKS[world.getBlock(ax, Math.floor(m.y) - 1 - drop, az)].solid) drop++;
          const wet = isWater(world.getBlock(ax, Math.floor(m.y), az)) || isWater(world.getBlock(ax, Math.floor(m.y) - 1, az));
          if (drop >= 3 || (wet && !m.inWater)) { wantX = 0; wantZ = 0; m.state = 'idle'; m.timer = 1; }
        }
      }
      let dy = m.targetYaw - m.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * Math.min(1, dt * 6);
      const k = Math.min(1, dt * (m.onGround ? 10 : 2));
      m.vx += (wantX * speed - m.vx) * k; m.vz += (wantZ * speed - m.vz) * k;
      const inW = isWater(world.getBlock(Math.floor(m.x), Math.floor(m.y + 0.4), Math.floor(m.z)));
      m.inWater = inW;
      if (inW) { m.vy += (2.5 - m.vy) * Math.min(1, dt * 3); } else m.vy -= 28 * dt;
      const res = moveBox(world, m, dt, 0);
      m.onGround = res.ground;
      if ((res.hitX || res.hitZ) && m.onGround && wl > 0) m.vy = 8.5;
      if (m.onGround && m.vy < 0) m.vy = 0;
      if (m.y < -20) { this.dispose(m); this.mobs.splice(i, 1); continue; }
      // undead burn under an open sky in daylight
      if (m.def.burns && daylight > 0.75) {
        const l = world.light(Math.floor(m.x), Math.floor(m.y + 1.6), Math.floor(m.z));
        if (l.sky >= 15 && !inW) { m.burnT += dt; if (m.burnT > 1) { m.burnT = 0; this.hit(m, 2, m.x, m.z, false); this.events.push({ t: 'burn', x: m.x, y: m.y + 1, z: m.z }); } }
      }
      // animate
      const sp = Math.hypot(m.vx, m.vz);
      m.walk += sp * dt * 3.2;
      const sw = Math.sin(m.walk) * Math.min(1, sp / 1.2) * 0.7;
      m.parts.legs.forEach((p, j) => { if (m.kind === 'spider') p.rotation.x = Math.sin(m.walk * 1.4 + j) * 0.3 * Math.min(1, sp); else p.rotation.x = (j % 2 ? sw : -sw) * (m.parts.legs.length === 4 && j >= 2 ? -1 : 1); });
      if (m.kind !== 'zombie' && m.kind !== 'skeleton') m.parts.arms.forEach((p, j) => { p.rotation.x = j % 2 ? -sw : sw; });
      if (m.parts.head && hostileActive) m.parts.head.rotation.x = Math.max(-0.6, Math.min(0.6, -Math.atan2(player.eye - (m.y + m.h * 0.85), dist)));
      if (m.parts.head && !hostileActive && m.state === 'idle') m.parts.head.rotation.x = Math.sin(m.age * 0.7) * 0.15 + (m.kind === 'sheep' || m.kind === 'cow' ? 0.25 : 0);
      m.model.position.set(m.x, m.y, m.z);
      m.model.rotation.y = m.yaw;
      if (Math.random() < dt * 0.06 && dist < 16) this.events.push({ t: 'mobIdle', kind: m.kind, x: m.x, y: m.y, z: m.z });
      this.light(m, daylight);
    }

    // ---- drops
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt; d.pickDelay -= dt;
      if (d.age > 300) { this.dispose(d); this.drops.splice(i, 1); continue; }
      if (!world.isLoaded(Math.floor(d.x), Math.floor(d.z))) continue;
      const inW = isWater(world.getBlock(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)));
      d.vy -= (inW ? 4 : 20) * dt; if (inW) d.vy = Math.max(d.vy, -1);
      d.vx *= Math.pow(d.onGround ? 0.02 : 0.6, dt); d.vz *= Math.pow(d.onGround ? 0.02 : 0.6, dt);
      // pull toward the player when close
      const dx = player.x - d.x, dy = (player.y + 0.6) - d.y, dz = player.z - d.z, dl = Math.hypot(dx, dy, dz);
      if (!player.dead && d.pickDelay <= 0 && dl < 3) {
        if (dl < 1.25) { if (opts.pickup(d)) { this.events.push({ t: 'pickup' }); this.dispose(d); this.drops.splice(i, 1); continue; } }
        else { d.vx += dx / dl * 36 * dt; d.vy += dy / dl * 36 * dt + 16 * dt; d.vz += dz / dl * 36 * dt; }
      }
      const res = moveBox(world, d, dt, 0); d.onGround = res.ground;
      if (collides(world, d.x, d.y, d.z, d.w, d.h)) d.y += dt * 3;
      // merge stacks lying together
      if (d.age > 0.5 && (i & 3) === ((d.age * 10) & 3)) for (const o of this.drops) if (o !== d && o.item === d.item && o.dur === undefined && d.dur === undefined && Math.abs(o.x - d.x) + Math.abs(o.y - d.y) + Math.abs(o.z - d.z) < 1 && o.count + d.count <= 64) { o.count += d.count; d.count = 0; break; }
      if (!d.count) { this.dispose(d); this.drops.splice(i, 1); continue; }
      d.model.position.set(d.x, d.y + 0.15 + Math.sin(d.age * 2.5) * 0.06, d.z);
      d.model.rotation.y = d.age * 1.4;
      const br = world.brightness(d.x, d.y + 0.2, d.z, daylight);
      d.model.material.color.setScalar(br);
    }

    // ---- arrows
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.age += dt;
      if (a.age > 30) { this.dispose(a); this.arrows.splice(i, 1); continue; }
      if (!a.stuck) {
        a.vy -= 14 * dt;
        const sp = Math.hypot(a.vx, a.vy, a.vz), stepL = sp * dt;
        const nx = a.vx / sp, ny = a.vy / sp, nz = a.vz / sp;
        const hit = raycast(world, a.x, a.y, a.z, nx, ny, nz, stepL, id => BLOCKS[id].solid);
        // entity hits
        if (a.fromPlayer) {
          const mh = this.raycast(a.x, a.y, a.z, nx, ny, nz, stepL);
          if (mh) { this.hit(mh.mob, Math.ceil(a.dmg * Math.min(1, sp / 38) * 1.5), a.x - nx, a.z - nz); this.dispose(a); this.arrows.splice(i, 1); continue; }
        } else {
          const hw = 0.4;
          const t = rayBox(a.x, a.y, a.z, nx, ny, nz, player.x - hw, player.y, player.z - hw, player.x + hw, player.y + 1.8, player.z + hw);
          if (t !== null && t <= stepL) { player.hurt(a.dmg, 'arrow', game, { x: a.x, z: a.z }); this.dispose(a); this.arrows.splice(i, 1); continue; }
        }
        if (hit) { a.x += nx * hit.dist; a.y += ny * hit.dist; a.z += nz * hit.dist; a.stuck = true; a.age = Math.max(a.age, 20); this.events.push({ t: 'arrowHit', x: a.x, y: a.y, z: a.z }); }
        else { a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt; }
        a.model.position.set(a.x, a.y, a.z);
        a.model.lookAt(a.x - a.vx, a.y - a.vy, a.z - a.vz);
      } else if (a.fromPlayer && Math.hypot(player.x - a.x, player.y + 0.9 - a.y, player.z - a.z) < 1.4) {
        if (opts.pickup({ item: I.ARROW, count: 1 })) { this.events.push({ t: 'pickup' }); this.dispose(a); this.arrows.splice(i, 1); }
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 1.5; this.trySpawn(player, daylight, peaceful); }
  }

  light(m, daylight, dying) {
    const b = this.world.brightness(m.x, m.y + m.h * 0.6, m.z, daylight);
    const red = m.hurtT > 0.25 || dying;
    for (const mat of m.mats) { if (red) mat.color.setRGB(b, b * 0.45, b * 0.45); else mat.color.setScalar(b); }
  }

  trySpawn(player, daylight, peaceful) {
    const world = this.world;
    let hostile = 0, passive = 0;
    for (const m of this.mobs) { if (m.def.hostile) hostile++; else passive++; }
    // hostile mobs: in darkness, 20-44 blocks away
    if (!peaceful && this.game.mode !== 'creative' && hostile < 14) {
      for (let tries = 0; tries < 4; tries++) {
        const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 24;
        const x = Math.floor(player.x + Math.cos(a) * d), z = Math.floor(player.z + Math.sin(a) * d);
        if (!world.isMeshed(x, z)) continue;
        // pick a random height: the surface, or a cave floor
        const top = world.topY(x, z);
        const y = Math.random() < 0.5 ? top + 1 : 5 + Math.floor(Math.random() * Math.max(1, top - 5));
        const ground = world.getBlock(x, y - 1, z);
        if (!BLOCKS[ground].solid || !BLOCKS[ground].opaque || ground === B.BEDROCK) continue;
        if (world.getBlock(x, y, z) !== 0 || world.getBlock(x, y + 1, z) !== 0) continue;
        const l = world.light(x, y, z);
        if (l.block > 6 || l.sky * daylight > 6.5) continue;
        const r = Math.random();
        const kind = r < 0.5 ? 'zombie' : r < 0.78 ? 'skeleton' : 'spider';
        if (kind === 'spider' && (world.getBlock(x + 1, y, z) !== 0 || world.getBlock(x, y, z + 1) !== 0)) continue;
        this.spawnMob(kind, x + 0.5, y + 0.01, z + 0.5);
        break;
      }
    }
    // passive animals: on grass in the light, kept to a small herd around the player
    if (passive < 10 && Math.random() < 0.35) {
      const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 30;
      const x = Math.floor(player.x + Math.cos(a) * d), z = Math.floor(player.z + Math.sin(a) * d);
      if (world.isMeshed(x, z)) this.spawnHerd(x, z);
    }
  }

  spawnHerd(x, z, biomeHint) {
    const world = this.world;
    const y = world.topY(x, z);
    const g = world.getBlock(x, y, z);
    let kind = null;
    if (g === B.GRASS || g === B.SNOW_GRASS) { const r = Math.random(); kind = r < 0.4 ? 'sheep' : r < 0.7 ? 'cow' : 'chicken'; }
    else if (g === B.SAND && y > SEA + 1 && (biomeHint === undefined || biomeHint === BIOME.DESERT) && Math.random() < 0.5) kind = 'camel';
    if (!kind) return;
    if (world.getBlock(x, y + 1, z) !== 0 || world.getBlock(x, y + 2, z) !== 0) return;
    const n = kind === 'camel' ? 1 + (Math.random() < 0.4 ? 1 : 0) : 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const ox = x + ((Math.random() * 5) | 0) - 2, oz = z + ((Math.random() * 5) | 0) - 2;
      const oy = world.topY(ox, oz);
      if (world.getBlock(ox, oy + 1, oz) === 0 && world.getBlock(ox, oy + 2, oz) === 0 && BLOCKS[world.getBlock(ox, oy, oz)].solid) this.spawnMob(kind, ox + 0.5, oy + 1.01, oz + 0.5);
    }
  }

  nearHostile(x, y, z, r) { return this.mobs.some(m => m.def.hostile && m.deadT === 0 && Math.abs(m.x - x) < r && Math.abs(m.y - y) < 5 && Math.abs(m.z - z) < r); }

  serialize() {
    return {
      mobs: this.mobs.filter(m => !m.def.hostile && m.deadT === 0).slice(0, 60).map(m => ({ k: m.kind, x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2), hp: m.hp })),
      drops: this.drops.slice(0, 100).map(d => ({ i: d.item, c: d.count, d: d.dur, x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2), a: d.age })),
    };
  }
  load(o) {
    if (!o) return;
    for (const m of o.mobs || []) if (MOBS[m.k]) { const mm = this.spawnMob(m.k, m.x, m.y + 0.05, m.z); mm.hp = m.hp; }
    for (const d of o.drops || []) { this.drop(d.i, d.c, d.x, d.y + 0.1, d.z, { vx: 0, vy: 0, vz: 0, dur: d.d }); this.drops[this.drops.length - 1].age = d.a || 0; }
  }
}

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  const ax = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (const [o, d, a, b] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return null; continue; }
    let t1 = (a - o) / d, t2 = (b - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
