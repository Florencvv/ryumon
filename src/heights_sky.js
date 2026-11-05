// heights_sky.js - SKY (dept HEIGHTS), round 2: two worlds in one set, switched by mode.
//  'storm' (s01, s32): inside a towering storm. A vertical tunnel around the y axis (x = z = 0, clear radius ~120 m) from
//     y -360 up to the cloud tops at y 1000 (opening widens above y 800), walled by stacked storm shelves (lumpy tori, one
//     mesh) with dark indigo bellies + mammatus pouches, a deeper wall at r ~520 behind them with rain
//     shafts hanging under them, cauliflower heads lit from the bright opening above, violet/cyan lightning-lit rims and
//     inner lightning flickering inside the walls; lightning (look.flash) relights everything.
//  'dawn'  (s33, s34): above the clouds at dawn, one continuous billowing sea of cumulus domes (tops ~y 940-1060, a lower
//     crater around the chimney where the dragon burst through): gold sun-lit faces,
//     lavender shade sides, gold rims toward the sun, layered and paler toward the horizon, towering cumulus, cirrus wisps;
//     the sun glow spreads across the tops. Rising sun low toward -z/+x, high cirrus.
import * as THREE from 'three';
import * as A from './anime/post.js';
import { V3, lerp, smooth, fbm, noise3, Palette, setLight, bindLight, puffs, cumulusList, heightsSky, hCloudMaterial } from './heights_lib.js';

export const CLOUD_TOP = 1000, CHIMNEY_R = 120;
export const DAWN_SUN = V3(0.42, 0.07, -1).normalize();
const FLASH_DIR = V3(-0.4, 0.5, 0.75).normalize();

// tunnel wall radius at (angle a, height y): stacked shelves bulging in (bellies underneath) + cauliflower billows
const LH = 150;
function tunnelR(a, y) {
  const cx = Math.cos(a), sz = Math.sin(a);
  const ph = 0.9 * fbm(cx * 0.9 + 3, sz * 0.9, 1.7, 3) + 0.15 * a / Math.PI;      // shelves wander + spiral a little
  const t = y / LH + ph, li = Math.floor(t), s = t - li;
  const amp = 50 + 60 * noise3(cx * 2.1 + li * 1.3, sz * 2.1, li * 0.7);
  const prof = s < 0.22 ? smooth(0, 0.22, s) : 1 - Math.pow(smooth(0.22, 1, s), 1.4);   // fast belly, slow taper up
  const R0 = 520 + 80 * fbm(cx * 1.3, sz * 1.3, y * 0.002, 2) + 200 * smooth(820, 1060, y);
  const P = V3(cx * 170, y, sz * 170);
  const b1 = Math.max(0, fbm(P.x / 90, P.y / 70, P.z / 90, 3) - 0.38) * 120;          // cauliflower heads
  const b2 = Math.max(0, noise3(P.x / 20 + 5, P.y / 18, P.z / 20) - 0.4) * 18;
  return Math.max(CHIMNEY_R * 0.82, R0 - amp * prof - b1 - b2);
}

