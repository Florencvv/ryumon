// water_curtain.js - dept WATER: the colossal FALLS curtain, built at load time from ctx.api.heights (lip, face, tiers,
// teeth, pool) so it adapts to the cliff. Each column of water is followed from the lip down the face: it hugs the rock
// (never goes into it, recedes only slowly) and breaks white wherever the face juts out (tiers, ledges). Four layered sheets
// (solid back body + broken mid / front / veil), drawn streaks on threes, broken edges, side threads, a darker blue-green
// climbing lane behind Hi. Base: layered painted mist volumes (soft, alpha into the colour target only, sorted back to
// front), tier mist, ballistic spray streaks + wind-drifting spray.
import * as THREE from 'three';
import { OUT, BILL, fxShader, quadPool, mulberry, CLIP, V3 } from './fx_core.js';

// ---------------------------------------------------------------- column paths
// returns { rows: [{y, z: Float32Array(nCols), brk: Float32Array(nCols), s: Float32Array(nCols)}], xs, lipY, z0 }
function buildColumns(F, xs) {
  const nC = xs.length, rows = [];
  const lipY = F.lipY, clr = F.clear ?? 1.4, k = F.recede ?? 0.07;
  const face = (y, x) => F.faceZ(y, x);
  const z0 = xs.map((x) => face(lipY - 0.5, x) + clr);
  // run-in on top of the lip (water surface ~0.7 m above the rock) and the roll over the edge
  const runZ = [-16, -9, -4.5, -1.6, 0];
  const surfY = lipY + 0.7;
  for (const dz of runZ) rows.push({ y: surfY, dz, roll: true });
  const R = 3.2;
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; rows.push({ y: surfY - (1 - Math.cos(a)) * R, dz: Math.sin(a) * R, roll: true }); }
  const yTop = surfY - R;
  for (let y = yTop - 1.5; y > -4; y -= (y > lipY - 30 ? 1.5 : 2.2)) rows.push({ y, fall: true });
  rows[rows.length - 1].y = -4;
  const nR = rows.length;
  for (const r of rows) { r.z = new Float32Array(nC); r.brk = new Float32Array(nC); r.push = new Float32Array(nC); r.s = new Float32Array(nC); }
  for (let c = 0; c < nC; c++) {
    const x = xs[c];
    let zw = z0[c], prevY = surfY;
    for (let j = 0; j < nR; j++) {
      const r = rows[j];
      if (r.roll) { r.z[c] = z0[c] + r.dz; zw = r.z[c]; prevY = r.y; continue; }
      const dy = prevY - r.y; prevY = r.y;
      const free = zw - k * dy;                       // the water may only drift back slowly (it does not cling to overhangs)
      const tgt = face(r.y, x) + clr;
      if (tgt > free + 0.05) { r.push[c] = tgt - free; zw = tgt; } else zw = free;
      r.z[c] = zw;
    }
    // white water: below every push (decays over ~16 m) and a little above it (piling up)
    for (let j = 0; j < nR; j++) {
      const p = rows[j].push[c]; if (p <= 0.02) continue;
      const st = Math.min(1, 0.45 + p * 0.5);
      for (let i = 0; i < nR; i++) {
        const d = rows[j].y - rows[i].y;
        const f = d >= 0 ? Math.exp(-d / 18) : Math.exp(d / 7);
        rows[i].brk[c] = Math.max(rows[i].brk[c], st * f);
      }
    }
    // arc length
    let s = 0;
    for (let j = 0; j < nR; j++) {
      if (j > 0) s += Math.hypot(rows[j].z[c] - rows[j - 1].z[c], rows[j].y - rows[j - 1].y);
      rows[j].s[c] = s;
    }
  }
  return { rows, xs, lipY, surfY, z0 };
}

