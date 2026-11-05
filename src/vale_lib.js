// vale_lib.js - shared builders for the VALE sets (POND, BAMBOO, TOWN): seeded noise, geometry baking, rocks, tapered
// limbs, painted atlases (maple, bamboo leaf, fern, willow), dithered mist cards, painted ground shader, roof builder.
// Pure code: every texture is canvas-painted, every placement comes from a seeded rng.
import * as THREE from 'three';
import * as A from './anime/post.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function mulb(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash2 = (i, j) => { let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const vnoise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(i, j), hash2(i + 1, j), u), lerp(hash2(i, j + 1), hash2(i + 1, j + 1), u), v); };
export const fbm = (x, y, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.1, y * f - i * 9.3); f *= 2.03; a *= 0.5; } return s / (1 - Math.pow(0.5, o)); };
const vn3 = (x, y, z) => (vnoise(x + z * 1.7, y - z * 0.9) + vnoise(y * 1.3 + 5.1, z + x * 0.7)) * 0.5;

// ------------------------------------------------------------ geometry baking (fewer draw calls)
// bake(parts) parts: [{geo, m (Matrix4), color (THREE.Color | fn(pos, nrm) -> Color)}] -> one non-indexed geometry
// with position, normal, uv, color.
const _n3 = new THREE.Matrix3();
export function bake(parts) {
  let n = 0; const gs = parts.map((p) => { const g = p.geo.index ? p.geo.toNonIndexed() : p.geo; n += g.attributes.position.count; return g; });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3);
  let o = 0; const v = V3(), w = V3(), c = new THREE.Color();
  parts.forEach((p, k) => {
    const g = gs[k], pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color;
    const m = p.m ?? new THREE.Matrix4(); _n3.getNormalMatrix(m);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m); P.set([v.x, v.y, v.z], (o + i) * 3);
      if (na) { w.fromBufferAttribute(na, i).applyMatrix3(_n3).normalize(); N.set([w.x, w.y, w.z], (o + i) * 3); }
      if (ua) U.set([ua.getX(i), ua.getY(i)], (o + i) * 2);
      if (typeof p.color === 'function') c.copy(p.color(v, w, i));
      else if (p.color) c.copy(p.color);
      else if (ca) c.fromBufferAttribute(ca, i); else c.setRGB(1, 1, 1);
      C.set([c.r, c.g, c.b], (o + i) * 3);
    }
    o += pa.count;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.computeBoundingSphere(); return g;
}
// boxUV(geo, sx, sy, sz): BoxGeometry uvs in metres (so tiled stone / wood maps keep their scale on any box)
export function boxUV(geo, sx, sy, sz) {
  const uv = geo.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return geo;
}
export const M4 = (pos, rot = [0, 0, 0], scl = [1, 1, 1]) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot, 'YXZ')), V3(...(Array.isArray(scl) ? scl : [scl, scl, scl])));

