// AABB-vs-voxel collision and voxel raycasting, shared by the player and mobs.
import { BLOCKS, B, isLiquid } from './blocks.js';

// box heights for partial solid blocks
const TOP = new Float32Array(256).fill(1);
TOP[B.BED] = 9 / 16;

export function solidBox(world, x, y, z) {
  const id = world.getBlockSafe(x, y, z);
  if (id < 0) return 1; // unloaded: solid, so nothing falls out of the world
  const b = BLOCKS[id];
  return b.solid ? TOP[id] : 0;
}

// move an entity {x,y,z,vx,vy,vz,w,h} by v*dt with collision; returns flags
export function moveBox(world, e, dt, stepUp = 0) {
  const res = { ground: false, hitX: false, hitZ: false, hitY: false };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(e.vx), Math.abs(e.vy), Math.abs(e.vz)) * dt / 0.4));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    // Y
    let dy = e.vy * sdt;
    if (dy !== 0) {
      const ny = e.y + dy;
      if (collides(world, e.x, ny, e.z, e.w, e.h)) {
        if (dy < 0) { e.y = snapDown(world, e, ny); res.ground = true; }
        else { e.y = Math.floor(ny + e.h) - e.h - 0.0001; }
        e.vy = 0; res.hitY = true;
      } else e.y = ny;
    }
    // X
    let dx = e.vx * sdt;
    if (dx !== 0) {
      const nx = e.x + dx;
      if (collides(world, nx, e.y, e.z, e.w, e.h)) {
        if (stepUp > 0 && (e.onGround || res.ground) && !collides(world, nx, e.y + stepUp, e.z, e.w, e.h) && !collides(world, e.x, e.y + stepUp, e.z, e.w, e.h)) { e.y += stepUp; e.x = nx; }
        else { res.hitX = true; e.vx = 0; }
      } else e.x = nx;
    }
    // Z
    let dz = e.vz * sdt;
    if (dz !== 0) {
      const nz = e.z + dz;
      if (collides(world, e.x, e.y, nz, e.w, e.h)) {
        if (stepUp > 0 && (e.onGround || res.ground) && !collides(world, e.x, e.y + stepUp, nz, e.w, e.h) && !collides(world, e.x, e.y + stepUp, e.z, e.w, e.h)) { e.y += stepUp; e.z = nz; }
        else { res.hitZ = true; e.vz = 0; }
      } else e.z = nz;
    }
  }
  if (!res.ground && e.vy <= 0 && collides(world, e.x, e.y - 0.02, e.z, e.w, e.h)) res.ground = true;
  return res;
}

function snapDown(world, e, ny) {
  // find the top of whatever we hit under the feet
  const hw = e.w / 2;
  let top = -Infinity;
  for (let x = Math.floor(e.x - hw); x <= Math.floor(e.x + hw - 1e-6); x++)
    for (let z = Math.floor(e.z - hw); z <= Math.floor(e.z + hw - 1e-6); z++)
      for (let y = Math.floor(ny); y <= Math.floor(e.y); y++) {
        const t = solidBox(world, x, y, z);
        if (t > 0 && y + t > ny - 1e-6 && y + t <= e.y + 1e-3) top = Math.max(top, y + t);
      }
  return top === -Infinity ? e.y : top + 0.0001;
}

export function collides(world, x, y, z, w, h) {
  const hw = w / 2;
  const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - 1e-6);
  const y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-6);
  const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw - 1e-6);
  for (let by = y0 - 1; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
    const t = solidBox(world, bx, by, bz);
    if (t > 0 && by + t > y + 1e-6 && by < y + h) return true;
  }
  return false;
}

// is any part of the box inside a block matching fn
export function touching(world, x, y, z, w, h, fn, grow = 0) {
  const hw = w / 2 + grow;
  for (let by = Math.floor(y - grow); by <= Math.floor(y + h - 1e-6 + grow); by++)
    for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw - 1e-6); bz++)
      for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw - 1e-6); bx++) {
        const id = world.getBlock(bx, by, bz);
        if (fn(id)) return id;
      }
  return 0;
}

// DDA through voxels. Returns the first block hit that `pick(id)` accepts.
export function raycast(world, ox, oy, oz, dx, dy, dz, maxD, pick) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tx = dx !== 0 ? ((sx > 0 ? x + 1 - ox : ox - x) * tdx) : Infinity;
  let ty = dy !== 0 ? ((sy > 0 ? y + 1 - oy : oy - y) * tdy) : Infinity;
  let tz = dz !== 0 ? ((sz > 0 ? z + 1 - oz : oz - z) * tdz) : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 256; i++) {
    const id = world.getBlock(x, y, z);
    if (id && pick(id)) {
      const b = BLOCKS[id];
      if (b.shape === 'cross' || b.shape === 'torch' || b.shape === 'crop' || b.shape === 'bed' || b.shape === 'sign') {
        // thin shapes: still pick the whole cell, it is friendlier on a touch screen
      }
      return { x, y, z, id, nx, ny, nz, dist: t };
    }
    if (tx < ty && tx < tz) { t = tx; if (t > maxD) break; x += sx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { t = ty; if (t > maxD) break; y += sy; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { t = tz; if (t > maxD) break; z += sz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

export const targetable = id => id !== 0 && !isLiquid(id);
export const targetableFluid = id => id !== 0;