// ---------------------------------------------------------------- sheet shader
const CUR_VS = /* glsl */ `
attribute vec3 aSU;          // x: metres along the flow path, y: metres across, z: breaking white 0..1
varying vec3 vW; varying float vDepth; varying vec3 vSU; varying vec3 vN;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vSU = aSU; vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * wp; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }
`;
const CUR_FS = (NOISE) => /* glsl */ `
${NOISE}
${OUT}
varying vec3 vW; varying float vDepth; varying vec3 vSU; varying vec3 vN;
uniform float uT, uSpeed, uPat, uHW, uLipS, uLayer, uSeed, uId, uFlash, uK, uSolid, uLaneX, uLaneW, uFoot;
uniform vec3 uDeep, uMid, uCyan, uWhite, uInk, uFlashCol, uLane, uLane2;
uniform vec4 uTeeth[2];
void main(){
  clipBelow(vW.y);
  float u = vSU.y / uPat, s = vSU.x / uPat;
  float v = s - uT * uSpeed / uPat;
  float side = abs(vSU.y) / uHW;
  float lane = (1.0 - smoothstep(uLaneW * 0.5, uLaneW, abs(vSU.y - uLaneX) + (vnoise(vec2(vSU.x * 0.05, 2.0)) - 0.5) * uLaneW * 0.6)) * (1.0 - smoothstep(35.0, 90.0, vDepth));
  float rope = vnoise(vec2(u * 0.07 + uSeed, 1.3));                        // ropes of water: density varies across
  float s1 = vnoise(vec2(u * 0.3 + uSeed * 3.0, v * 0.009));
  float s2 = vnoise(vec2(u * 1.0 + uSeed, v * 0.024) + 3.0);
  float s3 = vnoise(vec2(u * 3.1, v * 0.05) + 9.0);
  float val = s1 * 0.52 + s2 * 0.3 + s3 * 0.18 + (rope - 0.5) * 0.5;
  // fine streaks that only exist up close (Hi-scale shots)
  float nearK = 1.0 - smoothstep(12.0, 40.0, vDepth);
  float fine = vnoise(vec2(vSU.y * 7.0 + uSeed, (vSU.x - uT * uSpeed) * 0.35));
  val += (fine - 0.5) * 0.35 * nearK;
  float nl = smoothstep(0.78, 0.8, vnoise(vec2(vSU.y * 2.6 + uSeed, (vSU.x - uT * uSpeed) * 0.09)));   // near drawn streak lines
  // drop clumps: elongated white capsules riding the flow
  vec2 cg = vec2(u / 4.0, v / 22.0); vec2 ci = floor(cg); vec2 cf = fract(cg) - 0.5;
  float hh = hash12(ci + uSeed * 7.0);
  float clump = step(0.72, hh) * (1.0 - smoothstep(0.1, 0.14, length((cf - (vec2(hash12(ci + 3.0), hash12(ci + 5.0)) - 0.5) * 0.5) * vec2(1.0, 0.3))));
  // lip roll: glassy band, white where the teeth split the flow
  float lip = 1.0 - smoothstep(uLipS, uLipS + 10.0, vSU.x);
  float teeth = 0.0;
  for(int i = 0; i < 2; i++){ vec4 T = uTeeth[i];
    teeth = max(teeth, 1.0 - smoothstep(1.2, 3.2, min(min(abs(vSU.y - T.x), abs(vSU.y - T.y)), min(abs(vSU.y - T.z), abs(vSU.y - T.w))))); }
  teeth *= 1.0 - smoothstep(uLipS - 2.0, uLipS + 26.0, vSU.x);
  val = mix(val, 0.5 + (s3 - 0.5) * 0.14, smoothstep(0.3, 0.7, lip) * (1.0 - teeth));
  // breaking white water over the tiers + foamier base
  float brk = vSU.z;
  float boil = vnoise(vec2(u * 0.9 + uSeed, v * 0.05 + uT * 0.5)) * 0.6 + vnoise(vec2(u * 2.6, v * 0.13) + 5.0) * 0.4;
  float foot = smoothstep(uFoot - 45.0, uFoot, vSU.x);
  float plume = vnoise(vec2(u * 0.55 + uSeed * 2.0, v * 0.012)) * 0.7 + vnoise(vec2(u * 1.7, v * 0.03) + 4.0) * 0.3;   // falling white tongues
  float bk = brk * smoothstep(0.3, 0.75, plume + brk * 0.25);
  val += (bk * 0.42 + teeth * 0.4 + foot * 0.16) * (0.6 + boil * 0.6);
  // the climbing lane: calmer, darker blue-green body
  val = mix(val, val * 0.55 + 0.08, lane * (1.0 - brk) * 0.85);
  // ragged side edges + broken bottom
  float edgeN = vnoise(vec2(v * 0.012, uSeed)) * (0.1 + uLayer * 0.06) + vnoise(vec2(v * 0.06, uSeed + 4.0)) * 0.07;
  if(side > 1.0 - edgeN) discard;
  float ropes = vnoise(vec2(u * 0.45 + uSeed * 5.0, v * 0.004));                  // broken edges: the outer water splits into ropes
  if(side > 0.7 && ropes < (side - 0.7) * (2.6 + uLayer * 0.5) - 0.05) discard;
  val -= smoothstep(1.0 - edgeN - 0.12, 1.0 - edgeN, side) * 0.3;
  float gapT = mix(0.5, 0.36, uK) + uLayer * 0.03;
  if(uSolid < 0.5 && val < gapT && clump < 0.5 && bk < 0.3) discard;   // front layers: gaps show the layer behind
  if(uLayer > 2.5 && lane > 0.3 && bk < 0.4) discard;                      // the veil never covers the lane
  vec3 deep = mix(uDeep, uLane2, lane), mid = mix(uMid, uLane, lane);
  vec3 c = deep;
  c = mix(c, mid, smoothstep(0.3, 0.31, val));
  c = mix(c, uCyan, smoothstep(0.5, 0.51, val) * (1.0 - lane * 0.7));
  float farK = smoothstep(60.0, 220.0, vDepth);
  float wh = max(smoothstep(0.71 + farK * 0.03, 0.72 + farK * 0.03, val), clump * (1.0 - lane) * (1.0 - farK * 0.5));
  float lines = smoothstep(0.89, 0.9, vnoise(vec2(u * 4.2 + uSeed, v * 0.006)));   // drawn white streak lines
  wh = max(wh, lines * smoothstep(0.36, 0.46, val) * (1.0 - lane * 0.6));
  float inkEdge = smoothstep(0.65, 0.66, val) - smoothstep(0.685, 0.69, val);       // drawn darker contour around the white
  c = mix(c, uInk, inkEdge * 0.5 * (1.0 - clump));
  c = mix(c, mix(mid, uCyan, 0.55 + 0.45 * (1.0 - lane)), nl * nearK * 0.85);
  // micro streaks for Hi-scale close-ups (cm wide, racing down on threes)
  float nearK2 = 1.0 - smoothstep(3.0, 12.0, vDepth);
  if(nearK2 > 0.0){
    float fl = vSU.x - uT * uSpeed;
    float m1 = vnoise(vec2(vSU.y * 24.0 + uSeed, fl * 0.5)) * 0.7 + vnoise(vec2(vSU.y * 60.0, fl * 1.2) + 3.0) * 0.3;
    float m2 = vnoise(vec2(vSU.y * 13.0 + 7.0, fl * 0.3));
    c = mix(c, mix(c, uCyan, 0.7), smoothstep(0.66, 0.68, m1) * nearK2);
    c = mix(c, c * 0.72, smoothstep(0.7, 0.72, m2) * nearK2 * 0.8);
    c = mix(c, uWhite, smoothstep(0.8, 0.81, m1) * nearK2 * (1.0 - lane * 0.5));
  }
  c = mix(c, uWhite, wh);
  // white water body: bubbly cream with blue shade pockets
  float bw = smoothstep(0.3, 0.55, bk + teeth * 0.5) * smoothstep(0.3, 0.45, boil + bk * 0.3);
  c = mix(c, mix(uWhite, uCyan, step(0.62, boil) * 0.5), bw);
  float hl = smoothstep(0.62, 0.66, vnoise(vec2(u * 0.35, 3.0))) * (1.0 - smoothstep(0.0, 0.05, abs(vSU.x - uLipS + 4.0) / 8.0 - 0.1));
  c = mix(c, uWhite, lip * max(hl, 0.0) * 0.8);
  c = mix(c, uWhite, clamp(vN.y, 0.0, 1.0) * 0.3 * lip);
  c = mix(c, c * 1.12 + uFlashCol * 0.12, uFlash);
  writeOut(c, wh * 0.2 + uFlash * 0.1, normalize((viewMatrix * vec4(vN, 0.0)).xyz), vDepth, uId);
}
`;

