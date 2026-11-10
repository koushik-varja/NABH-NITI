"""Live REST + WebSocket interface with reset, replay and reproducible comparison."""
from __future__ import annotations
import asyncio
import copy
from collections import deque
from contextlib import asynccontextmanager
from typing import Any
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .core import Simulator, POLICIES, SCENARIOS
from .experiments import paired_comparison, inject

sim=Simulator(drones=150,seed=7)
history:deque[dict]=deque(maxlen=90)
state_lock=asyncio.Lock()

class Command(BaseModel):
    action:str
    value:Any=None

class ResetConfig(BaseModel):
    drones:int=Field(default=150,ge=1,le=500)
    seed:int=Field(default=7,ge=0,le=999999)
    mode:str="nabh"
    scenario:str="normal"
    fairness:bool=True
    adaptive:bool=True

@asynccontextmanager
async def lifespan(app:FastAPI):
    async def clock():
        while True:
            async with state_lock:
                if not sim.paused:
                    sim.step()
                    if sim.tick%2==0:history.append(sim.snapshot(concise=True))
            await asyncio.sleep(.5)
    task=asyncio.create_task(clock())
    try:yield
    finally:
        task.cancel()
        try:await task
        except asyncio.CancelledError:pass

app=FastAPI(title="NABH-NITI Autonomous Airspace Command Center",version="1.0.0",lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:5173","http://127.0.0.1:5173"],
                   allow_credentials=False,allow_methods=["*"],allow_headers=["*"])

@app.get("/health")
def health():return {"ok":True,"tick":sim.tick,"mode":sim.mode,"version":"1.0.0"}

@app.get("/state")
async def state():
    async with state_lock:return sim.snapshot()

@app.post("/action")
async def action(cmd:Command):
    async with state_lock:
        try:sim.action(cmd.action,cmd.value)
        except (ValueError,TypeError) as exc:raise HTTPException(status_code=400,detail=str(exc)) from exc
        return {"ok":True,"metrics":sim.metrics()}

@app.post("/reset")
async def reset(config:ResetConfig):
    global sim
    if config.mode not in POLICIES:raise HTTPException(400,"Unknown governance mode")
    if config.scenario not in SCENARIOS:raise HTTPException(400,"Unknown scenario")
    async with state_lock:
        sim=Simulator(drones=config.drones,seed=config.seed,mode=config.mode,
                      scenario=config.scenario,fairness=config.fairness,adaptive=config.adaptive)
        # Restoring a named scenario must restore its initial disruption too.
        # Otherwise switching policies silently erased the selected scenario.
        _activate_scenario(sim,config.scenario)
        history.clear()
        return {"ok":True,"metrics":sim.metrics()}

def _activate_scenario(world:Simulator,scenario:str)->None:
    if scenario=="normal":return
    event={"congestion":"congestion","medical":"emergency","festival":"festival",
           "storm":"storm","failure":"fail","selfish":"selfish"}[scenario]
    world.action(event,.4 if event=="selfish" else None)
    if scenario=="failure":world.action("blackout")
    world.scenario=scenario

@app.post("/scenario/{scenario}")
async def scenario_trigger(scenario:str):
    if scenario not in SCENARIOS:raise HTTPException(400,"Unknown scenario")
    async with state_lock:
        _activate_scenario(sim,scenario)
        return {"ok":True,"metrics":sim.metrics()}

@app.get("/history")
async def replay_frames():
    async with state_lock:
        return {"ticks":[frame["metrics"]["tick"] for frame in history],"count":len(history)}

@app.get("/history/{tick}")
async def replay_frame(tick:int):
    async with state_lock:
        for frame in history:
            if frame["metrics"]["tick"]==tick:return frame
    raise HTTPException(404,"Tick not retained in replay buffer")

@app.get("/compare")
async def compare(scenario:str="medical",seed:int=Query(7,ge=0,le=999999),
                  population:int=Query(100,ge=1,le=500),steps:int=Query(90,ge=10,le=250),
                  ablations:bool=True):
    try:return await asyncio.to_thread(paired_comparison,scenario,seed,population,steps,ablations)
    except ValueError as exc:raise HTTPException(400,detail=str(exc)) from exc

@app.get("/counterfactual")
async def counterfactual(steps:int=Query(60,ge=5,le=180)):
    """Branch the *actual live simulation* into three independently evolving worlds.

    All policy forks start with exactly the same positions, RNG state, events,
    battery, urgency and fairness credit values. No live world is modified.
    """
    async with state_lock: checkpoint=copy.deepcopy(sim)
    def evaluate():
        initial_tick=checkpoint.tick
        results=[]
        for policy in POLICIES:
            branch=copy.deepcopy(checkpoint)
            branch.mode=policy
            if policy != "nabh":branch.active_norms.clear()
            branch.paused=False
            samples=[]
            for t in range(steps):
                branch.step()
                if t in (0,steps//3,2*steps//3,steps-1):
                    samples.append({"tick":branch.tick,
                      "drones":[{"id":d.id,"kind":d.kind,"pos":d.pos} for d in branch.drones.values()],
                      "norms":len(branch.active_norms)})
            results.append({"policy":policy,"metrics":branch.metrics(),"samples":samples})
        return {"checkpoint_tick":initial_tick,"seed":checkpoint.seed,
                "steps":steps,"results":results,"method":"deep-copy identical state and PRNG checkpoint"}
    return await asyncio.to_thread(evaluate)

@app.websocket("/ws")
async def stream(websocket:WebSocket):
    await websocket.accept()
    try:
        while True:
            async with state_lock:snapshot=sim.snapshot(concise=True)
            await websocket.send_json(snapshot)
            await asyncio.sleep(.55)
    except (WebSocketDisconnect,RuntimeError):pass

# Production single-origin deployment. The compiled Vite assets are generated
# by `npm run build`, and served by FastAPI at http://127.0.0.1:8000/.
# Development is unaffected when frontend/dist does not yet exist.
frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if (frontend_dist / "index.html").is_file():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="dashboard")
