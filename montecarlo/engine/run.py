"""GPU 판매가 의사결정 지원 (몬테카를로 프로토타입). Python 3.9 표준 라이브러리만 사용.

1단계 — 시장가격 변동 범위와 근거 확인
    python3 run.py forecast config_sample.json
    → out/forecast.md, out/forecast.json

2단계 — 담당자가 고른 시장가 가정으로 판매가 범위 계산 (여러 번 바꿔 가며 실행 가능)
    python3 run.py price config_sample.json --market-scenario 기준 --post12-trend ease
    python3 run.py price config_sample.json --market-price-12m 3.40 --post12-trend flat
    → out/pricing.md, out/pricing.json

3단계 — 최종 결정 기록 (담당자가 판매가를 확정할 때만)
    python3 run.py price config_sample.json --market-scenario 기준 --post12-trend ease \
        --final-price 7.50 --decided-by "홍길동" --reason "..."
    → out/decision_log.jsonl 에 한 줄 추가
"""
import argparse
import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from price_paths import MIN_RECOMMENDED_RETURNS, POST12_TRENDS, load_history, log_returns  # noqa: E402
from pricing_range import (  # noqa: E402
    ANCHOR_MONTH, MARKET_SCENARIOS, SELECTION_BAND, UNCERTAIN_LABELS, draw_scenarios, generate_paths,
    history_evidence, market_ranges, price_range, prob_for_price, scenario_comparison, select_paths,
    validate_config,
)

MODEL_VERSION = "0.3.0-prototype"
TREND_SHORT = {"keep": "과거 추세 유지", "ease": "점차 완화", "flat": "추세 멈춤"}
DEFAULT_LOW_PROB_THRESHOLD = 0.5


def low_probability_warning(prob, threshold):
    """최종 판매가의 목표 IRR 달성 확률이 기준 미만이면 경고 문구를 돌려준다. 결정은 막지 않는다."""
    if prob is None or prob >= threshold:
        return None
    return (f"목표 IRR 달성 확률이 낮은 가격입니다. 이 판매가의 달성 확률은 {prob * 100:.1f}%로, "
            f"경고 기준 {threshold * 100:.0f}%보다 낮습니다. 담당자는 이 위험을 확인한 뒤 결정했습니다.")


# ---------------------------------------------------------------- 형식 도우미

def pct(x) -> str:
    return "—" if x is None else f"{x * 100:.1f}%"


def usd(x) -> str:
    return "—" if x is None else f"${x:,.2f}"


