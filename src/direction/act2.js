// direction/act2.js - DIRECTION B (RYUMON): shots s20-s39 = cameras (CAMS, on ones), colour script (LOOKS, merged
// over look.js + the departments' suggested looks) and choreography (ACT: Hi / dragon / heron / cat on twos, FX on threes).
// Everything is a pure function of film time. Paths are analytic so CAMS (evaluated before the departments) and ACT agree.
// s32 is the shot the s01 hook flashes forward to: it reuses A's s01 corkscrew + camera (imported CAMS.s01).
import * as THREE from 'three';
import { CAMS as CAMS_A } from './act1.js';   // s32 = the moment s01 flashes forward to: reuse A's s01 camera
import { rockGeo2, rockColor2, rockMaterial, bake, M4, mulb, mapleAtlas, taperTube } from '../vale_lib.js';   // s39 bank stones + branch

let C = null;                                   // ctx (set in create)
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lin = (a, b, x) => clamp((x - a) / (b - a));
const eio = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
const eo = (t) => 1 - Math.pow(1 - t, 3);
const ei = (t) => t * t * t;
const tw = (t) => Math.floor(t * 12 + 1e-6) / 12;           // characters on twos
const th = (t) => Math.floor(t * 8 + 1e-6) / 8;             // FX on threes
const F = (t) => Math.round(t * 24);
const hash = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const vl = (a, b, t) => a.clone().lerp(b, t);
const DEG = Math.PI / 180;
// camera shake on ones: decaying jitter after t0
function shake(t, t0, amp, dur = 0.4) {
  if (t < t0 || t > t0 + dur) return V();
  const f = F(t), k = amp * Math.pow(1 - (t - t0) / dur, 2);
  return V((hash(f) - 0.5) * k, (hash(f + 17) - 0.5) * k, (hash(f + 31) - 0.5) * k * 0.5);
}
// orient an object whose forward is +Z and up +Y
const _m = new THREE.Matrix4();
function orient(obj, fwd, up = V(0, 1, 0)) {
  const z = fwd.clone().normalize(); let x = new THREE.Vector3().crossVectors(up, z);
  if (x.lengthSq() < 1e-8) x = new THREE.Vector3().crossVectors(V(0, 0, 1), z);
  x.normalize(); const y = new THREE.Vector3().crossVectors(z, x);
  obj.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, z));
}
const cam = (pos, look, fov = 40, roll = 0, o = {}) => ({ pos, look, fov, roll, ...o });

// ------------------------------------------------------------------------------------------------ FALLS geometry
// fallsAt(y, x, layer) from WATER. Hi climbs just in front of layer 3 (the outermost sheet): nothing can cover it there.
function onCurtain(y, x = 0, out = 0.35) {
  const W = C?.api?.water;
  if (W?.fallsAt) { const f = W.fallsAt(y, x, 3); return { pos: f.pos.clone().addScaledVector(f.normal, out), n: f.normal.clone() }; }
  return { pos: V(x, y, -125 + y * 0.03 + out), n: V(0, 0, 1) };
}
// the flank (eye side) of a climbing Hi faces the camera side s (x-z): dorsal perpendicular to s, pointing away from the face
function flankUp(s) { const d = V(-s.z, 0, s.x); if (d.z < 0) d.negate(); return d.normalize(); }
const SIDE_L = V(-0.72, 0, 0.7).normalize();     // climb camera side: -x and out from the curtain (Hi's eye side)
const POOLHI = V(2.2, 0, -84);                  // where Hi sinks in the pool (deep water, 40 m out from the foot)
// set the camera from ACT (after the creatures are posed: anchors are exact)
function setCam(st, pos, look, fov, roll = 0, near) {
  st.cam.pos.copy(pos); st.cam.look.copy(look); st.cam.fov = fov; st.cam.roll = roll; if (near !== undefined) st.cam.near = near;
}

// ------------------------------------------------------------------------------------------------ Hi paths (absolute t)
// each returns {pos, fwd, up, pose, k, amp, phase}; positions continuous (camera-locked), poses / phases on twos
// s20 continues A's s19 (Hi ends at ~(7.0, 0.03, 75.2), nose up 38 deg, looking up at the falls)
function hiS20(t) {
  const bob = 0.01 * Math.sin(tw(t) * 4.0);
  return { pos: V(6.98, 0.035 + bob, 75.1), fwd: V(-0.12, 0.62 + 0.06 * sm(45.4, 46.2, t), -1), up: V(0, 1, 0.4), pose: 'rest', k: 0, amp: 0.3, phase: tw(t) * 1.1 };
}
// s21: frame 0 Hi already bursting out of the foam at the foot, onto the falling water, climbs ~40 m, pummelled, tumbles back
const S21 = { t0: 46.75, leap: 46.55, on: 47.2, hit: 48.6, end: 49.5, start: V(0.4, -0.1, -109.6), yOn: 9, yTop: 44 };
const s21x = (t) => 0.3 * Math.sin(t * 9) * (0.4 + lin(S21.on, S21.hit, t));
// drop after the hit: knocked off the face (first 0.45 s ~6 m, large near the camera), then falling away into the depth
const s21drop = (u) => 6.5 * Math.pow(Math.min(u, 0.5) / 0.5, 1.4) + 34 * Math.pow(Math.max(0, u - 0.5) / 0.5, 1.7);
function hiS21(t) {
  if (t < S21.on) {   // the leap started just before the cut (out of the boiling foot 4 m in front of the face): frame 0 = Hi airborne
    const u = lin(S21.leap, S21.on, t), b = onCurtain(S21.yOn).pos, a = onCurtain(0.5).pos.add(V(0.3, -0.6, 4.0));
    const p = vl(a, b, u); p.y += 3.5 * Math.sin(Math.PI * u);
    return { pos: p, fwd: V(-0.05, 1, -0.9 * (1 - u)), up: vl(V(0, 0.3, 1), flankUp(SIDE_L), u), pose: 'arc', k: 1 - u * 0.5, amp: 1.4, phase: tw(t) * 2.4 };
  }
  if (t < S21.hit) {
    const u = lin(S21.on, S21.hit, t), y = S21.yOn + (S21.yTop - S21.yOn) * (1 - Math.pow(1 - u, 1.7));
    const c = onCurtain(y, s21x(t));                     // fighting the water: wider wobble as it tires
    return { pos: c.pos, fwd: V(0.15 * Math.cos(t * 9), 1, 0), up: flankUp(SIDE_L), pose: 'S', k: 0.4 + 0.3 * u, amp: 2, phase: tw(t) * (3.6 - 1.4 * u) };
  }
  // pummelled: a slab of water knocks Hi off; it tumbles back down and away from the face
  const u = lin(S21.hit, S21.end, t), top = onCurtain(S21.yTop, s21x(S21.hit)).pos;
  const p = top.clone().add(V(0.4 * u, -s21drop(u), 1.6 * eo(u)));
  return { pos: p, fwd: V(0, 1, 0), up: flankUp(SIDE_L), pose: 'tumble', k: ((tw(t) - S21.hit) * 1.7) % 1, amp: 0.4, phase: tw(t) * 2, falling: true };
}
// underwater: sinking (s22) -> waking (s24) -> the run (s25)
function hiS22(t) {
  const u = lin(49.5, 52, t);
  return { pos: V(POOLHI.x - 0.25 * u, -1.4 - 3.6 * eo(u), POOLHI.z + 0.3 * u), fwd: V(1, -0.2 - 0.25 * u, 0.15), up: V(0.1, 1, 0), pose: 'sink', k: sm(0, 0.6, u), amp: 0.12, phase: tw(t) * 0.35 };
}
function hiS24(t) {
  const u = lin(54, 55.25, t);
  return { pos: V(POOLHI.x - 0.25, -5.0 + 0.12 * sm(0.4, 1, u), POOLHI.z + 0.3), fwd: V(1, -0.45 + 0.4 * sm(0.3, 0.8, u), 0.15), up: V(0.1, 1, 0), pose: 'sink', k: 1 - sm(0.35, 0.9, u), amp: 0.12 + 0.3 * sm(0.5, 1, u), phase: tw(t) * 0.6 };
}
// s25: dive deep along +x, U-turn at the bottom, rocket straight up to the surface
const S25 = { t0: 55.25, dive: 55.42, turn: 56.05, up: 56.38, end: 57.5 };
const P25 = { a: V(POOLHI.x - 0.25, -4.88, POOLHI.z + 0.3), b: V(POOLHI.x + 5.0, -12.5, POOLHI.z - 2.2), c: V(POOLHI.x + 5.9, -12.8, POOLHI.z - 2.5), d: V(POOLHI.x + 6.1, -0.6, POOLHI.z - 2.9) };
function hiS25(t) {
  if (t < S25.dive) return { pos: P25.a.clone(), fwd: V(1, 0.1, 0.15), up: V(0, 1, 0), pose: 'C', k: sm(S25.t0, S25.dive, t) * 0.8, amp: 0.3, phase: tw(t) };
  if (t < S25.turn) {
    const u = eio(lin(S25.dive, S25.turn, t)), p = vl(P25.a, P25.b, u); p.y += -1.0 * Math.sin(Math.PI * u);
    return { pos: p, fwd: P25.b.clone().sub(P25.a).normalize().add(V(0, -0.2, 0)), up: V(0, 1, 0), pose: 'S', k: 0.3, amp: 1.8, phase: tw(t) * 3.4 };
  }
  if (t < S25.up) {     // U-turn
    const u = lin(S25.turn, S25.up, t), p = vl(P25.b, P25.c, u); p.y -= 0.5 * Math.sin(Math.PI * u);
    const fwd = V(Math.cos(u * Math.PI * 0.5), Math.sin(u * Math.PI * 0.5) * 1.2 - 0.2, -0.1);
    return { pos: p, fwd, up: V(-fwd.y, fwd.x, 0), pose: 'C', k: Math.sin(Math.PI * u), amp: 1.2, phase: tw(t) * 2.5 };
  }
  const u = lin(S25.up, S25.end, t), e = Math.pow(u, 1.5), p = vl(P25.c, P25.d, e);
  return { pos: p, fwd: V(0.03, 1, -0.05), up: V(-1, 0, 0.2), pose: 'S', k: 0.25, amp: 2, phase: tw(t) * 4.2 };
}
// the big climb s26 -> s28 (heights continuous across the cuts)
const S26 = { t0: 57.5, breach: 57.36, on: 57.86, end: 61.0, y0: 8, y1: 92 };
const s26start = () => onCurtain(0.5).pos.add(V(0.3, -0.6, 4.0)).setY(-0.6);      // 4 m out from the face, in the boiling foot
const s26up = (t) => vl(flankUp(SIDE_L), V(0.3, 0, 1).normalize(), sm(58.7, 59.9, t));
function hiS26(t) {
  if (t < S26.breach) {
    const u = lin(S26.t0, S26.breach, t);
    return { pos: s26start().add(V(0, 0.55 - 0.05 * (1 - u), 0)), fwd: V(0, 1, -0.3), up: V(0, 0, 1), pose: 'S', k: 0.2, amp: 2, phase: tw(t) * 4 };
  }
  if (t < S26.on) {
    const u = lin(S26.breach, S26.on, t), b = onCurtain(S26.y0).pos;
    const p = vl(s26start(), b, u); p.y += 3.5 * Math.sin(Math.PI * u);
    return { pos: p, fwd: V(0, 1, -0.6 * (1 - u)), up: vl(V(0, 0.3, 1), flankUp(SIDE_L), u), pose: 'arc', k: 1, amp: 1, phase: tw(t) * 2 };
  }
  const u = lin(S26.on, S26.end, t), y = S26.y0 + (S26.y1 - S26.y0) * (0.5 * u + 0.5 * u * u);
  const x = 0.3 * Math.sin(t * 7.3), c = onCurtain(y, x);
  return { pos: c.pos, fwd: V(0.12 * Math.cos(t * 7.3), 1, 0), up: s26up(t), pose: 'S', k: 0.35, amp: 2, phase: tw(t) * 4 };
}
// s27: the log; Hi climbs 124 -> 166, dodges right at CUES.log (61.6) with a 2-frame smear
const SIDE27 = V(-0.55, 0, 0.83).normalize();
const S27 = { t0: 61.0, dodge0: 61.46, dodge1: 61.58, end: 63.0 };
const s27Y = (t) => 150 + 12 * eo(lin(61.0, 61.45, t)) + 26 * sm(61.8, 63.0, t);
function hiS27(t) {
  const x = 2.4 * sm(S27.dodge0, S27.dodge1, t) - 0.25 * Math.sin(lin(S27.dodge1, S27.dodge1 + 0.4, t) * Math.PI);
  const c = onCurtain(s27Y(t), x);
  const dodging = t >= S27.dodge0 && t < S27.dodge1 + 0.1;
  return { pos: c.pos, fwd: V(dodging ? 0.6 : 0.08 * Math.sin(t * 6), 1, 0), up: flankUp(SIDE27), pose: dodging ? 'C' : 'S', k: dodging ? 0.9 : 0.35, amp: dodging ? 1 : 1.8, phase: tw(t) * 3.6 };
}
function logS27(t) {   // falling with the water, tumbling in the curtain plane
  const y = 163 + 42 * (61.62 - t) - 8 * (t - 61.62) * Math.abs(t - 61.62);
  const c = onCurtain(Math.max(y, 1), 0.2, 1.0);
  return { pos: c.pos, ang: 1.4 * (t - 61.62), spin: 0.9 * (t - 61.0) };
}
// s28: exhausted near the top; crown ignites at CUES.push (64.6); the final push
const S28 = { t0: 63.0, stall: 64.4, push: 64.6, go: 64.8, end: 65.5 };
function hiS28Y(t) {
  const grind = 268 + 11 * lin(63.0, 64.4, tw(t)) + 0.3 * Math.sin(tw(t) * 13) * (t < S28.stall ? 1 : 0);   // slow grind on twos
  return grind + 14 * ei(lin(S28.go, S28.end, t));
}
function hiS28(t) {
  const y = hiS28Y(t), x = lerp(2.4, 0.9, sm(63, 65.5, t)), c = onCurtain(y, x);
  const pushing = t >= S28.go;
  return { pos: c.pos, fwd: V(pushing ? 0 : 0.18 * Math.sin(tw(t) * 4), 1, 0), up: c.n.clone().add(V(0.9, 0, 0)), pose: pushing ? 'S' : 'rest', k: pushing ? 0.45 : 0, amp: pushing ? 2 : 0.9, phase: tw(t) * (pushing ? 4.4 : 1.6) };
}
// s29: coil, leap over the lip into the storm; the bolt hits at CUES.gate
const S29 = { t0: 65.5, coil: 65.62, strike: 65.875, peak: 65.96, end: 67.0 };
const P29top = V(0.6, 318, -118.5);
function hiS29(t) {
  const base = onCurtain(293, 0.9).pos;
  if (t < S29.coil) return { pos: base, fwd: V(0, 1, 0), up: V(0.6, 0, 1), pose: 'C', k: sm(S29.t0, S29.coil, t), amp: 0.5, phase: tw(t) * 2 };
  if (t < S29.peak) {
    const u = eo(lin(S29.coil, S29.peak, t)), p = vl(base, P29top, u); p.z += 2.0 * Math.sin(Math.PI * u);
    return { pos: p, fwd: V(0, 1, -0.25 * u), up: V(0.6, 0, 1), pose: 'arc', k: 1, amp: 1.5, phase: tw(t) * 3 };
  }
  const u = lin(S29.peak, S29.end, t);
  return { pos: P29top.clone().add(V(0, 2.6 * eo(u), -0.4 * u)), fwd: V(0, 1, -0.15), up: V(0.6, 0, 1), pose: 'S', k: 0.6 + 0.2 * Math.sin(tw(t) * 3), amp: 0.6, phase: tw(t) * 1.4 };
}

