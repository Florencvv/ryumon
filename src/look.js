// look.js - RYUMON colour script: one preset per set (LOOKS from direction merge on top, see shots.js).
// A preset = AnimePost look keys (fog, grade, mirror, glows ...) plus light keys that main.js writes into the shared
// uniforms every frame (applyLights):
//   sky: skyDome options {stops: [[sinElev, colour] x4], disk: {dir, radius, color, halo, haloColor, bloom}, stars, brush}
//        main builds ctx.skies[SET] from it and re-applies look.sky each frame (a dept with its own sky: add a mesh named
//        'anime_sky' to the set group and main drops the preset sky; ctx.skies[SET] then points at yours)
//   sun: {dir, color} painted world light   ambient: colour   key: {dir | pos, color, tint} character key (cheat it)
//   shade: {tint, mix} cel shade tint       rim: {dir, amt}   wind: [amplitude, speed] painted cards
// Under water (*-UNDER shots): UNDER merges on top of the set preset (each set carries its own underColor / underDeep).
import * as THREE from 'three';
import { AU, setKey } from './anime/post.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && !v.isVector3 && !v.isColor && !v.isVector2;
// mergeLook(a, b): b over a; plain-object keys (mirror, sky, key, sun, speed ...) merge one level deep
export function mergeLook(a = {}, b = {}) {
  const o = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) o[k] = isPlain(v) && isPlain(a[k]) ? { ...a[k], ...v } : v;
  return o;
}

