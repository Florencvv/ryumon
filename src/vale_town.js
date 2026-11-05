// vale_town.js - TOWN: an Edo-like canal town in late-afternoon gold. Water surface y = 0 (dept WATER).
// The canal (6 m wide, stone walls up to street level 1.5) runs along -z (upstream); three arched stone bridges cross it;
// past z = -130 it opens into a wide river through golden rice fields toward far mountains with a thin waterfall thread.
import { THREE, A, V3, TAU, lerp, clamp, sstep, mulb, fbm, vnoise, bake, M4, rockGeo, rockColor, taperTube, willowAtlas,
  groundMaterial, roofGeo, tileTex, heightMesh, noiseTex, canvasTex, mapleAtlas, mistMaterial, stoneWallTex, woodTex2, plasterTex, tileTex2,
  strandMaterial, strandMesh, shadowCaster, ashlarTex, boxUV } from './vale_lib.js';

export const cx = (z) => 1.4 * Math.sin(z * 0.022 + 0.3) + 0.6 * Math.sin(z * 0.061);
export const STREET = 1.1, HALF = 3.0, ZT0 = 24, ZT1 = -128;
// river half width beyond the town
export const rw = (z) => (z > ZT1 ? HALF : lerp(HALF, 15, sstep(ZT1, ZT1 - 45, z)) + 2 * Math.sin(z * 0.013));
export const TOWN = {
  sun: V3(-0.8, 0.14, -0.6).normalize(),   // = look.js TOWN sky disk
  bridges: [-14, -56, -96].map((z) => ({ z, x: cx(z), deck: 3.05, clear: 2.35 })),   // arch underside 2.35 above water at the centre
  catSeat: null, catFace: V3(1, 0, 0),
};
const BR_HALF = 1.6;   // bridge deck half width (z)
const nearBridge = (z, pad = 0) => TOWN.bridges.some((b) => Math.abs(z - b.z) < BR_HALF + pad);
const CAT_Z = -36;
TOWN.catSeat = V3(cx(CAT_Z) - HALF + 0.45, 0.42, CAT_Z);

