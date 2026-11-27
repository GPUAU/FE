"""Reproducible fictional GPU prices, never observed market data."""
import json
import math
import random
from pathlib import Path

# All levels and patterns are arbitrary presentation assumptions, not market estimates.
PROFILES = [
    ('B300', 6.2, -.018, .035, 20261127),
    ('GB300', 7.8, -.012, .045, 20261128),
    ('VR200', 9.5, -.008, .060, 20261129),
    ('B200', 4.9, -.020, .030, 20261130),
    ('H100', 3.4, -.025, .040, 20261201),
    ('GB200', 6.4, -.016, .038, 20261202),
    ('H200', 4.1, -.015, .032, 20261203),
]

def generate(model, initial, drift, volatility, seed):
    rng = random.Random(seed)
    price = initial
    history = []
    for index in range(18):
        year, month = divmod(2025 * 12 + 5 + index, 12)
        if index:
            shock = {5: -.07, 9: .055, 13: -.10}.get(index, 0)
            price *= math.exp(drift + rng.gauss(0, volatility) + shock)
        history.append({'month': f'{year:04d}-{month+1:02d}', 'price': round(price, 4)})
    return {
        'schema_version': 1, 'id': f'{model.lower()}-presentation-mock-v1',
        'model': model, 'kind': 'mock', 'label': f'{model} 가격 이력 · 발표용 목데이터',
        'product': f'NVIDIA {model}', 'provider': '가상 사업자', 'region': '가상 단일 리전',
        'contract': '온디맨드', 'unit': 'USD/GPU-hour', 'frequency': 'monthly',
        'price_basis': '시연을 위해 생성한 월별 GPU 시간당 단가',
        'generator': {'seed': seed, 'version': 1, 'initial_price': initial,
                      'monthly_log_drift': drift, 'monthly_volatility': volatility,
                      'method': '모델별 가상 단가·변동 가정 + 난수 변동 + 가상 공급 이벤트'},
        'disclosure': '모든 모델의 이력은 가상입니다. 실제 출시 시점·상품 구성·시장가격·성능 차이를 반영하지 않습니다.',
        'history': history,
    }

datasets = [generate(*profile) for profile in PROFILES]
static = Path(__file__).resolve().parents[1] / 'docker_erd_20261117/app/web/static'
# Keep the original B300 fixture for compatibility and engine regression tests.
(static / 'montecarlo-demo-data.json').write_text(json.dumps(datasets[0], ensure_ascii=False, indent=2) + '\n')
(static / 'montecarlo-demo-catalog.json').write_text(json.dumps({
    'schema_version': 1, 'kind': 'mock', 'datasets': datasets,
}, ensure_ascii=False, indent=2) + '\n')
print(f'Created {len(datasets)} fictional GPU histories, 18 months each.')
