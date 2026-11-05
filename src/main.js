// main.js - boot: renderer, AnimePost, scene, camera, sets, departments, window.FILM (film specifics live in
// shots.js + look.js).
//
// URL: ?s=2 render scale (3840x2080 internal, downsampled in-page) | ?headless=1 capture mode (no UI, no loop) | ?f=N
//      ?test=1&set=FALLS&cam=x,y,z&at=x,y,z&fov=40&roll=0&t=43 free camera test view (every other param stays in st.q,
//      e.g. &pose=stance for a department's test view); &act=1 also runs the shot's LOOKS/ACT; look toggles &impact=1
//      &flash=0.8 &memory=1 &under=1 &speed=1 &fade=0.5 &mirror=0.8. ?test=demo&set=POND: engine demo (mirror + layers).
// Departments (shots.js DEPTS, update order): each module exports create(ctx) (may be async) -> {update(st)}. A missing
// or throwing module logs an error and never blocks the others. Direction modules may also just call
// registerDirection({CAMS, LOOKS, ACT}) from shots.js (or export CAMS/LOOKS/ACT: main registers them for direction/*).
// ctx = {THREE, A, scene, camera, renderer, post, sets, skies, rng(seed), FPS, CUES, SHOTS, SHOT, api, LAYER, W, H, S, q}
// window.FILM = {FRAMES, FPS, W, H, S, ready, renderFrame(n) -> ms, renderTime(t), renderQuery(qs, frame?), grab() ->
//   base64 RGB W*H top-down, bench(n), st (last state), errors[], depts}
import * as THREE from 'three';
import * as A from './anime/post.js';
import * as SH from './shots.js';
import { LOOK_PRESETS, applyLights } from './look.js';

const P = new URLSearchParams(location.search);
const S = Math.max(0.25, parseFloat(P.get('s') ?? '1') || 1);
const HEADLESS = P.get('headless') === '1';
const { W, H, FPS, FRAMES } = SH;

const canvas = document.getElementById('film') ?? document.body.appendChild(document.createElement('canvas'));
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
const gl = renderer.getContext();
const post = new A.AnimePost(renderer, { W, H, S });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, SH.CAM_DEFAULTS.near, SH.CAM_DEFAULTS.far);
camera.layers.enable(1);

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sets = {}, skies = {};
for (const k of SH.SETS) {
  const g = new THREE.Group(); g.name = 'SET_' + k; g.visible = false; scene.add(g); sets[k] = g;
  const pre = LOOK_PRESETS[k]?.sky;
  if (pre) { const m = A.skyDome(pre); m.name = 'preset_sky'; m.userData.preset = true; g.add(m); skies[k] = m; }
}
const ctx = {
  THREE, A, scene, camera, renderer, post, sets, skies, rng: (seed = 1) => mulberry32(seed), FPS, CUES: SH.CUES, SHOTS: SH.SHOTS,
  SHOT: SH.SHOT, api: {}, LAYER: A.LAYER, W, H, S, q: P, film: SH.FILM, DIRECTION: SH.DIRECTION, evalFrame: SH.evalFrame,
};
window.ctx = ctx;

// ------------------------------------------------------------ errors: logged once per source + message, never fatal
const errors = [], seen = new Set();
SH.DIRECTION.errors = errors;   // CAMS / LOOKS errors from shots.js land here too
function guard(src, fn) {
  try { return fn(); } catch (e) {
    const k = src + ':' + e?.message;
    if (!seen.has(k)) { seen.add(k); errors.push(k); console.error(`[${src}]`, e); }
  }
}