// ------------------------------------------------------------------------------------------------ dragon helpers
const DL = (k) => 0.3 * Math.pow(1000, clamp(k));                 // dragon world length at grow(k) (creatures: 0.3 * (300/0.3)^k)
// s30: grow on threes; head rises from Hi's last position, body hangs diagonally back out over the pool
const S30 = { t0: 67.0, end: 70.0, dir: V(0.12, 0.9, -0.42).normalize() };
const k30 = (t) => eio(clamp((th(t) - S30.t0 + 0.125) / 2.75));   // drawn on threes
const k30c = (t) => eio(clamp((t - S30.t0 + 0.125) / 2.75));      // continuous (camera)
function head30(L) { return P29top.clone().add(V(0, 2.6, -0.4)).add(V(0, 0.75 * L, 0.12 * L)); }
// s31 roar
const S31 = { head: V(-10, 560, -40), dir: V(0.25, 0.75, 0.6).normalize() };
// s32 storm ascent = the moment the s01 hook flashes forward to. Same corkscrew as A's s01 (radius 55, 3.2 turns, y -400..1600,
// 200 m/s, head at y ~470 on s01 frame 0): s32 lt 1.0..2.5 == s01 t 0..1.5 (A's own camera), lt 0..1 = the lead-in below.
const S32 = { speed: 200, lead: 1.0 };
let curve32 = null, s0_32 = 0;
function getCurve32() {
  if (!curve32) {
    const pts = []; for (let i = 0; i <= 64; i++) { const u = i / 64, an = u * Math.PI * 2 * 3.2 + 0.4; pts.push(V(Math.cos(an) * 55, -400 + u * 2000, Math.sin(an) * 55)); }
    curve32 = new THREE.CatmullRomCurve3(pts);
    const len = curve32.getLength(); s0_32 = len * 0.5;
    for (let u = 0; u <= 1; u += 0.001) if (curve32.getPointAt(u).y >= 470) { s0_32 = u * len; break; }
  }
  return curve32;
}
const at32 = (a) => { const c = getCurve32(); return c.getPointAt(clamp(a / c.getLength())); };
const tA = (lt) => lt - S32.lead;                                   // s01 time of this s32 moment
function head32(lt) { getCurve32(); return at32(s0_32 + S32.speed * tA(lt)); }
// s33 spiral out of the cloud sea (cloudTop 1000) into the dawn
const S33 = { center: V(60, 880, -240), radius: 75, height: 620, turns: 2.2, speed: 190, burst: 74.6 };
let curve33 = null, a33 = 0;
function getCurve33() {
  if (!curve33) {
    const pts = [], n = Math.ceil(S33.turns * 16);
    for (let i = 0; i <= n; i++) { const u = i / n, an = u * S33.turns * Math.PI * 2 + Math.PI * 0.6; pts.push(V(S33.center.x + Math.cos(an) * S33.radius, S33.center.y + u * S33.height, S33.center.z + Math.sin(an) * S33.radius)); }
    curve33 = new THREE.CatmullRomCurve3(pts);
    // arc length where the spiral crosses y = 1000 (the head bursts out of the cloud top at CUES.dawn)
    const L = curve33.getLength(); for (let a = 0; a < L; a += 1) if (curve33.getPointAt(a / L).y >= 1000) { a33 = a; break; }
  }
  return curve33;
}
const off33 = () => { getCurve33(); return a33 - S33.speed * (S33.burst - 74.5); };
function head33(lt) { const c = getCurve33(); return c.getPointAt(clamp((off33() + S33.speed * lt) / c.getLength())); }
// s34 long S-glide across the sunrise: a path in front of the low sun (camera looks into the sun), moving screen-right
const SUN = () => (C?.api?.heights?.sky?.sunDir ?? V(0.42, 0.07, -1)).clone().normalize();
const S34 = { centre: V(60, 1105, -240), len: 1200, amp: 40, wave: 260, speed: 165, dist: 330 };
const s34right = () => { const d = SUN().setY(0).normalize(); return V(-d.z, 0, d.x); };
let curve34 = null;
function getCurve34() {
  if (!curve34) { const pts = [], R = s34right(); for (let i = 0; i <= 60; i++) { const u = i / 60, x = (u - 0.5) * S34.len; pts.push(S34.centre.clone().addScaledVector(R, x).add(V(0, S34.amp * Math.sin(x / S34.wave * Math.PI * 2), 0))); } curve34 = new THREE.CatmullRomCurve3(pts); }
  return curve34;
}
let off34v = null;
function off34() {   // arc length where the head is 110 m left of the centre at lt = 0
  if (off34v === null) { const c = getCurve34(), L = c.getLength(), R = s34right(); for (let a = 0; a < L; a += 1) { if (c.getPointAt(a / L).clone().sub(S34.centre).dot(R) >= -110) { off34v = a; break; } } }
  return off34v ?? 600;
}
function head34(lt) { const c = getCurve34(); return c.getPointAt(clamp((off34() + S34.speed * lt) / c.getLength())); }
// s35-s37 the fast return flight: low curves down each valley (+z = downstream / home)
const RET = { speed: 270 };
const curves = {};
function riverCurve(key, xOf, y, z0, z1, wob = 6) {
  if (!curves[key]) { const pts = []; for (let i = 0; i <= 24; i++) { const z = lerp(z0, z1, i / 24); pts.push(V(xOf(z), y + wob * Math.sin(z * 0.013 + 1), z)); } curves[key] = new THREE.CatmullRomCurve3(pts); }
  return curves[key];
}
const g35 = () => riverCurve('g35', (z) => (C?.api?.heights?.riverX?.(z) ?? 0) * 0.6, 46, -700, 500, 5);
const t36 = () => riverCurve('t36', (z) => -30 + 4 * Math.sin(z * 0.01), 29, -600, 500, 3);
const b37 = () => riverCurve('b37', (z) => (C?.api?.vale?.bamboo?.centerX?.(z) ?? 0) - 3, 31, -700, 500, 3);
const RO = { s35: 520, s36: 470, s37: 495 };    // head arc offsets at the start of each shot
function headOn(curve, off, lt, speed = RET.speed) { const c = curve(); return c.getPointAt(clamp((off + speed * lt) / c.getLength())); }
// s38 circling high over the temple; s39 gliding across the reflection
const S38 = { center: V(-6, 125, -70), radius: 125, speed: 95 };
let curve38 = null;
function getCurve38() {
  if (!curve38) { const pts = []; for (let i = 0; i <= 40; i++) { const an = i / 40 * Math.PI * 2 * 1.25 - 0.4; pts.push(V(S38.center.x + Math.cos(an) * S38.radius, S38.center.y + 12 * Math.sin(an * 2), S38.center.z + Math.sin(an) * S38.radius * 0.8)); } curve38 = new THREE.CatmullRomCurve3(pts); }
  return curve38;
}
// s39 (patch): LOW camera at the south edge of the pond, looking north at the temple + spout. The real dragon flies away high
// and small over the temple toward the sunrise; in the REFLECTION pass only (AU.uReflectPass) it is re-laid on a second path
// so its reflection glides across the water, rising toward the horizon like a receding flyer's would, and passes the leaf.
const S39 = { cam: V(1.0, 0.3, 4.55), look: V(2.4, 2.35, -14.6), fov: 56, leafAz: -3.5, leafDep: 8.6, leafSize: 0.15, twos: 0.4 };
// a point seen from the s39 camera: azimuth (deg, + = right of -z), elevation (deg), horizontal distance (m)
const sph39 = (az, el, D) => V(S39.cam.x + D * Math.sin(az * DEG), S39.cam.y + D * Math.tan(el * DEG), S39.cam.z - D * Math.cos(az * DEG));
const leaf39 = () => { const D = S39.cam.y / Math.tan(S39.leafDep * DEG); return sph39(S39.leafAz, 0, D).setY(0); };
const curves39 = {};
function getCurve39(kind) {
  if (!curves39[kind]) {
    const pts = [];
    if (kind === 'sky') {   // high over the temple, away toward the sunrise (upper right), shrinking with distance
      for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push(sph39(lerp(-2, 34, u), lerp(30.5, 22.5, u) + 1.0 * Math.sin(u * Math.PI * 2), lerp(780, 2600, u))); }
    } else {                // reflection pass: a mirrored point (x, -y, z) shows where (x, y, z) sits; y above 0 (clip plane)
      for (let i = 0; i <= 16; i++) {
        // reaches the leaf's depression at u ~0.49, then recedes toward the far waterline (dips under the clip plane = gone)
        const u = i / 16, az = lerp(-52, 48, u), a = clamp((u - 0.49) / 0.51), dep = (u < 0.49 ? lerp(12, 8.4, u / 0.49) : lerp(8.4, 0.4, a * a * 0.6 + a * 0.4)) + 0.4 * Math.sin(u * Math.PI * 3) * (1 - a), D = lerp(7, 11, a);
        pts.push(sph39(az, 0, D).setY(D * Math.tan(dep * DEG) - S39.cam.y));
      }
    }
    curves39[kind] = new THREE.CatmullRomCurve3(pts);
  }
  return curves39[kind];
}
// ------------------------------------------------------------------------------------------------ props (direction-owned)
let LOG = null, LEAF = null, G39 = null, D39 = null;   // D39: s39 dragon state for the reflection-pass swap (null off s39)
const REFL = { saved: null, h: null };   // POND surface uniform overrides (s39), restored every frame
function buildProps() {
  const { A } = C;
  // s27: a broken pine trunk (cel + ink, bark strokes, snapped ends, two branch stubs)
  const g = new THREE.Group(); g.name = 'dirB_log';
  const bark = A.barkTexture({ seed: 27 }); bark.wrapS = bark.wrapT = THREE.RepeatWrapping; bark.repeat.set(2, 3);
  const mat = A.celMaterial({ base: '#6a4a3e', shade: '#3a2c48', rimColor: '#bfe6ff', map: bark, id: A.ID.PROP, highlight: 0.25 });
  const pts = []; for (let i = 0; i <= 8; i++) { const y = i / 8; pts.push(new THREE.Vector2(0.48 - 0.1 * y + 0.03 * Math.sin(i * 2.1), (y - 0.5) * 6)); }
  const trunk = new THREE.Mesh(new THREE.LatheGeometry(pts, 10), mat); g.add(trunk);
  const endMat = A.celMaterial({ base: '#d9b48a', shade: '#9a7480', id: A.ID.PROP + 1, highlight: 0.2 });
  for (const s of [-1, 1]) {   // jagged snapped ends
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42 - 0.04 * s, 0.7, 7, 1, true), endMat);
    cone.position.y = s * 3.05; if (s < 0) cone.rotation.x = Math.PI; cone.scale.set(1, 1, 0.8); g.add(cone);
  }
  for (const [y, a, l] of [[1.2, 0.9, 1.6], [-0.8, -2.2, 1.2], [2.1, 2.6, 0.9]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, l, 6), mat);
    b.position.set(Math.cos(a) * 0.4, y, Math.sin(a) * 0.4); b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); b.translateY(l * 0.4); g.add(b);
  }
  g.visible = false; C.sets.FALLS.add(g); LOG = g;
  // s39: the red maple leaf floating on the still pond
  const mk = C.api.vale?.pond?.makeLeaf;
  if (mk) { LEAF = mk('#e0402c', S39.leafSize); LEAF.name = 'dirB_leaf'; LEAF.visible = false; C.sets.POND.add(LEAF); }
  // s39: mossy bank stones in the lower corners + an overhanging maple branch across the top of frame
  const rng = mulb(39), g39 = new THREE.Group(); g39.name = 'dirB_s39'; g39.visible = false;
  const rparts = [], rcol = rockColor2({ waterY: 0 });
  for (const [az, d, y, s, ry] of [[-41, 2.2, -0.03, [0.36, 0.24, 0.32], 0.4], [-49, 3.1, -0.02, [0.46, 0.36, 0.4], 2.0], [-34, 1.9, -0.06, [0.16, 0.09, 0.14], 1.1],
    [45, 2.4, -0.03, [0.4, 0.27, 0.36], 2.6], [52, 3.3, -0.02, [0.48, 0.36, 0.4], 0.9], [38, 2.0, -0.06, [0.15, 0.09, 0.13], 1.7]]) {
    const p = sph39(az, 0, d).setY(y), x = p.x, z = p.z;
    rparts.push({ geo: rockGeo2(rng), m: M4(V(x, y, z), [rng() * 0.2, ry, rng() * 0.2], s), color: rcol });
  }
  g39.add(new THREE.Mesh(bake(rparts), rockMaterial({ shade: '#9a96bc', rimColor: '#ffd8a8' })));
  // branch: reaches in from a maple off-frame left, above and ahead of the camera, tips hanging over the water
  const barkM = A.celMaterial({ base: '#8a7470', shade: '#4e4262', map: A.barkTexture({ seed: 39 }), id: A.ID.PROP, highlight: 0.1, rimColor: '#ffbf8a', rimWidth: 0.2 });
  const tubes = [], clumps = [];
  const main = [sph39(-80, 24, 6), sph39(-56, 27, 5.2), sph39(-34, 29.5, 4.8), sph39(-16, 31, 4.6)];
  tubes.push({ geo: taperTube(main, 0.11, 0.03, 8, 16, { wob: 0.1 }) });
  for (const [k, dx, dy, dz] of [[0.35, 0.4, -0.35, 1.0], [0.55, 1.0, -0.45, 0.7], [0.7, 0.3, -0.3, -0.9], [0.85, 1.1, -0.35, 0.5], [0.95, 0.8, -0.25, -0.6]]) {
    const st = new THREE.CatmullRomCurve3(main).getPointAt(k), e = st.clone().add(V(dx, dy, dz));
    tubes.push({ geo: taperTube([st, st.clone().lerp(e, 0.5).add(V(0, 0.08, 0)), e], 0.035, 0.01, 5, 6) });
    clumps.push({ c: e.clone().add(V(0, -0.05, 0)), r: V(0.6, 0.26, 0.55), n: 34 });
    clumps.push({ c: st.clone().lerp(e, 0.5).add(V(0, -0.02, 0)), r: V(0.42, 0.2, 0.4), n: 18, light: -0.06 });
  }
  clumps.push({ c: main[3].clone().add(V(0.1, -0.08, 0)), r: V(0.62, 0.28, 0.55), n: 34 });
  g39.add(new THREE.Mesh(bake(tubes), barkM));
  const leafM = A.cardMaterial({ map: mapleAtlas({ seed: 39, size: 256 }), cells: 4, ramp: ['#5b1838', '#a8213a', '#e2452e', '#ff9a64'], alt: '#ff8aa8', altAmt: 0.35, ink: '#3a1420', texW: 0.5, sway: 0.02, bristle: 0.2 });
  const sun = C.api.vale?.pond?.sun ?? V(0.7, 0.085, -1).normalize();
  g39.add(A.cardInstances(leafM, A.foliageItems(rng, clumps, { sun: V(sun.x, 1.1, sun.z), size: 0.7 }), { base: false }));
  g39.traverse((o) => { o.frustumCulled = false; });
  C.sets.POND.add(G39 = g39);
}

