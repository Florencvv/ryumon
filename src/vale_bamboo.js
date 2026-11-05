// vale_bamboo.js - BAMBOO: a clear shallow stream (2 m wide) winding through dense cel + ink bamboo, late morning.
// Water surface y = 0 (dept WATER). The stream flows toward +z (downstream, to the pond); Hi swims upstream toward -z.
// From straight above (s09, s37) the canopy keeps a ragged gap over the stream so the water winds through the green.
import { THREE, A, V3, TAU, lerp, clamp, sstep, mulb, fbm, vnoise, bake, M4, rockGeo, rockColor, bambooLeafAtlas, fernAtlas,
  groundMaterial, heightMesh, canvasTex, rockGeo2, rockColor2, rockMaterial, addShafts } from './vale_lib.js';

// stream centre line x(z), half width w(z)
export const sx = (z) => 3.2 * Math.sin(z * 0.045 + 0.4) + 1.4 * Math.sin(z * 0.12 + 1.3) + 0.5 * Math.sin(z * 0.31);
export const sw = (z) => 1.0 + 0.18 * Math.sin(z * 0.21 + 0.5) + 0.1 * Math.sin(z * 0.5);
const Z0 = 30, Z1 = -110;   // downstream end .. upstream end
export const BAMBOO = {
  sun: V3(0.3, 0.75, -0.5).normalize(),   // = look.js BAMBOO sky disk
  streamPts: (() => { const p = []; for (let z = Z0; z >= Z1; z -= 4) p.push(V3(sx(z), 0, z)); return p; })(),
  streamWidth: 2.0,
};
function bedH(x, z) {
  const d = Math.abs(x - sx(z)), w = sw(z);
  const floor = 0.55 + (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 1.6 + 0.6 * sstep(14, 30, d);
  if (d < w) return -0.32 + 0.12 * sstep(0, w, d) ** 2 + (fbm(x * 0.6, z * 0.6, 2) - 0.5) * 0.08;
  return lerp(-0.2, floor, sstep(w, w + 1.6, d)) + (vnoise(x * 1.3, z * 1.3) - 0.5) * 0.08;
}

export function buildBamboo(ctx, G) {
  const rng = mulb(3302), api = {};
  const sun = BAMBOO.sun;

  // ---------------------------------------------------------------- ground + stream bed
  const cFloor = new THREE.Color('#9a9058'), cFloor2 = new THREE.Color('#7c8a4a'), cMoss = new THREE.Color('#6f9a46'), cBed = new THREE.Color('#b0a486'), cBed2 = new THREE.Color('#8fa080'), c = new THREE.Color();
  const col = (x, z, y, n) => {
    const d = Math.abs(x - sx(z)), w = sw(z);
    if (d < w + 0.1) return c.copy(cBed).lerp(cBed2, fbm(x * 0.8, z * 0.8, 3) * 0.8).lerp(new THREE.Color('#d0c6a8'), sstep(0.6, 0.8, vnoise(x * 5, z * 5)) * 0.5);
    c.copy(cFloor).lerp(cFloor2, sstep(0.3, 0.7, fbm(x * 0.2, z * 0.2, 3)));
    c.lerp(cMoss, sstep(w + 1.8, w + 0.2, d) * 0.75);
    return c;
  };
  const warp = (x, z) => [x + sx(z), z];   // grid follows the stream so the channel is evenly resolved
  const gG = heightMesh(-34, 34, Z1 - 20, Z0 + 10, 200, 360, bedH, col, warp);
  const gM = groundMaterial({ dapple: 0.75, dapScale: 0.32, dapCol: '#fff0b0', leaves: 0.05, leafA: '#c8b25a', leafB: '#e0c873', dab: 0.6, shade: '#4c6070' });
  gM.uniforms.uSunDir = { value: sun.clone() };
  G.add(new THREE.Mesh(gG, gM));

  // ---------------------------------------------------------------- culms: instanced cel + ink cylinders with drawn nodes
  const culmTex = canvasTex(64, 512, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { const g = x.createLinearGradient(0, i * h / 6, 0, (i + 1) * h / 6); g.addColorStop(0, '#f0f4e8'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#dfe6d6'); x.fillStyle = g; x.fillRect(0, i * h / 6, w, h / 6); }
    for (let k = 0; k < 14; k++) { x.fillStyle = `rgba(150,170,120,${0.15 + 0.2 * (k % 3) / 3})`; x.fillRect((k * 37) % w, 0, 2 + (k % 3), h); }
    for (let i = 0; i < 6; i++) {   // node: dark ink ring with a light ridge above it
      const y = i * h / 6; x.fillStyle = '#4a5240'; x.fillRect(0, y, w, 5); x.fillStyle = '#f8ffe8'; x.fillRect(0, y + 5, w, 4); x.fillStyle = '#b8c49a'; x.fillRect(0, y + 9, w, 6);
    }
  });
  const culmM = A.celMaterial({ base: '#ffffff', shade: '#8a96b8', map: culmTex, id: A.ID.PROP + 2, highlight: 0.55, hiSize: 0.93, rimColor: '#f8ffd0', rimWidth: 0.25, wobble: 0.6 });
  // geometry variants: unit radius, height H, slight bow, uv v counts nodes (one texture tile = 6 internodes of 0.42 m)
  const variants = [13, 16, 19].map((H, k) => {
    const g = new THREE.CylinderGeometry(1, 1, H, 9, 24, true); g.translate(0, H / 2, 0);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = y / H; p.setX(i, p.getX(i) * (1 - t * 0.35) + Math.sin(t * Math.PI * 0.5) * (0.3 + k * 0.25) * t); p.setZ(i, p.getZ(i) * (1 - t * 0.35)); uv.setY(i, y / (0.42 * 6)); }
    g.computeVertexNormals(); return { g, H };
  });
  const culms = [[], [], []];
  const cc = new THREE.Color();
  for (let i = 0; i < 3400; i++) {
    const z = lerp(Z1 - 15, Z0 + 8, rng()), side = rng() < 0.5 ? -1 : 1;
    const d = sw(z) + 0.55 + Math.pow(rng(), 1.35) * 17;
    const x = sx(z) + side * d;
    const v = Math.floor(rng() * 3), r = 0.045 + rng() * 0.05 + (rng() < 0.08 ? 0.03 : 0);
    const lean = (rng() - 0.5) * 0.12 + side * -0.05 * sstep(4, 1, d);   // culms by the water lean over it
    const tone = rng();
    cc.set(tone < 0.5 ? '#8fbf5a' : tone < 0.8 ? '#6faa52' : tone < 0.93 ? '#b8c860' : '#5c9a5e').multiplyScalar(0.92 + rng() * 0.16);
    culms[v].push({ pos: V3(x, bedH(x, z) - 0.2, z), r, rot: [lean * (rng() < 0.5 ? 1 : 0.3), rng() * TAU, side * 0.04 + (rng() - 0.5) * 0.05], col: cc.clone() });
  }
  api.culmMeshes = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V3();
  culms.forEach((list, k) => {
    const im = new THREE.InstancedMesh(variants[k].g, culmM, list.length);
    list.forEach((cu, i) => { im.setMatrixAt(i, _m.compose(cu.pos, _q.setFromEuler(_e.set(cu.rot[0], cu.rot[1], cu.rot[2], 'YXZ')), _s.set(cu.r, 1, cu.r))); im.setColorAt(i, cu.col); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; G.add(im);
    api.culmMeshes.push({ im, list, H: variants[k].H });
  });
  // far wall: a painted backdrop of culm strokes (cylinder around the corridor) for depth past 18 m
  const wallTex = canvasTex(2048, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9fc89a'); g.addColorStop(0.6, '#6f9a6a'); g.addColorStop(1, '#5d7a5e'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const r = mulb(9);
    for (let i = 0; i < 520; i++) { const px = r() * w, wd = 1.5 + r() * 4, v = r(); x.fillStyle = v < 0.5 ? `rgba(70,110,80,${0.5 + v})` : `rgba(190,220,150,${v * 0.6})`; x.fillRect(px, 0, wd, h); }
    for (let i = 0; i < 300; i++) { const px = r() * w, py = r() * h; x.fillStyle = 'rgba(60,90,70,0.6)'; x.fillRect(px, py, 4, 1.5); }
  });
  const wallM = A.paintedMaterial({ color: '#ffffff', map: wallTex, id: A.ID.PAINT, varScale: 0.05, varAmt: 0.2, light: 0.2, shade: '#7a8aa8' });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true), wallM); wall.scale.set(34, 24, 90); wall.position.set(0, 10, -40);
  wallM.side = THREE.BackSide; G.add(wall);

  // ---------------------------------------------------------------- canopy: bamboo-leaf spray cards (gap over the stream)
  const leafTex = bambooLeafAtlas({ seed: 33, size: 256 });
  const canM = A.cardMaterial({ map: leafTex, cells: 4, ramp: ['#24483e', '#3f7a48', '#7fb44e', '#d8ec8a'], alt: '#fff08a', altAmt: 0.45, ink: '#17301e', texW: 0.5, sway: 0.03, bristle: 0.18 });
  const lowM = A.cardMaterial({ map: leafTex, cells: 4, ramp: ['#2a4a40', '#47804c', '#8cc05a', '#e4f29a'], alt: '#fff08a', altAmt: 0.45, ink: '#17301e', texW: 0.55, sway: 0.05, bristle: 0.2, id: A.ID.STROKE });
  const clumps = [], low = [];
  api.cardRefs = [];
  for (let i = 0; i < 900; i++) {
    const z = lerp(Z1 - 12, Z0 + 6, rng()), side = rng() < 0.5 ? -1 : 1;
    const d = sw(z) + 0.6 + Math.pow(rng(), 0.9) * 16;
    const gap = 1.4 + 1.8 * vnoise(z * 0.15, 3);           // ragged opening over the water
    const y = 8 + rng() * 9 + (d > 4 ? 2 : 0);
    const x = sx(z) + side * Math.max(d, gap + (y - 7) * 0.12);
    clumps.push({ c: V3(x, y, z), r: V3(1.6 + rng(), 0.9 + rng() * 0.5, 1.6 + rng()), n: 7 + Math.floor(rng() * 5) });
  }
  // lower sprays along the culms (s08 tracking passes them)
  for (let i = 0; i < 260; i++) {
    const z = lerp(Z1, Z0, rng()), side = rng() < 0.5 ? -1 : 1, d = sw(z) + 0.9 + rng() * 6, x = sx(z) + side * d;
    low.push({ c: V3(x, 3 + rng() * 4.5, z), r: V3(0.8, 0.5, 0.8), n: 4 + Math.floor(rng() * 3) });
  }
  // canopy seen from above (s09 / s37): feathery leaf SPRAYS (fans of lance leaves on a twig) on flat-ish tilted quads, layered
  // 7-18 m: dark blue-green sprays deep down, lit yellow-green sprays on top, real gaps between them (depth) and a clear
  // ragged opening over the stream
  const SP_CELLS = 4;
  const sprayTex = canvasTex(256 * SP_CELLS, 256, (x, w, h) => {
    const r = mulb(91); x.clearRect(0, 0, w, h);
    for (let c = 0; c < SP_CELLS; c++) {
      const ox = c * 256 + 128, oy = 128, n = 6 + Math.floor(r() * 4), base = r() * TAU, fan = 2.2 + r() * 1.4, L = [];
      for (let k = 0; k < n; k++) L.push({ a: base + (k / (n - 1) - 0.5) * fan + (r() - 0.5) * 0.25, len: 70 + r() * 50, wd: 9 + r() * 5, v: 0.62 + r() * 0.38 });
      L.sort((p, q) => p.v - q.v);
      x.strokeStyle = 'rgb(70,60,40)'; x.lineWidth = 3; x.beginPath(); x.moveTo(ox - Math.cos(base) * 30, oy - Math.sin(base) * 30); x.lineTo(ox, oy); x.stroke();
      for (const l of L) {
        const ca = Math.cos(l.a), sa = Math.sin(l.a), ex = ox + ca * l.len, ey = oy + sa * l.len, nx = -sa * l.wd, ny = ca * l.wd;
        const mx = ox + ca * l.len * 0.42, my = oy + sa * l.len * 0.42;
        const g = (v) => `rgb(${v * 250 | 0},${v * 255 | 0},${v * 246 | 0})`;
        x.fillStyle = g(l.v);            // lit half
        x.beginPath(); x.moveTo(ox + ca * 6, oy + sa * 6); x.quadraticCurveTo(mx + nx, my + ny, ex, ey); x.lineTo(mx, my); x.closePath(); x.fill();
        x.fillStyle = g(l.v * 0.72);     // shade half
        x.beginPath(); x.moveTo(ox + ca * 6, oy + sa * 6); x.quadraticCurveTo(mx - nx, my - ny, ex, ey); x.lineTo(mx, my); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(30,50,36,0.9)'; x.lineWidth = 1.6;    // ink outline
        x.beginPath(); x.moveTo(ox + ca * 6, oy + sa * 6); x.quadraticCurveTo(mx + nx, my + ny, ex, ey); x.quadraticCurveTo(mx - nx, my - ny, ox + ca * 6, oy + sa * 6); x.stroke();
        x.strokeStyle = 'rgba(40,60,40,0.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(ox, oy); x.lineTo(ex, ey); x.stroke();
      }
    }
  }, { clamp: true });
  const sprayM = A.paintedMaterial({ color: '#ffffff', color2: '#e8f6d0', shade: '#1e4048', map: sprayTex, id: A.ID.STROKE, varScale: 0.4, varAmt: 0.2, dab: 0.15, bands: true, rim: 0.6, rimColor: '#f8ffb8', rimWidth: 0.35 });
  sprayM.side = THREE.DoubleSide; sprayM.uniforms.uSunDir = { value: sun.clone() };
  const sprayGeos = [0, 1, 2, 3].map((c) => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (c + uv.getX(k)) / SP_CELLS); return g; });
  const sprays = [[], [], [], []], spc = new THREE.Color();
  const dark = new THREE.Color('#1c4646'), mid = new THREE.Color('#3c8a48'), lit = new THREE.Color('#a4d65a');
  const addSpray = (p, size, tone) => {
    spc.copy(dark).lerp(mid, clamp(tone * 1.6, 0, 1)).lerp(lit, clamp(tone * 1.6 - 0.6, 0, 1)).multiplyScalar(0.9 + rng() * 0.2);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.9, rng() * TAU, (rng() - 0.5) * 0.9, 'YXZ'));
    sprays[Math.floor(rng() * 4)].push({ pos: p, q, s: size, col: spc.clone() });
  };
  for (const k of clumps) {   // each canopy clump: a cluster of sprays, lighter toward its top
    const n = 7 + Math.floor(rng() * 5);
    for (let j = 0; j < n; j++) {
      const a = rng() * TAU, rr = Math.sqrt(rng()) * k.r.x * 1.25, y = k.c.y + (rng() - 0.3) * k.r.y * 1.4;
      const p = V3(k.c.x + Math.cos(a) * rr, y, k.c.z + Math.sin(a) * rr);
      const gap = 1.5 + 1.8 * vnoise(p.z * 0.15, 3);
      if (Math.abs(p.x - sx(p.z)) < gap + 0.4) continue;
      addSpray(p, 1.6 + rng() * 1.2, clamp((y - 7) / 11 + (1 - rr / (k.r.x * 1.25)) * 0.25 + (rng() - 0.5) * 0.25, 0, 1));
    }
  }
  {   // sprays along the upper third of every culm (hide the culm tops, the canopy follows the grove)
    const _q2 = new THREE.Quaternion(), _e2 = new THREE.Euler();
    culms.forEach((list, k) => { const H = variants[k].H; for (const cu of list) {
      _q2.setFromEuler(_e2.set(cu.rot[0], cu.rot[1], cu.rot[2], 'YXZ'));
      for (const t of [0.66, 0.8, 0.92, 1.0]) {
        if (rng() < 0.2) continue;
        const p = V3(0, H * t, 0).applyQuaternion(_q2).add(cu.pos), a = rng() * TAU, o = 0.3 + rng() * 0.7;
        p.x += Math.cos(a) * o; p.z += Math.sin(a) * o; p.y += (rng() - 0.5) * 0.6;
        const gap = 1.3 + 1.6 * vnoise(p.z * 0.15, 3);
        if (Math.abs(p.x - sx(p.z)) < gap) continue;
        addSpray(p, 1.5 + rng() * 1.3, clamp((p.y - 7) / 12 + (rng() - 0.5) * 0.3, 0, 1));
      }
    } });
  }
  for (let i = 0; i < 9000; i++) {   // far canopy beyond the culm grove (aerial shots look 60 m out): two layers of sprays
    const z = lerp(Z1 - 20, Z0 + 20, rng()), side = rng() < 0.5 ? -1 : 1, d = sw(z) + 15 + rng() * 48, top = rng() < 0.6;
    addSpray(V3(sx(z) + side * d, top ? 11 + rng() * 6 : 6 + rng() * 4, z), 2.2 + rng() * 1.6, top ? 0.35 + rng() * 0.55 : rng() * 0.25);
  }
  { const flM = A.paintedMaterial({ color: '#284a3c', color2: '#33583e', id: A.ID.GROUND, light: 0.2, varScale: 0.2 });
    for (const sd of [-1, 1]) { const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 220).rotateX(-Math.PI / 2), flM); fl.position.set(sd * 58, 0.3, (Z0 + Z1) / 2); G.add(fl); } }
  for (let i = 0; i < 7000; i++) {   // deep layer: dark sprays 5-8 m (reads as depth in the gaps)
    const z = lerp(Z1 - 12, Z0 + 6, rng()), side = rng() < 0.5 ? -1 : 1, d = sw(z) + 1.8 + rng() * 16;
    addSpray(V3(sx(z) + side * d, 4.5 + rng() * 3.5, z), 2.0 + rng() * 1.4, rng() * 0.18);
  }
  const _sm = new THREE.Matrix4(), _sv = V3();
  api.sprayMeshes = sprays.map((list, c) => {
    const im = new THREE.InstancedMesh(sprayGeos[c], sprayM, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, _sm.compose(it.pos, it.q, _sv.set(it.s, it.s, it.s))); im.setColorAt(i, it.col); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; G.add(im);
    return { im, list };
  });
  const canItems = A.foliageItems(rng, clumps, { sun, size: 0.95 }), lowItems = A.foliageItems(rng, low, { sun, size: 0.9 });
  const canMesh = A.cardInstances(canM, canItems, { base: false }), lowMesh = A.cardInstances(lowM, lowItems, { base: false });
  G.add(canMesh, lowMesh);

  // ---------------------------------------------------------------- ferns + undergrowth along the banks
  const fernM = A.cardMaterial({ map: fernAtlas({ seed: 44, size: 256 }), cells: 4, ramp: ['#1f4038', '#3c7044', '#76aa4a', '#cfe48a'], alt: '#fff3a0', altAmt: 0.35, ink: '#142a1c', texW: 0.7, sway: 0.06, id: A.ID.STROKE });
  const ferns = [];
  for (let i = 0; i < 900; i++) {
    const z = lerp(Z1, Z0, rng()), side = rng() < 0.5 ? -1 : 1, d = sw(z) + 0.15 + Math.pow(rng(), 1.8) * 9, x = sx(z) + side * d;
    const h = 0.35 + rng() * 0.6;
    ferns.push({ pos: V3(x, bedH(x, z) - 0.05, z), w: h * 1.6, h, light: 0.45 + rng() * 0.4, hue: rng() < 0.2 ? 0.3 : 0, cell: Math.floor(rng() * 4), flip: rng() < 0.5 });
  }
  G.add(A.cardInstances(fernM, ferns));
  const grassM = A.cardMaterial({ map: A.grassAtlas({ seed: 47, cells: 4, size: 192 }), cells: 4, ramp: ['#284a3a', '#4a7a48', '#8cb45a', '#e0eea0'], alt: '#fff0a0', altAmt: 0.5, ink: '#18301e', texW: 0.75, sway: 0.05 });
  const gr = [];
  for (let i = 0; i < 1400; i++) {
    const z = lerp(Z1, Z0, rng()), side = rng() < 0.5 ? -1 : 1, d = sw(z) + 0.05 + Math.pow(rng(), 1.4) * 12, x = sx(z) + side * d;
    const h = 0.2 + rng() * 0.35; gr.push({ pos: V3(x, bedH(x, z) - 0.03, z), w: h * 1.7, h, light: 0.5 + rng() * 0.35, cell: Math.floor(rng() * 4), flip: rng() < 0.5 });
  }
  G.add(A.cardInstances(grassM, gr));

  // ---------------------------------------------------------------- stream rocks (cel + ink, mossy)
  const rockM = rockMaterial({ shade: '#92a0ba', rimColor: '#f4ffd8' });
  const rcol = rockColor2({ stone: '#aaa8a2', stone2: '#8e9096', moss: '#5f8f3c', moss2: '#9cba4a', waterY: 0 });
  const rp = [];
  for (let z = Z0; z > Z1; z -= 1.2 + rng() * 2.5) {
    const k = rng();
    const side = rng() < 0.5 ? -1 : 1;
    const x = sx(z) + (k < 0.35 ? (rng() - 0.5) * sw(z) * 1.2 : side * (sw(z) + (rng() - 0.3) * 0.5));
    const s = k < 0.35 ? 0.12 + rng() * 0.18 : 0.2 + rng() * 0.45;
    rp.push({ geo: rockGeo2(rng, { rough: 0.3 }), m: M4(V3(x, bedH(x, z) + s * 0.35, z), [0, rng() * TAU, 0], [s * 1.3, s * 0.8, s]), color: rcol });
  }
  G.add(new THREE.Mesh(bake(rp), rockM));

  // ---------------------------------------------------------------- sun shafts slanting down through the canopy onto the stream
  api.shafts = addShafts(G, [-2, -7, -11, -15, -19, -24, -30, -37, 3, 8].map((z, i) => {
    const o = (i % 3 - 1) * 1.6; return { at: V3(sx(z) + o - 0.6, -0.2, z + 0.8), len: 24, w: 1.2 + (i % 4) * 0.45, amt: 0.3 + (i % 3) * 0.08, twist: 0.4 + i * 0.7 };
  }), sun.clone(), { color: '#fff2b8', cross: true });

  // ---------------------------------------------------------------- wind bend (s37: the dragon passes over)
  // bend(k, at, dir, radius): culms within radius of `at` lean along `dir` (top moves up to k * 2.5 m), canopy follows.
  const canBase = canItems.map((it) => it.pos.clone()), lowBase = lowItems.map((it) => it.pos.clone());
  let bent = false; const _qb = new THREE.Quaternion(), _ax = V3();
  const bendAt = (x, z, B) => { const d = Math.hypot(x - B.at.x, z - B.at.z); return B.k * Math.exp(-(d * d) / (B.radius * B.radius)); };
  function applyBend(B) {
    for (const { im, list } of api.culmMeshes) {
      list.forEach((cu, i) => {
        const b = B ? bendAt(cu.pos.x, cu.pos.z, B) : 0;
        _q.setFromEuler(_e.set(cu.rot[0], cu.rot[1], cu.rot[2], 'YXZ'));
        if (b > 0.001) _q.premultiply(_qb.setFromAxisAngle(_ax.set(B.dir.z, 0, -B.dir.x), b * 0.16));
        im.setMatrixAt(i, _m.compose(cu.pos, _q, _s.set(cu.r, 1, cu.r)));
      });
      im.instanceMatrix.needsUpdate = true;
    }
    for (const [mesh, items, base] of [[canMesh, canItems, canBase], [lowMesh, lowItems, lowBase]]) {
      items.forEach((it, i) => {
        const b = B ? bendAt(base[i].x, base[i].z, B) : 0, h = Math.max(base[i].y, 0);
        _m.compose(V3(base[i].x + (B ? B.dir.x : 0) * b * 0.16 * h, base[i].y - b * b * 0.01 * h, base[i].z + (B ? B.dir.z : 0) * b * 0.16 * h), _q.identity(), _s.set(it.w, it.h, 1));
        mesh.setMatrixAt(i, _m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const { im, list } of api.sprayMeshes) {
      list.forEach((it, i) => {
        const b = B ? bendAt(it.pos.x, it.pos.z, B) : 0, h = Math.max(it.pos.y, 0);
        _sm.compose(V3(it.pos.x + (B ? B.dir.x : 0) * b * 0.16 * h, it.pos.y - b * b * 0.01 * h, it.pos.z + (B ? B.dir.z : 0) * b * 0.16 * h), it.q, _sv.set(it.s, it.s, it.s));
        im.setMatrixAt(i, _sm);
      });
      im.instanceMatrix.needsUpdate = true;
    }
    bent = !!B;
  }
  api.bend = (k, at, dir, radius = 10) => applyBend({ k, at, dir: dir.clone().setY(0).normalize(), radius });

  function update(st) {
    if (st.set !== 'BAMBOO') return;
    wall.visible = ctx.camera.position.y < 14;   // the painted culm backdrop is for the ground-level shots only
    if (st.sid === 's37') {   // default gust: a wave travelling downstream under the camera, on twos
      const u = clamp(A.onTwos(st.lt) / Math.max(st.dur, 0.01), 0, 1), z = lerp(-20, 10, u);
      api.bend(1, V3(sx(z), 0, z), V3(sx(z + 2) - sx(z), 0, 2), 9);
    } else if (bent) applyBend(null);
  }
  return { update, api, bedH };
}
