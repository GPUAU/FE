"""검증: python3 -m unittest tests -v"""
import random
import unittest

from cashflow import Scenario, irr_annual, monthly_rate, net_flows, npv, required_price
from price_paths import StationaryBootstrap, simulate_index_paths
from pricing_range import (draw_scenarios, generate_paths, price_range, prob_at_or_below, quantile,
                           select_paths, validate_config)


def scenario(**kw):
    base = dict(gpus=8, months=36, capex_per_gpu=50000, capex_overrun=0.0, opex_per_gpu_month=800,
                opex_annual_inflation=0.03, utilization=0.7, ramp_months=3, residual_value_pct=0.1,
                pricing_mode="follow_market")
    base.update(kw)
    return Scenario(**base)


class IrrTests(unittest.TestCase):
    def test_known_monthly_irr(self):
        # -100 투자 후 1개월 뒤 101 → 월 1% → 연 (1.01^12 - 1)
        self.assertAlmostEqual(irr_annual([-100, 101]), 1.01 ** 12 - 1, places=8)

    def test_annuity_irr_matches_textbook(self):
        # 12개월 동안 매월 10 수령, 현재가치 = 10 × 연금현가계수(월 1%)
        r = 0.01
        pv = 10 * (1 - (1 + r) ** -12) / r
        self.assertAlmostEqual(irr_annual([-pv] + [10] * 12), (1 + r) ** 12 - 1, places=8)

    def test_no_sign_change_returns_none(self):
        self.assertIsNone(irr_annual([100, 10, 10]))


class RequiredPriceTests(unittest.TestCase):
    def setUp(self):
        rng = random.Random(1)
        self.idx = simulate_index_paths([-0.02, 0.01, -0.03, 0.0], 36, 1, rng)[0]

    def test_required_price_gives_zero_npv_and_target_irr(self):
        for mode in ("fixed", "follow_market"):
            s = scenario(pricing_mode=mode)
            p = required_price(s, self.idx, 0.15)
            flows = net_flows(s, self.idx, p)
            self.assertAlmostEqual(npv(flows, monthly_rate(0.15)), 0.0, delta=1e-4)
            self.assertAlmostEqual(irr_annual(flows), 0.15, places=6)

    def test_higher_target_needs_higher_price(self):
        s = scenario()
        self.assertGreater(required_price(s, self.idx, 0.20), required_price(s, self.idx, 0.10))

    def test_falling_market_needs_higher_start_price(self):
        s = scenario(pricing_mode="follow_market")
        flat = [1.0] * 37
        falling = [0.98 ** t for t in range(37)]
        self.assertGreater(required_price(s, falling, 0.15), required_price(s, flat, 0.15))


