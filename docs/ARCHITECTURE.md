# Architecture and Algorithms — NABH-NITI

## End-to-end system

```text
 React/TypeScript Command Center
 ├─ WebGL city + instanced 3D UAV bodies (React Three Fiber / Three.js)
 ├─ Five original high-detail glTF aircraft models (selected drone)
 ├─ Scenario Studio, altitude view, decision inspector, rules panel
 ├─ Timeline, black-box replay, real benchmark and counterfactual lab
 │
 │ WebSocket /ws: 0.55-second sampled telemetry
 │ HTTP POST: /action, /reset, /scenario/{name}
 │ HTTP GET: /compare, /counterfactual, /history, /state
 ▼
 FastAPI integration service
 ├─ one authoritative deterministic Simulator instance
 ├─ asyncio lock protecting state; background simulation clock
 ├─ ring-buffer replay frames (last 90 sampled frames)
 ├─ threadpool execution of paired benchmark and alternative-world forks
 └─ explicit input validation and JSON contracts
 ▼
 Simulation engine (one fixed tick per transition)
 ├─ Per-UAV independent state: mission, location, path, urgency, credits,
 │  bids, battery, progress, selfishness, explanation and waiting history
 ├─ 3D six-neighbor spatial graph and Manhattan A*
 ├─ Local-sector traffic observation (6 × 5 horizontal cells)
 ├─ Proposal candidates and bid/vote evaluation for adaptive norms
 │  ├─ medical_priority
 │  ├─ congestion_priority
 │  ├─ one_way_lane at a single altitude level
 │  └─ entry_quota for external sector admissions
 ├─ Sector norm memory, effectiveness observations, neighbor coordination
 ├─ Per-tick priority allocation (fixed / centralized / NABH-NITI)
 ├─ Safety shield (no occupied target left behind; no head-on exchanges)
 └─ Metrics + decision / negotiation / law audit log
 ▼
 Experiments / CSV / aggregate JSON / charts / science report
```

## Clock semantics

The world is a finite integer lattice (default `24 × 20 × 4`). `pos=(x,y,z)`; `z` is an **altitude index**, not meters. In each *simulated* tick, a drone may move at most one unit in one of the six axis directions. Its course may be delayed by competing requests, blocked by weather, or constrained by one-way norms. The React display draws continuous movement between discrete state updates. This interpolation **does not** establish continuous collision clearance.

### 3D A* routing

`Simulator.pathfind(source, target)` searches the 3D grid with six connected neighbors. The Manhattan heuristic is admissible for unit-cost, axis-aligned moves and yields shortest **topological** paths through the current no-fly mask. Plans are cached and recalculated on blockage, mission change, or queue escape. Collision-free movement is decided *after* pathfinding.

### One-tick movement allocation and safety

1. Each UAV submits the next position on its route. After persistent queuing, it may propose a legal unoccupied neighboring position that improves progress.
2. Each requested node ranks competing agents by the current policy. **Fixed** uses a permanent deterministic ID priority; **centralized** uses mission priority, deadline, and wait state; **NABH-NITI** augments that with active local norms, fairness credits, and any strategic bidding behavior.
3. Local sector admission quotas may reject otherwise valid cross-border moves.
4. The safety shield repeatedly cancels candidates whose destination remains occupied or which form a two-UAV head-on edge swap. It iterates until those conflicts are eliminated.
5. Approved moves are committed together. The engine asserts that no two agents occupy the same grid node, no closed node is entered, and all agents remain in bounds.

**Limitation:** There is no continuous swept-volume or aerodynamic/physical collision check. A frame-to-frame move being safe under this lattice abstraction does not certify physically safe flight, especially for aircraft with nonzero rotor span.

### Norm lifecycle

```text
sector observation → candidate proposal → local votes / bidding →
consensus threshold → immutable safety constraints → active temporary norm →
observed waiting fraction → expiry/blackout → cooldown → rule memory
```

Each norm has a rule ID, sector, kind, proposal count/support, proposer, list of sample bids, activation tick, expiry tick, directional or quota parameters, observed sector waiting and descriptive effectiveness score. The engine compares observed sector waiting against the rate at activation; this is an observational indicator, **not a causal effect**. Norm memory may weakly influence future candidate selection. Cooldowns reduce immediate oscillation.

Neighboring sector agents align simultaneous one-way directions where a shared boundary is involved. No negotiated rule may bypass the separate safety shield.

### Fairness credits

Each agent starts with five credits. Waiting agents gain up to a ceiling of 15 credits; successful movement spends one. Under NABH-NITI, credits influence bids but cannot override the safety shield. Emergency agents also receive mission urgency and medical-priority protection. Disable this mechanism with the fairness ablation to study whether waiting opportunity becomes less even or throughput changes.

### Faults, weather and selfish strategies

- A **storm** closes a region's grid nodes, except nodes occupied at the moment the restriction begins; active UAVs must not enter newly restricted cells. The restriction can later be cleared.
- A **sector blackout** halts local norm proposals and retires affected norms; UAVs keep safe basic route allocation. A UAV failure removes one aircraft and logs the loss.
- **Selfish UAVs** inflate their bids; they cannot violate hard separation.
- **Festival/congestion** events add new missions. A medical event injects urgent aircraft.

**Important limitation:** This is a synchronous discrete-agent simulator with abstract logical message counts and a localized radio-failure policy. It does not model real packet propagation, radio physics, congestion-control protocols, aircraft dynamics, or certified failure recovery guarantees. Those would require a larger, separate research project.

## Why the three modes are comparable

All modes use the **same underlying graph, safety checks, mission generation and random seeds**. Differences are in allocation and the ability to formulate local temporary laws. Fair comparison is provided through independent `Simulator` instances created with identical seed and initial population; the same timed event is injected into every copy. We explicitly do not claim that every mode has equal informational/computational complexity; interpreting overhead requires noting this modeling choice.

### Counterfactual branch

`GET /counterfactual` deep-copies the currently running Python simulator, including RNG state, per-agent state, active rules and tick. It changes the governance policy independently in three clones and executes the same number of future ticks. The original live simulator is untouched. This is stronger than comparing three unrelated random starts.

## UI rendering strategy

- A fully rendered procedural city with hospital depot and logistics depot.
- The 50–500 drone fleet is drawn using a small number of `THREE.InstancedMesh` buffers for fuselages, structural arms, rotor motors, rotating blades, landing skids and payloads.
- Upon selection, the aircraft switches to one of five original detailed locally bundled `GLB` assets. Cargo uses six rotors; other classes have class-specific payload/gimbal/antenna geometry.
- A separate real-time Three.js layer draws flight-level planes, traffic laws, storm volume, sample communication edges, flight routes and the selected drone's separation bubble.
- The user's laptop's actual browser and GPU determine achievable frame rate; no performance guarantee is implied by the population slider.

## Data and reproducibility

Experiment inputs are the policy, scenario, population, random seed and number of ticks. The runner writes each execution separately to CSV and computes grouped summary means/standard deviations. The full preset is `3 policies × 3 populations × 6 scenario families × 20 seeds = 1,080` paired-condition episodes (three results per `(scenario,population,seed)` group). The live telemetry history is bounded and intentionally not a durable database.
