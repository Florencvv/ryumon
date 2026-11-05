// water.js - dept WATER of RYŪMON: every water surface and every FX. API: ctx.api.water (full docs: src/water/README.md).
//
//   surface(set, opts) -> handle        add / restyle a surface (y, size|radius|geometry|path+width, flow:[x,z], foam, preset keys)
//   get(set) -> handle                  the set's main surface ({mesh, U, P})
//   ripple(x, z, t0, size = 1, o)       drawn ring ripple (also pushed to look.mirror.ripples)
//   splash(at, t0, size = 0.3, o)       crown splash + drops + foam ring + ripple  o: {dur, lean, crown, y, ripple}
//   rain(amount, o)                     0..1 this frame (auto per set; this overrides)
//   bubbles(at, t0, o)                  burst / trail puff  o: {n, spread, dur, size, rise, kick, stagger, seed}
//   stream(from, to, o) -> pour         a rope of water from `from` landing on `to` (y of `to` = floor); keyed, built once
//   transform(target, k, o)             s30 transformation this frame: lightning cocoon, radial rays, spiral gold wave, sparks
//   rapids(k)                           GORGE flow foam multiplier this frame (default 1)
//   falls(k, o)                         FALLS curtain intensity this frame (0 hides the curtain + mist + spray)
//   fallsAt(y, x = 0, layer = 2) -> {pos, normal, out}   point on the falls face (Hi climbs here)
//   lightning(t0, from, to, o)          drawn bolt (white core, cyan edge, branches, on threes) + look.flash pulses
//   sparkles(at, t0, o)                 4-point star burst / aura  o: {n, dur, size, speed, mode:'burst'|'aura', radius, gravity}
//   glow(at, k, o)                      transformation glow this frame (drawn aura + look.glows)  o: {size, rays, core, mid, outer, look}
//   scaleWave(target, k, o)             gold scale wave over target's meshes, k = front 0..1 along the body  o: {width, reverse, axis, scale}
//   flash(k)                            lightning brighten (look.flash) this frame
//   storm(on)                           ambient lightning in FALLS / SKY (default on)
//   godRays(k)                          underwater god-ray amount this frame (look.underRays)
// Test views (q): wtest=surface|falls|fx, wk=<0..1>.
import * as THREE from 'three';
import { Events, V3, mulberry } from './fx_core.js';
import { makeSurface, Refraction, SURF, MAX_RIP } from './water_surface.js';
import { makeSheet, makeSpray, makePour, CASCADE_PAL } from './water_falls.js';
import { buildFallsWater } from './water_curtain.js';
import { makeRain, rainGust, Splashes, Bubbles, Sparkles, Glows, scaleShell } from './fx.js';
import { Bolts } from './fx_bolt.js';

const SETS = ['POND', 'BAMBOO', 'TOWN', 'GORGE', 'FALLS'];
const qmap = (q) => (q?.get ? Object.fromEntries(q.entries()) : (q ?? {}));

// a flat strip surface along a polyline (stream above the pond, canals)
function stripGeo(points, width, y) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V3(p).setY(0)));
  const n = Math.max(8, Math.round(curve.getLength() / 0.3)), pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u), tg = curve.getTangentAt(u), nx = -tg.z, nz = tg.x;
    const w = (typeof width === 'function' ? width(u) : width) / 2;
    pos.push(p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w);
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.translate(0, -y, 0);
  return g;
}

