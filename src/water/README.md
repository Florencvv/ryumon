# Water + FX (dept WATER) — `ctx.api.water`

Files: `src/water.js` (create/update, API), `src/water_surface.js` (surface shader + refraction pre-pass),
`src/water_falls.js` (falling sheets, mist, spray, pour rope), `src/fx.js` (rain, splash crowns, bubbles, sparkles, glow,
gold scale wave), `src/fx_bolt.js` (lightning), `src/fx_core.js` (MRT-correct FX shaders, event registry).
Post hooks in `src/anime/post.js`: `look.under`, `look.memory`, `look.flash` (see bottom).

Everything is a pure function of `st.t`: FX are drawn on threes (`A.onThrees(t)`), positions come from seeded rng.
Events (`ripple`, `splash`, `bubbles`, `sparkles`, `lightning`) are keyed by `(kind, t0, o.key)`: calling the same call every
frame is idempotent (latest options win, so `at` may follow a creature). They are filtered by set (`o.set`, default = the
set of the current frame). Per-frame calls (`rain`, `rapids`, `falls`, `glow`, `scaleWave`, `flash`, `godRays`) must be made
every frame they apply (direction runs after WATER, so its calls override the WATER defaults). Positions accept
`Vector3`, `[x, y, z]`, `{x, y, z}` or an `Object3D` (its world position).

## Surfaces (y = 0 in every water set)
Each of POND, BAMBOO, TOWN, GORGE, FALLS gets a 3 km plane at y = 0 (terrain above the water hides it), plus POND's inlet
stream strip at y = 0.3. Drawn on layer `LAYER.MAIN_ONLY` (so the mirror camera never sees it).
- From above: refraction pre-pass (the main camera renders the scene without water into a half-res colour + depth target
  right before the first surface draws) -> koi and bottom show through, tinted by the REAL water depth along the ray in 3
  painted bands; caustic net on the bottom; banded fresnel reflection (painted sky colours; engine mirror texture when the
  post exposes one); light dashes + darker swells across the view; star glints on the sun path (screen space, redrawn on
  threes); ripple rings; contact foam double line around every rock/bank (depth based); flow foam (streams, rapids);
  boiling foam around falling-water feet; rain dimples.
- From below (camera y < surface): bright silver total-reflection skin with a ripple net, Snell's window (48.6°) showing
  the world above through the refraction target, white window rim, rain rings seen from under.
- `surface(set, opts) -> handle` adds (`opts.key` new) or restyles (`key` existing, default `'main'`) a surface.
  opts: `y`, geometry (`size:[w,d]` | `radius` | `geometry` | `path:[pts], width`), `center:[x,z]`, `flow:[vx,vz]` (m/s),
  `foam` 0..1, `shore` 0..1, `rough`, `murk` (1/m), `refl`, `caust`, `glint`, `strokes`, `strokeScale`, `distort`, colours
  `deep tint skyHor skyTop sun foamCol foamShade caustCol underSilver underDeep win stroke`, `sunDir`.
  handle = `{ mesh, U /* uniforms */, P, key, set }`. `get(set)` returns the main handle.
- `rapids(k)` GORGE flow foam multiplier this frame (default 1; 0 = calm, 1.5 = wild).
- `ripple(x, z, t0, size = 1, {set, key})` drawn ring triplet (size 0.5 drip, 1 leaf, 3+ splash), life 3 + size s; also
  appended to `look.mirror.ripples` when the mirror is on. POND keeps auto ripples at the spout impact and the inlet foot.
- `rain(amount 0..1)` this frame. Fine layered rain: few long thin near streaks, mid layer, many short faint far streaks
  fading into `look.fog`; 2x2 ordered dither = low alpha at S=2 (clean FX id, never painted); light most of the time,
  heavier + more slanted only in short seeded gusts. Auto: FALLS 1, GORGE ramps in from CUES.rainStart (0.85), SKY s01 0.6 / s32 0.7, else 0.
  Rain = world-stable streaks (near box 9 m + far box 45 m around the camera), clipped at y = 0 in water sets, plus the
  dimples on the surface (seen from above and from below).

## Falling water
- FALLS curtain (`src/water_curtain.js`) is built at load time from `ctx.api.heights` (`fallsLip` center/width/y/flow/teeth,
  `fallsFace.z(y, x)`, `fallsTiers`, `fallsPool`): every column of water is followed down the face (hugs the rock, recedes
  slowly, breaks white wherever the face juts out = the tiers). 4 layered sheets (solid back body + broken mid / front /
  veil), drawn streaks on threes, micro streaks in close-ups, ragged roped edges, 8 side threads, white water under the
  teeth and tiers. Climbing lane at x = 0 (+-5 m): calmer darker blue-green body, the veil never covers it (Hi pops).
  Base: painted mist volumes (soft, alpha-blended into the colour target only, sorted back to front; base bank, billow
  column, tier mist, wind-drifting spray clouds) + ballistic spray streaks; boiling foam rings on the pool along the foot.
  Underwater: rock masses along the plunge line + boulders on the bed, churning bubble columns, foam ceiling.