// ------------------------------------------------------------------------------------------------ helpers for ACT
function poseHi(h, o = {}) {
  const hi = C.api.koi.hi;
  hi.root.visible = true; hi.root.position.copy(h.pos); orient(hi.root, h.fwd, h.up);
  hi.swim(h.phase ?? 0, h.amp ?? 0.6).pose(h.pose ?? 'rest', h.k ?? 0);
  hi.eye(o.eye ?? 'determined', o.eyeK ?? 1);
  if (o.gaze) hi.gaze(o.gaze[0], o.gaze[1]);
  if (o.tint) hi.eyeTint(o.tint[0], o.tint[1]);
  hi.crown(o.crown ?? 0).fins(o.rag ?? 0);
  if (o.flash) hi.flash(o.flash);
  return hi;
}
const W = () => C.api.water;
const lookHint = (set, st) => C.api.heights?.lookHint?.(set, st) ?? {};
const valeLook = (set, sid) => C.api.vale?.look?.(set, sid) ?? {};
// project a world point to screen uv (for speed-line / impact centres)
function toUV(p, st) {
  const c = new THREE.PerspectiveCamera(st.cam.fov, 1920 / 1040, 0.1, 1e5); c.position.copy(st.cam.pos); c.up.set(0, 1, 0); c.lookAt(st.cam.look);
  if (st.cam.roll) c.rotateZ(st.cam.roll * DEG); c.updateMatrixWorld(); const v = p.clone().project(c); return [v.x * 0.5 + 0.5, v.y * 0.5 + 0.5];
}

// ================================================================================================ shots
export const CAMS = {}, LOOKS = {}, ACT = {};
export const EVENTS = [];
const ev = (t, kind, note) => EVENTS.push({ t: +t.toFixed(3), kind, note });

// ------------------------------------------------ s20 look up (45.0-46.75) FALLS: CU Hi looking up, lightning in its eye
const BOLT20 = 45.875;
const N = (v) => v.clone().normalize();
CAMS.s20 = (lt, d, t) => { const h = hiS20(t); return cam(h.pos.clone().add(V(-0.3, 0.05, 0.12)), h.pos.clone().add(V(0, 0.3, -0.6)), 40, 0, { near: 0.01 }); };
LOOKS.s20 = (lt, d, t, st) => ({ ...lookHint('FALLS', st), key: { dir: [-0.6, 0.5, 0.6], color: '#e2f2ff', tint: 0.28 }, rim: { dir: [0.3, 0.6, -0.8], amt: 1.5 } });
ACT.s20 = (lt, d, t, st) => {
  const h = hiS20(t), after = t >= BOLT20;
  const hi = poseHi(h, { eye: after && t < BOLT20 + 0.4 ? 'wide' : 'determined', gaze: [0.05, 0.9], tint: after ? ['#eaf6ff', 0.95 * (1 - 0.5 * lin(BOLT20 + 0.3, 46.75, t))] : ['#a8b8ff', 0.4] });
  // camera: beside Hi's eye, slightly below, looking up past the head at the colossal falls; slow push
  const eye = hi.anchor('eye'), head = hi.anchor('head'), side = N(eye.clone().sub(head).setY(0)), fwd = N(h.fwd), k = eio(lt / d);
  const fh = N(fwd.clone().setY(0));
  const pos = eye.clone().addScaledVector(side, lerp(0.3, 0.22, k)).addScaledVector(fh, lerp(0.2, 0.15, k)).add(V(0, 0.05, 0)).add(shake(t, BOLT20, 0.008, 0.3));
  pos.y = Math.max(pos.y, 0.12);
  setCam(st, pos, eye.clone().lerp(head, 0.3).add(V(0, 0.015, 0)).addScaledVector(fh, -0.03), 36, -5, 0.01);
  W().lightning(BOLT20, V(-80, 760, -320), V(-30, 330, -150), { key: 's20', branches: 6, width: 8, pattern: [1, 1, 0, 1], flash: 0.9 });
  W().ripple(h.pos.x, h.pos.z, 45.0, 0.5, { key: 's20a' }); W().ripple(h.pos.x, h.pos.z, 46.0, 0.4, { key: 's20b' });
};
ev(BOLT20, 'crack', 's20 lightning reflected in Hi\'s eye; thunder');

