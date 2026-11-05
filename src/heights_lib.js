// heights_lib.js - dept HEIGHTS shared builders: JS noise, painted cliff walls, chiselled rocks, cliff pines,
// painted puff clouds, far mountain ranges, the HEIGHTS sky shader, time-of-day palettes. Pure code, seeded.
import * as THREE from 'three';
import * as A from './anime/post.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;

// ------------------------------------------------------------ value noise (deterministic)
function h3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = lerp(lerp(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), lerp(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v);
  const b = lerp(lerp(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), lerp(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v);
  return lerp(a, b, w);
}
export function fbm(x, y, z, oct = 4) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); n += a; x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; z = z * 2.03 + 4.1; a *= 0.5; }
  return s / n;
}
export function ridged(x, y, oct = 5) {   // sharp mountain ridges
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(noise3(x, y, 3.3 + i) * 2 - 1); s += a * v * v; n += a; x *= 2.07; y *= 2.07; a *= 0.5; }
  return s / n;
}

// ------------------------------------------------------------ geometry helpers
export function mergeGeos(list) {   // [{geo, matrix?, color?}] -> one indexed BufferGeometry with position/normal/uv/color
  let nv = 0, ni = 0;
  for (const it of list) { nv += it.geo.attributes.position.count; ni += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 3);
  const I = new Uint32Array(ni); let vo = 0, io = 0;
  const nm = new THREE.Matrix3(), p = V3(), n = V3(), col = new THREE.Color();
  for (const it of list) {
    const g = it.geo, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color;
    const M = it.matrix ?? new THREE.Matrix4(); nm.getNormalMatrix(M);
    if (it.color) col.set(it.color);
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i).applyMatrix4(M); P.set([p.x, p.y, p.z], (vo + i) * 3);
      if (na) { n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N.set([n.x, n.y, n.z], (vo + i) * 3); }
      if (ua) U.set([ua.getX(i), ua.getY(i)], (vo + i) * 2);
      if (ca) C.set([ca.getX(i), ca.getY(i), ca.getZ(i)], (vo + i) * 3); else if (it.color) C.set([col.r, col.g, col.b], (vo + i) * 3); else C.set([1, 1, 1], (vo + i) * 3);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) I[io + i] = g.index.getX(i) + vo;
    else for (let i = 0; i < pa.count; i++) I[io + i] = i + vo;
    io += g.index ? g.index.count : pa.count; vo += pa.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setIndex(new THREE.BufferAttribute(I, 1)); return out;
}
function gridIndex(nu, nv) {   // (nu+1) x (nv+1) vertex grid, row-major in u
  const idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return idx;
}

// ------------------------------------------------------------ time palettes: uniforms blended between named states
// pal.add(uniform, [hex | number per state]); pal.set([w0, w1, ...]) writes the weighted mix (linear space)
export class Palette {
  constructor() { this.items = []; this._c = new THREE.Color(); }
  add(u, vals) { this.items.push({ u, vals: vals.map((v) => (typeof v === 'number' ? v : new THREE.Color(v))) }); return u; }
  set(w) {
    for (const it of this.items) {
      if (typeof it.vals[0] === 'number') { let s = 0; for (let i = 0; i < w.length; i++) s += it.vals[i] * w[i]; it.u.value = s; continue; }
      const c = it.u.value; c.setRGB(0, 0, 0);
      for (let i = 0; i < w.length; i++) if (w[i]) { c.r += it.vals[i].r * w[i]; c.g += it.vals[i].g * w[i]; c.b += it.vals[i].b * w[i]; }
    }
  }
}
// per-set light: own sun/ambient uniforms so other departments' lighting never leaks into the set (and vice versa)
export function setLight(dir = V3(0.3, 0.5, -0.8)) {
  return { uSunDir: { value: dir.clone().normalize() }, uSunColor: { value: new THREE.Color('#ffffff') }, uAmbient: { value: new THREE.Color('#9b95c8') } };
}
export function bindLight(m, L) { m.uniforms.uSunDir = L.uSunDir; m.uniforms.uSunColor = L.uSunColor; m.uniforms.uAmbient = L.uAmbient; return m; }

