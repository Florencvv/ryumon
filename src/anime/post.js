// post.js - AnimePost: the anime look of the film (three r160, WebGL2).
// Pass chain, Kuwahara paint and ink ideas adapted from "sunshower" (MIT License, Copyright (c) 2026 Beyond Dev).
// Ids in the data target: 0 sky | 1-89 cel + ink | 90-99 cel FX (no ink) | 100+ painted bg (Kuwahara, no ink).
// Also: any frame size, MIRROR pass (layers), look.impact / speed / flash / under / memory (see README.md).
import * as THREE from 'three';

export const ID = { SKY: 0, CHAR: 1, CHAR_FX: 2, PROP: 10, CREATURE: 20, FX: 90, PAINT: 100, CLOUD: 105, FOLIAGE: 110, GROUND: 115, WATER: 120, STROKE: 125 };   // STROKE: painted near cards, light Kuwahara
export const onTwos = (t) => Math.floor(t * 12 + 1e-6) / 12;     // characters: drawings every 1/12 s
export const onThrees = (t) => Math.floor(t * 8 + 1e-6) / 8;     // effects: drawings every 1/8 s
const C3 = (c) => new THREE.Color(c);

// ------------------------------------------------------------ shared uniforms (one write updates every material)
export const AU = {
  uTime: { value: 0 },
  uKey: { value: new THREE.Vector4(0.45, 0.55, 0.7, 0) },      // xyz: dir toward the light (w 0) or point position (w 1)
  uKeyColor: { value: C3('#fff6ea') }, uKeyTint: { value: 0.1 },  // character key (anime cheat, independent of the sun)
  uShadeTint: { value: C3('#e4dcff') }, uShadeMix: { value: 0.25 },
  uRimDir: { value: new THREE.Vector3(-0.4, 0.5, -0.75).normalize() }, uRimAmt: { value: 1 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.5, -0.8).normalize() },  // painted world light
  uSunColor: { value: C3('#ffffff') }, uAmbient: { value: C3('#9b95c8') },
  uBlob: { value: new THREE.Vector4(0, 0, 0, 0) }, uBlobColor: { value: C3('#8a7fc0') },  // flat painted contact shadow (x, z, rx, rz)
  uWind: { value: new THREE.Vector4(1, 2.2, 0, 0) },   // painted cards: x amplitude, y speed, z time (write onTwos(t)), w unused
  // MIRROR pass (written by AnimePost.render): clip below the mirror plane in the reflection render, reflection sampling
  uClip: { value: new THREE.Vector2(0, 0) },            // x on, y plane height: writeOut discards non-sky fragments below y
  uReflectPass: { value: 0 },                           // 1 while the reflection camera renders (mirror materials discard)
  uReflect: { value: null }, uReflectVP: { value: new THREE.Matrix4() },
  uMirror: { value: new THREE.Vector4(0, 0, 1, 0) },     // on, y, strength, distort
  uMirror2: { value: new THREE.Vector4(0, 0, 0, 0) },    // rough, ripple time (onThrees), unused, unused
  uRipple: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },   // x, z, t0, speed (speed 0 = off)
  uRippleCol: { value: C3('#ffffff') },
};
export const LAYER = { MAIN_ONLY: 1, REFLECT_ONLY: 2 };   // main camera renders layers 0+1, reflection camera 0+2
// setLayer(obj, layer): put an object and all its children on exactly one layer (0 both views, 1 direct only, 2 reflection only)
export function setLayer(obj, layer) { obj.traverse((o) => o.layers.set(layer)); return obj; }
export function setKey({ dir, pos, color, tint } = {}) {
  if (dir) AU.uKey.value.set(...dir.clone().normalize().toArray(), 0);
  if (pos) AU.uKey.value.set(pos.x, pos.y, pos.z, 1);
  if (color) AU.uKeyColor.value.set(color);
  if (tint !== undefined) AU.uKeyTint.value = tint;
}

export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.-2.*f);
  float a = mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z); }
