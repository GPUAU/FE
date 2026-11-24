"""Local integrated preview using the team's deployed API and cost agent."""
import base64
from functools import partial
from getpass import getpass
from http.server import ThreadingHTTPServer
import os
import threading
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler
import webbrowser

import serve

UPSTREAM = os.environ.get('GPU_PREVIEW_BACKEND', 'https://u1-3.skala-us.com').rstrip('/')
AUTH = None


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = build_opener(NoRedirect)


class Handler(serve.Handler):
    def proxy(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length > 6 * 1024 * 1024:
            self.send_error(413, 'Upload exceeds 6 MB')
            return
        body = self.rfile.read(length) if length else None
        headers = {'Accept': self.headers.get('Accept', '*/*')}
        for key in ('Content-Type', 'X-Settings-Token'):
            if self.headers.get(key):
                headers[key] = self.headers[key]
        if AUTH:
            headers['Authorization'] = AUTH
        try:
            req = Request(UPSTREAM + self.path, data=body, headers=headers, method=self.command)
            with OPENER.open(req, timeout=120) as response:
                self.reply(response.status, response.headers, response.read())
        except HTTPError as error:
            self.reply(error.code, error.headers, error.read())
        except (URLError, TimeoutError):
            self.send_error(502, 'Team backend unavailable')

    def reply(self, status, headers, data):
        self.send_response(status)
        self.send_header('Content-Type', headers.get('Content-Type', 'application/json'))
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith('/agent/'):
            return self.proxy()
        if path in ('/', '/index.html'):
            self.path = '/index-erd.html'
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/agent/'):
            return self.proxy()
        return super().do_POST()

    def do_PUT(self):
        if self.path.startswith('/agent/v1/bills/'):
            return self.proxy()
        self.send_error(404)


def main():
    global AUTH
    # Acquire the FE port before starting a second service or opening a browser.
    server = ThreadingHTTPServer(('127.0.0.1', 18091), partial(Handler, directory=str(serve.STATIC)))
    try:
        try:
            OPENER.open(UPSTREAM + '/agent/health', timeout=10).close()
        except HTTPError as error:
            if error.code == 401:
                print('팀 배포 사이트의 Basic 인증 정보를 입력하세요. 파일에는 저장하지 않습니다.')
                user = input('아이디: ')
                password = getpass('비밀번호: ')
                AUTH = 'Basic ' + base64.b64encode((user + ':' + password).encode()).decode()
                del password
                try:
                    OPENER.open(Request(UPSTREAM + '/agent/health', headers={'Authorization': AUTH}), timeout=10).close()
                except HTTPError as auth_error:
                    if auth_error.code in (401, 403):
                        raise RuntimeError('배포 사이트 인증 실패. 아이디와 비밀번호를 확인하세요.') from None
                    print('원가 에이전트 응답 오류:', auth_error.code)
            else:
                print('원가 에이전트 응답 오류:', error.code)
        except (URLError, TimeoutError):
            print('팀 API 연결을 확인하지 못했습니다. 화면은 열리지만 데이터 조회는 실패할 수 있습니다.')
        from montecarlo.launch import ensure_started
        ensure_started()
        url = 'http://127.0.0.1:18091/#home'
        print('로컬 통합본:', url, flush=True)
        print('종료: Ctrl+C / Monte Carlo 서비스: 18096', flush=True)
        threading.Thread(target=lambda: webbrowser.open(url), daemon=True).start()
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
