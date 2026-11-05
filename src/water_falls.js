// water_falls.js - dept WATER: falling water. One sheet builder serves the colossal FALLS curtain (layered sheets),
// the little POND inlet cascade and any spillway; plus the falls mist base (hard-edged puffs, painted id so the
// Kuwahara softens their rims), side/base spray streaks, and the stone spout's pouring rope.
// Drawn on threes: streak patterns jump by whole drawings (uT = onThrees(t)).
import * as THREE from 'three';
import { OUT, BILL, fxShader, quadPool, mulberry, CLIP } from './fx_core.js';

// ---------------------------------------------------------------- sheet (curtain / cascade)
const SHEET_VS = /* glsl */ `
attribute vec2 aSU;          // x: metres along the flow path, y: metres across
varying vec3 vW; varying float vDepth; varying vec2 vSU; varying vec3 vN;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vSU = aSU; vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * wp; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }
`;
const SHEET_FS = (NOISE) => /* glsl */ `
${NOISE}
${OUT}
varying vec3 vW; varying float vDepth; varying vec2 vSU; varying vec3 vN;
uniform float uT, uSpeed, uPat, uW, uLen, uLip0, uLip1, uLayer, uSeed, uId, uFlash, uK, uFoamBase, uOpaque, uSolid;
uniform vec3 uDeep, uMid, uCyan, uWhite, uInk, uFlashCol;
void main(){
  clipBelow(vW.y);
  float u = vSU.y / uPat, s = vSU.x / uPat;
  float v = s - uT * uSpeed / uPat;
  float side = abs(vSU.y) / (uW * 0.5);
  float rope = vnoise(vec2(u * 0.16 + uSeed, 1.3));                       // ropes of water: density varies across
  float s1 = vnoise(vec2(u * 0.33 + uSeed * 3.0, v * 0.011));
  float s2 = vnoise(vec2(u * 1.05 + uSeed, v * 0.028) + 3.0);
  float s3 = vnoise(vec2(u * 3.2, v * 0.05) + 9.0);
  float val = s1 * 0.55 + s2 * 0.3 + s3 * 0.15 + (rope - 0.5) * 0.45;
  // drop clumps: elongated white capsules riding the flow
  vec2 cg = vec2(u / 5.0, v / 26.0); vec2 ci = floor(cg); vec2 cf = fract(cg) - 0.5;
  float hh = hash12(ci + uSeed * 7.0);
  float clump = step(0.55, hh) * (1.0 - smoothstep(0.1, 0.14, length((cf - (vec2(hash12(ci + 3.0), hash12(ci + 5.0)) - 0.5) * 0.5) * vec2(1.0, 0.33))));
  // lip: water rolls over the edge (path metres uLip0..uLip1): smooth glassy band
  float lip = smoothstep(uLip0 - 2.0 * uPat, uLip0, vSU.x) * (1.0 - smoothstep(uLip1, uLip1 + 6.0 * uPat, vSU.x));
  val = mix(val, 0.52 + (s3 - 0.5) * 0.12, smoothstep(0.3, 0.6, lip));   // glassy roll: no gaps, one tone
  float bottom = 1.0 - smoothstep(uLen - 40.0 * uPat, uLen, vSU.x);         // foamier toward the base
  val += (1.0 - bottom) * uFoamBase * 0.35;
  // ragged side edges
  float edgeN = vnoise(vec2(v * 0.02, uSeed)) * 0.25 + vnoise(vec2(v * 0.09, uSeed + 4.0)) * 0.1;
  if(side > 1.0 - edgeN) discard;
  float sideFade = smoothstep(1.0 - edgeN - 0.25, 1.0 - edgeN, side);
  val -= sideFade * 0.25;
  float gapT = mix(0.38, 0.3, uK);
  if(uSolid < 0.5 && val < gapT && clump < 0.5) discard;                  // front layers: gaps show the layer behind
  vec3 c = uDeep;
  c = mix(c, uMid, smoothstep(0.3, 0.31, val));
  c = mix(c, uCyan, smoothstep(0.46, 0.47, val));
  float wh = max(smoothstep(0.62, 0.63, val), clump);
  float lines = smoothstep(0.84, 0.85, vnoise(vec2(u * 4.5 + uSeed, v * 0.007)));  // drawn white streak lines
  wh = max(wh, lines * smoothstep(0.35, 0.45, val));
  float inkEdge = smoothstep(0.585, 0.595, val) - smoothstep(0.615, 0.62, val);   // drawn darker contour around white
  c = mix(c, uInk, inkEdge * 0.55 * (1.0 - clump));
  c = mix(c, uWhite, wh);
  float hl = smoothstep(0.62, 0.66, vnoise(vec2(u * 0.35, 3.0))) * (1.0 - smoothstep(0.0, 0.05, abs(fract((vSU.x - uLip0) / max(uLip1 - uLip0, 1e-3) * 0.9) - 0.35)));
  c = mix(c, uWhite, lip * max(hl, 0.0));                                                   // highlight line along the roll
  c = mix(c, mix(uMid, uCyan, 0.5), lip * (1.0 - smoothstep(0.2, 0.9, clamp(vN.y, 0.0, 1.0))) * 0.0);
  // light: top of the roll catches the sky
  float up = clamp(vN.y, 0.0, 1.0);
  c = mix(c, uWhite, up * 0.35 * lip);
  c = mix(c, c * 1.5 + uFlashCol * 0.4, uFlash);
  writeOut(c, wh * 0.25 + uFlash * 0.3, normalize((viewMatrix * vec4(vN, 0.0)).xyz), vDepth, uId);
}
`;

