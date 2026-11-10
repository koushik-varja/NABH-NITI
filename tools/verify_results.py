"""Check the archived evaluation's shape and recompute headline metrics.

This is a data-integrity check, not a guarantee of external validity.
"""
from __future__ import annotations
import csv
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean

ROOT=Path(__file__).resolve().parents[1]
CSV=ROOT/'results/full_1080_trials.csv'


def verify(path:Path=CSV)->dict:
    with path.open(newline='',encoding='utf-8-sig') as handle:
        rows=list(csv.DictReader(handle))
    assert len(rows)==1080, f'Expected 1,080 records, got {len(rows)}'
    scenarios={'congestion','medical','festival','storm','failure','selfish'}
    populations={'50','200','500'}
    modes={'static','central','nabh'}
    assert {r['scenario'] for r in rows}==scenarios
    assert {r['initial_population'] for r in rows}==populations
    assert {r['policy'] for r in rows}==modes
    assert {r['steps'] for r in rows}=={'28'}
    assert {r['ablation'] for r in rows}=={'none'}
    assert len({r['seed'] for r in rows})==20
    keys=[(r['scenario'],r['initial_population'],r['seed'],r['policy']) for r in rows]
    assert len(set(keys))==1080, 'Duplicate experiment condition'
    assert all(n==20 for n in Counter((r['scenario'],r['initial_population'],r['policy']) for r in rows).values())
    assert sum(int(r['safety_violations']) for r in rows)==0
    by_policy=defaultdict(list)
    for r in rows:by_policy[r['policy']].append(r)
    result={}
    for policy,group in sorted(by_policy.items()):
        result[policy]={k:mean(float(r[k]) for r in group) for k in ('completed','jain_fairness','p95_total_wait','messages')}
        assert len(group)==360
    # Study's recorded high-level means, tolerating only CSV rounding.
    expected={'static':(158.6917,0.973369), 'central':(157.5472,0.974537), 'nabh':(153.5972,0.977487)}
    for p,(completion,fairness) in expected.items():
        assert abs(result[p]['completed']-completion)<0.0001
        assert abs(result[p]['jain_fairness']-fairness)<0.00001
    return result


if __name__=='__main__':
    import json
    result = verify()
    print('PASS: 1,080 distinct, balanced, 28-tick records; zero recorded discrete safety breaches')
    print(json.dumps(result, indent=2))