export function buildTown(ctx, G) {
  const rng = mulb(3303), api = {};
  const sun = TOWN.sun;
  // sky: painted gold / sunset skies + cumulus in vale_sky.js (SKIES.TOWN, TOWN_HORIZON)
  const ico = new THREE.IcosahedronGeometry(1, 3);

  // ---------------------------------------------------------------- far mountains: three painted ranges + the waterfall thread
  // ridged spurs run toward the camera so every range shows warm lit faces (sun side, left) and violet-blue shade sides;
  // painted haze bands only at the feet of the mid + far ranges (the near hills stay crisp)
  const ridgeGeo = (o) => {
    const g = heightMesh(-o.W, o.W, o.zc - o.D, o.zc + o.D, o.nx, o.nz, (x, z) => {
      const dz = (z - o.zc) / o.D;
      let P = 0; for (const pk of o.peaks) P = Math.max(P, pk[1] * Math.exp(-(((x - pk[0]) / pk[2]) ** 2)));
      P = Math.max(P, o.base * (0.6 + 0.8 * fbm(x * 0.0007 + o.seed, o.seed, 3)));
      const sp = Math.pow(1 - Math.abs(2 * vnoise(x * o.spur + o.seed, z * o.spur * 0.22 + o.seed * 3) - 1), 1.6);   // ridged spurs (crests toward +z)
      const sp2 = 1 - Math.abs(2 * vnoise(x * o.spur * 2.7 + 5, z * o.spur * 0.6 + o.seed) - 1);
      const prof = Math.max(0, 1 - Math.pow(Math.abs(dz + 0.15 * Math.sin(x * 0.0011 + o.seed)), 1.25));
      return -40 + P * prof * (0.5 + 0.45 * sp + 0.12 * sp2);
    }, () => new THREE.Color(1, 1, 1));
    return g;
  };
  const RANGES = [
    // far: high, pale, hazy violet with soft rose lit faces
    { W: 10000, zc: -7600, D: 1500, nx: 300, nz: 34, base: 700, spur: 0.0026, seed: 11, peaks: [[-2600, 1500, 1500], [1200, 1300, 1300], [4200, 1600, 1600], [-5600, 1250, 1400]],
      color: '#eebcaa', color2: '#e2b0bc', shade: '#9c90c4', rim: '#ffdcb8', stroke: 0.5, haze: '#ecc0b8' },
    // mid: the main range with the waterfall massif, warm lit faces + violet-blue shade
    { W: 8000, zc: -4300, D: 1100, nx: 420, nz: 56, base: 300, spur: 0.0045, seed: 23, peaks: [[-60, 800, 520], [-1300, 560, 480], [1350, 620, 520], [2900, 500, 600], [-2900, 540, 700]],
      color: '#eeac88', color2: '#dc94a0', shade: '#46468a', rim: '#ffd89c', stroke: 0.7, haze: '#f0b49c' },
    // near: low forested foothills, olive-gold lit / blue shade, crisp
    { W: 4500, zc: -2150, D: 520, nx: 240, nz: 30, base: 150, spur: 0.004, seed: 37, peaks: [[-1400, 260, 500], [900, 230, 450], [2400, 200, 500], [-2800, 220, 600]],
      color: '#b4a25a', color2: '#8c9650', shade: '#4a5682', rim: '#ffd88a', stroke: 0.6 },
  ];
  const mtnSun = V3(-0.85, 0.5, -0.15).normalize();
  let mtn = null; api.mtnMats = [];
  RANGES.forEach((R, k) => {
    const m = A.paintedMaterial({ color: R.color, color2: R.color2, shade: R.shade, id: A.ID.PAINT, varScale: 0.002, varAmt: 0.45, dab: 0.25, stroke: R.stroke, strokeScale: 0.006,
      rim: 0.85, rimColor: R.rim, rimTop: 1, rimWidth: 0.32, bands: true, light: 1 });
    m.uniforms.uSunDir = { value: mtnSun.clone() }; api.mtnMats.push(m);
    const mesh = new THREE.Mesh(ridgeGeo(R), m); G.add(mesh);
    if (k === 1) { mtn = mesh; mtn.updateMatrixWorld(true); }
  });
  // painted haze bands at the feet of the far + mid ranges (soft, alpha-blended into the colour only)
  for (const [z, y, w, h, col, amt] of [[-6400, 100, 20000, 650, '#f0c0b4', 0.8], [-3400, 20, 14000, 300, '#f2b8a0', 0.6]]) {
    const mm = mistMaterial({ color: col, color2: col, amount: amt, scale: 0.0016 }); mm.uniforms.uScale.value = 0.0012;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mm); card.position.set(0, y + h * 0.3, z); G.add(card);
  }
  // waterfall: a thin white thread down a dark notch, glued to the main massif's face (raycast), mist at its foot
  const ray = new THREE.Raycaster(), FX = -80, strip = [];
  for (let y = 760; y >= 200; y -= 16) { ray.set(V3(FX, y, 2000), V3(0, 0, -1)); const h = ray.intersectObject(mtn, false)[0]; if (h) strip.push(h.point.clone()); }
  const ribbon = (pts, wd, dz) => {
    const pos = [], idx = [];
    pts.forEach((q, i) => { pos.push(q.x - wd / 2, q.y, q.z + dz, q.x + wd / 2, q.y, q.z + dz); if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const top = strip[0] ?? V3(FX, 900, -3500), bot = strip[strip.length - 1] ?? V3(FX, 300, -3200);
  if (strip.length > 1) {
    const notch = new THREE.Mesh(ribbon(strip, 30, 25), A.paintedMaterial({ color: '#4e4c80', color2: '#5e5690', id: A.ID.PAINT, light: 0, varScale: 0.02 })); notch.material.side = THREE.DoubleSide; G.add(notch);
    const thread = new THREE.Mesh(ribbon(strip, 11, 40), A.fxMaterial({ color: '#f8fbff', intensity: 1.25, bloom: 0.35 })); G.add(thread);
  }
  const fmist = new THREE.Mesh(bake([0, 1, 2, 3, 4].map((i) => ({ geo: ico, m: M4(V3(bot.x + (i - 2) * 18, bot.y + (i % 2) * 8, bot.z + 30), [0, 0, 0], [20, 13, 8]) }))), A.paintedMaterial({ color: '#f2eef8', color2: '#dcd8ee', id: A.ID.CLOUD, light: 0.3, varScale: 0.05 }));
  G.add(fmist);
  const fallTop = top, fallBot = bot;
  api.waterfall = { top: fallTop, bottom: fallBot };

  // ---------------------------------------------------------------- canal bed, walls, coping, streets, town ground
  const warpC = (o, z) => [o + cx(z), z];
  const groundM = groundMaterial({ dab: 0.55, shade: '#7a6a90', leaves: 0.012, leafA: '#d8582a', leafB: '#e8a83a' });
  groundM.uniforms.uSunDir = { value: V3(sun.x, 0.8, sun.z).normalize() };
  const cEarth = new THREE.Color('#d9bf94'), cEarth2 = new THREE.Color('#c4a880'), cStreet = new THREE.Color('#e2cfa6'), c = new THREE.Color();
  const townCol = (x, z, y) => { const o = Math.abs(x - cx(z)); c.copy(cEarth).lerp(cEarth2, sstep(0.35, 0.7, fbm(x * 0.15, z * 0.15, 3))); if (o < 6.6) c.lerp(cStreet, 0.6);
    const al = Math.min(...[13.2, 22.2, 31.2].map((a) => Math.abs(o - a))); if (al < 1.3) c.lerp(new THREE.Color('#c8b498'), 0.6);
    if (vnoise(x * 0.08 + 3, z * 0.08) > 0.72 && o > 8) c.lerp(new THREE.Color('#8e9a58'), 0.55); return c; };
  for (const sd of [-1, 1]) {
    const g = heightMesh(sd < 0 ? -42 : HALF, sd < 0 ? -HALF : 42, ZT1, ZT0 + 20, 60, 180, () => STREET, townCol, warpC);
    G.add(new THREE.Mesh(g, groundM));
  }
  const bedCol = () => c.set('#8a8c74');
  G.add(new THREE.Mesh(heightMesh(-HALF - 0.05, HALF + 0.05, ZT1 - 4, ZT0 + 20, 12, 160, (x, z) => -1.0 - 0.25 * Math.cos((x - cx(z)) / HALF * 1.5), bedCol, warpC), groundM));
  // walls: vertical stone faces: painted block courses with ink joints, moss, water stains, wet band at the waterline
  const wallTex = stoneWallTex({ seed: 17 });
  const wallM = A.celMaterial({ base: '#ffffff', shade: '#8a8aa8', map: wallTex, id: A.ID.PROP, highlight: 0.08, rimColor: '#ffd8a0', side: THREE.DoubleSide });
  const wallG = (sd) => {
    const pos = [], uv = [], idx = []; let n = 0;
    for (let z = ZT0 + 18; z >= ZT1 - 2; z -= 1) {
      const x = cx(z) + sd * HALF;
      pos.push(x, -1.4, z, x, STREET, z); const u = -z / 16 + (sd > 0 ? 0.37 : 0); uv.push(u, 0, u, (STREET + 1.4) / 2.5);
      if (n) { const a = (n - 1) * 2; if (sd < 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      n++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  G.add(new THREE.Mesh(wallG(-1), wallM), new THREE.Mesh(wallG(1), wallM));
  // coping stones (individual slabs so the ink draws the joints), mooring posts, stairs down to the water
  const stoneM = A.celMaterial({ base: '#ffffff', shade: '#9896b2', vertexColors: true, map: ashlarTex({ seed: 41, rows: 2 }), id: A.ID.PROP, highlight: 0.15, rimColor: '#ffd8a0', rimWidth: 0.2 });
  const cop = [], cStone = new THREE.Color('#cfc6bc');
  for (const sd of [-1, 1]) for (let z = ZT0 + 18; z > ZT1 - 1; ) {
    const L = 0.9 + rng() * 0.7;
    if (!nearBridge(z - L / 2, 0.2)) {
      const zc = z - L / 2, x = cx(zc) + sd * (HALF + 0.22), ang = Math.atan2(cx(z) - cx(z - L), L);
      cop.push({ geo: boxUV(new THREE.BoxGeometry(0.5, 0.18, L - 0.04, 1, 1, 1), 0.5, 0.18, L - 0.04), m: M4(V3(x, STREET + 0.06, zc), [0, ang, 0]), color: cStone.clone().multiplyScalar(0.88 + rng() * 0.14) });
    }
    z -= L;
  }
  // stairs (cat's landing on the left bank + two more)
  const stairs = (z, sd, w = 1.3) => {
    const x0 = cx(z) + sd * HALF;
    for (let k = 0; k < 6; k++) { const y = STREET - (k + 1) * 0.19; cop.push({ geo: boxUV(new THREE.BoxGeometry(0.42, 0.19, w), 0.42, 0.19, w), m: M4(V3(x0 - sd * (0.2 + k * 0.0), y + 0.095, z - k * 0.34 + 0.9), [0, 0, 0]), color: cStone.clone().multiplyScalar(0.9 + rng() * 0.1) }); }
  };
  // cat landing: a stone ledge just above the water along the left wall, reached by steps
  const lz = CAT_Z, lx = cx(lz) - HALF;
  cop.push({ geo: boxUV(new THREE.BoxGeometry(0.95, 0.42, 3.2), 0.95, 0.42, 3.2), m: M4(V3(lx + 0.47, 0.21, lz)), color: cStone.clone().multiplyScalar(0.92) });
  for (let k = 0; k < 6; k++) cop.push({ geo: boxUV(new THREE.BoxGeometry(0.9, 0.2, 0.36), 0.9, 0.2, 0.36), m: M4(V3(lx + 0.45, 0.42 + (k + 0.5) * 0.18, lz - 1.8 - k * 0.36)), color: cStone.clone().multiplyScalar(0.88 + rng() * 0.12) });
  stairs(-74, 1); stairs(6, 1); stairs(-24, 1); stairs(-86, -1); stairs(-116, 1);
  // mooring rings (iron) on the wall faces + wooden mooring posts on the coping
  const iron = [];
  for (let z = ZT0 + 10, k = 0; z > ZT1 + 4; z -= 9 + rng() * 6, k++) {
    if (nearBridge(z, 1.5) || Math.abs(z - CAT_Z) < 3) continue;
    const sd = k % 2 ? 1 : -1, x = cx(z) + sd * (HALF - 0.03), y = 0.55 + rng() * 0.3;
    iron.push({ geo: new THREE.TorusGeometry(0.11, 0.022, 6, 14), m: M4(V3(x - sd * 0.02, y - 0.1, z), [0, Math.PI / 2, 0]), color: new THREE.Color('#3a3440') });
    iron.push({ geo: new THREE.BoxGeometry(0.05, 0.08, 0.1), m: M4(V3(x - sd * 0.02, y + 0.02, z)), color: new THREE.Color('#2e2a34') });
    if (rng() < 0.5) iron.push({ geo: new THREE.CylinderGeometry(0.07, 0.08, 0.7, 8), m: M4(V3(cx(z) + sd * (HALF + 0.5), STREET + 0.35, z + 0.6)), color: new THREE.Color('#6a5244') });
  }
  G.add(new THREE.Mesh(bake(cop), stoneM), new THREE.Mesh(bake(iron), stoneM));
  // river ends of the walls: stone block corner piers
  // ---------------------------------------------------------------- bridges: segmental stone arch, parapets, end posts
  const brM = A.celMaterial({ base: '#ffffff', shade: '#908ca8', map: ashlarTex({ seed: 23 }), id: A.ID.PROP, highlight: 0.15, rimColor: '#ffd8a0', rimWidth: 0.22 });
  const brParts = [], postParts = [];
  for (const b of TOWN.bridges) {
    const span = HALF * 2 + 4.2, deckY = (u) => STREET + (b.deck - STREET) * Math.sin(Math.PI * clamp(u, 0, 1)) ** 0.8;
    const sh = new THREE.Shape(), N = 24;
    for (let i = 0; i <= N; i++) { const u = i / N, xx = -span / 2 + span * u; if (i === 0) sh.moveTo(xx, deckY(u)); else sh.lineTo(xx, deckY(u)); }
    sh.lineTo(span / 2, -1.2); sh.lineTo(HALF + 0.02, -1.2);
    const R = 3.35, yc = b.clear - R;   // segmental arch opening through the body
    for (let i = 0; i <= 24; i++) { const a = Math.acos(clamp((HALF) / R, -1, 1)) + (Math.PI - 2 * Math.acos(clamp(HALF / R, -1, 1))) * (i / 24); const xx = Math.cos(a) * R, yy = yc + Math.sin(a) * R; sh.lineTo(xx, Math.max(yy, -1.2)); }
    sh.lineTo(-HALF - 0.02, -1.2); sh.lineTo(-span / 2, -1.2); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: BR_HALF * 2, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -BR_HALF);
    brParts.push({ geo: g, m: M4(V3(b.x, 0, b.z)) });
    // voussoir ring: drawn stones around the arch
    for (let i = 0; i < 15; i++) { const a = Math.acos(HALF / R) + (Math.PI - 2 * Math.acos(HALF / R)) * ((i + 0.5) / 15); const xx = Math.cos(a) * (R + 0.18), yy = yc + Math.sin(a) * (R + 0.18);
      for (const sd of [-1, 1]) postParts.push({ geo: new THREE.BoxGeometry(0.3, 0.42, 0.08), m: M4(V3(b.x + xx, yy, b.z + sd * (BR_HALF + 0.06)), [0, 0, a - Math.PI / 2]), color: cStone.clone().multiplyScalar(0.78 + rng() * 0.12) }); }
    // parapets following the deck
    for (const sd of [-1, 1]) {
      const ps = new THREE.Shape();
      for (let i = 0; i <= N; i++) { const u = i / N, xx = -span / 2 + 0.6 + (span - 1.2) * u, uu = (xx + span / 2) / span; if (i === 0) ps.moveTo(xx, deckY(uu) + 0.55); else ps.lineTo(xx, deckY(uu) + 0.55); }
      for (let i = N; i >= 0; i--) { const u = i / N, xx = -span / 2 + 0.6 + (span - 1.2) * u, uu = (xx + span / 2) / span; ps.lineTo(xx, deckY(uu) - 0.02); }
      const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.24, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
      pg.translate(0, 0, -0.12); brParts.push({ geo: pg, m: M4(V3(b.x, 0, b.z + sd * (BR_HALF - 0.14))) });
      for (const ex of [-1, 1]) { const xx = ex * (span / 2 - 0.55); postParts.push({ geo: new THREE.BoxGeometry(0.34, 0.95, 0.34), m: M4(V3(b.x + xx, STREET + 0.47, b.z + sd * (BR_HALF - 0.14))), color: cStone.clone().multiplyScalar(0.92) }); postParts.push({ geo: new THREE.ConeGeometry(0.26, 0.22, 4), m: M4(V3(b.x + xx, STREET + 1.05, b.z + sd * (BR_HALF - 0.14)), [0, Math.PI / 4, 0]), color: cStone.clone().multiplyScalar(0.92) }); }
    }
  }
  G.add(new THREE.Mesh(bake(brParts), brM), new THREE.Mesh(bake(postParts), stoneM));

  // ---------------------------------------------------------------- houses (machiya rows + kura), seeded, no two alike
  const woodTex = woodTex2({ seed: 31 });
  const darkM = A.celMaterial({ base: '#ffffff', shade: '#6e6a8c', vertexColors: true, map: woodTex, id: A.ID.PROP, highlight: 0.1, rimColor: '#ffcf90', rimWidth: 0.2 });
  const plasterM = A.celMaterial({ base: '#ffffff', shade: '#a8a6c2', vertexColors: true, map: plasterTex({ seed: 61 }), id: A.ID.PROP, highlight: 0.08, rimColor: '#ffe0b0', rimWidth: 0.2 });
  const roofM = A.celMaterial({ base: '#ffffff', shade: '#5e6288', vertexColors: true, map: tileTex2(), id: A.ID.PROP, highlight: 0.45, hiSize: 0.93, rimColor: '#ffd9a0', rimWidth: 0.2, side: THREE.DoubleSide, wobble: 0.15 });
  const clothM = A.celMaterial({ base: '#ffffff', shade: '#a6a2cc', vertexColors: true, id: A.ID.PROP, highlight: 0.1, rimColor: '#ffe6c0', rimWidth: 0.25, side: THREE.DoubleSide });
  const potM = A.paintedMaterial({ color: '#5e8a46', color2: '#9cb44e', shade: '#3e4e6e', vertexColors: true, id: A.ID.FOLIAGE, varScale: 2.2, varAmt: 0.45, dab: 0.4, bands: true, rim: 0.6, rimColor: '#f0f0a0' });
  potM.uniforms.uSunDir = { value: V3(sun.x, 0.9, sun.z).normalize() };
  const P = { dark: [], plaster: [], roof: [], cloth: [], lamp: [], green: [] };
  const CLOTH = ['#f6f2ea', '#3a4c86', '#f0d6d0', '#e0b65a', '#bcd4e6', '#f6f2ea', '#8a4a3e'];
  const woodCols = ['#7a5444', '#6a4a3e', '#8a6248', '#5e4440', '#94704e'], plCols = ['#f4ecdc', '#efe4d0', '#f6efe4', '#e9dcc6'], rfCols = ['#8e94aa', '#7c8298', '#9a9aac', '#848aa4', '#a29c9c', '#8a7468', '#6e6a80', '#5e6274', '#9a8070'];
  const NOREN = [['湯', '#2f4a8a'], ['茶', '#5a6a3a'], ['酒', '#2a3050'], ['宿', '#8a3a2e'], ['', '#3a4a7a'], ['', '#7a3040']];
  const norenTex = NOREN.map(([ch, bg]) => canvasTex(256, 192, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 1; i < 4; i++) x.fillRect(i * w / 4 - 2, h * 0.32, 4, h);   // slits
    if (ch) { x.fillStyle = '#f6efe2'; x.font = `bold ${h * 0.5}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, w / 2, h * 0.52); }
    else { x.strokeStyle = '#f6efe2'; x.lineWidth = 6; x.beginPath(); x.arc(w / 2, h * 0.5, h * 0.2, 0, TAU); x.stroke(); }
  }, { clamp: true }));
  const norenM = norenTex.map((t) => A.celMaterial({ base: '#ffffff', shade: '#9a9ac0', map: t, id: A.ID.PROP, highlight: 0, side: THREE.DoubleSide }));
  const norenParts = norenM.map(() => []);
  const lampRed = A.celMaterial({ base: '#e8483a', shade: '#a83048', id: A.ID.PROP, highlight: 0.3, emissive: '#ff6a40', emissiveAmt: 0.35 });
  const lampWhite = A.celMaterial({ base: '#fff4dc', shade: '#d8b8a8', id: A.ID.PROP, highlight: 0.3, emissive: '#ffcf80', emissiveAmt: 0.45 });
  const lampParts = { red: [], white: [] };
  const lampG = (() => { const g = new THREE.SphereGeometry(0.2, 14, 10); g.scale(1, 1.35, 1); return g; })();
  api.lanterns = [];
  // house(x, z, facing sd (-1 = faces +x), w (along z), d (depth), floors, kind, detail)
  function house(xf, zc, sd, w, d, floors, kind, detail) {
    const r = mulb(Math.floor(zc * 97 + xf * 13) + 7), ang = Math.atan2(cx(zc + 1) - cx(zc - 1), 2);
    const T = (lx, ly, lz) => V3(xf + sd * lx, ly, zc + lz);   // local: lx metres back from the facade (away from the canal), lz along the street
    const wc = new THREE.Color(woodCols[Math.floor(r() * woodCols.length)]), pc = new THREE.Color(plCols[Math.floor(r() * plCols.length)]), rc = new THREE.Color(rfCols[Math.floor(r() * rfCols.length)]).multiplyScalar(0.92 + r() * 0.12);
    const H1 = 2.5 + r() * 0.7, H2 = floors > 1 ? 1.9 + r() * 1.0 : 0, Ht = STREET + H1 + H2;
    const box = (list, sx, sy, sz, lx, ly, lz, col, rot = 0) => list.push({ geo: new THREE.BoxGeometry(sx, sy, sz), m: M4(T(lx, ly, lz), [0, ang + rot, 0]), color: col });
    if (kind === 'kura') {   // storehouse: white plaster, dark tiled base, small window
      box(P.plaster, d, H1 + H2, w, d / 2, STREET + (H1 + H2) / 2, 0, pc);
      box(P.dark, d + 0.06, 1.0, w + 0.06, d / 2, STREET + 0.5, 0, new THREE.Color('#4e4a5e'));
      if (detail) box(P.dark, 0.1, 0.7, 0.8, -0.02, STREET + H1 + H2 * 0.4, (r() - 0.5) * w * 0.4, new THREE.Color('#3a3040'));
    } else {
      box(P.dark, d, H1, w, d / 2 + 0.25, STREET + H1 / 2, 0, wc);                              // ground floor body
      if (floors > 1) box(P.plaster, d - 1.0, H2, w - 0.1, d / 2 + 0.7, STREET + H1 + H2 / 2, 0, pc);
      if (detail) {
        // koshi lattice: vertical slats over most of the front, a door bay with noren
        const door = (r() - 0.5) * w * 0.4, doorW = 1.4;
        for (let k = 0; k < Math.floor(w / 0.12); k++) { const lz = -w / 2 + 0.1 + k * 0.12; if (Math.abs(lz - door) < doorW / 2) continue; box(P.dark, 0.06, H1 - 0.6, 0.04, 0.2, STREET + (H1 - 0.6) / 2 + 0.25, lz, wc.clone().multiplyScalar(0.7)); }
        box(P.dark, 0.1, 0.12, w, 0.18, STREET + H1 - 0.3, 0, wc.clone().multiplyScalar(0.6));
        box(P.dark, 0.1, 0.25, w, 0.18, STREET + 0.12, 0, wc.clone().multiplyScalar(0.55));
        box(P.dark, 0.05, H1 - 0.5, doorW, 0.3, STREET + (H1 - 0.5) / 2, door, new THREE.Color('#2e2530'));   // dark doorway
        const ni = Math.floor(r() * NOREN.length);
        norenParts[ni].push({ geo: new THREE.PlaneGeometry(doorW * 0.95, 1.0), m: M4(T(0.02, STREET + H1 - 0.95, door), [0, ang - sd * Math.PI / 2, 0]) });
        if (r() < 0.75) { const lr = r() < 0.5 ? 'red' : 'white', p = T(-0.35, STREET + H1 - 0.55, door + (doorW / 2 + 0.35) * (r() < 0.5 ? 1 : -1)); lampParts[lr].push({ geo: lampG, m: M4(p) }); api.lanterns.push(p);
          P.dark.push({ geo: new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10), m: M4(p.clone().add(V3(0, 0.29, 0))), color: new THREE.Color('#2a2228') }, { geo: new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10), m: M4(p.clone().add(V3(0, -0.29, 0))), color: new THREE.Color('#2a2228') }); }
        if (floors > 1) {   // mushiko window: dark opening with white vertical bars
          const ww = Math.min(w * 0.55, 2.4); box(P.dark, 0.06, 0.65, ww, 0.68, STREET + H1 + H2 * 0.5, (r() - 0.5) * 0.6, new THREE.Color('#3a2e34'));
          for (let k = 0; k < Math.floor(ww / 0.22); k++) box(P.plaster, 0.08, 0.6, 0.07, 0.64, STREET + H1 + H2 * 0.5, -ww / 2 + 0.15 + k * 0.22, pc);
        }
        // pent roof over the ground floor front
        const pent = new THREE.PlaneGeometry(w + 0.3, 1.25, 4, 2); pent.rotateX(-Math.PI / 2 + 0.42);
        { const uv = pent.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w + 0.3), uv.getY(k) * 1.25); }
        // potted plants by the door, planters on the upper sill, laundry on a bamboo pole
        if (r() < 0.55) for (let k = 0; k < 1 + Math.floor(r() * 3); k++) {
          const lz = door + (doorW / 2 + 0.35 + k * 0.45) * (r() < 0.5 ? 1 : -1), ps = 0.16 + r() * 0.1;
          P.dark.push({ geo: new THREE.CylinderGeometry(ps, ps * 0.75, ps * 1.6, 10), m: M4(T(-0.3, STREET + ps * 0.8, lz)), color: new THREE.Color(r() < 0.5 ? '#9a5a40' : '#4a4a5e') });
          for (let j = 0; j < 4; j++) P.green.push({ geo: new THREE.IcosahedronGeometry(1, 1), m: M4(T(-0.3 + (r() - 0.5) * ps, STREET + ps * 1.7 + r() * ps * 1.2, lz + (r() - 0.5) * ps * 1.4), [0, r() * 6, 0], ps * (0.7 + r() * 0.5)) });
        }
        if (floors > 1 && r() < 0.35) {   // planter box with trailing greens on the upper sill
          const lz = (r() - 0.5) * w * 0.4, pw = 0.8 + r() * 0.6;
          P.dark.push({ geo: new THREE.BoxGeometry(0.28, 0.22, pw), m: M4(T(1.0, STREET + H1 + H2 * 0.3, lz), [0, ang, 0]), color: wc.clone().multiplyScalar(0.8) });
          for (let j = 0; j < 6; j++) P.green.push({ geo: new THREE.IcosahedronGeometry(1, 1), m: M4(T(0.95, STREET + H1 + H2 * 0.3 + 0.1 - r() * 0.35, lz + (r() - 0.5) * pw), [0, r() * 6, 0], [0.14 + r() * 0.08, 0.2 + r() * 0.15, 0.14 + r() * 0.08]) });
        }
        if (floors > 1 && r() < 0.4) {   // laundry
          const pl = Math.min(w * 0.75, 3.6), py = STREET + H1 + H2 * 0.82, lz0 = (r() - 0.5) * (w - pl) * 0.5;
          P.dark.push({ geo: new THREE.CylinderGeometry(0.025, 0.025, pl, 6), m: M4(T(0.75, py, lz0), [Math.PI / 2, ang, 0]), color: new THREE.Color('#b8a070') });
          let lz = lz0 - pl / 2 + 0.15;
          while (lz < lz0 + pl / 2 - 0.4) {
            const cw = 0.35 + r() * 0.45, ch = 0.45 + r() * 0.55, col = new THREE.Color(CLOTH[Math.floor(r() * CLOTH.length)]);
            const g = new THREE.PlaneGeometry(cw, ch, 2, 3); const gp = g.attributes.position; for (let k = 0; k < gp.count; k++) gp.setZ(k, Math.sin(gp.getX(k) * 6 + gp.getY(k) * 3) * 0.03);
            g.computeVertexNormals();
            P.cloth.push({ geo: g, m: M4(T(0.75, py - ch / 2 - 0.02, lz + cw / 2), [0, ang - sd * Math.PI / 2 + (r() - 0.5) * 0.15, (r() - 0.5) * 0.06]), color: col });
            lz += cw + 0.08 + r() * 0.15;
          }
        }
        P.roof.push({ geo: pent, m: M4(T(-0.05, STREET + H1 + 0.02, 0), [0, ang + (sd > 0 ? Math.PI / 2 : -Math.PI / 2), 0]), color: rc });
      }
    }
    // main roof (gable, ridge along the street), upturned slightly at the eaves
    const rg = roofGeo({ L: w, D: d + (floors > 1 ? -0.9 : 0.4), rise: 1.1 + d * 0.13, over: 0.55, up: 0.12, sag: 0.18, ridge: w + 1.1, segU: 8, segV: 5 });
    P.roof.push({ geo: rg, m: M4(T(d / 2 + (floors > 1 ? 0.7 : 0.25), Ht + 1.1 + d * 0.13 + 0.05, 0), [0, ang + Math.PI / 2, 0]), color: rc });
    // ridge cap + gable-end plaster triangles
    P.roof.push({ geo: new THREE.BoxGeometry(0.28, 0.24, w + 1.1), m: M4(T(d / 2 + (floors > 1 ? 0.7 : 0.25), Ht + 1.1 + d * 0.13 + 0.12, 0), [0, ang, 0]), color: rc.clone().multiplyScalar(0.7) });
  }
  const gardens = [], gtrunks = [];
  // front rows facing the canal (skip bridge landings), back rows for the aerial shots
  for (const sd of [-1, 1]) {
    let z = ZT0 + 14;
    while (z > ZT1 + 2) {
      const w = 4 + rng() * 3.2, zc = z - w / 2;
      if (nearBridge(zc, w / 2 + 0.6) || (sd < 0 && Math.abs(zc - CAT_Z) < 0.1)) { z -= 1.5; continue; }
      const kind = rng() < 0.12 ? 'kura' : 'machiya';
      house(cx(zc) + sd * (HALF + 3.4), zc, sd, w - 0.08, 6.5 + rng() * 2, rng() < 0.7 ? 2 : 1, kind, true);
      z -= w + (rng() < 0.15 ? 1.2 : 0);
    }
    for (const off of [15.5, 24.5, 33.5]) {   // back rows (alleys between), simpler, rotated to face alleys
      let z2 = ZT0 + 10 + rng() * 4;
      while (z2 > ZT1 + 4) {
        const w = 4.5 + rng() * 3.5, zc = z2 - w / 2;
        if (rng() < 0.13) {   // a garden plot: a tree (or two) instead of a house
          const gx = cx(zc) + sd * (off + 1), n = 1 + Math.floor(rng() * 2);
          for (let k = 0; k < n; k++) { const tx = gx + (rng() - 0.5) * 3, tz = zc + (rng() - 0.5) * w * 0.6, s = 1.6 + rng() * 1.2; gardens.push({ c: V3(tx, STREET + 2.4 + s, tz), r: V3(s, s * 0.8, s), n: 22, kind: Math.floor(rng() * 3) }); gtrunks.push({ geo: taperTube([V3(tx, STREET, tz), V3(tx + 0.2, STREET + 2.6 + s * 0.5, tz)], 0.16, 0.08, 7, 4) }); }
          z2 -= w; continue;
        }
        house(cx(zc) + sd * (off + (rng() - 0.5) * 0.8), zc, sd, w - 0.1, 6 + rng() * 2.5, rng() < 0.5 ? 2 : 1, rng() < 0.15 ? 'kura' : 'machiya', off < 20 && rng() < 0.3);
        z2 -= w + (rng() < 0.2 ? 1.5 + rng() * 2 : 0.05);
      }
    }
  }
  G.add(new THREE.Mesh(bake(P.dark), darkM), new THREE.Mesh(bake(P.plaster), plasterM), new THREE.Mesh(bake(P.roof), roofM), new THREE.Mesh(bake(P.cloth), clothM));
  if (P.green.length) G.add(new THREE.Mesh(bake(P.green.map((g) => ({ ...g, color: new THREE.Color().setHSL(0.24 + rng() * 0.08, 0.45, 0.42 + rng() * 0.15) }))), potM));
  {
    const gm = [['#3a4a50', '#5e7a44', '#a8b050', '#f0e8a0'], ['#5a2a3a', '#b8402e', '#f07a38', '#ffd080'], ['#4a3a40', '#a8702e', '#e8b444', '#fff0a0']]
      .map((ramp, i) => A.cardMaterial({ map: mapleAtlas({ seed: 81 + i }), cells: 4, ramp, alt: '#ffb080', altAmt: 0.4, ink: '#2a1e24', texW: 0.5, sway: 0.02 }));
    for (let k = 0; k < 3; k++) { const cl = gardens.filter((g) => g.kind === k); if (cl.length) G.add(A.cardInstances(gm[k], A.foliageItems(rng, cl, { sun: V3(sun.x, 1, sun.z), size: 0.8 }), { base: false })); }
    if (gtrunks.length) G.add(new THREE.Mesh(bake(gtrunks), A.celMaterial({ base: '#7a6458', shade: '#4a3e58', id: A.ID.PROP, highlight: 0.1 })));
  }
  norenParts.forEach((ps, i) => { if (ps.length) G.add(new THREE.Mesh(bake(ps), norenM[i])); });
  if (lampParts.red.length) G.add(new THREE.Mesh(bake(lampParts.red), lampRed));
  if (lampParts.white.length) G.add(new THREE.Mesh(bake(lampParts.white), lampWhite));

  // street lanterns (stone) + willows along the canal
  const barkM = A.celMaterial({ base: '#7a6a5a', shade: '#4a3e58', map: A.barkTexture({ seed: 12 }), id: A.ID.PROP, highlight: 0.1, rimColor: '#ffcf90' });
  // willows: a curtain of long thin drooping leafy strands (ribbons) from each branch, lit tips, swaying on twos; a light
  // crown of leaf cards at the top only
  const wilM = strandMaterial({ ramp: ['#2a4636', '#557f42', '#a2be56', '#eeeea0'], alt: '#ffd070', ink: '#1c3020' });
  const crownM = A.cardMaterial({ map: mapleAtlas({ seed: 61 }), cells: 4, ramp: ['#33523c', '#628a46', '#a8bc5a', '#ecea9c'], alt: '#ffd070', altAmt: 0.4, ink: '#24361e', texW: 0.5, sway: 0.03 });
  const trunks = [], strands = [], crowns = [];
  const sunH = V3(sun.x, 0, sun.z).normalize(), wClumps = [];
  api.willows = [];
  const willowZ = [16, 2, -24, -44, -66, -84, -106, -118];
  willowZ.forEach((z, i) => {
    const sd = i % 2 ? 1 : -1, x = cx(z) + sd * (HALF + 0.9), base = V3(x, STREET - 0.1, z), r = mulb(i * 31 + 5);
    if (Math.abs(z - CAT_Z) < 4) return;
    const top = V3(x - sd * 1.3, STREET + 4.2 + r() * 1.4, z + (r() - 0.5));
    trunks.push({ geo: taperTube([base, V3(x - sd * 0.3, STREET + 2, z), top], 0.26, 0.12, 9, 10, { wob: 0.2 }) });
    const clumps = [];
    const nb = 6 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) {
      const a = k / nb * TAU + r(), rr = 1.3 + r() * 1.4, p = V3(top.x + Math.cos(a) * rr - sd * 0.8, top.y + 0.1 + r() * 0.9, top.z + Math.sin(a) * rr);
      trunks.push({ geo: taperTube([top, top.clone().lerp(p, 0.5).add(V3(0, 0.45, 0)), p], 0.08, 0.03, 6, 6) });
      clumps.push({ c: p.clone().add(V3(0, 0.25, 0)), r: V3(0.75, 0.32, 0.75), n: 4 });
      const ns = 34 + Math.floor(r() * 12);
      for (let j = 0; j < ns; j++) {
        let sx = p.x + (r() - 0.5) * 1.5; const sz = p.z + (r() - 0.5) * 1.5, sy = p.y + (r() - 0.3) * 0.5;
        if (Math.abs(sx - cx(sz)) < HALF - 1.2) sx = cx(sz) + sd * (HALF - 1.2 + r() * 0.4);   // keep the canal centre clear for the camera
        const overW = Math.abs(sx - cx(sz)) < HALF;
        const floor = overW ? 0.3 + r() * 0.6 : STREET + 0.35 + r() * 0.8;
        const L = lerp(1.0 + r(), sy - floor, Math.pow(r(), 0.55));
        const o = V3(sx - top.x, 0, sz - top.z).normalize(), dr = 0.25 + r() * 0.35;
        const pts = [V3(sx, sy, sz), V3(sx + o.x * dr, sy + 0.12, sz + o.z * dr), V3(sx + o.x * dr * 1.5, sy - L * 0.3, sz + o.z * dr * 1.5),
          V3(sx + o.x * dr * 1.75 + (r() - 0.5) * 0.1, sy - L * 0.68, sz + o.z * dr * 1.75), V3(sx + o.x * dr * 1.85 + (r() - 0.5) * 0.15, sy - L, sz + o.z * dr * 1.85 + (r() - 0.5) * 0.1)];
        const yaw = (r() < 0.75 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.9;
        strands.push({ pts, len: L, w0: 0.09 + r() * 0.04, w1: 0.2 + r() * 0.1, axis: V3(Math.cos(yaw), 0, Math.sin(yaw)),
          light: clamp(0.42 + o.dot(sunH) * 0.25 + (sy - top.y) * 0.08 + (r() - 0.5) * 0.25, 0.1, 0.95), hue: r() < 0.25 ? 0.35 : 0, phase: r() * TAU + i });
      }
    }
    crowns.push(...A.foliageItems(r, clumps, { sun: V3(sun.x, 1, sun.z), size: 0.7 })); wClumps.push(...clumps.map((c) => ({ c: c.c, r: 1.6 })));
    api.willows.push(base);
  });
  const willowMesh = strandMesh(strands, wilM);
  G.add(new THREE.Mesh(bake(trunks), barkM), willowMesh, A.cardInstances(crownM, crowns, { base: false }));
  // stone street lanterns (tall kasuga style) by the bridges
  const lp = [], lc = rockColor({ stone: '#c8c0b8', stone2: '#a8a2a8', mossAmt: 0.25 });
  for (const b of TOWN.bridges) for (const sd of [-1, 1]) {
    const x = cx(b.z + 3.2) + sd * (HALF + 0.9), z = b.z + (sd > 0 ? 3.2 : -3.2), y = STREET;
    lp.push({ geo: new THREE.CylinderGeometry(0.25, 0.3, 0.2, 6), m: M4(V3(x, y + 0.1, z)), color: lc }, { geo: new THREE.CylinderGeometry(0.09, 0.11, 1.2, 10), m: M4(V3(x, y + 0.8, z)), color: lc },
      { geo: new THREE.CylinderGeometry(0.24, 0.18, 0.12, 6), m: M4(V3(x, y + 1.45, z)), color: lc }, { geo: new THREE.CylinderGeometry(0.16, 0.16, 0.34, 6), m: M4(V3(x, y + 1.68, z)), color: lc },
      { geo: new THREE.ConeGeometry(0.36, 0.26, 6), m: M4(V3(x, y + 1.98, z)), color: lc }, { geo: new THREE.SphereGeometry(0.06, 8, 6), m: M4(V3(x, y + 2.15, z)), color: lc });
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.22, 6, 1, true), A.fxMaterial({ color: '#ffd08a', intensity: 1.2, bloom: 0.8 })); gl.position.set(x, y + 1.68, z); G.add(gl);
  }
  G.add(new THREE.Mesh(bake(lp), stoneM));
  // a moored boat by the second stairs
  const boatM = A.celMaterial({ base: '#9a7656', shade: '#5a4660', id: A.ID.PROP, highlight: 0.15, map: woodTex });
  const hull = new THREE.SphereGeometry(1, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2); hull.scale(0.75, 0.35, 2.6);
  const boat = new THREE.Mesh(bake([{ geo: hull, m: M4(V3(0, 0.12, 0)) }, { geo: new THREE.BoxGeometry(1.3, 0.06, 0.25), m: M4(V3(0, 0.08, 0.8)) }, { geo: new THREE.BoxGeometry(1.3, 0.06, 0.25), m: M4(V3(0, 0.08, -0.8)) }]), boatM);
  boat.position.set(cx(-74) + HALF - 1.0, 0, -71.5); boat.rotation.y = 0.04; G.add(boat);

  // ---------------------------------------------------------------- the river beyond the town: banks, golden fields, farms, tree lines
  const fieldH = (x, z) => {
    const o = Math.abs(x - cx(z)), W = rw(z);
    const land = lerp(STREET, 0.7, sstep(ZT1, ZT1 - 60, z)) + (fbm(x * 0.01, z * 0.01, 3) - 0.5) * 1.5 + sstep(400, 900, o) * 40;
    if (o < W) return -1.2 - 0.4 * (1 - o / W);
    return lerp(-0.4, land, sstep(W, W + 3.5, o));
  };
  const cGold = new THREE.Color('#e6c260'), cGold2 = new THREE.Color('#c9a24c'), cGrass = new THREE.Color('#9aa54e'), cBank2 = new THREE.Color('#a49a6a');
  const fieldCol = (x, z, y) => {
    const o = Math.abs(x - cx(z)), W = rw(z);
    if (o < W + 0.2) return c.set('#8c8a70');
    if (o < W + 5) return c.copy(cBank2).lerp(cGrass, sstep(W + 1, W + 4, o));
    const px = Math.floor((x - cx(z)) / 22), pz = Math.floor(z / 16), hsh = vnoise(px * 3.1 + 0.5, pz * 2.7 + 0.5);
    c.copy(cGold).lerp(cGold2, hsh).lerp(cGrass, hsh > 0.78 ? 0.7 : 0);
    if (o > 380) c.lerp(new THREE.Color('#7f9060'), sstep(380, 700, o));
    return c;
  };
  const fG = heightMesh(-900, 900, -1600, ZT1 + 2, 220, 260, fieldH, fieldCol, (o, z) => {
    // denser near the river: remap the offset
    const s = Math.sign(o), a = Math.abs(o) / 900; return [cx(z) + s * 900 * Math.pow(a, 2.2), z]; });
  const fM = groundMaterial({ dab: 0.6, shade: '#8a76a0' });
  fM.uniforms.uSunDir = { value: V3(sun.x, 0.75, sun.z).normalize() };
  G.add(new THREE.Mesh(fG, fM));
  // paddy levees (thin raised grass ridges) + drying racks with golden sheaves near the river
  const lev = [], racks = [];
  for (let z = ZT1 - 6; z > -700; z -= 16) for (const sd of [-1, 1]) {
    const W = rw(z);
    for (let o = W + 6; o < W + 320; o += 22) {
      const x = cx(z) + sd * o;
      lev.push({ geo: new THREE.BoxGeometry(22, 0.25, 0.5), m: M4(V3(x + sd * 11, fieldH(x, z) + 0.05, z)), color: new THREE.Color('#8f9c4a') });
      if (rng() < 0.05 && o < W + 120) {
        const rx = x + sd * (4 + rng() * 10), rz = z - 4 - rng() * 8, y = fieldH(rx, rz), Lr = 5 + rng() * 4;
        for (let k = 0; k <= 3; k++) racks.push({ geo: new THREE.CylinderGeometry(0.05, 0.06, 1.8, 6), m: M4(V3(rx, y + 0.9, rz - Lr / 2 + k * Lr / 3)), color: new THREE.Color('#6a5040') });
        racks.push({ geo: new THREE.BoxGeometry(0.35, 0.9, Lr), m: M4(V3(rx, y + 1.25, rz)), color: new THREE.Color('#f0c862') });
      }
    }
  }
  G.add(new THREE.Mesh(bake(lev), A.paintedMaterial({ color: '#ffffff', vertexColors: true, id: A.ID.GROUND, varScale: 0.1, varAmt: 0.3 })));
  G.add(new THREE.Mesh(bake(racks), stoneM));
  // tree lines and farm groves (painted crowns), a few thatched farmhouses
  const groveM = A.cardMaterial({ map: mapleAtlas({ seed: 71 }), cells: 4, ramp: ['#4a4a66', '#6a7a4c', '#b49a4a', '#ffe08a'], alt: '#ff9a6a', altAmt: 0.5, ink: '#2a2a30', texW: 0.45, sway: 0.01 });
  const gclumps = [];
  for (let i = 0; i < 90; i++) {
    const z = lerp(ZT1 - 30, -1500, rng() ** 0.8), sd = rng() < 0.5 ? -1 : 1, o = rw(z) + 8 + rng() * 500, x = cx(z) + sd * o, s = 3 + rng() * 5;
    const n = Math.floor(3 + rng() * 5);
    for (let k = 0; k < n; k++) gclumps.push({ c: V3(x + (rng() - 0.5) * s * 3, fieldH(x, z) + s * (0.9 + rng() * 0.6), z + (rng() - 0.5) * s * 3), r: V3(s, s * 0.8, s), n: 10 });
  }
  // river-bank tree line (just past the town, frames s12)
  for (let z = ZT1 - 20; z > -900; z -= 14 + rng() * 22) for (const sd of [-1, 1]) {
    if (rng() < 0.4) continue; const x = cx(z) + sd * (rw(z) + 4 + rng() * 6), s = 2.5 + rng() * 3;
    gclumps.push({ c: V3(x, fieldH(x, z) + s * 1.2, z), r: V3(s, s * 0.9, s), n: 10 });
  }
  G.add(A.cardInstances(groveM, A.foliageItems(rng, gclumps, { sun: V3(sun.x, 1, sun.z), size: 0.8 }), { base: false }));
  const thatchM = A.celMaterial({ base: '#c8a670', shade: '#7e6680', map: noiseTex({ seed: 71, ax: 0.3, r: 0.02, lo: 0.7, n: 600 }), id: A.ID.PROP, highlight: 0.2, rimColor: '#ffd9a0' });
  const farm = [], farmW = [];
  for (let i = 0; i < 9; i++) {
    const z = ZT1 - 50 - rng() * 500, sd = rng() < 0.5 ? -1 : 1, x = cx(z) + sd * (rw(z) + 30 + rng() * 160), y = fieldH(x, z);
    const W = 8 + rng() * 4, D = 6 + rng() * 2, ry = rng() * 0.6 - 0.3;
    farmW.push({ geo: new THREE.BoxGeometry(D, 2.6, W), m: M4(V3(x, y + 1.3, z), [0, ry, 0]), color: new THREE.Color(plCols[i % 4]) });
    farm.push({ geo: roofGeo({ L: W, D, rise: 3.2, over: 0.9, up: 0.05, sag: 0.05, ridge: W * 0.6, segU: 6, segV: 4 }), m: M4(V3(x, y + 2.6 + 3.2, z), [0, ry + Math.PI / 2, 0]) });
  }
  G.add(new THREE.Mesh(bake(farm), thatchM), new THREE.Mesh(bake(farmW), plasterM));

  // ---------------------------------------------------------------- cast shadows: low gold sun, the houses on the west bank throw
  // long cool shadows across the canal, the walls and the street (heightmap of every house / bridge / willow crown)
  const SH = shadowCaster({ x0: -46, z0: ZT1 - 8, x1: 46, z1: ZT0 + 26, res: 0.35, sun: V3(-0.8, 0.26, -0.6), tint: '#7e82c6', amount: 0.8 });
  for (const list of [P.dark, P.plaster, P.roof, brParts]) for (const q of list) SH.part(q.geo, q.m);
  for (const t of trunks) SH.part(t.geo, t.m);
  for (const w of wClumps) SH.disc(w.c, w.r, w.r, w.c.y - 2.6, w.c.y + 0.6);
  SH.finish();
  for (const m of [wallM, stoneM, brM, darkM, plasterM, groundM, barkM, clothM, potM, ...norenM]) SH.patch(m);
  for (const m of [wilM, crownM]) SH.patch(m, true);
  api.shadow = SH;

  // ---------------------------------------------------------------- paths for dept WATER + anchors
  api.canalPts = []; for (let z = ZT0 + 18; z >= ZT1; z -= 3) api.canalPts.push(V3(cx(z), 0, z));
  api.riverPts = []; for (let z = ZT1; z >= -1600; z -= 20) api.riverPts.push(V3(cx(z), 0, z));
  api.halfWidth = (z) => rw(z);
  // stand-in water (debug only, q standin=1)
  const standIn = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), A.paintedMaterial({ color: '#8fb0b8', color2: '#c8d0c0', id: A.ID.WATER, varScale: 0.3, light: 0.3 }));
  standIn.scale.set(60, 1, 1800); standIn.position.set(0, 0, -800); standIn.visible = false; G.add(standIn);
  function update(st) {
    standIn.visible = st.q?.get?.('standin') === '1';
    willowMesh.userData.sway(A.onTwos(st.t), 1, V3(0.8, 0, 0.35));
    if (st.q?.get?.('vshdbg')) { SH.uVShTint.value.set('#ff0000'); SH.uVShAmt.value = 1; }
  }
  return { update, api, fieldH };
}
