// fx.js - dept WATER: drawn FX pools. Rain streaks, splash crowns (+ detached drops + foam ring), bubbles (drawn rings),
// sparkles (4-point stars), glow (hard-banded aura with rotating rays), gold scale wave (shell over any skinned/mesh
// target). Everything is computed from onThrees(t) and seeded rng: pure functions of time, hard edges, no blending.
import * as THREE from 'three';
import { OUT, BILL, fxShader, quadPool, mulberry, V3 } from './fx_core.js';

const DEAD = 'gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return;';

// ---------------------------------------------------------------- rain: world-stable streaks in a box around the camera
// Layered and fine: each layer is thin, low "alpha" (ordered 2x2 dither at the internal resolution: the S=2 downsample
// turns it into real 25/50/75 % coverage while the data target keeps a clean FX id, so the paint pass never smears it),
// tapered, per-drop angle, far layers fade into the haze colour.
const RAIN_VS = /* glsl */ `
${BILL}
attribute vec4 aS;
uniform float uT, uR, uH, uAmt, uLen, uPx, uResY, uWaterY, uSpeed, uNearCut, uHazeD;
uniform vec3 uWind;
varying vec2 vQ; varying float vDepth; varying float vB; varying float vHaze;
void main(){
  if(aS.w > uAmt){ ${DEAD} }
  float h1 = fract(aS.x * 7.13 + aS.z * 3.7), h2 = fract(aS.y * 5.31 + aS.w * 11.7);
  vec3 vel = vec3(uWind.x * (0.55 + 0.9 * h1) + (h2 - 0.5) * 1.2, -uSpeed * (0.85 + 0.3 * h2), uWind.z * (0.55 + 0.9 * h1));
  vec3 p = vec3(aS.x * 2.0 * uR, aS.y * uH, aS.z * 2.0 * uR) + vel * uT;
  p.xz = cameraPosition.xz + mod(p.xz - cameraPosition.xz + uR, 2.0 * uR) - uR;
  p.y = cameraPosition.y + mod(p.y - cameraPosition.y + uH * 0.5, uH) - uH * 0.5;
  if(p.y < uWaterY){ ${DEAD} }
  float cd = length(p - cameraPosition);
  if(cd < uNearCut){ ${DEAD} }
  vec4 A = viewMatrix * vec4(p, 1.0);
  float dz = max(-A.z, 0.1);
  float w = uPx * dz * 2.0 / (projectionMatrix[1][1] * uResY);
  vQ = position.xy; vB = h1; vHaze = smoothstep(uHazeD * 0.2, uHazeD, cd);
  gl_Position = ribbon(p - normalize(vel) * uLen * (0.6 + 0.8 * h2), p, w, position.xy, vDepth);
}
`;
const RAIN_FS = /* glsl */ `
${OUT}
varying vec2 vQ; varying float vDepth; varying float vB; varying float vHaze;
uniform vec3 uCol, uCol2, uHaze; uniform float uId, uFlash, uAlpha;
void main(){
  float along = vQ.y * 0.5 + 0.5;                                   // 0 tail .. 1 head
  if(abs(vQ.x) > 0.45 + 0.55 * along) discard;                      // tapered tail
  float a = uAlpha * (0.35 + 0.65 * along) * (1.0 - 0.6 * vHaze) * (1.0 + uFlash * 0.6);
  ivec2 ip = ivec2(gl_FragCoord.xy) & 1;
  float thr = (ip.x == 0 ? (ip.y == 0 ? 0.125 : 0.875) : (ip.y == 0 ? 0.625 : 0.375));
  if(a < thr) discard;
  vec3 c = mix(uCol2, uCol, step(0.5, vB));
  c = mix(c, uHaze, vHaze * 0.7);
  c = mix(c, vec3(1.0), uFlash * 0.5);
  writeOut(c, 0.05 + uFlash * 0.4, vec3(0.0, 0.0, 1.0), vDepth, uId);
}
`;
export function makeRain(o = {}) {
  const n = o.n ?? 4000, rng = mulberry(o.seed ?? 77), aS = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) aS[i] = rng();
  const g = quadPool(n, { aS: [4, aS] });
  const U = { uT: { value: 0 }, uR: { value: o.R ?? 12 }, uH: { value: o.H ?? 16 }, uAmt: { value: 0 }, uLen: { value: o.len ?? 0.9 }, uPx: { value: o.px ?? 1.0 },
    uResY: { value: 1040 }, uWaterY: { value: -1e4 }, uSpeed: { value: o.speed ?? 14 }, uWind: { value: new THREE.Vector3(...(o.wind ?? [1.5, 0, 0.8])) },
    uNearCut: { value: o.nearCut ?? 0 }, uHazeD: { value: o.hazeD ?? 1e5 }, uAlpha: { value: o.alpha ?? 0.5 },
    uCol: { value: new THREE.Color(o.color ?? '#d8ecff') }, uCol2: { value: new THREE.Color(o.color2 ?? '#9cc4f0') }, uHaze: { value: new THREE.Color(o.haze ?? '#7d8cc8') },
    uId: { value: 96 }, uFlash: { value: 0 } };
  const m = new THREE.Mesh(g, fxShader({ uniforms: U, vs: RAIN_VS, fs: RAIN_FS, name: 'fx_rain' }));
  m.frustumCulled = false; m.userData.U = U; m.userData.noRefract = true; m.userData.px = o.px ?? 1.0; m.renderOrder = 15;
  return m;
}
// gusts: short seeded bursts (0..1) on threes; rain is light most of the time and heavier only inside a gust
const GUSTS = (() => { const r = mulberry(909), out = []; for (let t = 0.3; t < 90; t += 3.2 + r() * 3.5) out.push([t, 0.6 + r() * 0.7, 0.6 + r() * 0.4]); return out; })();
export function rainGust(t) {
  let g = 0;
  for (const [t0, d, k] of GUSTS) { const x = (t - t0) / d; if (x > 0 && x < 1) g = Math.max(g, k * Math.sin(Math.PI * x) ** 0.7); }
  return g;
}