// one layer: columns cols.xs (c0..c1), offset in +out (m), bulge noise, widening toward the base
function curtainLayer(F, cols, o) {
  const { rows, xs } = cols, nR = rows.length, out = F.out, side = F.side;
  const c0 = o.c0 ?? 0, c1 = o.c1 ?? xs.length - 1, nx = c1 - c0;
  const rng = mulberry(o.seed ?? 5);
  const bump = Array.from({ length: 12 }, () => [rng() * 2 - 1, rng() * 6.28, 0.5 + rng() * 2]);
  const pos = [], nrm = [], su = [], idx = [];
  for (let j = 0; j < nR; j++) {
    const r = rows[j];
    const drop = Math.max(0, cols.surfY - r.y), fall = drop / cols.surfY;
    for (let c = c0; c <= c1; c++) {
      const x0 = xs[c];
      const x = x0 * (1 + fall * (o.spread ?? 0.05));
      let b = 0; for (const [a, ph, f] of bump) b += a * Math.sin(x0 * 0.06 * f + ph);
      const bulge = (o.offset ?? 0) + (o.bulge ?? 1.5) * (b / 4) * Math.min(1, drop / 40) + r.brk[c] * (o.brkOut ?? 1.5);
      const z = r.z[c] + bulge;
      const p = F.lip.clone().addScaledVector(side, x);
      pos.push(p.x + out.x * (z - F.lipZ), r.y, p.z + out.z * (z - F.lipZ));
      // normal in the (out, y) plane from the path tangent
      const jp = Math.max(j - 1, 0), jn = Math.min(j + 1, nR - 1);
      const ty = rows[jn].y - rows[jp].y, tz = rows[jn].z[c] - rows[jp].z[c], tl = Math.hypot(ty, tz) || 1;
      const nO = -ty / tl, nY = tz / tl;
      nrm.push(out.x * nO, nY, out.z * nO);
      su.push(r.s[c], x, r.brk[c]);
    }
  }
  const W = nx + 1;
  for (let j = 0; j < nR - 1; j++) for (let i = 0; i < nx; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aSU', new THREE.Float32BufferAttribute(su, 3));
  g.setIndex(idx);
  const pal = o.palette;
  const tz = (F.teeth ?? []).concat([1e4, 1e4, 1e4, 1e4, 1e4, 1e4, 1e4, 1e4]);
  const U = {
    uT: { value: 0 }, uSpeed: { value: o.speed }, uPat: { value: o.pat ?? 1.2 }, uHW: { value: Math.abs(xs[c1] - xs[c0]) / 2 * 1.04 }, uLipS: { value: rows[11].s[0] },
    uLayer: { value: o.layer ?? 0 }, uSeed: { value: o.seed ?? 1 }, uId: { value: 92 }, uFlash: { value: 0 }, uK: { value: 1 }, uSolid: { value: o.solid ? 1 : 0 },
    uLaneX: { value: o.laneX ?? 0 }, uLaneW: { value: o.laneW ?? 5 }, uFoot: { value: rows[nR - 1].s[Math.floor((c0 + c1) / 2)] },
    uTeeth: { value: [new THREE.Vector4(tz[0], tz[1], tz[2], tz[3]), new THREE.Vector4(tz[4], tz[5], tz[6], tz[7])] },
    uDeep: { value: new THREE.Color(pal.deep) }, uMid: { value: new THREE.Color(pal.mid) }, uCyan: { value: new THREE.Color(pal.cyan) },
    uWhite: { value: new THREE.Color(pal.white) }, uInk: { value: new THREE.Color(pal.ink) }, uFlashCol: { value: new THREE.Color('#d8ecff') },
    uLane: { value: new THREE.Color(pal.lane ?? '#1f5a72') }, uLane2: { value: new THREE.Color(pal.lane2 ?? '#123a52') },
  };
  U.uClip = CLIP;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: U, vertexShader: CUR_VS, fragmentShader: CUR_FS(o.NOISE), side: THREE.DoubleSide }));
  m.frustumCulled = false; m.name = 'water_curtain'; m.userData.U = U; m.userData.offset = o.offset ?? 0;
  return m;
}

