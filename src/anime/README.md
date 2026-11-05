# src/anime/post.js - AnimePost, the anime look (three r160, WebGL2)
- Pass ideas adapted from sunshower (MIT, licence line kept in the file).
- Passes: main MRT (colour rgb + emissive in alpha | view normal, depth, id) -> Kuwahara paint (ids 100+) -> ink (ids 1-89)
  -> atmosphere (depth haze, painted glows, shafts) -> bloom (emissive alpha only) -> grade + paper/film grain + vignette + sRGB.
- Ids (`ID`): 0 sky | 1-89 cel + ink (CHAR 1, CHAR_FX 2, PROP 10, CREATURE 20) | 90-99 FX, no ink | 100+ painted
  (PAINT 100, CLOUD 105, FOLIAGE 110, GROUND 115, WATER 120, STROKE 125 = near drawn cards, Kuwahara radius x0.35).
- Kuwahara radius GROWS with depth (`paintFarScale`, default 1.8) so far brushwork reads at 1080p.
- `const post = new AnimePost(renderer, {W:1920, H:1080, S})`; `post.render(scene, camera, look)`. S=1 preview, S=2 final:
  ink width, Kuwahara radius and noise are in output px, so line weight survives the 2x downsample. `LOOK_DEFAULTS` lists every
  look key: inkWidth/inkColor/inkRef (depth where lines are full weight), paintRadius/paintFar, fog/fogDensity/fogNear/fogMax/celFog,
  glows [{pos, color, size, amount}] (max 4), shafts/shaftPos/shaftColor, bloom, exposure, sat, contrast, lift (darks only), gain,
  vignette, grain, paper, fade/fadeColor, frame (grain seed), inkSeed (change on twos for line boil).
- Shared uniforms `AU` (one write updates all materials): `setKey({dir | pos, color, tint})` = character key (cheat it so the face
  reads), uShadeTint/uShadeMix, uRimDir (+ per-material rimColor), uSunDir/uSunColor/uAmbient (painted world), uBlob = flat painted
  contact shadow (x, z, rx, rz) on materials with `blob: true`.
- `celMaterial({base, shade, rimColor, id, highlight, hiSize, hiColor, hiEdge, wobble, flat, emissive, emissiveAmt, map, rimWidth})`:
  two hard tones (terminator wobbled by object-space noise), one crisp highlight band, thin rim on the dark side. No shade given ->
  `autoShade(base)` (cooler, darker, lavender bias).
- `paintedMaterial({color, color2, shade, id, varScale, varAmt, dab, light, bands, rim, rimColor, rimWidth, mass, massScale, map,
  vertexColors, blob, emissive})`: colour dabs for the brush pass; `mass:[x,y,z,amt]` lights a clump of puffs as one cloud/crown.
  Per-material light: `m.uniforms.uSunDir = {value: dir}`.
- paintedMaterial extras: `stroke` (long horizontal brush strokes, value + hue, applied after lighting), `strokeScale` (world freq,
  ~0.015 for clouds at 1.5-2 km, ~0.02 hills, default varScale*8), `rimTop` (lit rim only along top edges).
- Painted CARDS (grass, foliage, far band): `cardMaterial({map, cells, ramp:[shadow, mid, lit, tip], alt, altAmt, ink, id, texW, bias,
  bristle, sway})` on upright billboards (vertex shader `ANIME_CARD`, wind from `AU.uWind` = (amp, speed, onTwos(t))). Textures are
  canvas-painted DATA (r value, g ink, b hue flag, a coverage): `grassAtlas({seed, cells, size, near})` (tapered strokes, dark roots,
  lit tips; near = ink tips), `bandAtlas()` (far grass band), `foliageAtlas({kind:'pine'|'leaf'})` (needle fans / leaf dabs, lit top,
  cool underside, ink accents), `barkTexture()` (map for cel trunks). Place with `cardInstances(mat, items, {base})` and
  `foliageItems(rng, clumps[{c, r, n, light}], {sun, size})` (clump-normal light per card).
- `fxMaterial({color, intensity, bloom})` unlit FX; `skyDome({stops:[[sinElev, col] x4], disk:{dir, radius, color, halo, haloColor,
  bloom, moon}, stars, brush})` follows the camera; `animeShader(uniforms, fs)` + `GLSL.NOISE/GLOBAL_PARS` for custom (sea) shaders.
