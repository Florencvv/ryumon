// workbench.js - scrub / play UI (not loaded with ?headless=1).
// Keys: space play/pause | left/right 1 frame | shift+left/right 12 frames | up/down previous/next shot | Home/End
//       | number row 1-4 jump to a quarter of the film. Click a shot segment on the timeline to jump to its start.
export function workbench(FILM, SH, P) {
  const $ = (id) => document.getElementById(id);
  const bar = $('bar'); if (!bar) return;
  bar.style.display = '';
  const range = $('scrub'), label = $('label'), play = $('play'), tl = $('timeline');
  range.max = FILM.FRAMES - 1;
  const SETC = { LAKE: '#c98a4a', SKY: '#e0a060', CITY: '#7a4ac8', PASS: '#c890b0', POND: '#5a9a6a', BAMBOO: '#4a8a3a', TOWN: '#c8964a', GORGE: '#c8604a', FALLS: '#3a4a9a' };
  for (const s of SH.SHOTS) {
    const d = document.createElement('div'); d.className = 'seg'; d.title = `${s.id} ${s.name} (${s.set}${s.under ? '-UNDER' : ''}) ${s.t0}-${s.t1}s`;
    d.style.left = (s.t0 / SH.DURATION * 100) + '%'; d.style.width = (s.dur / SH.DURATION * 100) + '%';
    d.style.background = SETC[s.set] ?? '#888'; if (s.under) d.style.opacity = 0.6;
    d.textContent = s.id.slice(1); d.onclick = () => go(s.f0); tl.appendChild(d);
  }
  const head = document.createElement('div'); head.className = 'head'; tl.appendChild(head);
  let f = FILM.st?.frame ?? 0, playing = false, t0 = 0, f0 = 0, ms = 0;
  const testMode = P.has('test');
  function draw(n) {
    f = Math.max(0, Math.min(FILM.FRAMES - 1, n));
    if (testMode) { P.delete('t'); P.delete('f'); }
    ms = FILM.renderFrame(f);
    const st = FILM.st; range.value = f; head.style.left = (f / FILM.FRAMES * 100) + '%';
    label.textContent = `${st.sid} ${st.shot.name} · ${st.set}${st.under ? '-UNDER' : ''} · f ${String(f).padStart(4, '0')} · ${st.t.toFixed(2)} s · lt ${st.lt.toFixed(2)}/${st.dur.toFixed(2)} · ${ms.toFixed(0)} ms` + (FILM.errors.length ? ` · ${FILM.errors.length} errors (console)` : '');
  }
  function go(n) { playing = false; play.textContent = 'play'; draw(n); }
  function loop(now) {
    if (!playing) return;
    const n = f0 + Math.floor((now - t0) / 1000 * FILM.FPS);
    if (n >= FILM.FRAMES) { go(FILM.FRAMES - 1); return; }
    if (n !== f) draw(n);
    requestAnimationFrame(loop);
  }
  function toggle() { playing = !playing; play.textContent = playing ? 'pause' : 'play'; if (playing) { if (f >= FILM.FRAMES - 1) f = 0; t0 = performance.now(); f0 = f; requestAnimationFrame(loop); } }
  range.oninput = () => go(+range.value);
  play.onclick = toggle;
  window.addEventListener('keydown', (e) => {
    const sh = SH.SHOTS, cur = FILM.st?.shot?.index ?? 0;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') go(f + (e.shiftKey ? 12 : 1));
    else if (e.key === 'ArrowLeft') go(f - (e.shiftKey ? 12 : 1));
    else if (e.key === 'ArrowDown') { e.preventDefault(); go(sh[Math.min(sh.length - 1, cur + 1)].f0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(f > sh[cur].f0 ? sh[cur].f0 : sh[Math.max(0, cur - 1)].f0); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(FILM.FRAMES - 1);
    else if (/^[1-4]$/.test(e.key)) go(Math.round((+e.key - 1) / 4 * FILM.FRAMES));
  });
  draw(f);
}