export const CURTAIN_PAL = [
  { deep: '#0f2148', mid: '#21477e', cyan: '#5598d0', white: '#e8f6ff', ink: '#0f1f48', lane: '#1a4f6a', lane2: '#0f3148' },   // back body (solid)
  { deep: '#1b3768', mid: '#3168aa', cyan: '#7cc4ee', white: '#f0faff', ink: '#14275a', lane: '#1f5a76', lane2: '#123a52' },
  { deep: '#22457e', mid: '#3f80c2', cyan: '#94dcf6', white: '#ffffff', ink: '#182e68', lane: '#226680', lane2: '#14425a' },
  { deep: '#2c5694', mid: '#5598d4', cyan: '#b0e8fa', white: '#ffffff', ink: '#1c3474', lane: '#2a7088', lane2: '#184a62' },
];

// ---------------------------------------------------------------- painted mist volumes (soft, blended into colour only)
const VOL_VS = /* glsl */ `
${BILL}
attribute vec4 aC;   // centre xyz, radius (already animated in JS)
attribute vec4 aS;   // seed, tone (0 back .. 1 front), alpha, -
varying vec2 vQ; varying float vDepth; varying vec4 vS;
void main(){ vQ = position.xy; vS = aS; gl_Position = billboard(aC.xyz, vec2(aC.w), (aS.x - 0.5) * 0.8, position.xy, vDepth); }
`;
const VOL_FS = (NOISE) => /* glsl */ `
${NOISE}
${OUT}
varying vec2 vQ; varying float vDepth; varying vec4 vS;
uniform vec3 uLit, uShade, uDark, uFlashCol, uLightDir; uniform float uFlash, uT;
void main(){
  // cauliflower silhouette from 5 lobes, eroded rim; fake sphere normal for the painted light
  float d = 9.0; vec2 cen = vec2(0.0);
  for(int i = 0; i < 5; i++){ float a = vS.x * 20.0 + float(i) * 1.37; vec2 o = vec2(cos(a), sin(a) * 0.8 + 0.12) * 0.36 * (0.4 + 0.6 * hash12(vec2(vS.x, float(i))));
    float r = 0.5 + 0.16 * hash12(vec2(float(i), vS.x)); float dd = length(vQ - o) / r; if(dd < d){ d = dd; cen = o; } }
  float er = vnoise(vQ * 4.0 + vS.x * 9.0 + uT * 0.3) * 0.5 + vnoise(vQ * 9.0 - vS.x * 3.0) * 0.5;
  float a = (1.0 - smoothstep(0.55, 1.0, d + (er - 0.5) * 0.5)) * vS.z;
  if(a < 0.01) discard;
  vec2 lq = (vQ - cen) / 0.55; float lz = sqrt(max(0.0, 1.0 - dot(lq, lq)));
  vec3 n = normalize(vec3(lq, lz + 0.3));
  float L = dot(n, normalize(uLightDir)) * 0.5 + 0.5 + (er - 0.5) * 0.25;
  float band = smoothstep(0.38, 0.46, L) * 0.5 + smoothstep(0.62, 0.7, L) * 0.5;   // painted 3-tone with soft steps
  vec3 c = mix(uDark, uShade, smoothstep(0.0, 0.5, band));
  c = mix(c, uLit, smoothstep(0.5, 1.0, band));
  c = mix(c * 0.86, c, vS.y);                                                        // back layers a little darker / bluer
  c = mix(c, c * 1.1 + uFlashCol * 0.12, uFlash);
  oColor = vec4(c, a); oData = vec4(0.0);   // blended over the colour; data alpha 0 keeps depth / id underneath
}
`;
export class MistVolumes {
  // puffs: [{p: Vector3 base, r, rise, drift: Vector3 (m/s), life, ph, tone, alpha, grow}]
  constructor(NOISE, puffs, pal = {}) {
    this.puffs = puffs; const n = puffs.length; this.n = n;
    this.g = quadPool(n, { aC: [4], aS: [4] });
    this.U = { uLit: { value: new THREE.Color(pal.lit ?? '#e4ecff') }, uShade: { value: new THREE.Color(pal.shade ?? '#8e9ee0') }, uDark: { value: new THREE.Color(pal.dark ?? '#5a68b4') },
      uFlashCol: { value: new THREE.Color('#e0f0ff') }, uLightDir: { value: new THREE.Vector3(-0.3, 0.8, 0.5) }, uFlash: { value: 0 }, uT: { value: 0 } };
    const m = fxShader({ uniforms: this.U, vs: VOL_VS, fs: VOL_FS(NOISE), name: 'water_mistvol' });
    m.transparent = true; m.depthWrite = false; m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
    this.mesh = new THREE.Mesh(this.g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 20; this.mesh.userData.noRefract = true;
    this.tmp = puffs.map(() => ({ d: 0, c: [0, 0, 0, 0], s: [0, 0, 0, 0] }));
  }
  update(t, cam, on = 1, flash = 0) {
    const C = this.g.attributes.aC.array, S = this.g.attributes.aS.array, T = this.tmp, cp = cam.position;
    this.puffs.forEach((p, i) => {
      const k = ((t / p.life + p.ph) % 1 + 1) % 1;
      const x = p.p.x + p.drift.x * k * p.life, y = p.p.y + p.rise * k, z = p.p.z + p.drift.z * k * p.life;
      const r = p.r * (0.55 + (p.grow ?? 0.8) * k) * on;
      const fade = Math.min(1, k * 5) * (1 - Math.max(0, (k - 0.7) / 0.3));
      const o = T[i]; o.c[0] = x; o.c[1] = y; o.c[2] = z; o.c[3] = r; o.s[0] = p.seed; o.s[1] = p.tone; o.s[2] = p.alpha * fade; o.s[3] = 0;
      o.d = (x - cp.x) ** 2 + (y - cp.y) ** 2 + (z - cp.z) ** 2;
    });
    const order = T.map((o, i) => i).sort((a, b) => T[b].d - T[a].d);   // back to front
    order.forEach((i, j) => { C.set(T[i].c, j * 4); S.set(T[i].s, j * 4); });
    this.g.attributes.aC.needsUpdate = this.g.attributes.aS.needsUpdate = true;
    this.U.uT.value = t; this.U.uFlash.value = flash;
    this.mesh.visible = on > 0.01;
  }
}

// ---------------------------------------------------------------- underwater rock walls + boulders (FALLS pool, y < 0)
// Seen only from below (and dimly through the surface): stacked wet rock masses under the plunge line and along the
// basin, boulders on the bed. Painted material (Kuwahara) from the engine, cool blue palette, lit from above.
function rockBlob(rng, r, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, 2), P = g.attributes.position, v = new THREE.Vector3();
  const ph = [rng() * 9, rng() * 9, rng() * 9];
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).normalize();
    const n = 1 + 0.22 * Math.sin(v.x * 3.1 + ph[0]) * Math.sin(v.y * 2.7 + ph[1]) + 0.12 * Math.sin(v.z * 5.3 + ph[2]) * Math.cos(v.x * 4.1)
      + 0.06 * Math.sin(v.y * 9.0 + ph[0]);
    const flat = v.y > 0.55 ? 0.82 : 1;   // flattish tops (ledges catch the light)
    P.setXYZ(i, v.x * r * n * sx, v.y * r * n * sy * flat, v.z * r * n * sz);
  }
  g.computeVertexNormals();
  return g.index ? g.toNonIndexed() : g;
}
export function buildUnderRocks(A, F, pool, rng) {
  const geos = [], cols = [];
  const put = (g, x, y, z, ry, c1, c2) => {
    g.rotateY(ry); g.translate(x, y, z);
    const P = g.attributes.position, col = new Float32Array(P.count * 3), a = new THREE.Color(c1), b = new THREE.Color(c2);
    for (let i = 0; i < P.count; i++) { const k = Math.min(1, Math.max(0, (P.getY(i) + 24) / 26)); const c = a.clone().lerp(b, k); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); geos.push(g);
  };
  // stacked masses under the plunge line (the cliff foot continuing below the water)
  for (let i = 0; i < 26; i++) {
    const x = -F.width * 0.62 + F.width * 1.24 * (i + rng() * 0.6) / 26, z = F.footZ(x) + 2 + rng() * 9, by = pool.bedY(x, z);
    put(rockBlob(rng, 6 + rng() * 6, 1.3, 1.5, 1), x, by + 4 + rng() * 6, z, rng() * 6, '#1d2c66', '#5a78c0');
    if (rng() < 0.6) put(rockBlob(rng, 3 + rng() * 3, 1.2, 1.0, 1), x + (rng() - 0.5) * 8, by + 13 + rng() * 4, z + 2 + rng() * 4, rng() * 6, '#22346e', '#6a88cc');
  }
  // basin walls along the pool rim (below the water line) + boulders on the bed
  const c = pool.center, R = pool.radius;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rng() * 0.1, rr = R * (0.72 + rng() * 0.12);
    const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr * 0.85;
    if (z < F.footZ(x) - 4) continue;
    put(rockBlob(rng, 8 + rng() * 8, 1.4, 1.1, 1.2), x, -10 + rng() * 6, z, rng() * 6, '#1f3070', '#6684c8');
  }
  for (let i = 0; i < 110; i++) {
    const x = (rng() * 2 - 1) * F.width * 0.6, z = F.footZ(x) + 8 + rng() ** 1.5 * 80;
    const bedY = pool.bedY(x, z);
    put(rockBlob(rng, 1.2 + rng() ** 2 * 4.5, 1.2, 0.75, 1), x, bedY + 0.5, z, rng() * 6, '#22346e', '#7090d0');
  }
  if (!geos.length) return null;
  const pos = [], nrm = [], col = [];
  for (const g of geos) { pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); col.push(...g.attributes.color.array); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = A.paintedMaterial({ color: '#ffffff', shade: '#18245a', id: A.ID.GROUND, vertexColors: true, bands: true, varScale: 0.3, varAmt: 0.45, dab: 0.4 });
  const m = new THREE.Mesh(g, mat); m.name = 'water_under_rocks';
  return m;
}

