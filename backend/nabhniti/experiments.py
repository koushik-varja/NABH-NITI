"""Reproducible paired-seed experiments and selectable fairness / adaptation ablations."""
from __future__ import annotations
import argparse
import csv
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from statistics import mean, stdev
from .core import Simulator, POLICIES

SCENARIOS=("normal","congestion","medical","festival","storm","failure","selfish")

def inject(sim:Simulator, scenario:str, t:int, steps:int)->None:
    if t==max(2,steps//4):
        events={"congestion":("congestion",None),"medical":("emergency",None),
                "festival":("festival",None),"storm":("storm",None),
                "failure":("blackout",None),"selfish":("selfish",0.4)}
        if scenario in events:
            action,value=events[scenario]
            sim.action(action,value)
        if scenario=="failure":sim.action("fail")
    if t==max(3,3*steps//4):
        if scenario=="storm":sim.action("clear_storm")
        if scenario=="failure":sim.action("blackout")

def run_episode(mode:str,scenario:str,seed:int,population:int,steps:int,
                fairness:bool=True,adaptive:bool=True)->dict:
    sim=Simulator(drones=population,seed=seed,mode=mode,scenario=scenario,
                  fairness=fairness,adaptive=adaptive)
    for t in range(steps):
        inject(sim,scenario,t,steps)
        sim.step()
    return {"seed":seed,"policy":mode,"scenario":scenario,
            "initial_population":population,"steps":steps,
            "ablation": "no_credits" if not fairness else "no_norms" if not adaptive else "none",
            **sim.metrics()}

def paired_comparison(scenario:str="medical",seed:int=7,population:int=120,steps:int=100,
                      include_ablations:bool=True)->dict:
    if scenario not in SCENARIOS:raise ValueError("Invalid scenario")
    if not 1<=population<=500:raise ValueError("Population must be 1–500")
    if not 10<=steps<=250:raise ValueError("Steps must be 10–250")
    results=[run_episode(policy,scenario,seed,population,steps) for policy in POLICIES]
    if include_ablations:
        results.extend([run_episode("nabh",scenario,seed,population,steps,fairness=False),
                        run_episode("nabh",scenario,seed,population,steps,adaptive=False)])
    return {"scenario":scenario,"seed":seed,"population":population,"steps":steps,
            "paired":True,"results":results,"metric_notes":{
                "conflicts":"Potential same-node contention, resolved before movement (not crashes)",
                "safety_violations":"Discrete node/edge invariant violations; not real-flight safety accuracy",
                "fairness_proxy":"Jain index of service opportunity for active non-emergency UAVs",
                "throughput":"Completed missions per simulation tick",
                "p95_total_wait":"95th percentile cumulative wait ticks for active UAVs",
                "messages":"Simplified logical message count (not network bytes)",
            }}

def aggregate(rows:list[dict])->dict:
    grouped={}
    for row in rows:
        key=(row["policy"],row["ablation"],row["scenario"],row["initial_population"])
        grouped.setdefault(key,[]).append(row)
    result=[]
    for (mode,ablation,scenario,pop),rs in sorted(grouped.items()):
        rec={"policy":mode,"ablation":ablation,"scenario":scenario,"population":pop,"n":len(rs)}
        for col in ("completed","fairness_proxy","total_wait_ticks","safety_violations","messages","p95_total_wait","throughput"):
            values=[float(r[col]) for r in rs]
            rec[col+"_mean"]=round(mean(values),4)
            rec[col+"_sd"]=round(stdev(values),4) if len(values)>1 else 0.0
        result.append(rec)
    return {"experiments":len(rows),"groups":result}

def _run_case(case: tuple) -> dict:
    return run_episode(*case)

def main():
    ap=argparse.ArgumentParser(description="Reproducible paired-governance simulation trials")
    ap.add_argument("--preset",choices=("quick","smoke","full"),default="smoke")
    ap.add_argument("--out",default="../results/experiments.csv")
    ap.add_argument("--steps",type=int,default=None)
    ap.add_argument("--seeds",type=int,default=None)
    ap.add_argument("--ablations",action="store_true")
    ap.add_argument("--workers",type=int,default=1,help="parallel processes, recommended 4 for full preset")
    args=ap.parse_args()
    if args.preset=="quick":
        populations=(35,);seeds=range(args.seeds or 2);scenarios=("normal","medical");steps=args.steps or 30
    elif args.preset=="smoke":
        populations=(50,200);seeds=range(args.seeds or 3);scenarios=("normal","medical","storm","selfish");steps=args.steps or 45
    else:
        populations=(50,200,500);seeds=range(args.seeds or 20)
        scenarios=("congestion","medical","festival","storm","failure","selfish")
        steps=args.steps or 65  # 3 x 3 x 6 x 20 = 1080 paired episodes
    variants=[(policy,True,True) for policy in POLICIES]
    if args.ablations:variants.extend([("nabh",False,True),("nabh",True,False)])
    total=len(variants)*len(populations)*len(scenarios)*len(seeds)
    out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True)
    cases=[(mode,scenario,seed,population,steps,fairness,adaptive)
           for scenario in scenarios for population in populations for seed in seeds
           for mode,fairness,adaptive in variants]
    rows=[]
    with out.open("w",newline="",encoding="utf8") as f:
        writer=None
        if args.workers>1:
            executor=ProcessPoolExecutor(max_workers=args.workers)
            outcomes=executor.map(_run_case,cases,chunksize=4)
        else:
            executor=None
            outcomes=map(_run_case,cases)
        try:
            for row in outcomes:
                if writer is None:
                    writer=csv.DictWriter(f,fieldnames=list(row));writer.writeheader()
                writer.writerow(row)
                rows.append(row)
                if len(rows)%50==0 or len(rows)==total:
                    f.flush()
                    print(f"{len(rows)}/{total} verified episodes",flush=True)
        finally:
            if executor is not None:executor.shutdown(wait=True)
    summary=aggregate(rows)
    out.with_suffix(".summary.json").write_text(json.dumps(summary,indent=2),encoding="utf8")
    print(f"Saved {len(rows)} real episodes to {out}",flush=True)
if __name__=="__main__":main()
