"""Local preview: original site and legacy API, with /api/v1 sent to Spring."""
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from os import environ
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

STATIC = Path(__file__).parent / 'docker_erd_20261117/app/web/static'
SPRING = environ.get('GPU_SPRING_BASE_URL', 'http://127.0.0.1:18092').rstrip('/')
LEGACY = environ.get('GPU_LEGACY_BASE_URL', 'http://127.0.0.1:18093').rstrip('/')
AGENT_SESSION_PATH = '/api/v1/agent-sessions/'
AGENT_SESSION_ROUTE = re.compile(AGENT_SESSION_PATH + r'[A-Za-z0-9_-]{1,100}')

class Handler(SimpleHTTPRequestHandler):
    def proxy(self):
        host = SPRING if self.path.startswith('/api/v1/') else LEGACY
        if not host:
            self.send_error(503, 'Compatibility backend unavailable')
            return
        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length) if length else None
        headers = {'Accept': self.headers.get('Accept', '*/*')}
        for key in ('Content-Type', 'X-Settings-Token'):
            if self.headers.get(key):
                headers[key] = self.headers[key]
        try:
            with urlopen(Request(host + self.path, data=body, headers=headers, method=self.command), timeout=60) as response:
                if response.status == 204:
                    self.send_response(response.status)
                    self.end_headers()
                    return
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

    def log_request(self, code='-', size='-'):
        if getattr(self, 'path', '').startswith(AGENT_SESSION_PATH):
            self.log_message('"%s %s[redacted] %s" %s %s',
                             self.command, AGENT_SESSION_PATH, self.request_version, code, size)
        else:
            super().log_request(code, size)

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

    def do_DELETE(self):
        if AGENT_SESSION_ROUTE.fullmatch(self.path):
            return self.proxy()
        self.send_error(404)

if __name__ == '__main__':
    port = int(environ.get('GPU_FE_PORT', '18091'))
    print(f'화면: http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(STATIC))).serve_forever()
