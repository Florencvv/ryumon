// creatures/koi.js - procedural koi (HI + pond koi). Skinned body on a 14-bone spine (10 body + 4 tail-fin bones),
// spine shape = integrated curvature (travelling swim wave + pose curvature), fins = one translucent skinned mesh
// with vertex flutter (lag grows toward the tips), anime eyes (domed discs on the head bone), barbels, smear multiples.
// Faces +Z, up +Y, root at the centre of mass (s = 0.4). Sizes in metres.
export const KOI_KINDS = {
  hi:     { kind: 'kohaku', palette: { b0: '#FAF7F2', s0: '#B9BCD6', b1: '#E8442E', s1: '#B02E3A', b2: '#ffb0b6', s2: '#e48c9c' } },
  kohaku: { kind: 'kohaku', palette: { b0: '#f6f2ea', s0: '#b3b4cc', b1: '#e2512e', s1: '#a8323c' } },
  gold:   { kind: 'gold', palette: { b0: '#F2B233', s0: '#c27a3c', b1: '#F2B233', s1: '#c0773e' }, fin: { c0: '#ffe2a0', c1: '#ffc768', ray: '#d99a40' } },
  black:  { kind: 'black', palette: { b0: '#2A2A35', s0: '#1c1b29', b1: '#ef7a2c', s1: '#b04b30' }, fin: { c0: '#4a4656', c1: '#2e2c3a', ray: '#1e1c26', ink: '#120e14' } },
  calico: { kind: 'calico', palette: { b0: '#f4efe4', s0: '#b0b0c8', b1: '#ee8a30', s1: '#b6573a', b2: '#2A2A35', s2: '#1c1b29' }, fin: { c0: '#f6efe6', c1: '#e8d8d0', ray: '#b8a8a8' } },
};

