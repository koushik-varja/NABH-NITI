from nabhniti.core import Simulator

def test_initial_positions_unique_and_safe():
    sim=Simulator(drones=200, seed=3)
    positions=[d.pos for d in sim.drones.values()]
    assert len(positions)==len(set(positions))
    assert len(positions)==200
    for _ in range(12):
        sim.step()
    assert sim.tick==12
    assert all(d.battery >= 0 for d in sim.drones.values())

def test_seed_is_reproducible():
    a=Simulator(drones=35,seed=22)
    b=Simulator(drones=35,seed=22)
    for _ in range(20):
        a.step();b.step()
    assert a.snapshot()==b.snapshot()

def test_governance_modes_produce_valid_states():
    for mode in ('static','central','nabh'):
        sim=Simulator(drones=55,seed=11,mode=mode)
        for _ in range(15): sim.step()
        assert sim.metrics()['active']==55

def test_storm_blocking_keeps_invariants():
    sim=Simulator(drones=120,seed=8)
    sim.action('storm')
    for _ in range(30): sim.step()
    assert len({d.pos for d in sim.drones.values()}) == 120
    assert all(d.pos not in sim.weather_blocked for d in sim.drones.values())

def test_action_injection_and_credits_range():
    sim=Simulator(drones=100,seed=1)
    sim.action('emergency')
    sim.action('selfish',0.4)
    sim.action('blackout')
    assert sim.metrics()['active']==101
    for _ in range(25): sim.step()
    assert all(0 <= d.credits <= 15 for d in sim.drones.values())


def test_invalid_mode_rejected():
    try: Simulator(mode='invalid')
    except ValueError: return
    assert False, 'Expected ValueError'


def test_a_star_shortest_unobstructed_route():
    sim = Simulator(drones=0, seed=5, width=10, height=10, levels=3)
    source, target = (0, 0, 0), (5, 3, 2)
    path = sim.pathfind(source, target)
    assert path[0] == source and path[-1] == target
    assert len(path) - 1 == sim.heuristic(source, target)
    assert all(sim.heuristic(a, b) == 1 for a, b in zip(path, path[1:]))


def test_a_star_respects_blocked_cells():
    sim = Simulator(drones=0, seed=5, width=5, height=5, levels=2)
    sim.weather_blocked.add((1, 0, 0))
    path = sim.pathfind((0, 0, 0), (2, 0, 0))
    assert path[-1] == (2, 0, 0)
    assert (1, 0, 0) not in path
    assert len(path) > 3


def test_all_500_uavs_have_safe_moves_under_stress():
    sim=Simulator(drones=500,seed=2026)
    for t in range(90):
        if t==8: sim.action('storm')
        if t==18: sim.action('selfish',0.35)
        if t==40: sim.action('clear_storm')
        if t==60: sim.action('blackout')
        if t==80: sim.action('fail')
        before={d.id:d.pos for d in sim.drones.values()}
        sim.step()
        positions=[d.pos for d in sim.drones.values()]
        assert len(positions)==len(set(positions))
        for d in sim.drones.values():
            if d.id in before:
                assert Simulator.heuristic(before[d.id],d.pos)<=1
    assert sim.metrics()['safety_violations']==0
    assert sim.metrics()['completed']>0


def test_fairness_and_adaptive_ablations_reproducible():
    from nabhniti.experiments import run_episode
    for fairness,adaptive in [(True,True),(True,False),(False,True)]:
        a=run_episode('nabh','medical',13,65,50,fairness,adaptive)
        b=run_episode('nabh','medical',13,65,50,fairness,adaptive)
        assert a==b
        assert a['safety_violations']==0


def test_norm_expiry_and_no_storm_intrusion():
    sim=Simulator(drones=200,seed=17)
    for _ in range(16):sim.step()
    assert sim.rules_approved>0
    sim.action('storm')
    for _ in range(35):sim.step()
    assert sim.rules_approved>0
    assert not {d.pos for d in sim.drones.values()} & sim.weather_blocked
    assert all(n.expires_tick>sim.tick for n in sim.active_norms.values())


def test_static_central_proposed_adaptation_differ():
    from nabhniti.experiments import run_episode
    runs=[run_episode(mode,'congestion',5,120,80) for mode in ('static','central','nabh')]
    assert all(r['safety_violations']==0 for r in runs)
    assert runs[0]['approved_norms']==runs[1]['approved_norms']==0
    assert runs[2]['approved_norms']>0
    assert len({r['total_wait_ticks'] for r in runs})>1


def test_exhausted_battery_holds_position():
    sim = Simulator(drones=3, seed=2031, mode="nabh")
    drone = sim.drones[1]
    initial = drone.pos
    drone.battery = 0.0
    sim.step()
    assert drone.pos == initial
    assert drone.status == "battery_low"
    assert "battery depleted" in drone.last_reason
    assert sim.metrics()["safety_violations"] == 0


def test_multiple_policy_modes_preserve_safety_under_timed_disruptions():
    # Additional varied seeds prevent a single easy scenario from masking
    # safety regressions during storm / failure / congestion events.
    for policy in ("static", "central", "nabh"):
        for seed in (3, 13, 37):
            sim = Simulator(drones=80, seed=seed, mode=policy)
            for t in range(35):
                if t == 4: sim.action("storm")
                if t == 12: sim.action("congestion")
                if t == 20: sim.action("clear_storm")
                if t == 24: sim.action("fail")
                before = {d.id: d.pos for d in sim.drones.values()}
                sim.step()
                positions = [d.pos for d in sim.drones.values()]
                assert len(positions) == len(set(positions))
                assert all(sim.in_bounds(p) and p not in sim.weather_blocked for p in positions)
                assert all(Simulator.heuristic(before[i], d.pos) <= 1 for i, d in sim.drones.items() if i in before)
            assert sim.safety_violations == 0
