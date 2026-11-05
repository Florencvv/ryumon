// vale_pond.js - POND: temple garden at autumn dawn. Water surface y = 0 (dept WATER draws it).
// North = -z. Sun rises in the north-east behind the stone dragon spout. Pond ~14 x 11 m centred at the origin with a
// western arm running north (red arched bridge across it at z = -0.6) that ends in the inlet cascade (30 cm).
import { THREE, A, V3, TAU, lerp, clamp, sstep, mulb, fbm, vnoise, bake, M4, rockGeo, rockColor, taperTube, mapleAtlas,
  groundMaterial, mistMaterial, roofGeo, tileTex, heightMesh, leafGeo, noiseTex, canvasTex, rockGeo2, rockColor2, rockMaterial, shadowCaster, addShafts,
  tileTex2 } from './vale_lib.js';

export const POND = {
  sun: V3(0.7, 0.085, -1).normalize(),       // = vale_sky SKIES.POND sun disk
  inletLip: V3(-6.15, 0.3, -6.35),        // top of the cascade lip (stream water level 0.3 above the pond)
  inletBase: V3(-6.0, 0, -5.75),           // where the cascade hits the pond
  inletStream: [V3(-6.15, 0.3, -6.45), V3(-6.6, 0.3, -8.2), V3(-5.6, 0.3, -10.2), V3(-6.8, 0.3, -12.4), V3(-8.4, 0.3, -14.5)],
  spoutRock: V3(5.55, 1.02, -2.65),        // top of the spout rock (stone dragon head sits here)
  spoutFace: V3(-0.86, 0, 0.5).normalize(),// the head looks / pours toward the pond centre
  spoutPour: V3(4.55, 0, -2.05),           // where its stream hits the water
  bridge: { a: V3(-7.95, 0.35, -0.6), b: V3(-4.05, 0.35, -0.6), apex: 1.25 },
  lantern: V3(3.7, 0.2, 4.05),
  temple: V3(-1, 0.55, -17.5),
  hiStart: V3(-1.2, 0, 2.2),
  leafLand: V3(0.6, 0, 1.4),               // s02 hero leaf landing point (macro)
};
// pond outline: radius as a function of angle (smooth lobes), the western arm added separately
function rimR(a) { return 6.2 * (1 + 0.1 * Math.sin(2 * a + 0.7) + 0.06 * Math.sin(3 * a + 2.1) + 0.035 * Math.sin(5 * a + 0.3)); }
function pondD(x, z) {   // < 1 inside the water
  const xx = x / 1.18, zz = z / 0.86, a = Math.atan2(zz, xx), d = Math.hypot(xx, zz) / rimR(a);
  // western arm: a channel along x ~ -6, z from 1 to -6, width ~3.2 m
  const ax = x + 6.0 + Math.sin(z * 0.6) * 0.25, half = 1.55 + 0.25 * Math.sin(z * 1.3);
  const inArm = z < 1.5 && z > -6.0 ? Math.abs(ax) / half : 9;
  const end = z <= -6.0 ? Math.hypot(ax, (z + 6.0) * 1.6) / half : 9;
  return Math.min(d, inArm, end);
}
const STREAM = new THREE.CatmullRomCurve3(POND.inletStream);
const streamPts = STREAM.getSpacedPoints(60);
function streamDist(x, z) { let m = 99; for (const p of streamPts) { const d = Math.hypot(x - p.x, z - p.z); if (d < m) m = d; } return m; }
function landH(x, z) {
  let h = 0.32 + (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 0.5;
  h += 1.4 * sstep(9, 22, Math.hypot(x + 9, z + 5)) * sstep(30, 18, Math.hypot(x + 9, z + 5)) * 0.0;
  h += 1.6 * Math.exp(-((x + 10) ** 2 + (z + 9) ** 2) / 18);        // tsukiyama mound behind the inlet
  h += 0.9 * Math.exp(-((x - 10) ** 2 + (z + 7) ** 2) / 14);         // mound behind the spout
  if (z < -12.5 && z > -22.5 && x > -10 && x < 8) h = lerp(h, 0.42, sstep(-12.5, -14, z) * sstep(-22.5, -21, z) * sstep(-10, -8.5, x) * sstep(8, 6.5, x)); // temple court
  h += sstep(-24, -40, z) * 6 + sstep(-30, -60, z) * 10;            // hills behind
  h += sstep(16, 30, Math.abs(x)) * 3;
  return h;
}
function terrainH(x, z) {
  const d = pondD(x, z);
  let h;
  if (d < 1) h = -lerp(0.12, 1.15, sstep(0.98, 0.55, d)) + (fbm(x * 0.5, z * 0.5, 3) - 0.5) * 0.18;
  else h = lerp(-0.12, landH(x, z), sstep(1.0, 1.1, d));
  // the inlet stream bed: carved channel with raised banks
  const sd = streamDist(x, z);
  if (z < -6.2 && d > 1.0) {
    const bank = 0.75 + 0.35 * fbm(x * 0.4, z * 0.4, 2);
    const ch = sd < 0.55 ? 0.12 : lerp(0.12, bank, sstep(0.55, 1.4, sd));
    h = sd < 3 ? lerp(ch, Math.max(h, bank * 0.9), sstep(1.4, 3.0, sd)) : h;
  }
  return h;
}

export function buildPond(ctx, G) {
  const rng = mulb(3301), api = {};
  const sun = POND.sun;
  // sky: painted dawn sky + clouds in vale_sky.js (SKIES.POND); POND.sun matches its disk
  const ico = new THREE.IcosahedronGeometry(1, 3);

  // ---------------------------------------------------------------- terrain (pond bowl + garden + hills)
  const cMoss = new THREE.Color('#7f9a48'), cMoss2 = new THREE.Color('#b1aa52'), cMud = new THREE.Color('#7b8a6c'), cPeb = new THREE.Color('#a8a088'),
    cGravel = new THREE.Color('#ebe3d6'), cHill = new THREE.Color('#6d7f52'), cWet = new THREE.Color('#5f6a5c'), cBank = new THREE.Color('#8f8a6a'), c = new THREE.Color();
  const tcol = (x, z, y, n) => {
    const d = pondD(x, z);
    if (d < 1.02 || y < 0.02) {   // pond bottom: pebbly, greener in the deep
      c.copy(cPeb).lerp(cMud, sstep(-0.2, -0.9, y)).lerp(new THREE.Color('#8c9a70'), fbm(x * 0.7, z * 0.7, 3) * 0.6);
      if (y > -0.15) c.lerp(cWet, 0.4);
      return c;
    }
    c.copy(cMoss).lerp(cMoss2, sstep(0.4, 0.75, fbm(x * 0.25, z * 0.25, 3)));
    if (d < 1.12) c.lerp(cBank, 0.55);
    const tc = (z < -12.8 && z > -22 && x > -9.5 && x < 7.5);
    if (tc) c.copy(cGravel);
    if (y > 2) c.lerp(cHill, sstep(2, 6, y));
    if (n.y < 0.8) c.lerp(new THREE.Color('#8a7a68'), sstep(0.8, 0.55, n.y) * 0.6);
    return c;
  };
  const tG = heightMesh(-34, 34, -48, 22, 230, 240, terrainH, tcol);
  const groundM = groundMaterial({ leaves: 0.07, dab: 0.55, shade: '#6a6890', leafA: '#d33c2a', leafB: '#f39a33' });
  groundM.uniforms.uSunDir = { value: V3(sun.x, 0.9, sun.z).normalize() };
  const terrain = new THREE.Mesh(tG, groundM); G.add(terrain);
  // far ring: hills and forest band beyond the garden (painted)
  const hillM = A.paintedMaterial({ color: '#7c8a68', color2: '#a69a7a', shade: '#8a86b0', id: A.ID.PAINT, varScale: 0.02, varAmt: 0.6, dab: 0.35, stroke: 0.5, strokeScale: 0.03, rim: 0.6, rimColor: '#ffd9a6', rimTop: 1 });
  hillM.uniforms.uSunDir = { value: V3(sun.x, 0.5, sun.z).normalize() };
  const ridge = (R, h0, amp, freq, seed) => heightMesh(-1, 1, 0, 1, 160, 6, (u, v) => 0, () => new THREE.Color(1, 1, 1), null);
  const farParts = [];
  [[90, 22, 30, 3.1, 1], [150, 45, 50, 2.3, 2], [260, 80, 90, 1.7, 3]].forEach(([R, h0, amp, fq, s], k) => {
    const g = new THREE.CylinderGeometry(R, R, 1, 160, 4, true, Math.PI * 0.55, Math.PI * 1.25);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), top = p.getY(i) > 0;
      const hh = h0 + amp * (fbm(a * fq + s * 7, s, 4) - 0.25) + (k === 0 ? 4 * vnoise(a * 40, 1) : 0);
      p.setY(i, top ? hh : -5);
    }
    g.computeVertexNormals();
    const col = [new THREE.Color('#6f8458'), new THREE.Color('#8f93a8'), new THREE.Color('#b4a9c8')][k];
    farParts.push({ geo: g, m: M4(V3(0, 0, -10)), color: col });
  });
  const far = new THREE.Mesh(bake(farParts), A.paintedMaterial({ color: '#ffffff', color2: '#e6dcef', shade: '#9a98c0', vertexColors: true, id: A.ID.PAINT, varScale: 0.03, varAmt: 0.4, stroke: 0.7, strokeScale: 0.025, rim: 0.7, rimColor: '#ffe0b0', rimTop: 1, dab: 0.3 }));
  far.material.uniforms.uSunDir = { value: V3(sun.x, 0.4, sun.z).normalize() };
  G.add(far);

  // ---------------------------------------------------------------- rocks around the rim (cel + ink), pebbles below
  const rockM = rockMaterial({ shade: '#9a96bc', rimColor: '#ffd8a8' });
  const rparts = [], rcol = rockColor2({ waterY: 0 });
  const addRock = (pos, s, rot = rng() * TAU, o = {}) => { rparts.push({ geo: rockGeo2(rng, o), m: M4(pos, [rng() * 0.2, rot, rng() * 0.2], s), color: rcol }); };
  // rim rocks: walk the outline, skip the inlet, the spout area handled separately and the bridge abutments
  for (let a = 0; a < TAU; a += 0.11 + rng() * 0.16) {
    const r = rimR(a), x = Math.cos(a) * r * 1.18, z = Math.sin(a) * r * 0.86;
    if (x < -4.6 && z < 1.8) continue;      // the western arm (own rocks)
    if (Math.hypot(x - POND.lantern.x, z - POND.lantern.z) < 0.9) continue;
    const big = rng() < 0.22, s = big ? 0.55 + rng() * 0.45 : 0.25 + rng() * 0.25;
    addRock(V3(x * (1.0 + rng() * 0.05), -0.05 + s * 0.15, z * (1.0 + rng() * 0.05)), [s * (1.1 + rng() * 0.5), s * (0.6 + rng() * 0.35), s * (0.9 + rng() * 0.4)]);
  }
  for (let z = 1.6; z > -6.6; z -= 0.45 + rng() * 0.4) for (const sd of [-1, 1]) {   // western arm banks
    if (Math.abs(z + 0.6) < 0.7) continue;
    const half = 1.55 + 0.25 * Math.sin(z * 1.3), x = -6.0 - Math.sin(z * 0.6) * 0.25 + sd * (half + 0.05), s = 0.22 + rng() * 0.3;
    addRock(V3(x, 0.0, z), [s * 1.2, s * 0.7, s]);
  }
  // inlet cascade: flanking boulders + the flat lip stone the water pours over
  const L = POND.inletLip;
  addRock(V3(L.x - 1.05, 0.25, L.z - 0.1), [0.8, 0.75, 0.7], 0.4, { rough: 0.25 });
  addRock(V3(L.x + 1.0, 0.2, L.z + 0.05), [0.75, 0.62, 0.8], 2.1, { rough: 0.28 });
  addRock(V3(L.x - 0.2, 0.05, L.z - 0.25), [0.75, 0.28, 0.42], 0.1, { rough: 0.12, flat: 0.2 });
  addRock(V3(L.x + 0.35, 0.02, L.z - 0.2), [0.5, 0.27, 0.4], 0.5, { rough: 0.12, flat: 0.2 });
  addRock(V3(L.x - 1.6, 0.6, L.z - 1.1), [0.6, 0.6, 0.55]);
  addRock(V3(L.x + 1.4, 0.55, L.z - 1.4), [0.5, 0.5, 0.6]);
  addRock(V3(L.x + 0.55, -0.35, L.z + 0.55), [0.35, 0.3, 0.3]);
  addRock(V3(L.x - 0.6, -0.35, L.z + 0.6), [0.3, 0.32, 0.35]);
  // the spout rock: a tall mossy boulder at the east rim, flat-ish top for the dragon head
  const S = POND.spoutRock;
  addRock(V3(S.x + 0.1, 0.25, S.z), [1.0, 0.95, 0.9], 0.7, { rough: 0.22, flat: 0.3 });
  addRock(V3(S.x + 0.85, 0.05, S.z - 0.7), [0.75, 0.7, 0.65], 1.8);
  addRock(V3(S.x - 0.55, -0.15, S.z + 0.75), [0.5, 0.35, 0.5], 2.4);
  addRock(V3(S.x + 0.5, 0.0, S.z + 0.9), [0.45, 0.45, 0.4]);
  // stepping stones + garden rocks
  for (let i = 0; i < 6; i++) addRock(V3(-2.6 + i * 0.95 + (rng() - 0.5) * 0.2, 0.26, 7.9 + Math.sin(i) * 0.35), [0.38, 0.12, 0.32], rng() * TAU, { rough: 0.1, flat: 0.1 });
  for (const [x, z, s] of [[-9.5, 2.2, 0.9], [9.8, 4.5, 0.7], [-3, -11.5, 0.6], [10.5, -4.5, 1.1], [-12, -3.5, 0.8], [6.5, 8.5, 0.5]]) addRock(V3(x, landH(x, z) + s * 0.1, z), [s * 1.3, s * 0.8, s]);
  const rocks = new THREE.Mesh(bake(rparts), rockM); G.add(rocks);
  // pond-bottom pebbles (painted, under water)
  const pebM = A.paintedMaterial({ color: '#b2a890', color2: '#8f9a80', shade: '#5f6a80', vertexColors: true, id: A.ID.GROUND, varScale: 0.8, varAmt: 0.5, dab: 0.3 });
  const pebG = rockGeo(mulb(77), { ws: 10, hs: 7, rough: 0.2, flat: 0.1 });
  const pebParts = [];
  for (let i = 0; i < 520; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * 6.8, x = Math.cos(a) * r * 1.18, z = Math.sin(a) * r * 0.86;
    if (pondD(x, z) > 0.97) continue;
    const s = 0.04 + rng() ** 2 * 0.16, y = terrainH(x, z);
    const tone = 0.75 + rng() * 0.45;
    pebParts.push({ geo: pebG, m: M4(V3(x, y + s * 0.15, z), [0, rng() * TAU, 0], [s * 1.3, s * 0.6, s]), color: new THREE.Color(tone, tone * (0.95 + rng() * 0.08), tone * (0.88 + rng() * 0.1)) });
  }
  G.add(new THREE.Mesh(bake(pebParts), pebM));
  // waterweed: tall swaying ribbon cards on the bottom near the edges
  const weedM = A.cardMaterial({ map: A.grassAtlas({ seed: 91, cells: 4, size: 192 }), cells: 4, ramp: ['#1f4a4a', '#2f6e58', '#5d9a5a', '#a6cf7a'], alt: '#c0ff9a', altAmt: 0.4, ink: '#173030', texW: 0.75, sway: 0.18 });
  const weeds = [];
  for (let i = 0; i < 160; i++) {
    const a = rng() * TAU, r = (0.55 + rng() * 0.4) * 6.4, x = Math.cos(a) * r * 1.18, z = Math.sin(a) * r * 0.86;
    if (pondD(x, z) > 0.93) continue;
    const y = terrainH(x, z); if (y > -0.35) continue;
    const h = Math.min(-y - 0.06, 0.35 + rng() * 0.6);
    weeds.push({ pos: V3(x, y - 0.02, z), w: h * (0.6 + rng() * 0.4), h, light: 0.45 + rng() * 0.3, cell: Math.floor(rng() * 4), flip: rng() < 0.5 });
  }
  G.add(A.cardInstances(weedM, weeds));

  // ---------------------------------------------------------------- maples (cel trunks, painted star-leaf crowns)
  const barkM = A.celMaterial({ base: '#8a7470', shade: '#4e4262', map: A.barkTexture({ seed: 5 }), id: A.ID.PROP, highlight: 0.1, rimColor: '#ffbf8a', rimWidth: 0.2 });
  const mapleTex = mapleAtlas({ seed: 12, size: 256 });
  const RAMPS = {
    crimson: ['#5b1838', '#a8213a', '#e2452e', '#ff9a64'],
    scarlet: ['#6a2032', '#c7322c', '#f2683a', '#ffc078'],
    orange: ['#6e2e3a', '#cc5a2c', '#f59a3a', '#ffe08a'],
    gold: ['#5e4248', '#b47a2e', '#ecbc48', '#fff2a8'],
    turning: ['#3e4646', '#7e823a', '#d79a3a', '#ffd27a'],
  };
  const leafMats = {};
  for (const k in RAMPS) leafMats[k] = A.cardMaterial({ map: mapleTex, cells: 4, ramp: RAMPS[k], alt: '#ff8aa8', altAmt: 0.35, ink: '#3a1420', texW: 0.5, sway: 0.025, bristle: 0.2 });
  const leafItems = {}; for (const k in RAMPS) leafItems[k] = [];
  const trunkParts = [], crownDiscs = [];
  api.trees = [];
  function maple(base, H, ramp, o = {}) {
    const r = mulb(o.seed ?? Math.floor(base.x * 131 + base.z * 71));
    const lean = (r() - 0.5) * 0.35 + (o.lean ?? 0), az = o.az ?? r() * TAU;
    const fork = V3(base.x + Math.cos(az) * lean * H * 0.3, base.y + H * (0.32 + r() * 0.12), base.z + Math.sin(az) * lean * H * 0.3);
    const tr = H * 0.045;
    trunkParts.push({ geo: taperTube([base.clone().add(V3(0, -0.3, 0)), base.clone().lerp(fork, 0.5).add(V3((r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2)), fork], tr * 1.25, tr * 0.8, 9, 10, { wob: 0.15, vScale: 1.2 }) });
    const clumps = [];
    const nL = 4 + Math.floor(r() * 3);
    for (let i = 0; i < nL; i++) {
      const a = az + i / nL * TAU + (r() - 0.5) * 0.7, spread = H * (0.32 + r() * 0.22) * (o.spread ?? 1), up = H * (0.22 + r() * 0.35);
      const end = V3(fork.x + Math.cos(a) * spread, fork.y + up, fork.z + Math.sin(a) * spread);
      const mid = fork.clone().lerp(end, 0.5).add(V3(0, -up * 0.15 + r() * 0.3, 0));
      trunkParts.push({ geo: taperTube([fork, mid, end], tr * 0.7, tr * 0.18, 7, 8, { wob: 0.1 }) });
      const sub = 1 + Math.floor(r() * 2);
      for (let j = 0; j < sub; j++) {
        const st = fork.clone().lerp(end, 0.45 + r() * 0.3), a2 = a + (r() - 0.5) * 1.6, l2 = spread * (0.35 + r() * 0.3);
        const e2 = V3(st.x + Math.cos(a2) * l2, st.y + l2 * (0.1 + r() * 0.5), st.z + Math.sin(a2) * l2);
        trunkParts.push({ geo: taperTube([st, st.clone().lerp(e2, 0.5).add(V3(0, 0.1, 0)), e2], tr * 0.3, tr * 0.08, 5, 5) });
        clumps.push({ c: e2.clone().add(V3(0, 0.25, 0)), r: V3(1, 0.55, 1).multiplyScalar(H * (0.13 + r() * 0.07)), n: 26 + Math.floor(r() * 12) });
      }
      clumps.push({ c: end.clone().add(V3(0, 0.2, 0)), r: V3(1, 0.6, 1).multiplyScalar(H * (0.17 + r() * 0.08)), n: 38 + Math.floor(r() * 16) });
      clumps.push({ c: mid.clone().add(V3(0, 0.45, 0)), r: V3(1, 0.5, 1).multiplyScalar(H * (0.12 + r() * 0.05)), n: 18 + Math.floor(r() * 8), light: -0.08 });
    }
    clumps.push({ c: fork.clone().add(V3(0, H * 0.42, 0)), r: V3(1, 0.55, 1).multiplyScalar(H * 0.2), n: 40 });
    const items = A.foliageItems(r, clumps, { sun: V3(sun.x, 1.1, sun.z), size: o.size ?? 0.78 });
    crownDiscs.push(...clumps);
    // second ramp mixed in for natural variation inside one crown
    const alt = o.alt;
    for (const it of items) (alt && r() < 0.3 ? leafItems[alt] : leafItems[ramp]).push(it);
    api.trees.push({ base: base.clone(), H, ramp });
  }
  const gy = (x, z) => terrainH(x, z) - 0.05;
  const T = (x, z, H, ramp, o = {}) => maple(V3(x, gy(x, z), z), H, ramp, o);
  T(-9.4, 5.8, 6.4, 'crimson', { alt: 'scarlet', az: -0.6, spread: 1.15, seed: 11 });
  T(8.9, 2.4, 5.6, 'orange', { alt: 'scarlet', az: 2.8, seed: 12 });
  T(8.6, -8.4, 7.2, 'crimson', { alt: 'orange', seed: 13 });
  T(-9.6, -8.2, 6.0, 'gold', { alt: 'orange', seed: 14 });
  T(3.6, -11.6, 5.2, 'scarlet', { alt: 'gold', seed: 15 });
  T(-5.0, -12.6, 5.6, 'orange', { alt: 'crimson', seed: 16 });
  T(12.8, -2.0, 6.6, 'turning', { alt: 'gold', seed: 17 });
  T(-13.5, -1.0, 7.0, 'scarlet', { alt: 'turning', seed: 18 });
  T(11.5, 8.5, 5.0, 'crimson', { seed: 19 });
  T(-12.5, 10.5, 6.0, 'orange', { alt: 'gold', seed: 20 });
  T(14.5, -11.5, 7.5, 'gold', { seed: 21 });
  T(-15.5, -13.0, 8.0, 'crimson', { alt: 'orange', seed: 22 });
  T(6.0, -15.0, 6.2, 'turning', { alt: 'scarlet', seed: 23 });
  T(-1.0, 13.0, 6.5, 'scarlet', { alt: 'crimson', seed: 24, spread: 1.2 });   // behind the s03 camera (s38 / reverse angles)
  // evergreens behind and beside the garden: dark cedar / pine masses so the reds read against them
  const pineM = A.cardMaterial({ map: A.foliageAtlas({ seed: 27, kind: 'pine', size: 256 }), cells: 4, ramp: ['#1e3040', '#2e5048', '#4f7a54', '#a8c48a'], alt: '#ffd0a0', altAmt: 0.35, ink: '#121e24', texW: 0.45, sway: 0.012 });
  const pcl = [];
  for (let i = 0; i < 70; i++) {
    const side = i < 40 ? 0 : (i % 2 ? 1 : -1);
    const x = side === 0 ? -42 + rng() * 84 : side * (17 + rng() * 14), z = side === 0 ? -23 - rng() * 16 : -18 + rng() * 34;
    const y = terrainH(x, z), Hh = 9 + rng() * 9, n = 4 + Math.floor(rng() * 3);
    for (let k = 0; k < n + 2; k++) { const t = k / (n + 1), r = (1 - t * 0.7) * Hh * 0.3; pcl.push({ c: V3(x + (rng() - 0.5) * 0.8, y + Hh * (0.22 + t * 0.72), z + (rng() - 0.5) * 0.8), r: V3(r, r * 0.6, r), n: 12 }); }
    trunkParts.push({ geo: taperTube([V3(x, y - 0.3, z), V3(x, y + Hh * 0.9, z)], Hh * 0.025, Hh * 0.008, 6, 3) });
  }
  G.add(A.cardInstances(pineM, A.foliageItems(rng, pcl, { sun: V3(sun.x, 1, sun.z), size: 0.9 }), { base: false }));
  // far crowns along the hills (smaller, many)
  for (let i = 0; i < 26; i++) {
    const x = -30 + i * 2.4 + (rng() - 0.5) * 1.5, z = -27 - rng() * 8;
    const k = ['crimson', 'orange', 'gold', 'turning', 'scarlet'][Math.floor(rng() * 5)];
    T(x, z, 5 + rng() * 4, k, { seed: 100 + i, size: 0.9 });
  }
  G.add(new THREE.Mesh(bake(trunkParts), barkM));
  for (const k in RAMPS) if (leafItems[k].length) G.add(A.cardInstances(leafMats[k], leafItems[k], { base: false }));

  // moss tufts + low grass along the banks and the inlet stream (painted cards)
  const tuftM = A.cardMaterial({ map: A.grassAtlas({ seed: 93, cells: 4, size: 192 }), cells: 4, ramp: ['#33503e', '#5e8446', '#a4b452', '#f2e8a0'], alt: '#ffb070', altAmt: 0.45, ink: '#1e3020', texW: 0.75, sway: 0.04 });
  const tufts = [];
  for (let i = 0; i < 2600 && tufts.length < 1100; i++) {
    const a = rng() * TAU, r = 6.5 + rng() * 9, x = Math.cos(a) * r * 1.18 + (rng() - 0.5) * 3, z = Math.sin(a) * r * 0.86 + (rng() - 0.5) * 3;
    const d = pondD(x, z); if (d < 1.06 || d > 1.9) continue;
    if (Math.hypot(x - POND.lantern.x, z - POND.lantern.z) < 0.7) continue;
    const h = 0.12 + rng() * 0.22 * (d < 1.3 ? 1.4 : 1);
    tufts.push({ pos: V3(x, terrainH(x, z) - 0.02, z), w: h * 1.8, h, light: 0.45 + rng() * 0.4, hue: rng() < 0.3 ? 0.4 : 0, cell: Math.floor(rng() * 4), flip: rng() < 0.5 });
  }
  for (let i = 0; i < 260; i++) {   // along the inlet stream
    const p = STREAM.getPointAt(rng()), sd = rng() < 0.5 ? -1 : 1, o = 0.6 + rng() * 1.6, x = p.x + sd * o, z = p.z + (rng() - 0.5) * 0.6;
    const h = 0.15 + rng() * 0.3; tufts.push({ pos: V3(x, terrainH(x, z) - 0.02, z), w: h * 1.7, h, light: 0.4 + rng() * 0.45, cell: Math.floor(rng() * 4), flip: rng() < 0.5 });
  }
  G.add(A.cardInstances(tuftM, tufts));

  // clipped shrubs (karikomi): mass-lit puff clusters, green with autumn red edges
  const shrubM = A.paintedMaterial({ color: '#5f8a48', color2: '#b8623a', shade: '#46507a', id: A.ID.FOLIAGE, varScale: 0.9, varAmt: 0.45, dab: 0.4, bands: true, rim: 0.5, rimColor: '#ffe0a0' });
  shrubM.uniforms.uSunDir = { value: V3(sun.x, 1, sun.z).normalize() };
  const shParts = [];
  for (const [x, z, s] of [[-7.8, 3.6, 0.9], [-6.6, 4.8, 0.7], [6.6, 5.8, 0.85], [7.6, 4.9, 0.6], [-3.6, -9.8, 0.8], [2.4, -9.6, 0.75], [9.8, -5.6, 0.8], [-11, -4.8, 1.0], [11.2, 0.6, 0.7], [-4.6, 9.4, 0.8]]) {
    const y = terrainH(x, z);
    for (let i = 0; i < 9; i++) { const a = rng() * TAU, rr = s * 0.5 * rng(); shParts.push({ geo: ico, m: M4(V3(x + Math.cos(a) * rr, y + s * 0.35 + rng() * s * 0.25, z + Math.sin(a) * rr), [0, 0, 0], [s * (0.55 + rng() * 0.3), s * 0.42, s * (0.55 + rng() * 0.3)]) });
    }
  }
  G.add(new THREE.Mesh(bake(shParts), shrubM));

  // ---------------------------------------------------------------- stone lantern (yukimi-doro at the water's edge)
  const stoneM = A.celMaterial({ base: '#ffffff', shade: '#a6a2c2', vertexColors: true, id: A.ID.PROP, highlight: 0.2, hiSize: 0.96, rimColor: '#ffe2b8', rimWidth: 0.2 });
  const lc = rockColor({ stone: '#b4aeac', stone2: '#9a96a2', mossAmt: 0.7, waterY: 0 });
  const lp = [], LN = POND.lantern;
  const lat = (geo, y, s, rot = [0, 0, 0]) => lp.push({ geo, m: M4(V3(LN.x, LN.y + y, LN.z), rot, s), color: lc });
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.3; const leg = taperTube([V3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42), V3(Math.cos(a) * 0.36, 0.3, Math.sin(a) * 0.36), V3(Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2)], 0.07, 0.05, 7, 6); lp.push({ geo: leg, m: M4(V3(LN.x, LN.y, LN.z)), color: lc }); }
  lat(new THREE.CylinderGeometry(0.3, 0.34, 0.08, 6), 0.53, 1);                         // base plate (hexagonal)
  lat(new THREE.CylinderGeometry(0.2, 0.22, 0.32, 6), 0.73, 1);                         // fire box
  lat(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 6), 0.9, 1);
  // umbrella roof: wide hexagonal cap with curled-up corners
  const cap = new THREE.ConeGeometry(0.62, 0.32, 6, 3, false); const cp = cap.attributes.position;
  for (let i = 0; i < cp.count; i++) { const y = cp.getY(i), x = cp.getX(i), z = cp.getZ(i), r = Math.hypot(x, z); if (y < -0.1) cp.setY(i, y + Math.pow(r / 0.62, 6) * 0.12); }
  cap.computeVertexNormals(); lat(cap, 1.08, 1);
  lat(new THREE.SphereGeometry(0.09, 10, 8), 1.27, [1, 1.3, 1]);                         // hoju finial
  lat(new THREE.CylinderGeometry(0.05, 0.08, 0.06, 8), 1.21, 1);
  G.add(new THREE.Mesh(bake(lp), stoneM));
  const glowM = A.fxMaterial({ color: '#ffcf86', intensity: 1.1, bloom: 0.6 });
  const win = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.215, 0.18, 6, 1, true), glowM); win.position.set(LN.x, LN.y + 0.73, LN.z); G.add(win);
  // dark lattice over the glow (paper window frames)
  const frameM = A.celMaterial({ base: '#4a3f52', flat: true, id: A.ID.PROP });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.035), frameM); b.position.set(LN.x + Math.cos(a) * 0.21, LN.y + 0.73, LN.z + Math.sin(a) * 0.21); G.add(b); }

  // ---------------------------------------------------------------- red arched bridge (taiko-bashi) over the western arm
  const redM = A.celMaterial({ base: '#d8402c', shade: '#8e2840', id: A.ID.PROP, highlight: 0.35, hiSize: 0.95, rimColor: '#ffc89a', rimWidth: 0.22 });
  const woodM = A.celMaterial({ base: '#9a7a62', shade: '#5c4a62', id: A.ID.PROP, highlight: 0.15, map: noiseTex({ seed: 4, ax: 6, r: 0.02, lo: 0.75 }) });
  const goldM = A.celMaterial({ base: '#e8b850', shade: '#9a6a48', id: A.ID.PROP, highlight: 0.8, hiSize: 0.9 });
  const B = POND.bridge, BL = B.b.x - B.a.x, bw = 1.25;
  const arch = (u) => B.a.y + B.apex * Math.sin(u * Math.PI) * (1 - 0.12 * Math.sin(u * Math.PI) ** 2);
  const bp = [], rp = [], gp = [];
  // deck: planks across the arch
  const nPl = 30;
  for (let i = 0; i < nPl; i++) {
    const u0 = i / nPl, u1 = (i + 0.92) / nPl, x0 = B.a.x + BL * u0, x1 = B.a.x + BL * u1, y0 = arch(u0), y1 = arch(u1);
    const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
    bp.push({ geo: new THREE.BoxGeometry(len, 0.06, bw), m: M4(V3((x0 + x1) / 2, (y0 + y1) / 2, B.a.z), [0, 0, 0], 1).multiply(new THREE.Matrix4().makeRotationZ(ang)) });
  }
  // side beams (red), posts, rails, finials
  for (const sd of [-1, 1]) {
    const z = B.a.z + sd * bw / 2;
    const beam = []; for (let i = 0; i <= 16; i++) { const u = i / 16; beam.push(V3(B.a.x + BL * u, arch(u) - 0.1, z)); }
    rp.push({ geo: taperTube(beam, 0.09, 0.09, 6, 32) });
    const rail = []; for (let i = 0; i <= 16; i++) { const u = i / 16; rail.push(V3(B.a.x + BL * u, arch(u) + 0.68, z)); }
    rp.push({ geo: taperTube(rail, 0.045, 0.045, 6, 32) });
    const rail2 = []; for (let i = 0; i <= 16; i++) { const u = i / 16; rail2.push(V3(B.a.x + BL * u, arch(u) + 0.36, z)); }
    rp.push({ geo: taperTube(rail2, 0.03, 0.03, 6, 32) });
    for (let i = 0; i <= 6; i++) {
      const u = i / 6, x = B.a.x + BL * u, y = arch(u);
      rp.push({ geo: new THREE.CylinderGeometry(0.05, 0.055, 0.82, 8), m: M4(V3(x, y + 0.3, z)) });
      if (i === 0 || i === 6 || i === 3) { gp.push({ geo: new THREE.SphereGeometry(0.075, 10, 8), m: M4(V3(x, y + 0.82, z), [0, 0, 0], [1, 1.25, 1]) }); gp.push({ geo: new THREE.ConeGeometry(0.03, 0.09, 8), m: M4(V3(x, y + 0.94, z)) }); }
    }
  }
  // piers (red legs into the water) + cross braces
  for (const u of [0.22, 0.5, 0.78]) for (const sd of [-1, 1]) {
    const x = B.a.x + BL * u, z = B.a.z + sd * (bw / 2 - 0.05);
    rp.push({ geo: new THREE.CylinderGeometry(0.075, 0.08, arch(u) + 1.2, 8), m: M4(V3(x, (arch(u) - 1.2) / 2 - 0.05, z)) });
  }
  for (const u of [0.22, 0.5, 0.78]) rp.push({ geo: new THREE.BoxGeometry(0.08, 0.1, bw), m: M4(V3(B.a.x + BL * u, arch(u) - 0.35, B.a.z)) });
  G.add(new THREE.Mesh(bake(bp), woodM), new THREE.Mesh(bake(rp), redM), new THREE.Mesh(bake(gp), goldM));
  // bridge abutment stones
  const abParts = [];
  for (const end of [B.a, B.b]) for (const sd of [-1, 1]) abParts.push({ geo: rockGeo2(rng, { rough: 0.2 }), m: M4(V3(end.x + Math.sign(end.x - (B.a.x + B.b.x) / 2) * 0.15, 0.1, end.z + sd * 0.95), [0, rng() * TAU, 0], [0.45, 0.35, 0.4]), color: rcol });
  G.add(new THREE.Mesh(bake(abParts), rockM));

  // ---------------------------------------------------------------- temple hall: stone platform, red posts, white walls, lattice, huge curved roof
  const TP = POND.temple, hall = new THREE.Group(); hall.position.copy(TP); G.add(hall);
  const plasterM = A.celMaterial({ base: '#f2ebe0', shade: '#b4acc8', id: A.ID.PROP, highlight: 0.1 });
  const postM = A.celMaterial({ base: '#b8402e', shade: '#6e2a44', id: A.ID.PROP, highlight: 0.25, rimColor: '#ffc89a' });
  const darkWoodM = A.celMaterial({ base: '#6a4a40', shade: '#3a2c44', id: A.ID.PROP, highlight: 0.1, map: noiseTex({ seed: 8, ax: 5, r: 0.02, lo: 0.7 }) });
  const roofM = A.celMaterial({ base: '#7c8296', shade: '#454a6e', id: A.ID.PROP, highlight: 0.45, hiSize: 0.93, map: tileTex2(), rimColor: '#ffd9a8', rimWidth: 0.25 });
  const W = 14, D = 9, PH = 4.2;
  const plat = new THREE.Mesh(bake([{ geo: new THREE.BoxGeometry(W + 2.6, 0.7, D + 2.6, 6, 1, 6), m: M4(V3(0, 0.0, 0)) }, { geo: new THREE.BoxGeometry(4.5, 0.25, 1.4), m: M4(V3(0, -0.22, D / 2 + 1.9)) }, { geo: new THREE.BoxGeometry(4.5, 0.25, 0.9), m: M4(V3(0, 0.02, D / 2 + 1.55)) }]), stoneM);
  plat.material = A.celMaterial({ base: '#cfc8c2', shade: '#8f8aa8', id: A.ID.PROP, highlight: 0.1, map: noiseTex({ seed: 6, r: 0.05, lo: 0.82 }) });
  hall.add(plat);
  const posts = [], walls = [], dark = [];
  for (let i = 0; i <= 5; i++) for (const zz of [-D / 2, D / 2]) posts.push({ geo: new THREE.CylinderGeometry(0.2, 0.22, PH, 12), m: M4(V3(-W / 2 + i * W / 5, 0.35 + PH / 2, zz)) });
  for (const xx of [-W / 2, W / 2]) for (let j = 1; j < 3; j++) posts.push({ geo: new THREE.CylinderGeometry(0.2, 0.22, PH, 12), m: M4(V3(xx, 0.35 + PH / 2, -D / 2 + j * D / 3)) });
  posts.push({ geo: new THREE.BoxGeometry(W + 0.6, 0.38, 0.32), m: M4(V3(0, 0.35 + PH - 0.2, D / 2)) });   // nuki beams
  posts.push({ geo: new THREE.BoxGeometry(W + 0.6, 0.22, 0.26), m: M4(V3(0, 0.35 + PH * 0.72, D / 2)) });
  posts.push({ geo: new THREE.BoxGeometry(W + 0.6, 0.38, 0.32), m: M4(V3(0, 0.35 + PH - 0.2, -D / 2)) });
  for (const xx of [-W / 2, W / 2]) posts.push({ geo: new THREE.BoxGeometry(0.32, 0.38, D + 0.6), m: M4(V3(xx, 0.35 + PH - 0.2, 0)) });
  // walls set back 0.8 m behind the front posts (veranda), lattice doors in the front bays
  walls.push({ geo: new THREE.BoxGeometry(W - 0.4, PH * 0.66, D - 1.6), m: M4(V3(0, 0.35 + PH * 0.33, -0.6)) });
  walls.push({ geo: new THREE.BoxGeometry(W - 0.4, PH * 0.22, D - 1.6), m: M4(V3(0, 0.35 + PH * 0.86, -0.6)) });
  for (let i = 0; i < 5; i++) {
    const cx = -W / 2 + (i + 0.5) * W / 5, zf = D / 2 - 0.79, bwid = W / 5 - 0.5, bh = PH * 0.62;
    for (let k = 0; k <= 8; k++) dark.push({ geo: new THREE.BoxGeometry(0.05, bh, 0.05), m: M4(V3(cx - bwid / 2 + k * bwid / 8, 0.35 + bh / 2, zf)) });
    for (let k = 0; k <= 6; k++) dark.push({ geo: new THREE.BoxGeometry(bwid, 0.05, 0.05), m: M4(V3(cx, 0.35 + k * bh / 6, zf)) });
  }
  // bracket blocks (tokyo) under the eaves
  for (let i = 0; i <= 5; i++) for (const zz of [-D / 2, D / 2]) { const x = -W / 2 + i * W / 5; posts.push({ geo: new THREE.BoxGeometry(0.55, 0.3, 0.55), m: M4(V3(x, 0.35 + PH + 0.12, zz)) }); dark.push({ geo: new THREE.BoxGeometry(1.1, 0.18, 0.36), m: M4(V3(x, 0.35 + PH + 0.35, zz)) }); }
  hall.add(new THREE.Mesh(bake(posts), postM), new THREE.Mesh(bake(walls), plasterM), new THREE.Mesh(bake(dark), darkWoodM));
  // roof: lower big hip roof + ridge + gable top (irimoya feel)
  const EAVE = 0.35 + PH + 0.42, RISE = 5.2, RIDGE = EAVE + RISE;
  const roof = new THREE.Mesh(roofGeo({ L: W, D, rise: RISE, over: 2.4, up: 1.0, sag: 0.75, ridge: W * 0.55, segU: 30, segV: 14 }), roofM);
  roof.position.set(0, RIDGE, 0); hall.add(roof);
  {   // eave fascia: a dark wooden board along the whole upturned eave line (gives the roof its drawn edge)
    const hx = W / 2 + 2.4, hz = D / 2 + 2.4, pts = [];
    const ey = (u) => -RISE + 1.0 * Math.pow(Math.abs(u - 0.5) * 2, 3.5);
    const edge = (ax, az, bx, bz) => { for (let i = 0; i < 16; i++) { const u = i / 16; pts.push(V3(lerp(ax, bx, u), RIDGE + ey(u) - 0.08, lerp(az, bz, u))); } };
    edge(-hx, hz, hx, hz); edge(hx, hz, hx, -hz); edge(hx, -hz, -hx, -hz); edge(-hx, -hz, -hx, hz); pts.push(pts[0].clone());
    hall.add(new THREE.Mesh(taperTube(pts, 0.16, 0.16, 6, 160), darkWoodM));
  }
  const roof2 = new THREE.Mesh(roofGeo({ L: W * 0.55, D: D * 0.34, rise: 1.9, over: 0.7, up: 0.45, sag: 0.3, ridge: W * 0.55 + 1.4, segU: 16, segV: 6 }), roofM);
  roof2.position.set(0, RIDGE + 0.95, 0); hall.add(roof2);
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 3), darkWoodM);
  const ridgeBeam = new THREE.Mesh(taperTube([V3(-W * 0.31 - 0.4, 0, 0), V3(-W * 0.15, -0.06, 0), V3(W * 0.15, -0.06, 0), V3(W * 0.31 + 0.4, 0, 0)], 0.28, 0.28, 8, 20), A.celMaterial({ base: '#5f6478', shade: '#363a5a', id: A.ID.PROP, highlight: 0.4 }));
  ridgeBeam.position.set(0, RIDGE + 1.05, 0); hall.add(ridgeBeam);
  for (const sd of [-1, 1]) { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), goldM); sh.scale.set(0.7, 1.1, 0.7); sh.position.set(sd * (W * 0.31 + 0.45), RIDGE + 1.3, 0); hall.add(sh); }
  // gable triangles (white) under roof2 on the short sides
  void gable;

  // ---------------------------------------------------------------- mist (dithered painted cards): low over the pond + between garden and hills
  api.mistMats = [];
  const mist = (pos, w, h, rotY, o) => { const m = mistMaterial(o); api.mistMats.push(m); const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.position.copy(pos); mesh.rotation.y = rotY; G.add(mesh); return mesh; };
  const pondMist = mist(V3(0, 0.12, -0.5), 18, 14, 0, { color: '#fff4ea', color2: '#ffe2cc', amount: 0.24, scale: 0.35 }); pondMist.rotation.x = -Math.PI / 2;
  mist(V3(0, 1.4, -24), 70, 5, 0, { color: '#fff0e6', color2: '#f2d8e6', amount: 0.85, scale: 0.08 });
  mist(V3(4, 2.6, -32), 90, 7, 0.05, { color: '#ffeedd', color2: '#ecd6ec', amount: 0.9, scale: 0.06 });
  mist(V3(-2, 0.9, -13.5), 30, 2.2, 0, { color: '#fff3e8', color2: '#f6e2e6', amount: 0.55, scale: 0.15 });

  // ---------------------------------------------------------------- cast shadows (low dawn sun from the north-east): the maples,
  // cedars and the temple throw long cool shadows toward the camera across the garden, lit gaps between them
  const SH = shadowCaster({ x0: -34, z0: -48, x1: 34, z1: 22, res: 0.3, sun: V3(0.7, 0.24, -1), tint: '#8c8ad2', amount: 0.62 });
  for (const k of crownDiscs) SH.disc(k.c, k.r.x * 1.05, k.r.z * 1.05, k.c.y - k.r.y * 1.1, k.c.y + k.r.y);
  for (const k of pcl) SH.disc(k.c, k.r.x, k.r.z, k.c.y - k.r.y * 1.3, k.c.y + k.r.y);
  for (const t of trunkParts) SH.part(t.geo, t.m);
  { hall.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(hall); SH.box(bb.min, bb.max); }
  SH.finish();
  for (const m of [groundM, rockM, stoneM, redM, woodM, goldM, barkM, plasterM, postM, darkWoodM, plat.material, shrubM]) SH.patch(m);
  SH.patch(tuftM, true);
  api.shadow = SH;
  // sunrise shafts: painted beams through the gaps in the maples, over the pond mist (main camera only)
  const shaftDir = V3(0.7, 0.3, -1).normalize();
  api.shafts = addShafts(G, [
    { at: V3(1.5, 0.2, 0.5), len: 34, w: 2.2, amt: 0.3 }, { at: V3(-2.0, 0.1, 2.5), len: 34, w: 1.4, amt: 0.24 }, { at: V3(3.8, 0.3, -2.5), len: 30, w: 1.8, amt: 0.3 },
    { at: V3(-4.5, 0.4, -1.5), len: 34, w: 2.6, amt: 0.22 }, { at: V3(0.2, 0.6, -6.5), len: 26, w: 1.6, amt: 0.26 }, { at: V3(-1.5, 0.3, 6), len: 34, w: 1.2, amt: 0.18 },
    { at: V3(5.5, 0.5, 3.5), len: 30, w: 2.0, amt: 0.13 },
  ].map((b) => ({ ...b, at: b.at.clone().addScaledVector(shaftDir, -3) })), shaftDir, { color: '#ffd49c', amount: 0.3 });

  // ---------------------------------------------------------------- floating maple leaves (drift on the surface, pure fn of t)
  const leafG = leafGeo(0.055);
  const leafCols = ['#e0402c', '#f06a2e', '#f29a35', '#c92a3a', '#e8b23e'];
  const leafMs = leafCols.map((cc) => A.celMaterial({ base: cc, id: A.ID.PROP, highlight: 0.3, hiSize: 0.94, side: THREE.DoubleSide }));
  const floaters = [];
  for (let i = 0; i < 38; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * 6.3;
    let x = Math.cos(a) * r * 1.18, z = Math.sin(a) * r * 0.86;
    if (pondD(x, z) > 0.9) { i--; continue; }
    const m = new THREE.Mesh(leafG, leafMs[i % leafMs.length]); m.scale.setScalar(0.7 + rng() * 0.6);
    floaters.push({ m, x, z, rot: rng() * TAU, sp: 0.02 + rng() * 0.03, dir: rng() * TAU, spin: (rng() - 0.5) * 0.2 });
    G.add(m);
  }
  api.makeLeaf = (color = '#e0402c', size = 0.055) => new THREE.Mesh(leafGeo(size), A.celMaterial({ base: color, id: A.ID.PROP, highlight: 0.3, hiSize: 0.94, side: THREE.DoubleSide }));

  // ---------------------------------------------------------------- stand-in water (only while dept WATER has no surface)
  const standIn = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), A.paintedMaterial({ color: '#8fb8b0', color2: '#c8d6c8', shade: '#6a7a9a', id: A.ID.WATER, varScale: 0.3, varAmt: 0.3, light: 0.3 }));
  standIn.visible = false; G.add(standIn);

  const mistBase = api.mistMats.map((m) => m.uniforms.uAmt.value);
  api.mist = (k = 1) => api.mistMats.forEach((m, i) => { m.uniforms.uAmt.value = mistBase[i] * k; });   // direction: 0 hides all mist
  function update(st) {
    const t = st.t;
    api.mist(st.q?.get?.('mist') ? parseFloat(st.q.get('mist')) : 1);
    standIn.visible = st.q?.get?.('standin') === '1';
    for (const m of api.mistMats) m.uniforms.uDrift.value = A.onThrees(t) * 0.05;
    const tt = A.onTwos(t);
    for (const f of floaters) {
      let x = f.x + Math.cos(f.dir) * f.sp * tt, z = f.z + Math.sin(f.dir) * f.sp * tt;
      f.m.position.set(x, 0.006 + Math.sin(tt * 1.3 + f.rot) * 0.002, z); f.m.rotation.set(0, f.rot + f.spin * tt, 0);
    }
  }
  return { update, api, terrainH, pondD };
}
