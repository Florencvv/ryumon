"""instruments.py - every voice of the RYUMON score, synthesised from sines and filtered noise.

Music: koto (plucked), shakuhachi (breathy bamboo flute), choir, brass, strings, taiko, shime, glass bowl tones.
Foley/FX: rain, neon hum, traffic, wind, temple bell, armoured and light footsteps, snow, breath, creaks, glass,
water, whooshes, sword rings, cracks, booms, flame, embers, sparks, sheathe click, cloth.
Each function returns a mono (n,) or stereo (n, 2) clip that starts at sample 0.
"""
from dsp import *


def rmsn(y): return y / (np.sqrt(np.mean(y ** 2)) + 1e-12)
def pad(y, n): return np.pad(y, (0, max(0, n - len(y))))[:n] if y.ndim == 1 else np.pad(y, ((0, max(0, n - len(y))), (0, 0)))[:n]


# ================================================================== music
def koto(m, dur=2.4, bend=0.0, bend_at=0.22, bright=1.0, seed=0):
    """plucked 13-string zither: bright plectrum attack, fast-decaying upper partials, optional oshide bend"""
    f0 = NOTE(m); n = ns(dur); t = tv(n); q = rnd(seed)
    fr = f0 * 2 ** (bend / 12 * sstep(bend_at, bend_at + 0.1, t)) * (1 + 0.006 * np.exp(-t / 0.03))
    ph = 2 * np.pi * np.cumsum(fr) / SR; y = np.zeros(n); d1 = 1.5 * (220 / f0) ** 0.4
    for k in range(1, 26):
        if k * f0 > 11000: break
        a = (abs(np.sin(np.pi * k * 0.17)) + 0.05) / k ** 0.75
        y += a * np.sin(k * ph * (1 + 0.0004 * k * k) + q.uniform(0, 0.3)) * np.exp(-t * (1 / d1 + 2.2 * (k - 1) * bright))
    y = nrm(y) + 0.25 * pad(burst(0.03, 1800, 9000, 0.0025, seed + 1), n)
    return nrm(y) * np.minimum(1, t / 0.0012) * np.minimum(1, (dur - t) / 0.05)


def shakuhachi(m, dur, scoop=1.0, vib=1.0, air=1.0, seed=0):
    """bamboo flute: meri scoop into the note, breath noise around the tone, late yuri vibrato, muraiki chiff"""
    f0 = NOTE(m); n = ns(dur); t = tv(n)
    fr = f0 * 2 ** (-scoop / 12 * np.exp(-t / 0.1)) * (1 + 0.007 * vib * np.sin(2 * np.pi * 5.0 * t) * sstep(0.3 * dur, 0.75 * dur, t))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    tone = np.sin(ph) + 0.28 * np.sin(2 * ph + 0.4) + 0.1 * np.sin(3 * ph + 1.1) + 0.04 * np.sin(4 * ph)
    br = filt(noise(n, seed), 'bandpass', [f0 * 0.8, f0 * 3.2]) * (1 + 0.6 * np.sin(ph)); br = 0.5 * air * br / (np.std(br) + 1e-9)
    hi = 0.12 * air * rmsn(filt(noise(n, seed + 1), 'bandpass', [1800, 7000]))
    chiff = 0.9 * air * pad(burst(0.12, 700, 5000, 0.03, seed + 2), n) / 3
    wob = 1 + 0.07 * ctrl(dur, 7, seed + 3)
    amp = sstep(0, 0.09, t) * (0.8 + 0.2 * sstep(0.1, 0.6 * dur, t)) * (1 - sstep(dur - min(0.25, dur / 3), dur, t))
    return (0.7 * tone + 0.15 * br + hi * 0.4) * amp * wob + chiff * np.minimum(1, t / 0.004)


def choir(ms, dur, vowel='a', att=0.5, rel=0.8, seed=0, bright=1.0):
    """additive choir: 3 detuned voices per note, static vowel formants, breath; stereo"""
    F = {'a': (800, 1200, 2700), 'o': (500, 850, 2600), 'u': (350, 800, 2400), 'e': (500, 1850, 2600)}[vowel]
    BW = (110, 150, 220); W = (1.0, 0.6 * bright, 0.3 * bright)
    n = ns(dur); t = tv(n); q = rnd(seed); out = np.zeros((n, 2))
    for i, m in enumerate(ms):
        for j, c in enumerate((-9, 1, 8)):
            f = NOTE(m) * 2 ** (c / 1200)
            fv = f * (1 + 0.005 * np.sin(2 * np.pi * q.uniform(4.6, 5.8) * t + q.uniform(0, 6)) + 0.002 * ctrl(dur, 3, seed + 10 * i + j))
            ph = 2 * np.pi * np.cumsum(fv) / SR; y = np.zeros(n)
            for k in range(1, int(8000 / f) + 1):
                fk = k * f; g = sum(W[x] / np.sqrt(1 + ((fk - F[x]) / (BW[x] / 2)) ** 2) for x in range(3)) / k ** 0.5
                y += g * np.sin(k * ph + q.uniform(0, 6))
            out += pan2(y, [-0.5, 0.0, 0.5][j] * 0.8)
    out /= np.abs(out).max() + 1e-9
    out += 0.025 * np.stack([filt(noise(n, seed + 90 + c), 'bandpass', [2500, 7000]) for c in range(2)], 1)
    e = sstep(0, att, t) * (1 - sstep(dur - rel, dur, t)); return out * e[:, None]


