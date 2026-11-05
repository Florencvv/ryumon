# python tools/render.py OUT START END [--scale 2] [--port P] [--preview]
#   frames [START, END) -> OUT: lossless FFV1 1920x1040 rgb24 24 fps (one sample per frame, no motion blur);
#   --preview: x264 960x520 CRF 18 (fast motion review)
import argparse, asyncio, os, subprocess, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import FF, PORT, W, H, FPS, open_film, grab

ap = argparse.ArgumentParser()
ap.add_argument('out'); ap.add_argument('start', type=int); ap.add_argument('end', type=int)
ap.add_argument('--scale', default='2'); ap.add_argument('--port', type=int, default=PORT); ap.add_argument('--preview', action='store_true')
a = ap.parse_args()
DEPTS = ['vale', 'heights', 'creatures', 'water', 'fx', 'direction/act1', 'direction/act2']
API = ['vale', 'heights', 'koi', 'heron', 'cat', 'dragon', 'spout', 'water']


async def health(pg, msgs):
    """fatal problems: a console/page error or FILM.errors entry mentioning import/failed/no module, or a missing department/api
    (python http.server under load can drop a module import and the page then renders without that department)"""
    errs = await pg.evaluate('FILM.errors')
    bad = [m for m in msgs + errs if any(k in m.lower() for k in ('import', 'failed', 'no module'))]
    st = await pg.evaluate("[FILM.depts.filter(d => d.inst).map(d => d.name), Object.keys(FILM.ctx.api)]")
    bad += [f'department missing: {d}' for d in DEPTS if d not in st[0]] + [f'ctx.api missing: {k}' for k in API if k not in st[1]]
    return bad


async def main():
    enc = (['-vf', f'scale={W // 2}:{H // 2}:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p'] if a.preview
           else ['-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'rgb24'])
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    ff = subprocess.Popen([FF, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
                          + enc + [a.out], stdin=subprocess.PIPE)
    async with async_playwright() as p:
        br, pg, msgs = await open_film(p, a.port, a.scale)
        bad = await health(pg, msgs)
        if bad:
            print('FATAL at load', bad[:5], flush=True); await br.close(); ff.kill(); sys.exit(3)
        # replay frames [0, start) without drawing: WATER's event registry keeps history (sparkles/ripples keyed on the
        # current drawing), so every chunk sees exactly what a single in-order render of the whole film would
        if a.start > 0: print('preroll', a.start, 'frames', round(await pg.evaluate(f'FILM.preroll(0, {a.start})')), 'ms', flush=True)
        t0 = time.time()
        for f in range(a.start, a.end):
            await pg.evaluate(f'FILM.renderFrame({f})')
            ff.stdin.write(await grab(pg))
            if (f - a.start) % 120 == 0: print(f, round(time.time() - t0, 1), 's', flush=True)
        errs = await pg.evaluate('FILM.errors')
        print('done', a.end - a.start, 'frames', round(time.time() - t0, 1), 's', 'errors', (errs + [m for m in msgs if 'PAGEERR' in m])[:5], flush=True)
        bad = await health(pg, msgs)
        await br.close()
    ff.stdin.close(); ff.wait()
    if bad:
        print('FATAL during render', bad[:5], flush=True); sys.exit(3)
    sys.exit(ff.returncode)

asyncio.run(main())
