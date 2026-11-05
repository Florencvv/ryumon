"""voices.py - the RYUMON-specific voices, on top of the shared instruments.py kit.

Music box tine, warm pad, birdsong, trickle/stream, bubbles, bamboo knocks, canal lapping, heron call, cat chirp,
thunder, heartbeat, wing flap, storm bed, waterfall roar, rapids, the dragon's roar.
"""
from instruments import *


def music_box(m, dur=2.2, seed=0):
    """music-box tine: pure fundamental, inharmonic tine partials that die fast, tiny click"""
    f = NOTE(m); t = tv(ns(dur))
    y = modal([(f, 1, dur / 3.0), (f * 1.002, 0.3, dur / 3.4), (f * 3.0, 0.25, dur / 14), (f * 5.4, 0.12, dur / 30), (f * 8.9, 0.06, dur / 60)], dur)
    y += 0.08 * burst(dur, 4000, 12000, 0.0008, seed)
    return nrm(y) * np.minimum(1, t / 0.0006) * np.minimum(1, (dur - t) / 0.05)


def pad_warm(ms, dur, att=0.8, rel=1.0, seed=0, lp=2200):
    """soft warm pad: strings, lowpassed + a slow-beating sine bed; stereo"""
    t = tv(ns(dur)); s_ = strings(ms, dur, att, rel, seed, lp)
    bed = sum(np.sin(2 * np.pi * NOTE(m) * t * (1 + 0.001 * i)) for i, m in enumerate(ms)) / len(ms)
    e = sstep(0, att, t) * (1 - sstep(dur - rel, dur, t))
    return s_ / (np.abs(s_).max() + 1e-9) + 0.25 * np.stack([bed * e, bed * e], 1)


def bird(seed):
    """one songbird phrase: 2-6 quick FM chirps"""
    q = rnd(seed); k = q.integers(2, 7); f0 = q.uniform(2600, 4800); out = []
    for i in range(k):
        d = q.uniform(0.04, 0.11); n = ns(d); u = np.linspace(0, 1, n)
        f = f0 * (1 + q.uniform(-0.25, 0.35) * u) * (1 + 0.04 * np.sin(2 * np.pi * q.uniform(40, 90) * u * d))
        out.append(sweep(f) * np.sin(np.pi * u) ** 1.5); out.append(np.zeros(ns(q.uniform(0.02, 0.08))))
    return np.concatenate(out)


def birds(dur, seed, rate=1.2):
    """scattered birdsong across the stereo field; stereo"""
    q = rnd(seed); n = ns(dur); out = np.zeros((n, 2)); tt = q.uniform(0, 0.6)
    while tt < dur:
        b = bird(seed * 100 + int(tt * 37)); j = ns(tt); L = min(len(b), n - j)
        out[j:j + L] += pan2(b[:L], q.uniform(-0.85, 0.85)) * q.uniform(0.3, 1.0)
        tt += q.exponential(1 / rate)
    return out


def trickle(dur, seed, f=(900, 2600), rate=90):
    """small stream / spout trickle: bright bubbly bloops + soft splash hiss; stereo"""
    q = rnd(seed); n = ns(dur); out = np.zeros((n, 2)); K = []
    for i in range(10):
        L = ns(0.03); tt = tv(L); fi = f[0] * (f[1] / f[0]) ** (i / 9)
        K.append(np.sin(2 * np.pi * np.cumsum(fi * (1 + 0.9 * tt / 0.03)) / SR) * np.exp(-tt / 0.007))
    for c in range(2):
        k = int(dur * rate); gl = scatter(n, q.uniform(0, dur, k), q.uniform(0.15, 1, k), K, q.integers(0, 10, k))
        hs = rmsn(filt(noise(n, seed + 5 + c), 'bandpass', [1500, 8000])) * (1 + 0.3 * ctrl(dur, 6, seed + 9 + c))
        out[:, c] = 0.7 * rmsn(gl + 1e-9) + 0.35 * hs
    return out


