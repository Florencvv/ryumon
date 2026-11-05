// vale.js - dept VALE: the POND, BAMBOO and TOWN sets (painted backgrounds, cel + ink props). Water surfaces are dept
// WATER's; this module publishes the water levels, stream / canal paths and stage anchors they and CREATURES build on.
//
// ctx.api.vale = {
//   waterY: { POND: 0, BAMBOO: 0, TOWN: 0 },
//   pond: { sun, inletLip, inletBase, inletStream: CatmullRomCurve3 (lip -> upstream, water y 0.3), spoutRock (top, the stone
//           dragon head sits here), spoutFace (unit, the head looks / pours this way), spoutPour (where its stream hits the
//           water), bridge {a, b, apex}, lantern, temple, hiStart, leafLand, terrainH(x, z), inside(x, z) (true over water),
//           makeLeaf(color, size) -> cel maple leaf mesh, trees [{base, H, ramp}], mist(k) (0 hides the mist cards; reset to 1
//           every frame by vale, so call it in your update; q mist=0.5 for tests) },
//   bamboo: { sun, stream: CatmullRomCurve3 (downstream +z -> upstream -z, y 0), width 2, centerX(z), halfWidth(z), bedH(x, z),
//             bend(k, at, dir, radius) -> lean the culms + canopy (s37 has a default travelling gust) },
//   town: { sun, canal: CatmullRomCurve3 (z +42 -> -128, y 0), river: CatmullRomCurve3 (-128 -> -1600), centerX(z),
//           halfWidth(z) (3 in the canal, up to ~17 on the river), street: 1.5 (embankment level), bridges [{z, x, deck, clear}],
//           catSeat (V3 on the stone landing just above the water, cat faces +x toward the canal), catFace, lanterns [V3],
//           waterfall {top, bottom} (the far thread for s12), fieldH(x, z) },
//   cams: { s02: {pos, at, fov}, ... }   suggested framings for every contract shot in these sets (direction may ignore),
//   looks: { POND, BAMBOO, BAMBOO_AIR, TOWN, TOWN_HORIZON }   colour script per set: painted sky preset (valeSky) + light keys
//           (sun / ambient / key / shade / rim) + fog / shafts / grade. look(set, sid) -> the merged look for a shot (s09 / s37
//           add BAMBOO_AIR, s12 adds TOWN_HORIZON): direction should mergeLook it into its LOOKS for these sets,
//   skies: SKIES (vale_sky.js) painted sky presets; each set has its own 'vale_sky' mesh (replaces the look.js preset sky).
//           st.look.valeSky = 'POND' | 'BAMBOO' | 'TOWN' | 'TOWN_HORIZON' picks one per shot (default: the set; s12 -> TOWN_HORIZON),
//   pond.shadow / town.shadow: heightmap cast shadows (low sun, long cool shadows) patched into the set's own materials;
//           .uVShAmt.value (0..1) fades them, .uVShSun.value the shadow sun, pond.shafts / bamboo.shafts: sunbeam meshes,
// }
// Test views (st.q): set=POND|BAMBOO|TOWN, standin=1 (flat stand-in water), vlook=1 (apply look(set, sid) incl. lights),
// vsky=<SKIES name>, vshdbg=1 (TOWN shadows in red); framings in CAMS.
import { THREE, A, V3 } from './vale_lib.js';
import { buildPond, POND } from './vale_pond.js';
import { buildBamboo, BAMBOO, sx, sw } from './vale_bamboo.js';
import { buildTown, TOWN, cx, rw, STREET } from './vale_town.js';
import { valeSky, SKIES } from './vale_sky.js';
import { applyLights } from './look.js';