def brass(m, dur, bright=1.0, att=0.02, seed=0):
    """brass-like note: harmonic stack, filter blooms on the attack, scoop, late vibrato"""
    q = rnd(seed); f = NOTE(m); n = ns(dur); t = tv(n)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.3 * t + q.uniform(0, 6)) * sstep(0.14, 0.32, t)
    ph = 2 * np.pi * np.cumsum(f * (1 - 0.022 * np.exp(-t / 0.025)) * vib) / SR
    fc = f * (1.3 + bright * (2.0 + 5.5 * np.exp(-t / 0.07))); y = np.zeros(n)
    for k in range(1, int(min(28, 9500 / f)) + 1):
        y += (1 / k) / np.sqrt(1 + (k * f / fc) ** 4) * np.sin(k * ph + q.uniform(0, 0.3))
    y += 0.03 * filt(q.standard_normal(n), 'bandpass', [1200, 5000]) * np.exp(-t / 0.05)
    return nrm(y) * np.minimum(1, t / att) * (1 + 0.3 * np.exp(-t / 0.06)) * np.minimum(1, (dur - t) / 0.07)


def section(ms, dur, bright=1.0, seed=0, att=0.02):
    y = np.zeros(ns(dur))
    for i, m in enumerate(ms):
        for j, d in enumerate((-0.06, 0.05)): y += brass(m + d, dur, bright, att, seed * 50 + i * 3 + j)
    return y / (2 * len(ms)) ** 0.7


def strings(ms, dur, att=0.3, rel=0.6, seed=0, lp=3500):
    """sustained string pad: detuned harmonic stacks, lowpassed; stereo"""
    n = ns(dur); t = tv(n); q = rnd(seed); out = np.zeros((n, 2))
    for i, m in enumerate(ms):
        for j, d in enumerate((-0.08, 0.0, 0.07)):
            f = NOTE(m) * 2 ** (d / 12); ph = 2 * np.pi * np.cumsum(f * (1 + 0.003 * np.sin(2 * np.pi * q.uniform(4.8, 5.8) * t))) / SR
            y = sum(np.sin(k * ph + q.uniform(0, 6)) / k for k in range(1, int(min(12, 9000 / f)) + 1))
            out += pan2(y, (j - 1) * 0.6)
    out = filt(out, 'lowpass', lp) / (len(ms) * 3)
    e = sstep(0, att, t) * (1 - sstep(dur - rel, dur, t)); return out * e[:, None]


def taiko(size=1.0, seed=0):
    q = rnd(seed); n = ns(1.8); t = tv(n); f0 = 70 / size ** 0.3
    y = sweep(f0 * (1 + 0.55 * np.exp(-t / 0.012))) * np.exp(-t / (0.3 * size ** 0.5))
    y += 0.45 * np.sin(2 * np.pi * f0 * 1.58 * t) * np.exp(-t / 0.07)
    y += 0.35 * filt(q.standard_normal(n), 'bandpass', [200, 2500]) * np.exp(-t / 0.012)
    y += 0.12 * filt(q.standard_normal(n), 'bandpass', [2000, 7000]) * np.exp(-t / 0.004)
    return nrm(y) * np.minimum(1, t / 0.0008)


def shime(seed=0, g=1.0):
    """small tight high drum (shime-daiko) for the ostinato"""
    q = rnd(seed); n = ns(0.25); t = tv(n); f = 390 * q.uniform(0.97, 1.03)
    y = sweep(f * (1 + 0.25 * np.exp(-t / 0.004))) * np.exp(-t / 0.045) + 0.4 * np.sin(2 * np.pi * f * 1.6 * t) * np.exp(-t / 0.02)
    y += 0.8 * filt(q.standard_normal(n), 'bandpass', [1200, 7000]) * np.exp(-t / 0.005)
    return g * nrm(y) * np.minimum(1, t / 0.0005)


def bowl(f, dur=4.0, seed=0):
    """pure glass ripple tone: a sine and a slowly beating twin, a faint octave"""
    t = tv(ns(dur)); q = rnd(seed)
    y = np.sin(2 * np.pi * f * t) + 0.6 * np.sin(2 * np.pi * f * 1.0025 * t + 1.0) + 0.12 * np.sin(2 * np.pi * f * 2.005 * t)
    y += 0.05 * np.sin(2 * np.pi * f * 2.76 * t + q.uniform(0, 6)) * np.exp(-t / 0.5)
    return nrm(y) * np.minimum(1, t / 0.004) * np.exp(-t / (dur / 3.2)) * np.minimum(1, (dur - t) / 0.2)