// ------------------------------------------------ s21 try (46.75-49.5): out of the foam, climb, pummelled, tumble back
// tight tracking beside Hi (eye side), Hi ~40% of the frame; on the hit the camera brakes, Hi is knocked off large through the
// frame, then the camera tilts down and Hi drops away toward the boiling foot far below (vertigo)
function cam21(t) {
  if (t < S21.hit) {   // camera-locked on Hi: the world whips past, Hi stays big and readable
    const P = hiS21(t).pos, k = sm(S21.t0, S21.on + 0.2, t), dist = lerp(1.1, 0.88, k);
    const pos = P.clone().addScaledVector(SIDE_L, dist).add(V(0, lerp(-0.25, 0.08, k), 0)); pos.y = Math.max(pos.y, 0.5);
    return { pos, look: P.clone().add(V(0, lerp(0.15, 0.05, k), 0)), fov: 50, roll: lerp(0, -6, k) };
  }
  const u = lin(S21.hit, S21.end, t), h = hiS21(t);
  const brake = hiS21(S21.hit).pos;
  // the camera falls with Hi a beat late while it is knocked off (Hi large, tumbling), then brakes: Hi drops away below
  const v = Math.max(0, u - 0.07), g = v < 0.3 ? v : 0.3 + 0.16 * (1 - Math.exp(-(v - 0.3) / 0.16));
  const cy = brake.y + 0.25 - s21drop(g);
  const pos = V(h.pos.x, cy, h.pos.z).addScaledVector(SIDE_L, lerp(0.9, 1.15, sm(0, 0.5, u))).add(V(0, 0.1, 0));
  const look = h.pos.clone().add(V(0, lerp(0.1, 0, u), 0));
  pos.add(shake(t, S21.hit, 0.22, 0.4));
  return { pos, look, fov: lerp(54, 58, sm(0.3, 1, u)), roll: -6 + 10 * Math.sin((t - S21.hit) * 6) * (1 - u) };
}
CAMS.s21 = (lt, d, t) => { const c = cam21(t); return cam(c.pos, c.look, c.fov, c.roll, { near: 0.03 }); };
LOOKS.s21 = (lt, d, t, st) => ({ ...lookHint('FALLS', st), key: { dir: [-0.75, 0.45, 0.6], color: '#e4f2ff', tint: 0.3 }, rim: { dir: [0.6, 0.5, -0.6], amt: 1.5 } });
ACT.s21 = (lt, d, t, st) => {
  const h = hiS21(t), hq = hiS21(tw(t));
  const hit = t >= S21.hit;
  const hi = poseHi({ ...hq, pos: h.pos }, { eye: hit ? 'wide' : 'determined', rag: hit ? 0.25 : 0.1, gaze: [0, 0.6] });
  if (t >= S21.hit && t < S21.hit + 2 / 24) hi.smear(0.8, V(0, -1, 0.6).normalize());
  W().splash(onCurtain(0.5).pos.add(V(0.3, 0, 4.0)).setY(0), S21.leap - 0.04, 0.5, { key: 's21a' });
  const f = F(t), fh = F(S21.hit);
  if (f === fh) { st.look.impact = 1; st.look.impactCentre = toUV(h.pos, st); }
  W().sparkles(onCurtain(S21.yTop, 0.3, 0.6).pos, S21.hit, { n: 40, size: 0.1, speed: 3, dur: 0.6, key: 's21h' });
  W().splash(hiS21(S21.hit).pos.clone().add(V(0, 0.3, 0.1)), S21.hit - 0.03, 0.9, { y: hiS21(S21.hit).pos.y + 0.2, ripple: false, dur: 0.7, key: 's21p' });
  W().splash(V(h.pos.x, 0, h.pos.z), S21.end - 0.02, 0.4, { key: 's21z' });
};
ev(46.75, 'splash', 's21 Hi bursts out of the foam at the foot');
ev(S21.on, 'swish', 's21 onto the falling water, climbing');
ev(S21.hit, 'hit', 's21 pummelled by the falling water (impact frame)');
ev(S21.hit + 0.05, 'whoosh', 's21 tumbling back down');

// ------------------------------------------------ s22 sink (49.5-52.0) FALLS-UNDER: quiet
CAMS.s22 = (lt, d, t) => { const h = hiS22(t); return cam(h.pos.clone().add(V(0, -0.1, 0.8)), h.pos.clone(), 40, 0, { near: 0.02 }); };
LOOKS.s22 = { godRays: 0.55, underDensity: 0.03, vignette: 0.28, sat: 0.95, key: { dir: [0.3, 0.9, 0.5], color: '#cfe2ff', tint: 0.2 } };
ACT.s22 = (lt, d, t, st) => {
  st.look.flash = 0;
  const h = hiS22(t), hi = poseHi({ ...hiS22(tw(t)), pos: h.pos }, { eye: lt < 0.25 ? 'sad' : 'half', rag: 0.3, gaze: [0, 0.4] });
  W().storm(false);
  W().bubbles(V(h.pos.x, -0.5, h.pos.z), 49.5, { n: 70, spread: 0.6, dur: 2.2, size: 1.3, key: 's22in' });
  for (let i = 0; i < 4; i++) W().bubbles(hi.anchor('mouth'), 49.9 + i * 0.55, { n: 4, spread: 0.02, size: 0.6, rise: 0.5, dur: 1.6, key: 's22m' + i });
  // camera: medium on Hi's eye side, a touch below, slow push following the sink (quiet)
  const eye = hi.anchor('eye'), side = N(eye.clone().sub(hi.anchor('head')).setY(0)), k = eio(lt / d);
  const ctr = h.pos.clone().lerp(eye, 0.35);
  setCam(st, ctr.clone().addScaledVector(side, lerp(0.95, 0.62, k)).add(V(0, lerp(-0.2, -0.08, k), 0)), ctr.clone().add(V(0, 0.04, 0)), 40, 3, 0.02);
};
ev(49.5, 'splash', 's22 Hi plunges under, muffled');
ev(50.0, 'bubbles', 's22 slow bubbles from the mouth (quiet)');

// ------------------------------------------------ s23 memory (52.0-54.0) POND: stone dragon at dawn (1 s) / the inlet leap (1 s)
const S23cut = 53.0;
function hiS23(t) {   // A's s07 inlet leap re-timed (leap at 53.3 instead of 14.3), seen closer
  const P = C.api.vale.pond, base = P.inletBase, lip = P.inletLip, tL = 53.3, dur = 0.5;
  const p0 = V(base.x + 0.45, -0.07, base.z + 1.0), p1 = V(base.x + 0.02, -0.05, base.z + 0.18), land = V(lip.x - 0.08, 0.22, lip.z - 0.75);
  if (t < tL) { const u = sm(S23cut - 0.1, tL, t), p = vl(p0, p1, u); return { pos: p, fwd: p1.clone().sub(p0).setY(0), up: V(0, 1, 0), pose: 'S', k: 0.2, amp: 1.4, phase: tw(t) * 3 }; }
  if (t < tL + dur) {
    const u = (t - tL) / dur, p = vl(p1, land, u); p.y += 4 * 0.42 * u * (1 - u);
    return { pos: p, fwd: V(land.x - p1.x, 4 * 0.42 * (1 - 2 * u) + (land.y - p1.y), land.z - p1.z), up: V(0, 1, 0), pose: 'arc', k: 1, amp: 0.8, phase: tw(t) * 2 };
  }
  const u = t - tL - dur; return { pos: land.clone().add(V(-0.05 * u, 0, -0.5 * u)), fwd: V(-0.1, 0, -1), up: V(0, 1, 0), pose: 'S', k: 0.2, amp: 1.2, phase: tw(t) * 3 };
}
// the stone dragon as Hi saw it in s05 (3/4 front, low on the water, the sunrise behind it), remembered a little closer
function spout23() {
  const pond = C.api.vale?.pond, rock = pond?.spoutRock?.clone() ?? V(5.55, 1.02, -2.65);
  const fx = (pond?.spoutFace ?? V(-0.86, 0, 0.5)).clone().setY(0).normalize();
  const local = (x, y, z) => V(x * fx.z + z * fx.x, y, -x * fx.x + z * fx.z).add(rock);
  const a = Math.atan2(fx.z, fx.x) - 62 * DEG;
  return { head: local(0, 0.42, 0.2), c: V(Math.cos(a), 0, Math.sin(a)), pour: pond?.spoutPour?.clone() ?? V(4.55, 0, -2.05) };
}
CAMS.s23 = (lt, d, t) => {
  if (t < S23cut) {   // slow push on the carved head against the sunrise
    const S = spout23(), k = eio(lin(52, S23cut, t));
    const pos = S.head.clone().addScaledVector(S.c, lerp(2.0, 1.7, k)).setY(lerp(0.16, 0.2, k));
    return cam(pos, S.head.clone().lerp(S.pour, 0.3).add(V(0, 0.05, 0)), 40, 0, { near: 0.02 });
  }
  const P = C.api.vale.pond, k = eio(lin(S23cut, 54, t)), b = P.inletBase;
  return cam(V(lerp(-7.3, -7.4, k), lerp(0.78, 0.84, k), lerp(-4.5, -5.0, k)), V(lerp(b.x + 0.3, b.x - 0.05, k), lerp(0.18, 0.3, k), lerp(b.z + 0.7, b.z - 0.5, k)), 34, 0, { near: 0.02 });
};
// warm and soft-edged, but the images read: moderate memory grade (vignette + paper), no white wash; 2-frame warm flash on each image
LOOKS.s23 = (lt, d, t, st) => {
  const base = { ...valeLook('POND', 's23'), memory: 0.6, memoryColor: '#ffe9c8', softBloom: 0, bloom: 0.85, paper: 0.07, vignette: 0.22, sat: 1.12, contrast: 0.15,
    fade: t < 52.09 ? 0.45 : (t >= S23cut && t < S23cut + 0.09) ? 0.4 : 0, fadeColor: '#fff4dc' };
  if (t < S23cut) {
    const S = spout23(), ray = S.head.clone().sub(CAMS.s23(lt, d, t).pos).normalize(), sun = S.head.clone().addScaledVector(ray, 30).add(V(0, -2, 0));
    return { ...base, shafts: 0.7, shaftPos: sun, shaftColor: '#ffd8a8', fogDensity: 0.002, fogMax: 0.3, fog: '#f6c8b0',
      key: { dir: [-ray.x, 0.5, -ray.z], color: '#ffe2c8', tint: 0.25 }, rim: { dir: [ray.x, 0.2, ray.z], amt: 2.0 },
      glows: [{ pos: sun, color: '#ffc8a0', size: 0.4, amount: 0.7 }] };
  }
  return base;
};
ACT.s23 = (lt, d, t, st) => {
  if (t < S23cut) { C.api.koi.hi.root.visible = false; return; }
  const h = hiS23(t), hq = hiS23(tw(t));
  poseHi({ ...hq, pos: h.pos }, { eye: 'determined' });
  W().splash(C.api.vale.pond.inletBase.clone().add(V(0, 0, 0.18)), 53.3, 0.18, { key: 's23a' });
  W().sparkles(h.pos, 53.45, { n: 18, size: 0.025, dur: 0.6, key: 's23s' });
};
ev(52.0, 'memory', 's23 memory chime: warm flash, the stone dragon at dawn');
ev(53.0, 'memory', 's23 cut: the little inlet leap');
ev(53.3, 'splash', 's23 small leap splash (soft, in memory)');

