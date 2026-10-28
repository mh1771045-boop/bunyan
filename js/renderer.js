// Three.js scene: chunk shader, sky, sun/moon, stars, clouds, selection, cracks, held item, particles.
import * as THREE from '../vendor/three.module.min.js';
import { buildAtlas, setAtlasCanvas, sunCanvas, cloudCanvas, spriteCanvas, SKINS } from './textures.js';
import { BLOCKS, TILE } from './blocks.js';

const CHUNK_VS = `
attribute vec2 aUv;
attribute vec4 aLight;
uniform float uTime;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vSky;
varying float vBlock;
varying float vShade;
varying float vFog;
varying float vLava;
void main() {
  vec3 p = position / 16.0;
  float fl = floor(aLight.w * 255.0 + 0.5);
  vec4 world = modelMatrix * vec4(p, 1.0);
  if (mod(fl, 2.0) >= 1.0) world.y += (sin(world.x * 1.3 + uTime * 1.6) + cos(world.z * 1.1 + uTime * 1.3)) * 0.03 - 0.06;
  if (mod(floor(fl / 2.0), 2.0) >= 1.0 && mod(floor(fl / 4.0), 2.0) >= 1.0) {
    world.x += sin(uTime * 1.7 + world.z * 0.7 + world.y) * 0.035;
    world.z += cos(uTime * 1.3 + world.x * 0.6) * 0.035;
  }
  vLava = mod(floor(fl / 8.0), 2.0);
  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;
  vUv = aUv / 4096.0;
  vSky = aLight.x * 255.0 / 255.0;
  vBlock = aLight.y * 255.0 / 255.0;
  vShade = aLight.z;
  vFog = smoothstep(uFogNear, uFogFar, length(mv.xyz));
}`;
const CHUNK_FS = `
uniform sampler2D uAtlas;
uniform float uDaylight;
uniform vec3 uSkyTint;
uniform vec3 uFogColor;
uniform float uAlpha;
uniform float uBright;
uniform float uWater;
varying vec2 vUv;
varying float vSky;
varying float vBlock;
varying float vShade;
varying float vFog;
varying float vLava;
float curve(float l) { float c = l / (3.0 - 2.0 * l); return mix(c, sqrt(l), uBright); }
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  if (uAlpha >= 1.0 && tex.a < 0.5) discard;
  float s = curve(vSky * uDaylight);
  float b = curve(vBlock);
  vec3 light = max(vec3(s) * uSkyTint, vec3(b) * vec3(1.0, 0.86, 0.68));
  light = max(light, vec3(0.03));
  if (vLava > 0.5) light = vec3(1.0);
  vec3 col = tex.rgb * light * vShade;
  float a = uAlpha >= 1.0 ? 1.0 : tex.a;
  if (uWater > 0.5) a = max(a, 0.62);
  col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col, a);
}`;

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FS = `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uGlow; varying vec3 vDir;
void main(){ float h = clamp(vDir.y, -1.0, 1.0); vec3 c = mix(uHorizon, uTop, smoothstep(-0.02, 0.45, h));
 float g = pow(max(dot(normalize(vDir), uSunDir), 0.0), 8.0); c += uGlow * g * (1.0 - smoothstep(0.0, 0.6, h));
 gl_FragColor = vec4(c, 1.0); }`;