// ------------------------------------------------------------ rocks: smooth displaced sphere, flat-ish bottom
// rockGeo(rng, {detail, rough, flat}) indexed geometry radius ~1 (scale it with the matrix)
export function rockGeo(rng, o = {}) {
  const g = new THREE.SphereGeometry(1, o.ws ?? 22, o.hs ?? 14);
  const p = g.attributes.position, s = rng() * 100, rough = o.rough ?? 0.32, v = V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let r = 1 + rough * (vn3(v.x * 1.3 + s, v.y * 1.3, v.z * 1.3) - 0.5) * 2 + rough * 0.35 * (vn3(v.x * 3.5, v.y * 3.5 + s, v.z * 3.5) - 0.5);
    // a couple of big planes (chiselled faces) so it reads as stone, not a blob
    const pl = Math.max(0, v.x * 0.7 + v.y * 0.5 + v.z * 0.5 - 0.62) * 0.55;
    r -= pl;
    v.multiplyScalar(r);
    if (v.y < -(o.flat ?? 0.35)) v.y = -(o.flat ?? 0.35) + (v.y + (o.flat ?? 0.35)) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
// mossy rock colours in world space: granite with lichen dabs, moss on top, dark wet band at the waterline
export function rockColor(o = {}) {
  const stone = new THREE.Color(o.stone ?? '#a7a2a6'), stone2 = new THREE.Color(o.stone2 ?? '#8d8a98'), moss = new THREE.Color(o.moss ?? '#6f8a3e'),
    moss2 = new THREE.Color(o.moss2 ?? '#a5a948'), wet = new THREE.Color(o.wet ?? '#5d5a6a'), c = new THREE.Color(), wl = o.waterY ?? 0;
  const mossAmt = o.mossAmt ?? 1;
  return (p, n) => {
    const k = fbm(p.x * 1.7 + p.y * 0.6, p.z * 1.7 - p.y * 0.4, 3);
    c.copy(stone).lerp(stone2, sstep(0.35, 0.7, k));
    const lich = vnoise(p.x * 7 + p.y * 3, p.z * 7);
    if (lich > 0.78) c.lerp(new THREE.Color('#c9c4b0'), 0.5);
    const m = sstep(0.55, 0.85, n.y + (fbm(p.x * 2.4, p.z * 2.4 + p.y, 3) - 0.5) * 0.9) * mossAmt;
    if (m > 0) c.lerp(moss.clone().lerp(moss2, sstep(0.4, 0.75, fbm(p.x * 4, p.z * 4, 2))), Math.min(1, m * 1.1));
    if (p.y < wl + 0.07 && p.y > wl - 0.6) c.lerp(wet, sstep(wl + 0.07, wl - 0.03, p.y) * 0.75);
    return c;
  };
}

// ------------------------------------------------------------ tapered tube along a curve (trunks, branches, culms)
export function taperTube(points, r0, r1, radial = 7, segs = null, o = {}) {
  const curve = new THREE.CatmullRomCurve3(points);
  const n = segs ?? Math.max(4, points.length * 4);
  const g = new THREE.TubeGeometry(curve, n, 1, radial, false);
  const p = g.attributes.position, nr = g.attributes.normal, uv = g.attributes.uv, len = curve.getLength();
  const frames = curve.computeFrenetFrames(n, false); const v = V3();
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = curve.getPointAt(t), r = lerp(r0, r1, Math.pow(t, o.pow ?? 1));
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(nr, k);
      const wob = o.wob ? 1 + (vnoise(j * 1.7 + i * 0.3, i * 0.9) - 0.5) * o.wob : 1;
      p.setXYZ(k, c.x + v.x * r * wob, c.y + v.y * r * wob, c.z + v.z * r * wob);
      uv.setXY(k, j / radial * (o.uRep ?? 1), t * len / (o.vScale ?? 1));
    }
  }
  g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------ canvas painters (data atlases for cardMaterial)
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
const rgbD = (v, g, b) => `rgb(${Math.round(clamp(v, 0, 1) * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
function dataTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; return t; }
function star(x, cx, cy, r, rot, pts = 5, inner = 0.42) {   // maple leaf: pointed lobes
  x.beginPath();
  for (let i = 0; i <= pts * 2; i++) {
    const a = rot + i / (pts * 2) * TAU - Math.PI / 2, rr = i % 2 ? r * inner : r * (i === 0 || i === pts * 2 ? 1 : (i === 2 || i === pts * 2 - 2 ? 0.85 : 0.62));
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.closePath();
}
// mapleAtlas: crown clumps of star leaves; lit top, cool underside, scattered single leaves at the ragged rim, ink twig marks
export function mapleAtlas(o = {}) {
  const cells = o.cells ?? 4, s = o.size ?? 256, rng = mulb(o.seed ?? 7);
  const [c, x] = mkCanvas(s * cells, s);
  for (let i = 0; i < cells; i++) {
    x.save(); x.beginPath(); x.rect(i * s + 3, 3, s - 6, s - 6); x.clip();
    const cx = i * s + s / 2, cy = s / 2, rx = s * 0.36, ry = s * 0.3, D = [];
    for (let k = 0; k < 230; k++) {
      const a = rng() * TAU, rr = Math.sqrt(rng()) * (rng() < 0.15 ? 1.22 : 1);
      const px = cx + Math.cos(a) * rx * rr, py = cy + Math.sin(a) * ry * rr;
      D.push({ px, py, v: clamp(0.55 - 0.6 * (py - cy) / ry + (rng() - 0.5) * 0.36, 0.02, 1), hue: rng() < 0.3 ? 1 : rng() * 0.3, r: s * (0.022 + rng() * 0.02) });
    }
    D.sort((a, b) => a.v - b.v);
    for (const d of D) {
      x.fillStyle = rgbD(d.v, 0, d.hue);
      if (rng() < 0.55) { star(x, d.px, d.py, d.r, rng() * TAU); x.fill(); }
      else { x.beginPath(); x.ellipse(d.px, d.py, d.r * 1.25, d.r * 0.75, rng() * TAU, 0, TAU); x.fill(); }
    }
    for (let k = 0; k < 6; k++) {   // twigs
      const px = cx + (rng() - 0.5) * rx * 1.4, py = cy + rng() * ry * 0.8, l = s * (0.04 + rng() * 0.04), a = rng() * Math.PI;
      x.strokeStyle = rgbD(0.03, 1, 0); x.lineWidth = s * 0.008; x.lineCap = 'round';
      const ex = px + Math.cos(a) * l * 1.5, ey = py + l * (0.2 + rng() * 0.5); x.beginPath(); x.moveTo(px, py); x.lineTo(ex, ey); x.moveTo(px + (ex - px) * 0.5, py + (ey - py) * 0.5); x.lineTo(px + (ex - px) * 0.5 + Math.cos(a + 1.2) * l * 0.5, py + (ey - py) * 0.5 + l * 0.35); x.stroke();
    }
    x.restore();
  }
  return dataTex(c);
}
// bambooLeafAtlas: sprays of long lance leaves hanging from thin twigs (canopy cards)
export function bambooLeafAtlas(o = {}) {
  const cells = o.cells ?? 4, s = o.size ?? 256, rng = mulb(o.seed ?? 31);
  const [c, x] = mkCanvas(s * cells, s);
  for (let i = 0; i < cells; i++) {
    x.save(); x.beginPath(); x.rect(i * s + 3, 3, s - 6, s - 6); x.clip();
    const cx = i * s + s / 2, cy = s / 2;
    const sprays = 7 + Math.floor(rng() * 4), L = [];
    for (let k = 0; k < sprays; k++) {
      const ox = cx + (rng() - 0.5) * s * 0.55, oy = cy + (rng() - 0.6) * s * 0.5, n = 4 + Math.floor(rng() * 4), base = rng() * TAU;
      for (let j = 0; j < n; j++) {
        const a = base + (j / n) * 2.4 + (rng() - 0.5) * 0.4 + Math.PI * 0.15, len = s * (0.13 + rng() * 0.1);
        const v = clamp(0.5 - 0.5 * (oy - cy) / (s * 0.3) + (rng() - 0.5) * 0.45, 0.04, 1);
        L.push({ ox, oy, a, len, v, hue: rng() < 0.3 ? 1 : 0, wd: len * (0.13 + rng() * 0.05) });
      }
    }
    L.sort((a, b) => a.v - b.v);
    for (const l of L) {
      const ex = l.ox + Math.cos(l.a) * l.len, ey = l.oy + Math.sin(l.a) * l.len + l.len * 0.25;
      const mx = (l.ox + ex) / 2 - Math.sin(l.a) * l.wd, my = (l.oy + ey) / 2 + Math.cos(l.a) * l.wd;
      const nx = (l.ox + ex) / 2 + Math.sin(l.a) * l.wd * 0.9, ny = (l.oy + ey) / 2 - Math.cos(l.a) * l.wd * 0.9;
      x.fillStyle = rgbD(l.v, 0, l.hue);
      x.beginPath(); x.moveTo(l.ox, l.oy); x.quadraticCurveTo(mx, my, ex, ey); x.quadraticCurveTo(nx, ny, l.ox, l.oy); x.fill();
      if (rng() < 0.35) { x.strokeStyle = rgbD(0.04, 1, 0); x.lineWidth = s * 0.005; x.beginPath(); x.moveTo((l.ox + ex) / 2, (l.oy + ey) / 2); x.lineTo(ex, ey); x.stroke(); }
    }
    x.restore();
  }
  return dataTex(c);
}
// fernAtlas: arching fronds with paired leaflets (ground cards, base at the bottom edge)
export function fernAtlas(o = {}) {
  const cells = o.cells ?? 4, s = o.size ?? 256, rng = mulb(o.seed ?? 41);
  const [c, x] = mkCanvas(s * cells, s);
  for (let i = 0; i < cells; i++) {
    x.save(); x.beginPath(); x.rect(i * s + 3, 0, s - 6, s); x.clip();
    const n = 6 + Math.floor(rng() * 4), F = [];
    for (let k = 0; k < n; k++) F.push({ a: -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.6 + (rng() - 0.5) * 0.3, len: s * (0.45 + rng() * 0.35), d: rng() });
    F.sort((a, b) => a.d - b.d);
    for (const f of F) {
      const rx = i * s + s / 2, ry = s - 4, segs = 14;
      let px = rx, py = ry; const k0 = 0.4 + f.d * 0.5;
      for (let j = 1; j <= segs; j++) {
        const t = j / segs, ang = f.a + Math.sign(Math.cos(f.a) || 1) * t * t * 1.1;
        const nx = rx + Math.cos(f.a) * f.len * t + Math.cos(ang) * 0, ny = ry + Math.sin(f.a) * f.len * t + t * t * f.len * 0.55;
        const lw = s * 0.07 * (1 - t * 0.8);
        const v = clamp(k0 * (0.35 + 0.65 * t) + (rng() - 0.5) * 0.2, 0.03, 1), hue = rng() < 0.2 ? 1 : 0;
        x.fillStyle = rgbD(v, 0, hue);
        for (const sd of [-1, 1]) {   // a leaflet pair
          const dx = nx - px, dy = ny - py, dl = Math.hypot(dx, dy) || 1, qx = -dy / dl * sd, qy = dx / dl * sd;
          x.beginPath(); x.moveTo(nx, ny); x.quadraticCurveTo(nx + qx * lw * 0.7 + dx * 0.5, ny + qy * lw * 0.7 + dy * 0.5, nx + qx * lw + dx * 0.9, ny + qy * lw + dy * 0.9 + lw * 0.3);
          x.quadraticCurveTo(nx + qx * lw * 0.3 + dx, ny + qy * lw * 0.3 + dy, nx, ny); x.fill();
        }
        x.strokeStyle = rgbD(v * 0.6, 0, 0); x.lineWidth = s * 0.008; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
        px = nx; py = ny;
      }
      if (f.d > 0.6) { x.strokeStyle = rgbD(0.03, 1, 0); x.lineWidth = s * 0.006; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 6, py + 4); x.stroke(); }
    }
    x.restore();
  }
  return dataTex(c);
}
// willowAtlas: curtains of hanging strands with leaf dabs, tall cards (base at the TOP: place centred)
export function willowAtlas(o = {}) {
  const cells = o.cells ?? 4, w = o.size ?? 256, h = w * 2, rng = mulb(o.seed ?? 51);
  const [c, x] = mkCanvas(w * cells, h);
  for (let i = 0; i < cells; i++) {
    x.save(); x.beginPath(); x.rect(i * w + 3, 0, w - 6, h); x.clip();
    const n = 30 + Math.floor(rng() * 10), S = [];
    for (let k = 0; k < n; k++) S.push({ x0: i * w + w * (0.08 + rng() * 0.84), len: h * (0.4 + rng() * 0.58), sway: (rng() - 0.5) * w * 0.18, d: rng() });
    S.sort((a, b) => a.d - b.d);
    for (const st of S) {
      const v0 = 0.25 + st.d * 0.6;
      x.strokeStyle = rgbD(v0 * 0.6, 0, 0); x.lineWidth = w * 0.006; x.beginPath(); x.moveTo(st.x0, 2); x.quadraticCurveTo(st.x0, st.len * 0.5, st.x0 + st.sway, st.len); x.stroke();
      const segs = 34;
      for (let j = 1; j < segs; j++) {
        const t = j / segs, px = st.x0 + st.sway * t * t, py = 2 + st.len * t;
        const v = clamp(v0 * (1.05 - t * 0.35) + (rng() - 0.5) * 0.2, 0.03, 1);
        x.fillStyle = rgbD(v, 0, rng() < 0.25 ? 1 : 0);
        for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(px + sd * w * 0.011, py + w * 0.01, w * 0.006, w * 0.026, sd * 0.4, 0, TAU); x.fill(); }
      }
    }
    x.restore();
  }
  return dataTex(c);
}
// leafDabAtlas: a few loose fallen leaves for ground scatter (flat cards lying on the ground use their own mesh)
export function noiseTex(o = {}) {   // generic tileable painterly value texture (sRGB multiplier)
  const s = o.size ?? 256, rng = mulb(o.seed ?? 3), [c, x] = mkCanvas(s, s);
  x.fillStyle = o.bg ?? '#eaeaea'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < (o.n ?? 300); i++) {
    const v = (o.lo ?? 0.7) + rng() * ((o.hi ?? 1) - (o.lo ?? 0.7)), px = rng() * s, py = rng() * s, r = s * (o.r ?? 0.03) * (0.5 + rng());
    x.fillStyle = `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { x.beginPath(); x.ellipse(px + ox, py + oy, r * (o.ax ?? 1.6), r, o.rot ?? 0, 0, TAU); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
export function canvasTex(w, h, draw, o = {}) {
  const [c, x] = mkCanvas(w, h); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// ------------------------------------------------------------ painted ground shader (vertex colour albedo, brush dabs,
// optional dappled sun through a canopy, painted fallen leaves), id GROUND
const GROUND_FS = /* glsl */ `
${A.GLSL.NOISE}
${A.GLSL.GLOBAL_PARS}
uniform float uDapple, uDapScale, uLeaves, uDab, uId; uniform vec3 uDapCol, uLeafA, uLeafB, uShadeC;
void main(){
  vec3 N = normalize(vNW), NV = normalize(vNV);
  vec3 col = vColor;
  float f1 = vnoise3(vW * 1.7), f2 = vnoise3(vW * 6.0 + 3.0), f3 = vnoise3(vW * 19.0 + 7.0);
  col *= 1.0 - uDab * 0.5 + uDab * (0.45 * f1 + 0.35 * f2 + 0.2 * f3) * 1.0;
  col = mix(col, col * vec3(1.06, 0.97, 0.92), smoothstep(0.6, 0.8, f2) * uDab);
  float ndl = dot(N, normalize(uSunDir));
  float lit = clamp(ndl * 0.7 + 0.45 + (fbm3(vW * 0.8) - 0.5) * 0.3, 0.0, 1.0);
  vec3 sh = mix(uShadeC, col * uAmbient, 0.55);
  vec3 c = mix(sh, col * uSunColor, lit);
  if(uLeaves > 0.0){   // painted fallen maple leaves: small warm dabs
    vec2 g = vW.xz * 7.0; vec2 cell = floor(g); vec2 fr = fract(g) - 0.5;
    float h = hash12(cell);
    vec2 off = vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5;
    float d = length((fr - off * 0.5) * vec2(1.0, 1.6));
    float leaf = step(1.0 - uLeaves, h) * smoothstep(0.2, 0.15, d + (vnoise(vW.xz * 60.0) - 0.5) * 0.08);
    c = mix(c, mix(uLeafA, uLeafB, hash12(cell + 1.3)) * mix(0.75, 1.1, lit), leaf * N.y);
  }
  if(uDapple > 0.0){   // dappled sun through the canopy
    vec2 q = vW.xz * uDapScale + vec2(vW.y * 0.4, 0.0);
    float d = fbm2(q) + 0.35 * vnoise(q * 3.1 + 5.0);
    float sp = smoothstep(0.64, 0.68, d);
    c = mix(c, c * uDapCol, sp * uDapple * clamp(N.y * 1.2, 0.0, 1.0));
  }
  if(uBlob.z > 0.0) c = mix(c, c * uBlobColor, blobShadow());
  writeOut(c, 0.0, NV, vDepth, uId);
}
`;
export function groundMaterial(o = {}) {
  return A.animeShader({
    uDapple: { value: o.dapple ?? 0 }, uDapScale: { value: o.dapScale ?? 0.35 }, uDapCol: { value: new THREE.Color(o.dapCol ?? '#ffe7a8') },
    uLeaves: { value: o.leaves ?? 0 }, uLeafA: { value: new THREE.Color(o.leafA ?? '#d8402a') }, uLeafB: { value: new THREE.Color(o.leafB ?? '#f09a30') },
    uDab: { value: o.dab ?? 0.5 }, uId: { value: o.id ?? A.ID.GROUND }, uShadeC: { value: new THREE.Color(o.shade ?? '#5a5880') },
  }, GROUND_FS, { vertexColors: true, side: o.side ?? THREE.FrontSide });
}

// ------------------------------------------------------------ mist: soft painted card, alpha-blended into the colour target
// only (data target untouched, so the Kuwahara pass paints the mist into the background underneath)
const MIST_FS = /* glsl */ `
${A.GLSL.NOISE}
${A.GLSL.GLOBAL_PARS}
uniform vec3 uColor, uColor2; uniform float uAmt, uDrift, uId, uScale;
void main(){
  vec2 uv = vUv;
  float edge = smoothstep(0.0, 0.25, uv.x) * smoothstep(1.0, 0.75, uv.x) * smoothstep(0.0, 0.35, uv.y) * smoothstep(1.0, 0.45, uv.y);
  float n = fbm2(vec2(vW.x * uScale + uDrift, vW.z * uScale * 1.2 + vW.y * uScale * 2.0)) ;
  float a = clamp(edge * smoothstep(0.32, 0.75, n) * uAmt, 0.0, 1.0);
  if(a < 0.004) discard;
  vec3 c = mix(uColor2, uColor, uv.y);
  oColor = vec4(c, a); oData = vec4(0.0);   // blended over the colour; data alpha 0 keeps the depth / id underneath
}
`;
export function mistMaterial(o = {}) {
  const m = A.animeShader({ uColor: { value: new THREE.Color(o.color ?? '#fff1e4') }, uColor2: { value: new THREE.Color(o.color2 ?? o.color ?? '#e8d8f0') },
    uAmt: { value: o.amount ?? 0.7 }, uDrift: { value: 0 }, uId: { value: A.ID.CLOUD }, uScale: { value: o.scale ?? 0.12 } }, MIST_FS, { side: THREE.DoubleSide });
  m.transparent = true; m.depthWrite = false; m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  return m;
}

// ------------------------------------------------------------ curved tiled roof (irimoya-ish hip with upturned corners)
// roofGeo({L, D, rise, over, up, sag, segU, segV}) centred at the ridge (y = 0), eaves at y = -rise; four sloped faces.
// u along the eave, v ridge -> eave. Returns geometry with uv (u in metres along eave, v in metres down the slope).
export function roofGeo(o = {}) {
  const L = o.L ?? 10, D = o.D ?? 6, rise = o.rise ?? 3, up = o.up ?? 0.6, sag = o.sag ?? 0.45, over = o.over ?? 1.2;
  const nu = o.segU ?? 24, nv = o.segV ?? 10, ridgeL = o.ridge ?? L * 0.55;
  const pos = [], uvs = [], idx = [];
  // a face is a quad strip from ridge segment to eave edge; four faces: front (+z), back (-z), left (-x), right (+x)
  const face = (eaveA, eaveB, rA, rB, dir) => {
    const base = pos.length / 3;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const top = rA.clone().lerp(rB, u), bot = eaveA.clone().lerp(eaveB, u);
        const p = top.clone().lerp(bot, v);
        const cu = Math.abs(u - 0.5) * 2;
        // concave sag in the slope, upturned corners at the eave
        p.y = -rise * v + sag * Math.sin(v * Math.PI) * 0.9 * (1 - 0.3 * cu) + up * Math.pow(cu, 3.5) * v * v;
        pos.push(p.x, p.y, p.z);
        uvs.push(u * eaveA.distanceTo(eaveB), v * (rise + D / 2) * 1.0);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (dir) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  };
  const hx = L / 2 + over, hz = D / 2 + over, rx = ridgeL / 2;
  const E = (x, z) => V3(x, -rise, z), R = (x) => V3(x, 0, 0);
  face(E(-hx, hz), E(hx, hz), R(-rx), R(rx), true);     // front
  face(E(hx, -hz), E(-hx, -hz), R(rx), R(-rx), true);   // back
  face(E(hx, hz), E(hx, -hz), R(rx), R(rx), true);      // right hip
  face(E(-hx, -hz), E(-hx, hz), R(-rx), R(-rx), true);  // left hip
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
// tileTex: rows of round tiles running down the slope (u across, v down); sRGB multiplier, repeat in metres via uv
export function tileTex(o = {}) {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    const cols = 4;
    for (let i = 0; i < cols; i++) {
      const cx = (i + 0.5) * w / cols;
      const g = x.createLinearGradient(cx - w / cols / 2, 0, cx + w / cols / 2, 0);
      g.addColorStop(0, '#9a9aa8'); g.addColorStop(0.25, '#ffffff'); g.addColorStop(0.6, '#e2e2ea'); g.addColorStop(0.92, '#8a8a9c'); g.addColorStop(1, '#6e6e80');
      x.fillStyle = g; x.fillRect(cx - w / cols / 2, 0, w / cols, h);
    }
    for (let j = 0; j < 4; j++) { x.fillStyle = 'rgba(70,70,90,0.55)'; x.fillRect(0, j * h / 4, w, 2); }
  });
}
// heightMesh(x0, x1, z0, z1, nx, nz, h(x, z), col(x, z, y, nrm) -> Color, warp?) -> indexed geometry with vertex colours
export function heightMesh(x0, x1, z0, z1, nx, nz, h, col, warp = null) {
  const g = new THREE.PlaneGeometry(1, 1, nx, nz); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = lerp(x0, x1, p.getX(i) + 0.5), z = lerp(z0, z1, p.getZ(i) + 0.5);
    if (warp) [x, z] = warp(x, z);
    p.setXYZ(i, x, h(x, z), z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, C = new Float32Array(p.count * 3), v = V3(), w = V3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); w.fromBufferAttribute(n, i); const c = col(v.x, v.z, v.y, w); C.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.computeBoundingSphere();
  return g;
}
// maple leaf mesh (flat star with a slight cup), for floating / falling leaves
export function leafGeo(size = 0.06) {
  const sh = new THREE.Shape(); const pts = 5;
  for (let i = 0; i <= pts * 2; i++) {
    const a = i / (pts * 2) * TAU + Math.PI / 2, rr = i % 2 ? 0.4 : (i === 0 || i === pts * 2 ? 1 : (i === 2 || i === 8 ? 0.88 : 0.62));
    const x = Math.cos(a) * rr * size, y = Math.sin(a) * rr * size;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, (x * x + z * z) / (size * size) * size * 0.25); }
  g.computeVertexNormals(); return g;
}
// ------------------------------------------------------------ light shafts: additive painted beams (colour target only, main camera only)
const SHAFT_FS = /* glsl */ `
${A.GLSL.NOISE}
${A.GLSL.GLOBAL_PARS}
uniform vec3 uColor; uniform float uAmt, uSeed;
void main(){
  vec2 uv = vUv;
  float across = smoothstep(0.0, 0.32, uv.x) * smoothstep(1.0, 0.68, uv.x);
  float along = smoothstep(0.0, 0.45, uv.y) * smoothstep(1.0, 0.8, uv.y);
  float streak = 0.4 + 0.6 * smoothstep(0.25, 0.75, vnoise(vec2(uv.x * 7.0 + uSeed, uv.y * 0.8 + uSeed * 0.3)));
  vec3 V = normalize(cameraPosition - vW);
  float face = abs(dot(normalize(vNW), V));
  float a = across * along * streak * uAmt * smoothstep(0.05, 0.35, face) * smoothstep(0.3, 2.5, vDepth);
  if(a < 0.003) discard;
  oColor = vec4(uColor * a, 0.0); oData = vec4(0.0);
}
`;
export function shaftMaterial(o = {}) {
  const m = A.animeShader({ uColor: { value: new THREE.Color(o.color ?? '#ffd8a0') }, uAmt: { value: o.amount ?? 0.3 }, uSeed: { value: o.seed ?? 0 } }, SHAFT_FS, { side: THREE.DoubleSide });
  m.transparent = true; m.depthWrite = false; m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  return m;
}
// shafts(G, list, dir, o): beams of light along -dir (dir points TO the sun). list: [{at: V3 (where the beam lands / passes), len, w, amt}]
export function addShafts(G, list, dir, o = {}) {
  const sd = dir.clone().normalize(), out = [];
  list.forEach((s, i) => {
    const m = shaftMaterial({ color: o.color, amount: s.amt ?? o.amount ?? 0.25, seed: i * 3.7 });
    const g = new THREE.PlaneGeometry(s.w, s.len); g.translate(0, s.len / 2, 0);   // y up along the beam, top = towards the sun
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(s.at);
    mesh.quaternion.setFromUnitVectors(V3(0, 1, 0), sd);
    mesh.rotateY(s.twist ?? (i * 1.3));   // vary the beam's facing around its axis
    mesh.layers.set(1); mesh.renderOrder = 5; mesh.frustumCulled = false;
    G.add(mesh); out.push(mesh);
    if (o.cross) { const m2 = mesh.clone(); m2.rotateY(Math.PI / 2); m2.layers.set(1); G.add(m2); out.push(m2); }
  });
  return out;
}