def bubbles(dur, seed, rate=12, lo=180, hi=700):
    """underwater bubbles: rising low bloops; stereo"""
    q = rnd(seed); n = ns(dur); k = max(1, int(rate * dur)); K = []
    for i in range(8):
        L = ns(0.07); tt = tv(L); fi = lo * (hi / lo) ** (i / 7)
        K.append(np.sin(2 * np.pi * np.cumsum(fi * (1 + 1.4 * tt / 0.07)) / SR) * np.exp(-tt / 0.02) * np.minimum(1, tt / 0.002))
    tm = q.uniform(0, dur, k); w = q.integers(0, 8, k); a = q.uniform(0.3, 1, k); p = q.uniform(-0.7, 0.7, k); ang = (p + 1) * np.pi / 4
    return np.stack([scatter(n, tm, a * np.cos(ang), K, w), scatter(n, tm, a * np.sin(ang), K, w)], 1)


def wood_knock(seed, f=None, hollow=1.0):
    """hollow bamboo culm / wooden knock"""
    q = rnd(seed); f = f or q.uniform(380, 720); n = ns(0.35)
    y = modal([(f, 1, 0.05 * hollow), (f * 2.57, 0.45, 0.02), (f * 4.1, 0.2, 0.01), (f * 0.5, 0.3 * hollow, 0.06)], 0.35)
    y += 0.4 * burst(0.35, 800, 6000, 0.002, seed + 1)
    return nrm(y) * np.minimum(1, tv(n) / 0.0004)


def lapping(dur, seed):
    """canal water lapping stone walls: slow soft swells + gentle gurgles; stereo"""
    q = rnd(seed); n = ns(dur); t = tv(n); out = np.zeros((n, 2)); tr = trickle(dur, seed + 10, (300, 1100), 18)
    for c in range(2):
        sw = 0.5 + 0.5 * np.sin(2 * np.pi * (0.45 + 0.05 * c) * t + q.uniform(0, 6)) * (0.7 + 0.3 * ctrl(dur, 0.8, seed + c))
        body = rmsn(filt(noise(n, seed + 2 + c), 'bandpass', [150, 1400])) * sw ** 2
        out[:, c] = 0.6 * body + 0.4 * tr[:, c]
    return out


def heron_call(seed, dur=0.55):
    """grey heron: a harsh croaking 'fraank' - raspy buzzing tone, pitch falling, rough AM"""
    n = ns(dur); t = tv(n); u = t / dur
    f = 420 * (1 + 0.25 * np.exp(-t / 0.05) - 0.25 * u)
    ph = 2 * np.pi * np.cumsum(f) / SR; y = sum(np.sin(k * ph) / k ** 0.8 for k in range(1, 30))
    y = y * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 78 * t)))
    y = filt(y, 'bandpass', [600, 4200]) + 0.35 * rmsn(filt(noise(n, seed), 'bandpass', [1200, 5000]))
    return nrm(y) * sstep(0, 0.03, u) * (1 - sstep(0.6, 1.0, u)) ** 0.7


def cat_chirp(seed, dur=0.42, up=1.0):
    """'mrrp?!' - a trilled rising synth chirp with a nasal formant"""
    n = ns(dur); t = tv(n); u = t / dur
    f = 520 * 2 ** ((5 * u ** 1.6 - 0.5 * np.sin(np.pi * u)) * up * 1.4 / 12)
    ph = 2 * np.pi * np.cumsum(f) / SR; y = sum(np.sin(k * ph) / k for k in range(1, 18))
    y = filt(y, 'bandpass', [700, 3500]) * (0.65 + 0.35 * np.sin(2 * np.pi * 26 * t))
    return nrm(y) * sstep(0, 0.06, u) * (1 - sstep(0.75, 1.0, u))


def thunder(dur, seed, near=1.0):
    """thunder: (near) crack + long rolling rumble with random bursts; stereo"""
    q = rnd(seed); n = ns(dur); t = tv(n); out = np.zeros((n, 2))
    for c in range(2):
        g = np.zeros(n); tt = 0.0
        while tt < dur * 0.8:
            g += q.uniform(0.3, 1.0) * np.exp(-np.maximum(0, t - tt) / q.uniform(0.15, 0.6)) * (t >= tt); tt += q.exponential(0.25)
        rum = rmsn(filt(noise(n, seed + c), 'lowpass', 260 + 300 * near)) * (0.4 + g / (g.max() + 1e-9))
        out[:, c] = rum * np.exp(-t / (dur * 0.45)) * np.minimum(1, t / (0.002 if near > 0.6 else 0.15))
    out = out / np.abs(out).max()
    if near > 0.3:
        cr = crack(seed + 7, 1.0 + near) * near; L = min(len(cr), n); out[:L] += np.stack([cr[:L], cr[:L]], 1)
    return out / np.abs(out).max()


