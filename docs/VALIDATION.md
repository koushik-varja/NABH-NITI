# Validation, Safety Boundaries, and Reproducibility

NABH-NITI is a **discrete research simulator**, not real-world UAV autopilot software. This document distinguishes test evidence from scientific or operational claims.

## Automated evidence

- The Python backend suite exercises deterministic seeds, A*, movement safety, stress events, norms, fairness ablations, REST API, WebSocket telemetry and counterfactual experiments. Run `cd backend && python -m pytest -q` (a fresh local regression result for this package is recorded in the accompanying handoff, not hardcoded as a future CI result).
- The frontend checks validate labels, policy references and representative 500-agent filtering; Vite/TypeScript builds are checked in `.github/workflows/frontend-build.yml`.
- `tools/verify_routing.py` independently compares 3D A* against BFS shortest routes. The archived `results/route_correctness_audit.json` reports 1,000/1,000 passing reference tests for its recorded seed; this checks **algorithmic grid routing** only.
- The archived `results/full_1080_trials.csv` contains 1,080 executed trials: six scenarios, three initial populations, three policies, twenty seeds, 28 ticks per trial. Zero discrete grid safety breaches were recorded in these runs.

## What the metrics mean

| Metric | Interpretation |
|---|---|
| `completed` | Completed simulated missions; agents may receive new missions |
| `p95_total_wait` | 95th-percentile accumulated waiting ticks of active UAVs |
| `jain_fairness` | Jain index of service/movement opportunity for active **nonmedical** UAVs |
| `messages` | Simplified logical communication count; **not** actual packets or bandwidth |
| `conflicts` | Contested destination cells before arbitration; **not** collisions |
| `safety_violations` | Failures of implemented discrete occupancy/boundary/no-fly checks |
| `throughput` | Completed missions divided by simulation ticks |

## Explicit limitations

- No continuous flight dynamics, real GPS/sensors, physical drone separation, packet loss/latency measurement, or detailed energy/aerodynamics. `battery` is a synthetic budget proxy; depleted agents hold rather than perform emergency landing.
- One or more visually drawn buildings may not correspond to a graph obstacle; the city is illustrative rather than surveyed 3D GIS data.
- Proposed norms are **heuristic, programmed policies**, not learned by machine learning. A 60% support rule models local consensus but is not a formal proof of an optimal negotiation equilibrium.
- Descriptive norm-effectiveness scores are not causal estimates. A policy that improves fairness in one synthetic experiment need not improve all scenarios or longer horizons.
- Real browser FPS and memory consumption must be measured on target hardware. A successful build and pure JavaScript visualization tests **do not measure** GPU performance.
- Real aviation regulations, flight certifications and physical flight safety are outside this prototype.

## Reproducibility

Run the commands in `README.md` using pinned input choices (scenario, population, seed, policy and steps). Compare independently computed CSV averages. The accompanying report uses only the archived trials and labels each comparison by its duration; separate live 90-tick runs must not be combined with the 28-tick batch means.