// ------------------------------------------------ s24 wake (54.0-55.25) FALLS-UNDER: the eye opens, crown glows faintly
const WAKE = 54.3;
CAMS.s24 = (lt, d, t) => { const h = hiS24(t); return cam(h.pos.clone().add(V(0.1, 0, 0.3)), h.pos.clone(), 34, 0, { near: 0.01 }); };
LOOKS.s24 = { godRays: 0.6, underDensity: 0.03, vignette: 0.24, key: { dir: [0.2, 0.7, 0.9], color: '#d6e8ff', tint: 0.2 } };
ACT.s24 = (lt, d, t, st) => {
  st.look.flash = 0;
  const h = hiS24(t), f = F(t), fw = F(WAKE);
  const eye = f < fw ? 'closed' : f < fw + 2 ? 'half' : f < fw + 6 ? 'wide' : 'determined';
  const hi = poseHi({ ...hiS24(tw(t)), pos: h.pos }, { eye, rag: 0.3, crown: 0.35 * sm(WAKE + 0.1, 55.0, t), gaze: [0, 0.5] });
  W().storm(false);
  if (t > WAKE) W().glow(hi.anchor('crown'), 0.25 * sm(WAKE + 0.1, 55.1, t), { size: 0.12, rays: false, core: '#ffd0c0', mid: '#ff6a50', outer: '#c02a3a', lookColor: '#ff6a50', lookSize: 0.1, amount: 0.6 });
  W().bubbles(hi.anchor('mouth'), 54.05, { n: 3, spread: 0.01, size: 0.5, rise: 0.4, key: 's24m' });
  // macro on the eye (crown spot at frame top), slow push
  const e = hi.anchor('eye'), side = N(e.clone().sub(hi.anchor('head')).setY(0)), k = eio(lt / d), cr = hi.anchor('crown');
  setCam(st, e.clone().addScaledVector(side, lerp(0.21, 0.15, k)).add(V(0, -0.015, 0)).addScaledVector(N(h.fwd), 0.02), e.clone().lerp(cr, 0.3), 36, -4, 0.005);
};
ev(WAKE, 'heartbeat', 's24 Hi\'s eye snaps open');
ev(WAKE + 0.2, 'glow', 's24 crown spot glows faintly');

// ------------------------------------------------ s25 run (55.25-57.5) FALLS-UNDER: dive, U-turn, rocket up, camera chasing
CAMS.s25 = (lt, d, t) => {
  const h = hiS25(t), lag = hiS25(Math.max(S25.t0, t - 0.05));
  if (t < S25.turn) {   // behind and above, chasing the dive
    const k = sm(S25.t0, S25.turn, t);
    return cam(lag.pos.clone().add(V(lerp(-0.4, -1.3, k), lerp(0.35, 0.9, k), lerp(0.9, 1.1, k))), h.pos.clone().add(V(0.25, -0.15, -0.1)), lerp(42, 50, k), 0, { near: 0.02 });
  }
  // below and beside, looking up the run toward the bright surface; chasing up
  const k = sm(S25.turn, S25.up + 0.25, t);
  const pos = h.pos.clone().add(V(lerp(0.7, 0.36, k), lerp(-0.3, -0.5, k), lerp(0.6, 0.32, k)));
  return cam(pos.add(shake(t, S25.up, 0.03, 0.5)), h.pos.clone().add(V(0, 0.12, 0)), lerp(50, 56, k), 6 * k, { near: 0.02 });
};
LOOKS.s25 = (lt, d, t, st) => ({ godRays: 0.9, underDensity: 0.025, key: { dir: [0.3, -0.6, 0.6], color: '#e0f0ff', tint: 0.25 }, vignette: 0.2 });
ACT.s25 = (lt, d, t, st) => {
  st.look.flash = 0;
  const h = hiS25(t), hi = poseHi({ ...hiS25(tw(t)), pos: h.pos }, { eye: 'determined', crown: 0.35 + 0.3 * sm(S25.up, S25.end, t), rag: 0.3 });
  if (t >= S25.up && t < S25.up + 2 / 24) hi.smear(0.7, V(0, 1, 0));
  if (t >= S25.dive && t < S25.dive + 1 / 24) hi.smear(0.5, P25.b.clone().sub(P25.a).normalize());
  W().storm(false);
  for (let i = 0; i < 16; i++) { const t0 = S25.dive + i * 0.135; if (t0 > t) break; W().bubbles(hiS25(t0).pos, t0, { n: 10, spread: 0.05, size: 0.8, dur: 1.4, key: 's25t' + i }); }
  if (t >= S25.up) st.look.speed = { amount: 0.85 * sm(S25.up, S25.up + 0.35, t), centre: toUV(h.pos.clone().add(V(0, 1.5, 0)), st), color: '#e8f6ff', mode: 'radial' };
};
ev(S25.dive, 'whoosh', 's25 Hi dives deep');
ev(S25.turn, 'swish', 's25 U-turn at the bottom');
ev(S25.up, 'whoosh', 's25 accelerates straight up, bubble trail, speed lines (rising tone)');

// ------------------------------------------------ s26 climb (57.5-61.0): burst out, climb the falling water, camera tilting up
// one bold move: camera-locked beside Hi through the burst and onto the water, then it swings up and over in front of the
// face: from above, Hi climbs toward us with the whole drop to the boiling foot below (vertigo)
function cam26(t) {
  const h = hiS26(t), P = h.pos, m = eio(sm(58.55, 59.95, t));
  const offSide = SIDE_L.clone().multiplyScalar(lerp(1.15, 0.9, sm(57.5, 58.0, t))).add(V(0, lerp(-0.15, 0.06, sm(57.5, 57.95, t)), 0));
  const offTop = SIDE_L.clone().multiplyScalar(0.26).add(V(0.05, 0.66, 0.32));
  const off = vl(offSide, offTop, m), len = lerp(offSide.length(), offTop.length(), m);
  const pos = P.clone().add(off.normalize().multiplyScalar(len)); pos.y = Math.max(pos.y, 0.55);
  const look = P.clone().add(vl(V(0, lerp(0.2, 0.08, sm(57.5, 57.8, t)), 0), V(0, -0.45, -0.05), m)); look.y = Math.max(look.y, 0.4);
  return { pos: pos.add(shake(t, S26.breach, 0.05, 0.3)), look, fov: lerp(50, 56, m), roll: lerp(-5, 0, m) };
}
CAMS.s26 = (lt, d, t) => { const c = cam26(t); return cam(c.pos, c.look, c.fov, c.roll, { near: 0.03 }); };
LOOKS.s26 = (lt, d, t, st) => ({ ...lookHint('FALLS', st), key: { dir: [-0.6, 0.6, 0.6], color: '#e6f4ff', tint: 0.3 }, rim: { dir: [0.5, 0.5, -0.7], amt: 1.5 } });
ACT.s26 = (lt, d, t, st) => {
  const h = hiS26(t), hi = poseHi({ ...hiS26(tw(t)), pos: h.pos }, { eye: 'determined', crown: 0.45, rag: 0.35 });
  if (t >= S26.breach && t < S26.breach + 2 / 24) hi.smear(0.7, V(0, 1, -0.3).normalize());
  W().splash(s26start().setY(0), S26.breach - 0.07, 0.6, { key: 's26a' });
  W().sparkles(s26start().setY(0.4), S26.breach, { n: 24, size: 0.06, speed: 2, key: 's26s' });
};
ev(57.52, 'splash', 's26 Hi bursts out of the pool (cut lands mid-burst)');
ev(S26.on, 'swish', 's26 lands on the falling water and climbs');
ev(59.0, 'roar', 's26 the falls roar builds as the camera tilts up');

// ------------------------------------------------ s27 log (61.0-63.0): a broken trunk tumbles down at Hi; smear dodge
// low 3/4 angle up the face: the trunk tumbling down at Hi from the top of frame; the dodge whips us in tight beside him
// (smear, the trunk crashes past in the foreground), then tight tracking beside him as he climbs on
function cam27(t) {
  const h = hiS27(t), m = eio(sm(61.45, 62.0, t)), P = h.pos.clone();
  P.x = lerp(lerp(0, P.x, 0.72), hiS27(Math.max(61.0, t - 0.06)).pos.x, m);
  const offA = SIDE27.clone().multiplyScalar(0.8).add(V(0, -0.45, 0)), offC = SIDE27.clone().multiplyScalar(0.92).add(V(0, 0.05, 0));
  const pos = P.clone().add(vl(offA, offC, m)).add(shake(t, 61.62, 0.12, 0.45));
  const look = P.clone().add(vl(V(0.25, 0.72, 0), V(0, 0.06, 0), m));
  return { pos, look, fov: lerp(66, 54, m), roll: lerp(-4, -8, m) + 4 * sm(61.5, 61.8, t) };
}
CAMS.s27 = (lt, d, t) => { const c = cam27(t); return cam(c.pos, c.look, c.fov, c.roll, { near: 0.03 }); };
LOOKS.s27 = (lt, d, t, st) => ({ ...lookHint('FALLS', st), key: { dir: [-0.5, 0.5, 0.7], color: '#e6f4ff', tint: 0.3 }, rim: { dir: [0.5, 0.6, -0.6], amt: 1.5 } });
ACT.s27 = (lt, d, t, st) => {
  const h = hiS27(t), hi = poseHi({ ...hiS27(tw(t)), pos: h.pos }, { eye: t > 61.3 && t < 61.8 ? 'wide' : 'determined', crown: 0.45, rag: 0.45 });
  if (t >= S27.dodge0 && t < S27.dodge0 + 2 / 24) hi.smear(0.9, V(1, 0, 0));
  const L = logS27(tw(t));
  LOG.visible = true; LOG.position.copy(L.pos); LOG.rotation.set(0, L.spin, L.ang, 'YXZ'); LOG.scale.setScalar(1.3);
  W().sparkles(L.pos, th(t), { n: 6, size: 0.12, speed: 2, dur: 0.4, key: 's27l' });
};
ev(61.1, 'creak', 's27 the trunk comes over, tumbling down the falls');
ev(61.46, 'whoosh', 's27 Hi dodges (smear)');
ev(61.62, 'thud', 's27 trunk crashes past, spray');

