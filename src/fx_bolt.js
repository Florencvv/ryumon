// fx_bolt.js - dept WATER: drawn lightning. Jagged main channel + branches (seeded midpoint displacement), white core,
// cyan edge, constant screen-pixel width (thinner on branches), redrawn on threes with a new jitter per drawing.
// Strike pattern per bolt (drawings of 1/8 s): ON, off, ON (re-strike), off.
import * as THREE from 'three';
import { OUT, BILL, fxShader, quadPool, mulberry } from './fx_core.js';

const MAXSEG = 900;

const VS = /* glsl */ `
${BILL}
attribute vec3 aA; attribute vec3 aB; attribute vec2 aW;   // aW: x width scale, y glow flag
uniform float uPx, uResY, uOn;
varying vec2 vQ; varying float vDepth; varying float vWide;
void main(){
  vec4 A = viewMatrix * vec4(aA, 1.0);
  float dz = max(-A.z, 0.1);
  float w = uPx * aW.x * dz * 2.0 / (projectionMatrix[1][1] * uResY) * uOn;   // world width for uPx output pixels
  vQ = position.xy; vWide = aW.y;
  // extend each segment a little past its ends so joints stay closed
  vec3 d = aB - aA;
  gl_Position = ribbon(aA - d * 0.04, aB + d * 0.04, w, position.xy, vDepth);
}
`;
const FS = /* glsl */ `
${OUT}
varying vec2 vQ; varying float vDepth; varying float vWide;
uniform vec3 uCore, uEdge; uniform float uId, uBloom;
void main(){
  float x = abs(vQ.x);
  if(x > 1.0) discard;
  vec3 c = mix(uEdge, uCore, step(x, 0.42));
  writeOut(c * 1.6, uBloom * (x < 0.42 ? 1.0 : 0.6), vec3(0.0, 0.0, 1.0), vDepth - 0.5, uId);
}
`;

function displace(a, b, levels, amp, rng, out, width, glow, up) {
  let pts = [a.clone(), b.clone()];
  const L = a.distanceTo(b);
  const dir = b.clone().sub(a).normalize();
  const p1 = new THREE.Vector3().crossVectors(dir, up).normalize();
  if (p1.lengthSq() < 1e-6) p1.set(1, 0, 0);
  const p2 = new THREE.Vector3().crossVectors(dir, p1).normalize();
  let s = amp * L;
  for (let l = 0; l < levels; l++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const m = pts[i].clone().lerp(pts[i + 1], 0.5 + (rng() - 0.5) * 0.2);
      m.addScaledVector(p1, (rng() - 0.5) * 2 * s).addScaledVector(p2, (rng() - 0.5) * 2 * s * 0.6);
      np.push(m, pts[i + 1]);
    }
    pts = np; s *= 0.52;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const k = i / (pts.length - 1);
    out.push([pts[i], pts[i + 1], width * (1 - k * 0.45), glow]);
  }
  return pts;
}

// build segments for one drawing of a bolt
export function boltSegments(from, to, seed, o = {}) {
  const rng = mulberry(seed), out = [];
  const up = new THREE.Vector3(0, 0, 1);
  const main = displace(from, to, o.levels ?? 6, o.jag ?? 0.12, rng, out, 1, 1, up);
  const nb = o.branches ?? 5;
  for (let b = 0; b < nb && out.length < MAXSEG - 40; b++) {
    const i = Math.floor((0.1 + rng() * 0.7) * (main.length - 1));
    const s = main[i], L = from.distanceTo(to) * (0.15 + rng() * 0.25);
    const dir = to.clone().sub(from).normalize();
    const side = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.6, rng() - 0.5).normalize();
    const e = s.clone().addScaledVector(dir.clone().lerp(side, 0.65).normalize(), L);
    const sub = displace(s, e, 4, 0.16, rng, out, 0.55, 0, up);
    if (rng() < 0.5) {   // a twig on the branch
      const j = Math.floor((0.3 + rng() * 0.5) * (sub.length - 1));
      const e2 = sub[j].clone().addScaledVector(side.clone().add(new THREE.Vector3(rng() - 0.5, -0.3, rng() - 0.5)).normalize(), L * 0.4);
      displace(sub[j], e2, 3, 0.18, rng, out, 0.35, 0, up);
    }
  }
  return out;
}

export class Bolts {
  constructor(n = 3) {
    this.list = [];
    this.group = new THREE.Group(); this.group.name = 'fx_bolts';
    for (let i = 0; i < n; i++) {
      const g = quadPool(MAXSEG, { aA: [3], aB: [3], aW: [2] });
      g.instanceCount = 0;
      const U = { uPx: { value: 7 }, uResY: { value: 1040 }, uOn: { value: 1 }, uCore: { value: new THREE.Color('#ffffff') }, uEdge: { value: new THREE.Color('#7fe8ff') },
        uId: { value: 95 }, uBloom: { value: 3 } };
      const m = new THREE.Mesh(g, fxShader({ uniforms: U, vs: VS, fs: FS, name: 'fx_bolt' }));
      m.frustumCulled = false; m.visible = false; m.renderOrder = 20;
      this.group.add(m); this.list.push(m);
    }
  }
  // events: [{t0, from, to, seed, width, branches, jag, core, edge}] active; t: onThrees time; resY output px height; S render scale
  draw(events, t, resY, S) {
    let used = 0, flash = 0;
    for (const e of events) {
      if (used >= this.list.length) break;
      const k = Math.floor((t - e.t0) * 8 + 1e-4);          // drawing index
      const on = e.pattern ? e.pattern[k] : [1, 0, 1, 0][k];
      if (!on) continue;
      const m = this.list[used++];
      const segs = boltSegments(e.from, e.to, (e.seed ?? 1) * 97 + k * 13 + 1, e);
      const g = m.geometry, A = g.attributes.aA.array, B = g.attributes.aB.array, W = g.attributes.aW.array;
      const n = Math.min(segs.length, MAXSEG);
      for (let i = 0; i < n; i++) { const s = segs[i]; A.set([s[0].x, s[0].y, s[0].z], i * 3); B.set([s[1].x, s[1].y, s[1].z], i * 3); W.set([s[2], s[3]], i * 2); }
      g.attributes.aA.needsUpdate = g.attributes.aB.needsUpdate = g.attributes.aW.needsUpdate = true;
      g.instanceCount = n;
      const U = m.material.uniforms;
      U.uPx.value = (e.width ?? 7) * S * (on === 2 ? 0.7 : 1); U.uResY.value = resY;
      U.uCore.value.set(e.core ?? '#ffffff'); U.uEdge.value.set(e.edge ?? '#7fe8ff');   // pooled meshes: reset (determinism)
      m.visible = true;
      flash = Math.max(flash, e.flash ?? 1);
    }
    for (let i = used; i < this.list.length; i++) this.list[i].visible = false;
    return flash;
  }
}