- Timing: `onTwos(t)` (characters, 1/12 s), `onThrees(t)` (FX, 1/8 s); camera on ones.

## Additions: frame size, mirror, layers, impact frames
- Any frame size: `new AnimePost(renderer, {W: 1920, H: 1040, S})`. `?s=2` renders 3840x2080 and downsamples in-page.
- Layers (`LAYER = {MAIN_ONLY: 1, REFLECT_ONLY: 2}`, `setLayer(obj, layer)` sets an object + children): the main camera
  renders layers 0+1, the mirror camera layers 0+2 (`render()` sets the main camera's layers itself).
- MIRROR pass, `look.mirror = {on, y, strength, distort, ripples: [[x, z, t0, speed] ... max 8], rough, ringColor, clipBias}`:
  the camera mirrored about `y` renders layers 0+2 into a half-res target; fragments below `y` are discarded in that pass
  (in `writeOut`, sky excluded). Ripple rings expand at `speed` m/s from `t0` (seconds, film time, drawn on threes), 2-3
  crests, fade ~2 s, drawn ring lines in `ringColor`. `distort` = rain-broken streaky wobble (0..1), `rough` = vertical
  smear (wet street / ice, 0..1). `strength` scales every mirror material. Reflected emissive blooms (neon, sun).
- Mirror materials (ids 120-124; the paint pass uses a 0.6x Kuwahara radius there so reflections keep their shapes):
  - `celMaterial({..., mirror: true, mirrorAmount, mirrorFresnel, mirrorTint})` / `paintedMaterial({..., mirror: true, ...})`:
    their own colour mixed with the reflection by Fresnel (`mirrorFresnel` = reflectance looking straight down).
  - `mirrorMaterial({color, color2, tint, darken, amount, fresnel, stroke, strokeScale, fallback, ring, id})`: a painted
    mirror surface: base colour (salt / asphalt / ice) under the reflection, reflection x `tint` x (1 - darken) (slightly
    cooler + darker than the sky reads as water), Fresnel to sky at grazing angles, long horizontal brush strokes (value +
    hue, strokes are long along world x), `fallback` colour when `look.mirror` is off. Custom shaders: `#define MIRROR`
    and `${A.GLSL.MIRROR}` after GLOBAL_PARS, then `vec3 r = mirrorSample(vW, distortMul)` (+ `mirrorEmis`, `mirrorRing`);
    discard when `uReflectPass > 0.5` so the mirror is not in its own reflection.
- `updateSky(skyMesh, {stops, disk: {dir, radius, color, halo, haloColor, bloom, moon}, stars, brush})` retints a skyDome
  (only given keys); `skyDome` now also accepts `disk.dir` as an array. main.js applies `look.sky` to the active set's sky.
- Look keys (all in `LOOK_DEFAULTS`):
  - `t` film time (main sets it; FX in post redraw on threes from it), `frame` grain seed, `inkSeed` (main: onTwos index).
  - `impact: 0 | 1 | 2` - 1 inverted ink frame: cel pixels (ids 1-89) solid ink with the brightest rims left
    paper, FX pixels (90-99) paper cores, painted world + sky white paper with id/depth-edge ink outlines and ink burst lines
    toward `impactCentre` [u, v] (default the speed centre, else screen centre), redrawn per frame; `impactInk`,
    `impactPaper` (e.g. a red paper for a variant). 2 = white flash with faint ink ghost outlines. Use for 1-2 frames at hits.
  - `speed: number | {amount, centre: [u, v], color, mode: 'radial' | 'parallel', dir: [x, y]}` drawn speed lines (radial
    toward the centre with a clear middle, or parallel streaks), redrawn on threes.
  - `flash: 0..1` lightning brighten (`flashColor`), also adds soft bloom.
  - `under: bool | 0..1` underwater grade: depth tint toward `underColor` / `underDeep` (`underDensity` per m), the sky
    seen from below becomes the bright rippled surface `underSurface`, caustic line networks (`caustics`, soft wavy
    lines in world space on up-facing surfaces below `underY`, the water level), slanted god rays from the top of frame
    (`godRays`). The normal fog still applies; set `fogMax` low under water if needed.
  - `memory: 0..1` warm grade, soft cream vignette (`memoryColor`), paper texture, soft bloom of bright areas.
  - `softBloom` extra bloom of bright (not only emissive) pixels. `fade` / `fadeColor` as before.
