// heights.js - dept HEIGHTS: GORGE, FALLS, SKY sets (painted gouache backgrounds, pure code, seeded).
//
// ctx.api.heights (all positions in metres, world space, water surface y = 0 in GORGE and FALLS):
//   GORGE (river flows +z toward TOWN; Hi swims upstream toward -z, the sunset sits in the V of the gorge upstream)
//     riverX(z) -> x of the river centre line;  halfWidth(z) -> half the water width;  bedY ~ -2.7 (pebbled bed)
//     heronRock = { pos, top /* Vector3: where the heron's feet go, ~0.7 m above water */, r }
//     boulders  = [{ pos, r, top }]  rocks that break the surface (white water goes around these; Hi's lane winds between)
//     rapids    = { z0: -95, z1: 45, lane(z) -> x }  the rapids stretch and the clear lane through it
//     dusk      : number 0..1 or null (override). Default per shot: s13 0, s14 .08, s15 .12, s16 .18, s17 .25 -> 1 over the
//                 shot, s18 1. look.dusk (if a number) wins over everything. 0 = sunset orange-magenta, 1 = dusk violet
//                 with the storm built up over the mountains. dawn: 0..1 or null (s35 defaults to 1 = morning flight).
//     sunDirGorge() -> Vector3 toward the sun (for glows / shafts: e.g. look.shaftPos = cam + dir * 2000)
//   FALLS (round 2: colossal. Amphitheatre cliff around a boiling pool, curtain at the back, lip y 300, 140 m wide)
//     fallsLip  = { center: (0, 300, -120), left, right, width: 140, y: 300, flow: (0, 0, 1) /* over the lip toward +z */,
//                   upstream: [Vector3...] /* upper river centre line behind the lip at y 300, going -z */,
//                   teeth: [x...] /* rock teeth on the lip edge, 3-7 m behind the lip line */ }
//     fallsFace = { point: (0, 150, z(150)), normal: (0, 0, 1), width: 140, bottom: 0, top: 300, z(y, x = 0) -> rock face z behind
//                   the curtain (13 m behind the lip line at the base, 1.2 m at the lip; ragged near the lip; tiers stick out) }
//     fallsTiers = [{ y, edgeZ, halfWidth }]  ledges in the face behind the curtain (y 212 and 118), their edges ~2.5-5 m
//                   behind the lip line: the curtain breaks white over them (WATER: foam bands at these heights)
//     fallsPool = { center: (0, 0, -40), radius: 150, depth: 24, impact: (0, 0, -118) /* where the curtain hits */,
//                   outflow: { dir: (0, 0, 1), halfWidth(z) } /* river leaving toward +z between the side walls */ }
//     fallsCascades = [{ x, top, width }]  side cascades from notches in the rim (HEIGHTS draws them, plus thin threads)
//     flash: lightning brightness comes from look.flash (0..1) at render time; the cliff, trees, clouds, mountains and
//            sky all switch to a blue-white flash light. FLASH_DIR = light direction of the bolts (in front, above).
//   SKY
//     sky.mode  : 'storm' | 'dawn' | null (override; default s01/s32 storm, s33/s34 dawn; q sky=storm|dawn)
//     sky.chimney = { x: 0, z: 0, r: 120, y0: -300, y1: 1000 }  the clear shaft the dragon climbs through the storm
//     sky.cloudTop = 1000 (dawn sea-of-clouds surface), sky.sunDir (dawn sun direction)
//   lookHint(set, st) -> {fog, fogDensity, fogNear, fogMax ...} recommended look keys for the set (GORGE fog follows dusk/dawn)
//   standins: crude koi / heron / dragon stand-ins for HEIGHTS lookdev only (q stand=1), never in the film.
// Test views (q): set=GORGE|FALLS|SKY, dusk=0..1, dawn=1, sky=storm|dawn, flash=0..1, stand=1 (+ koi=x,y,z heron=x,y,z
//   dragon=x,y,z dyaw=deg dscale=k).
import * as THREE from 'three';
import { V3, standIns } from './heights_lib.js';
import { buildGorge, applyGorge, riverX, halfW } from './heights_gorge.js';
import { buildFalls, applyFalls, LIP_Y, LIP_Z, LIP_HW, faceZ, TIERS, POOL } from './heights_falls.js';
import { buildSky, applySky, CLOUD_TOP, CHIMNEY_R, DAWN_SUN } from './heights_sky.js';