// ---------------------------------------------------------------- splash crown: petals (inked cel), drops, foam ring
const PET_VS = /* glsl */ `
attribute vec4 aP;   // angle, r1, r2, r3
attribute vec2 aQ;   // across -1..1, along 0..1
uniform float uK, uSize, uSeed, uOn, uLean;
uniform vec3 uAt;
varying vec2 vQ; varying float vDepth; varying vec3 vNV; varying float vR;
void main(){
  float k = uK;
  float ang = aP.x + uSeed;
  float rise = pow(sin(3.14159 * clamp(k * 1.25, 0.0, 1.0)), 0.7);
  float h = uSize * (0.55 + 0.6 * aP.y) * rise;
  float r0 = uSize * 0.2 * (1.0 + k * 1.4);
  float lean = (0.18 + k * 0.85) * uLean * (0.7 + 0.5 * aP.z);
  float t = aQ.y;
  float r = r0 + t * h * lean;
  float y = t * h * (1.0 - 0.35 * t * lean) - 0.01;
  float w = uSize * (0.16 + 0.1 * aP.w) * pow(1.0 - t, 0.7) * (1.0 - k * 0.35) * (1.0 + 0.8 * (1.0 - smoothstep(0.0, 0.3, t)));
  vec2 dir = vec2(cos(ang), sin(ang)), tan2 = vec2(-dir.y, dir.x);
  vec3 p = uAt + vec3(dir.x * r, y, dir.y * r) + vec3(tan2.x, 0.0, tan2.y) * aQ.x * w;
  p = mix(uAt, p, uOn);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDepth = -mv.z; vQ = aQ; vR = aP.y;
  vNV = normalize((viewMatrix * vec4(dir.x, 0.4, dir.y, 0.0)).xyz);
  gl_Position = projectionMatrix * mv;
}
`;
const PET_FS = (NOISE) => /* glsl */ `
${NOISE}
${OUT}
varying vec2 vQ; varying float vDepth; varying vec3 vNV; varying float vR;
uniform float uK, uId; uniform vec3 uWhite, uCyan, uDeep;
void main(){
  float brk = smoothstep(0.65, 1.0, uK);
  if(vnoise(vQ * vec2(3.0, 9.0) + vR * 20.0) < brk * 1.1 - 0.1 + vQ.y * brk * 0.5) discard;
  vec3 c = mix(uCyan, uWhite, smoothstep(0.3, 0.34, vQ.y + vQ.x * 0.15));
  if(!gl_FrontFacing) c = mix(uDeep, uCyan, smoothstep(0.55, 0.6, vQ.y));
  float hl = step(abs(vQ.x + 0.35), 0.12) * step(0.4, vQ.y) * step(vQ.y, 0.85);
  c = mix(c, vec3(1.0), hl);
  writeOut(c, 0.15, gl_FrontFacing ? vNV : -vNV, vDepth, uId + (gl_FrontFacing ? 0.0 : 0.15));
}
`;
const DROP_VS = /* glsl */ `
${BILL}
attribute vec4 aP;
uniform float uK, uSize, uSeed, uOn, uDur;
uniform vec3 uAt;
varying vec2 vQ; varying float vDepth;
void main(){
  float ang = aP.x + uSeed;
  vec2 dir = vec2(cos(ang), sin(ang));
  float tt = uK * uDur;
  float sp = uSize * (1.6 + 2.0 * aP.y);
  vec3 v = vec3(dir.x * sp * (0.35 + 0.5 * aP.z), sp * (1.2 + 0.8 * aP.w), dir.y * sp * (0.35 + 0.5 * aP.z));
  vec3 p = uAt + vec3(dir.x, 0.0, dir.y) * uSize * 0.25 + v * tt + vec3(0.0, -4.9, 0.0) * tt * tt;
  float r = uSize * (0.035 + 0.04 * aP.y) * uOn * step(0.0, p.y + 0.02);
  vQ = position.xy;
  gl_Position = billboard(p, vec2(r, r * (1.0 + 0.6 * aP.z)), atan(v.x, v.y - 9.8 * tt), position.xy, vDepth);
}
`;
const DROP_FS = /* glsl */ `
${OUT}
varying vec2 vQ; varying float vDepth;
uniform float uId; uniform vec3 uWhite, uCyan;
void main(){
  float d = length(vQ); if(d > 1.0) discard;
  vec3 c = mix(uWhite, uCyan, step(0.35, vQ.x - vQ.y * 0.3) * step(0.0, vQ.x));
  writeOut(c, 0.3, vec3(0.0, 0.0, 1.0), vDepth, uId);
}
`;
const RING_VS = /* glsl */ `
varying vec2 vP; varying float vDepth;
uniform float uK, uSize, uOn; uniform vec3 uAt;
void main(){
  vec3 p = uAt + vec3(position.x, 0.004, position.z) * uSize * (0.6 + 1.6 * uK) * uOn;
  vP = position.xz;
  vec4 mv = viewMatrix * vec4(p, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv;
}
`;
const RING_FS = (NOISE) => /* glsl */ `
${NOISE}
${OUT}
varying vec2 vP; varying float vDepth;
uniform float uK, uId, uSeed; uniform vec3 uWhite, uCyan;
void main(){
  float r = length(vP), a = atan(vP.y, vP.x);
  float n = vnoise(vec2(a * 4.0 + uSeed, r * 6.0)) * 0.6 + vnoise(vec2(a * 11.0, r * 14.0 + uSeed)) * 0.4;
  float band = 1.0 - smoothstep(0.0, 0.35, abs(r - 0.7));
  float f = band * (1.0 - uK * 0.8) - (1.0 - n) * 0.55;
  if(f < 0.12) discard;
  vec3 c = mix(uCyan, uWhite, step(0.22, f));
  writeOut(c, 0.1, vec3(0.0, 1.0, 0.0), vDepth, uId);
}
`;
export class Splashes {
  constructor(NOISE, n = 6) {
    this.group = new THREE.Group(); this.group.name = 'fx_splashes'; this.items = [];
    const NP = 16, NA = 6;
    // petals
    const pos = [], aP = [], aQ = [], idx = []; const rng = mulberry(31);
    for (let p = 0; p < NP; p++) {
      const ang = (p / NP) * Math.PI * 2 + (rng() - 0.5) * 0.25, r1 = rng(), r2 = rng(), r3 = rng(), b = pos.length / 3;
      for (let j = 0; j <= NA; j++) for (let s = 0; s < 2; s++) { pos.push(0, 0, 0); aP.push(ang, r1, r2, r3); aQ.push(s ? 1 : -1, j / NA); }
      for (let j = 0; j < NA; j++) { const a = b + j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 4));
    pg.setAttribute('aQ', new THREE.Float32BufferAttribute(aQ, 2)); pg.setIndex(idx);
    const ND = 22, dP = new Float32Array(ND * 4); for (let i = 0; i < ND; i++) dP.set([(i / ND) * Math.PI * 2 + rng() * 0.3, rng(), rng(), rng()], i * 4);
    const ring = new THREE.RingGeometry(0.2, 1.1, 48, 3); ring.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const U = { uK: { value: 0 }, uSize: { value: 0.3 }, uSeed: { value: i * 1.7 }, uOn: { value: 0 }, uLean: { value: 1 }, uDur: { value: 0.8 }, uAt: { value: new THREE.Vector3() },
        uId: { value: 30 }, uWhite: { value: new THREE.Color('#ffffff') }, uCyan: { value: new THREE.Color('#9fdcf0') }, uDeep: { value: new THREE.Color('#5fa4c8') } };
      const pet = new THREE.Mesh(pg, fxShader({ uniforms: U, vs: PET_VS, fs: PET_FS(NOISE), name: 'fx_crown' }));
      const UD = { ...U, uId: { value: 93 } };
      const drops = new THREE.Mesh(quadPool(ND, { aP: [4, dP] }), fxShader({ uniforms: UD, vs: DROP_VS, fs: DROP_FS, name: 'fx_drops' }));
      const UR = { ...U, uId: { value: 97 } };
      const rm = new THREE.Mesh(ring, fxShader({ uniforms: UR, vs: RING_VS, fs: RING_FS(NOISE), name: 'fx_foamring' }));
      for (const m of [pet, drops, rm]) { m.frustumCulled = false; m.visible = false; this.group.add(m); }
      this.items.push({ pet, drops, rm, U });
    }
  }
  // events [{t0, at, size, dur, lean, colors}]
  draw(events, t) {
    let i = 0;
    for (const e of events) {
      if (i >= this.items.length) break;
      const it = this.items[i++], U = it.U, dur = e.dur ?? 0.9;
      U.uK.value = Math.min(1, (t - e.t0) / dur); U.uSize.value = e.size ?? 0.3; U.uOn.value = 1; U.uDur.value = dur;
      U.uLean.value = e.lean ?? 1; U.uAt.value.copy(V3(e.at)); U.uAt.value.y = e.y ?? 0;
      it.pet.visible = it.drops.visible = it.rm.visible = true;
      it.pet.visible = e.crown !== false;
    }
    for (; i < this.items.length; i++) { const it = this.items[i]; it.pet.visible = it.drops.visible = it.rm.visible = false; }
  }
}

