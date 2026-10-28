// The player: movement physics, swimming, flying, fall damage, air, hunger, health.
import { moveBox, touching, collides } from './physics.js';
import { BLOCKS, B, isWater } from './blocks.js';

export const EYE = 1.62;

export class Player {
  constructor() {
    this.x = 0.5; this.y = 70; this.z = 0.5;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.w = 0.6; this.h = 1.8;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.inWater = false; this.eyeInWater = false; this.inLava = false;
    this.flying = false; this.sneaking = false; this.sprinting = false;
    this.health = 20; this.food = 20; this.saturation = 5; this.exhaustion = 0; this.air = 300;
    this.fallStart = null; this.hurtTime = 0; this.invuln = 0; this.dead = false;
    this.regenTimer = 0; this.starveTimer = 0; this.drownTimer = 0; this.lavaTimer = 0; this.cactusTimer = 0;
    this.stepDist = 0; this.walkDist = 0;
    this.spawn = null;
    this.events = [];
    this.lastJumpTap = 0;
  }
  get eye() { return this.y + (this.sneaking && !this.flying ? EYE - 0.15 : EYE); }

  look() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  update(dt, it, world, game) {
    if (this.dead) return;
    const creative = game.mode === 'creative';
    const s = game.settings;
    this.sneaking = !!it.sneak && !this.flying;
    if (it.sprint && it.moveZ > 0.5 && !this.sneaking && (creative || this.food > 6)) this.sprinting = true;
    if (this.sprinting && (it.moveZ < 0.3 || this.sneaking || (!creative && this.food <= 6))) this.sprinting = false;

    const feet = world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z));
    const body = world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.9), Math.floor(this.z));
    const eyeB = world.getBlock(Math.floor(this.x), Math.floor(this.eye), Math.floor(this.z));
    this.inWater = isWater(feet) || isWater(body);
    this.eyeInWater = isWater(eyeB);
    this.inLava = feet === B.LAVA || body === B.LAVA;

    // wanted horizontal velocity
    let speed = this.flying ? (this.sprinting ? 21 : 10.9) : this.sneaking ? 1.3 : this.sprinting ? 5.6 : 4.317;
    if (this.inWater && !this.flying) speed *= 0.55;
    if (this.inLava) speed *= 0.35;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let mx = it.moveX, mz = it.moveZ;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const wx = (-sy * mz + cy * mx) * speed, wz = (-cy * mz - sy * mx) * speed;
    const accel = this.flying ? 6 : this.onGround ? 14 : this.inWater ? 5 : 2.5;
    const k = Math.min(1, accel * dt);
    this.vx += (wx - this.vx) * k;
    this.vz += (wz - this.vz) * k;

    if (this.flying) {
      const vyWant = (it.jump ? 1 : 0) * 9 - (it.flyDown || it.sneak ? 1 : 0) * 9;
      this.vy += (vyWant - this.vy) * Math.min(1, 8 * dt);
    } else if (this.inWater || this.inLava) {
      this.vy -= 10 * dt;
      if (it.jump) this.vy += 22 * dt;
      this.vy *= Math.pow(0.12, dt);
      this.vy = Math.max(-3.5, Math.min(4, this.vy));
      // climb out of water onto a ledge
      if (it.jump && (this.hitX || this.hitZ)) this.vy = 5.5;
    } else {
      this.vy -= 31 * dt;
      if (this.vy < -60) this.vy = -60;
      if (it.jump && this.onGround) {
        this.vy = 8.9;
        this.exhaustion += this.sprinting ? 0.2 : 0.05;
        if (this.sprinting) { this.vx += -sy * 2; this.vz += -cy * 2; }
      }
    }

    // sneaking keeps you on edges
    const before = { x: this.x, z: this.z };
    const res = moveBox(world, this, dt, (this.onGround && !this.flying) ? 0.6 : 0);
    if (this.sneaking && this.onGround && !this.flying) {
      if (!collides(world, this.x, this.y - 0.6, this.z, this.w, this.h)) {
        if (!collides(world, this.x, this.y - 0.6, before.z, this.w, this.h)) this.x = before.x;
        if (!collides(world, before.x, this.y - 0.6, this.z, this.w, this.h)) this.z = before.z;
        if (!collides(world, this.x, this.y - 0.6, this.z, this.w, this.h)) { this.x = before.x; this.z = before.z; }
      }
    }
    this.hitX = res.hitX; this.hitZ = res.hitZ;
    const wasGround = this.onGround;
    this.onGround = res.ground;
    // auto-jump up one-block steps (touch friendly)
    if (s.autoJump && this.onGround && !this.flying && (res.hitX || res.hitZ) && ml > 0.3 && !this.inWater) {
      const fx = this.x + Math.sign(wx) * 0.6, fz = this.z + Math.sign(wz) * 0.6;
      if (!collides(world, fx, this.y + 1.05, fz, this.w * 0.8, this.h)) { this.vy = 8.9; }
    }
    if (this.flying && this.onGround && !creative) this.flying = false;
    if (this.flying && this.onGround && it.sneak) this.flying = false;

    // falling and fall damage
    if (!this.onGround && !this.flying && !this.inWater && this.vy < 0) { if (this.fallStart === null) this.fallStart = this.y; this.fallStart = Math.max(this.fallStart, this.y); }
    if (this.inWater || this.flying) this.fallStart = null;
    if (this.vy > 0 && !this.onGround) this.fallStart = null;
    if (this.onGround && !wasGround) {
      if (this.fallStart !== null) {
        const d = this.fallStart - this.y;
        if (d > 3.4 && !creative) this.hurt(Math.floor(d - 3), 'fall', game);
        if (d > 1) this.events.push({ t: 'land', d });
      }
      this.fallStart = null;
    }

    // step sounds
    const moved = Math.hypot(this.x - before.x, this.z - before.z);
    this.walkDist += moved;
    if (this.onGround && !this.flying) {
      this.stepDist += moved;
      if (this.stepDist > (this.sprinting ? 2.1 : 1.7)) { this.stepDist = 0; const g = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z)); this.events.push({ t: 'step', id: g }); }
    }
    if (this.sprinting) this.exhaustion += moved * 0.1;
    else if (this.inWater) this.exhaustion += moved * 0.015;

    if (this.y < -30) { this.hurt(1000, 'void', game); }
    if (creative) { this.air = 300; return; }

    // air
    if (this.eyeInWater) {
      this.air -= dt * 20;
      if (this.air <= 0) { this.air = 0; this.drownTimer += dt; if (this.drownTimer >= 1) { this.drownTimer = 0; this.hurt(2, 'drown', game); } }
    } else this.air = Math.min(300, this.air + dt * 100);

    if (this.inLava) { this.lavaTimer += dt; if (this.lavaTimer > 0.5) { this.lavaTimer = 0; this.hurt(4, 'lava', game); } }
    if (touching(world, this.x, this.y, this.z, this.w, this.h, id => id === B.CACTUS, 0.05)) { this.cactusTimer += dt; if (this.cactusTimer > 0.5) { this.cactusTimer = 0; this.hurt(1, 'cactus', game); } }

    // hunger and health
    const peaceful = game.difficulty === 0;
    if (peaceful) {
      this.food = Math.min(20, this.food + dt * 0.5);
      this.regenTimer += dt;
      if (this.regenTimer > 1 && this.health < 20) { this.regenTimer = 0; this.health = Math.min(20, this.health + 1); }
      return;
    }
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
    if (this.food >= 18 && this.health < 20) {
      this.regenTimer += dt;
      if (this.regenTimer > 3) { this.regenTimer = 0; this.health = Math.min(20, this.health + 1); this.exhaustion += 3; }
    } else this.regenTimer = 0;
    if (this.food <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer > 4) { this.starveTimer = 0; const floor = game.difficulty === 3 ? 0 : game.difficulty === 2 ? 1 : 10; if (this.health > floor) this.hurt(1, 'starve', game); }
    }
  }

  hurt(n, cause, game, from) {
    if (this.dead || game.mode === 'creative' && cause !== 'void') return false;
    if (this.invuln > 0 && cause !== 'void') return false;
    if (game.difficulty === 0 && (cause === 'mob' || cause === 'arrow')) return false;
    if ((cause === 'mob' || cause === 'arrow') && game.difficulty === 1) n = Math.max(1, Math.round(n * 0.6));
    if ((cause === 'mob' || cause === 'arrow') && game.difficulty === 3) n = Math.round(n * 1.5);
    // armour soaks part of the hit (4% per point) and wears down
    if (['mob', 'arrow', 'lava', 'cactus'].includes(cause) && game.inv) {
      const def = game.inv.defense();
      if (def > 0) { n = Math.max(1, Math.round(n * (1 - Math.min(20, def) / 25))); game.inv.wearArmor(1); }
    }
    this.health -= n;
    this.invuln = 0.5;
    this.hurtTime = 0.4;
    this.exhaustion += 0.1;
    if (from) { const dx = this.x - from.x, dz = this.z - from.z, l = Math.hypot(dx, dz) || 1; this.vx += dx / l * 6; this.vz += dz / l * 6; if (this.onGround) this.vy = 4.5; }
    this.events.push({ t: 'hurt', cause, n });
    if (this.health <= 0) { this.health = 0; this.dead = true; this.events.push({ t: 'die', cause }); }
    return true;
  }

  eat(food) {
    this.food = Math.min(20, this.food + food);
    this.saturation = Math.min(this.food, this.saturation + food * 0.6);
  }

  tickTimers(dt) { this.invuln = Math.max(0, this.invuln - dt); this.hurtTime = Math.max(0, this.hurtTime - dt); }

  toJSON() {
    return { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, health: this.health, food: this.food, saturation: this.saturation, air: this.air, flying: this.flying, spawn: this.spawn };
  }
  load(o) { if (!o) return; Object.assign(this, { x: o.x, y: o.y, z: o.z, yaw: o.yaw || 0, pitch: o.pitch || 0, health: o.health ?? 20, food: o.food ?? 20, saturation: o.saturation ?? 5, air: o.air ?? 300, flying: !!o.flying, spawn: o.spawn || null }); }
}
