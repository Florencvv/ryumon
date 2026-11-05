"""dsp.py - sample-level building blocks for the RYUMON score (numpy + scipy only, no samples).

Everything works on float64 arrays at 48 kHz. Mono signals are 1-D, stereo signals are (n, 2).
"""
import wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
FPS = 24
LAT = 1 / FPS            # hits peak one picture frame after their event


def rnd(seed): return np.random.default_rng(seed)
def ns(d): return int(round(d * SR))
def tv(n): return np.arange(n) / SR
def clamp(x, a=0.0, b=1.0): return np.minimum(b, np.maximum(a, x))
def NOTE(m): return 440.0 * 2 ** ((m - 69) / 12)
def nrm(y): return y / (np.abs(y).max() + 1e-12)
def db(v): return 20 * np.log10(np.abs(v) + 1e-12)


def sstep(a, b, x):
    """smoothstep from a to b (works for a > b too)"""
    t = clamp((np.asarray(x, float) - a) / (b - a))
    return t * t * (3 - 2 * t)


def bump(u):
    """sin hump over u in 0..1"""
    return np.sin(np.pi * clamp(u))


def filt(x, kind, f, o=2):
    if kind == 'bandpass': f = [max(10.0, f[0]), min(f[1], SR * 0.47)]
    elif kind in ('lowpass', 'highpass'): f = min(f, SR * 0.47)
    return sosfilt(butter(o, f, btype=kind, fs=SR, output='sos'), x, axis=0)


def noise(n, seed, ch=None):
    return rnd(seed).standard_normal(n if ch is None else (n, ch))


def bpn(n, lo, hi, seed, o=2): return filt(noise(n, seed), 'bandpass', [lo, hi], o)


def sweep(f):
    """phase-continuous sine for a per-sample frequency array"""
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def modal(modes, dur):
    """sum of decaying sines: modes = [(freq, amp, decay_s), ...]"""
    t = tv(ns(dur)); y = np.zeros_like(t)
    for f, a, d in modes:
        if f < SR * 0.45: y += a * np.sin(2 * np.pi * f * t) * np.exp(-t / d)
    return y


def burst(dur, lo, hi, dec, seed, o=2):
    n = ns(dur); return filt(noise(n, seed), 'bandpass', [lo, hi], o) * np.exp(-tv(n) / dec)


def ctrl(dur, rate, seed, sm=1.0):
    """smooth random control signal (about -1..1) changing at `rate` Hz"""
    q = rnd(seed); w = np.hanning(max(3, int(rate * sm))); k = max(int(dur * rate) + 4, len(w) + 2)
    c = np.convolve(q.standard_normal(k), w / w.sum(), 'same'); c /= np.abs(c).max() + 1e-9
    return np.interp(tv(ns(dur)) * rate, np.arange(k), c)


def pan2(x, p):
    """equal-power pan, p in -1..1 (scalar or per-sample array)"""
    a = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1) * 1.414


def fade(x, a=0.002, b=0.005):
    n = len(x); na, nb = min(n, ns(a)), min(n, ns(b))
    sh = (lambda v: v[:, None]) if x.ndim > 1 else (lambda v: v)
    if na: x[:na] *= sh(np.linspace(0, 1, na))
    if nb: x[-nb:] *= sh(np.linspace(1, 0, nb))
    return x


def vfilt(x, fc, kind='bandpass', octw=1.0, block=128):
    """time-varying 2nd-order filter: fc is a per-sample cutoff/centre array (state carried across blocks)"""
    y = np.empty_like(x); zi = np.zeros((1, 2))
    for i in range(0, len(x), block):
        f = float(np.clip(fc[min(i + block // 2, len(fc) - 1)], 25, SR * 0.44))
        if kind == 'bandpass':
            lo, hi = f * 2 ** (-octw / 2), min(f * 2 ** (octw / 2), SR * 0.46)
            sos = butter(1, [lo, hi], btype='bandpass', fs=SR, output='sos')
        else:
            sos = butter(2, f, btype=kind, fs=SR, output='sos')
        y[i:i + block], zi = sosfilt(sos, x[i:i + block], zi=zi)
    return y


def scatter(n, times, amps, kernels, which):
    """place short kernels at sample times (vectorised): sum_k fftconvolve(impulses_k, kernel_k)"""
    out = np.zeros(n)
    times = np.asarray(times); amps = np.asarray(amps); which = np.asarray(which)
    for k, ker in enumerate(kernels):
        m = which == k
        if not m.any(): continue
        imp = np.zeros(n); idx = np.clip((times[m] * SR).astype(int), 0, n - 1)
        np.add.at(imp, idx, amps[m]); out += fftconvolve(imp, ker)[:n]
    return out


def reverb(x, dur, seed, tone=5000, pre=0.012, width=1.0):
    """noise-tail stereo reverb (exponential decay, lowpassed), returns wet only, same length as x"""
    q = rnd(seed); n = ns(dur); t = tv(n)
    ir = np.stack([filt(q.standard_normal(n), 'lowpass', tone) * np.exp(-t / (dur / 6.5)) * np.minimum(1, t / pre)
                   for _ in range(2)], 1)
    if width < 1: m = ir.mean(1, keepdims=True); ir = m + (ir - m) * width
    ir /= np.sqrt((ir ** 2).sum(0))
    if x.ndim == 1: x = np.stack([x, x], 1)
    return np.stack([fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1)


class Bus:
    """a stereo track of fixed length; add() places a clip at a time with gain and pan"""
    def __init__(s, n): s.b = np.zeros((n, 2))

    def add(s, sig, t, g=1.0, p=0.0, edge=(0.0003, 0.005)):
        sig = np.array(sig, float)
        if edge: sig = fade(sig, *edge)
        if sig.ndim == 1: sig = pan2(sig, p)
        N = len(s.b); i0 = int(round(t * SR)); k0 = max(0, -i0); k1 = min(len(sig), N - i0)
        if k1 > k0: s.b[i0 + k0:i0 + k1] += sig[k0:k1] * g


def onset(sig, win=0.06):
    """seconds from clip start to its attack peak: where the 0.5 ms envelope first reaches 90 % of its first-60 ms maximum"""
    a = np.abs(sig) if sig.ndim == 1 else np.abs(sig).max(1)
    a = np.convolve(a, np.ones(24) / 24, 'same')[:ns(win)]
    return int(np.argmax(a >= 0.9 * a.max())) / SR


# ------------------------------------------------------------------ 24-bit stereo wav io
def read_wav(p):
    w = wave.open(str(p)); n = w.getnframes(); sw = w.getsampwidth(); raw = w.readframes(n); w.close()
    assert sw == 3, 'expects 24-bit'
    b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
    v = b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16)
    v = np.where(v >= 2 ** 23, v - 2 ** 24, v) / 8388607.0
    return v.reshape(-1, 2)


def write_wav(p, x):
    v = np.round(np.clip(x, -1, 1) * 8388607).astype(np.int32).reshape(-1); v = np.where(v < 0, v + 2 ** 24, v).astype(np.uint32)
    w = wave.open(str(p), 'wb'); w.setnchannels(2); w.setsampwidth(3); w.setframerate(SR)
    w.writeframes(np.stack([v & 255, (v >> 8) & 255, (v >> 16) & 255], 1).astype(np.uint8).tobytes()); w.close()