// ---------------------------------------------------------------- bubbles (drawn rings, JS-placed, pure in t)
const BUB_VS = /* glsl */ `
${BILL}
attribute vec4 aC;   // pos, radius
varying vec2 vQ; varying float vDepth;
void main(){ vQ = position.xy; gl_Position = billboard(aC.xyz, vec2(aC.w), 0.0, position.xy, vDepth); }
`;
const BUB_FS = /* glsl */ `
${OUT}
varying vec2 vQ; varying float vDepth;
uniform float uId; uniform vec3 uRim, uHi, uIn; uniform float uFill;
void main(){
  float d = length(vQ); if(d > 1.0) discard;
  float rim = step(0.74, d);
  vec2 h = vQ - vec2(-0.32, 0.36);
  float hl = step(length(h * vec2(1.0, 1.6)), 0.22) + step(length(vQ - vec2(0.38, -0.3)), 0.09);
  if(rim < 0.5 && hl < 0.5 && uFill < 0.5) discard;
  vec3 c = rim > 0.5 ? uRim : (hl > 0.5 ? uHi : uIn);
  if(hl > 0.5) c = uHi;
  writeOut(c, 0.15, vec3(0.0, 0.0, 1.0), vDepth, uId);
}
`;
export class Bubbles {
  constructor(n = 900) {
    this.n = n;
    this.g = quadPool(n, { aC: [4] }); this.g.instanceCount = 0;
    this.U = { uId: { value: 98 }, uRim: { value: new THREE.Color('#eafaff') }, uHi: { value: new THREE.Color('#ffffff') }, uIn: { value: new THREE.Color('#bfe8f4') }, uFill: { value: 0 } };
    this.mesh = new THREE.Mesh(this.g, fxShader({ uniforms: this.U, vs: BUB_VS, fs: BUB_FS, name: 'fx_bubbles' }));
    this.mesh.frustumCulled = false;
  }
  // events [{t0, at, n, spread, dur, size, rise, seed}], ambient {centre, n, box, bottom, top}
  draw(events, t, waterY, ambient) {
    const C = this.g.attributes.aC.array; let k = 0;
    const put = (x, y, z, r) => { if (k < this.n && y < waterY - r * 0.5) { C.set([x, y, z, r], k * 4); k++; } };
    for (const e of events) {
      const rng = mulberry(Math.floor(e.t0 * 1000) + (e.seed ?? 7)), at = V3(e.at), n = e.n ?? 24, sp = e.spread ?? 0.08, dur = e.dur ?? 1.6;
      const size = e.size ?? 1, rise = e.rise ?? 1;
      for (let i = 0; i < n; i++) {
        const ox = (rng() - 0.5) * 2 * sp, oy = (rng() - 0.5) * 2 * sp, oz = (rng() - 0.5) * 2 * sp, d = rng() * dur * (e.stagger ?? 0.4);
        const r = (0.004 + 0.02 * rng() ** 2) * size, vs = (0.25 + 0.6 * rng()) * rise * (0.6 + r * 30), ph = rng() * 6.28;
        const tt = t - e.t0 - d; if (tt < 0 || tt > dur - d) continue;
        const kick = e.kick ? V3(e.kick).multiplyScalar(Math.exp(-tt * 3) * 0.3) : null;
        put(at.x + ox + Math.sin(tt * 7 + ph) * 0.012 * (1 + tt) + (kick ? kick.x * tt : 0), at.y + oy + vs * tt + (kick ? kick.y * tt : 0),
          at.z + oz + Math.cos(tt * 6 + ph) * 0.012 * (1 + tt) + (kick ? kick.z * tt : 0), r * (1 + tt * 0.15));
      }
    }
    // churning columns: [{x, z, r, bottom, top, n, size, speed, seed}] bubbles spiral up a column, pure function of t
    for (const c of (ambient && ambient.columns) || []) {
      const rng = mulberry(c.seed ?? 99), H = c.top - c.bottom;
      for (let i = 0; i < c.n; i++) {
        const ph = rng(), a0 = rng() * 6.28, rr = c.r * Math.sqrt(rng()), vs = (c.speed ?? 1.2) * (0.6 + rng() * 0.8), sz = c.size * (0.25 + rng() ** 2 * 1.2);
        const k = (t * vs / H + ph) % 1, a = a0 + t * (0.8 + rng()) + k * 4;
        const w = rr * (0.6 + 0.6 * k);
        put(c.x + Math.cos(a) * w, c.bottom + k * H, c.z + Math.sin(a) * w, sz * (0.8 + 0.4 * k));
      }
    }
    if (ambient && ambient.n > 0) {
      const rng = mulberry(4242), B = ambient.box ?? 8, c = ambient.centre;
      for (let i = 0; i < ambient.n; i++) {
        const bx = rng() * 2 * B, bz = rng() * 2 * B, ph = rng(), vs = 0.2 + rng() * 0.4, r = 0.004 + 0.012 * rng() ** 2;
        const x = c.x + (((bx - c.x - B) % (2 * B)) + 2 * B) % (2 * B) - B, z = c.z + (((bz - c.z - B) % (2 * B)) + 2 * B) % (2 * B) - B;
        const H = (ambient.top ?? waterY) - ambient.bottom;
        const y = ambient.bottom + ((t * vs / H + ph) % 1) * H;
        put(x + Math.sin(t * 5 + ph * 20) * 0.01, y, z, r);
      }
    }
    this.g.instanceCount = k; this.g.attributes.aC.needsUpdate = true;
    this.mesh.visible = k > 0;
  }
}

