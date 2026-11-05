// creatures/common.js - shared kit for the creatures department (dept CREATURES)
// Pure code: canvas/data textures, cel body shader with pattern + crown glow + gold wave, translucent fin shader
// (2x2 ordered dither = true translucency after the ?s=2 downsample; rays and edges are drawn in the texture),
// procedural anime eye shader (moods via lids/pupil/glints), skin helpers and small geometry builders.
export function makeKit(ctx) {
  const { THREE, A } = ctx;
  const { GLSL, animeShader, ID } = A;
  const C3 = (c) => new THREE.Color(c);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const mkRng = (seed) => (ctx.rng ? ctx.rng(seed) : (() => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })());

  // ---------------------------------------------------------------- data textures (channels drawn on separate canvases)
  function channelCanvas(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    if (draw) draw(g, w, h);
    return g.getImageData(0, 0, w, h).data;
  }
  // chans: [drawR, drawG, drawB, drawA] (each (g, w, h) => void, white = 1) -> RGBA DataTexture, v = canvas y / h
  function dataTexture(w, h, chans, o = {}) {
    const out = new Uint8Array(w * h * 4);
    chans.forEach((fn, ci) => {
      if (!fn) return;
      const d = channelCanvas(w, h, fn);
      for (let i = 0; i < w * h; i++) out[i * 4 + ci] = d[i * 4];
    });
    const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = o.wrapS ?? THREE.ClampToEdgeWrapping; t.wrapT = o.wrapT ?? THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = 8; t.needsUpdate = true;
    return t;
  }
  // blob with a crisp, wandering edge (koi pattern "kiwa"); centre (x, y) px, radii (rx, ry), noise amount
  function blob(g, rng, x, y, rx, ry, rough = 0.22, n = 40) {
    const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + rough * (0.55 * Math.sin(a * 2 + ph[0]) + 0.3 * Math.sin(a * 3 + ph[1]) + 0.15 * Math.sin(a * 5 + ph[2]));
      const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath(); g.fill();
  }
  // wrap-aware blob around v (canvas y): draw at y, y-h, y+h
  function blobWrap(g, rng, x, y, rx, ry, rough, h) { const s = rng() * 1e6; for (const dy of [-h, 0, h]) { let k = s; const r2 = () => ((k = (k * 16807) % 2147483647) / 2147483647); blob(g, r2, x, y + dy, rx, ry, rough); } }

  // Hi's kohaku patches (shared by koi.js and the dragon map). u0/u1 remap u (dragon: patches placed along the body)
  // list of [u, v, rx (body units), ry (body units), rough, seed]; v .5 = back, < .5 right side, > .5 left side
  const HI_PATCHES = [
    [0.355, 0.55, 0.105, 0.15, 0.12, 11], [0.30, 0.40, 0.06, 0.09, 0.14, 12], [0.42, 0.66, 0.055, 0.09, 0.14, 13],   // saddle, spills left
    [0.625, 0.44, 0.085, 0.14, 0.13, 21], [0.68, 0.33, 0.05, 0.08, 0.14, 22], [0.585, 0.56, 0.05, 0.07, 0.14, 23],   // mid-back, spills right
    [0.815, 0.47, 0.032, 0.055, 0.1, 31],                                                                         // small tail patch
  ];
  function hiPatches(g, W, H, o = {}) {
    const circ = o.circ ?? 0.8, list = o.list ?? HI_PATCHES, um = o.u ?? ((u) => u), sx = o.sx ?? 1;
    for (const [u, v, rx, ry, rough, sd] of list) blobWrap(g, mkRng(sd * 977 + (o.seed ?? 0)), um(u) * W, v * H, rx * sx * W, (ry / circ) * H, rough, H);
  }
  // koi body map: R patch A (scarlet / gold / orange), G drawn ink detail, B crown spot, A patch B (black / blush)
  // u = s along the body (0 nose .. 1 tail root), v around (0 belly, .25 right side, .5 back, .75 left side)
  function koiMap(o = {}) {
    const W = 1024, H = 512, rng = mkRng(o.seed ?? 7);
    const kind = o.kind ?? 'kohaku';
    const scaleRows = o.scaleRows ?? 1;
    const R = (g) => {
      if (kind === 'kohaku' && o.hiPattern) {
        // HI: the fixed pattern = 2 large organic patches + a small tail patch (sizes in body units: v spans ~0.8 L around,
        // so ry is ~1.6x shorter in px than rx for the same size). Each patch = one big blob + heavily overlapping lobes
        // (no necks, no holes, no bands across the back -> nothing reads as a glyph from any side).
        hiPatches(g, W, H);
      } else if (kind === 'kohaku' || kind === 'calico') {
        const n = kind === 'calico' ? 4 : 3;
        for (let i = 0; i < n; i++) blobWrap(g, rng, (0.25 + 0.6 * (i + rng() * 0.6) / n) * W, (0.5 + (rng() - 0.5) * 0.16) * H, (0.05 + rng() * 0.05) * W, (0.08 + rng() * 0.07) * H, 0.25, H);
        if (kind === 'calico') blobWrap(g, rng, 0.1 * W, 0.5 * H, 0.08 * W, 0.16 * H, 0.2, H);
      } else if (kind === 'gold') {
        g.fillRect(0, 0, W, H);
      } else if (kind === 'black') {   // orange belly + orange cheeks
        const gr = g.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, '#fff'); gr.addColorStop(0.14, '#fff'); gr.addColorStop(0.2, '#000'); gr.addColorStop(0.8, '#000'); gr.addColorStop(0.86, '#fff'); gr.addColorStop(1, '#fff');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
    };
    const Gd = (g) => {
      // scale arcs (convex toward the tail), rows alternate; fainter on the belly
      const cols = Math.round(38 * scaleRows), rows = Math.round(22 * scaleRows);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const u = (i + (j % 2) * 0.5) / cols, v = (j + 0.5) / rows;
        if (u < 0.21 || u > 0.97) continue;
        const belly = Math.min(Math.abs(v - 0), Math.abs(v - 1));
        const a = 0.25 + 0.75 * smooth(0.08, 0.3, belly);
        const sz = (W / cols) * 0.62 * (1 - 0.35 * smooth(0.6, 0.97, u));
        g.globalAlpha = a * (0.55 + 0.25 * rng());
        g.lineWidth = 1.6 + rng() * 0.8;
        g.beginPath(); g.ellipse(u * W, v * H, sz * 0.62, (H / rows) * 0.62, 0, -Math.PI * 0.45, Math.PI * 0.45); g.stroke();
      }
      g.globalAlpha = 1;
      // gill cover: arc behind the head on both sides
      g.lineWidth = 4;
      for (const vc of [0.25, 0.75]) { g.beginPath(); g.ellipse(0.205 * W, vc * H, 0.03 * W, 0.17 * H, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); }
      // mouth: a small smile at the nose on both sides
      g.lineWidth = 6;
      for (const sd of [1, -1]) { const vc = (v) => (sd > 0 ? v : 1 - v) * H; g.beginPath(); g.moveTo(0.004 * W, vc(0.22)); g.quadraticCurveTo(0.03 * W, vc(0.2), 0.052 * W, vc(0.135)); g.stroke(); }
    };
    const B = (g) => { if (o.crown) { const r = mkRng(77); blob(g, r, 0.11 * W, 0.5 * H, 0.06 * W, 0.17 * H, 0.05, 48); } };
    const Aa = (g) => {
      if (kind === 'calico') for (let i = 0; i < 9; i++) blobWrap(g, rng, (0.15 + 0.8 * rng()) * W, (0.3 + 0.4 * rng()) * H, (0.012 + rng() * 0.025) * W, (0.02 + rng() * 0.05) * H, 0.35, H);
      if (o.blush) {   // hatched blush under the eyes (palette B = pink)
        for (const vc of [0.215, 0.785]) {
          g.save(); g.beginPath(); g.ellipse(0.15 * W, vc * H, 0.022 * W, 0.045 * H, 0, 0, Math.PI * 2); g.clip();
          g.globalAlpha = 0.55; g.fillRect(0, 0, W, H); g.globalAlpha = 1; g.lineWidth = 3;
          for (let k = -6; k < 7; k++) { g.beginPath(); g.moveTo(0.15 * W + k * 7 - 14, vc * H + 26); g.lineTo(0.15 * W + k * 7 + 10, vc * H - 26); g.stroke(); }
          g.restore();
        }
      }
    };
    return dataTexture(W, H, [R, Gd, B, Aa]);
  }

  // fin map: R rays, G ink edge, B tip tint, A coverage (membrane ~.55, rays/edge 1). u along the base, v outward
  function finMap(o = {}) {
    const W = 256, H = 256, rng = mkRng(o.seed ?? 3);
    const nR = o.rays ?? 11;
    const edgeY = (u) => 0.925 + 0.05 * Math.pow(Math.abs(Math.sin(u * Math.PI * nR)), 0.6);   // scallops between rays
    const R = (g) => {
      for (let i = 0; i <= nR; i++) {
        const u0 = (i + 0.02) / (nR + 0.04);
        g.lineWidth = i === 0 ? 5 : 2.4;
        g.beginPath(); g.moveTo(u0 * W, 0);
        const u1 = u0 + (rng() - 0.5) * 0.01;
        g.bezierCurveTo(u0 * W, 0.4 * H, u1 * W, 0.6 * H, u1 * W, 0.62 * H); g.stroke();
        // fork near the tip
        g.lineWidth = i === 0 ? 4 : 1.6;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(u1 * W, 0.62 * H); g.quadraticCurveTo((u1 + s * 0.008) * W, 0.8 * H, (u1 + s * 0.016) * W, edgeY(u1) * H); g.stroke(); }
      }
    };
    const G = (g) => {
      g.lineWidth = 5; g.beginPath();
      for (let x = 0; x <= W; x += 2) { const y = edgeY(x / W) * H - 3; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      g.lineWidth = 6; g.beginPath(); g.moveTo(2, 0); g.lineTo(2, H); g.stroke();      // leading edge
      g.lineWidth = 3; g.beginPath(); g.moveTo(W - 2, 0); g.lineTo(W - 2, H); g.stroke();
    };
    const B = (g) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#000'); gr.addColorStop(0.35, '#222'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
    const Aa = (g) => {
      g.fillStyle = 'rgb(150,150,150)'; g.beginPath(); g.moveTo(0, 0);
      for (let x = 0; x <= W; x += 2) g.lineTo(x, edgeY(x / W) * H);
      g.lineTo(W, 0); g.closePath(); g.fill();
      const gr = g.createLinearGradient(0, 0, 0, H * 0.25); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.25);
    };
    const t = dataTexture(W, H, [R, G, B, Aa], { wrapT: THREE.ClampToEdgeWrapping });
    // rays + edge must also be opaque: fold them into coverage
    const d = t.image.data;
    for (let i = 0; i < W * H; i++) { const cov = d[i * 4 + 3]; if (cov > 0) d[i * 4 + 3] = Math.max(cov, d[i * 4] * 0.95, d[i * 4 + 1]); }
    t.needsUpdate = true;
    return t;
  }

  // ---------------------------------------------------------------- materials
  const BODY_FS = /* glsl */ `
${GLSL.NOISE}
${GLSL.GLOBAL_PARS}
uniform sampler2D uMap, uMap2;
uniform float uAlt;
uniform vec3 uB0, uS0, uB1, uS1, uB2, uS2, uRimCol, uInkC, uGlowC, uGoldC, uHiCol, uPalC, uBelly;
uniform float uId, uGlow, uDetail, uGoldPos, uGoldAmt, uWobS, uHi, uHiTh, uRimTh, uDarkRim, uPalAmt, uFlash, uMapU0, uMapU1, uMapRep;
void main(){
  vec3 N = normalize(vNW), NV = normalize(vNV);
  if(!gl_FrontFacing){ N = -N; NV = -NV; }
  vec2 uv = vUv;
  vec4 m = texture(uMap, uv);
  vec4 m2 = texture(uMap2, uv);                         // alternate pattern (dragon): R patches, B crown; uAlt blends
  float pr = mix(max(m.r, m.b), max(m2.r, m2.b), uAlt);
  float pa = m.a * (1.0 - uAlt);
  vec3 base = mix(mix(uB0, uB1, pr), uB2, pa);
  vec3 shade = mix(mix(uS0, uS1, pr), uS2, pa);
  float pal = (1.0 - vColor.g) * uPalAmt;               // dragon palate / belly plates via vertex colour
  float belly = (1.0 - vColor.b);
  base = mix(base, uBelly, belly); shade = mix(shade, uBelly * vec3(0.78, 0.76, 0.86), belly);
  base = mix(base, uPalC, pal); shade = mix(shade, uPalC * 0.6, pal);
  vec3 L = uKey.w > 0.5 ? normalize(uKey.xyz - vW) : normalize(uKey.xyz);
  float n = fbm3(vLocal * uWobS) * 2.0 - 1.0;
  float ndl = dot(N, L) + n * 0.08;
  float aa = max(fwidth(ndl), 1e-4);
  float lit = smoothstep(-aa, aa, ndl);
  vec3 litC = base * mix(vec3(1.0), uKeyColor, uKeyTint);
  vec3 shC = shade * mix(vec3(1.0), uShadeTint, uShadeMix);
  vec3 c = mix(shC, litC, lit);
  vec3 V = normalize(cameraPosition - vW);
  float sp = dot(N, normalize(L + V)) + n * 0.025;
  float aa2 = max(fwidth(sp), 1e-4);
  float hi = smoothstep(uHiTh - aa2, uHiTh + aa2, sp) * lit;
  c = mix(c, mix(litC, uHiCol, 0.65), hi * uHi);
  float fres = 1.0 - max(dot(N, V), 0.0) + n * 0.03;
  float aa3 = max(fwidth(fres), 1e-4);
  float rim = smoothstep(uRimTh - aa3, uRimTh + aa3, fres) * max(smoothstep(-0.05, 0.2, dot(N, normalize(uRimDir))) * (1.0 - lit * 0.8), uDarkRim * (1.0 - lit));
  c = mix(c, uRimCol, rim * uRimAmt);
  c = mix(c, uInkC * mix(vec3(1.0), base, 0.35), clamp(m.g * uDetail, 0.0, 1.0));
  float gw = uGoldAmt * exp(-pow((vUv.x - uGoldPos) * 9.0, 2.0));
  c = mix(c, uGoldC, clamp(gw, 0.0, 1.0) * 0.85);
  float em = mix(m.b, m2.b, uAlt) * uGlow;
  c = mix(c, uGlowC * (1.0 + em * 0.6), clamp(em, 0.0, 1.0) * 0.55);
  c = mix(c, vec3(0.92, 0.95, 1.0) * 1.3, uFlash);
  writeOut(c, em * 2.2 + gw * 1.6 + uFlash, NV, vDepth, uId);
}`;
  // palette: {b0, s0 (base lit/shade), b1, s1 (patch A), b2, s2 (patch B)}
  function bodyMaterial(o = {}) {
    const p = o.palette ?? {};
    const m = animeShader({
      uMap: { value: o.map }, uB0: { value: C3(p.b0 ?? '#FAF7F2') }, uS0: { value: C3(p.s0 ?? '#B9BCD6') },
      uB1: { value: C3(p.b1 ?? '#E8442E') }, uS1: { value: C3(p.s1 ?? '#B02E3A') }, uB2: { value: C3(p.b2 ?? '#2A2A35') }, uS2: { value: C3(p.s2 ?? '#1c1c28') },
      uRimCol: { value: C3(o.rimColor ?? '#fff1dc') }, uInkC: { value: C3(o.ink ?? '#5a2a26') }, uGlowC: { value: C3(o.glow ?? '#ff4a2a') },
      uGoldC: { value: C3('#ffd56a') }, uHiCol: { value: C3('#ffffff') }, uPalC: { value: C3('#9a2234') }, uBelly: { value: C3(o.belly ?? '#f6ead2') },
      uId: { value: o.id ?? ID.CREATURE }, uGlow: { value: 0 }, uDetail: { value: o.detail ?? 0.42 }, uGoldPos: { value: -1 }, uGoldAmt: { value: 0 },
      uWobS: { value: o.wobScale ?? 12 }, uHi: { value: o.highlight ?? 0.55 }, uHiTh: { value: o.hiSize ?? 0.955 }, uRimTh: { value: 1 - (o.rimWidth ?? 0.2) },
      uDarkRim: { value: o.darkRim ?? 0.35 }, uPalAmt: { value: 0 }, uFlash: { value: 0 }, uMapU0: { value: 0 }, uMapU1: { value: 1 }, uMapRep: { value: 1 }, uMap2: { value: o.map2 ?? o.map }, uAlt: { value: 0 },
    }, BODY_FS, { vertexColors: !!o.vertexColors, side: o.side ?? THREE.FrontSide });
    m.name = 'creature_body';
    return m;
  }

  // translucent fin: rays/edge drawn in the map, membrane dithered (2x2 Bayer) -> real translucency after the 2x downsample
  const FIN_FS = /* glsl */ `
${GLSL.NOISE}
${GLSL.GLOBAL_PARS}
uniform sampler2D uMap;
uniform vec3 uC0, uC1, uRay, uInkC, uGlowC;
uniform float uId, uRag, uOpac, uSeedR, uGlow, uFlash, uRayAmt;
void main(){
  vec4 m = texture(uMap, vUv);
  float cut = 1.0 - uRag * (0.10 + 0.32 * smoothstep(0.35, 0.85, vnoise(vec2(vUv.x * 7.0 + uSeedR, 1.3))) + 0.12 * vnoise(vec2(vUv.x * 31.0 + uSeedR, 4.0)));
  if(vUv.y > cut || m.a < 0.03) discard;
  vec3 N = normalize(vNW), NV = normalize(vNV);
  if(!gl_FrontFacing){ N = -N; NV = -NV; }
  vec3 L = uKey.w > 0.5 ? normalize(uKey.xyz - vW) : normalize(uKey.xyz);
  float wrap = abs(dot(N, L));                                   // thin membrane: lit from either side
  vec3 col = mix(uC0, uC1, m.b);
  col *= mix(vec3(0.82, 0.84, 0.95), mix(vec3(1.0), uKeyColor, uKeyTint), smoothstep(0.15, 0.5, wrap + (vnoise(vUv * 9.0) - 0.5) * 0.2));
  col = mix(col, uRay, m.r * uRayAmt);
  float e = max(m.g, smoothstep(cut - 0.035, cut - 0.005, vUv.y) * step(0.001, uRag));
  col = mix(col, uInkC, e * 0.9);
  col = mix(col, uGlowC, uGlow * (0.4 + 0.6 * m.r));
  col = mix(col, vec3(0.92, 0.95, 1.0) * 1.3, uFlash);
  float a = max(m.a * uOpac, e);
  vec2 q = mod(floor(gl_FragCoord.xy), 2.0);
  float th = q.x < 0.5 ? (q.y < 0.5 ? 0.125 : 0.875) : (q.y < 0.5 ? 0.625 : 0.375);
  if(a < th) discard;
  writeOut(col, uGlow * 1.2 + uFlash, NV, vDepth, uId);
}`;
  const FLUTTER_PARS = 'attribute vec4 aFlow;\nuniform vec4 uFlut;\n';
  const FLUTTER = '\n  transformed += aFlow.xyz * (uFlut.x * sin(uFlut.y - aFlow.w) + uFlut.w * sin(uFlut.y * 2.3 - aFlow.w * 1.7 + 1.3) + uFlut.z);\n';
  function addFlutter(m) {
    m.uniforms.uFlut = { value: new THREE.Vector4(0, 0, 0, 0) };
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + FLUTTER_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>' + FLUTTER);
    };
    m.customProgramCacheKey = () => 'creature_flutter';
    return m;
  }
  function finMaterial(o = {}) {
    const m = animeShader({
      uMap: { value: o.map }, uC0: { value: C3(o.c0 ?? '#fff6ee') }, uC1: { value: C3(o.c1 ?? '#ffd2c0') }, uRay: { value: C3(o.ray ?? '#e7a291') },
      uInkC: { value: C3(o.ink ?? '#6a3030') }, uGlowC: { value: C3(o.glow ?? '#ff7a50') }, uId: { value: o.id ?? 91 }, uRag: { value: 0 },
      uOpac: { value: o.opacity ?? 1 }, uSeedR: { value: o.seed ?? 0 }, uGlow: { value: 0 }, uFlash: { value: 0 }, uRayAmt: { value: o.rayAmt ?? 0.75 },
    }, FIN_FS, { side: THREE.DoubleSide });
    m.name = 'creature_fin';
    return addFlutter(m);
  }

  // anime eye on a domed disc: uv x = forward, y = up. Moods = lid lines, pupil size, glints
  const EYE_FS = /* glsl */ `
${GLSL.NOISE}
${GLSL.GLOBAL_PARS}
uniform vec3 uIris, uIris2, uRing, uSkin, uInkC, uTint, uPupC;
uniform float uPupil, uLid, uLidTilt, uLow, uLowTilt, uTintAmt, uIdEye, uIdSkin, uGlint, uGx, uGy, uLash, uFierce, uFlash, uRingW, uSharp;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if(r > 1.0) discard;
  vec3 NV = normalize(vNV); if(!gl_FrontFacing) NV = -NV;
  float aa = fwidth(r) * 1.2 + 1e-4;
  float top = uLid + uLidTilt * p.x - 0.22 * p.x * p.x;
  float bot = -uLow + uLowTilt * p.x + 0.16 * p.x * p.x;
  float dT = p.y - top, dB = bot - p.y;
  vec3 keyM = mix(vec3(1.0), uKeyColor, uKeyTint);
  vec3 c; float id = uIdEye;
  if(dT > 0.0 || dB > 0.0){
    c = uSkin * keyM; id = uIdSkin;
    float lw = uLash * (1.0 - 0.55 * abs(p.x)) ;
    float lt = (dT > 0.0 && dT < lw) ? 1.0 : 0.0;
    float lb = (uLow < 0.97 && dB > 0.0 && dB < 0.06 * (1.0 - 0.6 * abs(p.x))) ? 1.0 : 0.0;
    c = mix(c, uInkC, max(lt, lb));
    if(lt + lb > 0.0) id = uIdEye;
  } else {
    vec2 pc = p - vec2(uGx, uGy) * 0.25;
    float rc = length(pc);
    float ringIn = 1.0 - uRingW;
    c = mix(uIris, uIris2, smoothstep(0.35, -0.75, pc.y));                 // dark top, coloured light bottom
    c = mix(c, uIris2 * 1.35, smoothstep(0.55, 0.85, rc) * smoothstep(0.0, -0.6, pc.y) * 0.6);
    float pr = uPupil * (1.0 - uFierce * 0.35);
    float pupil = uFierce > 0.5 ? smoothstep(aa, -aa, length(pc * vec2(1.0 / max(0.25, 1.0 - uFierce * 0.7), 1.0)) - pr * 1.3) : smoothstep(pr + aa, pr - aa, rc);
    c = mix(c, uPupC, pupil);
    c = mix(c, uTint * 1.2, uTintAmt * smoothstep(0.75, 0.2, length((pc - vec2(-0.1, -0.42)) * vec2(1.0, 1.6))));
    float ring = smoothstep(ringIn - aa, ringIn + aa, r);
    c = mix(c, uRing * mix(1.15, 0.8, smoothstep(0.6, -0.6, p.y)), ring);
    c = mix(c, uInkC, smoothstep(0.93 - aa, 0.93 + aa, r));
    c *= keyM;
    // glints: big one up-front, small one low-back (fixed in eye space)
    vec2 gq = p - vec2(0.28, 0.36);
    float g1 = smoothstep(0.22 * uGlint + aa, 0.22 * uGlint - aa, mix(length(gq * vec2(1.0, 1.25)), abs(gq.x) * 1.9 + abs(gq.y) * 0.75, uSharp));   // sharp = diamond glint
    float g2 = smoothstep(0.1 * uGlint + aa, 0.1 * uGlint - aa, length(p - vec2(-0.36, -0.36)));
    float g3 = smoothstep(0.05 * uGlint + aa, 0.05 * uGlint - aa, length(p - vec2(0.02, 0.5)));
    c = mix(c, vec3(1.0, 0.99, 0.96) * 1.15, max(max(g1, g2), g3 * step(1.15, uGlint)));
  }
  c = mix(c, vec3(0.92, 0.95, 1.0) * 1.3, uFlash);
  writeOut(c, uFlash, NV, vDepth, id);
}`;
  function eyeMaterial(o = {}) {
    const m = animeShader({
      uIris: { value: C3(o.iris ?? '#1d1830') }, uIris2: { value: C3(o.iris2 ?? '#4a3a7a') }, uRing: { value: C3(o.ring ?? '#d9a83c') },
      uSkin: { value: C3(o.skin ?? '#FAF7F2') }, uInkC: { value: C3(o.ink ?? '#2a1a16') }, uTint: { value: C3('#ffffff') }, uPupC: { value: C3(o.pupil ?? '#0d0a14') },
      uPupil: { value: 0.42 }, uLid: { value: 0.8 }, uLidTilt: { value: 0 }, uLow: { value: 1 }, uLowTilt: { value: 0 }, uTintAmt: { value: 0 },
      uIdEye: { value: o.idEye ?? 22 }, uIdSkin: { value: o.idSkin ?? ID.CREATURE }, uGlint: { value: 1 }, uGx: { value: 0 }, uGy: { value: 0 },
      uLash: { value: o.lash ?? 0.22 }, uFierce: { value: 0 }, uFlash: { value: 0 }, uRingW: { value: o.ringW ?? 0.16 }, uSharp: { value: 0 },
    }, EYE_FS, { side: THREE.DoubleSide });
    m.name = 'creature_eye';
    return m;
  }
  // mood presets: pupil, lid (top line y), lidTilt (+ = front end higher), low (lower lid), lowTilt, glint
  const MOODS = {
    calm:       { pupil: 0.44, lid: 0.66, lidTilt: 0.08, low: 1.0, lowTilt: 0, glint: 1.0 },
    determined: { pupil: 0.3, lid: 0.22, lidTilt: -0.5, low: 0.78, lowTilt: 0.08, glint: 0.8 },
    wide:       { pupil: 0.2, lid: 1.08, lidTilt: 0.0, low: 1.0, lowTilt: 0, glint: 1.25 },
    sad:        { pupil: 0.52, lid: 0.32, lidTilt: 0.5, low: 0.62, lowTilt: 0.1, glint: 1.4 },
    half:       { pupil: 0.46, lid: -0.05, lidTilt: 0.05, low: 0.8, lowTilt: 0, glint: 0.75 },
    closed:     { pupil: 0.45, lid: -0.05, lidTilt: 0.0, low: 0.0, lowTilt: 0, glint: 0.0 },
    dragon:     { pupil: 0.34, lid: 0.2, lidTilt: -0.75, low: 0.62, lowTilt: 0.2, glint: 0.95, fierce: 0.4, sharp: 1 },   // Hi grown: same iris, hooded, sharp glint
    fierce:     { pupil: 0.4, lid: 0.3, lidTilt: -0.5, low: 0.74, lowTilt: 0.12, glint: 0.7, fierce: 1 },
    awe:        { pupil: 0.56, lid: 1.0, lidTilt: 0.04, low: 1.0, lowTilt: 0, glint: 1.35 },
    happy:      { pupil: 0.46, lid: 0.7, lidTilt: 0.08, low: 0.3, lowTilt: 0.0, glint: 1.15 },
  };
  function setMood(mats, mood, k = 1, extra = {}) {
    const a = MOODS.calm, b = MOODS[mood] ?? a;
    for (const m of mats) {
      const u = m.uniforms;
      u.uPupil.value = lerp(a.pupil, b.pupil, k); u.uLid.value = lerp(a.lid, b.lid, k); u.uLidTilt.value = lerp(a.lidTilt, b.lidTilt, k);
      u.uLow.value = lerp(a.low, b.low, k); u.uLowTilt.value = lerp(a.lowTilt, b.lowTilt, k); u.uGlint.value = lerp(a.glint, b.glint, k);
      u.uFierce.value = (b.fierce ?? 0) * k; if (u.uSharp) u.uSharp.value = (b.sharp ?? 0) * k;
      if (extra.pupil) u.uPupil.value *= extra.pupil;
    }
  }

  // ghost (smear multiples): flat colour, 50% dither, no ink
  const GHOST_FS = /* glsl */ `
${GLSL.NOISE}
${GLSL.GLOBAL_PARS}
uniform vec3 uCol; uniform float uAmt;
void main(){
  vec2 q = mod(floor(gl_FragCoord.xy), 2.0);
  float th = q.x < 0.5 ? (q.y < 0.5 ? 0.125 : 0.875) : (q.y < 0.5 ? 0.625 : 0.375);
  if(uAmt < th) discard;
  writeOut(uCol * vColor, 0.0, normalize(vNV), vDepth, 93.0);
}`;
  function ghostMaterial(col = '#fff6ee', amt = 0.5) {
    const m = animeShader({ uCol: { value: C3(col) }, uAmt: { value: amt } }, GHOST_FS, { side: THREE.DoubleSide });
    m.name = 'creature_ghost';
    return m;
  }
  const cel = (o) => A.celMaterial({ id: ID.CREATURE, ...o });

  // ---------------------------------------------------------------- geometry helpers
  // tube along points (array of Vector3) with radius function r(t) -> BufferGeometry, uv (t, around)
  function tubeAlong(pts, rFn, segs = 8, o = {}) {
    const n = pts.length, pos = [], uv = [], idx = [];
    const T = new THREE.Vector3(), Nn = new THREE.Vector3(), Bn = new THREE.Vector3();
    let prevN = null;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      T.subVectors(b, a).normalize();
      if (!prevN) { Nn.set(0, 1, 0); if (Math.abs(T.dot(Nn)) > 0.9) Nn.set(1, 0, 0); } else Nn.copy(prevN);
      Nn.sub(T.clone().multiplyScalar(Nn.dot(T))).normalize(); prevN = Nn.clone();
      Bn.crossVectors(T, Nn);
      const t = i / (n - 1), r = rFn(t);
      for (let j = 0; j <= segs; j++) {
        const an = (j / segs) * Math.PI * 2;
        const sx = Math.cos(an) * (o.flat ?? 1), sy = Math.sin(an);
        pos.push(pts[i].x + (Nn.x * sx + Bn.x * sy) * r, pts[i].y + (Nn.y * sx + Bn.y * sy) * r, pts[i].z + (Nn.z * sx + Bn.z * sy) * r);
        uv.push(t, j / segs);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const curvePts = (ctrl, n = 16) => new THREE.CatmullRomCurve3(ctrl.map((p) => (p.isVector3 ? p : V3(...p)))).getPoints(n - 1);
  // ellipsoid-ish blob: sphere scaled with optional per-vertex shaper(v: Vector3) -> modifies v
  function blobGeo(rx, ry, rz, shaper, ws = 24, hs = 16) {
    const g = new THREE.SphereGeometry(1, ws, hs);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.set(v.x * rx, v.y * ry, v.z * rz); if (shaper) shaper(v); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
    return g;
  }
  // cone / spike from base centre along +Y
  function cone(r, h, segs = 8) { const g = new THREE.ConeGeometry(r, h, segs, 1); g.translate(0, h / 2, 0); return g; }
  // merge simple non-indexed / indexed geometries with same attributes (position, normal, uv) - pass [geo, matrix?]
  function merge(list) {
    let pos = [], nor = [], uv = [], idx = [], off = 0;
    for (const it of list) {
      const g0 = it.isBufferGeometry ? it : it[0];
      const g = g0.index ? g0 : g0; const mt = it.isBufferGeometry ? null : it[1];
      const gg = g.clone(); if (mt) gg.applyMatrix4(mt);
      if (!gg.attributes.normal) gg.computeVertexNormals();
      const P = gg.attributes.position, Nn = gg.attributes.normal, U = gg.attributes.uv;
      for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0); }
      if (gg.index) for (let i = 0; i < gg.index.count; i++) idx.push(gg.index.getX(i) + off); else for (let i = 0; i < P.count; i++) idx.push(i + off);
      off += P.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }
  const M4 = (pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) => new THREE.Matrix4().compose(V3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V3(...(Array.isArray(scl) ? scl : [scl, scl, scl])));

  // grid surface (fin / feather / ribbon): fn(u, v) -> Vector3; returns geometry with uv (u, v)
  function gridGeo(nu, nv, fn) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv, p = fn(u, v); pos.push(p.x, p.y, p.z); uv.push(u, v); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const noCull = (o) => { o.traverse((c) => { c.frustumCulled = false; }); return o; };

  return { THREE, A, C3, V3, clamp, smooth, lerp, mkRng, dataTexture, blob, blobWrap, hiPatches, HI_PATCHES, koiMap, finMap, bodyMaterial, finMaterial, addFlutter, eyeMaterial, MOODS, setMood,
    ghostMaterial, cel, tubeAlong, curvePts, blobGeo, cone, merge, M4, gridGeo, noCull };
}