def sha16(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


def banner(cfg) -> list:
    L = ["> **대외비** — 내부 투자비·운영비·목표 IRR이 포함될 수 있습니다. 외부 LLM·외부 서비스로 전송하지 마세요."]
    if cfg["meta"].get("is_sample"):
        L += [">", "> **샘플 데이터** — 모든 입력값과 가격 이력은 동작 확인용 가상값입니다. 실제 의사결정에 쓰지 마세요."]
    return L + [""]


def run_info(cfg, ctx) -> list:
    sim = cfg["simulation"]
    return [
        "| 항목 | 값 |", "|---|---|",
        f"| 상품 | {cfg['meta']['product']} |",
        f"| 데이터 기준일 | {cfg['meta']['data_asof']} |",
        f"| 모델 버전 | {MODEL_VERSION} |",
        f"| 반복 횟수 / 난수 시드 | {sim['n_paths']:,}회 / {sim['seed']} |",
        f"| 가격 이력 파일 해시 / 설정 파일 해시 | {ctx['history_hash']} / {ctx['config_hash']} |",
        f"| 실행 시각 | {ctx['run_at']} |",
        "",
    ]


def load(config_path: str):
    with open(config_path, encoding="utf-8") as f:
        cfg = json.load(f)
    validate_config(cfg)
    hist = os.path.join(os.path.dirname(os.path.abspath(config_path)), cfg["market"]["history_csv"])
    months, prices = load_history(hist)
    ctx = {"history_hash": sha16(hist), "config_hash": sha16(config_path),
           "run_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    return cfg, months, prices, log_returns(prices), ctx


def write(out_dir: str, name: str, text: str) -> str:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


# ---------------------------------------------------------------- 1단계

def cmd_forecast(args) -> int:
    cfg, months, prices, returns, ctx = load(args.config)
    sim = cfg["simulation"]
    horizons = cfg.get("forecast", {}).get("horizons", [3, 6, 12])
    last = prices[-1]
    ev = history_evidence(months, prices, returns)
    analysis_months = int(cfg["investment"]["months"])

    paths_by_trend = {t: generate_paths(cfg, returns, t) for t in POST12_TRENDS}
    near = market_ranges(paths_by_trend["keep"], last, horizons)
    far_points = [m for m in (24, 36, 48, 60) if m <= analysis_months]
    if analysis_months not in far_points:
        far_points.append(analysis_months)
    far = {t: market_ranges(p, last, far_points) for t, p in paths_by_trend.items()}
    vals12 = next(r for r in near if r["month"] == ANCHOR_MONTH) if ANCHOR_MONTH in horizons else \
        market_ranges(paths_by_trend["keep"], last, [ANCHOR_MONTH])[0]

    L = ["# 1단계 · 시장가격 변동 범위 (몬테카를로)", ""] + banner(cfg)
    L += ["이 보고서는 시장가를 한 값으로 정하지 않습니다. 변동 범위와 근거를 보고 **담당자가 2단계에서 "
          "시장가 가정을 선택**합니다.", "", "## 1. 실행 정보", ""] + run_info(cfg, ctx)

    L += ["## 2. 시장가격 변동 범위 (USD/GPU-시간)", "",
          f"기준: 최근 시장 대표가 {usd(last)} ({ev['last_month']})", "",
          "| 시점 | P10 | P25 | 중앙값 | P75 | P90 | 지금보다 낮을 확률 |", "|---|---|---|---|---|---|---|"]
    for r in near:
        L.append(f"| {r['month']}개월 후 | {usd(r['p10'])} | {usd(r['p25'])} | {usd(r['p50'])} | "
                 f"{usd(r['p75'])} | {usd(r['p90'])} | {pct(r['prob_below_now'])} |")
    L += ["", "P10~P90: 시뮬레이션 경로의 80%가 이 사이에 있다는 뜻입니다. 예측 정확도를 뜻하지 않습니다.", ""]

    L += ["## 3. 범위의 근거", "", "| 근거 | 값 |", "|---|---|",
          f"| 사용한 가격 이력 | {ev['first_month']} ~ {ev['last_month']} ({ev['n_months']}개월), "
          f"{usd(ev['first_price'])} → {usd(ev['last_price'])} |",
          f"| 과거 월평균 변화율 | {pct(ev['monthly_mean_change'])} (연 환산 {pct(ev['annualized_trend'])}) |",
          f"| 과거 월 변동성 (로그 변화율 표준편차) | {pct(ev['monthly_volatility'])} |",
          f"| 하락한 달의 비율 | {pct(ev['down_month_share'])} |",
          f"| 가장 큰 월 하락 | {ev['worst_month']} {pct(ev['worst_month_change'])} |",
          f"| 생성 방식 | 과거 월별 변화율을 평균 {sim['mean_block_length']}개월 블록으로 재추출 (연속 하락·상승 패턴 보존) |",
          f"| 이벤트 점프 가정 | 월 {pct(sim.get('jump_prob_per_month', 0))} 확률로 가격 변화 "
          f"{sim.get('jump_size_tri')} (최소·최빈·최대, 삼각분포) — 이력에 없는 차세대 출시 등 반영 |",
          ""]
    lim = []
    if ev["n_months"] - 1 < MIN_RECOMMENDED_RETURNS:
        lim.append(f"이력이 {ev['n_months']}개월로 권장 최소 24개월보다 짧습니다. 범위가 실제 불확실성보다 "
                   "좁게 나올 수 있고, 백테스트로 정확도를 검증하지 않았습니다.")
    lim.append("과거에 없던 수준의 변화는 이벤트 점프 가정으로만 반영됩니다.")
    L += ["**한계**", ""] + [f"- {x}" for x in lim] + [""]

    L += [f"## 4. 12개월 이후 추세 가정 (분석기간 {analysis_months}개월용)", "",
          "미래가격 예측의 검증 범위는 12개월입니다. 그 이후 구간은 아래 세 가정 중 **담당자가 선택**합니다. "
          "12개월까지의 범위는 세 가정 모두 같습니다.", ""]
    head = "| 가정 | 설명 | " + " | ".join(f"{m}개월 후 중앙값 (P10~P90)" for m in far_points) + " |"
    L += [head, "|---|---|" + "---|" * len(far_points)]
    for t, desc in POST12_TRENDS.items():
        cells = " | ".join(f"{usd(r['p50'])} ({usd(r['p10'])}~{usd(r['p90'])})" for r in far[t])
        L.append(f"| `{t}` {TREND_SHORT[t]} | {desc.split(' — ')[1]} | {cells} |")
    L += ["", "선택 참고: 신규 GPU 가격은 출시 초기에 빠르게 떨어진 뒤 완만해지는 경우가 많습니다. 이전 세대"
          "(H100·A100 등) 가격 이력이 확보되면 그 패턴과 비교해 선택 근거를 보강하세요.", ""]

    L += ["## 5. 2단계 시장가 가정 선택 제안", "",
          f"판매자 입장에서는 시장가가 낮을수록 보수적인 가정입니다. 선택한 수준의 분위 ±{int(SELECTION_BAND * 100)}%p "
          "안에 드는 경로만 판매가 계산에 사용합니다.", "",
          "| 선택지 | 12개월 후 시장가 | 이런 경우 검토 |", "|---|---|---|",
          f"| `보수` | {usd(vals12['p25'])} (P25) | 경쟁 심화, 공급 확대, 차세대 출시가 예정된 경우 |",
          f"| `기준` | {usd(vals12['p50'])} (중앙값) | 특별한 추가 정보가 없는 경우 |",
          f"| `낙관` | {usd(vals12['p75'])} (P75) | 공급 부족, 수요 급증 근거가 있는 경우 |",
          f"| 직접 입력 | {usd(vals12['p10'])} ~ {usd(vals12['p90'])} 안 권장 | 별도 근거(공급사 공지, 계약 정보 등)가 있는 경우 |",
          "", "다음 단계 실행 예:", "", "```bash",
          f"python3 run.py price {os.path.basename(args.config)} --market-scenario 기준 --post12-trend ease",
          "```", ""]

    path = write(args.out, "forecast.md", "\n".join(L))
    write(args.out, "forecast.json", json.dumps(
        {"meta": {**ctx, "model_version": MODEL_VERSION, "seed": sim["seed"], "n_paths": sim["n_paths"],
                  "data_asof": cfg["meta"]["data_asof"]},
         "evidence": ev, "ranges": near, "post12": far}, ensure_ascii=False, indent=2))
    print("\n".join(L))
    print(f"\n[저장] {path}")
    return 0


# ---------------------------------------------------------------- 2·3단계

def cmd_price(args) -> int:
    cfg, months, prices, returns, ctx = load(args.config)
    if args.final_price is not None and (not args.decided_by or not args.reason):
        print("최종 판매가를 기록하려면 --decided-by 와 --reason 이 필요합니다.", file=sys.stderr)
        return 2
    inv = cfg["investment"]
    target = float(cfg["target_irr_annual"])
    last = prices[-1]

    paths = generate_paths(cfg, returns, args.post12_trend)
    scenarios = draw_scenarios(cfg)
    idx, sel = select_paths(paths, last, scenario=args.market_scenario, market_price_12m=args.market_price_12m)
    res = price_range(cfg, paths, scenarios, idx, extra_prices=[args.final_price])
    comp_rows = scenario_comparison(cfg, paths, scenarios, last)
    q = res["required_quantiles"]
    req = res["required_sorted"]
    follow = inv["pricing_mode"] == "follow_market"

    L = ["# 2단계 · 선택한 시장가 가정에 따른 판매가 추천 범위", ""] + banner(cfg)
    L += ["## 1. 담당자 선택 사항", "", "| 항목 | 선택 |", "|---|---|",
          f"| 시장가 가정 | {sel['label']} |",
          f"| 사용 경로 | 12개월 후 시장가 {usd(sel['band_price_12m'][0])} ~ {usd(sel['band_price_12m'][1])} "
          f"(분위 P{sel['band_q'][0] * 100:.0f}~P{sel['band_q'][1] * 100:.0f}), {sel['n_selected']:,}개 경로 |",
          f"| 12개월 이후 추세 | `{args.post12_trend}` {POST12_TRENDS[args.post12_trend]} |",
          f"| 목표 IRR(연) | {pct(target)} |",
          f"| 분석기간 / GPU 수 | {inv['months']}개월 / {inv['gpus']}개 |",
          "| 판매가 방식 | " + ("시장가 연동 (기준 판매가 × 시장 지수, 매월 조정)" if follow else "분석기간 고정가") + " |",
          ""]
    for w in sel["warnings"]:
        L += [f"> ⚠ {w}", ""]
    L += ["## 2. 실행 정보", ""] + run_info(cfg, ctx)

    L += ["## 3. 목표 IRR 달성 확률별 기준 판매가", "",
          "선택한 시장가 가정 아래에서, 기준 판매가가 아래 값 이상이면 해당 비율의 경로에서 목표 IRR을 달성합니다.", "",
          "| 목표 IRR 달성 확률 | 필요 기준 판매가 |", "|---|---|"]
    for k in (0.5, 0.7, 0.8, 0.9):
        L.append(f"| {int(k * 100)}% | {usd(q[k])} |")
    L += ["", f"**추천 범위 하한 후보**: {usd(q[0.5])} (달성 확률 50%) ~ {usd(q[0.8])} (80%). "
          "하한을 몇 % 기준으로 둘지, 상한을 어떻게 정할지는 팀 확정이 필요합니다.", ""]

    L += ["## 4. 시장 참고값과 비교", "", "| 구분 | 가격 | 이 판매가의 목표 IRR 달성 확률 |", "|---|---|---|",
          f"| 최근 시장 대표가 ({months[-1]}) | {usd(last)} | {pct(prob_for_price(req, last))} |"]
    for name, p in cfg["market"].get("competitor_prices", {}).items():
        L.append(f"| 경쟁사 공개가: {name} | {usd(p)} | {pct(prob_for_price(req, p))} |")
    sel_mid = last * res["median_market_index"][ANCHOR_MONTH]
    L.append(f"| 선택한 가정의 12개월 후 시장가 (중앙) | {usd(sel_mid)} | — |")
    if not follow:
        L += ["", "고정가 방식에서는 시장가 가정이 필요 판매가 자체를 바꾸지 않습니다. 대신 판매가가 12개월 후 "
              f"예상 시장가({usd(sel_mid)})보다 얼마나 높은지를 경쟁력 판단 근거로 보세요."]
    L += ["", "## 5. 시장가 가정별 비교 (같은 12개월 이후 추세 가정)", "",
          "| 시장가 가정 | 12개월 후 시장가 (중앙) | 필요 판매가 (달성 50%) | 필요 판매가 (달성 80%) |", "|---|---|---|---|"]
    for r in comp_rows:
        mark = " ← 선택" if args.market_scenario == r["scenario"] else ""
        L.append(f"| {r['scenario']}{mark} | {usd(r['price_12m'])} | {usd(r['req_p50'])} | {usd(r['req_p80'])} |")
    L.append("")

    if res["candidates"]:
        n_irr = res["candidates"][0]["irr_sample_size"]
        L += ["## 6. 후보 판매가 평가", "",
              f"달성 확률은 선택 경로 전체, IRR 분포는 그중 {n_irr:,}개 경로 기준입니다.", "",
              "| 후보 기준 판매가 | 목표 IRR 달성 확률 | IRR P10 | IRR 중앙값 | IRR P90 |", "|---|---|---|---|---|"]
        for c in res["candidates"]:
            mark = " ← 최종 입력" if args.final_price is not None and abs(c["price"] - args.final_price) < 1e-9 else ""
            L.append(f"| {usd(c['price'])}{mark} | {pct(c['prob_meet_target'])} | {pct(c['irr_p10'])} | "
                     f"{pct(c['irr_p50'])} | {pct(c['irr_p90'])} |")
        L.append("")

    L += ["## 7. 민감도 (필요 판매가 기준)", "",
          f"기준 시나리오(불확실 변수 최빈값 + 선택 구간 시장 중앙 경로)의 필요 판매가: **{usd(res['base_required'])}**", "",
          "| 변수 | 최소일 때 | 최대일 때 | 변동폭 |", "|---|---|---|---|"]
    for t in res["tornado"]:
        L.append(f"| {UNCERTAIN_LABELS[t['input']]} ({t['low_value']} → {t['high_value']}) | "
                 f"{usd(t['required_at_low'])} | {usd(t['required_at_high'])} | {usd(t['swing'])} |")
    L += ["", "## 8. 가정과 한계", ""]
    lim = []
    if len(months) - 1 < MIN_RECOMMENDED_RETURNS:
        lim.append(f"가격 이력이 {len(months)}개월로 권장 최소(24개월)보다 짧습니다.")
    lim += [
        "시장가 이외의 불확실 변수(가동률·투자비 초과·운영비·운영비 상승률)는 서로 독립인 삼각분포로 가정했습니다.",
        "판매가가 가동률(수요)에 미치는 영향(가격탄력성)은 반영하지 않았습니다.",
        "세금·자금조달을 반영하지 않은 프로젝트 기준(세전·무차입) IRR입니다.",
        "백테스트와 기준 모델 비교는 아직 수행하지 않았습니다.",
    ]
    L += [f"- {x}" for x in lim] + [""]
    L += ["## 9. 의사결정 안내", "",
          "시스템은 시장가와 판매가를 확정하지 않습니다. 시장가 가정과 최종 판매가는 **담당자가 결정**하며, "
          "이 결과는 손실 가능성을 줄이기 위한 근거이지 손실이 없음을 보장하지 않습니다.", ""]

    decision = None
    if args.final_price is not None:
        threshold = float(cfg.get("decision", {}).get("low_probability_threshold", DEFAULT_LOW_PROB_THRESHOLD))
        final_prob = prob_for_price(req, args.final_price)
        warning = low_probability_warning(final_prob, threshold)
        decision = {
            "decided_at": ctx["run_at"], "decided_by": args.decided_by, "reason": args.reason,
            "market_assumption": sel["label"], "market_band_12m": sel["band_price_12m"],
            "post12_trend": args.post12_trend, "final_price": args.final_price,
            "prob_meet_target_at_final": final_prob,
            "low_probability_threshold": threshold,
            "low_probability_warning": warning is not None,
            "warning_message": warning,
            "target_irr_annual": target, "required_p50": q[0.5], "required_p80": q[0.8],
            "model_version": MODEL_VERSION, "seed": cfg["simulation"]["seed"],
            "n_paths": cfg["simulation"]["n_paths"], "n_selected": sel["n_selected"],
            "history_hash": ctx["history_hash"], "config_hash": ctx["config_hash"],
            "data_asof": cfg["meta"]["data_asof"],
        }
        os.makedirs(args.out, exist_ok=True)
        with open(os.path.join(args.out, "decision_log.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(decision, ensure_ascii=False) + "\n")
        L += ["## 10. 결정 기록", ""]
        if warning:
            L += [f"> ⚠ **{warning}**", ">",
                  f"> 참고: 달성 확률 50% 판매가는 {usd(q[0.5])}, 80% 판매가는 {usd(q[0.8])}입니다.", ""]
        L += ["| 항목 | 값 |", "|---|---|",
              f"| 결정자 / 시각 | {args.decided_by} / {ctx['run_at']} |",
              f"| 최종 기준 판매가 | {usd(args.final_price)} (목표 IRR 달성 확률 {pct(final_prob)}) |",
              f"| 저확률 경고 | {'표시됨 (기준 ' + pct(threshold) + ' 미만)' if warning else '해당 없음 (기준 ' + pct(threshold) + ' 이상)'} |",
              f"| 선택 사유 | {args.reason} |",
              "| 저장 위치 | decision_log.jsonl |", ""]
        if warning:
            # 보고서 맨 위에도 경고를 올려 놓치지 않게 한다
            L.insert(2, f"> ⚠ **{warning}** (10절 결정 기록 참조)")
            L.insert(3, "")

    path = write(args.out, "pricing.md", "\n".join(L))
    out = {k: v for k, v in res.items() if k not in ("required_sorted", "median_market_index")}
    out["required_quantiles"] = {str(k): v for k, v in out["required_quantiles"].items()}
    out.update({"selection": sel, "post12_trend": args.post12_trend, "scenario_comparison": comp_rows,
                "decision": decision, "meta": {**ctx, "model_version": MODEL_VERSION}})
    write(args.out, "pricing.json", json.dumps(out, ensure_ascii=False, indent=2))
    print("\n".join(L))
    print(f"\n[저장] {path}")
    if decision and decision["low_probability_warning"]:
        print(f"\n[경고] {decision['warning_message']}", file=sys.stderr)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="GPU 판매가 의사결정 지원 (몬테카를로)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("forecast", help="1단계: 시장가격 변동 범위와 근거")
    f.add_argument("config")
    f.add_argument("--out", default="out")
    f.set_defaults(func=cmd_forecast)

    p = sub.add_parser("price", help="2단계: 선택한 시장가 가정으로 판매가 범위 계산")
    p.add_argument("config")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--market-scenario", choices=list(MARKET_SCENARIOS))
    g.add_argument("--market-price-12m", type=float, help="12개월 후 시장가 직접 입력 (USD/GPU-시간)")
    p.add_argument("--post12-trend", choices=list(POST12_TRENDS), required=True)
    p.add_argument("--final-price", type=float, help="담당자가 확정한 기준 판매가 (입력 시 결정 기록)")
    p.add_argument("--decided-by")
    p.add_argument("--reason")
    p.add_argument("--out", default="out")
    p.set_defaults(func=cmd_price)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
