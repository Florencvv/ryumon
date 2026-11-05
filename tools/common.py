# common.py - shared tool settings + headless page helper (Playwright Chromium on the GPU, ANGLE D3D11)
import asyncio, base64, os, shutil, sys, time
FILM, PORT, FRAMES, W, H, FPS = 'ryumon', 8760, 2112, 1920, 1040, 24


def find_ffmpeg():
    """ffmpeg from the FFMPEG env var, else PATH, else the imageio-ffmpeg wheel if it is installed"""
    ff = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if ff: return ff
    try:
        import imageio_ffmpeg; return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return 'ffmpeg'


FF = find_ffmpeg()
# GPU Chromium; on Windows force ANGLE D3D11 (the backend every frame of the film was rendered with)
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist"] + (["--use-angle=d3d11"] if os.name == 'nt' else [])
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # the repo (index.html)

async def open_film(p, port=PORT, scale=1, extra='', timeout=600):
    """launch Chromium, open index.html?headless=1&s=scale, wait for FILM.ready; returns (browser, page, msgs)"""
    br = await p.chromium.launch(headless=True, args=ARGS)
    pg = await br.new_page(viewport={'width': W, 'height': H})
    msgs = []
    pg.on('console', lambda m: msgs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: msgs.append(f'PAGEERR: {e}'))
    url = f'http://127.0.0.1:{port}/index.html?headless=1&s={scale}' + (('&' + extra) if extra else '')
    await pg.goto(url, wait_until='commit', timeout=0)
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            await pg.wait_for_function('window.FILM && window.FILM.ready === true', timeout=1000); break
        except Exception:
            if any(m.startswith('PAGEERR') for m in msgs) and not await pg.evaluate('!!window.FILM'): break
    if not await pg.evaluate('!!(window.FILM && window.FILM.ready)'):
        print('FAILED TO LOAD', url); [print('  ', m[:600]) for m in msgs[:40]]
        await br.close(); sys.exit(1)
    return br, pg, msgs

async def grab(pg):
    return base64.b64decode(await pg.evaluate('FILM.grab()'))
