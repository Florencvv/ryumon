// shots.js - RYUMON script data (transcribed from CONTRACT.md) + evalFrame(frame, q) -> st.
// Direction modules register per-shot functions with registerDirection({CAMS, LOOKS, ACT}):
//   CAMS[sid](lt, d, t, st) -> {pos, look, fov, roll?, near?, far?}   pos/look: Vector3 or [x, y, z]; fov + roll in DEGREES
//   LOOKS[sid] -> look object, or (lt, d, t, st) -> look; merged on top of the set preset from look.js (one level deep
//                 for object keys like mirror / sky / key / sun / speed)
//   ACT[sid](lt, d, t, st, ctx)   runs after every department update (direction last); may edit st.cam and the post keys of
//                 st.look (impact, speed, mirror ...). Light keys (sun/key/shade/rim/ambient/sky) are written to the shared
//                 uniforms BEFORE the department updates: from ACT use A.setKey(...) / A.AU directly.
// st = {frame, t, sid, shot, set, under, lt, dur, d, u, cues, look, cam, q, test, act, since(cue)}
//   lt = time inside the shot, dur = d = shot length, u = lt / dur, since('cross') = t - CUES.cross
import * as THREE from 'three';
import { LOOK_PRESETS, mergeLook } from './look.js';

export const FILM = 'RYUMON';
export const FPS = 24;
export const DURATION = 88;
export const FRAMES = DURATION * FPS;   // 2112
export const W = 1920, H = 1040;
export const SETS = ['POND', 'BAMBOO', 'TOWN', 'GORGE', 'FALLS', 'SKY'];
// department modules in UPDATE order (contract); main loads src/<name>.js, or src/<name>/index.js | src/<name>/<name>.js
// when the .js file is missing or still the scaffold stub (exports STUB). fx after water: dept WATER owns both.
export const DEPTS = ['vale', 'heights', 'creatures', 'water', 'fx', 'direction/act1', 'direction/act2'];

// '*-UNDER' sets: st.set = the set without the suffix, st.under = true (look.under on, see look.js UNDER)
const S = (id, name, t0, t1, set) => { const u = set.endsWith('-UNDER'); return { id, name, t0, t1, set: u ? set.slice(0, -6) : set, under: u, dur: t1 - t0 }; };
export const SHOTS = [
  S('s01', 'flash', 0, 2.5, 'SKY'),
  S('s02', 'leaf', 2.5, 4.5, 'POND'),
  S('s03', 'garden', 4.5, 7.0, 'POND'),
  S('s04', 'crowd', 7.0, 9.25, 'POND-UNDER'),
  S('s05', 'spout', 9.25, 11.5, 'POND'),
  S('s06', 'eye', 11.5, 13.0, 'POND'),
  S('s07', 'inlet', 13.0, 15.5, 'POND'),
  S('s08', 'bamboo', 15.5, 18.0, 'BAMBOO'),
  S('s09', 'bamboo top', 18.0, 20.0, 'BAMBOO'),
  S('s10', 'town', 20.0, 23.0, 'TOWN'),
  S('s11', 'cat', 23.0, 25.0, 'TOWN'),
  S('s12', 'horizon', 25.0, 27.5, 'TOWN'),
  S('s13', 'gorge', 27.5, 30.0, 'GORGE'),
  S('s14', 'heron', 30.0, 32.0, 'GORGE'),
  S('s15', 'strike', 32.0, 34.0, 'GORGE-UNDER'),
  S('s16', 'over', 34.0, 36.5, 'GORGE'),
  S('s17', 'dusk', 36.5, 39.0, 'GORGE'),
  S('s18', 'rain below', 39.0, 41.5, 'GORGE-UNDER'),
  S('s19', 'falls', 41.5, 45.0, 'FALLS'),
  S('s20', 'look up', 45.0, 46.75, 'FALLS'),
  S('s21', 'try', 46.75, 49.5, 'FALLS'),
  S('s22', 'sink', 49.5, 52.0, 'FALLS-UNDER'),
  S('s23', 'memory', 52.0, 54.0, 'POND'),
  S('s24', 'wake', 54.0, 55.25, 'FALLS-UNDER'),
  S('s25', 'run', 55.25, 57.5, 'FALLS-UNDER'),
  S('s26', 'climb', 57.5, 61.0, 'FALLS'),
  S('s27', 'log', 61.0, 63.0, 'FALLS'),
  S('s28', 'push', 63.0, 65.5, 'FALLS'),
  S('s29', 'gate', 65.5, 67.0, 'FALLS'),
  S('s30', 'change', 67.0, 70.0, 'FALLS'),
  S('s31', 'roar', 70.0, 72.0, 'FALLS'),
  S('s32', 'ascend', 72.0, 74.5, 'SKY'),
  S('s33', 'above', 74.5, 77.5, 'SKY'),
  S('s34', 'glide', 77.5, 79.5, 'SKY'),
  S('s35', 'over gorge', 79.5, 80.5, 'GORGE'),
  S('s36', 'over town', 80.5, 81.75, 'TOWN'),
  S('s37', 'over bamboo', 81.75, 83.0, 'BAMBOO'),
  S('s38', 'temple', 83.0, 85.5, 'POND'),
  S('s39', 'end', 85.5, 88.0, 'POND'),
];
SHOTS.forEach((s, i) => { s.index = i; s.f0 = Math.round(s.t0 * FPS); s.f1 = Math.round(s.t1 * FPS); });
export const SHOT = Object.fromEntries(SHOTS.map((s) => [s.id, s]));

