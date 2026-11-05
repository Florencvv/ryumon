// direction/act1.js - DIRECTION A (RYUMON): shots s01-s19 cameras (CAMS), colour script (LOOKS) and choreography (ACT).
// Rules: cameras on ones, characters on twos (A.onTwos), FX on threes; Hi travels
// upstream = screen-left in side views, up in top views; payoffs never hidden; 1-2 impact frames then a hold.
// Owns only this file. Extra props it builds (the s02 maple leaf, the s19 ghost koi) are hidden every frame in update()
// and shown by their shot's ACT.
import * as THREE from 'three';
import { mergeLook } from '../look.js';

let C = null;                                    // ctx (set in create)
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const lin = (a, b, x) => clamp((x - a) / (b - a));
const ss = (a, b, x) => { const k = lin(a, b, x); return k * k * (3 - 2 * k); };              // smoothstep
const s5 = (a, b, x) => { const k = lin(a, b, x); return k * k * k * (k * (k * 6 - 15) + 10); }; // smootherstep
const eOut = (a, b, x) => { const k = lin(a, b, x); return 1 - (1 - k) ** 3; };
const eIn = (a, b, x) => { const k = lin(a, b, x); return k * k * k; };
const L3 = (a, b, k) => V3(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
const tw = (t) => Math.floor(t * 12 + 1e-6) / 12;           // on twos
const th = (t) => Math.floor(t * 8 + 1e-6) / 8;             // on threes
const DEG = Math.PI / 180;
const eul = new THREE.Euler(0, 0, 0, 'YXZ');
// orient an object (faces +Z) along dir with a roll; leaves rotation.order untouched (quaternion)
function aim(obj, dir, roll = 0, pitchExtra = 0) {
  const d = dir.clone().normalize();
  eul.set(-Math.asin(clamp(d.y, -1, 1)) + pitchExtra, Math.atan2(d.x, d.z), roll, 'YXZ');
  obj.quaternion.setFromEuler(eul);
}
const flat = (x, z) => V3(x, 0, z).normalize();
// camera noise on ones (handheld): smooth, seeded
function shake(t, amp, f = 1, seed = 0) {
  const n = (a) => Math.sin(t * f * 6.1 + a) * 0.5 + Math.sin(t * f * 13.7 + a * 2.3) * 0.3 + Math.sin(t * f * 23.3 + a * 4.1) * 0.2;
  return V3(n(seed) * amp, n(seed + 11) * amp, n(seed + 23) * amp);
}
const cam = (pos, look, fov = 40, roll = 0, extra = {}) => ({ pos, look, fov, roll, ...extra });
// key light toward the subject from the camera side (cheated so faces read): dir points FROM subject TO light
const keyFrom = (camPos, subj, up = 0.6, side = 0) => { const d = camPos.clone().sub(subj).normalize(); d.y += up; d.x += side; return d.normalize().toArray(); };

// ------------------------------------------------------------ set data (filled lazily from ctx.api)
const G = {};
function geo() {
  if (G.ok) return G;
  const v = C.api.vale, h = C.api.heights;
  G.pond = v?.pond; G.town = v?.town; G.bamboo = v?.bamboo;
  G.leafLand = G.pond?.leafLand?.clone() ?? V3(0.6, 0, 1.4);
  G.inletLip = G.pond?.inletLip?.clone() ?? V3(-6.15, 0.3, -6.35);
  G.inletBase = G.pond?.inletBase?.clone() ?? V3(-6, 0, -5.75);
  G.mouth = C.api.spout?.mouth?.clone() ?? V3(5.19, 1.4, -2.44);
  G.sx = G.bamboo?.centerX ?? ((z) => 0);
  G.cx = G.town?.centerX ?? ((z) => 0);
  G.catSeat = G.town?.catSeat?.clone() ?? V3(-3.7, 0.42, -36);
  G.heronRock = h?.heronRock?.top?.clone() ?? V3(3.68, 0.58, -14);
  G.lane = h?.rapids?.lane ?? ((z) => 0);
  // heron strike spot: the river-side shoulder of its rock (feet raycast onto the rock)
  G.heronSpot = V3(G.heronRock.x - 0.8, 0.27, G.heronRock.z);
  G.catSpot = V3(-3.36, G.catSeat.y, G.catSeat.z);
  try {
    const rc = new THREE.Raycaster(), meshes = [];
    const hit = (set, x, z, top = 4) => {
      const g = C.sets[set]; const was = g.visible; g.visible = true; g.updateMatrixWorld(true);
      if (!meshes[set]) { meshes[set] = []; g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) meshes[set].push(o); }); }
      rc.set(V3(x, top, z), V3(0, -1, 0));
      const r = rc.intersectObjects(meshes[set], false).filter((i) => i.point.y > -1 && i.point.y < top - 0.1);
      g.visible = was; return r.length ? r[0].point.y : null;
    };
    const y1 = hit('GORGE', G.heronSpot.x, G.heronSpot.z); if (y1 !== null) G.heronSpot.y = y1;
    const y2 = hit('TOWN', G.catSpot.x, G.catSpot.z); if (y2 !== null) G.catSpot.y = y2;
  } catch (e) { /* keep fallbacks */ }
  G.ok = true;
  return G;
}

// ------------------------------------------------------------ props owned by direction A
let leaf = null, ghosts = [], curSt = null;
// s18: per-frame restyle of WATER's GORGE surface underside (deeper blue-violet ceiling), restored on every other frame
let surfSaved = null;
function surfU() { try { return C.api.water?.get?.('GORGE')?.U ?? null; } catch (e) { return null; } }
function restoreSurf() { const U = surfU(); if (U && surfSaved) for (const k in surfSaved) U[k].value.copy(surfSaved[k]); }
function styleSurf(cols) {
  const U = surfU(); if (!U) return;
  if (!surfSaved) { surfSaved = {}; for (const k in cols) if (U[k]?.value?.isColor) surfSaved[k] = U[k].value.clone(); }
  for (const k in cols) if (U[k]?.value?.isColor) U[k].value.set(cols[k]);
}

