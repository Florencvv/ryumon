// vale_sky.js - painted skies for the VALE sets: brushed 5-stop gradient, warm horizon glow around the sun azimuth, sun disk +
// halo + sky rays, and up to 3 painted cloud layers drawn in the shader (cel-banded shade / mid / lit with a lit rim on the
// sun side and a silver lining near the sun). Mesh name 'vale_sky' (main.js drops the look.js preset sky for that set).
// SKIES[name] = { stops: [[sinElev, colour] x5], sun: [x, y, z], disk, halo, haloColor, glow, glowColor, glowW, rays, rayColor,
//   layers: [{type: 'cum' | 'streak' | 'plane', base, height, freq, cover, stretch, seed, soft, lit, mid, shade, rim}] }
import { THREE, A, V3 } from './vale_lib.js';

const FS = /* glsl */ `
${A.GLSL.NOISE}
${A.GLSL.GLOBAL_PARS}
uniform vec3 uSC[5]; uniform float uSH[5];
uniform vec3 uSun, uDiskC, uHaloC, uGlowC, uRayC; uniform float uDiskR, uHalo, uGlow, uGlowW, uRays, uBrush, uDiskE;
uniform vec4 uL[3], uL2[3]; uniform vec3 uLit[3], uMid[3], uShd[3], uRim[3];
const float PI = 3.14159265;
float hs(float i, float s){ return hash12(vec2(i * 1.731 + s * 7.13, s * 3.17 + i * 0.19)); }
float hs2(vec2 i, float s){ return hash12(i * vec2(1.731, 2.417) + s * 7.13); }
// one billowed puff cluster: up to 6 round puffs around a tower / cluster centre; returns density (> 0 inside, in units of R)
// and the normal of the dominant puff (billow lighting)
void puffs(vec2 p, vec2 c, float R, float sd, inout float best, inout vec2 bn){
  for(int j = 0; j < 6; j++){
    float fj = float(j);
    vec2 o = j == 0 ? vec2(0.0, 0.12) : j == 1 ? vec2(-0.72, 0.0) : j == 2 ? vec2(0.74, -0.02) : j == 3 ? vec2(-0.3, 0.62) : j == 4 ? vec2(0.32, 0.58) : vec2(0.02, 1.02);
    float r = j == 0 ? 0.78 : j == 1 ? 0.5 : j == 2 ? 0.46 : j == 3 ? 0.48 : j == 4 ? 0.52 : 0.36;
    o += (vec2(hs(fj, sd), hs(fj + 9.0, sd)) - 0.5) * 0.3; r *= 0.85 + 0.3 * hs(fj + 3.0, sd);
    vec2 q = p - (c + o * R); float dd = (r * R - length(q)) / R;
    best = max(best, dd);
    // soft-weighted billow normal (smooth across puff seams) + the cluster's mass normal
    float w = exp(clamp(dd, -0.6, 0.6) * 9.0);
    vec2 m = (p - c - vec2(0.0, 0.4 * R)) / R;
    bn += w * (q / max(length(q), 1e-4) * 0.45 + m * 0.8);
  }
}
// cloud layer i at direction d -> (density > 0 inside, billow light -1..1); angle space wraps seamlessly around the horizon
vec2 cloud(int i, vec3 d, vec3 sn){
  vec4 L = uL[i], M = uL2[i];
  float az = atan(d.x, -d.z), e = asin(clamp(d.y, -1.0, 1.0));
  float saz = atan(sn.x, -sn.z), se = asin(clamp(sn.y, -1.0, 1.0));
  float best = -9.0; vec2 bn = vec2(0.0);
  if(M.x < 0.5){   // cumulus bank: towers of round billows standing on a flat base at elevation L.x
    float N = max(3.0, floor(L.z * 6.0 + 0.5)), cellA = 6.2831853 / N;
    float u = (az + 3.14159265) / cellA, y = (e - L.x) / cellA;
    for(int k = -2; k <= 2; k++){
      float ci = floor(u) + float(k), iw = mod(ci, N);
      if(hs(iw, M.z) < L.w) continue;
      float R = (0.35 + 0.65 * hs(iw, M.z + 1.0)) * L.y / cellA * 0.55;
      puffs(vec2(u, y), vec2(ci + hs(iw, M.z + 2.0), R * 0.5), R, iw + M.z * 13.0, best, bn);
    }
    best += (vnoise(vec2(u, y) * 31.0) - 0.5) * 0.06;
    best = min(best, y * 3.0 + (vnoise(vec2(u * 9.0, 2.0)) - 0.5) * 0.12);
    vec2 sd = vec2(mod(saz - az + 3.14159265, 6.2831853) - 3.14159265, se - e);
    return vec2(best, dot(normalize(bn + vec2(0.0, 1e-4)), normalize(sd + vec2(0.0, 0.25))));
  } else if(M.x < 1.5){   // streaks: long thin stratus bands inside [L.x, L.x + L.y]
    vec2 cs = vec2(cos(az), sin(az)) * L.z;
    float y = (e - L.x) / L.y;
    float band = smoothstep(0.0, 0.3, y) * smoothstep(1.0, 0.6, y);
    float n = fbm3(vec3(cs * 1.4, e * M.y + M.z)) + (vnoise3(vec3(cs * 5.0, e * M.y * 2.2 + M.z)) - 0.5) * 0.2;
    float dd = (n - L.w) * 2.2 * band - (1.0 - band) * 0.3;
    float n2 = fbm3(vec3(cs * 1.4, (e - 0.006) * M.y + M.z));
    return vec2(dd, clamp((n - n2) * 14.0 * sign(se - e + 0.001) * -1.0 + 0.25, -1.0, 1.0));
  }
  // deck: puffy cumulus clusters on a high plane seen in perspective, fading toward the horizon
  vec2 q = d.xz / max(d.y, 0.03) * L.z;
  vec2 cq = floor(q);
  for(int a = -1; a <= 1; a++) for(int b = -1; b <= 1; b++){
    vec2 ci = cq + vec2(float(a), float(b));
    if(hs2(ci, M.z) < L.w) continue;
    float R = 0.28 + 0.2 * hs2(ci, M.z + 1.0);
    puffs(q, ci + 0.25 + 0.5 * vec2(hs2(ci, M.z + 2.0), hs2(ci, M.z + 3.0)), R, dot(ci, vec2(1.0, 7.0)) + M.z, best, bn);
  }
  best += (vnoise(q * 14.0) - 0.5) * 0.08;
  float fade = smoothstep(L.x, L.x + L.y, d.y);
  return vec2(best * fade - (1.0 - fade) * 0.2, dot(normalize(bn + vec2(0.0, 1e-4)), normalize(sn.xz + vec2(1e-4))) * 0.8 + 0.1);
}
void main(){
  vec3 d = normalize(vW - cameraPosition);
  float az = atan(d.x, -d.z);
  vec2 cs = vec2(cos(az), sin(az));
  float st1 = vnoise3(vec3(cs * 6.0, d.y * 90.0)), st2 = vnoise3(vec3(cs * 15.0 + 3.0, d.y * 230.0)), st3 = vnoise3(vec3(cs * 3.0 + 7.0, d.y * 40.0));
  float e = d.y + (fbm3(vec3(cs * 2.2, d.y * 9.0)) - 0.5) * 0.05 * uBrush + ((st1 - 0.5) * 0.02 + (st3 - 0.5) * 0.018) * uBrush;
  vec3 c = uSC[0];
  for(int i = 1; i < 5; i++) c = mix(c, uSC[i], smoothstep(uSH[i - 1], uSH[i], e));
  c *= 1.0 + ((st1 - 0.5) * 0.06 + (st2 - 0.5) * 0.045) * uBrush;
  vec3 sn = normalize(uSun);
  float saz = atan(sn.x, -sn.z), daz = abs(mod(az - saz + PI, 2.0 * PI) - PI);
  float ang = acos(clamp(dot(d, sn), -1.0, 1.0));
  // warm horizon glow around the sun azimuth (brushed)
  float g = exp(-daz * daz / (uGlowW * uGlowW)) * exp(-max(d.y - sn.y * 0.5, 0.0) * 6.0) * (0.85 + 0.3 * st3);
  c = mix(c, uGlowC, clamp(g * uGlow, 0.0, 1.0));
  // sky rays fanning from the sun (crepuscular)
  if(uRays > 0.0){
    vec3 t1 = normalize(cross(sn, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, sn);
    float ra = atan(dot(d, t2), dot(d, t1));
    float r = smoothstep(0.45, 0.8, vnoise(vec2(ra * 9.0, 1.0)) * 0.7 + vnoise(vec2(ra * 23.0, 5.0)) * 0.3);
    c += uRayC * r * uRays * exp(-ang * 2.2) * smoothstep(-0.02, 0.05, d.y);
  }
  // clouds (back to front: layer 2 is the highest): round billows lit from the sun side, a lit rim + silver lining near the sun
  float sunProx = exp(-ang * 3.0);
  for(int i = 2; i >= 0; i--){
    if(uL[i].y <= 0.0) continue;
    vec2 cl = cloud(i, d, sn);
    float d0 = cl.x;
    if(d0 < -0.02) continue;
    float soft = uL2[i].w;
    float a = smoothstep(0.0, soft, d0 + (st2 - 0.5) * 0.02);
    float lk = cl.y + (st1 - 0.5) * 0.3;
    vec3 cc = mix(uShd[i], uMid[i], smoothstep(-0.55, -0.1, lk));
    cc = mix(cc, uLit[i], smoothstep(0.12, 0.45, lk));
    cc *= 1.0 + ((st1 - 0.5) * 0.08 + (st2 - 0.5) * 0.05) * uBrush;
    float edge = 1.0 - smoothstep(soft * 0.6, soft * 3.0, d0);
    float rim = edge * clamp(smoothstep(0.1, 0.5, lk) + sunProx * 1.6, 0.0, 1.0);
    cc = mix(cc, uRim[i], rim * 0.9);
    c = mix(c, cc, a);
  }
  float emis = 0.0;
  if(uDiskR > 0.0){
    float aa = fwidth(ang) * 1.2;
    float disk = smoothstep(uDiskR + aa, uDiskR - aa, ang);
    float halo = uHalo * (exp(-ang / (uDiskR * 2.2)) * 0.7 + exp(-ang / (uDiskR * 9.0)) * 0.3) * (0.85 + 0.3 * st3);
    c += uHaloC * halo;
    c = mix(c, uDiskC, disk);
    emis = disk * uDiskE + halo * 0.15;
  }
  writeOut(c, emis, vec3(0.0, 0.0, 1.0), 10000.0, 0.0);
}
`;

