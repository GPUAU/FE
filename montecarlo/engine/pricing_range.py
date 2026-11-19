"""2단계 의사결정 지원 계산.

1단계 forecast: 몬테카를로로 시장가격 변동 범위와 근거를 만든다. 시스템은 시장가를 정하지 않는다.
2단계 price:    담당자가 고른 시장가 가정(시나리오 또는 직접 입력)에 해당하는 경로만 골라
                목표 IRR 달성 확률별 판매가를 계산한다. 최종 판매가도 담당자가 정한다.

경로 선택 방식: 12개월 후 시장가가 담당자 선택 수준의 분위수 ±10%p 안에 드는 경로만 사용한다.
                (예: '보수(P25)' → 12개월 후 시장가가 P15~P35인 경로)
"""
import math
import random
from dataclasses import replace
from typing import Dict, List, Optional, Sequence, Tuple

from cashflow import Scenario, irr_annual, net_flows, required_price
from price_paths import simulate_index_paths

UNCERTAIN_KEYS = ("utilization", "capex_overrun", "opex_per_gpu_month", "opex_annual_inflation")
UNCERTAIN_LABELS = {
    "utilization": "유료 가동률",
    "capex_overrun": "투자비 초과율",
    "opex_per_gpu_month": "GPU당 월 운영비",
    "opex_annual_inflation": "운영비 연 상승률",
    "market_path": "시장가격 경로 (선택 구간 안)",
}
# 판매자 입장에서 시장가가 낮을수록 보수적이다.
MARKET_SCENARIOS = {"보수": 0.25, "기준": 0.50, "낙관": 0.75}
SELECTION_BAND = 0.10
ANCHOR_MONTH = 12


# ---------------------------------------------------------------- 공통 유틸

