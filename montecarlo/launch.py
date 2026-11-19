"""Start or reuse only this project's Monte Carlo service."""
import json
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def ensure_started():
    def health():
        with urllib.request.urlopen('http://127.0.0.1:18096/health', timeout=2) as r:
            return json.load(r).get('service') == 'gpu-pm-montecarlo'
    with socket.socket() as s:
        used = s.connect_ex(('127.0.0.1', 18096)) == 0
    if used:
        if not health():
            raise RuntimeError('18096 포트의 프로그램을 확인하세요. 기존 프로그램은 변경하지 않았습니다.')
        return
    logs = ROOT.parent / 'logs'
    logs.mkdir(exist_ok=True)
    with (logs / 'montecarlo.log').open('a') as log:
        proc = subprocess.Popen([sys.executable, str(ROOT/'service.py')], cwd=ROOT,
                                stdout=log, stderr=log, start_new_session=True)
    for _ in range(30):
        if proc.poll() is not None:
            raise RuntimeError('계산 서버 실행 실패. logs/montecarlo.log를 확인하세요.')
        try:
            if health(): return
        except (OSError, ValueError):
            pass
        time.sleep(.2)
    raise RuntimeError('계산 서버 응답 시간이 초과됐습니다.')

if __name__ == '__main__':
    ensure_started()
    print('몬테카를로 화면: http://127.0.0.1:18091/#forecast')
    webbrowser.open('http://127.0.0.1:18091/#forecast')
