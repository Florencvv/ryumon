"""RYUMON score - build the whole soundtrack from code (numpy synthesis, no samples).

    python tools/sound/build.py [--out DIR] [--diag]

Reads the picture timing from src/shots.js (shots, sets, CUES, 24 fps, 88 s) and tools/sound/events.json
(animated events from the direction departments), composes every layer (score.py, voices in instruments.py +
voices.py), mixes, masters to -14 LUFS / true peak <= -2 dBTP (master.py) and verifies the result by numbers (check.py).

Output (default DIR = out/audio in the repo):  mix.wav  (48 kHz, 24-bit stereo, exactly 88.0 s)  and  mix_raw.wav
Needs: Python 3.11+, numpy, scipy, ffmpeg (FFMPEG env var or on PATH). Takes about a minute and a half.
"""
import argparse, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from dsp import write_wav
from score import Score, load_timeline, REPO
from master import master
from check import check


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--out', default=os.path.join(REPO, 'out', 'audio'))
    ap.add_argument('--diag', action='store_true', help='print per-shot stem levels')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); t0 = time.time()
    tl = load_timeline()
    print(f'timeline: {len(tl["shots"])} shots, {len(tl["cues"])} cues, {len(tl["events"])} events, {tl["duration"]} s @ {tl["fps"]} fps')
    sc = Score(tl).compose(); print(f'composed in {time.time() - t0:.0f} s')
    mix = sc.mix(a.diag); mix = mix / (np.abs(mix).max() + 1e-12) * 0.5
    raw, out = os.path.join(a.out, 'mix_raw.wav'), os.path.join(a.out, 'mix.wav')
    write_wav(raw, mix); print('mastering ->', out); master(raw, out)
    print('check:'); ok, res = check(out, sc.hits, sc.silence)
    print(f'done in {time.time() - t0:.0f} s:', res)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