def glass_ping(f, dur=2.5, seed=0, bright=1.0):
    """crystalline strike: inharmonic glass modes"""
    q = rnd(seed); t = tv(ns(dur))
    y = modal([(f, 1, dur / 3.5), (f * 2.32, 0.5 * bright, dur / 8), (f * 4.25, 0.3 * bright, dur / 16), (f * 6.8, 0.15 * bright, dur / 30),
               (f * 1.003, 0.4, dur / 3.0)], dur)
    y += 0.2 * bright * filt(noise(len(t), seed), 'highpass', 4000) * np.exp(-t / 0.002)
    return nrm(y) * np.minimum(1, t / 0.0005)


# ================================================================== ambience
def rain(dur, seed):
    """heavy rain: hiss, low downpour, dense drops on the wet street, plinks on metal eaves; stereo"""
    n = ns(dur); out = np.zeros((n, 2))
    KD = [burst(0.012, lo, hi, d, seed + 40 + i) for i, (lo, hi, d) in enumerate([(1500, 6000, 0.002), (3000, 10000, 0.0012), (800, 3000, 0.003), (2000, 8000, 0.0025)])]
    KP = [modal([(f, 1, 0.03), (f * 2.4, 0.4, 0.015)], 0.08) for f in (1900, 2600, 3300, 4100, 5200)]
    for c in range(2):
        q = rnd(seed + c)
        hiss = rmsn(filt(noise(n, seed + 2 + c), 'bandpass', [600, 9000])) * (1 + 0.15 * ctrl(dur, 3, seed + 10 + c))
        low = rmsn(filt(noise(n, seed + 20 + c), 'bandpass', [60, 400]))
        k = int(dur * 900); drops = scatter(n, q.uniform(0, dur, k), q.lognormal(0, 0.6, k) * q.choice([-1, 1], k), KD, q.integers(0, 4, k))
        k2 = int(dur * 7); pl = scatter(n, q.uniform(0, dur, k2), q.uniform(0.2, 1, k2), KP, q.integers(0, 5, k2))
        out[:, c] = 0.45 * hiss + 0.35 * low + 0.5 * rmsn(drops) + 0.25 * rmsn(pl)
    return out


def neon(dur, seed):
    """neon tube buzz (100 Hz spiky rectified mains) with sputters; stereo, slightly off-centre"""
    n = ns(dur); t = tv(n); q = rnd(seed)
    b = np.abs(np.sin(2 * np.pi * 50 * t)) ** 6; b = filt(b - b.mean(), 'bandpass', [180, 5000])
    whine = 0.15 * np.sin(2 * np.pi * 3150 * t) * (1 + 0.3 * ctrl(dur, 2, seed))
    g = np.ones(n)
    for _ in range(int(dur / 2.5)):
        a = q.uniform(0, dur - 0.3); L = q.uniform(0.08, 0.25); i0, i1 = ns(a), ns(a + L)
        g[i0:i1] *= np.where(q.random(i1 - i0) < 0.5, 0.15, 1.0)
    g = np.convolve(g, np.ones(96) / 96, 'same')
    y = rmsn(b) * g + whine
    return np.stack([y, 0.7 * y + 0.3 * rmsn(filt(noise(n, seed + 5), 'bandpass', [200, 2000])) * 0.05], 1)


def traffic(dur, seed):
    """distant traffic: low rumble + wet tyre hiss swells passing across; stereo"""
    n = ns(dur); t = tv(n); q = rnd(seed); out = np.zeros((n, 2))
    base = rmsn(filt(noise(n, seed), 'bandpass', [40, 300]))
    out += pan2(base * 0.6, 0.0)
    tt = q.uniform(-1, 1)
    while tt < dur + 1:
        w = q.uniform(1.0, 2.0); e = np.exp(-((t - tt) / w) ** 2); d = q.choice([-1, 1])
        hiss = filt(noise(n, seed * 1000 + int((tt + 2) * 100)), 'bandpass', [700, 4000]) * e
        out += pan2(rmsn(hiss + 1e-9) * e * 0.5, np.clip(d * (t - tt) / (2 * w), -0.9, 0.9))
        tt += q.uniform(1.8, 3.5)
    return filt(out, 'lowpass', 3500)


def wind(dur, seed, cold=1.0, gust=1.0):
    """wind: low body, mid rush, gusty high hiss, whistle on strong gusts (cold adds snow hiss); stereo"""
    n = ns(dur); out = np.zeros((n, 2)); g0 = ctrl(dur, 0.4, seed, 1.5)
    for c in range(2):
        g = np.clip(0.62 + 0.25 * gust * g0 + 0.15 * ctrl(dur, 0.6, seed + 20 + c, 0.8), 0.15, 1.2)
        lo = filt(noise(n, seed + 10 + c), 'bandpass', [70, 420]); mid = filt(noise(n, seed + 12 + c), 'bandpass', [480, 1500])
        hi = filt(noise(n, seed + 14 + c), 'bandpass', [2600, 9000]) * (0.45 + 0.55 * (0.5 + 0.5 * ctrl(dur, 1.6, seed + 30 + c, 0.25)) ** 2)
        whis = filt(noise(n, seed + 16 + c), 'bandpass', [880, 1050], 2) * sstep(0.75, 1.0, g)
        out[:, c] = lo * g + mid * g ** 2 * 0.45 + hi * (0.25 + g) * 0.32 * cold + whis * 0.5 * cold
    return out / np.sqrt(np.mean(out ** 2))