// ------------------------------------------------------------ cast shadows from a painted heightmap (houses, crowns)
// shadowCaster({x0, z0, x1, z1, res}) -> S: S.box(min, max) / S.disc(c, r, y0, y1) rasterise occluders (bottom/top height in
// m, max 25.5); S.finish() uploads; S.patch(mat, card) injects the shadow into an anime material (before its first render):
// a ray from the shaded point toward S.sun marches the heightmap; inside an occluder the colour is multiplied by S.tint.
const SHADOW_GLSL = /* glsl */ `
uniform sampler2D uVShMap; uniform vec4 uVShBox; uniform vec3 uVShSun, uVShTint; uniform float uVShAmt, uVShCard;
float valeShadow(vec3 p){
  vec3 s = normalize(uVShSun); float hl = max(length(s.xz), 1e-3); vec3 stp = s / hl;
  float t = 0.15 + vnoise3(p * 2.5) * 0.2;
  for(int i = 0; i < 40; i++){
    vec3 q = p + stp * t;
    vec2 uv = (q.xz - uVShBox.xy) * uVShBox.zw;
    if(uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || q.y > 25.0) break;
    vec2 h = texture(uVShMap, uv).rg * 25.5;
    if(q.y > h.x && q.y < h.y) return 1.0;
    t = t * 1.1 + 0.1;
  }
  return 0.0;
}
vec3 valeShade(vec3 c){
  if(uVShAmt <= 0.0) return c;
  vec3 N = normalize(vNW); if(!gl_FrontFacing) N = -N;
  vec3 s = normalize(uVShSun);
  float facing = uVShCard > 0.5 ? 1.0 : smoothstep(-0.02, 0.1, dot(N, s));
  if(facing <= 0.0) return c;
  vec3 p = vW + (uVShCard > 0.5 ? vec3(0.0) : N * 0.4);
  float sh = valeShadow(p) * facing;
  return mix(c, c * uVShTint, sh * uVShAmt);
}
`;
export function shadowCaster(o) {
  const res = o.res ?? 0.4, W = Math.ceil((o.x1 - o.x0) / res), H = Math.ceil((o.z1 - o.z0) / res);
  const data = new Uint8Array(W * H * 4);
  const put = (i, j, y0, y1) => {
    if (i < 0 || j < 0 || i >= W || j >= H) return; const k = (j * W + i) * 4;
    const b = clamp(Math.floor(y0 * 10), 0, 255); data[k] = data[k + 1] === 0 ? b : Math.min(data[k], b); data[k + 1] = Math.max(data[k + 1], clamp(Math.ceil(y1 * 10), 0, 255));
  };
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.NoColorSpace;
  const S = {
    uVShMap: { value: tex }, uVShBox: { value: new THREE.Vector4(o.x0, o.z0, 1 / (o.x1 - o.x0), 1 / (o.z1 - o.z0)) },
    uVShSun: { value: (o.sun ?? V3(0, 1, 0)).clone().normalize() }, uVShTint: { value: new THREE.Color(o.tint ?? '#9a96d0') }, uVShAmt: { value: o.amount ?? 1 },
  };
  const bb = new THREE.Box3();
  S.box = (min, max) => {
    const i0 = Math.floor((min.x - o.x0) / res), i1 = Math.floor((max.x - o.x0) / res), j0 = Math.floor((min.z - o.z0) / res), j1 = Math.floor((max.z - o.z0) / res);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) put(i, j, min.y, max.y);
  };
  S.part = (geo, m) => { if (!geo.boundingBox) geo.computeBoundingBox(); bb.copy(geo.boundingBox).applyMatrix4(m ?? new THREE.Matrix4()); S.box(bb.min, bb.max); };
  S.disc = (c, rx, rz, y0, y1) => {
    const i0 = Math.floor((c.x - rx - o.x0) / res), i1 = Math.floor((c.x + rx - o.x0) / res), j0 = Math.floor((c.z - rz - o.z0) / res), j1 = Math.floor((c.z + rz - o.z0) / res);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = o.x0 + (i + 0.5) * res, z = o.z0 + (j + 0.5) * res, d = ((x - c.x) / rx) ** 2 + ((z - c.z) / rz) ** 2;
      if (d < 1 - 0.25 * vnoise(x * 1.7, z * 1.7) && vnoise(x * 3.1 + 7, z * 3.1) < 0.74) put(i, j, y0, y1);
    }
  };
  S.finish = () => { tex.needsUpdate = true; return S; };
  S.patch = (mat, card = false) => {
    if (!mat || !mat.fragmentShader || mat.userData.valeShadow) return mat;
    const key = 'void writeOut(vec3 c, float emis, vec3 nV, float depth, float id){';
    if (!mat.fragmentShader.includes(key)) return mat;
    for (const k of ['uVShMap', 'uVShBox', 'uVShSun', 'uVShTint', 'uVShAmt']) mat.uniforms[k] = S[k];
    mat.uniforms.uVShCard = { value: card ? 1 : 0 };
    mat.fragmentShader = mat.fragmentShader.replace(key, SHADOW_GLSL + key + '\n  c = valeShade(c);');
    mat.userData.valeShadow = true; mat.needsUpdate = true;
    return mat;
  };
  return S;
}