// ------------------------------------------------------------ departments
const depts = [];
// probe with X-Probe: tools/serve.py answers 204 (not 404) for a missing file, so the console stays clean
async function exists(url) { try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store', headers: { 'X-Probe': '1' } }); return r.status === 200; } catch { return false; } }
async function loadDept(name) {
  const base = new URL('./', import.meta.url);
  const leaf = name.split('/').pop();
  const cands = [`./${name}.js`, `./${name}/index.js`, `./${name}/${leaf}.js`];
  let mod = null, path = null;
  for (const c of cands) {
    if (!(await exists(new URL(c, base)))) continue;
    try { const m = await import(c); if (!mod || (mod.STUB && !m.STUB)) { mod = m; path = c; } if (!m.STUB) break; }
    catch (e) { const k = name + ':import'; seen.add(k); errors.push(`${name}: import ${c} failed: ${e.message}`); console.error(`[${name}] import ${c} failed`, e); }
  }
  if (!mod) { errors.push(`${name}: no module`); console.error(`[${name}] no module found (${cands.join(', ')})`); }
  return { name, mod, path };
}
async function boot() {
  const loaded = await Promise.all(SH.DEPTS.map(loadDept));        // fetch + evaluate in parallel
  for (const d of loaded) {                                          // create in update order
    if (!d.mod) { depts.push({ name: d.name, inst: null }); continue; }
    if (d.name.startsWith('direction/') && (d.mod.CAMS || d.mod.LOOKS || d.mod.ACT)) SH.registerDirection(d.mod);
    let inst = null;
    if (typeof d.mod.create === 'function') {
      try { inst = await d.mod.create(ctx); } catch (e) { errors.push(`${d.name}: create failed: ${e.message}`); console.error(`[${d.name}] create failed`, e); }
    }
    depts.push({ name: d.name, path: d.path, stub: !!d.mod.STUB, inst });
  }
  // a department that brought its own sky (mesh named *_sky / sky, or renderOrder <= -100) replaces the preset sky
  for (const k of SH.SETS) {
    const pre = skies[k]; if (!pre) continue;
    let own = null;
    sets[k].traverse((o) => { if (!own && o !== pre && o.isMesh && (/(^|_)sky$/i.test(o.name) || o.renderOrder <= -100)) own = o; });
    if (own) { sets[k].remove(pre); skies[k] = own; }
  }
}

// ------------------------------------------------------------ demo (engine smoke test: ?test=demo)
let demo = null;
async function ensureDemo() { if (!demo) { const m = await import('./demo.js'); demo = m.createDemo(ctx); } return demo; }

// ------------------------------------------------------------ frame
const DEG = Math.PI / 180;
function applyCam(c) {
  camera.position.copy(c.pos); camera.up.set(0, 1, 0); camera.lookAt(c.look);
  if (c.roll) camera.rotateZ(c.roll * DEG);
  camera.fov = c.fov; camera.near = c.near; camera.far = c.far; camera.aspect = W / H; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
function renderState(st, draw = true) {
  const isDemo = st.q.get('test') === 'demo';
  for (const k in sets) sets[k].visible = !isDemo && k === st.set;
  if (demo) demo.group.visible = isDemo;
  const hidden = isDemo ? scene.children.filter((c) => c !== demo?.group && c.visible) : [];   // demo: only the demo
  for (const c of hidden) c.visible = false;
  A.AU.uTime.value = st.t; A.AU.uWind.value.z = A.onTwos(st.t);
  guard('look', () => applyLights(st.look));
  if (skies[st.set]?.userData.preset && st.look.sky) A.updateSky(skies[st.set], st.look.sky);
  applyCam(st.cam);
  if (!isDemo) {
    const pass = () => {
      for (const d of depts) if (d.inst && typeof d.inst.update === 'function') guard(d.name, () => d.inst.update(st));
      if (st.act && st.set === st.shot.set) { const f = SH.DIRECTION.ACT[st.sid]; if (f) guard('ACT ' + st.sid, () => f(st.lt, st.dur, st.t, st, ctx)); }
    };
    // determinism guard (chunked renders start on a fresh page): run the update pass twice so no department reads
    // another's previous-frame state; every frame is a pure function of t
    // (st.look is restored between the passes: water.glow appends look.glows, which must not double up)
    const look0 = { ...st.look };
    pass();
    for (const k of Object.keys(st.look)) if (!(k in look0)) delete st.look[k];
    Object.assign(st.look, look0);
    pass();
  } else guard('demo', () => demo.update(st));
  applyCam(st.cam);
  // deferred per-frame work (heights palette/flash, water late fx, s01 storm tint) runs in scene.onBeforeRender, but three
  // updates matrixWorld BEFORE that hook, so transforms set there lagged one render in the first pass: run it once now
  if (!isDemo) guard('prerender', () => { scene.onBeforeRender(renderer, scene, camera, null); scene.updateMatrixWorld(); });
  if (draw) guard('post', () => post.render(scene, camera, st.look));
  for (const c of hidden) c.visible = true;
  FILM.st = st;
}
const px1 = new Uint8Array(4);
const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
function timed(fn) { const t0 = performance.now(); fn(); sync(); return performance.now() - t0; }
function queryOf(qs) { const q = new URLSearchParams(P); for (const [k, v] of new URLSearchParams(qs)) q.set(k, v); return q; }

const FILM = (window.FILM = {
  FRAMES, FPS, W, H, S, DURATION: SH.DURATION, SHOTS: SH.SHOTS, CUES: SH.CUES, ready: false, errors, depts, st: null, ctx, q: P,
  state: (n, q = P) => SH.evalFrame(n, q),
  renderFrame: (n) => timed(() => { const st = guard('evalFrame', () => SH.evalFrame(n, P)); if (st) renderState(st); }),
  renderTime: (t) => FILM.renderFrame(Math.round(t * FPS)),
  // preroll(a, b): run frames [a, b) without drawing. WATER's event registry (sparkles/ripples registered with the current
  // drawing as t0) keeps history, so a chunk that starts on a fresh page first replays the film up to its first frame
  preroll: (a, b) => { const t0 = performance.now(); for (let n = a; n < b; n++) { const st = guard('evalFrame', () => SH.evalFrame(n, P)); if (st) renderState(st, false); } return performance.now() - t0; },
  // renderQuery('test=1&set=FALLS&cam=..', frame?) renders a test view in-page (page params + these); async for the demo
  renderQuery: async (qs, frame = 0) => { const q = queryOf(qs); if (q.get('test') === 'demo') await ensureDemo(); return timed(() => { const st = guard('evalFrame', () => SH.evalFrame(frame, q)); if (st) renderState(st); }); },
  grab: () => {
    const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const rgb = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) { const sy = (H - 1 - y) * W * 4, dy = y * W * 3; for (let x = 0; x < W; x++) { rgb[dy + x * 3] = px[sy + x * 4]; rgb[dy + x * 3 + 1] = px[sy + x * 4 + 1]; rgb[dy + x * 3 + 2] = px[sy + x * 4 + 2]; } }
    let s = ''; const CH = 0x8000; for (let i = 0; i < rgb.length; i += CH) s += String.fromCharCode.apply(null, rgb.subarray(i, i + CH));
    return btoa(s);
  },
  bench: (n = 12, from = 0) => { FILM.renderFrame(from); let s = 0; for (let i = 0; i < n; i++) s += FILM.renderFrame(from + Math.round((i + 1) * FRAMES / (n + 1))); return s / n; },
});

await boot();
if (P.get('test') === 'demo') await ensureDemo();
const f0 = P.has('f') ? parseInt(P.get('f')) : 0;
guard('first frame', () => FILM.renderFrame(f0));
FILM.ready = true;
console.log(`[${SH.FILM}] ready ${W}x${H} S=${S}`, depts.map((d) => `${d.name}${d.stub ? '(stub)' : d.inst ? '' : '(none)'}`).join(' '));
if (!HEADLESS) import('./workbench.js').then((m) => m.workbench(FILM, SH, P)).catch((e) => console.error('[workbench]', e));
