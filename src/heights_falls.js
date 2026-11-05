// heights_falls.js - FALLS: the colossal 300 m Dragon Gate falls at night in a storm (dept HEIGHTS), round 2.
// A huge amphitheatre of stratified cliff wraps a boiling plunge pool (water y = 0). The main falls opening at the back is
// 140 m wide (x -70..70), lip at y = 300, z = LIP_Z, with a ragged rock lip (teeth, guardian rocks) and two tiers in the face
// behind the curtain (TIERS) the water breaks over. Side cascades + thin threads (drawn water ribbons, id 92) pour from notches
// in the rim and break over the strata ledges. Ledges carry hanging pines + moss; dark wet streaks run down the rock.
// The main curtain, pool surface, foam, mist and rain belong to dept WATER (anchors published by heights.js).
// Night palette state 0, lightning state 1 (driven by look.flash).
import * as THREE from 'three';
import * as A from './anime/post.js';
import { V3, lerp, smooth, fbm, noise3, Palette, setLight, bindLight, cliffWall, ledgeSpots, rockGeo, pineParts, mergeGeos,
  puffs, cumulusList, rangeGeo, heightsSky, rockMaterial, hCloudMaterial, threadMaterial, ribbonGeo } from './heights_lib.js';

export const LIP_Y = 300, LIP_HW = 70, LIP_Z = -120;
export const TIERS = [{ y: 212, out: 0.8 }, { y: 118, out: 0.9 }];      // ledges behind the curtain (edge ~2.5 m behind the lip line)
export const POOL = { cx: 0, cz: -40, r: 150, depth: 24 };
const recess = (y) => lerp(13, 1.2, smooth(0, 300, y));                 // face behind the curtain: 13 m back at the base, 1.2 at the lip
const tierOut = (y, x = 0) => {
  let o = 0;
  for (const T of TIERS) {
    const jag = 0.75 + 0.4 * noise3(x * 0.07, T.y, 1.3);
    o = Math.max(o, (recess(T.y) - 2.5) * T.out * jag * smooth(T.y - 18, T.y - 2, y) * (1 - smooth(T.y - 0.6, T.y + 0.6, y)));
  }
  return o;
};
const lipJag = (x, y) => smooth(LIP_Y - 30, LIP_Y, y) * 2.2 * fbm(x * 0.09, 2.2, 0.5, 2);   // ragged lip edge (only inward)
export const faceZ = (y, x = 0) => LIP_Z - recess(y) + tierOut(y, x) - lipJag(x, y);  // rock face z behind the curtain

