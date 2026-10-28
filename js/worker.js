// Worker: terrain generation and meshing off the main thread.
import { Generator } from './worldgen.js';
import { meshChunk } from './mesher.js';

let gen = null;

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      gen = new Generator(m.seed, m.worldType);
      self.postMessage({ type: 'ready', id: m.id, spawn: gen.findSpawn() });
    } else if (m.type === 'gen') {
      const data = gen.generate(m.cx, m.cz);
      self.postMessage({ type: 'gen', id: m.id, cx: m.cx, cz: m.cz, data }, [data.buffer]);
    } else if (m.type === 'mesh') {
      const t0 = performance.now();
      const r = meshChunk(m.vol, { smooth: m.smooth, fancy: m.fancy, orient: m.orient });
      const tr = [r.light.buffer, r.solid.pos.buffer, r.solid.uv.buffer, r.solid.lt.buffer, r.solid.idx.buffer, r.water.pos.buffer, r.water.uv.buffer, r.water.lt.buffer, r.water.idx.buffer];
      self.postMessage({ type: 'mesh', id: m.id, cx: m.cx, cz: m.cz, rev: m.rev, solid: r.solid, water: r.water, light: r.light, ms: performance.now() - t0 }, tr);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.stack || err) });
  }
};
