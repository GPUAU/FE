"""Local UI adapter for the unmodified PM prototype. No DB writes or external calls."""
import copy
import hashlib
import json
import math
import sys
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'engine'))
from price_paths import load_history, log_returns
from pricing_range import (generate_paths, history_evidence, market_ranges, draw_scenarios,
                           select_paths, price_range, scenario_comparison, validate_config)

DEFAULT = json.loads((ROOT / 'engine/config_sample.json').read_text())
MONTHS, PRICES = load_history(str(ROOT / 'engine/sample_price_history.csv'))
RETURNS = log_returns(PRICES)
ALLOWED_ORIGINS = {f'http://{host}:{port}'
                   for host in ('127.0.0.1', 'localhost')
                   for port in (18091, 18115)}
LOCK = threading.Lock()

def number(value, name, low, high, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f'{name}: 유한한 숫자를 입력하세요.')
    if not low <= value <= high or (integer and int(value) != value):
        raise ValueError(f'{name}: {low}~{high} 범위의 {"정수" if integer else "값"}를 입력하세요.')

def validated(raw):
    if not isinstance(raw, dict):
        raise ValueError('계산 설정이 필요합니다.')
    cfg = copy.deepcopy(DEFAULT)
    # Source, sample designation and product cannot be relabelled by the browser.
    for section in ('simulation', 'investment', 'uncertain'):
        if not isinstance(raw.get(section), dict):
            raise ValueError(f'{section} 입력이 필요합니다.')
        for k in cfg[section]:
            if k not in raw[section]:
                raise ValueError(f'{section}.{k} 입력이 필요합니다.')
            cfg[section][k] = raw[section][k]
    cfg['target_irr_annual'] = raw.get('target_irr_annual')
    cfg['candidate_prices'] = raw.get('candidate_prices')
    s, i, u = cfg['simulation'], cfg['investment'], cfg['uncertain']
    number(s['n_paths'], '반복 횟수', 1000, 50000, True)
    number(s['seed'], '난수 시드', 0, 2147483647, True)
    number(s['mean_block_length'], '평균 블록 길이', 1, 24)
    number(s['jump_prob_per_month'], '월 이벤트 확률', 0, 1)
    number(i['gpus'], 'GPU 수', 1, 100000, True)
    number(i['months'], '분석 기간', 12, 60, True)
    number(i['capex_per_gpu'], 'GPU당 투자비', 1, 10000000)
    number(i['ramp_months'], '초기 가동 기간', 0, i['months'], True)
    number(i['residual_value_pct'], '잔존가치 비율', 0, 1)
    number(cfg['target_irr_annual'], '목표 IRR', 0, 2)
    bounds = {'utilization': (0.01, 1), 'capex_overrun': (0, 2),
              'opex_per_gpu_month': (0, 1000000), 'opex_annual_inflation': (-0.5, 1)}
    triples = [(k, u[k], *b) for k, b in bounds.items()]
    triples.append(('이벤트 가격 변화율', s['jump_size_tri'], -0.95, 0))
    for key, values, low, high in triples:
        if not isinstance(values, list) or len(values) != 3:
            raise ValueError(f'{key}: 최소·최빈·최대 3개 값이 필요합니다.')
        for v in values:
            number(v, key, low, high)
        if values != sorted(values):
            raise ValueError(f'{key}: 최소 ≤ 최빈 ≤ 최대 순서로 입력하세요.')
    if not isinstance(cfg['candidate_prices'], list) or not 1 <= len(cfg['candidate_prices']) <= 8:
        raise ValueError('후보 판매가는 1~8개를 입력하세요.')
    for p in cfg['candidate_prices']:
        number(p, '후보 판매가', 0.01, 100000)
    validate_config(cfg)
    return cfg

