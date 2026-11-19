"""Local preview: original site and legacy API, with /api/v1 sent to Spring."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

STATIC = Path(__file__).parent / 'docker_erd_20261117/app/web/static'
SPRING = 'http://127.0.0.1:18092'
LEGACY = 'http://127.0.0.1:18093'

class Handler(SimpleHTTPRequestHandler):
    def proxy(self):
        host = SPRING if self.path.startswith('/api/v1/') else LEGACY
        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length) if length else None
        headers = {'Accept': self.headers.get('Accept', '*/*')}
        for key in ('Content-Type', 'X-Settings-Token'):
            if self.headers.get(key):
                headers[key] = self.headers[key]
        try:
            with urlopen(Request(host + self.path, data=body, headers=headers, method=self.command), timeout=60) as response:
                data = response.read()
                self.send_response(response.status)
                self.send_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except HTTPError as error:
            data = error.read()
            self.send_response(error.code)
            self.send_header('Content-Type', error.headers.get('Content-Type', 'application/json'))
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (URLError, TimeoutError):
            self.send_error(502, 'Backend unavailable')

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith('/api/') or self.path.startswith('/public-data'):
            return self.proxy()
        if self.path in ('/', '/index.html'):
            self.path = '/index-erd.html'
        elif self.path.startswith('/static/'):
            self.path = self.path[len('/static'):]
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            return self.proxy()
        self.send_error(404)

if __name__ == '__main__':
    print('화면: http://127.0.0.1:18091', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 18091), partial(Handler, directory=str(STATIC))).serve_forever()