def bell(f=146.8, dur=8.0, seed=0):
    """far temple bell: inharmonic partials, slow beating hum"""
    q = rnd(seed); t = tv(ns(dur)); y = np.zeros_like(t)
    for r, a, d in ((0.5, 0.55, 6.0), (1.0, 1.0, 4.2), (1.19, 0.5, 2.8), (1.56, 0.32, 2.1), (2.0, 0.38, 1.7), (2.66, 0.18, 1.0), (3.01, 0.14, 0.8), (4.1, 0.07, 0.4)):
        y += a * np.sin(2 * np.pi * f * r * t + q.uniform(0, 6)) * (1 + 0.18 * np.sin(2 * np.pi * (0.6 + 0.3 * r) * t)) * np.exp(-t / d)
    y += 0.15 * filt(q.standard_normal(len(t)), 'bandpass', [300, 1800]) * np.exp(-t / 0.012)
    return nrm(filt(y, 'lowpass', 2600)) * np.minimum(1, t / 0.004)


# ================================================================== foley
def droplets(dur, k, seed, lo=900, hi=3200, t0=0.03):
    """k little water bloops scattered after an impact (denser early)"""
    q = rnd(seed); n = ns(dur); y = np.zeros(n)
    for i in range(k):
        a = t0 + (dur - 0.08) * q.random() ** 2; f = q.uniform(lo, hi); L = ns(0.03); tt = tv(L)
        b = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.6 * tt / 0.03)) / SR) * np.exp(-tt / 0.008)
        j = ns(a); y[j:j + L] += b[:n - j] * q.uniform(0.2, 1.0) * (1 - a / dur)
    return y


def rattle(k, span, seed, lo=1200, hi=5000):
    """k small armour-plate clinks decaying over `span` seconds"""
    q = rnd(seed); n = ns(span + 0.1); y = np.zeros(n)
    for i in range(k):
        a = span * (i / k) ** 1.3 + q.uniform(0, 0.012); f = q.uniform(lo, hi)
        c = modal([(f, 1, q.uniform(0.008, 0.03)), (f * q.uniform(2.1, 2.9), 0.5, 0.008)], 0.08)
        j = ns(a); L = min(len(c), n - j); y[j:j + L] += c[:L] * (1 - i / k) ** 1.5 * q.uniform(0.5, 1)
    return y


def sumi_step(seed, surface='wet', size=1.0):
    """heavy armoured footfall: sub thud, plate clank and rattles, a splash (wet street / mirror water)"""
    q = rnd(seed); n = ns(1.0); t = tv(n)
    y = sweep(44 / size ** 0.2 * (1 + 0.9 * np.exp(-t / 0.018))) * np.exp(-t / (0.2 * size)) + 0.5 * np.sin(2 * np.pi * 108 * t) * np.exp(-t / 0.05)
    y += 0.45 * filt(noise(n, seed), 'bandpass', [180, 2200]) * np.exp(-t / 0.025)
    y += 0.3 * modal([(q.uniform(650, 850), 1, 0.06), (q.uniform(1650, 2050), 0.6, 0.035), (q.uniform(3000, 3600), 0.35, 0.02)], 1.0)
    y += 0.25 * pad(rattle(9, 0.22, seed + 1), n)
    if surface in ('wet', 'mirror', 'splash'):
        k = {'wet': 1.0, 'mirror': 0.7, 'splash': 1.6}[surface]
        sp = filt(noise(n, seed + 2), 'bandpass', [450, 7000]) * np.exp(-t / (0.06 * k)) * np.minimum(1, t / 0.004)
        y += 0.55 * k * sp / 3 + 0.35 * k * droplets(1.0, int(14 * k), seed + 3)
    y = nrm(y) * np.minimum(1, t / 0.0008)
    return np.tanh(2.0 * y) / np.tanh(2.0)


def yuki_step(seed, surface='snow'):
    """light quick footfall: snow crunch / mirror tap / glass tick with sparks"""
    q = rnd(seed); n = ns(0.5); t = tv(n)
    y = 0.6 * np.sin(2 * np.pi * 95 * t) * np.exp(-t / 0.03) + 0.2 * modal([(q.uniform(2400, 2900), 1, 0.02), (q.uniform(5000, 5800), 0.5, 0.01)], 0.5)
    if surface == 'snow':
        K = [burst(0.006, 1500, 8000, 0.0015, seed + 10 + i) for i in range(4)]
        k = 40; tm = 0.11 * q.random(k) ** 1.6
        y += 0.9 * nrm(scatter(n, tm, q.uniform(0.3, 1, k), K, q.integers(0, 4, k)))
        y += 0.25 * filt(noise(n, seed + 3), 'bandpass', [1200, 2600]) * np.exp(-t / 0.03)
    elif surface == 'mirror':
        y += 0.35 * filt(noise(n, seed + 4), 'bandpass', [700, 7000]) * np.exp(-t / 0.035) / 3 + 0.25 * droplets(0.5, 6, seed + 5, 1400, 3800)
    elif surface == 'glass':
        y += 0.6 * glass_ping(q.uniform(2600, 3600), 0.5, seed + 6)[:n] + 0.5 * pad(sparks(0.35, seed + 7), n)
    return nrm(y) * np.minimum(1, t / 0.0006)


