// Gameplay glue: one world session — camera, interactions, survival, time, furnaces, saving.
import { THREE } from './renderer.js';
import { World } from './world.js';
import { Entities } from './entities.js';
import { Player, EYE } from './player.js';
import { Inventory, stack } from './inventory.js';
import { raycast, targetable, collides } from './physics.js';
import { B, BLOCKS, I, ITEMS, HEIGHT, breakTime, canHarvest, toolOf, armorOf, isBlockId, isWater, isLiquid, maxStack, smeltOf, fuelOf, nameOf } from './blocks.js';

const DAY = 24000;
const SMELT_TIME = 8;

export class Game {
  constructor({ renderer, input, ui, sound, settings, store }) {
    Object.assign(this, { r: renderer, input, ui, sound, settings, store });
    this.v = new THREE.Vector3();
    this.running = false;
    this.breaking = null;
    this.attackCd = 0; this.useCd = 0; this.placeCd = 0;
    this.bowCharge = 0; this.eatT = 0;
    this.saveTimer = 0;
    this.signMeshes = new Map();
    this.camTilt = 0;
  }

  get mode() { return this.meta.mode; }
  get difficulty() { return this.meta.difficulty ?? 2; }

  async start(meta, onProgress) {
    this.meta = meta;
    this.world = new World({ renderer: this.r, meta, store: this.store, settings: this.settings });
    this.world.renderDistance = this.settings.renderDistance;
    this.r.setView(this.settings.renderDistance);
    this.player = new Player();
    this.inv = new Inventory();
    this.inv.onChange(() => this.ui.renderHotbar());
    this.entities = new Entities(this.r, this.world, this);
    await this.world.init();
    this.world.on('newChunk', c => { if (Math.random() < 0.22) { const x = c.cx * 16 + 8, z = c.cz * 16 + 8; setTimeout(() => this.entities && this.world.isMeshed(x, z) && this.entities.spawnHerd(x, z), 1500); } });
    this.world.on('popped', (x, y, z, id) => this.dropBlockItems(id, x, y, z));
    this.world.on('meshed', c => this.refreshSigns(c));
    this.world.on('unload', c => this.dropSigns(c));
    const fresh = !meta.player;
    if (meta.player) { this.player.load(meta.player); this.inv.load(meta.inventory); }
    else {
      const [x, y, z] = this.world.spawnGuess;
      this.player.x = x; this.player.y = y; this.player.z = z;
      meta.spawn = [x, y, z];
      if (meta.mode === 'survival' && meta.bonusChest) this.starter = true;
    }
    this.player.flying = this.player.flying && meta.mode === 'creative';
    const extra = await (this.store ? this.store.getExtra(meta.id, 'ents') : null);
    // wait for the ground under the player
    let tries = 0;
    while (true) {
      this.world.update(0.016, this.player.x, this.player.z);
      const p = this.world.loadedAround(this.player.x, this.player.z, Math.min(2, this.settings.renderDistance));
      onProgress && onProgress(Math.min(0.99, p));
      if (p >= 1 && this.world.isMeshed(Math.floor(this.player.x), Math.floor(this.player.z))) break;
      await new Promise(r => setTimeout(r, 30));
      if (++tries > 2000) break;
    }
    if (fresh) {
      const x = Math.floor(this.player.x), z = Math.floor(this.player.z);
      this.player.y = this.world.topY(x, z) + 1.01;
      meta.spawn = [this.player.x, this.player.y, this.player.z];
      if (this.starter) this.placeStarterChest(x, z);
    }
    while (collides(this.world, this.player.x, this.player.y, this.player.z, this.player.w, this.player.h) && this.player.y < HEIGHT) this.player.y += 1;
    if (extra) this.entities.load(extra);
    this.running = true;
    this.ui.renderHotbar();
    return this;
  }

  placeStarterChest(x, z) {
    const y = this.world.topY(x + 2, z) + 1;
    this.world.setBlock(x + 2, y, z, B.CHEST);
    this.world.blockEntities.set(`${x + 2},${y},${z}`, { kind: 'chest', facing: 3, slots: [stack(I.WOOD_PICK), stack(I.WOOD_AXE), stack(B.TORCH, 8), stack(I.APPLE, 5), stack(I.BREAD, 3), stack(B.PLANKS, 16)].concat(new Array(21).fill(null)) });
  }