const C3 = (h) => new THREE.Color(h);
const LT = { cum: 0, streak: 1, plane: 2 };
export const SKIES = {
  // autumn dawn: pink-gold sunrise glow low behind the maples, lavender-blue overhead, gold-lit stratus + rosy cumulus
  POND: {
    stops: [[-0.05, '#ffd7a0'], [0.05, '#f7b3a4'], [0.16, '#d6aac8'], [0.38, '#9aa2dc'], [0.85, '#6a86d0']],
    sun: [0.7, 0.085, -1], disk: 0.045, diskColor: '#fff4d6', halo: 0.75, haloColor: '#ffc890', glow: 0.95, glowColor: '#ffcf8e', glowW: 0.75,
    rays: 0.16, rayColor: '#ffe0b0',
    layers: [
      { type: 'streak', base: 0.03, height: 0.1, freq: 2.2, cover: 0.52, stretch: 34, seed: 3, soft: 0.05, lit: '#ffe4a8', mid: '#f6a6a0', shade: '#a68cc4', rim: '#fff4cc' },
      { type: 'cum', base: 0.035, height: 0.22, freq: 2.0, cover: 0.45, stretch: 2.0, seed: 11, soft: 0.04, lit: '#ffd8b0', mid: '#eea4ac', shade: '#9c8ac4', rim: '#fff0c8' },
      { type: 'plane', base: 0.03, height: 0.15, freq: 1.5, cover: 0.42, stretch: 1, seed: 5, soft: 0.05, lit: '#ffdcc0', mid: '#eab4c4', shade: '#a8a0d8', rim: '#fff4dc' },
    ] },
  // late morning in the bamboo: bright green-gold haze low, clear blue high, a few soft white cumulus with gold rims
  BAMBOO: {
    stops: [[-0.05, '#f6f2c4'], [0.08, '#e2f2c8'], [0.25, '#b6e0e6'], [0.5, '#86c2ee'], [0.9, '#5aa2e6']],
    sun: [0.3, 0.75, -0.5], disk: 0.05, diskColor: '#fffbe8', halo: 0.55, haloColor: '#fff4c0', glow: 0.25, glowColor: '#fff6c8', glowW: 1.2,
    rays: 0.0, rayColor: '#fff6d0',
    layers: [
      { type: 'cum', base: 0.02, height: 0.2, freq: 1.7, cover: 0.5, stretch: 2.2, seed: 21, soft: 0.04, lit: '#ffffff', mid: '#eef4f0', shade: '#a8c2d8', rim: '#fffbe0' },
      { type: 'plane', base: 0.04, height: 0.15, freq: 0.8, cover: 0.65, stretch: 1, seed: 7, soft: 0.06, lit: '#ffffff', mid: '#f0f6f4', shade: '#b4cce0', rim: '#fffce8' },
      { type: 'plane', base: 0.0, height: 0.0, freq: 1, cover: 1, stretch: 1, seed: 0, soft: 0.05, lit: '#ffffff', mid: '#ffffff', shade: '#ffffff', rim: '#ffffff' },
    ] },
  // late-afternoon gold over the canal town: warm low sun in the west, orange horizon to clear blue, towering painted cumulus
  TOWN: {
    stops: [[-0.05, '#ffc884'], [0.06, '#ffd6a2'], [0.2, '#c4cce6'], [0.45, '#86a8e0'], [0.9, '#4d72c4']],
    sun: [-0.8, 0.14, -0.6], disk: 0.05, diskColor: '#fff2cc', halo: 0.6, haloColor: '#ffc27a', glow: 0.9, glowColor: '#ffb870', glowW: 0.9,
    rays: 0.1, rayColor: '#ffd8a0',
    layers: [
      { type: 'cum', base: 0.01, height: 0.3, freq: 1.8, cover: 0.4, stretch: 2.0, seed: 31, soft: 0.035, lit: '#fff0d2', mid: '#f4c8a8', shade: '#9ea4d0', rim: '#fff8e4' },
      { type: 'streak', base: 0.16, height: 0.12, freq: 1.6, cover: 0.6, stretch: 26, seed: 8, soft: 0.05, lit: '#ffe6c4', mid: '#f0c4b0', shade: '#aab0dc', rim: '#fff4dc' },
      { type: 'plane', base: 0.04, height: 0.15, freq: 0.85, cover: 0.58, stretch: 1, seed: 13, soft: 0.06, lit: '#fff2dc', mid: '#f2d4c4', shade: '#a8b4e2', rim: '#fff8e8' },
    ] },
  // s12 horizon: orange sunset, the sun low on the left, violet-rose cloud undersides with fiery rims
  TOWN_HORIZON: {
    stops: [[-0.05, '#ffbc5a'], [0.05, '#ffa25a'], [0.16, '#f89a6e'], [0.36, '#d0909c'], [0.8, '#7a70b0']],
    sun: [-0.5, 0.045, -1], disk: 0.055, diskColor: '#fff0c0', halo: 0.9, haloColor: '#ffb060', glow: 1.0, glowColor: '#ffc070', glowW: 0.7,
    rays: 0.22, rayColor: '#ffd090',
    layers: [
      { type: 'streak', base: 0.015, height: 0.08, freq: 2.0, cover: 0.5, stretch: 40, seed: 41, soft: 0.05, lit: '#ffdc8a', mid: '#f08a6a', shade: '#8c6a9c', rim: '#fff0b0' },
      { type: 'cum', base: 0.05, height: 0.24, freq: 1.6, cover: 0.42, stretch: 2.0, seed: 43, soft: 0.035, lit: '#ffc888', mid: '#e8889a', shade: '#7e6aa4', rim: '#ffe8b0' },
      { type: 'plane', base: 0.03, height: 0.15, freq: 0.9, cover: 0.5, stretch: 1, seed: 47, soft: 0.06, lit: '#ffc8a0', mid: '#d88aa8', shade: '#7c74b4', rim: '#ffe4c0' },
    ] },
};