// path in the (out, y) plane: run-in on top, quarter roll over the lip, then the falling jet (slight outward drift)
function sheetPath(o) {
  const pts = [], run = o.runIn, rr = o.roll, H = o.height, vh = o.throwSpeed ?? 3;
  const step = Math.max(o.height / 160, 0.01);
  for (let x = -run; x < 0; x += Math.max(run / 6, 0.01)) pts.push([x, 0]);
  const nR = 10;
  for (let i = 0; i <= nR; i++) { const a = (i / nR) * Math.PI / 2; pts.push([Math.sin(a) * rr, -(1 - Math.cos(a)) * rr]); }
  let y = rr;
  while (y < H + o.below) { y += step * (y < rr * 6 ? 0.5 : 1); const drop = y - rr; pts.push([rr + vh * Math.sqrt(2 * drop / 9.8) * o.drift, -y]); }
  const out = [{ p: pts[0], s: 0 }];
  for (let i = 1; i < pts.length; i++) out.push({ p: pts[i], s: out[i - 1].s + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) });
  return { pts: out, lip0: run, lip1: run + rr * Math.PI / 2 };
}

// makeSheet({lip: Vector3 (centre of the edge), out: Vector3 (horizontal flow dir over the edge), width, height, below,
//   runIn, roll, offset (metres in front of the lip, per layer), speed, pat, palette, solid, seed, id, segsX})
export function makeSheet(o) {
  o = { runIn: o.height * 0.04, roll: o.height * 0.015, below: 1, drift: 1, ...o };
  const path = sheetPath(o);
  const out = o.out.clone().setY(0).normalize(), side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), out).normalize();
  const nx = o.segsX ?? 24, P = path.pts, ny = P.length;
  const pos = [], nrm = [], su = [], idx = [];
  for (let j = 0; j < ny; j++) {
    const [a, b] = P[j].p;
    const pPrev = P[Math.max(j - 1, 0)].p, pNext = P[Math.min(j + 1, ny - 1)].p;
    const tx = pNext[0] - pPrev[0], ty = pNext[1] - pPrev[1], tl = Math.hypot(tx, ty) || 1;
    const nO = -ty / tl, nY = tx / tl;                 // normal in (out, y): faces outward/up
    const widen = 1 + Math.max(0, -b - o.roll) / Math.max(o.height, 1e-3) * (o.spread ?? 0.08);
    for (let i = 0; i <= nx; i++) {
      const w = (i / nx - 0.5) * o.width * widen;
      const bow = (o.bow ?? 0) * (1 - (2 * i / nx - 1) ** 2);   // curtain bows outward in the middle
      const off = (o.offset ?? 0) + bow;
      pos.push(o.lip.x + out.x * (a + off) + side.x * w, o.lip.y + b, o.lip.z + out.z * (a + off) + side.z * w);
      nrm.push(out.x * nO, nY, out.z * nO);
      su.push(P[j].s, w);
    }
  }
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aSU', new THREE.Float32BufferAttribute(su, 2));
  g.setIndex(idx);
  const pal = o.palette;
  const U = {
    uT: { value: 0 }, uSpeed: { value: o.speed }, uPat: { value: o.pat }, uW: { value: o.width * 1.1 }, uLen: { value: P[ny - 1].s },
    uLip0: { value: path.lip0 }, uLip1: { value: path.lip1 }, uLayer: { value: o.layer ?? 0 }, uSeed: { value: o.seed ?? 1 }, uId: { value: o.id ?? 92 },
    uFlash: { value: 0 }, uK: { value: 1 }, uFoamBase: { value: o.foamBase ?? 1 }, uSolid: { value: o.solid ? 1 : 0 }, uOpaque: { value: 1 },
    uDeep: { value: new THREE.Color(pal.deep) }, uMid: { value: new THREE.Color(pal.mid) }, uCyan: { value: new THREE.Color(pal.cyan) },
    uWhite: { value: new THREE.Color(pal.white) }, uInk: { value: new THREE.Color(pal.ink) }, uFlashCol: { value: new THREE.Color('#d8ecff') },
  };
  U.uClip = CLIP;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: U, vertexShader: SHEET_VS, fragmentShader: SHEET_FS(o.NOISE), side: THREE.DoubleSide }));
  m.frustumCulled = false; m.name = 'water_sheet';
  m.userData.path = path; m.userData.U = U;
  return m;
}