// recommended look keys per set (fog is the big one: the set presets fog the far mountains flat)
export const LOOK_HINTS = {
  GORGE: { fog: '#e3949c', fogDensity: 0.0011, fogNear: 60, fogMax: 0.5 },
  FALLS: { fog: '#2c3576', fogDensity: 0.0011, fogNear: 60, fogMax: 0.55, celFog: 0.25 },
  SKY_storm: { fog: '#7462b0', fogDensity: 0.0009, fogNear: 80, fogMax: 0.5 },
  SKY_dawn: { fog: '#f4c6a8', fogDensity: 0.00022, fogNear: 400, fogMax: 0.4 },
};
const DUSK = { s13: 0, s14: 0.08, s15: 0.12, s16: 0.18, s18: 1 };
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const vec = (s) => { if (!s) return null; const a = String(s).split(',').map(Number); return a.length === 3 && a.every(Number.isFinite) ? V3(...a) : null; };

export async function create(ctx) {
  const { sets, api } = ctx;
  const G = buildGorge(ctx, sets.GORGE);
  const F = buildFalls(ctx, sets.FALLS);
  const K = buildSky(ctx, sets.SKY);
  const stand = standIns(ctx.scene);
  let st = null;

  const H = (api.heights = {
    // GORGE
    riverX, halfWidth: halfW, bedY: -2.7, heronRock: G.heronRock, boulders: G.boulders,
    rapids: { z0: -95, z1: 45, lane: (z) => riverX(z) + 1.4 * Math.sin(z * 0.11) },
    dusk: null, dawn: null,
    sunDirGorge: () => G.sky.material.uniforms.uDiskDir.value.clone(),
    // FALLS
    fallsLip: { center: V3(0, LIP_Y, LIP_Z), left: V3(-LIP_HW, LIP_Y, LIP_Z), right: V3(LIP_HW, LIP_Y, LIP_Z), width: LIP_HW * 2, y: LIP_Y, flow: V3(0, 0, 1),
      upstream: [V3(0, LIP_Y, LIP_Z), V3(0, LIP_Y, LIP_Z - 80), V3(-8, LIP_Y, LIP_Z - 200), V3(6, LIP_Y, LIP_Z - 380)], teeth: [-52, -31, -9, 14, 37, 58] },
    fallsFace: { point: V3(0, 150, faceZ(150)), normal: V3(0, 0, 1), width: LIP_HW * 2, bottom: 0, top: LIP_Y, z: faceZ },
    fallsTiers: TIERS.map((T) => ({ y: T.y, edgeZ: faceZ(T.y - 1.5), halfWidth: LIP_HW - 4 })),
    fallsPool: { center: V3(POOL.cx, 0, POOL.cz), radius: POOL.r, depth: POOL.depth, impact: V3(0, 0, LIP_Z + 2), outflow: { dir: V3(0, 0, 1), halfWidth: (z) => 140 + z * 0.2 } },
    fallsCascades: F.cascades,
    FLASH_DIR: F.FLASH_DIR.clone(),
    // SKY
    sky: { mode: null, chimney: { x: 0, z: 0, r: CHIMNEY_R, y0: -300, y1: CLOUD_TOP }, cloudTop: CLOUD_TOP, sunDir: DAWN_SUN.clone() },
    standins: stand,
  });

  // time-of-day / flash / sky mode are applied in scene.onBeforeRender (after every department + direction updated, before
  // culling), so direction can still set look.dusk / look.dawn / look.flash / H.dusk ... for its shot
  const lookNum = (k) => (st && st.look && typeof st.look[k] === 'number' ? st.look[k] : null);
  const qn = (k) => num(st?.q?.get?.(k));
  const skyMode = () => H.sky.mode ?? st?.q?.get?.('sky') ?? (st && (st.sid === 's33' || st.sid === 's34') ? 'dawn' : 'storm');
  function tod() {   // [dusk, dawn] for the GORGE
    let dusk = lookNum('dusk') ?? H.dusk ?? qn('dusk');
    if (dusk === null) dusk = st.sid === 's17' ? 0.25 + 0.75 * Math.min(1, Math.max(0, st.lt / (st.dur || 2.5))) : (DUSK[st.sid] ?? 0);
    let dawn = lookNum('dawn') ?? H.dawn ?? qn('dawn');
    if (dawn === null) dawn = /^s3[5-9]/.test(st.sid || '') ? 1 : 0;
    return [dusk, dawn];
  }
  // lookHint(set, st) -> recommended look keys (fog follows the GORGE time of day); direction may merge it into LOOKS
  H.lookHint = (set, s2 = st) => {
    const prev = st; st = s2 ?? st;
    let h = LOOK_HINTS[set === 'SKY' ? 'SKY_' + skyMode() : set];
    if (set === 'GORGE' && st) {
      const [k, d] = tod(), c = new THREE.Color('#e3949c').lerp(new THREE.Color('#7a6aa8'), Math.min(1, Math.max(0, k))).lerp(new THREE.Color('#c8c4e4'), Math.min(1, Math.max(0, d)));
      h = { ...h, fog: '#' + c.getHexString() };
    }
    st = prev; return h ? { ...h } : null;
  };
  const mine = new Set(); for (const g of [sets.GORGE, sets.FALLS, sets.SKY]) for (const c of g.children) mine.add(c);
  let hidden = [];
  function apply() {
    if (!st) return;
    if (st.set === 'GORGE') { const [dusk, dawn] = tod(); applyGorge(G, dusk, dawn); } else if (st.set === 'FALLS') applyFalls(F, lookNum('flash') ?? qn('flash') ?? 0, st.t);
    else if (st.set === 'SKY') applySky(K, skyMode(), lookNum('flash') ?? qn('flash') ?? 0, st.t);
    // lookdev solo (q solo=1): hide every other department's objects in this view
    for (const o of hidden) o.visible = true; hidden = [];
    if (st.q?.get?.('solo') === '1') {
      const hide = (o) => { if (o.visible) { o.visible = false; hidden.push(o); } };
      for (const c of ctx.scene.children) if (!Object.values(sets).includes(c) && c !== stand.group) hide(c);
      for (const c of sets[st.set]?.children ?? []) if (!mine.has(c)) hide(c);
    }
  }
  const prevBR = ctx.scene.onBeforeRender;
  ctx.scene.onBeforeRender = function (...args) { apply(); return prevBR.apply(this, args); };
  applyGorge(G, 0, 0); applyFalls(F, 0); applySky(K, 'storm', 0);
  H.lookHints = LOOK_HINTS;

  // lookdev only (test views): q hrain=0..1 thins WATER's rain streaks for HEIGHTS stills (runs after WATER's late update)
  let wrapped = false;
  const lookdevRain = () => {
    if (!st?.test || !st.q?.has?.('hrain')) return;
    const o = ctx.api.water?.objects, a = Number(st.q.get('hrain'));
    for (const r of [o?.rainNear, o?.rainFar]) if (r?.userData?.U) { r.userData.U.uAmt.value = a; r.visible = a > 0.001; }
  };
  return {
    update(s) {
      st = s;
      if (!wrapped) { wrapped = true; const prev = ctx.scene.onBeforeRender; ctx.scene.onBeforeRender = function (...a) { const r = prev.apply(this, a); lookdevRain(); return r; }; }
      // lookdev: q hl=1 applies the HEIGHTS look hints (fog/grade suggestions per set) in test views
      if (s.test && s.q.get('hl') === '1') { const h = H.lookHint(s.set, s); if (h) Object.assign(s.look, h); }
      // stand-ins (lookdev only)
      const qq = s.q, q = {}; for (const k of ['stand', 'koi', 'heron', 'dragon', 'dyaw', 'dscale', 'kscale']) if (qq.has(k)) q[k] = qq.get(k);
      stand.group.visible = !!q.stand;
      if (q.stand) {
        const S = s.set;
        stand.koi.visible = stand.heron.visible = stand.dragon.visible = false;
        if (S === 'GORGE') {
          stand.koi.visible = true; stand.koi.position.copy(vec(q.koi) ?? V3(H.rapids.lane(-6), 0.05, -6));
          stand.heron.visible = true; stand.heron.position.copy(vec(q.heron) ?? G.heronRock.top); stand.heron.rotation.y = 2.4;
        } else if (S === 'FALLS') {
          stand.koi.visible = true; stand.koi.position.copy(vec(q.koi) ?? V3(0, 0.1, 10)); stand.koi.scale.setScalar(num(q.kscale) ?? 1);
          if (q.dragon) { stand.dragon.visible = true; stand.dragon.position.copy(vec(q.dragon)); }
        } else if (S === 'SKY') {
          stand.dragon.visible = true; stand.dragon.position.copy(vec(q.dragon) ?? V3(0, 300, 0));
        }
        if (q.dyaw) stand.dragon.rotation.y = THREE.MathUtils.degToRad(Number(q.dyaw));
        stand.dragon.scale.setScalar(num(q.dscale) ?? 1);
      }
    },
  };
}
