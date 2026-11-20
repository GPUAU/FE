"""시장가격 경로 생성 (몬테카를로).

과거 월별 가격 이력의 로그 변화율을 정상 블록 부트스트랩(Politis & Romano 1994)으로
재추출하고, 이력에 없는 가격 인하 이벤트(차세대 출시 등)를 점프로 더한다.

결과는 기준월 가격 대비 지수(index) 경로다. idx[0] = 1.0, idx[t] = t개월 후 가격 / 기준 가격.
"""
import csv
import math
import random
from typing import List, Tuple

MIN_RECOMMENDED_RETURNS = 23  # 월별 24개월 이력 = 변화율 23개


def load_history(path: str) -> Tuple[List[str], List[float]]:
    """CSV(month, price_usd_per_gpu_hour)를 읽는다. 시간순 정렬을 확인한다."""
    months, prices = [], []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            months.append(row["month"].strip())
            prices.append(float(row["price_usd_per_gpu_hour"]))
    if len(prices) < 3:
        raise ValueError("가격 이력이 3개월 미만이라 변화율을 추정할 수 없습니다.")
    if months != sorted(months):
        raise ValueError("가격 이력이 시간순으로 정렬되어 있지 않습니다.")
    if any(p <= 0 for p in prices):
        raise ValueError("가격은 0보다 커야 합니다.")
    return months, prices


def log_returns(prices: List[float]) -> List[float]:
    return [math.log(prices[i] / prices[i - 1]) for i in range(1, len(prices))]


class StationaryBootstrap:
    """평균 블록 길이 L의 정상 블록 부트스트랩. 연속 하락 같은 자기상관을 보존한다."""

    def __init__(self, series: List[float], mean_block_length: float):
        if not series:
            raise ValueError("부트스트랩할 변화율이 없습니다.")
        if mean_block_length <= 0:
            raise ValueError("mean_block_length는 0보다 커야 합니다.")
        self.series = series
        self.restart_p = 1.0 / mean_block_length
        self.idx = -1

    def reset(self) -> None:
        self.idx = -1

    def next(self, rng: random.Random) -> float:
        if self.idx < 0 or rng.random() < self.restart_p:
            self.idx = rng.randrange(len(self.series))
        else:
            self.idx = (self.idx + 1) % len(self.series)
        return self.series[self.idx]


POST12_TRENDS = {
    "keep": "과거 추세 유지 — 12개월 이후에도 과거 평균 하락(상승) 속도가 그대로 이어진다고 가정",
    "ease": "점차 완화 — 12개월 이후 과거 평균 추세의 강도가 12개월마다 절반으로 줄어든다고 가정",
    "flat": "추세 멈춤 — 12개월 이후에는 평균 추세 없이 과거 수준의 변동만 남는다고 가정",
}


def trend_weight(trend: str, t: int, anchor: int = 12) -> float:
    """t월(1부터) 변화율에 남길 과거 평균 추세의 비율."""
    if t <= anchor or trend == "keep":
        return 1.0
    if trend == "ease":
        return 0.5 ** ((t - anchor) / 12.0)
    if trend == "flat":
        return 0.0
    raise ValueError(f"알 수 없는 12개월 이후 추세 옵션: {trend} (keep / ease / flat)")


def simulate_index_paths(
    returns: List[float],
    months: int,
    n_paths: int,
    rng: random.Random,
    mean_block_length: float = 3.0,
    jump_prob_per_month: float = 0.0,
    jump_size_tri: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    post12_trend: str = "keep",
) -> List[List[float]]:
    """가격 지수 경로 n_paths개를 만든다. 각 경로 길이는 months + 1 (0개월 포함).

    jump_size_tri: 점프 발생 시 가격 변화율의 삼각분포 (최소, 최빈, 최대). 예: (-0.30, -0.15, -0.05)
    post12_trend: 12개월 이후 평균 추세 처리 (keep / ease / flat). 12개월까지의 경로는 옵션과
                  관계없이 동일하다(난수 소비 순서가 같음).
    """
    if post12_trend not in POST12_TRENDS:
        raise ValueError(f"알 수 없는 12개월 이후 추세 옵션: {post12_trend} (keep / ease / flat)")
    mu = sum(returns) / len(returns)
    sampler = StationaryBootstrap(returns, mean_block_length)
    lo, mode, hi = jump_size_tri
    paths = []
    for _ in range(n_paths):
        sampler.reset()
        level = 0.0
        path = [1.0]
        for t in range(1, months + 1):
            r = sampler.next(rng)
            level += r - mu * (1.0 - trend_weight(post12_trend, t))
            if jump_prob_per_month > 0 and rng.random() < jump_prob_per_month:
                level += math.log1p(rng.triangular(lo, hi, mode))
            path.append(math.exp(level))
        paths.append(path)
    return paths