export function skyUniforms(p) {
  const u = {
    uSC: { value: p.stops.map((s) => C3(s[1])) }, uSH: { value: p.stops.map((s) => s[0]) },
    uSun: { value: V3(...p.sun).normalize() }, uDiskC: { value: C3(p.diskColor) }, uHaloC: { value: C3(p.haloColor) }, uGlowC: { value: C3(p.glowColor) },
    uRayC: { value: C3(p.rayColor) }, uDiskR: { value: p.disk }, uHalo: { value: p.halo }, uGlow: { value: p.glow }, uGlowW: { value: p.glowW },
    uRays: { value: p.rays }, uBrush: { value: 1 }, uDiskE: { value: 0.9 },
    uL: { value: [] }, uL2: { value: [] }, uLit: { value: [] }, uMid: { value: [] }, uShd: { value: [] }, uRim: { value: [] },
  };
  for (let i = 0; i < 3; i++) {
    const l = p.layers[i] ?? { type: 'plane', base: 0, height: 0, freq: 1, cover: 1, stretch: 1, seed: 0, soft: 0.05, lit: '#fff', mid: '#fff', shade: '#fff', rim: '#fff' };
    u.uL.value.push(new THREE.Vector4(l.base, l.height, l.freq, l.cover));
    u.uL2.value.push(new THREE.Vector4(LT[l.type], l.stretch, l.seed, l.soft));
    u.uLit.value.push(C3(l.lit)); u.uMid.value.push(C3(l.mid)); u.uShd.value.push(C3(l.shade)); u.uRim.value.push(C3(l.rim));
  }
  return u;
}
// valeSky(name) -> mesh (follows the camera, renderOrder -100); mesh.userData.use(name) switches preset in place
export function valeSky(name) {
  const m = A.animeShader(skyUniforms(SKIES[name]), FS, { side: THREE.BackSide });
  m.depthWrite = false;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), m);
  mesh.frustumCulled = false; mesh.renderOrder = -100; mesh.name = 'vale_sky';
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  let cur = name;
  mesh.userData.use = (n) => {
    if (!SKIES[n] || n === cur) return; cur = n;
    const u = skyUniforms(SKIES[n]);
    for (const k in u) {
      const dst = m.uniforms[k].value, src = u[k].value;
      if (Array.isArray(src)) src.forEach((v, i) => (dst[i].copy ? dst[i].copy(v) : (dst[i] = v)));
      else if (src && src.copy) dst.copy(src); else m.uniforms[k].value = src;
    }
  };
  mesh.userData.current = () => cur;
  return mesh;
}
