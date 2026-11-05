# python tools/snap.py --port P --out DIR [--scale 2] [--sheet NAME] [--reload] SPEC...
#   s:s14            middle frame of shot s14      s:s14@0 / s:s14@1 first / last frame (any fraction 0..1)
#   s:all            middle of every shot          s:all@0,0.5,1  several fractions of every shot
#   t:30.2           film time in seconds          f:700           frame number
#   "q:test=1&set=FALLS&cam=0,20,120&at=0,120,0&fov=40&t=43=name:mytest"   test view (page params + query; test=demo works)
# -> DIR/<name>.jpg (1920x1040), prints ms per frame (render + GPU sync, in page) and page errors; --sheet NAME -> DIR/NAME.jpg
# --reload: load the page again for every q: spec (only needed by departments that read st.q at create time)
import argparse, asyncio, os, sys, time
from PIL import Image
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import PORT, W, H, FPS, open_film, grab
from sheet import make_sheet

ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=PORT); ap.add_argument('--out', default='out/snap'); ap.add_argument('--scale', default='1')
ap.add_argument('--sheet', default=None); ap.add_argument('--reload', action='store_true'); ap.add_argument('specs', nargs='+')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)


async def expand(pg, spec):
    """-> list of (name, kind, value); kind f = frame number, q = query string"""
    kind, _, val = spec.partition(':')
    if kind == 'f': return [(f'f{int(val):04d}', 'f', int(val))]
    if kind == 't': return [(f't{float(val):07.3f}', 'f', round(float(val) * FPS))]
    if kind == 'q':
        name = None
        if '=name:' in val: val, _, name = val.rpartition('=name:')
        return [(name, 'q', val)]
    if kind == 's':
        sid, _, fr = val.partition('@')
        fracs = [float(x) for x in fr.split(',')] if fr else [0.5]
        shots = await pg.evaluate('FILM.SHOTS.map(s => [s.id, s.f0, s.f1])')
        out = []
        for s_id, f0, f1 in shots:
            if sid != 'all' and s_id != sid: continue
            for k in fracs:
                n = min(f1 - 1, f0 + round((f1 - 1 - f0) * k))
                out.append((f'{s_id}_f{n:04d}', 'f', n))
        if not out: print('unknown shot', val)
        return out
    print('bad spec', spec); return []


async def main():
    async with async_playwright() as p:
        t0 = time.time()
        br, pg, msgs = await open_film(p, a.port, a.scale)
        depts = await pg.evaluate("FILM.depts.map(d => d.name + (d.stub ? '(stub)' : d.inst ? '' : '(none)')).join(' ')")
        print(f'loaded in {time.time() - t0:.1f}s  {depts}')
        files, mss, qi = [], [], 0
        for spec in a.specs:
            for name, kind, val in await expand(pg, spec):
                page, br2 = pg, None
                if kind == 'q':
                    qi += 1; name = name or f'q{qi}'
                    if a.reload:
                        br2, page, msgs2 = await open_film(p, a.port, a.scale, val); msgs.extend(msgs2)
                        ms = await page.evaluate("FILM.renderQuery('')")
                    else:
                        ms = await page.evaluate('(qs) => FILM.renderQuery(qs)', val)
                else:
                    ms = await page.evaluate(f'FILM.renderFrame({val})')
                st = await page.evaluate('[FILM.st.sid, FILM.st.set, FILM.st.frame, +FILM.st.t.toFixed(3)]')
                im = Image.frombytes('RGB', (W, H), await grab(page))
                fn = os.path.join(a.out, f'{name}.jpg'); im.save(fn, quality=92); files.append(fn); mss.append(ms)
                print(f'{name:28s} {st[0]} {st[1]:6s} f{st[2]:04d} t={st[3]:7.3f}  {ms:7.1f} ms', flush=True)
                if br2: await br2.close()
        errs = await pg.evaluate('FILM.errors')
        for m in msgs[:30]: print('  ', m[:500])
        for e in errs[:30]: print('  FILM.error:', e[:500])
        if mss:
            rest = mss[1:] or mss
            print(f'{len(mss)} stills at scale {a.scale}: ms/frame avg {sum(mss) / len(mss):.1f} (first {mss[0]:.1f}, rest avg {sum(rest) / len(rest):.1f}, max {max(mss):.1f})')
        if a.sheet and files: print(make_sheet(files, os.path.join(a.out, a.sheet + '.jpg')))
        await br.close()

asyncio.run(main())
