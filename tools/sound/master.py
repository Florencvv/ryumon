"""master.py - loudness + true-peak mastering: gain to -14 LUFS, 4x-oversampled lookahead peak limiter, re-measure, repeat.

    python tools/sound/master.py IN.wav OUT.wav      (or import master())
Loudness and true peak are measured with ffmpeg's ebur128 filter (BS.1770).
"""
import re, subprocess, sys
import numpy as np
from numpy.fft import rfft, irfft
from numpy.lib.stride_tricks import sliding_window_view
from dsp import SR, read_wav, write_wav


def ffmpeg():
    """ffmpeg from the FFMPEG env var, else PATH, else the imageio-ffmpeg wheel if it is installed"""
    import os, shutil
    ff = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if ff: return ff
    try:
        import imageio_ffmpeg; return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return 'ffmpeg'


def measure(path, framelog=False):
    """-> dict(I, TP, LRA[, M: {t: momentary LUFS}])"""
    af = 'ebur128=peak=true' + (':framelog=info' if framelog else '')
    o = subprocess.run([ffmpeg(), '-hide_banner', '-nostats', '-i', str(path), '-af', af, '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = o[o.rfind('Summary'):]
    r = dict(I=float(re.search(r'I:\s+(-?[\d.]+)', s).group(1)), TP=float(re.search(r'Peak:\s+(-?[\d.]+)', s).group(1)),
             LRA=float(re.search(r'LRA:\s+(-?[\d.]+)', s).group(1)))
    if framelog:
        r['M'] = {}
        for l in o.splitlines():
            m = re.search(r't:\s*([\d.]+).*M:\s*(-?[\d.]+)', l)
            if m: r['M'][round(float(m.group(1)), 1)] = float(m.group(2))
    return r


def true_peak_env(y):
    """per-sample max |x| over a 4x band-limited upsample (both channels)"""
    n = len(y); up = irfft(rfft(y, axis=0), n * 4, axis=0) * 4
    return np.abs(up).reshape(n, 4, 2).max(axis=(1, 2))


def limit(y, ceiling_db=-2.7, look=0.004, rel=0.06, passes=3):
    ceil = 10 ** (ceiling_db / 20); la = int(look * SR); a = np.exp(-1 / (rel * SR))
    for _ in range(passes):
        need = np.minimum(1.0, ceil / np.maximum(true_peak_env(y), 1e-9))
        mn = sliding_window_view(np.concatenate([need, np.ones(la)]), la + 1).min(axis=1)[:len(need)]
        g = np.empty_like(mn); cur = 1.0; gmin = 1.0 if _ == 0 else gmin
        for i, v in enumerate(mn.tolist()):
            cur = v if v < cur else v + (cur - v) * a; g[i] = cur
        y = y * g[:, None]; gmin = min(gmin, float(g.min()))
    return y, -20 * np.log10(gmin)


def master(src, dst, target=-14.0, tol=0.1, ceiling_db=-2.7):
    x = read_wav(src); I0 = measure(src)['I']; tgt = target
    for k in range(6):
        y, gr = limit(x * 10 ** ((tgt - I0) / 20), ceiling_db)
        write_wav(dst, y); m = measure(dst)
        print(f'  master pass {k}: pre-gain {tgt - I0:+.2f} dB, max limiting {gr:.1f} dB -> I {m["I"]} LUFS, TP {m["TP"]} dBTP')
        if abs(m['I'] - target) <= tol: break
        tgt += target - m['I']
    return m


if __name__ == '__main__':
    master(sys.argv[1], sys.argv[2])
