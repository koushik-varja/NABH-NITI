from nabhniti.experiments import run_episode
from nabhniti.core import Simulator

def test_experiment_paired_determinism():
    a=run_episode('nabh','medical',8,20,12)
    b=run_episode('nabh','medical',8,20,12)
    assert a==b

def test_blackout_is_safe_fallback():
    sim = Simulator(drones=80, seed=12, mode="nabh")
    drone = sim.drones[1]
    sector = sim.sector(drone.pos)
    before_bid = sim._bid(drone)
    sim.action("blackout", sector)
    assert sector in sim.blackout_sectors
    # Communication loss reduces local bidding utility, but does not bypass
    # grid movement safety checks or disable safe fallback movement.
    assert sim._bid(drone) < before_bid
    for _ in range(15):
        sim.step()
        positions = [d.pos for d in sim.drones.values()]
        assert len(positions) == len(set(positions))
        assert all(sim.in_bounds(p) and p not in sim.weather_blocked for p in positions)
    assert sector not in sim.active_norms


def test_rest_endpoints_and_invalid_command():
    from fastapi.testclient import TestClient
    from nabhniti.api import app
    client = TestClient(app)
    assert client.get('/health').json()['ok'] is True
    state = client.get('/state')
    assert state.status_code == 200
    assert 'drones' in state.json() and 'metrics' in state.json()
    invalid = client.post('/action', json={'action': 'unrecognized_action'})
    assert invalid.status_code == 400


def test_websocket_first_snapshot_contract():
    from fastapi.testclient import TestClient
    from nabhniti.api import app
    client = TestClient(app)
    with client.websocket_connect('/ws') as ws:
        frame = ws.receive_json()
    assert 'drones' in frame and 'norms' in frame and 'events' in frame
    assert frame['grid']['levels'] == 4


def test_counterfactual_branches_do_not_mutate_live_world():
    from fastapi.testclient import TestClient
    from nabhniti.api import app
    import nabhniti.api as engine
    client=TestClient(app)
    old=engine.sim.snapshot()
    result=client.get('/counterfactual?steps=12')
    assert result.status_code==200
    payload=result.json()
    assert len(payload['results'])==3
    assert {r['policy'] for r in payload['results']}=={'static','central','nabh'}
    assert all(len(r['samples'])==4 for r in payload['results'])
    assert engine.sim.snapshot()==old


def test_reset_replay_and_comparison():
    from fastapi.testclient import TestClient
    from nabhniti.api import app
    client=TestClient(app)
    resp=client.post('/reset',json={'drones':80,'seed':34,'mode':'nabh','scenario':'medical'})
    assert resp.status_code==200 and resp.json()['metrics']['active']==81
    assert client.get('/history').status_code==200
    assert client.post('/scenario/medical').status_code==200
    assert client.get('/compare?scenario=storm&seed=5&population=20&steps=15').status_code==200
    assert client.get('/compare?scenario=unknown').status_code==400


def test_named_reset_reapplies_disruption():
    from fastapi.testclient import TestClient
    from nabhniti.api import app
    client=TestClient(app)
    out=client.post('/reset',json={'drones':80,'seed':51,'mode':'nabh','scenario':'storm'})
    assert out.status_code==200
    frame=client.get('/state').json()
    assert frame['blocked']
    assert frame['metrics']['active']==80
    assert frame['metrics']['tick']==0
    out=client.post('/reset',json={'drones':80,'seed':51,'mode':'static','scenario':'medical'})
    assert out.status_code==200
    frame=client.get('/state').json()
    assert frame['metrics']['active']==81
    assert any(d['kind']=='medical' for d in frame['drones'])
