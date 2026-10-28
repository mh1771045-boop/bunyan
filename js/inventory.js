// Inventory slots, stacking and crafting checks.
import { maxStack, toolOf, RECIPES, matches, ITEMS, armorOf } from './blocks.js';

export const SLOTS = 36; // 0-8 hotbar, 9-35 backpack

export function stack(id, count = 1, dur) {
  const t = toolOf(id) || armorOf(id);
  return { id, count, dur: dur !== undefined ? dur : t ? t.durability : undefined };
}

export class Inventory {
  constructor(size = SLOTS) { this.slots = new Array(size).fill(null); this.armor = [null, null, null, null]; this.selected = 0; this.listeners = []; }
  defense() { let d = 0; for (const a of this.armor) if (a) d += armorOf(a.id).def; return d; }
  // wear the armour piece in slot i; whatever was worn goes back into that slot
  equip(i) {
    const s = this.slots[i], a = s && armorOf(s.id);
    if (!a) return false;
    this.slots[i] = this.armor[a.slot];
    this.armor[a.slot] = s;
    this.changed();
    return true;
  }
  unequip(slot) {
    const a = this.armor[slot]; if (!a) return;
    if (this.add(a.id, 1, a.dur) === 0) { this.armor[slot] = null; this.changed(); }
  }
  wearArmor(n) {
    for (let k = 0; k < 4; k++) { const a = this.armor[k]; if (!a) continue; a.dur -= n; if (a.dur <= 0) this.armor[k] = null; }
    this.changed();
  }
  onChange(f) { this.listeners.push(f); }
  changed() { for (const f of this.listeners) f(); }
  get held() { return this.slots[this.selected]; }
  heldId() { const s = this.slots[this.selected]; return s ? s.id : 0; }

  // returns how many could not fit
  add(id, count = 1, dur) {
    const max = maxStack(id);
    let left = count;
    if (max > 1) {
      for (let i = 0; i < this.slots.length && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.count < max) { const n = Math.min(max - s.count, left); s.count += n; left -= n; }
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) { const n = Math.min(max, left); this.slots[i] = stack(id, n, dur); left -= n; }
    }
    if (left !== count) this.changed();
    return left;
  }
  count(key) {
    let n = 0;
    for (const s of this.slots) if (s && matches(key, s.id)) n += s.count;
    return n;
  }
  take(key, n) {
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && matches(key, s.id)) { const k = Math.min(s.count, n); s.count -= k; n -= k; if (!s.count) this.slots[i] = null; }
    }
    this.changed();
    return n === 0;
  }
  consumeHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    this.changed();
  }
  damageHeld(amount = 1) {
    const s = this.slots[this.selected];
    if (!s || s.dur === undefined) return false;
    s.dur -= amount;
    if (s.dur <= 0) { this.slots[this.selected] = null; this.changed(); return true; }
    this.changed();
    return false;
  }
  isFull(id) { return this.slots.every(s => s && (s.id !== id || s.count >= maxStack(id))); }
  clear() { this.slots.fill(null); this.armor = [null, null, null, null]; this.changed(); }
  toJSON() { return { slots: this.slots, selected: this.selected, armor: this.armor }; }
  load(o) { if (!o) return; this.slots = (o.slots || []).slice(0, SLOTS).concat(new Array(SLOTS).fill(null)).slice(0, SLOTS); this.armor = (o.armor || []).concat([null, null, null, null]).slice(0, 4); this.selected = o.selected || 0; this.changed(); }
}

export function canCraft(recipe, inv, times = 1) {
  return recipe.need.every(n => inv.count(n.key) >= n.n * times);
}
export function maxCrafts(recipe, inv) {
  let m = Infinity;
  for (const n of recipe.need) m = Math.min(m, Math.floor(inv.count(n.key) / n.n));
  return m === Infinity ? 0 : m;
}
export function craft(recipe, inv, times = 1) {
  if (!canCraft(recipe, inv, times)) return false;
  for (const n of recipe.need) inv.take(n.key, n.n * times);
  const left = inv.add(recipe.out, recipe.count * times);
  return { left };
}
export function recipesFor(big) { return RECIPES.filter(r => big || !r.big); }
export const isFood = id => !!(ITEMS[id] && ITEMS[id].food);
