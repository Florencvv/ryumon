# python tools/sheet.py VIDEO.mp4 OUT.jpg        contact sheet, 1 still per second (at x.5 s), 6 cols, <= 1600 px wide
# python tools/sheet.py OUT.jpg a.jpg b.jpg ...   contact sheet of stills (label = file name)
import glob, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import FF


def make_sheet(files, out, labels=None, cols=6, maxw=1600):
    ims = [Image.open(f).convert('RGB') for f in files]
    w = min(maxw // cols, ims[0].width); h = round(w * ims[0].height / ims[0].width)
    rows = (len(ims) + cols - 1) // cols
    S = Image.new('RGB', (cols * w, rows * h), (20, 20, 20)); d = ImageDraw.Draw(S)
    for i, im in enumerate(ims):
        x, y = (i % cols) * w, (i // cols) * h; S.paste(im.resize((w, h), Image.LANCZOS), (x, y))
        lab = labels[i] if labels else os.path.splitext(os.path.basename(files[i]))[0]
        d.text((x + 5, y + 3), lab, fill=(0, 0, 0)); d.text((x + 4, y + 2), lab, fill=(255, 255, 0))
    S.save(out, quality=88)
    return f'{out} {S.size} {len(ims)} stills'


if __name__ == '__main__':
    if sys.argv[1].lower().endswith(('.mp4', '.mkv', '.mov')):
        vid, out = sys.argv[1], sys.argv[2]
        with tempfile.TemporaryDirectory() as td:
            subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', vid, '-vf', "select='eq(mod(n\\,24)\\,12)',scale=480:-2",
                            '-vsync', 'vfr', '-q:v', '3', os.path.join(td, 'p_%03d.jpg')], check=True)
            fs = sorted(glob.glob(os.path.join(td, 'p_*.jpg')))
            print(make_sheet(fs, out, [f'{i + 0.5:.1f}s' for i in range(len(fs))]))
    else:
        print(make_sheet(sys.argv[2:], sys.argv[1]))