float fbm2(vec2 p){ float s = 0., a = .5; for(int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
float fbm3(vec3 p){ float s = 0., a = .5; for(int i = 0; i < 4; i++){ s += a*vnoise3(p); p = p*2.07 + vec3(1.7, 9.2, 4.1); a *= .5; } return s; }
`;

const GLOBAL_PARS = /* glsl */ `
uniform float uTime;
uniform vec4 uKey; uniform vec3 uKeyColor; uniform float uKeyTint;
uniform vec3 uShadeTint; uniform float uShadeMix;
uniform vec3 uRimDir; uniform float uRimAmt;
uniform vec3 uSunDir, uSunColor, uAmbient;
uniform vec4 uBlob; uniform vec3 uBlobColor;
uniform vec2 uClip; uniform float uReflectPass;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oData;
varying vec3 vW, vNW, vNV, vLocal, vColor, vNL;
varying float vDepth;
varying vec2 vUv;
// colour rgb + emissive amount in alpha (bloom mask); data = view normal xy, view depth, id
// (reflection render: everything but the sky below the mirror plane is clipped here)
void writeOut(vec3 c, float emis, vec3 nV, float depth, float id){
  if(uClip.x > 0.5 && id > 0.5 && vW.y < uClip.y) discard;
  oColor = vec4(c, emis); oData = vec4(nV.xy * 0.5 + 0.5, depth, id); }
float blobShadow(){
  if(uBlob.z <= 0.0) return 0.0;
  vec2 q = (vW.xz - uBlob.xy) / uBlob.zw;
  float d = length(q) + (vnoise(vW.xz * 9.0) - 0.5) * 0.12;
  return 1.0 - smoothstep(0.92, 1.0, d);
}
`;

// MIRROR sampling (materials with `mirror: true`, mirrorMaterial, or custom shaders: define MIRROR and add ${GLSL.MIRROR}
// after GLOBAL_PARS). mirrorSample(worldPos, distortMul) -> reflected colour; also sets mirrorEmis (reflected emissive,
// so neon / sun reflections bloom) and mirrorRing (drawn ripple ring lines 0..1). Reflection = half-res render of
// layers 0+2 by the camera mirrored about y = look.mirror.y, sampled at the projected point (screen space).
const MIRROR_PARS = /* glsl */ `
uniform sampler2D uReflect; uniform mat4 uReflectVP; uniform vec4 uMirror, uMirror2; uniform vec4 uRipple[8]; uniform vec3 uRippleCol;
float mirrorEmis = 0.0, mirrorRing = 0.0;
vec3 mirrorSample(vec3 wp, float dmul){
  vec2 xz = wp.xz, off = vec2(0.0); mirrorRing = 0.0;
  float T = uMirror2.y;
  for(int i = 0; i < 8; i++){
    vec4 r = uRipple[i];
    if(r.w <= 0.0) continue;
    float age = T - r.z; if(age < 0.0) continue;
    vec2 dv = xz - r.xy; float d = length(dv);
    float w = max(0.04, 0.09 * r.w);                       // ring width grows with speed
    float x = d - age * r.w;
    float fade = exp(-age * 0.5);
    float env = exp(-x * x / (w * w * 7.0)) * step(x, w * 1.5);
    float wave = sin(x / w * 2.4);
    off += dv / max(d, 1e-3) * wave * env * fade * 0.01 * dmul;
    mirrorRing = max(mirrorRing, smoothstep(0.7, 0.95, wave) * env * fade);
  }
  if(uMirror.w > 0.0){                                     // rain-broken: streaky wobble, stretched vertically on screen
    float n1 = vnoise(vec2(xz.x * 1.3, xz.y * 0.35) + T * 1.7) - 0.5;
    float n2 = vnoise(vec2(xz.x * 0.4 + 7.0, xz.y * 2.6) - T * 1.3) - 0.5;
    off += vec2(n1 * 0.006, n2 * 0.03) * uMirror.w * dmul;
  }
  vec4 p = uReflectVP * vec4(xz.x, uMirror.y, xz.y, 1.0);
  vec2 uv = p.xy / p.w * 0.5 + 0.5 + off;
  vec4 s = texture(uReflect, uv);
  if(uMirror2.x > 0.0){                                    // rough: vertical smear (wet street / ice)
    vec2 st = vec2(0.0, uMirror2.x * 0.012);
    s = s * 0.28 + (texture(uReflect, uv + st) + texture(uReflect, uv - st)) * 0.22 + (texture(uReflect, uv + st * 2.3) + texture(uReflect, uv - st * 2.3)) * 0.14;
  }
  mirrorEmis = s.a;
  return s.rgb;
}
`;

// one vertex shader for every anime material: morphs, skinning, instancing, vertex/instance colours
const VERT = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vW, vNW, vNV, vLocal, vColor, vNL;
varying float vDepth;
varying vec2 vUv;
#ifdef ANIME_CARD
uniform vec4 uWind; uniform float uSway;
#endif
void main(){
#ifdef ANIME_CARD
  // painted card: upright billboard around its instance origin (base or centre), sways from the top, drawn on twos via uWind.z
  mat4 IM = modelMatrix * instanceMatrix;
  vec3 o = (IM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float sx = length(IM[0].xyz), sy = length(IM[1].xyz);
  vec3 toC = cameraPosition - o; vec3 fwd = normalize(vec3(toC.x, 0.0, toC.z) + vec3(1e-5, 0.0, 0.0));
  vec3 rt = vec3(fwd.z, 0.0, -fwd.x);
  float ph = fract(sin(dot(o.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
  float sway = uWind.x * uSway * pow(uv.y, 1.5) * (sin(uWind.z * uWind.y + ph + o.x * 0.35) + 0.4 * sin(uWind.z * uWind.y * 2.3 + ph * 1.7));
  vec3 wp3 = o + rt * (position.x * sx + sway * sy) + vec3(0.0, position.y * sy, 0.0);
  vW = wp3; vLocal = position; vNL = vec3(0.0, 0.0, 1.0);
  vec4 mvc = viewMatrix * vec4(wp3, 1.0);
  vDepth = -mvc.z; vNV = vec3(0.0, 0.0, 1.0); vNW = fwd; vUv = uv;
  vColor = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
  #endif
  gl_Position = projectionMatrix * mvc;
#else
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  vNL = objectNormal;                     // bind-pose object normal: drawn plane lines stay glued to the body
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  vec4 lp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  #endif
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz;
  vLocal = lp.xyz * length(modelMatrix[0].xyz);
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  vNV = normalize(transformedNormal);
  vNW = normalize((vec4(vNV, 0.0) * viewMatrix).xyz);
  vUv = uv;
  vColor = vec3(1.0);
  #ifdef USE_COLOR
  vColor = color;
  #endif
  #ifdef USE_INSTANCING_COLOR
  vColor *= instanceColor;
  #endif
  gl_Position = projectionMatrix * mv;
#endif
}
`;

// animeShader(uniforms, fragmentShader, opts): custom material on the shared vertex shader; the fragment must
// start with ${NOISE}${GLOBAL_PARS} (exported as GLSL) and end with writeOut(colour, emissive, viewNormal, vDepth, id)
export const GLSL = { get NOISE() { return NOISE; }, get GLOBAL_PARS() { return GLOBAL_PARS; }, get MIRROR() { return MIRROR_PARS; } };
export function animeShader(uniforms, fs, o = {}) { return mkMat(uniforms, fs, o); }
function mkMat(uniforms, fs, o = {}) {
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: { ...AU, ...uniforms }, vertexShader: VERT, fragmentShader: fs,
    side: o.side ?? THREE.FrontSide, vertexColors: !!o.vertexColors, defines: { ...(o.defines ?? {}), ...(o.mirror ? { MIRROR: '' } : {}) },
  });
  if (o.mirror) m.userData.mirror = true;
  if (o.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
  return m;
}

// ------------------------------------------------------------ cel (characters, props, creatures)
const CEL_FS = /* glsl */ `
${NOISE}
${GLOBAL_PARS}
#ifdef MIRROR
${MIRROR_PARS}
#endif
uniform vec3 uMirTint; uniform float uMirAmt, uMirFres;
uniform vec3 uBase, uShade, uRimCol, uEmis, uHatchCol, uHiCol;
uniform float uId, uHi, uHiTh, uWob, uFlat, uEmisAmt, uUseMap, uHatch, uAmt, uRimTh, uBlobOn, uHiEdge, uPlanes, uFrontAxis, uDarkRim;
uniform sampler2D uMap, uMask;
void main(){
  vec3 N = normalize(vNW), NV = normalize(vNV);
  if(!gl_FrontFacing){ N = -N; NV = -NV; }
  vec3 base = uBase * vColor, shade = uShade * vColor;
  if(uUseMap > 0.5){ vec3 m = texture(uMap, vUv).rgb; base *= m; shade *= m; }
  if(uHatch > 0.5){
    // blush drawn as hatched strokes: a pink wash plus diagonal pencil strokes inside the kit's blush mask
    float a = texture(uMask, vUv).g * uAmt;
    if(a < 0.2) discard;
    float h = fract((vUv.x * 0.8 + vUv.y) * 7.0 + vnoise(vUv * 30.0) * 0.15);
    float stroke = step(h, 0.16 + 0.22 * smoothstep(0.2, 0.8, a));
    vec3 ratio = uShade / max(uBase, vec3(1e-3));
    base = mix(mix(uBase, uHatchCol, 0.45), uHatchCol * 0.78, stroke);
    shade = base * ratio;
  }
  vec3 c;
  if(uFlat > 0.5){
    c = base;
  } else {
    vec3 L = uKey.w > 0.5 ? normalize(uKey.xyz - vW) : normalize(uKey.xyz);
    float n = fbm3(vLocal * 3.5) * 2.0 - 1.0;                       // terminator wobble, glued to the object
    float ndl = dot(N, L) + n * 0.06 * uWob;
    float aa = max(fwidth(ndl), 1e-4);
    float lit = smoothstep(-aa, aa, ndl);
    vec3 litC = base * mix(vec3(1.0), uKeyColor, uKeyTint);
    vec3 shC = shade * mix(vec3(1.0), uShadeTint, uShadeMix);
    c = mix(shC, litC, lit);
    vec3 V = normalize(cameraPosition - vW);
    // one crisp highlight band
    float sp = dot(N, normalize(L + V)) + n * 0.02 * uWob;
    float aa2 = max(fwidth(sp), 1e-4);
    float hi = smoothstep(uHiTh - aa2, uHiTh + aa2, sp) * lit;
    hi *= mix(1.0, smoothstep(0.32, 0.36, 1.0 - max(dot(N, V), 0.0)), uHiEdge);   // edge-only band (flat faces stay clean)
    c = mix(c, mix(litC, uHiCol, 0.5), hi * uHi);
    // thin rim light on the dark side
    float fres = 1.0 - max(dot(N, V), 0.0) + n * 0.03;
    float aa3 = max(fwidth(fres), 1e-4);
    float rim = smoothstep(uRimTh - aa3, uRimTh + aa3, fres) * max(smoothstep(-0.05, 0.2, dot(N, normalize(uRimDir))) * (1.0 - lit * 0.8), uDarkRim * (1.0 - lit));
    c = mix(c, uRimCol, rim * uRimAmt);
    if(uBlobOn > 0.5) c = mix(c, c * uBlobColor, blobShadow());
  }
  c += uEmis * uEmisAmt;
  float emisOut = clamp(uEmisAmt, 0.0, 4.0);
#ifdef MIRROR
  if(uReflectPass > 0.5) discard;
  { vec3 Vm = normalize(cameraPosition - vW); float fr = mix(uMirFres, 1.0, pow(1.0 - abs(dot(N, Vm)), 3.0));
    float on = uMirror.x * uMirror.z * uMirAmt * fr;
    c = mix(c, mirrorSample(vW, 1.0) * uMirTint, on); c = mix(c, uRippleCol, mirrorRing * 0.85 * uMirror.x); emisOut = max(emisOut, mirrorEmis * on); }
#endif
  // drawn plane lines: the dominant object-space axis of the bind normal goes into the id fraction (front 0, others .15/.3);
  // the ink pass draws an interior line where it changes (middle of each bevel, where front/side/top planes meet)
  float idOut = uId;
  if(uPlanes > 0.5){ vec3 a = abs(vNL); float ax = (a.x >= a.y && a.x >= a.z) ? 0.0 : (a.y >= a.z ? 1.0 : 2.0);
    idOut += mod(ax - uFrontAxis + 3.0, 3.0) * 0.15; }
  writeOut(c, emisOut, NV, vDepth, idOut);
}
`;
// mirror option shared by celMaterial / paintedMaterial: {mirror: true, mirrorAmount 0..1, mirrorFresnel (reflectance
// looking straight down, 0..1), mirrorTint (multiplier on the reflection)}
function mirUniforms(o) {
  return { uMirTint: { value: C3(o.mirrorTint ?? '#ffffff') }, uMirAmt: { value: o.mirrorAmount ?? 1 }, uMirFres: { value: o.mirrorFresnel ?? 0.6 } };
}
// celMaterial({base, shade, rimColor, id, highlight, hiSize, hiColor, wobble, flat, emissive, emissiveAmt, map, rimWidth, mirror...})
export function celMaterial(o = {}) {
  const base = C3(o.base ?? '#cccccc');
  const shade = o.shade ? C3(o.shade) : autoShade(base);
  const m = mkMat({
    uBase: { value: base }, uShade: { value: shade }, uRimCol: { value: C3(o.rimColor ?? '#ffe7c4') },
    uHiCol: { value: C3(o.hiColor ?? '#fffaf0') }, uId: { value: o.id ?? ID.PROP }, uHi: { value: o.highlight ?? 0.5 }, uHiTh: { value: o.hiSize ?? 0.965 },
    uWob: { value: o.wobble ?? 1 }, uFlat: { value: o.flat ? 1 : 0 }, uRimTh: { value: 1 - (o.rimWidth ?? 0.22) },
    uEmis: { value: C3(o.emissive ?? '#000000') }, uEmisAmt: { value: o.emissiveAmt ?? 0 },
    uMap: { value: o.map ?? null }, uUseMap: { value: o.map ? 1 : 0 },
    uHatch: { value: o.hatch ? 1 : 0 }, uMask: { value: o.mask ?? null }, uHatchCol: { value: C3(o.hatchColor ?? '#ee6f86') }, uAmt: { value: 1 },
    uBlobOn: { value: o.blob ? 1 : 0 }, uHiEdge: { value: o.hiEdge ?? 0 }, uPlanes: { value: o.planes ? 1 : 0 }, uFrontAxis: { value: o.frontAxis ?? 2 }, uDarkRim: { value: o.darkRim ?? 0 },
    ...mirUniforms(o),
  }, CEL_FS, o);
  m.name = 'anime_cel';
  return m;
}
// a cooler, darker hue of the base (lavender bias) for cels without an explicit shade colour
export function autoShade(base) {
  const hsl = {}; C3(base).getHSL(hsl, THREE.SRGBColorSpace);
  const lav = 0.72; let dh = lav - hsl.h; if (dh > 0.5) dh -= 1; if (dh < -0.5) dh += 1;
  return new THREE.Color().setHSL(hsl.h + dh * 0.12, hsl.s * 0.82, hsl.l * 0.74, THREE.SRGBColorSpace);
}

// ------------------------------------------------------------ painted (backgrounds, foliage, ground, clouds)
const PAINT_MAT_FS = /* glsl */ `
${NOISE}
${GLOBAL_PARS}
#ifdef MIRROR
${MIRROR_PARS}
#endif
uniform vec3 uMirTint; uniform float uMirAmt, uMirFres;
uniform vec3 uColor, uColor2, uShadeC, uRimCol, uEmis;
uniform float uId, uVarScale, uVarAmt, uLight, uBands, uUseShade, uRimAmt2, uRimTh, uEmisAmt, uUseMap, uBlobOn, uDab, uStroke, uRimTop, uStrokeScale;
uniform vec4 uMass; uniform vec3 uMassScale;
uniform sampler2D uMap;
void main(){
  vec3 N = normalize(vNW), NV = normalize(vNV);
  if(!gl_FrontFacing){ N = -N; NV = -NV; }
  if(uMass.w > 0.0){   // light the clump as one mass (cumulus, tree crowns), puffs only bend it
    vec3 mN = normalize((vW - uMass.xyz) * uMassScale);
    N = normalize(mix(N, mN, uMass.w));
    NV = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  }
  vec3 col = uColor * vColor;
  if(uUseMap > 0.5){ vec4 t = texture(uMap, vUv); if(t.a < 0.5) discard; col *= t.rgb; }
  float v = fbm3(vW * uVarScale);
  col = mix(col, uColor2 * vColor, smoothstep(0.32, 0.68, v) * uVarAmt);
  // dabs at two scales (value + hue) so the Kuwahara pass has something to turn into gouache strokes
  float fine = vnoise3(vW * uVarScale * 24.0 + 2.0);
  col = mix(col, uColor2 * vColor, smoothstep(0.55, 0.78, fine) * uVarAmt * 0.7);
  col *= 1.0 - uDab * 0.6 + uDab * (0.6 * vnoise3(vW * uVarScale * 7.0) + 0.6 * vnoise3(vW * uVarScale * 40.0 + 9.0));
  float strokeMul = 1.0, strokeHue = 0.0;
  if(uStroke > 0.0){   // long horizontal brush strokes (thin in y, long in xz): value + hue, the paint pass turns them into gouache
    vec3 p = vW * uStrokeScale;
    float s1 = vnoise3(vec3(p.x * 0.22, p.y * 3.2, p.z * 0.22));
    float s2 = vnoise3(vec3(p.x * 0.55 + 3.1, p.y * 8.0, p.z * 0.55 + 1.7));
    col = mix(col, uColor2 * vColor, smoothstep(0.58, 0.72, s2) * uStroke * 0.55);
    strokeMul = 1.0 + uStroke * ((s1 - 0.5) * 0.4 + (s2 - 0.5) * 0.25);
    strokeHue = (smoothstep(0.55, 0.75, s1) - smoothstep(0.25, 0.45, 1.0 - s2)) * uStroke;
  }
  float n = fbm3(vW * uVarScale * 2.3 + 4.0) - 0.5;
  float ndl = dot(N, normalize(uSunDir));
  float lit = uBands > 0.5 ? smoothstep(-0.03, 0.03, ndl + n * 0.5) : clamp(ndl * 0.6 + 0.5 + n * 0.25, 0.0, 1.0);
  lit = mix(1.0, lit, uLight);
  vec3 sh = uUseShade > 0.5 ? mix(uShadeC, uShadeC * col / max(uColor, vec3(1e-3)), 0.35) : col * uAmbient;
  vec3 c = mix(sh, col * uSunColor, lit);
  c *= strokeMul;                                                              // strokes show on lit AND shaded paint
  c = mix(c, c * vec3(1.06, 0.97, 1.05), clamp(strokeHue, -1.0, 1.0) * 0.5);
  if(uRimAmt2 > 0.0){
    vec3 V = normalize(cameraPosition - vW);
    float fres = 1.0 - max(dot(N, V), 0.0) + n * 0.25;
    float rim = smoothstep(uRimTh, uRimTh + 0.04, fres) * smoothstep(-0.25, 0.25, dot(N, normalize(uSunDir)) + n * 0.3);
    rim *= mix(1.0, smoothstep(-0.05, 0.3, N.y), uRimTop);                 // lit rim only along the top edge (clouds, hills)
    c = mix(c, uRimCol, rim * uRimAmt2);
  }
  if(uBlobOn > 0.5) c = mix(c, c * uBlobColor, blobShadow());
  c += uEmis * uEmisAmt;
  float emisOut = uEmisAmt;
#ifdef MIRROR
  if(uReflectPass > 0.5) discard;
  { vec3 Vm = normalize(cameraPosition - vW); float fr = mix(uMirFres, 1.0, pow(1.0 - abs(dot(N, Vm)), 3.0));
    float on = uMirror.x * uMirror.z * uMirAmt * fr;
    c = mix(c, mirrorSample(vW, 1.0) * uMirTint * strokeMul, on); c = mix(c, uRippleCol, mirrorRing * 0.85 * uMirror.x); emisOut = max(emisOut, mirrorEmis * on); }
#endif
  writeOut(c, emisOut, NV, vDepth, uId);
}
`;
// paintedMaterial({color, color2, shade, id, varScale, varAmt, dab, light, bands, rimColor, rim, rimWidth, emissive, emissiveAmt, map, vertexColors, blob,
//   mass: [cx, cy, cz, amount], massScale: [sx, sy, sz]})
export function paintedMaterial(o = {}) {
  const color = C3(o.color ?? '#88a070');
  const m = mkMat({
    uColor: { value: color }, uColor2: { value: C3(o.color2 ?? o.color ?? '#88a070') },
    uShadeC: { value: C3(o.shade ?? '#555577') }, uUseShade: { value: o.shade ? 1 : 0 },
    uRimCol: { value: C3(o.rimColor ?? '#fff0c8') }, uRimAmt2: { value: o.rim ?? 0 }, uRimTh: { value: 1 - (o.rimWidth ?? 0.25) },
    uId: { value: o.id ?? ID.PAINT }, uVarScale: { value: o.varScale ?? 0.15 }, uVarAmt: { value: o.varAmt ?? 0.6 }, uDab: { value: o.dab ?? 0.25 },
    uLight: { value: o.light ?? 1 }, uBands: { value: o.bands ? 1 : 0 },
    uEmis: { value: C3(o.emissive ?? '#000000') }, uEmisAmt: { value: o.emissiveAmt ?? 0 },
    uMap: { value: o.map ?? null }, uUseMap: { value: o.map ? 1 : 0 }, uBlobOn: { value: o.blob ? 1 : 0 },
    uStroke: { value: o.stroke ?? 0 }, uStrokeScale: { value: o.strokeScale ?? (o.varScale ?? 0.15) * 8 }, uRimTop: { value: o.rimTop ?? 0 },
    uMass: { value: new THREE.Vector4(...(o.mass ?? [0, 0, 0, 0])) }, uMassScale: { value: new THREE.Vector3(...(o.massScale ?? [1, 1, 1])) },
    ...mirUniforms(o),
  }, PAINT_MAT_FS, o);
  m.name = 'anime_painted';
  return m;
}

// ------------------------------------------------------------ FX (fireworks, sparks, lantern cores): unlit, blooms, no ink
const FX_FS = /* glsl */ `
${NOISE}
${GLOBAL_PARS}
uniform vec3 uColor; uniform float uInt, uEmisAmt, uId;
void main(){ writeOut(uColor * vColor * uInt, uEmisAmt, normalize(vNV), vDepth, uId); }
`;
export function fxMaterial(o = {}) {
  const m = mkMat({ uColor: { value: C3(o.color ?? '#ffffff') }, uInt: { value: o.intensity ?? 1.5 }, uEmisAmt: { value: o.bloom ?? 1 }, uId: { value: o.id ?? ID.FX } },
    FX_FS, { side: THREE.DoubleSide, ...o });
  m.name = 'anime_fx';
  return m;
}

// ------------------------------------------------------------ painted mirror surface (lake, wet street, puddles, ice)
const MIRROR_MAT_FS = /* glsl */ `
${NOISE}
${GLOBAL_PARS}
${MIRROR_PARS}
uniform vec3 uColor, uColor2, uTint, uFallback; uniform float uId, uAmt, uFres, uStroke, uStrokeScale, uDarken, uRing;
void main(){
  if(uReflectPass > 0.5) discard;
  vec3 N = normalize(vNW), NV = normalize(vNV);
  if(!gl_FrontFacing){ N = -N; NV = -NV; }
  vec3 V = normalize(cameraPosition - vW);
  float fr = mix(uFres, 1.0, pow(1.0 - abs(dot(N, V)), 3.0));          // Fresnel: grazing -> all sky, looking down -> base shows
  vec3 p = vW * uStrokeScale;
  float s1 = vnoise3(vec3(p.x * 0.12, p.y, p.z * 3.0)), s2 = vnoise3(vec3(p.x * 0.3 + 3.1, p.y, p.z * 7.0 + 1.7));
  vec3 base = mix(uColor, uColor2, smoothstep(0.35, 0.7, s1)) * vColor;
  bool live = uMirror.x > 0.5;
  vec3 refl = live ? mirrorSample(vW, 1.0) : uFallback;
  float on = clamp(uAmt * fr * (live ? uMirror.z : 1.0), 0.0, 1.0);
  vec3 c = mix(base, refl * uTint * (1.0 - uDarken), on);
  c *= 1.0 + ((s1 - 0.5) * 0.16 + (s2 - 0.5) * 0.1) * uStroke;          // long horizontal brush strokes (value + hue)
  c = mix(c, c * vec3(1.05, 0.98, 1.06), smoothstep(0.6, 0.8, s2) * uStroke * 0.5);
  c = mix(c, uRippleCol, mirrorRing * uRing * (live ? 1.0 : 0.0));
  writeOut(c, (live ? mirrorEmis * on : 0.0) + mirrorRing * 0.25, NV, vDepth, uId);
}
`;
// mirrorMaterial({color, color2 (base under the reflection, stroke variation), tint (multiplier on the reflection: slightly
//   cooler/darker reads as water), darken 0..1, amount 0..1, fresnel (reflectance looking straight down), stroke 0..1,
//   strokeScale (world freq, strokes are long in x), fallback (colour when look.mirror is off), ring 0..1 (ripple line
//   strength), id (120-124)}) - needs look.mirror.on for a live reflection; ripples from look.mirror.ripples
export function mirrorMaterial(o = {}) {
  const m = mkMat({
    uColor: { value: C3(o.color ?? '#3a4a7a') }, uColor2: { value: C3(o.color2 ?? o.color ?? '#46588a') },
    uTint: { value: C3(o.tint ?? '#d8dcf4') }, uFallback: { value: C3(o.fallback ?? '#8a90c0') },
    uId: { value: o.id ?? ID.WATER }, uAmt: { value: o.amount ?? 1 }, uFres: { value: o.fresnel ?? 0.7 },
    uStroke: { value: o.stroke ?? 0.6 }, uStrokeScale: { value: o.strokeScale ?? 0.5 }, uDarken: { value: o.darken ?? 0.06 }, uRing: { value: o.ring ?? 0.85 },
  }, MIRROR_MAT_FS, { ...o, mirror: false });
  m.userData.mirror = true; m.name = 'anime_mirror';
  return m;
}

// ------------------------------------------------------------ sky: painted gradient, brush noise, sun/moon disk + halo, stars
const SKY_FS = /* glsl */ `
${NOISE}
${GLOBAL_PARS}
uniform vec3 uC0, uC1, uC2, uC3; uniform vec4 uH;   // colours at elevations uH.x < uH.y < uH.z < uH.w (sin of elevation)
uniform vec3 uDiskDir, uDiskCol, uHaloCol; uniform float uDiskR, uHalo, uDiskEmis, uStars, uBrush, uMoon;
void main(){
  vec3 d = normalize(vW - cameraPosition);
  float az = atan(d.x, -d.z);
  float e = d.y + (fbm2(vec2(az * 2.2, d.y * 9.0)) - 0.5) * 0.06 * uBrush + (vnoise(vec2(az * 30.0, d.y * 160.0)) - 0.5) * 0.012 * uBrush;
  // painted: long horizontal brush strokes push the gradient around and vary value + hue
  float st1 = vnoise(vec2(az * 6.0, d.y * 90.0)), st2 = vnoise(vec2(az * 15.0 + 3.0, d.y * 230.0)), st3 = vnoise(vec2(az * 3.0 + 7.0, d.y * 40.0));
  e += ((st1 - 0.5) * 0.022 + (st3 - 0.5) * 0.02) * uBrush;
  vec3 c = mix(uC0, uC1, smoothstep(uH.x, uH.y, e));
  c = mix(c, uC2, smoothstep(uH.y, uH.z, e));
  c = mix(c, uC3, smoothstep(uH.z, uH.w, e));
  float big = fbm2(vec2(az * 1.3 + 2.0, d.y * 5.0));
  c *= 1.0 + ((st1 - 0.5) * 0.07 + (st2 - 0.5) * 0.05 + (smoothstep(0.62, 0.8, st2) * 0.04)) * uBrush;
  c = mix(c, c * vec3(1.07, 0.96, 1.05), clamp((big - 0.45) * 1.6, -0.6, 1.0) * uBrush * 0.6);
  // stars: sparse hard dots above the horizon glow
  if(uStars > 0.0){
    vec2 g = vec2(az * 160.0, d.y * 160.0);
    vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
    float h = hash12(cell);
    float s = step(0.985, h) * smoothstep(0.12, 0.05, length(f + (vec2(hash12(cell + 7.0), hash12(cell + 3.0)) - 0.5) * 0.6));
    c += vec3(1.0, 0.95, 0.88) * s * uStars * smoothstep(0.06, 0.3, d.y) * (0.5 + 0.5 * hash12(cell + 1.0));
  }
  float emis = 0.0;
  if(uDiskR > 0.0){
    float ang = acos(clamp(dot(d, normalize(uDiskDir)), -1.0, 1.0));
    float aa = fwidth(ang) * 1.2;
    float disk = smoothstep(uDiskR + aa, uDiskR - aa, ang);
    float halo = uHalo * (exp(-ang / (uDiskR * 2.2)) * 0.7 + exp(-ang / (uDiskR * 9.0)) * 0.3);
    halo *= 0.85 + 0.3 * vnoise(vec2(az * 40.0, d.y * 40.0));
    c += uHaloCol * halo;
    vec3 dc = uDiskCol;
    if(uMoon > 0.5){
      vec3 dd = d - normalize(uDiskDir);
      float mare = fbm2(dd.xy / uDiskR * 1.6 + 3.0);
      dc *= mix(1.0, 0.86, smoothstep(0.5, 0.62, mare));
    }
    c = mix(c, dc, disk);
    emis = disk * uDiskEmis;
  }
  writeOut(c, emis, vec3(0.0, 0.0, 1.0), 10000.0, 0.0);
}
`;
// skyDome({stops: [[elev, color] x4], disk: {dir, radius (rad), color, halo, haloColor, bloom, moon}, stars, brush})
export function skyDome(o = {}) {
  const st = o.stops ?? [[-0.05, '#e9a27a'], [0.08, '#7a6aa0'], [0.3, '#3a3f7a'], [0.8, '#1b2350']];
  const dk = o.disk ?? {};
  const m = mkMat({
    uC0: { value: C3(st[0][1]) }, uC1: { value: C3(st[1][1]) }, uC2: { value: C3(st[2][1]) }, uC3: { value: C3(st[3][1]) },
    uH: { value: new THREE.Vector4(st[0][0], st[1][0], st[2][0], st[3][0]) },
    uDiskDir: { value: (dk.dir ? (dk.dir.isVector3 ? dk.dir.clone() : new THREE.Vector3(...dk.dir)) : new THREE.Vector3(0, 0.2, -1)).normalize() }, uDiskR: { value: dk.radius ?? 0 },
    uDiskCol: { value: C3(dk.color ?? '#fff6dd') }, uHaloCol: { value: C3(dk.haloColor ?? dk.color ?? '#fff6dd') }, uHalo: { value: dk.halo ?? 0.3 },
    uDiskEmis: { value: dk.bloom ?? 0.6 }, uMoon: { value: dk.moon ? 1 : 0 }, uStars: { value: o.stars ?? 0 }, uBrush: { value: o.brush ?? 1 },
  }, SKY_FS, { side: THREE.BackSide });
  m.depthWrite = false;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), m);
  mesh.frustumCulled = false; mesh.renderOrder = -100; mesh.name = 'anime_sky';
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return mesh;
}