export const FALLS_PAL = [
  { deep: '#1d3266', mid: '#2f5a9c', cyan: '#6fb8e8', white: '#eefaff', ink: '#16285a' },   // back body (solid)
  { deep: '#24427e', mid: '#3a74b8', cyan: '#86d2f2', white: '#f2fcff', ink: '#1a2c64' },
  { deep: '#2a4c8a', mid: '#4a88c8', cyan: '#9ae0f8', white: '#ffffff', ink: '#1c3070' },
];
export const CASCADE_PAL = [
  { deep: '#3f8a7c', mid: '#6fb8a8', cyan: '#bfeee0', white: '#ffffff', ink: '#2c6a60' },
  { deep: '#4f9a8a', mid: '#88cbb8', cyan: '#d4f6ea', white: '#ffffff', ink: '#2c6a60' },
];

// ---------------------------------------------------------------- mist puffs (painted, hard 2-tone)
const PUFF_VS = /* glsl */ `
${BILL}
attribute vec4 aC;   // base x, y, z, radius
attribute vec4 aS;   // seed, phase, rise, drift
uniform float uT, uLife, uOn;
varying vec2 vQ; varying float vDepth; varying vec4 vS; varying float vK;
void main(){
  float k = fract(uT / uLife + aS.y);
  vK = k;
  vec3 c = aC.xyz + vec3(sin(aS.x * 40.0) * aS.w * k, aS.z * k, cos(aS.x * 31.0) * aS.w * k);
  float r = aC.w * (0.65 + 0.6 * k) * uOn;
  vQ = position.xy; vS = aS;
  gl_Position = billboard(c, vec2(r), (aS.x - 0.5) * 0.6, position.xy, vDepth);
}
`;
const PUFF_FS = (NOISE) => /* glsl */ `
${NOISE}
${OUT}
varying vec2 vQ; varying float vDepth; varying vec4 vS; varying float vK;
uniform vec3 uLit, uShade, uRimCol, uFlashCol; uniform float uFlash, uId, uT;
void main(){
  // cluster of 4 lobes -> cauliflower cloud silhouette
  float d = 9.0;
  for(int i = 0; i < 4; i++){ float a = vS.x * 20.0 + float(i) * 1.7; vec2 o = vec2(cos(a), sin(a)) * 0.38 * (0.5 + 0.5 * hash12(vec2(vS.x, float(i))));
    d = min(d, length(vQ - o) / (0.55 + 0.15 * hash12(vec2(float(i), vS.x)))); }
  d += (vnoise(vQ * 5.0 + vS.x * 9.0) - 0.5) * 0.18;
  float fadeK = smoothstep(0.75, 1.0, vK);
  if(d > 1.0 - fadeK * 0.9) discard;
  float lit = smoothstep(-0.03, 0.03, vQ.y + 0.28 + vQ.x * 0.12 + (vnoise(vQ * 2.2 + vS.x * 5.0) - 0.5) * 0.18);   // white puff, blue crescent underneath
  vec3 c = mix(uShade, uLit, lit);
  float edge = smoothstep(0.86, 0.9, d + fadeK * 0.9 * 0.0);
  c = mix(c, uShade * 0.82, edge * (1.0 - lit) * 0.9);                                       // drawn contour on the shade side
  c = mix(c, uRimCol, edge * lit * 0.7);
  c = mix(c, c * 1.4 + uFlashCol * 0.4, uFlash);
  writeOut(c, uFlash * 0.2, vec3(0.0, 0.0, 1.0), vDepth, uId);
}
`;
// makeMist({NOISE, base: Vector3 centre, along: Vector3 dir, length, depth, n, size, rise, life, palette, seed, id})
export function makeMist(o) {
  const n = o.n ?? 70, rng = mulberry(o.seed ?? 11);
  const aC = new Float32Array(n * 4), aS = new Float32Array(n * 4);
  const along = o.along.clone().normalize(), out = new THREE.Vector3(-along.z, 0, along.x);
  for (let i = 0; i < n; i++) {
    const a = (rng() - 0.5) * o.length, d = (rng() - 0.2) * o.depth, h = rng() * (o.height ?? 10);
    aC.set([o.base.x + along.x * a + out.x * d, o.base.y + h, o.base.z + along.z * a + out.z * d, o.size * (0.5 + rng())], i * 4);
    aS.set([rng(), rng(), o.rise * (0.6 + rng() * 0.8), o.size * 0.5 * rng()], i * 4);
  }
  const g = quadPool(n, { aC: [4, aC], aS: [4, aS] });
  const pal = o.palette ?? { lit: '#e6f0ff', shade: '#8fa4d8', rim: '#ffffff' };
  const U = { uT: { value: 0 }, uLife: { value: o.life ?? 4 }, uOn: { value: 1 }, uLit: { value: new THREE.Color(pal.lit) }, uShade: { value: new THREE.Color(pal.shade) },
    uRimCol: { value: new THREE.Color(pal.rim) }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color('#e0f0ff') }, uId: { value: o.id ?? 105 } };
  const m = new THREE.Mesh(g, fxShader({ uniforms: U, vs: PUFF_VS, fs: PUFF_FS(o.NOISE), name: 'water_mist' }));
  m.frustumCulled = false; m.userData.U = U;
  return m;
}

