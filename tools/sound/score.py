"""score.py - the RYUMON cue sheet: what plays when, on which bus, how loud.

Timing is picture-locked: shot cuts, sets (incl. -UNDER) and CUES come from src/shots.js, the animated events from
tools/sound/events.json (exported by the two direction departments; read at build time, so small timing fixes there
flow through). Every named hit peaks one picture frame (1/24 s) after its event.

Music: one 4-note koi motif (D E A G, koto / music box) that grows into the dragon's full theme (D E A G - A B D, brass,
strings, choir). D major pentatonic for the valley, D minor colours for the storm, D major for the dawn.
"""
import json, os, re
from voices import *

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))

MOTIF = [(74, 0.0), (76, 0.25), (81, 0.5), (79, 0.9)]                                   # D E A G  (koi motif)
THEME = MOTIF + [(81, 1.4), (83, 1.65), (86, 1.9)]                                      # ... A B D (dragon theme)
SAD = [(62, 0.0), (65, 0.55), (69, 1.1), (67, 2.0)]                                     # D F A G, slow, low
PENTA = [74, 76, 78, 81, 83, 86, 88, 90, 93]


def load_timeline():
    js = open(os.path.join(REPO, 'src', 'shots.js'), encoding='utf-8').read()
    shots = []
    for a, b, c, d, e in re.findall(r"S\('(s\d+)', '([^']*)', ([\d.]+), ([\d.]+), '([\w-]+)'\)", js):
        shots.append(dict(id=a, name=b, t0=float(c), t1=float(d), set=e.replace('-UNDER', ''), under=e.endswith('-UNDER')))
    blk = js[js.index('export const CUES'):]; blk = blk[:blk.index('};')]
    cues = {k: float(v) for k, v in re.findall(r'(\w+): ([\d.]+)', blk)}
    fps = int(re.search(r'FPS = (\d+)', js).group(1)); dur = float(re.search(r'DURATION = ([\d.]+)', js).group(1))
    events = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
    events.sort(key=lambda e: e['t'])
    assert fps == FPS, 'score assumes 24 fps'
    return dict(shots=shots, cues=cues, fps=fps, duration=dur, events=events)


