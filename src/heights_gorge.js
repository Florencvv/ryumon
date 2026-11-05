// heights_gorge.js - GORGE: a rocky river gorge at sunset (dept HEIGHTS). River flows +z (downstream, toward TOWN);
// Hi swims upstream toward -z, the setting sun sits in the V of the gorge upstream. Water surface y = 0 (dept WATER).
// Time of day: weights over [sunset, dusk, dawn] states (dusk 0..1 control; dawn for the return flight s35).
import * as THREE from 'three';
import * as A from './anime/post.js';
import { V3, lerp, smooth, fbm, noise3, Palette, setLight, bindLight, cliffWall, terrace, ledgeSpots, rockGeo, pineParts, mergeGeos,
  puffs, cumulusList, cloudMaterial, rangeGeo, heightsSky, rockMaterial } from './heights_lib.js';

export const riverX = (z) => 5 * Math.sin(z / 70) + 2 * Math.sin(z / 23 + 1.3);
export const halfW = (z) => 9 + 2.2 * (fbm(z * 0.01, 3.1, 0.7, 3) - 0.5) * 2;
const Z0 = -580, Z1 = 470;

export function buildGorge(ctx, group) {
  const rng = ctx.rng(3301);
  const L = setLight(V3(-0.5, 0.25, -1));
  const pal = new Palette();
  const S = { pal, L, group };

  // ---------------------------------------------------------- sky
  const SUN = { sunset: V3(-0.06, 0.075, -1).normalize(), dusk: V3(-0.08, -0.04, -1).normalize(), dawn: V3(0.42, 0.06, 1).normalize() };
  const sky = heightsSky({
    stops: [[-0.03, '#ffb25e'], [0.07, '#ff7d5e'], [0.24, '#c8508c'], [0.72, '#57388a']],
    sunDir: SUN.sunset, diskR: 0.034, diskCol: '#fff1c8', haloCol: '#ffa060', halo: 0.75, bloom: 0.9,
    cirrus: 0.9, cirLit: '#ffd08a', cirShade: '#d0709a', cirScale: 0.9, cirAng: 0.25,
    bank: 0.85, bankH: 0.45, bankCol: '#8a4a86', bankRim: '#ffb07a', flashCol: '#d8c8ff', brush: 1.4,
  });
  const su = sky.material.uniforms;
  pal.add(su.uC0, ['#ffb25e', '#f08a78', '#ffe0b0']);
  pal.add(su.uC1, ['#ff7d5e', '#b0588e', '#ffc4a8']);
  pal.add(su.uC2, ['#c8508c', '#5e3c8c', '#a8b4e8']);
  pal.add(su.uC3, ['#57388a', '#2a2866', '#6a8cd4']);
  pal.add(su.uHaloCol, ['#ffa060', '#c06a8a', '#ffd8a0']);
  pal.add(su.uHalo, [0.75, 0.35, 0.6]);
  pal.add(su.uCirLit, ['#ffd08a', '#e090b0', '#fff2d8']);
  pal.add(su.uCirShade, ['#d0709a', '#6a4a90', '#c0b8e8']);
  pal.add(su.uCirrus, [0.9, 0.7, 0.8]);
  pal.add(su.uBankCol, ['#8a4a86', '#3a3070', '#b0b0e0']);
  pal.add(su.uBankRim, ['#ffb07a', '#b06a9a', '#fff0d0']);
  pal.add(su.uBank, [0.85, 1.0, 0.6]);
  group.add(sky); S.sky = sky; S.SUN = SUN;

  // ---------------------------------------------------------- cliff walls
  const H = (z, side) => 72 + 46 * fbm(z * 0.006 + side * 7, 1.3, 2.2, 3) + 22 * smooth(-150, -520, z) - 10 * smooth(150, 460, z);
  // strata bands (shared by shape + colour): t = y / Lb + phase; r = fract (0 bottom .. 1 top of the band)
  const band = (z, y, side) => {
    const ph = fbm(z * 0.012 + side * 3, 0.5, 1.5, 2), Lb = 8 + 7 * ph;
    const t = y / Lb + ph * 3 + fbm(z * 0.004 + side, 3.3, 1, 2) * 2 + z * 0.004;   // slightly tilted beds
    return { i: Math.floor(t), r: t - Math.floor(t) };
  };
  // thin meandering fissures: iso-lines of a stretched noise (mostly vertical), broken along their length
  const crack = (z, y, side) => smooth(0.9, 0.975, 1 - Math.abs(2 * noise3(z * 0.07 + side * 9 + 0.6 * fbm(z * 0.03, y * 0.02, 1, 2), y * 0.008, 5.5) - 1)) * smooth(0.35, 0.55, noise3(z * 0.05, y * 0.04, side + 3));
  const off = (side) => (z, y) => {
    if (y < 0) return y * 1.8;                                   // under water: the wall runs out under the river bed
    const ph = fbm(z * 0.02 + side * 3, 0.5, 1.5, 2);
    let d = 0.3 * y + 0.0032 * y * y + terrace(y, 13 + 8 * ph, 3.4, ph * 2);
    const b = band(z, y, side), amp = 2.0 + 1.4 * fbm(z * 0.01 + side, b.i * 0.7, 2.2, 2);
    d += amp * (smooth(0.8, 0.97, b.r) - smooth(0.4, 0.8, b.r)) * smooth(0.5, 3, y);   // undercut cap + up-facing shelf per bed
    const cc = z / 6 + 1.6 * fbm(z * 0.02, y * 0.012, side * 3, 2), ci = Math.floor(cc), cf = cc - ci;
    const bo = (i) => (noise3(i * 1.71, side * 3.3 + b.i * 0.31, 0.5) - 0.5) * 2.6;
    d += lerp(bo(ci), bo(ci + 1), smooth(0.86, 1.0, cf));            // blocky joints: stepped vertical planes per bed
    d += 6 * (fbm(z * 0.012 + side * 11, y * 0.01, 0.3, 3) - 0.5);   // bulges + bays
    d += 2.6 * crack(z, y, side);                                    // deep fissures
    d -= 3.5 * smooth(0.55, 0.75, noise3(z * 0.02 + side * 4, y * 0.03, 8.8)) * smooth(10, 25, y);   // the odd big overhang slab
    d += 0.9 * (fbm(z * 0.1, y * 0.1, side * 2, 2) - 0.5);
    d -= 1.4 * smooth(1.8, 0.4, y);                              // a wet rock shelf at the waterline
    return d;
  };
  const tones = ['#d8bc98', '#a8828e', '#86768e', '#e2caac', '#9c7a72', '#c6a28a'].map((h) => new THREE.Color(h));
  const hb = (i) => Math.floor(noise3(i * 3.13, 1.7, 0.2) * tones.length * 1.3) % tones.length;
  const moss = new THREE.Color('#86a24e'), mossD = new THREE.Color('#5a7a48'), wet = new THREE.Color('#5a4c62'), grass = new THREE.Color('#93a85c'), dark = new THREE.Color('#7a6474');
  const colour = (side) => (u, y, ny, x, z) => {
    const c = new THREE.Color(), b = band(z, y, side);
    c.copy(tones[hb(b.i)]).lerp(tones[hb(b.i + 1)], smooth(0.8, 1.0, b.r) * 0.5);
    c.lerp(dark, smooth(0.45, 0.0, b.r) * 0.45);                     // band bottoms under the shelf darker
    c.multiplyScalar(0.9 + 0.2 * fbm(z * 0.03, y * 0.05, side * 4, 3));
    const st = smooth(0.55, 0.78, noise3(z * 0.35 + side * 7, y * 0.02 + b.i * 0.5, 2)) * smooth(0.15, 0.8, b.r);   // dark streaks below ledges
    c.lerp(wet, st * 0.55);
    const cr = crack(z, y, side);
    c.lerp(wet, cr * 0.7);
    const m = Math.max(smooth(0.42, 0.72, ny + (noise3(z * 0.15, y * 0.15, side) - 0.5) * 0.5), cr * smooth(0.45, 0.7, noise3(z * 0.4, y * 0.2, 6)) * 0.8);
    c.lerp(noise3(z * 0.05, y * 0.05, 9) > 0.5 ? moss : mossD, m * 0.92);
    if (y > H(z, side) + 0.5) c.lerp(grass, 0.8);
    c.lerp(wet, smooth(1.6, 0.2, y) * 0.85);
    return [c.r, c.g, c.b];
  };
  const wallMat = bindLight(rockMaterial({ shade: '#6a5590', rimColor: '#ffc890', rim: 0.55, rimWidth: 0.2, crackColor: '#3a2440', crackScale: 0.09, crackW: 1.5, dark: 0.16, skyFill: '#d890c0', skyAmt: 0.45, fillDir: V3(0.3, 0.2, 1), fillCol: '#ffc0d8', fillAmt: 0.55,
    moss: '#9ab05a', moss2: '#5e7e4a', mossAmt: 0.35, nearD: 90, S: ctx.S, side: THREE.DoubleSide, varScale: 0.05, strokeScale: 0.12, edgeInk: 0.7 }), L);
  pal.add(wallMat.uniforms.uShadeC, ['#6a5590', '#3a3470', '#7a86b8']);
  pal.add(wallMat.uniforms.uRimCol, ['#ffc890', '#b07aa8', '#fff0c8']);
  pal.add(wallMat.uniforms.uRimAmt2, [0.55, 0.25, 0.45]);
  pal.add(wallMat.uniforms.uSkyFill, ['#d890c0', '#9a80c8', '#c0d0ff']);
  pal.add(wallMat.uniforms.uCrackCol, ['#3a2440', '#1e1a40', '#34385a']);
  pal.add(wallMat.uniforms.uMoss, ['#b0b85a', '#5a6a6a', '#9ac070']); pal.add(wallMat.uniforms.uMoss2, ['#6a7a4a', '#3a4a5a', '#5e8a5a']);
  const walls = [];
  for (const side of [-1, 1]) {
    const foot = (z) => riverX(z) + side * (halfW(z) + 1.2);
    const g = cliffWall({
      path: (z) => ({ x: foot(z), z, nx: side, nz: 0 }), u0: Z0, u1: Z1, segU: 760, y0: -5, Hmax: 150, rowH: 1.5,
      H: (z) => H(z, side), off: off(side), top: 260, topRows: 7, topY: (z, t) => 14 * fbm(z * 0.01, t * 2, side * 5, 3) + t * 30,
      colour: colour(side),
    });
    const m = new THREE.Mesh(g, wallMat); m.name = 'gorge_wall_' + side; group.add(m); walls.push({ side, g, foot, H: (z) => H(z, side), off: off(side) });
  }
  S.walls = walls;

  // ---------------------------------------------------------- river bed (seen in GORGE-UNDER shots)
  {
    const nx = 48, nz = 320, P = [], C = [], c = new THREE.Color(), cA = new THREE.Color('#8f8a68'), cB = new THREE.Color('#5f7468'), cC = new THREE.Color('#a89a78');
    for (let j = 0; j <= nz; j++) {
      const z = lerp(Z0, Z1, j / nz);
      for (let i = 0; i <= nx; i++) {
        const dx = lerp(-16, 16, i / nx), x = riverX(z) + dx, hw = halfW(z);
        const y = -2.7 + 0.9 * fbm(x * 0.15, z * 0.15, 1, 3) + 3.2 * smooth(hw - 3.5, hw + 1.5, Math.abs(dx));
        P.push(x, y, z);
        c.copy(cA).lerp(cB, smooth(0.4, 0.65, fbm(x * 0.3, z * 0.3, 2, 3))).lerp(cC, smooth(0.6, 0.75, noise3(x * 1.3, z * 1.3, 4)) * 0.6);
        C.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const idx = []; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1); }
    g.setIndex(idx); g.computeVertexNormals();
    const bedMat = bindLight(A.paintedMaterial({ color: '#ffffff', color2: '#e0e8d8', shade: '#4e5a7a', id: A.ID.GROUND, vertexColors: true, bands: true, varScale: 0.4, varAmt: 0.4, dab: 0.45 }), L);
    pal.add(bedMat.uniforms.uShadeC, ['#4e5a7a', '#2e3466', '#4e6a80']);
    const bed = new THREE.Mesh(g, bedMat); bed.name = 'gorge_bed'; group.add(bed);
    // pebbles
    const pg = rockGeo(rng, { r: 1, detail: 2, cuts: 5, rough: 0.1, palette: { lit: '#ffffff', dark: '#d0d0d0', moss: '#e0e8d0' }, mossAmt: 0 });
    const pm = bindLight(A.paintedMaterial({ color: '#ffffff', shade: '#4e5a7a', id: A.ID.GROUND, vertexColors: true, bands: true, varScale: 1.2, varAmt: 0.3, dab: 0.3 }), L);
    pal.add(pm.uniforms.uShadeC, ['#4e5a7a', '#2e3466', '#4e6a80']);
    const list = [], cols = ['#9a9078', '#7c8478', '#b0a088', '#6a7070', '#8a7a6a'];
    for (let i = 0; i < 520; i++) {
      const z = lerp(-110, 70, rng()), dx = (rng() * 2 - 1) * (halfW(z) - 0.5), x = riverX(z) + dx;
      const y = -2.7 + 0.9 * fbm(x * 0.15, z * 0.15, 1, 3) + 3.2 * smooth(halfW(z) - 3.5, halfW(z) + 1.5, Math.abs(dx));
      const r = 0.12 + 0.35 * rng() ** 2;
      list.push({ pos: V3(x, y + r * 0.1, z), r, sx: 1.2, sy: 0.55, sz: 1, col: cols[Math.floor(rng() * cols.length)] });
    }
    group.add(puffs(pg, pm, list));
  }

  // ---------------------------------------------------------- boulders (rapids), bank rocks, the heron's rock
  const rockPal = { lit: '#c8b4a0', dark: '#8a7a84', moss: '#7e9e4e', wet: '#3e3850' };
  const rockMat = bindLight(rockMaterial({ shade: '#6a5590', rimColor: '#ffcc90', rim: 0.85, rimWidth: 0.28, crackColor: '#3a2440', crackScale: 0.55, crackW: 1.3, skyFill: '#e0a0d0', skyAmt: 0.6, rimTop: 0.2, fillDir: V3(0.3, 0.25, 1), fillCol: '#ffc8e0', fillAmt: 0.7,
    moss: '#9ab05a', moss2: '#5e7e4a', mossAmt: 0.9, nearD: 70, S: ctx.S, varScale: 0.5, strokeScale: 0.6, dark: 0.2, edgeInk: 0.6 }), L);
  pal.add(rockMat.uniforms.uFillCol, ['#ffc8e0', '#b8a0e0', '#e0e8ff']);
  pal.add(wallMat.uniforms.uFillCol, ['#ffc0d8', '#b098d8', '#e0e8ff']);
  pal.add(rockMat.uniforms.uSkyFill, ['#e0a0d0', '#a080c8', '#c0d0ff']);
  pal.add(rockMat.uniforms.uShadeC, ['#6a5590', '#3a3470', '#6e7cb0']);
  pal.add(rockMat.uniforms.uRimCol, ['#ffcc90', '#c08ab8', '#fff0c8']);
  pal.add(rockMat.uniforms.uRimAmt2, [0.85, 0.4, 0.6]);
  pal.add(rockMat.uniforms.uCrackCol, ['#3a2440', '#1e1a40', '#34385a']);
  const rocks = [], boulders = [];
  const addRock = (at, r, o = {}) => {
    const g = rockGeo(rng, { r, sx: o.sx ?? lerp(1, 1.4, rng()), sy: o.sy ?? lerp(0.7, 1.0, rng()), sz: o.sz ?? lerp(0.9, 1.3, rng()), detail: o.detail ?? 3,
      palette: rockPal, at, wetY: o.wetY ?? 0.75, flatTop: o.flatTop, cuts: o.cuts ?? 7, rough: 0.14, mossAmt: 1.3 });
    g.rotateY(rng() * Math.PI * 2);
    rocks.push({ geo: g, matrix: new THREE.Matrix4().makeTranslation(at.x, at.y, at.z) });
    g.computeBoundingBox();
    return { pos: at.clone(), r: r * Math.max(o.sx ?? 1.2, o.sz ?? 1.1), top: at.y + g.boundingBox.max.y };
  };
  // the heron's rock: a flat-topped boulder near the right bank, top ~0.7 m above the water
  const hz = -14, hx = riverX(hz) + 3.4;
  const hr = addRock(V3(hx, -0.65, hz), 1.45, { sx: 1.25, sy: 1.0, sz: 1.1, flatTop: 0.82, detail: 4, cuts: 6 });
  S.heronRock = { pos: V3(hx, 0, hz), top: V3(hx, hr.top, hz), r: hr.r };
  // rapids: boulders on both sides of a winding lane (Hi's route) through z -95..45
  for (let i = 0; i < 46; i++) {
    const z = lerp(-95, 45, rng()), hw = halfW(z), lane = riverX(z) + 1.4 * Math.sin(z * 0.11);
    let side = rng() < 0.5 ? -1 : 1, dx = side * lerp(1.6, hw - 0.6, rng() ** 0.8);
    const x = lane + dx;
    if (Math.abs(z - hz) < 3.5 && Math.abs(x - hx) < 3.5) continue;
    const r = lerp(0.45, 1.6, rng() ** 1.6);
    const b = addRock(V3(x, -r * lerp(0.35, 0.7, rng()), z), r);
    if (b.top > 0.05) boulders.push(b);
  }
  // bank rocks along both feet
  for (const w of walls) for (let i = 0; i < 70; i++) {
    const z = lerp(-420, 300, rng()), x = w.foot(z) - w.side * lerp(-0.5, 2.5, rng());
    const r = lerp(1.2, 4.2, rng() ** 1.5);
    const b = addRock(V3(x, -r * 0.45, z), r, { detail: 3 });
    if (b.top > 0.05 && Math.abs(z) < 120) boulders.push(b);
  }
  const rockMesh = new THREE.Mesh(mergeGeos(rocks), rockMat); rockMesh.name = 'gorge_rocks'; group.add(rockMesh);
  S.boulders = boulders;

  // ---------------------------------------------------------- pines: on ledges and along the rims (silhouettes on the sky)
  const trunks = [], clumps = [];
  for (const w of walls) {
    const spotsL = ledgeSpots(w.g, rng, 110, { minNy: 0.6, yMin: 7, keep: (p) => p.y < w.H(p.z) - 3 && p.z > -480 && p.z < 380 });
    const spotsR = ledgeSpots(w.g, rng, 120, { minNy: 0.7, yMin: 30, keep: (p) => { const d = Math.abs(p.x - w.foot(p.z)), rim = w.off(p.z, w.H(p.z)); return p.y > w.H(p.z) - 1.5 && d < rim + 22 && p.z > -560 && p.z < 450; } });
    for (const s of spotsL) { const pp = pineParts(rng, s.p.clone().add(V3(0, -0.3, 0)), { scale: lerp(0.6, 1.1, rng()), height: 8, hang: V3(-w.side, 0.25, 0).normalize(), lean: V3(-w.side * 0.6, 0, 0) }); trunks.push(...pp.trunks); clumps.push(...pp.clumps); }
    for (const s of spotsR) { const pp = pineParts(rng, s.p.clone().add(V3(0, -0.3, 0)), { scale: lerp(0.8, 1.5, rng()), height: 10, lean: V3(-w.side * 0.25, 0, 0) }); trunks.push(...pp.trunks); clumps.push(...pp.clumps); }
  }
  const bark = A.barkTexture({ seed: 33 });
  const trunkMat = bindLight(A.paintedMaterial({ color: '#7a5a52', color2: '#5e4650', shade: '#3a2e52', id: A.ID.PAINT, map: bark, bands: true, varScale: 0.3, dab: 0.2, rim: 0.6, rimColor: '#ffaa70', rimWidth: 0.3 }), L);
  pal.add(trunkMat.uniforms.uShadeC, ['#3a2e52', '#262446', '#3e4466']);
  pal.add(trunkMat.uniforms.uRimCol, ['#ffaa70', '#a0709a', '#ffe0b0']);
  group.add(new THREE.Mesh(mergeGeos(trunks), trunkMat));
  const pineMat = A.cardMaterial({ map: A.foliageAtlas({ kind: 'pine', seed: 7 }), cells: 4, ramp: ['#2c2d58', '#3e5560', '#8e8a50', '#f0b070'], alt: '#d8c8ff', altAmt: 0.5, ink: '#1e1630', sway: 0.02 });
  pal.add(pineMat.uniforms.uR0, ['#2c2d58', '#22224a', '#2e3e60']);
  pal.add(pineMat.uniforms.uR1, ['#3e5560', '#2e3a62', '#3e6066']);
  pal.add(pineMat.uniforms.uR2, ['#8e8a50', '#4e5072', '#7e9e66']);
  pal.add(pineMat.uniforms.uR3, ['#f0b070', '#a07898', '#e8e0a8']);
  const items = A.foliageItems(rng, clumps, { sun: V3(-0.45, 0.6, -1), size: 0.8 });
  group.add(A.cardInstances(pineMat, items, { base: false }));
  // shrubs + moss cushions on the ledges (leaf dabs)
  const shrubs = [];
  for (const w of walls) for (const sp of ledgeSpots(w.g, rng, 260, { minNy: 0.5, yMin: 1.5, keep: (p) => p.y < w.H(p.z) + 2 && p.z > -500 && p.z < 400 })) {
    const r = lerp(0.8, 2.2, rng() ** 1.5);
    shrubs.push({ c: sp.p.clone().addScaledVector(sp.n, r * 0.4), r: V3(r * 1.3, r * 0.6, r * 1.3), n: Math.round(4 + rng() * 4), light: (rng() - 0.5) * 0.15 });
  }
  const shrubMat = A.cardMaterial({ map: A.foliageAtlas({ kind: 'leaf', seed: 12 }), cells: 4, ramp: ['#33285a', '#5a5a52', '#a8a050', '#ffc878'], alt: '#ffb0a0', altAmt: 0.5, ink: '#1e1630', sway: 0.02 });
  pal.add(shrubMat.uniforms.uR0, ['#33285a', '#24224a', '#2e3e5a']); pal.add(shrubMat.uniforms.uR1, ['#5a5a52', '#3a3a62', '#4a6a5a']);
  pal.add(shrubMat.uniforms.uR2, ['#a8a050', '#5a5a7a', '#8ab06a']); pal.add(shrubMat.uniforms.uR3, ['#ffc878', '#a07898', '#f0e8a8']);
  group.add(A.cardInstances(shrubMat, A.foliageItems(rng, shrubs, { sun: V3(-0.45, 0.6, -1), size: 0.85 }), { base: false }));

  // ---------------------------------------------------------- far mountain ranges, both ends (lighter + pinker with distance)
  const ranges = [
    // upstream (toward the sun)
    { a0: -1.0, a1: 1.0, d0: 760, d1: 1150, H: 300, seed: 1, c: ['#9a5a78', '#5a3c6e', '#ffa070'] },
    { a0: -1.2, a1: 1.1, d0: 1350, d1: 2100, H: 560, seed: 2, c: ['#c07890', '#7a5288', '#ffb88a'] },
    { a0: -1.3, a1: 1.3, d0: 2400, d1: 3500, H: 980, seed: 3, c: ['#d898a8', '#a07aa6', '#ffd0a0'], sharp: 2.2 },
    // downstream (s35 looks this way)
    { a0: Math.PI - 1.1, a1: Math.PI + 1.1, d0: 700, d1: 1100, H: 240, seed: 4, c: ['#8a6a8a', '#5a4a78', '#ffb090'] },
    { a0: Math.PI - 1.3, a1: Math.PI + 1.3, d0: 1400, d1: 2400, H: 520, seed: 5, c: ['#b08aa8', '#806a9a', '#ffc8a0'] },
  ];
  const DUSKR = [['#5a3c78', '#3a2e66', '#c06a9a'], ['#6e4a86', '#4a3a78', '#c87aa8'], ['#8a6aa0', '#6a5890', '#d090b0'], ['#5a4a7a', '#3a3268', '#a07098'], ['#7a6a98', '#5a4e88', '#b088b0']];
  const DAWNR = [['#7a8ab0', '#5a6a98', '#ffe0b0'], ['#94a4c8', '#7484b0', '#fff0c8'], ['#b0c0de', '#94a4cc', '#fff4d8'], ['#8a94b8', '#6a7aa4', '#ffd8a8'], ['#a8b4d4', '#8a98c0', '#ffe8c0']];
  ranges.forEach((r, i) => {
    const g = rangeGeo({ centre: V3(0, 0, i < 3 ? Z0 + 200 : Z1 - 200), a0: r.a0, a1: r.a1, d0: r.d0, d1: r.d1, H: r.H, notch: i < 3 ? -0.06 : null, seed: r.seed, sharp: r.sharp ?? 1.6, base: -30 });
    const m = bindLight(A.paintedMaterial({ color: r.c[0], color2: r.c[0], shade: r.c[1], id: A.ID.PAINT, bands: true, varScale: 0.004, varAmt: 0.5, dab: 0.35,
      stroke: 1.2, strokeScale: 0.02, rim: 0.9, rimColor: r.c[2], rimWidth: 0.22, rimTop: 1 }), L);
    pal.add(m.uniforms.uColor, [r.c[0], DUSKR[i][0], DAWNR[i][0]]); pal.add(m.uniforms.uColor2, [r.c[0], DUSKR[i][0], DAWNR[i][0]]);
    pal.add(m.uniforms.uShadeC, [r.c[1], DUSKR[i][1], DAWNR[i][1]]); pal.add(m.uniforms.uRimCol, [r.c[2], DUSKR[i][2], DAWNR[i][2]]);
    const mesh = new THREE.Mesh(g, m); mesh.name = 'gorge_range_' + i; group.add(mesh);
  });

  // ---------------------------------------------------------- clouds: sunset cumulus (backlit, gold rims) + building storm
  const puffGeo = new THREE.IcosahedronGeometry(1, 3);
  const cuL = setLight(V3(-0.3, 0.25, -1));
  const cumuli = [[-0.62, 2600, 420, 700], [0.55, 2900, 520, 900], [-0.42, 3300, 360, 520], [0.95, 2200, 300, 420], [Math.PI - 0.4, 2400, 420, 640], [Math.PI + 0.6, 2700, 500, 760]];
  for (const [az, d, w, h] of cumuli) {
    const c0 = V3(Math.sin(az) * d, 140, (az > 2 ? Z1 - 200 : Z0 + 200) - Math.cos(az) * d);
    const m = bindLight(cloudMaterial({ color: '#ffc4a0', color2: '#ffb090', shade: '#b0608e', rimColor: '#fff0b8', rimWidth: 0.34, rimTop: 0.5,
      mass: [c0.x, c0.y + h * 0.4, c0.z, 0.6], massScale: [1, 0.55, 1] }), cuL);
    pal.add(m.uniforms.uColor, ['#ffc4a0', '#b07aa8', '#fff2e4']); pal.add(m.uniforms.uColor2, ['#ffb090', '#9a6aa0', '#f4e8f0']);
    pal.add(m.uniforms.uShadeC, ['#b0608e', '#5a4a8a', '#a8b0dc']); pal.add(m.uniforms.uRimCol, ['#fff0b8', '#ffb0a0', '#fff8e8']);
    group.add(puffs(puffGeo, m, cumulusList(rng, c0, w, h, 90)));
  }
  // storm: dark cumulonimbus masses over the upstream mountains; they grow + darken with dusk (s17)
  const storm = new THREE.Group(); storm.name = 'gorge_storm'; group.add(storm);
  const stL = setLight(V3(-0.5, 0.3, -0.6));
  for (const [az, d, w, h] of [[-0.2, 2300, 900, 1500], [0.3, 2500, 1000, 1700], [-0.7, 2000, 700, 1100], [0.75, 2100, 650, 1000]]) {
    const c0 = V3(Math.sin(az) * d, 60, Z0 + 200 - Math.cos(az) * d);
    const m = bindLight(cloudMaterial({ color: '#9a6a98', color2: '#8a5c90', shade: '#4a3a78', rimColor: '#ffb080', rimWidth: 0.26, rimTop: 0.7,
      mass: [c0.x, c0.y + h * 0.45, c0.z, 0.65], massScale: [1, 0.5, 1], stroke: 1.6 }), stL);
    pal.add(m.uniforms.uColor, ['#a8708e', '#4a4280', '#c8c8e8']); pal.add(m.uniforms.uColor2, ['#986890', '#3e3a74', '#b8bce0']);
    pal.add(m.uniforms.uShadeC, ['#5a4078', '#26245a', '#8a90c0']); pal.add(m.uniforms.uRimCol, ['#ffb080', '#c084b0', '#ffffff']);
    const g = new THREE.Group(); g.position.copy(c0);
    const list = cumulusList(rng, V3(), w, h, 140, { taper: 0.75, spread: 1.15 });
    for (let i = 0; i < 26; i++) list.push({ pos: V3((rng() - 0.5) * w * 2.4, h * lerp(0.86, 1.0, rng()), (rng() - 0.5) * w * 0.8), r: w * lerp(0.12, 0.22, rng()), sx: 2.0, sy: 0.4, sz: 1.2 });  // anvil top
    g.add(puffs(puffGeo, m, list)); storm.add(g);
  }
  S.storm = storm;
  return S;
}