// ---------------------------------------------------------------- sparkles (4-point stars)
const SPK_VS = /* glsl */ `
${BILL}
attribute vec4 aC; attribute vec4 aS;   // pos, size | rot, colour mix, -, -
varying vec2 vQ; varying float vDepth; varying vec4 vS;
void main(){ vQ = position.xy; vS = aS; gl_Position = billboard(aC.xyz, vec2(aC.w), aS.x, position.xy, vDepth); }
`;
const SPK_FS = /* glsl */ `
${OUT}
varying vec2 vQ; varying float vDepth; varying vec4 vS;
uniform float uId; uniform vec3 uA, uB;
void main(){
  vec2 q = abs(vQ);
  float s = max(step(q.x * 6.0 + q.y, 1.0), step(q.x + q.y * 6.0, 1.0)) + step(length(vQ), 0.2);
  float s2 = step(q.x * 3.0 + q.y * 3.0, 0.55);
  if(s + s2 < 0.5) discard;
  vec3 c = mix(uA, uB, vS.y);
  c = mix(c, vec3(1.0), step(length(vQ), 0.16));
  writeOut(c * 1.4, 2.0, vec3(0.0, 0.0, 1.0), vDepth - 0.05, uId);
}
`;
export class Sparkles {
  constructor(n = 600) {
    this.n = n; this.g = quadPool(n, { aC: [4], aS: [4] }); this.g.instanceCount = 0;
    this.U = { uId: { value: 99 }, uA: { value: new THREE.Color('#ffd25a') }, uB: { value: new THREE.Color('#fff8e0') } };
    this.mesh = new THREE.Mesh(this.g, fxShader({ uniforms: this.U, vs: SPK_VS, fs: SPK_FS, name: 'fx_sparkles' }));
    this.mesh.frustumCulled = false;
  }
  // events [{t0, at, n, speed, dur, size, mode: 'burst'|'aura', radius, gravity, seed}]
  draw(events, t) {
    const C = this.g.attributes.aC.array, S = this.g.attributes.aS.array; let k = 0;
    const f = Math.floor(t * 8 + 1e-4);
    for (const e of events) {
      const rng = mulberry(Math.floor(e.t0 * 997) + (e.seed ?? 3)), at = V3(e.at), n = e.n ?? 30, dur = e.dur ?? 1.2, size = e.size ?? 0.05;
      for (let i = 0; i < n && k < this.n; i++) {
        const dx = rng() - 0.5, dy = rng() - 0.5, dz = rng() - 0.5, dl = Math.hypot(dx, dy, dz) || 1, sp = (e.speed ?? 1) * (0.3 + rng()), d = rng() * dur * 0.3;
        const ph = rng(), twk = rng(), col = rng();
        const tt = t - e.t0 - d; if (tt < 0) continue;
        const life = (dur - d) * (0.6 + 0.4 * rng()); if (tt > life) continue;
        let x, y, z;
        if (e.mode === 'aura') {
          const R = (e.radius ?? 0.5) * (0.4 + 0.6 * rng());
          x = at.x + dx / dl * R; y = at.y + dy / dl * R + tt * 0.1; z = at.z + dz / dl * R;
        } else {
          const drag = (1 - Math.exp(-tt * 2.5)) / 2.5;
          x = at.x + dx / dl * sp * drag; y = at.y + dy / dl * sp * drag - (e.gravity ?? 0.3) * tt * tt; z = at.z + dz / dl * sp * drag;
        }
        const tw = ((f + Math.floor(twk * 7)) % 3);                    // twinkle on threes: big, small, off-ish
        const sz = size * (tw === 0 ? 1 : tw === 1 ? 0.55 : 0.3) * (1 - tt / life * 0.5);
        C.set([x, y, z, sz], k * 4); S.set([ph * 0.8 - 0.4, col, 0, 0], k * 4); k++;
      }
    }
    this.g.instanceCount = k; this.g.attributes.aC.needsUpdate = this.g.attributes.aS.needsUpdate = true;
    this.mesh.visible = k > 0;
  }
}

