// creatures.js - dept CREATURES (RYUMON): HI, the 8 pond koi, the HERON, the CAT, the DRAGON and the STONE SPOUT.
// Pure code (procedural geometry, data textures, seeded), everything posed as a pure function of what the caller sets.
// Each frame update(st) RESETS every creature to its default (hidden / rest), then DIRECTION (updated last) poses what
// it needs for the shot. Characters: drive phases from A.onTwos(st.t) (on twos); smear only for 1-2 frames.
//
// ctx.api.koi = { hi, crowd[8], makeKoi(opts), autoCrowd: true }
//   hi (and every koi): { root (Group, faces +Z, up +Y, origin = centre of mass; Hi body 0.30 m + tail = ~0.43 m),
//     swim(phase /* cycles */, amp /* 0 still .. 1 cruise .. 2 sprint */),
//     pose(name, k) /* rest | arc | C | S | leap | tumble (k = spin progress 0..1, curled) | sink */,
//     eye(mood, k=1) /* calm | determined | wide | sad | half | closed | happy | awe | fierce | dragon */, gaze(x, y) /* -1..1 */,
//     eyeTint(color, amt) /* coloured reflection in the lower iris (stone dragon, lightning) */,
//     crown(glow 0..1) /* the tancho spot glows scarlet (emissive -> bloom) */, fins(rag 0..1) /* torn, inked fin edges */,
//     smear(k 0..1, dirWorld) /* stretch + 2 dithered multiples behind the motion */, flash(k) /* lightning white-out */,
//     gold(pos 0..1 along the body, amt) /* gold wave */, reset(),
//     anchor(name) -> Vector3 world /* eye | eyeL | head | mouth | tail | crown | top | belly */ }
//   crowd: 8 bigger koi (gold x2, black with orange belly x2, calico x3, kohaku x1), 0.48-0.62 m. With autoCrowd (default)
//   they glide slow circles in the POND (visible in POND / POND-UNDER only); set ctx.api.koi.autoCrowd = false in a shot
//   to place them yourself (they stay visible; hide with k.root.visible = false).
// ctx.api.heron = { root (feet at origin, faces +Z, ~1.2 m), pose(name, k) /* stand | coil | strike (k 0..1, smear near 1)
//   | snap (k = beak closing 0..1) | takeoff (k = flap cycles) | fly (k = flap cycles) | flee */, eye(mood) /* stare | wide */,
//   smear(k), anchor(name) /* eye | head | beak | tip | neck | chest */ }  default: visible on heights.heronRock in GORGE.
// ctx.api.cat = { root (sits at origin, faces +Z, ~0.45 m tall), pose(name, k) /* watch (k = tail-flick cycles) | swipe
//   (k 0..1, smear ~.4-.6) | surprised (k puff 0..1) | awe (k 0..1) */, anchor(name) /* eye | head | paw | nose */ }
//   default: visible on vale.catSpot in TOWN if VALE publishes one.
// ctx.api.dragon = { root, length (m, default 300), follow(curve /* THREE.Curve, world */, t, speed /* m/s */, {twos=true,
//   offset=0, roll=0, wave=0}) /* head at arc length t*speed+offset, body trails along the curve */, place(pos, dir) /* straight
//   pose at a point */, pose({name: glide | roar | spiral | dive, k (roar amount), jaw 0..1, roar 0..1, mane 0..1 (flare), claws
//   0..1 (grip)}) /* roar = head thrown back, jaw wide, tongue, whiskers flying; dive = head tucked, legs tight; spiral = claws
//   grip; call pose() before or after follow() (idempotent) */, paths.s(origin, {len, amp, waves, dir, up, rise}) |
//   paths.spiral(center, {radius, height, turns}) | paths.dive(from, to, {crest, flare}) -> world CatmullRomCurve3 for follow,
//   maneMesh, grow(k) /* 0 = koi (Hi) ..
//   1 = dragon; size grows log-wise 0.43 m -> length unless setLength() */, setLength(m), flash(k), gold(pos, amt),
//   crown(glow), eye(mood /* default 'dragon' = Hi's iris, hooded lid, diamond glint */), anchor(name) /* head | eye | mouth |
//   crown | tail | chest | s:0.5 (any body point) */ }  Whiskers trail the flight path (follow-through) so they read in motion.
// ctx.api.spout = { root, mouth /* Vector3 world, where the water leaves the mouth */, pourDir /* Vector3 */ }
//   default: on vale.pond.spoutRock facing vale.pond.spoutFace, visible in POND.
//
// Test views (st.q, with test=1): cr=hi|crowd|heron|cat|dragon|spout|koi:<type>; pose=<name> k=<0..1> mood=<mood>
//   phase=<cycles> amp=<0..2> rag=<0..1> crown=<0..1> smear=<0..1> grow=<0..1> jaw/roar=<0..1> pos=x,y,z ry=<deg>
//   curve=s|glide|spiral|dive (dragon on a test path; ct = time, off = head offset m) dl=<length m> pose=glide|roar|spiral|dive
import { makeKit } from './creatures/common.js';
import { makeKoi } from './creatures/koi.js';
import { makeHeron } from './creatures/heron.js';
import { makeCat } from './creatures/cat.js';
import { makeDragon } from './creatures/dragon.js';
import { makeSpout } from './creatures/spout.js';