// ------------------------------------------------------------ painted cliff wall
// path(u) -> {x, z, nx, nz}: wall foot line, n = horizontal direction INTO the rock. u in metres along the wall.
// o: {u0, u1, segU, y0, H(u), rowH, off(u, y) (>= 0 into rock), top (plateau depth), topRows, colour(u, y, ny, x, z) -> [r,g,b]}
export function cliffWall(o) {
  const segU = o.segU, rows = [];
  const yTopMax = o.Hmax;
  const nRow = Math.ceil((yTopMax - o.y0) / o.rowH);
  for (let j = 0; j <= nRow; j++) rows.push(j / nRow);
  const topRows = o.topRows ?? 6, nv = rows.length - 1 + topRows;
  const P = [], C = [];
  const pt = (u, v) => {   // v 0..1 on the face, >1 on the plateau
    const b = o.path(u), H = o.H(u);
    if (v <= 1) { const y = lerp(o.y0, H, v); const d = o.off(u, y); return [b.x + b.nx * d, y, b.z + b.nz * d]; }
    const t = (v - 1) / topRows, dTop = o.off(u, H) + 0.6 + t * t * o.top;
    const y = H + (o.topY ? o.topY(u, t) : 0) * smooth(0, 0.3, t);
    return [b.x + b.nx * dTop, y, b.z + b.nz * dTop];
  };
  for (let j = 0; j <= nv; j++) {
    const v = j < rows.length ? rows[j] : 1 + (j - rows.length + 1);
    for (let i = 0; i <= segU; i++) { const u = lerp(o.u0, o.u1, i / segU); P.push(...pt(u, v)); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(gridIndex(segU, nv)); g.computeVertexNormals();
  // orient normals out of the rock (toward open air)
  const pa = g.attributes.position, na = g.attributes.normal;
  const midU = lerp(o.u0, o.u1, 0.5), b = o.path(midU), j0 = Math.floor(rows.length / 2) * (segU + 1) + segU / 2 | 0;
  if (na.getX(j0) * b.nx + na.getZ(j0) * b.nz > 0) { for (let i = 0; i < na.count; i++) na.setXYZ(i, -na.getX(i), -na.getY(i), -na.getZ(i)); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  for (let i = 0; i < pa.count; i++) {
    const u = lerp(o.u0, o.u1, (i % (segU + 1)) / segU);
    C.push(...o.colour(u, pa.getY(i), na.getY(i), pa.getX(i), pa.getZ(i)));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
// terraced strata profile: near-vertical faces with up-facing ledges every L metres
export function terrace(y, L, depth, phase = 0) {
  const t = y / L + phase, f = Math.floor(t), r = t - f;
  return depth * (f + smooth(0.74, 1.0, r));
}
// list of ledge spots on a wall geometry (up-facing, inside a y range), for pines and moss
export function ledgeSpots(g, rng, n, { minNy = 0.55, yMin = -1e9, yMax = 1e9, keep = null } = {}) {
  const pa = g.attributes.position, na = g.attributes.normal, out = [];
  let tries = 0;
  while (out.length < n && tries++ < n * 400) {
    const i = Math.floor(rng() * pa.count);
    const ny = na.getY(i), y = pa.getY(i);
    if (ny < minNy || y < yMin || y > yMax) continue;
    const p = V3(pa.getX(i), y, pa.getZ(i));
    if (keep && !keep(p)) continue;
    out.push({ p, n: V3(na.getX(i), ny, na.getZ(i)) });
  }
  return out;
}

// ------------------------------------------------------------ chiselled rock (facets + noise), vertex coloured
// rockGeo(rng, {r, sx, sy, sz, cuts, rough, seed, flatBottom, palette: {lit, dark, moss, wet}, wetY (world), mossAmt, at: V3})
export function rockGeo(rng, o = {}) {
  const g = new THREE.IcosahedronGeometry(1, o.detail ?? 4);
  const pa = g.attributes.position, p = V3();
  const cuts = [];
  for (let i = 0; i < (o.cuts ?? 7); i++) {
    const n = V3(rng() * 2 - 1, rng() * 1.4 - 0.4, rng() * 2 - 1).normalize();
    cuts.push([n, 0.62 + rng() * 0.28]);
  }
  if (o.flatTop) cuts.push([V3(0, 1, 0), o.flatTop]);
  const s = o.seed ?? rng() * 100, rough = o.rough ?? 0.14;
  for (let i = 0; i < pa.count; i++) {
    p.fromBufferAttribute(pa, i);
    for (const [n, d] of cuts) { const k = p.dot(n) - d; if (k > 0) p.addScaledVector(n, -k * 0.92); }
    const f = fbm(p.x * 1.6 + s, p.y * 1.6, p.z * 1.6, 4) - 0.5;
    const ff = noise3(p.x * 6 + s, p.y * 9, p.z * 6) - 0.5;   // strata grooves
    p.multiplyScalar(1 + f * rough * 2 + ff * rough * 0.35);
    if (o.flatBottom !== undefined && p.y < o.flatBottom) p.y = o.flatBottom + (p.y - o.flatBottom) * 0.2;
    pa.setXYZ(i, p.x * (o.sx ?? 1) * (o.r ?? 1), p.y * (o.sy ?? 1) * (o.r ?? 1), p.z * (o.sz ?? 1) * (o.r ?? 1));
  }
  g.computeVertexNormals();
  const pal = o.palette, at = o.at ?? V3(), C = [], na = g.attributes.normal;
  const lit = new THREE.Color(pal.lit), dark = new THREE.Color(pal.dark), moss = new THREE.Color(pal.moss), wet = new THREE.Color(pal.wet ?? pal.dark), c = new THREE.Color();
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i) + at.y, ny = na.getY(i);
    const v = fbm(pa.getX(i) * 0.7 + s, pa.getY(i) * 2.2, pa.getZ(i) * 0.7, 3);
    c.copy(dark).lerp(lit, smooth(0.3, 0.7, v));
    const m = smooth(0.5, 0.8, ny + (noise3(pa.getX(i) * 1.3 + s, pa.getY(i), pa.getZ(i) * 1.3) - 0.5) * 0.6) * (o.mossAmt ?? 1);
    c.lerp(moss, m);
    if (o.wetY !== undefined) c.lerp(wet, smooth(o.wetY + 0.5, o.wetY - 0.1, y) * 0.85);
    C.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

// ------------------------------------------------------------ pines (crooked trunk + flat needle pads), Japanese cliff pine
// returns {trunks: [{geo, matrix}], clumps: [{c, r, n, light}]}
export function pineParts(rng, base, o = {}) {
  const s = o.scale ?? 1, lean = o.lean ?? V3(rng() - 0.5, 0, rng() - 0.5).multiplyScalar(0.6);
  const trunks = [], clumps = [];
  const up = V3(0, 1, 0).add(lean).normalize();
  let p = base.clone(), dir = up.clone();
  const segs = 4, H = (o.height ?? 9) * s;
  let r = 0.28 * s * (o.girth ?? 1);
  const pts = [p.clone()];
  for (let i = 0; i < segs; i++) {
    const L = H / segs * (0.8 + rng() * 0.4);
    dir = dir.clone().add(V3((rng() - 0.5) * 0.7, 0.1, (rng() - 0.5) * 0.7)).normalize();
    if (o.hang) dir.lerp(o.hang, 0.35).normalize();
    const q = p.clone().addScaledVector(dir, L);
    trunks.push(limbGeo(p, q, r, r * 0.72));
    // a side branch with a pad from the upper segments
    if (i >= 1 && rng() < 0.85) {
      const bd = V3(rng() - 0.5, 0.15 + rng() * 0.25, rng() - 0.5).normalize(), bl = H * (0.25 + rng() * 0.25);
      const bp = p.clone().lerp(q, 0.6), be = bp.clone().addScaledVector(bd, bl);
      trunks.push(limbGeo(bp, be, r * 0.5, r * 0.22));
      const pr = (1.5 + rng() * 1.3) * s * (o.pad ?? 1);
      clumps.push({ c: be.clone().add(V3(0, pr * 0.15, 0)), r: V3(pr * 1.15, pr * 0.42, pr * 1.15), n: Math.round(7 + rng() * 6), light: (rng() - 0.5) * 0.1 });
    }
    p = q; r *= 0.72; pts.push(p.clone());
  }
  const pr = (1.8 + rng() * 1.2) * s * (o.pad ?? 1);
  clumps.push({ c: p.clone().add(V3(0, pr * 0.1, 0)), r: V3(pr * 1.3, pr * 0.5, pr * 1.3), n: Math.round(9 + rng() * 6), light: 0.05 });
  return { trunks, clumps };
}
const _yUp = V3(0, 1, 0);
export function limbGeo(a, b, r0, r1) {
  const L = a.distanceTo(b), g = new THREE.CylinderGeometry(r1, r0, L, 7, 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * L / 1.5);
  const m = new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), new THREE.Quaternion().setFromUnitVectors(_yUp, b.clone().sub(a).normalize()), V3(1, 1, 1));
  return { geo: g, matrix: m };
}

// ------------------------------------------------------------ painted puff clouds (instanced spheres lit as one mass)
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _c = new THREE.Color();
export function puffs(geo, mat, list) {   // list: [{pos, r, sx, sy, sz, col}]
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((it, i) => {
    m.setMatrixAt(i, _m4.compose(it.pos, _q.identity(), V3(it.r * (it.sx ?? 1), it.r * (it.sy ?? 1), it.r * (it.sz ?? 1))));
    m.setColorAt(i, _c.set(it.col ?? '#ffffff'));
  });
  m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.frustumCulled = false; return m;
}
// a towering cumulus: flat base, columns of shrinking puffs, a few side towers. Returns the puff list.
export function cumulusList(rng, c0, w, h, n, o = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rng(), o.taper ?? 0.9), rad = lerp(w * 0.2, w * 0.07, t) * lerp(0.7, 1.15, rng());
    const spread = (1.3 - t) * (o.spread ?? 1);
    const pos = c0.clone().add(V3((rng() - 0.5) * w * spread, t * h + rad * 0.3, (rng() - 0.5) * w * 0.55 * spread));
    out.push({ pos, r: rad, sx: o.sx ?? 1.1, sy: o.sy ?? 0.9, sz: 1, col: o.col?.(t, rng) });
    // cauliflower bumps on the upper / outer surface
    const nb = o.bumps ?? 2;
    for (let k = 0; k < nb; k++) {
      const d = V3(rng() - 0.5, rng() * 0.9 + 0.1, rng() - 0.5).normalize();
      const r2 = rad * lerp(0.32, 0.55, rng());
      out.push({ pos: pos.clone().addScaledVector(d, rad * 0.85), r: r2, sx: 1.05, sy: 0.95, sz: 1, col: o.col?.(t, rng) });
    }
  }
  return out;
}
export function cloudMaterial(o) {   // painted cloud, lit as one mass, brushed, lit rim along the top
  const m = A.paintedMaterial({ color: o.color, color2: o.color2 ?? o.color, shade: o.shade, id: A.ID.CLOUD, bands: o.bands ?? true, rim: o.rim ?? 1,
    rimColor: o.rimColor, rimWidth: o.rimWidth ?? 0.32, rimTop: o.rimTop ?? 0.6, varScale: o.varScale ?? 0.01, varAmt: o.varAmt ?? 0.5, dab: o.dab ?? 0.3,
    stroke: o.stroke ?? 1.3, strokeScale: o.strokeScale ?? 0.014, mass: o.mass ?? [0, 0, 0, 0], massScale: o.massScale ?? [1, 0.55, 1], vertexColors: false });
  return m;
}

// ------------------------------------------------------------ far mountain range: polar heightfield band (lit slopes + ridges)
// range({centre, a0, a1, d0, d1, H, seed, segA, segR, sharp}) -> geometry. Angles: 0 = -z, positive toward +x.
export function rangeGeo(o) {
  const segA = o.segA ?? 160, segR = o.segR ?? 14, P = [], c = o.centre ?? V3();
  for (let j = 0; j <= segR; j++) {
    const rt = j / segR, d = lerp(o.d0, o.d1, rt);
    for (let i = 0; i <= segA; i++) {
      const a = lerp(o.a0, o.a1, i / segA);
      const ridge = ridged(a * (o.freq ?? 3.2) + o.seed, rt * 1.2 + o.seed * 0.3, 5);
      const peak = Math.pow(ridge, o.sharp ?? 1.6) * (0.55 + 0.45 * fbm(a * 1.4 + o.seed, 0.5, 2, 3));
      const prof = Math.sin(Math.PI * Math.min(1, rt * 1.15)) ** 0.7;   // rises from the front edge, falls off behind
      const ends = smooth(0, 0.06, (a - o.a0) / (o.a1 - o.a0)) * smooth(1, 0.94, (a - o.a0) / (o.a1 - o.a0));
      const nt = o.notch !== null && o.notch !== undefined ? 0.3 + 0.7 * smooth(0.04, 0.38, Math.abs(a - o.notch)) : 1;   // a valley notch (sunset sits in it)
      const y = (o.base ?? -40) + o.H * peak * prof * nt * (o.endsKeep ? 1 : ends);
      P.push(c.x + Math.sin(a) * d, y, c.z - Math.cos(a) * d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(gridIndex(segA, segR)); g.computeVertexNormals();
  const na = g.attributes.normal;   // face the camera centre (up-facing slopes)
  let s = 0; for (let i = 0; i < na.count; i += 7) s += na.getY(i);
  if (s < 0) { for (let i = 0; i < na.count; i++) na.setXYZ(i, -na.getX(i), -na.getY(i), -na.getZ(i)); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  return g;
}

// ------------------------------------------------------------ painted rock (cliffs, boulders): vertex-colour gouache + drawn cracks
// World-space crack network (meandering, mostly vertical joints + strata lines), drawn at constant pixel width and faded out
// where they would get too dense; moss dabs on up-facing planes; crevice darkening; banded painted light; lit top rims.
// Near fragments write id STROKE (light Kuwahara: the cracks survive), far ones PAINT.
const ROCK_FS = /* glsl */ `
${A.GLSL.NOISE}
${A.GLSL.GLOBAL_PARS}
uniform vec3 uShadeC, uRimCol, uCrackCol, uMoss, uMoss2, uLitTint, uSkyFill;
uniform float uSkyAmt, uRimTop, uFillAmt, uSoft;
uniform vec3 uFillDir, uFillCol;
uniform float uCrackScale, uCrackW, uCrackAmt, uMossAmt, uRimAmt2, uRimTh, uNearD, uS, uStroke, uStrokeScale, uVarScale, uDarkAmt, uEdgeInk;
float lineAt(float n, float w){ float fw = max(fwidth(n), 1e-5); float d = abs(n - 0.5) / fw; return (1.0 - smoothstep(w * 0.55, w, d)) * smoothstep(0.09, 0.03, fw); }
void main(){
  vec3 N = normalize(vNW), NV = normalize(vNV);
  if(!gl_FrontFacing){ N = -N; NV = -NV; }
  vec3 p = vW;
  vec3 col = vColor;
  // brushy value / hue variation (dabs) for the paint pass
  float v1 = fbm3(p * uVarScale), v2 = vnoise3(p * uVarScale * 9.0 + 3.0);
  col *= 0.86 + 0.24 * v1 + 0.1 * (v2 - 0.5);
  col = mix(col, col * vec3(1.06, 0.96, 1.04), smoothstep(0.55, 0.75, v2) * 0.6);
  // crevices: low-frequency darkening in the joints
  float cav = fbm3(p * uCrackScale * vec3(0.7, 0.18, 0.7) + 11.0);
  col *= 1.0 - uDarkAmt * smoothstep(0.42, 0.25, cav);
  // moss dabs on up-facing rock
  float up = N.y + (vnoise3(p * 0.9) - 0.5) * 0.5;
  float md = vnoise3(p * 1.6 + 7.0);
  float moss = smoothstep(0.38, 0.6, up) * smoothstep(0.35, 0.55, md) * uMossAmt;
  col = mix(col, mix(uMoss2, uMoss, smoothstep(0.5, 0.8, md)), moss);
  // light: banded (gouache planes), wobbly terminator
  float n = fbm3(p * uVarScale * 2.3 + 4.0) - 0.5;
  float ndl = dot(N, normalize(uSunDir));
  float lit = smoothstep(-uSoft, uSoft, ndl + n * 0.45);
  vec3 sh = mix(uShadeC, uShadeC * col * 1.25, 0.4);
  sh += uSkyFill * 0.22 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0) * uSkyAmt;   // sky fill: up-facing shade lighter / tinted
  sh += uFillCol * 0.22 * smoothstep(-0.1, 0.7, dot(N, normalize(uFillDir)) + n * 0.3) * uFillAmt;   // bounce fill: shapes read in shade
  vec3 c = mix(sh, col * uSunColor * uLitTint, lit);
  // long horizontal strokes
  if(uStroke > 0.0){
    vec3 q = p * uStrokeScale;
    float s1 = vnoise3(vec3(q.x * 0.22, q.y * 3.2, q.z * 0.22));
    c *= 1.0 + uStroke * (s1 - 0.5) * 0.3;
  }
  // drawn cracks: joints (vertical, meandering) + strata (horizontal) at two scales, broken along their length
  vec3 cq = p * uCrackScale;
  float w = uCrackW * uS;
  float j1 = vnoise3(vec3(cq.x * 1.0, cq.y * 0.16, cq.z * 1.0) + vec3(0.0, 0.0, 3.0) + fbm3(cq * 0.7) * 0.6);
  float j2 = vnoise3(vec3(cq.x * 2.6, cq.y * 0.5, cq.z * 2.6) + 17.0);
  float s1 = vnoise3(vec3(cq.x * 0.12, cq.y * 1.4, cq.z * 0.12) + fbm3(cq * 0.9) * 0.4 + 5.0);
  float br1 = smoothstep(0.35, 0.6, vnoise3(cq * vec3(0.6, 0.1, 0.6) + 31.0));
  float br2 = smoothstep(0.45, 0.65, vnoise3(cq * vec3(1.4, 0.3, 1.4) + 41.0));
  float steep = 1.0 - smoothstep(0.45, 0.8, abs(N.y));
  float cr = max(lineAt(j1, w * 1.2) * br1, lineAt(j2, w * 0.8) * br2 * 0.8) * steep;
  cr = max(cr, lineAt(s1, w) * smoothstep(0.4, 0.7, vnoise3(cq * vec3(0.4, 2.0, 0.4) + 51.0)) * steep * 0.85);
  c = mix(c, mix(uCrackCol, c * 0.45, 0.35), cr * uCrackAmt);
  // lit rim along top edges
  if(uRimAmt2 > 0.0){
    vec3 V = normalize(cameraPosition - vW);
    float fres = 1.0 - max(dot(N, V), 0.0) + n * 0.25;
    float rim = smoothstep(uRimTh, uRimTh + 0.04, fres) * smoothstep(-0.25, 0.25, ndl + n * 0.3) * mix(1.0, smoothstep(-0.05, 0.3, N.y), uRimTop);
    c = mix(c, uRimCol, rim * uRimAmt2);
  }
  // ink on major edges: creases where the normal turns fast (ledge lips, block corners), faded with distance
  if(uEdgeInk > 0.0){
    float cr2 = length(fwidth(N)) / max(uS, 1.0);
    float e = smoothstep(0.22, 0.55, cr2 + (vnoise3(p * 0.7) - 0.5) * 0.15) * (1.0 - smoothstep(uNearD * 2.5, uNearD * 6.0, vDepth));
    c = mix(c, uCrackCol, e * uEdgeInk);
  }
  writeOut(c, 0.0, NV, vDepth, vDepth < uNearD ? 125.0 : 100.0);
}
`;
export function rockMaterial(o = {}) {
  const m = A.animeShader({
    uShadeC: { value: new THREE.Color(o.shade ?? '#5a4a80') }, uRimCol: { value: new THREE.Color(o.rimColor ?? '#ffd0a0') },
    uCrackCol: { value: new THREE.Color(o.crackColor ?? '#2a1e3a') }, uMoss: { value: new THREE.Color(o.moss ?? '#8aa24e') }, uMoss2: { value: new THREE.Color(o.moss2 ?? '#4e7048') },
    uLitTint: { value: new THREE.Color(o.litTint ?? '#ffffff') }, uSkyFill: { value: new THREE.Color(o.skyFill ?? '#ffffff') }, uSkyAmt: { value: o.skyAmt ?? 0 }, uRimTop: { value: o.rimTop ?? 1 },
    uFillDir: { value: (o.fillDir ?? V3(0, 0.3, 1)).clone().normalize() }, uFillCol: { value: new THREE.Color(o.fillCol ?? '#ffffff') }, uFillAmt: { value: o.fillAmt ?? 0 }, uSoft: { value: o.soft ?? 0.04 },
    uCrackScale: { value: o.crackScale ?? 0.12 }, uCrackW: { value: o.crackW ?? 1.6 }, uCrackAmt: { value: o.crackAmt ?? 0.85 }, uMossAmt: { value: o.mossAmt ?? 0.8 },
    uRimAmt2: { value: o.rim ?? 0.5 }, uRimTh: { value: 1 - (o.rimWidth ?? 0.22) }, uNearD: { value: o.nearD ?? 60 }, uS: { value: o.S ?? 1 },
    uStroke: { value: o.stroke ?? 0.8 }, uStrokeScale: { value: o.strokeScale ?? 0.1 }, uVarScale: { value: o.varScale ?? 0.06 }, uDarkAmt: { value: o.dark ?? 0.35 },
    uEdgeInk: { value: o.edgeInk ?? 0 },
  }, ROCK_FS, { side: o.side ?? THREE.FrontSide, vertexColors: true });
  m.extensions = { derivatives: true };
  m.name = 'heights_rock';
  return m;
}

// ------------------------------------------------------------ HEIGHTS sky: painted gradient + sun/halo + cirrus + storm banks + flash
const SKY_FS = /* glsl */ `
${A.GLSL.NOISE}
${A.GLSL.GLOBAL_PARS}
uniform vec3 uC0, uC1, uC2, uC3; uniform vec4 uH;
uniform vec3 uDiskDir, uDiskCol, uHaloCol; uniform float uDiskR, uHalo, uDiskEmis;
uniform float uCirrus; uniform vec3 uCirLit, uCirShade; uniform float uCirScale, uCirAng;
uniform float uBank, uBankH; uniform vec3 uBankCol, uBankRim;
uniform float uFlash; uniform vec3 uFlashCol; uniform vec3 uFlashDir;
uniform float uBrush0;
void main(){
  vec3 d = normalize(vW - cameraPosition);
  float az = atan(d.x, -d.z);
  float zen = 1.0 - smoothstep(0.8, 0.97, abs(d.y));   // no pinwheel at the zenith
  float uBrush = uBrush0 * zen;
  float e = d.y + (fbm2(vec2(az * 2.2, d.y * 9.0)) - 0.5) * 0.05 * uBrush + (vnoise(vec2(az * 30.0, d.y * 160.0)) - 0.5) * 0.01 * uBrush;
  float st1 = vnoise(vec2(az * 6.0, d.y * 90.0)), st2 = vnoise(vec2(az * 15.0 + 3.0, d.y * 230.0)), st3 = vnoise(vec2(az * 3.0 + 7.0, d.y * 40.0));
  e += ((st1 - 0.5) * 0.02 + (st3 - 0.5) * 0.018) * uBrush;
  vec3 c = mix(uC0, uC1, smoothstep(uH.x, uH.y, e));
  c = mix(c, uC2, smoothstep(uH.y, uH.z, e));
  c = mix(c, uC3, smoothstep(uH.z, uH.w, e));
  float big = fbm2(vec2(az * 1.3 + 2.0, d.y * 5.0));
  c *= 1.0 + ((st1 - 0.5) * 0.07 + (st2 - 0.5) * 0.05 + smoothstep(0.62, 0.8, st2) * 0.04) * uBrush;
  c = mix(c, c * vec3(1.07, 0.96, 1.05), clamp((big - 0.45) * 1.6, -0.6, 1.0) * uBrush * 0.6);
  vec3 sd = normalize(uDiskDir);
  float sunF = max(dot(d, sd), 0.0);
  // halo (painted: banded slightly)
  float ang = acos(clamp(dot(d, sd), -1.0, 1.0));
  float halo = uHalo * (exp(-ang / max(uDiskR * 2.4, 1e-3)) * 0.65 + exp(-ang / max(uDiskR * 10.0, 1e-3)) * 0.35);
  halo *= 0.85 + 0.3 * vnoise(vec2(az * 40.0, d.y * 40.0));
  c += uHaloCol * halo;
  // low storm / cloud banks painted on the horizon (flat-bottomed, ragged lit tops)
  if(uBank > 0.0){
    float top = (0.04 + 0.13 * fbm2(vec2(az * 3.5, 1.3)) + 0.06 * fbm2(vec2(az * 11.0, 4.0))) * uBankH;
    float bm = smoothstep(top + 0.006, top - 0.006, d.y) * smoothstep(-0.05, 0.0, d.y);
    float rimB = smoothstep(top - 0.012, top - 0.002, d.y) * bm;
    vec3 bc = uBankCol * (0.85 + 0.25 * vnoise(vec2(az * 25.0, d.y * 60.0)));
    bc = mix(bc, uBankRim, rimB * (0.5 + 0.5 * pow(sunF, 3.0)));
    c = mix(c, bc, bm * uBank);
  }
  // cirrus: hard-edged painted wisps on a high plane, lit toward the sun
  if(uCirrus > 0.0 && d.y > 0.02){
    vec2 p = d.xz / (d.y + 0.12) * uCirScale;
    float ca = uCirAng; p = mat2(cos(ca), -sin(ca), sin(ca), cos(ca)) * p;
    float w1 = fbm2(vec2(p.x * 0.35, p.y * 3.4) + vec2(fbm2(p * 0.6) * 1.4, 0.0));
    float w2 = vnoise(vec2(p.x * 1.2 + 5.0, p.y * 9.0));
    float m = smoothstep(0.56, 0.6, w1 + (w2 - 0.5) * 0.12) * smoothstep(0.02, 0.18, d.y);
    float core = smoothstep(0.62, 0.7, w1);
    vec3 cc = mix(uCirShade, uCirLit, clamp(0.35 + 0.65 * pow(sunF, 2.0) + core * 0.25, 0.0, 1.0));
    c = mix(c, cc, m * uCirrus);
  }
  // lightning: the whole dome lifts toward the flash colour, brightest toward the bolt
  if(uFlash > 0.0){
    float fd = max(dot(d, normalize(uFlashDir)), 0.0);
    c = mix(c, uFlashCol, uFlash * (0.35 + 0.5 * pow(fd, 4.0)));
  }
  float emis = 0.0;
  if(uDiskR > 0.0){
    float aa = fwidth(ang) * 1.2;
    float disk = smoothstep(uDiskR + aa, uDiskR - aa, ang) * smoothstep(-0.02, 0.0, d.y);
    c = mix(c, uDiskCol, disk);
    emis = disk * uDiskEmis;
  }
  writeOut(c, emis, vec3(0.0, 0.0, 1.0), 10000.0, 0.0);
}
`;
export function heightsSky(o = {}) {
  const st = o.stops;
  const m = A.animeShader({
    uC0: { value: new THREE.Color(st[0][1]) }, uC1: { value: new THREE.Color(st[1][1]) }, uC2: { value: new THREE.Color(st[2][1]) }, uC3: { value: new THREE.Color(st[3][1]) },
    uH: { value: new THREE.Vector4(st[0][0], st[1][0], st[2][0], st[3][0]) },
    uDiskDir: { value: (o.sunDir ?? V3(0, 0.1, -1)).clone().normalize() }, uDiskR: { value: o.diskR ?? 0 }, uDiskCol: { value: new THREE.Color(o.diskCol ?? '#fff4d8') },
    uHaloCol: { value: new THREE.Color(o.haloCol ?? '#ffc080') }, uHalo: { value: o.halo ?? 0.5 }, uDiskEmis: { value: o.bloom ?? 0.8 },
    uCirrus: { value: o.cirrus ?? 0 }, uCirLit: { value: new THREE.Color(o.cirLit ?? '#ffe0c0') }, uCirShade: { value: new THREE.Color(o.cirShade ?? '#c0a0c8') },
    uCirScale: { value: o.cirScale ?? 1 }, uCirAng: { value: o.cirAng ?? 0.4 },
    uBank: { value: o.bank ?? 0 }, uBankH: { value: o.bankH ?? 1 }, uBankCol: { value: new THREE.Color(o.bankCol ?? '#5a4a8a') }, uBankRim: { value: new THREE.Color(o.bankRim ?? '#ffb090') },
    uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(o.flashCol ?? '#c8d4ff') }, uFlashDir: { value: V3(0, 0.6, -1).normalize() },
    uBrush0: { value: o.brush ?? 1.3 }, uBrush: { value: o.brush ?? 1.3 },   // uBrush: kept for updateSky compatibility (unused)
  }, SKY_FS, { side: THREE.BackSide });
  m.depthWrite = false;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4800, 64, 32), m);
  mesh.frustumCulled = false; mesh.renderOrder = -100; mesh.name = 'heights_sky';
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); o.before?.(); };
  return mesh;
}

