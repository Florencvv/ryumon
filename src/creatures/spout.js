// creatures/spout.js - the STONE DRAGON SPOUT: a carved, mossy granite dragon head (about 0.75 m) that sits on VALE's spout
// rock and pours a stream into the pond. Origin = base on the rock top, faces +Z. api.mouth = world point of the water exit.
export function makeSpout(K) {
  const { THREE, V3, smooth } = K;
  const root = new THREE.Group(); root.name = 'SPOUT';
  const inner = new THREE.Group(); inner.scale.setScalar(1.05); root.add(inner);
  // granite speckle map
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), rng = K.mkRng(55);
  g.fillStyle = '#d8d6de'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) { const v = rng(); g.fillStyle = v < 0.45 ? '#b4b0c0' : v < 0.8 ? '#ecebf0' : '#8a8698'; g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3, 1 + rng() * 3); }
  for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(90,86,110,0.35)'; g.lineWidth = 1 + rng() * 2; g.beginPath(); const x = rng() * 256, y = rng() * 256; g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 60, y + (rng() - 0.5) * 60); g.stroke(); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const stone = K.A.celMaterial({ id: 12, base: '#ffffff', shade: '#a9a4c4', map, vertexColors: true, highlight: 0.25, rimColor: '#ffe6c0', wobble: 1.6 });
  const dark = K.A.celMaterial({ id: 13, base: '#4a4a58', shade: '#2e2c3c', highlight: 0 });
  const GREY = new THREE.Color('#9d9cab'), MOSS = new THREE.Color('#6f8f3a'), MOSS2 = new THREE.Color('#9fb04a'), LICH = new THREE.Color('#c9c48a');
  const n = V3(), p = V3(), wp = V3();
  function moss(geo, mtx, amt = 1) {
    const P = geo.attributes.position, N = geo.attributes.normal, col = [];
    const nm = new THREE.Matrix3().getNormalMatrix(mtx);
    for (let i = 0; i < P.count; i++) {
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); wp.fromBufferAttribute(P, i).applyMatrix4(mtx);
      const h = Math.sin(wp.x * 23.1 + wp.z * 17.3) * 0.5 + Math.sin(wp.x * 7.7 - wp.y * 11.2 + wp.z * 5.1) * 0.5;
      const m = smooth(0.25, 0.75, n.y + h * 0.35) * amt;
      const cc = GREY.clone().lerp(LICH, smooth(0.6, 0.9, Math.sin(wp.x * 31 + wp.y * 19) * 0.5 + 0.5) * 0.35).lerp(h > 0 ? MOSS2 : MOSS, m);
      col.push(cc.r, cc.g, cc.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  function part(geo, pos, rot = [0, 0, 0], mat = stone, amt = 1) {
    const m = K.M4(pos, rot); const gg = geo.clone(); gg.applyMatrix4(m); moss(gg, new THREE.Matrix4(), amt);
    const mesh = new THREE.Mesh(gg, mat); inner.add(mesh); return mesh;
  }
  const lump = (rx, ry, rz, k = 0.06, seed = 1) => K.blobGeo(rx, ry, rz, (v) => { const f = 1 + k * (Math.sin(v.x * 31 + seed) * Math.sin(v.y * 27 + seed * 2) + 0.6 * Math.sin(v.z * 41 + seed * 3)); v.multiplyScalar(f); }, 28, 18);
  part(lump(0.22, 0.3, 0.24, 0.05, 1), [0, 0.2, -0.1], [0.35, 0, 0]);                    // neck rising from the rock
  part(lump(0.21, 0.17, 0.24, 0.04, 2), [0, 0.44, 0.04]);                               // skull
  part(K.blobGeo(0.15, 0.08, 0.22, (v) => { if (v.y < 0) v.y *= 0.4; }), [0, 0.42, 0.27], [-0.08, 0, 0]);   // upper jaw / snout
  part(K.blobGeo(0.125, 0.05, 0.18, (v) => { if (v.y > 0) v.y *= 0.3; }), [0, 0.29, 0.22], [0.32, 0, 0], stone, 0.4);  // lower jaw, open
  part(K.blobGeo(0.105, 0.06, 0.13), [0, 0.345, 0.23], [0.12, 0, 0], dark);             // mouth cavity
  for (const s of [1, -1]) {
    part(K.blobGeo(0.032, 0.026, 0.03), [s * 0.055, 0.49, 0.45]);                       // nostrils
    part(K.blobGeo(0.05, 0.05, 0.045), [s * 0.14, 0.52, 0.16], [0, s * 0.5, 0], stone, 0.15);   // carved eyes
    part(K.blobGeo(0.022, 0.022, 0.012), [s * 0.17, 0.525, 0.19], [0, s * 0.7, 0], dark);  // drilled pupils
    part(K.tubeAlong(K.curvePts([[s * 0.06, 0.6, 0.24], [s * 0.15, 0.62, 0.16], [s * 0.2, 0.6, 0.06], [s * 0.22, 0.66, -0.04]], 12), (t) => 0.035 * (1 - 0.4 * t), 8), [0, 0, 0]);   // brow ridge
    part(K.tubeAlong(K.curvePts([[s * 0.09, 0.56, 0.0], [s * 0.13, 0.68, -0.12], [s * 0.16, 0.76, -0.3], [s * 0.2, 0.74, -0.46]], 14), (t) => 0.04 * (1 - 0.8 * t) + 0.006, 8), [0, 0, 0]);   // horns
    part(K.tubeAlong(K.curvePts([[s * 0.13, 0.4, 0.4], [s * 0.22, 0.36, 0.34], [s * 0.27, 0.24, 0.2], [s * 0.24, 0.14, 0.12], [s * 0.18, 0.17, 0.1]], 16), (t) => 0.026 * (1 - 0.5 * t), 8), [0, 0, 0], [0, 0, 0], stone, 0.5);   // carved whiskers
    for (let i = 0; i < 3; i++) part(K.cone(0.016, -0.05, 6), [s * (0.05 + i * 0.035), 0.37, 0.43 - i * 0.04], [0, 0, 0], [0, 0, 0], stone, 0);   // fangs
    // mane curls behind the jaw
    for (let i = 0; i < 3; i++) {
      const pts = []; for (let k = 0; k < 18; k++) { const a = (k / 17) * Math.PI * 1.6, r = 0.08 * (1 - k / 22); pts.push(V3(s * (0.2 + 0.02 * i + Math.cos(a) * 0.02), 0.36 - i * 0.12 + Math.sin(a) * r, -0.08 - Math.cos(a) * r - i * 0.04)); }
      part(K.tubeAlong(pts, (t) => 0.035 * (1 - 0.6 * t), 8), [0, 0, 0], [0, 0, 0], stone, 0.8);
    }
  }
  K.noCull(root);
  const mouthL = V3(0, 0.36, 0.4).multiplyScalar(1.05);
  const api = {
    root, mouth: V3(), pourDir: V3(0, -0.4, 1).normalize(),
    placeAt(pos, face) { root.position.copy(pos); const f = face.clone(); f.y = 0; f.normalize(); root.rotation.set(0, Math.atan2(f.x, f.z), 0); root.updateMatrixWorld(true);
      api.mouth.copy(mouthL).applyMatrix4(root.matrixWorld); api.pourDir.set(f.x, -0.4, f.z).normalize(); return api; },
    anchor(name = 'mouth') { root.updateMatrixWorld(true); return (name === 'mouth' ? mouthL.clone() : V3(0, 0.52, 0.16)).applyMatrix4(root.matrixWorld); },
  };
  api.placeAt(V3(0, 0, 0), V3(0, 0, 1));
  return api;
}