// ---------------------------------------------------------------- glow: hard-banded aura with rotating drawn rays
const GLOW_VS = /* glsl */ `
${BILL}
uniform vec3 uAt; uniform float uSize;
varying vec2 vQ; varying float vDepth;
void main(){ vQ = position.xy; gl_Position = billboard(uAt, vec2(uSize), 0.0, position.xy, vDepth); }
`;
const GLOW_FS = (NOISE) => /* glsl */ `
${NOISE}
${OUT}
varying vec2 vQ; varying float vDepth;
uniform float uK, uT, uId, uRays, uN, uRayW, uHole; uniform vec3 uCore, uMid, uOuter, uDisc;
void main(){
  float r = length(vQ), a = atan(vQ.y, vQ.x);
  float rot = floor(uT * 8.0) * 0.21;
  float N = uN; float ai = floor((a + rot) / 6.2831 * N);
  float rl = (0.45 + 0.5 * hash12(vec2(ai, floor(uT * 8.0)))) * uK * (mod(ai, 2.0) < 0.5 ? 1.0 : 0.62);
  float af = fract((a + rot) / 6.2831 * N) - 0.5;
  float ray = step(abs(af), uRayW * (1.0 - r / max(rl, 1e-3))) * step(r, rl) * uRays * step(uHole * uK, r);
  float rot2 = -rot * 0.7 + 0.13; float ai2 = floor((a + rot2) / 6.2831 * N * 1.5);
  float rl2 = (0.3 + 0.45 * hash12(vec2(ai2 + 50.0, floor(uT * 8.0)))) * uK;
  float af2 = fract((a + rot2) / 6.2831 * N * 1.5) - 0.5;
  float ray2 = step(abs(af2), uRayW * 0.6 * (1.0 - r / max(rl2, 1e-3))) * step(r, rl2) * uRays * step(0.5, uN / 20.0) * step(uHole * uK * 1.3, r);
  float core = step(r, uDisc.x * uK), mid = step(r, uDisc.y * uK), outer = step(r, uDisc.z * uK + (vnoise(vec2(a * 3.0, uT * 2.0)) - 0.5) * 0.05 * uK * step(0.01, uDisc.z));
  if(core + mid + outer + ray + ray2 < 0.5) discard;
  vec3 c = uOuter; if(ray2 > 0.5) c = uOuter * 1.2; if(ray > 0.5) c = uMid; if(outer > 0.5) c = uMid; if(mid > 0.5) c = mix(uMid, uCore, 0.6); if(core > 0.5) c = uCore;
  writeOut(c * 1.5, 3.0, vec3(0.0, 0.0, 1.0), vDepth - 0.1, uId);
}
`;
export class Glows {
  constructor(NOISE, n = 3) {
    this.items = []; this.group = new THREE.Group(); this.group.name = 'fx_glows';
    for (let i = 0; i < n; i++) {
      const U = { uAt: { value: new THREE.Vector3() }, uSize: { value: 1 }, uK: { value: 0 }, uT: { value: 0 }, uId: { value: 99 }, uRays: { value: 1 }, uN: { value: 14 }, uRayW: { value: 0.18 }, uHole: { value: 0 }, uDisc: { value: new THREE.Vector3(0.16, 0.3, 0.42) },
        uCore: { value: new THREE.Color('#ffffff') }, uMid: { value: new THREE.Color('#fff0b8') }, uOuter: { value: new THREE.Color('#ffc860') } };
      const m = new THREE.Mesh(quadPool(1, {}), fxShader({ uniforms: U, vs: GLOW_VS, fs: GLOW_FS(NOISE), name: 'fx_glow' }));
      m.geometry.instanceCount = 1; m.frustumCulled = false; m.visible = false; m.renderOrder = 18;
      this.group.add(m); this.items.push(m);
    }
  }
  draw(list, t) {
    let i = 0;
    for (const g of list) {
      if (i >= this.items.length) break;
      const m = this.items[i++], U = m.material.uniforms;
      U.uAt.value.copy(V3(g.at)); U.uSize.value = g.size ?? 1; U.uK.value = g.k; U.uT.value = t; U.uRays.value = g.rays === false ? 0 : 1; U.uN.value = g.n ?? 14; U.uRayW.value = g.rayW ?? 0.18; U.uHole.value = g.hole ?? 0; U.uDisc.value.set(...(g.disc ?? [0.16, 0.3, 0.42]));
      if (g.core) U.uCore.value.set(g.core); if (g.mid) U.uMid.value.set(g.mid); if (g.outer) U.uOuter.value.set(g.outer);
      m.visible = g.k > 0.001 && g.drawn !== false;
    }
    for (; i < this.items.length; i++) this.items[i].visible = false;
  }
}