def breath(seed, steam=0.5, dur=0.55):
    """vapour puff: breathy exhale + vent steam hiss"""
    n = ns(dur); t = tv(n); u = t / dur
    e = sstep(0, 0.12, u) * (1 - u) ** 1.6
    y = rmsn(filt(noise(n, seed), 'bandpass', [450, 2300])) * e + steam * rmsn(filt(noise(n, seed + 1), 'bandpass', [2500, 9000])) * e * np.exp(-t / 0.12)
    return y


def snow_brush(seed, dur=0.6):
    """a hand brushing snow off stone: soft stroke + crumbs + a puff of falling snow"""
    n = ns(dur); t = tv(n); u = t / dur; q = rnd(seed)
    y = rmsn(filt(noise(n, seed), 'bandpass', [900, 6500])) * sstep(0, 0.25, u) * (1 - sstep(0.4, 1.0, u)) * (0.7 + 0.3 * ctrl(dur, 30, seed + 1))
    K = [burst(0.006, 1500, 7000, 0.0015, seed + 10 + i) for i in range(3)]; k = 30
    y += 0.8 * rmsn(scatter(n, 0.1 + 0.4 * q.random(k), q.uniform(0.2, 1, k), K, q.integers(0, 3, k))) * 0.3
    y += 0.5 * rmsn(filt(noise(n, seed + 2), 'lowpass', 350)) * np.exp(-((t - 0.32) / 0.08) ** 2)
    return y


def creak(seed, f=95, dur=0.5, rate=(18, 34), form=(350, 2200)):
    """armour creak: stick-slip harmonic squeal through a plate resonance"""
    n = ns(dur); u = np.linspace(0, 1, n); q = rnd(seed); fr = f * (1 + 0.18 * u + 0.05 * ctrl(dur, 12, seed))
    ph = 2 * np.pi * np.cumsum(fr) / SR; y = sum(np.sin(k * ph) / k for k in range(1, 24))
    y = filt(y, 'bandpass', list(form)); r = rate[0] + (rate[1] - rate[0]) * u
    am = (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(r) / SR)) ** 3
    y = rmsn(y * am) * np.sin(np.pi * u) ** 0.7
    y += 0.4 * pad(rattle(4, dur * 0.8, seed + 1, 900, 3000), n) * 3
    return y


def clank(seed):
    """metal plates shifting hard"""
    q = rnd(seed); n = ns(0.6)
    y = modal([(q.uniform(420, 520), 1, 0.08), (q.uniform(1100, 1300), 0.7, 0.05), (q.uniform(2300, 2700), 0.4, 0.03), (q.uniform(3900, 4300), 0.2, 0.015)], 0.6)
    y += 0.5 * pad(rattle(7, 0.15, seed + 1, 1500, 5000), n) + 0.4 * burst(0.6, 800, 6000, 0.004, seed + 2)
    return nrm(y) * np.minimum(1, tv(n) / 0.0005)


def glow(kind, dur=0.9, seed=0):
    """eye flare: red = low electric growl swell, cyan = high glassy chorus swell"""
    n = ns(dur); t = tv(n); u = t / dur; e = sstep(0, 0.25, u) * (1 - u) ** 1.5
    if kind == 'red':
        f = 55 * (1 + 0.04 * u); ph = 2 * np.pi * np.cumsum(f) / SR
        y = sum(np.sin(k * ph) / k for k in range(1, 40)); y = vfilt(y, 300 + 1600 * e, 'lowpass')
    else:
        y = sum(np.sin(2 * np.pi * NOTE(m) * (1 + 0.002 * j) * t + j) for j, m in enumerate((86, 93, 98)))
        y += 0.4 * filt(noise(n, seed), 'bandpass', [5000, 12000]) * e
    return rmsn(y) * e


def rev_shimmer(dur, seed, f0=1174.7, notes=None):
    """reversed glassy shimmer: a cluster of glass rings + its reverb, played backwards (swells into the end); stereo"""
    q = rnd(seed); n = ns(dur); t = tv(n); out = np.zeros((n, 2))
    rs = notes if notes is not None else [f0 * r for r in (1, 1.5, 2, 2.76, 3, 4, 5.4)]
    for c in range(2):
        y = sum(np.sin(2 * np.pi * f * q.uniform(0.997, 1.003) * t + q.uniform(0, 6)) * np.exp(-t / (dur * q.uniform(0.15, 0.35))) / (1 + i * 0.4) for i, f in enumerate(rs))
        y += 0.25 * filt(noise(n, seed + c), 'bandpass', [3000, 11000]) * np.exp(-t / (dur * 0.12))
        out[:, c] = y
    out = out + reverb(out, min(dur, 2.5), seed + 9, 7000) * 1.5
    out = out[::-1].copy()
    return out / (np.abs(out).max() + 1e-9)