def quantile(sorted_vals: Sequence[float], q: float) -> float:
    """선형보간 분위수. sorted_vals는 오름차순 정렬되어 있어야 한다."""
    if not sorted_vals:
        raise ValueError("빈 값의 분위수는 계산할 수 없습니다.")
    pos = q * (len(sorted_vals) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def prob_at_or_below(sorted_vals: Sequence[float], x: float) -> float:
    """오름차순 리스트에서 x 이하 비율 (이진 탐색)."""
    lo, hi = 0, len(sorted_vals)
    while lo < hi:
        mid = (lo + hi) // 2
        if sorted_vals[mid] <= x:
            lo = mid + 1
        else:
            hi = mid
    return lo / len(sorted_vals)


def pointwise_quantile_path(paths: List[List[float]], q: float) -> List[float]:
    return [quantile(sorted(p[t] for p in paths), q) for t in range(len(paths[0]))]


def validate_config(cfg: Dict) -> None:
    inv, unc = cfg["investment"], cfg["uncertain"]
    if inv["pricing_mode"] not in ("fixed", "follow_market"):
        raise ValueError("pricing_mode는 'fixed' 또는 'follow_market'이어야 합니다.")
    for k in UNCERTAIN_KEYS:
        lo, mode, hi = unc[k]
        if not lo <= mode <= hi:
            raise ValueError(f"{k}: 삼각분포는 최소 ≤ 최빈 ≤ 최대여야 합니다. 현재 {unc[k]}")
    if not 0 < unc["utilization"][2] <= 1:
        raise ValueError("utilization 최대값은 0 초과 1 이하여야 합니다.")
    if int(inv["months"]) < ANCHOR_MONTH:
        raise ValueError("분석기간(months)은 12개월 이상이어야 합니다.")


def generate_paths(cfg: Dict, returns: List[float], post12_trend: str, months: Optional[int] = None):
    sim = cfg["simulation"]
    return simulate_index_paths(
        returns,
        months=int(months if months is not None else cfg["investment"]["months"]),
        n_paths=int(sim["n_paths"]),
        rng=random.Random(sim["seed"]),
        mean_block_length=float(sim["mean_block_length"]),
        jump_prob_per_month=float(sim.get("jump_prob_per_month", 0.0)),
        jump_size_tri=tuple(sim.get("jump_size_tri", (0.0, 0.0, 0.0))),
        post12_trend=post12_trend,
    )


# ---------------------------------------------------------------- 1단계: 시장가 범위

def history_evidence(months: List[str], prices: List[float], returns: List[float]) -> Dict:
    n = len(returns)
    mu = sum(returns) / n
    sd = math.sqrt(sum((r - mu) ** 2 for r in returns) / (n - 1)) if n > 1 else 0.0
    worst = min(range(n), key=lambda i: returns[i])
    return {
        "first_month": months[0], "last_month": months[-1], "n_months": len(months),
        "first_price": prices[0], "last_price": prices[-1],
        "monthly_mean_change": math.exp(mu) - 1,
        "annualized_trend": math.exp(12 * mu) - 1,
        "monthly_volatility": sd,
        "worst_month": months[worst + 1], "worst_month_change": math.exp(returns[worst]) - 1,
        "down_month_share": sum(r < 0 for r in returns) / n,
    }


def market_ranges(paths: List[List[float]], last_price: float, horizons: Sequence[int]) -> List[Dict]:
    out = []
    for h in horizons:
        vals = sorted(last_price * p[h] for p in paths)
        out.append({"month": h, **{f"p{int(q * 100)}": quantile(vals, q) for q in (0.1, 0.25, 0.5, 0.75, 0.9)},
                    "prob_below_now": prob_at_or_below(vals, last_price)})
    return out


# ---------------------------------------------------------------- 2단계: 담당자 선택 반영

def select_paths(paths: List[List[float]], last_price: float, scenario: Optional[str] = None,
                 market_price_12m: Optional[float] = None) -> Tuple[List[int], Dict]:
    """담당자가 고른 12개월 후 시장가 수준 주변(분위 ±10%p)의 경로 번호를 돌려준다."""
    vals12 = sorted(last_price * p[ANCHOR_MONTH] for p in paths)
    warnings = []
    if scenario is not None:
        if scenario not in MARKET_SCENARIOS:
            raise ValueError(f"시장가 시나리오는 {list(MARKET_SCENARIOS)} 중 하나여야 합니다.")
        center = MARKET_SCENARIOS[scenario]
        label = f"{scenario} (12개월 후 시장가 P{int(center * 100)})"
    elif market_price_12m is not None:
        center = prob_at_or_below(vals12, market_price_12m)
        label = f"직접 입력 (12개월 후 시장가 ${market_price_12m:,.2f}, 분포상 P{center * 100:.0f})"
        if center < 0.05 or center > 0.95:
            warnings.append(f"입력한 12개월 후 시장가 ${market_price_12m:,.2f}는 시뮬레이션 범위의 "
                            f"양 끝 5% 밖입니다(P{center * 100:.0f}). 근거가 약한 가정이므로 선택 사유를 남겨 주세요.")
        center = min(max(center, SELECTION_BAND), 1 - SELECTION_BAND)
    else:
        raise ValueError("시장가 시나리오 또는 12개월 후 시장가 중 하나를 지정해야 합니다.")
    lo_q, hi_q = max(0.0, center - SELECTION_BAND), min(1.0, center + SELECTION_BAND)
    lo_v, hi_v = quantile(vals12, lo_q), quantile(vals12, hi_q)
    idx = [i for i, p in enumerate(paths) if lo_v <= last_price * p[ANCHOR_MONTH] <= hi_v]
    return idx, {"label": label, "center_q": center, "band_q": (lo_q, hi_q),
                 "band_price_12m": (lo_v, hi_v), "n_selected": len(idx), "warnings": warnings}


def base_scenario(inv: Dict, unc: Dict, **override) -> Scenario:
    values = {k: unc[k][1] for k in UNCERTAIN_KEYS}
    values.update(override)
    return Scenario(
        gpus=int(inv["gpus"]), months=int(inv["months"]), capex_per_gpu=float(inv["capex_per_gpu"]),
        ramp_months=int(inv["ramp_months"]), residual_value_pct=float(inv["residual_value_pct"]),
        pricing_mode=inv["pricing_mode"], **{k: float(v) for k, v in values.items()},
    )


def draw_scenarios(cfg: Dict) -> List[Scenario]:
    """비시장 불확실 변수 추출. 시장 경로와 다른 난수열을 써서 경로 선택과 무관하게 고정된다."""
    inv, unc = cfg["investment"], cfg["uncertain"]
    rng = random.Random(f"{cfg['simulation']['seed']}-inputs")
    return [base_scenario(inv, unc, **{k: rng.triangular(unc[k][0], unc[k][2], unc[k][1]) for k in UNCERTAIN_KEYS})
            for _ in range(int(cfg["simulation"]["n_paths"]))]


def required_prices(cfg: Dict, paths, scenarios, idx: List[int]) -> List[float]:
    target = float(cfg["target_irr_annual"])
    return sorted(required_price(scenarios[i], paths[i], target) for i in idx)


def price_range(cfg: Dict, paths: List[List[float]], scenarios: List[Scenario], idx: List[int],
                extra_prices: Sequence[float] = (), irr_sample_cap: int = 1000) -> Dict:
    validate_config(cfg)
    inv, unc = cfg["investment"], cfg["uncertain"]
    target = float(cfg["target_irr_annual"])
    req = required_prices(cfg, paths, scenarios, idx)

    prices = sorted(set(list(cfg.get("candidate_prices", [])) + [p for p in extra_prices if p is not None]))
    sub = idx[:irr_sample_cap]
    candidates = []
    for p in prices:
        irrs = sorted(x for x in (irr_annual(net_flows(scenarios[i], paths[i], p)) for i in sub) if x is not None)
        candidates.append({
            "price": p, "prob_meet_target": prob_at_or_below(req, p),
            "irr_p10": quantile(irrs, 0.10) if irrs else None,
            "irr_p50": quantile(irrs, 0.50) if irrs else None,
            "irr_p90": quantile(irrs, 0.90) if irrs else None,
            "irr_sample_size": len(sub), "irr_undefined_count": len(sub) - len(irrs),
        })

    chosen = [paths[i] for i in idx]
    median_path = pointwise_quantile_path(chosen, 0.5)
    base = base_scenario(inv, unc)
    tornado = []
    for k in UNCERTAIN_KEYS:
        a = required_price(replace(base, **{k: float(unc[k][0])}), median_path, target)
        b = required_price(replace(base, **{k: float(unc[k][2])}), median_path, target)
        tornado.append({"input": k, "low_value": unc[k][0], "high_value": unc[k][2],
                        "required_at_low": a, "required_at_high": b, "swing": abs(b - a)})
    if inv["pricing_mode"] == "follow_market":
        a = required_price(base, pointwise_quantile_path(chosen, 0.10), target)
        b = required_price(base, pointwise_quantile_path(chosen, 0.90), target)
        tornado.append({"input": "market_path", "low_value": "P10", "high_value": "P90",
                        "required_at_low": a, "required_at_high": b, "swing": abs(b - a)})
    tornado.sort(key=lambda r: r["swing"], reverse=True)

    return {
        "required_sorted": req,
        "required_quantiles": {q: quantile(req, q) for q in (0.5, 0.7, 0.8, 0.9)},
        "candidates": candidates,
        "tornado": tornado,
        "base_required": required_price(base, median_path, target),
        "median_market_index": median_path,
    }


def scenario_comparison(cfg: Dict, paths, scenarios, last_price: float) -> List[Dict]:
    """세 시나리오를 나란히 비교 (같은 12개월 이후 추세 가정 하에서)."""
    rows = []
    for name in MARKET_SCENARIOS:
        idx, info = select_paths(paths, last_price, scenario=name)
        req = required_prices(cfg, paths, scenarios, idx)
        rows.append({"scenario": name, "price_12m": last_price * quantile(sorted(paths[i][ANCHOR_MONTH] for i in idx), 0.5),
                     "req_p50": quantile(req, 0.5), "req_p80": quantile(req, 0.8)})
    return rows


def prob_for_price(sorted_required: Sequence[float], price: Optional[float]) -> Optional[float]:
    return None if price is None else prob_at_or_below(sorted_required, price)