class Score:
    def __init__(s, tl):
        s.tl = tl; s.C = tl['cues']; s.E = tl['events']; s.dur = tl['duration']; s.N = ns(s.dur); s.T = tv(s.N)
        s.sh = {x['id']: x for x in tl['shots']}
        s.bus = {k: Bus(s.N) for k in ('amb', 'fol', 'fx', 'mus', 'mem', 'glass', 'low', 'uw')}
        s.hits = []

    # ------------------------------------------------------------ helpers
    def ev(s, kind, a=0.0, b=1e9, who=None):
        return [e['t'] for e in s.E if e['kind'] == kind and a <= e['t'] < b and (who is None or who in e['note'])]

    def e1(s, kind, a, b, default, who=None):
        v = s.ev(kind, a, b, who); return v[0] if v else default

    def t0(s, sid): return s.sh[sid]['t0']
    def t1(s, sid): return s.sh[sid]['t1']

    def add(s, bus, sig, t, g=1.0, p=0.0, edge=(0.0003, 0.005)): s.bus[bus].add(sig, t, g, p, edge)

    def hit(s, bus, sig, t, g=1.0, p=0.0, name=None):
        """place `sig` so its attack lands one frame after picture time t"""
        sig = np.asarray(sig, float); t0 = t + LAT - onset(sig if sig.ndim == 1 else sig.mean(1)); s.bus[bus].add(sig, t0, g, p)
        if name: s.hits.append((round(t, 4), name, t0, (sig if sig.ndim == 1 else sig.mean(1))[:ns(0.2)]))

    def bed(s, bus, fn, a, b, keys, seed):
        """continuous layer from a to b (stereo clip fn(dur, seed)) with a gain envelope keys = [(t, g), ...] (absolute t)"""
        clip = fn(b - a, seed)
        if clip.ndim == 1: clip = np.stack([clip, clip], 1)
        k = np.array(keys, float); g = np.interp(s.T[ns(a):ns(a) + len(clip)], k[:, 0], k[:, 1])
        s.bus[bus].add(clip[:len(g)] * g[:, None], a, edge=None)

    def mask(s, pred, ramp=0.012):
        m = np.zeros(s.N)
        for x in s.tl['shots']:
            if pred(x): m[ns(x['t0']):ns(x['t1'])] = 1
        k = ns(ramp); c = np.concatenate([[0], np.cumsum(m)]); i = np.arange(s.N)
        lo = np.clip(i - k // 2, 0, s.N); hi = np.clip(i + k // 2, 0, s.N)
        return (c[hi] - c[lo]) / np.maximum(1, hi - lo)

    def phrase(s, t0, notes, voice='koto', g=0.1, p=0.0, rate=1.0, tr=0, seed=0, bus='mus', dur=1.8):
        for i, (m, o) in enumerate(notes):
            m = m + tr; tt = t0 + o / rate; last = i == len(notes) - 1
            if voice in ('koto', 'kb'): s.add(bus, koto(m, dur * (1.6 if last else 1.0), seed=seed + i), tt, g, p)
            if voice in ('box', 'kb'): s.add(bus, music_box(m + (12 if voice == 'kb' else 0), dur * 1.3, seed=seed + 50 + i), tt, g * (0.5 if voice == 'kb' else 1.0), -p)
            if voice == 'flute': s.add(bus, shakuhachi(m, (0.45 if not last else 1.2) / rate + 0.3, scoop=1.0 if i == 0 else 0.4, seed=seed + i), tt, g, p)
            if voice == 'brass': s.add(bus, section([m - 12, m], (0.5 if not last else 1.3) / rate + 0.2, 1.0, seed + i), tt, g, p)

    # ------------------------------------------------------------ the film
    def compose(s):
        s.ambience(); s.hook(); s.pond(); s.journey(); s.gorge(); s.falls(); s.climb(); s.dragon(); s.home()
        return s

    def ambience(s):
        C = s.C; tp = s.t0; te = s.t1
        cut = C['leafLand'] - 0.05                                     # s01 hard cut: silence until the leaf
        # ---- s01 storm chimney
        s.bed('amb', storm, 0.0, 2.52, [(0, 0.10), (0.4, 0.15), (2.4, 0.17), (2.5, 0.17), (2.501, 0)], 101)
        # ---- POND at dawn (s02-s07): spout trickle, birds, soft air; s04 underwater (muffled in the mix)
        s.bed('amb', lambda d, q: trickle(d, q, (900, 2800), 70), cut, tp('s08') + 0.02,
              [(cut, 0), (cut + 0.6, 0.018), (tp('s03'), 0.03), (tp('s04'), 0.035), (tp('s05'), 0.07), (tp('s06') - 0.01, 0.07), (tp('s06'), 0.035),
               (tp('s07'), 0.03), (te('s07') - 0.01, 0.03), (te('s07'), 0)], 201)
        s.bed('amb', lambda d, q: water_pour(d, q), tp('s05'), tp('s06') + 0.02, [(tp('s05'), 0.03), (te('s05') - 0.01, 0.03), (te('s05'), 0)], 202)
        s.bed('amb', birds, cut, tp('s08') + 0.02, [(cut, 0), (cut + 0.8, 0.012), (tp('s03'), 0.035), (tp('s04') - 0.01, 0.035), (tp('s04'), 0.004),
              (tp('s05') - 0.01, 0.004), (tp('s05'), 0.03), (te('s07') - 0.01, 0.03), (te('s07'), 0)], 203)
        s.bed('amb', lambda d, q: wind(d, q, cold=0.15, gust=0.4), cut, tp('s08') + 0.02, [(cut, 0), (cut + 1.0, 0.008), (te('s07') - 0.01, 0.008), (te('s07'), 0)], 204)
        s.bed('amb', lambda d, q: trickle(d, q, (500, 1800), 160), tp('s07'), te('s07') + 0.02, [(tp('s07'), 0.05), (te('s07') - 0.01, 0.06), (te('s07'), 0)], 205)
        s.bed('uw', lambda d, q: bubbles(d, q, 7), tp('s04'), te('s04'), [(tp('s04'), 0.08), (te('s04'), 0.08)], 206)
        # ---- BAMBOO (s08-s09): wind through leaves, stream babble, knocking culms
        a, b = tp('s08'), te('s09')
        s.bed('amb', lambda d, q: filt(wind(d, q, cold=1.0, gust=1.1), 'highpass', 350), a, b + 0.02, [(a, 0.035), (tp('s09'), 0.05), (b - 0.01, 0.06), (b, 0)], 301)
        s.bed('amb', lambda d, q: trickle(d, q, (600, 2200), 120), a, b + 0.02, [(a, 0.06), (tp('s09') - 0.01, 0.06), (tp('s09'), 0.02), (b - 0.01, 0.02), (b, 0)], 302)
        q = rnd(303); tt = a + 0.2
        while tt < b - 0.3:
            s.add('fol', wood_knock(int(tt * 100), q.uniform(320, 700)), tt, q.uniform(0.012, 0.035) * (1.0 if tt < tp('s09') else 0.6), q.uniform(-0.8, 0.8))
            tt += q.exponential(0.5)
        # ---- TOWN (s10-s12): canal lapping, far bell, shopfront clack, far birds; s12 widening river + wind
        a, b = tp('s10'), te('s11')
        s.bed('amb', lapping, a, b + 0.02, [(a, 0.05), (b - 0.01, 0.05), (b, 0)], 401)
        s.bed('amb', lambda d, q: birds(d, q, 0.6), a, b + 0.02, [(a, 0.01), (b - 0.01, 0.01), (b, 0)], 402)
        a, b = tp('s12'), te('s12')
        s.bed('amb', lambda d, q: filt(water_pour(d, q), 'lowpass', 1200), a, b + 0.02, [(a, 0.035), (b - 0.01, 0.035), (b, 0)], 403)
        s.bed('amb', lambda d, q: wind(d, q, cold=0.3, gust=0.8), a, b + 0.02, [(a, 0.03), (b - 0.01, 0.04), (b, 0)], 404)
        # ---- GORGE (s13-s18): rapids roar, wind, rain from rainStart (s18 heard from below = muffled)
        a, b = tp('s13'), te('s18')
        s.bed('amb', rapids, a, b + 0.02, [(a, 0.09), (tp('s14'), 0.055), (tp('s15'), 0.10), (tp('s16'), 0.08), (tp('s17'), 0.05),
              (tp('s18'), 0.06), (b - 0.01, 0.06), (b, 0)], 501)
        s.bed('amb', lambda d, q: wind(d, q, cold=0.4, gust=1.0), a, b + 0.02, [(a, 0.015), (tp('s17'), 0.02), (te('s17'), 0.05), (b - 0.01, 0.05), (b, 0)], 502)
        rs = C['rainStart']
        s.bed('amb', rain, rs, b + 0.02, [(rs, 0), (rs + 1.0, 0.035), (te('s17'), 0.045), (b - 0.01, 0.06), (b, 0)], 503)
        s.bed('uw', lambda d, q: bubbles(d, q, 40, 600, 1500), tp('s18'), b, [(tp('s18'), 0.035), (b - 0.01, 0.035), (b, 0)], 504)
        s.bed('uw', lambda d, q: bubbles(d, q, 10), tp('s15'), te('s15'), [(tp('s15'), 0.04), (te('s15'), 0.04)], 505)
        # ---- FALLS (s19-s31): the colossal roar + storm; underwater shots muffled; s23 memory is warm and dry
        a, b = tp('s19'), te('s31')
        fk = [(a, 0.03), (a + 2.0, 0.16), (te('s19') - 0.01, 0.16), (tp('s20'), 0.09), (tp('s21'), 0.14), (te('s21') - 0.01, 0.14),
              (tp('s22'), 0.07), (tp('s22') + 0.8, 0.04), (te('s22') - 0.01, 0.035), (tp('s23'), 0), (te('s23') - 0.01, 0), (tp('s24'), 0.03),
              (tp('s25'), 0.06), (te('s25') - 0.01, 0.07), (tp('s26'), 0.14), (s.e1('roar', 58.5, 60.5, 59.0), 0.15), (te('s26'), 0.19),
              (tp('s27'), 0.16), (te('s27') - 0.01, 0.16), (tp('s28'), 0.016), (C['push'] - 0.1, 0.016), (te('s28'), 0.07),
              (tp('s29'), 0.07), (tp('s30'), 0.035), (te('s30'), 0.04), (b, 0.06)]
        s.bed('amb', falls_roar, a, b + 0.01, fk + [(b + 0.005, 0)], 601)
        sk = [(a, 0.0), (a + 1.5, 0.05), (te('s21') - 0.01, 0.05), (tp('s22'), 0.015), (te('s22') - 0.01, 0.01), (tp('s23'), 0), (te('s23') - 0.01, 0),
              (tp('s24'), 0.01), (te('s25') - 0.01, 0.015), (tp('s26'), 0.05), (te('s27') - 0.01, 0.05), (tp('s28'), 0.01), (C['push'], 0.01),
              (te('s28'), 0.05), (tp('s29'), 0.07), (b, 0.06), (b + 0.005, 0)]
        s.bed('amb', storm, a, b + 0.01, sk, 602)
        for sid, rate, g in (('s22', 3, 0.05), ('s24', 4, 0.04), ('s25', 25, 0.06)):
            s.bed('uw', lambda d, q, r=rate: bubbles(d, q, r, 150, 600), tp(sid), te(sid), [(tp(sid), g), (te(sid), g)], 610 + rate)
        # ---- SKY: s32 storm interior, s33-s34 dawn wind above the clouds
        a = tp('s32')
        s.bed('amb', storm, a, te('s32') + 0.01, [(a, 0.13), (te('s32') - 0.01, 0.15), (te('s32'), 0)], 701)
        a, b = tp('s33'), te('s34')
        s.bed('amb', lambda d, q: wind(d, q, cold=0.35, gust=0.7), a, b + 0.01, [(a, 0.07), (a + 1.2, 0.04), (b - 0.01, 0.035), (b, 0)], 702)
        # ---- return flight s35-s37: the places rush past
        s.bed('amb', rapids, tp('s35'), te('s35') + 0.01, [(tp('s35'), 0.06), (te('s35') - 0.01, 0.06), (te('s35'), 0)], 801)
        s.bed('amb', lapping, tp('s36'), te('s36') + 0.01, [(tp('s36'), 0.04), (te('s36') - 0.01, 0.04), (te('s36'), 0)], 802)
        s.bed('amb', lambda d, q: filt(wind(d, q, cold=1.0, gust=1.6), 'highpass', 300), tp('s37'), te('s37') + 0.01,
              [(tp('s37'), 0.05), (tp('s37') + 0.3, 0.11), (te('s37') - 0.01, 0.06), (te('s37'), 0)], 803)
        s.bed('amb', lambda d, q: wind(d, q, cold=0.4, gust=1.2), tp('s35'), te('s37') + 0.01, [(tp('s35'), 0.04), (te('s37') - 0.01, 0.04), (te('s37'), 0)], 804)
        # ---- POND at the end (s38-s39): birds, the spout trickle, then stillness
        a, b = tp('s38'), s.dur
        s.bed('amb', birds, a, b, [(a, 0.035), (te('s38'), 0.035), (b - 1.0, 0.02), (b, 0)], 901)
        s.bed('amb', lambda d, q: trickle(d, q, (900, 2800), 70), a, b, [(a, 0.035), (te('s38') - 0.01, 0.035), (tp('s39'), 0.012), (b, 0.006)], 902)
        s.bed('amb', lambda d, q: wind(d, q, cold=0.15, gust=0.4), a, b, [(a, 0.008), (b, 0.006)], 903)

    def hook(s):
        C = s.C
        cr = s.ev('crack', 0, 2.5) or [0.0, C['hookCrack'], 1.55]
        for i, t in enumerate(cr):
            big = abs(t - C['hookCrack']) < 0.05
            s.hit('fx', thunder(3.0 if big else 2.2, 1000 + i, 1.0), t, 0.42 if big else 0.30, (-0.3, 0.0, 0.35)[i % 3], 'hookCrack' if big else 'hookBolt')
            if big:
                s.hit('low', boom(2.0, 60, 26, 1010), t, 0.40)
                s.hit('fx', white_flash(2 / 24, 1011), t, 0.16)
                s.hit('mus', taiko(1.6, 1012), t, 0.35)
        ws = s.ev('whoosh', 0, 2.5)
        s.add('fx', whoosh(0.55, 150, 900, 1020, 1.4, lambda u: sstep(0, 1, u) ** 2 * (1 - sstep(0.95, 1, u))), max(0.0, (ws[1] if len(ws) > 1 else 0.5) + LAT - 0.55), 0.25)
        if len(ws) > 1: s.hit('fx', whoosh(0.9, 2200, 300, 1021, 1.3, lambda u: sstep(0, 0.1, u) * (1 - u) ** 1.3), ws[1], 0.30, 0.0)
        tr = s.e1('roar', 0, 2.5, 0.42)
        dr = dragon_roar(1.5, 1030); s.add('fx', dr, tr + LAT - 0.03, 0.13)
        s.add('mus', strings([38, 45, 50], 2.5, 0.05, 0.05, seed=1040, lp=1600), 0.0, 0.14, edge=None)
        s.phrase(0.95, [(62, 0.0), (64, 0.22), (69, 0.44), (67, 0.8)], 'brass', 0.10, rate=1.0, tr=-12, seed=1050)
        s.add('fx', whoosh(1.0, 400, 3000, 1060, 1.2, lambda u: sstep(0, 0.3, u)), 1.5, 0.2, 0.0, edge=None)

    def pond(s):
        C = s.C; tp = s.t0
        # ---- s02 the leaf lands: a soft tick + a ring; Hi's eye breaks the surface; a blink
        tl = s.e1('drip', 2.5, 4.5, C['leafLand'])
        s.hit('fol', wood_knock(2001, 2600, 0.3) * 0.6 + 0.4 * pad(drop_bloop(2002), ns(0.35)), tl, 0.12, 0.0, 'leafLand')
        s.hit('glass', bowl(1174.7, 4.5, 2003), tl, 0.06, 0.0)
        te = s.e1('bloop', 2.5, 4.5, C['eyeUp'])
        s.hit('fol', drop_bloop(2010) + 0.0, te, 0.10, 0.1, 'eyeUp'); s.hit('fol', splash(0.15, 2011), te, 0.05, 0.1)
        s.hit('glass', bowl(880.0, 2.5, 2012), te, 0.025)
        for t in s.ev('blink', 2.5, 4.5): s.hit('glass', music_box(98, 0.6, 2020), t, 0.025, 0.2)
        # ---- motif on koto + music box, a warm dawn pad under the garden
        s.add('mus', pad_warm([50, 57, 62, 66], tp('s08') - tp('s03') + 0.3, 1.5, 0.8, seed=2100, lp=1800), tp('s03'), 0.05, edge=None)
        s.phrase(tp('s03') + 0.25, MOTIF, 'kb', 0.10, 0.15, seed=2110)
        s.add('mus', koto(50, 3.0, seed=2120), tp('s03') + 0.25, 0.06, -0.2)
        # ---- s04 underwater: the nudge, a small sad beat
        tn = s.e1('whoosh', 7.0, 9.25, C['nudge'])
        s.add('uw', whoosh(0.8, 120, 500, 2200, 1.3), tn + LAT - 0.45, 0.10, 0.4)
        s.hit('uw', bubbles(0.8, 2201, 40), tn, 0.12, 0.2)
        ts = s.e1('sad', 7.0, 9.25, 8.45)
        s.add('mus', music_box(69, 1.6, 2210), ts, 0.06, 0.1); s.add('mus', music_box(65, 2.2, 2211), ts + 0.32, 0.06, 0.1)
        # ---- s05 the spout at sunrise: awe on a long flute note, sparkle
        tq = s.e1('pour', 9.0, 11.5, tp('s05'))
        s.add('mus', shakuhachi(69, 2.0, scoop=1.5, seed=2300), tq + 0.15, 0.08, -0.15)
        s.add('mus', shakuhachi(74, 0.9, scoop=0.5, seed=2301), tq + 1.25, 0.06, -0.15)
        s.add('glass', tinkles(2.0, 2302, 6, notes=PENTA, dec=(0.2, 0.6)), tq, 0.05)
        # ---- s06 the glint turns determined: sting + the motif, brighter and quicker
        tg = s.e1('sting', 11.5, 13.0, 12.5)
        s.hit('glass', glass_ping(NOTE(86), 2.5, 2400), tg, 0.06)
        s.add('glass', rev_shimmer(0.9, 2401, notes=[NOTE(m) for m in (74, 81, 86, 93)]), tg + LAT - 0.9, 0.05, edge=(0.01, 0.002))
        s.phrase(tg + 0.1, MOTIF, 'koto', 0.10, -0.1, rate=1.3, seed=2410)
        s.add('mus', strings([50, 57, 62], 2.6, 0.4, 0.6, seed=2420, lp=2500), tg, 0.06, edge=None)
        # ---- s07 the inlet leap: a quick koto run up into a small sparkling splash
        tj = s.e1('splash', 13.5, 14.6, C['inletLeap'])
        for i, m in enumerate((62, 66, 69, 74, 76, 81)): s.add('mus', koto(m, 1.0, seed=2500 + i), tj - 0.32 + 0.055 * i, 0.06 + 0.006 * i, 0.2)
        s.hit('fol', splash(0.35, 2510), tj, 0.10, 0.1, 'inletLeap')
        tk = s.e1('sparkle', 14.0, 15.0, tj + 0.2)
        s.add('glass', tinkles(0.7, 2520, 40, notes=PENTA, dec=(0.1, 0.4), env=lambda u: (1 - u) ** 2), tk + LAT, 0.09)
        s.hit('glass', glass_ping(NOTE(93), 1.5, 2521), tk, 0.04)
        for t in s.ev('splash', tj + 0.1, 15.5): s.hit('fol', splash(0.25, int(t * 100)), t, 0.08, -0.1)
        for t in s.ev('swish', 12.8, 15.5): s.add('fol', whoosh(0.35, 700, 2500, int(t * 100), 1.0), t, 0.02, 0.0)

    def journey(s):
        C = s.C; tp = s.t0; te = s.t1
        # ---- BAMBOO: a light travelling pulse on koto, the motif on flute and music box
        a, b = tp('s08'), te('s09'); bt = 0.3; arp = [62, 69, 74, 69, 64, 69, 76, 69]
        for k in range(int((b - a) / bt)):
            s.add('mus', koto(arp[k % 8], 0.9, bright=0.7, seed=3000 + k), a + 0.1 + k * bt, 0.035 * (1.0 if k % 2 == 0 else 0.7), 0.3 * (-1) ** k)
        s.phrase(a + 0.7, MOTIF, 'flute', 0.07, -0.2, rate=0.9, seed=3100)
        s.phrase(tp('s09') + 0.3, MOTIF, 'box', 0.06, 0.25, rate=1.0, seed=3110)
        s.add('mus', pad_warm([50, 57, 64, 69], b - a, 0.6, 0.5, seed=3120, lp=1600), a, 0.035, edge=None)
        for t in s.ev('swish', a, b): s.add('fol', whoosh(0.5, 600, 2200, int(t * 100), 1.2), t, 0.03)
        # ---- TOWN: a far bell, a wooden shopfront clack, the bridge echo
        a = tp('s10')
        bl = bell(146.8, 5.0, 3200); s.add('glass', bl, a + 0.35, 0.045, -0.4)
        s.add('fol', wood_knock(3210, 820, 0.5), a + 1.25, 0.06, 0.45); s.add('fol', wood_knock(3211, 760, 0.5), a + 1.36, 0.045, 0.45)
        te_ = s.e1('echo', a, te('s10'), 22.4)
        s.add('fx', whoosh(0.9, 200, 700, 3220, 1.0) * 1.0, te_ + LAT - 0.4, 0.05)
        s.add('fx', reverb(np.stack([whoosh(0.6, 300, 900, 3221, 1.0)] * 2, 1), 2.0, 3222, 1500) * 0.6, te_ - 0.2, 0.10, edge=None)
        bt = 0.3
        for k in range(int((tp('s11') + 0.3 - a) / bt)):
            s.add('mus', koto((62, 69, 74, 69, 66, 69, 78, 69)[k % 8], 0.9, bright=0.7, seed=3300 + k), a + k * bt, 0.03 * (1.0 if k % 2 == 0 else 0.7), 0.3 * (-1) ** k)
        s.phrase(a + 0.9, MOTIF, 'koto', 0.08, -0.15, rate=1.0, seed=3310)
        # ---- s11 the cat: lean, swipe, slap, darting Hi, 'mrrp?!'
        for t in s.ev('swish', tp('s11'), C['catSwipe'] - 0.05): s.add('fol', whoosh(0.3, 400, 1500, int(t * 100), 1.0), t, 0.03, 0.3)
        sw = s.e1('swish', C['catSwipe'] - 0.05, C['catSwipe'] + 0.05, C['catSwipe'])
        s.hit('fol', whoosh(0.22, 3500, 900, 3400, 1.0, lambda u: sstep(0, 0.4, u) * (1 - u) ** 1.2), sw - 0.12, 0.08, 0.3)
        sp = s.e1('splash', sw, sw + 0.2, sw + 0.02)
        s.hit('fol', splash(0.6, 3410), sp, 0.18, 0.2, 'catSwipe')
        s.add('mus', koto(81, 0.8, bend=-2, bend_at=0.05, seed=3420), sp + 0.05, 0.05, -0.2)
        tm = s.e1('meow', tp('s11'), te('s11'), 24.0)
        s.hit('fol', cat_chirp(3430), tm, 0.10, 0.1)
        for i, m in enumerate((74, 78, 81)): s.add('mus', music_box(m, 0.6, 3440 + i), tm + 0.35 + 0.08 * i, 0.035, 0.3)
        # ---- s12 the river widens under a warm pad, the motif broad on flute
        a = tp('s12')
        s.add('mus', pad_warm([43, 50, 59, 62, 66, 69], te('s12') - a + 0.4, 0.8, 0.5, seed=3500, lp=2400), a, 0.08, edge=None)
        s.phrase(a + 0.25, MOTIF, 'flute', 0.08, 0.0, rate=0.7, tr=-12, seed=3510)
        s.add('mus', koto(43, 2.4, seed=3520), a + 0.02, 0.06)

    def gorge(s):
        C = s.C; tp = s.t0; te = s.t1
        a = tp('s13')
        # ---- tension: low D minor strings, a quiet heartbeat taiko, splashes in the rapids
        s.add('mus', strings([38, 45, 50, 53], C['strike2'] - a, 1.0, 0.4, seed=5000, lp=1400), a, 0.10, edge=None)
        for k in range(int((C['heronLock'] - a) / 0.75)): s.add('mus', taiko(0.8, 5010 + k), a + 0.3 + 0.75 * k, 0.05 + 0.02 * (k % 2 == 0), 0.0)
        for t in s.ev('splash', a, tp('s14')): s.hit('fol', splash(0.4, int(t * 100)), t, 0.09, 0.1)
        s.phrase(a + 0.5, [(62, 0), (65, 0.4), (69, 0.8)], 'flute', 0.05, -0.2, seed=5020)
        # ---- s14 the heron: harsh call, the lock sting
        th = s.e1('hit', tp('s14'), te('s14'), C['heronLock'])
        s.add('fol', heron_call(5100), tp('s14') + 0.25, 0.06, 0.35)
        s.hit('mus', taiko(1.3, 5110), th, 0.30, 0.0, 'heronLock')
        s.hit('mus', section([50, 51, 56], 1.2, 1.3, 5111), th, 0.10)
        s.hit('fol', heron_call(5112, 0.5), th + 0.08, 0.10, 0.2)
        s.add('mus', strings([62, 63], 1.0, 0.05, 0.5, seed=5113, lp=5000), th + LAT, 0.06, edge=None)
        # ---- s15 strike 1 (underwater): sharp whoosh in, plunge, bubble cone
        for t in s.ev('whoosh', tp('s15'), te('s15')): s.hit('fx', whoosh(0.3, 4000, 900, int(t * 100), 1.2, lambda u: sstep(0, 0.6, u) * (1 - sstep(0.8, 1, u))), t - 0.2, 0.14, 0.2)
        t1 = s.e1('hit', tp('s15'), te('s15'), C['strike1'])
        s.hit('fol', splash(1.2, 5200), t1, 0.22, 0.0, 'strike1')
        s.hit('uw', bubbles(1.0, 5201, 80, 300, 1200), t1, 0.12)
        s.hit('fx', crack(5202, 0.6), t1, 0.12)
        s.add('uw', whoosh(0.4, 300, 1200, 5203, 1.2), t1 + 0.12, 0.08, -0.4)
        # ---- s16 the hero leap: bright whoosh + sparkle, snap on air, dive
        tl = s.e1('splash', tp('s16'), tp('s16') + 0.6, 34.42)
        s.hit('fol', splash(0.6, 5300), tl, 0.14, -0.2)
        s.add('fx', whoosh(1.0, 600, 5000, 5301, 1.2, lambda u: sstep(0, 0.4, u) * (1 - sstep(0.6, 1, u))), tl, 0.12, -0.1)
        t2 = s.e1('whoosh', tl, tl + 0.4, C['strike2']); s.hit('fx', whoosh(0.25, 3500, 800, 5302, 1.2), t2 - 0.1, 0.10, 0.3)
        tsn = s.e1('snap', tl, te('s16'), 34.75)
        s.hit('fol', wood_knock(5310, 1700, 0.25) + 0.7 * wood_knock(5311, 2300, 0.2), tsn, 0.16, 0.3, 'snap')
        tsp = s.e1('sparkle', tl, te('s16'), 34.9)
        s.add('glass', tinkles(1.0, 5320, 30, notes=PENTA, dec=(0.15, 0.5), env=lambda u: (1 - u) ** 1.5), tsp + LAT, 0.10)
        s.hit('glass', glass_ping(NOTE(86), 2.0, 5321), tsp, 0.05)
        s.add('mus', choir([62, 66, 69, 74], 1.6, 'a', 0.25, 0.8, seed=5330), tsp - 0.3, 0.10, edge=None)
        s.add('mus', strings([50, 57, 62, 66], 1.8, 0.2, 0.9, seed=5331, lp=4000), tsp - 0.35, 0.12, edge=None)
        s.phrase(tsp - 0.25, MOTIF, 'brass', 0.06, 0.0, rate=1.6, tr=-12, seed=5340)
        for t in s.ev('splash', tsp, te('s16')): s.hit('fol', splash(0.8, int(t * 100)), t, 0.16, 0.1)
        # ---- s17 the heron flies off (flaps on twos, receding), rain begins, far thunder; dusk minor pad
        tf = s.e1('flap', tp('s17'), te('s17'), 36.75)
        s.add('fol', heron_call(5400, 0.45), tf - 0.05, 0.06, -0.2)
        for k in range(7): s.add('fol', flap(5410 + k), tf + k / 3, 0.08 * 0.75 ** k, -0.2 - 0.1 * k)
        for t in s.ev('thunder', tp('s17'), te('s18')): s.add('low', thunder(4.0, int(t * 100), 0.1), t, 0.20, 0.3)
        s.add('mus', pad_warm([46, 53, 58, 62], te('s18') - tp('s17') + 0.4, 1.2, 0.6, seed=5500, lp=1500), tp('s17'), 0.07, edge=None)
        s.phrase(tp('s17') + 0.6, [(74, 0), (77, 0.5), (81, 1.0)], 'box', 0.035, 0.3, seed=5510)
        # ---- s18 under the rain: a slow low motif far away
        s.phrase(tp('s18') + 0.4, [(62, 0), (64, 0.5), (69, 1.0), (67, 1.7)], 'koto', 0.05, -0.2, seed=5520)

    def falls(s):
        C = s.C; tp = s.t0; te = s.t1
        a = tp('s19')
        # ---- s19 reveal: the roar swells in, low brass + choir, bolts, ghost koi splashes
        s.hit('low', boom(3.0, 45, 24, 6000), a, 0.20)
        s.add('mus', choir([38, 45, 50], te('s20') - a, 'o', 1.5, 0.6, seed=6010), a, 0.10, edge=None)
        s.add('mus', section([38, 45], 3.4, 0.6, 6011, att=1.2), a + 0.1, 0.06, edge=(0.01, 0.6))
        s.add('mus', strings([50, 53, 57], te('s19') - a, 2.0, 0.3, seed=6012, lp=2500) * np.linspace(0.3, 1, ns(te('s19') - a))[:, None], a, 0.08, edge=None)
        for t in s.ev('splash', a, te('s19')): s.hit('fol', splash(0.5, int(t * 100)), t, 0.06, 0.2 * np.sin(t))
        for i, t in enumerate(s.ev('crack', a, te('s20'))):
            s.hit('fx', thunder(3.5, 6100 + i, 0.7), t, 0.30, (-0.4, 0.4, 0.0)[i % 3], 'fallsBolt')
        # ---- s20 CU: a held tense note
        s.add('mus', strings([62, 63], te('s20') - tp('s20') + 0.2, 0.3, 0.15, seed=6200, lp=3000), tp('s20'), 0.05, edge=None)
        # ---- s21 the try: burst out, struggle, crash, tumble
        t0 = s.e1('splash', tp('s21'), tp('s21') + 0.3, tp('s21'))
        s.hit('fol', splash(0.7, 6300), t0, 0.14, 0.0)
        s.hit('mus', taiko(1.1, 6301), t0, 0.20)
        for k, t in enumerate(np.arange(t0 + 0.45, C['fallBack'] - 0.1, 0.25)):
            s.add('fol', whoosh(0.22, 500, 2500, 6310 + k, 1.0), t, 0.035, 0.2 * (-1) ** k)
            s.add('mus', taiko(0.7, 6320 + k), t, 0.06 + 0.012 * k)
        s.add('mus', strings([50, 51, 57], C['fallBack'] - t0, 0.5, 0.05, seed=6330, lp=3000), t0, 0.08, edge=None)
        th = s.e1('hit', tp('s21'), te('s21'), C['fallBack'])
        s.hit('fx', crack(6400, 1.4), th, 0.30, 0.0, 'fallBack'); s.hit('fol', splash(1.6, 6401), th, 0.25); s.hit('low', boom(1.5, 70, 30, 6402), th, 0.30)
        s.hit('fx', white_flash(1 / 24, 6403), th, 0.08)
        tw = s.e1('whoosh', th, te('s21'), th + 0.05)
        s.add('fx', whoosh(0.85, 2500, 250, 6410, 1.4, lambda u: sstep(0, 0.1, u) * (1 - u)), tw, 0.14)
        s.add('mus', section([45, 46], 0.9, 0.5, 6411, att=0.01), th + LAT, 0.06, edge=(0.001, 0.3))
        # ---- s22 the sink: muffled plunge, slow bubbles, the motif in minor, slow and far
        ts = s.e1('splash', tp('s22'), tp('s22') + 0.3, C['sink'])
        s.hit('uw', splash(1.4, 6500), ts, 0.10)
        s.hit('uw', bubbles(1.5, 6501, 30), ts, 0.06)
        for k, t in enumerate(s.ev('bubbles', tp('s22'), te('s22'))): s.add('uw', bubbles(1.6, 6510 + k, 5, 250, 900), t, 0.10, 0.1)
        s.phrase(ts + 0.6, SAD, 'box', 0.07, 0.0, rate=1.0, seed=6520, bus='mem')
        s.add('mus', pad_warm([38, 50, 53], te('s22') - ts, 1.0, 0.8, seed=6530, lp=900), ts, 0.04, edge=None)

    def climb(s):
        C = s.C; tp = s.t0; te = s.t1
        # ---- s23 memory: warm chime, the koto motif drenched in reverb, the soft inlet splash
        m = s.ev('memory', tp('s23') - 0.1, te('s23')) or [tp('s23'), tp('s23') + 1.0]
        s.hit('glass', glass_ping(NOTE(86), 3.0, 7000), m[0], 0.06); s.add('glass', rev_shimmer(0.6, 7001, notes=[NOTE(x) for x in (74, 81, 86)]), m[0] + LAT - 0.6, 0.04, edge=(0.01, 0.002))
        s.add('mem', pad_warm([50, 57, 62, 66], te('s23') - tp('s23') + 0.6, 0.3, 0.6, seed=7010, lp=1500), tp('s23'), 0.07, edge=None)
        s.phrase(m[0] + 0.1, MOTIF, 'kb', 0.12, 0.0, rate=1.1, seed=7020, bus='mem')
        s.add('mem', birds(2.0, 7030, 1.5) * sstep(0, 0.3, tv(ns(2.0)))[:, None], tp('s23'), 0.03, edge=(0.002, 0.2))
        if len(m) > 1: s.hit('glass', glass_ping(NOTE(93), 2.0, 7040), m[1], 0.035)
        for t in s.ev('splash', tp('s23'), te('s23')): s.hit('mem', splash(0.3, int(t * 100)), t, 0.06)
        # ---- s24 wake: a heartbeat, the crown glows
        tw = s.e1('heartbeat', tp('s24'), te('s24'), C['wake'])
        s.hit('low', heartbeat(7100), tw, 0.55, 0.0, 'wake'); s.hit('low', heartbeat(7101, 0.6), tw + 0.75, 0.35)
        tg = s.e1('glow', tp('s24'), te('s24'), tw + 0.2); s.add('fx', glow('red', 0.9, 7110), tg, 0.04)
        s.add('mus', strings([50, 57], te('s24') - tw + 0.2, 0.5, 0.1, seed=7120, lp=1200), tw, 0.06, edge=None)
        # ---- s25 the run: dive, U-turn, accelerate up; rising drums into the breach
        a = s.e1('whoosh', tp('s25'), te('s25'), tp('s25') + 0.15); br = s.e1('splash', te('s25') - 0.1, te('s25') + 0.4, C['breach'])
        s.add('uw', whoosh(0.6, 900, 200, 7200, 1.2), a, 0.10)
        for t in s.ev('swish', tp('s25'), te('s25')): s.add('uw', whoosh(0.4, 200, 600, int(t * 100), 1.2), t, 0.08)
        tu = s.e1('whoosh', a + 0.5, te('s25'), 56.38); n = ns(br + LAT - tu); u = np.linspace(0, 1, n)
        s.add('fx', nrm(vfilt(noise(n, 7210), 200 * 15 ** u, 'bandpass', 1.0) * u ** 1.8), tu, 0.12, edge=(0.01, 0.003))
        s.add('fx', np.stack([sweep(NOTE(50) * 2 ** (24 * u ** 1.4 / 12)) * u ** 1.5] * 2, 1), tu, 0.025, edge=(0.01, 0.003))
        nr = 26
        for k in range(nr):
            v = k / nr; tk = a + (br - a) * (1 - (1 - v) ** 1.5)
            s.add('mus', taiko(0.9, 7300 + k), tk, 0.06 + 0.22 * v ** 1.5, 0.3 * (-1) ** k)
        s.add('mus', strings([38, 50, 57], br - a, br - a, 0.02, seed=7310, lp=2500) * np.linspace(0.2, 1, ns(br - a))[:, None], a, 0.12, edge=None)
        # ---- s26-s27 the climb: taiko ostinato 120 bpm from the breach, strings pad building, the motif on brass
        s.hit('fol', splash(1.2, 7400), br, 0.20, 0.0, 'breach'); s.hit('mus', taiko(1.5, 7401), br, 0.35)
        for t in s.ev('swish', br, te('s26')): s.add('fol', whoosh(0.3, 600, 2400, int(t * 100), 1.0), t, 0.05)
        drop = s.e1('silence', te('s27') - 0.2, te('s28'), te('s27')); T0 = C['breach']; BEAT = 0.5
        PAT = [1.0, 0, 0.45, 0.35, 0.8, 0, 0.5, 0.3]
        prog = (([50, 53, 57, 62], 38), ([46, 53, 58, 62], 34), ([48, 55, 60, 64], 36))
        for bar, (ch, bass) in enumerate(prog):
            t0 = T0 + bar * 4 * BEAT; L = min(2.05, drop - t0); g = 0.6 + 0.2 * bar
            if L <= 0.05: break
            for k, amp in enumerate(PAT):
                tk = t0 + k * BEAT / 2
                if tk >= drop - 0.05: break
                if amp: s.add('mus', taiko(1.1 if amp > 0.7 else 0.8, int(tk * 100)), tk - 0.001, 0.26 * amp * g)
                s.add('mus', shime(int(tk * 100) + 1), tk, 0.045 * g * (1.0 if k % 2 == 0 else 0.6), 0.25)
            s.add('mus', strings(ch, L, 0.3 if bar == 0 else 0.1, 0.08, seed=7500 + bar, lp=2500 + 1000 * bar), t0, 0.12 * g, edge=None)
            s.add('mus', strings([bass, bass + 12], L, 0.05, 0.08, seed=7510 + bar, lp=1500), t0, 0.18 * g, edge=None)
            if bar >= 1: s.add('mus', choir(ch, L, 'a', 0.3, 0.08, seed=7520 + bar), t0, 0.08 * g, edge=None)
        s.phrase(T0 + 2.0, MOTIF, 'brass', 0.08, 0.0, rate=0.9, tr=-12, seed=7530)
        # ---- s27 the log: groan, dodge, crash on the downbeat
        tc = s.e1('creak', tp('s27'), te('s27'), 61.1)
        s.add('fol', nrm(creak(7600, 60, 0.6, rate=(10, 20), form=(150, 1200))), tc, 0.10, -0.2)
        s.add('fx', whoosh(0.6, 120, 700, 7601, 1.2), tc + 0.05, 0.12, -0.3)
        td = s.e1('whoosh', tc, te('s27'), 61.46); s.hit('fx', whoosh(0.25, 3000, 900, 7610, 1.2), td - 0.1, 0.12, 0.3)
        tt = s.e1('thud', tc, te('s27'), C['log'])
        s.hit('fx', crack(7620, 1.6), tt, 0.32, -0.1, 'log'); s.hit('low', boom(1.3, 55, 28, 7621), tt, 0.30)
        s.hit('fol', wood_knock(7622, 140, 2.0), tt, 0.30, -0.1); s.hit('fol', splash(1.8, 7623), tt + 0.03, 0.22, 0.1)
        # ---- s28 the push: drop to near silence, a single breath, heartbeats, the crown ignites - the motif swells
        s.drop = drop
        tb = drop + 0.3; s.add('low', breath(7700, 0.1, 1.1) * 1.0, tb, 0.07)
        tig = s.e1('ignite', drop, te('s28'), C['push'])
        for k, t in enumerate(np.arange(drop + 0.55, tig - 0.1, 0.8)): s.hit('low', heartbeat(7710 + k), t, 0.15)
        s.hit('low', heartbeat(7720), tig, 0.50, 0.0, 'ignite')
        s.add('glass', glow('red', 1.2, 7730), tig, 0.08)
        g = s.e1('crack', te('s28'), te('s29'), C['gate'] - 0.025); sw = g + LAT - tig; n = ns(sw); u = np.linspace(0, 1, n)
        for i, (mm, o) in enumerate(MOTIF):
            to = tig + 0.05 + o * (sw - 0.3) / 0.9
            s.add('glass', music_box(mm + 12, 1.5, 7740 + i), to, 0.05)
            s.add('glass', section([mm - 24, mm - 12], g + LAT - to, 1.0 + 0.3 * i, 7745 + i, att=0.05), to, 0.03 + 0.012 * i, edge=(0.001, 0.003))
        s.add('glass', strings([50, 57, 62, 66, 69], sw, 0.1, 0.002, seed=7750, lp=5000) * (0.1 + 0.9 * u ** 1.6)[:, None], tig, 0.22, edge=None)
        s.add('glass', choir([62, 69, 74], sw, 'a', 0.2, 0.002, seed=7751) * (0.1 + 0.9 * u ** 2)[:, None], tig, 0.14, edge=None)
        tpush = s.e1('whoosh', tig, te('s28'), tig + 0.2); s.add('fx', whoosh(0.7, 300, 2500, 7760, 1.2), tpush, 0.10)
        tl = s.e1('whoosh', te('s28'), g, 65.62); s.add('fx', whoosh(0.4, 500, 4000, 7761, 1.2, lambda u: u ** 1.5), tl, 0.14)

    def dragon(s):
        C = s.C; tp = s.t0; te = s.t1
        # ---- s29 the gate: a gigantic thunderclap on the impact frames, then held in the glow
        g = s.e1('crack', te('s28'), te('s29'), C['gate'] - 0.025)
        s.hit('fx', thunder(4.5, 8000, 1.6), g, 0.55, 0.0, 'gate'); s.hit('low', boom(4.0, 50, 22, 8001), g, 0.55)
        s.hit('fx', white_flash(3 / 24, 8002), g, 0.30); s.hit('mus', taiko(1.8, 8003), g, 0.45)
        th = s.e1('hum', g, te('s29'), g + 0.1)
        s.add('glass', bowl(NOTE(50), te('s29') - th + 0.6, 8010), th, 0.08)
        s.add('glass', choir([50, 57, 62], te('s29') - th + 0.4, 'u', 0.4, 0.4, seed=8011), th, 0.07, edge=None)
        # ---- s30 the change: rising choir, shimmering sparkles, deep bloom, cocoon bolts on threes, the gold wave
        a = s.e1('transform', tp('s30') - 0.1, te('s30'), tp('s30')); b = te('s30') + 0.3; d = b - a; u = np.linspace(0, 1, ns(d))
        s.hit('low', boom(3.5, 40, 20, 8100), a, 0.40)
        s.add('mus', choir([50, 57, 62, 66], d, 'a', 0.8, 0.2, seed=8110) * (0.3 + 0.7 * u)[:, None], a, 0.16, edge=None)
        s.add('mus', choir([69, 74, 78], d, 'o', 1.5, 0.2, seed=8111, bright=0.6) * u[:, None], a, 0.10, edge=None)
        s.add('mus', strings([38, 50], d, 0.5, 0.1, seed=8112, lp=900), a, 0.20, edge=None)
        s.add('glass', tinkles(d, 8120, 25, notes=PENTA, dec=(0.1, 0.5), env=lambda v: 0.3 + 0.7 * v), a, 0.08)
        n = ns(d); s.add('fx', nrm(vfilt(noise(n, 8130), 300 * 12 ** u, 'bandpass', 1.0) * u ** 2), a, 0.08, edge=(0.01, 0.01))
        for i, t in enumerate(s.ev('crack', a, te('s30'))):
            for k in range(3): s.hit('fx', crack(8140 + 3 * i + k, 0.5) * 0.6 + 0.4 * pad(sparks(0.4, 8150 + 3 * i + k), ns(0.45)), t + k * 0.125, 0.10, (k - 1) * 0.5)
        tsh = s.e1('shimmer', a, te('s30'), 68.5)
        s.add('glass', rev_shimmer(1.2, 8160, notes=[NOTE(m) for m in (74, 78, 81, 86, 90, 93)]), tsh - 0.6, 0.10, edge=(0.01, 0.01))
        s.add('glass', tinkles(1.4, 8161, 60, notes=PENTA, dec=(0.1, 0.4), env=lambda v: (1 - v) ** 1.5), tsh + LAT, 0.10)
        tsw = s.e1('swell', tsh, te('s30') + 0.2, 69.5)
        s.add('mus', section([38, 50, 57], te('s30') - tsw + 0.25, 0.8, 8170, att=0.5), tsw, 0.10, edge=(0.01, 0.1))
        # ---- s31 the roar: an intake of breath, the full dragon roar + the theme in brass, thunder answers
        tb = s.e1('breath', tp('s31') - 0.1, te('s31'), 70.05)
        br = breath(8200, 0.2, 0.3)[::-1].copy(); s.add('fol', br, tb, 0.10)
        tr = s.e1('roar', tb, te('s31'), C['roar'])
        s.add('fx', dragon_roar(1.9, 8210, 1.2), tr + LAT - 0.04, 0.17)
        s.hit('low', boom(2.0, 55, 26, 8211), tr, 0.40); s.hit('mus', taiko(1.7, 8212), tr, 0.40, 0.0, 'roar')
        s.phrase(tr + 0.15, THEME, 'brass', 0.12, 0.0, rate=1.25, tr=-24, seed=8220)
        s.add('mus', strings([38, 45, 50, 57, 62], te('s31') - tr + 0.2, 0.2, 0.3, seed=8230, lp=3000), tr, 0.16, edge=None)
        s.add('mus', choir([50, 57, 62, 66], te('s31') - tr + 0.2, 'a', 0.3, 0.3, seed=8231), tr, 0.10, edge=None)
        s.add('low', thunder(3.0, 8240, 0.3), tr + 1.0, 0.25, 0.4)
        # ---- s32 the ascent: driving drums, the theme rising, lightning chasing the tail
        a = tp('s32'); b = te('s32')
        s.hit('fx', whoosh(1.4, 200, 3000, 8300, 1.3, lambda v: sstep(0, 0.1, v) * (1 - v) ** 0.8), s.e1('whoosh', a - 0.05, b, a), 0.22)
        for k in range(int((b - a) / 0.25)):
            tk = a + 0.25 * k; s.add('mus', taiko(1.0 if k % 2 == 0 else 0.7, 8310 + k), tk, 0.16 if k % 4 == 0 else 0.08)
            s.add('mus', shime(8340 + k), tk + 0.125, 0.04, 0.25)
        for i, t in enumerate(s.ev('crack', a, b)): s.hit('fx', thunder(2.0, 8400 + i, 0.8), t, 0.22, (-0.5, 0.5)[i % 2], 'chase')
        s.phrase(a + 0.2, MOTIF, 'brass', 0.10, 0.0, rate=1.0, tr=-12, seed=8420)
        s.add('mus', strings([50, 57, 62], b - a, 0.3, 0.05, seed=8430, lp=3500) * np.linspace(0.4, 1, ns(b - a))[:, None], a, 0.14, edge=None)
        nr = ns(b - a); v = np.linspace(0, 1, nr); s.add('fx', nrm(vfilt(noise(nr, 8440), 400 * 10 ** v, 'bandpass', 1.0) * v ** 2), a, 0.08, edge=(0.01, 0.003))
        # ---- s33 above the clouds: burst into the dawn, the theme soaring; s34 the calm peak
        tb = s.e1('burst', b - 0.1, te('s33'), C['dawn'])
        s.hit('fx', whoosh(2.2, 300, 6000, 8500, 2.0, lambda v: sstep(0, 0.06, v) * (1 - v) ** 1.2), tb, 0.30, 0.0)
        s.hit('low', boom(2.5, 50, 28, 8501), tb, 0.30, 0.0, 'dawn')
        s.add('glass', tinkles(2.5, 8502, 30, notes=PENTA, dec=(0.2, 0.7), env=lambda v: (1 - v) ** 1.2), tb + LAT, 0.08)
        e34 = te('s34') + 0.1; d = e34 - tb
        s.add('mus', strings([38, 50, 57, 62, 66], d, 0.05, 1.0, seed=8510, lp=4000), tb + LAT, 0.16, edge=(0.001, 0.4))
        s.add('mus', choir([62, 66, 69, 74], d, 'a', 0.1, 1.0, seed=8511), tb + LAT, 0.13, edge=None)
        s.add('mus', section([50, 57, 62, 66], 1.6, 1.2, 8512, att=0.02), tb + LAT, 0.10, edge=(0.001, 0.5))
        s.phrase(tb + 0.25, THEME, 'brass', 0.10, 0.0, rate=0.85, tr=-12, seed=8520)
        s.phrase(tb + 0.25, THEME, 'koto', 0.06, 0.3, rate=0.85, seed=8530)
        tsp = s.e1('whoosh', tb + 0.5, te('s33'), 75.8); s.add('fx', whoosh(1.4, 500, 3000, 8540, 1.4), tsp - 0.2, 0.14, -0.4)
        tg = s.e1('swell', tp('s34') - 0.1, te('s34'), tp('s34'))
        s.phrase(tg, THEME, 'flute', 0.09, -0.1, rate=0.75, seed=8550)
        s.add('mus', strings([67, 71, 74, 78], 1.8, 0.6, 0.6, seed=8560, lp=5000), tg, 0.06, edge=None)

    def home(s):
        C = s.C; tp = s.t0; te = s.t1
        # ---- s35-s37 return flight: fast whooshes over each place, quick koto pulses, light taiko
        a, b = tp('s35'), te('s37')
        for k in range(int((b - a) / 0.125)):
            s.add('mus', koto((62, 69, 74, 76, 78, 81, 78, 74)[k % 8], 0.6, bright=0.8, seed=9000 + k), a + 0.125 * k, 0.035, 0.4 * (-1) ** k)
            if k % 4 == 0: s.add('mus', taiko(0.9, 9100 + k), a + 0.125 * k, 0.10 if k % 8 == 0 else 0.06)
        s.add('mus', strings([50, 57, 62, 66], b - a, 0.1, 0.3, seed=9150, lp=3500), a, 0.10, edge=None)
        for i, (sid, mt) in enumerate((('s35', 0), ('s36', 1), ('s37', 2))):
            s.phrase(tp(sid) + 0.05, MOTIF, 'box', 0.04, (-0.3, 0.0, 0.3)[i], rate=2.0, tr=12 if i == 2 else 0, seed=9160 + 10 * i)
        for i, t in enumerate(s.ev('whoosh', a - 0.1, b)):
            s.hit('fx', whoosh(0.8, 300, 3500, 9200 + i, 1.3, lambda v: sstep(0, 0.45, v) * (1 - sstep(0.55, 1, v))), t + 0.35, 0.20, (-0.5, 0.5)[i % 2])
        tf = s.e1('flap', a, te('s35'), 79.62)
        s.add('fol', heron_call(9300, 0.4), tf + 0.02, 0.09, 0.4)
        for k in range(4): s.add('fol', flap(9310 + k, 0.9), tf + k * 0.16, 0.06, 0.4 + 0.1 * k)
        s.add('fol', reverb(np.stack([rustle(0.5, 9320)] * 2, 1), 0.4, 9321) + np.stack([rustle(0.5, 9320)] * 2, 1), tp('s36') + 0.1, 0.03, edge=None)
        tm = s.e1('meow', tp('s36'), te('s36'), 80.8)
        s.add('fol', cat_chirp(9330, 0.6, 0.5), tm, 0.07, -0.2)
        tw = s.e1('wind', tp('s37') - 0.1, te('s37'), tp('s37'))
        s.add('fol', filt(whoosh(1.2, 800, 5000, 9340, 2.0), 'highpass', 500), tw, 0.10)
        q = rnd(9341)
        for k in range(10): s.add('fol', wood_knock(9350 + k, q.uniform(350, 700)), tw + 0.1 + 0.08 * k + q.uniform(0, 0.04), 0.03, q.uniform(-0.8, 0.8))
        # ---- s38 the temple: the theme resolves (G - A - D), the bell, birds
        tt = s.e1('chime', tp('s38') - 0.1, te('s38'), C['temple'])
        s.hit('glass', bell(146.8, 6.0, 9400), tt, 0.12, -0.2, 'temple')
        s.add('mus', strings([43, 55, 59, 62, 67], 1.0, 0.1, 0.3, seed=9410, lp=3500), tt, 0.14, edge=None)
        s.add('mus', strings([45, 57, 61, 64, 69], 0.9, 0.1, 0.3, seed=9411, lp=3500), tt + 0.85, 0.14, edge=None)
        s.add('mus', strings([38, 50, 57, 62, 66], 3.4, 0.2, 1.8, seed=9412, lp=3500), tt + 1.6, 0.16, edge=None)
        s.add('mus', choir([62, 66, 69, 74], 3.6, 'a', 0.4, 1.8, seed=9413), tt + 0.6, 0.11, edge=None)
        s.phrase(tt + 0.1, THEME, 'kb', 0.09, 0.15, rate=1.0, seed=9420)
        s.add('mus', section([50, 57, 62], 2.0, 0.9, 9430, att=0.3), tt + 1.6, 0.06, edge=(0.01, 1.0))
        # ---- s39 the end: the motif once more, the single leaf ripple tone, the soft fade
        a = tp('s39')
        s.phrase(a + 0.15, MOTIF, 'box', 0.06, 0.0, rate=0.85, seed=9500)
        td = s.e1('drip', a, s.dur, 86.7)
        s.hit('glass', bowl(587.3, 2.5, 9510), td, 0.12, 0.0, 'drip')
        s.hit('fol', drop_bloop(9511), td, 0.05)
        s.add('mus', pad_warm([50, 57, 62, 66, 69], s.dur - a, 1.0, 0.6, seed=9520, lp=2000), a, 0.05, edge=None)
        s.add('glass', rev_shimmer(0.7, 9530, notes=[NOTE(m) for m in (74, 81, 86, 90)]), s.e1('swell', td, s.dur, 87.5) - 0.3, 0.03, edge=(0.01, 0.2))

    # ------------------------------------------------------------ mix
    def mix(s, diag=False):
        C, T, b = s.C, s.T, s.bus
        mus = b['mus'].b + reverb(b['mus'].b, 2.6, 91, 5500) * 0.30
        kn = np.percentile(np.abs(mus), 99.8) * 1.8 + 1e-9; mus = kn * np.tanh(mus / kn)
        mem = b['mem'].b + reverb(b['mem'].b, 4.5, 95, 3800) * 1.1
        fx = b['fx'].b + reverb(b['fx'].b, 1.6, 92, 5000) * 0.22
        fol = b['fol'].b + reverb(b['fol'].b, 0.9, 93, 6000) * 0.15
        gl = b['glass'].b + reverb(b['glass'].b, 4.0, 94, 8000) * 0.5
        low = filt(b['low'].b, 'lowpass', 2000)
        uw = filt(b['uw'].b, 'lowpass', 2200); uw = uw + reverb(uw, 1.2, 96, 1500) * 0.3
        amb = b['amb'].b
        # underwater shots: the world above goes muffled (low-pass), the underwater layer stays clear
        um = s.mask(lambda x: x['under'], 0.02)[:, None]
        dr = getattr(s, 'drop', 63.0); ig = s.e1('ignite', dr, 66, C['push'])
        duck = 1 - 0.92 * sstep(dr - 0.02, dr + 0.08, T) * (1 - sstep(ig - 0.05, ig + 0.3, T))
        world = amb + (fol + fx) * duck[:, None]
        world = world * (1 - um) + filt(world, 'lowpass', 420) * 1.6 * um
        # s28: everything drops to a single breath (the near silence) until the crown ignites
        mus *= duck[:, None]
        parts = dict(mus=mus, mem=mem, world=world, glass=gl, low=low, uw=uw)
        mix = sum(parts.values())
        # gain ride: lift the quiet valley (pond -> town) and the gorge so they read on a phone next to the storm
        ride = 10 ** (np.interp(T, [0, 2.5, 2.75, 6.95, 7.05, 9.2, 9.3, 19.95, 20.05, 24.95, 25.05, 27.4, 27.6, 41.4, 41.6, 79.4, 79.6, 88],
                                   [0, 0, 5, 5, 7, 7, 5, 5, 7.5, 7.5, 5, 5, 2.5, 2.5, 0, 0, 1.5, 2]) / 20)
        mix *= ride[:, None]
        kf = np.percentile(np.abs(mix), 99.95) * 2.0 + 1e-9; mix = kf * np.tanh(mix / kf)
        # s01 -> s02: hard cut to real silence until the leaf
        a, z = s.t1('s01'), s.e1('drip', 2.5, 4.5, C['leafLand']) - 0.05
        mix[ns(a):ns(z)] = 0; mix[ns(z):ns(z) + ns(0.01)] *= np.linspace(0, 1, ns(0.01))[:, None]
        s.silence = (a, z)
        tail = 1 - sstep(C['end'] - 0.5, C['end'] - 0.01, T); mix *= tail[:, None]; mix[ns(C['end'] - 0.01):] = 0
        mix[:ns(0.002)] *= np.linspace(0, 1, ns(0.002))[:, None]
        if diag:
            r = lambda z_, a_, c_: round(float(db(np.sqrt(np.mean(z_[ns(a_):ns(c_)] ** 2)))), 1)
            for sh in s.tl['shots']:
                print(f"{sh['id']} {sh['name'][:10]:10s}", ' '.join(f'{k} {r(v, sh["t0"], sh["t1"]):6}' for k, v in parts.items()), '| mix', r(mix, sh['t0'], sh['t1']))
        return mix
