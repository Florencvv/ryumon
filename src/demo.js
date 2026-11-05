// demo.js - engine smoke test behind ?test=demo (scaffold; departments may use it to check engine features).
// A painted mirror plane, a cel sphere on REFLECT_ONLY (visible only in the reflection), a cel ring on layer 0 (both
// views), a cel block on MAIN_ONLY (direct view only), ripple rings. Camera: placeholder or &cam/&at.
// Try: &impact=1 | &impact=2 | &under=1 | &speed=1 | &flash=1 | &memory=1 | &mirror=0
import { LOOK_PRESETS } from './look.js';

export function createDemo(ctx) {
  const { THREE, A, scene } = ctx;
  const group = new THREE.Group(); group.name = 'DEMO'; scene.add(group);
  const first = Object.values(LOOK_PRESETS).find((p) => p.sky) ?? {};
  const sky = A.skyDome(first.sky ?? {}); sky.name = 'demo_sky'; group.add(sky);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1).rotateX(-Math.PI / 2),
    A.mirrorMaterial({ color: '#3b4478', color2: '#4a548c', tint: '#d6daf4', stroke: 0.6, strokeScale: 0.4 }));
  group.add(plane);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(3, 48, 32), A.celMaterial({ base: '#e8eaf6', shade: '#a9abd0', id: 20, rimColor: '#ffd8a0' }));
  sphere.position.set(0, 5, -4); A.setLayer(sphere, ctx.LAYER.REFLECT_ONLY); group.add(sphere);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.6, 24, 64), A.celMaterial({ base: '#2c3150', shade: '#1a1c33', id: 10, rimColor: '#ffb070', emissive: '#ff3b2e', emissiveAmt: 0 }));
  ring.position.set(7, 3, -2); group.add(ring);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.3), A.fxMaterial({ color: '#ff3b2e', intensity: 2, bloom: 2 }));
  eye.position.set(7, 3, -0.9); group.add(eye);
  const block = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 5, 6), A.celMaterial({ base: '#d2402f', shade: '#8e1e26', id: 11 }));
  block.position.set(-7, 2.5, -2); A.setLayer(block, ctx.LAYER.MAIN_ONLY); group.add(block);
  return {
    group,
    update(st) {
      const p = LOOK_PRESETS[st.set]?.sky ? LOOK_PRESETS[st.set] : first;
      if (p?.sky) A.updateSky(sky, p.sky);
      ring.rotation.y = A.onTwos(st.t) * 0.8;
      if (!st.q.has('cam')) st.cam = { ...st.cam, pos: new THREE.Vector3(0, 3.2, 22), look: new THREE.Vector3(0, 1.5, 0), fov: 40 };
      const m = st.look.mirror;
      if (!m || m.on !== false) st.look.mirror = { on: true, y: 0, strength: 1, distort: 0, rough: 0, ...(m ?? {}), ripples: [[0, 6, st.t - 1.2, 3], [5, 10, st.t - 0.5, 2]] };
    },
  };
}
