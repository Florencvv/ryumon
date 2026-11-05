// creatures/dragon.js - the white dragon = Hi grown up (round 2: majestic eastern dragon, still clearly Hi).
// One skinned tube (48 bones) in normalised units (length 1, nose at z = 0, tail at z = -1). Bone 0 is the HEAD bone (rigid
// skull pivot at s = S_PIV, so the head can be thrown back), bones 1..47 run down the body; bones carry the world length as
// scale, so follow(curve) lays the body along any path. Every body vertex has tau (= uv.x = Hi's own body coordinate): the koi
// shape (morph target) and the dragon shape share it -> grow(k): 0 koi .. 1 dragon (mid-states simple, inside the glow).
// Dragon parts: sculpted head (long snout, flared nostril mounds, brow ridges over Hi's eye, cheeks), hinged lower jaw with
// fangs, tongue and a flowing beard, gullet, brow horns, branched pale-gold antlers, scarlet crown spot, cheek fins, long
// whiskers (from Hi's barbels) that trail along the flight path and curl, a translucent mane + scalloped dorsal fringe (from
// Hi's butterfly fins, skinned to the spine = streams with the body), drawn scale rows, pale belly plates, Hi's scarlet
// patches along the back, 4 jointed limbs with gold claws and elbow fins, and Hi's flowing koi tail fin at the tail tip.
export function makeDragon(K, o = {}) {
  const { THREE, V3, lerp, smooth, clamp } = K;
  const NB = 48;
  const TAU_HEAD = 0.22, SIG_HEAD = 0.085, S_PIV = 0.066;   // tau 0..0.22 (Hi's head) -> sigma 0..0.085 (dragon head)
  const sig = (tau) => (tau < TAU_HEAD ? (tau * SIG_HEAD) / TAU_HEAD : SIG_HEAD + ((tau - TAU_HEAD) / (1 - TAU_HEAD)) * (1 - SIG_HEAD));
  const tauOf = (s) => (s < SIG_HEAD ? (s * TAU_HEAD) / SIG_HEAD : TAU_HEAD + ((s - SIG_HEAD) / (1 - SIG_HEAD)) * (1 - TAU_HEAD));
  const BS = [S_PIV]; for (let i = 1; i < NB; i++) BS.push(SIG_HEAD + ((i - 1) / (NB - 2)) * (1 - SIG_HEAD));
  const gauss = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));

  const root = new THREE.Group(); root.name = 'DRAGON';
  const bones = BS.map((s, i) => { const b = new THREE.Bone(); b.name = 'd' + i; b.position.set(0, 0, -s); root.add(b); return b; });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const skinOf = (s) => {
    if (s <= BS[0]) return [0, 0, 1, 0];
    for (let i = 0; i < BS.length - 1; i++) if (s < BS[i + 1]) { const t = (s - BS[i]) / (BS[i + 1] - BS[i]); return [i, i + 1, 1 - t, t]; }
    return [BS.length - 1, 0, 1, 0];
  };

  // ---------------------------------------------------------------- shapes
  // koi (Hi) profile, normalised to body length 1 (same numbers as koi.js)
  const kprof = (s) => {
    const head = s < 0.27 ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - s / 0.27, 2))) : 1;
    const tail = s > 0.33 ? 1 - Math.pow((s - 0.33) / 0.67, 1.35) * 0.8 : 1;
    const f = head * tail, fl = smooth(0.9, 1.0, s) * 0.035;
    return { w: 0.094 * f + fl * 0.2, ht: 0.118 * f + fl, hb: 0.104 * f + fl, cy: -0.02 * (1 - smooth(0.0, 0.3, s)) + 0.006 * smooth(0.2, 0.5, s) };
  };
  const ksurf = (tau, v, out = V3()) => {
    const p = kprof(tau), a = v * Math.PI * 2, c = -Math.cos(a), sn = Math.sin(a);
    const sx = Math.sign(sn) * Math.pow(Math.abs(sn), 0.85), sy = Math.sign(c) * Math.pow(Math.abs(c), 0.9);
    return out.set(p.w * sx, p.cy + sy * (c > 0 ? p.ht : p.hb), -tau);
  };
  // dragon body radius (diameter ~1/18 of the length at the chest), tapering into the tail
  const rBody = (s) => (0.0165 + 0.0115 * smooth(0.1, 0.24, s)) * (1 - 0.86 * Math.pow(smooth(0.42, 1.0, s), 1.15));
  // head: u = s / SIG_HEAD (0 nose .. 1 back of the skull), boxy section with a flat palate, blending into the round neck
  const hW = (u) => lerp(0.0056, 0.0142, smooth(0.2, 0.8, u)) + 0.0013 * gauss(u, 0.06, 0.07) + 0.0022 * gauss(u, 0.76, 0.13);
  const hHt = (u) => 0.0062 + 0.0018 * gauss(u, 0.07, 0.06) - 0.0007 * gauss(u, 0.24, 0.08) + 0.0082 * smooth(0.26, 0.6, u) + 0.0012 * smooth(0.6, 0.95, u);
  const hHb = (u) => 0.0036 + 0.004 * smooth(0.3, 0.95, u);
  function dprof(s) {
    const u = s / SIG_HEAD, nb = smooth(0.82, 1.32, u);
    let w = hW(u), ht = hHt(u), hb = hHb(u);
    if (u < 0.05) { const m = Math.pow(Math.max(0, u) / 0.05, 0.38); w *= m; ht *= m; hb *= m; }   // blunt, closed nose
    const r = rBody(s);
    return { u, head: 1 - nb, w: lerp(w, r * 0.97, nb), ht: lerp(ht, r * 1.04, nb), hb: lerp(hb, r, nb), px: lerp(0.8, 0.85, nb), py: lerp(0.88, 0.9, nb), pyb: lerp(0.55, 0.9, nb) };
  }
  // v: 0 belly, .25 right side (+x), .5 back, .75 left side
  function dsurfS(s, v, out = V3()) {
    const p = dprof(s), a = v * Math.PI * 2, c = -Math.cos(a), sn = Math.sin(a);
    const sx = Math.sign(sn) * Math.pow(Math.abs(sn), p.px), sy = c > 0 ? Math.pow(c, p.py) : -Math.pow(-c, p.pyb);
    let x = p.w * sx, y = (c > 0 ? p.ht : p.hb) * sy;
    if (p.head > 0.001) {   // sculpt: brow ridges, nostril mounds, cheeks
      const u = p.u, side = sn >= 0 ? 1 : -1, vs = sn >= 0 ? v : 1 - v;
      const brow = 0.0046 * gauss(u, 0.52, 0.11) * gauss(vs, 0.37, 0.05);
      const nos = 0.0026 * gauss(u, 0.09, 0.045) * gauss(vs, 0.425, 0.035);
      const cheek = 0.0017 * gauss(u, 0.76, 0.12) * gauss(vs, 0.2, 0.08);
      y += (brow * 0.85 + nos) * p.head; x += side * (brow * 0.5 + cheek) * p.head;
    }
    return out.set(x, y, -s);
  }
  const dsurf = (tau, v, out = V3()) => dsurfS(sig(tau), v, out);

  // ---------------------------------------------------------------- body (morph: koi)
  const NRH = 90, NRB = 270, NA = 40;
  const taus = []; for (let i = 0; i <= NRH; i++) taus.push(Math.pow(i / NRH, 1.15) * TAU_HEAD); for (let i = 1; i <= NRB; i++) taus.push(TAU_HEAD + (i / NRB) * (1 - TAU_HEAD));
  const pos = [], mk = [], uv = [], col = [], si = [], sw = [], idx = [];
  const a = V3(), b = V3();
  taus.forEach((tau) => {
    for (let j = 0; j <= NA; j++) {
      const v = j / NA, t2 = tau;
      dsurf(t2, v, a); ksurf(t2, v, b);
      pos.push(a.x, a.y, a.z); mk.push(b.x - a.x, b.y - a.y, b.z - a.z); uv.push(tau, v);
      const s = sig(tau), bel = Math.min(v, 1 - v);
      const palate = s > SIG_HEAD * 0.1 && s < SIG_HEAD * 0.8 && bel < 0.075 ? 1 : 0;
      const belly = s > 0.1 && s < 0.975 && bel < 0.115 ? 1 : 0;
      col.push(1, 1 - palate, 1 - belly);
      const k = skinOf(s); si.push(k[0], k[1], 0, 0); sw.push(k[2], k[3], 0, 0);
    }
  });
  const NRT = taus.length - 1;
  for (let i = 0; i < NRT; i++) for (let j = 0; j < NA; j++) { const p = i * (NA + 1) + j, q = p + NA + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bodyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  bodyGeo.setIndex(idx); bodyGeo.computeVertexNormals();
  const fixSeam = (g, rings) => { const n = g.attributes.normal; for (let i = 0; i <= rings; i++) { const p = i * (NA + 1), q = p + NA; const x = n.getX(p) + n.getX(q), y = n.getY(p) + n.getY(q), z = n.getZ(p) + n.getZ(q); const l = Math.hypot(x, y, z) || 1; n.setXYZ(p, x / l, y / l, z / l); n.setXYZ(q, x / l, y / l, z / l); } for (let j = 0; j <= NA; j++) n.setXYZ(j, 0, 0, 1); };
  fixSeam(bodyGeo, NRT);
  { // koi morph normals
    const kg = new THREE.BufferGeometry(); const kp = pos.map((x, i) => x + mk[i]);
    kg.setAttribute('position', new THREE.Float32BufferAttribute(kp, 3)); kg.setIndex(idx); kg.computeVertexNormals(); fixSeam(kg, NRT);
    const dn = bodyGeo.attributes.normal, kn = kg.attributes.normal, dnm = [];
    for (let i = 0; i < dn.count; i++) dnm.push(kn.getX(i) - dn.getX(i), kn.getY(i) - dn.getY(i), kn.getZ(i) - dn.getZ(i));
    bodyGeo.morphAttributes.position = [new THREE.Float32BufferAttribute(mk, 3)];
    bodyGeo.morphAttributes.normal = [new THREE.Float32BufferAttribute(dnm, 3)];
    bodyGeo.morphTargetsRelative = true;
  }
  const maps = dragonMaps();
  const bodyMat = K.bodyMaterial({ map: maps.main, map2: maps.alt, palette: { b0: '#FAF7F2', s0: '#B9BCD6', b1: '#E8442E', s1: '#B02E3A', b2: '#ffb0b6', s2: '#e48c9c' }, vertexColors: true, wobScale: 60, detail: 0.55, belly: '#f4e6c8', darkRim: 0.4 });
  const body = new THREE.SkinnedMesh(bodyGeo, bodyMat); body.name = 'dragonBody';
  root.add(body); body.bind(skeleton, new THREE.Matrix4());

  function dragonMaps() {
    const W = 2048, H = 512;
    const hiMap = K.koiMap({ kind: 'kohaku', hiPattern: true, crown: true, blush: true, seed: 11 });
    // perimeter of the dragon section per tau column (for physically round marks)
    const perim = new Float32Array(W);
    for (let x = 0; x < W; x++) { let L = 0; const p0 = V3(), p1 = V3(); dsurf(Math.max(0.002, (x + 0.5) / W), 0, p0); for (let j = 1; j <= 32; j++) { dsurf(Math.max(0.002, (x + 0.5) / W), j / 32, p1); L += p1.distanceTo(p0); p0.copy(p1); } perim[x] = L; }
    const perAt = (s) => perim[Math.min(W - 1, Math.floor(tauOf(s) * W))];
    const dsdt = (s) => (s < SIG_HEAD ? SIG_HEAD / TAU_HEAD : (1 - SIG_HEAD) / (1 - TAU_HEAD));
    // ink: dragon scale rows (step follows the local girth), belly plates, belly edge, head lines
    const G = (g) => {
      const NR = 16;
      for (let j = 0; j < NR; j++) {
        const v = (j + 0.5) / NR, bel = Math.min(v, 1 - v);
        if (bel < 0.12) continue;
        let s = 0.098 + (j % 2) * 0.005;
        while (s < 0.975) {
          const step = (perAt(s) / NR) * 0.95, u = tauOf(s) * W, rx = (step / dsdt(s)) * W * 0.78, ry = (H / NR) * 0.6;
          g.globalAlpha = 0.6 + 0.3 * smooth(0.12, 0.3, bel); g.lineWidth = 2.4;
          g.beginPath(); g.ellipse(u, v * H, rx, ry, 0, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
          s += step;
        }
      }
      g.globalAlpha = 0.9; g.lineWidth = 3;
      for (let s = 0.105; s < 0.965;) { const u = tauOf(s) * W; for (const [v0, v1] of [[0, 0.115], [0.885, 1]]) { g.beginPath(); g.moveTo(u, v0 * H); g.quadraticCurveTo(u + 3, ((v0 + v1) / 2) * H, u, v1 * H); g.stroke(); } s += perAt(s) * 0.075; }
      g.lineWidth = 2.5; for (const vv of [0.118, 0.882]) { g.beginPath(); g.moveTo(tauOf(0.1) * W, vv * H); g.lineTo(tauOf(0.97) * W, vv * H); g.stroke(); }
      // head: mouth seam, snout wrinkles, cheek arcs (head u -> px = u * TAU_HEAD * W)
      const hu = (u) => u * TAU_HEAD * W;
      g.globalAlpha = 0.85; g.lineWidth = 3;
      for (const vv of [0.124, 0.876]) { g.beginPath(); g.moveTo(hu(0.03), vv * H); g.lineTo(hu(0.74), vv * H); g.stroke(); }
      g.lineWidth = 2.6;
      for (const uu of [0.26, 0.31, 0.36]) { g.beginPath(); g.ellipse(hu(uu), 0.5 * H, hu(0.012), 0.08 * H, 0, -Math.PI * 0.5, Math.PI * 0.5); g.stroke(); }
      for (const vc of [0.2, 0.8]) for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(hu(0.78 + i * 0.07), vc * H, hu(0.03), 0.06 * H, 0, -Math.PI * 0.5, Math.PI * 0.5); g.stroke(); }
      g.globalAlpha = 1;
    };
    const main = K.dataTexture(W, H, [null, G, null, null]);
    { // R, B, A from Hi's map (resampled in u); Hi's own head ink kept on the head (koi state)
      const hd = hiMap.image.data, td = main.image.data, HW = hiMap.image.width;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const hx = Math.min(HW - 1, Math.floor((x / W) * HW)), i = (y * W + x) * 4, j = (y * HW + hx) * 4;
        td[i] = hd[j]; td[i + 2] = hd[j + 2]; td[i + 3] = hd[j + 3];
        if (x / W < TAU_HEAD * 0.9) td[i + 1] = Math.max(td[i + 1], hd[j + 1] * 0.6);
      }
      main.needsUpdate = true;
    }
    // alt (dragon state): R = Hi's patches repeated along the back (saddle spills left, mid-back spills right, alternating),
    // B = the round crown spot on the forehead
    const R = (g) => {
      const list = K.HI_PATCHES;
      const sets = [list.slice(0, 3), list.slice(3, 6)];
      for (let i = 0; i < 10; i++) {
        const sc = 0.13 + i * 0.081 + (i % 3) * 0.006, gr = rBody(sc) / 0.028, set = sets[i % 2];
        const [u0, v0] = set[0];
        for (const [u, v, rx, ry, rough, sd] of set) {
          const ds = (u - u0) * 0.42 * gr, sx = sc + ds, len = rx * 0.38 * gr, rv = (ry / 0.8) * 1.0;
          K.blobWrap(g, K.mkRng(sd * 131 + i * 7), tauOf(sx) * W, (0.5 + (v - 0.5) * 1.0 + (v0 - 0.5) * 0.15) * H, (len / dsdt(sx)) * W, rv * H, rough, H);
        }
      }
      // small round spots toward the tail (Hi's little tail patch, repeated, shrinking)
      for (let i = 0; i < 3; i++) { const sc = 0.93 + i * 0.022, gr = rBody(sc) / 0.028; K.blobWrap(g, K.mkRng(900 + i), tauOf(sc) * W, (0.5 + (i % 2 ? 0.04 : -0.04)) * H, ((0.012 * gr) / dsdt(sc)) * W, 0.1 * H, 0.1, H); }
    };
    const B = (g) => {
      const sc = 0.6 * SIG_HEAD, rr = 0.0078, per = perAt(sc);
      g.beginPath(); g.ellipse(tauOf(sc) * W, 0.5 * H, (rr / dsdt(sc)) * W, (rr / per) * H, 0, 0, Math.PI * 2); g.fill();
    };
    const alt = K.dataTexture(W, H, [R, null, B, null]);
    return { main, alt, perAt };
  }

  // ---------------------------------------------------------------- skinned fins (morph: Hi's koi fins)
  const FA = { pos: [], mk: [], uv: [], flow: [], si: [], sw: [], idx: [] }, FM = { pos: [], mk: [], uv: [], flow: [], si: [], sw: [], idx: [] };
  let F = FA;
  const tmpN = V3();
  // fnD (dragon, base) / fnK (koi, morph target); flowAmp(u, v) = flutter amplitude
  function addFin(nu, nv, fnD, fnK, flowAmp, lagU = 0.8) {
    const gD = K.gridGeo(nu, nv, (u, v) => fnD(u, v)), gK = K.gridGeo(nu, nv, (u, v) => fnK(u, v));
    const P = gD.attributes.position, PK = gK.attributes.position, N = gD.attributes.normal, U = gD.attributes.uv, base = F.pos.length / 3;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), u = U.getX(i), v = U.getY(i);
      F.pos.push(x, y, z); F.mk.push(PK.getX(i) - x, PK.getY(i) - y, PK.getZ(i) - z); F.uv.push(u, v);
      tmpN.set(N.getX(i), N.getY(i), N.getZ(i));
      const fa = Math.pow(v, 1.4) * flowAmp(u, v);
      F.flow.push(tmpN.x * fa, tmpN.y * fa, tmpN.z * fa, v * 2.6 + u * lagU);
      const k = skinOf(clamp(-z, 0, 1)); F.si.push(k[0], k[1], 0, 0); F.sw.push(k[2], k[3], 0, 0);
    }
    for (let i = 0; i < gD.index.count; i++) F.idx.push(gD.index.getX(i) + base);
  }
  const nrm = (x, y, z) => V3(x, y, z).normalize();
  const t1 = V3();
  // dorsal: Hi's dorsal -> the long scalloped dorsal fringe along the whole back
  addFin(260, 4, (u, v) => {
    const s = 0.1 + 0.865 * u, p = dsurfS(s, 0.5); p.y -= 0.0008;
    const h = (0.62 * rBody(s) + 0.0016) * (0.35 + 0.65 * smooth(0, 0.04, u)) * (0.62 + 0.38 * Math.pow(Math.abs(Math.sin(u * Math.PI * 58)), 0.7));
    return p.addScaledVector(nrm(0, 1, -0.75), h * v);
  }, (u, v) => {
    const tau = 0.3 + 0.44 * u, p = ksurf(tau, 0.5); p.y -= 0.004;
    const len = 0.13 * (0.55 + 0.45 * smooth(0, 0.12, u)) * (1 + 0.6 * u);
    return p.addScaledVector(nrm(0, lerp(1, 0.45, u), lerp(-0.35, -1.0, u)), len * v);
  }, () => 0.0035, 3.0);
  // tail: Hi's forked butterfly tail fin (kept as a koi tail, flowing) at the dragon's tail tip
  addFin(18, 10, (u, v) => {
    const p = V3(0, lerp(-0.003, 0.003, u), -0.99), ph = lerp(-0.95, 0.95, u), len = 0.085 * (0.45 + 0.55 * Math.pow(Math.abs(2 * u - 1), 1.1));
    return p.add(t1.set(0.008 * v * v * Math.sin(Math.PI * u), Math.sin(ph) * len * v, -Math.cos(ph) * len * v));
  }, (u, v) => {
    const p0 = kprof(0.985), p = V3(0, lerp(p0.cy - p0.hb * 0.9, p0.cy + p0.ht * 0.9, u), -0.975), ph = lerp(-0.85, 0.85, u), len = 0.44 * (0.5 + 0.5 * Math.pow(Math.abs(2 * u - 1), 1.1));
    return p.add(t1.set(0.035 * v * v * Math.sin(Math.PI * u), Math.sin(ph) * len * v, -Math.cos(ph) * len * v));
  }, () => 0.014, 1.2);
  // Hi's pectorals / pelvics -> flowing shoulder / hip fins at the leg roots
  const LEG_S = [0.2, 0.6];
  for (const side of [1, -1]) {
    for (const [sk, sd, vk, len] of [[0.205, LEG_S[0], 0.17, 0.35], [0.5, LEG_S[1], 0.1, 0.19]]) {
      addFin(8, 7, (u, v) => {
        const p = dsurfS(sd - 0.004 + 0.016 * u, side > 0 ? 0.22 : 0.78); p.x *= 0.96;
        return p.addScaledVector(nrm(side * 0.75, -0.15, -1.0), 0.026 * (0.55 + 0.45 * Math.sin(Math.PI * u)) * v);
      }, (u, v) => {
        const p = ksurf(sk + 0.07 * u, side > 0 ? vk : 1 - vk);
        const d = nrm(lerp(1.0, 0.55, u) * side, lerp(-0.4, -0.55, u), lerp(-0.45, -1.05, u));
        return p.addScaledVector(d, len * (0.62 + 0.38 * Math.sin(Math.PI * (0.25 + 0.75 * u))) * v).add(t1.set(0, -0.06 * v * v, -0.03 * v * v));
      }, () => 0.006);
    }
  }
  // mane: many long translucent locks from the back of the skull and down the neck: tapered to points, wavy, lifting
  // off and streaming back (skinned to the spine -> they flow with every bend of the body)
  F = FM;
  const rngM = K.mkRng(808);
  for (let i = 0; i < 56; i++) {
    const f = rngM(), vv = 0.18 + 0.64 * f, top = 1 - Math.abs(vv - 0.5) * 2.0;
    const s0m = 0.056 + rngM() * 0.11, sf = (s0m - 0.056) / 0.11;
    const len = (0.055 + 0.085 * top + rngM() * 0.04) * (1 - 0.35 * sf), wd = 0.0075 + rngM() * 0.005, lift = 0.35 + rngM() * 0.8;
    const wv = rngM() * 6.28, sw0 = (rngM() - 0.5) * 2;
    addFin(3, 14, (u, v) => {
      const p = dsurfS(s0m, vv), n = V3(p.x, p.y, 0).normalize(), tg = V3(-n.y, n.x, 0), r = Math.hypot(p.x, p.y);
      const w = wd * Math.pow(1 - v, 0.75) * (u - 0.5);
      const back = len * v, out = Math.sin(v * Math.PI * 0.7) * len * 0.2 * lift + 0.0008 + 0.003 * v;
      const sway = len * (0.2 * Math.sin(v * 4.6 + wv) * v + 0.14 * sw0 * v * v);
      return V3(n.x * (r + out) + tg.x * (w + sway), n.y * (r + out) + tg.y * (w + sway), p.z - back + 0.0015 * Math.sin(u * 3.14));
    }, (u, v) => ksurf(0.18 + (u - 0.5) * 0.02, vv), (u, v) => 0.008 + 0.008 * v, 1.0);
  }
  F = FA;
  function skinnedFin(FF, mat, name) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(FF.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(FF.uv, 2));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(FF.flow, 4));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(FF.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(FF.sw, 4));
    g.setIndex(FF.idx); g.computeVertexNormals();
    g.morphAttributes.position = [new THREE.Float32BufferAttribute(FF.mk, 3)]; g.morphTargetsRelative = true;
    const m = new THREE.SkinnedMesh(g, mat); m.name = name; root.add(m); m.bind(skeleton, new THREE.Matrix4());
    return m;
  }
  const finMat = K.finMaterial({ map: K.finMap({ seed: 9, rays: 11 }), c0: '#fff8f0', c1: '#ffd8c4', ray: '#e9a894', seed: 4.1, opacity: 1.2 });
  const lockMat = K.finMaterial({ map: lockMap(), c0: '#fffaf4', c1: '#ffc9bc', ray: '#e8b0a8', ink: '#a8707c', seed: 2.3, opacity: 1.3, rayAmt: 0.3 });
  const fins = skinnedFin(FA, finMat, 'dragonFins'), mane = skinnedFin(FM, lockMat, 'dragonMane');
  // lock map (mane, beard): u across the lock, v along; soft membrane, 2 flowing hair lines, thin light outline, pink tips
  function lockMap() {
    const W = 128, Hh = 256;
    const R = (g) => { g.lineWidth = 2.2; for (const u0 of [0.36, 0.64]) { g.beginPath(); for (let y = 0; y <= Hh * 0.85; y += 4) { const x = (u0 + 0.05 * Math.sin(y / Hh * 7 + u0 * 9) + (0.5 - u0) * (y / Hh) * 0.8) * W; y ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } };
    const G = (g) => { g.lineWidth = 3; g.beginPath(); g.moveTo(1.5, 0); g.lineTo(1.5, Hh); g.moveTo(W - 1.5, 0); g.lineTo(W - 1.5, Hh); g.stroke(); };
    const B = (g) => { const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#000'); gr.addColorStop(0.45, '#333'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh); };
    const Aa = (g) => { g.fillStyle = 'rgb(175,175,175)'; g.fillRect(0, 0, W, Hh); const gr = g.createLinearGradient(0, 0, 0, Hh * 0.18); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh * 0.18); };
    const t = K.dataTexture(W, Hh, [R, G, B, Aa], { wrapT: THREE.ClampToEdgeWrapping });
    const d = t.image.data; for (let i = 0; i < W * Hh; i++) d[i * 4 + 3] = Math.max(d[i * 4 + 3], d[i * 4] * 0.9, d[i * 4 + 1] * 0.8);
    t.needsUpdate = true; return t;
  }

  // rigid fin pieces (cheek fins, beard, elbow fins): same fin material, own flutter attribute
  function finPiece(nu, nv, fn, amp = 0.004, lagU = 0.8, mat = finMat) {
    const g = K.gridGeo(nu, nv, fn), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, fl = [];
    for (let i = 0; i < P.count; i++) { const v = U.getY(i), u = U.getX(i), A2 = Math.pow(v, 1.4) * amp; fl.push(N.getX(i) * A2, N.getY(i) * A2, N.getZ(i) * A2, v * 2.6 + u * lagU); }
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(fl, 4));
    return new THREE.Mesh(g, mat);
  }

  // ---------------------------------------------------------------- head parts (children of bone 0, body bind coordinates)
  const head = bones[0];
  const H = new THREE.Group(); head.add(H); H.position.set(0, 0, BS[0]);    // H uses body bind coordinates
  const white = K.cel({ base: '#FAF7F2', shade: '#B9BCD6', highlight: 0.45, rimColor: '#fff1dc', darkRim: 0.35 });
  const gold = K.cel({ base: '#f0d48e', shade: '#b48e5c', highlight: 0.7, hiColor: '#fff6d8', rimColor: '#fff0c0', id: 24 });
  const claw = K.cel({ base: '#f2be4a', shade: '#a8703a', highlight: 0.8, hiColor: '#fff4c8', id: 25 });
  const tooth = K.cel({ base: '#fffaf0', shade: '#c9c4d8', highlight: 0.3, id: 26 });
  const mouthIn = K.cel({ base: '#a52a40', shade: '#6e1e3a', highlight: 0.15, id: 27 });
  const throat = K.cel({ base: '#5a1430', shade: '#3a0e24', highlight: 0.0, id: 27 });
  const tongueM = K.cel({ base: '#e05a72', shade: '#a33454', highlight: 0.5, id: 28 });
  const whiskerM = K.cel({ base: '#f8e4da', shade: '#b993ab', highlight: 0.35, id: 29 });
  const feat = new THREE.Group(); H.add(feat);       // everything that scales in with grow (not eyes)
  const fang = (r, h, down = true, segs = 7) => { const g = K.cone(r, h, segs); if (down) g.rotateX(Math.PI); return g; };
  // lower jaw: hinge under the back of the skull
  const S_HINGE = 0.064, JL = 0.06, hingeY = -hHb(S_HINGE / SIG_HEAD) + 0.0004;
  const jawPivot = new THREE.Group(); jawPivot.position.set(0, hingeY, -S_HINGE); feat.add(jawPivot);
  const jaw = new THREE.Group(); jawPivot.add(jaw);
  const jW = (t) => 0.9 * hW((S_HINGE - t * JL) / SIG_HEAD) * (1 - 0.15 * t);
  {
    const jg = K.blobGeo(1, 1, 1, null, 36, 18), p = jg.attributes.position, v = V3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const t = (v.z + 1) / 2, d = 0.0088 * (1 - 0.45 * t) + 0.0014;
      v.set(v.x * jW(t), v.y > 0 ? v.y * 0.0007 : v.y * d * (1 + 0.25 * gauss(t, 0.85, 0.12)), t * JL);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    jg.computeVertexNormals();
    jaw.add(new THREE.Mesh(jg, white));
    const ig = K.blobGeo(1, 1, 1, null, 24, 8), q = ig.attributes.position;
    for (let i = 0; i < q.count; i++) { v.fromBufferAttribute(q, i); const t = 0.06 + 0.84 * (v.z + 1) / 2; v.set(v.x * jW(t) * 0.78, v.y * 0.0005 + 0.0006, t * JL); q.setXYZ(i, v.x, v.y, v.z); }
    ig.computeVertexNormals(); jaw.add(new THREE.Mesh(ig, mouthIn));
    // tongue: flat, curling up past the chin
    const tg = K.tubeAlong(K.curvePts([[0, 0.0012, 0.01], [0, 0.0016, 0.03], [0, 0.002, 0.05], [0, 0.0045, 0.062], [0, 0.0095, 0.066], [0, 0.0125, 0.061]], 24), (t) => 0.0032 * (1 - 0.75 * t) + 0.0004, 8, { flat: 0.4 });
    const tongue = new THREE.Mesh(tg, tongueM); tongue.name = 'tongue'; jaw.add(tongue); jaw.userData.tongue = tongue;
    // teeth along the rim + 2 big lower fangs
    for (const side of [1, -1]) {
      for (let i = 0; i < 8; i++) {
        const t = 0.18 + i * 0.095, big = i === 7, f = new THREE.Mesh(fang(big ? 0.0013 : 0.0007, big ? 0.0062 : 0.0021, false), tooth);
        f.position.set(side * jW(t) * 0.86, 0.0002, t * JL); f.rotation.z = -side * 0.12; jaw.add(f);
      }
    }
    // beard: flame-shaped translucent locks under the chin and jaw, hanging and streaming back
    for (let i = 0; i < 9; i++) {
      const tb = 0.42 + i * 0.065, dx = ((i % 3) - 1) * 0.0022, len = 0.026 + 0.016 * Math.sin((i / 8) * Math.PI), wd = 0.006, ph = i * 1.7;
      jaw.add(finPiece(3, 10, (u, v) => {
        const w = (u - 0.5) * wd * Math.pow(1 - v, 0.7);
        return V3(dx * (1 + 2 * v) + w + 0.002 * Math.sin(v * 4 + ph) * v, -0.0074 * (1 - 0.42 * tb) - 0.001 - len * 0.7 * v + 0.007 * v * v, tb * JL - len * 0.72 * v);
      }, 0.006, 0.8, lockMat));
    }
  }
  // gullet: dark throat between the jaws at the hinge (only shows when the mouth opens)
  const gullet = new THREE.Mesh(K.blobGeo(0.0068, 1, 0.013, null, 20, 12), throat); gullet.position.set(0, hingeY, -S_HINGE + 0.014); feat.add(gullet);
  // upper teeth: rows along the lip line + 2 big upper fangs near the front
  for (const side of [1, -1]) {
    for (let i = 0; i < 9; i++) {
      const s = 0.009 + i * 0.0058, big = i === 1, p = dsurfS(s, side > 0 ? 0.11 : 0.89);
      const f = new THREE.Mesh(fang(big ? 0.0014 : 0.0007, big ? 0.0075 : 0.0022), tooth); f.position.copy(p); f.position.x *= 0.9; f.position.y += 0.0004; feat.add(f);
    }
  }
  // brow horns: a hard ridge hooding each eye, ending in a short back-swept spike (the fierce hood)
  for (const side of [1, -1]) {
    const e0 = dsurfS(0.034, side > 0 ? 0.345 : 0.655), e1 = dsurfS(0.045, side > 0 ? 0.36 : 0.64), e2 = dsurfS(0.055, side > 0 ? 0.37 : 0.63);
    const pts = K.curvePts([e0.clone().add(V3(side * 0.0002, 0.0004, 0)), e1.clone().add(V3(side * 0.0009, 0.0016, 0)), e2.clone().add(V3(side * 0.0014, 0.0018, 0)), e2.clone().add(V3(side * 0.0036, 0.0046, -0.0062)), e2.clone().add(V3(side * 0.0052, 0.0074, -0.012))], 20);
    feat.add(new THREE.Mesh(K.tubeAlong(pts, (t) => 0.0021 * Math.sin(Math.PI * (0.12 + 0.88 * Math.min(1, t * 1.6))) * (1 - 0.75 * smooth(0.5, 1, t)) + 0.0002, 8), white));
  }
  // nostrils: dark hole + a flared curl on each nostril mound
  for (const side of [1, -1]) {
    const c = dsurfS(0.0072, side > 0 ? 0.43 : 0.57);
    const hole = new THREE.Mesh(K.blobGeo(0.0012, 0.0006, 0.0017), throat); hole.position.copy(c).add(V3(side * 0.0005, 0.0001, 0.0006)); hole.rotation.z = side * 0.5; feat.add(hole);
  }
  // antlers: pale gold, swept back, 3 tines each
  const antlers = new THREE.Group(); feat.add(antlers);
  for (const side of [1, -1]) {
    const b0 = dsurfS(0.069, side > 0 ? 0.43 : 0.57); b0.y -= 0.0008;
    const pts = K.curvePts([b0, b0.clone().add(V3(side * 0.0035, 0.012, -0.007)), b0.clone().add(V3(side * 0.008, 0.021, -0.024)), b0.clone().add(V3(side * 0.011, 0.025, -0.046)), b0.clone().add(V3(side * 0.012, 0.03, -0.06))], 24);
    antlers.add(new THREE.Mesh(K.tubeAlong(pts, (t) => 0.0025 * (1 - 0.72 * t) + 0.0003, 8), gold));
    for (const [tt, d] of [[0.28, [0.0015, 0.011, 0.007]], [0.52, [0.003, 0.012, 0.001]], [0.76, [0.002, 0.009, -0.004]]]) {
      const pp = pts[Math.round(tt * 23)], rr = 0.0025 * (1 - 0.72 * tt) * 0.75;
      antlers.add(new THREE.Mesh(K.tubeAlong(K.curvePts([pp, pp.clone().add(V3(side * d[0] * 0.5, d[1] * 0.55, d[2] * 0.4)), pp.clone().add(V3(side * d[0], d[1], d[2]))], 10), (t) => rr * (1 - 0.8 * t) + 0.00018, 6), gold));
    }
  }
  // cheek fins: translucent fans flaring back from behind the jaw hinge
  for (const side of [1, -1]) {
    feat.add(finPiece(9, 6, (u, v) => {
      const p = dsurfS(0.058 + 0.016 * u, side > 0 ? lerp(0.27, 0.19, u) : lerp(0.73, 0.81, u)); p.x *= 0.95;
      const len = 0.03 * (0.55 + 0.45 * Math.sin(Math.PI * (0.2 + 0.8 * u)));
      return p.addScaledVector(nrm(side * 0.75, lerp(0.35, -0.25, u), -1.0), len * v);
    }, 0.004));
  }
  // eyes: Hi's eye (same iris), moved to the dragon skull under the brow ridge
  const eyeGeo = new THREE.CircleGeometry(1, 40);
  { const p = eyeGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.3 * (1 - x * x - y * y)); } eyeGeo.computeVertexNormals(); }
  const eyeMats = [], eyes = [];
  const eyeFrame = (surfFn, tau, v, side, cheat) => {
    const p = surfFn(tau, v), pa = surfFn(tau, v + 0.01 * side), pb = surfFn(tau + 0.004, v);
    const n = V3().subVectors(pa, p).cross(V3().subVectors(pb, p)).normalize(); if (n.x * side < 0) n.negate();
    n.y += cheat[0]; n.z += cheat[1]; n.normalize();
    const fwd = V3(0, 0, 1).addScaledVector(n, -n.z).normalize(), up = V3().crossVectors(n, fwd).multiplyScalar(-side); if (up.y < 0) up.negate();
    return { p, n, fwd, up };
  };
  for (const side of [1, -1]) {
    const m = K.eyeMaterial({ skin: '#FAF7F2', iris: '#1a1430', iris2: '#5b3f8e', lash: 0.3 }); eyeMats.push(m);
    const e = new THREE.Mesh(eyeGeo, m); e.matrixAutoUpdate = false; H.add(e); eyes.push(e);
    e.userData = { side, kf: eyeFrame(ksurf, 0.118, side > 0 ? 0.31 : 0.69, side, [0.18, 0.12]), df: eyeFrame(dsurf, tauOf(0.0425), side > 0 ? 0.305 : 0.695, side, [0.05, 0.3]) };
  }
  // whiskers (root space, rebuilt each pose): Hi's barbels -> long whiskers trailing along the flight path, curling at the tips
  const whiskers = [1, -1].map((side) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), whiskerM); m.userData.side = side; m.frustumCulled = false; root.add(m); return m; });
  // legs: shoulder -> upper arm -> elbow (fin) -> forearm -> paw with 4 gold claws
  const legs = [];
  for (const [li, s] of LEG_S.entries()) for (const side of [1, -1]) {
    const bi = BS.findIndex((x) => x >= s), bone = bones[bi];
    const sh = new THREE.Group(); bone.add(sh);
    const sp = dsurfS(s, side > 0 ? 0.17 : 0.83); sh.position.copy(sp).sub(V3(0, 0, -BS[bi])); sh.position.x *= 0.8; sh.position.y *= 0.8;
    const gr = rBody(s) / 0.028, LU = 0.028 * gr, LF = 0.024 * gr;
    sh.add(new THREE.Mesh(K.tubeAlong(K.curvePts([[0, 0.004, 0], [0, -LU * 0.5, -0.001], [0, -LU, 0]], 10), (t) => (0.0078 - 0.0024 * t) * gr, 10), white));
    const elbow = new THREE.Group(); elbow.position.set(0, -LU, 0); sh.add(elbow);
    elbow.add(new THREE.Mesh(K.blobGeo(0.0058 * gr, 0.0058 * gr, 0.0058 * gr, null, 12, 8), white));
    elbow.add(new THREE.Mesh(K.tubeAlong(K.curvePts([[0, 0, 0], [0, -LF * 0.5, 0.001], [0, -LF, 0]], 10), (t) => (0.0054 - 0.0012 * t) * gr, 10), white));
    // elbow fin: translucent flame trailing back
    elbow.add(finPiece(4, 6, (u, v) => V3(side * 0.003 * gr + (u - 0.5) * 0.003 * gr, -0.003 * gr + (u - 0.5) * 0.006 * gr - 0.008 * gr * v, -0.004 * gr - 0.022 * gr * v * (0.7 + 0.3 * Math.sin(Math.PI * u))), 0.004));
    const wrist = new THREE.Group(); wrist.position.set(0, -LF, 0); elbow.add(wrist);
    wrist.add(new THREE.Mesh(K.blobGeo(0.0052 * gr, 0.0036 * gr, 0.0062 * gr), white));
    const clawsG = [];
    for (let c = 0; c < 4; c++) {
      const cg = new THREE.Group(), back = c === 3;
      cg.position.set(back ? 0 : (c - 1) * 0.0032 * gr, -0.0012 * gr, back ? -0.004 * gr : 0.0042 * gr); cg.rotation.y = back ? Math.PI : (c - 1) * 0.32;
      const cl = new THREE.Mesh(K.tubeAlong(K.curvePts([[0, 0, 0], [0, -0.0008, 0.0035], [0, -0.0034, 0.0062], [0, -0.0064, 0.0058]].map((q) => q.map((x) => x * gr)), 10), (t) => (0.0015 * (1 - 0.88 * t) + 0.00012) * gr, 7), claw);
      cg.add(cl); wrist.add(cg); clawsG.push(cg);
    }
    sh.userData = { side, front: li === 0, elbow, wrist, clawsG }; legs.push(sh);
  }
  K.noCull(root);

  // ---------------------------------------------------------------- state + posing
  const S = { k: 1, len: o.length ?? 300, lenFixed: false, name: 'glide', jaw: 0, roar: 0, mane: 0.5, claws: 0, t: 0, wave: 0, mood: 'dragon', moodK: 1 };
  const Lw = () => (S.lenFixed ? S.len : 0.3 * Math.pow(S.len / 0.3, S.k));
  const baseP = bones.map(() => V3()), baseQ = bones.map(() => new THREE.Quaternion()), baseL = { v: 1 };
  const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), X = V3(), Y = V3(), Z = V3();
  function setBone(i, p, f, up, L) {
    Z.copy(f).normalize(); X.crossVectors(up, Z).normalize(); Y.crossVectors(Z, X);
    tmpM.makeBasis(X, Y, Z); baseQ[i].setFromRotationMatrix(tmpM); baseP[i].copy(p); baseL.v = L;
  }
  // root-space frame on the spine at body parameter s (s < BS[0]: the rigid head)
  const spP = V3(), spQ = new THREE.Quaternion();
  function spine(s) {
    if (s <= BS[0]) { spQ.copy(bones[0].quaternion); spP.set(0, 0, BS[0] - s).multiplyScalar(bones[0].scale.x).applyQuaternion(spQ).add(bones[0].position); return; }
    let i = 0; while (i < NB - 2 && BS[i + 1] < s) i++;
    const t = clamp((s - BS[i]) / (BS[i + 1] - BS[i]), 0, 1);
    spP.lerpVectors(bones[i].position, bones[i + 1].position, t); spQ.slerpQuaternions(bones[i].quaternion, bones[i + 1].quaternion, t);
  }
  const LEGP = {   // [shoulder rx, rz, elbow rx, wrist rx] per pose, front / back
    glide: [[1.15, 0.45, -0.9, -0.5], [1.25, 0.35, -0.6, -0.6]],
    roar: [[-0.35, 0.75, -0.55, 0.45], [1.0, 0.45, -0.7, -0.4]],
    spiral: [[0.65, 0.7, -1.2, 0.2], [0.85, 0.6, -1.0, 0.0]],
    dive: [[1.45, 0.2, -0.35, -0.8], [1.45, 0.2, -0.3, -0.8]],
  };
  function finishPose() {
    const k = S.k, L = baseL.v;
    // restore the path pose, then layer the pose on top (idempotent)
    bones.forEach((bn, i) => { bn.position.copy(baseP[i]); bn.quaternion.copy(baseQ[i]); bn.scale.setScalar(L); });
    const roar = S.roar * smooth(0.6, 0.95, k), dive = S.name === 'dive' ? 1 : 0;
    // head thrown back on roar (neck arches up through bones 1..5), slight tuck on dive
    const pitch = -0.62 * roar + 0.18 * dive;
    for (let i = 0; i < 6; i++) {
      const w = i === 0 ? 1 : (1 - i / 6) * 0.45;
      bones[i].quaternion.multiply(tmpQ.setFromAxisAngle(V3(1, 0, 0), pitch * w));
      const up = V3(0, 1, 0).applyQuaternion(baseQ[i]);
      bones[i].position.addScaledVector(up, L * 0.016 * roar * (i === 0 ? 1 : 1 - i / 6));
    }
    bones.forEach((bn) => bn.updateMatrix());
    const jawA = Math.max(S.jaw, roar) * 0.92 * smooth(0.45, 0.85, k);
    jawPivot.rotation.x = jawA;
    jaw.userData.tongue.visible = jawA > 0.08; jaw.userData.tongue.scale.set(1, 1, 0.7 + 0.3 * smooth(0.2, 0.8, jawA));
    gullet.scale.set(1, 0.002 + 0.0075 * smooth(0.0, 0.7, jawA), 1); gullet.position.y = hingeY - 0.0028 * smooth(0, 0.7, jawA);
    bodyMat.uniforms.uPalAmt.value = smooth(0.5, 0.8, k);
    bodyMat.uniforms.uAlt.value = smooth(0.55, 0.9, k);
    const koiW = 1 - smooth(0.0, 1.0, k);
    body.morphTargetInfluences[0] = koiW; fins.morphTargetInfluences[0] = koiW; mane.morphTargetInfluences[0] = koiW;
    const fk = smooth(0.45, 0.95, k);
    feat.visible = k > 0.42; feat.scale.setScalar(Math.max(1e-4, fk));
    antlers.scale.setScalar(Math.max(1e-4, smooth(0.55, 0.95, k)));
    // legs: per-pose angles + a slow paddle on twos
    const lp = LEGP[S.name] ?? LEGP.glide;
    legs.forEach((g) => {
      const { side, front, elbow, wrist, clawsG } = g.userData, P = lp[front ? 0 : 1], ph = S.t * 1.6 + (front ? 0 : 1.7) + (side > 0 ? 0 : 0.6);
      g.visible = k > 0.4; g.scale.setScalar(Math.max(1e-4, smooth(0.4, 0.9, k)));
      g.rotation.set(P[0] + 0.12 * Math.sin(ph), 0, side * P[1]);
      elbow.rotation.set(P[2] + 0.15 * Math.sin(ph - 0.8), 0, 0);
      wrist.rotation.set(P[3] + 0.12 * Math.sin(ph - 1.6), 0, 0);
      const grip = S.name === 'roar' && front ? -0.25 : S.claws;
      clawsG.forEach((c, ci) => (c.rotation.x = -0.9 * grip + (ci === 3 ? 0 : 0.1)));
    });
    // eyes: koi frame -> dragon frame
    const ke = smooth(0.15, 0.85, k), er = Math.exp(lerp(Math.log(0.068), Math.log(0.0058), ke));
    eyes.forEach((e) => {
      const { kf, df } = e.userData;
      const p = kf.p.clone().lerp(df.p, ke), n = kf.n.clone().lerp(df.n, ke).normalize(), fw = kf.fwd.clone().lerp(df.fwd, ke).normalize(), up = kf.up.clone().lerp(df.up, ke).normalize();
      e.matrix.makeBasis(fw, up, n).scale(V3(er, er, er)); e.matrix.setPosition(p.addScaledVector(n, -er * 0.15));
    });
    if (k > 0.6) K.setMood(eyeMats, S.mood ?? 'dragon', smooth(0.6, 1, k) * (S.moodK ?? 1));
    buildWhiskers(ke, roar, dive);
    const fl = finMat.uniforms.uFlut.value; fl.set(0.55 + 0.25 * dive, S.t * 5.5, (S.mane - 0.5) * 0.8 + roar * 0.7, 0.25);
    lockMat.uniforms.uFlut.value.set(0.6 + 0.3 * dive, S.t * 4.6, (S.mane - 0.5) * 0.6 + roar * 0.9, 0.3);
  }
  // whisker roots: Hi's barbel at the koi mouth / the dragon's upper lip near the nose (body bind coordinates)
  const wP = [], wK = [], wD = [], tmpV = V3();
  for (let i = 0; i < 44; i++) { wP.push(V3()); wK.push(V3()); wD.push(V3()); }
  function headToRoot(pb, out) { return out.set(pb.x, pb.y, pb.z + BS[0]).multiplyScalar(bones[0].scale.x).applyQuaternion(bones[0].quaternion).add(bones[0].position); }
  function buildWhiskers(ke, roar, dive) {
    const L = baseL.v, n = wP.length, WL = 0.3, ph = S.t * 2.2;
    whiskers.forEach((w) => {
      const side = w.userData.side;
      const pk = ksurf(0.035, side > 0 ? 0.16 : 0.84), pd = dsurfS(0.016, side > 0 ? 0.27 : 0.73);
      const r0 = V3(pd.x + side * 0.001, pd.y, 0);        // root offset in the spine frame
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        // koi barbel (head space)
        headToRoot(pk.clone().add(V3(side * (0.02 * t + 0.03 * t * t), -0.035 * t - 0.055 * t * t, 0.012 * t - 0.03 * t * t)), wK[i]);
        // dragon whisker: rides the flight path behind the root (follow-through), drifts out, waves, curls at the tip
        const d = t * WL, s = 0.016 + d * 0.92;
        spine(s);
        // sweep out from the lip, ride well clear of the head and neck in a long S, curl at the tip
        const c = smooth(0.7, 1.0, t), an = c * 4.6;
        let x = side * (0.01 + 0.26 * Math.pow(d, 0.75) + 0.026 * Math.sin(t * 6.5 - ph) * t + 0.01 * Math.sin(t * 13 - ph * 1.7) * t + 0.02 * c * Math.sin(an));
        let y = 0.002 - 0.034 * Math.sin(Math.min(1, t * 2.6) * Math.PI * 0.5) + 0.036 * smooth(0.4, 1.0, t) + 0.032 * Math.sin(t * 5 - ph * 1.3 + side) * t + 0.02 * c * (1 - Math.cos(an));
        x += side * roar * 0.09 * d; y += roar * 0.22 * d * (1 - 0.4 * t);
        x *= 1 - 0.35 * dive; y *= 1 - 0.3 * dive;
        const bl = smooth(0, 0.08, t);
        const fz = 0.014 * Math.sin(Math.min(1, t * 3.2) * Math.PI) * (1 - roar * 0.5);   // springs forward off the lip before trailing back
        tmpV.set(lerp(r0.x, x, bl), lerp(r0.y, y, bl), fz * bl).multiplyScalar(L).applyQuaternion(spQ);
        wD[i].copy(spP).add(tmpV);
        if (t < 0.08) { const hp = headToRoot(V3(lerp(pd.x + side * 0.001, x, bl), lerp(pd.y, y, bl), -0.016 - d), V3()); wD[i].lerp(hp, 1 - bl); }
        wP[i].copy(wK[i]).lerp(wD[i], ke);
      }
      w.geometry.dispose();
      const rr = (t) => L * Math.exp(lerp(Math.log(0.007 * (1 - 0.7 * t) + 0.0004), Math.log(0.0014 * (1 - 0.65 * t) + 0.0003), ke));
      w.geometry = K.tubeAlong(wP, rr, 7);
      w.visible = true;
    });
  }

  // path helpers (world curves for follow): S-glide, spiral (corkscrew climb), dive (arc down)
  const paths = {
    // s(origin, {len=600, amp=60, waves=2, dir=Vector3(1,0,0), up=Vector3(0,1,0), rise=0})
    s(origin, op = {}) {
      const len = op.len ?? 600, amp = op.amp ?? 60, waves = op.waves ?? 2, dir = (op.dir ?? V3(1, 0, 0)).clone().normalize(), up = (op.up ?? V3(0, 1, 0)).clone().normalize(), rise = op.rise ?? 0;
      const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(origin.clone().addScaledVector(dir, (t - 0.5) * len).addScaledVector(up, amp * Math.sin(t * Math.PI * 2 * waves) + rise * t)); }
      return new THREE.CatmullRomCurve3(pts);
    },
    // spiral(center, {radius=90, height=400, turns=2})
    spiral(center, op = {}) {
      const r = op.radius ?? 90, h = op.height ?? 400, turns = op.turns ?? 2, pts = [];
      for (let i = 0; i <= turns * 16; i++) { const t = i / (turns * 16), an = t * turns * Math.PI * 2; pts.push(V3(center.x + Math.cos(an) * r, center.y + t * h, center.z + Math.sin(an) * r)); }
      return new THREE.CatmullRomCurve3(pts);
    },
    // dive(from, to): arcs up, then plunges, levels out at `to`
    dive(from, to, op = {}) {
      const mid = from.clone().lerp(to, 0.35).add(V3(0, op.crest ?? 60, 0)), low = from.clone().lerp(to, 0.8); low.y = to.y + (op.flare ?? 15);
      return new THREE.CatmullRomCurve3([from.clone(), mid, from.clone().lerp(to, 0.6).setY(lerp(mid.y, to.y, 0.6)), low, to.clone()]);
    },
  };

  const api = {
    root, bones, body, finMesh: fins, maneMesh: mane, mats: { body: bodyMat, fin: finMat, lock: lockMat, eyes: eyeMats }, get length() { return Lw(); }, paths,
    setLength(m) { if (m == null) { S.lenFixed = false; S.len = o.length ?? 300; } else { S.lenFixed = true; S.len = m; } return api; },
    grow(k = 1) { S.k = clamp(k, 0, 1); return api; },
    // pose({name: glide | roar | spiral | dive, k, jaw, roar, mane, claws}); name roar => roar = k (default 1)
    pose(p = {}) {
      S.name = p.name ?? 'glide'; S.jaw = p.jaw ?? 0; S.roar = p.roar ?? (S.name === 'roar' ? p.k ?? 1 : 0); S.mane = p.mane ?? 0.5; S.claws = p.claws ?? (S.name === 'spiral' ? 0.6 : 0);
      finishPose(); return api;
    },
    eye(mood = 'dragon', k = 1) { S.mood = mood; S.moodK = k; K.setMood(eyeMats, mood, k); return api; },
    crown(g = 0) { bodyMat.uniforms.uGlow.value = g; return api; },
    flash(k = 0) { bodyMat.uniforms.uFlash.value = k; finMat.uniforms.uFlash.value = k; lockMat.uniforms.uFlash.value = k; return api; },
    gold(pos = -1, amt = 0) { bodyMat.uniforms.uGoldPos.value = pos; bodyMat.uniforms.uGoldAmt.value = amt; return api; },
    // follow(curve, t, speed, {twos, offset, roll, wave}): head at arc length t*speed + offset (m), body trailing along the curve
    follow(curve, t, speed = 40, op = {}) {
      const tq = op.twos === false ? t : Math.floor(t * 12 + 1e-6) / 12;
      S.t = tq; root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
      const L = Lw(), CL = curve.getLength(), headA = tq * speed + (op.offset ?? 0);
      const P0 = curve.getPointAt(0), T0 = curve.getTangentAt(0), P1 = curve.getPointAt(1), T1 = curve.getTangentAt(1);
      const up = V3(0, 1, 0), prevUp = V3();
      const wave = op.wave ?? 0;
      for (let i = 0; i < NB; i++) {
        const a2 = headA - BS[i] * L;
        let p, f;
        if (a2 <= 0) { p = P0.clone().addScaledVector(T0, a2); f = T0.clone(); }
        else if (a2 >= CL) { p = P1.clone().addScaledVector(T1, a2 - CL); f = T1.clone(); }
        else { const u = a2 / CL; p = curve.getPointAt(u); f = curve.getTangentAt(u); }
        if (i === 0) { prevUp.copy(up); if (Math.abs(f.dot(up)) > 0.97) prevUp.set(0, 0, -1).applyAxisAngle(V3(0, 1, 0), Math.atan2(f.x, f.z)); }
        const u2 = prevUp.clone().addScaledVector(f, -prevUp.dot(f)).normalize();
        if (op.roll) u2.applyAxisAngle(f, op.roll);
        if (wave) { const sd = V3().crossVectors(u2, f).normalize(); p.addScaledVector(sd, wave * L * 0.014 * Math.sin(Math.PI * 2 * (BS[i] * 2.2 - tq * 0.6)) * smooth(0.06, 0.25, BS[i])); }
        setBone(i, p, f, u2, L); prevUp.copy(u2);
      }
      finishPose();
      return api;
    },
    // place(pos, dir, {wave, t}): straight body from the head at pos trailing opposite dir (tests, close-ups)
    place(pos, dir = V3(0, 0, 1), op = {}) {
      const d = dir.clone().normalize(), line = new THREE.LineCurve3(pos.clone().addScaledVector(d, -Lw() * 1.2), pos.clone());
      return api.follow(line, op.t ?? 0, 0, { offset: Lw() * 1.2, wave: op.wave ?? 0, twos: op.twos ?? true, roll: op.roll });
    },
    reset() { S.lenFixed = false; S.len = o.length ?? 300; S.jaw = S.roar = S.claws = 0; S.mane = 0.5; S.name = 'glide'; api.crown(0).flash(0).gold(-1, 0); S.mood = 'dragon'; S.moodK = 1; K.setMood(eyeMats, 'dragon', 1); return api; },
    // anchor(name): head | eye | mouth | crown | tail | chest | s:<0..1>
    anchor(name = 'head') {
      root.updateMatrixWorld(true);
      if (name === 'eye') return eyes[0].getWorldPosition(V3());
      if (name === 'mouth') return V3(0, hingeY * 0.6, -0.008).applyMatrix4(H.matrixWorld);
      if (name === 'crown') return dsurfS(0.6 * SIG_HEAD, 0.5).applyMatrix4(H.matrixWorld);
      if (name === 'head') return V3(0, 0.004, -0.04).applyMatrix4(H.matrixWorld);
      const s = { chest: 0.2, tail: 0.98 }[name] ?? (name.startsWith('s:') ? Number(name.slice(2)) : 0.04);
      spine(s); return spP.clone().applyMatrix4(root.matrixWorld);
    },
    dsurf, tauOf,
  };
  api.place(V3(0, 0, 0), V3(0, 0, 1));
  return api;
}