- `falls(k)` this frame: 0 hides the curtain, mist and spray (k < 1 opens wider gaps).
- `fallsAt(y, x = 0, layer = 2) -> { pos, normal, out, side, brk }` a point ON the curtain face (layer 2 = front sheet) at
  height y, x metres across: put Hi at `pos + normal * 0.3` (nose up: rotation (PI/2, PI, 0)) to climb in front of the water.
- `fallsInfo` = `{ lip, out, width, height, foot, footL, footR, side, tiers, laneX }`.
- POND inlet cascade (30 cm, built automatically at `vale.pond.inletLip`) with a foam foot; the stone spout pour rope.
- `stream(from, to, {key, radius, speed, set, vel, spread}) -> mesh` a pouring rope of water from `from` landing on `to`
  (ballistic, solved to hit `to`). Built once per key. The spout stream is auto-built (`key 'spout'`) from
  `ctx.api.spout.mouth` (fallback: above `vale.pond.spoutRock`) to `vale.pond.spoutPour`.

## FX
- `splash(at, t0, size = 0.3, {dur, lean, crown, y, ripple, key})` crown of inked white/cyan petals rising and breaking,
  detached drops, a foam ring on the surface, + a ripple. size = crown height in metres (Hi leap 0.25-0.4, dragon 6+).
- `bubbles(at, t0, {n = 24, spread = 0.08, dur = 1.6, size = 1, rise = 1, kick: [x,y,z], stagger, seed, key})` drawn ring
  bubbles rising and wobbling, popped at the surface. For trails call several times along the path with different t0.
  Underwater shots also get ambient rising bubbles around the camera.
- `lightning(t0, from, to, {width = 7 px, branches = 5, jag = 0.12, levels = 6, seed, pattern = [1,0,1,0], flash = 1, core,
  edge, key})` white core / cyan edge bolt with branches and twigs, constant pixel width, new jitter each drawing; the
  pattern lists which drawings (1/8 s) are lit. Sets `look.flash` 2-frame pulses (+ re-strike).
- `storm(on)` ambient seeded bolts (camera-relative, in the sky) + flash pulses in FALLS (41.5-49.5, 57.5-72) and SKY
  (0-2.5, 72-74.5). Default on.
- `flash(k)` lightning brighten this frame (look.flash = max).
- `sparkles(at, t0, {n = 30, dur = 1.2, size = 0.05, speed = 1, mode: 'burst'|'aura', radius, gravity, key})` gold/white
  4-point stars twinkling on threes (bloom).
- `glow(at, k, {size = 1, rays = true, core, mid, outer, look = true, lookColor, lookSize, amount})` transformation glow this
  frame: drawn hard-banded aura + rotating ray spikes (bloom) and a `look.glows` entry.
- `scaleWave(target, k, {width = 0.25, reverse, axis, scale, gold})` gold scale arcs sweeping along a creature (dragon / koi
  `root` or any Object3D): a shell over its (skinned / morphed) meshes; k = wave front 0..1 along the body's longest bind
  axis (`reverse` flips head/tail). Call every frame of the wave.
- `godRays(k)` underwater god-ray amount this frame (look.underRays).
- `objects` = the raw meshes/pools for direction tweaks.

- `transform(target, k, o)` the s30 transformation this frame (call every frame, k 0..1): lightning cocoon of bolts
  wrapping the body (rejittered every drawing), bold radial rays behind the body (hollow centre so the silhouette reads),
  the creature's own `gold()` wave + a helix of gold stars spiralling along the body, spark bursts on threes. Sizes follow
  the current body length (works while the dragon grows). o: `{cocoon, rays, wave, sparks (0..1 each), size, bolts}`.
- Caustics (surfaces + post look.under) are soft wavy lines (iso-contours of warped noise); flowing water gets streak
  strokes along the current instead of across-view dashes. Snell window: 22 deg half angle (`winCos` 0.92), soft edge,
  thin bright ring, world squeezed toward the rim with a band of tree silhouettes, silver underside with ripple bands.

## Post hooks (src/anime/post.js)
- `look.under` (true): underwater grade — depth tint toward `look.underColor` / `underDeep`, caustic light on up-facing
  surfaces (`underCaustic`), soft god rays from the surface (`underRays`). WATER fills per-set defaults when unset.
- `look.flash` 0..1: blue-white lightning brighten (WATER's storm sets it; direction may override).
- `look.memory` 0..1: warm soft vignette, paper texture, slight bloom (s23).

## Test views (q)
`wtest=fx&wat=x,y,z&wk=0.5&wsize=0.3` shows splash / bubbles / sparkles / glow / bolt at a point.
`wtest=climb&wy=80&wd=2.2` (+ `cr=hi`) Hi on the curtain lane with the camera wd m in front; `wtest=transform&wk=0.5&wgrow=0.35`
the dragon mid-change with `transform()`; `wtest=bolt`, `wtest=hiwave`, `wtest=dragon`.