// ------------------------------------------------------------ HEIGHTS cloud: 3-tone painted cumulus (lit / mid / shade) with dark
// bellies, back-lit silver rims, lightning light + rims (uFlash), inner lightning glow patches, sun glow across the tops,
// aerial perspective toward uFarCol. Works on instanced puffs (instance colour = value) and on vertex-coloured walls.
const HCLOUD_FS = /* glsl */ `
${A.GLSL.NOISE}
${A.GLSL.GLOBAL_PARS}
uniform vec3 uColor, uShadeC, uBellyC, uRimCol, uFlashCol, uGlowCol, uFarCol, uInnerCol, uFlashDir, uGlowDir, uMassScale;
uniform vec4 uMass, uPointL, uRing;
uniform float uFlash, uRimAmt2, uRimW, uBelly, uGlow, uFar0, uFar1, uFarAmt, uInner, uInnerT, uInnerScale, uVarScale, uStroke, uStrokeScale, uSoft, uMid, uRimLit, uShafts;
void main(){
  vec3 N = normalize(vNW);
  if(!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  float massEdge = 1.0;   // rims only where the puff edge is also near the silhouette of the whole mass (no ring per puff)
  if(uMass.w > 0.0){
    vec3 mN = normalize((vW - uMass.xyz) * uMassScale);
    massEdge = smoothstep(0.45, 0.8, 1.0 - max(dot(mN, V), 0.0));
    N = normalize(mix(N, mN, uMass.w));
  }
  if(uRing.w > 0.0){   // a ring of clumps around the y axis lit as one torus (shelf of a storm tunnel)
    vec2 rc = normalize(vW.xz + vec2(1e-4)) * uRing.x;
    vec3 mN = normalize((vW - vec3(rc.x, uRing.y, rc.y)) * vec3(1.0, uRing.z, 1.0));
    massEdge = smoothstep(0.4, 0.78, 1.0 - max(dot(mN, V), 0.0));
    N = normalize(mix(N, mN, uRing.w));
  }
  vec3 NV = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  vec3 p = vW;
  vec3 col = uColor * vColor;
  float v1 = fbm3(p * uVarScale), v2 = vnoise3(p * uVarScale * 7.0 + 3.0);
  col *= 0.9 + 0.2 * v1 + 0.08 * (v2 - 0.5);
  float n = fbm3(p * uVarScale * 2.3 + 4.0) - 0.5;
  vec3 L = uPointL.w > 0.0 ? normalize(uPointL.xyz - vW) : normalize(uSunDir);   // point light: light leaking from an opening
  float ndl = dot(N, L);
  float lit = smoothstep(-uSoft, uSoft, ndl + n * 0.5);
  float mid = smoothstep(-uMid - uSoft, -uMid + uSoft, ndl + n * 0.45);
  float belly = smoothstep(-0.05, -0.55, N.y + n * 0.35) * uBelly;
  vec3 sh = mix(uShadeC * (0.7 + 0.3 * vColor), uBellyC, belly);
  vec3 midc = mix(sh, col * uSunColor, 0.42);
  vec3 c = mix(sh, midc, mid);
  c = mix(c, col * uSunColor, lit);
  // painted strokes (value + hue), long and horizontal
  if(uStroke > 0.0){
    vec3 q = p * uStrokeScale;
    float s1 = vnoise3(vec3(q.x * 0.25, q.y * 2.6, q.z * 0.25)), s2 = vnoise3(vec3(q.x * 0.6 + 3.1, q.y * 6.0, q.z * 0.6));
    c *= 1.0 + uStroke * ((s1 - 0.5) * 0.3 + (s2 - 0.5) * 0.18);
    c = mix(c, c * vec3(1.05, 0.97, 1.06), smoothstep(0.55, 0.75, s1) * uStroke * 0.5);
  }
  // rain shafts hanging under the bellies (vertical streaks, darker + bluer)
  if(uShafts > 0.0){
    float az = atan(p.x, p.z);
    float sh1 = vnoise(vec2(az * 40.0 + floor(p.y / 140.0) * 3.0, p.y * 0.004));
    float st1 = vnoise(vec2(az * 260.0, p.y * 0.02));
    float shaft = smoothstep(0.55, 0.75, sh1) * (0.55 + 0.45 * st1) * smoothstep(0.2, -0.3, N.y) * uShafts;
    c = mix(c, uBellyC * 1.15 + vec3(0.02, 0.03, 0.06), shaft * 0.55);
  }
  // back-lit silver lining + lit rims along the light side
  float fres = 1.0 - max(dot(N, V), 0.0);
  float back = pow(max(dot(-V, L), 0.0), 2.0);
  float rim = smoothstep(1.0 - uRimW, 1.0 - uRimW + 0.07, fres + n * 0.18);
  rim *= massEdge;
  c = mix(c, uRimCol, rim * uRimAmt2 * clamp(back + uRimLit * smoothstep(-0.15, 0.35, ndl), 0.0, 1.0));
  float emis = 0.0;
  // lightning: a second hard light from the bolt, rims go cyan-white
  if(uFlash > 0.0){
    vec3 FD = normalize(uFlashDir);
    float fl = smoothstep(-0.12, 0.12, dot(N, FD) + n * 0.45);
    c = mix(c, c * 0.35 + uFlashCol * 0.85, fl * uFlash * 0.85);
    float frim = smoothstep(1.0 - uRimW * 1.4, 1.0 - uRimW * 1.4 + 0.07, fres + n * 0.18);
    c = mix(c, uFlashCol * 1.15, frim * uFlash);
    emis += frim * uFlash * 0.5;
  }
  // inner lightning glow patches (lit from inside the cloud), flickering on the film clock
  if(uInner > 0.0){
    float g = fbm3(p * uInnerScale + vec3(0.0, floor(uInnerT * 4.0) * 0.37, 0.0));
    float fl2 = 0.55 + 0.45 * sin(uInnerT * 9.0 + g * 30.0);
    float k = smoothstep(0.56, 0.66, g) * uInner * fl2 * (1.0 - lit * 0.7);
    c = mix(c, uInnerCol, k * 0.7);
    c = mix(c, uInnerCol * 1.25, k * rim);
    emis += k * 0.35;
  }
  // the sun's glow spreading across the cloud tops (dawn)
  if(uGlow > 0.0){
    float sv = max(dot(-V, normalize(uGlowDir)), 0.0);
    float up = smoothstep(-0.3, 0.7, N.y);
    c += uGlowCol * uGlow * (pow(sv, 10.0) * 0.8 + pow(sv, 3.0) * 0.28) * (0.35 + 0.65 * up) * (0.6 + 0.4 * lit);
  }
  // aerial perspective
  c = mix(c, uFarCol, smoothstep(uFar0, uFar1, vDepth) * uFarAmt);
  writeOut(c, emis, NV, vDepth, 105.0);
}
`;
export function hCloudMaterial(o = {}) {
  const C = (v, d) => new THREE.Color(v ?? d);
  const m = A.animeShader({
    uColor: { value: C(o.color, '#ffffff') }, uShadeC: { value: C(o.shade, '#6a5a9a') }, uBellyC: { value: C(o.belly, o.shade ?? '#3a3070') },
    uRimCol: { value: C(o.rimColor, '#ffffff') }, uFlashCol: { value: C(o.flashCol, '#d8e8ff') }, uGlowCol: { value: C(o.glowCol, '#ffc070') },
    uFarCol: { value: C(o.farCol, '#c0b0d8') }, uInnerCol: { value: C(o.innerCol, '#b8d8ff') },
    uFlashDir: { value: (o.flashDir ?? V3(0.2, 0.6, 1)).clone().normalize() }, uGlowDir: { value: (o.glowDir ?? V3(0, 0.1, -1)).clone().normalize() },
    uPointL: { value: new THREE.Vector4(...(o.pointL ?? [0, 0, 0, 0])) }, uRing: { value: new THREE.Vector4(...(o.ring ?? [0, 0, 1, 0])) },
    uMass: { value: new THREE.Vector4(...(o.mass ?? [0, 0, 0, 0])) }, uMassScale: { value: new THREE.Vector3(...(o.massScale ?? [1, 1, 1])) },
    uFlash: { value: 0 }, uRimAmt2: { value: o.rim ?? 0.8 }, uRimW: { value: o.rimWidth ?? 0.22 }, uBelly: { value: o.bellyAmt ?? 0.8 },
    uGlow: { value: o.glow ?? 0 }, uFar0: { value: o.far0 ?? 1500 }, uFar1: { value: o.far1 ?? 6000 }, uFarAmt: { value: o.farAmt ?? 0 },
    uInner: { value: o.inner ?? 0 }, uInnerT: { value: 0 }, uInnerScale: { value: o.innerScale ?? 0.003 },
    uVarScale: { value: o.varScale ?? 0.008 }, uStroke: { value: o.stroke ?? 1 }, uStrokeScale: { value: o.strokeScale ?? 0.014 },
    uSoft: { value: o.soft ?? 0.05 }, uMid: { value: o.mid ?? 0.45 }, uRimLit: { value: o.rimLit ?? 0.35 }, uShafts: { value: o.shafts ?? 0 },
  }, HCLOUD_FS, { side: o.side ?? THREE.FrontSide, vertexColors: !!o.vertexColors });
  m.name = 'heights_cloud';
  return m;
}

