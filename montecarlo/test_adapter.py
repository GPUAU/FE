"""Adapter validation plus regression against the PM ZIP's saved reference outputs."""
import copy
import json
import unittest
from pathlib import Path
from service import DEFAULT, calculate, validated

class AdapterTests(unittest.TestCase):
    def test_pm_reference_forecast_and_pricing(self):
        f = calculate('forecast', {'config': DEFAULT})
        self.assertEqual(len(f['monthly']), 12)
        # Exact saved PM run, seed 20261118, 20,000 paths, 48-month horizon.
        self.assertAlmostEqual(f['monthly'][11]['p50'], 3.2176694284615026, places=12)
        for r in f['monthly']:
            self.assertTrue(0 < r['p10'] <= r['p25'] <= r['p50'] <= r['p75'] <= r['p90'])
        p = calculate('pricing', {'config': DEFAULT, 'selection': {'scenario':'기준','post12_trend':'ease'}})
        self.assertAlmostEqual(p['required_quantiles'][.5], 7.326393241985261, places=12)
        self.assertAlmostEqual(p['required_quantiles'][.8], 8.269642977741617, places=12)
        self.assertEqual(p['meta']['config_hash'], f['meta']['config_hash'])
        # Inclusive quantile boundaries retain one tied sample in the PM fixture.
        self.assertEqual(p['selection']['n_selected'], 4001)
        self.assertTrue(all(x['irr_undefined_count'] == 0 for x in p['candidates']))
        self.assertEqual(sorted(x['prob_meet_target'] for x in p['candidates']),
                         [x['prob_meet_target'] for x in p['candidates']])

    def test_repeatable_forecast_and_seed_change(self):
        c = copy.deepcopy(DEFAULT); c['simulation']['n_paths'] = 1000
        first = calculate('forecast', {'config':c})['monthly']
        self.assertEqual(first, calculate('forecast', {'config':c})['monthly'])
        c['simulation']['seed'] += 1
        self.assertNotEqual(first, calculate('forecast', {'config':c})['monthly'])

    def test_reject_invalid_inputs(self):
        cases = [('simulation','mean_block_length',0),('simulation','n_paths',50001),
                 ('simulation','n_paths',1000.1),('simulation','jump_prob_per_month',1.1),
                 ('simulation','jump_size_tri',[-1,-.2,0]),('investment','gpus',0),
                 ('investment','capex_per_gpu',float('nan')),('investment','months',61),
                 ('uncertain','utilization',[0,.5,1]),('uncertain','utilization',[.8,.5,1]),
                 ('uncertain','opex_per_gpu_month',[-1,5,10])]
        for section, key, value in cases:
            with self.subTest(key=key,value=value):
                c=copy.deepcopy(DEFAULT);c[section][key]=value
                with self.assertRaises(ValueError):validated(c)

    def test_provenance_cannot_be_relabelled(self):
        c=copy.deepcopy(DEFAULT);c['meta']['is_sample']=False;c['market']['history_csv']='/etc/passwd'
        self.assertTrue(validated(c)['meta']['is_sample'])
        self.assertEqual(validated(c)['market']['history_csv'],'sample_price_history.csv')

    def test_ambiguous_selection_rejected(self):
        with self.assertRaises(ValueError):
            calculate('pricing',{'config':DEFAULT,'selection':{'scenario':'기준','market_price_12m':3,'post12_trend':'ease'}})

    def test_constant_price_input_remains_degenerate_without_jumps(self):
        import random
        from price_paths import simulate_index_paths
        p=simulate_index_paths([0]*17,12,10,random.Random(1))
        self.assertEqual(p,[[1]*13]*10)

if __name__ == '__main__':unittest.main()