def heartbeat(seed, g2=0.7):
    """lub-dub: two soft low thumps"""
    n = ns(0.6); t = tv(n); y = np.zeros(n)
    for o, a in ((0.0, 1.0), (0.17, g2)):
        tt = np.maximum(0, t - o); y += a * sweep(52 * (1 + 0.5 * np.exp(-tt / 0.02))) * np.exp(-tt / 0.07) * (t >= o)
    return nrm(filt(y, 'lowpass', 300)) * np.minimum(1, t / 0.001)


def flap(seed, size=1.0):
    """big wing flap: a soft whoomp of air + feather rustle"""
    n = ns(0.3); t = tv(n); u = t / 0.3
    y = rmsn(filt(noise(n, seed), 'bandpass', [120, 900])) * np.sin(np.pi * u) ** 2
    y += 0.3 * rmsn(filt(noise(n, seed + 1), 'bandpass', [2000, 7000])) * np.exp(-((u - 0.4) / 0.2) ** 2)
    return nrm(y) * size


def storm(dur, seed, k=1.0):
    """storm bed: strong gusty wind, low rumble, rain hiss; stereo"""
    n = ns(dur); w = wind(dur, seed, cold=0.5, gust=1.6 * k)
    r = rmsn(filt(noise(n, seed + 50, 2), 'lowpass', 120)) * 0.6
    h = rmsn(filt(noise(n, seed + 60, 2), 'bandpass', [1500, 9000])) * 0.35
    return w + r + h


def falls_roar(dur, seed):
    """colossal waterfall: deep sub churn, mid thunderous wash, spray hiss, slow surges; stereo"""
    n = ns(dur); out = np.zeros((n, 2))
    for c in range(2):
        surge = 1 + 0.25 * ctrl(dur, 0.7, seed + c) + 0.1 * ctrl(dur, 6, seed + 3 + c)
        sub = rmsn(filt(noise(n, seed + 10 + c), 'bandpass', [22, 110], 2))
        mid = rmsn(filt(noise(n, seed + 20 + c), 'bandpass', [110, 900]))
        hi = rmsn(filt(noise(n, seed + 30 + c), 'bandpass', [1500, 8000])) * (1 + 0.3 * ctrl(dur, 10, seed + 40 + c))
        out[:, c] = (0.9 * sub + 0.75 * mid + 0.22 * hi) * surge
    return out / np.sqrt(np.mean(out ** 2))


def rapids(dur, seed):
    """white-water rapids: churning mid roar, gurgles, spray; stereo"""
    return water_pour(dur, seed) + 0.3 * trickle(dur, seed + 70, (500, 1800), 140)


def dragon_roar(dur, seed, horn=1.0):
    """the dragon's roar: layered growl (sub saws through a throat formant, rasp AM) + a rising horn-like tone; stereo"""
    n = ns(dur); t = tv(n); u = t / dur
    gr = roar(dur, seed)
    f = 68 * (1 + 0.25 * np.sin(np.pi * u)); ph = 2 * np.pi * np.cumsum(f) / SR
    rasp = sum(np.sin(k * ph) / k for k in range(1, 50)) * (0.6 + 0.4 * np.sin(2 * np.pi * 31 * t))
    rasp = rmsn(vfilt(rasp, 500 + 900 * np.sin(np.pi * u), 'bandpass', 1.2))
    fh = NOTE(50) * 2 ** (7 * sstep(0, 0.7, u) / 12)                           # horn rises a fifth (D3 -> A3)
    phh = 2 * np.pi * np.cumsum(fh * (1 + 0.006 * np.sin(2 * np.pi * 5 * t))) / SR; fc = 600 + 1800 * sstep(0, 0.5, u)
    hn = sum(np.sin(k * phh) / k / np.sqrt(1 + (k * fh / fc) ** 4) for k in range(1, 20))
    hn = rmsn(hn) * sstep(0.05, 0.4, u)
    e = sstep(0, 0.06, u) * (1 - sstep(0.7, 1.0, u))
    y = (rmsn(gr.mean(1)) * 0.8 + 0.6 * rasp + 0.55 * horn * hn) * e
    return np.stack([y, y], 1) + 0.15 * gr * e[:, None]
