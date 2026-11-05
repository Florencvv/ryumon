# python tools/serve.py <port>  - static server for the repo, no caching, correct JS MIME, 127.0.0.1 only
import http.server, os, sys, functools
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8760   # default = tools/common.py PORT
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.wasm': 'application/wasm'}
    def send_head(self):
        # module probes from src/main.js (header X-Probe) get 204 instead of 404 for a missing file: clean console
        if self.headers.get('X-Probe') and not os.path.exists(self.translate_path(self.path)):
            self.send_response(204); self.end_headers(); return None
        return super().send_head()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate'); super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer.allow_reuse_address = False
s = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root))
print(f'serving {root} on http://127.0.0.1:{port}/', flush=True)
s.serve_forever()
