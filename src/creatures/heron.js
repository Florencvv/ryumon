// creatures/heron.js - grey heron, 1.2 m: blue-grey body with drawn feather scallops, white face/neck with a dotted black
// stripe, black crest stripe + 2 plume feathers, yellow dagger beak (snaps), yellow eye with a small black pupil (menace),
// folded wings with black primaries, extended wings for take-off / flight. Neck = tube rebuilt from a pose curve.
// Origin = between the feet on the rock top; faces +Z.
export function makeHeron(K) {
  const { THREE, V3, lerp, smooth, clamp } = K;
  const root = new THREE.Group(); root.name = 'HERON';
  const rig = new THREE.Group(); root.add(rig);
  const ID = 30;
  // feather map: scallops (multiply map)
  const fmap = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(70,74,100,0.55)'; g.lineWidth = 2.2;
    for (let j = 0; j < 12; j++) for (let i = 0; i < 10; i++) { const x = (i + (j % 2) * 0.5) * 25.6, y = j * 21.3; g.beginPath(); g.arc(x, y, 12, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const neckMap = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 256); g.fillStyle = '#2a2a35';
    for (let i = 0; i < 18; i++) { const y = 20 + i * 12; g.beginPath(); g.ellipse(32 + (i % 2) * 3 - 1.5, y, 3.2, 4.5, 0, 0, Math.PI * 2); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const grey = K.cel({ id: ID, base: '#8C97AD', shade: '#5E6782', map: fmap, highlight: 0.35, rimColor: '#ffe2c8' });
  const greyD = K.cel({ id: ID + 1, base: '#6f7a92', shade: '#4a516c', highlight: 0.2, rimColor: '#ffe2c8' });
  const black = K.cel({ id: ID + 2, base: '#2e2e3a', shade: '#1e1d28', highlight: 0.3, hiColor: '#8a90b0', rimColor: '#c8b8d8' });
  const whiteM = K.cel({ id: ID + 3, base: '#f4f2ee', shade: '#b7b8cf', highlight: 0.3, rimColor: '#fff0dc' });
  const neckM = K.cel({ id: ID + 3, base: '#f4f2ee', shade: '#b7b8cf', map: neckMap, highlight: 0.25, rimColor: '#fff0dc' });
  const yellow = K.cel({ id: ID + 4, base: '#F1C232', shade: '#b8842a', highlight: 0.75, hiColor: '#fff6c0' });
  const legM = K.cel({ id: ID + 5, base: '#c9a858', shade: '#8a6e48', highlight: 0.3 });

  // body: tilted egg + folded wings + tail + chest plumes
  const bodyG = new THREE.Group(); bodyG.position.set(0, 0.74, -0.02); rig.add(bodyG);
  const torso = new THREE.Mesh(K.blobGeo(0.13, 0.14, 0.27, (v) => { if (v.z > 0) v.y += v.z * 0.25; if (v.y < 0) v.y *= 0.85; }), grey); torso.rotation.x = -0.45; bodyG.add(torso);
  const folded = new THREE.Group(); bodyG.add(folded);
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(K.blobGeo(0.05, 0.12, 0.3, (v) => { v.z -= 0.08 * (v.y / 0.12); }), greyD); w.position.set(s * 0.1, 0.03, -0.06); w.rotation.set(-0.5, s * 0.08, s * 0.1); folded.add(w);
    const pr = new THREE.Mesh(K.blobGeo(0.035, 0.05, 0.2, (v) => { if (v.z < 0) { v.x *= 1 + v.z * 2; v.y *= 1 + v.z * 2; } }), black); pr.position.set(s * 0.1, -0.06, -0.3); pr.rotation.set(-0.35, 0, 0); folded.add(pr);
  }
  const tail = new THREE.Mesh(K.blobGeo(0.06, 0.025, 0.12), greyD); tail.position.set(0, -0.1, -0.3); tail.rotation.x = -0.6; bodyG.add(tail);
  for (let i = 0; i < 7; i++) { const p = new THREE.Mesh(K.cone(0.018, -0.16 - (i % 3) * 0.03, 5), whiteM); p.position.set((i - 3) * 0.022, 0.06, 0.22 - Math.abs(i - 3) * 0.015); p.rotation.set(0.25, 0, (i - 3) * 0.05); bodyG.add(p); }
  // legs (static) + toes
  const legs = new THREE.Group(); legs.position.set(0, 0.62, 0); rig.add(legs);
  const legIn = new THREE.Group(); legIn.position.set(0, -0.62, 0); legs.add(legIn);
  for (const s of [1, -1]) {
    const pts = K.curvePts([[s * 0.05, 0.62, 0], [s * 0.055, 0.42, -0.03], [s * 0.06, 0.28, -0.05], [s * 0.065, 0.02, 0.0]], 16);
    legIn.add(new THREE.Mesh(K.tubeAlong(pts, (t) => (t < 0.35 ? 0.024 - 0.03 * t : 0.012), 6), legM));
    for (const [a, l] of [[-0.45, 0.1], [0, 0.12], [0.45, 0.1], [Math.PI, 0.06]]) {
      const toe = K.curvePts([[0, 0, 0], [Math.sin(a) * l * 0.5, 0.006, Math.cos(a) * l * 0.5], [Math.sin(a) * l, 0.0, Math.cos(a) * l]], 6);
      const m = new THREE.Mesh(K.tubeAlong(toe, (t) => 0.007 * (1 - 0.6 * t), 5), legM); m.position.set(s * 0.065, 0.01, 0); legIn.add(m);
    }
  }
  // neck (rebuilt), head group at the neck tip
  const neck = new THREE.Mesh(new THREE.BufferGeometry(), neckM); rig.add(neck);
  const head = new THREE.Group(); rig.add(head);
  const skull = new THREE.Mesh(K.blobGeo(0.04, 0.042, 0.065, (v) => { if (v.z > 0) v.y *= 1 - v.z * 4; }), whiteM); head.add(skull);
  const crown = new THREE.Mesh(K.blobGeo(0.03, 0.022, 0.06), black); crown.position.set(0, 0.026, -0.012); head.add(crown);
  for (const s of [1, -1]) {   // black stripe from the eye back to the plume
    const st = new THREE.Mesh(K.tubeAlong(K.curvePts([[s * 0.03, 0.012, 0.03], [s * 0.036, 0.016, -0.01], [s * 0.026, 0.02, -0.05]], 8), (t) => 0.009 * (1 - 0.4 * t), 6), black); head.add(st);
  }
  const plume = new THREE.Group(); plume.position.set(0, 0.025, -0.05); head.add(plume);
  for (const [dx, l] of [[0.006, 0.2], [-0.006, 0.16]]) plume.add(new THREE.Mesh(K.tubeAlong(K.curvePts([[dx, 0, 0], [dx * 2, -0.01, -l * 0.5], [dx * 3, -0.03, -l]], 10), (t) => 0.007 * (1 - 0.85 * t) + 0.0008, 5), black));
  const beakU = new THREE.Mesh(K.cone(0.02, 0.17, 8), yellow); beakU.rotation.x = Math.PI / 2; beakU.scale.set(1, 1, 0.55); beakU.position.set(0, 0.006, 0.04); head.add(beakU);
  const jawP = new THREE.Group(); jawP.position.set(0, -0.006, 0.035); head.add(jawP);
  const beakL = new THREE.Mesh(K.cone(0.016, 0.155, 8), yellow); beakL.rotation.x = Math.PI / 2; beakL.scale.set(1, 1, 0.45); beakL.position.set(0, -0.002, 0.0); jawP.add(beakL);
  const eyeMats = [];
  const eyeGeo = new THREE.CircleGeometry(1, 28);
  for (const s of [1, -1]) {
    const m = K.eyeMaterial({ iris: '#F1C232', iris2: '#ffd95a', ring: '#e2a828', skin: '#f4f2ee', pupil: '#0d0a14', ringW: 0.1, lash: 0.14 }); eyeMats.push(m);
    m.uniforms.uPupil.value = 0.3; m.uniforms.uLid.value = 0.42; m.uniforms.uLidTilt.value = -0.35; m.uniforms.uGlint.value = 0.7;
    const e = new THREE.Mesh(eyeGeo, m); e.scale.setScalar(0.014); e.position.set(s * 0.036, 0.012, 0.03); e.rotation.set(0, s * Math.PI / 2, 0); if (s < 0) e.scale.x *= -1; head.add(e);
  }
  // extended wings (take-off / flight), layered like a real wing: grey coverts panel (drawn scallops) over a row of darker
  // secondaries on the arm; primary coverts + 10 black primaries fanned on the hand (separate "fingers" at the tip).
  // Flap: deep, slow downstroke with the hand lagging; on the upstroke the wrist flexes and the hand folds back.
  const wings = [];
  const featherGeo = (len, wd) => { const g = K.blobGeo(wd, 0.005, len / 2, (v) => { const t = (v.z + len / 2) / len; v.x *= 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)); v.y += 0.012 * t * t; }, 10, 6); g.translate(0, 0, len / 2); return g; };
  for (const s of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.09, 0.82, 0.04); rig.add(sh);
    const arm = new THREE.Group(); sh.add(arm);
    // coverts (top layer, light grey, scalloped trailing edge)
    arm.add(new THREE.Mesh(K.gridGeo(30, 3, (u, v) => V3(s * u * 0.4, 0.02 + 0.015 * Math.sin(u * 3) - 0.004 * v, lerp(0.07, 0.03, u) - v * (0.16 + 0.025 * Math.pow(Math.abs(Math.sin(u * Math.PI * 7)), 0.5)))), grey));
    // secondaries: rounded darker feathers under the coverts, trailing back
    const sec = []; for (let i = 0; i < 10; i++) { const u = (i + 0.5) / 10; sec.push([featherGeo(0.26 - 0.04 * u, 0.03), K.M4([s * u * 0.39, 0.004 - 0.0015 * i, lerp(0.03, 0.0, u)], [0, s * (Math.PI - 0.08 - 0.12 * u), 0])]); }
    arm.add(new THREE.Mesh(K.merge(sec), greyD));
    const hand = new THREE.Group(); hand.position.set(s * 0.4, 0, 0); arm.add(hand);
    hand.add(new THREE.Mesh(K.gridGeo(8, 3, (u, v) => V3(s * u * 0.2, 0.018 - 0.004 * v, lerp(0.03, 0.0, u) - v * lerp(0.15, 0.08, u))), grey));
    const prim = [];
    for (let i = 0; i < 10; i++) {
      const f = new THREE.Mesh(featherGeo(0.24 + 0.1 * Math.sin(Math.PI * (0.2 + 0.7 * i / 9)), 0.038), black);
      f.position.set(s * (0.03 + 0.017 * i), 0.006 - 0.0016 * i, -0.01 + 0.004 * i); f.userData.i = i; hand.add(f); prim.push(f);
    }
    sh.visible = false; wings.push({ s, sh, arm, hand, prim });
  }
  // smear ghosts for the strike: two trailing copies of neck + head
  const ghostMat = K.ghostMaterial('#f2efe8', 0.55), ghostMat2 = K.ghostMaterial('#f2efe8', 0.3);
  const ghosts = [ghostMat, ghostMat2].map((m) => { const n = new THREE.Mesh(new THREE.BufferGeometry(), m); const h = new THREE.Mesh(K.merge([[K.blobGeo(0.04, 0.042, 0.065), K.M4()], [K.cone(0.02, 0.17, 8), K.M4([0, 0.006, 0.04], [Math.PI / 2, 0, 0], [1, 1, 0.55])]]), m); rig.add(n); rig.add(h); n.visible = h.visible = false; return { n, h }; });
  K.noCull(root);

  // neck curve from base to head; head frame from the last tangent
  const NB = V3(0, 0.86, 0.13);
  const neckPose = {
    stand: [V3(0, 0.98, 0.06), V3(0, 1.06, 0.15), V3(0, 1.16, 0.18)],
    coil: [V3(0, 0.95, 0.04), V3(0, 0.98, 0.17), V3(0, 1.05, 0.11)],
    strike: [V3(0, 0.82, 0.38), V3(0, 0.64, 0.66), V3(0, 0.44, 0.92)],
    snap: [V3(0, 1.0, 0.25), V3(0, 1.1, 0.42), V3(0, 1.22, 0.56)],
    fly: [V3(0, 0.86, 0.2), V3(0, 0.82, 0.25), V3(0, 0.87, 0.32)],
  };
  const tmpV = V3(), tmpM = new THREE.Matrix4();
  function buildNeck(pts3, mesh, rad = 0.032) {
    const pts = K.curvePts([NB, ...pts3], 18);
    mesh.geometry.dispose(); mesh.geometry = K.tubeAlong(pts, (t) => rad * (1 - 0.35 * t), 9);
    return pts;
  }
  function placeHead(obj, pts, pitch = null) {
    const n = pts.length, p = pts[n - 1], f = tmpV.subVectors(p, pts[n - 3]).normalize();
    const fwd = pitch === null ? f.clone() : V3(0, -Math.sin(pitch), Math.cos(pitch));
    const up = V3(0, 1, 0), x = V3().crossVectors(up, fwd).normalize(), y = V3().crossVectors(fwd, x);
    tmpM.makeBasis(x, y, fwd); obj.quaternion.setFromRotationMatrix(tmpM); obj.position.copy(p).addScaledVector(fwd, 0.03);
  }
  const lerpPts = (a, b, k) => a.map((p, i) => p.clone().lerp(b[i], k));
  const st = { name: 'stand', k: 0, smear: 0 };
  function apply() {
    const { name, k } = st;
    let pts3 = neckPose.stand, jaw = 0.0, wingsOut = false, flap = 0, tilt = 0, legBack = 0, pitch = 0.12;
    plume.rotation.x = 0.15 * Math.sin(k * 6);
    if (name === 'coil') pts3 = lerpPts(neckPose.stand, neckPose.coil, clamp(k, 0, 1));
    if (name === 'strike') { const e = Math.pow(clamp(k, 0, 1), 0.6); pts3 = lerpPts(neckPose.coil, neckPose.strike, e); jaw = 0.35 * smooth(0.5, 0.8, k); tilt = 0.25 * e; pitch = 0.2 + 0.75 * e; }
    if (name === 'snap') { pts3 = neckPose.snap; jaw = 0.55 * (1 - clamp(k, 0, 1)); tilt = 0.1; pitch = -0.35; }
    const flying = name === 'fly' || name === 'flee';
    if (name === 'takeoff' || flying) {
      wingsOut = true; flap = k;
      pts3 = name === 'takeoff' ? lerpPts(neckPose.coil, neckPose.fly, 0.5) : neckPose.fly;
      tilt = name === 'takeoff' ? 0.35 : 0.5; legBack = name === 'takeoff' ? 0.45 : 1.5; pitch = flying ? 0.1 : 0.05;
    }
    const ph = flap * Math.PI * 2, bob = wingsOut ? Math.cos(ph) : 0;
    rig.rotation.x = flying ? 0.08 : 0;
    rig.position.y = flying ? 0.03 * bob : 0;
    bodyG.rotation.x = wingsOut ? tilt : tilt * 0.6;
    const pts = buildNeck(pts3, neck);
    placeHead(head, pts, pitch);
    jawP.rotation.x = jaw;
    folded.visible = !wingsOut;
    legs.rotation.x = legBack; legs.position.set(0, 0.62, flying ? -0.12 : 0);
    // flap cycle: phase 0 = wings up, .5 = bottom of the downstroke; hand lags the arm; upstroke folds the hand back
    const up = Math.max(0, -Math.sin(ph)), down = Math.max(0, Math.sin(ph));
    wings.forEach((w) => {
      w.sh.visible = wingsOut;
      w.arm.rotation.set(-0.12 * down, w.s * 0.1 * up, w.s * (0.12 + 0.72 * Math.cos(ph)));
      w.hand.rotation.set(0, w.s * (0.1 + 0.95 * up), w.s * (0.1 + 0.45 * Math.cos(ph - 1.0)));
      w.prim.forEach((f) => { const i = f.userData.i, spread = 1 - 0.55 * up; f.rotation.set(0.04 * down * i / 9, w.s * (Math.PI - 0.15 - spread * 1.35 * Math.pow(i / 9, 0.9)), 0); });
    });
    // strike smear: trailing copies at earlier k
    ghosts.forEach((g, i) => {
      const on = name === 'strike' && st.smear > 0;
      g.n.visible = g.h.visible = on;
      if (!on) return;
      const kk = clamp(k - (0.18 + 0.16 * i) * st.smear, 0, 1), e = Math.pow(kk, 0.6);
      const p2 = buildNeck(lerpPts(neckPose.coil, neckPose.strike, e), g.n, 0.03);
      placeHead(g.h, p2, 0.2 + 0.75 * e);
    });
  }
  apply();
  const api = {
    root,
    // pose(name, k): stand (k = time, plume sway) | coil (0..1) | strike (0 coiled .. 1 full lunge) | snap (k = beak closing 0..1)
    //   | takeoff (k = flap cycles) | fly / flee (k = flap cycles)
    pose(name = 'stand', k = 0) { st.name = name; st.k = k; apply(); return api; },
    // smear(k): for strike frames between ~.3 and .8 - two dithered trailing necks/heads
    smear(k = 0) { st.smear = k; apply(); return api; },
    eye(mood = 'stare') { for (const m of eyeMats) { const w = mood === 'wide'; m.uniforms.uPupil.value = w ? 0.2 : 0.3; m.uniforms.uLid.value = w ? 0.9 : 0.42; m.uniforms.uLidTilt.value = w ? 0 : -0.35; } return api; },
    reset() { st.smear = 0; api.eye('stare'); return api.pose('stand', 0); },
    // anchor(name): eye | head | beak (base) | tip (beak tip) | neck | chest
    anchor(name = 'head') {
      root.updateMatrixWorld(true);
      const loc = { eye: V3(0.036, 0.012, 0.03), head: V3(), beak: V3(0, 0, 0.05), tip: V3(0, 0, 0.2) }[name];
      if (loc) return loc.applyMatrix4(head.matrixWorld);
      if (name === 'neck') return NB.clone().applyMatrix4(rig.matrixWorld);
      return V3(0, 0.8, 0.12).applyMatrix4(rig.matrixWorld);
    },
  };
  return api;
}
