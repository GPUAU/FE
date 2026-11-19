"""GPU 클라우드 상품 1건의 월별 현금흐름, NPV, IRR.

판매가 정의: 기준 판매가 P0(USD/GPU-시간).
 - pricing_mode = "fixed":         모든 월에 P0로 판매
 - pricing_mode = "follow_market": t월 판매가 = P0 × 시장가격 지수[t] (시장 하락을 따라 인하)
어느 쪽이든 매출은 P0에 비례하므로, 목표 IRR을 만족하는 P0를 닫힌 식으로 구할 수 있다.
"""
from dataclasses import dataclass
from typing import List, Optional

HOURS_PER_MONTH = 730.0


@dataclass(frozen=True)
class Scenario:
    """경로 1개에 대한 확정 입력값 (불확실 변수는 이미 추출된 값)."""
    gpus: int
    months: int
    capex_per_gpu: float          # USD, 0개월 차 일시 투자
    capex_overrun: float          # 0.05 = 5% 초과
    opex_per_gpu_month: float     # USD/GPU/월 (전력·상면·인건비 등)
    opex_annual_inflation: float  # 0.03 = 연 3%
    utilization: float            # 정상상태 유료 가동률 0~1
    ramp_months: int              # 정상 가동률까지 선형 증가 기간
    residual_value_pct: float     # 분석기간 종료 시 잔존가치 (투자비 대비)
    pricing_mode: str             # "fixed" | "follow_market"


def monthly_rate(annual: float) -> float:
    return (1.0 + annual) ** (1.0 / 12.0) - 1.0


def utilization_at(s: Scenario, t: int) -> float:
    if s.ramp_months <= 0:
        return s.utilization
    return s.utilization * min(1.0, t / s.ramp_months)


def revenue_per_unit_price(s: Scenario, idx: List[float]) -> List[float]:
    """P0 = 1 USD/GPU-시간일 때의 월별 매출. 실제 매출 = P0 × 이 값."""
    out = [0.0]
    for t in range(1, s.months + 1):
        price_factor = idx[t] if s.pricing_mode == "follow_market" else 1.0
        out.append(price_factor * s.gpus * HOURS_PER_MONTH * utilization_at(s, t))
    return out


def cost_flows(s: Scenario) -> List[float]:
    """월별 비용(양수) 흐름. 0개월 = 투자비, 마지막 달은 잔존가치를 차감."""
    capex = s.gpus * s.capex_per_gpu * (1.0 + s.capex_overrun)
    out = [capex]
    for t in range(1, s.months + 1):
        out.append(s.gpus * s.opex_per_gpu_month * (1.0 + s.opex_annual_inflation) ** ((t - 1) / 12.0))
    out[-1] -= capex * s.residual_value_pct
    return out


def net_flows(s: Scenario, idx: List[float], p0: float) -> List[float]:
    rev = revenue_per_unit_price(s, idx)
    cost = cost_flows(s)
    return [p0 * r - c for r, c in zip(rev, cost)]


def npv(flows: List[float], r_month: float) -> float:
    return sum(cf / (1.0 + r_month) ** t for t, cf in enumerate(flows))


def required_price(s: Scenario, idx: List[float], target_irr_annual: float) -> float:
    """목표 IRR로 할인한 NPV가 0이 되는 기준 판매가 P0 (USD/GPU-시간).

    NPV(P0) = P0 × PV(단위매출) − PV(비용) = 0  →  P0 = PV(비용) / PV(단위매출)
    """
    r = monthly_rate(target_irr_annual)
    pv_rev = npv(revenue_per_unit_price(s, idx), r)
    if pv_rev <= 0:
        return float("inf")
    return npv(cost_flows(s), r) / pv_rev


def irr_annual(flows: List[float], lo: float = -0.99, hi: float = 1.0, tol: float = 1e-10) -> Optional[float]:
    """월별 현금흐름의 IRR을 이분법으로 구해 연율로 반환. 부호 변화가 없으면 None."""
    f_lo, f_hi = npv(flows, lo), npv(flows, hi)
    if f_lo * f_hi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2.0
        f_mid = npv(flows, mid)
        if abs(f_mid) < tol or (hi - lo) < 1e-12:
            break
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    m = (lo + hi) / 2.0
    return (1.0 + m) ** 12 - 1.0