  // ---------- frame ----------
  update(dt, it) {
    if (!this.running) return;
    const p = this.player, s = this.settings, w = this.world;
    const uiOpen = this.ui.blocking;
    if (!uiOpen) {
      p.yaw += it.lookDX;
      p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch + it.lookDY));
    }
    if (it.edges.flyToggle && this.mode === 'creative' && !uiOpen) { p.flying = !p.flying; p.vy = 0; this.input.setFlying(p.flying); }
    if (this.input.flying !== p.flying) this.input.setFlying(p.flying);
    if (it.edges.hotbar >= 0) { this.inv.selected = it.edges.hotbar; this.ui.renderHotbar(); }
    if (it.scroll) { this.inv.selected = (this.inv.selected + it.scroll + 9) % 9; this.ui.renderHotbar(); }
    if (it.edges.inventory) this.ui.toggleInventory();
    if (it.edges.pause) this.ui.pause();
    if (it.edges.drop && !uiOpen) this.dropHeld(false);
    if (it.edges.pick && this.mode === 'creative') this.pickBlock();

    const move = uiOpen ? { ...it, moveX: 0, moveZ: 0, jump: false, sneak: false } : it;
    p.tickTimers(dt);
    p.update(dt, move, w, this);
    this.handleEvents();

    // time
    if (this.meta.daylightCycle !== false) this.meta.time = (this.meta.time + dt * 20) % DAY;
    if (this.meta.time < 20 * dt + 1 && this.lastTime > DAY - 100) this.meta.day = (this.meta.day || 1) + 1;
    this.lastTime = this.meta.time;
    this.r.underwater = p.eyeInWater ? 1 : 0;
    this.r.setTime(this.meta.time);
    if (!p.eyeInWater) this.r.setView(this.settings.renderDistance);

    this.updateCamera(dt, it);
    if (!uiOpen && !p.dead) this.interact(dt, it);
    else { this.breaking = null; this.r.setSelection(null); }

    const lure = this.inv.heldId() === I.WHEAT || this.inv.heldId() === I.SEEDS;
    this.entities.update(dt, p, this.r.daylight, { lure, pickup: d => this.pickup(d) });
    for (const e of this.entities.events.splice(0)) this.entityEvent(e);
    w.update(dt, p.x, p.z);
    this.tickFurnaces(dt);
    this.randomTicks(dt);
    this.r.updateParticles(dt, (x, y, z) => { const id = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return BLOCKS[id].solid; });
    this.r.handBright = w.brightness(p.x, p.eye, p.z, this.r.daylight);
    this.r.setHeld(this.inv.heldId());
    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.save(); }
    this.ui.updateHud(this);
  }

  updateCamera(dt, it) {
    const p = this.player, cam = this.r.camera, s = this.settings;
    let bob = 0, bobX = 0;
    if (s.viewBob && p.onGround && !p.flying) { bob = Math.abs(Math.sin(p.walkDist * 1.9)) * 0.06; bobX = Math.sin(p.walkDist * 1.9) * 0.03; }
    cam.position.set(p.x + Math.cos(p.yaw) * bobX, p.eye + bob - 0.03, p.z - Math.sin(p.yaw) * bobX);
    this.camTilt += ((p.hurtTime > 0 ? Math.sin(p.hurtTime * 12) * 0.06 : 0) - this.camTilt) * Math.min(1, dt * 12);
    cam.rotation.set(p.pitch, p.yaw, this.camTilt);
    const fov = s.fov * (p.sprinting ? 1.1 : 1) * (p.flying && p.sprinting ? 1.06 : 1);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  aimRay(aim) {
    const cam = this.r.camera;
    if (!aim) { const d = this.player.look(); return [cam.position.x, cam.position.y, cam.position.z, d[0], d[1], d[2]]; }
    const v = this.v.set((aim.x / innerWidth) * 2 - 1, -(aim.y / innerHeight) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
    return [cam.position.x, cam.position.y, cam.position.z, v.x, v.y, v.z];
  }
  reach() { return this.mode === 'creative' ? 6 : 4.8; }
  target(aim, fluids) {
    const [ox, oy, oz, dx, dy, dz] = this.aimRay(aim);
    const reach = this.reach();
    const bh = raycast(this.world, ox, oy, oz, dx, dy, dz, reach, fluids ? (id => id !== 0 && (!isLiquid(id) || id === B.WATER || id === B.LAVA)) : targetable);
    const eh = this.entities.raycast(ox, oy, oz, dx, dy, dz, reach);
    if (eh && (!bh || eh.dist < bh.dist)) return { mob: eh.mob, dist: eh.dist };
    return bh ? { block: bh } : null;
  }

  interact(dt, it) {
    const s = this.settings;
    this.attackCd -= dt; this.useCd -= dt; this.placeCd -= dt;
    const touchScheme = s.controlScheme === 'touch' && !this.input.locked;
    const held = this.inv.heldId();
    const heldInfo = held >= 256 ? ITEMS[held] : null;
    const bow = held === I.BOW;
    const food = heldInfo && heldInfo.food && this.mode !== 'creative';

    // what the player is pointing at
    const aimHold = it.aim, aimTap = it.tapAim;
    const showAim = touchScheme ? aimHold : null;
    const t = (touchScheme && !aimHold) ? null : this.target(showAim);
    this.current = t;

    // bow: hold to draw, release to shoot
    if (bow && (it.useHeld || (touchScheme && it.holdTouch))) { this.bowCharge = Math.min(1, this.bowCharge + dt); this.r.hand.position.z += 0; }
    if (bow && it.edges.useRelease && this.bowCharge > 0.1) { this.shootArrow(this.bowCharge, touchScheme ? it.aim : null); this.bowCharge = 0; }
    if (!bow) this.bowCharge = 0;

    // breaking / attacking
    const wantsBreak = it.breakHeld && !bow && !(food && touchScheme && it.holdTouch && t && !t.mob);
    if (t && t.mob && (it.edges.attack || (wantsBreak && this.attackCd <= 0) || (touchScheme && it.tap && this.tapHitsMob(aimTap)))) {
      if (this.attackCd <= 0) this.attack(t.mob);
    } else if (wantsBreak && t && t.block) {
      this.mine(dt, t.block);
    } else this.breaking = null;
    if (!(wantsBreak && t && t.block)) this.breaking = null;

    // eating: hold use (desktop) / tap (touch) with food when hungry
    if (food && this.player.food < 20 && (it.useHeld && !touchScheme)) { this.eatT += dt; if (this.eatT > 1.1) { this.eat(); this.eatT = 0; } }
    else this.eatT = 0;

    // use / place
    const useNow = it.edges.use || (it.tap && !this.tapHitsMob(aimTap));
    if (useNow && this.useCd <= 0) {
      this.useCd = 0.12;
      if (food && this.player.food < 20 && (touchScheme || !it.edges.use)) { this.eat(); }
      else this.use(touchScheme ? aimTap : null);
    }
    // creative / survival: keep placing while the button is held (desktop)
    if (it.useHeld && !touchScheme && !bow && !food && this.placeCd <= 0 && this.useHeldT > 0.3) { this.use(null); this.placeCd = 0.22; }
    this.useHeldT = it.useHeld ? (this.useHeldT || 0) + dt : 0;

    // highlight
    const showSel = t && t.block && (!touchScheme || it.holdTouch);
    this.r.setSelection(showSel ? t.block : null, this.breaking ? Math.floor(this.breaking.progress * 10) : -1);
  }
  tapHitsMob(aim) {
    if (!aim && this.settings.controlScheme === 'touch') return false;
    const t = this.target(aim);
    return !!(t && t.mob);
  }

  mine(dt, hb) {
    const creative = this.mode === 'creative';
    const held = this.inv.heldId();
    if (creative && toolOf(held) && toolOf(held).type === 'sword') return;
    const k = hb.x + ',' + hb.y + ',' + hb.z;
    if (!this.breaking || this.breaking.key !== k) {
      if (creative && this.breaking && this.breaking.cool > 0) { this.breaking.cool -= dt; return; }
      this.breaking = { key: k, progress: 0, total: breakTime(hb.id, held, creative), sound: 0, cool: 0 };
    }
    const br = this.breaking;
    if (br.total === Infinity) return;
    if (creative) {
      if (br.cool > 0) { br.cool -= dt; return; }
      this.breakBlock(hb.x, hb.y, hb.z, hb.id);
      this.breaking = { key: '', progress: 0, total: 0, cool: 0.22 };
      return;
    }
    br.progress += dt / br.total;
    br.sound -= dt;
    if (br.sound <= 0) { br.sound = 0.24; this.sound.play('dig', { mat: BLOCKS[hb.id].sound }); this.r.swingHand(); this.r.burst(hb.x, hb.y, hb.z, hb.id, 2, this.world.brightness(hb.x + 0.5, hb.y + 1, hb.z + 0.5, this.r.daylight)); }
    if (br.progress >= 1) { this.breakBlock(hb.x, hb.y, hb.z, hb.id); this.breaking = null; }
  }

  breakBlock(x, y, z, id) {
    const w = this.world, b = BLOCKS[id];
    const held = this.inv.heldId();
    const creative = this.mode === 'creative';
    // chests spill their contents
    const be = w.blockEntities.get(x + ',' + y + ',' + z);
    if (be && !creative) {
      if (be.kind === 'chest') for (const s of be.slots) if (s) this.entities.drop(s.id, s.count, x + 0.5, y + 0.5, z + 0.5, { dur: s.dur });
      if (be.kind === 'furnace') for (const s of [be.input, be.fuel, be.output]) if (s) this.entities.drop(s.id, s.count, x + 0.5, y + 0.5, z + 0.5);
    }
    w.setBlock(x, y, z, 0);
    if (be && be.kind === 'sign') this.removeSignMesh(x + ',' + y + ',' + z);
    // water flows back into a hole next to it
    this.r.burst(x, y, z, id, 16, w.brightness(x + 0.5, y + 0.5, z + 0.5, this.r.daylight));
    this.sound.play('break', { mat: b.sound });
    if (this.settings.haptics && navigator.vibrate) navigator.vibrate(12);
    if (!creative) {
      if (canHarvest(id, held)) this.dropBlockItems(id, x, y, z, held);
      if (toolOf(held) && b.hardness > 0) { if (this.inv.damageHeld(1)) this.sound.play('break', { mat: 'wood' }); }
      this.player.exhaustion += 0.005;
    }
    this.ui.renderHotbar();
  }

  dropBlockItems(id, x, y, z) {
    if (this.mode === 'creative') return;
    const b = BLOCKS[id];
    const at = (i, n = 1) => this.entities.drop(i, n, x + 0.5, y + 0.4, z + 0.5);
    const r = Math.random();
    switch (id) {
      case B.LEAVES: if (r < 0.06) at(B.SAPLING); else if (r < 0.075) at(I.APPLE); return;
      case B.BIRCH_LEAVES: case B.SPRUCE_LEAVES: if (r < 0.05) at(B.SAPLING); return;
      case B.GRAVEL: at(r < 0.12 ? I.FLINT : B.GRAVEL); return;
      case B.TALL_GRASS: if (r < 0.14) at(I.SEEDS); return;
      case B.WHEAT3: at(I.WHEAT); at(I.SEEDS, 1 + ((Math.random() * 3) | 0)); return;
      case B.WHEAT0: case B.WHEAT1: case B.WHEAT2: at(I.SEEDS); return;
    }
    if (b.drop) at(b.drop, b.dropCount || 1);
  }

  attack(mob) {
    this.attackCd = 0.45;
    const t = toolOf(this.inv.heldId());
    const dmg = t ? t.damage : 1;
    const crit = !this.player.onGround && this.player.vy < 0 ? 1.5 : 1;
    if (this.entities.hit(mob, Math.round(dmg * crit), this.player.x, this.player.z)) {
      this.sound.play('hit');
      if (t && this.mode !== 'creative') this.inv.damageHeld(t.type === 'sword' ? 1 : 2);
      this.player.exhaustion += 0.1;
      if (this.settings.haptics && navigator.vibrate) navigator.vibrate(15);
    }
    this.r.swingHand();
  }

  shootArrow(charge, aim) {
    if (this.mode !== 'creative') { if (this.inv.count(I.ARROW) <= 0) { this.ui.toast('محتاج أسهم'); return; } this.inv.take(I.ARROW, 1); this.inv.damageHeld(1); }
    const [ox, oy, oz, dx, dy, dz] = this.aimRay(aim);
    this.entities.shoot(ox + dx * 0.5, oy - 0.1 + dy * 0.5, oz + dz * 0.5, dx, dy, dz, 12 + 26 * charge, true, 2 + charge * 4);
    this.sound.play('bow');
    this.r.swingHand();
  }

  eat() {
    const id = this.inv.heldId(), f = ITEMS[id] && ITEMS[id].food;
    if (!f) return;
    this.player.eat(f);
    this.inv.consumeHeld(1);
    this.sound.play('eat');
    setTimeout(() => this.sound.play('burp'), 420);
    const p = this.player;
    this.r.swingHand();
    if (id === I.ROTTEN_FLESH && Math.random() < 0.5) { p.food = Math.max(0, p.food - 2); this.ui.toast('معدتك اتقلبت شوية 🤢'); }
  }

  use(aim) {
    const w = this.world, p = this.player, inv = this.inv;
    const held = inv.heldId();
    const isBucket = held === I.BUCKET;
    const t = this.target(aim, isBucket);
    if (armorOf(held)) { if (inv.equip(inv.selected)) { this.sound.play('door'); this.ui.toast('لبست ' + nameOf(held)); } return; }
    if (t && t.mob) return;
    const hb = t && t.block;
    // blocks with an action
    if (hb && !p.sneaking) {
      const b = BLOCKS[hb.id];
      if (b.use) { this.useBlock(hb); return; }
    }
    if (!hb) return;
    // buckets
    if (isBucket) {
      if (hb.id === B.WATER || hb.id === B.LAVA) {
        w.setBlock(hb.x, hb.y, hb.z, 0);
        if (this.mode !== 'creative') { inv.consumeHeld(1); if (inv.add(hb.id === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET, 1)) this.entities.drop(hb.id === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET, 1, p.x, p.y + 1, p.z); }
        this.sound.play('splash');
      }
      return;
    }
    const nx = hb.x + hb.nx, ny = hb.y + hb.ny, nz = hb.z + hb.nz;
    const tgt = w.getBlock(nx, ny, nz);
    const into = BLOCKS[hb.id].replaceable && !isLiquid(hb.id) ? [hb.x, hb.y, hb.z] : [nx, ny, nz];
    if (held === I.WATER_BUCKET || held === I.LAVA_BUCKET) {
      const [x, y, z] = BLOCKS[hb.id].replaceable ? [hb.x, hb.y, hb.z] : [nx, ny, nz];
      const cur = w.getBlock(x, y, z);
      if (cur === 0 || BLOCKS[cur].replaceable) {
        w.setBlock(x, y, z, held === I.WATER_BUCKET ? B.WATER : B.LAVA);
        if (this.mode !== 'creative') { inv.consumeHeld(1); inv.add(I.BUCKET, 1); }
        this.sound.play('splash');
      }
      return;
    }
    // hoe: till grass or dirt
    const tool = toolOf(held);
    if (tool && tool.type === 'hoe') {
      if ((hb.id === B.GRASS || hb.id === B.DIRT) && w.getBlock(hb.x, hb.y + 1, hb.z) === 0) {
        w.setBlock(hb.x, hb.y, hb.z, B.FARMLAND); this.sound.play('step', { mat: 'dirt' }); this.r.swingHand();
        if (this.mode !== 'creative') inv.damageHeld(1);
      }
      return;
    }
    // seeds onto farmland
    if (held === I.SEEDS) {
      if (hb.id === B.FARMLAND && hb.ny === 1 && w.getBlock(hb.x, hb.y + 1, hb.z) === 0) {
        w.setBlock(hb.x, hb.y + 1, hb.z, B.WHEAT0); this.sound.play('place', { mat: 'grass' });
        if (this.mode !== 'creative') inv.consumeHeld(1);
        this.r.swingHand();
      }
      return;
    }
    if (!isBlockId(held)) return;
    const [x, y, z] = into;
    if (y < 0 || y >= HEIGHT) return;
    const cur = w.getBlock(x, y, z);
    if (cur !== 0 && !BLOCKS[cur].replaceable) return;
    const nb = BLOCKS[held];
    // placement rules
    const below = w.getBlock(x, y - 1, z);
    if (nb.needsSoil) {
      const okSoil = held === B.DEAD_BUSH ? below === B.SAND : [B.GRASS, B.DIRT, B.SNOW_GRASS, B.FARMLAND].includes(below);
      if (!okSoil) { this.ui.toast('النبات ده محتاج تربة'); return; }
    }
    if (held === B.CACTUS && below !== B.SAND && below !== B.CACTUS) { this.ui.toast('الصبّار بيتزرع على الرمل'); return; }
    if ((held === B.TORCH || held === B.SIGN) && !BLOCKS[below].solid) { this.ui.toast('محتاج أرض صلبة تحته'); return; }
    if (nb.solid && this.boxBlocked(x, y, z)) return;
    w.setBlock(x, y, z, held);
    const facing = this.facingToPlayer();
    if (held === B.FURNACE) w.blockEntities.set(`${x},${y},${z}`, { kind: 'furnace', facing, input: null, fuel: null, output: null, burn: 0, burnMax: 0, progress: 0 });
    if (held === B.CHEST) w.blockEntities.set(`${x},${y},${z}`, { kind: 'chest', facing, slots: new Array(27).fill(null) });
    if (held === B.SIGN) { const be = { kind: 'sign', text: '', yaw: Math.round(this.player.yaw / (Math.PI / 4)) * (Math.PI / 4) }; w.blockEntities.set(`${x},${y},${z}`, be); this.ui.openSign(be, () => this.updateSign(x, y, z)); }
    if (facing !== undefined && (held === B.FURNACE || held === B.CHEST)) w.markDirty(x >> 4, z >> 4, true);
    this.sound.play('place', { mat: nb.sound });
    this.r.swingHand();
    if (this.settings.haptics && navigator.vibrate) navigator.vibrate(6);
    if (this.mode !== 'creative') inv.consumeHeld(1);
  }

  boxBlocked(x, y, z) {
    const p = this.player, hw = p.w / 2;
    if (x + 1 > p.x - hw && x < p.x + hw && z + 1 > p.z - hw && z < p.z + hw && y + 1 > p.y && y < p.y + p.h) return true;
    for (const m of this.entities.mobs) { const mw = m.w / 2; if (x + 1 > m.x - mw && x < m.x + mw && z + 1 > m.z - mw && z < m.z + mw && y + 1 > m.y && y < m.y + m.h) return true; }
    return false;
  }
  // which face of a placed block looks at the player: 2 +x, 3 -x, 4 +z, 5 -z
  facingToPlayer() {
    const d = this.player.look();
    if (Math.abs(d[0]) > Math.abs(d[2])) return d[0] > 0 ? 3 : 2;
    return d[2] > 0 ? 5 : 4;
  }

  useBlock(hb) {
    const w = this.world;
    const k = `${hb.x},${hb.y},${hb.z}`;
    const id = hb.id;
    if (id === B.TABLE) { this.ui.openCrafting(true); return; }
    if (id === B.FURNACE || id === B.FURNACE_LIT) {
      let be = w.blockEntities.get(k);
      if (!be) { be = { kind: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, progress: 0 }; w.blockEntities.set(k, be); }
      this.ui.openFurnace(be); return;
    }
    if (id === B.CHEST) {
      let be = w.blockEntities.get(k);
      if (!be) { be = { kind: 'chest', slots: new Array(27).fill(null) }; w.blockEntities.set(k, be); }
      this.ui.openChest(be); this.sound.play('door'); return;
    }
    if (id === B.SIGN) { const be = w.blockEntities.get(k) || { kind: 'sign', text: '', yaw: 0 }; w.blockEntities.set(k, be); this.ui.openSign(be, () => this.updateSign(hb.x, hb.y, hb.z)); return; }
    if (id === B.BED) { this.sleep(hb); return; }
  }

  sleep(hb) {
    const t = this.meta.time;
    this.meta.spawnPoint = [hb.x + 0.5, hb.y + 1, hb.z + 0.5];
    this.player.spawn = this.meta.spawnPoint;
    const night = t > 12600 && t < 23400;
    if (!night) { this.ui.toast('اتسجّل مكان رجوعك هنا. تقدر تنام بالليل بس'); return; }
    if (this.entities.nearHostile(hb.x, hb.y, hb.z, 9)) { this.ui.toast('مينفعش تنام دلوقتي، في وحوش قريبة'); return; }
    this.ui.sleepFade(() => { this.meta.time = 0; this.meta.day = (this.meta.day || 1) + 1; this.ui.toast('صباح الخير ☀️'); });
  }

  pickBlock() {
    const t = this.target(null);
    if (!t || !t.block) return;
    let id = t.block.id;
    if (id === B.FURNACE_LIT) id = B.FURNACE;
    if (BLOCKS[id].hidden) return;
    const slot = this.inv.slots.findIndex((s, i) => i < 9 && s && s.id === id);
    if (slot >= 0) this.inv.selected = slot; else this.inv.slots[this.inv.selected] = stack(id, maxStack(id));
    this.inv.changed();
  }

  dropHeld(all) {
    const s = this.inv.held; if (!s) return;
    const n = all ? s.count : 1;
    const d = this.player.look();
    this.entities.drop(s.id, n, this.player.x + d[0] * 0.4, this.player.eye - 0.3, this.player.z + d[2] * 0.4, { vx: d[0] * 5, vy: d[1] * 5 + 1.5, vz: d[2] * 5, pickDelay: 1.6, dur: s.dur });
    this.inv.consumeHeld(n);
  }

  pickup(d) {
    const left = this.inv.add(d.item, d.count, d.dur);
    if (left === d.count) return false;
    if (left > 0) { d.count = left; return false; }
    return true;
  }

  handleEvents() {
    const p = this.player;
    for (const e of p.events.splice(0)) {
      if (e.t === 'step') this.sound.play('step', { mat: BLOCKS[e.id] ? BLOCKS[e.id].sound : 'stone' });
      if (e.t === 'land') this.sound.play('land', { d: e.d });
      if (e.t === 'hurt') { this.sound.play('hurt'); this.ui.hurtFlash(); if (this.settings.haptics && navigator.vibrate) navigator.vibrate(35); }
      if (e.t === 'die') this.die(e.cause);
    }
    if (p.inWater && !this.wasInWater) this.sound.play('splash');
    this.wasInWater = p.inWater;
  }
  entityEvent(e) {
    const dist = e.x !== undefined ? Math.hypot(e.x - this.player.x, e.z - this.player.z) : 0;
    if (dist > 24) return;
    switch (e.t) {
      case 'mobIdle': case 'mobHurt': this.sound.play(e.kind || 'hit'); break;
      case 'mobDie': case 'poof': this.sound.play('poof'); break;
      case 'pickup': this.sound.play('pickup'); break;
      case 'bow': this.sound.play('bow'); break;
      case 'arrowHit': this.sound.play('arrowHit'); break;
    }
  }

  die(cause) {
    const p = this.player;
    if (!this.meta.keepInventory) {
      for (const s of [...this.inv.slots, ...this.inv.armor]) if (s) this.entities.drop(s.id, s.count, p.x, p.y + 1, p.z, { dur: s.dur });
      this.inv.clear();
    }
    const msg = { fall: 'وقعت من مكان عالي', drown: 'غرقت', lava: 'وقعت في الحمم', mob: 'الوحوش غلبتك', arrow: 'اتصبت بسهم', starve: 'مِتّ من الجوع', cactus: 'الصبّار شكّك لحد ما وقعت', void: 'وقعت في الفراغ' }[cause] || '';
    this.ui.showDeath(msg, this.meta.day || 1);
    this.save();
  }
  respawn() {
    const p = this.player;
    const sp = this.meta.spawnPoint || this.meta.spawn;
    Object.assign(p, { dead: false, health: 20, food: 20, saturation: 5, air: 300, vx: 0, vy: 0, vz: 0, fallStart: null, x: sp[0], y: sp[1], z: sp[2] });
    if (this.meta.spawnPoint) { const [x, y, z] = this.meta.spawnPoint.map(Math.floor); if (this.world.getBlock(x, y - 1, z) !== B.BED) { this.meta.spawnPoint = null; this.ui.toast('السرير اتشال، رجعت لنقطة البداية'); const s = this.meta.spawn; p.x = s[0]; p.y = s[1]; p.z = s[2]; } }
  }

  // ---------- furnaces, crops ----------
  tickFurnaces(dt) {
    for (const [k, be] of this.world.blockEntities) {
      if (be.kind !== 'furnace') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (!this.world.isLoaded(x, z)) continue;
      const out = be.input ? smeltOf(be.input.id) : 0;
      const canOut = out && (!be.output || (be.output.id === out && be.output.count < maxStack(out)));
      if (be.burn <= 0 && canOut && be.fuel) {
        const f = fuelOf(be.fuel.id);
        if (f) { be.burn = be.burnMax = f; if (be.fuel.id === I.LAVA_BUCKET) be.fuel = stack(I.BUCKET, 1); else { be.fuel.count--; if (!be.fuel.count) be.fuel = null; } }
      }
      if (be.burn > 0) {
        be.burn -= dt;
        if (canOut) {
          be.progress += dt / SMELT_TIME;
          if (be.progress >= 1) {
            be.progress = 0;
            be.input.count--; if (!be.input.count) be.input = null;
            if (be.output) be.output.count++; else be.output = stack(out, 1);
          }
        } else be.progress = 0;
      } else be.progress = Math.max(0, be.progress - dt / SMELT_TIME);
      const lit = be.burn > 0;
      const id = this.world.getBlock(x, y, z);
      if (lit && id === B.FURNACE) this.world.setBlock(x, y, z, B.FURNACE_LIT, { keepEntity: true });
      if (!lit && id === B.FURNACE_LIT) this.world.setBlock(x, y, z, B.FURNACE, { keepEntity: true });
    }
  }
  randomTicks(dt) {
    this.rtAcc = (this.rtAcc || 0) + dt;
    if (this.rtAcc < 0.05) return;
    this.rtAcc = 0;
    const w = this.world, p = this.player;
    const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const c = w.getChunk(pcx + dx, pcz + dz);
      if (!c || !c.data || !c.light) continue;
      for (let n = 0; n < 24; n++) {
        const i = (Math.random() * 32768) | 0;
        const id = c.data[i];
        if (id !== B.DIRT && id !== B.GRASS && id !== B.SAPLING && !(id >= B.WHEAT0 && id <= B.WHEAT2)) continue;
        const lx = i & 15, lz = (i >> 4) & 15, y = i >> 8;
        const x = c.cx * 16 + lx, z = c.cz * 16 + lz;
        const above = w.getBlock(x, y + 1, z);
        const light = w.light(x, y + 1, z), lv = Math.max(light.sky * this.r.daylight, light.block);
        if (id === B.GRASS && BLOCKS[above].opaque) w.setBlock(x, y, z, B.DIRT);
        else if (id === B.DIRT && !BLOCKS[above].opaque && !isLiquid(above) && lv >= 9) {
          for (let k = 0; k < 4; k++) { const ax = x + ((Math.random() * 3) | 0) - 1, ay = y + ((Math.random() * 3) | 0) - 1, az = z + ((Math.random() * 3) | 0) - 1; if (w.getBlock(ax, ay, az) === B.GRASS) { w.setBlock(x, y, z, B.GRASS); break; } }
        } else if (id >= B.WHEAT0 && id <= B.WHEAT2 && w.light(x, y, z).sky * this.r.daylight + w.light(x, y, z).block >= 9 && Math.random() < 0.4) w.setBlock(x, y, z, id + 1);
        else if (id === B.SAPLING && Math.random() < 0.15 && w.light(x, y, z).sky >= 9) this.growTree(x, y, z);
      }
    }
  }
  growTree(x, y, z) {
    const w = this.world;
    const h = 4 + ((Math.random() * 3) | 0);
    for (let k = 1; k <= h + 1; k++) if (w.getBlock(x, y + k, z) !== 0) return;
    for (let yy = y + h - 2; yy <= y + h + 1; yy++) {
      const r = yy >= y + h ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (yy === y + h + 1 || Math.random() < 0.5)) continue;
        if (w.getBlock(x + dx, yy, z + dz) === 0) w.setBlock(x + dx, yy, z + dz, B.LEAVES, { noUpdate: true });
      }
    }
    for (let k = 0; k < h; k++) w.setBlock(x, y + k, z, B.LOG, { noUpdate: true });
  }

  // ---------- signs: real browser text shaping, so Arabic joins and reads right to left ----------
  updateSign(x, y, z) {
    const k = `${x},${y},${z}`;
    this.removeSignMesh(k);
    const be = this.world.blockEntities.get(k);
    if (be) this.makeSignMesh(k, be);
  }
  makeSignMesh(k, be) {
    const [x, y, z] = k.split(',').map(Number);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#b68e5a'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#a9824f' : '#bb9361'; g.fillRect(0, i * 22, 256, 2); }
    g.strokeStyle = '#7a5a34'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 122);
    g.fillStyle = '#1d140b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    const lines = String(be.text || '').split('\n').slice(0, 4);
    const fs = lines.length > 2 ? 24 : 30;
    g.font = `bold ${fs}px -apple-system, "SF Arabic", "Noto Naskh Arabic", "Noto Sans Arabic", system-ui, sans-serif`;
    lines.forEach((ln, i) => g.fillText(ln, 128, 64 + (i - (lines.length - 1) / 2) * (fs + 4), 236));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace;
    const grp = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.48, 0.06), [
      new THREE.MeshBasicMaterial({ color: 0x9a7448 }), new THREE.MeshBasicMaterial({ color: 0x9a7448 }), new THREE.MeshBasicMaterial({ color: 0xa47c4c }), new THREE.MeshBasicMaterial({ color: 0x8a6640 }),
      new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ color: 0x9a7448 })]);
    board.position.y = 0.72;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), new THREE.MeshBasicMaterial({ color: 0x7a5a34 }));
    post.position.y = 0.25;
    grp.add(board, post);
    grp.position.set(x + 0.5, y, z + 0.5);
    grp.rotation.y = be.yaw || 0;
    grp.userData.mats = [...board.material, post.material];
    this.r.signGroup.add(grp);
    this.signMeshes.set(k, grp);
    const br = Math.max(0.35, this.world.brightness(x + 0.5, y + 0.6, z + 0.5, this.r.daylight));
    for (const m of grp.userData.mats) m.color.multiplyScalar(br);
  }
  removeSignMesh(k) {
    const m = this.signMeshes.get(k); if (!m) return;
    this.r.signGroup.remove(m);
    m.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const mat of m.userData.mats) { if (mat.map) mat.map.dispose(); mat.dispose(); }
    this.signMeshes.delete(k);
  }
  refreshSigns(c) {
    for (const [k, be] of this.world.blockEntities) {
      if (be.kind !== 'sign' || this.signMeshes.has(k)) continue;
      const [x, , z] = k.split(',').map(Number);
      if (x >> 4 === c.cx && z >> 4 === c.cz) this.makeSignMesh(k, be);
    }
  }
  dropSigns(c) { for (const k of [...this.signMeshes.keys()]) { const [x, , z] = k.split(',').map(Number); if (x >> 4 === c.cx && z >> 4 === c.cz) this.removeSignMesh(k); } }

  // ---------- save / quit ----------
  snapshot() {
    this.meta.player = this.player.toJSON();
    this.meta.inventory = this.inv.toJSON();
    this.meta.lastPlayed = Date.now();
    this.meta.format = 1;
  }
  async save(thumb) {
    if (!this.store || !this.running) return;
    this.snapshot();
    if (thumb) this.meta.thumb = thumb;
    try {
      await this.world.save();
      await this.store.putExtra(this.meta.id, 'ents', this.entities.serialize());
      await this.store.putWorld(this.meta);
    } catch (e) { console.warn('save failed', e); this.ui.toast('تعذّر الحفظ: مساحة التخزين ممتلئة؟'); }
  }
  async stop() {
    await this.save();
    this.running = false;
    for (const k of [...this.signMeshes.keys()]) this.removeSignMesh(k);
    this.entities.clear();
    this.world.destroy();
    this.r.setSelection(null);
  }
}
export { EYE };