export function buildSky(ctx, group) {
  const rng = ctx.rng(3303);
  const puffGeo = new THREE.IcosahedronGeometry(1, 3), puffLo = new THREE.IcosahedronGeometry(1, 2);
  const S = { group };

  // ============================================================ STORM
  const storm = new THREE.Group(); storm.name = 'sky_storm'; group.add(storm);
  const pal = new Palette(); S.stormPal = pal; S.stormClouds = [];
  const sky = heightsSky({ stops: [[-0.25, '#1e1a52'], [0.2, '#3c3480'], [0.6, '#8a6ab8'], [0.97, '#f0c0d4']], bank: 0, cirrus: 0, flashCol: '#e0d8ff', brush: 1.6 });
  const su = sky.material.uniforms;
  pal.add(su.uC0, ['#1e1a52', '#6a64c0']); pal.add(su.uC1, ['#3c3480', '#8a80d8']); pal.add(su.uC2, ['#8a6ab8', '#c0b0f4']); pal.add(su.uC3, ['#f0c0d4', '#fff0ff']);
  storm.add(sky); S.stormSky = sky;
  const L = setLight(V3(0.15, 1, 0.1)); S.stormL = L;           // light leaks down from the opening above
  const stormMat = (o = {}) => {
    const m = bindLight(hCloudMaterial({ color: '#c4acf0', shade: '#4c4296', belly: '#1c1850', rimColor: '#c4e2ff', rim: 0.9, rimWidth: 0.2, rimLit: 0.8, pointL: [0, 1500, 0, 1],
      flashCol: '#e4f0ff', flashDir: FLASH_DIR, inner: o.inner ?? 0.9, innerCol: '#e0d8ff', innerScale: o.innerScale ?? 0.012, farCol: '#2a2468', far0: 300, far1: 1600, farAmt: o.farAmt ?? 0.35,
      varScale: 0.012, strokeScale: 0.02, soft: 0.07, mid: 0.48, bellyAmt: 0.95, shafts: o.shafts ?? 0, mass: o.mass ?? [0, 0, 0, 0], massScale: [1, 0.7, 1],
      vertexColors: !!o.vc, side: THREE.DoubleSide }), L);
    pal.add(m.uniforms.uColor, ['#c4acf0', '#f4f0ff']); pal.add(m.uniforms.uShadeC, ['#4c4296', '#9088d8']);
    pal.add(m.uniforms.uBellyC, ['#1c1850', '#4a44a0']); pal.add(m.uniforms.uRimCol, ['#d8c4ff', '#ffffff']);
    S.stormClouds.push(m); return m;
  };
  // the tunnel wall: a closed, displaced cylinder seen from inside
  {
    const NA = 220, Y0 = -420, Y1 = 1060, NY = 300, P = [], C = [], idx = [];
    for (let j = 0; j <= NY; j++) {
      const y = lerp(Y0, Y1, j / NY);
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * Math.PI * 2, r = tunnelR(a, y);
        P.push(Math.cos(a) * r, y, Math.sin(a) * r);
        const v = lerp(0.42, 0.9, smooth(Y0, Y1, y)) * (0.92 + 0.16 * noise3(Math.cos(a) * 3, y * 0.01, Math.sin(a) * 3));
        C.push(v, v, v);
      }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(idx); g.computeVertexNormals();
    // normals toward the axis (we look at the wall from inside)
    const na = g.attributes.normal, pa = g.attributes.position, k = Math.floor(NY / 2) * (NA + 1) + 5;
    if (na.getX(k) * pa.getX(k) + na.getZ(k) * pa.getZ(k) > 0) { for (let i = 0; i < na.count; i++) na.setXYZ(i, -na.getX(i), -na.getY(i), -na.getZ(i)); for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); }
    const wall = new THREE.Mesh(g, stormMat({ vc: true, shafts: 1, inner: 0.9, innerScale: 0.008, farAmt: 0.2 })); wall.name = 'sky_tunnel'; wall.frustumCulled = false; storm.add(wall);
  }
  // the storm masses: stacked shelves around the clear tunnel, each a lumpy torus (continuous paint, no puff edges): dark
  // indigo bellies, lit inner lips + tops, silver linings against the bright opening above; gaps show the deeper wall behind
  {
    const NT = 240, NP = 36, P = [], C = [], idx = [];
    let base = 0;
    for (let j = 0; j < 14; j++) {
      const yj = -360 + j * 102 + lerp(-12, 12, rng()), aj = lerp(60, 95, rng()), bj = lerp(55, 75, rng());
      const Rj = CHIMNEY_R * 0.9 + aj + 40 * smooth(700, 1000, yj), sd = rng() * 100, v = lerp(0.62, 1.1, smooth(-420, 1060, yj));
      for (let it = 0; it <= NT; it++) {
        const th = (it / NT) * Math.PI * 2, cx = Math.cos(th), sz = Math.sin(th);
        const lump = 0.55 + 0.9 * fbm(cx * 2.6 + sd, sz * 2.6, j * 0.7, 3);               // big masses along the ring
        const yo = 22 * (fbm(cx * 1.6 + sd, sz * 1.6, 4.4, 2) - 0.5);
        for (let ip = 0; ip <= NP; ip++) {
          const ph = (ip / NP) * Math.PI * 2, cp = Math.cos(ph), sp = Math.sin(ph);
          // cauliflower: bumps grow on the upper + inner side, the belly stays smooth and flat-ish
          const up = Math.max(0, sp * 0.8 - cp * 0.5);
          const q = V3(cx * (Rj - aj * cp), yj + bj * sp, sz * (Rj - aj * cp));
          const dn = Math.max(0, -sp * 0.9 - cp * 0.3);                                      // mammatus pouches under the belly
          const bump = 1 + up * (0.7 * Math.max(0, fbm(q.x / 30 + sd, q.y / 26, q.z / 30, 3) - 0.3) + 0.3 * Math.max(0, noise3(q.x / 10, q.y / 10, q.z / 10) - 0.45))
            + dn * 0.45 * Math.max(0, noise3(q.x / 16 + sd, q.y / 40, q.z / 16) - 0.42);
          const flat = sp < 0 ? 0.8 : 1;
          const r = Rj - aj * lump * cp * bump, y = yj + yo + bj * lump * sp * bump * flat;
          P.push(cx * Math.max(CHIMNEY_R * 0.85, r), y, sz * Math.max(CHIMNEY_R * 0.85, r));
          const vv = v * (0.94 + 0.12 * noise3(cx * 4 + sd, sp * 2, sz * 4));
          C.push(vv, vv, vv);
        }
      }
      for (let it = 0; it < NT; it++) for (let ip = 0; ip < NP; ip++) {
        const a = base + it * (NP + 1) + ip, b = a + 1, c = a + NP + 1, d = c + 1; idx.push(a, c, b, b, c, d);
      }
      base += (NT + 1) * (NP + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const shelves = new THREE.Mesh(g, stormMat({ vc: true, inner: 0.8, shafts: 0.5 })); shelves.name = 'sky_shelves'; shelves.frustumCulled = false; storm.add(shelves);
  }
  const scud = [];
  for (let i = 0; i < 16; i++) {
    const y = lerp(-150, 980, rng()), a = rng() * Math.PI * 2, R = lerp(50, CHIMNEY_R - 20, rng());
    for (let k = 0; k < 4; k++) scud.push({ pos: V3(Math.sin(a) * R + (rng() - 0.5) * 16, y + (rng() - 0.5) * 4, Math.cos(a) * R + (rng() - 0.5) * 16), r: lerp(4, 9, rng()), sx: 2, sy: 0.5, sz: 1.3, col: new THREE.Color().setScalar(lerp(0.75, 1.05, smooth(-200, 1000, y))) });
  }
  // (no scud: puffs seen from below read as dark discs)
  // the storm top seen through the opening: anvil shelves leaning over the rim
  const anvil = [];
  for (let i = 0; i < 90; i++) { const a = rng() * Math.PI * 2, R = lerp(300, 900, rng()); anvil.push({ pos: V3(Math.cos(a) * R, lerp(1020, 1160, rng()), Math.sin(a) * R), r: lerp(80, 160, rng()), sx: 2, sy: 0.4, sz: 1.4, col: new THREE.Color().setScalar(1.15) }); }
  storm.add(puffs(puffLo, stormMat({ inner: 0.4 }), anvil));

  // ============================================================ DAWN
  const dawn = new THREE.Group(); dawn.name = 'sky_dawn'; group.add(dawn);
  const dsky = heightsSky({
    stops: [[-0.04, '#ffd48c'], [0.05, '#ffae8c'], [0.24, '#b0a2da'], [0.78, '#5a78c8']],
    sunDir: DAWN_SUN, diskR: 0.04, diskCol: '#fff6d8', haloCol: '#ffc070', halo: 0.85, bloom: 1.0,
    cirrus: 1, cirLit: '#fff0c8', cirShade: '#e0a0b8', cirScale: 1.1, cirAng: 0.5, bank: 0.55, bankCol: '#f0c0b0', bankRim: '#fff4d0', brush: 1.3,
  });
  dawn.add(dsky); S.dawnSky = dsky;
  const DL = setLight(V3(0.42, 0.42, -1)); DL.uSunColor.value.set('#ffe0aa'); DL.uAmbient.value.set('#a8a0d8'); S.dawnL = DL;
  const seaMat = (o = {}) => bindLight(hCloudMaterial({ color: '#fff2dc', shade: '#8c78c8', belly: '#7462b0', rimColor: '#fff4c4', rim: 1.0, rimWidth: 0.34, rimLit: 0.3,
    glow: o.glow ?? 0.9, glowCol: '#ffb860', glowDir: DAWN_SUN, farCol: '#f2c8cc', far0: o.far0 ?? 900, far1: o.far1 ?? 5000, farAmt: o.farAmt ?? 0.5,
    varScale: 0.01, strokeScale: 0.02, soft: 0.04, mid: 0.3, bellyAmt: 0.5, mass: o.mass ?? [0, 0, 0, 0], massScale: [1, 0.6, 1] }), DL);
  // the sea of clouds: one continuous billowing surface (rounded cumulus domes at three sizes, cauliflower on top of
  // cauliflower), polar mesh dense near the centre; lit as painted cloud: gold sun faces, lavender shade, rims, sun glow
  {
    const h2 = (i, j, k) => { let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    const domes = (x, z, cs, k, hk) => {   // max of rounded domes on a jittered grid of cell size cs
      const ci = Math.floor(x / cs), cj = Math.floor(z / cs); let best = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const I = ci + a, J = cj + b, cx = (I + 0.2 + 0.6 * h2(I, J, k)) * cs, cz = (J + 0.2 + 0.6 * h2(I, J, k + 1)) * cs;
        const r = cs * lerp(0.55, 0.95, h2(I, J, k + 2)), d = Math.hypot(x - cx, z - cz) / r;
        if (d < 1) best = Math.max(best, Math.sqrt(1 - d * d) * r * hk * lerp(0.5, 1.1, h2(I, J, k + 3)));
      }
      return best;
    };
    const NA = 520, NR = 230, R0 = 20, R1 = 5200, P = [], C = [], idx = [];
    for (let j = 0; j <= NR; j++) {
      const rr = j === 0 ? 0 : R0 * Math.pow(R1 / R0, (j - 1) / (NR - 1));   // ring 0 = the pole (no hole: a 20 m hole showed the gold sky below as a disc)
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * Math.PI * 2, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
        const swell = 70 * (fbm(x * 0.0012, z * 0.0012, 1, 3) - 0.5);
        const big = domes(x, z, 320, 11, 0.32), mid = domes(x, z, 120, 21, 0.55), sm = domes(x, z, 42, 31, 0.6);
        let h = Math.max(big, big * 0.7 + mid) ; h = Math.max(h, h * 0.85 + sm * smooth(0.15, 0.6, h / 120));
        const crater = smooth(90, 260, rr);                                            // where the dragon burst through
        const y = CLOUD_TOP - 60 + swell + h * (0.35 + 0.65 * crater);
        P.push(x, y, z);
        const v = lerp(0.82, 1.05, smooth(0, 120, h)) * (0.96 + 0.08 * noise3(x * 0.01, z * 0.01, 3));
        C.push(v, v, v);
      }
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const na = g.attributes.normal; if (na.getY(NA * 40 + 7) < 0) { for (let i = 0; i < na.count; i++) na.setXYZ(i, -na.getX(i), -na.getY(i), -na.getZ(i)); }
    const m = seaMat(); m.vertexColors = true; m.side = THREE.DoubleSide;
    const sea = new THREE.Mesh(g, m); sea.name = 'sky_sea'; sea.frustumCulled = false; dawn.add(sea);
  }
  // towering cumulus on the horizon (sun-side ones backlit with gold rims)
  for (const [az, d, w, h] of [[0.15, 3300, 700, 1300], [-0.55, 3000, 600, 1000], [0.95, 2800, 520, 900], [-1.4, 3400, 800, 1500], [2.4, 3100, 700, 1100], [-2.6, 2900, 600, 900], [1.9, 3600, 900, 1600]]) {
    const c0 = V3(Math.sin(az) * d, CLOUD_TOP - 60, -Math.cos(az) * d);
    const m = seaMat({ mass: [c0.x, c0.y + h * 0.4, c0.z, 0.7], farAmt: 0.45 });
    dawn.add(puffs(puffGeo, m, cumulusList(rng, c0, w, h, 160, { bumps: 3, col: (t) => new THREE.Color().setScalar(lerp(0.85, 1.08, t)) })));
  }
  S.mode = 'storm';
  return S;
}

export function applySky(S, mode, flash, t = 0) {
  S.mode = mode;
  S.group.children.forEach((c) => { if (c.name === 'sky_storm') c.visible = mode === 'storm'; if (c.name === 'sky_dawn') c.visible = mode === 'dawn'; });
  if (mode === 'storm') {
    const f = Math.min(1, Math.max(0, flash));
    S.stormPal.set([1 - f, f]);
    S.stormSky.material.uniforms.uFlash.value = f;
    S.stormL.uSunColor.value.set('#d0c0f4').lerp(new THREE.Color('#ffffff').multiplyScalar(1.4), f);
    S.stormL.uAmbient.value.set('#6a60b0');
    const t3 = A.onThrees ? A.onThrees(t) : t;
    for (const m of S.stormClouds) { m.uniforms.uFlash.value = f; m.uniforms.uInnerT.value = t3; }
  }
}
