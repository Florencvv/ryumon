// creatures/cat.js - ginger tabby (E8954A) with a white chest, sitting on the canal embankment, ~0.45 m tall.
// Big round head, cheek fluff, anime eyes (green, slit pupil when hunting, round + huge when surprised / in awe),
// drawn tabby stripes, swipe with paw smear, puffed fur, tail flick. Origin = sitting base; faces +Z.
export function makeCat(K) {
  const { THREE, V3, lerp, smooth, clamp } = K;
  const root = new THREE.Group(); root.name = 'CAT';
  const rig = new THREE.Group(); root.add(rig);
  const ID = 40;
  const stripes = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'), rng = K.mkRng(91);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 128); g.fillStyle = 'rgba(176,86,40,0.9)';
    for (let i = 0; i < 16; i++) {
      const x0 = (i / 16) * 256 + rng() * 6, w = 4 + rng() * 4; g.beginPath(); g.moveTo(x0, 10);
      for (let y = 10; y <= 118; y += 6) g.lineTo(x0 + Math.sin(y * 0.08 + i) * 5, y);
      for (let y = 118; y >= 10; y -= 6) g.lineTo(x0 + w * (0.4 + 0.6 * Math.sin((y / 128) * Math.PI)) + Math.sin(y * 0.08 + i) * 5, y);
      g.closePath(); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
  })();
  const ginger = K.cel({ id: ID, base: '#E8954A', shade: '#b5604a', map: stripes, highlight: 0.35, rimColor: '#ffe0b0', darkRim: 0.3 });
  const gingerP = K.cel({ id: ID, base: '#E8954A', shade: '#b5604a', highlight: 0.35, rimColor: '#ffe0b0' });
  const white = K.cel({ id: ID + 1, base: '#fbf6ee', shade: '#c4bcd2', highlight: 0.3, rimColor: '#fff0dc' });
  const pink = K.cel({ id: ID + 2, base: '#f2a0a8', shade: '#c27088', highlight: 0.4 });
  const dark = K.cel({ id: ID + 3, base: '#5a2030', shade: '#3a1424', highlight: 0 });
  const wh = K.cel({ id: ID + 4, base: '#ffffff', shade: '#d8d4e4', highlight: 0 });
  const add = (parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scl = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); if (scl !== 1) m.scale.setScalar(scl); parent.add(m); return m; };
  const fuzz = (k) => (v) => { const a = Math.atan2(v.z, v.x), b = Math.atan2(v.y, Math.hypot(v.x, v.z)); const f = 1 + k * Math.pow(Math.abs(Math.sin(a * 7) * Math.sin(b * 6)), 3); v.multiplyScalar(f); };

  // body
  const bodyG = new THREE.Group(); rig.add(bodyG);
  const torso = add(bodyG, K.blobGeo(0.12, 0.16, 0.14, (v) => { if (v.y < 0) { v.x *= 1.15; v.z *= 1.12; } }), ginger, [0, 0.16, -0.03], [-0.15, 0, 0]);
  const puff = add(bodyG, K.blobGeo(0.13, 0.17, 0.14, fuzz(0.22), 40, 28), gingerP, [0, 0.165, -0.055], [-0.15, 0, 0]); puff.visible = false;
  add(bodyG, K.blobGeo(0.085, 0.12, 0.06, (v) => { if (v.y < 0) v.z *= 0.8; }), white, [0, 0.2, 0.075], [-0.2, 0, 0]);
  for (const s of [1, -1]) add(bodyG, K.blobGeo(0.075, 0.07, 0.11), ginger, [s * 0.085, 0.065, -0.04]);
  for (const s of [1, -1]) add(bodyG, K.blobGeo(0.035, 0.022, 0.055), white, [s * 0.1, 0.018, 0.06]);   // hind paws
  // forelegs (right one swipes)
  const legs = [1, -1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.05, 0.22, 0.07); bodyG.add(sh);
    add(sh, K.tubeAlong(K.curvePts([[0, 0, 0], [0, -0.1, 0.02], [0, -0.19, 0.03]], 8), (t) => 0.03 - 0.008 * t, 8), ginger);
    const paw = add(sh, K.blobGeo(0.032, 0.022, 0.04), white, [0, -0.2, 0.04]);
    const claws = new THREE.Group(); paw.add(claws);
    for (let i = 0; i < 4; i++) add(claws, K.cone(0.004, 0.018, 5), wh, [(i - 1.5) * 0.013, -0.008, 0.035], [1.3, 0, 0]);
    claws.visible = false;
    return { s, sh, paw, claws };
  });
  // tail
  const tail = new THREE.Mesh(new THREE.BufferGeometry(), ginger); rig.add(tail);
  // head
  const head = new THREE.Group(); head.position.set(0, 0.37, 0.05); rig.add(head);
  add(head, K.blobGeo(0.11, 0.092, 0.095, (v) => { if (v.y < 0) v.x *= 1 + (-v.y / 0.092) * 0.18; }), ginger, [0, 0, 0], [0.25, 0, 0]);
  const headPuff = add(head, K.blobGeo(0.12, 0.1, 0.09, fuzz(0.2), 36, 24), gingerP, [0, 0.005, -0.03]); headPuff.visible = false;
  for (const s of [1, -1]) add(head, K.blobGeo(0.05, 0.04, 0.05, (v) => { if (v.x * s > 0) v.x *= 1.3; }), white, [s * 0.06, -0.045, 0.045]);   // cheek fluff
  add(head, K.blobGeo(0.045, 0.03, 0.032), white, [0, -0.035, 0.078]);   // muzzle
  add(head, K.blobGeo(0.013, 0.009, 0.008), pink, [0, -0.012, 0.1]);     // nose
  const mouthC = new THREE.Group(); head.add(mouthC);
  for (const s of [1, -1]) add(mouthC, K.tubeAlong(K.curvePts([[0, -0.022, 0.104], [s * 0.008, -0.032, 0.104], [s * 0.017, -0.026, 0.1]], 6), () => 0.0022, 5), dark);
  const mouthO = add(head, K.blobGeo(0.014, 0.018, 0.008), dark, [0, -0.036, 0.1]); mouthO.visible = false;
  const ears = [1, -1].map((s) => {
    const e = new THREE.Group(); e.position.set(s * 0.06, 0.06, 0.0); head.add(e);
    add(e, K.cone(0.04, 0.075, 4), ginger, [0, 0, 0], [0, Math.PI / 4, 0]).scale.set(1, 1, 0.45);
    add(e, K.cone(0.026, 0.055, 4), pink, [0, 0.004, 0.012], [0, Math.PI / 4, 0]).scale.set(1, 1, 0.3);
    return e;
  });
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) add(head, K.tubeAlong(K.curvePts([[s * 0.04, -0.025, 0.09], [s * 0.09, -0.02 - i * 0.008, 0.095], [s * 0.14, -0.012 - i * 0.02, 0.085]], 6), (t) => 0.0016 * (1 - 0.6 * t), 4), wh);
  const eyeMats = [];
  const eyeGeo = new THREE.CircleGeometry(1, 32);
  { const p = eyeGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.25 * (1 - x * x - y * y)); } eyeGeo.computeVertexNormals(); }
  const eyes = [1, -1].map((s) => {
    const m = K.eyeMaterial({ iris: '#2f5a2a', iris2: '#a6d44a', ring: '#e2b848', skin: '#E8954A', ringW: 0.12, lash: 0.2, idEye: ID + 5, idSkin: ID });
    eyeMats.push(m);
    const e = new THREE.Mesh(eyeGeo, m); e.position.set(s * 0.045, 0.012, 0.083); e.rotation.set(-0.12, s * 0.42, 0); e.scale.set(0.032 * s * -1 * -1, 0.034, 0.032); e.scale.x = s > 0 ? -0.032 : 0.032; head.add(e);
    return e;
  });
  const ghostMat = K.ghostMaterial('#f2b27a', 0.5);
  const ghostPaws = [0, 1].map(() => { const g = add(rig, K.merge([[K.blobGeo(0.032, 0.022, 0.04), K.M4([0, -0.2, 0.04])], [K.tubeAlong(K.curvePts([[0, 0, 0], [0, -0.1, 0.02], [0, -0.19, 0.03]], 8), () => 0.026, 6), K.M4()]]), ghostMat); g.visible = false; return g; });
  K.noCull(root);

  const st = { name: 'watch', k: 0 };
  function setTail(kind, k) {
    const flick = Math.sin(k * Math.PI * 2), pts = [];
    if (kind === 'puff') { for (let i = 0; i < 10; i++) { const t = i / 9; pts.push(V3(-0.06, 0.06 + t * 0.32, -0.15 - Math.sin(t * 2) * 0.04)); } }
    else for (let i = 0; i < 14; i++) {
      const t = i / 13, a = -0.2 + t * 2.3;                         // curls around the right side
      pts.push(V3(Math.sin(a) * 0.2 * (0.4 + t) + (t > 0.7 ? flick * 0.05 * (t - 0.7) / 0.3 : 0), 0.03 + (t > 0.75 ? (t - 0.75) * 0.25 * (1 + flick * 0.6) : 0), -0.12 + -Math.cos(a) * 0.12 * (0.5 + t) + 0.05));
    }
    tail.geometry.dispose(); tail.geometry = K.tubeAlong(pts, (t) => (kind === 'puff' ? 0.05 : 0.026) * (1 - 0.3 * t), 8);
  }
  function mood(m, k = 1) {
    eyeMats.forEach((e) => { const u = e.uniforms; u.uFierce.value = 0; });
    if (m === 'hunt') { K.setMood(eyeMats, 'determined', 0.7); eyeMats.forEach((e) => (e.uniforms.uFierce.value = 1, e.uniforms.uPupil.value = 0.45)); }
    else if (m === 'wide') K.setMood(eyeMats, 'wide', k);
    else if (m === 'awe') { K.setMood(eyeMats, 'awe', k); eyeMats.forEach((e) => (e.uniforms.uPupil.value = 0.6, e.uniforms.uGlint.value = 1.35)); }
    else K.setMood(eyeMats, 'calm', 1);
  }
  function apply() {
    const { name, k } = st;
    head.rotation.set(0, 0, 0); bodyG.rotation.set(0, 0, 0); rig.position.set(0, 0, 0);
    legs.forEach((l) => { l.sh.rotation.set(0, 0, 0); l.sh.scale.set(1, 1, 1); l.claws.visible = false; });
    ears.forEach((e, i) => e.rotation.set(0, 0, (i ? 1 : -1) * 0.12));
    puff.visible = headPuff.visible = false; torso.visible = true; mouthC.visible = true; mouthO.visible = false;
    ghostPaws.forEach((g) => (g.visible = false));
    let tailKind = 'curl';
    if (name === 'watch') {
      head.rotation.set(0.35, 0.1 * Math.sin(k * 1.3), 0.06); mood('hunt');
      ears.forEach((e, i) => (e.rotation.z = (i ? 1 : -1) * (0.08 + 0.12 * Math.max(0, Math.sin(k * 3.1 + i)))));
    } else if (name === 'swipe') {
      mood('hunt'); head.rotation.set(0.45, 0, 0.0);
      const L = legs[0];
      const raise = smooth(0, 0.28, k) * (1 - smooth(0.32, 0.45, k)), strike = smooth(0.32, 0.45, k) * (1 - smooth(0.6, 1, k));
      L.sh.rotation.x = -2.3 * raise - 1.35 * strike; L.sh.rotation.z = 0.25 * raise;
      L.sh.scale.y = 1 + 0.35 * strike; L.claws.visible = strike > 0.2 || raise > 0.6;
      bodyG.rotation.x = -0.12 * raise + 0.2 * strike;
      if (k > 0.33 && k < 0.5) ghostPaws.forEach((g, i) => {   // paw smear: copies along the arc behind the paw
        g.visible = true; const a = -2.3 * (1 - (i + 1) * 0.3) - 1.35 * (i + 1) * 0.3 * 0.6;
        g.position.copy(L.sh.position).applyEuler(bodyG.rotation); g.rotation.set(a, 0, 0); g.scale.set(1, 1.3, 1);
      });
    } else if (name === 'surprised') {
      const p = clamp(k, 0, 1); mood('wide', p);
      puff.visible = headPuff.visible = p > 0.3; rig.position.y = 0.03 * p;
      ears.forEach((e, i) => (e.rotation.z = (i ? 1 : -1) * (0.12 + 0.9 * p)));
      head.rotation.set(-0.08 * p, 0, 0); mouthC.visible = false; mouthO.visible = true; tailKind = p > 0.3 ? 'puff' : 'curl';
    } else if (name === 'awe') {
      const p = clamp(k, 0, 1); mood('awe', p);
      head.rotation.set(-0.7 * p, 0, 0.08 * p); bodyG.rotation.x = -0.08 * p;
      mouthC.visible = p < 0.4; mouthO.visible = p >= 0.4;
    }
    setTail(tailKind, name === 'watch' ? k : 0.2);
  }
  apply();
  const api = {
    root,
    // pose(name, k): watch (k = time; tail flick, ear twitch) | swipe (0..1: raise .0-.28, strike .32-.45 with paw smear .33-.5,
    //   recover .6-1) | surprised (puff 0..1) | awe (0..1, looks up, mouth open)
    pose(name = 'watch', k = 0) { st.name = name; st.k = k; apply(); return api; },
    reset() { return api.pose('watch', 0); },
    // anchor(name): eye | head | paw (swiping paw) | nose
    anchor(name = 'head') {
      root.updateMatrixWorld(true);
      if (name === 'eye') return eyes[0].getWorldPosition(V3());
      if (name === 'paw') return legs[0].paw.getWorldPosition(V3());
      if (name === 'nose') return V3(0, -0.012, 0.1).applyMatrix4(head.matrixWorld);
      return head.getWorldPosition(V3());
    },
  };
  return api;
}