// ------------------------------------------------ s28 push (63.0-65.5): exhausted, near silence, crown ignites, the final push
CAMS.s28 = (lt, d, t) => { const h = hiS28(t); return cam(h.pos.clone().add(V(0.9, -0.3, 1.4)), h.pos.clone(), 40, 0, { near: 0.02 }); };
LOOKS.s28 = (lt, d, t, st) => ({ ...lookHint('FALLS', st), key: { dir: [0.7, 0.3, 0.7], color: '#eaf4ff', tint: 0.25 }, rim: { dir: [-0.4, 0.7, -0.6], amt: 1.5 }, vignette: 0.26 });
ACT.s28 = (lt, d, t, st) => {
  const h = hiS28(t), ign = sm(S28.push, S28.push + 0.25, tw(t));
  const eye = t < S28.push ? 'half' : t < S28.push + 0.12 ? 'wide' : 'determined';
  const hi = poseHi({ ...hiS28(tw(t)), pos: h.pos }, { eye, crown: 0.45 + 0.55 * ign, rag: 0.8, gaze: [0, 0.8] });
  if (t >= S28.go && t < S28.go + 2 / 24) hi.smear(0.6, V(0, 1, 0));
  W().rain(lerp(1, 0.45, sm(63, 64, t)));
  if (ign > 0) {
    W().glow(hi.anchor('crown'), ign * (0.8 + 0.2 * Math.sin(th(t) * 20)), { size: 0.3, rays: true, core: '#fff0e0', mid: '#ff5a3c', outer: '#c0203a', lookColor: '#ff5a40', lookSize: 0.16, amount: 0.9 });
    W().sparkles(hi.anchor('crown'), S28.push, { n: 24, size: 0.03, speed: 0.6, dur: 0.9, key: 's28c' });
  }
  // camera: CU from Hi's eye side and a little below, push in until the crown ignites, then the push leaves us behind (tilt up to the lip)
  const e = hi.anchor('eye'), side = N(e.clone().sub(hi.anchor('head')).setZ(0)), k = eio(lin(63, S28.push, t)), go = sm(S28.go, S28.end, t);
  const base = V(h.pos.x, hiS28Y(Math.min(t, S28.go)), h.pos.z);
  const pos = base.clone().addScaledVector(side, lerp(0.7, 0.42, k)).add(V(0, lerp(-0.32, -0.2, k), lerp(0.9, 0.55, k))).add(V(0, 2.2 * go, 0.9 * go));
  setCam(st, pos, base.clone().add(V(0, 0.12 + 9 * go, -0.05)), lerp(42, 50, go), 0, 0.02);
  if (t >= S28.go) st.look.speed = { amount: 0.6 * sm(S28.go, S28.go + 0.3, t), centre: toUV(h.pos.clone().add(V(0, 1.5, 0)), st), mode: 'radial', color: '#ffe8e0' };
};
ev(63.0, 'silence', 's28 near silence: only the heartbeat and a thin roar');
ev(S28.push, 'ignite', 's28 the crown spot ignites scarlet');
ev(S28.go, 'whoosh', 's28 the final push');

// ------------------------------------------------ s29 gate (65.5-67.0): leap over the lip; lightning hits; impact frames
// above Hi at the lip looking down the whole drop (coil), then camera-locked whip as it leaps past us over the lip: Hi large
// against the storm sky from below-side when the bolt hits; hold, then a slow drift back in the glow
function cam29(t) {
  const h = hiS29(t), P = h.pos;
  const w = eio(sm(S29.coil + 0.02, S29.strike - 0.03, t));
  const offTop = V(-0.78, 0.5, 0.72), offLow = V(-0.56, -0.42, 0.38).multiplyScalar(lerp(1, 1.5, eio(sm(S29.peak + 0.1, 67, t))));
  const len = lerp(offTop.length(), offLow.length(), w), off = vl(offTop, offLow, w).normalize().multiplyScalar(len);
  const pos = P.clone().add(off).add(shake(t, S29.strike, 0.25, 0.5));
  const look = P.clone().add(vl(V(0, -0.35, 0), V(0, 0.18, -0.1), w));
  return { pos, look, fov: lerp(52, 50, w), roll: lerp(0, 8, w) };
}
CAMS.s29 = (lt, d, t) => { const c = cam29(t); return cam(c.pos, c.look, c.fov, c.roll, { near: 0.03 }); };
LOOKS.s29 = (lt, d, t, st) => ({ ...lookHint('FALLS', st), key: { dir: [-0.6, 0.3, 0.75], color: '#f0f6ff', tint: 0.3 }, rim: { dir: [0, 0.6, -1], amt: 1.8 } });
ACT.s29 = (lt, d, t, st) => {
  const h = hiS29(t), f = F(t), fs = F(S29.strike);
  const held = f >= fs && f < fs + 4 ? hiS29(S29.strike) : null;            // impact frames + held drawing
  const g = sm(S29.peak, 67, t);
  const hi = poseHi({ ...hiS29(held ? S29.strike : tw(t)), pos: (held ?? h).pos }, { eye: t < S29.strike ? 'determined' : 'wide', crown: 1, rag: 0.8, flash: t >= S29.strike ? 0.25 + 0.3 * g : 0 });
  if (t >= S29.coil && t < S29.coil + 2 / 24) hi.smear(0.7, V(0, 1, 0));
  W().lightning(S29.strike, V(-60, 640, -320), P29top.clone(), { key: 's29', width: 11, branches: 7, pattern: [1, 1, 1, 0, 1], flash: 1 });
  if (f === fs) { st.look.impact = 1; st.look.impactCentre = toUV(h.pos, st); }
  else if (f === fs + 1) st.look.impact = 2;
  if (t >= S29.strike) {
    W().glow(hi.anchor('head').addScaledVector(N(st.cam.pos.clone().sub(hi.anchor('head'))), -0.25), 0.4 + 0.35 * g, { size: 0.25 + 0.35 * g, rays: true, lookColor: '#fff2c8', lookSize: 0.12, amount: 0.6 });
    W().sparkles(h.pos, S29.strike, { n: 40, size: 0.03, speed: 3, dur: 1.0, key: 's29s' });
    W().flash(0.35 * (1 - lin(S29.strike + 0.3, 67, t)));
  }
};
ev(S29.coil, 'whoosh', 's29 Hi leaps over the lip');
ev(S29.strike, 'crack', 's29 LIGHTNING HITS (impact frames, white-out)');
ev(S29.strike + 0.1, 'hum', 's29 held in the glow');

// ------------------------------------------------ s30 change (67.0-70.0): the transformation on threes, the camera pulls back
function cam30(t) {
  const L = DL(k30c(t)), head = head30(L), mid = head.clone().addScaledVector(S30.dir, -L * 0.5);
  const dir = V(0.45, -0.05 + 0.2 * k30c(t), 1).normalize(), dist = 2.3 * L + 1.3;
  return { pos: mid.clone().addScaledVector(dir, dist), look: mid.clone().add(V(0, L * 0.08, 0)), L };
}
CAMS.s30 = (lt, d, t) => { const c = cam30(t); return cam(c.pos.add(shake(t, 67.0, 0.3 + c.L * 0.004, 3)), c.look, 46, 3 * Math.sin(lt * 1.3)); };
LOOKS.s30 = (lt, d, t, st) => ({ ...lookHint('FALLS', st), key: { dir: [0.4, 0.4, 0.9], color: '#fff6e6', tint: 0.3 }, rim: { dir: [0, 0.4, -1], amt: 2 }, bloom: 1.35, fogDensity: 0.0006 });
ACT.s30 = (lt, d, t, st) => {
  const D = C.api.dragon, k = k30(t), L = DL(k), head = head30(L);
  D.root.visible = true; D.setLength(null); D.grow(k);
  D.place(head, S30.dir, { wave: 0.25 + 0.5 * k, t: tw(t) });
  D.pose({ name: 'glide', mane: 0.4 + 0.5 * k, jaw: 0.15 * k });
  D.crown(1); D.flash(0.5 * (1 - k)); D.eye('dragon', 1);
  W().transform(D, k, { bolts: 8 });
  W().rain(0.6);
};
ev(67.0, 'transform', 's30 transformation begins: crackling cocoon, rising choir');
ev(67.75, 'crack', 's30 cocoon bolts (on threes)');
ev(68.5, 'shimmer', 's30 gold wave runs along the scales');
ev(69.5, 'swell', 's30 the dragon at full size, camera pulls back');

// ------------------------------------------------ s31 roar (70.0-72.0): CU head roars, scarlet crown, Hi's eye
const ROAR = 70.3;
function dragonHead31() { return S31.head; }
CAMS.s31 = (lt, d, t) => {
  const h = dragonHead31(), k = eio(lt / d);
  const side = V(1, 0, 0).cross(S31.dir).normalize();
  const pos = h.clone().addScaledVector(S31.dir, 32 - 6 * k).add(V(26 - 4 * k, -12, 8)).add(shake(t, ROAR, 2.2, 0.9));
  return cam(pos, h.clone().addScaledVector(S31.dir, -6).add(V(0, 2, 0)), 42, -6 + 4 * k);
};
LOOKS.s31 = (lt, d, t, st) => ({ ...lookHint('FALLS', st), key: { dir: [0.7, 0.2, 0.7], color: '#fff6ea', tint: 0.3 }, rim: { dir: [-0.5, 0.6, -0.7], amt: 2 }, bloom: 1.25 });
ACT.s31 = (lt, d, t, st) => {
  const D = C.api.dragon, tq = tw(t);
  D.root.visible = true; D.setLength(null); D.grow(1);
  const pre = tq < ROAR, r = sm(ROAR, ROAR + 0.17, tq);
  D.place(S31.head.clone().addScaledVector(S31.dir, pre ? -3 * sm(70, ROAR, tq) : 4 * r), S31.dir, { wave: 0.5, t: tq });
  D.pose(pre ? { name: 'glide', jaw: 0.15, mane: 0.6 } : { name: 'roar', k: r, jaw: r, mane: 0.9 });
  D.crown(1); D.eye('dragon', 1);
  W().lightning(ROAR, V(220, 900, -400), V(60, 420, -260), { key: 's31', width: 9, branches: 6, pattern: [1, 0, 1, 1], flash: 0.8 });
  W().rain(0.7);
  if (!pre) st.look.speed = { amount: 0.5 * (1 - lin(ROAR + 0.4, 72, t)), centre: toUV(D.anchor('mouth'), st), mode: 'radial', color: '#ffffff' };
};
ev(70.05, 'breath', 's31 the dragon draws breath');
ev(ROAR, 'roar', 's31 THE ROAR (thunder answers)');