export function buildFalls(ctx, group) {
  const rng = ctx.rng(3302);
  const NIGHT_DIR = V3(-0.75, 0.5, 0.45).normalize();     // cool sky key from upper left, in front of the cliff
  const L = setLight(NIGHT_DIR);
  const pal = new Palette();
  const S = { pal, L, group, NIGHT_DIR, FLASH_DIR: V3(0.25, 0.75, 0.62).normalize(), clouds: [], threads: [] };

  // ---------------------------------------------------------- storm sky
  const sky = heightsSky({
    stops: [[-0.05, '#3b4790'], [0.08, '#323c80'], [0.32, '#262d6a'], [0.85, '#1a2052']],
    diskR: 0, halo: 0, cirrus: 0, bank: 1, bankCol: '#262c62', bankRim: '#4a58a0', flashCol: '#b8c6ff', brush: 1.6,
  });
  const su = sky.material.uniforms;
  pal.add(su.uC0, ['#3b4790', '#6e7ed0']); pal.add(su.uC1, ['#323c80', '#5a6ac4']); pal.add(su.uC2, ['#262d6a', '#4a58a8']); pal.add(su.uC3, ['#1a2052', '#343f88']);
  pal.add(su.uBankCol, ['#262c62', '#5a66b4']); pal.add(su.uBankRim, ['#4a58a0', '#e0e8ff']);
  group.add(sky); S.sky = sky;

  // ---------------------------------------------------------- amphitheatre cliff
  const pts = [[-340, 440], [-300, 270], [-262, 130], [-226, 25], [-186, -50], [-136, -94], [-76, -112], [0, -116], [76, -112], [136, -94], [186, -50], [226, 25], [262, 130], [300, 270], [340, 440]];
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => V3(x, 0, z)), false, 'centripetal');
  const LEN = curve.getLength();
  const PC = new Map();
  const path = (u) => {
    const key = Math.round(u * 8);
    let r = PC.get(key);
    if (!r) {
      const t = Math.min(1, Math.max(0, u / LEN)), p = curve.getPointAt(t), T = curve.getTangentAt(t);
      r = { x: p.x, z: p.z, nx: T.z, nz: -T.x }; PC.set(key, r);
    }
    return r;
  };
  const xAt = (u) => path(u).x, zAt = (u) => path(u).z;
  const notch = (u) => { const x = xAt(u), z = zAt(u); return z < -60 ? smooth(LIP_HW + 16, LIP_HW + 1, Math.abs(x)) : 0; };
  // side cascade notches in the rim (x, depth of the dip, half width)
  const DIPS = [[-104, 34, 10], [102, 38, 11], [-178, 40, 6], [210, 30, 5]];
  const rimH = (u) => {
    const x = xAt(u), z = zAt(u);
    let h = 336 + 34 * fbm(u * 0.01, 2.2, 0.4, 3) - 150 * smooth(-20, 460, z);
    for (const [dx, dd, hw] of DIPS) if (z < 120) h -= dd * smooth(hw * 1.8, hw * 0.5, Math.abs(x - dx));
    return h;
  };
  const H = (u) => lerp(rimH(u), LIP_Y, notch(u));
  // strata band: t = y / L + phase(u); r = fract(t) (0 bottom of the band .. 1 top), i = band index
  const band = (u, y) => {
    const ph = fbm(u * 0.012, 0.5, 1.5, 2), Lb = 24 + 18 * ph;
    const t = y / Lb + ph * 4 + fbm(u * 0.005, 3.3, 1, 2) * 2.2;
    return { i: Math.floor(t), r: t - Math.floor(t) };
  };
  const crack = (u, y) => smooth(0.88, 0.97, 1 - Math.abs(2 * noise3(u * 0.05 + 0.6 * fbm(u * 0.02, y * 0.01, 1, 2), y * 0.004, 5.5) - 1)) * smooth(0.3, 0.5, noise3(u * 0.03, y * 0.02, 1));
  const off = (u, y) => {
    if (y < 0) return y * 1.1;
    const nt = notch(u);
    const b = band(u, y), amp = 6 + 9 * fbm(u * 0.03, b.i * 0.7, 2.2, 2);
    // each band: a vertical face, then an undercut cap leaning out (down-facing, in shade), then a sharp step back = the
    // up-facing shelf (lit, mossy, pines). Reads as strong horizontal strata from the pool.
    let d = amp * (smooth(0.8, 0.97, b.r) - smooth(0.42, 0.8, b.r)) + 0.03 * y;
    const cc = u / 13 + 1.4 * fbm(u * 0.02, y * 0.01, 3, 2), ci = Math.floor(cc), cf = cc - ci;
    const bo = (i) => (noise3(i * 1.71, b.i * 0.37, 0.5) - 0.5) * 7;
    d += lerp(bo(ci), bo(ci + 1), smooth(0.72, 1.0, cf));                       // blocky columns, stepped per band
    d += 30 * (fbm(u * 0.007, y * 0.0016, 0.3, 3) - 0.5);                         // buttresses + bays
    d += 5 * (fbm(u * 0.025, y * 0.008, 1.7, 3) - 0.5);
    d += 4.5 * crack(u, y);                                                       // deep vertical fissures
    d += 1.6 * (noise3(u * 0.15, y * 0.05, 2.0) - 0.5);
    if (nt <= 0) return d;
    const p = path(u), zf = faceZ(y, p.x);
    const dFace = (zf - p.z) / (Math.abs(p.nz) > 0.3 ? p.nz : -1) + 0.35 * (fbm(u * 0.08, y * 0.05, 7, 2) - 0.5);
    return lerp(d, dFace, nt);
  };
  const tones = ['#b8b8d2', '#7a7ea6', '#a08ea8', '#6c7096', '#c4c2d4', '#8c9cb8'].map((h) => new THREE.Color(h));
  const moss = new THREE.Color('#5aa08a'), mossD = new THREE.Color('#3a6e70'), wet = new THREE.Color('#3a4070'), top = new THREE.Color('#4e8676'), dark = new THREE.Color('#5a5e84');
  const hb = (i) => { const v = noise3(i * 3.13, 1.7, 0.2); return Math.min(tones.length - 1, Math.floor(v * tones.length * 1.3) % tones.length); };
  const colour = (u, y, ny, x, z) => {
    const c = new THREE.Color();
    const b = band(u, y);
    c.copy(tones[hb(b.i)]).lerp(tones[hb(b.i + 1)], smooth(0.75, 1.0, b.r) * 0.5);
    c.lerp(dark, smooth(0.35, 0.0, b.r) * 0.35);                                   // band bottoms (under the shelf) darker
    c.multiplyScalar(0.88 + 0.24 * fbm(u * 0.02, y * 0.02, 4, 3));
    // dark wet streaks running down from the ledges and seeps
    const st = smooth(0.52, 0.74, noise3(u * 0.28, y * 0.004 + b.i * 0.5, 2)) * (0.45 + 0.55 * smooth(0.2, 0.9, b.r));
    c.lerp(wet, st * 0.85);
    const cr = crack(u, y);
    c.lerp(wet, cr * 0.6);
    // moss on the shelves + in the cracks
    const m = Math.max(smooth(0.45, 0.72, ny + (noise3(u * 0.1, y * 0.1, 3) - 0.5) * 0.5), cr * smooth(0.4, 0.7, noise3(u * 0.3, y * 0.08, 6)) * 0.8);
    c.lerp(noise3(u * 0.03, y * 0.03, 9) > 0.5 ? moss : mossD, m * 0.9);
    if (y > H(u) + 0.5) c.lerp(top, 0.75);
    // wet dark rock around and behind the falls
    const wz = smooth(LIP_HW + 34, LIP_HW - 6, Math.abs(x)) * smooth(-60, -100, z);
    c.lerp(wet, wz * 0.75);
    return [c.r, c.g, c.b];
  };
  const g = cliffWall({ path, u0: 0, u1: LEN, segU: 520, y0: -26, Hmax: 380, rowH: 2.4, H, off, top: 560, topRows: 9,
    topY: (u, t) => (1 - notch(u)) * (20 * fbm(u * 0.01, t * 2, 5, 3) + t * 50) + notch(u) * -2.2, colour });
  const wallMat = bindLight(rockMaterial({ shade: '#20265a', rimColor: '#9ab8ff', rim: 0.6, rimWidth: 0.2, crackColor: '#0c1030', crackScale: 0.05, crackW: 1.5,
    moss: '#5aa294', moss2: '#2e6670', mossAmt: 0.85, dark: 0.3, skyFill: '#8a9cff', skyAmt: 0.55, fillDir: V3(0.3, -0.2, 1), fillCol: '#6a88f0', fillAmt: 0.45, soft: 0.16,
    nearD: 140, S: ctx.S, side: THREE.DoubleSide, varScale: 0.03, strokeScale: 0.06, edgeInk: 0.75 }), L);
  pal.add(wallMat.uniforms.uShadeC, ['#1e2456', '#5862b4']);
  pal.add(wallMat.uniforms.uRimCol, ['#9ab8ff', '#ffffff']);
  pal.add(wallMat.uniforms.uRimAmt2, [0.6, 0.95]);
  pal.add(wallMat.uniforms.uMoss, ['#5aa294', '#a8e0e8']); pal.add(wallMat.uniforms.uMoss2, ['#2e6670', '#6aa0c0']);
  const wall = new THREE.Mesh(g, wallMat); wall.name = 'falls_cliff'; group.add(wall);
  S.wall = { g, H, off, path, LEN, notch };
  const wallPt = (u, y, out = 0) => { const p = path(u), d = off(u, y) - out; return V3(p.x + p.nx * d, y, p.z + p.nz * d); };
  const uOfX = (x, back = true) => {   // u on the wall for a given x (back half: z < 120)
    let best = 0, bd = 1e9;
    for (let i = 0; i <= 600; i++) { const u = LEN * i / 600, p = path(u); if (back && p.z > 160) continue; const dd = Math.abs(p.x - x); if (dd < bd) { bd = dd; best = u; } }
    return best;
  };

  // ---------------------------------------------------------- basin: plunge pool bowl + outflow bed
  {
    const nx = 110, nz = 120, P = [], C = [], c = new THREE.Color(), cA = new THREE.Color('#7a86a0'), cB = new THREE.Color('#566a84'), cC = new THREE.Color('#9098b0');
    for (let j = 0; j <= nz; j++) {
      const z = lerp(-150, 480, j / nz);
      for (let i = 0; i <= nx; i++) {
        const x = lerp(-360, 360, i / nx), r = Math.hypot(x - POOL.cx, (z - POOL.cz) * 0.85);
        let y = -3.2 + 1.2 * fbm(x * 0.06, z * 0.06, 1, 3);
        y = Math.min(y, -POOL.depth * smooth(POOL.r + 10, 30, r) + 2.5 * (fbm(x * 0.05, z * 0.05, 3, 2) - 0.5));
        P.push(x, y, z);
        c.copy(cA).lerp(cB, smooth(0.4, 0.65, fbm(x * 0.12, z * 0.12, 2, 3))).lerp(cC, smooth(0.6, 0.75, noise3(x * 0.6, z * 0.6, 4)) * 0.5);
        C.push(c.r, c.g, c.b);
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const idx = []; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
    bg.setIndex(idx); bg.computeVertexNormals();
    const bedMat = bindLight(A.paintedMaterial({ color: '#ffffff', shade: '#1e2453', id: A.ID.GROUND, vertexColors: true, bands: true, varScale: 0.15, varAmt: 0.4, dab: 0.45 }), L);
    bedMat.side = THREE.DoubleSide;
    pal.add(bedMat.uniforms.uShadeC, ['#1e2453', '#4a54a0']);
    const bed = new THREE.Mesh(bg, bedMat); bed.name = 'falls_bed'; group.add(bed);
  }

  // ---------------------------------------------------------- rocks: pool boulders, wall-foot scree, the ragged lip
  const rockPal = { lit: '#b4b6cc', dark: '#7a7c9a', moss: '#5c9a8c', wet: '#2e3264' };
  const rockMat = bindLight(rockMaterial({ shade: '#242c64', rimColor: '#a0bcff', rim: 0.8, rimWidth: 0.26, crackColor: '#0c1030', crackScale: 0.3, crackW: 1.3,
    moss: '#5aa294', moss2: '#2e6670', mossAmt: 0.75, dark: 0.22, skyFill: '#8a9cff', skyAmt: 0.5, rimTop: 0.3, soft: 0.12, fillDir: V3(0.3, -0.2, 1), fillCol: '#7aa0ff', fillAmt: 0.5,
    nearD: 90, S: ctx.S, varScale: 0.2, strokeScale: 0.25, edgeInk: 0.6 }), L);
  pal.add(rockMat.uniforms.uShadeC, ['#242c64', '#5862b4']);
  pal.add(rockMat.uniforms.uRimCol, ['#a0bcff', '#ffffff']);
  pal.add(rockMat.uniforms.uRimAmt2, [0.8, 1.0]);
  const rocks = [];
  const addRock = (at, r, o = {}) => {
    const rg = rockGeo(rng, { r, sx: o.sx ?? lerp(1, 1.5, rng()), sy: o.sy ?? lerp(0.6, 1.0, rng()), sz: o.sz ?? lerp(0.9, 1.3, rng()), detail: o.detail ?? 3,
      palette: rockPal, at, wetY: o.wetY ?? 1.2, flatTop: o.flatTop, rough: 0.14, mossAmt: o.moss ?? 1 });
    rg.rotateY(rng() * Math.PI * 2);
    rocks.push({ geo: rg, matrix: new THREE.Matrix4().makeTranslation(at.x, at.y, at.z) });
  };
  const inCurtain = (x, z) => Math.abs(x) < LIP_HW + 8 && z < LIP_Z + 45;
  // wall-foot scree all round (kept clear of the curtain impact zone)
  for (let i = 0; i < 230; i++) {
    const u = lerp(LEN * 0.03, LEN * 0.97, rng()), b = path(u);
    if (inCurtain(b.x, b.z)) continue;
    const r = lerp(2.5, 11, rng() ** 1.5), d = lerp(-8, 3, rng());
    addRock(V3(b.x - b.nx * d, -r * lerp(0.25, 0.6, rng()), b.z - b.nz * d), r);
  }
  // big boulder piles flanking the curtain foot (the water boils between them)
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
    const x = s * lerp(LIP_HW + 4, LIP_HW + 46, rng()), z = lerp(LIP_Z + 4, LIP_Z + 40, rng()), r = lerp(5, 15, rng() ** 1.2);
    addRock(V3(x, -r * lerp(0.3, 0.55, rng()), z), r, { detail: 4 });
  }
  // rocks breaking the pool surface (foreground for low shots), clear of the curtain + the camera lane x -30..30
  for (const [x, z, r] of [[-62, 70, 7], [48, 92, 6], [-118, 30, 9], [110, 12, 10], [-150, -30, 8], [148, -40, 9], [-90, 140, 5], [84, 170, 4.5], [-40, 200, 3.5], [130, 110, 7], [-170, 90, 9], [30, 40, 3]]) addRock(V3(x, -r * 0.5, z), r, { detail: 4 });
  // the ragged lip: guardian rocks at the notch shoulders + teeth along the edge + boulders in the upper river
  for (const s of [-1, 1]) {
    addRock(V3(s * (LIP_HW + 6), LIP_Y - 2, LIP_Z - 8), 18, { sx: 1.2, sy: 1.1, sz: 1.3, detail: 4, wetY: LIP_Y + 1 });
    addRock(V3(s * (LIP_HW - 2), LIP_Y - 2, LIP_Z - 26), 7, { detail: 4, wetY: LIP_Y + 1 });
  }
  for (const x of [-52, -31, -9, 14, 37, 58]) {
    const r = lerp(3.5, 6.5, rng());
    addRock(V3(x + lerp(-4, 4, rng()), LIP_Y - r * 0.2, LIP_Z - lerp(4, 8, rng())), r, { sy: lerp(1.0, 1.4, rng()), detail: 3, wetY: LIP_Y + 1.5, moss: 0.5 });
  }
  for (let i = 0; i < 22; i++) addRock(V3(lerp(-LIP_HW + 6, LIP_HW - 6, rng()), LIP_Y - 1.8, LIP_Z - lerp(30, 200, rng())), lerp(1.5, 5, rng()), { wetY: LIP_Y + 1 });
  group.add(Object.assign(new THREE.Mesh(mergeGeos(rocks), rockMat), { name: 'falls_rocks' }));

  // ---------------------------------------------------------- side cascades + thin threads (drawn water ribbons)
  const ribbons = [];
  const pour = (u, w, out, seed) => {   // free-falling water: never closer to the rock than the highest overhang above it
    const top = H(u) - 0.5, list = [];
    let dMin = 1e9, prevD = null, foamI = new Set();
    for (let y = top, i = 0; y > -1; y -= 2.5, i++) {
      const d = off(u, Math.max(0, y)) - out;
      if (d < dMin - 0.8 && prevD !== null) foamI.add(i);   // the water hits a ledge here: it breaks white
      dMin = Math.min(dMin, d); prevD = d;
      const p = path(u), wig = 1.6 * Math.sin(y * 0.045 + seed * 20) + 0.8 * Math.sin(y * 0.13 + seed * 7);
      const q = V3(p.x + p.nx * dMin - p.nz * wig, y, p.z + p.nz * dMin + p.nx * wig);
      list.push({ p: q, out: V3(-p.nx, 0, -p.nz) });
    }
    ribbons.push({ geo: ribbonGeo(list, w, seed, (i) => (foamI.has(i) || foamI.has(i - 1) || foamI.has(i - 2) ? 1 : 0)) });
  };
  S.cascades = [];
  for (const [dx, dd, hw] of DIPS) {
    const u = uOfX(dx), big = dd > 33;
    pour(u, hw * (big ? 1.1 : 0.7), 1.2, rng());
    if (big) pour(u + hw * 0.7, hw * 0.35, 1.6, rng());
    S.cascades.push({ x: dx, top: H(u), width: hw * 2 });
  }
  // thin threads down the faces (seeps from the rim)
  for (let i = 0; i < 5; i++) {
    const u = lerp(LEN * 0.15, LEN * 0.85, rng()), p = path(u);
    if (Math.abs(p.x) < LIP_HW + 20 && p.z < -60) continue;
    pour(u, lerp(0.8, 1.8, rng()), 0.6, rng());
  }
  const threadMat = threadMaterial({ col: '#a8bcec', col2: '#46569e', foam: '#dce6ff', speed: 20 });
  const threadMesh = new THREE.Mesh(mergeGeos(ribbons), threadMat); threadMesh.name = 'falls_threads'; group.add(threadMesh);
  S.threads.push(threadMat);

  // ---------------------------------------------------------- hanging pines on ledges + pines along the rim
  const trunks = [], clumps = [];
  const away = (p) => !(Math.abs(p.x) < LIP_HW + 12 && p.z < -70);
  const ledge = ledgeSpots(g, rng, 420, { minNy: 0.5, yMin: 14, yMax: 360, keep: (p) => away(p) });
  for (const s of ledge) {
    const out = V3(s.n.x, 0, s.n.z).normalize();
    const pp = pineParts(rng, s.p.clone().add(V3(0, -0.5, 0)), { scale: lerp(1.4, 2.8, rng()), height: 9, hang: out.clone().add(V3(0, 0.12, 0)).normalize(), lean: out.multiplyScalar(0.95), pad: 1.15 });
    trunks.push(...pp.trunks); clumps.push(...pp.clumps);
  }
  const rim = ledgeSpots(g, rng, 200, { minNy: 0.75, yMin: 250, keep: (p) => away(p) });
  for (const s of rim) {
    const pp = pineParts(rng, s.p.clone().add(V3(0, -0.4, 0)), { scale: lerp(1.2, 2.2, rng()), height: 11 });
    trunks.push(...pp.trunks); clumps.push(...pp.clumps);
  }
  const trunkMat = bindLight(A.paintedMaterial({ color: '#4e4a72', color2: '#3e3c64', shade: '#1a1e48', id: A.ID.PAINT, map: A.barkTexture({ seed: 34 }), bands: true, rim: 0.6, rimColor: '#7f96e8' }), L);
  pal.add(trunkMat.uniforms.uShadeC, ['#1a1e48', '#4a54a0']);
  pal.add(trunkMat.uniforms.uRimCol, ['#7f96e8', '#ffffff']);
  group.add(new THREE.Mesh(mergeGeos(trunks), trunkMat));
  const pineMat = A.cardMaterial({ map: A.foliageAtlas({ kind: 'pine', seed: 8 }), cells: 4, ramp: ['#141a40', '#1c3a50', '#2e6a66', '#7ab4b0'], alt: '#c8d0ff', altAmt: 0.4, ink: '#0c1030', sway: 0.03 });
  pal.add(pineMat.uniforms.uR0, ['#141a40', '#3a4490']); pal.add(pineMat.uniforms.uR1, ['#1c3a50', '#4a6aa8']);
  pal.add(pineMat.uniforms.uR2, ['#2e6a66', '#88a8e0']); pal.add(pineMat.uniforms.uR3, ['#7ab4b0', '#e8f0ff']);
  group.add(A.cardInstances(pineMat, A.foliageItems(rng, clumps, { sun: NIGHT_DIR, size: 0.8 }), { base: false }));
  // moss / fern cushions on the shelves (leaf dabs)
  const cush = [];
  for (const sp of ledgeSpots(g, rng, 700, { minNy: 0.55, yMin: 4, yMax: 370, keep: (p) => away(p) })) {
    const r = lerp(1.5, 4.5, rng() ** 1.4);
    cush.push({ c: sp.p.clone().addScaledVector(sp.n, r * 0.3), r: V3(r * 1.5, r * 0.45, r * 1.5), n: Math.round(3 + rng() * 3), light: (rng() - 0.5) * 0.15 });
  }
  const cushMat = A.cardMaterial({ map: A.foliageAtlas({ kind: 'leaf', seed: 15 }), cells: 4, ramp: ['#16203e', '#1e4450', '#3a7a6a', '#8ac0a0'], alt: '#b0c8ff', altAmt: 0.35, ink: '#0c1030', sway: 0.02 });
  pal.add(cushMat.uniforms.uR2, ['#3a7a6a', '#88b0e0']); pal.add(cushMat.uniforms.uR3, ['#8ac0a0', '#f0f4ff']);
  group.add(A.cardInstances(cushMat, A.foliageItems(rng, cush, { sun: NIGHT_DIR, size: 0.9 }), { base: false }));

  // ---------------------------------------------------------- far mountain silhouettes (lighter with distance, faint rims)
  const ranges = [
    { a0: -1.4, a1: 1.4, d0: 1200, d1: 1800, H: 820, seed: 11, c: ['#283068', '#1c2252', '#5a6ab8'], f: ['#6a78c8', '#4a56a4', '#ffffff'] },
    { a0: -1.6, a1: 1.6, d0: 2100, d1: 3100, H: 1300, seed: 12, c: ['#303a7a', '#262e66', '#6a7ac4'], f: ['#8a98e0', '#6a78c0', '#ffffff'], sharp: 2.1 },
    { a0: -2.6, a1: -1.2, d0: 1000, d1: 1600, H: 650, seed: 13, c: ['#2a3270', '#1e2456', '#5a6ab8'], f: ['#6a78c8', '#4a56a4', '#ffffff'] },
    { a0: 1.2, a1: 2.6, d0: 1000, d1: 1600, H: 700, seed: 14, c: ['#2a3270', '#1e2456', '#5a6ab8'], f: ['#6a78c8', '#4a56a4', '#ffffff'] },
  ];
  for (const r of ranges) {
    const m = bindLight(A.paintedMaterial({ color: r.c[0], shade: r.c[1], id: A.ID.PAINT, bands: true, varScale: 0.004, varAmt: 0.5, dab: 0.3, stroke: 1.2, strokeScale: 0.02,
      rim: 0.8, rimColor: r.c[2], rimWidth: 0.2, rimTop: 1 }), L);
    pal.add(m.uniforms.uColor, [r.c[0], r.f[0]]); pal.add(m.uniforms.uColor2, [r.c[0], r.f[0]]);
    pal.add(m.uniforms.uShadeC, [r.c[1], r.f[1]]); pal.add(m.uniforms.uRimCol, [r.c[2], r.f[2]]);
    group.add(new THREE.Mesh(rangeGeo({ centre: V3(0, 0, -40), a0: r.a0, a1: r.a1, d0: r.d0, d1: r.d1, H: r.H, seed: r.seed, sharp: r.sharp ?? 1.6, base: 0 }), m));
  }

  // ---------------------------------------------------------- storm: towering cumulonimbus behind + above the falls, indigo
  // bellies, violet bodies, silver-cyan rims and inner lightning; a heavy deck to the sides. Lit from the front (valley glow).
  const puffGeo = new THREE.IcosahedronGeometry(1, 3);
  const cL = setLight(V3(0.2, 0.55, 0.8)); cL.uSunColor.value.set('#8a96d8');
  const cloudMat = (o = {}) => {
    const m = bindLight(hCloudMaterial({ color: '#6c78c4', shade: '#2e3476', belly: '#181c4a', rimColor: '#c4d4ff', rim: 1.0, rimWidth: 0.24, rimLit: 0.9,
      flashCol: '#e6eeff', flashDir: S.FLASH_DIR, inner: o.inner ?? 0.9, innerCol: '#9cc4ff', innerScale: 0.0022, farCol: '#3a4688', far0: 1500, far1: 5000, farAmt: 0.45,
      varScale: 0.006, strokeScale: 0.01, soft: 0.06, mid: 0.4, mass: o.mass ?? [0, 0, 0, 0], massScale: [1, 0.6, 1], shafts: o.shafts ?? 0 }), cL);
    pal.add(m.uniforms.uColor, ['#6c78c4', '#c8d4ff']); pal.add(m.uniforms.uShadeC, ['#2a3070', '#6a76c8']);
    pal.add(m.uniforms.uBellyC, ['#181c4a', '#3a4490']); pal.add(m.uniforms.uRimCol, ['#c4d4ff', '#ffffff']);
    S.clouds.push(m); return m;
  };
  const deck = [];
  for (let i = 0; i < 360; i++) {
    const a = rng() * Math.PI * 2, d = 900 + 2600 * Math.sqrt(rng());
    const x = Math.sin(a) * d, z = -40 - Math.cos(a) * d;
    if (z > -300 && Math.abs(x) < 1200) continue;
    deck.push({ pos: V3(x, lerp(700, 1000, rng()) + d * 0.06, z), r: lerp(120, 280, rng()), sx: 1.7, sy: 0.5, sz: 1.3, col: new THREE.Color().setScalar(lerp(0.75, 1.05, rng())) });
  }
  group.add(puffs(puffGeo, cloudMat({ inner: 0.6, shafts: 0.6 }), deck));
  for (const [x, z, w, h] of [[-160, -1500, 700, 2300], [520, -1900, 760, 2600], [-760, -1200, 560, 1700], [900, -1100, 520, 1500], [-1300, -1900, 760, 2200], [80, -2700, 1000, 2800], [1450, -2200, 700, 2000]]) {
    const c0 = V3(x, 520, z);
    const m = cloudMat({ mass: [c0.x, c0.y + h * 0.45, c0.z, 0.85] });
    const list = cumulusList(rng, c0, w, h, 260, { taper: 0.8, spread: 1.0, bumps: 3, col: (t) => new THREE.Color().setScalar(lerp(0.75, 1.12, t)) });
    for (const p of list) p.r *= 0.72;
    for (let i = 0; i < 14; i++) list.push({ pos: c0.clone().add(V3((rng() - 0.5) * w * 2.2, h * lerp(0.92, 1.02, rng()), (rng() - 0.5) * w * 0.8)), r: w * lerp(0.14, 0.24, rng()), sx: 2.1, sy: 0.38, sz: 1.2, col: new THREE.Color().setScalar(1.1) });  // anvil
    group.add(puffs(puffGeo, m, list));
  }
  S.flashL = cL;
  return S;
}

// look.flash 0..1: blue-white lightning light from the bolt (in front of + above the falls); t = film time (threads, inner glow)
export function applyFalls(S, flash, t = 0) {
  const f = Math.min(1, Math.max(0, flash));
  S.pal.set([1 - f, f]);
  S.L.uSunDir.value.copy(S.NIGHT_DIR).lerp(S.FLASH_DIR, f).normalize();
  S.L.uSunColor.value.set('#98a8f0').lerp(new THREE.Color('#d8e2ff').multiplyScalar(1.05), f);
  S.L.uAmbient.value.set('#4a54a0');
  S.flashL.uSunColor.value.set('#8a96d8').lerp(new THREE.Color('#e8eeff'), f);
  const su = S.sky.material.uniforms; su.uFlash.value = f; su.uFlashDir.value.set(0.15, 0.55, -1).normalize();
  const t3 = A.onThrees ? A.onThrees(t) : t;
  for (const m of S.clouds) { m.uniforms.uFlash.value = f; m.uniforms.uInnerT.value = t3; }
  for (const m of S.threads) { m.uniforms.uT.value = t3; m.uniforms.uFlash.value = f; }
}