// ------------------------------------------------------------ shot geometry (shared by CAMS and ACT)
// s02: the leaf falls and lands at leafLand (CUES.leafLand), Hi rises beside it and its eye breaks the surface (eyeUp)
function leafPos(t) {
  const g = geo(), L = g.leafLand, tl = C.CUES.leafLand;
  if (t >= tl) return { p: V3(L.x, 0.004, L.z), rot: [0, 0.6 + 0.04 * Math.sin(t * 1.3), 0], landed: true };
  const u = lin(2.5 - 0.35, tl, t);           // falls the last 0.2 m with a drifting sway
  const y = lerp(0.24, 0.004, u * u * 0.4 + u * 0.6);
  const sway = Math.sin(u * Math.PI * 2.2) * (1 - u);
  return { p: V3(L.x + 0.07 * sway, y, L.z - 0.05 * (1 - u)), rot: [0.5 * sway, 0.6 + 1.2 * (1 - u), 0.6 * sway], landed: false };
}
const S02 = { hi: () => { const L = geo().leafLand; return V3(L.x - 0.06, 0, L.z + 0.1); }, yaw: -38 * DEG };
// s05: the stone spout seen 3/4 from the front, low on the water, the sunrise behind it
const S05 = { rot: -38, d0: 2.15, d1: 1.8 };
function s05Geo() {
  if (G.s05) return G.s05;
  // the spout sits on vale.pond.spoutRock facing spoutFace (creatures' placeAt): rebuild its frame here (no frame order dependency)
  const pond = C.api.vale?.pond, rock = pond?.spoutRock?.clone() ?? V3(5.55, 1.02, -2.65);
  const fx = (pond?.spoutFace ?? V3(-0.86, 0, 0.5)).clone().setY(0).normalize();
  const local = (x, y, z) => V3(x * fx.z + z * fx.x, y, -x * fx.x + z * fx.z).add(rock);
  const a = Math.atan2(fx.z, fx.x) + S05.rot * DEG;
  G.s05 = { head: local(0, 0.42, 0.2), mouth: local(0, 0.378, 0.42), c: V3(Math.cos(a), 0, Math.sin(a)), pour: pond?.spoutPour?.clone() ?? V3(4.55, 0, -2.05), d0: S05.d0, d1: S05.d1 };
  return G.s05;
}
// s06 (and s05 POV): Hi near the surface by the inlet side, looking at the stone spout
const S06 = { head: V3(0.45, 0, 1.15) };
// s07: inlet leap
function s07Hi(t) {
  const g = geo(), base = g.inletBase, lip = g.inletLip, tL = C.CUES.inletLeap, dur = 0.5;
  const p0 = V3(base.x + 0.45, -0.07, base.z + 1.9), p1 = V3(base.x + 0.02, -0.05, base.z + 0.18);
  const land = V3(lip.x - 0.08, 0.22, lip.z - 0.75);
  if (t < tL) { const u = s5(13.0, tL, t); const p = L3(p0.toArray(), p1.toArray(), u); return { p, dir: p1.clone().sub(p0).setY(0), phase: 'swim', u }; }
  if (t < tL + dur) {
    const u = (t - tL) / dur, p = L3(p1.toArray(), land.toArray(), u); p.y += 4 * 0.42 * u * (1 - u) + (land.y - p1.y) * 0 ;
    const dy = 4 * 0.42 * (1 - 2 * u) + (land.y - p1.y), dir = V3(land.x - p1.x, dy, land.z - p1.z);
    return { p, dir, phase: 'leap', u };
  }
  // upstream along the inlet stream
  const s = g.pond?.inletStream; const u = (t - tL - dur) * 0.55;
  if (s) { const k = clamp(0.06 + u * 0.18, 0, 1), p = s.getPointAt(k); p.y = 0.24; const d = s.getTangentAt(k); return { p, dir: d.setY(0), phase: 'after', u }; }
  return { p: land.clone().add(V3(0, 0, -u)), dir: V3(0, 0, -1), phase: 'after', u };
}
// s08/s09: bamboo stream
const bamX = (z) => geo().sx(z);
const bamDir = (z) => V3(bamX(z - 0.5) - bamX(z + 0.5), 0, -1).normalize();
const s08Z = (t) => lerp(-2.0, -8.2, lin(15.5, 18.0, t));
const s09Z = (t) => lerp(-19.4, -22.6, lin(18.0, 20.0, t));
const S09 = { h0: 25, h1: 21.5, fov: 36 };
// s10/s11: canal
const canX = (z) => geo().cx(z);
const s10Z = (t) => lerp(-5.2, -16.8, lin(20.0, 23.0, t));
const s11Z = (t) => (t < 23.7 ? lerp(-33.4, -35.75, lin(23.0, 23.7, t)) : lerp(-35.75, -38.6, eOut(23.7, 25.0, t)));
const s12Z = (t) => lerp(-128.0, -133.8, lin(25.0, 27.5, t));
// s13: rapids
const S18 = { roll: -0.8 };
const s13Z = (t) => lerp(7.5, 3.6, lin(27.5, 30.0, t));
const S13 = { off0: 1.45, off1: 0.85, side: 1.35, lx: 0.75, lz: 1.1 };
// s15/s16: heron strike geometry
const HERON_FACE = flat(-0.95, 0.3);
function heronTip(lean, k = 1) { const g = geo(), H = g.heronSpot; const f = 0.25 * Math.sin(lean) + 1.05 * Math.cos(lean), y = 0.25 * Math.cos(lean) - 1.05 * Math.sin(lean); return H.clone().addScaledVector(HERON_FACE, f * k).add(V3(0, y * k + 1.1 * (1 - k), 0)); }
// s16 leap: takeoff 34.5, apex ~34.97, splash 35.45
// (measured: the snap pose puts the beak tip at feet + (-1.2, 0.83, 0.38) at 34.75; the arc passes ~0.3 m over it then)
const S16 = { t0: 34.42, dur: 1.0, p0: () => geo().heronSpot.clone().add(V3(-0.78, 0, 1.25)).setY(-0.04), p1: () => geo().heronSpot.clone().add(V3(-1.8, 0, -0.87)).setY(-0.05), h: 1.48 };
function s16Arc(t) {
  const u0 = lin(S16.t0, S16.t0 + S16.dur, t);
  const u = u0 < 0.5 ? 0.5 * (1 - (1 - 2 * u0) ** 1.6) : 0.5 + 0.5 * (2 * u0 - 1) ** 1.6;   // hang at the apex
  const p0 = S16.p0(), p1 = S16.p1(), p = p0.clone().lerp(p1, u); p.y = lerp(p0.y, p1.y, u) + 4 * S16.h * u * (1 - u);
  const dir = p1.clone().sub(p0); dir.y = 4 * S16.h * (1 - 2 * u) * 1.0; return { p, dir, u, u0 };
}
// s19: falls reveal
const S19 = { hi0: V3(4.6, -0.03, 121.0), hi1: V3(4.0, -0.02, 117.4), cam: V3(6.6, 5.0, 147.0) };