def glass_drone(dur, seed, f=36.71):
    """deep glass drone of the giant: sub fundamental, octaves, slowly beating inharmonic glass partials; stereo"""
    n = ns(dur); t = tv(n); q = rnd(seed); out = np.zeros((n, 2))
    base = np.sin(2 * np.pi * f * t) + 0.7 * np.sin(2 * np.pi * 2 * f * 1.002 * t + 0.3) + 0.3 * np.sin(2 * np.pi * 3 * f * t + 1.0)
    for c in range(2):
        gl = sum(np.sin(2 * np.pi * f * r * (1 + 0.0015 * c) * t + q.uniform(0, 6)) * (0.55 + 0.45 * np.sin(2 * np.pi * q.uniform(0.15, 0.5) * t + q.uniform(0, 6))) / r ** 0.6
                 for r in (5.03, 7.1, 9.4, 12.2, 15.6, 21.3))
        out[:, c] = base + 0.45 * gl + 0.4 * rmsn(filt(noise(n, seed + c), 'lowpass', 90))
    return out / np.abs(out).max()


def tinkles(dur, seed, rate, band=(2500, 9000), notes=None, dec=(0.05, 0.4), env=None):
    """glass sparkles: random pings at `rate` per second (shaped by env(u)), random pans; notes = midi pool; stereo"""
    q = rnd(seed); n = ns(dur); k = int(rate * dur)
    tm = q.uniform(0, dur, k)
    if env is not None: tm = tm[q.random(k) < env(tm / dur)]
    k = len(tm); NK = 16
    fs = [NOTE(notes[i % len(notes)]) for i in range(NK)] if notes else list(np.exp(np.linspace(np.log(band[0]), np.log(band[1]), NK)))
    K = [glass_ping(f, q.uniform(*dec) * 3, seed + 100 + i, 0.7)[:ns(q.uniform(*dec) * 3)] for i, f in enumerate(fs)]
    w = q.integers(0, NK, k); a = q.uniform(0.2, 1, k) ** 2; p = q.uniform(-0.9, 0.9, k); ang = (p + 1) * np.pi / 4
    return np.stack([scatter(n, tm, a * np.cos(ang), K, w), scatter(n, tm, a * np.sin(ang), K, w)], 1)


def water_pour(dur, seed):
    """water pouring off the giant: low roar, gurgle bloops, spray hiss; stereo"""
    n = ns(dur); q = rnd(seed); out = np.zeros((n, 2))
    for c in range(2):
        roar = rmsn(filt(noise(n, seed + c), 'bandpass', [90, 1100])) * (1 + 0.3 * ctrl(dur, 4, seed + 5 + c))
        hiss = rmsn(filt(noise(n, seed + 10 + c), 'bandpass', [2000, 9000])) * (1 + 0.4 * ctrl(dur, 9, seed + 15 + c))
        k = int(dur * 120); tm = q.uniform(0, dur, k)
        K = []
        for i in range(8):
            L = ns(0.04); tt = tv(L); f = 250 + 110 * i
            K.append(np.sin(2 * np.pi * np.cumsum(f * (1 + 1.2 * tt / 0.04)) / SR) * np.exp(-tt / 0.012))
        gl = scatter(n, tm, q.uniform(0.2, 1, k), K, q.integers(0, 8, k))
        out[:, c] = 0.6 * roar + 0.35 * hiss + 0.45 * rmsn(gl)
    return out


def splash(size, seed, dur=None):
    """water splash: wash burst + droplets, big ones add a low slap"""
    dur = dur or 0.5 + 0.6 * size; n = ns(dur); t = tv(n)
    y = rmsn(filt(noise(n, seed), 'bandpass', [400, 7500])) * np.exp(-t / (0.05 + 0.08 * size)) * np.minimum(1, t / 0.003)
    y += 0.8 * size * np.sin(2 * np.pi * 70 * t) * np.exp(-t / 0.06) + 0.6 * rmsn(droplets(dur, int(10 + 25 * size), seed + 1) + 1e-9) * 0.4
    return nrm(y)


def whoosh(dur, f0, f1, seed, octw=1.2, shape=None):
    """swept band of noise; shape(u) is the amplitude curve (default: rise and fall)"""
    n = ns(dur); u = np.linspace(0, 1, n); fc = f0 * (f1 / f0) ** u
    y = vfilt(noise(n, seed), fc, 'bandpass', octw); e = shape(u) if shape else np.sin(np.pi * u) ** 1.5
    return nrm(y * e)