// ------------------------------------------------------------ rocks with cracks, moss patches and chiselled planes
// rockTex(): tileable crack + lichen map (sRGB multiplier) for rock cels (sphere uv)
let _rockTex = null;
export function rockTex() {
  if (_rockTex) return _rockTex;
  _rockTex = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    const r = mulb(909);
    // soft value patches (weathering)
    for (let i = 0; i < 140; i++) { const px = r() * w, py = r() * h, rr = 8 + r() * 30, v = 0.86 + r() * 0.14; x.fillStyle = `rgba(${v * 255 | 0},${v * 250 | 0},${v * 252 | 0},0.55)`;
      for (const ox of [-w, 0, w]) { x.beginPath(); x.ellipse(px + ox, py, rr * 1.6, rr, r() * 3, 0, TAU); x.fill(); } }
    // lichen dots
    for (let i = 0; i < 26; i++) { const cx0 = r() * w, cy0 = r() * h, col = r() < 0.5 ? 'rgba(236,232,206,0.55)' : 'rgba(196,200,150,0.5)';
      for (let k = 0; k < 18; k++) { x.fillStyle = col; x.fillRect(cx0 + (r() - 0.5) * 22, cy0 + (r() - 0.5) * 12, 1 + r() * 1.6, 1 + r() * 1.2); } }
    // cracks: wandering ink lines with a light lip on one side
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (let i = 0; i < 16; i++) {
      let px = r() * w, py = r() * h, a = r() * TAU; const n = 6 + Math.floor(r() * 10), pts = [[px, py]];
      for (let k = 0; k < n; k++) { a += (r() - 0.5) * 1.1; const l = 5 + r() * 12; px += Math.cos(a) * l; py += Math.sin(a) * l * 0.7; pts.push([px, py]); }
      for (const ox of [-w, 0, w]) {
        x.strokeStyle = 'rgba(255,255,250,0.7)'; x.lineWidth = 2.2; x.beginPath(); pts.forEach(([u, v], k) => (k ? x.lineTo(u + ox + 1.2, v + 1.2) : x.moveTo(u + ox + 1.2, v + 1.2))); x.stroke();
        x.strokeStyle = 'rgba(52,44,66,0.92)'; x.lineWidth = 1.2 + r() * 1.3; x.beginPath(); pts.forEach(([u, v], k) => (k ? x.lineTo(u + ox, v) : x.moveTo(u + ox, v))); x.stroke();
        if (r() < 0.6) { const [u, v] = pts[Math.floor(pts.length / 2)]; x.lineWidth = 0.9; x.beginPath(); x.moveTo(u + ox, v); x.lineTo(u + ox + (r() - 0.5) * 22, v + (r() - 0.5) * 16); x.stroke(); }
      }
    }
  });
  return _rockTex;
}
// rockMaterial(o): cel + ink rock with the crack map over the vertex colours (rockColor)
export function rockMaterial(o = {}) {
  return A.celMaterial({ base: '#ffffff', shade: o.shade ?? '#9a96c0', vertexColors: true, map: rockTex(), id: A.ID.PROP, highlight: o.highlight ?? 0.18, hiSize: 0.965,
    rimColor: o.rimColor ?? '#ffe2b8', rimWidth: 0.2, wobble: 1.5 });
}
// rockGeo2(rng, o): rockGeo + several random chiselled planes (drawn creases where they meet) and a strata ledge
export function rockGeo2(rng, o = {}) {
  const g = new THREE.SphereGeometry(1, o.ws ?? 26, o.hs ?? 16);
  const p = g.attributes.position, s = rng() * 100, rough = o.rough ?? 0.3, v = V3();
  const planes = []; const np = o.planes ?? 5;
  for (let k = 0; k < np; k++) { const a = rng() * TAU, el = (rng() - 0.25) * 1.2; planes.push({ n: V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize(), d: 0.55 + rng() * 0.3 }); }
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let r = 1 + rough * (vn3(v.x * 1.3 + s, v.y * 1.3, v.z * 1.3) - 0.5) * 2 + rough * 0.3 * (vn3(v.x * 3.5, v.y * 3.5 + s, v.z * 3.5) - 0.5);
    v.multiplyScalar(r);
    for (const pl of planes) { const dd = v.dot(pl.n) - pl.d; if (dd > 0) v.addScaledVector(pl.n, -dd * 0.92); }   // cut: flat faces
    const fl = o.flat ?? 0.35; if (v.y < -fl) v.y = -fl + (v.y + fl) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
// rockColor2: rockColor + patchy hard-edged moss with a dark moss underside and lit moss tips
export function rockColor2(o = {}) {
  const base = rockColor({ ...o, mossAmt: 0 });
  const moss = new THREE.Color(o.moss ?? '#5f8a3a'), moss2 = new THREE.Color(o.moss2 ?? '#a8b44a'), mossD = new THREE.Color(o.mossDark ?? '#3e5a34'), c = new THREE.Color();
  const amt = o.mossAmt ?? 1;
  return (p, n) => {
    c.copy(base(p, n));
    const patch = fbm(p.x * 2.6 + p.y * 0.8, p.z * 2.6 - p.y * 0.5, 3) + n.y * 0.55 - 0.15;
    const m = sstep(0.62, 0.66, patch) * amt, edge = sstep(0.58, 0.62, patch) * (1 - sstep(0.62, 0.66, patch)) * amt;
    if (edge > 0) c.lerp(mossD, edge * 0.6);
    if (m > 0) c.lerp(moss.clone().lerp(moss2, sstep(0.45, 0.7, vnoise(p.x * 9, p.z * 9 + p.y * 5)) * 0.8), m);
    return c;
  };
}

// ------------------------------------------------------------ TOWN painters: canal stone, wood planks, plaster, roof tiles
// stoneWallTex(): 16 m x 2.5 m of canal wall (u = -z / 16, v = (y + 1.4) / 2.5): block courses with ink joints and bevel light,
// moss under the coping and in the joints near the water, water stains running down, wet dark band + algae line at y = 0
export function stoneWallTex(o = {}) {
  const W = 2048, H = 320, ppm = 128, wl = H - (1.4 + (o.waterY ?? 0)) * ppm;   // v = 0 at the bottom (canvas y = H)
  return canvasTex(W, H, (x) => {
    const r = mulb(o.seed ?? 17);
    x.fillStyle = '#cfc6b8'; x.fillRect(0, 0, W, H);
    let y = 0;
    while (y < H) {
      const rh = Math.round((0.3 + r() * 0.14) * ppm); let px = -r() * 80;
      while (px < W) {
        const bw = (0.5 + r() * 0.65) * ppm, v = 0.8 + r() * 0.2, warm = r() * 0.06;
        x.fillStyle = `rgb(${(v + warm) * 222 | 0},${v * 212 | 0},${(v - warm) * 200 | 0})`; x.fillRect(px + 2, y + 2, bw - 4, rh - 4);
        // chisel texture: a few darker / lighter dabs inside the block
        for (let k = 0; k < 6; k++) { const dv = r() < 0.5 ? 'rgba(90,80,96,0.12)' : 'rgba(255,250,236,0.18)'; x.fillStyle = dv; x.beginPath(); x.ellipse(px + 6 + r() * (bw - 12), y + 6 + r() * (rh - 12), 4 + r() * 12, 2 + r() * 5, 0, 0, TAU); x.fill(); }
        // bevel: light top edge, dark bottom edge
        x.fillStyle = 'rgba(255,248,230,0.45)'; x.fillRect(px + 3, y + 3, bw - 6, 3);
        x.fillStyle = 'rgba(60,50,70,0.3)'; x.fillRect(px + 3, y + rh - 6, bw - 6, 3);
        // ink joints (broken line)
        x.strokeStyle = 'rgba(48,40,58,0.85)'; x.lineWidth = 2.2;
        x.beginPath(); x.moveTo(px + 1, y + 1 + r() * 2); x.lineTo(px + 1, y + rh - 1); x.stroke();
        if (r() < 0.12) { x.lineWidth = 1.2; x.beginPath(); const cx0 = px + r() * bw; x.moveTo(cx0, y + 2); x.lineTo(cx0 + (r() - 0.5) * 20, y + rh * (0.4 + r() * 0.5)); x.stroke(); }   // crack
        px += bw;
      }
      x.strokeStyle = 'rgba(48,40,58,0.85)'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(0, y + 1); for (let u = 0; u <= W; u += 32) x.lineTo(u, y + 1 + (r() - 0.5) * 1.5); x.stroke();
      y += rh;
    }
    // water stains running down from the coping
    for (let i = 0; i < 70; i++) {
      const sx = r() * W, len = (0.4 + r() * 1.3) * ppm, wd = 6 + r() * 26, a = 0.08 + r() * 0.16;
      const g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, `rgba(70,62,60,${a})`); g.addColorStop(1, 'rgba(70,62,60,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx + wd, 0); x.lineTo(sx + wd * 0.6 + (r() - 0.5) * 8, len); x.lineTo(sx + wd * 0.3, len); x.closePath(); x.fill();
    }
    // wet dark band below the waterline (+ a little above), algae line
    const g2 = x.createLinearGradient(0, wl - 0.35 * ppm, 0, H); g2.addColorStop(0, 'rgba(50,60,56,0)'); g2.addColorStop(0.28, 'rgba(50,62,58,0.42)'); g2.addColorStop(1, 'rgba(30,44,46,0.7)');
    x.fillStyle = g2; x.fillRect(0, wl - 0.35 * ppm, W, H);
    for (let u = 0; u < W; u += 3) { const hh = 4 + vnoise(u * 0.05, 1) * 14 + r() * 3; x.fillStyle = 'rgba(96,120,62,0.55)'; x.fillRect(u, wl - 2 - hh * 0.4, 3, hh); }
    // moss under the coping and near the water: clusters of tiny dabs (dark under, lit tips) + a few hanging strands
    for (let i = 0; i < 70; i++) {
      const top = r() < 0.55, cx0 = r() * W, cy0 = top ? 6 + r() * 0.2 * ppm : wl - (0.08 + r() * 0.45) * ppm, rad = 8 + r() * 26;
      for (let k = 0; k < 40; k++) {
        const a = r() * TAU, d = Math.sqrt(r()) * rad, px = cx0 + Math.cos(a) * d * 1.6, py = cy0 + Math.sin(a) * d * 0.6;
        const lit = (py < cy0 ? 0.6 : 0.2) + r() * 0.4;
        x.fillStyle = lit < 0.35 ? 'rgba(58,82,46,0.85)' : lit < 0.7 ? 'rgba(104,138,58,0.85)' : 'rgba(170,186,86,0.85)';
        x.fillRect(px, py, 1.5 + r() * 2.5, 1 + r() * 2);
      }
      if (top && r() < 0.6) for (let k = 0; k < 4; k++) { const sx = cx0 + (r() - 0.5) * rad * 2, l = 10 + r() * 34; x.strokeStyle = 'rgba(80,110,52,0.7)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(sx, cy0); x.quadraticCurveTo(sx + 3, cy0 + l * 0.6, sx + 1, cy0 + l); x.stroke(); }
    }
  });
}
// ashlarTex(): 1 m x 1 m tileable dressed stone (3 courses) with ink joints, bevel light, lichen + a few cracks (uv in metres)
export function ashlarTex(o = {}) {
  return canvasTex(256, 256, (x, w, h) => {
    const r = mulb(o.seed ?? 29), rows = o.rows ?? 3, rh = h / rows;
    x.fillStyle = '#d6cec2'; x.fillRect(0, 0, w, h);
    for (let j = 0; j < rows; j++) {
      let px = r() * 60; const y = j * rh, starts = [];
      while (px < w + 60) { starts.push(px); px += 70 + r() * 70; }
      for (let k = 0; k < starts.length - 1; k++) {
        const x0 = starts[k], bw = starts[k + 1] - x0, v = 0.8 + r() * 0.2;
        for (const ox of [-w, 0]) {
          x.fillStyle = `rgb(${(v + 0.03) * 226 | 0},${v * 216 | 0},${(v - 0.02) * 204 | 0})`; x.fillRect(x0 + ox + 2, y + 2, bw - 4, rh - 4);
          x.fillStyle = 'rgba(255,248,232,0.45)'; x.fillRect(x0 + ox + 3, y + 3, bw - 6, 3);
          x.fillStyle = 'rgba(60,50,70,0.3)'; x.fillRect(x0 + ox + 3, y + rh - 6, bw - 6, 3);
          x.fillStyle = 'rgba(46,38,56,0.85)'; x.fillRect(x0 + ox, y, 2, rh);
        }
      }
      x.fillStyle = 'rgba(46,38,56,0.85)'; x.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 90; i++) { x.fillStyle = r() < 0.5 ? 'rgba(236,232,206,0.7)' : 'rgba(150,170,90,0.5)'; x.beginPath(); x.arc(r() * w, r() * h, 1 + r() * 2.5, 0, TAU); x.fill(); }
    x.strokeStyle = 'rgba(52,44,66,0.75)'; x.lineWidth = 1.1;
    for (let i = 0; i < 3; i++) { let px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 18; py += (r() - 0.3) * 14; x.lineTo(px, py); } x.stroke(); }
  });
}
// woodTex2(): weathered vertical planks with grain, knots, seams in ink and a darker splash band at the bottom (box uv 0..1)
export function woodTex2(o = {}) {
  return canvasTex(256, 256, (x, w, h) => {
    const r = mulb(o.seed ?? 31);
    x.fillStyle = '#e8e0d8'; x.fillRect(0, 0, w, h);
    const n = o.planks ?? 9, pw = w / n;
    for (let i = 0; i < n; i++) {
      const v = 0.82 + r() * 0.18; x.fillStyle = `rgb(${v * 240 | 0},${v * 228 | 0},${v * 218 | 0})`; x.fillRect(i * pw, 0, pw, h);
      for (let k = 0; k < 7; k++) {   // grain: wavy thin darker lines
        const gx = i * pw + 2 + r() * (pw - 4); x.strokeStyle = `rgba(80,60,60,${0.12 + r() * 0.18})`; x.lineWidth = 0.8 + r();
        x.beginPath(); x.moveTo(gx, 0); for (let yy = 0; yy <= h; yy += 16) x.lineTo(gx + Math.sin(yy * 0.05 + k + i) * 1.6, yy); x.stroke();
      }
      if (r() < 0.4) { const ky = r() * h, kx = i * pw + pw / 2; x.strokeStyle = 'rgba(60,40,44,0.5)'; x.lineWidth = 1; x.beginPath(); x.ellipse(kx, ky, 2.5, 5, 0, 0, TAU); x.stroke(); }
      x.fillStyle = 'rgba(40,30,40,0.75)'; x.fillRect(i * pw, 0, 1.6, h);   // seam
    }
    const g = x.createLinearGradient(0, h * 0.82, 0, h); g.addColorStop(0, 'rgba(50,40,50,0)'); g.addColorStop(1, 'rgba(50,40,50,0.4)'); x.fillStyle = g; x.fillRect(0, h * 0.82, w, h * 0.18);
    const g2 = x.createLinearGradient(0, 0, 0, h * 0.12); g2.addColorStop(0, 'rgba(40,36,70,0.45)'); g2.addColorStop(1, 'rgba(40,36,70,0)'); x.fillStyle = g2; x.fillRect(0, 0, w, h * 0.12);
  });
}
// plasterTex(): white plaster with an eave shadow at the top, rain streaks, a grey splash band at the foot, a few cracks and
// a patch where the plaster fell off (lath showing)
export function plasterTex(o = {}) {
  return canvasTex(256, 256, (x, w, h) => {
    const r = mulb(o.seed ?? 61);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(${200 + r() * 40 | 0},${196 + r() * 40 | 0},${190 + r() * 40 | 0},0.18)`; x.beginPath(); x.ellipse(r() * w, r() * h, 10 + r() * 30, 6 + r() * 20, r() * 3, 0, TAU); x.fill(); }
    for (let i = 0; i < 16; i++) { const sx = r() * w, len = h * (0.15 + r() * 0.45), wd = 3 + r() * 10, g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(120,110,110,0.28)'); g.addColorStop(1, 'rgba(120,110,110,0)'); x.fillStyle = g; x.fillRect(sx, h * 0.1, wd, len); }
    const g = x.createLinearGradient(0, 0, 0, h * 0.22); g.addColorStop(0, 'rgba(70,62,110,0.62)'); g.addColorStop(0.5, 'rgba(90,80,130,0.25)'); g.addColorStop(1, 'rgba(90,80,130,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h * 0.22);
    const g2 = x.createLinearGradient(0, h * 0.78, 0, h); g2.addColorStop(0, 'rgba(110,100,96,0)'); g2.addColorStop(1, 'rgba(110,100,96,0.45)'); x.fillStyle = g2; x.fillRect(0, h * 0.78, w, h * 0.22);
    for (let u = 0; u < w; u += 4) { const hh = 6 + r() * 14; x.fillStyle = 'rgba(120,110,104,0.22)'; x.fillRect(u, h - hh - 18, 4, hh); }
    x.strokeStyle = 'rgba(70,60,80,0.6)'; x.lineWidth = 1;
    for (let i = 0; i < 4; i++) { let px = r() * w, py = h * (0.3 + r() * 0.5); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 14; py += 4 + r() * 8; x.lineTo(px, py); } x.stroke(); }
    if (r() < 0.9) { const px = w * (0.15 + r() * 0.6), py = h * (0.5 + r() * 0.25), pw = 18 + r() * 22, ph = 10 + r() * 14;
      x.fillStyle = '#b89a7e'; x.beginPath(); x.ellipse(px, py, pw, ph, 0.2, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(80,60,50,0.8)'; x.lineWidth = 1.5; for (let k = -3; k <= 3; k++) { x.beginPath(); x.moveTo(px - pw * 0.8, py + k * 3.4); x.lineTo(px + pw * 0.8, py + k * 3.4); x.stroke(); }
      x.strokeStyle = 'rgba(60,50,70,0.85)'; x.lineWidth = 1.6; x.beginPath(); x.ellipse(px, py, pw, ph, 0.2, 0, TAU); x.stroke(); }
  });
}
// tileTex2(): rows of round hongawara tiles with ink valleys and overlap lines, lit crests (u across in m, v down the slope in m)
export function tileTex2() {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    const cols = 4, rows = 3;
    for (let i = 0; i < cols; i++) {
      const cx0 = (i + 0.5) * w / cols, cw = w / cols;
      const g = x.createLinearGradient(cx0 - cw / 2, 0, cx0 + cw / 2, 0);
      g.addColorStop(0, '#6c6a7e'); g.addColorStop(0.2, '#d8d8e2'); g.addColorStop(0.4, '#ffffff'); g.addColorStop(0.7, '#cfcfdc'); g.addColorStop(0.95, '#7a7890'); g.addColorStop(1, '#4a4860');
      x.fillStyle = g; x.fillRect(cx0 - cw / 2, 0, cw, h);
      x.fillStyle = 'rgba(30,26,44,0.9)'; x.fillRect(cx0 + cw / 2 - 2, 0, 2, h);   // ink valley
    }
    for (let j = 0; j < rows; j++) {
      const y0 = (j + 1) * h / rows;
      x.fillStyle = 'rgba(30,26,44,0.75)'; x.fillRect(0, y0 - 3, w, 3);
      x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(0, y0 - 6, w, 2);
      const g = x.createLinearGradient(0, y0 - h / rows, 0, y0 - 6); g.addColorStop(0, 'rgba(40,36,70,0.25)'); g.addColorStop(0.4, 'rgba(40,36,70,0)'); x.fillStyle = g; x.fillRect(0, y0 - h / rows, w, h / rows - 6);
    }
  });
}

// ------------------------------------------------------------ willow strands: thin drooping leafy ribbons (painted, swaying)
// strandTex(): data atlas (r value, g ink, b hue flag, a coverage), thread down the middle, alternating lance leaves
export function strandTex(o = {}) {
  return canvasTex(64, 512, (x, w, h) => {
    const r = mulb(o.seed ?? 77); x.clearRect(0, 0, w, h);
    x.strokeStyle = rgbD(0.2, 0, 0); x.lineWidth = 2; x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();
    for (let y = 6; y < h - 4; y += 7 + r() * 5) {
      const sd = (Math.floor(y / 7) % 2) ? 1 : -1, l = 14 + r() * 12, a = Math.PI / 2 + sd * (0.35 + r() * 0.3), v = clamp(0.35 + r() * 0.55 + (y / h) * 0.15, 0, 1);
      const ex = w / 2 + Math.cos(a) * l * sd * sd, ey = y + Math.sin(a) * l;
      const nx = -Math.sin(a) * 3.2, ny = Math.cos(a) * 3.2;
      x.fillStyle = rgbD(v, 0, r() < 0.25 ? 1 : 0);
      x.beginPath(); x.moveTo(w / 2, y); x.quadraticCurveTo((w / 2 + ex) / 2 + nx, (y + ey) / 2 + ny, ex, ey); x.quadraticCurveTo((w / 2 + ex) / 2 - nx, (y + ey) / 2 - ny, w / 2, y); x.fill();
      if (r() < 0.3) { x.strokeStyle = rgbD(0.05, 1, 0); x.lineWidth = 0.8; x.beginPath(); x.moveTo(w / 2, y); x.lineTo(ex, ey); x.stroke(); }
    }
  }, { data: true, clamp: true });
}
const STRAND_FS = /* glsl */ `
${A.GLSL.NOISE}
${A.GLSL.GLOBAL_PARS}
uniform sampler2D uMap; uniform vec3 uR0, uR1, uR2, uR3, uAlt, uInkC; uniform float uId;
void main(){
  vec4 t = texture(uMap, vUv);
  if(t.a < 0.5) discard;
  float tip = vUv.y;                                     // 0 at the top (inside the crown) .. 1 at the tip
  float L = clamp(mix(vColor.r * (0.55 + 0.6 * tip), t.r, 0.4) + (vnoise(vUv * vec2(3.0, 40.0) + vColor.g * 9.0) - 0.5) * 0.18, 0.0, 1.0);
  float xx = L * 3.0; float i = min(floor(xx), 2.0); float f = smoothstep(0.32, 0.68, xx - i);
  vec3 a = i < 0.5 ? uR0 : (i < 1.5 ? uR1 : uR2), b = i < 0.5 ? uR1 : (i < 1.5 ? uR2 : uR3);
  vec3 c = mix(a, b, f);
  c = mix(c, c * uAlt, clamp(t.b * 0.5 + vColor.g * 0.4, 0.0, 1.0));
  c = mix(c, uInkC, clamp(t.g, 0.0, 1.0) * 0.8);
  writeOut(c, 0.0, vec3(0.0, 0.0, 1.0), vDepth, uId);
}
`;
export function strandMaterial(o = {}) {
  const r = o.ramp ?? ['#2c4a3a', '#5a8644', '#a8c45a', '#f0f0a0'], C = (h) => new THREE.Color(h);
  return A.animeShader({ uMap: { value: o.map ?? strandTex() }, uR0: { value: C(r[0]) }, uR1: { value: C(r[1]) }, uR2: { value: C(r[2]) }, uR3: { value: C(r[3]) },
    uAlt: { value: C(o.alt ?? '#ffd070') }, uInkC: { value: C(o.ink ?? '#1e3020') }, uId: { value: o.id ?? A.ID.STROKE } }, STRAND_FS, { side: THREE.DoubleSide, vertexColors: true });
}
// strandMesh(strands): strands [{pts: V3[] top -> tip, w0, w1, axis (V3 width direction), light, hue, phase}] -> mesh with
// mesh.userData.sway(t, amp): sways the strands from the top (CPU, call on twos)
export function strandMesh(strands, mat) {
  const SEG = 14; let n = 0; for (const s of strands) n += (SEG + 1) * 2;
  const P = new Float32Array(n * 3), B = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3), K = new Float32Array(n * 2), N = new Float32Array(n * 3), idx = [];
  let o = 0;
  for (const s of strands) {
    const cur = new THREE.CatmullRomCurve3(s.pts);
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, p = cur.getPoint(t), wd = lerp(s.w0, s.w1, Math.sin(t * Math.PI * 0.85 + 0.15)) * (1 - 0.6 * t * t);
      for (const sd of [-0.5, 0.5]) {
        const k = o + i * 2 + (sd > 0 ? 1 : 0);
        P.set([p.x + s.axis.x * wd * sd * 2, p.y, p.z + s.axis.z * wd * sd * 2], k * 3); B.set(P.subarray(k * 3, k * 3 + 3), k * 3);
        U.set([sd + 0.5, t], k * 2); C.set([s.light, s.hue, 0], k * 3); K.set([Math.pow(t, 1.5) * s.len, s.phase], k * 2);
        N.set([-s.axis.z, 0, s.axis.x], k * 3);
      }
      if (i) { const a = o + (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    o += (SEG + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setIndex(idx); g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  let last = -1;
  mesh.userData.sway = (t, amp = 1, dir = V3(1, 0, 0.3)) => {
    if (t === last) return; last = t;
    for (let i = 0; i < n; i++) {
      const w = K[i * 2], ph = K[i * 2 + 1];
      const s = amp * w * (0.06 * Math.sin(t * 1.7 + ph) + 0.035 * Math.sin(t * 3.1 + ph * 1.9));
      P[i * 3] = B[i * 3] + dir.x * s; P[i * 3 + 1] = B[i * 3 + 1] + Math.abs(s) * 0.05; P[i * 3 + 2] = B[i * 3 + 2] + dir.z * s + 0.4 * s * Math.sin(ph);
    }
    g.attributes.position.needsUpdate = true;
  };
  return mesh;
}

export { THREE, A };