function s01Curve() {
  if (G.s01curve) return G.s01curve;
  // a corkscrew up the storm chimney (radius 55, ~620 m per turn): the 300 m body reads as diagonal S-coils
  const pts = []; for (let i = 0; i <= 64; i++) { const u = i / 64, an = u * Math.PI * 2 * 3.2 + 0.4; pts.push(V3(Math.cos(an) * 55, -400 + u * 2000, Math.sin(an) * 55)); }
  G.s01curve = new THREE.CatmullRomCurve3(pts);
  const len = (G.s01len = G.s01curve.getLength()); G.s01off = len * 0.5;
  for (let u = 0; u <= 1; u += 0.001) if (G.s01curve.getPointAt(u).y >= 470) { G.s01off = u * len; break; }   // head at y ~470 on frame 0
  const h0 = G.s01curve.getPointAt(G.s01off / len), a0 = Math.atan2(h0.z, h0.x) - 0.9;
  G.s01cam = V3(Math.cos(a0) * 108, h0.y - 45, Math.sin(a0) * 108);
  return G.s01curve;
}
function s01Head(t) { s01Curve(); return G.s01curve.getPointAt(clamp((G.s01off + 200 * t) / G.s01len, 0, 1)); }
const S01 = { pass: 0.55, lead: 38, R0: 12, R: 30, mix: 0.5 };
const s01At = (s) => { s01Curve(); return G.s01curve.getPointAt(clamp(s / G.s01len, 0, 1)); };
const s01Out = (p) => V3(p.x, 0, p.z).normalize();
// camera point in a camera-space frame (x right, y up in -1..1 of the view at distance D)
function camPoint(c, x, y, D) {
  const f = (c.look.isVector3 ? c.look : V3(...c.look)).clone().sub(c.pos).normalize(), r = f.clone().cross(V3(0, 1, 0)).normalize(), u = r.clone().cross(f);
  const th = Math.tan(c.fov * DEG / 2), tw2 = th * 1920 / 1040;
  return c.pos.clone().addScaledVector(f, D).addScaledVector(r, x * tw2 * D).addScaledVector(u, y * th * D);
}
// ------------------------------------------------------------ CAMS
export const CAMS = {
  // s01 HOOK: inside the storm chimney looking up; the white dragon streams up past us into the light, lightning already lit
  s01: (lt, d, t) => {
    // frame 0: the camera flies up the chimney just ahead of the roaring head (jaw at us, mane streaming, bolt beside it);
    // the dragon gains on us, roars at the crack, whooshes past at `pass`, the camera whips up after it into the light
    const { pass, lead, R0, R } = S01, s0 = G.s01off ?? (s01Curve(), G.s01off);
    const sh = shake(t, 0.5 + 2.6 * Math.exp(-1 * ((t - 0.42) * 7) ** 2) + 1.5 * Math.exp(-1 * ((t - pass) * 6) ** 2), 1.4, 3);
    let pos;
    if (t < pass) {
      // above the climbing head (3/4 from its dorsal side: open jaw + forehead + crown toward us), it gains on us
      // blend of 'ahead along the path' (jaw at us) and 'straight above' (forehead + crown at us)
      const k = t / pass, hc = s01At(s0 + 200 * t), pc = s01At(lerp(s0 + 34, s0 + 200 * pass, k));
      const above = hc.clone().addScaledVector(s01Out(hc), lerp(R0, R, ss(0, 1, k))).add(V3(0, lerp(lead, 6, k), 0));
      const along = pc.clone().addScaledVector(s01Out(pc), lerp(16, R, ss(0, 1, k))).add(V3(0, 6, 0));
      pos = along.lerp(above, S01.mix);
    } else {
      const hp = s01At(s0 + 200 * pass), kk = eOut(pass, 2.5, lt);
      pos = hp.clone().addScaledVector(s01Out(hp), R).add(V3(0, 6 + 150 * kk, 0));
    }
    pos.add(sh);
    const hd = s01Head(tw(Math.max(t, 0)) + 0.02), up = s5(1.2, 2.5, lt);
    // early: aim a little below the head so the head sits high in frame with the body S trailing down
    const tail = s01Head(Math.max(0, tw(t) - 0.12));
    const look = hd.clone().lerp(tail, 0.35 * (1 - ss(0.25, pass, lt))).lerp(V3(-6, 1080, -16), 0.25 * up);
    return cam(pos, look, lerp(50, 60, s5(0.3, 1.4, lt)), lerp(-8, 6, s5(0, 2.5, lt)), { near: 0.5, far: 20000 });
  },
  // s02 macro on the dawn surface: leaf lands, then a slow push to Hi's eye breaking the surface
  s02: (lt, d, t) => {
    const g = geo(), L = g.leafLand, e = S02.hi();
    const k = s5(0.55, 1.9, lt);
    const tgt = V3(lerp(L.x, e.x - 0.01, k), lerp(0.035, 0.06, k), lerp(L.z, e.z, k));
    const pos = V3(lerp(L.x + 0.42, e.x + 0.26, k), lerp(0.1, 0.085, k), lerp(L.z + 0.56, e.z + 0.34, k)).add(shake(t, 0.0025, 0.6, 1));
    return cam(pos, tgt, lerp(34, 27, k), 0, { near: 0.01 });
  },
  // s03 wide garden at dawn: slow push across the pond toward the temple
  s03: (lt, d, t) => {
    const k = s5(0, d, lt);
    return cam(V3(lerp(2.3, 1.2, k), lerp(2.6, 2.05, k), lerp(12.6, 9.6, k)), V3(lerp(-0.5, -0.9, k), lerp(1.75, 1.45, k), -6.5), lerp(47, 44, k));
  },
  // s04 underwater: luminous pond, big koi glide through, Hi nudged aside
  s04: (lt, d, t) => {
    const k = s5(0, d, lt), j = Math.exp(-1 * ((t - 8.05) * 5) ** 2);
    const pos = V3(lerp(-0.62, -1.02, k), -0.47, lerp(2.62, 2.5, k)).add(shake(t, 0.004 + 0.01 * j, 1.2, 5));
    return cam(pos, V3(lerp(-1.0, -1.32, k), -0.44, 1.2), lerp(44, 40, k), 0, { near: 0.02 });
  },
  // s05 Hi's POV at the waterline: the stone spout against the sunrise, gentle swell bob, slow push
  // 3/4 low from the water surface: the carved head against the sunrise glow, the stream arcing down toward us
  s05: (lt, d, t) => {
    const S = s05Geo(), k = s5(0, d, lt);
    const pos = S.head.clone().addScaledVector(S.c, lerp(S.d0, S.d1, k)).setY(0.1 + 0.012 * Math.sin(t * 2.6) + 0.006 * Math.sin(t * 4.3 + 1));
    const look = S.head.clone().lerp(S.pour, lerp(0.42, 0.36, k)).add(V3(0, 0.01 * Math.sin(t * 2.6 + 0.5), 0));
    return cam(pos, look, lerp(44, 40, k), 0.8 * Math.sin(t * 1.9), { near: 0.02 });
  },
  // s06 CU Hi's eye (the wish): push in on the eye, beat at the determined turn
  s06: (lt, d, t) => {
    const e = hiEyeS06(), side = s06Side();
    const k = s5(0, d, lt), b = eOut(0.95, 1.35, lt);
    const dist = lerp(0.26, 0.16, k) - 0.025 * b;
    const pos = e.clone().addScaledVector(side, dist).add(V3(0, 0.05 - 0.012 * k, 0)).addScaledVector(s06Fwd(), 0.035);
    return cam(pos, e.clone().add(V3(0, 0.004, 0)).addScaledVector(s06Fwd(), 0.012), lerp(30, 25, k), 0, { near: 0.005 });
  },
  // s07 the inlet: side view from the west bank, Hi leaps the little cascade toward screen-left
  s07: (lt, d, t) => {
    const g = geo(), b = g.inletBase, k = s5(0, d, lt), lp = eOut(1.2, 1.85, lt) - 0.5 * s5(1.85, 2.5, lt);
    const pos = V3(lerp(-8.05, -8.2, k), lerp(1.3, 1.38, k), lerp(-3.75, -4.75, k)).add(shake(t, 0.006, 0.8, 7));
    const look = V3(lerp(b.x + 0.4, b.x - 0.05, k), lerp(0.12, 0.26, k) + 0.1 * lp, lerp(b.z + 1.1, b.z - 0.6, k));
    return cam(pos, look, lerp(38, 35, k), 0, { near: 0.02 });
  },
  // s08 bamboo: low tracking along the stream beside Hi (camera on the -x bank side, looking upstream diagonally)
  s08: (lt, d, t) => {
    const z = s08Z(t), x = bamX(z);
    const pos = V3(bamX(z + 0.95) - 0.78, 0.24 + 0.012 * Math.sin(t * 3.1), z + 0.95).add(shake(t, 0.006, 1.3, 9));
    return cam(pos, V3(x + 0.05, 0.02, z - 0.75), 44, -2, { near: 0.02 });
  },
  // s09 top-down: tiny red-white dot winding up the frame through the bamboo; slow descend + slight rotation
  s09: (lt, d, t) => {
    // high enough that the stream's winding gap through the canopy reads; Hi's dot glints in it; slow descend + turn
    const k = s5(0, d, lt), z = lerp(-20.4, -21.8, k), x = bamX(z);
    return cam(V3(x + 0.4, lerp(S09.h0, S09.h1, k), z + 1.2), V3(x, 0, z - 0.6), S09.fov, lerp(-10, 4, k));
  },
  // s10 town: gliding along the canal behind/left of Hi, Hi pulls ahead under the first arched bridge
  s10: (lt, d, t) => {
    const k = lin(0, d, lt), zc = lerp(-2.6, -11.8, s5(0, d, lt) * 0.35 + k * 0.65), zh = s10Z(t);
    const pos = V3(canX(zc) - 1.25, lerp(0.62, 0.9, k), zc);
    const look = V3(canX(zh) + 0.55, lerp(0.1, 1.0, ss(0.4, d, lt)), lerp(zh - 0.6, zh - 4, ss(0.3, d, lt)));
    return cam(pos, look, lerp(42, 46, k), -1.5, { near: 0.02 });
  },
  // s11 the cat: from the landing downstream of the cat (cat 3/4 front at frame left, Hi swims away screen-left), push in
  //   on the swipe, then onto the cat's surprised face
  s11: (lt, d, t) => {
    const g = geo(), c = g.catSpot, z = s11Z(t);
    const p1 = eOut(0.55, 0.8, lt), p2 = s5(1.0, 1.6, lt);
    const pos = V3(lerp(-2.75, -2.95, p1) + 0.22 * p2, lerp(0.95, 0.9, p1) - 0.05 * p2, lerp(-31.9, -32.8, p1) - 1.05 * p2).add(shake(t, 0.005 + 0.012 * Math.exp(-1 * ((t - 23.72) * 9) ** 2), 1.3, 13));
    const look = V3(lerp(-2.95, -3.05, p1) - 0.25 * p2, lerp(0.42, 0.5, p1) + 0.18 * p2, lerp(z - 0.6, -35.9, Math.max(p1, 0.55)));
    return cam(pos, look, lerp(lerp(44, 38, p1), 30, p2), 0, { near: 0.02 });
  },
  // s12 horizon: low behind Hi on the widening river, crane up to the far ranges + waterfall thread under the orange sky
  s12: (lt, d, t) => {
    const k = s5(0, d, lt), z = lerp(-126.2, -129.6, k);
    const pos = V3(canX(z) + 0.35, lerp(0.42, 2.4, k), z);
    return cam(pos, V3(lerp(-6, -30, k), lerp(0.2, 70, k), lerp(-146, -1300, k)), lerp(40, 36, k));
  },
  // s13 gorge rapids: low, handheld, tracking Hi fighting upstream between boulders, sunset ahead
  s13: (lt, d, t) => {
    // low tracking dolly beside Hi (on ones, slightly faster than Hi so the rapids slide past), the strata cliff + pines
    // of the far wall and the sunset V behind; bumps on the chop
    const k = s5(0, d, lt), zc = s13Z(t) + lerp(S13.off0, S13.off1, lin(0, d, lt) * 0.6 + k * 0.4), x = geo().lane(zc);
    const pos = V3(x - lerp(S13.side, S13.side - 0.2, k), 0.34 + 0.035 * Math.sin(t * 6.1) + 0.02 * Math.sin(t * 11.3), zc).add(shake(t, 0.02, 1.8, 17));
    const zh = s13Z(t), look = V3(geo().lane(zh) + S13.lx, lerp(0.5, 0.48, k), zh - S13.lz);
    return cam(pos, look, lerp(54, 51, k), -4 + 3 * Math.sin(t * 1.9), { near: 0.03 });
  },
  // s14 heron: low below the rock against the sunset; slow push, then a crash push onto the yellow eye at heronLock
  s14: (lt, d, t) => {
    const g = geo(), H = g.heronSpot, k = s5(0, 1.0, lt), z = eOut(1.0, 1.28, lt);
    const eye = heronEyeS14(), f = S14_FACE1, sd = V3(f.z, 0, -f.x);
    const p0 = V3(H.x - 0.55, 0.2, H.z + 4.6), p1 = V3(H.x - 0.45, 0.26, H.z + 3.7);
    const pc = eye.clone().addScaledVector(f, 0.3).addScaledVector(sd, 0.5).add(V3(0, -0.04, 0));
    const pos = p0.clone().lerp(p1, k).lerp(pc, z).add(shake(t, 0.003 + 0.008 * Math.exp(-1 * ((t - 31.06) * 8) ** 2), 1, 19));
    const look = V3(H.x, H.y + 0.85, H.z).lerp(eye, 0.3 + 0.7 * z);
    return cam(pos, look, lerp(lerp(42, 38, k), 24, z), 0, { near: 0.02 });
  },
  // s15 underwater: side view, the beak spears in with a bubble cone, Hi twists away
  s15: (lt, d, t) => {
    const T = heronTip(0.8).add(V3(0, -0.32, 0)), k = s5(0, d, lt), j = Math.exp(-1 * ((t - 32.62) * 8) ** 2);
    const pos = V3(T.x - 0.95, -0.55, T.z + 0.95).add(V3(0, 0, -0.3 * k)).add(shake(t, 0.005 + 0.035 * j, 1.5, 21));
    return cam(pos, V3(T.x + 0.05, lerp(-0.3, -0.42, k), T.z - 0.25 - 0.45 * k), lerp(50, 46, k) + 3 * j, 0, { near: 0.02 });
  },
  // s16 hero leap: low side view toward the sunset; tilt up with the arc over the beak, settle on the white-water dive
  s16: (lt, d, t) => {
    // low on the water off Hi's left side, looking up-river into the sunset: the whole arc large in frame, Hi travels
    // screen-left toward the sun, the heron's snap right under the apex; eased tilt up with the leap, settle on the dive
    const F = geo().heronSpot, a = s16Arc(t), k = s5(0, 1.0, lt), e = s5(1.5, d, lt), up = s5(0.25, 0.9, lt) * (1 - 0.6 * e);
    const pos = F.clone().add(V3(lerp(-1.5, -1.4, k), 0, lerp(2.65, 2.3, k))).setY(0.1 + 0.04 * up).add(shake(t, 0.004 + 0.016 * Math.exp(-1 * ((t - 34.75) * 8) ** 2), 1.2, 23));
    const look = F.clone().add(V3(lerp(-0.75, -1.0, ss(0.3, 1.4, lt)), 0, lerp(0.6, -0.4, ss(0.3, 1.4, lt)) - 0.3 * e)).setY(lerp(0.3, 0.95, up));
    return cam(pos, look, lerp(52, 56, up), 0, { near: 0.02 });
  },
  // s17 dusk: wide down the gorge; the heron lifts off and flies away, dusk turns violet, storm clouds build; slow tilt up
  s17: (lt, d, t) => {
    const g = geo(), H = g.heronSpot, k = s5(0, d, lt);
    return cam(V3(H.x - 3.4, lerp(0.75, 1.2, k), H.z + lerp(7.5, 9.5, k)), V3(H.x - 0.8, lerp(1.6, 8.0, k), H.z - 26), lerp(46, 52, k));
  },
  // s18 underwater looking up through the rain-dimpled skin; Hi glides overhead and on up the frame
  s18: (lt, d, t) => {
    // close below-and-beside Hi: its profile against the rain-ringed silver ceiling, the storm light above; slow drift
    const k = s5(0, d, lt), u = lin(39.0, 41.5, t), hz = lerp(-27.0, -31.0, u), hx = geo().lane(hz) + 0.15;
    const pos = V3(hx - lerp(0.78, 0.66, k), lerp(-0.78, -0.72, k), hz + lerp(0.62, 0.42, k)).add(shake(t, 0.004, 0.6, 31));
    return cam(pos, V3(hx + 0.05, -0.24, hz - 0.28), lerp(52, 48, k), lerp(3, -2, k), { near: 0.02 });
  },
  // s19 the reveal: low on the pool with tiny Hi, slow tilt up the colossal falls in the storm
  s19: (lt, d, t) => {
    // crane: starts low beside Hi on the storm water, pulls back + rises while tilting up the falls (Hi ends tiny, bottom)
    const c = S19.cam, k = s5(0.2, 3.3, lt), kc = s5(0.0, 3.4, lt), h0 = S19.hi0;
    const p0 = V3(h0.x - 0.9, 1.15, h0.z + 2.6);
    const pos = p0.clone().lerp(c, kc).add(shake(t, 0.004 + 0.02 * kc, 0.6, 29));
    const look = V3(lerp(h0.x - 0.15, 0, k), lerp(-0.25, 150, k), lerp(h0.z - 1.2, -120, k));
    return cam(pos, look, lerp(42, 64, k), lerp(0.5, -1.5, k), { near: 0.03 });
  },
};