const C = (pos, at, fov = 40) => ({ pos: V3(...pos), at: V3(...at), fov });
export const CAMS = {
  // POND
  s02: C([0.95, 0.09, 1.95], [0.55, 0.0, 1.35], 32),                 // macro on the surface, leaf lands at leafLand
  s03: C([1.6, 2.4, 11.5], [-0.8, 1.6, -6.5], 46),                   // wide garden, push from here
  s05: C([-1.6, 0.14, 2.9], [5.2, 1.25, -2.9], 38),                  // Hi's POV: spout against the sunrise
  s07: C([-4.0, 0.55, -3.4], [-6.1, 0.35, -6.1], 40),                // the inlet cascade
  s38: C([2.5, 0.6, 9.5], [-1.0, 7.5, -8.0], 50),                    // low over the pond up at the sky above the temple
  s39: C([1.6, 1.6, 3.6], [0.4, 0.0, 0.8], 38),                      // the still pond with the leaf
  // BAMBOO
  s08: C([sx(-6) + 0.4, 0.45, -6], [sx(-16), 0.6, -16], 44),
  s09: C([sx(-20) + 0.3, 46, -20.5], [sx(-20), 0, -20], 38),
  s37: C([sx(-2) + 2, 34, 4], [sx(-24), 0, -24], 50),
  // TOWN
  s10: C([cx(4), 1.0, 4], [cx(-12), 1.6, -12], 44),
  s11: C([cx(-36) + 1.4, 0.55, -33.4], [cx(-36) - 2.6, 0.55, -36], 40),
  s12: C([cx(-134), 3.2, -134], [cx(-400), 120, -1400], 36),
  s36: C([cx(-20) + 22, 48, -10], [cx(-44), 0, -44], 46),
};
// Suggested looks per set (merge over the look.js preset; light keys sun/ambient/key/shade/rim are written by main's
// applyLights). valeSky picks the painted sky preset (vale_sky.js SKIES) for the set's 'vale_sky' mesh; s12 defaults to
// TOWN_HORIZON (orange sunset). BAMBOO_AIR merges over BAMBOO for the aerial shots s09 / s37.
const sunPos = (name, d) => V3(...SKIES[name].sun).normalize().multiplyScalar(d);
export const LOOKS = {
  POND: { valeSky: 'POND',   // autumn dawn: pink-gold sunrise low behind the maples, warm rim light, long cool shadows
    sun: { dir: [0.7, 0.2, -1], color: '#ffcf9c' }, ambient: '#8c86c4',
    key: { dir: [0.75, 0.5, -0.25], color: '#ffe0b8', tint: 0.22 }, shade: { tint: '#aaa4f0', mix: 0.36 }, rim: { dir: [0.7, 0.15, -1], amt: 1.35 },
    fog: '#f2c4b4', fogDensity: 0.011, fogNear: 8, fogMax: 0.5, celFog: 0.3, shafts: 0.6, shaftPos: sunPos('POND', 400), shaftColor: '#ffcf90',
    bloom: 0.95, exposure: 1.02, sat: 1.1, contrast: 0.13, lift: '#2a2048', gain: '#fff6ec', paintRadius: 6, inkWidth: 2.0 },
  BAMBOO: { valeSky: 'BAMBOO',   // late morning: bright green-gold, sun shafts down through the canopy
    sun: { dir: [0.3, 0.75, -0.5], color: '#fff2c4' }, ambient: '#86aab0',
    key: { dir: [0.4, 0.7, 0.4], color: '#fff6d4', tint: 0.12 }, shade: { tint: '#a6cce6', mix: 0.32 }, rim: { dir: [0.3, 0.5, -0.8], amt: 1.1 },
    fog: '#d6eab8', fogDensity: 0.028, fogNear: 5, fogMax: 0.55, celFog: 0.35, shafts: 0.35, shaftPos: sunPos('BAMBOO', 300), shaftColor: '#fff2b0',
    bloom: 0.85, exposure: 1.03, sat: 1.08, contrast: 0.12, lift: '#183028', gain: '#fbfff0', paintRadius: 6, inkWidth: 2.0 },
  BAMBOO_AIR: { fogDensity: 0.004, fogNear: 25, fogMax: 0.35, shafts: 0 },
  TOWN: { valeSky: 'TOWN',   // late-afternoon gold: warm low sun from the west, long cool shadows across the canal
    sun: { dir: [-0.8, 0.3, -0.6], color: '#ffd29a' }, ambient: '#8a86c0',
    key: { dir: [-0.75, 0.45, -0.3], color: '#ffc482', tint: 0.55 }, shade: { tint: '#b4b8e8', mix: 0.3 }, rim: { dir: [-0.8, 0.2, -0.6], amt: 1.25 },
    fog: '#f0c89c', fogDensity: 0.0014, fogNear: 25, fogMax: 0.38, celFog: 0.3, shafts: 0.4, shaftPos: sunPos('TOWN', 3000), shaftColor: '#ffcf88',
    bloom: 0.9, exposure: 1.03, sat: 1.1, contrast: 0.13, lift: '#2c1e3c', gain: '#fff6e8', paintRadius: 6.5, inkWidth: 2.1 },
  TOWN_HORIZON: { valeSky: 'TOWN_HORIZON',   // s12: orange sunset; the far ranges carry their own painted haze, keep fog light
    sun: { dir: [-0.5, 0.2, -1], color: '#ffb478' }, key: { dir: [-0.6, 0.35, -0.6], color: '#ffc08c', tint: 0.3 }, rim: { dir: [-0.5, 0.1, -1], amt: 1.4 },
    fog: '#f4ae86', fogDensity: 0.0006, fogNear: 60, fogMax: 0.2, shafts: 0.5, shaftPos: sunPos('TOWN_HORIZON', 3000), shaftColor: '#ffbe78', sat: 1.12 },
};
// valeLook(set, sid): the full suggested look for a set + shot (what direction should merge)
export function valeLook(set, sid) {
  let L = { ...LOOKS[set] };
  if (set === 'BAMBOO' && (sid === 's09' || sid === 's37')) L = { ...L, ...LOOKS.BAMBOO_AIR };
  if (set === 'TOWN' && sid === 's12') L = { ...L, ...LOOKS.TOWN_HORIZON };
  return L;
}
export async function create(ctx) {
  const sets = ctx.sets ?? {};
  for (const k of ['POND', 'BAMBOO', 'TOWN']) if (!sets[k]) { sets[k] = new THREE.Group(); sets[k].name = k; ctx.scene.add(sets[k]); }
  const skies = {};
  for (const k of ['POND', 'BAMBOO', 'TOWN']) { skies[k] = valeSky(k); sets[k].add(skies[k]); }
  const pond = buildPond(ctx, sets.POND), bamboo = buildBamboo(ctx, sets.BAMBOO), town = buildTown(ctx, sets.TOWN);
  const curve = (pts) => new THREE.CatmullRomCurve3(pts);
  const api = {
    waterY: { POND: 0, BAMBOO: 0, TOWN: 0 },
    pond: { ...POND, inletStream: curve(POND.inletStream), terrainH: pond.terrainH, inside: (x, z) => pond.pondD(x, z) < 1, makeLeaf: pond.api.makeLeaf, trees: pond.api.trees, mist: pond.api.mist,
      shadow: pond.api.shadow, shafts: pond.api.shafts },
    bamboo: { sun: BAMBOO.sun, stream: curve(BAMBOO.streamPts), width: BAMBOO.streamWidth, centerX: sx, halfWidth: sw, bedH: bamboo.bedH, bend: bamboo.api.bend, shafts: bamboo.api.shafts },
    town: { sun: TOWN.sun, canal: curve(town.api.canalPts), river: curve(town.api.riverPts), centerX: cx, halfWidth: rw, street: STREET, bridges: TOWN.bridges,
      catSeat: TOWN.catSeat, catFace: TOWN.catFace, lanterns: town.api.lanterns, waterfall: town.api.waterfall, fieldH: town.fieldH, shadow: town.api.shadow },
    cams: CAMS, looks: LOOKS, look: valeLook, skies: SKIES,
  };
  // convenience aliases named in the contract text
  api.pondInlet = POND.inletLip; api.spoutRock = POND.spoutRock;
  ctx.api.vale = api;
  return {
    update(st) {
      const mine = st.set === 'POND' || st.set === 'BAMBOO' || st.set === 'TOWN';
      if (!mine) return;
      if (st.test && st.q?.get?.('vlook') === '1') { Object.assign(st.look, valeLook(st.set, st.sid)); applyLights(st.look); }   // lookdev: suggested look
      // painted sky: look.valeSky (preset name) else the set default (s12 -> TOWN_HORIZON); q vsky= overrides in tests
      const sk = (st.test && st.q?.get?.('vsky')) || st.look.valeSky || (st.set === 'TOWN' && st.sid === 's12' ? 'TOWN_HORIZON' : st.set);
      skies[st.set].userData.use(SKIES[sk] ? sk : st.set);
      st.valeSky = skies[st.set].userData.current();
      if (st.set === 'POND') pond.update(st); else if (st.set === 'BAMBOO') bamboo.update(st); else town.update(st);
    },
  };
}