export async function create(ctx) {
  const { A, scene } = ctx;
  const NOISE = A.GLSL.NOISE;
  const R = new Refraction();
  const ev = new Events();
  const S = {};            // per set: { surfaces: [], main, objs: [] }
  const groupOf = (set) => ctx.sets?.[set] ?? scene;
  const api = {};
  const st0 = { set: null };
  let cur = st0;           // latest st
  const frameState = {};   // per-frame overrides (reset each update)

  // ------------------------------------------------------------ surfaces
  api.surface = (set, opts = {}) => {
    const s = (S[set] ??= { surfaces: [], objs: [] });
    const key = opts.key ?? 'main';
    const old = s.surfaces.find((h) => h.key === key);
    if (old && !opts.geometry && !opts.size && !opts.radius && !opts.path) {   // restyle in place
      restyle(old, opts); return old;
    }
    if (old) { old.mesh.removeFromParent(); R.surfaces.splice(R.surfaces.indexOf(old.mesh), 1); s.surfaces.splice(s.surfaces.indexOf(old), 1); }
    const o = { ...opts };
    if (o.path) o.geometry = stripGeo(o.path, o.width ?? 2, o.y ?? 0);
    const h = makeSurface(A, R, { ...(SURF[set] ?? SURF.POND) }, o);
    h.key = key; h.set = set;
    h.mesh.layers.set(ctx.LAYER?.MAIN_ONLY ?? 1);
    h.mesh.userData.waterSet = set;
    groupOf(set).add(h.mesh); R.surfaces.push(h.mesh); s.surfaces.push(h);
    if (key === 'main') s.main = h;
    h.base = { flow: h.U.uFlow.value.clone(), foam: h.U.uFoam.value, rough: h.U.uRough.value };
    return h;
  };
  function restyle(h, o) {
    const U = h.U, col = { deep: 'uDeep', tint: 'uTint', skyHor: 'uSkyHor', skyTop: 'uSkyTop', sun: 'uSunCol', foamCol: 'uFoamCol', foamShade: 'uFoamShade',
      caustCol: 'uCaustCol', underSilver: 'uUnderSilver', underDeep: 'uUnderDeep', win: 'uWinCol', stroke: 'uStrokeCol' };
    const num = { murk: 'uMurk', refl: 'uRefl', caust: 'uCaust', foam: 'uFoam', shore: 'uShore', rough: 'uRough', glint: 'uGlint', strokes: 'uStrokes', distort: 'uDistort', strokeScale: 'uStrokeScale', winCos: 'uWinCos' };
    for (const [k, u] of Object.entries(col)) if (o[k] !== undefined) U[u].value.set(o[k]);
    for (const [k, u] of Object.entries(num)) if (o[k] !== undefined) U[u].value = o[k];
    if (o.flow) U.uFlow.value.set(o.flow[0], o.flow[1]);
    if (o.sunDir) U.uSunDir.value.copy(V3(o.sunDir)).normalize();
    if (o.y !== undefined) { U.uY.value = o.y; h.mesh.position.y = o.y; }
    h.base = { flow: U.uFlow.value.clone(), foam: U.uFoam.value, rough: U.uRough.value };
  }
  api.get = (set) => S[set]?.main;

  // anchors from the world departments (fallbacks = their published constants at the time of writing)
  const vale = ctx.api.vale ?? {}, heights = ctx.api.heights ?? {};
  const POND = vale.pond ?? vale.POND ?? {};
  const curvePts = (c, d) => (c?.points ?? c ?? d).map((p) => V3(p));
  const P = {
    sun: V3(POND.sun, [0.66, 0.11, -0.74]).normalize(),
    inletLip: V3(POND.inletLip ?? vale.pondInlet, [-6.15, 0.3, -6.35]),
    inletBase: V3(POND.inletBase, [-6.0, 0, -5.75]),
    inletStream: curvePts(POND.inletStream, [[-6.15, 0.3, -6.45], [-6.6, 0.3, -8.2], [-5.6, 0.3, -10.2], [-6.8, 0.3, -12.4], [-8.4, 0.3, -14.5]]),
    spoutPour: V3(POND.spoutPour, [4.55, 0, -2.05]),
    spoutRock: V3(POND.spoutRock, [5.55, 1.02, -2.65]),
    spoutFace: V3(POND.spoutFace, [-0.86, 0, 0.5]).normalize(),
  };
  for (const set of SETS) api.surface(set, {});
  const sunFor = { POND: P.sun, BAMBOO: V3(vale.bamboo?.sun, [0.35, 0.86, -0.38]), TOWN: V3(vale.town?.sun, [-0.42, 0.12, -0.9]),
    GORGE: V3(heights.sunDirGorge?.(), [-0.3, 0.035, -1]), FALLS: V3(heights.FLASH_DIR, [0.25, 0.75, 0.62]) };
  for (const set of SETS) S[set].main.U.uSunDir.value.copy(sunFor[set]).normalize();
  // the inlet stream above the pond (water level 0.3), flowing down to the lip
  const inletSurf = api.surface('POND', { key: 'inlet', path: P.inletStream.slice().reverse().concat([P.inletLip.clone().add(new THREE.Vector3(0, 0, 0.04))]), width: 1.5, y: P.inletLip.y,
    flow: [P.inletLip.x - P.inletStream[4].x, P.inletLip.z - P.inletStream[4].z].map((v) => v * 0.07), shore: 1, caust: 0.9, murk: 2.2, foam: 0.05, rough: 0.16 });

  // ------------------------------------------------------------ POND: inlet cascade + stone spout stream
  const lipOut = P.inletBase.clone().sub(P.inletLip).setY(0).normalize();
  const cascade = new THREE.Group(); cascade.name = 'water_cascade';
  CASCADE_PAL.forEach((pal, i) => cascade.add(makeSheet({ NOISE, lip: P.inletLip, out: lipOut, width: 1.05 - i * 0.2, height: P.inletLip.y, below: 0.05, runIn: 0.25, roll: 0.05,
    offset: i * 0.012, speed: 0.55, pat: 0.012, palette: pal, solid: i === 0, seed: 3 + i, id: 92, segsX: 16, throwSpeed: 0.8, spread: 0.3, foamBase: 1.2 })));
  groupOf('POND').add(cascade);
  {
    const s = S.POND.main.U;
    s.uFoamSeg.value[0].set(P.inletBase.x - 0.4, P.inletBase.z, P.inletBase.x + 0.4, P.inletBase.z); s.uFoamR.value[0].set(0.45, 0.9, 0.25);
    s.uFoamSeg.value[1].set(P.spoutPour.x, P.spoutPour.z, P.spoutPour.x, P.spoutPour.z); s.uFoamR.value[1].set(0.22, 0.85, 0.2);
  }
  const pours = new Map();
  api.stream = (from, to, o = {}) => {
    const key = o.key ?? 'pour';
    if (pours.has(key) && !o.rebuild) return pours.get(key);
    const f = V3(from), d = V3(to);
    const h = Math.max(f.y - d.y, 0.05), T = Math.sqrt(2 * h / 9.8) * (o.arc ?? 1);
    const vel = o.vel ? V3(o.vel) : new THREE.Vector3((d.x - f.x) / T, (o.up ?? 0) , (d.z - f.z) / T);
    if (!o.vel && o.up) { /* solve again with initial upward speed: keep horizontal timing approx */ }
    const m = makePour({ NOISE, from: f, vel, radius: o.radius ?? 0.05, speed: o.speed ?? 2.4, floorY: d.y, palette: o.palette, sunDir: o.sunDir ?? P.sun, spread: o.spread ?? 0.9, id: o.id });
    m.userData.set = o.set ?? 'POND';
    groupOf(m.userData.set).add(m);
    const old = pours.get(key); if (old) old.removeFromParent();
    pours.set(key, m);
    return m;
  };
  // the stone spout: mouth from creatures if published, else a point above the spout rock facing the pond
  const spoutMouth = () => (ctx.api.spout?.mouth ? V3(ctx.api.spout.mouth) : P.spoutRock.clone().add(new THREE.Vector3(P.spoutFace.x * 0.55, 0.55, P.spoutFace.z * 0.55)));
  let spoutBuilt = null;

  // ------------------------------------------------------------ FALLS: curtain (built from heights' lip/face/tiers), mist, spray
  const FW = buildFallsWater({ NOISE, H: heights, makeSpray, A });
  const F = FW.info;
  const fallsG = FW.group, sheets = FW.sheets, mist = FW.mist, spray = FW.spray;
  // the upper river racing to the lip: a strip surface along heights.fallsLip.upstream, ending at the edge
  const HF = heights.fallsLip ?? {};
  const up = (HF.upstream ?? [[0, 300, -120], [0, 300, -200], [-6, 300, -320], [4, 300, -480]]).map((p) => V3(p));
  const upPath = up.slice().reverse(); upPath[upPath.length - 1] = F.lip.clone().addScaledVector(F.out, 0.6);
  api.surface('FALLS', { key: 'upper', path: upPath, width: FW.upperWidth, y: F.lip.y + 0.7, flow: [F.out.x * 6, F.out.z * 6], foam: 0.35, rough: 0.5, murk: 0.35, shore: 1, strokeScale: 0.4 });
  groupOf('FALLS').add(fallsG);
  {
    // boiling foam rings along the foot line (two halves)
    const s = S.FALLS.main.U, c = F.foot;
    s.uFoamSeg.value[0].set(F.footL.x, F.footL.z, c.x, c.z); s.uFoamR.value[0].set(26, 1, 7);
    s.uFoamSeg.value[1].set(c.x, c.z, F.footR.x, F.footR.z); s.uFoamR.value[1].set(26, 1, 7);
  }
  const side = F.side;
  api.fallsAt = FW.fallsAt;
  api.fallsInfo = F;

  // ------------------------------------------------------------ FX pools (scene-level, drawn per active set)
  const fxG = new THREE.Group(); fxG.name = 'water_fx'; scene.add(fxG);
  // rain layers: few long thin near streaks, more mid, many short faint far streaks fading into the haze
  const rainNear = makeRain({ n: 260, R: 9, H: 14, len: 1.5, px: 1.0, alpha: 0.6, nearCut: 1.6, seed: 77, wind: [2.2, 0, 1.0] });
  const rainMid = makeRain({ n: 1500, R: 32, H: 44, len: 1.3, px: 0.85, alpha: 0.42, nearCut: 6, hazeD: 60, seed: 78, color: '#cfe2ff', color2: '#9ab8ec', wind: [2.0, 0, 0.9] });
  const rainFar = makeRain({ n: 4200, R: 110, H: 150, len: 2.2, px: 0.8, alpha: 0.3, nearCut: 25, hazeD: 140, seed: 79, color: '#bcd0f4', color2: '#8ea6dc', wind: [1.8, 0, 0.8] });
  const rains = [rainNear, rainMid, rainFar];
  const splashes = new Splashes(NOISE, 6), bubbles = new Bubbles(3200), sparkles = new Sparkles(1400), glows = new Glows(NOISE, 4), bolts = new Bolts(10);
  fxG.add(rainNear, rainMid, rainFar, splashes.group, bubbles.mesh, sparkles.mesh, glows.group, bolts.group);
  bubbles.mesh.layers.set(ctx.LAYER?.MAIN_ONLY ?? 1);   // underwater: never in the mirror view

  // ------------------------------------------------------------ events API
  const setOf = (o) => o?.set ?? cur.set ?? undefined;
  api.ripple = (x, z, t0, size = 1, o = {}) => {
    ev.add('ripple', t0, { x, z, size, set: setOf(o), key: o.key ?? `${x.toFixed(2)},${z.toFixed(2)}`, life: 3 + size, y: o.y });
    if (o.mirror) pushMirrorRipple(x, z, t0, size);
  };
  api.splash = (at, t0, size = 0.3, o = {}) => {
    const p = V3(at);
    ev.add('splash', t0, { at: p, size, dur: o.dur ?? 0.55 + size * 0.9, lean: o.lean, crown: o.crown, y: o.y ?? 0, set: setOf(o), key: o.key ?? '', life: o.dur ?? 0.55 + size * 0.9 });
    if (o.ripple !== false) api.ripple(p.x, p.z, t0 + 0.05, Math.max(0.6, size * 4), { set: setOf(o), key: `sp${o.key ?? ''}` });
  };
  api.bubbles = (at, t0, o = {}) => ev.add('bubbles', t0, { at: V3(at), ...o, set: setOf(o), key: o.key ?? '', life: o.dur ?? 1.6 });
  api.sparkles = (at, t0, o = {}) => ev.add('sparkles', t0, { at: V3(at), ...o, set: setOf(o), key: o.key ?? '', life: o.dur ?? 1.2 });
  api.lightning = (t0, from, to, o = {}) => {
    const e = ev.add('bolt', t0, { from: V3(from), to: V3(to), ...o, set: o.set, key: o.key ?? '', life: (o.pattern?.length ?? 4) / 8 });
    if (cur.look && cur.t !== undefined) { const f = flashAt([e], cur.t); if (f > 0) cur.look.flash = Math.max(cur.look.flash ?? 0, f); }
    return e;
  };
  api.rain = (amount, o = {}) => { frameState.rain = amount; };
  api.rapids = (k) => { frameState.rapids = k; };
  api.falls = (k, o = {}) => { frameState.falls = k; };
  api.glow = (at, k, o = {}) => {
    (frameState.glows ??= []).push({ at: V3(at), k, ...o });
    if (o.look !== false && cur.look && k > 0) {
      const g = (cur.look.glows = (cur.look.glows ?? []).slice());
      if (g.length < 4) g.push({ pos: V3(at), color: o.lookColor ?? '#fff0c0', size: (o.lookSize ?? 0.35) * Math.min(k, 1.2), amount: (o.amount ?? 1.2) * k });
    }
  };
  const shellCache = new Map();
  api.scaleWave = (target, k, o = {}) => {
    const obj = target?.root ?? target; if (!obj) return;
    // creatures with their own gold wave (Hi, dragon: gold(pos, amt)) use it; WATER adds the sparkles riding the front
    if (typeof target.gold === 'function' && !o.shell) {
      target.gold(k, o.amount ?? 1);
      if (typeof target.anchor === 'function' && k > 0 && k < 1) {
        let at = null; try { at = target.anchor(`s:${Math.min(Math.max(k, 0), 1)}`); } catch (e) { at = null; }
        if (at) api.sparkles(at, Math.floor((cur.t ?? 0) * 8) / 8, { n: o.sparkN ?? 8, dur: 0.6, size: o.sparkSize ?? 0.05, speed: o.sparkSpeed ?? 0.6, key: 'wave' });
      }
      return;
    }
    let sh = shellCache.get(obj); if (!sh) { sh = scaleShell(obj, o); shellCache.set(obj, sh); }
    (frameState.waves ??= []).push([sh, k, o]);
  };
  api.flash = (k) => { if (cur.look) cur.look.flash = Math.max(cur.look.flash ?? 0, k); };
  let stormOn = true;
  api.storm = (on) => { stormOn = !!on; };
  api.godRays = (k) => { if (cur.look) cur.look.godRays = k; };
  // transform(target, k, o): the transformation moment this frame (s30): lightning cocoon around the stretching body,
  // bold radial rays + glow, a spiralling gold wave (the creature's own gold() + a helix of gold stars) and sparks on
  // threes. target: ctx.api.dragon / a koi ({root, anchor, gold}) or any Object3D; k 0..1 = progress of the change.
  // o: {cocoon = 1, rays = 1, wave = 1, sparks = 1, size (m, default = body length), bolts = 6}
  api.transform = (target, k, o = {}) => (frameState.transforms ??= []).push({ target, k, o });
  function bodyPoints(target) {
    const pts = [];
    if (typeof target?.anchor === 'function') {
      for (let i = 0; i <= 8; i++) { let p = null; try { p = target.anchor(`s:${i / 8}`); } catch (e) { p = null; } if (p) pts.push(V3(p)); }
    }
    if (pts.length < 2) {
      const obj = target?.root ?? target; const bb = new THREE.Box3().setFromObject(obj); const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
      const ax = sz.y >= sz.x && sz.y >= sz.z ? new THREE.Vector3(0, sz.y / 2, 0) : sz.x >= sz.z ? new THREE.Vector3(sz.x / 2, 0, 0) : new THREE.Vector3(0, 0, sz.z / 2);
      for (let i = 0; i <= 8; i++) pts.push(c.clone().addScaledVector(ax, i / 4 - 1));
    }
    return pts;
  }
  function drawTransforms(list, t3, boltList) {
    for (const { target, k, o } of list) {
      if (!target || k <= 0) continue;
      const pts = bodyPoints(target);
      let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
      L = o.size ?? Math.max(L, 0.3);
      const c = pts[Math.floor(pts.length / 2)].clone();
      const on = Math.min(1, k * 6) * (1 - Math.max(0, (k - 0.92) / 0.08));
      const draw = Math.floor(t3 * 8 + 1e-4);
      // radial rays + layered glow behind the body
      if ((o.rays ?? 1) > 0) {
        const behind = c.clone().addScaledVector(c.clone().sub(ctx.camera.position).normalize(), L * 0.9);   // behind the body: the silhouette reads against it
        api.glow(behind, (0.75 + 0.25 * ((draw % 3) / 2)) * on * (o.rays ?? 1), { size: L * 1.9, n: 22, rayW: 0.12, hole: 0.2, disc: [0.0, 0.0, 0.0], core: '#ffffff', mid: '#fff3c4', outer: '#ffcd5a', lookSize: 0.35, amount: 0.6 * on, lookColor: '#fff2c8' });
        api.glow(behind.clone().lerp(c, 0.3), 0.45 * on, { size: L * 1.1, n: 16, rayW: 0.1, hole: 0.3, disc: [0.0, 0.0, 0.0], core: '#ffffff', mid: '#e8fbff', outer: '#9fe8ff', look: false });
      }
      // lightning cocoon: bolts wrapping the body, rejittered every drawing
      if ((o.cocoon ?? 1) > 0) {
        const rng = mulberry(draw * 31 + 7), nb = o.bolts ?? 7, R = L * 0.38;
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < nb; i++) {
          const a = pts[Math.floor(rng() * (pts.length - 1))], b = pts[Math.min(pts.length - 1, Math.floor(rng() * (pts.length - 1)) + 1)];
          const tg = b.clone().sub(a); if (tg.lengthSq() < 1e-6) tg.set(0, 1, 0); tg.normalize();
          const n1 = new THREE.Vector3().crossVectors(tg, Math.abs(tg.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize(), n2 = new THREE.Vector3().crossVectors(tg, n1);
          const a1 = rng() * 6.28, a2 = a1 + 1.4 + rng() * 2.4;
          const from = a.clone().addScaledVector(n1, Math.cos(a1) * R).addScaledVector(n2, Math.sin(a1) * R);
          const to = b.clone().addScaledVector(n1, Math.cos(a2) * R * 1.1).addScaledVector(n2, Math.sin(a2) * R * 1.1);
          if (rng() < 0.85 * (o.cocoon ?? 1) * on) boltList.push({ t0: draw / 8, from, to, seed: draw * 13 + i, pattern: [1], branches: 3, jag: 0.22, levels: 5, width: 5 + rng() * 4, flash: 0.35, core: '#ffffff', edge: i % 2 ? '#7fd8ff' : '#b89cff' });
        }
        if (cur.look) cur.look.flash = Math.max(cur.look.flash ?? 0, (draw % 3 === 0 ? 0.35 : 0.15) * on * (o.cocoon ?? 1));
      }
      // spiralling gold wave: the creature's own gold() + a helix of gold stars riding the front
      if ((o.wave ?? 1) > 0) {
        const wk = Math.min(1, Math.max(0, (k - 0.15) / 0.75));
        if (typeof target.gold === 'function') target.gold(wk, o.amount ?? 1);
        if (wk > 0 && wk < 1) {
          const nH = 26, R = L * 0.14;
          for (let i = 0; i < nH; i++) {
            const f = wk - (i / nH) * 0.22; if (f < 0) break;
            const fi = Math.min(pts.length - 1.001, f * (pts.length - 1)), j = Math.floor(fi), q = fi - j;
            const p = pts[j].clone().lerp(pts[j + 1], q), tg = pts[j + 1].clone().sub(pts[j]).normalize();
            const n1 = new THREE.Vector3().crossVectors(tg, Math.abs(tg.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize(), n2 = new THREE.Vector3().crossVectors(tg, n1);
            const a = f * 40 + draw * 0.6;
            p.addScaledVector(n1, Math.cos(a) * R).addScaledVector(n2, Math.sin(a) * R);
            api.sparkles(p, draw / 8, { n: 1, dur: 0.25, size: L * 0.035 * (1 - i / nH * 0.6), speed: 0, gravity: 0, key: `helix${i}`, seed: i });
          }
        }
      }
      // sparks on threes around the body
      if ((o.sparks ?? 1) > 0) api.sparkles(c, Math.floor(t3 * 8 / 3) * 3 / 8, { mode: 'burst', n: 40, dur: 0.6, size: L * 0.03, speed: L * 0.9, gravity: L * 0.2, key: 'tfx' });
    }
  }
  api.objects = { sheets, threads: FW.threads, mist, spray, cascade, rainNear, rainMid, rainFar, splashes, bubbles, sparkles, glows, bolts, refraction: R };

  function pushMirrorRipple(x, z, t0, size) {
    const m = cur.look?.mirror; if (!m || !m.on) return;
    m.ripples = (m.ripples ?? []).slice(); if (m.ripples.length < 8) m.ripples.push([x, z, t0, 0.42 * Math.sqrt(size)]);
  }

  // ------------------------------------------------------------ ambient storm: seeded bolts (camera-relative, placed late)
  const storm = [];
  {
    const rng = mulberry(3333);
    const spans = [[0.05, 2.5, 'SKY', 0.55], [41.5, 49.5, 'FALLS', 2.4], [57.5, 65.5, 'FALLS', 2.2], [67.0, 72.0, 'FALLS', 1.8], [72.0, 74.5, 'SKY', 0.7]];
    for (const [a, b, set, gap] of spans) {
      for (let t = a + rng() * gap * 0.5; t < b - 0.3; t += gap * (0.7 + rng() * 0.6)) {
        const t0 = Math.floor(t * 8) / 8;
        storm.push({ t0, set, seed: Math.floor(rng() * 1e6), az: (rng() - 0.5) * 1.6, hi: 0.35 + rng() * 0.35, len: 0.4 + rng() * 0.4, dist: 0.8 + rng() * 0.6,
          pattern: rng() < 0.5 ? [1, 0, 1, 0] : [1, 1, 0, 0], branches: 4 + Math.floor(rng() * 4), flash: 0.4 + rng() * 0.2, rel: true, width: 6 + rng() * 4 });
      }
    }
  }
  function flashAt(list, t) {
    let f = 0;
    for (const e of list) {
      const dt = t - e.t0; if (dt < 0 || dt > 0.6) continue;
      const fr = Math.floor(dt * 24 + 1e-4);                     // frames since strike: 2-frame pulses (+ re-strike)
      const pat = e.pattern ?? [1, 0, 1, 0];
      if (fr < 2) f = Math.max(f, e.flash ?? 1);
      else if (pat[2] && fr >= 6 && fr < 8) f = Math.max(f, (e.flash ?? 1) * 0.8);
      else if (fr < 4) f = Math.max(f, (e.flash ?? 1) * 0.25);
    }
    return f;
  }

  // ------------------------------------------------------------ FALLS underwater: churning bubble columns
  const colRng = mulberry(4711), footCols = [], nearCols = [];
  for (let i = 0; i < 16; i++) {
    const x = (i + 0.5) / 16, p = F.footL.clone().lerp(F.footR, x).addScaledVector(F.out, 2 + colRng() * 10);
    footCols.push({ x: p.x, z: p.z, r: 3 + colRng() * 4, bottom: -22, top: -0.2, n: 110, size: 0.22 + colRng() * 0.2, speed: 3 + colRng() * 2, seed: 100 + i });
  }
  for (let i = 0; i < 9; i++) nearCols.push({ dx: (colRng() - 0.5) * 30, dz: (colRng() - 0.5) * 30, r: 1.2 + colRng() * 2, n: 170, size: 0.06 + colRng() * 0.07, speed: 1.8 + colRng() * 1.5, seed: 200 + i });
  const fallsColumns = (cp) => footCols.concat(nearCols.map((c) => {
    const gx = Math.round((cp.x - c.dx) / 30) * 30 + c.dx, gz = Math.round((cp.z - c.dz) / 30) * 30 + c.dz;   // world-stable tiles around the camera
    return { ...c, x: gx, z: gz, bottom: Math.min(cp.y - 10, -4), top: -0.1 };
  }));

  // ------------------------------------------------------------ per-set grade hints for the underwater look (post.js)
  const UNDER = {
    POND: { underColor: '#5fc0a8', underDeep: '#1f5f68', underSurface: '#e8fff0', underDensity: 0.07, caustics: 0.8, godRays: 0.8 },
    BAMBOO: { underColor: '#88d0a0', underDeep: '#2f6a58', underSurface: '#f0ffe8', underDensity: 0.08, caustics: 0.9, godRays: 0.8 },
    TOWN: { underColor: '#78b8b0', underDeep: '#2a5866', underSurface: '#fff0d0', underDensity: 0.07, caustics: 0.5, godRays: 0.6 },
    GORGE: { underColor: '#5f94c8', underDeep: '#1c3466', underSurface: '#d8ecff', underDensity: 0.06, caustics: 0.5, godRays: 0.6 },
    FALLS: { underColor: '#4a78c8', underDeep: '#1c3274', underSurface: '#d4e6ff', underDensity: 0.022, caustics: 0.55, godRays: 0.75 },
  };

  // ------------------------------------------------------------ update (before direction) + late update (final camera)
  const AUTO_RAIN = (st) => {
    const c = ctx.CUES ?? {};
    if (st.set === 'FALLS') return 1;
    if (st.set === 'GORGE') { const rs = c.rainStart ?? 37.5; return st.t < 79 ? THREE.MathUtils.clamp((st.t - rs) / 1.5, 0, 1) * 0.85 : 0; }
    if (st.set === 'SKY' && st.t >= 72 && st.t < 74.5) return 0.7;
    if (st.set === 'SKY' && st.t < 2.5) return 0.6;
    return 0;
  };

  function update(st) {
    cur = st;
    for (const k of Object.keys(frameState)) delete frameState[k];
    const t3 = A.onThrees(st.t);
    const q = qmap(st.q);
    // the stone spout stream (built once the creature has published its mouth)
    if (!spoutBuilt) spoutBuilt = api.stream(spoutMouth(), P.spoutPour, { key: 'spout', radius: 0.045, speed: 2.2, set: 'POND' });
    // surfaces
    for (const set of SETS) for (const h of S[set].surfaces) {
      const U = h.U; U.uT.value = t3; U.uS.value = ctx.post?.S ?? 1; U.uDebug.value = +(q.wdebug ?? 0);
      U.uFlow.value.copy(h.base.flow); U.uFoam.value = h.base.foam; U.uRough.value = h.base.rough;
    }
    for (const m of [...cascade.children, ...pours.values()]) m.userData.U ? (m.userData.U.uT.value = t3) : (m.material.uniforms.uT.value = t3);
    // flash from the ambient storm (look before post.render)
    const look = (st.look ??= {});
    const fl = stormOn ? flashAt(storm.filter((e) => e.set === st.set), st.t) : 0;
    if (fl > 0) look.flash = Math.max(look.flash ?? 0, fl);
    // underwater grade hints
    if (st.under && UNDER[st.set]) Object.assign(look, UNDER[st.set]);   // direction (updated after WATER) may still override
    if (st.under && st.set === 'FALLS' && (look.flash ?? 0) > 0) look.godRays = (look.godRays ?? 0.75) + look.flash * 1.2;
    // live reflection on every water set seen from above (direction may override look.mirror after us)
    if (SETS.includes(st.set) && !st.under && look.mirror == null && q.nomirror !== '1') look.mirror = { on: true, y: 0, strength: 1, distort: 0 };
    // auto ripples: the spout impact and the inlet foot keep ringing
    if (st.set === 'POND') {
      const base = Math.floor(st.t / 0.5) * 0.5;
      for (let i = 0; i < 6; i++) { const t0 = base - i * 0.5; api.ripple(P.spoutPour.x, P.spoutPour.z, t0, 0.5, { set: 'POND', key: 'spout' }); }
      const b2 = Math.floor(st.t / 0.75) * 0.75;
      for (let i = 0; i < 4; i++) api.ripple(P.inletBase.x, P.inletBase.z + 0.1, b2 - i * 0.75, 0.7, { set: 'POND', key: 'inlet' });
    }
    // test views
    if (q.wtest === 'fx') testFx(st, q);
    if (q.wtest === 'dragon' || q.wtest === 'hiwave') {
      const D = q.wtest === 'dragon' ? ctx.api.dragon : ctx.api.koi?.hi, k = parseFloat(q.wk ?? '0.5');
      if (D) {
        api.scaleWave(D, k, { sparkSize: q.wtest === 'dragon' ? 3 : 0.04, sparkN: 14 });
        let at = null; try { at = D.anchor(q.wtest === 'dragon' ? 'head' : 'crown'); } catch (e) { at = null; }
        if (at) {
          api.glow(at, parseFloat(q.wglow ?? '0.8'), { size: q.wtest === 'dragon' ? 18 : 0.18, lookSize: 0.25, amount: 0.6 });
          api.sparkles(at, Math.floor(st.t * 8) / 8 - 0.5, { mode: 'aura', radius: q.wtest === 'dragon' ? 30 : 0.3, n: 40, size: q.wtest === 'dragon' ? 2.2 : 0.035, dur: 1.5, key: 'tw' });
        }
      }
    }
    if (q.wtest === 'climb') {   // Hi on the curtain at height wy (x = wx), camera wd metres in front (lookdev of the climbing lane)
      const hi = ctx.api.koi?.hi, y = +(q.wy ?? 80), x = +(q.wx ?? 0), d = +(q.wd ?? 3), fa = api.fallsAt(y, x, 2);
      const p = fa.pos.clone().addScaledVector(fa.normal, 0.3);
      if (hi) { hi.root.visible = true; hi.root.position.copy(p); hi.root.rotation.set(Math.PI / 2, Math.PI, 0); }
      st.cam.pos = p.clone().addScaledVector(fa.normal, d).add(new THREE.Vector3(+(q.wcx ?? 0.6) * d * 0.3, -d * 0.25, 0)); st.cam.look = p.clone();
    }
    if (q.wtest === 'transform') {   // s30 lookdev: dragon mid-change at wk
      const D = ctx.api.dragon, k = +(q.wk ?? 0.5);
      if (D) {
        const at = V3((q.wpos ?? '0,326,-60').split(',').map(Number));
        D.root.visible = true; D.grow(+(q.wgrow ?? 0.35)); D.place(at, new THREE.Vector3(0.2, 1, 0.1).normalize(), { wave: 0.5, t: st.t }); api.transform(D, k, { rays: +(q.wrays ?? 1) });
        const L = D.anchor('head').distanceTo(D.anchor('tail')), mid = D.anchor('s:0.5');
        st.cam.pos = mid.clone().add(new THREE.Vector3(L * 0.5, -L * 0.15, L * 2.2)); st.cam.look = mid.clone();
      }
    }
    if (q.wtest === 'bolt') { frameState.testBolt = true; look.flash = Math.max(look.flash ?? 0, parseFloat(q.wflash ?? '1')); }
    if (q.hidemist === '1') scene.traverse((o) => { if (o.isMesh && o.material?.uniforms?.uDrift) o.visible = false; });
  }

  function late() {
    const st = cur; if (!st || st === st0) return;
    const t = st.t, t3 = A.onThrees(t), set = st.set;
    const look = st.look ?? {};
    const flash = look.flash ?? 0;
    const cam = ctx.camera;
    // surfaces: ripples, rain, flash, foam/flow modifiers
    const rain = frameState.rain ?? AUTO_RAIN(st);
    const rip = ev.active('ripple', t3, set, 4);
    for (const s of SETS) for (const h of S[s].surfaces) {
      const U = h.U; let i = 0;
      for (const r of rip) { if (i >= MAX_RIP) break; if (r.set && r.set !== s) continue; U.uRip.value[i++].set(r.x, r.z, r.t0, r.size); }
      for (; i < MAX_RIP; i++) U.uRip.value[i].set(0, 0, 0, 0);
      U.uRain.value = rain; U.uFlash.value = flash;
      if (s === 'GORGE') { const k = frameState.rapids ?? 1; U.uFoam.value = h.base.foam * k; U.uFlow.value.copy(h.base.flow).multiplyScalar(0.4 + 0.6 * k); }
    }
    // falls
    const fk = frameState.falls ?? 1;
    FW.update(t3, flash, set === 'FALLS' ? fk : 0, cam);
    for (const m of pours.values()) m.userData.U.uFlash.value = flash;
    // rain (in water sets it is clipped at the surface)
    const rh = ctx.post?.IH ?? 1040 * (ctx.post?.S ?? 1);
    const gust = rainGust(t3), haze = look.fog ?? '#7d8cc8';
    rains.forEach((r, i) => {
      const U = r.userData.U; U.uT.value = t3; U.uResY.value = rh; U.uFlash.value = flash; U.uPx.value = r.userData.px * (ctx.post?.S ?? 1);
      U.uAmt.value = rain * (0.5 + 0.5 * gust) * (i === 0 ? 0.8 + 0.2 * gust : 1);              // light most of the time, heavier in short gusts
      U.uWind.value.set(1.6 + 4.5 * gust, 0, 0.7 + 1.5 * gust);
      U.uWaterY.value = SETS.includes(set) ? 0 : -1e4; U.uHaze.value.set(haze);
      r.visible = rain > 0.001;
    });
    const tfBolts = [];
    if (frameState.transforms) drawTransforms(frameState.transforms, t3, tfBolts);
    // splashes, bubbles, sparkles
    splashes.draw(ev.active('splash', t3, set, 1), t3);
    const amb = st.under ? { n: 70, centre: cam.position, box: 6, bottom: Math.min(cam.position.y - 6, -1), top: 0, columns: set === 'FALLS' ? fallsColumns(cam.position) : [] } : null;
    bubbles.draw(ev.active('bubbles', t3, set, 1.6), t3, SETS.includes(set) ? 0 : 1e4, amb);
    sparkles.draw(ev.active('sparkles', t3, set, 1.2), t3);
    // glows + scale waves (this frame only)
    glows.draw(frameState.glows ?? [], t3);
    for (const sh of shellCache.values()) sh.set(-1);
    for (const [sh, k, o] of frameState.waves ?? []) sh.set(k, o);
    // bolts: API bolts + ambient storm (camera-relative)
    const list = ev.active('bolt', t3, set, 0.5).filter((e) => !e.set || e.set === set);
    if (stormOn) {
      const f3 = new THREE.Vector3(); cam.getWorldDirection(f3);
      const f = f3.clone().setY(0).normalize(), rt = new THREE.Vector3(-f.z, 0, f.x);
      const sl = frameState.testBolt ? [{ ...storm[0], t0: t3, set, az: 0.25, hi: 0.5, len: 0.7, dist: 0.6 }] : storm;
      for (const e of sl) {
        if (e.set !== set || t3 < e.t0 - 1e-6 || t3 >= e.t0 + 0.5) continue;
        const D = (set === 'FALLS' ? 380 : 340) * e.dist, H = D * 0.75;
        const c = cam.position.clone().addScaledVector(f3, D).addScaledVector(rt, Math.sin(e.az) * D * 0.55);
        const from = c.clone().add(new THREE.Vector3(0, H * (0.45 + e.hi * 0.4), 0));
        const to = c.clone().addScaledVector(rt, (e.az > 0 ? -1 : 1) * D * 0.08).add(new THREE.Vector3(0, -H * e.len * 0.5, 0));
        if (set === 'FALLS') { from.y = Math.max(from.y, 380); to.y = Math.max(to.y, 90); }
        list.push({ ...e, from, to });
      }
    }
    bolts.draw(tfBolts.concat(list), t3, ctx.post?.IH ?? 1040, ctx.post?.S ?? 1);
  }
  const prevBR = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, rt) {
    prevBR?.call(this, renderer, sc, camera, rt);
    if (!R.busy && camera.layers.isEnabled(1)) R.frame++;
    if (lateKey !== cur) { lateKey = cur; late(); }
  };
  let lateKey = null;

  // ------------------------------------------------------------ test views
  function testFx(st, q) {
    const k = parseFloat(q.wk ?? '0.5');
    const at = V3((q.wat ?? '0,0,0').split(',').map(Number));
    const T = st.t;
    api.splash(at, T - k * 0.9, parseFloat(q.wsize ?? '0.3'), { key: 'test' });
    api.bubbles(at.clone().add(new THREE.Vector3(1, -0.6, 0)), T - 0.8, { n: 40, spread: 0.12, key: 'test' });
    api.sparkles(at.clone().add(new THREE.Vector3(-1, 0.6, 0)), T - 0.4, { n: 40, speed: 1.2, size: 0.06, key: 'test' });
    api.glow(at.clone().add(new THREE.Vector3(0, 1.4, 0)), Math.max(k, 0.2) * 1.0, { size: 1.0, look: false });
    api.lightning(T - 0.01, at.clone().add(new THREE.Vector3(2.2, 4, -1)), at.clone().add(new THREE.Vector3(1.5, 0.3, 0)), { key: 'test', width: 6, flash: 0 });
  }

  return { update, api: (ctx.api.water = api), late };
}