// ---------------------------------------------------------------- the whole falls water (curtain + threads + mist + spray)
export function buildFallsWater(o) {
  const { NOISE, H, makeSpray } = o;
  const HL = H.fallsLip ?? {}, HFc = H.fallsFace ?? {};
  const lip = V3(HL.center, [0, 300, -120]);
  const out = V3(HL.flow, [0, 0, 1]).setY(0).normalize();
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), out).normalize();   // +x for flow +z
  const width = HL.width ?? 140, lipY = HL.y ?? lip.y;
  const faceFn = typeof HFc.z === 'function' ? HFc.z : (y) => lip.z - 1.2 - 12 * (1 - y / lipY);
  // face z in the lip frame (x across, measured along `out`): works for flow +z (the published frame)
  const F = { lip, out, side, lipY, lipZ: lip.z, width, teeth: HL.teeth ?? [], faceZ: (y, x) => faceFn(y, x), clear: 1.4, recede: 0.07 };
  const HW = width / 2 * 0.97, nCols = Math.max(48, Math.round(width / 1.6));
  const xs = Array.from({ length: nCols + 1 }, (_, i) => -HW + (2 * HW * i) / nCols);
  const cols = buildColumns(F, xs);
  const group = new THREE.Group(); group.name = 'water_falls';
  const layers = [
    { offset: 0, speed: 26, pat: 1.3, solid: true, bulge: 1.0, brkOut: 0.3, seed: 11 },
    { offset: 1.3, speed: 30, pat: 1.2, bulge: 1.6, brkOut: 0.6, seed: 16 },
    { offset: 2.6, speed: 34, pat: 1.1, bulge: 2.2, brkOut: 0.9, seed: 21 },
    { offset: 4.4, speed: 38, pat: 1.0, bulge: 3.0, brkOut: 1.3, seed: 27, c0: 2, c1: nCols - 2, spread: 0.08 },
  ];
  const sheets = layers.map((L, i) => curtainLayer(F, cols, { NOISE, ...L, layer: i, palette: CURTAIN_PAL[i] }));
  sheets.forEach((s) => group.add(s));
  // side threads: narrow broken ribbons peeling off both edges of the curtain
  const thrCols = [];
  for (const sgn of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x0 = sgn * (HW + 2.5 + i * 3.2 + (i % 2) * 1.3), w = 1.2 + (i % 3) * 0.8;
    thrCols.push([x0 - w / 2, x0 + w / 2]);
  }
  const threads = thrCols.map(([a, b], i) => {
    const c = buildColumns({ ...F, clear: 0.6 }, [a, (a + b) / 2, b]);
    const m = curtainLayer(F, c, { NOISE, offset: 0.2, speed: 22 + i * 2, pat: 0.6, bulge: 0.2, brkOut: 0.4, seed: 40 + i * 3, layer: 1, palette: CURTAIN_PAL[2], laneX: 1e4 });
    m.userData.U.uHW.value = Math.abs(b - a) / 2 * 1.1; m.userData.U.uK.value = 0.6;
    // the thread's across coordinate is centred on its own middle
    const su = m.geometry.attributes.aSU; for (let k = 0; k < su.count; k++) su.setY(k, su.getY(k) - (a + b) / 2);
    group.add(m); return m;
  });
  // foot line (where each column meets the pool) + tier lines (for mist)
  const last = cols.rows[cols.rows.length - 1];
  const footAt = (c) => lip.clone().addScaledVector(side, xs[c]).addScaledVector(out, last.z[c] + 2.6 - F.lipZ).setY(0);
  const footL = footAt(0), footR = footAt(nCols), footC = footAt(Math.floor(nCols / 2));
  const tiers = (H.fallsTiers ?? []).map((T) => T.y);
  // mist volumes: base bank, billowing column up the curtain, tier mist, drifting spray clouds
  const rng = mulberry(505), puffs = [];
  const add = (n, f) => { for (let i = 0; i < n; i++) puffs.push(f(i, rng)); };
  const at = (x, y, dz) => lip.clone().addScaledVector(side, x).addScaledVector(out, last.z[Math.round((x / HW * 0.5 + 0.5) * nCols)] + dz - F.lipZ).setY(y);
  const clampX = (x) => Math.max(-HW, Math.min(HW, x));
  add(46, (i, r) => ({ p: at(clampX((r() * 2 - 1) * HW * 1.1), 2 + r() * 8, 4 + r() * 26), r: 16 + r() * 18, rise: 18 + r() * 22, drift: new THREE.Vector3(0.8 + r() * 1.5, 0, 1 + r() * 2.5), life: 9 + r() * 5, ph: r(), tone: r() * 0.6, alpha: 0.7 + r() * 0.25, seed: r(), grow: 0.9 }));
  add(30, (i, r) => ({ p: at(clampX((r() * 2 - 1) * HW), 10 + r() * 30, 3 + r() * 8), r: 10 + r() * 12, rise: 50 + r() * 50, drift: new THREE.Vector3(0.6 + r(), 0, 0.5 + r()), life: 10 + r() * 6, ph: r(), tone: 0.3 + r() * 0.4, alpha: 0.45 + r() * 0.25, seed: r(), grow: 1.1 }));
  for (const ty of tiers) add(14, (i, r) => ({ p: at(clampX((r() * 2 - 1) * HW * 0.95), ty - 6 - r() * 10, 3 + r() * 4), r: 5 + r() * 7, rise: -8 - r() * 10, drift: new THREE.Vector3(1 + r(), 0, 0.6 + r()), life: 5 + r() * 3, ph: r(), tone: 0.5 + r() * 0.5, alpha: 0.5 + r() * 0.3, seed: r(), grow: 1.2 }));
  add(26, (i, r) => ({ p: at(clampX((r() * 2 - 1) * HW), 6 + r() * 20, 20 + r() * 30), r: 14 + r() * 16, rise: 30 + r() * 40, drift: new THREE.Vector3(4 + r() * 4, 0, 3 + r() * 3), life: 12 + r() * 6, ph: r(), tone: 0.6 + r() * 0.4, alpha: 0.35 + r() * 0.2, seed: r(), grow: 1.3 }));
  add(20, (i, r) => ({ p: at(clampX((r() * 2 - 1) * HW * 0.9), 1 + r() * 3, 8 + r() * 18), r: 8 + r() * 9, rise: 6 + r() * 6, drift: new THREE.Vector3(r() * 2 - 1, 0, 2 + r() * 2), life: 4 + r() * 2, ph: r(), tone: 0.85 + r() * 0.15, alpha: 0.85, seed: r(), grow: 0.7 }));
  const mist = new MistVolumes(NOISE, puffs, { lit: '#eef3ff', shade: '#8494d6', dark: '#45508e' });
  group.add(mist.mesh);
  // spray: ballistic white streaks from the foot + off each tier, drifting in the wind
  const emit = [];
  for (let i = 0; i < 6; i++) { const x = -HW + (2 * HW) * (i + 0.5) / 6; emit.push({ p: at(x, 2, 6), spread: new THREE.Vector3(HW / 6 + 3, 2, 6), vel: out.clone().multiplyScalar(10).add(new THREE.Vector3(2.5, 22, 0)), velJ: 10 }); }
  for (const ty of tiers) for (let i = 0; i < 4; i++) { const x = -HW + (2 * HW) * (i + 0.5) / 4; emit.push({ p: at(x, ty - 2, 3), spread: new THREE.Vector3(HW / 4, 1, 1.5), vel: out.clone().multiplyScalar(6).add(new THREE.Vector3(1.5, 5, 0)), velJ: 4 }); }
  const spray = makeSpray({ n: 1600, life: 2.4, width: 0.45, len: 0.06, seed: 23, emit });
  group.add(spray);

  // fallsAt(y, x, layer): point on the curtain face of a layer (Hi climbs at layer 2, the veil never covers the lane)
  const colAt = (x) => { const f = (x + HW) / (2 * HW) * nCols; return [Math.max(0, Math.min(nCols - 1, Math.floor(f))), Math.max(0, Math.min(1, f - Math.floor(f)))]; };
  const fallsAt = (y, x = 0, layer = 2) => {
    const R = cols.rows, L = layers[Math.min(Math.max(layer, 0), 3)];
    let j = R.findIndex((r) => !r.roll && r.y <= y); if (j < 1) j = Math.max(1, R.length - 1);
    const r1 = R[j - 1], r2 = R[j], a = (r1.y - y) / Math.max(r1.y - r2.y, 1e-4);
    const [c, f] = colAt(x);
    const zc = (r) => (r.z[c] * (1 - f) + r.z[c + 1] * f) + L.offset + (r.brk[c] * (1 - f) + r.brk[c + 1] * f) * L.brkOut;
    const z = zc(r1) * (1 - a) + zc(r2) * a;
    const pos = lip.clone().addScaledVector(side, x).addScaledVector(out, z - F.lipZ); pos.y = y;
    const ty = r1.y - r2.y, tz = zc(r1) - zc(r2), tl = Math.hypot(ty, tz) || 1;
    const normal = out.clone().multiplyScalar(ty / tl).add(new THREE.Vector3(0, -tz / tl, 0)).normalize();
    return { pos, normal, out: out.clone(), side: side.clone(), brk: r2.brk[c] };
  };
  const info = { lip: lip.clone(), out: out.clone(), width, height: lipY, foot: footC, footL, footR, side: side.clone(), tiers, laneX: 0 };
  function update(t3, flash, fk, cam) {
    for (const s of [...sheets, ...threads]) { const U = s.userData.U; U.uT.value = t3; U.uFlash.value = flash; s.visible = fk > 0.01; }
    for (const s of sheets) s.userData.U.uK.value = fk;
    spray.userData.U.uT.value = t3; spray.userData.U.uOn.value = fk; spray.userData.U.uFlash.value = flash;
    mist.update(t3, cam, fk, flash);
  }
  // underwater rock walls + boulders (only when the engine's painted material is available)
  let rocks = null;
  if (o.A?.paintedMaterial) {
    const footZ = (x) => { const [c, f] = colAt(Math.max(-HW, Math.min(HW, x))); return last.z[c] * (1 - f) + last.z[c + 1] * f; };
    const HP = H.fallsPool ?? {}, pc = V3(HP.center, [0, 0, -40]), pr = HP.radius ?? 150, pd = HP.depth ?? 24;
    const bedY = (x, z) => -pd * Math.min(1, Math.max(0, 1 - (Math.hypot(x - pc.x, (z - pc.z) * 0.85) - 30) / (pr - 20)));
    rocks = buildUnderRocks(o.A, { width, footZ }, { center: pc, radius: pr, bedY }, mulberry(808));
    if (rocks) group.add(rocks);
  }
  return { group, sheets, threads, mist, spray, rocks, fallsAt, info, cols, update, upperWidth: width * 1.08 };
}