// ------------------------------------------------------------ helpers that depend on the creature
function s06Fwd() { const g = geo(), m = g.mouth; return V3(m.x - S06.head.x, 0, m.z - S06.head.z).normalize(); }
function s06Side() { const f = s06Fwd(); return V3(f.z, 0, -f.x); }    // Hi's +x side (camera side, Hi faces screen-left)
const _dummy = new THREE.Object3D();
// world point of a Hi-local offset for a root at p aimed along dir (matches aim())
function hiLocal(p, dir, local, roll = 0) { _dummy.position.copy(p); aim(_dummy, dir, roll); _dummy.updateMatrixWorld(true); return V3(...local).applyMatrix4(_dummy.matrixWorld); }
function s06Pose() { const f = s06Fwd(); return { p: S06.head.clone().addScaledVector(f, -0.1).setY(-0.013), dir: V3(f.x, Math.sin(20 * DEG), f.z) }; }
function hiEyeS06() { const P = s06Pose(); return hiLocal(P.p, P.dir, [0.026, 0.01, 0.083]); }
const S14_FACE0 = flat(-0.35, 0.94), S14_FACE1 = flat(-0.75, 0.66);
// heron eye after the lock turn (coil pose, eye local (0.04, 1.05, 0.17))
function heronEyeS14() { const H = geo().heronSpot; _dummy.position.copy(H); aim(_dummy, S14_FACE1); _dummy.updateMatrixWorld(true); return V3(0.04, 1.06, 0.17).applyMatrix4(_dummy.matrixWorld); }

// ------------------------------------------------------------ LOOKS (colour script per shot)
const vlook = (set, sid) => C?.api?.vale?.look?.(set, sid) ?? {};
const hlook = (set, st) => C?.api?.heights?.lookHint?.(set, st) ?? {};
export const LOOKS = {
  s01: (lt, d, t, st) => mergeLook(hlook('SKY', st), { exposure: 0.93, bloom: 1.15, sat: 1.12, contrast: 0.2, vignette: 0.26, fogMax: 0.35,
    key: { dir: [0.4, 0.2, 0.9], color: '#e8f0ff', tint: 0.3 }, rim: { dir: [-0.3, 0.8, -0.5], amt: 1.6 } }),
  s02: (lt, d, t, st) => mergeLook(vlook('POND', 's02'), { key: { dir: [0.55, 0.45, 0.7], color: '#ffe6c8', tint: 0.28 }, fogDensity: 0.004, fogNear: 2,
    mirror: { strength: 0.7 }, shafts: 0.35, bloom: 1.0, vignette: 0.18 }),
  s03: (lt, d, t, st) => mergeLook(vlook('POND', 's03'), { vignette: 0.14 }),
  s04: (lt, d, t, st) => mergeLook(vlook('POND', 's04'), { under: 1, mirror: { on: false }, fogMax: 0.15, key: { dir: [0.2, 0.9, 0.4], color: '#f0fff4', tint: 0.18 },
    underColor: '#46b4a2', underDeep: '#16607a', godRays: 0.85, caustics: 0.8, bloom: 1.05, shafts: 0 }),
  s05: (lt, d, t, st) => {
    const S = s05Geo(), c = CAMS.s05(lt, d, t), ray = S.head.clone().sub(c.pos).normalize();
    const sun = S.head.clone().addScaledVector(ray, 30).add(V3(0, -3, 0)), sun2 = S.head.clone().addScaledVector(ray, 30).add(V3(6, -9, -4));
    return mergeLook(vlook('POND', 's05'), { shafts: 0.9, shaftPos: sun2, shaftColor: '#ffd0a0', bloom: 1.15, mirror: { strength: 0.75 },
      fogDensity: 0.0025, fogMax: 0.35, fog: '#f6c4b0', sat: 1.12, contrast: 0.16, vignette: 0.2,
      key: { dir: keyFrom(c.pos, S.head, 0.5, 0), color: '#ffe2c8', tint: 0.25 }, rim: { dir: [ray.x, 0.2, ray.z], amt: 2.0 },
      glows: [{ pos: sun, color: '#ffb4a0', size: 0.5, amount: 1.4 }, { pos: sun2, color: '#ffe0a0', size: 0.16, amount: 0.9 }] });
  },
  s06: (lt, d, t, st) => mergeLook(vlook('POND', 's06'), { key: { dir: s06KeyDir(), color: '#ffe8cc', tint: 0.3 }, rim: { dir: [0.7, 0.3, -1], amt: 1.6 },
    fogDensity: 0.004, fogNear: 2, shafts: 0.3, bloom: 1.05, vignette: 0.2 }),
  s07: (lt, d, t, st) => mergeLook(vlook('POND', 's07'), { key: { dir: [-0.5, 0.6, 0.4], color: '#fff0dc', tint: 0.25 }, bloom: 1.0 }),
  s08: (lt, d, t, st) => mergeLook(vlook('BAMBOO', 's08'), { key: { dir: [-0.6, 0.7, 0.4], color: '#fffae6', tint: 0.18 } }),
  s09: (lt, d, t, st) => mergeLook(vlook('BAMBOO', 's09'), {}),
  s10: (lt, d, t, st) => mergeLook(vlook('TOWN', 's10'), { key: { dir: [-0.6, 0.6, 0.5], color: '#ffe6c4', tint: 0.22 } }),
  s11: (lt, d, t, st) => mergeLook(vlook('TOWN', 's11'), { key: { dir: [0.2, 0.55, 0.8], color: '#ffe6c4', tint: 0.25 }, vignette: 0.17 }),
  s12: (lt, d, t, st) => mergeLook(vlook('TOWN', 's12'), {}),
  s13: (lt, d, t, st) => mergeLook(hlook('GORGE', st), { key: { dir: [-0.6, 0.55, 0.6], color: '#ffd8b0', tint: 0.25 } }),
  s14: (lt, d, t, st) => mergeLook(hlook('GORGE', st), { key: { dir: [-0.55, 0.45, 0.7], color: '#ffd8b0', tint: 0.3 }, rim: { dir: [0, 0.2, -1], amt: 1.6 }, vignette: 0.2 }),
  s15: (lt, d, t, st) => mergeLook(hlook('GORGE', st), { under: 1, mirror: { on: false }, fogMax: 0.15, key: { dir: [-0.5, 0.8, 0.3], color: '#e6f4ff', tint: 0.2 },
    underColor: '#4a86b0', underDeep: '#1c3474', godRays: 0.7, caustics: 0.6 }),
  s16: (lt, d, t, st) => {
    const c = CAMS.s16(lt, d, t), sd = C.api.heights?.sunDirGorge?.() ?? V3(0, 0.06, -1), sun = c.pos.clone().addScaledVector(sd.clone().normalize(), 400);
    return mergeLook(hlook('GORGE', st), { key: { dir: [-0.6, 0.5, 0.6], color: '#ffd8b0', tint: 0.3 }, rim: { dir: [0, 0.25, -1], amt: 2.0 }, bloom: 1.15,
      glows: [{ pos: sun, color: '#ffb070', size: 0.45, amount: 0.7 }], shafts: 0.5, shaftPos: sun, shaftColor: '#ffc890' });
  },
  s17: (lt, d, t, st) => mergeLook(hlook('GORGE', st), {}),
  s18: (lt, d, t, st) => mergeLook(hlook('GORGE', st), { under: 1, mirror: { on: false }, fogMax: 0.12, underColor: '#4b4cc0', underDeep: '#1a1460',
    underSurface: '#a8a4ff', underDensity: 0.14, key: { dir: [-0.6, -0.2, 0.7], color: '#dcd8ff', tint: 0.25 }, rim: { dir: [0.2, 1, -0.4], amt: 1.8 },
    godRays: 0.55, caustics: 0.4, exposure: 0.95, sat: 1.25, contrast: 0.26, lift: '#120c3a', gain: '#f0ecff', bloom: 1.1, vignette: 0.24,
    glows: [{ pos: V3(geo().lane(-31) + 4, 6, -40), color: '#c8c0ff', size: 0.35, amount: 0.4 }] }),
  s19: (lt, d, t, st) => mergeLook(hlook('FALLS', st), { bloom: 1.2, vignette: 0.22, key: { dir: [0.2, 0.6, 0.8], color: '#d6f2ff', tint: 0.3 } }),
};
function s06KeyDir() { const s = s06Side(), f = s06Fwd(); return V3(s.x * 0.7 + f.x * 0.5, 0.6, s.z * 0.7 + f.z * 0.5).normalize().toArray(); }