export const CUES = {
  hookCrack: 0.4, leafLand: 2.8, eyeUp: 3.7, nudge: 8.0, spout: 9.3, inletLeap: 14.3, catSwipe: 23.7, heronLock: 31.0,
  strike1: 32.6, strike2: 34.6, rainStart: 37.5, fallsReveal: 41.5, try: 47.2, fallBack: 48.6, sink: 49.5, memory: 52.0, wake: 54.3,
  run: 55.3, breach: 57.6, log: 61.6, push: 64.6, gate: 65.9, change: 67.0, roar: 70.3, ascend: 72.0, dawn: 74.6, return: 79.5,
  temple: 83.0, end: 88.0,
};

// placeholder camera per set until direction fills CAMS (a slow push so frames are never dead)
export const PLACEHOLDER_CAMS = {
  POND: { pos: [0, 1.6, 9], look: [0, 0.3, 0], fov: 45, near: 0.03 },
  BAMBOO: { pos: [0, 1.4, 6], look: [0, 0.4, -4], fov: 45, near: 0.03 },
  TOWN: { pos: [0, 4, 22], look: [0, 2, 0], fov: 45 },
  GORGE: { pos: [0, 6, 32], look: [0, 3, 0], fov: 45 },
  FALLS: { pos: [0, 25, 260], look: [0, 120, 0], fov: 45, near: 0.3 },
  SKY: { pos: [0, 1060, 300], look: [0, 1100, 0], fov: 50, near: 0.5, far: 20000 },
};
export const CAM_DEFAULTS = { near: 0.05, far: 12000 };

// ------------------------------------------------------------ direction registry
export const DIRECTION = { CAMS: {}, LOOKS: {}, ACT: {} };
export function registerDirection(mod = {}) {
  for (const k of ['CAMS', 'LOOKS', 'ACT']) if (mod[k]) Object.assign(DIRECTION[k], mod[k]);
  return DIRECTION;
}

// ------------------------------------------------------------ evaluation
// direction functions never break a frame: an error is logged once (console + DIRECTION.errors) and the frame falls back
DIRECTION.errors = [];
const _seen = new Set();
function safe(tag, fn, fallback) {
  try { return fn(); } catch (e) {
    const k = tag + ':' + e?.message;
    if (!_seen.has(k)) { _seen.add(k); DIRECTION.errors.push(k); console.error(`[${tag}]`, e); }
    return fallback;
  }
}
export function shotAt(t) {
  if (t <= 0) return SHOTS[0];
  for (const s of SHOTS) if (t < s.t1) return s;
  return SHOTS[SHOTS.length - 1];
}
const v3 = (v) => (v && v.isVector3 ? v.clone() : new THREE.Vector3(...(v ?? [0, 0, 0])));
const num = (q, k, d) => (q.has(k) && q.get(k) !== '' ? parseFloat(q.get(k)) : d);
const vec = (q, k) => (q.has(k) ? q.get(k).split(',').map(Number) : null);
export function normCam(c, set) {
  const p = PLACEHOLDER_CAMS[set] ?? PLACEHOLDER_CAMS[SETS[0]];
  c = c ?? p;
  return { ...c, pos: v3(c.pos ?? p.pos), look: v3(c.look ?? c.at ?? p.look), fov: c.fov ?? p.fov ?? 40, roll: c.roll ?? 0,
    near: c.near ?? p.near ?? CAM_DEFAULTS.near, far: c.far ?? p.far ?? CAM_DEFAULTS.far };
}
function placeholderCam(set, lt) {
  const p = PLACEHOLDER_CAMS[set] ?? PLACEHOLDER_CAMS[SETS[0]];
  const pos = v3(p.pos), look = v3(p.look), k = Math.min(lt, 6) * 0.015;
  return { pos: pos.lerp(look, k), look, fov: p.fov };
}
// split 'POND-UNDER' -> {set: 'POND', under: true}
export function parseSet(s) { const m = /^(.*?)(-UNDER)?$/.exec(s ?? ''); return { set: m[1], under: !!m[2] }; }