// ------------------------------------------------ s32 ascend (72.0-74.5) SKY storm: up the chimney, lightning chasing
function cam32(lt) {
  if (lt >= S32.lead) { const c = CAMS_A.s01(tA(lt), 2.5, tA(lt)); return { pos: c.pos.clone(), look: c.look.isVector3 ? c.look.clone() : V(...c.look), fov: c.fov, roll: c.roll }; }
  // lead-in: flying up the chimney just ahead of / above the climbing head (A's s01 frame-0 framing), pushing in to it
  getCurve32();
  const tt = tA(lt), a = s0_32 + S32.speed * tt, hc = at32(a), pc = at32(a + 34), out = (p) => V(p.x, 0, p.z).normalize();
  const k = eio(lin(0, S32.lead, lt)), g = lerp(1.7, 1, k);
  const above = hc.clone().addScaledVector(out(hc), 12 * g).add(V(0, 38 * g, 0)), along = pc.clone().addScaledVector(out(pc), 16 * g).add(V(0, 6 * g, 0));
  const pos = along.lerp(above, 0.5);
  const look = at32(a + 4).lerp(at32(a - 24), 0.35);
  return { pos, look, fov: 50, roll: lerp(-14, -8, k) };
}
S32.cam = cam32;
CAMS.s32 = (lt, d, t) => { const c = cam32(lt); if (lt < S32.lead) c.pos.add(shake(t, 72.0, 1.0, 1.0)); return cam(c.pos, c.look, c.fov, c.roll, { near: 0.5, far: 20000 }); };
LOOKS.s32 = (lt, d, t, st) => ({ ...lookHint('SKY', st), key: { dir: [0.4, 0.2, 0.9], color: '#eef0ff', tint: 0.3 }, rim: { dir: [-0.3, 0.8, -0.5], amt: 1.8 } });
const CRACK32 = S32.lead + 0.4 + 72.0;                              // A's hookCrack (0.4) in s32 time = 73.4
ACT.s32 = (lt, d, t, st) => {
  const D = C.api.dragon; D.root.visible = true; D.setLength(null); D.grow(1);
  getCurve32();
  const tq = tw(t), tqA = tq - 72.0 - S32.lead;                   // s01 time on twos
  // A's s01 roar timing (jaw wide, head thrown back on the crack), ramped in during the lead-in
  const roar = (0.62 + 0.38 * sm(0.35, 0.6, tqA)) * (1 - sm(1.5, 2.2, tqA)) * sm(-1.0, -0.2, tqA);
  const thr = sm(0.36, 0.52, tqA) * (1 - sm(1.5, 2.2, tqA));
  D.pose({ name: thr > 0.02 ? 'roar' : 'glide', k: thr, jaw: 0.25 + 0.7 * roar, roar: 0.75 * thr, mane: 1, claws: 0.8 });
  D.follow(curve32, tA(lt), S32.speed, { offset: s0_32, wave: 0.35 });
  D.crown(1); D.eye('dragon');
  D.flash(t >= CRACK32 && t < CRACK32 + 0.09 ? 0.9 : 0);
  // lightning chasing the tail, and A's s01 hero crack (same bolt) at the roar
  for (const [i, t0] of [[0, 72.25], [1, 72.875], [3, 74.125]]) {
    const tail = D.anchor('s:' + (0.75 - i * 0.1)), an = i * 2.1 + 0.7;
    W().lightning(t0, V(Math.cos(an) * 150, tail.y + 120, Math.sin(an) * 150), tail, { key: 's32' + i, width: 9, branches: 5, pattern: [1, 0, 1, 0], flash: 0.35 });
  }
  const hk = at32(s0_32 + S32.speed * 0.4);
  W().lightning(CRACK32 - 0.01, hk.clone().add(V(110, 600, -60)), hk.clone().add(V(14, 18, -6)), { seed: 12, pattern: [1, 1, 1, 0, 1, 0], branches: 7, width: 11, key: 's32h' });
  const f = st.frame, cf = Math.round(CRACK32 * 24);
  if (f === cf) st.look.impact = 2; else if (f === cf + 1) { st.look.impact = 1; st.look.impactCentre = [0.45, 0.7]; }
  W().rain(0.5); W().storm(false);
  if (Math.abs(f - cf) > 3) st.look.flash = Math.min(st.look.flash ?? 0, 0.2);
  st.look.speed = { amount: 0.4, centre: toUV(D.anchor('head'), st), mode: 'radial' };
};
ev(72.0, 'whoosh', 's32 the dragon rockets up the storm chimney');
[72.25, 72.875, 74.125].forEach((x) => ev(x, 'crack', 's32 lightning chasing the tail'));
ev(73.4, 'crack', 's32 the s01 hook moment: hero bolt + ROAR (impact frames, echoes s01 at 0.4)');

// ------------------------------------------------ s33 above (74.5-77.5) SKY dawn: burst out of the clouds, spiral in the sunrise
// golden sunrise: we look INTO the low sun across the cloud tops; the dragon spirals up in front of it (35-50% of frame)
function cam33(lt, d) {
  const k = eio(lt / d), sd = SUN().setY(0).normalize();
  const pos = V(S33.center.x, 0, S33.center.z).addScaledVector(sd, -lerp(340, 300, k)).addScaledVector(V(-sd.z, 0, sd.x), lerp(-40, 30, k));
  pos.y = lerp(1035, 1150, eio(sm(0.15, 1, lt / d)));
  const head = head33(lt), mid = V(S33.center.x, clamp(head.y - 110, 990, 1400), S33.center.z);
  return { pos, look: vl(mid, head, 0.35), fov: 50, roll: 3 - 5 * k };
}
CAMS.s33 = (lt, d, t) => { const c = cam33(lt, d); return cam(c.pos, c.look, c.fov, c.roll, { far: 20000 }); };
// golden dawn grade over the departments' SKY dawn (saturated gold-orange glow across the cloud tops, deep blue zenith)
const DAWN_LOOK = { fog: '#ff9c58', fogDensity: 0.00018, fogNear: 300, fogMax: 0.3, sat: 1.35, contrast: 0.17, bloom: 1.3, exposure: 1.0,
  lift: '#20185a', gain: '#fff2e2', vignette: 0.22, shade: { tint: '#8a7ae0', mix: 0.3 } };
function sunGlows(camPos) {
  const sd = SUN(), p = camPos.clone().addScaledVector(sd, 3000);
  return { glows: [{ pos: p, color: '#ffb040', size: 0.75, amount: 0.85 }, { pos: p, color: '#fff0c0', size: 0.18, amount: 1.0 }], shafts: 0.5, shaftPos: p, shaftColor: '#ffc070' };
}
LOOKS.s33 = (lt, d, t, st) => ({ ...lookHint('SKY', st), ...DAWN_LOOK, ...sunGlows(cam33(lt, d).pos), key: { dir: [-0.4, 0.4, 0.9], color: '#ffe0b8', tint: 0.3 }, rim: { dir: [0.39, 0.1, -0.92], amt: 2.2 } });
let DAWN_SET = null;
function goldenDawn() {   // the SKY dawn group's sky + cloud uniforms, pushed warmer and deeper (only s33/s34 show the dawn group)
  if (!DAWN_SET) {
    const g = C.sets.SKY?.children?.find((c) => c.name === 'sky_dawn'); DAWN_SET = { sky: null, clouds: [] };
    g?.traverse((o) => { const u = o.material?.uniforms; if (!u) return; if (u.uC0 && u.uDiskDir) DAWN_SET.sky = u; else if (u.uGlowCol) DAWN_SET.clouds.push(u); });
  }
  const S = DAWN_SET.sky;
  if (S) {
    S.uC0.value.set('#ffc25a'); S.uC1.value.set('#ff8a4a'); S.uC2.value.set('#5a64cc'); S.uC3.value.set('#1c3290');
    S.uH.value.set(-0.03, 0.04, 0.13, 0.34); S.uCirrus.value = 0.25; S.uBank.value = 0.35; S.uHalo.value = 1.25; S.uHaloCol.value.set('#ff9c38'); S.uDiskR.value = 0.05; S.uDiskEmis.value = 1.3;
    S.uBankCol.value.set('#ff9a70'); S.uBankRim.value.set('#fff0b8'); S.uCirLit.value.set('#ffe4a0'); S.uCirShade.value.set('#c080b0');
  }
  for (const u of DAWN_SET.clouds) {
    u.uColor.value.set('#ffdc98'); u.uShadeC.value.set('#8460c0'); u.uBellyC.value.set('#5a4aa8'); u.uRimCol.value.set('#ffe9a0');
    u.uGlow.value = 1.8; u.uGlowCol.value.set('#ff9628'); u.uFarCol.value.set('#ff9c62'); u.uFarAmt.value = 0.42;
  }
}
ACT.s33 = (lt, d, t, st) => {
  const D = C.api.dragon; D.root.visible = true; D.setLength(null); D.grow(1);
  D.follow(getCurve33(), lt, S33.speed, { offset: off33(), wave: 0.4 });
  D.pose({ name: 'spiral', mane: 1, claws: 0.5 }); D.crown(0.8); goldenDawn();
  const burst = getCurve33().getPointAt(a33 / getCurve33().getLength());
  W().sparkles(V(burst.x, 1010, burst.z), S33.burst, { n: 60, size: 3, speed: 60, dur: 1.4, key: 's33s' });
};
ev(S33.burst, 'burst', 's33 bursts above the clouds into the dawn (music opens up)');
ev(75.8, 'whoosh', 's33 spiral, clouds curling');

// ------------------------------------------------ s34 glide (77.5-79.5) SKY dawn: wide, long S-curves across the sunrise
// wide: the whole S-curve crossing the sun, low over the cloud tops, slow dolly
function cam34(lt, d) {
  const k = eio(lt / d), sd = SUN().setY(0).normalize(), R = s34right();
  const pos = S34.centre.clone().addScaledVector(sd, -S34.dist).addScaledVector(R, lerp(-30, 40, k)).add(V(0, -22 + 6 * k, 0));
  return { pos, look: S34.centre.clone().addScaledVector(R, lerp(-40, 30, k)).add(V(0, 8, 0)), fov: 46, roll: 0 };
}
CAMS.s34 = (lt, d, t) => { const c = cam34(lt, d); return cam(c.pos, c.look, c.fov, c.roll, { near: 0.5, far: 20000 }); };
LOOKS.s34 = (lt, d, t, st) => ({ ...lookHint('SKY', st), ...DAWN_LOOK, ...sunGlows(cam34(lt, d).pos), key: { dir: [-0.4, 0.4, 0.9], color: '#ffe0b8', tint: 0.3 }, rim: { dir: [0.39, 0.1, -0.92], amt: 2.2 } });
ACT.s34 = (lt, d, t, st) => {
  const D = C.api.dragon; D.root.visible = true; D.setLength(null); D.grow(1);
  D.follow(getCurve34(), lt, S34.speed, { offset: off34(), wave: 0.5 });
  D.pose({ name: 'glide', mane: 1 }); D.crown(0.7); goldenDawn();
};
ev(77.6, 'swell', 's34 wide glide, mane streaming (calm music peak)');

// ------------------------------------------------ s35 over gorge (79.5-80.5): fast low flight, the heron flees
const CAM35 = { pos: V(0.6, 1.25, -8.8) };
CAMS.s35 = (lt, d, t) => {
  const head = headOn(g35, RO.s35, lt), k = sm(0.25, 0.85, lt);
  const look = vl(V(2.4, 7, -60), head.clone().add(V(0, -6, 0)), 0.6 * k);
  return cam(CAM35.pos.clone().add(shake(t, 80.0, 0.12, 0.5)), look, 52, -3 + 6 * k);
};
LOOKS.s35 = (lt, d, t, st) => ({ ...lookHint('GORGE', st), key: { dir: [0.2, 0.5, 0.9], color: '#ffe6cc', tint: 0.25 } });
ACT.s35 = (lt, d, t, st) => {
  const D = C.api.dragon; D.root.visible = true; D.setLength(null); D.grow(1);
  D.follow(g35(), lt, RET.speed, { offset: RO.s35, wave: 0.5, twos: false });
  D.pose({ name: 'glide', mane: 1 }); D.crown(0.6);
  const He = C.api.heron, hr = C.api.heights.heronRock.top, tq = tw(t);
  He.root.visible = true;
  if (tq < 79.62) { He.root.position.copy(hr); He.root.rotation.set(0, Math.PI, 0); He.pose('stand', 1); He.eye('wide'); }
  else {
    const u = tq - 79.62, p = hr.clone().add(V(2.2 * u + 1.5 * u * u, 1.8 * u * u + 0.6 * u, 3.5 * u));
    He.root.position.copy(p); He.root.rotation.set(0, Math.atan2(0.6, 0.8), 0);
    He.pose(u < 0.25 ? 'takeoff' : 'flee', u * 5); He.eye('wide');
    if (tq < 79.62 + 1 / 12) He.smear(0.5);
  }
  W().rapids(1.5); W().rain(0);
};
ev(79.5, 'whoosh', 's35 the dragon screams down the gorge');
ev(79.62, 'flap', 's35 the heron flees, squawk');

