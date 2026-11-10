# Reproducible Experiment Protocol and Observations

## Experiment design

The archived full study used 6 scenarios (`congestion`, `medical`, `festival`, `storm`, `failure`, `selfish`), 3 starting populations (50, 200, 500), 3 policies (`static`, `central`, `nabh`) and 20 random seeds. Each experiment lasted 28 simulation ticks. Normal traffic is implemented as a simulator configuration but was **not separately included** in this six-condition archived full batch.

All policies use the same synthetic map, initial configurations (matched seeds), scripted event timing and discrete safety shield. The implementation's pseudo-random branching may diverge after policies make different decisions, as expected. This is a short-horizon experimental comparison.

```bash
cd backend
python -m nabhniti.experiments --preset full --steps 28 --workers 4 --out ../results/full_1080_trials.csv
```

The CSV and a generated `.summary.json` are included in `results/`; they can be regenerated from the code, subject to the exact software revision and dependency environment.

## Recorded aggregate results

| Average | Fixed | Centralized | NABH-NITI |
|---|---:|---:|---:|
| Completed missions | 158.6917 | 157.5472 | 153.5972 |
| Jain fairness | 0.973369 | 0.974537 | 0.977487 |
| p95 total wait (ticks) | 11.1944 | 11.1361 | 10.7278 |
| Logical messages | 0 | 15,365 | 4,475.7861 |
| Safety invariant breaches | 0 | 0 | 0 |

NABH-NITI slightly increased mean fairness and lowered mean p95 waiting in this dataset relative to centralized control, but its mean completion count was lower. Fixed Rules led throughput on average. Messages are modeled accounting costs, not measured network traffic.

## What to avoid claiming

- Do not mix the website's 90-tick, seed-specific benchmark with the 28-tick 1,080-trial averages.
- Do not call zero **discrete** invariant breaches real-world collision-free flight certification.
- Do not claim autonomous real-world UAV control, proven physical energy efficiency, or learned AI norms.
- The full archived batch is not a multi-seed ablation study; the UI ablations are separate selectable comparisons.

Inspect the archived charts in `results/plots/` or analyze `results/full_1080_trials.csv` directly; run `python tools/verify_results.py` for integrity checks. The principal academic report is [`../reports/AstraDynamicsReport.pdf`](../reports/AstraDynamicsReport.pdf).