class SimulationTests(unittest.TestCase):
    cfg = {
        "simulation": {"n_paths": 300, "seed": 42, "mean_block_length": 3,
                       "jump_prob_per_month": 0.05, "jump_size_tri": [-0.3, -0.15, -0.05]},
        "investment": {"gpus": 8, "months": 36, "capex_per_gpu": 50000, "ramp_months": 3,
                       "residual_value_pct": 0.1, "pricing_mode": "follow_market"},
        "target_irr_annual": 0.15,
        "uncertain": {"utilization": [0.5, 0.7, 0.9], "capex_overrun": [0, 0.03, 0.1],
                      "opex_per_gpu_month": [700, 800, 1000], "opex_annual_inflation": [0.01, 0.03, 0.05]},
        "candidate_prices": [4.0, 6.0],
    }
    returns = [-0.03, 0.01, -0.02, -0.01, 0.02, -0.05, 0.0, -0.01]

    def _range(self, trend="keep", scenario="기준"):
        paths = generate_paths(self.cfg, self.returns, trend)
        sc = draw_scenarios(self.cfg)
        idx, info = select_paths(paths, 5.0, scenario=scenario)
        return paths, idx, info, price_range(self.cfg, paths, sc, idx, irr_sample_cap=50)

    def test_same_seed_same_result(self):
        a, b = self._range(), self._range()
        self.assertEqual(a[3]["required_sorted"], b[3]["required_sorted"])

    def test_first_12_months_identical_across_trends(self):
        p = {t: generate_paths(self.cfg, self.returns, t) for t in ("keep", "ease", "flat")}
        for i in range(20):
            self.assertEqual(p["keep"][i][:13], p["flat"][i][:13])
            self.assertEqual(p["keep"][i][:13], p["ease"][i][:13])

    def test_trend_options_order_after_12_months(self):
        # 과거 추세가 하락이면 36개월 후 중앙값: 유지 < 완화 < 멈춤
        med = {}
        for t in ("keep", "ease", "flat"):
            vals = sorted(p[36] for p in generate_paths(self.cfg, self.returns, t))
            med[t] = quantile(vals, 0.5)
        self.assertLess(med["keep"], med["ease"])
        self.assertLess(med["ease"], med["flat"])

    def test_scenario_selection_band(self):
        paths, idx, info, _ = self._range(scenario="보수")
        lo, hi = info["band_price_12m"]
        self.assertTrue(all(lo <= 5.0 * paths[i][12] <= hi for i in idx))
        self.assertAlmostEqual(len(idx) / len(paths), 0.20, delta=0.02)

    def test_lower_market_assumption_needs_higher_price(self):
        # 시장가 연동 방식: 시장가가 낮게 가정될수록 필요 판매가가 높다
        low = self._range(scenario="보수")[3]["required_quantiles"][0.5]
        high = self._range(scenario="낙관")[3]["required_quantiles"][0.5]
        self.assertGreater(low, high)

    def test_custom_price_outside_range_warns(self):
        paths = generate_paths(self.cfg, self.returns, "keep")
        _, info = select_paths(paths, 5.0, market_price_12m=0.01)
        self.assertTrue(info["warnings"])

    def test_probability_matches_irr_check(self):
        """달성 확률(필요가격 CDF)이 경로별 IRR ≥ 목표 비율과 일치하는지 직접 확인."""
        rng = random.Random(5)
        paths = simulate_index_paths(self.returns, 36, 200, rng, jump_prob_per_month=0.05,
                                     jump_size_tri=(-0.3, -0.15, -0.05))
        for price in (4.0, 6.0, 8.0):
            by_cdf = by_irr = 0
            for p in paths:
                s = scenario(utilization=rng.uniform(0.5, 0.9))
                by_cdf += required_price(s, p, 0.15) <= price
                by_irr += irr_annual(net_flows(s, p, price)) >= 0.15
            self.assertEqual(by_cdf, by_irr)
        res = self._range()[3]
        self.assertLessEqual(res["candidates"][0]["prob_meet_target"], res["candidates"][1]["prob_meet_target"])

    def test_invalid_triangular_rejected(self):
        bad = {**self.cfg, "uncertain": {**self.cfg["uncertain"], "utilization": [0.9, 0.7, 0.5]}}
        with self.assertRaises(ValueError):
            validate_config(bad)


class HelperTests(unittest.TestCase):
    def test_quantile_and_cdf(self):
        v = [1.0, 2.0, 3.0, 4.0, 5.0]
        self.assertEqual(quantile(v, 0.5), 3.0)
        self.assertEqual(quantile(v, 0.25), 2.0)
        self.assertEqual(prob_at_or_below(v, 3.0), 0.6)
        self.assertEqual(prob_at_or_below(v, 0.5), 0.0)

    def test_bootstrap_only_returns_series_values(self):
        b = StationaryBootstrap([0.1, 0.2, 0.3], 2)
        rng = random.Random(0)
        self.assertTrue(all(b.next(rng) in (0.1, 0.2, 0.3) for _ in range(100)))


class LowProbabilityWarningTests(unittest.TestCase):
    def test_warns_below_threshold(self):
        from run import low_probability_warning
        msg = low_probability_warning(0.189, 0.5)
        self.assertIn("목표 IRR 달성 확률이 낮은 가격입니다", msg)
        self.assertIn("18.9%", msg)

    def test_no_warning_at_or_above_threshold(self):
        from run import low_probability_warning
        self.assertIsNone(low_probability_warning(0.5, 0.5))
        self.assertIsNone(low_probability_warning(0.8, 0.5))
        self.assertIsNone(low_probability_warning(None, 0.5))


if __name__ == "__main__":
    unittest.main()
