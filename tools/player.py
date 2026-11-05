# python tools/player.py [VIDEO=out/ryumon.mp4] [--out dist/ryumon.html] [--mb 29]
#   lite encode of the final film (1920x1040 H.264 High, 2-pass at the bitrate that keeps the page under --mb MB,
#   AAC 128k, faststart) -> out/ryumon_lite.mp4, embedded as base64 into tools/player_template.html -> one offline HTML
import argparse, base64, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import FF, ROOT

ap = argparse.ArgumentParser()
ap.add_argument('video', nargs='?', default=os.path.join(ROOT, 'out', 'ryumon.mp4'))
ap.add_argument('--out', default=os.path.join(ROOT, 'dist', 'ryumon.html'))
ap.add_argument('--mb', type=float, default=29.0, help='page size budget in MB (base64 adds 1/3)')
ap.add_argument('--audio-kbps', type=int, default=128)
a = ap.parse_args()

probe = subprocess.run([FF, '-hide_banner', '-i', a.video], capture_output=True, text=True).stderr
h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe).groups()
dur = int(h) * 3600 + int(m) * 60 + float(s)
budget_bits = a.mb * 1e6 * 0.75 * 0.97 * 8                      # bytes of MP4 that fit after base64, 3 % container headroom
vk = int(budget_bits / dur / 1000) - a.audio_kbps
print(f'{dur:.2f} s -> video {vk} kb/s + audio {a.audio_kbps} kb/s')

out_dir = os.path.join(ROOT, 'out'); os.makedirs(out_dir, exist_ok=True)
lite, log = os.path.join(out_dir, 'ryumon_lite.mp4'), os.path.join(out_dir, 'x264_2pass')
x264 = ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-b:v', f'{vk}k', '-maxrate', f'{vk * 2}k', '-bufsize', f'{vk * 4}k',
        '-pix_fmt', 'yuv420p', '-r', '24', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        '-vf', 'scale=1920:1040:flags=lanczos', '-passlogfile', log]
base = [FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', a.video]
subprocess.run(base + x264 + ['-pass', '1', '-an', '-f', 'mp4', os.devnull], check=True)
subprocess.run(base + x264 + ['-pass', '2', '-c:a', 'aac', '-b:a', f'{a.audio_kbps}k', '-ar', '48000', '-movflags', '+faststart', lite], check=True)
for f in os.listdir(out_dir):
    if f.startswith('x264_2pass'): os.remove(os.path.join(out_dir, f))

tpl = open(os.path.join(ROOT, 'tools', 'player_template.html'), encoding='utf-8').read()
b64 = base64.b64encode(open(lite, 'rb').read()).decode('ascii')
html = tpl.replace('%%VIDEO_B64%%', b64)
os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
open(a.out, 'w', encoding='utf-8', newline='\n').write(html)
print(f'{lite}: {os.path.getsize(lite) / 1e6:.1f} MB -> {a.out}: {os.path.getsize(a.out) / 1e6:.1f} MB')
