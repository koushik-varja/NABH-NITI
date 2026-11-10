"""Independent 3D shortest-route correctness benchmark.

Compares A* route length and legality to breadth-first search (BFS) on
seeded, randomly obstructed discrete 3D worlds. This evaluates an algorithmic
correctness metric, NOT real-flight prediction accuracy or aviation safety.
"""
from __future__ import annotations
import argparse
from collections import deque
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from nabhniti.core import Simulator


def bfs(sim:Simulator, start:tuple[int,int,int], goal:tuple[int,int,int]):
    q=deque([(start,0)]); visited={start}
    while q:
        pos,dist=q.popleft()
        if pos==goal:return dist
        x,y,z=pos
        for dx,dy,dz in [(0,1,0),(0,-1,0),(1,0,0),(-1,0,0),(0,0,1),(0,0,-1)]:
            nxt=(x+dx,y+dy,z+dz)
            if nxt in visited or nxt in sim.weather_blocked or not sim.in_bounds(nxt):continue
            visited.add(nxt)
            q.append((nxt,dist+1))
    return None


def verify(cases:int=1000,seed:int=3403)->dict:
    rng=random.Random(seed)
    sim=Simulator(drones=0,seed=seed,width=12,height=10,levels=4)
    total_nodes=[(x,y,z) for x in range(sim.width) for y in range(sim.height) for z in range(sim.levels)]
    successes=0; reachable=0; misses=[]
    for k in range(cases):
        source,goal=rng.sample(total_nodes,2)
        sim.weather_blocked={p for p in total_nodes if rng.random() < rng.uniform(.03,.24)}
        sim.weather_blocked.discard(source); sim.weather_blocked.discard(goal)
        baseline=bfs(sim,source,goal)
        result=sim.pathfind(source,goal)
        if baseline is not None:reachable+=1
        legal=(result[0]==source and all(sim.in_bounds(p) and p not in sim.weather_blocked for p in result)
               and all(sum(abs(a-b) for a,b in zip(result[i],result[i+1]))==1 for i in range(len(result)-1)))
        optimal=(baseline is None and result==[source]) or (baseline is not None and result[-1]==goal and len(result)-1==baseline)
        if legal and optimal:successes+=1
        elif len(misses)<10:misses.append({'case':k,'reference_length':baseline,'a_star_length':len(result)-1,'legal':legal,'optimal':optimal})
    return {'evaluation':'discrete 3D A* optimality and route legality against independent BFS',
            'seed':seed,'cases':cases,'reachable_cases':reachable,'passed':successes,'failed':cases-successes,
            'algorithmic_correctness_percent':round(successes/cases*100,4),
            'real_world_prediction_accuracy':None,'misses':misses,
            'disclaimer':'This is a shortest-path unit-test metric, not real-world UAV flight accuracy.'}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--cases',type=int,default=1000)
    parser.add_argument('--seed',type=int,default=3403)
    parser.add_argument('--out',default=str(ROOT/'results/route_correctness_audit.json'))
    args=parser.parse_args()
    outcome=verify(args.cases,args.seed)
    Path(args.out).parent.mkdir(parents=True,exist_ok=True)
    Path(args.out).write_text(json.dumps(outcome,indent=2)+'\n')
    print(json.dumps(outcome,indent=2))
    if outcome['failed']:raise SystemExit(1)