// ------------------------------------------------ s36 over town (80.5-81.75): the cat looks up in awe
CAMS.s36 = (lt, d, t) => {
  const k = eio(lt / d), cs = C?.api?.vale?.town?.catSeat ?? V(-3.7, 0.42, -36);
  return cam(cs.clone().add(V(1.25 - 0.15 * k, 0.02 + 0.02 * k, 0.55 - 0.1 * k)), cs.clone().add(V(-0.6, 0.85 + 0.35 * k, -0.45)), 54, 0, { near: 0.02 });
};
LOOKS.s36 = (lt, d, t, st) => ({ ...valeLook('TOWN', 's36'), valeSky: 'TOWN_HORIZON', fogDensity: 0.0012 });
ACT.s36 = (lt, d, t, st) => {
  const D = C.api.dragon; D.root.visible = true; D.setLength(null); D.grow(1);
  D.follow(t36(), lt, RET.speed, { offset: RO.s36, wave: 0.5, twos: false });
  D.pose({ name: 'glide', mane: 1 }); D.crown(0.6);
  const cat = C.api.cat, tq = tw(t);
  const cs = C.api.vale.town.catSeat, cf = C.api.vale.town.catFace ?? V(1, 0, 0);
  cat.root.visible = true; cat.root.position.copy(cs); cat.root.rotation.set(0, Math.atan2(cf.x, cf.z), 0);
  if (tq < 80.75) cat.pose('watch', (tq - 80.5) * 1.5); else cat.pose('awe', sm(80.75, 81.1, tq));
};
ev(80.6, 'whoosh', 's36 the dragon passes over the roofs, noren flap');
ev(80.8, 'meow', 's36 the cat, awed');

// ------------------------------------------------ s37 over bamboo (81.75-83.0): the culms bend in its wind
// the head rushes at us down the valley on frame 0 (body S trailing back over the canopy), passes under the camera, and the
// camera tilts down after it: the last frames are the culms bowing in its wake as the koi tail flicks out of frame
const S37 = { z: 36, y: 74, speed: 300, head0: -30 };
CAMS.s37 = (lt, d, t) => {
  const k = eio(lt / d), cx = C?.api?.vale?.bamboo?.centerX ?? (() => 0), dn = eio(sm(0.15, 1.0, lt / d));
  const pos = V(cx(30) + 22 - 2 * k, S37.y - 4 * k, S37.z - 4 * k).add(shake(t, 82.0, 0.5, 0.6));
  const look = vl(V(cx(-20) - 2, 16, -20), V(cx(22) + 4, 0, 22), dn);
  return cam(pos, look, lerp(54, 60, dn), lerp(0, -4, dn), { near: 0.2 });
};
LOOKS.s37 = (lt, d, t, st) => ({ ...valeLook('BAMBOO', 's37') });
ACT.s37 = (lt, d, t, st) => {
  const D = C.api.dragon; D.root.visible = true; D.setLength(null); D.grow(1);
  const c = b37(), L = c.getLength(); let off = 0;   // arc where the head is at z = head0 on frame 0
  for (let a = 0; a < L; a += 2) if (c.getPointAt(a / L).z >= S37.head0) { off = a; break; }
  D.follow(c, lt, S37.speed, { offset: off, wave: 0.5, twos: false });
  D.pose({ name: 'glide', mane: 1 }); D.crown(0.6);
  // the gust stays under the camera while the body streams through it: the culms there bow harder and harder
  const head = D.anchor('head'), f = clamp((head.z - 18) / 300, 0, 0.98), at = D.anchor('s:' + f.toFixed(3));
  C.api.vale.bamboo.bend(lerp(1.2, 2.8, sm(0.1, 1, lt / d)), V(at.x, 0, Math.min(at.z, 26)), V(0, 0, 1), 26);
};
ev(81.8, 'wind', 's37 bamboo roars and bends in the dragon\'s wake');

// ------------------------------------------------ s38 temple (83.0-85.5): circling over the temple, spout + dragon in one frame
CAMS.s38 = (lt, d, t) => {
  const k = eio(lt / d);
  return cam(V(7.4 - 0.6 * k, 0.55 + 0.1 * k, 2.2 - 0.4 * k), V(1.0, 5.2 + 1.5 * k, -14), 52, 0);
};
LOOKS.s38 = (lt, d, t, st) => ({ ...valeLook('POND', 's38'), mirror: { on: true, y: 0, strength: 0.85, rough: 0.06, distort: 0 }, fogDensity: 0.004 });
ACT.s38 = (lt, d, t, st) => {
  const D = C.api.dragon; D.root.visible = true; D.setLength(null); D.grow(1);
  D.follow(getCurve38(), lt, S38.speed, { offset: 520, wave: 0.6 });
  D.pose({ name: 'glide', mane: 0.7 }); D.crown(0.6);
  // the koi look up: three of the crowd hang under the surface near the camera, noses up
  const K = C.api.koi;
  const spots = [[3.6, -0.18, -0.6, 0.2], [2.6, -0.25, 0.4, -0.5], [4.6, -0.3, 0.6, 0.9], [1.6, -0.35, -1.4, 0.4]];
  K.crowd.forEach((k, i) => {
    const s = spots[i]; if (!s) { k.root.visible = false; return; }
    k.root.visible = true; k.root.position.set(s[0], s[1], s[2]); orient(k.root, V(Math.sin(s[3]) * 0.4, 1, Math.cos(s[3]) * 0.4), V(0, 0, 1));
    k.swim(tw(t) * 0.6 + i, 0.25).eye('awe');
  });
};
ev(83.0, 'chime', 's38 the dragon circles over the temple (temple bell)');

// ------------------------------------------------ s39 end (85.5-88.0): the leaf, the reflection, a ripple, fade to white-gold
const RIP39 = 86.7;
CAMS.s39 = (lt, d, t) => {   // low over the water at the south edge; a slow settle toward the leaf
  const k = eio(lt / d);
  return cam(S39.cam.clone().add(V(-0.02 * k, -0.015 * k, -0.12 * k)), S39.look.clone().add(V(0, -0.25 * k, 0)), S39.fov, 0, { near: 0.02 });
};
LOOKS.s39 = (lt, d, t, st) => {
  const sunP = (C?.api?.vale?.pond?.sun ?? V(0.7, 0.085, -1).normalize()).clone().multiplyScalar(400);
  return { ...valeLook('POND', 's39'), mirror: { on: true, y: 0, strength: 1, rough: 0.08, distort: 0 }, fogDensity: 0.004, fogMax: 0.3,
    glows: [{ pos: sph39(27, 22, 3000), size: 0.3, amount: 0.55, color: '#ffe0a8' }, { pos: sunP, size: 0.25, amount: 0.25, color: '#ffd8a0' }], fade: sm(87.5, 88.0, t), fadeColor: '#fff2d6', sat: 1.1, contrast: 0.14 };
};
// lay the dragon for the current render pass: real = high over the temple (sky path), reflection pass = the water path
function place39(refl) {
  if (!D39 || D39.mode === refl) return;
  D39.mode = refl;
  const D = C.api.dragon, c = getCurve39(refl ? 'water' : 'sky'), L = c.getLength(), ltq = Math.floor(D39.lt * 12 + 1e-6) / 12;
  const k = S39.twos;   // whiskers / mane ride S.t: slow their clock (calm wiggle) while the head keeps its speed
  D.root.visible = true; D.grow(1);
  if (refl) {
    D.setLength(3.4);
    D.follow(c, ltq * k, L * 0.45 / k, { offset: L * 0.04, wave: 0.06, roll: 0.55, twos: false });
  } else {
    D.setLength(null);
    D.follow(c, ltq * k, L * 0.3 / k, { offset: L * 0.1, wave: 0.08, roll: 0.75, twos: false });
  }
  D.pose({ name: 'glide', mane: 0.55 }); D.crown(0.7);
  D.root.updateMatrixWorld(true);
}
ACT.s39 = (lt, d, t, st) => {
  D39 = { lt, mode: null };
  place39(false);
  if (G39) G39.visible = true;
  const lf = leaf39();
  if (LEAF) {
    // the leaf rides the water; it bobs once as the reflection slides under it (RIP39), then settles
    const tq = tw(t), a = tq - RIP39, bob = a > 0 ? Math.sin(a * 11) * Math.exp(-a * 2.6) : 0;
    LEAF.visible = true;
    LEAF.position.set(lf.x + 0.01 * lt, 0.012 + 0.014 * bob, lf.z - 0.01 * lt);
    LEAF.rotation.set(0.32 + 0.12 * bob, 0.5 + 0.04 * lt, 0.05 * bob);
  }
  W().ripple(lf.x, lf.z, 84.9, 0.45, { key: 's39a', mirror: true });   // the soft ring it already sits in
  W().ripple(lf.x, lf.z, RIP39, 0.8, { key: 's39r', mirror: true });
  C.api.vale?.pond?.mist?.(0);   // clear water: no mist cards over the pond
  // clear water that mirrors strongly at this grazing angle, slightly cooler + darker than the sky (restored in update())
  const S = W().get?.('POND');
  if (S?.U?.uRefl) {
    if (!REFL.saved) { REFL.saved = {}; for (const k of ['uRefl', 'uStrokes']) REFL.saved[k] = S.U[k].value; }
    S.U.uRefl.value = REFL.saved.uRefl * 1.7; S.U.uStrokes.value = REFL.saved.uStrokes * 0.8;
    REFL.h = S;
  }
};
ev(85.6, 'ambience', 's39 still pond, birdsong');
ev(RIP39, 'drip', 's39 a single drop: ripple under the leaf');
ev(87.5, 'swell', 's39 fade to white-gold');

// ================================================================================================ create
export async function create(ctx) {
  C = ctx;
  buildProps();
  // s39: the reflection camera sees the dragon on its water path (AU.uReflectPass is 1 while the mirror pass renders);
  // every other render (main, refraction pre-pass, main.js prerender) sees it on the sky path
  const prevBR = ctx.scene.onBeforeRender;
  ctx.scene.onBeforeRender = function (...a) { const r = prevBR.apply(this, a); if (D39) place39(ctx.A.AU.uReflectPass.value > 0.5); return r; };
  return {
    update(st) {
      // props hidden unless their shot shows them (ACT runs after this and turns them on)
      if (LOG) LOG.visible = false;
      if (LEAF) LEAF.visible = false;
      if (G39) G39.visible = false;
      D39 = null;
      if (REFL.h && REFL.saved) for (const k in REFL.saved) REFL.h.U[k].value = REFL.saved[k];
      if (ctx.api.water?.storm) ctx.api.water.storm(true);
    },
  };
}