export async function create(ctx) {
  const K = makeKit(ctx);
  const { THREE, A, scene, api } = ctx;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const group = new THREE.Group(); group.name = 'CREATURES'; scene.add(group);

  const hi = makeKoi(K, { type: 'hi', length: 0.3, seed: 1, name: 'HI' });
  group.add(hi.root);
  const rng = K.mkRng(3301);
  const types = ['gold', 'black', 'calico', 'gold', 'calico', 'black', 'kohaku', 'calico'];
  const crowd = types.map((t, i) => { const k = makeKoi(K, { type: t, length: 0.48 + rng() * 0.14, seed: 20 + i, name: 'koi' + i }); group.add(k.root); return k; });
  const crowdPath = crowd.map((k, i) => ({ r: 1.6 + rng() * 3.2, ph: rng() * Math.PI * 2, w: (0.05 + rng() * 0.05) * (i % 3 === 0 ? -1 : 1), y: -0.35 - rng() * 0.45, cx: (rng() - 0.5) * 2, cz: (rng() - 0.5) * 1.5, wob: rng() * 6 }));
  api.koi = { hi, crowd, autoCrowd: true, makeKoi: (opts) => { const k = makeKoi(K, opts); group.add(k.root); return k; } };

  const heron = makeHeron(K); group.add(heron.root); api.heron = heron;
  const cat = makeCat(K); group.add(cat.root); api.cat = cat;
  const dragon = makeDragon(K); group.add(dragon.root); api.dragon = dragon;
  const spout = makeSpout(K); group.add(spout.root); api.spout = spout;

  const vec = (s) => { if (!s) return null; const a = String(s).split(',').map(Number); return a.length === 3 && a.every(Number.isFinite) ? V3(...a) : null; };
  const num = (v, d) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  const pondAnchors = () => api.vale?.pond ?? api.vale?.POND ?? api.vale ?? {};
  const testCurve = new THREE.CatmullRomCurve3([V3(-200, -20, 30), V3(-130, 45, 10), V3(-60, -10, -10), V3(10, 50, 0), V3(80, -5, 10), V3(150, 40, -10), V3(220, 10, 0)]);

  function defaults(st) {
    const set = st.set;
    hi.reset(); hi.root.visible = false; hi.finMesh.visible = true;
    // pond crowd: slow glides on seeded circles
    const pond = set === 'POND';
    const tq = A.onTwos(st.t);
    crowd.forEach((k, i) => {
      k.reset();
      k.root.visible = pond;
      if (!pond || api.koi.autoCrowd === false) return;
      const c = crowdPath[i], a = c.ph + tq * c.w * 2.2;
      const pa = pondAnchors(), cen = pa.center ?? V3(0, 0, 0);
      k.root.position.set(cen.x + c.cx + Math.cos(a) * c.r, c.y + 0.05 * Math.sin(tq * 0.7 + c.wob), cen.z + c.cz + Math.sin(a) * c.r * 0.75);
      const dx = -Math.sin(a) * Math.sign(c.w), dz = Math.cos(a) * 0.75 * Math.sign(c.w);
      k.root.rotation.set(0, Math.atan2(dx, dz), 0);
      k.swim(tq * 0.9 + c.wob, 0.45).eye('calm');
    });
    // heron on its rock (GORGE)
    heron.reset();
    const hr = api.heights?.heronRock;
    heron.root.visible = set === 'GORGE' && !!hr;
    if (hr) { heron.root.position.copy(hr.top ?? hr.pos); heron.root.rotation.set(0, Math.PI, 0); }
    // cat on its embankment (TOWN)
    cat.reset();
    const cs = api.vale?.catSpot ?? api.vale?.town?.catSpot ?? api.vale?.TOWN?.catSpot;
    cat.root.visible = set === 'TOWN' && !!cs;
    if (cs) { cat.root.position.copy(cs.pos ?? cs); if (cs.face) cat.root.rotation.set(0, Math.atan2(cs.face.x, cs.face.z), 0); }
    dragon.reset(); dragon.root.visible = false;
    // stone spout
    const pa = pondAnchors();
    spout.root.visible = set === 'POND';
    if (pa.spoutRock) spout.placeAt(pa.spoutRock, pa.spoutFace ?? V3(-1, 0, 0));
  }

  function testView(st) {
    const q = st.q && typeof st.q.entries === 'function' ? Object.fromEntries(st.q.entries()) : (st.q ?? {});
    if (!q.test || !q.cr) return;
    const cr = String(q.cr), tq = A.onTwos(st.t);
    const pos = vec(q.pos) ?? V3(0, 0, 0), ry = num(q.ry, 0) * Math.PI / 180;
    [hi, ...crowd].forEach((k) => (k.root.visible = false));
    heron.root.visible = cat.root.visible = dragon.root.visible = false;
    spout.root.visible = cr === 'spout';
    if (cr === 'hi' || cr.startsWith('koi')) {
      let k = hi;
      if (cr.startsWith('koi:')) k = crowd[types.indexOf(cr.slice(4))] ?? crowd[0];
      k.root.visible = true; k.root.position.copy(pos); k.root.rotation.set(num(q.rx, 0) * Math.PI / 180, ry, 0);
      k.swim(num(q.phase, tq * 1.6), num(q.amp, 0.8)).pose(q.pose ?? 'rest', num(q.k, 1)).eye(q.mood ?? 'calm', 1)
        .crown(num(q.crown, 0)).fins(num(q.rag, 0)).gaze(num(q.gx, 0), num(q.gy, 0));
      if (q.tint) k.eyeTint('#' + q.tint, 0.8);
      k.finMesh.visible = q.nofins !== '1';
      if (q.smear) k.smear(num(q.smear, 0), V3(1, 0, 0).applyAxisAngle(V3(0, 1, 0), ry));
    } else if (cr === 'crowd') {
      crowd.forEach((k, i) => { k.root.visible = true; k.root.position.set(pos.x + (i % 4) * 0.9 - 1.35, pos.y, pos.z + Math.floor(i / 4) * 1.2 - 0.6); k.root.rotation.set(0, ry, 0); k.swim(tq + i * 0.3, 0.6); });
    } else if (cr === 'heron') {
      heron.root.visible = true; heron.root.position.copy(pos); heron.root.rotation.set(0, ry, 0);
      heron.pose(q.pose ?? 'stand', num(q.k, tq));
      if (q.smear) heron.smear(num(q.smear, 0));
    } else if (cr === 'cat') {
      cat.root.visible = true; cat.root.position.copy(pos); cat.root.rotation.set(0, ry, 0);
      cat.pose(q.pose ?? 'watch', num(q.k, tq));
    } else if (cr === 'dragon') {
      dragon.root.visible = true;
      dragon.setLength(q.dl ? num(q.dl, 300) : null);
      dragon.grow(num(q.grow, 1));
      const pn = q.pose ?? (num(q.roar, 0) > 0 ? 'roar' : 'glide');
      dragon.pose({ name: pn, k: num(q.k, 1), jaw: num(q.jaw, 0), roar: q.roar !== undefined ? num(q.roar, 0) : undefined, mane: num(q.mane, 0.5), claws: q.claws !== undefined ? num(q.claws, 0) : undefined });
      const P = dragon.paths, ct = num(q.ct, st.t);
      if (q.curve === 's') dragon.follow(new THREE.CatmullRomCurve3(testCurve.points.map((p) => p.clone().add(pos))), ct, num(q.speed, 40), { offset: num(q.off, 330), wave: num(q.wave, 0) });
      else if (q.curve === 'glide') dragon.follow(P.s(pos, { len: 900, amp: 30, waves: 4.5 }), ct, num(q.speed, 40), { offset: num(q.off, 560), wave: num(q.wave, 0.6) });
      else if (q.curve === 'spiral') dragon.follow(P.spiral(pos, { radius: 70, height: 360, turns: 2 }), ct, num(q.speed, 40), { offset: num(q.off, 520), wave: num(q.wave, 0) });
      else if (q.curve === 'dive') dragon.follow(P.dive(pos.clone().add(V3(-300, 150, 0)), pos.clone().add(V3(300, -60, 0))), ct, num(q.speed, 40), { offset: num(q.off, 480), wave: num(q.wave, 0.4) });
      else dragon.place(pos, V3(Math.sin(ry), 0, Math.cos(ry)), { wave: num(q.wave, 0.6), t: st.t });
      if (q.mood) dragon.eye(q.mood);
      if (q.crown) dragon.crown(num(q.crown, 0));
    } else if (cr === 'spout') {
      spout.placeAt(pos, V3(Math.sin(ry), 0, Math.cos(ry)));
    }
  }

  return {
    update(st) {
      defaults(st);
      testView(st);
    },
  };
}
