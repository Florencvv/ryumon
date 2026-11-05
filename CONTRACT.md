# RYŪMON · 竜門 — production contract

An 88-second, 24 fps, 1920×1040 anime short rendered in the browser with three.js (WebGL2), captured frame by frame
headless and encoded with ffmpeg. Original telling of the old legend of the carp that climbs the Dragon Gate falls.
Every frame must pass as a still from a finished theatrical 2D anime film (painted backgrounds, cel characters,
confident ink), while it is 3D code underneath.

Look bible (read it): the studio's anime look guide (a separate document, not included in this repository). Engine API:
`src/anime/README.md` (`src/anime/post.js` is the shared AnimePost module). Differences for this film:
frame 1920×1040; Japanese signage allowed only as tiny world dressing in TOWN (noren: 湯, 茶, 酒, 宿). No Latin text,
no logos, no titles, no end card.

## Story (one line)
Hi, the smallest koi in a temple pond, sees the old stone dragon spout at dawn and swims away upstream: through a
bamboo forest, a canal town (a cat), a gorge at sunset (a heron), to a colossal waterfall in a night storm. It fails,
sinks, remembers, and climbs the falling water; at the top a lightning bolt turns it into a white dragon with its own
red markings. The dragon flies up into the dawn and back down the whole valley to the temple pond.

Tone: small and brave → danger → despair → triumph → joy. Time of day runs dawn → day → sunset → stormy night → dawn,
so every act has its own colour script. Never murky, never black: night is deep indigo with readable shapes.