// Time of day runs dawn -> day -> sunset -> stormy night -> dawn; never murky, night is deep indigo with readable shapes.
export const LOOK_PRESETS = {
  // temple garden at dawn, autumn: warm low sun through maples, soft mist, clear green-teal water
  POND: {
    sky: { stops: [[-0.04, '#ffd9a6'], [0.06, '#ffc2a2'], [0.3, '#a9c2ea'], [0.8, '#6f9ae0']],
      disk: { dir: [0.7, 0.07, -1], radius: 0.06, color: '#fff2d0', halo: 0.5, haloColor: '#ffcf96', bloom: 0.8 }, brush: 1 },
    sun: { dir: [0.7, 0.2, -1], color: '#ffe2bc' }, ambient: '#9a9ccc',
    key: { dir: [0.6, 0.55, 0.6], color: '#fff0dc', tint: 0.14 }, shade: { tint: '#c8c4ff', mix: 0.3 }, rim: { dir: [0.7, 0.3, -0.8], amt: 1 },
    fog: '#f2dccb', fogDensity: 0.012, fogNear: 4, fogMax: 0.7, celFog: 0.25,
    mirror: { on: true, y: 0, strength: 0.6, distort: 0, rough: 0.12, ripples: [] },
    underColor: '#3fa79a', underDeep: '#14566a', underSurface: '#e6fff2', underDensity: 0.22, caustics: 0.7, godRays: 0.7,
    bloom: 0.95, exposure: 1.02, sat: 1.06, contrast: 0.1, lift: '#20203e', gain: '#fffaf2', vignette: 0.14,
  },
  // clear shallow stream in green bamboo, late morning, dappled light
  BAMBOO: {
    sky: { stops: [[-0.04, '#eef6dc'], [0.08, '#c4e6ee'], [0.3, '#8cc6ee'], [0.8, '#5a9ce2']],
      disk: { dir: [0.3, 0.75, -0.5], radius: 0.05, color: '#fffbe8', halo: 0.3, haloColor: '#fff4c8', bloom: 0.6 }, brush: 1 },
    sun: { dir: [0.3, 0.8, -0.4], color: '#fff6dc' }, ambient: '#8aa8b8',
    key: { dir: [0.4, 0.7, 0.5], color: '#fffae6', tint: 0.1 }, shade: { tint: '#b8d4ff', mix: 0.3 }, rim: { dir: [0.3, 0.5, -0.8], amt: 1 },
    fog: '#cfe6c6', fogDensity: 0.03, fogNear: 3, fogMax: 0.6, celFog: 0.2,
    mirror: { on: true, y: 0, strength: 0.45, distort: 0.15, rough: 0.1, ripples: [] },
    underColor: '#5fb894', underDeep: '#1f6a5a', underSurface: '#eaffe6', underDensity: 0.25, caustics: 0.8, godRays: 0.5,
    bloom: 0.85, exposure: 1.02, sat: 1.05, contrast: 0.1, lift: '#1e2e30', gain: '#fbfff4', vignette: 0.14,
  },
  // canal town in late-afternoon gold, willows, lanterns
  TOWN: {
    sky: { stops: [[-0.04, '#ffd48a'], [0.08, '#ffbe7c'], [0.3, '#a2b4e0'], [0.8, '#5a7ec8']],
      disk: { dir: [-0.8, 0.14, -0.6], radius: 0.055, color: '#fff0c8', halo: 0.45, haloColor: '#ffc880', bloom: 0.8 }, brush: 1 },
    sun: { dir: [-0.8, 0.3, -0.6], color: '#ffdcaa' }, ambient: '#9890c0',
    key: { dir: [-0.6, 0.45, 0.65], color: '#ffe6c4', tint: 0.2 }, shade: { tint: '#c0b8ff', mix: 0.3 }, rim: { dir: [-0.8, 0.3, -0.6], amt: 1 },
    fog: '#f0cf9e', fogDensity: 0.006, fogNear: 10, fogMax: 0.7, celFog: 0.25,
    mirror: { on: true, y: 0, strength: 0.6, distort: 0.1, rough: 0.15, ripples: [] },
    underColor: '#5a9a88', underDeep: '#204a5a', underSurface: '#fff0d0', underDensity: 0.3, caustics: 0.5, godRays: 0.5,
    bloom: 0.95, exposure: 1.02, sat: 1.08, contrast: 0.11, lift: '#2a1e3a', gain: '#fff8ec', vignette: 0.15,
  },
  // rocky gorge at sunset: orange-magenta -> dusk violet, white-water rapids
  GORGE: {
    sky: { stops: [[-0.04, '#ffb062'], [0.08, '#f2728a'], [0.3, '#8a5aa8'], [0.8, '#3a2f78']],
      disk: { dir: [0, 0.06, -1], radius: 0.07, color: '#fff0c0', halo: 0.55, haloColor: '#ff9a5a', bloom: 0.9 }, brush: 1 },
    sun: { dir: [0, 0.15, -1], color: '#ffbe8a' }, ambient: '#7a62a8',
    key: { dir: [0.3, 0.4, -0.85], color: '#ffd0a0', tint: 0.22 }, shade: { tint: '#b4a0ff', mix: 0.35 }, rim: { dir: [0, 0.2, -1], amt: 1.1 },
    fog: '#d88a92', fogDensity: 0.005, fogNear: 10, fogMax: 0.7, celFog: 0.3,
    mirror: { on: true, y: 0, strength: 0.3, distort: 0.7, rough: 0.3, ripples: [] },
    underColor: '#3a7aa0', underDeep: '#1a2f6a', underSurface: '#ffd6c0', underDensity: 0.2, caustics: 0.6, godRays: 0.6,
    bloom: 1.0, exposure: 1.0, sat: 1.08, contrast: 0.12, lift: '#24183e', gain: '#fff2ea', vignette: 0.16,
  },
  // colossal waterfall at night in a storm: deep indigo 1E2453, cyan-white water, lightning via look.flash
  FALLS: {
    sky: { stops: [[-0.05, '#3c428a'], [0.1, '#2c3172'], [0.35, '#1e2453'], [0.8, '#171c44']], brush: 1 },
    sun: { dir: [0.3, 0.9, 0.3], color: '#9aa6e8' }, ambient: '#3a4290',
    key: { dir: [0.3, 0.6, 0.75], color: '#d6f2ff', tint: 0.22 }, shade: { tint: '#7a8cff', mix: 0.45 }, rim: { dir: [0.2, 0.6, -0.8], amt: 1.2 },
    fog: '#2e3678', fogDensity: 0.004, fogNear: 10, fogMax: 0.75, celFog: 0.3, flashColor: '#dfe8ff',
    mirror: { on: true, y: 0, strength: 0.3, distort: 0.8, rough: 0.35, ripples: [] },
    underColor: '#2a4a9a', underDeep: '#141a4a', underSurface: '#bfe6ff', underDensity: 0.12, caustics: 0.35, godRays: 0.35,
    bloom: 1.15, exposure: 1.05, sat: 1.05, contrast: 0.13, lift: '#181c48', gain: '#eef4ff', vignette: 0.2,
  },
  // above the storm at dawn: golden sun over the sea of clouds (s01/s32 storm interiors override via LOOKS / sky test views)
  SKY: {
    sky: { stops: [[-0.04, '#ffd892'], [0.06, '#ffb68a'], [0.3, '#8ea8e0'], [0.8, '#3f5cb0']],
      disk: { dir: [0.4, 0.08, -1], radius: 0.07, color: '#fff4d0', halo: 0.6, haloColor: '#ffc078', bloom: 1.0 }, brush: 1 },
    sun: { dir: [0.4, 0.18, -1], color: '#ffd8a8' }, ambient: '#8a86c4',
    key: { dir: [0.4, 0.4, -0.8], color: '#ffe4bc', tint: 0.2 }, shade: { tint: '#c0b4ff', mix: 0.3 }, rim: { dir: [0.4, 0.2, -1], amt: 1.2 },
    fog: '#f2c0a0', fogDensity: 0.0008, fogNear: 50, fogMax: 0.7, celFog: 0.25,
    mirror: { on: false },
    bloom: 1.05, exposure: 1.0, sat: 1.08, contrast: 0.12, lift: '#1a1838', gain: '#fff6ee', vignette: 0.16,
  },
  // merged on top of the set preset in *-UNDER shots: underwater grade on, no mirror, set fog mostly replaced by the grade
  UNDER: { under: 1, mirror: { on: false }, fogMax: 0.15, bloom: 1.0 },
};

const arr3 = (v) => (v.isVector3 ? v : new THREE.Vector3(...v));
// write the light keys of a look into the shared uniforms (main calls it before the department updates)
export function applyLights(look) {
  if (look.sun) { if (look.sun.dir) AU.uSunDir.value.copy(arr3(look.sun.dir)).normalize(); if (look.sun.color) AU.uSunColor.value.set(look.sun.color); }
  if (look.ambient) AU.uAmbient.value.set(look.ambient);
  if (look.key) setKey({ dir: look.key.dir ? arr3(look.key.dir).clone().normalize() : undefined, pos: look.key.pos ? arr3(look.key.pos) : undefined, color: look.key.color, tint: look.key.tint });
  if (look.shade) { if (look.shade.tint) AU.uShadeTint.value.set(look.shade.tint); if (look.shade.mix !== undefined) AU.uShadeMix.value = look.shade.mix; }
  if (look.rim) { if (look.rim.dir) AU.uRimDir.value.copy(arr3(look.rim.dir)).normalize(); if (look.rim.amt !== undefined) AU.uRimAmt.value = look.rim.amt; }
  if (look.wind) { AU.uWind.value.x = look.wind[0]; AU.uWind.value.y = look.wind[1]; }
}