// updateSky(skyMesh, {stops, disk: {dir, radius, color, halo, haloColor, bloom, moon}, stars, brush}): retint a skyDome
// (colour script per shot); only the given keys change
export function updateSky(mesh, o = {}) {
  const u = mesh?.material?.uniforms; if (!u || !u.uC0) return mesh;
  if (o.stops) { o.stops.forEach((s, i) => u['uC' + i].value.set(s[1])); u.uH.value.set(o.stops[0][0], o.stops[1][0], o.stops[2][0], o.stops[3][0]); }
  const dk = o.disk;
  if (dk) {
    if (dk.dir) u.uDiskDir.value.set(...(dk.dir.isVector3 ? dk.dir.toArray() : dk.dir)).normalize();
    if (dk.radius !== undefined) u.uDiskR.value = dk.radius;
    if (dk.color) u.uDiskCol.value.set(dk.color);
    if (dk.haloColor || dk.color) u.uHaloCol.value.set(dk.haloColor ?? dk.color);
    if (dk.halo !== undefined) u.uHalo.value = dk.halo;
    if (dk.bloom !== undefined) u.uDiskEmis.value = dk.bloom;
    if (dk.moon !== undefined) u.uMoon.value = dk.moon ? 1 : 0;
  }
  if (o.stars !== undefined) u.uStars.value = o.stars;
  if (o.brush !== undefined) u.uBrush.value = o.brush;
  return mesh;
}