// ------------------------------------------------------------ ACT
const api = () => C.api;
function hiOn(p, dir, { phase = 0, amp = 0.8, pose = 'rest', k = 0, mood = 'calm', roll = 0 } = {}) {
  const hi = api().koi.hi;
  hi.root.visible = true; hi.root.position.copy(p); aim(hi.root, dir, roll);
  hi.swim(phase, amp).pose(pose, k).eye(mood);
  return hi;
}
const W = () => api().water ?? {};
const callW = (name, ...a) => { const w = W(); if (typeof w[name] === 'function') return w[name](...a); };

export const ACT = {
  // ---------------------------------------------------------------- s01 hook
  s01: (lt, d, t, st) => {
    const D = api().dragon; if (!D) return;
    D.root.visible = true; D.setLength(null); D.grow(1);
    s01Curve();
    // roaring at the camera from frame 0, full roar on the crack, jaw closes as it pulls away into the light
    const crack = C.CUES.hookCrack, tq = tw(t), roar = (0.62 + 0.38 * ss(crack - 0.05, crack + 0.2, tq)) * (1 - ss(1.5, 2.2, tq));
    // frame 0..crack: head level and jaw wide (forehead + scarlet crown toward the camera), then the head throws back on the crack
    const thr = ss(crack - 0.04, crack + 0.12, tq) * (1 - ss(1.5, 2.2, tq));
    D.pose({ name: thr > 0.02 ? 'roar' : 'glide', k: thr, jaw: 0.35 + 0.6 * roar, roar: 0.75 * thr, mane: 1, claws: 0.8 });
    D.follow(G.s01curve, t, 200, { offset: G.s01off, wave: 0.35 });
    D.crown(1); D.eye('dragon');
    const fl = t >= crack && t < crack + 0.09 ? 1 : 0; D.flash(fl * 0.9);
    // hero bolts: one already lit at frame 0 framing the head (camera space, behind it), the big crack at hookCrack
    // (impact frames), a re-strike
    const c0 = CAMS.s01(0, d, 0);
    callW('lightning', -0.05, camPoint(c0, -0.5, 1.3, 140), camPoint(c0, -0.28, -1.25, 140), { seed: 11, pattern: [1, 1, 0, 1, 0, 0, 1, 0], branches: 7, width: 11, flash: 0.3, key: 's01a' });
    callW('lightning', crack - 0.01, s01Head(crack).add(V3(110, 600, -60)), s01Head(crack).add(V3(14, 18, -6)), { seed: 12, pattern: [1, 1, 1, 0, 1, 0], branches: 7, width: 11, key: 's01b' });
    callW('lightning', 1.55, s01Head(1.55).add(V3(-140, 520, 60)), s01Head(1.55).add(V3(-50, 40, 10)), { seed: 13, pattern: [1, 0, 1, 0], branches: 5, width: 7, flash: 0.4, key: 's01c' });
    callW('rain', 0.12);
    if (st.frame < Math.round(crack * 24) || st.frame > Math.round(crack * 24) + 3) st.look.flash = Math.min(st.look.flash ?? 0, t < crack ? 0.1 : 0.18);
    const f = st.frame, cf = Math.round(crack * 24);
    if (f === cf) { st.look.impact = 2; } else if (f === cf + 1) { st.look.impact = 1; st.look.impactCentre = [0.45, 0.7]; }
    st.look.speed = { amount: 0.12 * ss(0.45, 0.6, t) * (1 - ss(1.3, 2.2, t)), mode: 'parallel', dir: [0, -1] };
  },
  // ---------------------------------------------------------------- s02 leaf + eye
  s02: (lt, d, t, st) => {
    const g = geo(), tq = tw(t), lp = leafPos(t);
    if (leaf) { leaf.visible = true; leaf.position.copy(lp.p); leaf.rotation.set(...lp.rot); }
    callW('ripple', g.leafLand.x, g.leafLand.z, C.CUES.leafLand, 1, { key: 'leaf' });
    // Hi: crown rises under the leaf (refracted), eye breaks the surface at eyeUp, holds with a blink
    const e = S02.hi(), up = C.CUES.eyeUp;
    const r = s5(3.05, up, tq) * 0.82 + eOut(up, up + 0.25, tq) * 0.18;
    const p = V3(e.x - 0.06 * (1 - r), lerp(-0.34, -0.054, r), e.z - 0.04 * (1 - r));
    const pitch = lerp(22, 42, r) * DEG, dir = V3(Math.sin(S02.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(S02.yaw) * Math.cos(pitch));
    const blink = tq > up + 0.55 && tq < up + 0.65;
    const hi = hiOn(p, dir, { phase: tq * 0.7, amp: 0.25, mood: blink ? 'closed' : (tq > up + 0.15 ? 'wide' : 'calm') });
    hi.gaze(-0.25, 0.35);
    hi.root.visible = tq > 3.0;
    if (tq >= up) callW('ripple', p.x + 0.05, p.z + 0.02, up, 0.6, { key: 'eye' });
  },
  // ---------------------------------------------------------------- s03 wide garden
  s03: (lt, d, t, st) => {
    const g = geo(), tq = tw(t);
    if (leaf) { leaf.visible = true; leaf.position.set(g.leafLand.x + 0.02 * tq, 0.004, g.leafLand.z); leaf.rotation.set(0, 0.6 + 0.03 * tq, 0); }
    const p = V3(g.leafLand.x - 0.2 - 0.18 * (t - 4.5), -0.12, g.leafLand.z + 0.15);
    hiOn(p, V3(-1, 0, -0.2), { phase: tq * 1.0, amp: 0.5 });
  },
  // ---------------------------------------------------------------- s04 underwater crowd + nudge
  s04: (lt, d, t, st) => {
    const K = api().koi, tq = tw(t), nudge = C.CUES.nudge;
    // big koi glide left -> right (downstream of Hi's intent); koi 0 (gold) passes close in front of Hi at the nudge
    const plan = [
      { i: 0, z: 2.0, y: -0.5, x0: -2.45, v: 1.3, t0: 7.0 },   // close pass (wake nudges Hi)
      { i: 2, z: 0.6, y: -0.62, x0: -2.4, v: 0.75, t0: 7.0 },
      { i: 1, z: -0.3, y: -0.7, x0: -0.8, v: 0.55, t0: 7.0 },
      { i: 4, z: 1.2, y: -0.75, x0: 0.6, v: 0.6, t0: 7.0 },
    ];
    K.crowd.forEach((k, j) => { const P = plan.find((q) => q.i === j); if (!P) { k.root.visible = false; return; }
      k.root.visible = true; const x = P.x0 + P.v * (tq - P.t0);
      k.root.position.set(x, P.y + 0.02 * Math.sin(tq * 1.3 + j), P.z); aim(k.root, V3(1, -0.02 * Math.cos(tq + j), 0.05 * Math.sin(tq * 0.8 + j)));
      k.swim(tq * (0.75 + 0.15 * j) + j * 0.3, 0.55 + 0.1 * (j % 2)).eye('calm'); });
    // Hi hovers facing screen-left (toward the inlet), gets tossed by the wake at the nudge, rights itself, sad
    const nk = clamp((tq - nudge) / 0.35), back = s5(nudge + 0.45, nudge + 1.0, tq);
    const base = V3(-1.05 - 0.12 * (tq - 7), -0.4, 1.55);
    const push = V3(0.18, -0.07, -0.28).multiplyScalar(Math.sin(Math.PI * Math.min(1, nk) * 0.5) * (1 - 0.6 * back));
    const yaw = -90 * DEG + (55 * DEG) * Math.sin(Math.PI * 0.5 * Math.min(1, nk)) * (1 - back);
    const dir = V3(Math.sin(yaw), 0.05, Math.cos(yaw));
    const tossed = tq >= nudge && tq < nudge + 0.5;
    const hi = hiOn(base.add(push), dir, { phase: tq * 1.1, amp: tossed ? 0.2 : 0.55, pose: tossed ? 'C' : 'rest', k: tossed ? 0.8 * (1 - nk * 0.6) : 0,
      mood: tq < nudge ? 'calm' : tq < nudge + 0.45 ? 'wide' : 'sad', roll: tossed ? 0.5 * Math.sin(Math.PI * nk) : 0 });
    if (tq >= nudge && tq < nudge + 1 / 12) hi.smear(0.5, V3(0.4, -0.1, -0.6));
    callW('bubbles', V3(base.x + 0.05, -0.38, 1.7), nudge, { n: 14, spread: 0.06, dur: 1.4, size: 0.8, key: 'nudge' });
  },
  // ---------------------------------------------------------------- s05 POV spout (no Hi)
  s05: (lt, d, t, st) => {
    // sparkles riding the stream's arc (mouth -> pour), staggered on threes
    const S = s05Geo();
    for (let i = 0; i < 4; i++) {
      const u = 0.15 + i * 0.25, p = S.mouth.clone().lerp(S.pour, u); p.y = lerp(S.mouth.y, 0.05, u * u) + 0.06 * Math.sin(Math.PI * u);
      callW('sparkles', p, 9.25 + i * 0.25, { n: 10, dur: 2.0, size: 0.028, mode: 'aura', radius: 0.07, key: 's05s' + i });
    }
    callW('sparkles', S.pour.clone().setY(0.03), 9.3, { n: 16, dur: 2.2, size: 0.03, mode: 'aura', radius: 0.18, key: 's05p' });
  },
  // ---------------------------------------------------------------- s06 the wish
  s06: (lt, d, t, st) => {
    const tq = tw(t), f = s06Fwd();
    const det = clamp((tq - 12.5) / (2 / 12));
    const { p, dir } = s06Pose();
    const hi = hiOn(p, dir, { phase: tq * 0.5, amp: 0.15, mood: det > 0 ? 'determined' : 'calm' });
    api().koi.hi.eye(det > 0 ? 'determined' : 'calm', det > 0 ? det : 1);
    hi.eyeTint('#ffcf8a', lerp(0.55, 0.85, s5(11.5, 12.4, t)));
    hi.gaze(0.15, 0.25 + 0.1 * det);
    if (tq >= 12.5) hi.crown(0.12 * det);
  },
  // ---------------------------------------------------------------- s07 inlet leap
  s07: (lt, d, t, st) => {
    const tq = tw(t), s = s07Hi(tq), tL = C.CUES.inletLeap;
    const leapK = s.phase === 'leap' ? Math.sin(Math.PI * s.u) : 0;
    const hi = hiOn(s.p, s.dir, { phase: tq * (s.phase === 'swim' ? 1.8 : 1.6), amp: s.phase === 'leap' ? 0.25 : (s.phase === 'swim' ? 1.0 + 0.6 * s.u : 1.1),
      pose: s.phase === 'leap' ? (s.u < 0.55 ? 'arc' : 'S') : 'rest', k: s.phase === 'leap' ? 0.4 + 0.6 * leapK : 0, mood: 'determined' });
    if (tq >= tL && tq < tL + 1 / 12) hi.smear(0.6, s.dir);
    const g = geo(), b = g.inletBase, lip = g.inletLip;
    callW('splash', V3(b.x + 0.02, 0, b.z + 0.18), tL, 0.24, { key: 'inletUp' });
    callW('splash', V3(lip.x - 0.08, 0.3, lip.z - 0.75), tL + 0.5, 0.17, { y: 0.3, key: 'inletDown' });
    callW('sparkles', V3(b.x - 0.02, 0.62, b.z - 0.35), tL + 0.2, { n: 22, dur: 1.0, size: 0.035, mode: 'burst', key: 'inletSpark' });
  },
  // ---------------------------------------------------------------- s08 bamboo tracking
  s08: (lt, d, t, st) => {
    const tq = tw(t), z = s08Z(tq), p = V3(bamX(z) - 0.15, -0.025, z);
    hiOn(p, bamDir(z), { phase: tq * 2.2, amp: 1.2, mood: 'determined' });
  },
  // ---------------------------------------------------------------- s09 top-down
  s09: (lt, d, t, st) => {
    const tq = tw(t), z = s09Z(tq), p = V3(bamX(z), 0.0, z);
    const hi = hiOn(p, bamDir(z), { phase: tq * 2.2, amp: 1.2 });
    hi.crown(1);                                  // the scarlet spot catches the light from above (bloom)
    hi.root.scale.setScalar(2.1);                 // aerial cheat so the dot reads at phone size (reset to 1 every frame in update)
    // V-wake rings behind it + a glint twinkle on threes so the tiny dot pulls the eye
    for (let i = 0; i < 6; i++) { const t0 = 18.0 + i * 0.36, zz = s09Z(t0); callW('ripple', bamX(zz), zz + 0.12, t0, 0.55, { key: 'b9' + i }); }
    callW('sparkles', hi.root, 18.05, { n: 7, dur: 2.0, size: 0.16, mode: 'aura', radius: 0.16, key: 'b9glint' });
  },
  // ---------------------------------------------------------------- s10 canal
  s10: (lt, d, t, st) => {
    const tq = tw(t), z = s10Z(tq), p = V3(canX(z) + 0.35 + 0.15 * Math.sin(z * 0.5), -0.022, z);
    hiOn(p, V3(canX(z - 1) - canX(z + 1) + 0.15 * Math.cos(z * 0.5) * 0.5, 0, -2), { phase: tq * 2.3, amp: 1.2, mood: 'determined' });
  },
  // ---------------------------------------------------------------- s11 cat swipe gag
  s11: (lt, d, t, st) => {
    const g = geo(), cat = api().cat, tq = tw(t), sw = C.CUES.catSwipe;
    // the cat on the landing's water edge, turned to watch the fish coming up the canal; leans in for the swipe
    cat.root.visible = true; cat.root.position.copy(g.catSpot);
    const lean = 26 * DEG * ss(sw - 0.4, sw - 0.05, tq) * (1 - ss(sw + 0.3, sw + 0.7, tq));
    aim(cat.root, flat(0.78, 0.62), 0, lean);
    if (tq < sw - 0.45) cat.pose('watch', tq);
    else if (tq < sw + 0.3) cat.pose('swipe', clamp(0.38 + (tq - sw) * 1.15, 0, 0.72));
    else cat.pose('surprised', eOut(sw + 0.3, sw + 0.55, tq));
    // Hi: swims up the near side, darts out (smear) at the swipe, swims on screen-left
    const z = s11Z(tq), dodge = eOut(sw, sw + 0.17, tq);
    const p = V3(-2.78 + 0.62 * dodge, -0.022 - 0.05 * dodge * (1 - ss(sw + 0.3, sw + 0.8, tq)), z);
    const dir = tq >= sw && tq < sw + 0.25 ? V3(0.75, -0.1, -0.6) : V3(0.08, 0, -1);
    const hi = hiOn(p, dir, { phase: tq * 2.0, amp: tq >= sw && tq < sw + 0.3 ? 1.9 : 1.1, pose: tq >= sw && tq < sw + 0.17 ? 'C' : 'rest', k: 0.8, mood: tq >= sw ? 'wide' : 'calm' });
    if (tq >= sw && tq < sw + 2 / 24) hi.smear(0.85, V3(0.8, 0, -0.55));
    const paw = V3(g.catSpot.x + 0.36, 0, g.catSpot.z + 0.3);
    callW('splash', paw, sw + 0.02, 0.36, { key: 'paw' });
    callW('ripple', p.x, p.z, sw + 0.1, 0.8, { key: 'dodge' });
  },
  // ---------------------------------------------------------------- s12 horizon
  s12: (lt, d, t, st) => {
    const tq = tw(t), z = s12Z(tq), p = V3(canX(z) + 0.2, -0.015, z);
    hiOn(p, V3(-0.08, 0, -1), { phase: tq * 2.0, amp: 1.0 });
    callW('ripple', p.x, p.z + 0.15, th(t), 0.5, { key: 'h12' + Math.floor(t * 2.5) });
  },
  // ---------------------------------------------------------------- s13 rapids
  s13: (lt, d, t, st) => {
    const g = geo(), tq = tw(t), z = s13Z(tq), x = g.lane(z);
    heronAt(st, flat(-0.6, 0.8), 'stand', tq);
    const hop = lin(28.55, 28.95, tq), inHop = hop > 0 && hop < 1;
    // fighting the current: surges forward, gets shoved back a little by each standing wave (on twos), body wrenching S/C
    const surge = -0.09 * Math.sin(tq * 7.5) * (inHop ? 0 : 1), zz = z + surge;
    const p = V3(x + 0.05 * Math.sin(tq * 5.3), -0.025 + (inHop ? 0.42 * Math.sin(Math.PI * hop) : 0.02 * Math.sin(tq * 9)), zz);
    const yawW = 0.35 * Math.sin(tq * 7.5 + 1);
    const dir = V3(g.lane(z - 0.5) - g.lane(z + 0.5) + (inHop ? 0 : yawW), inHop ? 1.6 * Math.cos(Math.PI * hop) : 0.12 * Math.sin(tq * 9), -1);
    const wr = Math.sin(tq * 7.5);
    const hi = hiOn(p, dir, { phase: tq * 2.8, amp: inHop ? 0.3 : 1.9, pose: inHop ? 'arc' : (wr > 0.35 ? 'S' : wr < -0.35 ? 'C' : 'rest'), k: inHop ? 0.7 : 0.55,
      mood: 'determined', roll: 0.2 * Math.sin(tq * 9) });
    callW('splash', V3(x, 0, s13Z(28.55)), 28.55, 0.22, { key: 'hop1' });
    callW('splash', V3(x, 0, s13Z(28.95)), 28.95, 0.26, { key: 'hop2' });
    // spray off Hi's nose / the standing waves it punches through (FX on threes)
    for (let i = 0; i < 7; i++) { const t0 = 27.55 + i * 0.375; if (Math.abs(t0 - 28.75) < 0.3) continue; const zz2 = s13Z(t0) - 0.12;
      callW('splash', V3(g.lane(zz2) + 0.06 * ((i % 2) * 2 - 1), 0, zz2), t0, 0.1 + 0.04 * (i % 3), { key: 'spray' + i, dur: 0.5 }); }
    callW('rapids', 1.1);
  },
  // ---------------------------------------------------------------- s14 heron lock
  s14: (lt, d, t, st) => {
    const tq = tw(t), lock = C.CUES.heronLock;
    const turn = ss(lock - 0.1, lock + 0.05, tq);
    const he = heronAt(st, S14_FACE0.clone().lerp(S14_FACE1, turn).normalize(), tq < lock ? 'stand' : 'coil', tq < lock ? tq : eOut(lock, lock + 0.35, tq));
    he.eye(tq >= lock ? 'stare' : 'stare');
  },
  // ---------------------------------------------------------------- s15 strike underwater
  s15: (lt, d, t, st) => {
    const tq = tw(t), s1 = C.CUES.strike1, T = heronTip(0.8).add(V3(0, -0.32, 0));
    const k = tq < s1 - 0.1 ? 0 : tq < s1 + 0.04 ? lin(s1 - 0.1, s1 + 0.04, tq) : 1 - ss(s1 + 0.45, s1 + 0.9, tq);
    const lean = 0.8 * Math.min(1, k * 1.3);
    const he = heronAt(st, HERON_FACE, k > 0 ? 'strike' : 'coil', k > 0 ? k : 1, lean, -0.32 * Math.min(1, k * 1.3));   // sinks its stance into the rock line (hidden from below) so the beak spears deep
    if (tq >= s1 - 0.05 && tq < s1 + 0.04) he.smear(0.7);
    // Hi: drifts along screen-left under the rock's shadow, twists away down-left at the strike
    const dk = eOut(s1 - 0.04, s1 + 0.2, tq);
    const p = V3(T.x + 0.02 - 0.3 * dk, lerp(-0.62, -0.85, dk), T.z + 0.32 - 0.25 * (tq - 32) - 0.9 * dk);
    const twist = tq >= s1 - 0.04 && tq < s1 + 0.25;
    const hi = hiOn(p, twist ? V3(-0.3, -0.45, -1) : V3(0.05, 0, -1), { phase: tq * 1.6, amp: twist ? 2.0 : 0.8, pose: twist ? 'S' : 'rest', k: 0.9,
      mood: tq >= s1 - 0.04 ? 'wide' : 'calm', roll: twist ? 0.9 * Math.sin(Math.PI * lin(s1 - 0.04, s1 + 0.25, tq)) : 0 });
    if (tq >= s1 - 0.04 && tq < s1 + 0.05) hi.smear(0.9, V3(-0.2, -0.45, -1));
    hi.flash(tq >= s1 && tq < s1 + 0.09 ? 0.4 : 0);
    callW('bubbles', T, s1, { n: 46, spread: 0.12, dur: 1.5, size: 1.2, rise: 1.0, kick: [0.6, -0.3, 0.1], key: 'cone' });
    callW('ripple', T.x, T.z, s1 - 0.02, 1.4, { key: 'beakIn' });
    if (st.frame === Math.round(s1 * 24)) { st.look.impact = 1; st.look.impactCentre = [0.5, 0.45]; }
  },
  // ---------------------------------------------------------------- s16 hero leap over the beak
  s16: (lt, d, t, st) => {
    const tq = tw(t), s2 = C.CUES.strike2, a = s16Arc(tq);
    // heron: second lunge at strike2 into the spot Hi just left, beak snaps on air under the arc, then recoils
    let he;
    if (tq < s2 - 0.12) he = heronAt(st, HERON_FACE, 'coil', 1, 0.15);
    else if (tq < s2 + 0.08) { const k = lin(s2 - 0.12, s2 + 0.04, tq); he = heronAt(st, HERON_FACE, 'strike', k, 0.45 * k); if (k > 0.2 && k < 1) he.smear(0.7); }
    else if (tq < s2 + 0.6) { he = heronAt(st, HERON_FACE, 'snap', eOut(s2 + 0.1, s2 + 0.2, tq), 0.45); if (tq < s2 + 0.17) he.smear(0.8); }
    else he = heronAt(st, HERON_FACE, 'coil', 1 - 0.5 * ss(s2 + 0.6, s2 + 1.4, tq), 0.45 * (1 - ss(s2 + 0.6, s2 + 1.1, tq)));
    he.eye(tq > s2 + 0.15 ? 'wide' : 'stare');
    // Hi
    let hi;
    if (tq < S16.t0) {
      const p0 = S16.p0(), u = lin(34.0, S16.t0, tq);
      hi = hiOn(V3(p0.x - 0.1 * (1 - u), -0.06, p0.z + 0.42 * (1 - u)), V3(0.1, 0.1 * u, -1), { phase: tq * 2.4, amp: 1.5, mood: 'determined' });
    } else if (a.u0 < 1) {
      hi = hiOn(a.p, a.dir, { phase: tq * 1.2, amp: 0.2, pose: a.u < 0.55 ? 'arc' : 'S', k: 0.9, mood: 'determined' });
      if (tq < S16.t0 + 1 / 12) hi.smear(0.7, V3(0, 1, -0.6));
    } else {
      const p1 = S16.p1(), u = tq - S16.t0 - S16.dur;
      hi = hiOn(V3(p1.x, -0.32 - 0.2 * Math.min(1, u * 2), p1.z - 0.9 * u), V3(0, -0.3, -1), { phase: tq * 2.4, amp: 1.4, mood: 'determined' });
    }
    hi.crown(a.u0 > 0.3 && a.u0 < 0.7 ? 0.25 : 0);
    callW('splash', S16.p0().setY(0), S16.t0, 0.42, { key: 'leapUp' });
    callW('splash', S16.p1().setY(0), S16.t0 + S16.dur, 0.5, { key: 'leapDown' });
    callW('sparkles', s16Arc(S16.t0 + 0.5).p, S16.t0 + 0.45, { n: 26, dur: 0.9, size: 0.045, key: 'apex' });
  },
  // ---------------------------------------------------------------- s17 dusk, heron flies off
  s17: (lt, d, t, st) => {
    const g = geo(), H = g.heronSpot, tq = tw(t), to = 36.75;
    const he = api().heron; he.root.visible = true;
    if (tq < to) { heronAt(st, flat(-0.4, -0.9), 'coil', 0.6); }
    else {
      const u = tq - to, P = H.clone().add(V3(-2.6 * u - 1.3 * u * u, 1.0 * u + 1.0 * u * u, -1.6 * u - 0.9 * u * u));
      he.root.position.copy(P);
      aim(he.root, V3(-2.6 - 2.6 * u, 0, -1.6 - 1.8 * u), 0);
      he.pose(u < 0.55 ? 'takeoff' : 'fly', u * 3.2);
    }
    const z = lerp(-4.0, -7.0, lin(36.5, 39, tq)), p = V3(g.lane(z) - 0.5, -0.07, z);
    hiOn(p, V3(0, 0, -1), { phase: tq * 2.0, amp: 1.2 });
  },
  // ---------------------------------------------------------------- s18 rain from below
  s18: (lt, d, t, st) => {
    const tq = tw(t), u = lin(39.0, 41.5, tq);
    const hz = lerp(-27.0, -31.0, u), p = V3(geo().lane(hz) + 0.15, lerp(-0.42, -0.36, u), hz);
    const hi = hiOn(p, V3(0.08, 0.02, -1), { phase: tq * 1.4, amp: 0.85, mood: 'determined', roll: S18.roll });
    hi.crown(0.35);
    callW('rain', 0.95);
    api().heron.root.visible = false;
    // deeper luminous blue-violet ceiling (WATER's GORGE underside, restyled for this shot only)
    styleSurf({ uUnderSilver: '#8670e4', uUnderDeep: '#22126a', uWinCol: '#c4b0ff' });
    // big clear rain rings right over Hi + the camera (seeded, staggered)
    for (let i = 0; i < 14; i++) {
      const t0 = 38.9 + i * 0.19, a = i * 2.39, r = 0.25 + 0.55 * ((i * 0.618) % 1), zz = lerp(-27.0, -31.0, lin(39.0, 41.5, t0)) - 0.4;
      callW('ripple', geo().lane(zz) + 0.15 + Math.cos(a) * r, zz + Math.sin(a) * r, t0, 0.5 + 0.3 * (i % 3), { key: 'r18_' + i });
    }
    // a hint of storm light above: one soft flicker through the skin
    const fl = Math.exp(-1 * ((t - 40.55) * 9) ** 2) + 0.5 * Math.exp(-1 * ((t - 40.8) * 12) ** 2);
    st.look.flash = Math.max(st.look.flash ?? 0, 0.32 * fl);
  },
  // ---------------------------------------------------------------- s19 the falls
  s19: (lt, d, t, st) => {
    const tq = tw(t), u = s5(41.5, 44.2, tq), up = ss(44.35, 44.75, tq);
    const p = S19.hi0.clone().lerp(S19.hi1, u); p.y = lerp(-0.02, 0.0, up);
    // a small arrival hop (catches the eye in the vast frame), then the head comes up toward the falls (-> s20)
    const hop = lin(42.45, 43.0, tq), inHop = hop > 0 && hop < 1;
    if (inHop) p.y += 0.55 * Math.sin(Math.PI * hop);
    const dir = inHop ? V3(-0.1, 1.8 * Math.cos(Math.PI * hop), -1) : V3(-0.12, Math.sin(lerp(0, 34, up) * DEG), -1);
    const hi = hiOn(p, dir, { phase: tq * (1.8 - up), amp: inHop ? 0.3 : 1.1 * (1 - up) + 0.2, pose: inHop ? 'arc' : 'rest', k: 0.7, mood: up > 0.5 ? 'awe' : 'determined' });
    callW('splash', S19.hi0.clone().lerp(S19.hi1, s5(41.5, 44.2, 42.45)).setY(0), 42.45, 0.3, { key: 'hop19a' });
    callW('splash', S19.hi0.clone().lerp(S19.hi1, s5(41.5, 44.2, 43.0)).setY(0), 43.0, 0.35, { key: 'hop19b' });
    hi.gaze(0, 0.6 * up);
    // ghost koi leaping at the foot of the falls and failing (pale, larger than life so they read)
    ghosts.forEach((k, i) => {
      const t0 = [41.7, 42.65, 43.6][i], dur = 1.25, uu = (tq - t0) / dur;
      if (uu < 0 || uu > 1) return;
      k.root.visible = true;
      const x = [-24, 18, -6][i], z0 = [-92, -96, -88][i], hgt = [52, 70, 44][i];
      k.root.position.set(x + 6 * uu, hgt * 4 * uu * (1 - uu), z0 - 10 * uu);
      const vy = hgt * 4 * (1 - 2 * uu);
      aim(k.root, V3(6, vy * 0.9, -10), 0);
      k.swim(tq * 1.5, 0.4).pose(uu < 0.5 ? 'arc' : 'tumble', uu < 0.5 ? 0.6 : (uu - 0.5) * 2).eye('closed');
      k.flash(0.85);
      callW('splash', V3(x, 0, z0), t0, 8, { key: 'gk' + i });
      callW('splash', V3(x + 6, 0, z0 - 10), t0 + dur, 7, { key: 'gkd' + i });
    });
    callW('lightning', 42.55, V3(-90, 720, -260), V3(-30, 330, -150), { seed: 31, pattern: [1, 0, 1, 1, 0, 1], branches: 6, width: 8, key: 's19a' });
    callW('lightning', 44.35, V3(130, 760, -300), V3(60, 360, -170), { seed: 32, pattern: [1, 1, 0, 1], branches: 5, width: 7, key: 's19b' });
    st.look.flash = Math.min(st.look.flash ?? 0, 0.5);   // keep the reveal readable: no full white-outs
  },
};

// heron on its strike spot (river shoulder of the rock), facing dir, optional forward lean (rad) around the feet
function heronAt(st, dir, pose, k, lean = 0, yOff = 0) {
  const he = api().heron, H = geo().heronSpot;
  he.root.visible = true; he.root.position.copy(H); he.root.position.y += yOff;
  aim(he.root, dir, 0, lean);
  he.pose(pose, k);
  return he;
}

// ------------------------------------------------------------ module
export async function create(ctx) {
  C = ctx;
  try {
    const mk = ctx.api.vale?.pond?.makeLeaf;
    if (mk) { leaf = mk('#d9452c', 0.075); leaf.name = 'dirA_leaf'; leaf.visible = false; ctx.sets.POND.add(leaf); }
  } catch (e) { console.error('[act1] leaf', e); }
  try {
    const K = ctx.api.koi;
    if (K?.makeKoi) for (let i = 0; i < 3; i++) { const k = K.makeKoi({ type: ['kohaku', 'gold', 'calico'][i], length: 7, seed: 70 + i, name: 'ghost' + i }); k.root.visible = false; ghosts.push(k); }
  } catch (e) { console.error('[act1] ghosts', e); }
  // s01 only: darker indigo storm walls with violet rims (HEIGHTS' storm palette is re-applied in scene.onBeforeRender
  // every render; this runs right after it, only while s01 is on screen, and follows the flash back to HEIGHTS' colours)
  try {
    const storm = ctx.sets.SKY.getObjectByName('sky_storm'), clouds = [], skies = [];
    storm?.traverse((o) => { const u = o.material?.uniforms; if (!u) return; if (u.uColor && u.uShadeC && u.uRimAmt2) { u.__rim0 ??= u.uRimAmt2.value; clouds.push(u); } else if (u.uC0 && u.uC3) skies.push(u); });
    const tmp = new THREE.Color();
    const dark = { uColor: '#3f3288', uShadeC: '#1b1550', uBellyC: '#0a0826', uRimCol: '#c79cff' }, darkSky = { uC0: '#0a0826', uC1: '#1c1652', uC2: '#4a3896', uC3: '#f4c4dc' };
    const prev = ctx.scene.onBeforeRender;
    ctx.scene.onBeforeRender = function (...a) {
      const r = prev.apply(this, a);
      if (curSt?.sid === 's01' && curSt.set === 'SKY') {
        const f = ss(0.2, 0.9, curSt.look?.flash ?? 0);
        for (const u of clouds) { for (const k in dark) { tmp.set(dark[k]); u[k].value.lerp(tmp, 1 - f); } u.uRimAmt2.value = u.__rim0 * 1.6; }
        for (const u of skies) for (const k in darkSky) { tmp.set(darkSky[k]); u[k].value.lerp(tmp, 1 - f); }
        if (clouds[0]?.uAmbient) { clouds[0].uAmbient.value.lerp(tmp.set('#1e1856'), 1 - f); clouds[0].uSunColor.value.lerp(tmp.set('#a48ce6'), 1 - f); }
      } else for (const u of clouds) u.uRimAmt2.value = u.__rim0;
      return r;
    };
  } catch (e) { console.error('[act1] storm', e); }
  return {
    update(st) {
      curSt = st;
      if (leaf) leaf.visible = false;
      for (const k of ghosts) { k.root.visible = false; }
      restoreSurf();
      try { C.api.koi?.hi?.root?.scale?.setScalar(1); } catch (e) { /* */ }
    },
  };
}