// ---------------------------------------------------------------- spray: ballistic streak drops (looping, seeded)
const SPRAY_VS = /* glsl */ `
${BILL}
attribute vec4 aC;   // origin xyz, seed
attribute vec4 aV;   // velocity xyz, life
uniform float uT, uOn, uW, uLen;
varying vec2 vQ; varying float vDepth; varying float vK;
void main(){
  float k = fract(uT / aV.w + aC.w); float tt = k * aV.w;
  vec3 p = aC.xyz + aV.xyz * tt + vec3(0.0, -4.9, 0.0) * tt * tt;
  vec3 v = aV.xyz + vec3(0.0, -9.8, 0.0) * tt;
  vec3 b = p - v * uLen;
  vK = k; vQ = position.xy;
  float w = uW * (1.0 - k * 0.6) * uOn;
  gl_Position = ribbon(b, p, w, position.xy, vDepth);
}
`;
const SPRAY_FS = /* glsl */ `
${OUT}
varying vec2 vQ; varying float vDepth; varying float vK;
uniform vec3 uCol, uCol2; uniform float uId, uFlash;
void main(){
  float tip = vQ.y * 0.5 + 0.5;                    // 0 tail .. 1 head
  float wdt = mix(0.15, 1.0, tip);
  if(abs(vQ.x) > wdt) discard;
  vec3 c = mix(uCol2, uCol, step(abs(vQ.x), wdt * 0.55));
  c = mix(c, vec3(1.0), uFlash * 0.5);
  writeOut(c, 0.2 + uFlash * 0.4, vec3(0.0, 0.0, 1.0), vDepth, uId);
}
`;
// makeSpray({emit: [{p: Vector3, spread: Vector3 half extents, vel: Vector3, velJ: number}], n, life, width, len, colors, seed})
export function makeSpray(o) {
  const n = o.n ?? 300, rng = mulberry(o.seed ?? 21);
  const aC = new Float32Array(n * 4), aV = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const e = o.emit[Math.floor(rng() * o.emit.length)];
    const sp = e.spread ?? new THREE.Vector3();
    aC.set([e.p.x + (rng() * 2 - 1) * sp.x, e.p.y + (rng() * 2 - 1) * sp.y, e.p.z + (rng() * 2 - 1) * sp.z, rng()], i * 4);
    const j = e.velJ ?? 2;
    aV.set([e.vel.x + (rng() * 2 - 1) * j, e.vel.y + rng() * j, e.vel.z + (rng() * 2 - 1) * j, (o.life ?? 1.4) * (0.6 + 0.8 * rng())], i * 4);
  }
  const g = quadPool(n, { aC: [4, aC], aV: [4, aV] });
  const U = { uT: { value: 0 }, uOn: { value: 1 }, uW: { value: o.width ?? 0.3 }, uLen: { value: o.len ?? 0.06 },
    uCol: { value: new THREE.Color(o.color ?? '#f4fcff') }, uCol2: { value: new THREE.Color(o.color2 ?? '#8fc8f0') }, uId: { value: o.id ?? 93 }, uFlash: { value: 0 } };
  const m = new THREE.Mesh(g, fxShader({ uniforms: U, vs: SPRAY_VS, fs: SPRAY_FS, name: 'water_spray' }));
  m.frustumCulled = false; m.userData.U = U;
  return m;
}