def shing(seed, size=1.0):
    """sword ring: bright metal modes + scrape (size > 1: longer, lower, wider)"""
    q = rnd(seed); dur = 1.8 * size; n = ns(dur); t = tv(n); s = size ** -0.25
    y = modal([(2960 * s, 1, 0.55 * size), (4447 * s, 0.6, 0.38 * size), (5925 * s, 0.45, 0.26 * size), (7410 * s, 0.3, 0.16 * size),
               (3725 * s, 0.4, 0.32 * size), (1480 * s, 0.35 * (size > 1), 0.5 * size)], dur) * (1 + 0.25 * np.sin(2 * np.pi * 9 * t))
    sc = filt(noise(n, seed), 'bandpass', [2500, 12000]) * np.exp(-t / (0.045 * size))
    return nrm(0.55 * nrm(y) + 0.75 * nrm(sc)) * np.minimum(1, t / 0.0006)


def crack(seed, size=1.0):
    """impact crack: snap + boom + grit, saturated"""
    q = rnd(seed); dur = 0.9 * size; n = ns(dur); t = tv(n)
    y = nrm(filt(noise(n, seed), 'bandpass', [700, 12000])) * np.exp(-t / 0.006)
    y += 0.5 * modal([(q.uniform(1400, 1800), 1, 0.02), (q.uniform(3100, 3500), 0.6, 0.012)], dur)
    y += 0.9 * sweep(62 / size ** 0.2 * (1 + 1.6 * np.exp(-t / 0.01))) * np.exp(-t / (0.2 * size)) + 0.35 * filt(noise(n, seed + 1), 'bandpass', [300, 3000]) * np.exp(-t / (0.05 * size))
    y = nrm(y) * np.minimum(1, t / 0.0004); return np.tanh(2.5 * y) / np.tanh(2.5)


def boom(dur, f0=60, f1=26, seed=0):
    """colossal sub boom: falling sine with a noisy body, saturated"""
    n = ns(dur); t = tv(n); u = t / dur
    y = sweep(f1 + (f0 - f1) * np.exp(-t / (dur * 0.25))) * np.exp(-t / (dur * 0.3))
    y += 0.3 * rmsn(filt(noise(n, seed), 'lowpass', 180)) * np.exp(-t / (dur * 0.2)) + 0.25 * filt(noise(n, seed + 1), 'bandpass', [200, 2000]) * np.exp(-t / 0.04)
    y = nrm(y) * np.minimum(1, t / 0.002); return np.tanh(1.8 * y) / np.tanh(1.8)


def roar(dur, seed):
    """the giant's voice: low detuned saws sliding through a moving throat formant + glass grinding; stereo"""
    n = ns(dur); t = tv(n); u = t / dur; q = rnd(seed)
    f = 46 * (1 + 0.15 * np.sin(np.pi * u) - 0.1 * u) * (1 + 0.02 * ctrl(dur, 6, seed))
    y = np.zeros(n)
    for d in (-0.15, 0.0, 0.12):
        ph = 2 * np.pi * np.cumsum(f * 2 ** (d / 12)) / SR; y += sum(np.sin(k * ph) / k for k in range(1, 60))
    y = vfilt(y, 260 + 500 * np.sin(np.pi * u) ** 2, 'bandpass', 1.4) + 0.35 * vfilt(y, 900 + 700 * np.sin(np.pi * u), 'bandpass', 0.8)
    y = rmsn(y); e = sstep(0, 0.15, u) * (1 - sstep(0.6, 1.0, u))
    st = np.stack([y, y], 1) * e[:, None] + 0.25 * tinkles(dur, seed + 1, 50, (700, 3000), dec=(0.03, 0.1)) * e[:, None] * 8
    return st


def flame(dur, seed, k=1.0):
    """roaring aura: lowpassed noise with a breathing cutoff, crackle, low rumble; stereo"""
    n = ns(dur); out = np.zeros((n, 2))
    for c in range(2):
        fc = 500 + 900 * k * (0.5 + 0.5 * ctrl(dur, 5, seed + c))
        y = vfilt(noise(n, seed + 10 + c), fc, 'lowpass')
        y = rmsn(y) + 0.5 * rmsn(filt(noise(n, seed + 20 + c), 'lowpass', 120)) + 0.25 * rmsn(vfilt(noise(n, seed + 30 + c), fc * 2.5, 'bandpass', 1.0))
        out[:, c] = y
    return out / np.sqrt(np.mean(out ** 2)) + 0.4 * embers(dur, seed + 40, 25)


def embers(dur, seed, rate=40):
    """fire crackle: sharp broadband ticks and pops; stereo"""
    q = rnd(seed); n = ns(dur); k = int(rate * dur); tm = q.uniform(0, dur, k)
    K = [burst(0.004, 1000, 9000, 0.0008, seed + 1), burst(0.01, 400, 4000, 0.002, seed + 2), burst(0.003, 3000, 12000, 0.0005, seed + 3)]
    w = q.integers(0, 3, k); a = q.lognormal(0, 0.7, k) * q.choice([-1, 1], k); p = q.uniform(-0.8, 0.8, k); ang = (p + 1) * np.pi / 4
    y = np.stack([scatter(n, tm, a * np.cos(ang), K, w), scatter(n, tm, a * np.sin(ang), K, w)], 1)
    return y / (np.abs(y).max() + 1e-9)