export function makeKoi(K, o = {}) {
  const { THREE, V3, lerp, smooth } = K;
  const def = KOI_KINDS[o.type ?? 'hi'];
  const isHi = (o.type ?? 'hi') === 'hi';
  const L = o.length ?? 0.3;                 // nose -> tail root; the tail fin adds about half again
  const bf = o.butterfly ?? (isHi ? 1 : 0.55); // fin length factor (butterfly koi = long flowing fins)
  const s0 = 0.4, SMAX = 1.6, NS = 64, DS = SMAX / NS;
  const BS = [0.07, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.12, 1.26, 1.42, 1.58];

  const root = new THREE.Group(); root.name = o.name ?? 'koi';
  const spin = new THREE.Group(); root.add(spin);
  const smearG = new THREE.Group(); smearG.matrixAutoUpdate = false; spin.add(smearG);
  const bones = BS.map((s, i) => { const b = new THREE.Bone(); b.name = 'b' + i; b.position.set(0, 0, (s0 - s) * L); smearG.add(b); return b; });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  // ---------------------------------------------------------------- body
  const prof = (s) => {
    const head = s < 0.3 ? Math.pow(Math.max(0, 1 - Math.pow(1 - s / 0.3, 2.2)), 0.5) : 1;
    const tail = s > 0.36 ? 1 - Math.pow((s - 0.36) / 0.64, 1.25) * 0.8 : 1;
    const f = head * tail;
    const fl = smooth(0.9, 1.0, s) * 0.035;                       // peduncle flares into the tail
    return { w: 0.118 * f + fl * 0.2, ht: 0.152 * f + fl, hb: 0.128 * f + fl, cy: -0.02 * (1 - smooth(0.0, 0.3, s)) + 0.008 * smooth(0.2, 0.5, s) };
  };
  const surf = (s, v, out = V3(0, 0, 0)) => {
    const p = prof(s), a = v * Math.PI * 2, c = -Math.cos(a), sn = Math.sin(a);
    const sx = Math.sign(sn) * Math.pow(Math.abs(sn), 0.85), sy = Math.sign(c) * Math.pow(Math.abs(c), 0.9);   // fuller section
    return out.set(p.w * sx * L, (p.cy + sy * (c > 0 ? p.ht : p.hb)) * L, (s0 - s) * L);
  };
  const skinOf = (s) => {
    if (s <= BS[0]) return [0, 0, 1, 0];
    for (let i = 0; i < BS.length - 1; i++) if (s < BS[i + 1]) { const t = (s - BS[i]) / (BS[i + 1] - BS[i]); return [i, i + 1, 1 - t, t]; }
    return [BS.length - 1, 0, 1, 0];
  };
  const NR = 64, NA = 36;
  const bp = [], buv = [], bsi = [], bsw = [], bidx = [];
  for (let i = 0; i <= NR; i++) {
    const s = Math.pow(i / NR, 1.15);
    for (let j = 0; j <= NA; j++) {
      const v = j / NA, p = surf(s, v);
      bp.push(p.x, p.y, p.z); buv.push(s, v);
      const k = skinOf(s); bsi.push(k[0], k[1], 0, 0); bsw.push(k[2], k[3], 0, 0);
    }
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; bidx.push(a, b, a + 1, a + 1, b, b + 1); }
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bodyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
  bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bsi, 4)); bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bsw, 4));
  bodyGeo.setIndex(bidx); bodyGeo.computeVertexNormals();
  { // weld the seam normals (belly)
    const n = bodyGeo.attributes.normal;
    for (let i = 0; i <= NR; i++) { const a = i * (NA + 1), b = a + NA; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b); const l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); }
    // nose: point the first ring forward
    for (let j = 0; j <= NA; j++) n.setXYZ(j, 0, 0, 1);
  }
  const map = K.koiMap({ kind: def.kind, seed: o.seed ?? 11, hiPattern: isHi, crown: isHi || o.crown, blush: isHi });
  const bodyMat = K.bodyMaterial({ map, palette: def.palette, wobScale: 3.5 / L, detail: isHi ? 0.42 : 0.5 });
  const body = new THREE.SkinnedMesh(bodyGeo, bodyMat); body.name = 'koiBody';
  smearG.add(body); body.bind(skeleton, new THREE.Matrix4());

  // ---------------------------------------------------------------- fins (one merged skinned mesh, flutter attribute)
  const F = { pos: [], uv: [], flow: [], si: [], sw: [], idx: [] };
  const tmpN = new THREE.Vector3();
  function addFin(nu, nv, fn, flowAmp, lagU = 0.8) {
    const g = K.gridGeo(nu, nv, fn);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, base = F.pos.length / 3;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), u = U.getX(i), v = U.getY(i);
      F.pos.push(x, y, z); F.uv.push(u, v);
      tmpN.set(N.getX(i), N.getY(i), N.getZ(i));
      const a = Math.pow(v, 1.5) * flowAmp;
      F.flow.push(tmpN.x * a, tmpN.y * a, tmpN.z * a, v * 2.4 + u * lagU);
      const k = skinOf(Math.min(SMAX - 0.02, Math.max(0, s0 - z / L))); F.si.push(k[0], k[1], 0, 0); F.sw.push(k[2], k[3], 0, 0);
    }
    for (let i = 0; i < g.index.count; i++) F.idx.push(g.index.getX(i) + base);
  }
  const nrm = (x, y, z) => V3(x, y, z).normalize();
  const tmp = V3(0, 0, 0);
  for (const side of [1, -1]) {
    const vs = side > 0 ? 0.2 : 0.8;
    // pectoral: long rounded paddles, sweeping back and down
    const pl = 0.2 + 0.15 * bf;
    addFin(8, 8, (u, v) => {
      const b = surf(0.205 + 0.07 * u, vs, V3()); b.x -= side * 0.004 * L;
      const d = nrm(lerp(1.0, 0.75, u) * side, lerp(-0.12, -0.2, u), lerp(-0.55, -1.0, u));
      const len = pl * (0.62 + 0.38 * Math.sin(Math.PI * (0.25 + 0.75 * u))) * L;
      return b.addScaledVector(d, len * v).add(tmp.set(0, -0.03 * v * v * L, -0.02 * v * v * L));
    }, pl * L * 0.35);
    // pelvic
    const vl = 0.11 + 0.08 * bf;
    addFin(6, 6, (u, v) => {
      const b = surf(0.5 + 0.06 * u, side > 0 ? 0.1 : 0.9, V3());
      const d = nrm(lerp(0.55, 0.3, u) * side, -0.8, lerp(-0.5, -1.0, u));
      return b.addScaledVector(d, vl * (0.7 + 0.3 * Math.sin(Math.PI * u)) * v * L).add(tmp.set(0, -0.03 * v * v * L, 0));
    }, vl * L * 0.35);
  }
  // dorsal: from behind the head to the tail root, trailing
  addFin(14, 6, (u, v) => {
    const s = 0.3 + 0.44 * u, b = surf(s, 0.5, V3()); b.y -= 0.004 * L;
    const d = nrm(0, lerp(1, 0.45, u), lerp(-0.35, -1.0, u));
    const len = (0.07 + 0.06 * bf) * (0.55 + 0.45 * smooth(0, 0.12, u)) * (1 + 0.6 * u * bf) * L;
    return b.addScaledVector(d, len * v);
  }, 0.035 * L, 2.0);          // low sideways flutter: from above the dorsal stays edge-on (no pale band over the patches)
  // anal
  addFin(5, 5, (u, v) => {
    const b = surf(0.76 + 0.1 * u, 0.0, V3());
    const d = nrm(0, -1, lerp(-0.6, -1.1, u));
    return b.addScaledVector(d, (0.05 + 0.06 * bf) * (0.6 + 0.4 * Math.sin(Math.PI * u)) * v * L);
  }, 0.05 * L);
  // caudal: forked, long flowing lobes (butterfly)
  const tl = 0.24 + 0.2 * bf;
  addFin(16, 10, (u, v) => {
    const p = prof(0.985), y0 = (p.cy - p.hb * 0.9) * L, y1 = (p.cy + p.ht * 0.9) * L;
    const b = V3(0, lerp(y0, y1, u), (s0 - 0.975) * L);
    const ph = lerp(-0.85, 0.85, u);
    const len = tl * (0.5 + 0.5 * Math.pow(Math.abs(2 * u - 1), 1.1)) * L;
    return b.add(tmp.set(0.07 * v * v * Math.sin(Math.PI * u) * L, Math.sin(ph) * len * v, -Math.cos(ph) * len * v));
  }, tl * L * 0.18, 1.2);
  const finGeo = new THREE.BufferGeometry();
  finGeo.setAttribute('position', new THREE.Float32BufferAttribute(F.pos, 3)); finGeo.setAttribute('uv', new THREE.Float32BufferAttribute(F.uv, 2));
  finGeo.setAttribute('aFlow', new THREE.Float32BufferAttribute(F.flow, 4));
  finGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(F.si, 4)); finGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(F.sw, 4));
  finGeo.setIndex(F.idx); finGeo.computeVertexNormals();
  const finMat = K.finMaterial({ map: K.finMap({ seed: 5, rays: isHi ? 11 : 9 }), seed: (o.seed ?? 1) * 3.7, ...(def.fin ?? {}) });
  const fins = new THREE.SkinnedMesh(finGeo, finMat); fins.name = 'koiFins';
  smearG.add(fins); fins.bind(skeleton, new THREE.Matrix4());

  // ---------------------------------------------------------------- head parts on bone 0 (eyes, barbels)
  const head = bones[0], hb = head.position.clone();
  const er = (o.eyeScale ?? (isHi ? 0.068 : 0.038)) * L;
  const eyeMats = [];
  const eyeGeo = new THREE.CircleGeometry(1, 40);
  { const p = eyeGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.3 * (1 - x * x - y * y)); } eyeGeo.computeVertexNormals(); }
  const eyes = [];
  for (const side of [1, -1]) {
    const ve = side > 0 ? 0.31 : 0.69, se = 0.118;
    const p = surf(se, ve, V3()), pa = surf(se, ve + 0.01 * side, V3()), pb = surf(se + 0.01, ve, V3());
    const n = V3().subVectors(pa, p).cross(V3().subVectors(pb, p)).normalize(); if (n.x * side < 0) n.negate();
    n.y += 0.18; n.z += 0.12; n.normalize();                      // cheat: eyes look a bit up and forward (read from above)
    const fwd = V3(0, 0, 1).addScaledVector(n, -n.z).normalize(), up = V3().crossVectors(n, fwd).multiplyScalar(-side);
    if (up.y < 0) up.negate();
    const m = K.eyeMaterial({ skin: def.palette.b0, iris: isHi ? '#1a1430' : '#1a1622', iris2: isHi ? '#5b3f8e' : '#4a3b3a' });
    eyeMats.push(m);
    const e = new THREE.Mesh(eyeGeo, m);
    const M = new THREE.Matrix4().makeBasis(fwd, up, n).scale(V3(er, er, er));
    M.setPosition(p.clone().addScaledVector(n, -er * 0.12).sub(hb));
    e.matrixAutoUpdate = false; e.matrix.copy(M); e.name = side > 0 ? 'eyeR' : 'eyeL';
    head.add(e); eyes.push(e);
  }
  const barbMat = K.cel({ base: isHi ? '#f6dcd2' : def.palette.b0, shade: isHi ? '#c7a9b8' : def.palette.s0, highlight: 0.2, rimColor: '#fff1dc' });
  for (const side of [1, -1]) {
    const p = surf(0.035, side > 0 ? 0.16 : 0.84, V3()).sub(hb);
    const pts = K.curvePts([p, p.clone().add(V3(side * 0.014 * L, -0.012 * L, 0.012 * L)), p.clone().add(V3(side * 0.03 * L, -0.03 * L, 0.012 * L)), p.clone().add(V3(side * 0.042 * L, -0.045 * L, 0.0))], 10);
    const g = K.tubeAlong(pts, (t) => (0.0065 - 0.0048 * t) * L, 7);
    const m = new THREE.Mesh(g, barbMat); m.name = 'barbel'; head.add(m);
  }
  const ghosts = [0.55, 0.3].map((a) => {
    const gm = new THREE.SkinnedMesh(bodyGeo, K.ghostMaterial(def.palette.b0, a));
    gm.bind(skeleton, new THREE.Matrix4()); gm.bindMode = 'detached'; gm.matrixWorldAutoUpdate = false; gm.visible = false;
    root.add(gm); return gm;
  });
  K.noCull(root);

  // ---------------------------------------------------------------- spine
  const P = Array.from({ length: NS + 1 }, () => V3(0, 0, 0)), Q = Array.from({ length: NS + 1 }, () => new THREE.Quaternion());
  const st = { phase: 0, amp: 0, pose: 'rest', k: 0, smear: 0, sdir: V3(0, 0, -1) };
  const qs = new THREE.Quaternion(), eu = new THREE.Euler(), dz = V3(0, 0, 0);
  function kappa(s) {
    if (s < 0.15) return [0, 0];
    const ramp = smooth(0.15, 0.3, s);
    const env = s < 1 ? 0.15 + 1.45 * s * s : 1.6 + (s - 1) * 1.4;
    let y = st.amp * 1.25 * env * Math.sin(Math.PI * 2 * (st.phase - s * 0.8)), p = 0;
    const k = st.k;
    switch (st.pose) {
      case 'C': y += k * 3.1 * ramp; break;
      case 'S': y += k * 4.6 * Math.sin(Math.PI * 2 * (s - 0.15) / 1.05) * ramp; break;
      case 'arc': p += -k * 2.2 * ramp; break;
      case 'tumble': y += 2.2 * ramp; p += -1.0 * ramp; break;
      case 'sink': p += -0.55 * k * ramp; y += 0.6 * k * ramp; break;
      case 'leap': p += -k * 1.4 * ramp; break;
    }
    return [y, p];
  }
  const step = (s, d) => { const [y, p] = kappa(s); return qs.setFromEuler(eu.set(p * d, y * d, 0)); };
  function apply() {
    const i0 = Math.round(s0 / DS);
    P[i0].set(0, 0, 0); Q[i0].identity();
    for (let i = i0 + 1; i <= NS; i++) {
      const s = (i - 0.5) * DS;
      Q[i].copy(Q[i - 1]).multiply(step(s, DS * 0.5));
      dz.set(0, 0, -DS * L).applyQuaternion(Q[i]);
      P[i].copy(P[i - 1]).add(dz);
      Q[i].multiply(step(s, DS * 0.5));
    }
    for (let i = i0 - 1; i >= 0; i--) {
      const s = (i + 0.5) * DS;
      Q[i].copy(Q[i + 1]).multiply(step(s, DS * 0.5).invert());
      dz.set(0, 0, -DS * L).applyQuaternion(Q[i]);
      P[i].copy(P[i + 1]).sub(dz);
      Q[i].multiply(step(s, DS * 0.5).invert());
    }
    BS.forEach((s, bi) => {
      const f = Math.min(NS - 1e-4, s / DS), i = Math.floor(f), t = f - i;
      bones[bi].position.lerpVectors(P[i], P[i + 1], t);
      bones[bi].quaternion.slerpQuaternions(Q[i], Q[i + 1], t);
    });
    // inner rotation for tumble / sink
    spin.rotation.set(0, 0, 0);
    if (st.pose === 'tumble') spin.rotation.set(-st.k * Math.PI * 2, 0, st.k * Math.PI);
    if (st.pose === 'sink') spin.rotation.set(0.35 * st.k, 0, 0.5 * st.k);
    // fin flutter: paddling follows the swim phase, lags toward the tips
    const fa = st.pose === 'sink' ? 0.25 : 0.35 + 0.55 * Math.min(1.5, st.amp);
    finMat.uniforms.uFlut.value.set(fa, st.phase * Math.PI * 2 * 1.3, st.pose === 'sink' ? 0.2 * st.k : 0, 0.18);
  }
  apply();

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();
  const api = {
    root, type: o.type ?? 'hi', L, bones, skeleton, body, finMesh: fins, eyes, mats: { body: bodyMat, fin: finMat, eyes: eyeMats },
    // travelling swim wave: phase in cycles (drive from A.onTwos(t) * Hz), amp 0 still .. 1 cruise .. 2 sprint
    swim(phase = 0, amp = 1) { st.phase = phase; st.amp = amp; apply(); return api; },
    // pose(name, k): rest | arc | C | S | leap | tumble (k = spin progress 0..1) | sink
    pose(name = 'rest', k = 1) { st.pose = name; st.k = k; apply(); return api; },
    eye(mood = 'calm', k = 1) { K.setMood(eyeMats, mood, k); return api; },
    gaze(x = 0, y = 0) { for (const m of eyeMats) { m.uniforms.uGx.value = x; m.uniforms.uGy.value = y; } return api; },
    eyeTint(color = '#ffffff', amt = 0) { for (const m of eyeMats) { m.uniforms.uTint.value.set(color); m.uniforms.uTintAmt.value = amt; } return api; },
    crown(g = 0) { bodyMat.uniforms.uGlow.value = g; return api; },
    fins(rag = 0) { finMat.uniforms.uRag.value = rag; return api; },
    flash(k = 0) { bodyMat.uniforms.uFlash.value = k; finMat.uniforms.uFlash.value = k; for (const m of eyeMats) m.uniforms.uFlash.value = k * 0.5; return api; },
    gold(pos = -1, amt = 0) { bodyMat.uniforms.uGoldPos.value = pos; bodyMat.uniforms.uGoldAmt.value = amt; return api; },
    // smear(k, dirWorld): stretch along the motion + 2 dithered multiples trailing behind (1-2 frames on fast moves)
    smear(k = 0, dirWorld = null) {
      st.smear = k;
      if (k <= 0) { smearG.matrix.identity(); ghosts.forEach((g) => (g.visible = false)); return api; }
      root.updateMatrixWorld(true);
      const dw = (dirWorld ? dirWorld.clone() : V3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(tmpQ))).normalize();
      const dl = dw.clone().applyQuaternion(spin.getWorldQuaternion(tmpQ).invert());
      const f = 1 + 0.9 * k, m = new THREE.Matrix4();
      const e = m.elements, d = [dl.x, dl.y, dl.z];
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) e[c * 4 + r] = (r === c ? 1 : 0) + (f - 1) * d[r] * d[c];
      smearG.matrix.copy(m);
      root.updateMatrixWorld(true);
      ghosts.forEach((g, i) => { g.visible = true; g.matrixWorld.makeTranslation(-dw.x * L * k * (0.35 + 0.4 * i), -dw.y * L * k * (0.35 + 0.4 * i), -dw.z * L * k * (0.35 + 0.4 * i)); });
      return api;
    },
    reset() { st.smear = 0; smearG.matrix.identity(); ghosts.forEach((g) => (g.visible = false)); api.swim(0, 0.3).pose('rest', 0).eye('calm').gaze(0, 0).eyeTint('#fff', 0).crown(0).fins(0).flash(0).gold(-1, 0); return api; },
    // anchor(name): world position of eye | eyeL | head | mouth | tail | crown | belly | top (a new Vector3)
    anchor(name = 'head') {
      root.updateMatrixWorld(true);
      const loc = { mouth: surf(0.0, 0.5, V3()).sub(hb).add(V3(0, -0.01 * L, 0.004 * L)), crown: surf(0.105, 0.5, V3()).sub(hb), head: V3(0, 0, 0), top: surf(0.4, 0.5, V3()).sub(hb), belly: surf(0.4, 0.0, V3()).sub(hb) }[name];
      if (name === 'eye' || name === 'eyeR') return eyes[0].getWorldPosition(V3());
      if (name === 'eyeL') return eyes[1].getWorldPosition(V3());
      if (name === 'tail') return bones[12].getWorldPosition(V3());
      if (name === 'top' || name === 'belly') { const b = bones[3]; const l = name === 'top' ? surf(0.4, 0.5, V3()) : surf(0.4, 0.0, V3()); l.sub(b.position.clone().set(0, 0, (s0 - 0.4) * L)); return l.applyMatrix4(b.matrixWorld); }
      return (loc ?? V3()).applyMatrix4(head.matrixWorld);
    },
    surf,
  };
  api.reset();
  return api;
}