// ---------------------------------------------------------------- gold scale wave: shell over a creature's meshes
const SHELL_VS = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform vec3 uAxis; uniform vec2 uRange; uniform float uPush;
varying float vAlong; varying vec2 vAr; varying float vDepth; varying vec3 vNV;
void main(){
  vec3 b1 = normalize(cross(uAxis, abs(uAxis.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0))), b2 = cross(uAxis, b1);
  vAlong = (dot(position, uAxis) - uRange.x) / (uRange.y - uRange.x);
  vec3 rp = position - uAxis * dot(position, uAxis);
  vAr = vec2(dot(position, uAxis), atan(dot(rp, b1), dot(rp, b2)));
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * uPush;
  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  vDepth = -mv.z; vNV = normalize(transformedNormal);
  gl_Position = projectionMatrix * mv;
}
`;
const SHELL_FS = /* glsl */ `
${OUT}
varying float vAlong; varying vec2 vAr; varying float vDepth; varying vec3 vNV;
uniform float uK, uWidth, uScale, uId; uniform vec3 uGold, uWhite;
void main(){
  float behind = uK - vAlong;
  if(behind < 0.0 || behind > uWidth) discard;
  vec2 g = vec2(vAr.x * uScale, vAr.y / 6.2831 * 10.0);
  g.x += mod(floor(g.y), 2.0) * 0.5;
  vec2 f = fract(g) - vec2(0.5, 0.0);
  float arc = abs(length(f * vec2(1.0, 1.3)) - 0.5);
  float front = step(behind, uWidth * 0.18);
  float lw = mix(0.06, 0.16, front);
  if(arc > lw && front < 0.5) discard;
  vec3 c = mix(uGold, uWhite, front * step(arc, 0.05));
  writeOut(c * 1.3, 1.5, vNV, vDepth, uId);
}
`;
export function scaleShell(target, o = {}) {
  const shells = [];
  target.updateMatrixWorld(true);
  target.traverse((src) => {
    if (!src.isMesh || src.userData.isShell || src.material?.name?.startsWith('fx_')) return;
    if (o.filter && !o.filter(src)) return;
    const g = src.geometry; g.computeBoundingBox();
    const bb = g.boundingBox, sz = bb.getSize(new THREE.Vector3());
    const ax = sz.x >= sz.y && sz.x >= sz.z ? new THREE.Vector3(1, 0, 0) : sz.y >= sz.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const lo = bb.min.dot(ax), hi = bb.max.dot(ax);
    const U = { uAxis: { value: o.axis ?? ax }, uRange: { value: new THREE.Vector2(o.reverse ? hi : lo, o.reverse ? lo : hi) }, uPush: { value: o.push ?? 0.002 },
      uK: { value: -1 }, uWidth: { value: o.width ?? 0.25 }, uScale: { value: o.scale ?? (8 / Math.max(hi - lo, 1e-3) * 4) }, uId: { value: 99 },
      uGold: { value: new THREE.Color(o.gold ?? '#ffcf4a') }, uWhite: { value: new THREE.Color('#fffbe8') } };
    const mat = fxShader({ uniforms: U, vs: SHELL_VS, fs: SHELL_FS, name: 'fx_scalewave', side: THREE.FrontSide, polygonOffset: -4 });
    let sh;
    if (src.isSkinnedMesh) { sh = new THREE.SkinnedMesh(g, mat); sh.bind(src.skeleton, src.bindMatrix); }
    else sh = new THREE.Mesh(g, mat);
    if (src.morphTargetInfluences) { sh.morphTargetInfluences = src.morphTargetInfluences; sh.morphTargetDictionary = src.morphTargetDictionary; }
    sh.userData.isShell = true; sh.frustumCulled = false; sh.visible = false; sh.renderOrder = 12;
    src.add(sh); shells.push(sh);
  });
  return {
    shells,
    set(k, opts = {}) { for (const s of shells) { s.visible = k >= 0 && k <= 1 + (opts.width ?? 0.25); s.material.uniforms.uK.value = k; if (opts.width) s.material.uniforms.uWidth.value = opts.width; } },
  };
}

// main.js loads 'fx' as its own department slot (after water): every FX lives in water.js's pools, nothing to do here.
export function create() { return { update() {} }; }