def sparks(dur, seed):
    """metal-on-glass skitter: dense tiny high pings + scrape"""
    q = rnd(seed); n = ns(dur); t = tv(n); k = int(dur * 220); tm = dur * q.random(k) ** 1.5
    K = [modal([(f, 1, 0.006), (f * 1.7, 0.5, 0.004)], 0.03) for f in (4200, 5600, 7100, 8800)]
    y = scatter(n, tm, q.uniform(0.2, 1, k), K, q.integers(0, 4, k)) + 0.4 * rmsn(filt(noise(n, seed), 'bandpass', [3000, 9000])) * np.exp(-t / 0.08) * 0.2
    return nrm(y)


def white_flash(dur, seed, hp=900):
    """the sound of a white impact frame: flat wide noise, cut clean; stereo"""
    n = ns(dur); t = tv(n); y = filt(noise(n, seed, 2), 'highpass', hp)
    return y / np.abs(y).max() * (np.minimum(1, t / 0.002) * np.minimum(1, (dur - t) / 0.012))[:, None]


def sheath_slide(dur, seed):
    """steel sliding into a lacquered scabbard: friction scrape + a faint descending ring"""
    n = ns(dur); t = tv(n); u = t / dur
    y = rmsn(filt(noise(n, seed), 'bandpass', [1800, 7500])) * (0.6 + 0.4 * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(30 + 30 * u) / SR)) ** 2)
    y += 0.5 * sweep(3300 * (1 - 0.08 * u)) * (0.4 + 0.6 * u)
    return y * sstep(0, 0.1, u) * (1 - sstep(0.85, 1.0, u))


def click(seed):
    """the sheathe click: habaki seats, tsuba meets the saya mouth; crisp metal + a wooden knock"""
    q = rnd(seed); n = ns(0.5); t = tv(n); y = np.zeros(n)
    for o, g in ((0.0, 0.45), (0.011, 1.0)):
        c = modal([(3150, 1, 0.014), (5070, 0.6, 0.009), (7900, 0.35, 0.005), (1180, 0.5, 0.03), (390, 0.6, 0.025)], 0.5 - o)
        c += 0.6 * burst(0.5 - o, 2000, 12000, 0.0008, seed + int(o * 1000))
        y[ns(o):] += g * c
    return nrm(y) * np.minimum(1, t / 0.0003)


def rustle(dur, seed):
    """cloth and lacing moving, with a few soft plate touches"""
    n = ns(dur); u = np.linspace(0, 1, n)
    y = rmsn(filt(noise(n, seed), 'bandpass', [700, 6000])) * (0.4 + 0.6 * np.clip(ctrl(dur, 25, seed + 1), 0, 1) ** 2) * np.sin(np.pi * u) ** 0.8
    return y + 1.5 * pad(rattle(4, dur * 0.7, seed + 2, 1000, 3500), n)


def drop_bloop(seed):
    """a single drop meeting still water"""
    n = ns(0.08); t = tv(n)
    return sweep(900 * (1 + 1.6 * t / 0.012)) * np.exp(-t / 0.012) * np.minimum(1, t / 0.0004) + 0.3 * burst(0.08, 2000, 9000, 0.0015, seed)


def glass_tear(dur, seed):
    """cracks racing outward: micro-fractures whose pans spread from the centre to both edges, density rising,
    a tearing hiss that widens, a low groan; stereo"""
    q = rnd(seed); n = ns(dur); t = tv(n); u = t / dur; k = int(dur * 300)
    tm = dur * q.random(k) ** 0.75; uk = tm / dur
    p = q.choice([-1, 1], k) * np.clip(0.05 + 0.95 * uk ** 0.6 + q.normal(0, 0.07, k), 0, 1); ang = (p + 1) * np.pi / 4
    K = [modal([(f, 1, 0.012), (f * 2.3, 0.5, 0.006), (f * 3.9, 0.25, 0.003)], 0.06) + 0.3 * burst(0.06, 2000, 11000, 0.001, seed + i)
         for i, f in enumerate(np.geomspace(1300, 6500, 10))]
    w = q.integers(0, 10, k); a = q.uniform(0.3, 1, k) * (0.35 + 0.65 * uk)
    out = np.stack([scatter(n, tm, a * np.cos(ang), K, w), scatter(n, tm, a * np.sin(ang), K, w)], 1); out /= np.abs(out).max() + 1e-9
    m = rmsn(filt(noise(n, seed + 1), 'bandpass', [1200, 9000])); s_ = rmsn(filt(noise(n, seed + 2), 'bandpass', [1200, 9000]))
    tear = np.stack([m * (1 - u) + s_ * u, m * (1 - u) - s_ * u], 1) * (0.3 + 0.7 * u)[:, None] * (0.7 + 0.3 * ctrl(dur, 20, seed + 3))[:, None]
    groan = rmsn(filt(noise(n, seed + 4), 'bandpass', [35, 160])) * sstep(0, 0.4, u)
    return out + 0.08 * tear + 0.12 * np.stack([groan, groan], 1)
