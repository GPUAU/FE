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

topology = json.loads((Path(__file__).parent / 'mc_demo_topology.json').read_text())
groups = []
for model_index, profile in enumerate(PROFILES):
    model = profile[0]
    base = generate(*profile)
    series = []
    for provider_index, provider in enumerate(topology['providers']):
        for region_index, region in enumerate(provider['regions']):
            for offer_index in range(2):
                seed = profile[4] + (provider_index+1)*10000 + region_index*10 + offer_index
                rng = random.Random(seed)
                factor = (.85 + provider_index*.07) * (.94 + region_index%7*.025) * (1 + offer_index*.06)
                level = 1
                history = []
                for row in base['history']:
                    level *= math.exp(rng.gauss(0,.018))
                    history.append({'month': row['month'], 'price': round(row['price']*factor*level,4)})
                series.append({**base, 'id': f'{model.lower()}-p{provider_index}-r{region_index}-o{offer_index}',
                    'provider': provider['name'], 'region': region, 'history': history,
                    'generator': {'seed':seed,'version':2},
                    'disclosure': '사업자·리전 명칭만 카탈로그에서 참고한 가상 상품입니다. 실제 GPU 제공 여부·출시 시점·가격을 의미하지 않습니다.'})
    # A deliberately incomplete offer demonstrates fixed-panel exclusions.
    series.append({**series[0], 'id':base['model'].lower()+'-incomplete-demo', 'history':series[0]['history'][2:]})
    groups.append({'schema_version':2,'id':model.lower()+'-market-mock-v2','model':model,
                   'product':base['product'],'kind':'mock','contract':'온디맨드','unit':'USD/GPU-hour',
                   'analysis_months':[x['month'] for x in base['history']], 'sourceSeries':series,
                   'disclosure':series[0]['disclosure']})
static = Path(__file__).resolve().parents[1] / 'docker_erd_20261117/app/web/static'
# Single-series fixture remains available for engine regression tests.
(static / 'montecarlo-demo-data.json').write_text(json.dumps(generate(*PROFILES[0]), ensure_ascii=False, indent=2)+'\n')
(static / 'montecarlo-demo-catalog.json').write_text(json.dumps({
    'schema_version':2,'kind':'mock','datasets':groups,
    'topology_note':'카탈로그 7개 사업자 중 리전 코드가 있는 6개 사업자·56개 리전 조합. Oracle은 리전 미확인으로 제외. 가용영역(-azN)은 리전에 중복 합산하지 않음.',
},ensure_ascii=False,separators=(',',':'))+'\n')
print(f'Created {len(groups)} GPU groups, {len(groups[0]["sourceSeries"])} mock offers per group.')