// ---------------------------------------------------------------- pour: a rope of water on a ballistic path (spout)
const POUR_VS = /* glsl */ `
attribute vec2 aSU;   // x: metres along, y: around (0..1)
varying vec3 vW; varying float vDepth; varying vec2 vSU; varying vec3 vN;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vSU = aSU; vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * wp; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }
`;
const POUR_FS = (NOISE) => /* glsl */ `
${NOISE}
${OUT}
varying vec3 vW; varying float vDepth; varying vec2 vSU; varying vec3 vN;
uniform float uT, uSpeed, uLen, uR, uId, uFlash;
uniform vec3 uDeep, uCyan, uWhite, uSunDir, uInk;
void main(){
  clipBelow(vW.y);
  float s = vSU.x / uR, a = vSU.y;
  float v = s - uT * uSpeed / uR;
  float st = vnoise(vec2(a * 9.0, v * 0.18)) * 0.6 + vnoise(vec2(a * 23.0, v * 0.5) + 3.0) * 0.4;
  float end = smoothstep(uLen * 0.75, uLen, vSU.x);                       // the rope breaks up before it lands
  if(st < 0.25 + end * 0.45) discard;
  vec3 V = normalize(cameraPosition - vW);
  float fres = 1.0 - abs(dot(vN, V));
  float lit = smoothstep(0.0, 0.1, dot(vN, normalize(uSunDir)) + (st - 0.5) * 0.4);
  vec3 c = mix(uDeep, uCyan, lit);
  float wh = smoothstep(0.62, 0.64, st) + smoothstep(0.55, 0.6, fres) * 0.0;
  c = mix(c, uWhite, clamp(wh, 0.0, 1.0));
  c = mix(c, uInk, smoothstep(0.82, 0.86, fres) * 0.6);                 // drawn edge
  c = mix(c, c * 1.4, uFlash);
  writeOut(c, wh * 0.3, normalize((viewMatrix * vec4(vN, 0.0)).xyz), vDepth, uId);
}
`;
// makePour({NOISE, from: Vector3, vel: Vector3, radius, speed, floorY, palette, sunDir})
export function makePour(o) {
  const pts = [], g9 = 9.8, floorY = o.floorY ?? 0;
  let p = o.from.clone(), v = o.vel.clone(), dt = 0.01;
  pts.push(p.clone());
  for (let i = 0; i < 2000 && p.y > floorY - 0.05; i++) { v.y -= g9 * dt; p = p.clone().addScaledVector(v, dt); pts.push(p); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const len = curve.getLength(), segs = Math.min(200, Math.max(16, Math.round(len / (o.radius * 0.6))));
  const R = o.radius, g = new THREE.TubeGeometry(curve, segs, R, 12, false);
  // widen toward the bottom (the stream spreads)
  const P = g.attributes.position, su = new Float32Array(P.count * 2), uv = g.attributes.uv;
  const cpts = curve.getSpacedPoints(segs);
  for (let i = 0; i < P.count; i++) {
    const j = Math.round(uv.getX(i) * segs), c = cpts[j];
    const k = 1 + uv.getX(i) * (o.spread ?? 0.8);
    P.setXYZ(i, c.x + (P.getX(i) - c.x) * k, c.y + (P.getY(i) - c.y) * k, c.z + (P.getZ(i) - c.z) * k);
    su[i * 2] = uv.getX(i) * len; su[i * 2 + 1] = uv.getY(i);
  }
  g.setAttribute('aSU', new THREE.BufferAttribute(su, 2));
  g.computeVertexNormals();
  const pal = o.palette ?? { deep: '#5fa8b0', cyan: '#c8f2ee', white: '#ffffff', ink: '#2f6f78' };
  const U = { uT: { value: 0 }, uSpeed: { value: o.speed ?? 2.5 }, uLen: { value: len }, uR: { value: R }, uId: { value: o.id ?? 94 }, uFlash: { value: 0 },
    uDeep: { value: new THREE.Color(pal.deep) }, uCyan: { value: new THREE.Color(pal.cyan) }, uWhite: { value: new THREE.Color(pal.white) }, uInk: { value: new THREE.Color(pal.ink) },
    uSunDir: { value: (o.sunDir ?? new THREE.Vector3(0.3, 0.6, -0.7)).clone().normalize() } };
  U.uClip = CLIP;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: U, vertexShader: POUR_VS, fragmentShader: POUR_FS(o.NOISE), side: THREE.DoubleSide }));
  m.frustumCulled = false; m.name = 'water_pour'; m.userData.U = U; m.userData.end = pts[pts.length - 1].clone(); m.userData.curve = curve;
  return m;
}