// time of day: dusk k 0..1 (sunset -> dusk violet + storm built), dawn 0..1 (return flight)
const _v = V3();
export function applyGorge(S, dusk, dawn) {
  const k = Math.min(1, Math.max(0, dusk)), d = Math.min(1, Math.max(0, dawn));
  const w = [(1 - k) * (1 - d), k * (1 - d), d];
  S.pal.set(w);
  const su = S.sky.material.uniforms;
  _v.copy(S.SUN.sunset).multiplyScalar(w[0]).addScaledVector(S.SUN.dusk, w[1]).addScaledVector(S.SUN.dawn, w[2]).normalize();
  su.uDiskDir.value.copy(_v);
  su.uDiskR.value = 0.034 * (1 - smooth(0.25, 0.6, k * (1 - d)));
  // painted world light follows the sun (cheated higher so cliff planes read)
  S.L.uSunDir.value.set(lerp(-0.45, 0.45, d), lerp(0.22, 0.42, k) * (1 - d) + 0.32 * d, lerp(-1, 1, d)).normalize();
  S.L.uSunColor.value.setRGB(0, 0, 0);
  const sc = [new THREE.Color('#ffb27a').multiplyScalar(1.12), new THREE.Color('#a884b4').multiplyScalar(0.8), new THREE.Color('#ffe6c4').multiplyScalar(1.1)];
  for (let i = 0; i < 3; i++) S.L.uSunColor.value.r += sc[i].r * w[i], S.L.uSunColor.value.g += sc[i].g * w[i], S.L.uSunColor.value.b += sc[i].b * w[i];
  S.L.uAmbient.value.set('#8a80b8');
  // storm builds with dusk (absent at dawn)
  const b = (0.45 + 0.55 * smooth(0, 1, k)) * (1 - d);
  S.storm.visible = b > 0.01;
  S.storm.children.forEach((g, i) => { g.scale.set(0.8 + 0.2 * b, b, 0.8 + 0.2 * b); });
}