// ------------------------------------------------------------ colour helpers
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lin2srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
// invGrade(hexOnScreen, look, mul) -> linear THREE.Color: the material colour that displays as hex after mul (light tint) + FINAL_FS grade
export function invGrade(hex, look, mul = new THREE.Color(1, 1, 1), at = null) {   // at: screen uv of the subject (vignette)
  const L = { ...LOOK_DEFAULTS, ...look };
  const t = new THREE.Color(hex); t.convertLinearToSRGB();
  const lift = AnimePost.disp(new THREE.Color(), L.lift), gain = AnimePost.disp(new THREE.Color(), L.gain);
  let y = [t.r, t.g, t.b];
  const ld = 0.2126 * y[0] + 0.7152 * y[1] + 0.0722 * y[2], lw = Math.pow(1 - Math.min(Math.max(ld, 0), 1), 4);
  const vig = at ? 1 - L.vignette * ((at.x - 0.5) ** 2 + (at.y - 0.5) ** 2) * 1.6 : 1;
  y = y.map((v, i) => (v / vig - [lift.r, lift.g, lift.b][i] * lw) / [gain.r, gain.g, gain.b][i]);
  const k = L.contrast, ss = (x) => x * x * (3 - 2 * x);
  y = y.map((v) => { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (m + k * (ss(m) - m) < v) lo = m; else hi = m; } return (lo + hi) / 2; });
  let x = y.map(srgb2lin);
  const l = 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2];
  x = x.map((v) => l + (v - l) / L.sat);
  x = x.map((v, i) => Math.max(v / L.exposure / [mul.r, mul.g, mul.b][i], 0));
  return new THREE.Color(x[0], x[1], x[2]);
}
// ------------------------------------------------------------ painted cards (grass clumps, foliage dabs, far grass band)
// Canvas-painted brush strokes on upright billboard cards. Texture channels are DATA: r value (0 shadow .. 1 lit),
// g ink accent, b hue flag, a coverage. The card shader maps value through a 4-colour ramp (gouache bands).
// Instance colour is data too: r clump light (0..1), g hue shift, b cell (atlas column) + flip (see cardInstances).
const CARD_FS = /* glsl */ `
${NOISE}
${GLOBAL_PARS}
uniform sampler2D uMap; uniform vec3 uR0, uR1, uR2, uR3, uAlt, uInkC;
uniform float uId, uTexW, uCells, uBias, uSoft, uAltAmt, uBristle;
void main(){
  float cb = vColor.b * uCells; float cell = min(floor(cb), uCells - 1.0); float flip = step(0.5, fract(cb));
  vec2 uv = vec2(mix(vUv.x, 1.0 - vUv.x, flip), vUv.y);
  uv.x = (cell + 0.03 + uv.x * 0.94) / uCells;
  vec4 t = texture(uMap, uv);
  if(t.a < 0.5) discard;
  float br = vnoise(vec2(uv.x * uCells * 70.0, vUv.y * 6.0)) - 0.5;            // bristle streaks along the strokes
  float db = vnoise(vUv * 11.0 + vColor.r * 37.0) - 0.5;                      // broken paint patches
  float L = clamp(mix(vColor.r, t.r, uTexW) + uBias + (br + db * 0.8) * uBristle, 0.0, 1.0);
  float x = L * 3.0; float i = min(floor(x), 2.0); float f = smoothstep(0.5 - uSoft, 0.5 + uSoft, x - i);
  vec3 a = i < 0.5 ? uR0 : (i < 1.5 ? uR1 : uR2), b = i < 0.5 ? uR1 : (i < 1.5 ? uR2 : uR3);
  vec3 c = mix(a, b, f);
  c = mix(c, c * uAlt, clamp(t.b * uAltAmt + vColor.g, 0.0, 1.0));
  c = mix(c, uInkC, clamp(t.g, 0.0, 1.0));
  writeOut(c, 0.0, vec3(0.0, 0.0, 1.0), vDepth, uId);
}
`;
// cardMaterial({map, cells, ramp: [shadow, mid, lit, tip], alt (hue multiplier), altAmt, ink, id, texW, bias, soft, sway})
export function cardMaterial(o = {}) {
  const r = o.ramp ?? ['#2a3a5a', '#3f6a6a', '#7aa07a', '#cfe0a0'];
  const m = mkMat({
    uMap: { value: o.map }, uCells: { value: o.cells ?? 4 },
    uR0: { value: C3(r[0]) }, uR1: { value: C3(r[1]) }, uR2: { value: C3(r[2]) }, uR3: { value: C3(r[3]) },
    uAlt: { value: C3(o.alt ?? '#ffffff') }, uAltAmt: { value: o.altAmt ?? 0.7 }, uInkC: { value: C3(o.ink ?? '#2a1a26') },
    uId: { value: o.id ?? ID.FOLIAGE }, uTexW: { value: o.texW ?? 0.6 }, uBias: { value: o.bias ?? 0 }, uSoft: { value: o.soft ?? 0.18 },
    uSway: { value: o.sway ?? 0.04 }, uBristle: { value: o.bristle ?? 0.24 },
  }, CARD_FS, { side: THREE.DoubleSide, defines: { ANIME_CARD: '' } });
  m.name = 'anime_card';
  return m;
}
const _cm4 = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3(), _cc = new THREE.Color();
// cardInstances(mat, items, {base}) items: {pos, w, h, light, hue, cell, flip}; base true: card stands on pos, else centred
export function cardInstances(mat, items, o = {}) {
  const g = new THREE.PlaneGeometry(1, 1); if (o.base !== false) g.translate(0, 0.5, 0);
  const cells = mat.uniforms.uCells.value;
  const m = new THREE.InstancedMesh(g, mat, items.length);
  items.forEach((it, i) => {
    m.setMatrixAt(i, _cm4.compose(it.pos, _cq.identity(), _cs.set(it.w, it.h, 1)));
    m.setColorAt(i, _cc.setRGB(it.light ?? 0.5, it.hue ?? 0, ((it.cell ?? 0) + (it.flip ? 0.75 : 0.25)) / cells));
  });
  m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.frustumCulled = false; return m;
}
// foliageItems(rng, clumps, {sun, size}) clumps: [{c: V3, r: V3, n, light (offset)}] -> card items on each clump
// ellipsoid, lit top + cool underside from the clump normal (one mass, the dabs only break it up)
export function foliageItems(rng, clumps, o = {}) {
  const sun = (o.sun ?? new THREE.Vector3(0.3, 1, 0.3)).clone().normalize(), cells = o.cells ?? 4, out = [];
  for (const k of clumps) {
    const avg = (k.r.x + k.r.y + k.r.z) / 3;
    for (let i = 0; i < k.n; i++) {
      const y = rng() * 2 - 1, a = rng() * Math.PI * 2, q = Math.sqrt(1 - y * y);
      const d = new THREE.Vector3(Math.cos(a) * q, y, Math.sin(a) * q);
      const rr = 0.55 + 0.45 * Math.sqrt(rng());
      const pos = new THREE.Vector3(k.c.x + d.x * k.r.x * rr, k.c.y + d.y * k.r.y * rr, k.c.z + d.z * k.r.z * rr);
      const light = THREE.MathUtils.clamp(0.42 + 0.42 * d.dot(sun) + 0.18 * d.y + (k.light ?? 0) + (rng() - 0.5) * 0.16, 0.02, 0.98);
      const sz = avg * (o.size ?? 0.75) * (0.7 + 0.6 * rng());
      out.push({ pos, w: sz, h: sz, light, hue: rng() < 0.2 ? 0.35 * rng() : 0, cell: Math.floor(rng() * cells), flip: rng() < 0.5 });
    }
  }
  return out;
}

