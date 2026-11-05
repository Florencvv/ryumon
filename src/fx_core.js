// fx_core.js - dept WATER helpers: own-vertex-shader materials that honour the anime MRT contract
// (location 0: colour rgb + emissive in a | location 1: view normal xy, view depth, id), event registry, rng.
// Every FX here uses hard discard edges (no blending: blending would corrupt the data target).
import * as THREE from 'three';
import { AU } from './anime/post.js';
export const CLIP = AU.uClip ?? { value: new THREE.Vector2() };

export const OUT = /* glsl */ `
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oData;
uniform vec2 uClip;   // engine MIRROR pass: discard below the mirror plane while the reflection renders
void clipBelow(float y){ if(uClip.x > 0.5 && y < uClip.y) discard; }
void writeOut(vec3 c, float emis, vec3 nV, float depth, float id){ oColor = vec4(c, emis); oData = vec4(nV.xy * 0.5 + 0.5, depth, id); }
`;

// fxShader({uniforms, vs, fs, side, defines, polygonOffset}) - GLSL3 ShaderMaterial; fs must call writeOut(...)
export function fxShader(o) {
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: { uClip: CLIP, ...(o.uniforms ?? {}) }, vertexShader: o.vs, fragmentShader: o.fs,
    side: o.side ?? THREE.DoubleSide, defines: o.defines ?? {}, transparent: false, depthWrite: o.depthWrite ?? true,
  });
  if (o.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = o.polygonOffset; m.polygonOffsetUnits = o.polygonOffset; }
  m.name = o.name ?? 'water_fx';
  return m;
}

// camera-facing instanced quads: attributes aC (centre, world), aS (seed vec4); the vs computes everything from uT
export function quadPool(n, attrs = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  for (const [k, [size, arr]] of Object.entries(attrs)) g.setAttribute(k, new THREE.InstancedBufferAttribute(arr ?? new Float32Array(n * size), size));
  g.instanceCount = n;
  return g;
}

export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const V3 = (v, d = [0, 0, 0]) => {
  if (!v) return new THREE.Vector3(...d);
  if (v.isVector3) return v.clone();
  if (v.isObject3D) return v.getWorldPosition(new THREE.Vector3());
  if (Array.isArray(v)) return new THREE.Vector3(v[0], v[1], v[2]);
  return new THREE.Vector3(v.x ?? 0, v.y ?? 0, v.z ?? 0);
};

// Event registry: events are keyed (kind, t0, key) so calling the same API every frame is idempotent; the latest
// call's options win (lets callers update `at` each frame). active(kind, t, set) returns live events at time t.
export class Events {
  constructor() { this.map = new Map(); }
  add(kind, t0, data) {
    const k = `${kind}|${(+t0).toFixed(4)}|${data.key ?? ''}`;
    const e = this.map.get(k);
    if (e) { Object.assign(e, data); return e; }
    const n = { kind, t0: +t0, ...data };
    this.map.set(k, n);
    return n;
  }
  active(kind, t, set, life) {
    const out = [];
    for (const e of this.map.values()) {
      if (e.kind !== kind) continue;
      if (e.set && set && e.set !== set) continue;
      const L = e.life ?? life;
      if (t >= e.t0 - 1e-6 && t < e.t0 + L) out.push(e);
    }
    out.sort((a, b) => b.t0 - a.t0);
    return out;
  }
}

// GLSL: billboard expansion in view space (centre c, half size s, optional screen-space rotation r)
export const BILL = /* glsl */ `
vec4 billboard(vec3 c, vec2 s, float r, vec2 corner, out float depth){
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float cs = cos(r), sn = sin(r);
  vec2 q = vec2(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs);
  mv.xy += q * s;
  depth = -mv.z;
  return projectionMatrix * mv;
}
// ribbon segment from a to b with half width w (world), facing the camera
vec4 ribbon(vec3 a, vec3 b, float w, vec2 corner, out float depth){
  vec4 A = viewMatrix * vec4(a, 1.0), B = viewMatrix * vec4(b, 1.0);
  vec2 d = B.xy - A.xy; float L = length(d); d = L > 1e-6 ? d / L : vec2(0.0, 1.0);
  vec2 nrm = vec2(-d.y, d.x);
  vec4 P = mix(A, B, corner.y * 0.5 + 0.5);
  P.xy += nrm * corner.x * w;
  depth = -P.z;
  return projectionMatrix * P;
}
`;