## Characters
**HI 緋** — the hero, a small kohaku butterfly koi, 40 cm.
- Body FAF7F2 lit / B9BCD6 shade; scarlet patches E8442E / B02E3A on the back (one fixed seeded pattern, never changes);
  a round scarlet crown spot (tancho) on the head — its signature. Long flowing translucent fins and tail with drawn fin
  rays and ink edges (butterfly koi). Two short barbels at the mouth (they become the dragon's whiskers).
- Anime eyes: big, dark iris, two glints, thin gold ring; expressive through pupil size and a drawn upper lid line
  (determined / sad / half-closed / wide). Eyes must read at phone size in every close-up.
- Motion: travelling wave along a 7–8 bone spine, fins flowing with lag, on twos. Leap poses: arc, C-curve, S-curve.
**POND KOI** — 8 bigger koi (gold F2B233, black 2A2A35 with orange belly, calico), slow glides.
**HERON** — grey heron, 1.2 m: blue-grey 8C97AD / 5E6782, white face and neck, black crest plume, yellow beak and eye
F1C232 with a black pupil (menace). Poses: stand, neck coil, strike (fast, smear frames), snap on air, take-off flaps.
**CAT** — ginger tabby E8954A with white chest, sitting on a canal embankment: watch (tail flick), swipe (paw smear),
surprised (fur puffed, round eyes), awe (looking up, mouth open). Cute, on twos.
**DRAGON 竜** — Hi transformed, 300 m eastern dragon: white body with the SAME scarlet patches along its back and the
scarlet crown on its head; drawn scale arcs; flowing translucent mane and dorsal fins (from the butterfly fins); long
whiskers (from the barbels); pale-gold antlers; four small limbs with gold claws; Hi's eye made fierce. Body = skinned
tube along a spline (40+ bones), S-curves on twos. `grow(k)` morphs koi (0) → dragon (1) for the transformation.
**STONE DRAGON SPOUT** — a carved mossy granite dragon head on a rock at the pond edge; a stream of water pours from its
mouth into the pond (the goal Hi sees; rhymes with the real dragon at the end).

Design rules: no boxy shapes, everything carries detail (scale arcs, fin rays, feathers, fur tufts). Keep on-model.

## Sets (meters; water surface at y = 0 in every water set)
Only one set is visible at a time (`st.set`). `*-UNDER` shots use the same set with `look.under = true`.
- **POND** — temple garden at dawn, autumn. Pond ~12 m across with rocks and moss, red/orange maples (painted foliage
  cards), a stone lantern, a small red arched wooden bridge, the temple hall roof with curved tiled eaves behind, low
  mist, sunrise shafts through the maples, floating maple leaves. The inlet: a 30 cm cascade from a little stream between
  rocks. The stone dragon spout on a rock. Underwater: clear green-teal, pebbles, waterweed, caustic lines, koi.
- **BAMBOO** — a clear shallow stream (2 m wide) through dense green bamboo (cel + ink culms with nodes, painted leaf
  canopy), ferns, small rocks, dappled sun shafts. Late morning.
- **TOWN** — an old canal town in late afternoon gold: stone canal walls, willows trailing into the water, three arched
  stone bridges, wooden houses with tiled roofs, noren, lanterns, the cat's embankment. Further on the river widens to
  open fields and far mountains with a thin white waterfall thread (s12).
- **GORGE** — rocky gorge at sunset: steep cliffs with pines and moss, white-water rapids around boulders, the heron's
  rock; sky orange-magenta → dusk violet with storm clouds building (s17).
- **FALLS** — a colossal waterfall, 300 m, at night in a storm: dark cliff with ledges and hanging trees, the white water
  curtain, a boiling plunge pool, mist, rain, far mountain silhouettes; lightning flashes light everything blue-white for
  2-frame pulses. Base colour deep indigo 1E2453 with cyan-white water.
- **SKY** — above the storm: storm-cloud interiors (violet, lightning) for s32, then the sea of clouds at dawn: golden
  cloud tops, rising sun, high cirrus (s33–s34). The return flight (s35–s37) reuses GORGE, TOWN, BAMBOO from the air.

## Shots (times in seconds; `src/shots.js` holds SHOTS and CUES)
| id | name | time | set | what happens |
|---|---|---|---|---|
| s01 | flash | 0–2.5 | SKY | HOOK, frame 0 already striking: the white dragon with red markings bursts up through storm clouds, lightning (flash-forward of s32). Hard cut. |
| s02 | leaf | 2.5–4.5 | POND | macro surface at dawn: a red maple leaf lands, rings spread; from below a scarlet crown rises and Hi's eye breaks the surface. |
| s03 | garden | 4.5–7.0 | POND | wide: the temple garden pond at dawn, maples, lantern, bridge, mist, temple roof; koi shapes under the surface. Slow push. |
| s04 | crowd | 7.0–9.25 | POND-UNDER | luminous underwater: big koi glide past; small Hi gets nudged aside. |
| s05 | spout | 9.25–11.5 | POND | Hi's POV, low: the stone dragon spout pours its stream into the pond against the sunrise, shafts through the spray. |
| s06 | eye | 11.5–13.0 | POND | CU Hi's eye reflecting the stone dragon; the glint turns determined. Push in. |
| s07 | inlet | 13.0–15.5 | POND | Hi swims to the little inlet cascade and leaps it in a small sparkling arc (set-up of the big climb). |
| s08 | bamboo | 15.5–18.0 | BAMBOO | low tracking along the stream: Hi swims upstream, bamboo culms whipping past, dappled light. |
| s09 | bamboo top | 18.0–20.0 | BAMBOO | top-down: a tiny red-white dot in the green stream winding through the bamboo. |
| s10 | town | 20.0–23.0 | TOWN | the camera glides along the canal: Hi swims under arched bridges, willows, lanterns, noren. |
| s11 | cat | 23.0–25.0 | TOWN | the cat on the embankment swipes a paw into the water; Hi dodges (smear); the cat's surprised face. |
| s12 | horizon | 25.0–27.5 | TOWN | the river opens past the town under an orange sky; far mountains with a thin white waterfall thread. |
| s13 | gorge | 27.5–30.0 | GORGE | sunset rapids: Hi fights upstream through white water between boulders. |
| s14 | heron | 30.0–32.0 | GORGE | the heron stands on a rock against the sunset; its yellow eye locks on (push in). |
| s15 | strike | 32.0–34.0 | GORGE-UNDER | underwater: the beak spears in with a cone of bubbles; Hi twists away (smear), scales flash. |
| s16 | over | 34.0–36.5 | GORGE | second strike: Hi leaps out over the beak (hero arc, sunset behind) and dives into the white water; the beak snaps on air. |
| s17 | dusk | 36.5–39.0 | GORGE | the heron flies off; dusk goes violet; storm clouds build over the mountains. |
| s18 | rain below | 39.0–41.5 | GORGE-UNDER | from underwater: raindrops dimple the surface above; Hi swims on in the blue. |
| s19 | falls | 41.5–45.0 | FALLS | reveal: the colossal waterfall at night in the storm, lightning; boiling foam; ghostly koi leap and fail; tiny Hi arrives. Slow tilt up. |
| s20 | look up | 45.0–46.75 | FALLS | CU Hi looking up through the rain, lightning reflected in its eye. |
| s21 | try | 46.75–49.5 | FALLS | first attempt: Hi leaps and climbs a third of the falls, is pummelled and falls back tumbling. |
| s22 | sink | 49.5–52.0 | FALLS-UNDER | Hi sinks in bubbles, eyes half closed, fins drifting. Quiet. |
| s23 | memory | 52.0–54.0 | POND | memory flash, warm and soft-edged: the stone dragon at dawn (1 s), the little inlet leap (1 s). |
| s24 | wake | 54.0–55.25 | FALLS-UNDER | Hi's eye opens; the crown spot glows faintly. |
| s25 | run | 55.25–57.5 | FALLS-UNDER | Hi dives deep, turns and accelerates straight up, bubble trails, speed lines, camera chasing. |
| s26 | climb | 57.5–61.0 | FALLS | Hi bursts out and climbs the face of the falling water; camera tilts up with it; sheets stream past on threes. |
| s27 | log | 61.0–63.0 | FALLS | a broken tree trunk tumbles down the falls at Hi; it dodges (smear). |
| s28 | push | 63.0–65.5 | FALLS | near the top, exhausted, fins ragged; near silence; the crown spot ignites scarlet; the final push. |
| s29 | gate | 65.5–67.0 | FALLS | Hi leaps over the lip into the storm sky; a lightning bolt hits it: impact frames. |
| s30 | change | 67.0–70.0 | FALLS | the transformation in the lightning glow, on threes: body stretches long, fins become a mane, whiskers grow, antlers sprout, a gold wave runs over the scales. |
| s31 | roar | 70.0–72.0 | FALLS | CU the dragon's head roars: scarlet crown, Hi's eye. |
| s32 | ascend | 72.0–74.5 | SKY | the dragon rockets up through the storm clouds, lightning chasing it. |
| s33 | above | 74.5–77.5 | SKY | it bursts above the clouds into dawn: golden sun over the sea of clouds; it spirals, clouds curling in its wake. |
| s34 | glide | 77.5–79.5 | SKY | wide: the dragon glides across the sunrise in long S-curves, mane streaming. |
| s35 | over gorge | 79.5–80.5 | GORGE | fast low flight down the valley: the heron flees. |
| s36 | over town | 80.5–81.75 | TOWN | over the canal town: the cat looks up in awe. |
| s37 | over bamboo | 81.75–83.0 | BAMBOO | over the bamboo: the culms bend in its wind. |
| s38 | temple | 83.0–85.5 | POND | the dragon circles over the temple in the dawn sky, its reflection in the pond, the koi look up; the stone spout and the living dragon in one frame. |
| s39 | end | 85.5–88.0 | POND | the maple leaf on the still pond; the dragon's reflection glides across; a ripple; hold; soft fade to white-gold in the last 0.5 s. |

CUES: hookCrack 0.4, leafLand 2.8, eyeUp 3.7, nudge 8.0, spout 9.3, inletLeap 14.3, catSwipe 23.7, heronLock 31.0,
strike1 32.6, strike2 34.6, rainStart 37.5, fallsReveal 41.5, try 47.2, fallBack 48.6, sink 49.5, memory 52.0, wake 54.3,
run 55.3, breach 57.6, log 61.6, push 64.6, gate 65.9, change 67.0, roar 70.3, ascend 72.0, dawn 74.6, return 79.5,
temple 83.0, end 88.0.

## Repository layout (this folder is the public repo; QA stills, chunks and logs live outside it)
```
index.html            workbench: scrub, play, shot label; ?headless=1 for capture; ?s=2 render scale
src/main.js           boot: renderer, AnimePost, scene, camera, sets, departments, window.FILM
src/shots.js          SHOTS, CUES, FPS, DURATION, evalFrame(frame) -> st
src/anime/            post.js (AnimePost + materials), README.md
src/look.js           colour script presets per set (LOOKS merge on top)
src/creatures*.js     HI, pond koi, heron, cat, dragon, stone spout   (dept CREATURES)
src/vale*.js          POND, BAMBOO, TOWN sets                         (dept VALE)
src/heights*.js       GORGE, FALLS, SKY sets                          (dept HEIGHTS)
src/water*.js, src/fx*.js   water surfaces + all FX                   (dept WATER)
src/direction/act1.js s01–s19 cameras, looks, choreography            (dept DIRECTION A)
src/direction/act2.js s20–s39                                         (dept DIRECTION B)
tools/                serve.py, snap.py, render.py + chunks.sh + finalize.sh, sheet.py, sound/ (later)
vendor/, docs/
```

## Department API
Each department module exports `create(ctx)` (may be async) returning `{ update(st) }`. Update order: vale, heights,
creatures, water, direction (direction last, may override anything for its shot).
- `ctx` = `{ THREE, A /* everything exported by src/anime/post.js */, scene, camera, renderer, post, sets /* {POND,
  BAMBOO, TOWN, GORGE, FALLS, SKY} */, rng(seed), FPS, CUES, SHOTS, api, LAYER: {MAIN_ONLY: 1, REFLECT_ONLY: 2} }`.
- `st` = `{ frame, t, sid, shot, set, under /* true for *-UNDER shots */, lt, dur, cues, look, cam, q }`.
- Pure function of `st.t`; characters at `A.onTwos(t)`, FX at `A.onThrees(t)`, cameras on ones.
- `ctx.api.koi`: `{ hi, crowd[], makeKoi(opts) }`; hi = `{ root, swim(phase, amp), pose(name, k) /* arc, C, S, tumble,
  sink, rest */, eye(mood) /* calm, determined, wide, sad, half, closed */, crown(glow 0..1), fins(rag 0..1),
  anchor(name) /* eye, head, mouth, tail, crown */ }`.
- `ctx.api.heron`, `ctx.api.cat`: `{ root, pose(name, k), anchor(name) }`.
- `ctx.api.dragon`: `{ root, follow(curve, t, speed), pose(p) /* {jaw, roar, mane, claws} */, grow(k), anchor(name) }`;
  `ctx.api.spout`: `{ root, mouth /* vec3 */ }`.
- `ctx.api.water`: `{ surface(set, opts), ripple(x, z, t0), splash(at, t0, size), rain(amount), bubbles(at, t0), stream(
  from, to), rapids(k), falls(k), lightning(t0, from, to), sparkles(at, t0), glow(at, k) ... }` — WATER decides the exact
  signatures and documents them in `src/water/README.md`.
- World departments publish their stage anchors (e.g. `ctx.api.vale.pondInlet`, `ctx.api.heights.fallsLip`) and the
  water levels/paths so creatures and water agree.

## Engine facts (src/anime/post.js — scaffold owns it first, then ONLY dept WATER edits it)
- Pass chain from the bible + a MIRROR pass: `look.mirror = { on, y, strength, distort, ripples: [[x, z, t0, speed]...],
  rough }`: reflected camera renders layers 0 + 2 into a half-res target; materials with `mirror: true` (ids 120–124)
  sample it in screen space with ripple distortion. Main camera renders layers 0 + 1.
- `look.under = true`: underwater grade (depth tint toward the water colour, caustic light, soft god rays, fog colour).
- `look.impact = 0 | 1 | 2` (inverted ink frame / white flash) for hit frames; `look.speed = { amount, centre }` speed
  lines; `look.flash` (0..1 lightning brighten); `look.fade/fadeColor`; `look.memory` (0..1: warm soft vignette, paper
  texture, slight bloom) for s23.
- Ids: 0 sky, 1–89 inked cel, 90–99 FX no ink, 100+ painted. Budget under 0.4 s per frame at `?s=2`.

## Checking your work
Serve: `python tools/serve.py <port>` from this folder. Stills: `python tools/snap.py --port P --out <dir> s:s19 t:43
f:700 "q:test=1&set=FALLS&cam=0,20,120&at=0,120,0&fov=40&t=43=name:mytest" [--scale 2] [--sheet name]`. Open the JPGs
with the Read tool and judge them critically against this contract and the bible. Save your best stills to the production
QA folder (`qa/<dept>/latest/`, outside the repo). Write progress to the production STATUS file (append one line per
milestone, never rewrite others' lines).