// canvas painters (data channels, see above) ------------------------------------------
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function dataTex(c) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; return t;
}
const rgb = (v, g, b) => `rgb(${Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
function mulb(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// one tapered, bent brush stroke from root to tip (quadratic), value gradient root -> tip; returns its left edge
function blade(x, root, ctrl, tip, w0, v0, v1, hue) {
  const L = [], R = [], n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const px = u * u * root[0] + 2 * u * t * ctrl[0] + t * t * tip[0], py = u * u * root[1] + 2 * u * t * ctrl[1] + t * t * tip[1];
    const dx = 2 * u * (ctrl[0] - root[0]) + 2 * t * (tip[0] - ctrl[0]), dy = 2 * u * (ctrl[1] - root[1]) + 2 * t * (tip[1] - ctrl[1]);
    const dl = Math.hypot(dx, dy) || 1, hw = w0 * 0.5 * Math.pow(1 - t, 0.85) + 0.35;
    L.push([px - dy / dl * hw, py + dx / dl * hw]); R.push([px + dy / dl * hw, py - dx / dl * hw]);
  }
  x.beginPath(); x.moveTo(...L[0]); for (const p of L) x.lineTo(...p); for (let i = R.length - 1; i >= 0; i--) x.lineTo(...R[i]); x.closePath();
  const g = x.createLinearGradient(root[0], root[1], tip[0], tip[1]);
  g.addColorStop(0, rgb(v0, 0, hue)); g.addColorStop(0.55, rgb(v0 + (v1 - v0) * 0.7, 0, hue)); g.addColorStop(1, rgb(v1, 0, hue));
  x.fillStyle = g; x.fill();
  return L;
}
function grassStrokes(x, rng, x0, w, h, n, near) {
  const S = [];
  for (let i = 0; i < n; i++) {
    const depth = rng();   // 0 back .. 1 front: back strokes darker, drawn first
    const rx = x0 + w / 2 + (rng() + rng() + rng() - 1.5) * w * 0.42, ry = h - 2 - rng() * h * 0.05;
    const H = h * (0.35 + 0.6 * rng() ** 0.8) * (near ? 1 : 0.92), lean = (rng() - 0.5) * 0.8 + (rx - x0 - w / 2) / w * 0.7;
    const tip = [rx + Math.sin(lean) * H, ry - Math.cos(lean) * H];
    const ctrl = [rx + Math.sin(lean) * H * 0.2 + (rng() - 0.5) * w * 0.05, ry - H * 0.55];
    S.push({ depth, root: [rx, ry], ctrl, tip, w0: ((near ? 10 : 8) + rng() * (near ? 8 : 7)) * h / 256 });
  }
  S.sort((a, b) => a.depth - b.depth);
  for (const s of S) {
    const k = 0.55 + 0.45 * s.depth, hue = rng() < 0.3 ? 1 : rng() * 0.3;
    const L = blade(x, s.root, s.ctrl, s.tip, s.w0, (0.04 + rng() * 0.14) * k, (0.6 + rng() * 0.4) * k, hue);
    if (rng() < 0.7) {   // lit tip: a narrower, lighter stroke over the upper part
      const mid = [(s.ctrl[0] + s.tip[0]) / 2, (s.ctrl[1] + s.tip[1]) / 2];
      blade(x, [s.ctrl[0] * 0.6 + s.root[0] * 0.4, s.ctrl[1] * 0.6 + s.root[1] * 0.4], mid, s.tip, s.w0 * 0.45, 0.5 * k, Math.min(1, (0.85 + rng() * 0.3) * k + 0.1), hue);
    }
    if (near && rng() < 0.45) {   // ink on one edge at the very tip
      x.strokeStyle = rgb(0.05, 1, 0); x.lineWidth = (1.0 + rng() * 0.5) * h / 256; x.lineCap = 'round';
      x.beginPath(); const st = 8 + Math.floor(rng() * 2); x.moveTo(...L[st]); for (let i = st; i < L.length; i++) x.lineTo(...L[i]); x.stroke();
    } else if (near && rng() < 0.08) {    // rare dark accent at the root
      x.strokeStyle = rgb(0.05, 1, 0); x.lineWidth = 1.2 * h / 256; x.beginPath(); x.moveTo(...L[0]); x.lineTo(...L[3]); x.stroke();
    }
  }
}
// grassAtlas({seed, cells, size, near}): clump cards, many tapered strokes per card, dark roots, lit tips
export function grassAtlas(o = {}) {
  const cells = o.cells ?? 4, w = o.size ?? 256, h = o.height ?? w, rng = mulb(o.seed ?? 1);
  const [c, x] = mkCanvas(w * cells, h);
  for (let i = 0; i < cells; i++) {
    x.save(); x.beginPath(); x.rect(i * w + 4, 0, w - 8, h); x.clip();
    grassStrokes(x, rng, i * w + w * 0.08, w * 0.84, h, o.near ? 14 + Math.floor(rng() * 6) : 26 + Math.floor(rng() * 10), !!o.near); x.restore();
  }
  return dataTex(c);
}
// bandAtlas({seed, cells, w, h}): far grass as a painted band, a long row of short strokes with a ragged top
export function bandAtlas(o = {}) {
  const cells = o.cells ?? 2, w = o.w ?? 1024, h = o.h ?? 128, rng = mulb(o.seed ?? 5);
  const [c, x] = mkCanvas(w * cells, h);
  for (let i = 0; i < cells; i++) {
    x.save(); x.beginPath(); x.rect(i * w + 4, 0, w - 8, h); x.clip();
    x.fillStyle = rgb(0.12, 0, 0); x.fillRect(i * w, h * 0.72, w, h);
    for (let k = 0; k < 9; k++) grassStrokes(x, rng, i * w + k * w / 9 - w * 0.03, w / 9 * 1.06, h, 26, false);
    x.restore();
  }
  return dataTex(c);
}
// foliageAtlas({seed, cells, size, kind: 'leaf' | 'pine'}): a clump of leaf dabs / needle fans, lit top, shadowed underside,
// a few ink accents, ragged silhouette
export function foliageAtlas(o = {}) {
  const cells = o.cells ?? 4, s = o.size ?? 256, rng = mulb(o.seed ?? 3), pine = o.kind === 'pine';
  const [c, x] = mkCanvas(s * cells, s);
  for (let i = 0; i < cells; i++) {
    x.save(); x.beginPath(); x.rect(i * s + 4, 4, s - 8, s - 8); x.clip();
    const cx = i * s + s / 2, cy = s / 2, rx = s * 0.34, ry = s * (pine ? 0.24 : 0.3), D = [];
    const n = pine ? 75 : 190;
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * (rng() < 0.12 ? 1.25 : 1);
      const px = cx + Math.cos(a) * rx * rr, py = cy + Math.sin(a) * ry * rr;
      const v = THREE.MathUtils.clamp(0.52 - 0.55 * (py - cy) / ry + (rng() - 0.5) * 0.32, 0.02, 1);
      D.push({ px, py, v, hue: rng() < 0.25 ? 1 : rng() * 0.25 });
    }
    D.sort((a, b) => a.v - b.v);   // shadow dabs first, lit dabs paint over them
    for (const d of D) {
      if (pine) {   // needle fan: thin strokes radiating from a twig point
        const m = 6 + Math.floor(rng() * 5), dir = -Math.PI / 2 + (rng() - 0.5) * 2.4, len = s * (0.06 + rng() * 0.05);
        x.strokeStyle = rgb(d.v, 0, d.hue); x.lineCap = 'round';
        for (let j = 0; j < m; j++) {
          const aa = dir + (j / (m - 1) - 0.5) * 1.9 + (rng() - 0.5) * 0.2, l = len * (0.7 + 0.3 * rng());
          x.lineWidth = s * (0.008 + rng() * 0.006); x.beginPath(); x.moveTo(d.px, d.py); x.lineTo(d.px + Math.cos(aa) * l, d.py + Math.sin(aa) * l); x.stroke();
        }
        x.fillStyle = rgb(d.v * 0.85, 0, d.hue); x.beginPath(); x.ellipse(d.px, d.py, len * 0.45, len * 0.28, dir + Math.PI / 2, 0, Math.PI * 2); x.fill();
      } else {      // leaf dab: a short pointed brush mark
        const ang = (rng() - 0.5) * 2.2 - 0.3, l = s * (0.04 + rng() * 0.035), wd = l * (0.4 + rng() * 0.2);
        x.fillStyle = rgb(d.v, 0, d.hue); x.beginPath(); x.ellipse(d.px, d.py, l, wd, ang, 0, Math.PI * 2); x.fill();
      }
    }
    for (let k = 0; k < 7; k++) {   // ink accents in the lower half: short curved twig / leaf-edge marks
      const px = cx + (rng() - 0.5) * rx * 1.6, py = cy + rng() * ry * 0.9, l = s * (0.025 + rng() * 0.03), a = rng() * Math.PI;
      x.strokeStyle = rgb(0.03, 1, 0); x.lineWidth = s * 0.007; x.lineCap = 'round';
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l, py - l * 0.3, px + Math.cos(a) * l * 1.6, py + Math.sin(a) * l * 0.4); x.stroke();
    }
    x.restore();
  }
  return dataTex(c);
}
// barkTexture({seed}): multiplier map for cel trunks, vertical painted bark strokes (wrap repeat)
export function barkTexture(o = {}) {
  const rng = mulb(o.seed ?? 9), w = 128, h = 256; const [c, x] = mkCanvas(w, h);
  x.fillStyle = '#e6e6e6'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const px = rng() * w, py = rng() * h, l = 30 + rng() * 90, v = rng() < 0.6 ? 0.5 + rng() * 0.2 : 0.95 + rng() * 0.05;
    x.strokeStyle = `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`; x.lineWidth = 2 + rng() * 5; x.lineCap = 'round';
    for (const oy of [0, -h]) { x.beginPath(); x.moveTo(px, py + oy); x.quadraticCurveTo(px + (rng() - 0.5) * 10, py + oy + l / 2, px + (rng() - 0.5) * 8, py + oy + l); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// ------------------------------------------------------------ post passes
const FS_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Paint: depth-aware 8-sector anisotropic Kuwahara on painted pixels only (adapted from sunshower, MIT)
const PAINT_FS = /* glsl */ `
uniform sampler2D tColor, tData;
uniform vec2 uRes; uniform float uRadius, uS, uFar, uFarMul;
varying vec2 vUv; out vec4 o;
${NOISE}
float painted(vec2 uv){ return step(99.5, texture(tData, uv).a); }
void main(){
  vec4 c0 = texture(tColor, vUv);
  vec4 d0 = texture(tData, vUv);
  if(d0.a < 99.5){ o = c0; return; }
  vec2 px = 1.0 / uRes;
  vec2 fc = gl_FragCoord.xy / uS;
  float ang = (fbm2(fc / 140.0) - 0.5) * 3.2 + 0.4;
  vec2 dA = vec2(cos(ang), sin(ang)), dB = vec2(-dA.y, dA.x);
  float rad = uRadius * mix(1.0, uFarMul, smoothstep(4.0, uFar, d0.b)) * uS;       // far layers paint with a bigger brush
  if(d0.a > 124.5 && d0.a < 129.5) rad *= 0.35;                                        // near stroke cards keep their drawn strokes
  else if(d0.a > 119.5 && d0.a < 124.5) rad *= 0.6;                                    // mirror / water: reflections keep their shapes
  vec3 m[8]; vec3 s[8]; float n[8];
  for(int k = 0; k < 8; k++){ m[k] = c0.rgb; s[k] = c0.rgb * c0.rgb; n[k] = 1.0; }
  for(int r = 1; r <= 3; r++){
    float rr = rad * float(r) / 3.0;
    for(int k = 0; k < 16; k++){
      float a = float(k) * 0.39269908 + (r == 2 ? 0.19634954 : 0.0);
      vec2 uv = vUv + (dA * cos(a) * 1.45 + dB * sin(a) * 0.8) * rr * px;
      float w = painted(uv);
      vec3 t = texture(tColor, uv).rgb;
      vec3 tc = t * w, tq = t * t * w;
      if(k / 2 * 2 == k){ int i0 = k / 2; m[i0] += tc; s[i0] += tq; n[i0] += w; }
      else { int i0 = (k - 1) / 2, i1 = ((k + 1) / 2) % 8;
        m[i0] += tc * 0.5; s[i0] += tq * 0.5; n[i0] += w * 0.5; m[i1] += tc * 0.5; s[i1] += tq * 0.5; n[i1] += w * 0.5; }
    }
  }
  vec3 acc = vec3(0.0); float wsum = 0.0;
  for(int k = 0; k < 8; k++){
    vec3 mu = m[k] / n[k];
    vec3 v = abs(s[k] / n[k] - mu * mu);
    float sd = sqrt(v.r + v.g + v.b) / max(dot(mu, vec3(0.33)) + 0.04, 0.05);   // relative, so dark night areas still paint
    float w = 1.0 / (1.0 + pow(sd * 6.0, 8.0));
    acc += mu * w; wsum += w;
  }
  vec3 col = wsum > 1e-5 ? acc / wsum : c0.rgb;
  mat2 R = mat2(dA.x, dA.y, dB.x, dB.y);
  vec2 sp = R * fc;
  float bristle = vnoise(vec2(sp.x / 22.0, sp.y / 1.8));
  float paper = vnoise(fc / 2.5) * 0.5 + vnoise(fc / 9.0) * 0.5;
  col *= 0.93 + 0.14 * bristle;
  col *= 0.98 + 0.04 * paper;
  o = vec4(col, c0.a);
}
`;

// Ink: warm lines on cel pixels from id / depth / normal edges, pressure noise, distance taper
const INK_FS = /* glsl */ `
uniform sampler2D tColor, tData;
uniform vec2 uRes; uniform float uS, uWidth, uSeed, uRef;
uniform vec3 uInk;
varying vec2 vUv; out vec4 o;
${NOISE}
bool inked(float id){ return id > 0.5 && id < 89.5; }
vec3 nrm(vec4 d){ vec2 xy = d.rg * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
// x: silhouette / id edge, y: interior crease
vec2 edgeAt(vec2 uv, vec4 dC, vec3 nC, float w){
  vec2 px = w / uRes; vec2 e = vec2(0.0);
  for(int k = 0; k < 8; k++){
    float a = float(k) * 0.78539816;
    vec4 dN = texture(tData, uv + vec2(cos(a), sin(a)) * px);
    bool cC = inked(dC.a), cN = inked(dN.a);
    if(!cC && !cN) continue;
    if(abs(dN.a - dC.a) > 0.5){
      float ee;
      if(cC && cN) ee = 1.0;
      else if(cC) ee = (dN.a < 0.5 || dC.b < dN.b) ? 1.0 : 0.0;   // cel in front of bg/sky
      else ee = (dC.a < 0.5 || dN.b < dC.b) ? 1.0 : 0.0;
      e.x = max(e.x, ee);
    } else {
      float rel = abs(dN.b - dC.b) / max(min(dN.b, dC.b), 0.01);
      e.x = max(e.x, smoothstep(0.03, 0.06, rel));
      e.y = max(e.y, smoothstep(0.75, 0.55, dot(nC, nrm(dN))));
      if(cC && cN && abs(dN.a - dC.a) > 0.07) e.y = 1.0;                    // plane line (cel id fraction changed)
    }
  }
  return e;
}
void main(){
  vec4 col = texture(tColor, vUv);
  vec4 dC = texture(tData, vUv);
  vec3 nC = nrm(dC);
  vec2 fc = gl_FragCoord.xy / uS;
  float press = 0.5 + 0.95 * vnoise(fc / 30.0 + uSeed * 7.0);                // pressure along the line
  float depth = inked(dC.a) ? dC.b : 1e4;
  float dist = clamp(pow(uRef / max(dC.b, 0.05), 0.6), 0.35, 1.35);         // thinner on far objects
  float w = uWidth * uS * press * dist;
  vec2 e1 = edgeAt(vUv, dC, nC, w);
  vec2 e2 = edgeAt(vUv, dC, nC, w * 0.5);
  float sil = 0.4 * e1.x + 0.75 * e2.x;                                     // soft outer fringe, solid core
  float crease = e2.y * 0.75;
  float alpha = max(sil, crease) * (0.86 + 0.14 * vnoise(fc / 5.0 + uSeed));
  vec3 ink = mix(uInk, col.rgb * 0.3, 0.22);
  o = vec4(mix(col.rgb, ink, clamp(alpha, 0.0, 1.0)), col.a * (1.0 - alpha));
}
`;

// Atmosphere: depth haze, painted glows, light shafts
const ATMOS_FS = /* glsl */ `
uniform sampler2D tColor, tData;
uniform vec2 uRes; uniform float uS, uAspect;
uniform vec3 uFog; uniform float uFogDen, uFogNear, uFogMax, uCelFog;
uniform vec4 uGlow[4]; uniform vec3 uGlowCol[4];
uniform vec2 uShaftUV; uniform float uShafts; uniform vec3 uShaftCol;
uniform float uUnder, uCaus, uRays, uUDen, uTime3; uniform vec3 uUCol, uUDeep, uUSurf;
uniform mat4 uInvProj, uCamWorld; uniform float uSurfY;   // dept WATER: world-space caustics under water
varying vec2 vUv; out vec4 o;
${NOISE}
// caustics (dept WATER): soft wavy lines = iso-contours of two domain-warped noise fields (no cells), redrawn on threes
float causNet(vec2 p, float t){
  vec2 q = p + vec2(vnoise(p * 0.33 + vec2(t * 0.18, 0.0)), vnoise(p * 0.33 + vec2(5.2, -t * 0.18))) * 2.2;
  float n1 = vnoise(q * 0.85 + vec2(0.0, t * 0.22)) * 3.0, n2 = vnoise(q * 1.35 + vec2(t * 0.17, 3.7)) * 2.5 + 0.3;
  float l1 = 1.0 - smoothstep(0.0, (fwidth(n1) * 1.2 + 0.035) * 1.6, abs(fract(n1) - 0.5));
  float l2 = 1.0 - smoothstep(0.0, (fwidth(n2) * 1.2 + 0.035) * 1.6, abs(fract(n2) - 0.5));
  return clamp(max(l1 * 0.85, l2 * 0.65) + l1 * l2 * 0.6, 0.0, 1.0);
}
void main(){
  vec4 c = texture(tColor, vUv);
  vec4 d = texture(tData, vUv);
  bool sky = d.a < 0.5;
  vec3 col = c.rgb;
  if(!sky){
    float f = (1.0 - exp(-max(d.b - uFogNear, 0.0) * uFogDen)) * uFogMax;
    if(d.a < 99.5) f *= uCelFog;
    col = mix(col, uFog, f);
  }
  vec2 fc = gl_FragCoord.xy / uS;
  float near = sky ? 1.0 : (d.a > 99.5 ? smoothstep(2.0, 40.0, d.b) * 0.8 + 0.2 : 0.1);
  for(int i = 0; i < 4; i++){
    vec4 g = uGlow[i];
    if(g.w <= 0.0) continue;
    float r = length((vUv - g.xy) * vec2(uAspect, 1.0)) / g.z;
    float br = 0.8 + 0.4 * fbm2(fc / 60.0 + float(i) * 13.0);
    float gl = (exp(-r * r * 3.0) * 0.65 + exp(-r * 1.6) * 0.35) * br;
    col += uGlowCol[i] * gl * g.w * near;
  }
  if(uShafts > 0.0){
    vec2 toS = uShaftUV - vUv; float L = length(toS); vec2 dir = toS / max(L, 1e-4);
    float span = min(L, 0.6), acc = 0.0;
    for(int i = 1; i <= 24; i++){
      vec2 uv = vUv + dir * span * (float(i) / 24.0);
      float s = (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ? 0.5 : (texture(tData, uv).a < 0.5 ? 1.0 : 0.0);
      acc += s;
    }
    acc /= 24.0;
    float ang = atan(toS.y, toS.x * uAspect);
    float rays = 0.55 + 0.45 * vnoise(vec2(ang * 18.0, 0.0));
    col += uShaftCol * acc * rays * uShafts * exp(-L * 2.2) * (sky ? 0.5 : (d.a > 99.5 ? 1.0 : 0.12));
  }
  if(uUnder > 0.0){   // underwater grade: depth tint, surface seen from below, caustics, god rays (FX on threes via uTime3)
    float dep = sky ? 80.0 : d.b;
    vec3 deepC = mix(uUDeep, uUCol, smoothstep(0.0, 1.0, vUv.y));
    float f = 1.0 - exp(-dep * uUDen);
    vec3 uc = mix(col * mix(vec3(1.0), uUCol * 1.6, 0.3), deepC, f);
    if(sky){ float rr = vnoise(fc / vec2(90.0, 30.0) + uTime3 * vec2(0.6, 0.2)); uc = mix(uUSurf, uUCol, 0.2 + 0.35 * rr); }
    if(!sky && !(d.a > 119.5 && d.a < 124.5)){
      // world-space caustics on up-facing surfaces (bottom, rocks, backs of fish), patchy, fading with depth below the surface
      vec4 rv = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 ray = rv.xyz / rv.w;
      vec3 vp = ray * (d.b / max(-ray.z, 1e-4));
      vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
      vec2 nxy = d.rg * 2.0 - 1.0; vec3 nv = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
      vec3 nw = normalize(mat3(uCamWorld) * nv);
      float below = max(uSurfY - wp.y, 0.0);
      float up = smoothstep(0.15, 0.7, nw.y);
      float patchy = smoothstep(0.4, 0.75, vnoise(wp.xz * 0.4 + uTime3 * 0.12));
      float cn = causNet(wp.xz * 1.7, uTime3) * (1.0 - smoothstep(4.0, 14.0, d.b)) * smoothstep(0.3, 0.6, vnoise(wp.xz * 3.0 + uTime3 * 0.5));
      uc += uUSurf * cn * up * (0.15 + 0.85 * patchy) * uCaus * exp(-below * 0.1) * (1.0 - f * 0.85) * 0.42;
    }
    float x = (vUv.x - 0.5) * uAspect + (1.0 - vUv.y) * 0.35;
    float ray = smoothstep(0.45, 1.0, vnoise(vec2(x * 7.0, uTime3 * 0.15))) * 0.7 + smoothstep(0.55, 1.0, vnoise(vec2(x * 17.0 + 3.0, uTime3 * 0.2))) * 0.4;
    uc += uUSurf * ray * uRays * pow(vUv.y, 1.6) * 0.35;
    col = mix(col, uc, clamp(uUnder, 0.0, 1.0));
  }
  o = vec4(col, c.a);
}
`;

const BRIGHT_FS = /* glsl */ `
uniform sampler2D tColor; uniform float uSoft; varying vec2 vUv; out vec4 o;
void main(){ vec4 c = texture(tColor, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  o = vec4(c.rgb * clamp(c.a, 0.0, 4.0) + c.rgb * smoothstep(0.3, 1.0, l) * uSoft, 1.0); }
`;
const BLUR_FS = /* glsl */ `
uniform sampler2D tColor; uniform vec2 uDir; varying vec2 vUv; out vec4 o;
void main(){
  vec3 s = texture(tColor, vUv).rgb * 0.227;
  s += (texture(tColor, vUv + uDir * 1.385).rgb + texture(tColor, vUv - uDir * 1.385).rgb) * 0.316;
  s += (texture(tColor, vUv + uDir * 3.231).rgb + texture(tColor, vUv - uDir * 3.231).rgb) * 0.070;
  o = vec4(s, 1.0);
}
`;
// Final: downsample, emissive bloom, anime grade, paper + film grain, light vignette, sRGB encode
const FINAL_FS = /* glsl */ `
uniform sampler2D tColor, tBloom1, tBloom2, tData;
uniform vec2 uRes; uniform float uS, uFrame, uBloom, uVignette, uGrain, uPaper, uExposure, uSat, uContrast, uFade;
uniform vec3 uLift, uGain, uFadeColor;
uniform float uAspect, uImpact, uFlash, uMemory, uSpeed, uSpeedMode, uT3;
uniform vec2 uSpeedC, uSpeedDir, uImpC; uniform vec3 uFlashCol, uMemCol, uSpeedCol, uInkI, uPaperI;
varying vec2 vUv; out vec4 o;
${NOISE}
vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 px = 1.0 / uRes;
  vec3 c;
  if(uS > 1.5){
    c = (texture(tColor, vUv + px * vec2(-0.5, -0.5)).rgb + texture(tColor, vUv + px * vec2(0.5, -0.5)).rgb +
         texture(tColor, vUv + px * vec2(-0.5, 0.5)).rgb + texture(tColor, vUv + px * vec2(0.5, 0.5)).rgb) * 0.25;
  } else c = texture(tColor, vUv).rgb;
  c += (texture(tBloom1, vUv).rgb * 0.6 + texture(tBloom2, vUv).rgb * 0.9) * uBloom;
  c = c * (1.0 + uFlash * 1.4) + uFlashCol * uFlash * 0.3;                // lightning brighten
  c *= uExposure;
  c = c / (1.0 + max(c - 0.9, 0.0) * 0.7);                     // soft shoulder for glows
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = toSRGB(c);
  c = mix(c, smoothstep(0.0, 1.0, c), uContrast);
  float ld = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = c * uGain + uLift * pow(1.0 - clamp(ld, 0.0, 1.0), 4.0);
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * dot(q, q) * 1.6;
  vec2 fc = gl_FragCoord.xy;
  c *= 1.0 - uPaper + uPaper * 2.0 * (0.5 * vnoise(fc / 3.0) + 0.5 * vnoise(fc / 11.0 + 5.0));   // static paper tooth
  c += (hash12(fc + uFrame * 17.31) - 0.5) * uGrain;                                            // film grain
  if(uMemory > 0.0){   // memory: warm, soft-edged, paper texture (soft bloom comes from the bright pass)
    c = mix(c, c * vec3(1.06, 1.0, 0.86) + vec3(0.05, 0.03, 0.0), uMemory);
    float rv = length(q * vec2(1.0, 1.15));
    c = mix(c, uMemCol, smoothstep(0.28, 0.72, rv) * uMemory * 0.85);
    c = mix(c, c * (0.9 + 0.2 * (0.5 * vnoise(fc / 2.0) + 0.5 * vnoise(fc / 7.0 + 3.0))), uMemory * 0.5);
  }
  if(uSpeed > 0.0){    // drawn speed lines: radial toward uSpeedC (mode 0) or parallel to uSpeedDir (mode 1), redrawn on threes
    vec2 pq = (vUv - uSpeedC) * vec2(uAspect, 1.0);
    float a, pos, N;
    if(uSpeedMode < 0.5){ a = atan(pq.y, pq.x) / 6.2831853 + 0.5; pos = length(pq); N = 200.0; }
    else { vec2 dr = normalize(uSpeedDir + 1e-5); vec2 pp = (vUv - 0.5) * vec2(uAspect, 1.0); a = dot(pp, vec2(-dr.y, dr.x)); pos = dot(pp, dr); N = 140.0; }
    float b = a * N, bi = floor(b), f = fract(b) - 0.5, sd = uT3 * 8.0;
    float h1 = hash12(vec2(bi, sd)), h2 = hash12(vec2(bi + 17.0, sd + 3.0)), h3 = hash12(vec2(bi + 41.0, sd + 7.0));
    float on = step(1.0 - 0.55 * min(uSpeed, 1.5), h1), line;
    if(uSpeedMode < 0.5){ float r0 = 0.22 + h2 * 0.35; float tp = smoothstep(r0, r0 + 0.25, pos); float w = 0.5 * tp * (0.4 + 0.6 * h3);
      line = on * tp * (1.0 - smoothstep(w * 0.7, w + 1e-4, abs(f))); }
    else { float s0 = h2 * 1.6 - 0.9, len = 0.3 + h3 * 0.7; float ins = smoothstep(s0, s0 + 0.08, pos) * (1.0 - smoothstep(s0 + len - 0.15, s0 + len, pos));
      float w = 0.35 * (0.4 + 0.6 * h3); line = on * ins * (1.0 - smoothstep(w * 0.7, w, abs(f))); }
    c = mix(c, uSpeedCol, clamp(line, 0.0, 1.0) * 0.9);
  }
  if(uImpact > 0.5){   // 1: inverted ink frame (paper + ink silhouettes + burst lines), 2: white flash (faint ink ghosts) [dept FX]
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec4 dI = texture(tData, vUv); float id = dI.a;
    bool shape = id > 0.5 && id < 89.5, fxs = id > 89.5 && id < 99.5;
    float n = (vnoise(fc / 4.0) - 0.5) * 0.08;
    // id / depth edges of the scene as ink lines (painted shapes and sky get outlines too)
    vec2 px = 1.0 / uRes * uS * 1.6; float edge = 0.0;
    for(int k = 0; k < 4; k++){ vec2 o2 = vec2(k == 0 ? px.x : (k == 1 ? -px.x : 0.0), k == 2 ? px.y : (k == 3 ? -px.y : 0.0));
      vec4 dn = texture(tData, vUv + o2);
      if(abs(dn.a - id) > 0.5 || abs(dn.b - dI.b) / max(min(dn.b, dI.b), 0.01) > 0.15) edge = 1.0; }
    if(uImpact < 1.5){
      float inkv;
      if(shape) inkv = lum > 0.86 + n ? 0.0 : 1.0;                        // characters / giant: solid ink, brightest rims stay paper
      else if(fxs) inkv = lum > 0.55 + n ? 0.0 : 1.0;                     // slashes / sparks: paper cores
      else {
        // background: paper, ink burst lines toward the impact centre, the sun disk as a hard ink circle
        vec2 pq = (vUv - uImpC) * vec2(uAspect, 1.0); float r = length(pq);
        float a = atan(pq.y, pq.x) / 6.2831853 * 120.0; float bi = floor(a), f = abs(fract(a) - 0.5);
        float h = hash12(vec2(bi, uFrame * 0.37)), h2 = hash12(vec2(bi + 9.0, uFrame * 0.37));
        float r0 = 0.12 + 0.35 * h2;
        float line = step(0.42, h) * step(f, 0.5 * (h - 0.42) * smoothstep(r0, r0 + 0.3, r)) * smoothstep(r0, r0 + 0.05, r);
        inkv = max(line, step(1.6, lum) * 0.0);
        inkv = max(inkv, edge * 0.85);
      }
      c = mix(uPaperI * (0.96 + 0.04 * vnoise(fc / 3.0)), uInkI, inkv);
    } else {
      c = mix(vec3(1.0, 0.995, 0.975), mix(c, vec3(1.0), 0.75), 0.25);
      c = mix(c, uInkI, edge * (shape ? 0.35 : 0.15));
    }
  }
  c = mix(c, uFadeColor, uFade);
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

function fsMat(fs, uniforms) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: FS_VERT, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
}

export const LOOK_DEFAULTS = {
  inkWidth: 2.2, inkColor: '#2a1a16', inkRef: 2.5, inkSeed: 0, paintRadius: 6.5, paintFar: 400, paintFarScale: 1.8,
  fog: '#9a9ac8', fogDensity: 0.002, fogNear: 6, fogMax: 0.85, celFog: 0.35,
  glows: [], shafts: 0, shaftPos: null, shaftColor: '#ffe2b0',
  bloom: 0.9, exposure: 1.0, sat: 1.06, contrast: 0.12, lift: '#000000', gain: '#ffffff',
  vignette: 0.16, grain: 0.025, paper: 0.02, fade: 0, fadeColor: '#000000', frame: 0,
  // engine additions: mirror, impact frames, speed lines, flash, under water, memory
  t: 0,                                   // film time in s (main sets it): ripples, under, speed lines redraw on threes
  mirror: null,                           // {on, y, strength, distort, ripples: [[x, z, t0, speed] x <= 8], rough, ringColor}
  impact: 0,                              // 0 | 1 inverted ink frame | 2 white flash (use for 1-2 frames)
  impactInk: '#1a1216', impactPaper: '#f7f2e8', impactCentre: null,   // impactCentre [u, v]: burst lines centre (default speed centre)
  speed: null,                            // number | {amount, centre: [u, v], color, mode: 'radial' | 'parallel', dir: [x, y]}
  flash: 0, flashColor: '#dfe8ff',        // lightning brighten 0..1
  under: 0,                               // false/true or 0..1: underwater grade
  underColor: '#2f9a92', underDeep: '#0f3f5c', underSurface: '#d8fff4', underDensity: 0.06, caustics: 0.6, godRays: 0.6, underY: 0,
  memory: 0, memoryColor: '#fff0d6',      // 0..1 warm soft vignette + paper + soft bloom
};

// new AnimePost(renderer, {W: 1920, H: 1040, S: 1|2}); post.render(scene, camera, look). Any frame size; S=2 renders
// W*S x H*S internally and downsamples in the final pass. The main camera renders layers 0+1, the mirror camera 0+2.
const _isObj = (v) => v && typeof v === 'object' && !Array.isArray(v) && !v.isVector3 && !v.isColor;
export class AnimePost {
  constructor(renderer, { W = 1920, H = 1080, S = 1 } = {}) {
    this.r = renderer; this.W = W; this.H = H; this.S = S;
    renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.autoClear = false;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the final pass encodes sRGB itself
    const IW = (this.IW = Math.round(W * S)), IH = (this.IH = Math.round(H * S));
    this.rtMain = new THREE.WebGLMultipleRenderTargets(IW, IH, 2, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtMain.texture[0].minFilter = this.rtMain.texture[0].magFilter = THREE.LinearFilter;
    // MIRROR: half-res reflection target (colour + data; every anime material writes 2 outputs)
    this.rtRefl = new THREE.WebGLMultipleRenderTargets(Math.round(IW / 2), Math.round(IH / 2), 2, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtRefl.texture[0].minFilter = this.rtRefl.texture[0].magFilter = THREE.LinearFilter;
    this.vcam = new THREE.PerspectiveCamera();
    this.dummy = new THREE.DataTexture(new Uint8Array([128, 128, 160, 0]), 1, 1); this.dummy.needsUpdate = true;
    AU.uReflect.value = this.dummy;
    const half = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(IW, IH, half);
    this.rtB = new THREE.WebGLRenderTarget(IW, IH, half);
    const bw = Math.round(IW / 4), bh = Math.round(IH / 4);
    this.rtBl = [0, 1, 2, 3].map((i) => new THREE.WebGLRenderTarget(i < 2 ? bw : bw >> 1, i < 2 ? bh : bh >> 1, half));
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
    this.qs = new THREE.Scene(); this.qs.add(this.quad); this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const res = new THREE.Vector2(IW, IH);
    this.mPaint = fsMat(PAINT_FS, { tColor: { value: null }, tData: { value: null }, uRes: { value: res }, uRadius: { value: 5 }, uS: { value: S }, uFar: { value: 400 }, uFarMul: { value: 1.8 } });
    this.mInk = fsMat(INK_FS, { tColor: { value: null }, tData: { value: null }, uRes: { value: res }, uS: { value: S }, uWidth: { value: 1.25 }, uSeed: { value: 0 }, uRef: { value: 2.5 }, uInk: { value: C3('#2a1a16') } });
    this.mAtmos = fsMat(ATMOS_FS, {
      tColor: { value: null }, tData: { value: null }, uRes: { value: res }, uS: { value: S }, uAspect: { value: W / H },
      uFog: { value: C3('#9a9ac8') }, uFogDen: { value: 0.002 }, uFogNear: { value: 6 }, uFogMax: { value: 0.85 }, uCelFog: { value: 0.35 },
      uGlow: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uGlowCol: { value: [0, 1, 2, 3].map(() => new THREE.Color()) },
      uShaftUV: { value: new THREE.Vector2() }, uShafts: { value: 0 }, uShaftCol: { value: C3('#ffe2b0') },
      uUnder: { value: 0 }, uCaus: { value: 0.6 }, uRays: { value: 0.6 }, uUDen: { value: 0.06 }, uTime3: { value: 0 },
      uUCol: { value: new THREE.Color() }, uUDeep: { value: new THREE.Color() }, uUSurf: { value: new THREE.Color() },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uSurfY: { value: 0 },
    });
    this.mBright = fsMat(BRIGHT_FS, { tColor: { value: null }, uSoft: { value: 0 } });
    this.mBlur = fsMat(BLUR_FS, { tColor: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mFinal = fsMat(FINAL_FS, {
      tColor: { value: null }, tBloom1: { value: null }, tBloom2: { value: null }, tData: { value: null }, uRes: { value: res }, uS: { value: S },
      uFrame: { value: 0 }, uBloom: { value: 0.9 }, uVignette: { value: 0.16 }, uGrain: { value: 0.025 }, uPaper: { value: 0.02 },
      uExposure: { value: 1 }, uSat: { value: 1.06 }, uContrast: { value: 0.12 }, uFade: { value: 0 },
      uLift: { value: new THREE.Color() }, uGain: { value: new THREE.Color(1, 1, 1) }, uFadeColor: { value: new THREE.Color() },
      uAspect: { value: W / H }, uImpact: { value: 0 }, uFlash: { value: 0 }, uMemory: { value: 0 }, uSpeed: { value: 0 }, uSpeedMode: { value: 0 }, uT3: { value: 0 },
      uSpeedC: { value: new THREE.Vector2(0.5, 0.5) }, uImpC: { value: new THREE.Vector2(0.5, 0.5) }, uSpeedDir: { value: new THREE.Vector2(1, 0) },
      uFlashCol: { value: new THREE.Color() }, uMemCol: { value: new THREE.Color() }, uSpeedCol: { value: new THREE.Color(1, 1, 1) },
      uInkI: { value: new THREE.Color() }, uPaperI: { value: new THREE.Color() },
    });
    this._v = new THREE.Vector3();
  }
  pass(m, target) { this.quad.material = m; this.r.setRenderTarget(target); this.r.render(this.qs, this.qc); }
  // display-space colour (no sRGB->linear conversion) for grade uniforms
  static disp(target, hex) { const c = new THREE.Color(hex); c.convertLinearToSRGB(); return target.copy(c); }
  // MIRROR pass: the camera mirrored about y renders layers 0+2 (clipped below y) into rtRefl; mirror materials sample it
  renderReflection(scene, cam, M, t) {
    const r = this.r, y = M.y ?? 0, vc = this.vcam;
    const pos = cam.getWorldPosition(new THREE.Vector3()), q = cam.getWorldQuaternion(new THREE.Quaternion());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    pos.y = 2 * y - pos.y; dir.y = -dir.y; up.y = -up.y;
    vc.fov = cam.fov; vc.aspect = cam.aspect; vc.near = cam.near; vc.far = cam.far; vc.zoom = cam.zoom ?? 1; vc.updateProjectionMatrix();
    vc.position.copy(pos); vc.up.copy(up); vc.lookAt(pos.clone().add(dir)); vc.updateMatrixWorld();
    vc.layers.mask = 1 | 4;
    AU.uReflectVP.value.multiplyMatrices(vc.projectionMatrix, vc.matrixWorldInverse);
    AU.uReflect.value = this.dummy; AU.uReflectPass.value = 1; AU.uClip.value.set(1, y - (M.clipBias ?? 0));
    r.setRenderTarget(this.rtRefl); r.setClearColor(0x000000, 0); r.clear(true, true, false);
    r.render(scene, vc);
    AU.uReflectPass.value = 0; AU.uClip.value.set(0, 0); AU.uReflect.value = this.rtRefl.texture[0];
    AU.uMirror.value.set(1, y, M.strength ?? 1, M.distort ?? 0);
    AU.uMirror2.value.set(M.rough ?? 0, onThrees(t), 0, 0);
    const rp = M.ripples ?? [];
    for (let i = 0; i < 8; i++) { const e = rp[i]; if (e) AU.uRipple.value[i].set(e[0], e[1], e[2], e[3] ?? 3); else AU.uRipple.value[i].set(0, 0, 0, 0); }
    AU.uRippleCol.value.set(M.ringColor ?? '#ffffff');
  }
  render(scene, cam, look = {}) {
    const L = { ...LOOK_DEFAULTS, ...look }, r = this.r;
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    cam.layers.enable(0); cam.layers.enable(1); cam.layers.disable(2);
    const M = L.mirror;
    if (M && M.on !== false && (M.strength ?? 1) > 0) this.renderReflection(scene, cam, M, L.t ?? 0);
    else { AU.uMirror.value.x = 0; AU.uReflect.value = this.dummy; }
    r.setRenderTarget(this.rtMain); r.setClearColor(0x000000, 0); r.clear(true, true, false);
    r.render(scene, cam);
    const data = this.rtMain.texture[1];
    const p = this.mPaint.uniforms;
    p.tColor.value = this.rtMain.texture[0]; p.tData.value = data; p.uRadius.value = L.paintRadius; p.uFar.value = L.paintFar; p.uFarMul.value = L.paintFarScale;
    this.pass(this.mPaint, this.rtA);
    const k = this.mInk.uniforms;
    k.tColor.value = this.rtA.texture; k.tData.value = data; k.uWidth.value = L.inkWidth; k.uSeed.value = L.inkSeed; k.uRef.value = L.inkRef; k.uInk.value.set(L.inkColor);
    this.pass(this.mInk, this.rtB);
    const a = this.mAtmos.uniforms;
    a.tColor.value = this.rtB.texture; a.tData.value = data;
    a.uFog.value.set(L.fog); a.uFogDen.value = L.fogDensity; a.uFogNear.value = L.fogNear; a.uFogMax.value = L.fogMax; a.uCelFog.value = L.celFog;
    for (let i = 0; i < 4; i++) {
      const g = L.glows[i];
      if (!g) { a.uGlow.value[i].set(0, 0, 1, 0); continue; }
      const sp = this._v.copy(g.pos).project(cam);
      a.uGlow.value[i].set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5, g.size ?? 0.2, sp.z < 1 ? (g.amount ?? 0.5) : 0);
      a.uGlowCol.value[i].set(g.color ?? '#ffffff');
    }
    a.uShafts.value = 0;
    if (L.shafts > 0 && L.shaftPos) {
      const sp = this._v.copy(L.shaftPos).project(cam);
      if (sp.z < 1) { a.uShaftUV.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5); a.uShafts.value = L.shafts; a.uShaftCol.value.set(L.shaftColor); }
    }
    const t3 = onThrees(L.t ?? 0);
    a.uUnder.value = L.under === true ? 1 : (+L.under || 0); a.uCaus.value = L.caustics; a.uRays.value = L.godRays; a.uUDen.value = L.underDensity; a.uTime3.value = t3;
    a.uUCol.value.set(L.underColor); a.uUDeep.value.set(L.underDeep); a.uUSurf.value.set(L.underSurface);
    a.uInvProj.value.copy(cam.projectionMatrixInverse); a.uCamWorld.value.copy(cam.matrixWorld); a.uSurfY.value = L.underY ?? 0;
    this.pass(this.mAtmos, this.rtA);
    this.mBright.uniforms.tColor.value = this.rtA.texture;
    this.mBright.uniforms.uSoft.value = (L.memory || 0) * 1.2 + (L.flash || 0) * 0.4 + (L.softBloom || 0);
    const [b0, b1, b2, b3] = this.rtBl;
    this.pass(this.mBright, b0);
    const blur = (src, dst, dx, dy) => { this.mBlur.uniforms.tColor.value = src.texture; this.mBlur.uniforms.uDir.value.set(dx / src.width, dy / src.height); this.pass(this.mBlur, dst); };
    blur(b0, b1, 1, 0); blur(b1, b0, 0, 1);
    blur(b0, b2, 1, 0); blur(b2, b3, 0, 1); blur(b3, b2, 2, 0); blur(b2, b3, 0, 2);
    const f = this.mFinal.uniforms;
    f.tColor.value = this.rtA.texture; f.tBloom1.value = b0.texture; f.tBloom2.value = b3.texture; f.tData.value = data;
    f.uFrame.value = L.frame; f.uBloom.value = L.bloom; f.uExposure.value = L.exposure; f.uSat.value = L.sat; f.uContrast.value = L.contrast;
    f.uVignette.value = L.vignette; f.uGrain.value = L.grain; f.uPaper.value = L.paper; f.uFade.value = L.fade;
    AnimePost.disp(f.uLift.value, L.lift); AnimePost.disp(f.uGain.value, L.gain); AnimePost.disp(f.uFadeColor.value, L.fadeColor);
    f.uImpact.value = L.impact || 0; f.uFlash.value = L.flash || 0; f.uMemory.value = L.memory || 0; f.uT3.value = t3;
    AnimePost.disp(f.uFlashCol.value, L.flashColor); AnimePost.disp(f.uMemCol.value, L.memoryColor);
    AnimePost.disp(f.uInkI.value, L.impactInk); AnimePost.disp(f.uPaperI.value, L.impactPaper);
    const sp = L.speed, so = _isObj(sp) ? sp : { amount: +sp || 0 };
    f.uSpeed.value = so.amount ?? 1; f.uSpeedMode.value = so.mode === 'parallel' ? 1 : 0;
    f.uSpeedC.value.set(...(so.centre ?? so.center ?? [0.5, 0.5])); f.uSpeedDir.value.set(...(so.dir ?? [1, 0]));
    AnimePost.disp(f.uSpeedCol.value, so.color ?? '#fffaf0');
    f.uImpC.value.set(...(L.impactCentre ?? so.centre ?? so.center ?? [0.5, 0.5]));
    r.setRenderTarget(null); r.setViewport(0, 0, this.W, this.H);
    this.quad.material = this.mFinal; r.render(this.qs, this.qc);
  }
}