// evalFrame(frame, q?) -> st. q = URLSearchParams; test mode (?test=1|demo) honours set / cam / at / fov / roll / t / f
// (&act=1 also runs the shot's LOOKS + ACT in test mode; &impact= &flash= &memory= &under= &speed= &fade= &mirror= set look keys)
export function evalFrame(frame, q = new URLSearchParams()) {
  const test = q.has('test');
  let t = frame / FPS;
  if (test && q.has('t')) t = num(q, 't', 0);
  else if (test && q.has('f')) t = num(q, 'f', 0) / FPS;
  frame = Math.round(t * FPS);
  const shot = shotAt(t);
  const lt = t - shot.t0, dur = shot.dur;
  let { set, under } = test && q.has('set') ? parseSet(q.get('set')) : { set: shot.set, under: shot.under };
  if (test && q.get('under') === '1') under = true;
  const act = !test || q.get('act') === '1' || (!q.has('set') && !q.has('cam'));
  const st = { frame, t, sid: shot.id, shot, set, under, lt, dur, d: dur, u: lt / dur, cues: CUES, q, test, act, since: (c) => t - CUES[c] };
  // look: per-frame basics, set preset, then the shot's LOOKS
  let look = mergeLook({ t, frame, inkSeed: Math.floor(t * 12 + 1e-6) }, LOOK_PRESETS[set] ?? {});
  if (under && LOOK_PRESETS.UNDER) look = mergeLook(look, LOOK_PRESETS.UNDER);
  if (under) look.under = look.under || true;
  st.look = look;
  const L = DIRECTION.LOOKS[shot.id];
  if (act && L && set === shot.set) st.look = mergeLook(look, safe('LOOKS ' + shot.id, () => (typeof L === 'function' ? L(lt, dur, t, st) : L), {}));
  // camera
  const C = DIRECTION.CAMS[shot.id];
  let cam = act && C && set === shot.set ? safe('CAMS ' + shot.id, () => (typeof C === 'function' ? C(lt, dur, t, st) : C), null) : null;
  if (!cam || !cam.pos) cam = placeholderCam(set, lt);
  if (test && q.has('cam')) cam = { pos: vec(q, 'cam'), look: vec(q, 'at') ?? PLACEHOLDER_CAMS[set]?.look, fov: num(q, 'fov', 40), roll: num(q, 'roll', 0), near: num(q, 'near', undefined), far: num(q, 'far', undefined) };
  else if (test) { if (q.has('fov')) cam.fov = num(q, 'fov', 40); if (q.has('roll')) cam.roll = num(q, 'roll', 0); if (q.has('at')) cam.look = vec(q, 'at'); }
  st.cam = normCam(cam, set);
  // test look toggles
  if (test) {
    for (const k of ['impact', 'flash', 'memory', 'fade', 'exposure']) if (q.has(k)) st.look[k] = num(q, k, 0);
    if (q.has('under')) st.look.under = num(q, 'under', 0);
    if (q.has('speed')) st.look.speed = { amount: num(q, 'speed', 1), centre: vec(q, 'speedc') ?? [0.5, 0.5] };
    if (q.has('mirror')) st.look.mirror = num(q, 'mirror', 1) > 0 ? { ...(st.look.mirror ?? { on: true, y: 0 }), on: true, strength: num(q, 'mirror', 1) } : { on: false };
  }
  return st;
}
export function evalTime(t, q) { return evalFrame(Math.round(t * FPS), q); }
