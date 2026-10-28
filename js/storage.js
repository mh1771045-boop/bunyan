// IndexedDB saves, run-length chunk codec, and world files for backup / sharing.
export const SAVE_FORMAT = 1;

export function rleEncode(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const v = data[i];
    let n = 1;
    while (n < 255 && i + n < data.length && data[i + n] === v) n++;
    out.push(n, v);
    i += n;
  }
  return new Uint8Array(out);
}
export function rleDecode(raw, size) {
  const out = new Uint8Array(size);
  let o = 0;
  for (let i = 0; i < raw.length && o < size; i += 2) { out.fill(raw[i + 1], o, Math.min(size, o + raw[i])); o += raw[i]; }
  return out;
}

const DB_NAME = 'bunyan';
function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export class Store {
  async open() {
    if (this.db) return this;
    if (!('indexedDB' in self)) throw new Error('no-idb');
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
      if (!db.objectStoreNames.contains('extra')) db.createObjectStore('extra');
    };
    this.db = await req(r);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }
    return this;
  }
  tx(name, mode = 'readonly') { return this.db.transaction(name, mode).objectStore(name); }
  async listWorlds() { const all = await req(this.tx('worlds').getAll()); return all.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)); }
  getWorld(id) { return req(this.tx('worlds').get(id)); }
  putWorld(w) { return req(this.tx('worlds', 'readwrite').put(w)); }
  async deleteWorld(id) {
    await req(this.tx('worlds', 'readwrite').delete(id));
    const range = IDBKeyRange.bound(id + '|', id + '|￿');
    await req(this.tx('chunks', 'readwrite').delete(range));
    await req(this.tx('extra', 'readwrite').delete(range));
  }
  async chunkKeys(id) {
    const keys = await req(this.tx('chunks').getAllKeys(IDBKeyRange.bound(id + '|', id + '|￿')));
    return keys.map(k => k.slice(id.length + 1));
  }
  getChunk(id, k) { return req(this.tx('chunks').get(id + '|' + k)); }
  putChunk(id, k, data) { return req(this.tx('chunks', 'readwrite').put(data, id + '|' + k)); }
  getExtra(id, k) { return req(this.tx('extra').get(id + '|' + k)); }
  putExtra(id, k, v) { return req(this.tx('extra', 'readwrite').put(v, id + '|' + k)); }

  // ---------- world files ----------
  async exportWorld(id) {
    const meta = await this.getWorld(id);
    const keys = await req(this.tx('chunks').getAllKeys(IDBKeyRange.bound(id + '|', id + '|￿')));
    const chunks = {};
    for (const k of keys) chunks[k.slice(id.length + 1)] = b64(await req(this.tx('chunks').get(k)));
    const ekeys = await req(this.tx('extra').getAllKeys(IDBKeyRange.bound(id + '|', id + '|￿')));
    const extra = {};
    for (const k of ekeys) extra[k.slice(id.length + 1)] = await req(this.tx('extra').get(k));
    return { app: 'bunyan', format: SAVE_FORMAT, exported: Date.now(), meta, chunks, extra };
  }
  async importWorld(obj) {
    if (!obj || obj.app !== 'bunyan' || !obj.meta) throw new Error('bad-file');
    const id = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const meta = Object.assign({}, obj.meta, { id, imported: Date.now() });
    const names = (await this.listWorlds()).map(w => w.name);
    if (names.includes(meta.name)) meta.name = meta.name + ' (مستورد)';
    await this.putWorld(meta);
    for (const [k, v] of Object.entries(obj.chunks || {})) await this.putChunk(id, k, unb64(v));
    for (const [k, v] of Object.entries(obj.extra || {})) await this.putExtra(id, k, v);
    return meta;
  }
}

function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

// small settings store with a safe fallback
export const local = {
  get(k, d) { try { const v = localStorage.getItem('bunyan.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bunyan.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