def metadata(cfg):
    return {'model_version': '0.3.0-prototype', 'adapter_version': '1.0.0',
            'data_asof': cfg['meta']['data_asof'], 'is_sample': True,
            'run_at': datetime.now(timezone.utc).isoformat(),
            'seed': cfg['simulation']['seed'], 'n_paths': cfg['simulation']['n_paths'],
            'history_hash': hashlib.sha256((ROOT/'engine/sample_price_history.csv').read_bytes()).hexdigest(),
            'config_hash': hashlib.sha256(json.dumps(cfg, sort_keys=True).encode()).hexdigest(),
            'unit': 'USD/GPU-hour', 'hours_per_month': 730,
            'warnings': ['PM ZIP의 가상 가격 이력·가상 비용입니다. 실제 수집 DB와 연결하지 않았습니다.',
                         '가격 이력 18개월: PM 코드의 권장 최소 24개월보다 짧습니다. 백테스트 미수행.',
                         'P10~P90은 가정한 모형 내 경로의 중앙 80% 범위이며 예측 정확도가 아닙니다.',
                         '13개월 이후는 선택한 추세 가정입니다. 검증된 장기 예측이 아닙니다.']}

def calculate(kind, payload):
    cfg = validated(payload.get('config'))
    if kind == 'forecast':
        # Full investment horizon preserves PM random draw order and CLI parity.
        paths = generate_paths(cfg, RETURNS, 'keep')
        return {'meta': metadata(cfg), 'config': cfg, 'evidence': history_evidence(MONTHS, PRICES, RETURNS),
                'history': [{'month': m, 'price': p} for m, p in zip(MONTHS, PRICES)],
                'monthly': market_ranges(paths, PRICES[-1], range(1, 13))}
    selection = payload.get('selection', {})
    trend = selection.get('post12_trend')
    if trend not in ('keep', 'ease', 'flat'):
        raise ValueError('12개월 이후 추세 가정을 선택하세요.')
    scenario, direct = selection.get('scenario'), selection.get('market_price_12m')
    if (scenario is None) == (direct is None):
        raise ValueError('시장가 시나리오 또는 직접 입력 중 하나만 선택하세요.')
    if direct is not None:
        number(direct, '12개월 후 시장가', 0.01, 100000)
    paths = generate_paths(cfg, RETURNS, trend)
    indices, info = select_paths(paths, PRICES[-1], scenario=scenario, market_price_12m=direct)
    if not indices:
        raise ValueError('선택 범위에 경로가 없습니다. 반복 횟수 또는 시장가 가정을 조정하세요.')
    scenarios = draw_scenarios(cfg)
    result = price_range(cfg, paths, scenarios, indices)
    result.pop('required_sorted')
    result.pop('median_market_index')
    result.update(meta=metadata(cfg), selection=info, post12_trend=trend,
                  scenario_comparison=scenario_comparison(cfg, paths, scenarios, PRICES[-1]),
                  monthly=market_ranges(paths, PRICES[-1], range(1, cfg['investment']['months'] + 1)))
    return result

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        if self.headers.get('Origin') not in ALLOWED_ORIGINS:
            return self.reply(403, {'error': '허용하지 않은 출처입니다.'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            return self.reply(200, {'service': 'gpu-pm-montecarlo', 'version': '1.0.0'})
        if self.path == '/defaults':
            return self.reply(200, {'config': DEFAULT, 'history': [{'month':m,'price':p} for m,p in zip(MONTHS,PRICES)]})
        self.reply(404, {'error': '없는 경로입니다.'})

    def do_POST(self):
        if self.headers.get('Origin') not in ALLOWED_ORIGINS | {None}:
            return self.reply(403, {'error': '허용하지 않은 출처입니다.'})
        if self.path not in ('/forecast', '/pricing'):
            return self.reply(404, {'error': '없는 경로입니다.'})
        if not LOCK.acquire(blocking=False):
            return self.reply(429, {'error': '다른 계산이 실행 중입니다. 잠시 후 다시 실행하세요.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536:
                raise ValueError('입력 크기가 올바르지 않습니다.')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('JSON 객체가 필요합니다.')
            result = calculate(self.path[1:], payload)
            self.reply(200, result)
        except (ValueError, TypeError, KeyError, OverflowError) as e:
            self.reply(422, {'error': str(e)})
        except Exception:
            self.reply(500, {'error': '계산을 완료하지 못했습니다. 입력을 확인하고 다시 실행하세요.'})
        finally:
            LOCK.release()

if __name__ == '__main__':
    print('PM Monte Carlo: http://127.0.0.1:18096', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 18096), Handler).serve_forever()