const CLOUD_VS = `varying vec2 vUv; varying float vD; uniform vec2 uOff; void main(){ vUv = uv + uOff; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`;
const CLOUD_FS = `uniform sampler2D uMap; uniform vec3 uColor; varying vec2 vUv; varying float vD; void main(){ vec4 t = texture2D(uMap, vUv); float a = t.a * (1.0 - smoothstep(180.0, 360.0, vD)) * 0.82; if (a < 0.02) discard; gl_FragColor = vec4(uColor, a); }`;
const PART_VS = `attribute vec2 aUv; attribute float aBright; varying vec2 vUv; varying float vB; void main(){ vUv = aUv; vB = aBright; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const PART_FS = `uniform sampler2D uAtlas; varying vec2 vUv; varying float vB; void main(){ vec4 t = texture2D(uAtlas, vUv); if (t.a < 0.5) discard; gl_FragColor = vec4(t.rgb * vB, 1.0); }`;

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Renderer {
  constructor(canvas) {
    THREE.ColorManagement.enabled = false;
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, alpha: false });
    this.r.autoClear = false;
    this.r.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.08, 1000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.scale = 1;
    this.time = 0;
    this.atlasStyle = 'pixel';
    this.atlasCanvas = buildAtlas('pixel');
    setAtlasCanvas(this.atlasCanvas);
    this.atlas = new THREE.CanvasTexture(this.atlasCanvas);
    this.atlas.magFilter = THREE.NearestFilter; this.atlas.minFilter = THREE.NearestFilter;
    this.atlas.generateMipmaps = false; this.atlas.flipY = false; this.atlas.colorSpace = THREE.NoColorSpace;
    const U = () => ({
      uAtlas: { value: this.atlas }, uTime: { value: 0 }, uDaylight: { value: 1 }, uSkyTint: { value: new THREE.Vector3(1, 1, 1) },
      uFogColor: { value: new THREE.Vector3(0.7, 0.8, 1) }, uFogNear: { value: 60 }, uFogFar: { value: 90 }, uAlpha: { value: 1 }, uBright: { value: 0.2 }, uWater: { value: 0 },
    });
    this.solidMat = new THREE.ShaderMaterial({ vertexShader: CHUNK_VS, fragmentShader: CHUNK_FS, uniforms: U() });
    this.waterMat = new THREE.ShaderMaterial({ vertexShader: CHUNK_VS, fragmentShader: CHUNK_FS, uniforms: U(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.waterMat.uniforms.uAlpha.value = 0.99; this.waterMat.uniforms.uWater.value = 1;
    this.mats = [this.solidMat, this.waterMat];

    // sky dome
    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: { uTop: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: new THREE.Vector3() } } });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), this.skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.skyScene = new THREE.Scene();
    this.skyScene.add(this.sky);
    const mkSprite = (moon) => {
      const tex = new THREE.CanvasTexture(sunCanvas(moon)); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(moon ? 34 : 46, moon ? 34 : 46), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
      m.renderOrder = -9; m.frustumCulled = false; this.skyScene.add(m); return m;
    };
    this.sun = mkSprite(false); this.moon = mkSprite(true);
    // stars
    const sg = new THREE.BufferGeometry(); const sp = [];
    for (let i = 0; i < 700; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); sp.push(r * Math.cos(a) * 420, Math.abs(u) * 420, r * Math.sin(a) * 420); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.renderOrder = -9.5; this.stars.frustumCulled = false; this.skyScene.add(this.stars);
    // clouds
    const ct = new THREE.CanvasTexture(cloudCanvas(7)); ct.magFilter = THREE.NearestFilter; ct.minFilter = THREE.NearestFilter; ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
    this.cloudMat = new THREE.ShaderMaterial({ vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uMap: { value: ct }, uColor: { value: new THREE.Vector3(1, 1, 1) }, uOff: { value: new THREE.Vector2() } } });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(768, 768), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2; this.clouds.position.y = 112; this.clouds.frustumCulled = false; this.clouds.renderOrder = 5;
    this.scene.add(this.clouds);
    this.cloudsOn = true;

    // selection outline + cracks
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.select = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 }));
    this.select.visible = false; this.scene.add(this.select);
    this.crackTex = [];
    for (let s = 0; s < 10; s++) {
      const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
      const t = TILE['crack' + s]; cv.getContext('2d').drawImage(this.atlasCanvas, (t & 15) * 16, (t >> 4) * 16, 16, 16, 0, 0, 16, 16);
      const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; this.crackTex.push(tex);
    }
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.MeshBasicMaterial({ map: this.crackTex[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.crack.visible = false; this.scene.add(this.crack);

    // held item scene
    this.handScene = new THREE.Scene();
    this.handCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.hand = new THREE.Group(); this.handScene.add(this.hand);
    this.handMesh = null; this.handId = -1; this.swing = 0; this.bob = 0; this.handBright = 1;

    // particles
    this.maxP = 400;
    this.parts = [];
    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(this.maxP * 4 * 3); this.pUv = new Float32Array(this.maxP * 4 * 2); this.pBr = new Float32Array(this.maxP * 4);
    const idx = new Uint16Array(this.maxP * 6);
    for (let i = 0; i < this.maxP; i++) { idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aUv', new THREE.BufferAttribute(this.pUv, 2).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aBright', new THREE.BufferAttribute(this.pBr, 1).setUsage(THREE.DynamicDrawUsage));
    pg.setIndex(new THREE.BufferAttribute(idx, 1));
    this.pGeo = pg;
    this.pMesh = new THREE.Mesh(pg, new THREE.ShaderMaterial({ vertexShader: PART_VS, fragmentShader: PART_FS, uniforms: { uAtlas: { value: this.atlas } }, side: THREE.DoubleSide }));
    this.pMesh.frustumCulled = false; this.scene.add(this.pMesh);

    this.entityGroup = new THREE.Group(); this.scene.add(this.entityGroup);
    this.signGroup = new THREE.Group(); this.scene.add(this.signGroup);
    this.chunkGroup = new THREE.Group(); this.scene.add(this.chunkGroup);
    this.daylight = 1;
    this.underwater = 0;
    this.resize();
  }

  setAtlasStyle(style) {
    if (style === this.atlasStyle) return;
    this.atlasStyle = style;
    const cv = buildAtlas(style);
    this.atlasCanvas.getContext('2d').clearRect(0, 0, 256, 256);
    this.atlasCanvas.getContext('2d').drawImage(cv, 0, 0);
    setAtlasCanvas(this.atlasCanvas);
    this.atlas.needsUpdate = true;
    this.handId = -1;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3) * this.scale);
    this.r.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.handCam.aspect = w / h; this.handCam.updateProjectionMatrix();
  }
  setScale(s) { this.scale = s; this.resize(); }

  setView(renderDistance) {
    const far = renderDistance * 16;
    for (const m of this.mats) { m.uniforms.uFogNear.value = Math.max(20, far * 0.6); m.uniforms.uFogFar.value = far * 0.98; }
    this.camera.far = Math.max(600, far + 50); this.camera.updateProjectionMatrix();
  }
  setBrightness(v) { for (const m of this.mats) m.uniforms.uBright.value = v; }

  makeChunkMesh(d, cx, cz, water) {
    if (!d.verts) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('aUv', new THREE.BufferAttribute(d.uv, 2));
    g.setAttribute('aLight', new THREE.BufferAttribute(d.lt, 4, true));
    g.setIndex(new THREE.BufferAttribute(d.idx, 1));
    let y0 = 1e9, y1 = -1e9;
    for (let i = 1; i < d.pos.length; i += 3) { const y = d.pos[i]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    y0 /= 16; y1 /= 16;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, (y0 + y1) / 2, 8), Math.sqrt(128 + ((y1 - y0) / 2) ** 2) + 1);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, y0, 0), new THREE.Vector3(16, y1, 16));
    const m = new THREE.Mesh(g, water ? this.waterMat : this.solidMat);
    m.position.set(cx * 16, 0, cz * 16);
    m.matrixAutoUpdate = false; m.updateMatrix();
    if (water) m.renderOrder = 2;
    this.chunkGroup.add(m);
    return m;
  }
  disposeMesh(m) { if (!m) return; this.chunkGroup.remove(m); m.geometry.dispose(); }

  // time: 0..24000, 0 = sunrise
  setTime(t, weather = 0) {
    const ang = (t / 24000) * Math.PI * 2;
    const elev = Math.sin(ang);
    const day = sm(-0.18, 0.28, elev);
    this.daylight = 0.16 + 0.84 * day;
    const sunset = Math.max(0, 1 - Math.abs(elev) / 0.32) * (Math.cos(ang) > -2 ? 1 : 0);
    const topDay = [0.36, 0.58, 0.98], topNight = [0.012, 0.016, 0.05];
    const horDay = [0.70, 0.83, 1.0], horNight = [0.03, 0.04, 0.09], horSet = [0.98, 0.58, 0.34];
    let top = lerp3(topNight, topDay, day), hor = lerp3(horNight, horDay, day);
    hor = lerp3(hor, horSet, sunset * 0.65);
    if (this.underwater) { top = [0.05, 0.16, 0.42]; hor = [0.06, 0.2, 0.46]; }
    this.skyMat.uniforms.uTop.value.set(...top);
    this.skyMat.uniforms.uHorizon.value.set(...hor);
    const sd = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.18).normalize();
    this.skyMat.uniforms.uSunDir.value.copy(sd);
    this.skyMat.uniforms.uGlow.value.set(0.9 * sunset, 0.45 * sunset, 0.2 * sunset);
    const tint = lerp3([0.55, 0.62, 0.95], [1, 1, 1], day);
    const tint2 = lerp3(tint, [1.0, 0.86, 0.74], sunset * 0.5);
    for (const m of this.mats) {
      m.uniforms.uDaylight.value = this.daylight;
      m.uniforms.uSkyTint.value.set(...tint2);
      m.uniforms.uFogColor.value.set(...hor);
      if (this.underwater) { m.uniforms.uFogNear.value = 2; m.uniforms.uFogFar.value = 26; }
    }
    this.sunDir = sd;
    this.starMat.opacity = Math.max(0, 1 - day * 1.6) * 0.9;
    const cc = 0.25 + 0.75 * day;
    this.cloudMat.uniforms.uColor.value.set(cc * (1 - sunset * 0.05), cc * (1 - sunset * 0.25), cc * (1 - sunset * 0.35));
    this.fogColor = hor;
  }

  updateSky(dt) {
    const c = this.camera.position;
    this.sky.position.copy(c);
    const sd = this.sunDir || new THREE.Vector3(0, 1, 0);
    this.sun.position.set(c.x + sd.x * 400, c.y + sd.y * 400, c.z + sd.z * 400); this.sun.lookAt(c);
    this.moon.position.set(c.x - sd.x * 400, c.y - sd.y * 400, c.z - sd.z * 400); this.moon.lookAt(c);
    this.stars.position.copy(c);
    this.stars.rotation.z = Math.atan2(sd.y, sd.x) - Math.PI / 2;
    this.clouds.visible = this.cloudsOn;
    if (this.cloudsOn) {
      this.cloudX = (this.cloudX || 0) + dt * 1.2;
      const snapX = Math.floor(c.x / 12) * 12, snapZ = Math.floor(c.z / 12) * 12;
      this.clouds.position.x = snapX; this.clouds.position.z = snapZ;
      this.cloudMat.uniforms.uOff.value.set((snapX + this.cloudX) / 768, -snapZ / 768);
    }
  }

  setSelection(hit, crackStage) {
    if (!hit) { this.select.visible = false; this.crack.visible = false; return; }
    this.select.visible = true;
    this.select.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    if (crackStage >= 0) {
      this.crack.visible = true; this.crack.position.copy(this.select.position);
      this.crack.material.map = this.crackTex[Math.min(9, crackStage)]; this.crack.material.needsUpdate = true;
    } else this.crack.visible = false;
  }

  // held item: a small cube or a flat sprite in the bottom corner
  setHeld(id) {
    if (id === this.handId) return;
    this.handId = id;
    if (this.handMesh) { this.hand.remove(this.handMesh); this.handMesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); this.handMesh = null; }
    let mesh;
    if (!id) {
      const g = new THREE.BoxGeometry(0.13, 0.42, 0.13);
      const tex = new THREE.CanvasTexture(SKINS.player.arm()); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.NoColorSpace;
      mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex }));
      mesh.position.set(0.34, -0.42, -0.48); mesh.rotation.set(-1.0, 0.15, 0.3);
    } else if (id < 256 && BLOCKS[id].shape !== 'cross' && BLOCKS[id].shape !== 'torch' && BLOCKS[id].shape !== 'crop' && BLOCKS[id].shape !== 'sign') {
      mesh = this.blockModel(id, 0.26);
      mesh.position.set(0.42, -0.36, -0.7); mesh.rotation.set(0.15, -0.75, 0.05);
    } else {
      mesh = this.spriteModel(id, 0.38);
      mesh.position.set(0.4, -0.3, -0.62); mesh.rotation.set(0, -1.15, 0.45);
    }
    this.handMesh = mesh; this.hand.add(mesh);
  }
  blockModel(id, size) {
    const b = BLOCKS[id];
    const g = new THREE.BoxGeometry(size, size * (b.shape === 'bed' ? 0.56 : 1), size);
    const uv = g.attributes.uv;
    const faces = [b.tex.side, b.tex.side, b.tex.top, b.tex.bottom, b.tex.front !== undefined ? b.tex.front : b.tex.side, b.tex.side];
    const shade = [0.8, 0.8, 1, 0.55, 0.68, 0.68];
    const col = new Float32Array(uv.count * 3);
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k, t = faces[f];
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, ((t & 15) * 16 + 0.01 + u * 15.98) / 256, ((t >> 4) * 16 + 0.01 + (1 - v) * 15.98) / 256);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade[f];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.5, transparent: false }));
    return m;
  }
  spriteModel(id, size) {
    const cv = spriteCanvas(id);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.NoColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    return m;
  }
  swingHand() { this.swing = 1; }

  // break particles
  burst(x, y, z, blockId, n = 14, bright = 1) {
    const b = BLOCKS[blockId]; if (!b || !b.tex) return;
    const tile = b.tex.side;
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.maxP) this.parts.shift();
      const u = (tile & 15) * 16 + ((Math.random() * 12) | 0), v = (tile >> 4) * 16 + ((Math.random() * 12) | 0);
      this.parts.push({ x: x + 0.2 + Math.random() * 0.6, y: y + 0.2 + Math.random() * 0.6, z: z + 0.2 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 1, vz: (Math.random() - 0.5) * 3, life: 0.6 + Math.random() * 0.5, u, v, s: 0.08 + Math.random() * 0.07, b: bright });
    }
  }
  updateParticles(dt, solidAt) {
    const cam = this.camera;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    let k = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy -= 18 * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (solidAt(nx, ny, nz)) { p.vx *= 0.3; p.vz *= 0.3; p.vy = 0; } else { p.x = nx; p.y = ny; p.z = nz; }
    }
    for (const p of this.parts) {
      if (k >= this.maxP) break;
      const s = p.s;
      const o = k * 12;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let c = 0; c < 4; c++) {
        const [a, bb] = corners[c];
        this.pPos[o + c * 3] = p.x + (right.x * a + up.x * bb) * s;
        this.pPos[o + c * 3 + 1] = p.y + (right.y * a + up.y * bb) * s;
        this.pPos[o + c * 3 + 2] = p.z + (right.z * a + up.z * bb) * s;
        this.pUv[k * 8 + c * 2] = (p.u + (a > 0 ? 3.9 : 0.1)) / 256;
        this.pUv[k * 8 + c * 2 + 1] = (p.v + (bb > 0 ? 0.1 : 3.9)) / 256;
        this.pBr[k * 4 + c] = p.b;
      }
      k++;
    }
    this.pGeo.setDrawRange(0, k * 6);
    this.pGeo.attributes.position.needsUpdate = true; this.pGeo.attributes.aUv.needsUpdate = true; this.pGeo.attributes.aBright.needsUpdate = true;
  }

  render(dt, moving) {
    this.time += dt;
    for (const m of this.mats) m.uniforms.uTime.value = this.time;
    this.updateSky(dt);
    this.r.clear();
    this.r.render(this.skyScene, this.camera);
    this.r.render(this.scene, this.camera);
    if (this.handVisible !== false && this.hand.children.length) {
      this.swing = Math.max(0, this.swing - dt * 4);
      if (moving) this.bob += dt * 9;
      const s = Math.sin((1 - this.swing) * Math.PI);
      this.hand.position.set(Math.sin(this.bob) * 0.012 - s * 0.08, Math.abs(Math.cos(this.bob)) * 0.014 - s * 0.1, -s * 0.05);
      this.hand.rotation.set(-s * 0.9, s * 0.3, 0);
      const br = this.handBright;
      this.handMesh.traverse(o => { if (o.material && o.material.color) o.material.color.setScalar(br); });
      this.r.clearDepth();
      this.r.render(this.handScene, this.handCam);
    }
  }
}
export { THREE };