// ------------------------------------------------------------ water threads on a cliff (side cascades, seeps): drawn streaks
// scrolling down on threes, ragged edges, no ink (id 92). Geometry: ribbons with uv.x across 0..1, uv.y = metres down.
const THREAD_FS = /* glsl */ `
${A.GLSL.NOISE}
${A.GLSL.GLOBAL_PARS}
uniform vec3 uCol, uCol2, uFoam, uFlashCol; uniform float uT, uFlash, uSpeed;
void main(){
  float x = vUv.x, y = vUv.y;
  float w = vColor.r;                                             // ribbon width (m) in vertex colour r
  float edge = abs(x - 0.5) * 2.0;
  float rag = 0.72 + 0.25 * vnoise(vec2(y * 0.15 - uT * uSpeed * 0.15, x * 3.0 + vColor.g * 50.0));
  if(edge > rag) discard;
  float seg = vnoise(vec2(vColor.g * 77.0, (y - uT * uSpeed * 0.6) * 0.035));
  if(seg < 0.18 && vColor.b < 0.5) discard;                         // the thread breaks into separate falling sheets
  float s = vnoise(vec2(x * w * 1.3 + vColor.g * 31.0, (y - uT * uSpeed) * 0.07));
  float s2 = vnoise(vec2(x * w * 3.1 + 7.0, (y - uT * uSpeed * 1.2) * 0.16));
  vec3 c = mix(uCol2, uCol, smoothstep(0.45, 0.8, s));
  c = mix(c, uFoam, smoothstep(0.7, 0.85, s2) * 0.8);
  c = mix(c, uFoam, smoothstep(rag - 0.18, rag, edge) * 0.6 + vColor.b * 0.7);   // white edges, foam where it breaks
  c = mix(c, uFlashCol, uFlash * 0.6);
  vec3 NV = normalize(vNV);
  writeOut(c, uFlash * 0.3, NV, vDepth, 92.0);
}
`;
export function threadMaterial(o = {}) {
  const m = A.animeShader({
    uCol: { value: new THREE.Color(o.col ?? '#cfe4ff') }, uCol2: { value: new THREE.Color(o.col2 ?? '#6f8fe0') }, uFoam: { value: new THREE.Color(o.foam ?? '#f4f8ff') },
    uFlashCol: { value: new THREE.Color(o.flashCol ?? '#ffffff') }, uT: { value: 0 }, uFlash: { value: 0 }, uSpeed: { value: o.speed ?? 18 },
  }, THREAD_FS, { side: THREE.DoubleSide, vertexColors: true });
  m.name = 'heights_thread';
  return m;
}
// ribbon down a surface: pts [{p: Vector3, out: Vector3 (horizontal outward)}] from the top down; width w (m); foamAt(i) 0..1
export function ribbonGeo(pts, w, seed = 0, foamAt = null) {
  const P = [], U = [], C = [], idx = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) acc += pts[i].p.distanceTo(pts[i - 1].p);
    const a = pts[i], side = V3(-a.out.z, 0, a.out.x).normalize();
    const ww = w * (0.8 + 0.5 * Math.min(1, acc / 120));
    for (const s of [-0.5, 0.5]) {
      const q = a.p.clone().addScaledVector(side, s * ww);
      P.push(q.x, q.y, q.z); U.push(s + 0.5, acc); C.push(ww, seed, foamAt ? foamAt(i) : 0);
    }
    if (i) { const b = (i - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ crude stand-ins (test views only: q stand=1)
export function standIns(scene) {
  const g = new THREE.Group(); g.name = 'heights_standins'; g.visible = false;
  const white = A.celMaterial({ base: '#faf7f2', shade: '#b9bcd6', id: A.ID.CREATURE });
  const red = A.celMaterial({ base: '#e8442e', shade: '#b02e3a', id: A.ID.CREATURE });
  const grey = A.celMaterial({ base: '#8c97ad', shade: '#5e6782', id: A.ID.CREATURE });
  const yel = A.celMaterial({ base: '#f1c232', id: A.ID.CREATURE });
  const koi = new THREE.Group();
  const kb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12), white); kb.scale.set(0.45, 0.45, 1); koi.add(kb);
  const kc = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), red); kc.position.set(0, 0.08, -0.12); koi.add(kc);
  const kt = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 8), white); kt.rotation.x = -Math.PI / 2; kt.position.z = 0.27; kt.scale.set(1, 0.3, 1); koi.add(kt);
  const heron = new THREE.Group();
  const hb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 10), grey); hb.scale.set(0.8, 0.9, 1.4); hb.position.y = 0.75; heron.add(hb);
  const hn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.5, 8), white); hn.position.set(0, 1.05, -0.2); hn.rotation.x = 0.3; heron.add(hn);
  const hh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), white); hh.position.set(0, 1.3, -0.3); heron.add(hh);
  const hk = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.22, 6), yel); hk.rotation.x = -Math.PI / 2; hk.position.set(0, 1.3, -0.45); heron.add(hk);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 5), yel); l.position.set(s * 0.07, 0.3, 0); heron.add(l); }
  const dragon = new THREE.Group();
  const pts = []; for (let i = 0; i <= 12; i++) pts.push(V3(Math.sin(i * 0.7) * 14, i * 18, Math.cos(i * 0.5) * 6));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 4.5, 12), white); dragon.add(tube);
  for (let i = 1; i < 12; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), red); s.position.copy(pts[i]).add(V3(0, 0, -3.5)); s.scale.set(1, 1.6, 0.5); dragon.add(s); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), white); head.position.copy(pts[12]); head.scale.set(0.8, 1, 1.4); dragon.add(head);
  g.add(koi, heron, dragon);
  scene.add(g);
  return { group: g, koi, heron, dragon };
}
